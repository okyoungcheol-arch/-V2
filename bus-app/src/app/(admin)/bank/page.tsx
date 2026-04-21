'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { BankTransaction } from '@/types/database'
import { fetchBankTransactions, fetchExistingTransactions, insertBankTransactions } from './actions'
import StandardDataTable, { Column } from '@/components/StandardDataTable'
import { Upload, BookOpen, Download } from 'lucide-react'
import { format } from 'date-fns'

// ── CSV 파싱 유틸 ──────────────────────────────────────────────

function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8'
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    if (/[가-힣]/.test(decoded)) return 'utf-8'
  } catch { /* invalid UTF-8 → EUC-KR */ }
  return 'euc-kr'
}

function decodeBuffer(buffer: ArrayBuffer): string {
  const enc = detectEncoding(buffer)
  if (enc === 'utf-8') {
    const bytes = new Uint8Array(buffer)
    const start = (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) ? 3 : 0
    return new TextDecoder('utf-8').decode(buffer.slice(start))
  }
  try { return new TextDecoder('euc-kr').decode(buffer) }
  catch { return new TextDecoder('utf-8').decode(buffer) }
}

function parseCSVLine(line: string): string[] {
  const cols: string[] = []
  let cur = '', inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  cols.push(cur.trim())
  return cols
}

function normalizeTime(raw: string): string {
  const t = raw.trim().replace(/:/g, '')
  let h = 0, m = 0, s = 0
  if (t.length === 6)      { h = +t.slice(0,2); m = +t.slice(2,4); s = +t.slice(4,6) }
  else if (t.length === 4) { h = +t.slice(0,2); m = +t.slice(2,4) }
  else if (t.length === 3) { h = +t[0];         m = +t.slice(1,3) }
  else if (t.length <= 2)  { h = +t }
  if (h > 23 || m > 59 || s > 59 || isNaN(h) || isNaN(m) || isNaN(s)) return '00:00:00'
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

interface ParsedRow {
  transaction_date: string      // YYYY-MM-DD
  transaction_time: string      // HH:MM:SS
  deposit: number
  withdrawal: number
  balance: number
  description: string
  memo: string                  // 기재내용/메모
  branch: string                // 거래점
  counterpart_account: string   // 상대계좌번호
  counterpart_bank: string      // 상대은행
  counterpart_name: string      // 상대계좌예금주명
  bank_name: string
  bank_code: string             // '1'=NH농협, '2'=IBK기업은행
}

// NH농협: 헤더명 기반 동적 컬럼 탐지
function parseNH(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: ParsedRow[] = []

  let headerIdx = -1
  let colMap: Record<string, number> = {}
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = parseCSVLine(lines[i])
    const found = cols.findIndex((c) => c.includes('거래일자') || c.includes('일자'))
    if (found >= 0) {
      headerIdx = i
      cols.forEach((c, idx) => { colMap[c.trim()] = idx })
      break
    }
  }

  const useFixed = headerIdx < 0
  const iDate    = useFixed ? 1 : (colMap['거래일자'] ?? colMap['일자'] ?? 1)
  const iWith    = useFixed ? 2 : (colMap['출금금액'] ?? colMap['출금'] ?? 2)
  const iDep     = useFixed ? 3 : (colMap['입금금액'] ?? colMap['입금'] ?? 3)
  const iBal     = useFixed ? 4 : (colMap['잔액'] ?? 4)
  const iDesc    = useFixed ? 5 : (colMap['적요'] ?? colMap['거래내용'] ?? colMap['내용'] ?? 5)
  const iMemo    = useFixed ? 6 : (colMap['기재내용'] ?? colMap['거래기록사항'] ?? colMap['메모'] ?? -1)
  const iTime    = useFixed ? 8 : (colMap['거래시간'] ?? colMap['시간'] ?? -1)
  const iBranch  = useFixed ? -1 : (colMap['거래점'] ?? -1)
  const iCpAcct  = useFixed ? -1 : (colMap['상대계좌번호'] ?? -1)
  const iCpName  = useFixed ? -1 : (colMap['상대계좌예금주명'] ?? colMap['예금주명'] ?? -1)

  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0
  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (!cols[0] || !/^\d+$/.test(cols[0].trim())) continue

    const rawDate = (cols[iDate] || '').replace(/\//g, '-').trim()
    const [datePart, inlineTime] = rawDate.split(' ')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) continue

    const timeStr = iTime >= 0 && cols[iTime]
      ? normalizeTime(cols[iTime])
      : inlineTime
        ? normalizeTime(inlineTime)
        : '00:00:00'

    rows.push({
      transaction_date:   datePart,
      transaction_time:   timeStr,
      withdrawal:         Number((cols[iWith] || '0').replace(/,/g, '')),
      deposit:            Number((cols[iDep]  || '0').replace(/,/g, '')),
      balance:            Number((cols[iBal]  || '0').replace(/,/g, '')),
      description:        cols[iDesc] || '',
      memo:               iMemo >= 0 ? (cols[iMemo] || '') : '',
      branch:             iBranch >= 0 ? (cols[iBranch] || '') : '',
      counterpart_account: iCpAcct >= 0 ? (cols[iCpAcct] || '') : '',
      counterpart_bank:   '',
      counterpart_name:   iCpName >= 0 ? (cols[iCpName] || '') : '',
      bank_name: '농협', bank_code: '1',
    })
  }
  return rows
}

