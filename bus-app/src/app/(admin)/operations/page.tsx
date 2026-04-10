'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  OperationSettlement, OperationSettlementInsert, OperationSettlementUpdate,
  Dispatch, Vehicle, Employee, Route,
} from '@/types/database'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import Decimal from 'decimal.js'
import { format } from 'date-fns'
import { Plus, Pencil, Trash2, X, Zap, Users, MapPin, BarChart2 } from 'lucide-react'

type TabType = 'settlement' | 'payroll' | 'route'

// ── 정산 계산 (Decimal.js — 부동소수점 오차 방지) ──
function calcSettlement(revenue: number, driverAllowance: number, fuelCost: number, tollCost: number, otherCost: number) {
  const r = new Decimal(revenue)
  const da = new Decimal(driverAllowance)
  const fc = new Decimal(fuelCost)
  const tc = new Decimal(tollCost)
  const oc = new Decimal(otherCost)
  // 사업소득세: 기사수당의 3.3%
  const incomeTax = da.mul(new Decimal('0.033')).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
  // 4대보험: 기사수당의 9.4%
  const insuranceFee = da.mul(new Decimal('0.094')).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
  const netProfit = r.minus(da).minus(fc).minus(tc).minus(oc).minus(incomeTax).minus(insuranceFee)
  return {
    income_tax: incomeTax.toNumber(),
    insurance_fee: insuranceFee.toNumber(),
    net_profit: netProfit.toNumber(),
  }
}

const EMPTY_FORM: OperationSettlementInsert = {
  dispatch_id: null,
  operation_date: format(new Date(), 'yyyy-MM-dd'),
  vehicle_id: null,
  driver_id: null,
  settlement_month: format(new Date(), 'yyyy-MM'),
  revenue: 0,
  driver_allowance: 0,
  fuel_cost: 0,
  toll_cost: 0,
  income_tax: 0,
  insurance_fee: 0,
  other_cost: 0,
  net_profit: 0,
  notes: '',
}

const ic = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function won(v: number) {
  return v.toLocaleString() + '원'
}

