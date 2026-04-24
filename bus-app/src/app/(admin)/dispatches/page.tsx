'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, addDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Pencil, Trash2, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

/* ─────────────────────── Types ─────────────────────── */
type DaySummary = {
  date: string
  registered: boolean
  dispatchCount: number
  vehicleCount: number
  confirmedCount: number
}

type StagedRow = {
  tempId: string
  operation_date: string
  route_code: string
  departure_time: string
  origin: string
  plate_number: string
  driver_name: string
  change_reason: string
  fare_amount: number
  driver_allowance: number
  vat_included: boolean
  operation_days: number
  notes: string
}

type DbDispatch = {
  id: string
  operation_date: string
  route_code: string | null
  departure_time: string | null
  origin: string | null
  plate_number: string | null
  driver_name: string | null
  change_reason: string | null
  fare_amount: number
  driver_allowance: number
  vat_included: boolean
  operation_days: number
  status: string | null
  notes: string | null
}

type RouteRow = {
  id: string
  route_code: string
  route_name: string
  day_type: string
  fare_amount: number
  driver_allowance: number
  plate_number: string | null
  driver_name: string | null
  origin: string | null
  destination: string | null
  default_departure_time: string | null
}

// dispatches + routes 조인 결과
type EnrichedDispatch = {
  id: string
  operation_date: string
  route_code: string | null
  departure_time: string | null  // routes.default_departure_time
  origin: string | null          // routes.origin
  destination: string | null     // routes.destination
  plate_number: string | null    // dispatches.plate_number
  driver_name: string | null     // dispatches.driver_name
  change_reason: string | null   // dispatches.change_reason
}

/* ─────────────────────── Sort Types ─────────────────────── */
type SortDir     = 'asc' | 'desc'
type SummarySort  = { key: keyof DaySummary;       dir: SortDir }
type EnrichedSort = { key: keyof EnrichedDispatch; dir: SortDir }
type StagedSort   = { key: keyof StagedRow;        dir: SortDir }

/* ─────────────────────── Constants ─────────────────────── */
const DAY_TYPES        = ['평일', '토요일A', '토요일B', '일요일A', '일요일B', '매일']
const SAVED_PLATES_KEY = 'bus_saved_plates'

const EMPTY_TOUR: Omit<StagedRow, 'tempId'> = {
  operation_date: format(new Date(), 'yyyy-MM-dd'),
  route_code: 'R-일일',
  departure_time: '',
  origin: '',
  plate_number: '',
  driver_name: '',
  change_reason: '',
  fare_amount: 0,
  driver_allowance: 0,
  vat_included: false,
  operation_days: 1,
  notes: '',
}

const EMPTY_DB_EDIT: Omit<DbDispatch, 'id'> = {
  operation_date: '',
  route_code: null,
  departure_time: null,
  origin: null,
  plate_number: null,
  driver_name: null,
  change_reason: null,
  fare_amount: 0,
  driver_allowance: 0,
  vat_included: false,
  operation_days: 1,
  status: '배차',
  notes: null,
}

