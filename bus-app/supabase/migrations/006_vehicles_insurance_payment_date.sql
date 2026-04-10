-- ============================================================
-- 006: vehicles.insurance_payment_day (INTEGER) → insurance_payment_date (DATE)
-- ============================================================

-- 1. 새 DATE 컬럼 추가
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_payment_date DATE;

-- 2. 기존 정수(납입일) 데이터가 있으면 NULL 처리 (일자만으론 DATE 변환 불가)
--    실제 날짜는 CSV 재업로드 또는 수동 입력으로 채움

-- 3. 기존 컬럼 삭제
ALTER TABLE vehicles
  DROP COLUMN IF EXISTS insurance_payment_day;
