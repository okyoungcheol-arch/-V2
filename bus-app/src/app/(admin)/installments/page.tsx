'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Installment, InstallmentInsert,
  InstallmentSchedule, InstallmentScheduleInsert,
  Vehicle, RepaymentType,
} from '@/types/database'
import Decimal from 'decimal.js'
import { format, addMonths, parseISO, getDaysInMonth, differenceInDays } from 'date-fns'
import { Plus, X, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Pencil, Trash2 } from 'lucide-react'

// ── 납부일 계산: 초회는 first_payment_date 그대로, 이후는 payment_day 기준 월 증가 ──
function calcDueDate(firstPaymentDate: string, monthOffset: number, paymentDay: number): string {
  if (monthOffset === 0) return firstPaymentDate
  const base = addMonths(parseISO(firstPaymentDate), monthOffset)
  const day = Math.min(paymentDay, getDaysInMonth(base))
  return format(new Date(base.getFullYear(), base.getMonth(), day), 'yyyy-MM-dd')
}

// ── 1회차 이자 계산 (일할 기준) ──
// • days ≤ 0  : 표준 1개월 이자
// • days > 0  : 실제 일수 기준 일할이자 = 대출금 × 연이율/365 × days
function calcFirstInterest(
  loan: Decimal,
  monthly: Decimal, daily: Decimal, days: number,
): Decimal {
  if (days <= 0) {
    return loan.mul(monthly).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  }
  // 실제 일수 기준 일할이자 (30일 초과 포함 동일 공식)
  return loan.mul(daily).mul(days).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
}

