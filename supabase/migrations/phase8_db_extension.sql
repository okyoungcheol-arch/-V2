-- ============================================================
-- Phase 8: DB 개편 — 테이블 컬럼 확장
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. vehicles (차량) 테이블 컬럼 추가
-- ──────────────────────────────────────────────────────────
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS manufacture_year  SMALLINT,
  ADD COLUMN IF NOT EXISTS purchase_date     DATE,
  ADD COLUMN IF NOT EXISTS purchase_price    BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN vehicles.manufacture_year IS '제조연도 (예: 2020)';
COMMENT ON COLUMN vehicles.purchase_date    IS '구입일';
COMMENT ON COLUMN vehicles.purchase_price   IS '구입가격 (원)';

-- ──────────────────────────────────────────────────────────
-- 2. employees (직원·기사) 테이블 컬럼 추가
-- ──────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS join_date     DATE,
  ADD COLUMN IF NOT EXISTS bank_name     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS bank_account  VARCHAR(50);

COMMENT ON COLUMN employees.join_date    IS '입사일';
COMMENT ON COLUMN employees.bank_name    IS '급여 은행명 (예: 국민은행)';
COMMENT ON COLUMN employees.bank_account IS '급여 계좌번호';

-- ──────────────────────────────────────────────────────────
-- 3. clients (고객사) 테이블 컬럼 추가
-- ──────────────────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS address             TEXT,
  ADD COLUMN IF NOT EXISTS email               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS business_number     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS contract_start_date DATE,
  ADD COLUMN IF NOT EXISTS contract_end_date   DATE;

COMMENT ON COLUMN clients.address             IS '주소';
COMMENT ON COLUMN clients.email               IS '이메일';
COMMENT ON COLUMN clients.business_number     IS '사업자등록번호';
COMMENT ON COLUMN clients.contract_start_date IS '계약시작일';
COMMENT ON COLUMN clients.contract_end_date   IS '계약종료일';
