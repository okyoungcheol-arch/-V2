# Workflow: 경남전세버스 관리시스템 개발

## 목표
Next.js + Supabase 기반의 전세버스 관리 웹앱을 단계별로 개발한다.

---

## 에이전트 핵심 원칙 (agent.md 기준)

> 이 시스템은 아래 3가지 목표를 최우선으로 한다.
> 1. **배차 오류 제로** — 동일 차량/기사 중복 배차 물리적 차단
> 2. **정산 투명성** — 모든 금전 계산은 부동소수점 없이 정확하게
> 3. **기사님 사용성** — 고령 기사 기준 최상의 모바일 UI

### 보안 프로토콜 (Security First)
| 대상 | 정책 |
|------|------|
| **모든 테이블** | RLS(Row Level Security) `auth.uid()` 기반 필수 적용 |
| **관리자/사무직** | 전체 데이터 CRUD 권한 |
| **기사** | 본인 배차·정산 내역만 조회, 운행 실적만 입력 |
| **민감 데이터** | 기사 주민번호·은행 계좌는 암호화 필드 처리 |

### 개발 보고 규칙
- 기능 구현 **전**: 변경되는 DB 스키마와 API 명세를 표로 먼저 보고 → 승인 후 착수
- 기능 구현 **후**: 단계별 한국어 설명 + 체크리스트로 결과 보고
- 유료 API/크레딧 사용 테스트는 **반드시 사전 승인** 받을 것

---

## 전제 조건

- [ ] Node.js 설치 확인: `node -v` (18+)
- [ ] `bus-app/` 디렉토리에서 작업
- [ ] Supabase 프로젝트 생성 및 `bus-app/.env.local` 실제값 입력

---

## 빠른 환경 점검

```bash
python tools/check_setup.py
```

문제가 있으면 위 명령이 무엇을 고쳐야 하는지 알려준다.

---

## Supabase 설정 (최초 1회)

