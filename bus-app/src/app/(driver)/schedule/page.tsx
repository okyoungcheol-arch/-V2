'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Car, Save } from 'lucide-react'
import { fetchTodayDispatches, fetchMonthDispatches, DispatchItem } from './actions'

type Tab = 'today' | 'history'

function getPlateKey(loginId: string) { return `schedule_plate4_${loginId}` }

function getLoginId(): string {
  try {
    const emp = sessionStorage.getItem('employee')
    if (emp) return JSON.parse(emp).login_id ?? ''
  } catch { /* ignore */ }
  return ''
}

const TH = 'px-3 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50 whitespace-nowrap'
const TD = 'px-3 py-2.5 text-sm text-gray-800 whitespace-nowrap'

export default function SchedulePage() {
  const [tab, setTab]         = useState<Tab>('today')
  const [loginId, setLoginId] = useState('')
  const [plate4, setPlate4]   = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  const [todayRows,    setTodayRows]    = useState<DispatchItem[]>([])
  const [todayLoading, setTodayLoading] = useState(false)

  const [historyMonth,   setHistoryMonth]   = useState(format(new Date(), 'yyyy-MM'))
  const [historyRows,    setHistoryRows]    = useState<DispatchItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadToday = useCallback(async (p4: string) => {
    setTodayLoading(true)
    try { setTodayRows(await fetchTodayDispatches(p4 || undefined)) }
    catch (err) { alert('조회 오류: ' + String(err)) }
    setTodayLoading(false)
  }, [])

  const loadHistory = useCallback(async (month: string, p4: string) => {
    setHistoryLoading(true)
    try { setHistoryRows(await fetchMonthDispatches(month, p4)) }
    catch (err) { alert('조회 오류: ' + String(err)) }
    setHistoryLoading(false)
  }, [])

  // 초기 로드
  useEffect(() => {
    const id = getLoginId()
    setLoginId(id)
    const saved = localStorage.getItem(getPlateKey(id)) ?? ''
    setPlate4(saved)
    loadToday(saved)
  }, [loadToday])

  // 탭2 전환 시 자동 조회
  useEffect(() => {
    if (tab === 'history') loadHistory(historyMonth, plate4)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // 년월·차량번호 변경 시 자동 재조회 (탭2 활성 상태일 때만)
  useEffect(() => {
    if (tab === 'history') loadHistory(historyMonth, plate4)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyMonth, plate4])

  function handleSave() {
    localStorage.setItem(getPlateKey(loginId), plate4)
    setSaveMsg('저장되었습니다')
    setTimeout(() => setSaveMsg(''), 2000)
    loadToday(plate4)
  }

  const todayLabel = format(new Date(), 'yyyy년 M월 d일 (EEE)', { locale: ko })

  return (
    <div className="flex flex-col h-full">

      {/* 탭 헤더 */}
      <div className="flex bg-white border-b border-gray-200 flex-shrink-0">
        {([['today', '오늘 배차조회', '#1E40AF', '#16A34A'], ['history', '운행결과 조회', '#16A34A', '#1E40AF']] as [Tab, string, string, string][]).map(([t, label, activeColor]) => (
          <button key={t} onClick={() => setTab(t as Tab)}
            className={`flex-1 py-4 text-sm font-semibold transition-colors relative ${tab === t ? '' : 'text-gray-500'}`}
            style={tab === t ? { color: activeColor } : undefined}
          >
            {label}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: activeColor }} />}
          </button>
        ))}
      </div>

      {/* ── 탭1: 오늘 배차조회 ── */}
      {tab === 'today' && (
        <div className="flex-1 flex flex-col min-h-0">

          {/* 입력 영역 */}
          <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-400 mb-2 text-center">{todayLabel}</p>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">차량번호 뒤 4자리</label>
              <input
                type="text"
                value={plate4}
                onChange={(e) => { setPlate4(e.target.value.replace(/\D/g, '').slice(0, 4)); loadToday(e.target.value.replace(/\D/g, '').slice(0, 4)) }}
                placeholder="전체"
                maxLength={4}
                inputMode="numeric"
                className="w-20 px-3 py-2 border border-gray-300 rounded-xl text-base font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1E40AF] text-center min-h-[44px]"
              />
              <button onClick={handleSave}
                className="flex items-center gap-1 px-3 py-2 bg-[#1E40AF] text-white text-xs font-semibold rounded-xl min-h-[44px] active:bg-blue-900 transition-colors">
                <Save size={14} /> 저장
              </button>
              {saveMsg && <span className="text-xs text-green-600 font-medium">{saveMsg}</span>}
            </div>
          </div>

          {/* 테이블 */}
          <div className="flex-1 overflow-auto">
            {todayLoading ? (
              <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
            ) : todayRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Car size={36} className="mb-3 text-gray-200" />
                <p className="text-sm">오늘 배차 내역이 없습니다.</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={TH}>차량번호</th>
                    <th className={TH}>출발시간</th>
                    <th className={TH}>출발지</th>
                    <th className={TH}>도착지</th>
                  </tr>
                </thead>
                <tbody>
                  {todayRows.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                      <td className={`${TD} font-semibold text-[#1E40AF]`}>{d.plate_number ?? '-'}</td>
                      <td className={`${TD} font-medium`}>{d.departure_time ? d.departure_time.slice(0, 5) : '-'}</td>
                      <td className={TD}>{d.origin ?? '-'}</td>
                      <td className={TD}>{d.destination ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 건수 */}
          {!todayLoading && todayRows.length > 0 && (
            <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-right">{todayRows.length}건</p>
            </div>
          )}
        </div>
      )}

      {/* ── 탭2: 운행결과 조회 ── */}
      {tab === 'history' && (
        <div className="flex-1 flex flex-col min-h-0">

          {/* 입력 영역 */}
          <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">조회 년월</label>
                <input
                  type="month"
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E40AF] min-h-[44px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">차량번호 뒤 4자리</label>
                <input
                  type="text"
                  value={plate4}
                  onChange={(e) => setPlate4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="전체"
                  maxLength={4}
                  inputMode="numeric"
                  className="w-20 px-3 py-2 border border-gray-300 rounded-xl text-base font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1E40AF] text-center min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* 테이블 */}
          <div className="flex-1 overflow-auto">
            {historyLoading ? (
              <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
            ) : !plate4.trim() ? (
              <div className="text-center py-16 text-gray-400 text-sm">차량번호를 입력하세요.</div>
            ) : historyRows.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">운행 내역이 없습니다.</div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={TH}>일자</th>
                    <th className={TH}>출발시간</th>
                    <th className={TH}>출발지</th>
                    <th className={TH}>도착지</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                      <td className={`${TD} font-semibold`}>
                        {format(new Date(d.operation_date + 'T00:00:00'), 'M/d (EEE)', { locale: ko })}
                      </td>
                      <td className={`${TD} font-medium`}>{d.departure_time ? d.departure_time.slice(0, 5) : '-'}</td>
                      <td className={TD}>{d.origin ?? '-'}</td>
                      <td className={TD}>{d.destination ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 건수 */}
          {!historyLoading && historyRows.length > 0 && (
            <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-right">{historyMonth} · {plate4} · {historyRows.length}건</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
