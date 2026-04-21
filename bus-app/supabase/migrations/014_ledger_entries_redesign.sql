-- ============================================================
-- 014: ledger_entries 스키마 변경
--   ADD: serial_no (일련번호), manual_entry (수기입력대상여부)
--   DROP: category
-- ============================================================

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS serial_no    INTEGER,
  ADD COLUMN IF NOT EXISTS manual_entry VARCHAR(1) DEFAULT 'N';

ALTER TABLE ledger_entries
  DROP COLUMN IF EXISTS category;
