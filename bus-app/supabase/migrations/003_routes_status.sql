-- ============================================================
-- 003: routes.status 값 정리 및 제약 조건 추가
-- ============================================================

-- 1. 기존 CHECK 제약 제거 (있으면)
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_status_check;

-- 2. 기존 모든 노선 상태를 '운행중'으로 일괄 변경
UPDATE routes SET status = '운행중';

-- 3. status 컬럼 기본값 설정
ALTER TABLE routes
  ALTER COLUMN status SET DEFAULT '운행중';

-- 4. 허용 값 제한: '운행중' / '비활성' 만 허용
ALTER TABLE routes
  ADD CONSTRAINT routes_status_check
  CHECK (status IN ('운행중', '비활성'));
