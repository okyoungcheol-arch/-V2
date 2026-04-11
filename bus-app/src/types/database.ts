// ============================================================
// 경남전세버스 통합 관리 시스템 — TypeScript 타입 정의
// ============================================================

export type UserRole = 'admin' | 'staff' | 'user'
export type ClientStatus = '활성' | '비활성'
export type EmployeeStatus = '재직' | '퇴직'
export type VehicleStatus = '운행' | '정비' | '폐차'
export type RouteType = '정기' | '관광'
export type DayType = '평일' | '토요일A조' | '토요일B조' | '일요일A조' | '일요일B조' | '매일'
export type RouteStatus = '운행중' | '비활성'
export type DispatchStatus = '배차' | '운행완료' | '취소'
export type RepaymentType = '원리금균등' | '원금균등' | '거치후원리금균등'
export type YN = 'Y' | 'N'

// ============================================================
// 고객사 (clients)
// ============================================================
export interface Client {
  id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  address: string | null
  email: string | null
  business_number: string | null
  contract_amount: number
  monthly_amount: number
  advance_payment: number
  contract_start_date: string | null
  contract_end_date: string | null
  status: ClientStatus
  notes: string | null
  created_at: string
}

export interface ClientInsert {
  name: string
  contact_name?: string | null
  contact_phone?: string | null
  address?: string | null
  email?: string | null
  business_number?: string | null
  contract_amount?: number
  monthly_amount?: number
  advance_payment?: number
  contract_start_date?: string | null
  contract_end_date?: string | null
  status?: ClientStatus
  notes?: string | null
}

export type ClientUpdate = Partial<ClientInsert>

// ============================================================
// 직원_기사 (employees)
// ============================================================
export interface Employee {
  id: string
  name: string
  emp_number: string | null
  role: UserRole
  phone: string | null
  license_number: string | null
  can_drive: boolean
  status: EmployeeStatus
  employment_type: string | null   // 고용형태
  address: string | null           // 주소
  join_date: string | null
  resignation_date: string | null  // 퇴사일
  monthly_salary: number
  bank_name: string | null
  bank_account: string | null
  shinhan_account: string | null   // 신한은행 계좌번호
  hometax_id: string | null        // 홈텍스 ID
  login_id: string | null
  pin_code: string | null
  notes: string | null
  created_at: string
  auth_user_id: string | null
}

export interface EmployeeInsert {
  name: string
  emp_number?: string | null
  role?: UserRole
  phone?: string | null
  license_number?: string | null
  can_drive?: boolean
  status?: EmployeeStatus
  employment_type?: string | null
  address?: string | null
  join_date?: string | null
  resignation_date?: string | null
  monthly_salary?: number
  bank_name?: string | null
  bank_account?: string | null
  shinhan_account?: string | null
  hometax_id?: string | null
  login_id?: string | null
  pin_code?: string | null
  notes?: string | null
  auth_user_id?: string | null
}

export type EmployeeUpdate = Partial<EmployeeInsert>

// ============================================================
// 차량 (vehicles)
// ============================================================
export interface Vehicle {
  id: string
  plate_number: string           // 차량번호
  affiliation: string | null     // 소속
  investor: string | null        // 출자자
  capacity: number | null        // 정원(명)
  model_name: string | null      // 모델명
  manufacture_year: number | null // 연식
  has_installment: YN            // 할부유무 ('Y'/'N')
  fuel_card_no: string | null    // 유류카드번호
  hipass_card_no: string | null  // 하이패스카드번호
  acquisition_date: string | null     // 취득일
  acquisition_price: number           // 취득가격
  acquisition_method: string | null   // 취득방법
  insurance_company: string | null    // 보험사
  s1_cost: number                     // 에스원비용
  monthly_maintenance: number         // 월관리비
  insurance_payment_date: string | null // 보험납입일 (YYYY-MM-DD)
  insurance_expiry: string | null     // 보험만료일
  inspection_end_date: string | null  // 검사종료일
  vin_number: string | null           // 차대번호
  first_registration_date: string | null // 최초등록일
  vehicle_age_expiry: string | null   // 차령만료일
  extension_count: number             // 연장회수
  status: VehicleStatus
  notes: string | null
  created_at: string
}

export interface VehicleInsert {
  plate_number: string
  affiliation?: string | null
  investor?: string | null
  capacity?: number | null
  model_name?: string | null
  manufacture_year?: number | null
  has_installment?: YN
  fuel_card_no?: string | null
  hipass_card_no?: string | null
  acquisition_date?: string | null
  acquisition_price?: number
  acquisition_method?: string | null
  insurance_company?: string | null
  s1_cost?: number
  monthly_maintenance?: number
  insurance_payment_date?: string | null
  insurance_expiry?: string | null
  inspection_end_date?: string | null
  vin_number?: string | null
  first_registration_date?: string | null
  vehicle_age_expiry?: string | null
  extension_count?: number
  status?: VehicleStatus
  notes?: string | null
}

export type VehicleUpdate = Partial<VehicleInsert>

// ============================================================
// 노선 (routes)
// ============================================================
export interface Route {
  id: string
  route_code: string
  route_name: string
  origin: string | null
  destination: string | null
  waypoints: string | null
  fare_amount: number
  driver_allowance: number
  route_type: RouteType
  day_type: DayType
  default_departure_time: string | null
  client_id: string | null
  status: RouteStatus
  notes: string | null
  created_at: string
  // 조인 데이터
  clients?: Pick<Client, 'id' | 'name'> | null
}

