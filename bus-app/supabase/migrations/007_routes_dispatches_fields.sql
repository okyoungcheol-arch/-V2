-- ============================================================
-- 007: routes 신규 컬럼 추가 + dispatches 출발시간/출발지 추가
-- ============================================================

-- [routes] 신규 컬럼
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS distance_km       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS operation_days    SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plate_number      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS driver_name       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS effective_start_date DATE,
  ADD COLUMN IF NOT EXISTS effective_end_date   DATE;

-- [dispatches] 관광배차 출발시간/출발지 직접 저장
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS departure_time    TIME,
  ADD COLUMN IF NOT EXISTS origin            VARCHAR(200);
