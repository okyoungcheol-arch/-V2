'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Vehicle, VehicleInsert, VehicleUpdate, VehicleStatus, YN } from '@/types/database'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import { differenceInDays, parseISO } from 'date-fns'
import { Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'

const EMPTY_FORM: VehicleInsert = {
  plate_number: '',
  affiliation: '',
  investor: '',
  capacity: null,
  model_name: '',
  manufacture_year: null,
  has_installment: 'N',
  fuel_card_no: '',
  hipass_card_no: '',
  acquisition_date: null,
  acquisition_price: 0,
  acquisition_method: '',
  insurance_company: '',
  s1_cost: 0,
  monthly_maintenance: 0,
  insurance_payment_date: null,
  insurance_expiry: null,
  inspection_end_date: null,
  vin_number: '',
  first_registration_date: null,
  vehicle_age_expiry: null,
  extension_count: 0,
  status: '운행',
  notes: '',
}

function DdayBadge({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-gray-400">-</span>
  const diff = differenceInDays(parseISO(dateStr), new Date())
  const label = `D${diff >= 0 ? '-' : '+'}${Math.abs(diff)}`
  if (diff < 0) return <span className="text-red-600 font-medium flex items-center gap-1"><AlertTriangle size={13} />{dateStr} (만료)</span>
  if (diff <= 30) return <span className="text-amber-600 font-medium">{dateStr} ({label})</span>
  return <span className="text-gray-700">{dateStr} ({label})</span>
}

export default function VehiclesPage() {
  const supabase = createClient()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [form, setForm] = useState<VehicleInsert>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')       // 저장 에러 (모달)
  const [loadError, setLoadError] = useState('')  // 조회 에러 (목록)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data, error: fetchError } = await supabase.from('vehicles').select('*').order('plate_number')
    if (fetchError) {
      console.error('vehicles fetch error:', fetchError)
      setLoadError('데이터 조회 실패: ' + fetchError.message)
    } else {
      setVehicles((data ?? []) as Vehicle[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true)
  }

  function openEdit(row: Vehicle) {
    setEditing(row)
    setForm({
      plate_number: row.plate_number,
      affiliation: row.affiliation ?? '',
      investor: row.investor ?? '',
      capacity: row.capacity,
      model_name: row.model_name ?? '',
      manufacture_year: row.manufacture_year,
      has_installment: row.has_installment ?? 'N',
      fuel_card_no: row.fuel_card_no ?? '',
      hipass_card_no: row.hipass_card_no ?? '',
      acquisition_date: row.acquisition_date,
      acquisition_price: row.acquisition_price ?? 0,
      acquisition_method: row.acquisition_method ?? '',
      insurance_company: row.insurance_company ?? '',
      s1_cost: row.s1_cost ?? 0,
      monthly_maintenance: row.monthly_maintenance ?? 0,
      insurance_payment_date: row.insurance_payment_date,
      insurance_expiry: row.insurance_expiry,
      inspection_end_date: row.inspection_end_date,
      vin_number: row.vin_number ?? '',
      first_registration_date: row.first_registration_date,
      vehicle_age_expiry: row.vehicle_age_expiry,
      extension_count: row.extension_count ?? 0,
      status: row.status,
      notes: row.notes ?? '',
    })
    setError(''); setModalOpen(true)
  }

  async function handleDelete(row: Vehicle) {
    if (!confirm(`차량 "${row.plate_number}"을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('vehicles').delete().eq('id', row.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    load()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload: VehicleInsert = {
        ...form,
        affiliation: form.affiliation || null,
        investor: form.investor || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        model_name: form.model_name || null,
        manufacture_year: form.manufacture_year ? Number(form.manufacture_year) : null,
        fuel_card_no: form.fuel_card_no || null,
        hipass_card_no: form.hipass_card_no || null,
        acquisition_date: form.acquisition_date || null,
        acquisition_price: Number(form.acquisition_price ?? 0),
        acquisition_method: form.acquisition_method || null,
        insurance_company: form.insurance_company || null,
        s1_cost: Number(form.s1_cost ?? 0),
        monthly_maintenance: Number(form.monthly_maintenance ?? 0),
        insurance_payment_date: form.insurance_payment_date || null,
        insurance_expiry: form.insurance_expiry || null,
        inspection_end_date: form.inspection_end_date || null,
        vin_number: form.vin_number || null,
        first_registration_date: form.first_registration_date || null,
        vehicle_age_expiry: form.vehicle_age_expiry || null,
        extension_count: Number(form.extension_count ?? 0),
        notes: form.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('vehicles').update(payload as VehicleUpdate).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vehicles').insert(payload)
        if (error) throw error
      }
      setModalOpen(false); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<Vehicle>[] = [
    { key: 'plate_number', label: '차량번호', sortable: true },
    { key: 'affiliation', label: '소속', sortable: true, render: (v) => String(v ?? '-') },
    { key: 'investor', label: '출자자', sortable: true, render: (v) => String(v ?? '-') },
    { key: 'model_name', label: '모델명', sortable: true, render: (v) => String(v ?? '-') },
    { key: 'manufacture_year', label: '연식', sortable: true, render: (v) => v ? `${v}년` : '-' },
    { key: 'capacity', label: '정원', sortable: true, render: (v) => v ? `${v}인` : '-' },
    {
      key: 'insurance_expiry', label: '보험만료일', sortable: true,
      render: (v) => <DdayBadge dateStr={v as string | null} />,
    },
    {
      key: 'inspection_end_date', label: '검사종료일', sortable: true,
      render: (v) => <DdayBadge dateStr={v as string | null} />,
    },
    { key: 'fuel_card_no', label: '유류카드', sortable: true, render: (v) => String(v ?? '-') },
    {
      key: 'has_installment', label: '할부', sortable: true,
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === 'Y' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
          {v === 'Y' ? '있음' : '없음'}
        </span>
      ),
    },
    {
      key: 'status', label: '상태', sortable: true,
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          v === '운행' ? 'bg-green-100 text-green-700' :
          v === '정비' ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-600'
        }`}>{String(v)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">차량 관리</h2>
            <p className="text-sm text-gray-500 mt-1">보험만료·검사종료 D-day 자동 표시</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors min-h-[44px]">
            <Plus size={16} /> 차량 등록
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-8 py-6">

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex-shrink-0">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <StandardDataTable
          data={vehicles}
          columns={columns}
          searchKeys={['plate_number', 'model_name', 'affiliation', 'investor']}
          searchPlaceholder="차량번호, 모델명, 소속, 출자자 검색"
          emptyMessage="등록된 차량이 없습니다."
          fillHeight={true}
          actions={(row) => (
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600" title="수정"><Pencil size={15} /></button>
              <button onClick={() => handleDelete(row)} className="p-1.5 text-gray-400 hover:text-red-500" title="삭제"><Trash2 size={15} /></button>
            </div>
          )}
        />
      )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{editing ? '차량 수정' : '차량 등록'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">

              {/* ── 기본 정보 ── */}
              <Section title="기본 정보">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="차량번호 *">
                    <input className={ic} value={form.plate_number} onChange={(e) => setForm({ ...form, plate_number: e.target.value })} required placeholder="예: 12가 3456" />
                  </Field>
                  <Field label="소속">
                    <input className={ic} value={form.affiliation ?? ''} onChange={(e) => setForm({ ...form, affiliation: e.target.value })} placeholder="예: 경남전세버스" />
                  </Field>
                  <Field label="출자자">
                    <input className={ic} value={form.investor ?? ''} onChange={(e) => setForm({ ...form, investor: e.target.value })} />
                  </Field>
                  <Field label="정원(명)">
                    <input type="number" className={ic} value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : null })} min={1} placeholder="인원 수" />
                  </Field>
                  <Field label="모델명">
                    <input className={ic} value={form.model_name ?? ''} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="예: 유니버스 프라임" />
                  </Field>
                  <Field label="연식">
                    <input type="number" className={ic} value={form.manufacture_year ?? ''} onChange={(e) => setForm({ ...form, manufacture_year: e.target.value ? Number(e.target.value) : null })} min={1990} max={2099} placeholder="예: 2020" />
                  </Field>
                  <Field label="차대번호">
                    <input className={ic} value={form.vin_number ?? ''} onChange={(e) => setForm({ ...form, vin_number: e.target.value })} placeholder="VIN" />
                  </Field>
                  <Field label="상태">
                    <select className={ic} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as VehicleStatus })}>
                      {(['운행', '정비', '폐차'] as VehicleStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              </Section>

              {/* ── 취득 정보 ── */}
              <Section title="취득 정보">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="취득일">
                    <input type="date" className={ic} value={form.acquisition_date ?? ''} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value || null })} />
                  </Field>
                  <Field label="취득가격 (원)">
                    <input type="number" className={ic} value={form.acquisition_price ?? 0} onChange={(e) => setForm({ ...form, acquisition_price: Number(e.target.value) })} min={0} />
                  </Field>
                  <Field label="취득방법">
                    <select className={ic} value={form.acquisition_method ?? ''} onChange={(e) => setForm({ ...form, acquisition_method: e.target.value || null })}>
                      <option value="">선택</option>
                      <option value="신규">신규</option>
                      <option value="중고">중고</option>
                      <option value="할부">할부</option>
                    </select>
                  </Field>
                  <Field label="할부유무">
                    <select className={ic} value={form.has_installment ?? 'N'} onChange={(e) => setForm({ ...form, has_installment: e.target.value as YN })}>
                      <option value="N">N (없음)</option>
                      <option value="Y">Y (있음)</option>
                    </select>
                  </Field>
                  <Field label="최초등록일">
                    <input type="date" className={ic} value={form.first_registration_date ?? ''} onChange={(e) => setForm({ ...form, first_registration_date: e.target.value || null })} />
                  </Field>
                  <Field label="차령만료일">
                    <input type="date" className={ic} value={form.vehicle_age_expiry ?? ''} onChange={(e) => setForm({ ...form, vehicle_age_expiry: e.target.value || null })} />
                  </Field>
                  <Field label="연장회수">
                    <input type="number" className={ic} value={form.extension_count ?? 0} onChange={(e) => setForm({ ...form, extension_count: Number(e.target.value) })} min={0} />
                  </Field>
                </div>
              </Section>

              {/* ── 보험 / 카드 정보 ── */}
              <Section title="보험 / 카드 정보">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="보험사">
                    <input className={ic} value={form.insurance_company ?? ''} onChange={(e) => setForm({ ...form, insurance_company: e.target.value })} />
                  </Field>
                  <Field label="보험납입일">
                    <input type="date" className={ic} value={form.insurance_payment_date ?? ''} onChange={(e) => setForm({ ...form, insurance_payment_date: e.target.value || null })} />
                  </Field>
                  <Field label="보험만료일">
                    <input type="date" className={ic} value={form.insurance_expiry ?? ''} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value || null })} />
                  </Field>
                  <Field label="검사종료일">
                    <input type="date" className={ic} value={form.inspection_end_date ?? ''} onChange={(e) => setForm({ ...form, inspection_end_date: e.target.value || null })} />
                  </Field>
                  <Field label="유류카드번호">
                    <input className={ic} value={form.fuel_card_no ?? ''} onChange={(e) => setForm({ ...form, fuel_card_no: e.target.value })} />
                  </Field>
                  <Field label="하이패스카드번호">
                    <input className={ic} value={form.hipass_card_no ?? ''} onChange={(e) => setForm({ ...form, hipass_card_no: e.target.value })} />
                  </Field>
                </div>
              </Section>

              {/* ── 비용 정보 ── */}
              <Section title="비용 정보">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="에스원비용 (월)">
                    <input type="number" className={ic} value={form.s1_cost ?? 0} onChange={(e) => setForm({ ...form, s1_cost: Number(e.target.value) })} min={0} />
                  </Field>
                  <Field label="월관리비 (원)">
                    <input type="number" className={ic} value={form.monthly_maintenance ?? 0} onChange={(e) => setForm({ ...form, monthly_maintenance: Number(e.target.value) })} min={0} />
                  </Field>
                </div>
              </Section>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 pb-1 border-b">{title}</h4>
      {children}
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
