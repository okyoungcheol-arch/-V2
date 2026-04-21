-- ============================================================
-- 012: bank_transactions RLS 정책 수정
-- get_user_role()이 NULL을 반환하는 경우 대비
-- employees.auth_user_id 미연결 시에도 인증된 사용자는 접근 가능
-- ============================================================

DROP POLICY IF EXISTS "bank_transactions_admin_staff" ON bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_all_access" ON bank_transactions;

-- 인증된 사용자 전체 허용 (내부 관리 시스템 — 외부 공개 없음)
CREATE POLICY "bank_transactions_authenticated" ON bank_transactions
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
