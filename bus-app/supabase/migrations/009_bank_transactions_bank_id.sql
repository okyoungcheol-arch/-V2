-- ============================================================
-- 009: bank_transactions.bank_id 컬럼 추가
-- ============================================================

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS bank_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_bank_tx_bank_id ON bank_transactions(bank_id);
