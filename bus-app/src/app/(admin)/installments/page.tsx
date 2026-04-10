'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Installment, InstallmentInsert,
  InstallmentSchedule, InstallmentScheduleInsert,
  Vehicle, RepaymentType,
} from '@/types/database'
import Decimal from 'decimal.js'
import { format, addMonths, parseISO } from 'date-fns'
import { Plus, X, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react'

// ── 할부 스케줄 자동 계산 ──
function generateSchedule(
  loanAmount: number,
  loanPeriod: number,
  gracePeriod: number,
  annualRate: number,
  repaymentType: RepaymentType,
  startDate: string,
  installmentId: string,
): InstallmentScheduleInsert[] {
  const monthly = new Decimal(annualRate).div(12)
  const loan = new Decimal(loanAmount)
  const schedule: InstallmentScheduleInsert[] = []
  let remaining = loan

  const repayPeriod = loanPeriod - gracePeriod // 실제 상환 개월

  for (let i = 1; i <= loanPeriod; i++) {
    const dueDate = format(addMonths(parseISO(startDate), i - 1), 'yyyy-MM-dd')
    const interest = remaining.mul(monthly).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    let principal = new Decimal(0)
    let pi = new Decimal(0)

    if (i <= gracePeriod) {
      // 거치 기간: 이자만 납부
      pi = interest
    } else if (repaymentType === '원리금균등') {
      // 원리금균등: PMT 공식
      if (monthly.isZero()) {
        principal = loan.div(repayPeriod).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
      } else {
        const factor = monthly.plus(1).pow(repayPeriod)
        const pmt = loan.mul(monthly).mul(factor).div(factor.minus(1)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        principal = pmt.minus(interest)
      }
      pi = principal.plus(interest)
    } else {
      // 원금균등: 매달 동일 원금
      principal = loan.div(repayPeriod).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
      pi = principal.plus(interest)
    }

    remaining = remaining.minus(principal)
    if (remaining.lessThan(0)) remaining = new Decimal(0)

    schedule.push({
      installment_id: installmentId,
      installment_no: i,
      due_date: dueDate,
      principal: principal.toNumber(),
      interest: interest.toNumber(),
      principal_interest: pi.toNumber(),
      remaining_balance: remaining.toNumber(),
      is_paid: false,
    })
  }
  return schedule
}

const EMPTY_FORM: InstallmentInsert = {
  vehicle_id: '',
  loan_amount: 0,
  loan_period: 60,
  grace_period: 0,
  interest_rate: 0.045,
  repayment_type: '원리금균등',
  creditor_name: '',
  start_date: format(new Date(), 'yyyy-MM-dd'),
}

export default function InstallmentsPage() {
  const supabase = createClient()
  const [installments, setInstallments] = useState<Installment[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<InstallmentInsert>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 스케줄 보기
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [schedules, setSchedules] = useState<Record<string, InstallmentSchedule[]>>({})
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [upcomingSchedules, setUpcomingSchedules] = useState<(InstallmentSchedule & { plate_number?: string })[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const thisMonth = format(new Date(), 'yyyy-MM')
    const [{ data: inst }, { data: veh }, { data: upcoming }] = await Promise.all([
      supabase.from('installments').select('*, vehicles(id,plate_number)').order('created_at', { ascending: false }),
      supabase.from('vehicles').select('id,plate_number').eq('has_installment', 'Y').order('plate_number'),
      supabase
        .from('installment_schedule')
        .select('*, installments(vehicles(plate_number))')
        .like('due_date', `${thisMonth}%`)
        .eq('is_paid', false)
        .order('due_date'),
    ])
    setInstallments((inst ?? []) as Installment[])
    setVehicles((veh ?? []) as Vehicle[])
    setUpcomingSchedules(
      ((upcoming ?? []) as (InstallmentSchedule & { installments?: { vehicles?: { plate_number?: string } } })[])
        .map((s) => ({ ...s, plate_number: s.installments?.vehicles?.plate_number }))
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function loadSchedule(installmentId: string) {
    if (schedules[installmentId]) {
      setExpandedId(expandedId === installmentId ? null : installmentId)
      return
    }
    setLoadingSchedule(true)
    const { data } = await supabase
      .from('installment_schedule')
      .select('*')
      .eq('installment_id', installmentId)
      .order('installment_no')
    setSchedules((prev) => ({ ...prev, [installmentId]: (data ?? []) as InstallmentSchedule[] }))
    setExpandedId(installmentId)
    setLoadingSchedule(false)
  }

  async function togglePaid(schedule: InstallmentSchedule) {
    const { error } = await supabase
      .from('installment_schedule')
      .update({
        is_paid: !schedule.is_paid,
        paid_date: !schedule.is_paid ? format(new Date(), 'yyyy-MM-dd') : null,
      })
      .eq('id', schedule.id)
    if (error) return
    // 캐시 갱신
    setSchedules((prev) => ({
      ...prev,
      [schedule.installment_id]: prev[schedule.installment_id]?.map((s) =>
        s.id === schedule.id ? { ...s, is_paid: !s.is_paid, paid_date: !s.is_paid ? format(new Date(), 'yyyy-MM-dd') : null } : s
      ),
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (!form.vehicle_id) throw new Error('차량을 선택해 주세요.')

      // 1. 할부정보 저장
      const { data: inst, error: instErr } = await supabase
        .from('installments')
        .insert({
          vehicle_id: form.vehicle_id,
          loan_amount: Number(form.loan_amount),
          loan_period: Number(form.loan_period),
          grace_period: Number(form.grace_period),
          interest_rate: Number(form.interest_rate),
          repayment_type: form.repayment_type,
          creditor_name: form.creditor_name || null,
          start_date: form.start_date,
        })
        .select()
        .single()
      if (instErr || !inst) throw instErr ?? new Error('저장 실패')

      // 2. 스케줄 자동 생성
      const scheduleRows = generateSchedule(
        Number(form.loan_amount),
        Number(form.loan_period),
        Number(form.grace_period),
        Number(form.interest_rate),
        form.repayment_type ?? '원리금균등',
        form.start_date,
        inst.id,
      )
      const { error: schErr } = await supabase.from('installment_schedule').insert(scheduleRows)
      if (schErr) throw schErr

      setModalOpen(false); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">할부 관리</h2>
            <p className="text-sm text-gray-500 mt-1">차량 할부계약 등록 · 전체 회차 스케줄 자동 생성</p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setError(''); setModalOpen(true) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 min-h-[44px]"
          >
            <Plus size={16} /> 할부 등록
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">

      {/* 이번 달 납부 예정 배너 */}
      {!loading && upcomingSchedules.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">이번 달 미납 할부금 {upcomingSchedules.length}건</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {upcomingSchedules.map((s) => (
                <span key={s.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">
                  {s.plate_number ?? '-'} · {s.due_date} · {s.principal_interest.toLocaleString()}원
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <div className="space-y-3">
          {installments.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center text-gray-400">
              등록된 할부 계약이 없습니다.
            </div>
          )}
          {installments.map((inst) => {
            const sched = schedules[inst.id] ?? []
            const paidCount = sched.filter((s) => s.is_paid).length
            const isExpanded = expandedId === inst.id

            return (
              <div key={inst.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* 계약 헤더 */}
                <div
                  className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => loadSchedule(inst.id)}
                >
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="font-bold text-gray-900">{inst.vehicles?.plate_number ?? '-'}</p>
                      <p className="text-sm text-gray-500">{inst.creditor_name ?? '-'}</p>
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{Number(inst.loan_amount).toLocaleString()}원</span>
                      <span className="text-gray-400 mx-2">·</span>
                      {inst.loan_period}개월
                      <span className="text-gray-400 mx-2">·</span>
                      {(Number(inst.interest_rate) * 100).toFixed(2)}%
                      <span className="text-gray-400 mx-2">·</span>
                      {inst.repayment_type}
                    </div>
                    {sched.length > 0 && (
                      <div className="text-sm">
                        <span className="text-green-600 font-medium">{paidCount}회</span>
                        <span className="text-gray-400"> / {sched.length}회 납부</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <span className="text-xs">{isExpanded ? '접기' : '스케줄 보기'}</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* 스케줄 테이블 */}
                {isExpanded && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    {loadingSchedule ? (
                      <div className="py-8 text-center text-gray-400 text-sm">불러오는 중...</div>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            {['회차', '납부일', '원금', '이자', '원리금', '잔액', '납부'].map((h) => (
                              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sched.map((s) => {
                            const isOverdue = !s.is_paid && s.due_date < today
                            return (
                            <tr key={s.id} className={s.is_paid ? 'bg-green-50/40' : isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'}>
                              <td className="px-4 py-2.5 text-gray-600">{s.installment_no}회</td>
                              <td className="px-4 py-2.5 text-gray-700">{s.due_date}</td>
                              <td className="px-4 py-2.5">{s.principal.toLocaleString()}원</td>
                              <td className="px-4 py-2.5 text-amber-600">{s.interest.toLocaleString()}원</td>
                              <td className="px-4 py-2.5 font-medium">{s.principal_interest.toLocaleString()}원</td>
                              <td className="px-4 py-2.5 text-gray-500">{s.remaining_balance.toLocaleString()}원</td>
                              <td className="px-4 py-2.5">
                                <button
                                  onClick={() => togglePaid(s)}
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    s.is_paid
                                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                  }`}
                                >
                                  <CheckCircle2 size={13} />
                                  {s.is_paid ? `납부 (${s.paid_date ?? ''})` : '미납'}
                                </button>
                              </td>
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      </div>

      {/* 등록 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold">할부 계약 등록</h3>
                <p className="text-xs text-gray-500 mt-0.5">저장 시 전체 회차 스케줄이 자동 생성됩니다</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field label="차량 *">
                    <select className={ic} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} required>
                      <option value="">선택</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="거래처(은행명)">
                  <input className={ic} value={form.creditor_name ?? ''} onChange={(e) => setForm({ ...form, creditor_name: e.target.value })} placeholder="예: 농협은행" />
                </Field>
                <Field label="대출시작일 *">
                  <input type="date" className={ic} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                </Field>
                <Field label="대출금액 (원) *">
                  <input type="number" className={ic} value={form.loan_amount} onChange={(e) => setForm({ ...form, loan_amount: Number(e.target.value) })} required min={1} />
                </Field>
                <Field label="대출기간 (개월) *">
                  <input type="number" className={ic} value={form.loan_period} onChange={(e) => setForm({ ...form, loan_period: Number(e.target.value) })} required min={1} max={360} />
                </Field>
                <Field label="거치기간 (개월)">
                  <input type="number" className={ic} value={form.grace_period} onChange={(e) => setForm({ ...form, grace_period: Number(e.target.value) })} min={0} />
                </Field>
                <Field label="연금리 (예: 0.045 = 4.5%)">
                  <input type="number" className={ic} value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: Number(e.target.value) })} step={0.001} min={0} max={1} />
                </Field>
                <div className="col-span-2">
                  <Field label="상환방식">
                    <select className={ic} value={form.repayment_type} onChange={(e) => setForm({ ...form, repayment_type: e.target.value as RepaymentType })}>
                      {(['원리금균등', '원금균등', '거치후원리금균등'] as RepaymentType[]).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              {/* 미리보기 */}
              {form.loan_amount > 0 && form.loan_period > 0 && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-800">
                  <p className="font-medium mb-1">스케줄 미리보기</p>
                  <p>총 {form.loan_period}회차 · 거치 {form.grace_period}개월 · 상환 {Number(form.loan_period) - Number(form.grace_period)}개월</p>
                  {(() => {
                    const monthly = new Decimal(form.interest_rate ?? 0).div(12)
                    const repayPeriod = Number(form.loan_period) - Number(form.grace_period)
                    if (monthly.isZero() || repayPeriod <= 0) return null
                    const loan = new Decimal(form.loan_amount)
                    const factor = monthly.plus(1).pow(repayPeriod)
                    const pmt = loan.mul(monthly).mul(factor).div(factor.minus(1)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                    return <p className="mt-1">월 납부액(원리금균등): <strong>{pmt.toLocaleString()}원</strong></p>
                  })()}
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 disabled:opacity-50 min-h-[44px]">
                  {saving ? '저장 및 스케줄 생성 중...' : '등록 및 스케줄 생성'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

const ic = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent'