1. [supabase.com](https://supabase.com) 접속 → 새 프로젝트 생성
2. SQL Editor에서 아래 마이그레이션을 **순서대로** 전체 실행:

| 순서 | 파일명 | 내용 |
|------|--------|------|
| 1 | `001_initial_schema.sql` | 핵심 테이블 13개 + RLS + 인덱스 |
| 2 | `002_advanced_schema.sql` | 정기배차 패턴, 할부 스케줄, 직원/운행결과 컬럼 추가 |
| 3 | `002_routes_dispatches_update.sql` | 노선·배차 컬럼 보완 |
| 4 | `003_ledger_seed.sql` | 기본 지출/수입 카테고리 입력 |
| 5 | `004_bank_transactions_update.sql` | 은행거래 테이블 보완 |
| 6 | `005_employees_login.sql` | 직원 로그인(PIN) 연결 |
| 7 | `006_verify_pin_function.sql` | PIN 검증 함수 |
| 8 | `007_vehicles_update.sql` | 차량 컬럼 보완 |
| 9 | `008_routes_default_assignments.sql` | 노선 기본 배차 설정 |
| 10 | `009_employees_can_drive.sql` | 운전 가능 여부 컬럼 |
| 11 | `010_dispatch_unique_constraint.sql` | 배차 중복 방지 유니크 제약 |
| 12 | `011_set_employee_pin.sql` | 직원 PIN 설정 |
| 13 | `012_fix_set_employee_pin.sql` | PIN 함수 수정 |
| 14 | `013_routes_client_info.sql` | **노선에 계약처 정보 추가** ← 신규 |

3. Settings → API → URL·anon key·service_role_key 복사
4. `bus-app/.env.local`에 실제값 입력:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefg.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   ```
5. Authentication → Users → 첫 번째 관리자 계정 생성
6. SQL Editor에서 user_profiles 레코드 수동 추가:
   ```sql
   INSERT INTO user_profiles (id, role, display_name)
   VALUES ('auth-user-uuid-here', 'admin', '관리자');
   ```

---

## 개발 서버 실행

```bash
cd bus-app
npm run dev
# → http://localhost:3000
```

---

## DB 스키마 — 핵심 테이블 구조

### 테이블 관계도

```
clients ──┐
          ├──→ routes ──→ route_pricing (단가 이력)
          │       ↓
          └──→ contracts ──→ dispatches ←── vehicles
                                  ↓           ↓
                            operation_results  employees(기사)
                                  ↓
                            ledger_entries ←── bank_transactions
```

### routes 테이블 (계약처 정보 포함 — v2)

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | UUID | PK |
| route_name | VARCHAR(100) | 노선명 |
| route_code | VARCHAR(20) | 노선코드 (UNIQUE) |
| origin | VARCHAR(100) | 출발지 |
| destination | VARCHAR(100) | 도착지 |
| waypoints | TEXT | 경유지 (쉼표 구분) |
| distance_km | DECIMAL(8,2) | 거리(km) |
| route_type | VARCHAR(20) | **정기 / 관광** |
| day_type | VARCHAR(30) | 평일 / 토요일A조 / 토요일B조 / 일요일A조 / 일요일B조 / 매일 |
| contract_type | VARCHAR(30) | 통근 / 등하교 / 관광 / 기타 |
| **client_id** | UUID → clients | **주 계약처 직접 연결** ← 신규 |
| default_departure_time | TIME | 기본 출발 시간 |
| status | VARCHAR(20) | active / inactive |
| notes | TEXT | 비고 |
| created_at | TIMESTAMPTZ | 생성일 |

> **계약처 연결 방식**: `routes.client_id` → `clients.id` 직접 참조.
> 배차 시 계약 건이 별도로 있으면 `dispatches.contract_id`로 추가 연결.

---

## 구현 완료 현황

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | DB 스키마, 인증, 기본 레이아웃, 로그인, 배차 목록, 기사 모바일 | ✅ 완료 |
| 2 | 차량/직원/노선/고객 CRUD (관리자 페이지) | ✅ 완료 |
| 3 | 배차 달력뷰, 배차 수정, 정기배차 (주기 설정 → 일괄 생성) | ✅ 완료 |
| 4 | 운행결과 등록, 노선별 단가 관리, 수익 계산 | ✅ 완료 |
| 5 | 은행 CSV 업로드 (농협/기업은행), 자동 분류, 금전출납부 | ✅ 완료 |
| 6 | 대시보드 차트 (6개월 바차트, 노선별 수익, 월별 지출 파이) | ✅ 완료 |
| 7 | PWA (manifest.json, Service Worker, 오프라인 페이지, 아이콘) | ✅ 완료 |
| 8 | 노선 DB 계약처 정보 추가 + 노선 등록/수정 화면 개선 | 🔄 진행중 |

### 구현된 화면 목록

| 경로 | 역할 | 설명 |
|------|------|------|
| `/login` | 전체 | 로그인 |
| `/admin/dashboard` | admin | 대시보드 + 차트 (Recharts) |
| `/admin/dispatches` | admin | 배차 목록/달력뷰/정기배차 |
| `/admin/operations` | admin | 운행결과 등록/조회 |
| `/admin/vehicles` | admin | 차량 목록/등록/수정 |
| `/admin/employees` | admin | 직원 목록/등록/수정 |
| `/admin/routes` | admin | 노선 목록/등록 + 단가 이력 + **계약처 연결** |
| `/admin/clients` | admin | 고객/계약처 관리 |
| `/admin/bank` | admin | 은행 CSV 업로드 + 자동분류 |
| `/admin/ledger` | admin | 금전출납부 |
| `/staff/dispatches` | staff | 배차 조회 |
| `/driver/schedule` | driver | 내 2주 배차 일정 (모바일) |
| `/driver/earnings` | driver | 내 이번달 수당 (모바일) |

---

## 비즈니스 로직 구현 기준

### 배차 충돌 방지 (필수)
- DB 레벨: `010_dispatch_unique_constraint.sql` 유니크 제약 적용
- 서버 레벨: 동일 날짜·시간대 차량/기사 중복 여부 사전 검증 후 저장
- UI 레벨: 충돌 발생 시 구체적 에러 메시지 표시 ("○○ 차량은 이미 해당 시간에 배차됨")

### 정밀 금전 계산
```
운행 수익 = 노선 단가 (route_pricing.unit_price)
기사 수당 = 노선 수당 (route_pricing.driver_allowance)
순수익   = 운행 수익 - 유류비 - 통행료 - 식비 - 세금(3.3%) - 4대보험 - 기타
```
- JavaScript 계산 시 `Decimal.js` 또는 정수(원 단위) 변환 후 처리
- SQL 집계는 `NUMERIC` 타입으로 처리 (부동소수점 오차 방지)

### 정기배차 운행 조 구분
| day_type | 설명 |
|----------|------|
| 평일 | 월~금 운행 |
| 토요일A조 | 토요일 오전 조 |
| 토요일B조 | 토요일 오후 조 |
| 일요일A조 | 일요일 오전 조 |
| 일요일B조 | 일요일 오후 조 |
| 매일 | 요일 무관 매일 |

---

## UI/UX 기준 (고령 기사님 최적화)

| 항목 | 기준 |
|------|------|
| 최소 폰트 | **16px 이상** (기사 화면은 18px 권장) |
| 색상 대비 | **WCAG AA 등급** 이상 (배경:텍스트 대비 4.5:1 이상) |
| 버튼 크기 | 터치 영역 최소 44×44px |
| UI 컴포넌트 | **shadcn/ui** (base-ui 기반) — Radix UI 아님 주의 |
| 레이아웃 | 기사 화면은 Mobile-First, 큰 버튼 + 단순 체크박스 위주 |
| 아이콘 | 텍스트와 함께 표시 (아이콘 단독 사용 금지) |

---

## Tools (Python 유틸리티)

| 파일 | 용도 | 사용법 |
|------|------|--------|
| `tools/check_setup.py` | 환경 설정 점검 | `python tools/check_setup.py` |
| `tools/generate_test_data.py` | Supabase에 샘플 데이터 삽입 | `python tools/generate_test_data.py` |
| `tools/generate_bank_csv.py` | 은행 CSV 샘플 파일 생성 | `python tools/generate_bank_csv.py --bank nh` |
| `tools/sheets.py` | Google Sheets 읽기/쓰기 | import 후 함수 호출 |

### 테스트 데이터 준비 순서

```bash
# 1. 환경 먼저 확인
python tools/check_setup.py

# 2. 샘플 데이터 삽입
python tools/generate_test_data.py

# 3. 은행 CSV 샘플 생성
python tools/generate_bank_csv.py --bank nh --months 2

# 4. 개발 서버에서 .tmp/sample_bank_nh.csv 업로드 테스트
```

---

## 자동화 Hooks (.claude/settings.json)

| Hook | 동작 |
|------|------|
| PostToolUse → Edit/Write | .ts/.tsx 파일 수정 후 자동 TypeScript 타입 검사 실행 |

---

## MCP 서버 (.mcp.json)

| 서버 | 용도 | 설정 필요 |
|------|------|---------|
| supabase | DB 직접 쿼리, 스키마 탐색 | `SUPABASE_ACCESS_TOKEN` 환경변수 |

### Supabase MCP 설정 방법
1. [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) 에서 Personal Access Token 생성
2. 시스템 환경변수에 `SUPABASE_ACCESS_TOKEN` 추가
3. Claude Code 재시작 → `/mcp` 명령으로 연결 확인

---

## 주요 기술 스택 & 주의사항

| 항목 | 내용 |
|------|------|
| UI 라이브러리 | shadcn/ui — **base-ui** 기반 (Radix UI 아님) |
| Dialog 트리거 | `asChild` 미지원 → `<span onClick={...}>` 래퍼 사용 |
| Select onChange | `onValueChange` 타입이 `{} | null` → `as string` 캐스트 필요 |
| Supabase 쿼리 타입 | `never[]` 방지 → `(data ?? []) as TableRow[]` 캐스트 사용 |
| 날짜 처리 | date-fns 사용 |
| 차트 | Recharts |
| 금전 계산 | Decimal.js 또는 SQL NUMERIC 처리 (부동소수점 금지) |
| 은행 CSV | EUC-KR 인코딩, 농협/기업은행 자동 감지 |

---

## 에러 대응

| 에러 | 원인 | 해결 |
|------|------|------|
| "URL and API key required" | `.env.local` 미설정 | Supabase 실제값 입력 |
| RLS policy violation | 잘못된 역할 | user_profiles.role 확인 |
| 빌드 타입 에러 | Supabase 스키마 변경 | `src/types/database.ts` 수동 업데이트 |
| CSV 업로드 실패 | 인코딩 문제 | EUC-KR로 저장된 파일인지 확인 |
| 차트 빈 화면 | 데이터 없음 | `python tools/generate_test_data.py` 실행 |
| 배차 중복 에러 | 같은 차량/기사 동시 배차 | 날짜·시간·차량·기사 조합 확인 |

---

## 업데이트 이력

- 2026-04-05: agent.md 지침 통합 (보안 프로토콜, UI/UX 기준, 금전계산 원칙, 보고 규칙)
- 2026-04-05: routes 테이블 계약처 정보(client_id, day_type, waypoints 등) 추가 — 013 마이그레이션
- 2026-03-31: Phase 1~7 전체 완료
- 2026-03-31: Tools (generate_test_data, generate_bank_csv, check_setup) 추가
- 2026-03-31: Hooks (.claude/settings.json TypeScript 자동검사) 추가
- 2026-03-31: Supabase MCP (.mcp.json) 설정 추가
