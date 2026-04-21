'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Route, RouteInsert, RouteUpdate, Client, RouteType, DayType } from '@/types/database'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

const ROUTE_TYPES: RouteType[] = ['정기', '관광']
const DAY_TYPES: DayType[] = ['평일', '토요일A조', '토요일B조', '일요일A조', '일요일B조', '매일']

const EMPTY_FORM: RouteInsert = {
  route_code: '',
  route_name: '',
  origin: '',
  destination: '',
  waypoints: '',
  fare_amount: 0,
  driver_allowance: 0,
  route_type: '정기',
  day_type: '평일',
  default_departure_time: '',
  distance_km: null,
  operation_days: 1,
  plate_number: '',
  driver_name: '',
  effective_start_date: null,
  effective_end_date: null,
  client_id: null,
  notes: '',
}

export default function RoutesPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<Route[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Route | null>(null)
  const [form, setForm] = useState<RouteInsert>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase
        .from('routes')
        .select('*, clients(id, name)')
        .order('route_code'),
      supabase.from('clients').select('id, name').eq('status', '활성').order('name'),
    ])
    setRoutes((r ?? []) as Route[])
    setClients((c ?? []) as Client[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function openEdit(row: Route) {
    setEditing(row)
    setForm({
      route_code: row.route_code,
      route_name: row.route_name,
      origin: row.origin ?? '',
      destination: row.destination ?? '',
      waypoints: row.waypoints ?? '',
      fare_amount: row.fare_amount,
      driver_allowance: row.driver_allowance,
      route_type: row.route_type,
      day_type: row.day_type,
      default_departure_time: row.default_departure_time ?? '',
      distance_km: row.distance_km ?? null,
      operation_days: row.operation_days ?? 1,
      plate_number: row.plate_number ?? '',
      driver_name: row.driver_name ?? '',
      effective_start_date: row.effective_start_date ?? null,
      effective_end_date: row.effective_end_date ?? null,
      client_id: row.client_id ?? null,
      notes: row.notes ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  async function handleDelete(row: Route) {
    if (!confirm(`노선 "${row.route_name}"을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('routes').delete().eq('id', row.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    load()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: RouteInsert = {
        ...form,
        fare_amount: Number(form.fare_amount),
        driver_allowance: Number(form.driver_allowance),
        default_departure_time: form.default_departure_time || null,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        operation_days: form.operation_days ? Number(form.operation_days) : 1,
        plate_number: form.plate_number || null,
        driver_name: form.driver_name || null,
        effective_start_date: form.effective_start_date || null,
        effective_end_date: form.effective_end_date || null,
        client_id: form.client_id || null,
        notes: form.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('routes').update(payload as RouteUpdate).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('routes').insert(payload)
        if (error) throw error
      }
      setModalOpen(false)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<Route>[] = [
    { key: 'route_code', label: '노선코드', sortable: true },
    { key: 'route_name', label: '노선명', sortable: true },
    {
      key: 'route_type', label: '유형', sortable: true,
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === '정기' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
          {String(v)}
        </span>
      ),
    },
    { key: 'day_type', label: '운행조', sortable: true },
    { key: 'default_departure_time', label: '출발시간', sortable: true, render: (v) => v ? String(v).slice(0, 5) : '-' },
    { key: 'origin', label: '출발지', sortable: true },
    { key: 'destination', label: '도착지', sortable: true },
    { key: 'plate_number', label: '차량번호', sortable: true },
    { key: 'driver_name', label: '기사이름', sortable: true },
    {
      key: 'fare_amount', label: '운행금액', sortable: true,
      render: (v) => Number(v).toLocaleString() + '원',
    },
    {
      key: 'operation_days', label: '운행일수', sortable: true,
      render: (v) => v != null ? String(v) + '일' : '-',
    },
    {
      key: 'effective_start_date', label: '적용시작일', sortable: true,
      render: (v) => v ? String(v) : '-',
    },
    {
      key: 'effective_end_date', label: '적용종료일', sortable: true,
      render: (v) => v ? String(v) : '-',
    },
    {
      key: 'client_id', label: '계약처', sortable: true,
      render: (_, row) => row.clients?.name ?? '-',
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">노선 관리</h2>
            <p className="text-sm text-gray-500 mt-1">운행 노선 및 단가 관리</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors min-h-[44px]"
          >
            <Plus size={16} /> 노선 등록
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden px-8 py-6">

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <StandardDataTable
          data={routes}
          columns={columns}
          searchKeys={['route_code', 'route_name', 'origin', 'destination']}
          searchPlaceholder="노선코드, 노선명, 출발지 검색"
          emptyMessage="등록된 노선이 없습니다."
          fillHeight={true}
          actions={(row) => (
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" title="수정">
                <Pencil size={15} />
              </button>
              <button onClick={() => handleDelete(row)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="삭제">
                <Trash2 size={15} />
              </button>
            </div>
          )}
        />
      )}

      </div>

      {/* 등록/수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{editing ? '노선 수정' : '노선 등록'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="노선코드 *">
                  <input className={inputCls} value={form.route_code} onChange={(e) => setForm({ ...form, route_code: e.target.value })} required placeholder="예: R001" />
                </Field>
                <Field label="노선명 *">
                  <input className={inputCls} value={form.route_name} onChange={(e) => setForm({ ...form, route_name: e.target.value })} required placeholder="예: 창원-부산" />
                </Field>
                <Field label="출발지">
                  <input className={inputCls} value={form.origin ?? ''} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="출발지" />
                </Field>
                <Field label="도착지">
                  <input className={inputCls} value={form.destination ?? ''} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="도착지" />
                </Field>
                <Field label="경유지">
                  <input className={inputCls} value={form.waypoints ?? ''} onChange={(e) => setForm({ ...form, waypoints: e.target.value })} placeholder="쉼표로 구분" />
                </Field>
                <Field label="기본 출발시간">
                  <input type="time" className={inputCls} value={form.default_departure_time ?? ''} onChange={(e) => setForm({ ...form, default_departure_time: e.target.value })} />
                </Field>
                <Field label="거리 (km)">
                  <input type="number" className={inputCls} value={form.distance_km ?? ''} onChange={(e) => setForm({ ...form, distance_km: e.target.value ? Number(e.target.value) : null })} min={0} step={0.1} placeholder="예: 35.5" />
                </Field>
                <Field label="운행일수">
                  <input type="number" className={inputCls} value={form.operation_days ?? 1} onChange={(e) => setForm({ ...form, operation_days: Number(e.target.value) })} min={1} />
                </Field>
                <Field label="차량번호">
                  <input className={inputCls} value={form.plate_number ?? ''} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} placeholder="예: 00가 0000" />
                </Field>
                <Field label="기사이름">
                  <input className={inputCls} value={form.driver_name ?? ''} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} placeholder="이름" />
                </Field>
                <Field label="적용시작일">
                  <input type="date" className={inputCls} value={form.effective_start_date ?? ''} onChange={(e) => setForm({ ...form, effective_start_date: e.target.value || null })} />
                </Field>
                <Field label="적용종료일">
                  <input type="date" className={inputCls} value={form.effective_end_date ?? ''} onChange={(e) => setForm({ ...form, effective_end_date: e.target.value || null })} />
                </Field>
                <Field label="운행금액 (원)">
                  <input type="number" className={inputCls} value={form.fare_amount} onChange={(e) => setForm({ ...form, fare_amount: Number(e.target.value) })} min={0} />
                </Field>
                <Field label="노선유형">
                  <select className={inputCls} value={form.route_type} onChange={(e) => setForm({ ...form, route_type: e.target.value as RouteType })}>
                    {ROUTE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="운행조">
                  <select className={inputCls} value={form.day_type} onChange={(e) => setForm({ ...form, day_type: e.target.value as DayType })}>
                    {DAY_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="계약처">
                  <select className={inputCls} value={form.client_id ?? ''} onChange={(e) => setForm({ ...form, client_id: e.target.value || null })}>
                    <option value="">선택 안함</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="비고">
                <textarea className={inputCls + ' resize-none'} rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent'
