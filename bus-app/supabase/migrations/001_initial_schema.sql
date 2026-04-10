-- ============================================================
-- 경남전세버스 통합 관리 시스템 — 초기 스키마
-- ============================================================

-- UUID 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 고객사 (clients)
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(100) NOT NULL,             -- 고객사명
  contact_name      VARCHAR(50),                       -- 담당자
  contact_phone     VARCHAR(20),                       -- 연락처
  contract_amount   NUMERIC(15, 0) DEFAULT 0,          -- 계약금액
  monthly_amount    NUMERIC(15, 0) DEFAULT 0,          -- 월계약금액
  advance_payment   NUMERIC(15, 0) DEFAULT 0,          -- 선금
  status            VARCHAR(20) DEFAULT '활성',         -- 활성 / 비활성
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. 직원_기사 (employees)
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(50) NOT NULL,              -- 이름
  emp_number        VARCHAR(20) UNIQUE,                -- 사번
  role              VARCHAR(20) NOT NULL DEFAULT 'user', -- admin / staff / user
  license_number    VARCHAR(30),                       -- 면허번호
  login_id          VARCHAR(50) UNIQUE,                -- 로그인ID
  pin_code          VARCHAR(255),                      -- 비밀번호(암호화)
  monthly_salary    NUMERIC(15, 0) DEFAULT 0,          -- 월급여
  phone             VARCHAR(20),
  can_drive         BOOLEAN DEFAULT TRUE,              -- 운전 가능 여부
  status            VARCHAR(20) DEFAULT '재직',         -- 재직 / 퇴직
  auth_user_id      UUID,                              -- Supabase Auth 연결
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 차량 (vehicles)
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plate_number      VARCHAR(20) NOT NULL UNIQUE,       -- 차량번호
  affiliation       VARCHAR(50),                       -- 소속
  vehicle_type      VARCHAR(30),                       -- 차종 (대형/중형/소형)
  capacity          INTEGER,                           -- 정원
  fuel_card_no      VARCHAR(30),                       -- 유류카드번호
  hipass_card_no    VARCHAR(30),                       -- 하이패스카드번호
  insurance_expiry  DATE,                              -- 보험만기일
  inspection_date   DATE,                              -- 정기점검일
  status            VARCHAR(20) DEFAULT '운행',         -- 운행 / 정비 / 폐차
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. 노선 (routes)
-- ============================================================
CREATE TABLE IF NOT EXISTS routes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_code            VARCHAR(20) NOT NULL UNIQUE,   -- 노선코드
  route_name            VARCHAR(100) NOT NULL,         -- 노선명
  origin                VARCHAR(100),                  -- 출발지
  destination           VARCHAR(100),                  -- 도착지
  waypoints             TEXT,                          -- 경유지 (쉼표 구분)
  fare_amount           NUMERIC(15, 0) DEFAULT 0,      -- 운행금액
  driver_allowance      NUMERIC(15, 0) DEFAULT 0,      -- 기사수당
  route_type            VARCHAR(20) DEFAULT '정기',     -- 정기 / 관광
  day_type              VARCHAR(30) DEFAULT '평일',     -- 평일 / 토요일A조 / 토요일B조 / 일요일A조 / 일요일B조 / 매일
  default_departure_time TIME,                         -- 기본 출발 시간
  client_id             UUID REFERENCES clients(id) ON DELETE SET NULL, -- 주 계약처
  status                VARCHAR(20) DEFAULT 'active',  -- active / inactive
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. 배차 (dispatches)
-- ============================================================
CREATE TABLE IF NOT EXISTS dispatches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_date     DATE NOT NULL,                     -- 배차일
  route_id          UUID REFERENCES routes(id) ON DELETE SET NULL,
  vehicle_id        UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id         UUID REFERENCES employees(id) ON DELETE SET NULL,
  departure_time    TIME,                              -- 출발시간
  passenger_count   INTEGER,                           -- 승객수
  status            VARCHAR(20) DEFAULT '배차',         -- 배차 / 운행완료 / 취소
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  -- 동일 날짜·차량 중복 배차 방지
  UNIQUE (dispatch_date, vehicle_id)
);

