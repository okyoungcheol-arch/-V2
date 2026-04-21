-- ============================================================
-- 013: bank_transactions 데이터 초기화 + manual_entry 컬럼 제거
-- ============================================================

TRUNCATE TABLE bank_transactions CASCADE;

ALTER TABLE bank_transactions DROP COLUMN IF EXISTS manual_entry;
