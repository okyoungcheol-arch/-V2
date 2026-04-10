-- ============================================================
-- 004: vehicles (차량) 컬럼 추가 / 변경
-- ============================================================

-- 추가: 출자자
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS investor VARCHAR(50);

-- 추가: 모델명
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS model_name VARCHAR(50);

-- 추가: 연식 (YYYY)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS manufacture_year INTEGER;

-- 추가: 할부유무
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS has_installment BOOLEAN DEFAULT FALSE;

-- 추가: 취득일
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS acquisition_date DATE;

-- 추가: 취득가격
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS acquisition_price NUMERIC(15, 0) DEFAULT 0;

-- 추가: 취득방법 (예: 신규/중고/할부)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS acquisition_method VARCHAR(20);

-- 추가: 보험사
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_company VARCHAR(50);

-- 추가: 에스원비용 (월)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS s1_cost NUMERIC(15, 0) DEFAULT 0;

-- 추가: 월관리비
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS monthly_maintenance NUMERIC(15, 0) DEFAULT 0;

-- 추가: 보험납입일 (매월 납입일, 1~31)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_payment_day INTEGER;

-- 기존 insurance_expiry → 보험만료일 유지 (컬럼명 동일)

-- 기존 inspection_date → 검사종료일로 컬럼명 변경
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicles' AND column_name = 'inspection_date'
  ) THEN
    ALTER TABLE vehicles RENAME COLUMN inspection_date TO inspection_end_date;
  END IF;
END $$;

-- 추가: 차대번호 (VIN)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS vin_number VARCHAR(30);

-- 추가: 최초등록일
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS first_registration_date DATE;

-- 추가: 차령만료일
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS vehicle_age_expiry DATE;

-- 추가: 연장회수
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS extension_count INTEGER DEFAULT 0;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_number);
