'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client, ClientInsert, ClientUpdate, ClientStatus } from '@/types/database'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

const EMPTY_FORM: ClientInsert = {
  name: '',
  contact_name: '',
  contact_phone: '',
  address: '',
  email: '',
  business_number: '',
  contract_amount: 0,
  monthly_amount: 0,
  advance_payment: 0,
  contract_start_date: null,
  contract_end_date: null,
  status: '활성',
  notes: '',
}

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientInsert>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('name')
    setClients((data ?? []) as Client[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true)
  }

  function openEdit(row: Client) {
    setEditing(row)
    setForm({
      name: row.name,
      contact_name: row.contact_name ?? '',
      contact_phone: row.contact_phone ?? '',
      address: row.address ?? '',
      email: row.email ?? '',
      business_number: row.business_number ?? '',
      contract_amount: row.contract_amount,
      monthly_amount: row.monthly_amount,
      advance_payment: row.advance_payment,
      contract_start_date: row.contract_start_date ?? null,
      contract_end_date: row.contract_end_date ?? null,
      status: row.status,
      notes: row.notes ?? '',
    })
    setError(''); setModalOpen(true)
  }

  async function handleDelete(row: Client) {
    if (!confirm(`고객사 "${row.name}"을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('clients').delete().eq('id', row.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    load()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload: ClientInsert = {
        ...form,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        address: form.address || null,
        email: form.email || null,
        business_number: form.business_number || null,
        contract_amount: Number(form.contract_amount),
        monthly_amount: Number(form.monthly_amount),
        advance_payment: Number(form.advance_payment),
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        notes: form.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('clients').update(payload as ClientUpdate).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clients').insert(payload)
        if (error) throw error
      }
      setModalOpen(false); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<Client>[] = [
    { key: 'name', label: '고객사명', sortable: true },
    { key: 'contact_name', label: '담당자' },
    { key: 'contact_phone', label: '연락처' },
    {
      key: 'contract_amount', label: '계약금액',
      render: (v) => Number(v) > 0 ? Number(v).toLocaleString() + '원' : '-',
    },
    {
      key: 'monthly_amount', label: '월계약금액',
      render: (v) => Number(v) > 0 ? Number(v).toLocaleString() + '원' : '-',
    },
    {
      key: 'advance_payment', label: '선금',
      render: (v) => Number(v) > 0 ? Number(v).toLocaleString() + '원' : '-',
    },
    {
      key: 'status', label: '상태',
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === '활성' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {String(v)}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">고객사 관리</h2>
            <p className="text-sm text-gray-500 mt-1">계약처 및 계약 금액 관리</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors min-h-[44px]">
            <Plus size={16} /> 고객사 등록
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <StandardDataTable
          data={clients}
          columns={columns}
          searchKeys={['name', 'contact_name', 'contact_phone']}
          searchPlaceholder="고객사명, 담당자, 연락처 검색"
          emptyMessage="등록된 고객사가 없습니다."
          actions={(row) => (
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600"><Pencil size={15} /></button>
              <button onClick={() => handleDelete(row)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          )}
        />
      )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{editing ? '고객사 수정' : '고객사 등록'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field label="고객사명 *">
                    <input className={ic} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="예: 삼성전자 창원" />
                  </Field>
                </div>
                <Field label="담당자">
                  <input className={ic} value={form.contact_name ?? ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="담당자 이름" />
                </Field>
                <Field label="연락처">
                  <input className={ic} value={form.contact_phone ?? ''} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="010-0000-0000" />
                </Field>
                <Field label="이메일">
                  <input type="email" className={ic} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="example@company.com" />
                </Field>
                <Field label="사업자등록번호">
                  <input className={ic} value={form.business_number ?? ''} onChange={(e) => setForm({ ...form, business_number: e.target.value })} placeholder="000-00-00000" />
                </Field>
                <div className="col-span-2">
                  <Field label="주소">
                    <input className={ic} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="도로명 주소" />
                  </Field>
                </div>
                <Field label="계약시작일">
                  <input type="date" className={ic} value={form.contract_start_date ?? ''} onChange={(e) => setForm({ ...form, contract_start_date: e.target.value || null })} />
                </Field>
                <Field label="계약종료일">
                  <input type="date" className={ic} value={form.contract_end_date ?? ''} onChange={(e) => setForm({ ...form, contract_end_date: e.target.value || null })} />
                </Field>
                <Field label="계약금액 (원)">
                  <input type="number" className={ic} value={form.contract_amount} onChange={(e) => setForm({ ...form, contract_amount: Number(e.target.value) })} min={0} />
                </Field>
                <Field label="월계약금액 (원)">
                  <input type="number" className={ic} value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: Number(e.target.value) })} min={0} />
                </Field>
                <Field label="선금 (원)">
                  <input type="number" className={ic} value={form.advance_payment} onChange={(e) => setForm({ ...form, advance_payment: Number(e.target.value) })} min={0} />
                </Field>
                <Field label="상태">
                  <select className={ic} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}>
                    {['활성', '비활성'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

const ic = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent'
