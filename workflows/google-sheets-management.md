# Workflow: Google Sheets 데이터 관리

## 목표
구글 시트의 데이터를 읽고, 쓰고, 업데이트하는 작업을 자동화한다.

---

## 사전 조건 (최초 1회)

- [ ] `credentials.json` 파일이 프로젝트 루트에 있어야 함
- [ ] `.env` 파일에 `GOOGLE_SHEETS_SPREADSHEET_ID` 값이 채워져 있어야 함
- [ ] `pip install -r requirements.txt` 완료

최초 실행 시 브라우저 인증 창이 뜬다 → 승인하면 `token.json` 자동 생성됨. 이후엔 자동 로그인.

---

## 입력값

| 항목 | 설명 | 예시 |
|------|------|------|
| `spreadsheet_id` | 구글 시트 URL 중간 부분 | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms` |
| `range_name` | 시트명!범위 형식 | `Sheet1!A1:D10`, `시트1!A:A` |
| `values` | 쓸 데이터 (2차원 리스트) | `[["이름", "나이"], ["홍길동", "30"]]` |

---

## 사용 Tool

**`tools/sheets.py`**

### 데이터 읽기
```python
from tools.sheets import read_sheet
import os
from dotenv import load_dotenv

load_dotenv()
sheet_id = os.environ["GOOGLE_SHEETS_SPREADSHEET_ID"]

data = read_sheet(sheet_id, "Sheet1!A1:Z100")
for row in data:
    print(row)
```

### 데이터 쓰기 (덮어쓰기)
```python
from tools.sheets import write_sheet

values = [
    ["이름", "금액", "날짜"],
    ["홍길동", "50000", "2026-03-31"],
]
write_sheet(sheet_id, "Sheet1!A1", values)
```

### 행 추가
```python
from tools.sheets import append_sheet

new_row = [["신규고객", "30000", "2026-03-31"]]
append_sheet(sheet_id, "Sheet1!A:C", new_row)
```

### 범위 비우기
```python
from tools.sheets import clear_sheet

clear_sheet(sheet_id, "Sheet1!A2:Z1000")  # 헤더(1행) 제외하고 데이터만 삭제
```

---

## 에러 대응

| 에러 | 원인 | 해결 |
|------|------|------|
| `credentials.json not found` | 인증 파일 없음 | Google Cloud Console에서 다운로드 후 루트에 배치 |
| `token.json` 인증 만료 | 토큰 만료 | `token.json` 삭제 후 재실행 (브라우저 인증 재진행) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` 없음 | `.env` 미설정 | `.env.example` 복사해서 `.env` 만들고 ID 입력 |
| `The caller does not have permission` | 시트 공유 안 됨 | 해당 Google 계정에 시트 편집 권한 부여 |
| `Range not found` | 잘못된 범위 | 시트 이름 확인 (한글 시트명 포함), 범위 형식 확인 |

---

## 업데이트 이력

- 2026-03-31: 최초 작성
