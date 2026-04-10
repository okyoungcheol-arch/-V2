'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Wallet, ChevronLeft, ChevronRight } from 'lucide-react'

interface Settlement {
  id: string
  settlement_month: string
  base_salary: number
  route_allowance: number
  business_income_tax: number
  insurance_deduction: number
  dispatches: { dispatch_date: string; routes: { route_name: string } | null } | null
}

export default function EarningsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [driverName, setDriverName] = useState('')
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [month, setMonth] = useState(new Date())
  const [settlements, setSettlements] = useState<Settlement[]>([])

  const load = useCallback(async (targetMonth: Date, empId: string) => {
    setLoading(true)
    const ym = format(targetMonth, 'yyyy-MM')
    const { data } = await supabase
      .from('operation_settlements')
      .select('id, settlement_month, base_salary, route_allowance, business_income_tax, insurance_deduction, dispatches(dispatch_date, routes(route_name))')
      .eq('employee_id', empId)
      .like('settlement_month', `${ym}%`)
      .order('settlement_month')
    setSettlements((data ?? []) as unknown as Settlement[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: emp } = await supabase
        .from('employees')
        .select('id, name')
        .eq('auth_user_id', user.id)
        .single()
      if (!emp) return
      setDriverName(emp.name)
      setEmployeeId(emp.id)
      load(month, emp.id)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeMonth = (delta: number) => {
    const next = delta > 0 ? subMonths(month, -1) : subMonths(month, 1)
    setMonth(next)
    if (employeeId) load(next, employeeId)
  }

  const totalNet = settlements.reduce((s, r) => {
    const gross = (r.base_salary ?? 0) + (r.route_allowance ?? 0)
    const deduct = (r.business_income_tax ?? 0) + (r.insurance_deduction ?? 0)
    return s + gross - deduct
  }, 0)

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 카드 */}
      <div className="bg-[#1E40AF] text-white rounded-2xl p-5">
        <p className="text-blue-200 text-base">{driverName || '기사'} 님</p>
        <p className="text-2xl font-bold mt-1">수당 내역</p>

        {/* 월 선택 */}
        <div className="mt-4 flex items-center justify-between bg-white/20 rounded-xl px-4 py-2.5">
          <button onClick={() => changeMonth(-1)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-bold">
            {format(month, 'yyyy년 M월', { locale: ko })}
          </span>
          <button onClick={() => changeMonth(1)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* 이번달 합계 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Wallet size={20} className="text-[#1E40AF]" />
          </div>
          <div>
            <p className="text-sm text-gray-500">실수령 예상액</p>
            <p className="text-2xl font-bold text-gray-900">{totalNet.toLocaleString()}원</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-gray-400">불러오는 중...</p>
        </div>
      ) : settlements.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500 font-medium">이번달 정산 내역이 없습니다.</p>
          <p className="text-gray-400 text-sm mt-1">운행 완료 후 관리자가 정산하면 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((s) => {
            const gross = (s.base_salary ?? 0) + (s.route_allowance ?? 0)
            const deduct = (s.business_income_tax ?? 0) + (s.insurance_deduction ?? 0)
            const net = gross - deduct
            const routeName = (s.dispatches?.routes as { route_name: string } | null)?.route_name ?? '-'
            const dispatchDate = s.dispatches?.dispatch_date
              ? format(new Date(s.dispatches.dispatch_date), 'M/d (eee)', { locale: ko })
              : '-'
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900">{routeName}</p>
                    <p className="text-sm text-gray-400 mt-0.5">{dispatchDate}</p>
                  </div>
                  <p className="text-lg font-bold text-[#1E40AF]">{net.toLocaleString()}원</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-500 border-t border-gray-50 pt-3">
                  <span>기본급: {(s.base_salary ?? 0).toLocaleString()}원</span>
                  <span>수당: {(s.route_allowance ?? 0).toLocaleString()}원</span>
                  <span>소득세: -{(s.business_income_tax ?? 0).toLocaleString()}원</span>
                  <span>4대보험: -{(s.insurance_deduction ?? 0).toLocaleString()}원</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
