-- ============================================================
-- 005: vehicles.has_installment BOOLEAN → VARCHAR('Y'/'N')
-- ============================================================

-- 1. 기존 BOOLEAN → 'Y'/'N' 문자열로 변환
ALTER TABLE vehicles
  ALTER COLUMN has_installment TYPE VARCHAR(1)
  USING CASE WHEN has_installment THEN 'Y' ELSE 'N' END;

-- 2. 기본값 변경
ALTER TABLE vehicles
  ALTER COLUMN has_installment SET DEFAULT 'N';

-- 3. NULL 방지 + 허용값 제한
ALTER TABLE vehicles
  ALTER COLUMN has_installment SET NOT NULL;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_has_installment_check
  CHECK (has_installment IN ('Y', 'N'));