// ── 할부 스케줄 자동 계산 ──
// • 총 회차 = loanPeriod (항상)
// • 원리금균등: PMT를 대출금 전체 기간(loanPeriod)으로 1회 계산 후 고정
//   - 1회차: PMT의 원금(= PMT - 표준월이자) + 일할이자(30일 분기)
//   - 2회차~: 고정 PMT 적용 (interest = 잔액×월이율, principal = PMT - interest)
// • 원금균등: 매월 균등 원금, 이자는 잔액×월이율 / 단 1회차 이자는 일할
function generateSchedule(
  loanAmount: number,
  loanPeriod: number,
  gracePeriod: number,
  annualRate: number,
  repaymentType: RepaymentType,
  startDate: string,         // 대출시작일
  firstPaymentDate: string,  // 최초결제일자
  paymentDay: number,        // 결제일자 (1~31)
  installmentId: string,
): InstallmentScheduleInsert[] {
  const monthly = new Decimal(annualRate).div(12)
  const daily   = new Decimal(annualRate).div(365)
  const loan    = new Decimal(loanAmount)
  let remaining = loan
  let no = 1
  const schedule: InstallmentScheduleInsert[] = []

  const days = differenceInDays(parseISO(firstPaymentDate), parseISO(startDate))
  const repayPeriod = loanPeriod - gracePeriod

  // ── 원리금균등: 대출금 전체 기간 기준 PMT 1회 계산 (고정) ──
  let fixedPmt = new Decimal(0)
  if (repaymentType !== '원금균등' && !monthly.isZero() && loanPeriod > 0) {
    const factor = monthly.plus(1).pow(loanPeriod)
    fixedPmt = loan.mul(monthly).mul(factor).div(factor.minus(1)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  }

  // ── 1회차 원금 (거치기간 없을 때만 원금 포함) ──
  let p1 = new Decimal(0)
  if (gracePeriod === 0 && repayPeriod > 0) {
    if (repaymentType === '원금균등') {
      p1 = loan.div(loanPeriod).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    } else {
      if (monthly.isZero()) {
        p1 = loan.div(loanPeriod).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      } else {
        // 원리금균등 1회차 원금 = PMT - (30일 일할이자 or 표준월이자)
        if (days > 30) {
          p1 = fixedPmt.minus(loan.mul(daily).mul(30).toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
        } else {
          p1 = fixedPmt.minus(loan.mul(monthly).toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
        }
        if (p1.lessThan(0)) p1 = new Decimal(0)
      }
    }
  }

  // ── 1회차 이자: 일할 기준 (30일 분기) ──
  const i1 = calcFirstInterest(loan, monthly, daily, days)

  remaining = remaining.minus(p1)
  if (remaining.lessThan(0)) remaining = new Decimal(0)

  schedule.push({
    installment_id: installmentId,
    installment_no: no++,
    due_date: firstPaymentDate,
    principal: p1.toNumber(),
    interest: i1.toNumber(),
    principal_interest: p1.plus(i1).toNumber(),
    remaining_balance: remaining.toNumber(),
    is_paid: false,
  })

  // ── 2회차~loanPeriod: 정상 원리금균등(고정 PMT) 또는 원금균등 ──
  for (let i = 2; i <= loanPeriod; i++) {
    const dueDate  = calcDueDate(firstPaymentDate, i - 1, paymentDay)
    const interest = remaining.mul(monthly).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    let principal  = new Decimal(0)
    let pi         = new Decimal(0)

    if (i <= gracePeriod) {
      // 거치 기간: 이자만
      pi = interest
    } else {
      if (repaymentType === '원금균등') {
        principal = loan.div(loanPeriod).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      } else {
        // 고정 PMT 사용: principal = PMT - interest
        // 마지막 회차는 잔액 전부 상환 (원/이자 오차 청산)
        if (i === loanPeriod) {
          principal = remaining
        } else {
          principal = fixedPmt.minus(interest)
          if (principal.lessThan(0)) principal = new Decimal(0)
          if (principal.greaterThan(remaining)) principal = remaining
        }
      }
      pi = principal.plus(interest)
    }

    remaining = remaining.minus(principal)
    if (remaining.lessThan(0)) remaining = new Decimal(0)

    schedule.push({
      installment_id: installmentId,
      installment_no: no++,
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
  first_payment_date: format(addMonths(new Date(), 1), 'yyyy-MM-') + '25',
  payment_day: 25,
}

export default function InstallmentsPage() {
  const supabase = createClient()
  const [installments, setInstallments] = useState<Installment[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<InstallmentInsert>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 체크박스 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 삭제 확인
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function openEdit(inst: Installment) {
    setEditingId(inst.id)
    setForm({
      vehicle_id: inst.vehicle_id,
      loan_amount: inst.loan_amount,
      loan_period: inst.loan_period,
      grace_period: inst.grace_period,
      interest_rate: inst.interest_rate,
      repayment_type: inst.repayment_type,
      creditor_name: inst.creditor_name,
      start_date: inst.start_date,
      first_payment_date: inst.first_payment_date ?? EMPTY_FORM.first_payment_date,
      payment_day: inst.payment_day ?? EMPTY_FORM.payment_day,
    })
    setError('')
    setModalOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (!form.vehicle_id) throw new Error('차량을 선택해 주세요.')

      const firstPaymentDate = form.first_payment_date || EMPTY_FORM.first_payment_date!
      const paymentDay = Number(form.payment_day) || 25

      if (editingId) {
        // 수정: 할부정보 업데이트 + 스케줄 재생성
        const { error: updErr } = await supabase
          .from('installments')
          .update({
            vehicle_id: form.vehicle_id,
            loan_amount: Number(form.loan_amount),
            loan_period: Number(form.loan_period),
            grace_period: Number(form.grace_period),
            interest_rate: Number(form.interest_rate),
            repayment_type: form.repayment_type,
            creditor_name: form.creditor_name || null,
            start_date: form.start_date,
            first_payment_date: firstPaymentDate,
            payment_day: paymentDay,
          })
          .eq('id', editingId)
        if (updErr) throw updErr

        // 기존 스케줄 삭제 후 재생성
        await supabase.from('installment_schedule').delete().eq('installment_id', editingId)
        const scheduleRows = generateSchedule(
          Number(form.loan_amount), Number(form.loan_period), Number(form.grace_period),
          Number(form.interest_rate), form.repayment_type ?? '원리금균등',
          form.start_date, firstPaymentDate, paymentDay, editingId,
        )
        const { error: schErr } = await supabase.from('installment_schedule').insert(scheduleRows)
        if (schErr) throw schErr

        // 캐시 초기화
        setSchedules((prev) => { const n = { ...prev }; delete n[editingId]; return n })
      } else {
        // 신규 등록
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
            first_payment_date: firstPaymentDate,
            payment_day: paymentDay,
          })
          .select().single()
        if (instErr || !inst) throw instErr ?? new Error('저장 실패')

        const scheduleRows = generateSchedule(
          Number(form.loan_amount), Number(form.loan_period), Number(form.grace_period),
          Number(form.interest_rate), form.repayment_type ?? '원리금균등',
          form.start_date, firstPaymentDate, paymentDay, inst.id,
        )
        const { error: schErr } = await supabase.from('installment_schedule').insert(scheduleRows)
        if (schErr) throw schErr
      }

      setModalOpen(false); setSelectedIds(new Set()); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      // 스케줄은 CASCADE로 자동 삭제
      const { error } = await supabase.from('installments').delete().in('id', ids)
      if (error) throw error
      setSelectedIds(new Set())
      setDeleteConfirm(false)
      setSchedules((prev) => {
        const n = { ...prev }
        ids.forEach((id) => delete n[id])
        return n
      })
      load()
    } catch {
      // silent
    } finally {
      setDeleting(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === installments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(installments.map((i) => i.id)))
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
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                {selectedIds.size === 1 && (
                  <button
                    onClick={() => {
                      const inst = installments.find((i) => i.id === Array.from(selectedIds)[0])
                      if (inst) openEdit(inst)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 min-h-[44px]"
                  >
                    <Pencil size={15} /> 수정
                  </button>
                )}
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100 min-h-[44px]"
                >
                  <Trash2 size={15} /> 삭제 ({selectedIds.size})
                </button>
              </>
            )}
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 min-h-[44px]"
            >
              <Plus size={16} /> 할부 등록
            </button>
          </div>
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
          {installments.length > 0 && (
            <div className="flex items-center gap-2 px-1 pb-1">
              <input
                type="checkbox"
                checked={selectedIds.size === installments.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-[#1E40AF] cursor-pointer"
              />
              <span className="text-xs text-gray-500">전체선택</span>
            </div>
          )}
          {installments.map((inst) => {
            const sched = schedules[inst.id] ?? []
            const paidCount = sched.filter((s) => s.is_paid).length
            const isExpanded = expandedId === inst.id
            const isSelected = selectedIds.has(inst.id)

            return (
              <div key={inst.id} className={`bg-white rounded-2xl border overflow-hidden transition-colors ${isSelected ? 'border-[#1E40AF] ring-1 ring-[#1E40AF]/30' : 'border-gray-200'}`}>
                {/* 계약 헤더 */}
                <div className="flex items-center px-6 py-4 gap-4">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(inst.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 accent-[#1E40AF] cursor-pointer flex-shrink-0"
                  />
                  <div
                    className="flex items-center justify-between flex-1 cursor-pointer hover:bg-gray-50 rounded-xl -mx-2 px-2 py-1"
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
                </div>

                {/* 스케줄 테이블 */}
                {isExpanded && (
                  <div className="border-t border-gray-100 overflow-x-auto overflow-y-auto max-h-[480px]">
                    {loadingSchedule ? (
                      <div className="py-8 text-center text-gray-400 text-sm">불러오는 중...</div>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10">
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

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">할부 계약 삭제</h3>
                <p className="text-sm text-gray-500">총 {selectedIds.size}건을 삭제합니다</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 bg-red-50 rounded-xl px-4 py-3 mb-5">
              삭제 시 연결된 전체 납부 스케줄도 함께 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
              <button onClick={handleDelete} disabled={deleting} className="px-5 py-2.5 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 min-h-[44px]">
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 등록/수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold">{editingId ? '할부 계약 수정' : '할부 계약 등록'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{editingId ? '수정 시 기존 스케줄이 재생성됩니다' : '저장 시 전체 회차 스케줄이 자동 생성됩니다'}</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* 1. 차량 */}
                <div className="col-span-2">
                  <Field label="차량 *">
                    <select className={ic} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} required>
                      <option value="">선택</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                    </select>
                  </Field>
                </div>
                {/* 2. 대출시작일 / 3. 대출기간 */}
                <Field label="대출시작일 *">
                  <input type="date" className={ic} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                </Field>
                <Field label="대출기간 (개월) *">
                  <input type="number" className={ic} value={form.loan_period} onChange={(e) => setForm({ ...form, loan_period: Number(e.target.value) })} required min={1} max={360} />
                </Field>
                {/* 4. 대출금액 / 5. 거치기간 */}
                <Field label="대출금액 (원) *">
                  <AmountInput
                    value={form.loan_amount}
                    onChange={(v) => setForm({ ...form, loan_amount: v })}
                    placeholder="예: 50,000,000"
                    required
                  />
                </Field>
                <Field label="거치기간 (개월)">
                  <input type="number" className={ic} value={form.grace_period} onChange={(e) => setForm({ ...form, grace_period: Number(e.target.value) })} min={0} />
                </Field>
                {/* 6. 연금리 (% 입력) */}
                <Field label="연금리 (%)">
                  <div className="relative">
                    <input
                      type="number"
                      className={ic + ' pr-8'}
                      value={form.interest_rate ? Number((Number(form.interest_rate) * 100).toFixed(4)).toString() : ''}
                      onChange={(e) => setForm({ ...form, interest_rate: Number(e.target.value) / 100 })}
                      step={0.01}
                      min={0}
                      max={100}
                      placeholder="예: 4.5"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                  </div>
                </Field>
                {/* 거래처 (오른쪽 배치) */}
                <Field label="거래처">
                  <input className={ic} value={form.creditor_name ?? ''} onChange={(e) => setForm({ ...form, creditor_name: e.target.value })} placeholder="예: 캐피탈, 리스사 등" />
                </Field>
                {/* 7. 최초결제일자 / 8. 결제일자 */}
                <Field label="최초결제일자 *">
                  <input
                    type="date"
                    className={ic}
                    value={form.first_payment_date ?? ''}
                    onChange={(e) => {
                      const d = e.target.value
                      const day = d ? new Date(d).getDate() : (form.payment_day ?? 25)
                      setForm({ ...form, first_payment_date: d, payment_day: day })
                    }}
                    required
                  />
                </Field>
                <Field label="결제일자 (매월)">
                  <div className="relative">
                    <input
                      type="number"
                      className={ic + ' pr-8'}
                      value={form.payment_day ?? ''}
                      onChange={(e) => setForm({ ...form, payment_day: Number(e.target.value) })}
                      min={1}
                      max={31}
                      placeholder="예: 25"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">일</span>
                  </div>
                </Field>
                {/* 9. 상환방식 */}
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
                <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-800 space-y-1">
                  <p className="font-medium">스케줄 미리보기</p>
                  {(() => {
                    const loanPeriod = Number(form.loan_period)
                    const gracePeriod = Number(form.grace_period)
                    const annualRate = Number(form.interest_rate ?? 0)
                    const repaymentType = form.repayment_type ?? '원리금균등'
                    const loan = new Decimal(form.loan_amount)
                    const monthly = new Decimal(annualRate).div(12)
                    const daily   = new Decimal(annualRate).div(365)
                    const repayPeriod = loanPeriod - gracePeriod

                    const days = (form.start_date && form.first_payment_date)
                      ? differenceInDays(parseISO(form.first_payment_date), parseISO(form.start_date))
                      : 0

                    // ── 고정 PMT (대출금 전체 기간 기준, 1회 계산) ──
                    let fixedPmt: Decimal | null = null
                    if (repaymentType !== '원금균등' && !monthly.isZero() && loanPeriod > 0) {
                      const factor = monthly.plus(1).pow(loanPeriod)
                      fixedPmt = loan.mul(monthly).mul(factor).div(factor.minus(1)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                    }

                    // ── 1회차 원금 ──
                    let p1 = new Decimal(0)
                    if (gracePeriod === 0 && repayPeriod > 0) {
                      if (repaymentType === '원금균등') {
                        p1 = loan.div(loanPeriod).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                      } else if (fixedPmt && !monthly.isZero()) {
                        // 원리금균등 1회차 원금 = PMT - (30일 일할이자 or 표준월이자)
                        if (days > 30) {
                          p1 = fixedPmt.minus(loan.mul(daily).mul(30).toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
                        } else {
                          p1 = fixedPmt.minus(loan.mul(monthly).toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
                        }
                        if (p1.lessThan(0)) p1 = new Decimal(0)
                      } else {
                        p1 = loan.div(loanPeriod).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                      }
                    }

                    // ── 1회차 이자 (30일 분기) ──
                    const i1 = calcFirstInterest(loan, monthly, daily, days)
                    const pi1 = p1.plus(i1)

                    // ── 2회차~ 표시: 고정 PMT(원리금균등) 또는 월 원금(원금균등) ──
                    const monthlyPrincipal = repaymentType === '원금균등'
                      ? loan.div(loanPeriod).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                      : null

                    // ── 이자 설명 ──
                    let interestNote = ''
                    if (days <= 0) interestNote = '표준 1개월 이자'
                    else interestNote = `일할이자 ${days}일`

                    return (
                      <>
                        <p>
                          총 <strong>{loanPeriod}</strong>회차
                          {` · 거치 ${gracePeriod}개월 · 상환 ${repayPeriod}개월`}
                          {form.payment_day ? ` · 매월 ${form.payment_day}일` : ''}
                        </p>
                        <div className="border-t border-blue-200 pt-1 mt-1 space-y-0.5">
                          <p className="font-semibold text-blue-900">1회차 납입액 ({interestNote})</p>
                          <p>원금: <strong>{p1.toNumber().toLocaleString()}원</strong>
                             &nbsp;·&nbsp;이자: <strong>{i1.toNumber().toLocaleString()}원</strong>
                          </p>
                          <p>합계: <strong className="text-blue-700">{pi1.toNumber().toLocaleString()}원</strong></p>
                        </div>
                        {(fixedPmt || monthlyPrincipal) && (
                          <div className="border-t border-blue-200 pt-1 mt-1">
                            {fixedPmt && <p>2회차~ 월 원리금 (원리금균등): <strong>{fixedPmt.toNumber().toLocaleString()}원</strong></p>}
                            {monthlyPrincipal && <p>월 원금 (원금균등): <strong>{monthlyPrincipal.toNumber().toLocaleString()}원</strong></p>}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 disabled:opacity-50 min-h-[44px]">
                  {saving ? '저장 중...' : editingId ? '수정 및 스케줄 재생성' : '등록 및 스케줄 생성'}
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

// ── 금액 입력 컴포넌트: 0일 때 빈값 표시, 입력 시 천단위 콤마, 저장 시 숫자 ──
function AmountInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: number
  onChange: (v: number) => void
  placeholder?: string
  required?: boolean
}) {
  const [raw, setRaw] = useState(() => value > 0 ? value.toLocaleString() : '')

  // 외부(폼 초기화/수정 오픈)에서 value가 바뀌면 동기화
  useEffect(() => {
    setRaw(value > 0 ? value.toLocaleString() : '')
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const stripped = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '')
    const num = stripped === '' ? 0 : Number(stripped)
    setRaw(num > 0 ? num.toLocaleString() : '')
    onChange(num)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={ic}
      value={raw}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
    />
  )
}

const ic = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent'