// IBK기업은행: 헤더 동적 탐지 후 컬럼 매핑
function parseIBK(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: ParsedRow[] = []

  // 헤더 행 탐지 (거래일시 or 거래일자 컬럼 포함 행)
  let headerIdx = -1
  let colMap: Record<string, number> = {}
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = parseCSVLine(lines[i])
    const found = cols.findIndex((c) => c.includes('거래일시') || c.includes('거래일자'))
    if (found >= 0) {
      headerIdx = i
      cols.forEach((c, idx) => { colMap[c.trim()] = idx })
      break
    }
  }

  // 헤더 미탐지 시 고정 인덱스 사용 (기존 방식)
  const useFixed = headerIdx < 0
  const iDate  = useFixed ? 1  : (colMap['거래일시'] ?? colMap['거래일자'] ?? 1)
  const iWith  = useFixed ? 2  : (colMap['출금금액'] ?? colMap['출금'] ?? 2)
  const iDep   = useFixed ? 3  : (colMap['입금금액'] ?? colMap['입금'] ?? 3)
  const iBal   = useFixed ? 4  : (colMap['잔액'] ?? 4)
  const iDesc  = useFixed ? 5  : (colMap['거래내용'] ?? colMap['적요'] ?? colMap['내용'] ?? 5)
  const iCpName = useFixed ? 12 : (colMap['상대계좌예금주명'] ?? colMap['예금주명'] ?? colMap['거래상대방'] ?? -1)

  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0
  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (!/^\d+$/.test(cols[0]?.trim() ?? '')) continue
    if (cols.length < 5) continue

    // 날짜 형식 정규화: YYYY/MM/DD → YYYY-MM-DD
    const rawDate = (cols[iDate] || '').replace(/\//g, '-').trim()
    const [datePart, timePart] = rawDate.split(' ')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) continue

    rows.push({
      transaction_date:    datePart,
      transaction_time:    timePart ? normalizeTime(timePart) : '00:00:00',
      withdrawal:          Number((cols[iWith]  || '0').replace(/,/g, '')),
      deposit:             Number((cols[iDep]   || '0').replace(/,/g, '')),
      balance:             Number((cols[iBal]   || '0').replace(/,/g, '')),
      description:         cols[iDesc] || '',
      memo:                '',
      branch:              '',
      counterpart_account: '',
      counterpart_bank:    '',
      counterpart_name:    iCpName >= 0 ? (cols[iCpName] || '') : '',
      bank_name: '기업은행', bank_code: '2',
    })
  }
  return rows
}

