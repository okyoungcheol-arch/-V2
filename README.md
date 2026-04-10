# KN_Bus 비즈니스 자동화

claude.md 지침서 기반의 Workflow/Agent/Tool 3단계 자동화 시스템.

## 시작하기

### 1. 패키지 설치
```bash
pip install -r requirements.txt
```

### 2. Google API 인증 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성
3. **Google Sheets API** 활성화 (APIs & Services → Library)
4. OAuth 2.0 클라이언트 ID 생성 (APIs & Services → Credentials → 데스크톱 앱)
5. `credentials.json` 다운로드 → 프로젝트 루트에 저장
6. `.env.example` 복사 후 `.env`로 이름 변경, 값 채우기

### 3. 첫 실행 (인증 완료)
```bash
python tools/sheets.py
```
브라우저가 열리면 Google 계정으로 로그인 → `token.json` 자동 생성됨.

## 구조

```
workflows/   # 업무별 단계별 지시서
tools/       # 실제 작업을 실행하는 Python 파일
.tmp/        # 임시 작업 공간 (언제든 삭제 가능)
.env         # API 키 등 민감 정보 (커밋 금지)
```
