'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Car, Users, MapPin, CalendarDays, TrendingUp, AlertTriangle } from 'lucide-react'

const PIE_COLORS = ['#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899']

interface MonthStat {
  month: string
  revenue: number
  expense: number
  profit: number
}

interface RouteStat {
  name: string
  revenue: number
  count: number
}

interface ExpensePie {
  name: string
  value: number
}

interface SummaryCard {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  // 요약 카드
  const [todayDispatches, setTodayDispatches] = useState(0)
  const [monthDispatches, setMonthDispatches] = useState(0)
  const [pendingSettlements, setPendingSettlements] = useState(0)
  const [vehicleCount, setVehicleCount] = useState(0)
  const [vehicleTotal, setVehicleTotal] = useState(0)
  const [employeeCount, setEmployeeCount] = useState(0)
  const [routeCount, setRouteCount] = useState(0)

  // 차트 데이터
  const [monthStats, setMonthStats] = useState<MonthStat[]>([])
  const [routeStats, setRouteStats] = useState<RouteStat[]>([])
  const [expensePie, setExpensePie] = useState<ExpensePie[]>([])

  // 오늘 배차 목록
  const [todayList, setTodayList] = useState<{ id: string; route: string; vehicle: string; driver: string; time: string | null; status: string }[]>([])

  // 차량 상태 분포
  const [vehicleStatusBreakdown, setVehicleStatusBreakdown] = useState<{ status: string; count: number }[]>([])

