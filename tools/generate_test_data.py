"""
Tool: 테스트 데이터 생성기
용도: 경남전세버스 관리시스템 개발·테스트용 샘플 데이터를 Supabase에 삽입한다
사용법:
    python tools/generate_test_data.py
    python tools/generate_test_data.py --reset   # 기존 데이터 삭제 후 재삽입
전제: bus-app/.env.local에 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있어야 함
"""

import os
import sys
import json
import argparse
from datetime import date, timedelta
from pathlib import Path
from dotenv import load_dotenv

# bus-app/.env.local 로드
env_path = Path(__file__).parent.parent / "bus-app" / ".env.local"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or "placeholder" in SUPABASE_URL:
    print("❌ Supabase가 아직 연결되지 않았습니다.")
    print("   bus-app/.env.local에 실제 Supabase URL과 키를 입력하세요.")
    print("   설정 방법: python tools/check_setup.py")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("❌ supabase 패키지가 없습니다. 설치 중...")
    os.system("pip install supabase")
    from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 샘플 데이터 정의 ──────────────────────────────────────────────

VEHICLES = [
    {"plate_number": "경남 가 1234", "vehicle_type": "대형", "capacity": 45, "model": "현대 유니버스", "manufacture_year": 2020, "status": "active"},
    {"plate_number": "경남 나 5678", "vehicle_type": "대형", "capacity": 45, "model": "기아 그랜버드", "manufacture_year": 2021, "status": "active"},
    {"plate_number": "경남 다 9012", "vehicle_type": "중형", "capacity": 28, "model": "현대 카운티", "manufacture_year": 2022, "status": "active"},
    {"plate_number": "경남 라 3456", "vehicle_type": "소형", "capacity": 15, "model": "기아 봉고", "manufacture_year": 2023, "status": "active"},
    {"plate_number": "경남 마 7890", "vehicle_type": "대형", "capacity": 45, "model": "현대 유니버스", "manufacture_year": 2019, "status": "maintenance"},
]

EMPLOYEES = [
    {"name": "김철수", "role": "driver", "phone": "010-1234-5678", "license_number": "1급-12345", "status": "active"},
    {"name": "이영희", "role": "driver", "phone": "010-2345-6789", "license_number": "1급-23456", "status": "active"},
    {"name": "박민준", "role": "driver", "phone": "010-3456-7890", "license_number": "1급-34567", "status": "active"},
    {"name": "최지훈", "role": "driver", "phone": "010-4567-8901", "license_number": "1급-45678", "status": "active"},
    {"name": "정수진", "role": "staff", "phone": "010-5678-9012", "license_number": None, "status": "active"},
]

ROUTES = [
    {"name": "창원-부산 노선", "origin": "창원", "destination": "부산", "distance_km": 70, "estimated_duration_min": 90, "status": "active"},
    {"name": "창원-대구 노선", "origin": "창원", "destination": "대구", "distance_km": 110, "estimated_duration_min": 120, "status": "active"},
    {"name": "마산-서울 노선", "origin": "마산", "destination": "서울", "distance_km": 380, "estimated_duration_min": 240, "status": "active"},
    {"name": "진주-부산 노선", "origin": "진주", "destination": "부산", "distance_km": 100, "estimated_duration_min": 110, "status": "active"},
    {"name": "통영-창원 노선", "origin": "통영", "destination": "창원", "distance_km": 80, "estimated_duration_min": 80, "status": "active"},
]

CLIENTS = [
    {"name": "삼성전자 경남사업부", "contact_name": "홍길동", "contact_phone": "055-100-1000", "contact_email": "hong@samsung.com", "address": "창원시 성산구", "client_type": "corporate"},
    {"name": "경남대학교", "contact_name": "김교수", "contact_phone": "055-200-2000", "contact_email": "kim@kyungnam.ac.kr", "address": "마산시 회원구", "client_type": "school"},
    {"name": "LG전자 창원", "contact_name": "이부장", "contact_phone": "055-300-3000", "contact_email": "lee@lg.com", "address": "창원시 의창구", "client_type": "corporate"},
    {"name": "창원시청", "contact_name": "박계장", "contact_phone": "055-225-2000", "contact_email": "park@changwon.go.kr", "address": "창원시 의창구", "client_type": "government"},
    {"name": "현대위아", "contact_name": "최과장", "contact_phone": "055-400-4000", "contact_email": "choi@hyundai-wia.com", "address": "창원시 성산구", "client_type": "corporate"},
]


