"""
Tool: Google Sheets
용도: 구글 시트 데이터 읽기/쓰기/추가/초기화
사용법: workflows/google-sheets-management.md 참고
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
CREDENTIALS_PATH = os.environ.get("GOOGLE_CREDENTIALS_PATH", "credentials.json")
TOKEN_PATH = os.environ.get("GOOGLE_TOKEN_PATH", "token.json")


def get_service():
    """OAuth 인증을 처리하고 Sheets API 서비스 객체를 반환한다.

    최초 실행 시 브라우저 인증창이 열린다.
    이후 token.json에 토큰이 저장되어 자동 로그인된다.
    """
    creds = None

    if Path(TOKEN_PATH).exists():
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not Path(CREDENTIALS_PATH).exists():
                raise FileNotFoundError(
                    f"'{CREDENTIALS_PATH}' 파일이 없습니다. "
                    "Google Cloud Console에서 OAuth 인증 파일을 다운로드해 프로젝트 루트에 저장하세요."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_PATH, "w") as token_file:
            token_file.write(creds.to_json())

    return build("sheets", "v4", credentials=creds)


def read_sheet(spreadsheet_id: str, range_name: str) -> list[list]:
    """시트에서 데이터를 읽어 2차원 리스트로 반환한다.

    Args:
        spreadsheet_id: 구글 시트 ID (URL 중간 부분)
        range_name: 읽을 범위 (예: "Sheet1!A1:D10")

    Returns:
        행의 리스트. 값이 없는 경우 빈 리스트 반환.
    """
    service = get_service()
    try:
        result = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=range_name)
            .execute()
        )
        return result.get("values", [])
    except HttpError as e:
        raise RuntimeError(f"시트 읽기 실패: {e}") from e


def write_sheet(spreadsheet_id: str, range_name: str, values: list[list]) -> int:
    """시트의 지정 범위에 데이터를 덮어쓴다.

    Args:
        spreadsheet_id: 구글 시트 ID
        range_name: 쓰기 시작 셀 (예: "Sheet1!A1")
        values: 쓸 데이터 (2차원 리스트)

    Returns:
        업데이트된 셀 수
    """
    service = get_service()
    body = {"values": values}
    try:
        result = (
            service.spreadsheets()
            .values()
            .update(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                valueInputOption="USER_ENTERED",
                body=body,
            )
            .execute()
        )
        return result.get("updatedCells", 0)
    except HttpError as e:
        raise RuntimeError(f"시트 쓰기 실패: {e}") from e


def append_sheet(spreadsheet_id: str, range_name: str, values: list[list]) -> int:
    """시트의 데이터 끝에 새 행을 추가한다.

    Args:
        spreadsheet_id: 구글 시트 ID
        range_name: 추가할 열 범위 (예: "Sheet1!A:C")
        values: 추가할 데이터 (2차원 리스트)

    Returns:
        추가된 셀 수
    """
    service = get_service()
    body = {"values": values}
    try:
        result = (
            service.spreadsheets()
            .values()
            .append(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body=body,
            )
            .execute()
        )
        updates = result.get("updates", {})
        return updates.get("updatedCells", 0)
    except HttpError as e:
        raise RuntimeError(f"시트 행 추가 실패: {e}") from e


def clear_sheet(spreadsheet_id: str, range_name: str) -> str:
    """시트의 지정 범위를 비운다.

    Args:
        spreadsheet_id: 구글 시트 ID
        range_name: 비울 범위 (예: "Sheet1!A2:Z1000")

    Returns:
        초기화된 범위 문자열
    """
    service = get_service()
    try:
        result = (
            service.spreadsheets()
            .values()
            .clear(spreadsheetId=spreadsheet_id, range=range_name)
            .execute()
        )
        return result.get("clearedRange", "")
    except HttpError as e:
        raise RuntimeError(f"시트 초기화 실패: {e}") from e


if __name__ == "__main__":
    print("Google Sheets 인증 테스트를 시작합니다...")
    try:
        get_service()
        print("인증 성공! token.json이 생성되었습니다.")
        print("이제 sheets.py의 함수들을 사용할 수 있습니다.")
    except FileNotFoundError as e:
        print(f"오류: {e}")
    except Exception as e:
        print(f"인증 실패: {e}")