-- ============================================================
-- 6. 운행정산 (operation_settlements)
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_settlements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_id       UUID REFERENCES dispatches(id) ON DELETE SET NULL,
  operation_date    DATE NOT NULL,                     -- 운행일
  vehicle_id        UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id         UUID REFERENCES employees(id) ON DELETE SET NULL,
  settlement_month  VARCHAR(7) NOT NULL,               -- 정산년월 (YYYY-MM)
  revenue           NUMERIC(15, 0) DEFAULT 0,          -- 운행수익
  driver_allowance  NUMERIC(15, 0) DEFAULT 0,          -- 기사수당
  fuel_cost         NUMERIC(15, 0) DEFAULT 0,          -- 유류비
  toll_cost         NUMERIC(15, 0) DEFAULT 0,          -- 통행료
  income_tax        NUMERIC(15, 0) DEFAULT 0,          -- 사업소득세 (3.3%)
  insurance_fee     NUMERIC(15, 0) DEFAULT 0,          -- 4대보험료
  other_cost        NUMERIC(15, 0) DEFAULT 0,          -- 기타비용
  net_profit        NUMERIC(15, 0) DEFAULT 0,          -- 순수익
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. 할부정보 (installments)
-- ============================================================
CREATE TABLE IF NOT EXISTS installments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id        UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  loan_amount       NUMERIC(15, 0) NOT NULL,           -- 대출금액
  loan_period       INTEGER NOT NULL,                  -- 대출기간 (개월)
  grace_period      INTEGER DEFAULT 0,                 -- 거치기간 (개월)
  interest_rate     NUMERIC(6, 4) NOT NULL,            -- 금리 (연, ex: 0.0450)
  repayment_type    VARCHAR(20) DEFAULT '원리금균등',   -- 원리금균등 / 원금균등 / 거치후원리금균등
  creditor_name     VARCHAR(100),                      -- 거래처(은행)명
  start_date        DATE NOT NULL,                     -- 대출시작일
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. 할부스케줄 (installment_schedule)
-- ============================================================
CREATE TABLE IF NOT EXISTS installment_schedule (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installment_id    UUID NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
  installment_no    INTEGER NOT NULL,                  -- 회차
  due_date          DATE NOT NULL,                     -- 납부일자
  principal         NUMERIC(15, 0) DEFAULT 0,          -- 원금
  interest          NUMERIC(15, 0) DEFAULT 0,          -- 이자
  principal_interest NUMERIC(15, 0) DEFAULT 0,         -- 원리금 합계
  remaining_balance NUMERIC(15, 0) DEFAULT 0,          -- 대출잔액
  is_paid           BOOLEAN DEFAULT FALSE,             -- 납부유무
  paid_date         DATE,                              -- 실제 납부일
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (installment_id, installment_no)
);

-- ============================================================
-- 9. 은행거래 (bank_transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- 은행거래ID
  account_info      VARCHAR(100),                      -- 계좌정보
  transaction_at    TIMESTAMPTZ NOT NULL,              -- 거래일시
  deposit           NUMERIC(15, 0) DEFAULT 0,          -- 입금액
  withdrawal        NUMERIC(15, 0) DEFAULT 0,          -- 출금액
  balance           NUMERIC(15, 0) DEFAULT 0,          -- 잔액
  description       TEXT,                              -- 적요
  creditor_name     VARCHAR(100),                      -- 거래처명
  bank_type         VARCHAR(20),                       -- 농협 / 기업은행 등
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. 금전출납부 (ledger_entries)
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_date            DATE NOT NULL,                 -- 날짜
  description           TEXT NOT NULL,                 -- 적요
  income                NUMERIC(15, 0) DEFAULT 0,      -- 수입
  expense               NUMERIC(15, 0) DEFAULT 0,      -- 지출
  balance               NUMERIC(15, 0) DEFAULT 0,      -- 잔액
  vehicle_id            UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id             UUID REFERENCES employees(id) ON DELETE SET NULL,
  bank_transaction_id   UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
  category              VARCHAR(50),                   -- 분류 (운행수입/기사수당/유류비/할부금/기타)
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON dispatches(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_dispatches_driver ON dispatches(driver_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_vehicle ON dispatches(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status);
CREATE INDEX IF NOT EXISTS idx_settlements_month ON operation_settlements(settlement_month);
CREATE INDEX IF NOT EXISTS idx_settlements_driver ON operation_settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(transaction_at);
CREATE INDEX IF NOT EXISTS idx_installment_schedule_due ON installment_schedule(due_date);

-- ============================================================
-- RLS (Row Level Security) 활성화
-- ============================================================
ALTER TABLE clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_settlements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS 정책 — admin/staff: 전체 접근 / user(기사): 본인 데이터만
-- ============================================================

-- 역할 조회 헬퍼 함수
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS VARCHAR AS $$
  SELECT role FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 직원 본인 ID 조회 헬퍼 함수
CREATE OR REPLACE FUNCTION get_employee_id()
RETURNS UUID AS $$
  SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- [고객사] admin/staff 전체 / user 접근불가
CREATE POLICY "clients_admin_staff" ON clients
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));

-- [직원_기사] admin/staff 전체 / user 본인만
CREATE POLICY "employees_admin_staff" ON employees
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "employees_self" ON employees
  FOR SELECT USING (auth_user_id = auth.uid());

-- [차량] admin/staff 전체 / user 읽기만
CREATE POLICY "vehicles_admin_staff" ON vehicles
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "vehicles_user_read" ON vehicles
  FOR SELECT USING (get_user_role() = 'user');

-- [노선] admin/staff 전체 / user 읽기만
CREATE POLICY "routes_admin_staff" ON routes
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "routes_user_read" ON routes
  FOR SELECT USING (get_user_role() = 'user');

-- [배차] admin/staff 전체 / user 본인 배차만
CREATE POLICY "dispatches_admin_staff" ON dispatches
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "dispatches_user_self" ON dispatches
  FOR SELECT USING (driver_id = get_employee_id());

-- [운행정산] admin/staff 전체 / user 본인만
CREATE POLICY "settlements_admin_staff" ON operation_settlements
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "settlements_user_self" ON operation_settlements
  FOR SELECT USING (driver_id = get_employee_id());

-- [할부정보] admin/staff 전체
CREATE POLICY "installments_admin_staff" ON installments
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));

-- [할부스케줄] admin/staff 전체
CREATE POLICY "installment_schedule_admin_staff" ON installment_schedule
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));

-- [은행거래] admin/staff 전체
CREATE POLICY "bank_transactions_admin_staff" ON bank_transactions
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));

-- [금전출납부] admin/staff 전체
CREATE POLICY "ledger_entries_admin_staff" ON ledger_entries
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));