export interface RouteInsert {
  route_code: string
  route_name: string
  origin?: string | null
  destination?: string | null
  waypoints?: string | null
  fare_amount?: number
  driver_allowance?: number
  route_type?: RouteType
  day_type?: DayType
  default_departure_time?: string | null
  client_id?: string | null
  status?: RouteStatus
  notes?: string | null
}

export type RouteUpdate = Partial<RouteInsert>

// ============================================================
// 배차 (dispatches)
// ============================================================
export interface Dispatch {
  id: string
  dispatch_date: string
  route_id: string | null
  vehicle_id: string | null
  driver_id: string | null
  departure_time: string | null
  passenger_count: number | null
  status: DispatchStatus
  notes: string | null
  created_at: string
  // 조인 데이터
  routes?: Pick<Route, 'id' | 'route_code' | 'route_name'> | null
  vehicles?: Pick<Vehicle, 'id' | 'plate_number'> | null
  employees?: Pick<Employee, 'id' | 'name'> | null
}

export interface DispatchInsert {
  dispatch_date: string
  route_id?: string | null
  vehicle_id?: string | null
  driver_id?: string | null
  departure_time?: string | null
  passenger_count?: number | null
  status?: DispatchStatus
  notes?: string | null
}

export type DispatchUpdate = Partial<DispatchInsert>

// ============================================================
// 운행정산 (operation_settlements)
// ============================================================
export interface OperationSettlement {
  id: string
  dispatch_id: string | null
  operation_date: string
  vehicle_id: string | null
  driver_id: string | null
  settlement_month: string
  revenue: number
  driver_allowance: number
  fuel_cost: number
  toll_cost: number
  income_tax: number
  insurance_fee: number
  other_cost: number
  net_profit: number
  notes: string | null
  created_at: string
  // 조인 데이터
  vehicles?: Pick<Vehicle, 'id' | 'plate_number'> | null
  employees?: Pick<Employee, 'id' | 'name'> | null
}

export interface OperationSettlementInsert {
  dispatch_id?: string | null
  operation_date: string
  vehicle_id?: string | null
  driver_id?: string | null
  settlement_month: string
  revenue?: number
  driver_allowance?: number
  fuel_cost?: number
  toll_cost?: number
  income_tax?: number
  insurance_fee?: number
  other_cost?: number
  net_profit?: number
  notes?: string | null
}

export type OperationSettlementUpdate = Partial<OperationSettlementInsert>

// ============================================================
// 할부정보 (installments)
// ============================================================
export interface Installment {
  id: string
  vehicle_id: string
  loan_amount: number
  loan_period: number
  grace_period: number
  interest_rate: number
  repayment_type: RepaymentType
  creditor_name: string | null
  start_date: string
  notes: string | null
  created_at: string
  // 조인 데이터
  vehicles?: Pick<Vehicle, 'id' | 'plate_number'> | null
}

export interface InstallmentInsert {
  vehicle_id: string
  loan_amount: number
  loan_period: number
  grace_period?: number
  interest_rate: number
  repayment_type?: RepaymentType
  creditor_name?: string | null
  start_date: string
  notes?: string | null
}

export type InstallmentUpdate = Partial<InstallmentInsert>

// ============================================================
// 할부스케줄 (installment_schedule)
// ============================================================
export interface InstallmentSchedule {
  id: string
  installment_id: string
  installment_no: number
  due_date: string
  principal: number
  interest: number
  principal_interest: number
  remaining_balance: number
  is_paid: boolean
  paid_date: string | null
  created_at: string
}

export interface InstallmentScheduleInsert {
  installment_id: string
  installment_no: number
  due_date: string
  principal?: number
  interest?: number
  principal_interest?: number
  remaining_balance?: number
  is_paid?: boolean
  paid_date?: string | null
}

export type InstallmentScheduleUpdate = Partial<InstallmentScheduleInsert>

// ============================================================
// 은행거래 (bank_transactions)
// ============================================================
export interface BankTransaction {
  id: string
  account_info: string | null
  transaction_at: string
  deposit: number
  withdrawal: number
  balance: number
  description: string | null
  creditor_name: string | null
  bank_type: string | null
  created_at: string
}

export interface BankTransactionInsert {
  account_info?: string | null
  transaction_at: string
  deposit?: number
  withdrawal?: number
  balance?: number
  description?: string | null
  creditor_name?: string | null
  bank_type?: string | null
}

export type BankTransactionUpdate = Partial<BankTransactionInsert>

// ============================================================
// 금전출납부 (ledger_entries)
// ============================================================
export interface LedgerEntry {
  id: string
  entry_date: string
  description: string
  income: number
  expense: number
  balance: number
  vehicle_id: string | null
  driver_id: string | null
  bank_transaction_id: string | null
  category: string | null
  notes: string | null
  created_at: string
  // 조인 데이터
  vehicles?: Pick<Vehicle, 'id' | 'plate_number'> | null
  employees?: Pick<Employee, 'id' | 'name'> | null
  bank_transactions?: Pick<BankTransaction, 'id' | 'description'> | null
}

export interface LedgerEntryInsert {
  entry_date: string
  description: string
  income?: number
  expense?: number
  balance?: number
  vehicle_id?: string | null
  driver_id?: string | null
  bank_transaction_id?: string | null
  category?: string | null
  notes?: string | null
}

export type LedgerEntryUpdate = Partial<LedgerEntryInsert>