export default function OperationsPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<TabType>('settlement')
  const [settlements, setSettlements] = useState<OperationSettlement[]>([])
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Employee[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<OperationSettlement | null>(null)
  const [form, setForm] = useState<OperationSettlementInsert>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'))

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: d }, { data: v }, { data: e }, { data: r }] = await Promise.all([
      supabase
        .from('operation_settlements')
        .select('*, vehicles(id,plate_number), employees(id,name)')
        .order('operation_date', { ascending: false }),
      supabase
        .from('dispatches')
        .select('*, routes(id,route_code,route_name), vehicles(id,plate_number), employees(id,name)')
        .eq('status', '운행완료')
        .order('dispatch_date', { ascending: false }),
      supabase.from('vehicles').select('*').order('plate_number'),
      supabase.from('employees').select('*').eq('status', '재직').order('name'),
      supabase.from('routes').select('*').order('route_code'),
    ])
    setSettlements((s ?? []) as OperationSettlement[])
    setDispatches((d ?? []) as Dispatch[])
    setVehicles((v ?? []) as Vehicle[])
    setDrivers((e ?? []) as Employee[])
    setRoutes((r ?? []) as Route[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // 수치 변경 시 자동 계산
  function recalc(next: Partial<OperationSettlementInsert>) {
    const merged = { ...form, ...next }
    const { income_tax, insurance_fee, net_profit } = calcSettlement(
      Number(merged.revenue),
      Number(merged.driver_allowance),
      Number(merged.fuel_cost),
      Number(merged.toll_cost),
      Number(merged.other_cost),
    )
    setForm({ ...merged, income_tax, insurance_fee, net_profit })
  }

  // 배차 선택 시 차량·기사·수익·수당 자동 채움
  function handleDispatchChange(dispatchId: string) {
    const d = dispatches.find((d) => d.id === dispatchId)
    if (!d) { setForm({ ...form, dispatch_id: null }); return }
    const route = routes.find((r) => r.id === d.route_id)
    const revenue = route?.fare_amount ?? 0
    const driverAllowance = route?.driver_allowance ?? 0
    const { income_tax, insurance_fee, net_profit } = calcSettlement(revenue, driverAllowance, 0, 0, 0)
    setForm({
      ...form,
      dispatch_id: dispatchId,
      operation_date: d.dispatch_date,
      vehicle_id: d.vehicle_id,
      driver_id: d.driver_id,
      settlement_month: d.dispatch_date.slice(0, 7),
      revenue,
      driver_allowance: driverAllowance,
      fuel_cost: 0,
      toll_cost: 0,
      other_cost: 0,
      income_tax,
      insurance_fee,
      net_profit,
    })
  }

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true)
  }

  function openEdit(row: OperationSettlement) {
    setEditing(row)
    setForm({
      dispatch_id: row.dispatch_id,
      operation_date: row.operation_date,
      vehicle_id: row.vehicle_id,
      driver_id: row.driver_id,
      settlement_month: row.settlement_month,
      revenue: row.revenue,
      driver_allowance: row.driver_allowance,
      fuel_cost: row.fuel_cost,
      toll_cost: row.toll_cost,
      income_tax: row.income_tax,
      insurance_fee: row.insurance_fee,
      other_cost: row.other_cost,
      net_profit: row.net_profit,
      notes: row.notes ?? '',
    })
    setError(''); setModalOpen(true)
  }

  async function handleDelete(row: OperationSettlement) {
    if (!confirm('이 정산 내역을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('operation_settlements').delete().eq('id', row.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    load()
  }

  // 운행완료 배차 자동 정산
  async function handleAutoSettle() {
    const settled = new Set(settlements.map((s) => s.dispatch_id).filter(Boolean))
    const unsettled = dispatches.filter((d) => !settled.has(d.id))
    if (unsettled.length === 0) { alert('새로 정산할 운행완료 배차가 없습니다.'); return }

    let count = 0
    for (const d of unsettled) {
      const route = routes.find((r) => r.id === d.route_id)
      const revenue = route?.fare_amount ?? 0
      const driverAllowance = route?.driver_allowance ?? 0
      const { income_tax, insurance_fee, net_profit } = calcSettlement(revenue, driverAllowance, 0, 0, 0)
      const { error } = await supabase.from('operation_settlements').insert({
        dispatch_id: d.id,
        operation_date: d.dispatch_date,
        vehicle_id: d.vehicle_id,
        driver_id: d.driver_id,
        settlement_month: d.dispatch_date.slice(0, 7),
        revenue,
        driver_allowance: driverAllowance,
        fuel_cost: 0,
        toll_cost: 0,
        income_tax,
        insurance_fee,
        other_cost: 0,
        net_profit,
      })
      if (!error) count++
    }
    alert(`${count}건 자동 정산 완료`)
    load()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload: OperationSettlementInsert = {
        ...form,
        revenue: Number(form.revenue),
        driver_allowance: Number(form.driver_allowance),
        fuel_cost: Number(form.fuel_cost),
        toll_cost: Number(form.toll_cost),
        other_cost: Number(form.other_cost),
        income_tax: Number(form.income_tax),
        insurance_fee: Number(form.insurance_fee),
        net_profit: Number(form.net_profit),
        dispatch_id: form.dispatch_id || null,
        vehicle_id: form.vehicle_id || null,
        driver_id: form.driver_id || null,
        notes: form.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('operation_settlements').update(payload as OperationSettlementUpdate).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('operation_settlements').insert(payload)
        if (error) throw error
      }
      setModalOpen(false); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // 월 필터 적용
  const filtered = useMemo(
    () => settlements.filter((s) => !filterMonth || s.settlement_month === filterMonth),
    [settlements, filterMonth]
  )

  // 월 합계
  const monthTotal = useMemo(() => filtered.reduce(
    (acc, s) => ({
      revenue: acc.revenue + s.revenue,
      driver_allowance: acc.driver_allowance + s.driver_allowance,
      fuel_cost: acc.fuel_cost + s.fuel_cost,
      toll_cost: acc.toll_cost + s.toll_cost,
      other_cost: acc.other_cost + s.other_cost,
      income_tax: acc.income_tax + s.income_tax,
      insurance_fee: acc.insurance_fee + s.insurance_fee,
      net_profit: acc.net_profit + s.net_profit,
      count: acc.count + 1,
    }),
    { revenue: 0, driver_allowance: 0, fuel_cost: 0, toll_cost: 0, other_cost: 0, income_tax: 0, insurance_fee: 0, net_profit: 0, count: 0 }
  ), [filtered])

  // ── Tab 2: 기사별 급여 정산 ──
  const driverPayroll = useMemo(() => {
    const map = new Map<string, {
      driverId: string
      driverName: string
      monthlySalary: number
      count: number
      totalAllowance: number
      totalIncomeTax: number
      totalInsurance: number
      netAllowance: number
      totalPay: number
    }>()

    filtered.forEach((s) => {
      if (!s.driver_id) return
      const driver = drivers.find((d) => d.id === s.driver_id)
      if (!driver) return

      const existing = map.get(s.driver_id) ?? {
        driverId: s.driver_id,
        driverName: driver.name,
        monthlySalary: driver.monthly_salary ?? 0,
        count: 0,
        totalAllowance: 0,
        totalIncomeTax: 0,
        totalInsurance: 0,
        netAllowance: 0,
        totalPay: 0,
      }
      existing.count++
      existing.totalAllowance += s.driver_allowance
      existing.totalIncomeTax += s.income_tax
      existing.totalInsurance += s.insurance_fee
      existing.netAllowance = existing.totalAllowance - existing.totalIncomeTax - existing.totalInsurance
      existing.totalPay = existing.monthlySalary + existing.netAllowance
      map.set(s.driver_id, existing)
    })

    return Array.from(map.values()).sort((a, b) => b.totalAllowance - a.totalAllowance)
  }, [filtered, drivers])

  // ── Tab 3: 노선별 단가 분석 ──
  const routeAnalysis = useMemo(() => {
    const dispatchMap = new Map(dispatches.map((d) => [d.id, d]))
    const routeMap = new Map(routes.map((r) => [r.id, r]))

    const map = new Map<string, {
      routeCode: string
      routeName: string
      count: number
      totalRevenue: number
      totalAllowance: number
      totalFuel: number
      totalToll: number
      totalOther: number
      totalIncomeTax: number
      totalInsurance: number
      netProfit: number
    }>()

    filtered.forEach((s) => {
      const dispatch = s.dispatch_id ? dispatchMap.get(s.dispatch_id) : null
      const route = dispatch?.route_id ? routeMap.get(dispatch.route_id) : null
      const key = route?.id ?? '__manual__'

      const existing = map.get(key) ?? {
        routeCode: route?.route_code ?? '직접입력',
        routeName: route?.route_name ?? '직접 입력된 정산',
        count: 0,
        totalRevenue: 0,
        totalAllowance: 0,
        totalFuel: 0,
        totalToll: 0,
        totalOther: 0,
        totalIncomeTax: 0,
        totalInsurance: 0,
        netProfit: 0,
      }
      existing.count++
      existing.totalRevenue += s.revenue
      existing.totalAllowance += s.driver_allowance
      existing.totalFuel += s.fuel_cost
      existing.totalToll += s.toll_cost
      existing.totalOther += s.other_cost
      existing.totalIncomeTax += s.income_tax
      existing.totalInsurance += s.insurance_fee
      existing.netProfit += s.net_profit
      map.set(key, existing)
    })

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [filtered, dispatches, routes])

  // dispatch id → route 이름 조회 (Tab 1 테이블용)
  const dispatchRouteLabel = useCallback((dispatchId: string | null) => {
    if (!dispatchId) return '-'
    const d = dispatches.find((d) => d.id === dispatchId)
    if (!d?.route_id) return '-'
    const r = routes.find((r) => r.id === d.route_id)
    return r ? `${r.route_code} ${r.route_name}` : '-'
  }, [dispatches, routes])

  const settlementColumns: Column<OperationSettlement>[] = [
    { key: 'operation_date', label: '운행일', sortable: true },
    { key: 'dispatch_id', label: '노선', render: (_, r) => dispatchRouteLabel(r.dispatch_id) },
    { key: 'vehicle_id', label: '차량', render: (_, r) => r.vehicles?.plate_number ?? '-' },
    { key: 'driver_id', label: '기사', render: (_, r) => r.employees?.name ?? '-' },
    { key: 'revenue', label: '운행수익', render: (v) => won(Number(v)) },
    { key: 'driver_allowance', label: '기사수당', render: (v) => won(Number(v)) },
    { key: 'fuel_cost', label: '유류비', render: (v) => won(Number(v)) },
    { key: 'toll_cost', label: '통행료', render: (v) => won(Number(v)) },
    { key: 'income_tax', label: '소득세', render: (v) => won(Number(v)) },
    { key: 'insurance_fee', label: '4대보험', render: (v) => won(Number(v)) },
    {
      key: 'net_profit', label: '순수익',
      render: (v) => (
        <span className={Number(v) >= 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
          {won(Number(v))}
        </span>
      ),
    },
  ]

  return (
    <div className="p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">운행 정산</h2>
          <p className="text-sm text-gray-500 mt-1">운행결과 정산 · 기사 급여 · 노선별 단가 분석</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoSettle}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm border border-amber-400 text-amber-700 rounded-xl hover:bg-amber-50 min-h-[44px]"
          >
            <Zap size={15} /> 자동 정산
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 min-h-[44px]"
          >
            <Plus size={16} /> 수동 등록
          </button>
        </div>
      </div>

      {/* 월 필터 */}
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm font-medium text-gray-600">정산월</label>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
        />
      </div>

      {/* 요약 카드 (8개) */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: '총 운행', value: `${monthTotal.count}건`, color: 'text-blue-700' },
          { label: '총 수익', value: won(monthTotal.revenue), color: 'text-blue-700' },
          { label: '수당 합계', value: won(monthTotal.driver_allowance), color: 'text-gray-700' },
          { label: '유류비', value: won(monthTotal.fuel_cost), color: 'text-orange-600' },
          { label: '통행료', value: won(monthTotal.toll_cost), color: 'text-orange-600' },
          { label: '소득세', value: won(monthTotal.income_tax), color: 'text-amber-600' },
          { label: '4대보험', value: won(monthTotal.insurance_fee), color: 'text-amber-600' },
          { label: '순수익', value: won(monthTotal.net_profit), color: monthTotal.net_profit >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* 탭 선택 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
        {[
          { value: 'settlement', label: '운행정산 목록', icon: BarChart2 },
          { value: 'payroll', label: '기사 급여 정산', icon: Users },
          { value: 'route', label: '노선별 단가 분석', icon: MapPin },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value as TabType)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === value
                ? 'bg-white text-[#1E40AF] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <>
          {/* ── Tab 1: 운행정산 목록 ── */}
          {activeTab === 'settlement' && (
            <StandardDataTable
              data={filtered}
              columns={settlementColumns}
              searchKeys={['operation_date', 'settlement_month']}
              searchPlaceholder="날짜, 정산월 검색"
              emptyMessage="정산 내역이 없습니다. '자동 정산' 버튼을 눌러보세요."
              actions={(row) => (
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(row)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              )}
            />
          )}

          {/* ── Tab 2: 기사 급여 정산 ── */}
          {activeTab === 'payroll' && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">{filterMonth} 기사별 급여 정산</p>
                <p className="text-xs text-gray-500 mt-0.5">기본월급 + 운행수당(소득세·4대보험 공제 후) = 총 지급액</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">기사명</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">운행횟수</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">기본월급</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">운행수당 합계</th>
                      <th className="text-right px-4 py-3 font-medium text-amber-600">소득세 (3.3%)</th>
                      <th className="text-right px-4 py-3 font-medium text-amber-600">4대보험 (9.4%)</th>
                      <th className="text-right px-4 py-3 font-medium text-green-700">실수령 수당</th>
                      <th className="text-right px-4 py-3 font-bold text-[#1E40AF]">총 지급액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverPayroll.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-14 text-gray-400">
                          해당 월 정산 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      driverPayroll.map((dp) => (
                        <tr key={dp.driverId} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{dp.driverName}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{dp.count}회</td>
                          <td className="px-4 py-3 text-right text-gray-700">{won(dp.monthlySalary)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{won(dp.totalAllowance)}</td>
                          <td className="px-4 py-3 text-right text-amber-600">-{won(dp.totalIncomeTax)}</td>
                          <td className="px-4 py-3 text-right text-amber-600">-{won(dp.totalInsurance)}</td>
                          <td className="px-4 py-3 text-right font-medium text-green-700">{won(dp.netAllowance)}</td>
                          <td className="px-4 py-3 text-right font-bold text-[#1E40AF]">{won(dp.totalPay)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {driverPayroll.length > 0 && (
                    <tfoot>
                      <tr className="bg-blue-50 border-t-2 border-blue-200">
                        <td className="px-4 py-3 font-bold text-gray-900">합계</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {driverPayroll.reduce((a, b) => a + b.count, 0)}회
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {won(driverPayroll.reduce((a, b) => a + b.monthlySalary, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {won(driverPayroll.reduce((a, b) => a + b.totalAllowance, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600">
                          -{won(driverPayroll.reduce((a, b) => a + b.totalIncomeTax, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600">
                          -{won(driverPayroll.reduce((a, b) => a + b.totalInsurance, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-700">
                          {won(driverPayroll.reduce((a, b) => a + b.netAllowance, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#1E40AF]">
                          {won(driverPayroll.reduce((a, b) => a + b.totalPay, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ── Tab 3: 노선별 단가 분석 ── */}
          {activeTab === 'route' && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">{filterMonth} 노선별 수익 · 단가 분석</p>
                <p className="text-xs text-gray-500 mt-0.5">건당 단가 = 총수익 ÷ 운행횟수 / 건당 비용 = (수당+유류+통행료+세금) ÷ 운행횟수</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">노선</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">운행횟수</th>
                      <th className="text-right px-4 py-3 font-medium text-blue-600">총수익</th>
                      <th className="text-right px-4 py-3 font-medium text-orange-600">총비용</th>
                      <th className="text-right px-4 py-3 font-medium text-green-700">총순수익</th>
                      <th className="text-right px-4 py-3 font-medium text-blue-600 bg-blue-50">건당 단가</th>
                      <th className="text-right px-4 py-3 font-medium text-orange-600 bg-orange-50">건당 비용</th>
                      <th className="text-right px-4 py-3 font-medium text-green-700 bg-green-50">건당 순이익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeAnalysis.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-14 text-gray-400">
                          해당 월 정산 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      routeAnalysis.map((ra, i) => {
                        const totalCost = ra.totalAllowance + ra.totalFuel + ra.totalToll + ra.totalOther + ra.totalIncomeTax + ra.totalInsurance
                        const unitPrice = ra.count > 0 ? Math.round(ra.totalRevenue / ra.count) : 0
                        const unitCost = ra.count > 0 ? Math.round(totalCost / ra.count) : 0
                        const unitProfit = ra.count > 0 ? Math.round(ra.netProfit / ra.count) : 0
                        return (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{ra.routeCode}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{ra.routeName}</p>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">{ra.count}회</td>
                            <td className="px-4 py-3 text-right text-blue-700">{won(ra.totalRevenue)}</td>
                            <td className="px-4 py-3 text-right text-orange-600">{won(totalCost)}</td>
                            <td className={`px-4 py-3 text-right font-medium ${ra.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {won(ra.netProfit)}
                            </td>
                            <td className="px-4 py-3 text-right bg-blue-50 font-semibold text-blue-700">{won(unitPrice)}</td>
                            <td className="px-4 py-3 text-right bg-orange-50 font-semibold text-orange-600">{won(unitCost)}</td>
                            <td className={`px-4 py-3 text-right bg-green-50 font-bold ${unitProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {won(unitProfit)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {routeAnalysis.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-300">
                        <td className="px-4 py-3 font-bold text-gray-900">합계</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {routeAnalysis.reduce((a, b) => a + b.count, 0)}회
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">
                          {won(routeAnalysis.reduce((a, b) => a + b.totalRevenue, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600">
                          {won(routeAnalysis.reduce((a, b) => a + b.totalAllowance + b.totalFuel + b.totalToll + b.totalOther + b.totalIncomeTax + b.totalInsurance, 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-700">
                          {won(routeAnalysis.reduce((a, b) => a + b.netProfit, 0))}
                        </td>
                        <td className="px-4 py-3 bg-blue-50" />
                        <td className="px-4 py-3 bg-orange-50" />
                        <td className="px-4 py-3 bg-green-50" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 등록/수정 모달 ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{editing ? '정산 수정' : '정산 등록'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* 배차 연결 */}
              <Field label="운행완료 배차 연결 (선택)">
                <select
                  className={ic}
                  value={form.dispatch_id ?? ''}
                  onChange={(e) => handleDispatchChange(e.target.value)}
                >
                  <option value="">직접 입력</option>
                  {dispatches.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.dispatch_date} · {d.routes?.route_code} · {d.vehicles?.plate_number} · {d.employees?.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="운행일 *">
                  <input type="date" className={ic} value={form.operation_date} onChange={(e) => setForm({ ...form, operation_date: e.target.value })} required />
                </Field>
                <Field label="정산월 *">
                  <input type="month" className={ic} value={form.settlement_month} onChange={(e) => setForm({ ...form, settlement_month: e.target.value })} required />
                </Field>
                <Field label="차량">
                  <select className={ic} value={form.vehicle_id ?? ''} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value || null })}>
                    <option value="">선택</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                  </select>
                </Field>
                <Field label="기사">
                  <select className={ic} value={form.driver_id ?? ''} onChange={(e) => setForm({ ...form, driver_id: e.target.value || null })}>
                    <option value="">선택</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              </div>

              {/* 금액 입력 — 변경 시 자동 재계산 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">금액 (원) — 변경 시 자동 계산</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'revenue', label: '운행수익' },
                    { key: 'driver_allowance', label: '기사수당' },
                    { key: 'fuel_cost', label: '유류비' },
                    { key: 'toll_cost', label: '통행료' },
                    { key: 'other_cost', label: '기타비용' },
                  ].map(({ key, label }) => (
                    <Field key={key} label={label}>
                      <input
                        type="number"
                        className={ic}
                        value={(form as unknown as Record<string, number>)[key]}
                        onChange={(e) => recalc({ [key]: Number(e.target.value) })}
                        min={0}
                      />
                    </Field>
                  ))}
                </div>
                {/* 자동 계산 결과 */}
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">소득세 (3.3%)</p>
                    <p className="text-sm font-bold text-amber-600 mt-1">{won(Number(form.income_tax))}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">4대보험 (9.4%)</p>
                    <p className="text-sm font-bold text-amber-600 mt-1">{won(Number(form.insurance_fee))}</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${Number(form.net_profit) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-500">순수익</p>
                    <p className={`text-sm font-bold mt-1 ${Number(form.net_profit) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {won(Number(form.net_profit))}
                    </p>
                  </div>
                </div>
              </div>

              <Field label="비고">
                <textarea className={ic + ' resize-none'} rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>

              {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 disabled:opacity-50 min-h-[44px]">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
