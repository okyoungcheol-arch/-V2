-- 할부계약에 최초결제일자, 결제일자 컬럼 추가
ALTER TABLE installments
  ADD COLUMN IF NOT EXISTS first_payment_date date,
  ADD COLUMN IF NOT EXISTS payment_day integer CHECK (payment_day BETWEEN 1 AND 31);

-- 기존 데이터: start_date 기준으로 다음달 같은 일자로 채움
UPDATE installments
SET
  first_payment_date = (start_date::date + interval '1 month')::date,
  payment_day = EXTRACT(DAY FROM start_date::date)::integer
WHERE first_payment_date IS NULL;