function detectBankType(text: string): 'nh' | 'ibk' {
  const sample = text.slice(0, 5000)
  if (sample.includes('입출금거래내역조회') || sample.includes('농협')) return 'nh'
  if (sample.includes('기업은행')) return 'ibk'
  if (sample.includes('거래일시')) return 'ibk'
  if (sample.includes('거래일자')) return 'nh'
  for (const line of text.split('\n')) {
    const cols = parseCSVLine(line)
    if (/^\d+$/.test(cols[0]?.trim()) && cols.length >= 5) return cols[1]?.includes(' ') ? 'ibk' : 'nh'
  }
  return 'nh'
}

// ── 컴포넌트 ───────────────────────────────────────────────────

export default function BankPage() {
  const fileRef    = useRef<HTMLInputElement>(null)
  const fileRefIBK = useRef<HTMLInputElement>(null)

  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filterMonth,  setFilterMonth]  = useState(format(new Date(), 'yyyy-MM'))
  const [uploading,    setUploading]    = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: number; skip: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchBankTransactions()
      setTransactions(data)
    } catch (err) {
      alert('조회 오류: ' + String(err))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── CSV 내보내기
  function escapeCSVCell(value: string | number | null | undefined) {
    if (value == null) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  function exportToCSV(rows: BankTransaction[]) {
    const headers = ['거래ID', '은행', '계좌번호', '거래일자', '거래시각', '적요', '출금액(원)', '입금액(원)', '잔액(원)', '거래점', '상대계좌번호', '상대은행', '상대계좌예금주명', '메모', '정산월', '비고']
    const csvRows = [headers.join(',')]
    for (const row of rows) {
      csvRows.push([
        escapeCSVCell(row.bank_id),
        escapeCSVCell(row.bank_name),
        escapeCSVCell(row.account_number),
        escapeCSVCell(row.transaction_date),
        escapeCSVCell(row.transaction_time?.slice(0,5) ?? ''),
        escapeCSVCell(row.description),
        escapeCSVCell(row.withdrawal),
        escapeCSVCell(row.deposit),
        escapeCSVCell(row.balance),
        escapeCSVCell(row.branch),
        escapeCSVCell(row.counterpart_account),
        escapeCSVCell(row.counterpart_bank),
        escapeCSVCell(row.counterpart_name),
        escapeCSVCell(row.memo),
        escapeCSVCell(row.settlement_month),
        escapeCSVCell(row.notes),
      ].join(','))
    }
    const csvText = '﻿' + csvRows.join('\r\n')
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bank_transactions_${filterMonth || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, forcedBank?: 'nh' | 'ibk') {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadResult(null)
    try {
      const buffer  = await file.arrayBuffer()
      const text    = decodeBuffer(buffer)
      const bType   = forcedBank ?? detectBankType(text)
      const rawRows = bType === 'nh' ? parseNH(text) : parseIBK(text)
      if (rawRows.length === 0) {
        const sample = text.split('\n').slice(0, 5).map((l, i) => {
          const cols = parseCSVLine(l.trim())
          return `[${i}] (${cols.length}컬럼) ${cols.slice(0,6).join(' | ')}`
        }).join('\n')
        alert(`파싱된 데이터가 없습니다.\n감지된 은행: ${bType === 'nh' ? '농협' : '기업은행'}\n\n첫 5행 미리보기:\n${sample}`)
        return
      }

      // 1. 오름차순 정렬
      const sorted = [...rawRows].sort((a, b) => {
        const ak = `${a.transaction_date}T${a.transaction_time}`
        const bk = `${b.transaction_date}T${b.transaction_time}`
        return ak.localeCompare(bk)
      })

      // 2. 배치 내 중복 제거 (거래일자+시각+잔액 기준)
      const batchSeen = new Set<string>()
      const deduped = sorted.filter((r) => {
        const k = `${r.transaction_date}T${r.transaction_time}|${r.balance}`
        if (batchSeen.has(k)) return false
        batchSeen.add(k); return true
      })

      // 3. DB 기존 데이터 조회 (해당 날짜 범위)
      const dates = [...new Set(deduped.map((r) => r.transaction_date))].sort()
      const existing = await fetchExistingTransactions(dates[0], dates[dates.length - 1])

      // 4. DB 중복 키셋 생성
      const existSet = new Set((existing ?? []).map((t) =>
        `${String(t.transaction_date)}T${t.transaction_time || '00:00:00'}|${t.balance}`
      ))

      // 5. 기존 bank_id 기반 일련번호 카운터 초기화 (날짜별)
      const seqMap: Record<string, number> = {}
      for (const t of existing ?? []) {
        if (!t.bank_id) continue
        const m = (t.bank_id as string).match(/^BX(\d{8})(\d{3})_(\d)$/)
        if (m) {
          seqMap[m[1]] = Math.max(seqMap[m[1]] ?? 0, parseInt(m[2]))
        }
      }

      // 6. 신규 행만 추출
      const toInsert = deduped.filter((r) =>
        !existSet.has(`${r.transaction_date}T${r.transaction_time}|${r.balance}`)
      )
      const skip = deduped.length - toInsert.length

      if (toInsert.length === 0) {
        alert(`저장할 신규 데이터가 없습니다. (${deduped.length}건 모두 중복)`)
        return
      }

      // 7. bank_id 생성, 정산월 계산 (거래일자 +2개월)
      const payload = toInsert.map((r) => {
        const d   = r.transaction_date.replace(/-/g, '')
        seqMap[d] = (seqMap[d] ?? 0) + 1

        const txDate = new Date(r.transaction_date)
        txDate.setMonth(txDate.getMonth() + 2)
        const settlementMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`

        return {
          bank_id:            `BX${d}${String(seqMap[d]).padStart(3, '0')}_${r.bank_code}`,
          bank_name:          r.bank_name,
          account_number:     file.name,
          transaction_date:   r.transaction_date,
          transaction_time:   r.transaction_time,
          deposit:            r.deposit,
          withdrawal:         r.withdrawal,
          balance:            r.balance,
          description:        r.description,
          memo:               r.memo || null,
          branch:             r.branch || null,
          counterpart_account: r.counterpart_account || null,
          counterpart_bank:   r.counterpart_bank || null,
          counterpart_name:   r.counterpart_name || null,
          settlement_month:   settlementMonth,
        }
      })

      // 8. DB insert
      try {
        await insertBankTransactions(payload as Record<string, unknown>[])
      } catch (err) {
        alert('DB 저장 오류: ' + String(err))
        return
      }

      setUploadResult({ success: toInsert.length, skip })
      // 업로드된 데이터의 첫 번째 월로 필터 이동
      if (toInsert.length > 0) {
        const firstMonth = toInsert[0].transaction_date.slice(0, 7)
        setFilterMonth(firstMonth)
      }
      load()
    } catch (err) {
      alert('CSV 파일 처리 중 오류: ' + String(err))
    } finally {
      setUploading(false)
      if (fileRef.current)    fileRef.current.value = ''
      if (fileRefIBK.current) fileRefIBK.current.value = ''
    }
  }

  // ── 필터·합계
  const filtered = transactions.filter((t) => !filterMonth || t.transaction_date.startsWith(filterMonth))
  const totalDeposit    = filtered.reduce((s, t) => s + t.deposit,    0)
  const totalWithdrawal = filtered.reduce((s, t) => s + t.withdrawal, 0)

  // ── 테이블 컬럼
  const columns: Column<BankTransaction>[] = [
    { key: 'bank_id',          label: '거래ID',    sortable: true,
      render: (v) => <span className="text-xs text-gray-400 font-mono">{String(v ?? '-')}</span> },
    { key: 'bank_name',        label: '은행',      sortable: true,
      render: (v) => <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{String(v ?? '-')}</span> },
    { key: 'transaction_date', label: '거래일자',  sortable: true },
    { key: 'transaction_time', label: '거래시각',  sortable: true,
      render: (v) => v ? String(v).slice(0, 5) : '-' },
    { key: 'deposit',          label: '입금액',    sortable: true,
      render: (v) => Number(v) > 0 ? <span className="text-blue-700 font-medium">+{Number(v).toLocaleString()}</span> : '-' },
    { key: 'withdrawal',       label: '출금액',    sortable: true,
      render: (v) => Number(v) > 0 ? <span className="text-red-600 font-medium">-{Number(v).toLocaleString()}</span> : '-' },
    { key: 'balance',          label: '잔액',      sortable: true,
      render: (v) => Number(v).toLocaleString() + '원' },
    { key: 'description',      label: '적요',      sortable: true, className: 'max-w-[200px] truncate' },
    { key: 'counterpart_name', label: '상대예금주', sortable: true },
    { key: 'memo',             label: '메모',      sortable: true, className: 'max-w-[150px] truncate' },
    { key: 'settlement_month', label: '정산월',    sortable: true },
  ]

  return (
    <div className="flex flex-col h-full">

      {/* 페이지 헤더 — 틀고정 */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">은행 거래</h2>
            <p className="text-sm text-gray-500 mt-1">농협·기업은행 CSV 업로드 · 출납부 연결</p>
          </div>
          <div className="flex items-center gap-2">
            <label className={`flex items-center gap-2 px-4 py-2.5 bg-[#1E40AF] text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors min-h-[44px] cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload size={16} />
              {uploading ? '업로드 중...' : '농협 업로드'}
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => handleFileUpload(e, 'nh')} />
            </label>
            <label className={`flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors min-h-[44px] cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload size={16} />
              {uploading ? '업로드 중...' : '기업은행 업로드'}
              <input ref={fileRefIBK} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => handleFileUpload(e, 'ibk')} />
            </label>
            <button
              onClick={() => exportToCSV(filtered)}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              <Download size={16} />
              CSV 내보내기
            </button>
            <button
              disabled
              title="다음 버전에서 지원 예정"
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-400 text-sm font-medium rounded-xl min-h-[44px] cursor-not-allowed"
            >
              <BookOpen size={16} />
              금전출납
            </button>
          </div>
        </div>
      </div>

      {/* 필터·합계·테이블 영역 — 내부 스크롤 */}
      <div className="flex-1 min-h-0 flex flex-col px-8 py-6 gap-4">

        {uploadResult && (
          <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center justify-between">
            <span>업로드 완료: <strong>{uploadResult.success}건</strong> 저장 / <strong>{uploadResult.skip}건</strong> 중복 건너뜀</span>
            <button onClick={() => setUploadResult(null)} className="text-green-500 hover:text-green-700 text-lg leading-none">×</button>
          </div>
        )}

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
              { label: '총 입금', value: totalDeposit,    color: 'text-blue-700' },
              { label: '총 출금', value: totalWithdrawal, color: 'text-red-600' },
              { label: '건수',    value: filtered.length, color: 'text-gray-700', suffix: '건' },
            ].map(({ label, value, color, suffix }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-center min-w-[110px]">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-sm font-bold mt-0.5 ${color}`}>
                  {suffix ? value.toLocaleString() + suffix : value.toLocaleString() + '원'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 테이블 — 데이터 영역만 스크롤 */}
        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="text-center py-20 text-gray-400">불러오는 중...</div>
          ) : (
            <StandardDataTable
              data={filtered}
              columns={columns}
              searchKeys={['description', 'counterpart_name', 'memo']}
              searchPlaceholder="적요, 상대예금주, 메모 검색"
              emptyMessage="업로드된 거래 내역이 없습니다."
              fillHeight
            />
          )}
        </div>
      </div>
    </div>
  )
}