def insert_table(table: str, rows: list[dict], reset: bool = False) -> list[dict]:
    """테이블에 데이터 삽입. reset=True면 기존 데이터 삭제 후 삽입."""
    if reset:
        print(f"  🗑  {table} 기존 데이터 삭제 중...")
        supabase.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    print(f"  ➕ {table} {len(rows)}건 삽입 중...")
    result = supabase.table(table).insert(rows).execute()
    return result.data or []


def generate_dispatches(vehicle_ids, employee_ids, route_ids, client_ids) -> list[dict]:
    """지난 3개월 + 앞으로 1개월의 배차 데이터 생성."""
    dispatches = []
    today = date.today()
    start = today - timedelta(days=90)

    import random
    random.seed(42)

    for i in range(120):
        dispatch_date = start + timedelta(days=random.randint(0, 120))
        dispatches.append({
            "dispatch_date": dispatch_date.isoformat(),
            "vehicle_id": random.choice(vehicle_ids),
            "driver_id": random.choice(employee_ids),
            "route_id": random.choice(route_ids),
            "client_id": random.choice(client_ids),
            "passengers": random.randint(20, 45),
            "status": "completed" if dispatch_date < today else "scheduled",
            "notes": f"샘플 배차 {i+1}",
        })

    return dispatches


def generate_operation_results(dispatch_ids, route_pricing_map) -> list[dict]:
    """완료된 배차에 대한 운행결과 생성."""
    import random
    random.seed(123)
    results = []
    for dispatch in dispatch_ids:
        route_id = dispatch["route_id"]
        unit_price = route_pricing_map.get(route_id, 500000)
        allowance = int(unit_price * 0.1)
        results.append({
            "dispatch_id": dispatch["id"],
            "revenue": unit_price + random.randint(-50000, 50000),
            "driver_allowance": allowance,
            "fuel_cost": random.randint(30000, 80000),
            "toll_cost": random.randint(5000, 20000),
            "other_cost": random.randint(0, 10000),
            "notes": "샘플 운행결과",
        })
    return results


def main(reset: bool = False):
    print("🚌 경남전세버스 테스트 데이터 생성 시작\n")

    # 1. 차량
    print("[1/6] 차량 데이터...")
    vehicles = insert_table("vehicles", VEHICLES, reset)
    vehicle_ids = [v["id"] for v in vehicles] if vehicles else []

    # 2. 직원 (기사만)
    print("[2/6] 직원 데이터...")
    employees = insert_table("employees", EMPLOYEES, reset)
    driver_ids = [e["id"] for e in employees if e.get("role") == "driver"] if employees else []

    # 3. 노선
    print("[3/6] 노선 데이터...")
    routes = insert_table("routes", ROUTES, reset)
    route_ids = [r["id"] for r in routes] if routes else []

    # 4. 고객
    print("[4/6] 고객 데이터...")
    clients = insert_table("clients", CLIENTS, reset)
    client_ids = [c["id"] for c in clients] if clients else []

    # 5. 노선단가 (route_pricing)
    print("[5/6] 노선단가 데이터...")
    today = date.today().isoformat()
    pricing_data = []
    pricing_map = {}
    base_prices = [450000, 600000, 900000, 480000, 420000]
    for route, price in zip(routes or [], base_prices):
        pricing_data.append({
            "route_id": route["id"],
            "unit_price": price,
            "driver_allowance": int(price * 0.1),
            "effective_from": today,
            "effective_to": None,
        })
        pricing_map[route["id"]] = price

    if pricing_data:
        insert_table("route_pricing", pricing_data, reset)

    # 6. 배차 + 운행결과
    if vehicle_ids and driver_ids and route_ids and client_ids:
        print("[6/6] 배차 및 운행결과 데이터...")
        dispatch_rows = generate_dispatches(vehicle_ids, driver_ids, route_ids, client_ids)
        dispatches = insert_table("dispatches", dispatch_rows, reset)

        completed = [d for d in (dispatches or []) if d.get("status") == "completed"]
        if completed and pricing_map:
            op_rows = generate_operation_results(completed, pricing_map)
            insert_table("operation_results", op_rows, reset)
    else:
        print("[6/6] ⚠️  배차 데이터 건너뜀 (앞 단계 데이터 없음)")

    print("\n✅ 완료! Supabase 대시보드에서 데이터를 확인하세요.")
    print(f"   차량 {len(vehicle_ids)}대 / 직원 {len(driver_ids)}명 / 노선 {len(route_ids)}개 / 고객 {len(client_ids)}개")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="경남전세버스 테스트 데이터 생성")
    parser.add_argument("--reset", action="store_true", help="기존 데이터 삭제 후 재삽입")
    args = parser.parse_args()
    main(reset=args.reset)
