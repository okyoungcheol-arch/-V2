'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BankTransaction, LedgerEntryInsert } from '@/types/database'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import { Upload, Trash2, Plus, X, Split } from 'lucide-react'
import { format } from 'date-fns'

// ── CSV 파싱 유틸 ──
function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  // EUC-KR 휴리스틱: 0xa0~0xfe 범위 연속 2바이트
  for (let i = 0; i < Math.min(bytes.length - 1, 200); i++) {
    if (bytes[i] >= 0xa0 && bytes[i] <= 0xfe && bytes[i + 1] >= 0xa0 && bytes[i + 1] <= 0xfe) {
      return 'euc-kr'
    }
  }
  return 'utf-8'
}

function decodeBuffer(buffer: ArrayBuffer): string {
  const enc = detectEncoding(buffer)
  try {
    return new TextDecoder(enc).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

interface ParsedRow {
  transaction_at: string
  deposit: number
  withdrawal: number
  balance: number
  description: string
  creditor_name: string
  bank_type: string
}

function parseNH(text: string): ParsedRow[] {
  // 농협: 거래일자|거래시간|거래유형|출금액|입금액|잔액|내용|메모
  const lines = text.split('\n').filter((l) => l.trim())
  const rows: ParsedRow[] = []
  for (const line of lines) {
    const cols = line.split('|').map((c) => c.trim().replace(/"/g, ''))
    if (cols.length < 7) continue
    const dateRaw = cols[0].replace(/\./g, '-').replace(/\//g, '-')
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) continue
    const timeRaw = cols[1] || '00:00:00'
    rows.push({
      transaction_at: `${dateRaw}T${timeRaw}`,
      withdrawal: Number((cols[3] || '0').replace(/,/g, '')),
      deposit: Number((cols[4] || '0').replace(/,/g, '')),
      balance: Number((cols[5] || '0').replace(/,/g, '')),
      description: cols[6] || '',
      creditor_name: cols[7] || '',
      bank_type: '농협',
    })
  }
  return rows
}

function parseIBK(text: string): ParsedRow[] {
  // 기업은행: 거래일시|구분|거래금액|잔액|적요
  const lines = text.split('\n').filter((l) => l.trim())
  const rows: ParsedRow[] = []
  for (const line of lines) {
    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''))
    if (cols.length < 5) continue
    const dateRaw = cols[0].replace(/\./g, '-')
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) continue
    const amount = Number((cols[2] || '0').replace(/,/g, ''))
    const type = cols[1] // 입금/출금
    rows.push({
      transaction_at: `${dateRaw}T00:00:00`,
      deposit: type.includes('입') ? amount : 0,
      withdrawal: type.includes('출') ? amount : 0,
      balance: Number((cols[3] || '0').replace(/,/g, '')),
      description: cols[4] || '',
      creditor_name: '',
      bank_type: '기업은행',
    })
  }
  return rows
}

function detectBankType(text: string): string {
  if (text.includes('농협') || text.split('\n')[0]?.includes('|')) return 'nh'
  return 'ibk'
}

// ── 분할 출납부 항목 타입 ──
interface SplitEntry {
  description: string
  income: number
  expense: number
  category: string
}

export default function BankPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: number; skip: number } | null>(null)
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'))

  // 분할 모달
  const [splitTx, setSplitTx] = useState<BankTransaction | null>(null)
  const [splitEntries, setSplitEntries] = useState<SplitEntry[]>([
    { description: '', income: 0, expense: 0, category: '' },
  ])
  const [splitting, setSplitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('bank_transactions')
      .select('*')
      .order('transaction_at', { ascending: false })
    setTransactions((data ?? []) as BankTransaction[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)

    try {
      const buffer = await file.arrayBuffer()
      const text = decodeBuffer(buffer)
      const bankType = detectBankType(text)
      const rows = bankType === 'nh' ? parseNH(text) : parseIBK(text)

      let success = 0; let skip = 0
      for (const row of rows) {
        const { error } = await supabase.from('bank_transactions').insert({
          ...row,
          account_info: file.name,
        })
        if (error) { skip++ } else { success++ }
      }
      setUploadResult({ success, skip })
      load()
    } catch (err) {
      alert('CSV 파일 처리 중 오류: ' + String(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(row: BankTransaction) {
    if (!confirm('이 거래 내역을 삭제하시겠습니까?')) return
    await supabase.from('bank_transactions').delete().eq('id', row.id)
    load()
  }

  // 1개 거래 → 다수 출납부 항목 분할 저장
  async function handleSplit(e: React.FormEvent) {
    e.preventDefault()
    if (!splitTx) return
    setSplitting(true)
    try {
      for (const entry of splitEntries) {
        if (!entry.description) continue
        const ledgerEntry: LedgerEntryInsert = {
          entry_date: splitTx.transaction_at.slice(0, 10),
          description: entry.description,
          income: Number(entry.income),
          expense: Number(entry.expense),
          balance: 0,
          bank_transaction_id: splitTx.id,
          category: entry.category || null,
        }
        await supabase.from('ledger_entries').insert(ledgerEntry)
      }
      setSplitTx(null)
      alert('출납부 항목으로 분할 저장 완료')
    } finally {
      setSplitting(false)
    }
  }

  // 월 필터 및 합계
  const filtered = transactions.filter((t) =>
    !filterMonth || t.transaction_at.startsWith(filterMonth)
  )
  const totalDeposit = filtered.reduce((s, t) => s + t.deposit, 0)
  const totalWithdrawal = filtered.reduce((s, t) => s + t.withdrawal, 0)

  const columns: Column<BankTransaction>[] = [
    {
      key: 'transaction_at', label: '거래일시', sortable: true,
      render: (v) => String(v).slice(0, 16).replace('T', ' '),
    },
    {
      key: 'bank_type', label: '은행',
      render: (v) => (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{String(v ?? '-')}</span>
      ),
    },
    {
      key: 'deposit', label: '입금',
      render: (v) => Number(v) > 0 ? <span className="text-blue-700 font-medium">+{Number(v).toLocaleString()}</span> : '-',
    },
    {
      key: 'withdrawal', label: '출금',
      render: (v) => Number(v) > 0 ? <span className="text-red-600 font-medium">-{Number(v).toLocaleString()}</span> : '-',
    },
    { key: 'balance', label: '잔액', render: (v) => Number(v).toLocaleString() + '원' },
    { key: 'description', label: '적요', className: 'max-w-[200px] truncate' },
    { key: 'creditor_name', label: '거래처' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">은행 거래</h2>
            <p className="text-sm text-gray-500 mt-1">농협·기업은행 CSV 업로드 · 출납부 분할 연결</p>
          </div>
          <label className={`flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors min-h-[44px] cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload size={16} />
            {uploading ? '업로드 중...' : 'CSV 업로드'}
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">

      {/* 업로드 결과 */}
      {uploadResult && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center justify-between">
          <span>업로드 완료: 성공 <strong>{uploadResult.success}건</strong> / 건너뜀 {uploadResult.skip}건</span>
          <button onClick={() => setUploadResult(null)} className="text-green-500 hover:text-green-700"><X size={16} /></button>
        </div>
      )}

      {/* 월 필터 + 합계 */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">월</label>
          <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF]" />
          <button onClick={() => setFilterMonth('')} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">전체</button>
        </div>
        <div className="flex gap-3">
          {[
            { label: '총 입금', value: totalDeposit, color: 'text-blue-700' },
            { label: '총 출금', value: totalWithdrawal, color: 'text-red-600' },
            { label: '건수', value: filtered.length, color: 'text-gray-700', suffix: '건' },
          ].map(({ label, value, color, suffix }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-center min-w-[110px]">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-sm font-bold mt-0.5 ${color}`}>
                {typeof value === 'number' && !suffix ? value.toLocaleString() + '원' : value.toLocaleString() + (suffix ?? '')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 안내 */}
      <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
        CSV 파일 형식: 농협(파이프 구분 | EUC-KR) · 기업은행(쉼표 구분 | EUC-KR) 자동 감지. 행의 <strong>분할</strong> 버튼으로 1거래를 다수 출납부 항목으로 기록할 수 있습니다.
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <StandardDataTable
          data={filtered}
          columns={columns}
          searchKeys={['description', 'creditor_name']}
          searchPlaceholder="적요, 거래처 검색"
          emptyMessage="업로드된 거래 내역이 없습니다."
          actions={(row) => (
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setSplitTx(row); setSplitEntries([{ description: row.description ?? '', income: row.deposit, expense: row.withdrawal, category: '' }]) }}
                className="p-1.5 text-gray-400 hover:text-blue-600" title="출납부 분할"
              >
                <Split size={15} />
              </button>
              <button onClick={() => handleDelete(row)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          )}
        />
      )}

      </div>

      {/* 분할 모달 */}
      {splitTx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold">출납부 분할 기록</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {splitTx.transaction_at.slice(0, 10)} · {splitTx.description} ·{' '}
                  {splitTx.deposit > 0 ? `+${splitTx.deposit.toLocaleString()}원` : `-${splitTx.withdrawal.toLocaleString()}원`}
                </p>
              </div>
              <button onClick={() => setSplitTx(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSplit} className="p-6 space-y-3">
              {splitEntries.map((entry, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl p-3">
                  <div className="col-span-4">
                    <input
                      className={ic} placeholder="적요" value={entry.description}
                      onChange={(e) => { const n = [...splitEntries]; n[i].description = e.target.value; setSplitEntries(n) }}
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number" className={ic} placeholder="수입" value={entry.income || ''}
                      onChange={(e) => { const n = [...splitEntries]; n[i].income = Number(e.target.value); setSplitEntries(n) }}
                      min={0}
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number" className={ic} placeholder="지출" value={entry.expense || ''}
                      onChange={(e) => { const n = [...splitEntries]; n[i].expense = Number(e.target.value); setSplitEntries(n) }}
                      min={0}
                    />
                  </div>
                  <div className="col-span-3">
                    <select
                      className={ic} value={entry.category}
                      onChange={(e) => { const n = [...splitEntries]; n[i].category = e.target.value; setSplitEntries(n) }}
                    >
                      <option value="">분류 선택</option>
                      {['운행수입', '기사수당', '유류비', '할부금', '보험료', '수리비', '기타'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {splitEntries.length > 1 && (
                      <button type="button" onClick={() => setSplitEntries(splitEntries.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSplitEntries([...splitEntries, { description: '', income: 0, expense: 0, category: '' }])}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus size={14} /> 항목 추가
              </button>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSplitTx(null)} className="px-5 py-2.5 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px]">취소</button>
                <button type="submit" disabled={splitting} className="px-5 py-2.5 text-sm bg-[#1E40AF] text-white rounded-xl hover:bg-blue-800 disabled:opacity-50 min-h-[44px]">
                  {splitting ? '저장 중...' : '출납부에 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const ic = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent'