  // 이달 할부 출금 예정
  const [upcomingPayments, setUpcomingPayments] = useState<{ due_date: string; plate: string; amount: number; creditor: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const thisMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const thisMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

    // 병렬 조회
    const [
      { count: todayCnt },
      { count: monthCnt },
      { data: vehicles },
      { data: employees },
      { data: routes },
      { data: todayDispatch },
      { data: settlements },
      { data: ledger },
    ] = await Promise.all([
      supabase.from('dispatches').select('*', { count: 'exact', head: true }).eq('dispatch_date', today),
      supabase.from('dispatches').select('*', { count: 'exact', head: true })
        .gte('dispatch_date', thisMonthStart).lte('dispatch_date', thisMonthEnd),
      supabase.from('vehicles').select('id, status'),
      supabase.from('employees').select('id, status').eq('status', '재직'),
      supabase.from('routes').select('id, status').eq('status', 'active'),
      supabase.from('dispatches')
        .select('id, status, departure_time, routes(route_name), vehicles(plate_number), employees(name)')
        .eq('dispatch_date', today)
        .order('departure_time'),
      supabase.from('operation_settlements').select('id, dispatch_id'),
      supabase.from('ledger_entries').select('entry_date, income, expense, category'),
    ])

    setTodayDispatches(todayCnt ?? 0)
    setMonthDispatches(monthCnt ?? 0)
    setVehicleCount(vehicles?.filter((v) => v.status === '운행').length ?? 0)
    setVehicleTotal(vehicles?.length ?? 0)
    setEmployeeCount(employees?.length ?? 0)
    setRouteCount(routes?.length ?? 0)

    // 차량 상태 분포
    const statusMap: Record<string, number> = {}
    ;(vehicles ?? []).forEach((v: Record<string, string>) => {
      const s = v.status ?? '미설정'
      statusMap[s] = (statusMap[s] ?? 0) + 1
    })
    setVehicleStatusBreakdown(Object.entries(statusMap).map(([status, count]) => ({ status, count })))

    // 이달 할부 출금 예정
    const { data: upcoming } = await supabase
      .from('installment_schedule')
      .select('due_date, principal_interest, installments(creditor_name, vehicles(plate_number))')
      .like('due_date', `${format(new Date(), 'yyyy-MM')}%`)
      .eq('is_paid', false)
      .order('due_date')
    setUpcomingPayments(
      ((upcoming ?? []) as Record<string, unknown>[]).map((s) => {
        const inst = s.installments as Record<string, unknown> | null
        const veh = inst?.vehicles as Record<string, string> | null
        return {
          due_date: s.due_date as string,
          plate: veh?.plate_number ?? '-',
          amount: Number(s.principal_interest),
          creditor: (inst?.creditor_name as string) ?? '-',
        }
      })
    )

    // 오늘 배차 목록
    setTodayList(
      (todayDispatch ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        route: (d.routes as Record<string, string> | null)?.route_name ?? '-',
        vehicle: (d.vehicles as Record<string, string> | null)?.plate_number ?? '-',
        driver: (d.employees as Record<string, string> | null)?.name ?? '-',
        time: d.departure_time as string | null,
        status: d.status as string,
      }))
    )

    // 미정산 건수: 운행완료 배차 - 정산된 배차
    const settledIds = new Set((settlements ?? []).map((s: Record<string, string>) => s.dispatch_id).filter(Boolean))
    const { count: completedCnt } = await supabase
      .from('dispatches')
      .select('*', { count: 'exact', head: true })
      .eq('status', '운행완료')
    setPendingSettlements(Math.max(0, (completedCnt ?? 0) - settledIds.size))

    // 6개월 바차트
    const months: MonthStat[] = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const ym = format(d, 'yyyy-MM')
      const label = format(d, 'M월', { locale: ko })
      const monthEntries = (ledger ?? []).filter((e: Record<string, unknown>) =>
        (e.entry_date as string).startsWith(ym)
      )
      const revenue = monthEntries.reduce((s: number, e: Record<string, unknown>) => s + Number(e.income), 0)
      const expense = monthEntries.reduce((s: number, e: Record<string, unknown>) => s + Number(e.expense), 0)
      months.push({ month: label, revenue, expense, profit: revenue - expense })
    }
    setMonthStats(months)

    // 노선별 수익 (이번달 정산)
    const { data: routeSettlements } = await supabase
      .from('operation_settlements')
      .select('revenue, dispatches(routes(route_name))')
      .gte('settlement_month', format(new Date(), 'yyyy-MM'))

    const routeMap: Record<string, { revenue: number; count: number }> = {}
    ;(routeSettlements ?? []).forEach((s: Record<string, unknown>) => {
      const dispatch = s.dispatches as Record<string, unknown> | null
      const route = dispatch?.routes as Record<string, string> | null
      const name = route?.route_name ?? '미분류'
      if (!routeMap[name]) routeMap[name] = { revenue: 0, count: 0 }
      routeMap[name].revenue += Number(s.revenue)
      routeMap[name].count += 1
    })
    setRouteStats(
      Object.entries(routeMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6)
    )

    // 지출 파이 (이번달)
    const expMap: Record<string, number> = {}
    ;(ledger ?? [])
      .filter((e: Record<string, unknown>) => (e.entry_date as string).startsWith(format(new Date(), 'yyyy-MM')) && Number(e.expense) > 0)
      .forEach((e: Record<string, unknown>) => {
        const cat = (e.category as string) || '기타'
        expMap[cat] = (expMap[cat] ?? 0) + Number(e.expense)
      })
    setExpensePie(Object.entries(expMap).map(([name, value]) => ({ name, value })))

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const STATUS_STYLE: Record<string, string> = {
    '배차': 'bg-blue-100 text-blue-700',
    '운행완료': 'bg-green-100 text-green-700',
    '취소': 'bg-red-100 text-red-500',
  }

  const summaryCards: SummaryCard[] = [
    { label: '오늘 배차', value: todayDispatches + '건', icon: <CalendarDays size={20} />, color: 'bg-blue-500' },
    { label: '이번달 운행', value: monthDispatches + '건', icon: <TrendingUp size={20} />, color: 'bg-green-500' },
    { label: '미정산', value: pendingSettlements + '건', sub: '운행완료 미처리', icon: <AlertTriangle size={20} />, color: pendingSettlements > 0 ? 'bg-amber-500' : 'bg-gray-400' },
    { label: '운행 차량', value: vehicleCount + '대', sub: `전체 ${vehicleTotal}대`, icon: <Car size={20} />, color: 'bg-indigo-500' },
    { label: '재직 직원', value: employeeCount + '명', icon: <Users size={20} />, color: 'bg-purple-500' },
    { label: '운영 노선', value: routeCount + '개', icon: <MapPin size={20} />, color: 'bg-rose-500' },
  ]

  const fmt = (v: number) => `${(v / 10000).toFixed(0)}만`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">대시보드 데이터 불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 타이틀 */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">대시보드</h2>
        <p className="text-sm text-gray-500 mt-1">{format(new Date(), 'yyyy년 M월 d일 (eee)', { locale: ko })} 기준</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {summaryCards.map(({ label, value, sub, icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className={`w-10 h-10 rounded-xl ${color} text-white flex items-center justify-center mb-3`}>
              {icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
            {sub && <p className="text-xs text-amber-500 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* 차트 행 1: 6개월 바차트 + 노선별 수익 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 6개월 수익/지출 바차트 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-4">월별 수익·지출 (6개월)</h3>
          {monthStats.every((m) => m.revenue === 0 && m.expense === 0) ? (
            <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">
              출납부 데이터를 입력하면 차트가 표시됩니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthStats} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${Number(v).toLocaleString()}원`]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="수입" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="지출" fill="#F87171" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="순수익" fill="#34D399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 노선별 수익 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-4">이번달 노선별 수익</h3>
          {routeStats.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">
              이번달 운행 정산 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={routeStats} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${Number(v).toLocaleString()}원`]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="revenue" name="수익" fill="#6366F1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 차트 행 2-A: 차량 현황 + 이달 할부 출금 예정 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 차량 상태 분포 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-4">차량 현황</h3>
          {vehicleStatusBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-[140px] text-gray-400 text-sm">차량 데이터가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {vehicleStatusBreakdown.map(({ status, count }) => {
                const total = vehicleTotal || 1
                const pct = Math.round((count / total) * 100)
                const barColor = status === '운행' ? 'bg-blue-500' : status === '휴무' ? 'bg-amber-400' : 'bg-red-400'
                const textColor = status === '운행' ? 'text-blue-700' : status === '휴무' ? 'text-amber-700' : 'text-red-600'
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={`font-medium ${textColor}`}>{status}</span>
                      <span className="text-gray-600">{count}대 <span className="text-gray-400 text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 이달 할부 출금 예정 */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">
              이달 할부 출금 예정
              <span className="ml-2 text-sm font-normal text-gray-400">({upcomingPayments.length}건)</span>
            </h3>
            {upcomingPayments.length > 0 && (
              <span className="text-sm font-bold text-red-600">
                합계 {upcomingPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}원
              </span>
            )}
          </div>
          {upcomingPayments.length === 0 ? (
            <div className="flex items-center justify-center h-[140px] text-gray-400 text-sm">이달 납부 예정 없음</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['납부일', '차량', '거래처', '금액'].map((h) => (
                      <th key={h} className="pb-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {upcomingPayments.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2.5 text-gray-700 font-mono">{p.due_date}</td>
                      <td className="py-2.5 text-gray-700">{p.plate}</td>
                      <td className="py-2.5 text-gray-500">{p.creditor}</td>
                      <td className="py-2.5 font-medium text-red-600">{p.amount.toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 차트 행 2: 지출 파이 + 오늘 배차 목록 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 월별 지출 파이 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-4">이번달 지출 구성</h3>
          {expensePie.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              이번달 지출 데이터가 없습니다.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={expensePie}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expensePie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [`${Number(v).toLocaleString()}원`]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {expensePie.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-medium text-gray-700">{item.value.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 오늘 배차 현황 */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-4">
            오늘 배차 현황
            <span className="ml-2 text-sm font-normal text-gray-400">({todayList.length}건)</span>
          </h3>
          {todayList.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
              오늘 배차가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500">출발</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500">노선</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500">차량</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500">기사</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {todayList.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="py-2.5 text-gray-600 font-mono">{d.time ?? '-'}</td>
                      <td className="py-2.5 text-gray-700">{d.route}</td>
                      <td className="py-2.5 text-gray-700">{d.vehicle}</td>
                      <td className="py-2.5 text-gray-700">{d.driver}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
