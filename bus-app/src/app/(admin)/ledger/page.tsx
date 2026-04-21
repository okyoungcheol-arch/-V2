'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LedgerEntry, LedgerEntryInsert, LedgerEntryUpdate, Vehicle, Employee } from '@/types/database'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import { format } from 'date-fns'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

const EMPTY_FORM: LedgerEntryInsert = {
  bank_transaction_id: null,
  serial_no: null,
  entry_date: format(new Date(), 'yyyy-MM-dd'),
  description: '',
  income: 0,
  expense: 0,
  balance: 0,
  vehicle_id: null,
  driver_id: null,
  manual_entry: 'N',
  notes: null,
}

export default function LedgerPage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [form, setForm] = useState<LedgerEntryInsert>(EMPTY_FORM)
  const [baseBalance, setBaseBalance] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'))

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: e }, { data: v }, { data: d }] = await Promise.all([
      supabase
        .from('ledger_entries')
        .select('*, vehicles(id,plate_number), employees(id,name), bank_transactions(id,description)')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('vehicles').select('id,plate_number').order('plate_number'),
      supabase.from('employees').select('id,name').eq('status', '재직').order('name'),
    ])
    setEntries((e ?? []) as LedgerEntry[])
    setVehicles((v ?? []) as Vehicle[])
    setDrivers((d ?? []) as Employee[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openCreate() {
    const lastBalance = entries.length > 0
      ? [...entries].sort((a, b) => a.entry_date > b.entry_date ? -1 : 1)[0].balance
      : 0
    setBaseBalance(lastBalance)
    setEditing(null)
    setForm({ ...EMPTY_FORM, balance: lastBalance })
    setError('')
    setModalOpen(true)
  }

  function openEdit(row: LedgerEntry) {
    setEditing(row)
    setForm({
      bank_transaction_id: row.bank_transaction_id,
      serial_no:           row.serial_no,
      entry_date:          row.entry_date,
      description:         row.description,
      income:              row.income,
      expense:             row.expense,
      balance:             row.balance,
      vehicle_id:          row.vehicle_id,
      driver_id:           row.driver_id,
      manual_entry:        row.manual_entry ?? 'N',
      notes:               row.notes,
    })
    setError(''); setModalOpen(true)
  }

  async function handleDelete(row: LedgerEntry) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    await supabase.from('ledger_entries').delete().eq('id', row.id)
    load()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload: LedgerEntryInsert = {
        ...form,
        income:             Number(form.income),
        expense:            Number(form.expense),
        balance:            Number(form.balance),
        vehicle_id:         form.vehicle_id || null,
        driver_id:          form.driver_id || null,
        bank_transaction_id: form.bank_transaction_id || null,
        manual_entry:       form.manual_entry || 'N',
        notes:              form.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('ledger_entries').update(payload as LedgerEntryUpdate).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ledger_entries').insert(payload)
        if (error) throw error
      }
      setModalOpen(false); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const filtered = entries.filter((e) =>
    !filterMonth || e.entry_date.startsWith(filterMonth)
  )

  const totalIncome  = filtered.reduce((s, e) => s + e.income,  0)
  const totalExpense = filtered.reduce((s, e) => s + e.expense, 0)
  const netBalance   = totalIncome - totalExpense

  const columns: Column<LedgerEntry>[] = [
    { key: 'bank_transaction_id', label: '은행거래ID', sortable: true,
      render: (_, r) => r.bank_transactions?.description
        ? <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">연결됨</span>
        : '-' },
    { key: 'serial_no', label: '일련번호', sortable: true,
      render: (v) => v != null ? String(v) : '-' },
    { key: 'entry_date', label: '날짜', sortable: true },
    { key: 'description', label: '적요' },
    { key: 'income', label: '수입', sortable: true,
      render: (v) => Number(v) > 0
        ? <span className="text-blue-700 font-medium">{Number(v).toLocaleString()}원</span>
        : '-' },
    { key: 'expense', label: '지출', sortable: true,
      render: (v) => Number(v) > 0
        ? <span className="text-red-600 font-medium">{Number(v).toLocaleString()}원</span>
        : '-' },
    { key: 'balance', label: '잔액', sortable: true,
      render: (v) => Number(v) !== 0 ? `${Number(v).toLocaleString()}원` : '-' },
    { key: 'vehicle_id', label: '차량번호',
      render: (_, r) => r.vehicles?.plate_number ?? '-' },
    { key: 'driver_id', label: '기사이름',
      render: (_, r) => r.employees?.name ?? '-' },
    { key: 'manual_entry', label: '수기입력',
      render: (v) => v === 'Y'
        ? <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Y</span>
        : '-' },
    { key: 'notes', label: '비고', className: 'max-w-[150px] truncate' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">금전출납부</h2>
            <p className="text-sm text-gray-500 mt-1">수입·지출 내역 및 은행거래 연계 관리</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 min-h-[44px]">
            <Plus size={16} /> 항목 등록
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-8 py-6 gap-4">

        {/* 월 필터 + 합계 */}
        <div className="flex-shrink-0 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">월</label>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]" />
            <button onClick={() => setFilterMonth('')} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">전체</button>
          </div>
          <div className="flex gap-3">
            {[
              { label: '총 수입', value: totalIncome,  color: 'text-blue-700' },
              { label: '총 지출', value: totalExpense, color: 'text-red-600' },
              { label: '순잔액', value: netBalance,    color: netBalance >= 0 ? 'text-green-700' : 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-center min-w-[120px]">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-sm font-bold mt-0.5 ${color}`}>{value.toLocaleString()}원</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="text-center py-20 text-gray-400">불러오는 중...</div>
          ) : (
            <StandardDataTable
              data={filtered}
              columns={columns}
              searchKeys={['description', 'notes']}
              searchPlaceholder="적요, 비고 검색"
              emptyMessage="출납 내역이 없습니다."
              fillHeight
              actions={(row) => (
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(row)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              )}
            />
          )}
        </div>
      </div>

      {/* 등록/수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{editing ? '항목 수정' : '항목 등록'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="날짜 *">
                  <input type="date" className={ic} value={form.entry_date}
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
                </Field>
                <Field label="수기입력대상">
                  <select className={ic} value={form.manual_entry ?? 'N'}
                    onChange={(e) => setForm({ ...form, manual_entry: e.target.value })}>
                    <option value="N">N</option>
                    <option value="Y">Y</option>
                  </select>
                </Field>
                <div className="col-span-2">
                  <Field label="적요 *">
                    <input className={ic} value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="내용 입력" />
                  </Field>
                </div>
                <Field label="수입 (원)">
                  <input type="number" className={ic} value={form.income || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const income = Number(e.target.value)
                      setForm({ ...form, income, balance: baseBalance + income - (form.expense ?? 0) })
                    }} min={0} />
                </Field>
                <Field label="지출 (원)">
                  <input type="number" className={ic} value={form.expense || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const expense = Number(e.target.value)
                      setForm({ ...form, expense, balance: baseBalance + (form.income ?? 0) - expense })
                    }} min={0} />
                </Field>
                <Field label="잔액 (원)">
                  {!editing ? (
                    <>
                      <input type="number" readOnly className={`${ic} bg-blue-50 text-blue-700 font-medium`}
                        value={form.balance} onChange={() => {}} />
                      <p className="text-xs text-gray-400 mt-0.5">이전 잔액 + 수입 - 지출로 자동 계산</p>
                    </>
                  ) : (
                    <input type="number" className={ic} value={form.balance}
                      onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} />
                  )}
                </Field>
                <Field label="차량번호">
                  <select className={ic} value={form.vehicle_id ?? ''}
                    onChange={(e) => setForm({ ...form, vehicle_id: e.target.value || null })}>
                    <option value="">선택</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                  </select>
                </Field>
                <div className="col-span-2">
                  <Field label="기사이름(직원명)">
                    <select className={ic} value={form.driver_id ?? ''}
                      onChange={(e) => setForm({ ...form, driver_id: e.target.value || null })}>
                      <option value="">선택</option>
                      {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
              <Field label="비고">
                <textarea className={ic + ' resize-none'} rows={2} value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
              </Field>
              {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 disabled:opacity-50 min-h-[44px]">
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
