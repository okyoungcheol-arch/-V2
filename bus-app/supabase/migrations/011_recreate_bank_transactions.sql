-- ============================================================
-- 011: bank_transactions 테이블 재생성 (컬럼 재설계)
-- ============================================================

-- 기존 테이블 완전 제거 (CASCADE로 ledger_entries FK도 자동 제거)
DROP TABLE IF EXISTS bank_transactions CASCADE;

CREATE TABLE bank_transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_id             VARCHAR(50),                        -- 자동생성 거래ID (BX1_YYYYMMDDNNN)
  bank_name           VARCHAR(50),                        -- 은행명 (농협/기업은행 등)
  account_number      VARCHAR(100),                       -- 계좌번호
  transaction_date    DATE NOT NULL,                      -- 거래일자
  transaction_time    TIME,                               -- 거래시각
  description         TEXT,                               -- 적요
  withdrawal          NUMERIC(15, 0) DEFAULT 0,           -- 출금액(원)
  deposit             NUMERIC(15, 0) DEFAULT 0,           -- 입금액(원)
  balance             NUMERIC(15, 0) DEFAULT 0,           -- 잔액(원)
  branch              VARCHAR(100),                       -- 거래점
  counterpart_account VARCHAR(50),                        -- 상대계좌번호
  counterpart_bank    VARCHAR(50),                        -- 상대은행
  counterpart_name    VARCHAR(100),                       -- 상대계좌예금주명
  memo                TEXT,                               -- 메모
  settlement_month    VARCHAR(7),                         -- 정산월 (YYYY-MM)
  manual_entry        VARCHAR(1) DEFAULT 'N',             -- 수기입력대상여부 (Y/N)
  notes               TEXT,                               -- 비고
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bank_tx_date        ON bank_transactions(transaction_date);
CREATE INDEX idx_bank_tx_bank_id     ON bank_transactions(bank_id);
CREATE INDEX idx_bank_tx_settlement  ON bank_transactions(settlement_month);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_transactions_admin_staff" ON bank_transactions
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));

-- ledger_entries FK 복원 (bank_transactions 재생성 후)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ledger_entries_bank_transaction_id_fkey'
      AND table_name = 'ledger_entries'
  ) THEN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_bank_transaction_id_fkey
      FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE SET NULL;
  END IF;
END $$;
