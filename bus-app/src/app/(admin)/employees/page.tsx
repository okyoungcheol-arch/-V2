'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Employee, EmployeeInsert, EmployeeUpdate, UserRole, EmployeeStatus } from '@/types/database'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import { Plus, Pencil, Trash2, X, Shield } from 'lucide-react'

const EMPTY_FORM: EmployeeInsert = {
  name: '',
  emp_number: '',
  role: 'user',
  phone: '',
  license_number: '',
  can_drive: true,
  status: '재직',
  employment_type: '',
  address: '',
  join_date: null,
  resignation_date: null,
  monthly_salary: 0,
  bank_name: '',
  bank_account: '',
  shinhan_account: '',
  hometax_id: '',
  login_id: '',
  pin_code: '',
  notes: '',
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '관리자',
  staff: '사무직',
  user: '기사',
}

export default function EmployeesPage() {
  const supabase = createClient()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<EmployeeInsert>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPin, setShowPin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmployees((data ?? []) as Employee[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setShowPin(false); setModalOpen(true)
  }

  function openEdit(row: Employee) {
    setEditing(row)
    setForm({
      name: row.name,
      emp_number: row.emp_number ?? '',
      role: row.role,
      phone: row.phone ?? '',
      license_number: row.license_number ?? '',
      can_drive: row.can_drive,
      status: row.status,
      employment_type: row.employment_type ?? '',
      address: row.address ?? '',
      join_date: row.join_date ?? null,
      resignation_date: row.resignation_date ?? null,
      monthly_salary: row.monthly_salary,
      bank_name: row.bank_name ?? '',
      bank_account: row.bank_account ?? '',
      shinhan_account: row.shinhan_account ?? '',
      hometax_id: row.hometax_id ?? '',
      login_id: row.login_id ?? '',
      pin_code: '', // PIN은 수정 시 새로 입력
      notes: row.notes ?? '',
    })
    setError(''); setShowPin(false); setModalOpen(true)
  }

  async function handleDelete(row: Employee) {
    if (!confirm(`"${row.name}" 직원을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('employees').delete().eq('id', row.id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    load()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload: EmployeeInsert = {
        ...form,
        emp_number:       form.emp_number       || null,
        phone:            form.phone            || null,
        license_number:   form.license_number   || null,
        employment_type:  form.employment_type  || null,
        address:          form.address          || null,
        join_date:        form.join_date        || null,
        resignation_date: form.resignation_date || null,
        bank_name:        form.bank_name        || null,
        bank_account:     form.bank_account     || null,
        shinhan_account:  form.shinhan_account  || null,
        hometax_id:       form.hometax_id       || null,
        login_id:         form.login_id         || null,
        notes:            form.notes            || null,
        monthly_salary:   Number(form.monthly_salary),
      }
      // 수정 시 PIN이 비어있으면 변경하지 않음
      if (editing && !form.pin_code) delete payload.pin_code

      if (editing) {
        const { error } = await supabase.from('employees').update(payload as EmployeeUpdate).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) throw error
      }
      setModalOpen(false); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<Employee>[] = [
    { key: 'name', label: '이름', sortable: true },
    { key: 'emp_number', label: '사번', sortable: true },
    {
      key: 'role', label: '역할', sortable: true,
      render: (v) => {
        const role = v as UserRole
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${
            role === 'admin' ? 'bg-purple-100 text-purple-700' :
            role === 'staff' ? 'bg-blue-100 text-blue-700' :
            'bg-green-100 text-green-700'
          }`}>
            {role === 'admin' && <Shield size={11} />}
            {ROLE_LABELS[role]}
          </span>
        )
      },
    },
    { key: 'employment_type', label: '고용형태', sortable: true, render: (v) => String(v ?? '-') },
    { key: 'phone', label: '연락처' },
    { key: 'login_id', label: '로그인ID', sortable: true },
    {
      key: 'monthly_salary', label: '월급여', sortable: true,
      render: (v) => Number(v) > 0 ? Number(v).toLocaleString() + '원' : '-',
    },
    {
      key: 'can_drive', label: '운전가능', sortable: true,
      render: (v) => v ? <span className="text-green-600 font-medium">가능</span> : <span className="text-gray-400">불가</span>,
    },
    {
      key: 'status', label: '상태', sortable: true,
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === '재직' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
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
            <h2 className="text-2xl font-bold text-gray-900">직원·기사 관리</h2>
            <p className="text-sm text-gray-500 mt-1">로그인 계정 및 PIN 설정 포함</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors min-h-[44px]">
            <Plus size={16} /> 직원 등록
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-8 py-6">
        {loading ? (
          <div className="text-center py-20 text-gray-400">불러오는 중...</div>
        ) : (
          <StandardDataTable
            fillHeight
            data={employees}
            columns={columns}
            searchKeys={['name', 'emp_number', 'login_id', 'phone']}
            searchPlaceholder="이름, 사번, 로그인ID 검색"
            emptyMessage="등록된 직원이 없습니다."
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold">{editing ? '직원 수정' : '직원 등록'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">

              {/* 기본 정보 */}
              <Section title="기본 정보">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="이름 *">
                    <input className={ic} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </Field>
                  <Field label="사번">
                    <input className={ic} value={form.emp_number ?? ''} onChange={(e) => setForm({ ...form, emp_number: e.target.value })} placeholder="예: EMP001" />
                  </Field>
                  <Field label="역할">
                    <select className={ic} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="고용형태">
                    <input className={ic} value={form.employment_type ?? ''} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} placeholder="예: 정규직, 계약직" />
                  </Field>
                  <Field label="연락처">
                    <input className={ic} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
                  </Field>
                  <Field label="면허번호">
                    <input className={ic} value={form.license_number ?? ''} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
                  </Field>
                  <Field label="운전가능">
                    <div className="flex items-center gap-3 h-10">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.can_drive} onChange={(e) => setForm({ ...form, can_drive: e.target.checked })} className="w-4 h-4" />
                        <span className="text-sm">운전 가능</span>
                      </label>
                    </div>
                  </Field>
                  <Field label="재직 상태">
                    <select className={ic} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EmployeeStatus })}>
                      {['재직', '퇴직'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="입사일">
                    <input type="date" className={ic} value={form.join_date ?? ''} onChange={(e) => setForm({ ...form, join_date: e.target.value || null })} />
                  </Field>
                  <Field label="퇴사일">
                    <input type="date" className={ic} value={form.resignation_date ?? ''} onChange={(e) => setForm({ ...form, resignation_date: e.target.value || null })} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="주소">
                      <input className={ic} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="주소 입력" />
                    </Field>
                  </div>
                </div>
              </Section>

              {/* 급여 정보 */}
              <Section title="급여 · 계좌 정보">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="월급여 (원)">
                    <input type="number" className={ic} value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: Number(e.target.value) })} min={0} />
                  </Field>
                  <Field label="은행명">
                    <input className={ic} value={form.bank_name ?? ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="예: 국민은행" />
                  </Field>
                  <div className="col-span-2">
                    <Field label="계좌번호">
                      <input className={ic} value={form.bank_account ?? ''} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} placeholder="예: 123-456-789012" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="신한은행 계좌번호">
                      <input className={ic} value={form.shinhan_account ?? ''} onChange={(e) => setForm({ ...form, shinhan_account: e.target.value })} placeholder="신한은행 계좌번호" />
                    </Field>
                  </div>
                </div>
              </Section>

              {/* 로그인 · 세금 */}
              <Section title="로그인 · 세금 정보">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="홈텍스 ID">
                    <input className={ic} value={form.hometax_id ?? ''} onChange={(e) => setForm({ ...form, hometax_id: e.target.value })} placeholder="홈텍스 로그인 ID" />
                  </Field>
                  <Field label="로그인 ID">
                    <input className={ic} value={form.login_id ?? ''} onChange={(e) => setForm({ ...form, login_id: e.target.value })} placeholder="시스템 로그인 아이디" />
                  </Field>
                  <div className="col-span-2">
                    <Field label={editing ? 'PIN 변경 (비워두면 유지)' : 'PIN 설정 *'}>
                      <div className="relative">
                        <input
                          type={showPin ? 'text' : 'password'}
                          className={ic}
                          value={form.pin_code ?? ''}
                          onChange={(e) => setForm({ ...form, pin_code: e.target.value })}
                          required={!editing}
                          inputMode="numeric"
                          placeholder="숫자 PIN"
                        />
                        <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                          {showPin ? '숨기기' : '보기'}
                        </button>
                      </div>
                    </Field>
                  </div>
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
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</p>
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
