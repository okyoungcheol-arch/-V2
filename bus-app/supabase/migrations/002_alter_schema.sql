-- ============================================================
-- 002: 스키마 변경 — employees, dispatches 컬럼 변경 / operation_settlements 삭제
-- ============================================================

-- ============================================================
-- 1. 직원_기사 (employees) 컬럼 변경
-- ============================================================

-- 추가: 직원유형 (기사 / 직원 / 기타)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_type VARCHAR(20) DEFAULT '기사';  -- 기사 / 직원 / 기타

-- 추가: 로그인 횟수
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- 추가: 최종 로그인 일시
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 기존 phone → contact_phone 으로 통일 (이미 phone 컬럼 존재)
-- (phone 컬럼은 유지, 필요 시 애플리케이션에서 contact_phone alias로 사용)

-- can_drive 컬럼은 이미 존재 (BOOLEAN DEFAULT TRUE) — 유지

-- ============================================================
-- 2. 배차 (dispatches) 컬럼 변경
-- ============================================================

-- 컬럼명 변경: dispatch_date → operation_date (운행일자)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dispatches' AND column_name = 'dispatch_date'
  ) THEN
    ALTER TABLE dispatches RENAME COLUMN dispatch_date TO operation_date;
  END IF;
END $$;

-- 추가: 노선코드 (route_code 텍스트, routes.route_code 참조용)
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS route_code VARCHAR(20);

-- 추가: 차량번호 (plate_number 텍스트, vehicles.plate_number 참조용)
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS plate_number VARCHAR(20);

-- 추가: 기사이름 (driver_name 텍스트, 스냅샷 보존용)
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS driver_name VARCHAR(50);

-- 추가: 변경사유
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- 추가: 운행금액
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS fare_amount NUMERIC(15, 0) DEFAULT 0;

-- 추가: 기사수당
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS driver_allowance NUMERIC(15, 0) DEFAULT 0;

-- 추가: 부가세포함여부
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS vat_included BOOLEAN DEFAULT FALSE;

-- 추가: 운행일수
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS operation_days INTEGER DEFAULT 1;

-- 기존 created_at 은 등록일시로 사용 — 유지

-- ============================================================
-- 3. 운행정산 (operation_settlements) 전체 삭제
-- ============================================================

DROP TABLE IF EXISTS operation_settlements CASCADE;

-- 관련 인덱스도 자동 삭제되나 명시적으로 정리
DROP INDEX IF EXISTS idx_settlements_month;
DROP INDEX IF EXISTS idx_settlements_driver;

-- ============================================================
-- 4. 노선 (routes) 컬럼 추가
-- ============================================================

-- 추가: 거리(km)
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(8, 2);

-- 추가: 운행일수
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS operation_days INTEGER DEFAULT 1;

-- 추가: 차량번호 (기본 배차 차량, 텍스트 스냅샷)
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS plate_number VARCHAR(20);

-- 추가: 기사이름 (기본 배차 기사, 텍스트 스냅샷)
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS driver_name VARCHAR(50);

-- 추가: 고객사명 (텍스트, client_id FK 외 표시용)
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(100);

-- ============================================================
-- 5. 인덱스 추가 (dispatches 변경분)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_dispatches_operation_date ON dispatches(operation_date);
DROP INDEX IF EXISTS idx_dispatches_date;
