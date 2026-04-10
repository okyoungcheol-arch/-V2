"""
Tool: 은행 CSV 샘플 생성기
용도: bus-app의 은행 CSV 업로드 기능 테스트용 샘플 파일을 생성한다
      농협·기업은행 형식 모두 지원
사용법:
    python tools/generate_bank_csv.py               # 농협 형식 (기본)
    python tools/generate_bank_csv.py --bank kb     # 기업은행 형식
    python tools/generate_bank_csv.py --months 3    # 최근 3개월치
출력: .tmp/sample_bank_{은행}.csv
"""

import os
import csv
import argparse
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(99)

# 출금 항목 (지출)
EXPENSE_ITEMS = [
    ("주유비 삼성주유소", 65000),
    ("주유비 GS칼텍스", 71000),
    ("차량 수리비 카센터", 150000),
    ("주유비 현대오일뱅크", 58000),
    ("고속도로 통행료", 12500),
    ("차량 세차비", 8000),
    ("사무용품 구입", 25000),
    ("기사 식비 지원", 30000),
    ("타이어 교체비", 320000),
    ("엔진오일 교체", 85000),
]

# 입금 항목 (수입) — 운행결과 금액과 매칭되도록 비슷한 금액대
INCOME_ITEMS = [
    ("삼성전자 경남 운행대금", 450000),
    ("경남대학교 운행대금", 600000),
    ("LG전자 창원 운행대금", 450000),
    ("창원시청 운행대금", 900000),
    ("현대위아 운행대금", 480000),
    ("삼성전자 경남 운행대금", 500000),
    ("경남대학교 운행대금", 620000),
    ("LG전자 창원 운행대금", 430000),
]


def make_date_range(months: int) -> list[date]:
    """최근 N개월의 날짜 리스트 반환."""
    today = date.today()
    start = today - timedelta(days=months * 30)
    dates = []
    d = start
    while d <= today:
        dates.append(d)
        d += timedelta(days=random.randint(1, 3))
    return dates


def generate_nhbank_csv(output_path: Path, months: int):
    """농협은행 형식 CSV 생성.
    헤더: 거래일자, 거래시간, 거래유형, 출금액, 입금액, 잔액, 내용, 메모
    날짜: YYYYMMDD, 시간: HHMMSS
    """
    rows = []
    balance = 5_000_000
    dates = make_date_range(months)

    for d in dates:
        # 입금 30%, 출금 70%
        if random.random() < 0.3:
            desc, amount = random.choice(INCOME_ITEMS)
            amount += random.randint(-20000, 50000)
            balance += amount
            rows.append({
                "거래일자": d.strftime("%Y%m%d"),
                "거래시간": f"{random.randint(9,17):02d}{random.randint(0,59):02d}{random.randint(0,59):02d}",
                "거래유형": "입금",
                "출금액": 0,
                "입금액": amount,
                "잔액": balance,
                "내용": desc,
                "메모": "",
            })
        else:
            desc, amount = random.choice(EXPENSE_ITEMS)
            amount += random.randint(-5000, 5000)
            if balance >= amount:
                balance -= amount
                rows.append({
                    "거래일자": d.strftime("%Y%m%d"),
                    "거래시간": f"{random.randint(8,18):02d}{random.randint(0,59):02d}{random.randint(0,59):02d}",
                    "거래유형": "출금",
                    "출금액": amount,
                    "입금액": 0,
                    "잔액": balance,
                    "내용": desc,
                    "메모": "",
                })

    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "w", newline="", encoding="euc-kr") as f:
        writer = csv.DictWriter(f, fieldnames=["거래일자","거래시간","거래유형","출금액","입금액","잔액","내용","메모"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ 농협 CSV 생성: {output_path} ({len(rows)}건)")


def generate_ibkbank_csv(output_path: Path, months: int):
    """기업은행 형식 CSV 생성.
    헤더: 거래일시, 구분, 거래금액, 잔액, 적요
    날짜: YYYY-MM-DD HH:MM:SS
    """
    rows = []
    balance = 5_000_000
    dates = make_date_range(months)

    for d in dates:
        if random.random() < 0.3:
            desc, amount = random.choice(INCOME_ITEMS)
            amount += random.randint(-20000, 50000)
            balance += amount
            rows.append({
                "거래일시": f"{d.strftime('%Y-%m-%d')} {random.randint(9,17):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}",
                "구분": "입금",
                "거래금액": amount,
                "잔액": balance,
                "적요": desc,
            })
        else:
            desc, amount = random.choice(EXPENSE_ITEMS)
            amount += random.randint(-5000, 5000)
            if balance >= amount:
                balance -= amount
                rows.append({
                    "거래일시": f"{d.strftime('%Y-%m-%d')} {random.randint(8,18):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}",
                    "구분": "출금",
                    "거래금액": amount,
                    "잔액": balance,
                    "적요": desc,
                })

    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "w", newline="", encoding="euc-kr") as f:
        writer = csv.DictWriter(f, fieldnames=["거래일시","구분","거래금액","잔액","적요"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ 기업은행 CSV 생성: {output_path} ({len(rows)}건)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="은행 CSV 샘플 파일 생성")
    parser.add_argument("--bank", choices=["nh", "kb"], default="nh",
                        help="은행 형식: nh=농협(기본), kb=기업은행")
    parser.add_argument("--months", type=int, default=2,
                        help="생성할 기간 (개월 수, 기본값: 2)")
    args = parser.parse_args()

    base = Path(__file__).parent.parent / ".tmp"

    if args.bank == "nh":
        generate_nhbank_csv(base / "sample_bank_nh.csv", args.months)
        print("   → bus-app의 '은행거래내역' 메뉴에서 이 파일을 업로드하세요.")
    else:
        generate_ibkbank_csv(base / "sample_bank_kb.csv", args.months)
        print("   → bus-app의 '은행거래내역' 메뉴에서 이 파일을 업로드하세요.")