/* ─────────────────────── Component ─────────────────────── */
export default function DispatchesPage() {
  const supabase = createClient()

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(new Date(), i), 'yyyy-MM-dd')),
    []
  )

  // 7일 요약
  const [summaries, setSummaries]   = useState<DaySummary[]>([])
  const [loading, setLoading]       = useState(true)

  // 하단 모드: staged = 신규입력, db = 기존조회
  const [viewMode, setViewMode]         = useState<'staged' | 'db'>('staged')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // staged 모드
  const [staged, setStaged]   = useState<StagedRow[]>([])
  const [saving, setSaving]   = useState(false)

  // db 모드
  const [dbDispatches, setDbDispatches] = useState<DbDispatch[]>([])
  const [dbLoading, setDbLoading]       = useState(false)
  const [checkedIds, setCheckedIds]     = useState<Set<string>>(new Set())

  // 노선 목록
  const [routes, setRoutes] = useState<RouteRow[]>([])

  // 차량번호별 운행 패널
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [savedPlates, setSavedPlates]   = useState<string[]>([])

  // 정기 팝업
  const [regularOpen, setRegularOpen]       = useState(false)
  const [regularDate, setRegularDate]       = useState(weekDates[0])
  const [regularDayType, setRegularDayType] = useState('평일')

  // 관광 팝업
  const [tourOpen, setTourOpen]   = useState(false)
  const [tourForm, setTourForm]   = useState<Omit<StagedRow, 'tempId'>>(EMPTY_TOUR)

  // staged 수정 팝업
  const [editOpen, setEditOpen]     = useState(false)
  const [editTarget, setEditTarget] = useState<StagedRow | null>(null)
  const [editForm, setEditForm]     = useState<Omit<StagedRow, 'tempId'>>(EMPTY_TOUR)

  // DB 수정 팝업
  const [dbEditOpen, setDbEditOpen]     = useState(false)
  const [dbEditTarget, setDbEditTarget] = useState<DbDispatch | null>(null)
  const [dbEditForm, setDbEditForm]     = useState<Omit<DbDispatch, 'id'>>(EMPTY_DB_EDIT)

  // 정렬 상태
  const [summarySort, setSummarySort] = useState<SummarySort>({ key: 'date', dir: 'asc' })
  const [dbSort, setDbSort]           = useState<EnrichedSort>({ key: 'departure_time', dir: 'asc' })
  const [stagedSort, setStagedSort]   = useState<StagedSort>({ key: 'route_code', dir: 'asc' })

  // 저장된 차량번호 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_PLATES_KEY)
      if (saved) setSavedPlates(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  /* ── 정렬 토글 헬퍼 ── */
  function toggleSort<T extends { key: string; dir: SortDir }>(
    current: T, key: T['key'], setter: (v: T) => void
  ) {
    setter({ ...current, key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' } as T)
  }

  /* ── enriched dispatches (routes 클라이언트 조인) ── */
  const enrichedDispatches = useMemo<EnrichedDispatch[]>(() =>
    dbDispatches.map((d) => {
      const route = routes.find((r) => r.route_code === d.route_code)
      return {
        id:             d.id,
        operation_date: d.operation_date,
        route_code:     d.route_code,
        departure_time: d.departure_time ?? route?.default_departure_time ?? null,
        origin:         d.origin ?? route?.origin ?? null,
        destination:    route?.destination ?? null,
        plate_number:   d.plate_number,
        driver_name:    d.driver_name,
        change_reason:  d.change_reason,
      }
    }),
    [dbDispatches, routes]
  )

  /* ── 정렬된 데이터 ── */
  const sortedSummaries = useMemo(() => {
    const { key, dir } = summarySort
    return [...summaries].sort((a, b) => {
      const va = a[key] ?? 0, vb = b[key] ?? 0
      if (va < vb) return dir === 'asc' ? -1 : 1
      if (va > vb) return dir === 'asc' ? 1 : -1
      return 0
    })
  }, [summaries, summarySort])

  const sortedDbDispatches = useMemo(() => {
    const { key, dir } = dbSort
    return [...enrichedDispatches].sort((a, b) => {
      const va = a[key] ?? '', vb = b[key] ?? ''
      if (va < vb) return dir === 'asc' ? -1 : 1
      if (va > vb) return dir === 'asc' ? 1 : -1
      return 0
    })
  }, [enrichedDispatches, dbSort])

  const sortedStaged = useMemo(() => {
    const { key, dir } = stagedSort
    return [...staged].sort((a, b) => {
      const va = a[key] ?? '', vb = b[key] ?? ''
      if (va < vb) return dir === 'asc' ? -1 : 1
      if (va > vb) return dir === 'asc' ? 1 : -1
      return 0
    })
  }, [staged, stagedSort])

  /* ── 차량번호별 운행 데이터 ── */
  const vehicleRows = useMemo(() => {
    if (!vehiclePlate.trim() || !selectedDate) return []
    const term = vehiclePlate.trim().toLowerCase()
    return enrichedDispatches
      .filter((d) => (d.plate_number ?? '').toLowerCase().includes(term))
      .sort((a, b) => (a.departure_time ?? '').localeCompare(b.departure_time ?? ''))
  }, [enrichedDispatches, vehiclePlate, selectedDate])

  /* ── 콤보 옵션: 배차된 차량번호 + 저장된 차량번호 ── */
  const plateOptions = useMemo(() => {
    const dispatched = [...new Set(dbDispatches.map((d) => d.plate_number).filter(Boolean) as string[])]
    return [...new Set([...dispatched, ...savedPlates])].sort()
  }, [dbDispatches, savedPlates])

  /* ── 차량번호 저장 ── */
  function handleSavePlate() {
    if (!vehiclePlate.trim()) return
    const next = [vehiclePlate.trim(), ...savedPlates.filter((p) => p !== vehiclePlate.trim())].slice(0, 10)
    setSavedPlates(next)
    try { localStorage.setItem(SAVED_PLATES_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  /* ── 7일 요약 로드 ── */
  const loadSummaries = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('dispatches')
      .select('id, operation_date, plate_number, driver_id, created_at, employees(last_login_at)')
      .gte('operation_date', weekDates[0])
      .lte('operation_date', weekDates[6])

    type RawRow = {
      id: string
      operation_date: string
      plate_number: string | null
      driver_id: string | null
      created_at: string
      employees: { last_login_at: string | null } | null
    }
    const rows = (data ?? []) as unknown as RawRow[]

    setSummaries(
      weekDates.map((date) => {
        const dayRows = rows.filter((r) => r.operation_date === date)
        const plates  = new Set(dayRows.map((r) => r.plate_number).filter(Boolean) as string[])
        const confirmedPlates = new Set<string>()
        dayRows.forEach((r) => {
          if (r.plate_number && r.employees?.last_login_at && r.created_at && r.employees.last_login_at > r.created_at) {
            confirmedPlates.add(r.plate_number)
          }
        })
        return {
          date,
          registered:     dayRows.length > 0,
          dispatchCount:  dayRows.length,
          vehicleCount:   plates.size,
          confirmedCount: confirmedPlates.size,
        }
      })
    )
    setLoading(false)
  }, [supabase, weekDates])

  /* ── 노선 로드 ── */
  const loadRoutes = useCallback(async () => {
    const { data, error } = await supabase
      .from('routes')
      .select('id, route_code, route_name, day_type, fare_amount, driver_allowance, plate_number, driver_name, origin, destination, default_departure_time')
      .order('route_code')
    if (error) console.error('routes 로드 오류:', error)
    setRoutes((data ?? []) as RouteRow[])
  }, [supabase])

  /* ── 특정 날짜 배차 로드 ── */
  const loadDispatchesByDate = useCallback(async (date: string) => {
    setDbLoading(true)
    setCheckedIds(new Set())
    const { data, error } = await supabase
      .from('dispatches')
      .select('id, operation_date, route_code, departure_time, origin, plate_number, driver_name, change_reason, fare_amount, driver_allowance, vat_included, operation_days, status, notes')
      .eq('operation_date', date)
      .order('route_code')
    if (error) console.error('dispatches 로드 오류:', error)
    setDbDispatches((data ?? []) as DbDispatch[])
    setSelectedDate(date)
    setViewMode('db')
    setDbLoading(false)
  }, [supabase])

  useEffect(() => {
    loadSummaries()
    loadRoutes()
  }, [loadSummaries, loadRoutes])

  /* ── 요약 행 클릭 ── */
  function handleSummaryRowClick(s: DaySummary) {
    if (s.registered) {
      loadDispatchesByDate(s.date)
    } else {
      setSelectedDate(s.date)
      setRegularDate(s.date)
      setTourForm({ ...EMPTY_TOUR, operation_date: s.date })
      setViewMode('staged')
      setDbDispatches([])
    }
  }

  /* ── DB 행 체크 토글 ── */
  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCheckAll() {
    if (checkedIds.size === dbDispatches.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(dbDispatches.map((r) => r.id)))
  }

  /* ── DB 선택 삭제 ── */
  async function handleDbDelete() {
    if (checkedIds.size === 0) { alert('삭제할 항목을 선택하세요.'); return }
    if (!confirm(`선택한 ${checkedIds.size}건을 삭제하시겠습니까?`)) return
    const ids = Array.from(checkedIds)
    const { error } = await supabase.from('dispatches').delete().in('id', ids)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setDbDispatches((prev) => prev.filter((r) => !checkedIds.has(r.id)))
    setCheckedIds(new Set())
    loadSummaries()
    const remaining = dbDispatches.filter((r) => !ids.includes(r.id))
    if (remaining.length === 0) { setViewMode('staged'); setSelectedDate(null); setDbDispatches([]) }
  }

  /* ── DB 행 개별 삭제 ── */
  async function handleDbRowDelete(id: string) {
    if (!confirm('이 배차를 삭제하시겠습니까?')) return
    const { error } = await supabase.from('dispatches').delete().eq('id', id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    const next = dbDispatches.filter((r) => r.id !== id)
    setDbDispatches(next)
    setCheckedIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    loadSummaries()
    if (next.length === 0) { setViewMode('staged'); setSelectedDate(null) }
  }

  /* ── 정기 확인 ── */
  function handleRegularConfirm() {
    const matched = routes.filter((r) => r.day_type === regularDayType)
    if (matched.length === 0) { alert(`'${regularDayType}' 운행조에 해당하는 노선이 없습니다.`); return }
    setStaged((prev) => [
      ...prev,
      ...matched.map((r) => ({
        tempId:           crypto.randomUUID(),
        operation_date:   regularDate,
        route_code:       r.route_code,
        departure_time:   r.default_departure_time ?? '',
        origin:           r.origin ?? '',
        plate_number:     r.plate_number ?? '',
        driver_name:      r.driver_name ?? '',
        change_reason:    '',
        fare_amount:      r.fare_amount ?? 0,
        driver_allowance: r.driver_allowance ?? 0,
        vat_included:     false,
        operation_days:   1,
        notes:            '',
      })),
    ])
    setRegularOpen(false)
  }

  /* ── 관광 확인 ── */
  function handleTourConfirm() {
    setStaged((prev) => [...prev, { tempId: crypto.randomUUID(), ...tourForm, route_code: 'R-일일' }])
    setTourForm({ ...EMPTY_TOUR, operation_date: tourForm.operation_date })
    setTourOpen(false)
  }

  /* ── staged 수정 팝업 열기 ── */
  function openEdit(row: StagedRow) {
    setEditTarget(row)
    const { tempId: _tempId, ...rest } = row
    setEditForm(rest)
    setEditOpen(true)
  }

  /* ── DB 수정 팝업 열기 ── */
  function openDbEdit(id: string) {
    const row = dbDispatches.find((r) => r.id === id)
    if (!row) return
    setDbEditTarget(row)
    const { id: _id, ...rest } = row
    setDbEditForm(rest)
    setDbEditOpen(true)
  }

  /* ── DB 수정 저장 ── */
  async function handleDbEditSave() {
    if (!dbEditTarget) return
    const { error } = await supabase.from('dispatches').update({
      operation_date:   dbEditForm.operation_date,
      route_code:       dbEditForm.route_code,
      departure_time:   dbEditForm.departure_time || null,
      origin:           dbEditForm.origin || null,
      plate_number:     dbEditForm.plate_number || null,
      driver_name:      dbEditForm.driver_name || null,
      change_reason:    dbEditForm.change_reason || null,
      fare_amount:      Number(dbEditForm.fare_amount),
      driver_allowance: Number(dbEditForm.driver_allowance),
      vat_included:     dbEditForm.vat_included,
      operation_days:   Number(dbEditForm.operation_days),
      notes:            dbEditForm.notes || null,
    }).eq('id', dbEditTarget.id)
    if (error) { alert('수정 실패: ' + error.message); return }
    setDbDispatches((prev) => prev.map((r) => r.id === dbEditTarget.id ? { ...r, ...dbEditForm } : r))
    setDbEditOpen(false)
    loadSummaries()
  }

  /* ── 수정 저장 ── */
  function handleEditSave() {
    if (!editTarget) return
    setStaged((prev) => prev.map((r) => r.tempId === editTarget.tempId ? { ...editForm, tempId: editTarget.tempId } : r))
    setEditOpen(false)
  }

  /* ── staged 행 삭제 ── */
  function handleStagedDelete(tempId: string) {
    setStaged((prev) => prev.filter((r) => r.tempId !== tempId))
  }

  /* ── 취소 ── */
  function handleCancel() {
    setStaged([])
    setSelectedDate(null)
  }

  /* ── 일괄저장 ── */
  async function handleBulkSave() {
    if (staged.length === 0) { alert('저장할 데이터가 없습니다.'); return }
    if (!confirm(`${staged.length}건을 배차 등록하시겠습니까?`)) return
    setSaving(true)
    let success = 0; let fail = 0
    for (const row of staged) {
      const { error } = await supabase.from('dispatches').insert({
        operation_date:   row.operation_date,
        route_code:       row.route_code || null,
        departure_time:   row.departure_time || null,
        origin:           row.origin || null,
        plate_number:     row.plate_number || null,
        driver_name:      row.driver_name || null,
        change_reason:    row.change_reason || null,
        fare_amount:      row.fare_amount,
        driver_allowance: row.driver_allowance,
        vat_included:     row.vat_included,
        operation_days:   row.operation_days,
        notes:            row.notes || null,
        status:           '배차',
      })
      if (error) { fail++ } else { success++ }
    }
    setSaving(false)
    alert(`저장 완료: ${success}건${fail > 0 ? ` / 실패: ${fail}건` : ''}`)
    setStaged([])
    setSelectedDate(null)
    loadSummaries()
  }

  /* ── 출발시간 포맷: "09:30" → "9:30" ── */
  function formatTime(t: string | null): string {
    if (!t) return '-'
    const parts = t.split(':')
    if (parts.length < 2) return t
    return `${parseInt(parts[0], 10)}:${parts[1].padStart(2, '0')}`
  }

  /* ─────────────────────── Render ─────────────────────── */
  const allChecked  = dbDispatches.length > 0 && checkedIds.size === dbDispatches.length
  const someChecked = checkedIds.size > 0

  return (
    <div className="flex flex-col h-full">
      {/* 페이지 헤더 */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">배차 관리</h2>
        <p className="text-sm text-gray-500 mt-1">운행 예정 현황 및 배차 등록</p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-8 py-6 gap-6">

        {/* ══════════════ 위 화면: 좌우 분리 ══════════════ */}
        <div className="flex-shrink-0 flex gap-4" style={{ height: 318 }}>

          {/* ── 왼쪽: 운행 예정 현황 (7일) ── */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="flex-shrink-0 px-5 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800 text-sm">운행 예정 현황 (7일)</h3>
              <p className="text-xs text-gray-400 mt-0.5">날짜 클릭 시 배차 내역 조회</p>
            </div>
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-gray-50 text-gray-600">
                      {([
                        ['date',           '운행(예정)일', 'left'],
                        ['registered',     '등록유무',     'center'],
                        ['dispatchCount',  '배차건수',     'center'],
                        ['vehicleCount',   '배차차량수',   'center'],
                        ['confirmedCount', '확인자수',     'center'],
                      ] as [keyof DaySummary, string, string][]).map(([k, label, align]) => (
                        <th key={k}
                          className={`px-4 py-2.5 text-xs font-medium text-${align} cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap bg-gray-50`}
                          onClick={() => toggleSort(summarySort, k, setSummarySort)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {summarySort.key === k
                              ? summarySort.dir === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />
                              : <ChevronsUpDown size={12} className="text-gray-300" />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSummaries.map((s) => {
                      const isSelected = selectedDate === s.date
                      const isToday    = s.date === weekDates[0]
                      return (
                        <tr
                          key={s.date}
                          onClick={() => handleSummaryRowClick(s)}
                          className={`border-b last:border-0 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-100 ring-1 ring-inset ring-blue-300'
                              : isToday
                              ? 'bg-blue-50/60 hover:bg-blue-100/60'
                              : 'hover:bg-gray-100'
                          }`}
                        >
                          <td className="px-4 py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">
                            {format(new Date(s.date + 'T00:00:00'), 'M/d (EEE)', { locale: ko })}
                            {s.date === weekDates[0] && (
                              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">오늘</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              s.registered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {s.registered ? '등록' : '미등록'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs text-gray-700 font-medium">
                            {s.dispatchCount > 0 ? s.dispatchCount : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs text-gray-700 font-medium">
                            {s.vehicleCount > 0 ? s.vehicleCount : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs">
                            <span className={s.confirmedCount > 0 ? 'text-blue-700 font-semibold' : 'text-gray-300'}>
                              {s.confirmedCount}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 오른쪽: 차량번호별 운행 ── */}
          <div className="w-[380px] flex-shrink-0 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="flex-shrink-0 px-5 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800 text-sm">차량번호별 운행</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedDate
                  ? format(new Date(selectedDate + 'T00:00:00'), 'M월 d일 (EEE)', { locale: ko })
                  : '좌측에서 날짜를 선택하세요'}
              </p>
            </div>

            {/* 차량번호 입력 */}
            <div className="flex-shrink-0 px-4 py-3 border-b">
              <input
                list="plate-datalist"
                type="text"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                placeholder="차량번호 뒷자리 입력/선택"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
              />
              <datalist id="plate-datalist">
                {plateOptions.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>

            {/* 차량 운행 테이블 */}
            <div className="flex-1 overflow-auto">
              {!selectedDate ? (
                <div className="py-8 text-center text-xs text-gray-400">날짜를 선택하면 조회됩니다.</div>
              ) : !vehiclePlate.trim() ? (
                <div className="py-8 text-center text-xs text-gray-400">차량번호를 입력하세요.</div>
              ) : vehicleRows.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">해당 차량의 운행 정보가 없습니다.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-gray-50 border-b">
                    <tr className="text-gray-600">
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">출발시간</th>
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">출발지</th>
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">도착지</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleRows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold text-blue-700 whitespace-nowrap">
                          {formatTime(row.departure_time)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                          {row.origin ?? <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                          {row.destination ?? <span className="text-gray-300">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════ 아래 화면: 배차 내역 ══════════════ */}
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden">

          {viewMode === 'db' ? (
            <>
              {/* ── DB 조회 모드 헤더 ── */}
              <div className="flex-shrink-0 flex items-center gap-2 px-6 py-4 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-800 mr-1">
                  {selectedDate
                    ? format(new Date(selectedDate + 'T00:00:00'), 'M월 d일 (EEE) 배차 내역', { locale: ko })
                    : '배차 내역'}
                </h3>
                {dbDispatches.length > 0 && (
                  <span className="text-xs text-gray-400">{dbDispatches.length}건</span>
                )}
                <div className="flex-1" />
                {someChecked && <span className="text-xs text-gray-500">{checkedIds.size}건 선택</span>}
                <button
                  onClick={handleDbDelete}
                  disabled={!someChecked}
                  className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-40 min-h-[40px]"
                >
                  삭제
                </button>
                <button
                  onClick={() => { setViewMode('staged'); setSelectedDate(null); setCheckedIds(new Set()); setDbDispatches([]) }}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-100 min-h-[40px]"
                >
                  취소
                </button>
              </div>

              {/* ── DB 조회 테이블 ── */}
              <div className="flex-1 min-h-0 overflow-auto">
                {dbLoading ? (
                  <div className="py-16 text-center text-gray-400 text-sm">불러오는 중...</div>
                ) : dbDispatches.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">배차 내역이 없습니다.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b bg-gray-50 text-gray-600">
                        <th className="px-4 py-3 text-center bg-gray-50">
                          <input type="checkbox" checked={allChecked} onChange={toggleCheckAll} className="w-4 h-4 accent-[#1E40AF]" />
                        </th>
                        {([
                          ['operation_date', '운행일자',   'left'],
                          ['departure_time', '출발시간',   'center'],
                          ['origin',         '출발지',     'left'],
                          ['destination',    '도착지',     'left'],
                          ['plate_number',   '차량번호',   'left'],
                          ['driver_name',    '기사이름',   'left'],
                          ['change_reason',  '변경사유',   'left'],
                        ] as [keyof EnrichedDispatch, string, string][]).map(([k, label, align]) => (
                          <th key={k}
                            className={`px-4 py-3 font-medium text-${align} cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap bg-gray-50`}
                            onClick={() => toggleSort(dbSort, k, setDbSort)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              {dbSort.key === k
                                ? dbSort.dir === 'asc' ? <ChevronUp size={13} className="text-blue-600" /> : <ChevronDown size={13} className="text-blue-600" />
                                : <ChevronsUpDown size={13} className="text-gray-300" />}
                            </span>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center font-medium whitespace-nowrap bg-gray-50">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDbDispatches.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b last:border-0 transition-colors ${
                            checkedIds.has(row.id) ? 'bg-red-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={checkedIds.has(row.id)}
                              onChange={() => toggleCheck(row.id)}
                              className="w-4 h-4 accent-red-500"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.operation_date}</td>
                          <td className="px-4 py-3 text-center font-semibold text-blue-700 whitespace-nowrap">
                            {formatTime(row.departure_time)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {row.origin ?? <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {row.destination ?? <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.plate_number ?? <span className="text-gray-300">미입력</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.driver_name ?? <span className="text-gray-300">미입력</span>}
                          </td>
                          <td className="px-4 py-3 max-w-[140px] truncate text-gray-500">
                            {row.change_reason ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openDbEdit(row.id)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                title="수정"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDbRowDelete(row.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                                title="삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <>
              {/* ── Staged 입력 모드 헤더 ── */}
              <div className="flex-shrink-0 flex items-center gap-2 px-6 py-4 border-b bg-gray-50">
                <button
                  onClick={() => { setRegularDate(selectedDate ?? weekDates[0]); setRegularOpen(true) }}
                  className="px-4 py-2 text-sm font-medium border border-[#1E40AF] text-[#1E40AF] rounded-xl hover:bg-blue-50 min-h-[40px]"
                >
                  정기
                </button>
                <button
                  onClick={() => {
                    setTourForm({ ...EMPTY_TOUR, operation_date: selectedDate ?? weekDates[0] })
                    setTourOpen(true)
                  }}
                  className="px-4 py-2 text-sm font-medium border border-amber-500 text-amber-600 rounded-xl hover:bg-amber-50 min-h-[40px]"
                >
                  관광
                </button>
                {selectedDate && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full font-medium">
                    {format(new Date(selectedDate + 'T00:00:00'), 'M월 d일 (EEE)', { locale: ko })} 입력 중
                  </span>
                )}
                <div className="flex-1" />
                <span className="text-xs text-gray-400">{staged.length}건 대기 중</span>
                <button
                  onClick={handleCancel}
                  disabled={staged.length === 0}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-100 disabled:opacity-40 min-h-[40px]"
                >
                  취소
                </button>
                <button
                  onClick={handleBulkSave}
                  disabled={saving || staged.length === 0}
                  className="px-5 py-2 text-sm font-medium bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 disabled:opacity-40 min-h-[40px]"
                >
                  {saving ? '저장 중...' : '일괄저장'}
                </button>
              </div>

              {/* ── Staged 테이블 ── */}
              <div className="flex-1 min-h-0 overflow-auto">
                {staged.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">
                    <p className="mb-1">배차 데이터가 없습니다.</p>
                    <p className="text-xs text-gray-300">위 목록에서 날짜를 클릭하거나, 정기/관광 버튼으로 배차를 추가하세요.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm min-w-[960px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b bg-gray-50 text-gray-600">
                        {([
                          ['operation_date',  '운행일자', 'left'],
                          ['route_code',      '노선코드', 'left'],
                          ['plate_number',    '차량번호', 'left'],
                          ['driver_name',     '기사이름', 'left'],
                          ['change_reason',   '변경사유', 'left'],
                          ['fare_amount',     '운행금액', 'right'],
                          ['driver_allowance','기사수당', 'right'],
                          ['vat_included',    '부가세',   'center'],
                          ['operation_days',  '운행일수', 'center'],
                        ] as [keyof StagedRow, string, string][]).map(([k, label, align]) => (
                          <th key={k}
                            className={`px-4 py-3 font-medium text-${align} cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap bg-gray-50`}
                            onClick={() => toggleSort(stagedSort, k, setStagedSort)}
                          >
                            <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
                              {label}
                              {stagedSort.key === k
                                ? stagedSort.dir === 'asc' ? <ChevronUp size={13} className="text-blue-600" /> : <ChevronDown size={13} className="text-blue-600" />
                                : <ChevronsUpDown size={13} className="text-gray-300" />}
                            </span>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center font-medium whitespace-nowrap bg-gray-50">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStaged.map((row) => (
                        <tr key={row.tempId} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.operation_date}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-semibold text-blue-700">{row.route_code}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{row.plate_number || <span className="text-gray-300">미입력</span>}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{row.driver_name || <span className="text-gray-300">미입력</span>}</td>
                          <td className="px-4 py-3 max-w-[100px] truncate text-gray-500">{row.change_reason || '-'}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.fare_amount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.driver_allowance.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${row.vat_included ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                              {row.vat_included ? '포함' : '미포함'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">{row.operation_days}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="수정">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleStagedDelete(row.tempId)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50" title="삭제">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══════════════ 정기 팝업 ══════════════ */}
      {regularOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">정기 배차</h3>
              <button onClick={() => setRegularOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="날짜">
                <input type="date" className={ic} value={regularDate} onChange={(e) => setRegularDate(e.target.value)} />
              </Field>
              <Field label="운행조">
                <select className={ic} value={regularDayType} onChange={(e) => setRegularDayType(e.target.value)}>
                  {DAY_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">선택한 운행조의 노선이 아래 입력 목록에 추가됩니다.</p>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setRegularOpen(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
              <button onClick={handleRegularConfirm} className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 min-h-[44px]">확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ 관광 팝업 ══════════════ */}
      {tourOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-900">관광 배차</h3>
                <p className="text-xs text-gray-400 mt-0.5">노선코드는 <strong>R-일일</strong>로 자동 설정됩니다.</p>
              </div>
              <button onClick={() => setTourOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="운행 날짜">
                  <input type="date" className={ic} value={tourForm.operation_date} onChange={(e) => setTourForm({ ...tourForm, operation_date: e.target.value })} />
                </Field>
                <Field label="운행일수">
                  <input type="number" className={ic} min={1} value={tourForm.operation_days} onChange={(e) => setTourForm({ ...tourForm, operation_days: Number(e.target.value) })} />
                </Field>
                <Field label="출발시간">
                  <input type="time" className={ic} value={tourForm.departure_time} onChange={(e) => setTourForm({ ...tourForm, departure_time: e.target.value })} />
                </Field>
                <Field label="출발지">
                  <input type="text" className={ic} placeholder="출발지" value={tourForm.origin} onChange={(e) => setTourForm({ ...tourForm, origin: e.target.value })} />
                </Field>
                <Field label="차량번호">
                  <input type="text" className={ic} placeholder="예: 00가 0000" value={tourForm.plate_number} onChange={(e) => setTourForm({ ...tourForm, plate_number: e.target.value })} />
                </Field>
                <Field label="기사이름">
                  <input type="text" className={ic} placeholder="이름" value={tourForm.driver_name} onChange={(e) => setTourForm({ ...tourForm, driver_name: e.target.value })} />
                </Field>
                <Field label="운행금액">
                  <input type="number" className={ic} min={0} value={tourForm.fare_amount} onChange={(e) => setTourForm({ ...tourForm, fare_amount: Number(e.target.value) })} />
                </Field>
                <Field label="기사수당">
                  <input type="number" className={ic} min={0} value={tourForm.driver_allowance} onChange={(e) => setTourForm({ ...tourForm, driver_allowance: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={tourForm.vat_included} onChange={(e) => setTourForm({ ...tourForm, vat_included: e.target.checked })} className="w-4 h-4 accent-[#1E40AF]" />
                  <span className="text-sm text-gray-700">부가세 포함</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setTourOpen(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
              <button onClick={handleTourConfirm} className="px-5 py-2.5 text-sm bg-amber-500 text-white rounded-xl hover:bg-amber-600 min-h-[44px]">확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ 수정 팝업 ══════════════ */}
      {editOpen && editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">배차 수정</h3>
              <button onClick={() => setEditOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="운행일자">
                  <input type="date" className={ic} value={editForm.operation_date} onChange={(e) => setEditForm({ ...editForm, operation_date: e.target.value })} />
                </Field>
                <Field label="노선코드">
                  <input type="text" className={ic} value={editForm.route_code} onChange={(e) => setEditForm({ ...editForm, route_code: e.target.value })} />
                </Field>
                <Field label="차량번호">
                  <input type="text" className={ic} value={editForm.plate_number} onChange={(e) => setEditForm({ ...editForm, plate_number: e.target.value })} />
                </Field>
                <Field label="기사이름">
                  <input type="text" className={ic} value={editForm.driver_name} onChange={(e) => setEditForm({ ...editForm, driver_name: e.target.value })} />
                </Field>
                <Field label="운행금액">
                  <input type="number" className={ic} min={0} value={editForm.fare_amount} onChange={(e) => setEditForm({ ...editForm, fare_amount: Number(e.target.value) })} />
                </Field>
                <Field label="기사수당">
                  <input type="number" className={ic} min={0} value={editForm.driver_allowance} onChange={(e) => setEditForm({ ...editForm, driver_allowance: Number(e.target.value) })} />
                </Field>
                <Field label="운행일수">
                  <input type="number" className={ic} min={1} value={editForm.operation_days} onChange={(e) => setEditForm({ ...editForm, operation_days: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="변경사유">
                <input type="text" className={ic} value={editForm.change_reason} onChange={(e) => setEditForm({ ...editForm, change_reason: e.target.value })} />
              </Field>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={editForm.vat_included} onChange={(e) => setEditForm({ ...editForm, vat_included: e.target.checked })} className="w-4 h-4 accent-[#1E40AF]" />
                  <span className="text-sm text-gray-700">부가세 포함</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setEditOpen(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
              <button onClick={handleEditSave} className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 min-h-[44px]">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ DB 배차 수정 팝업 ══════════════ */}
      {dbEditOpen && dbEditTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">배차 수정</h3>
              <button onClick={() => setDbEditOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="운행일자">
                  <input type="date" className={ic} value={dbEditForm.operation_date} onChange={(e) => setDbEditForm({ ...dbEditForm, operation_date: e.target.value })} />
                </Field>
                <Field label="노선코드">
                  <input type="text" className={ic} value={dbEditForm.route_code ?? ''} onChange={(e) => setDbEditForm({ ...dbEditForm, route_code: e.target.value })} />
                </Field>
                <Field label="출발시간">
                  <input type="time" className={ic} value={dbEditForm.departure_time ?? ''} onChange={(e) => setDbEditForm({ ...dbEditForm, departure_time: e.target.value })} />
                </Field>
                <Field label="출발지">
                  <input type="text" className={ic} placeholder="출발지" value={dbEditForm.origin ?? ''} onChange={(e) => setDbEditForm({ ...dbEditForm, origin: e.target.value })} />
                </Field>
                <Field label="차량번호">
                  <input type="text" className={ic} placeholder="예: 00가 0000" value={dbEditForm.plate_number ?? ''} onChange={(e) => setDbEditForm({ ...dbEditForm, plate_number: e.target.value })} />
                </Field>
                <Field label="기사이름">
                  <input type="text" className={ic} placeholder="이름" value={dbEditForm.driver_name ?? ''} onChange={(e) => setDbEditForm({ ...dbEditForm, driver_name: e.target.value })} />
                </Field>
                <Field label="운행금액">
                  <input type="number" className={ic} min={0} value={dbEditForm.fare_amount} onChange={(e) => setDbEditForm({ ...dbEditForm, fare_amount: Number(e.target.value) })} />
                </Field>
                <Field label="기사수당">
                  <input type="number" className={ic} min={0} value={dbEditForm.driver_allowance} onChange={(e) => setDbEditForm({ ...dbEditForm, driver_allowance: Number(e.target.value) })} />
                </Field>
                <Field label="운행일수">
                  <input type="number" className={ic} min={1} value={dbEditForm.operation_days} onChange={(e) => setDbEditForm({ ...dbEditForm, operation_days: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="변경사유">
                <input type="text" className={ic} value={dbEditForm.change_reason ?? ''} onChange={(e) => setDbEditForm({ ...dbEditForm, change_reason: e.target.value })} />
              </Field>
              <Field label="비고">
                <input type="text" className={ic} value={dbEditForm.notes ?? ''} onChange={(e) => setDbEditForm({ ...dbEditForm, notes: e.target.value })} />
              </Field>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={dbEditForm.vat_included} onChange={(e) => setDbEditForm({ ...dbEditForm, vat_included: e.target.checked })} className="w-4 h-4 accent-[#1E40AF]" />
                  <span className="text-sm text-gray-700">부가세 포함</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setDbEditOpen(false)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
              <button onClick={handleDbEditSave} className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 min-h-[44px]">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Helpers ─────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

const ic =
  'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent'
