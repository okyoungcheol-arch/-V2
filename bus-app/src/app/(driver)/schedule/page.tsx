'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dispatch } from '@/types/database'
import { format, addDays, isToday, isTomorrow, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { MapPin, Clock, Car, CheckCircle2, Circle } from 'lucide-react'

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  '배차':     { bg: 'bg-blue-100',  text: 'text-blue-700',  label: '배차확정' },
  '운행완료': { bg: 'bg-green-100', text: 'text-green-700', label: '운행완료' },
  '취소':     { bg: 'bg-red-100',   text: 'text-red-500',   label: '취소' },
}

function getDayLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return '오늘'
  if (isTomorrow(d)) return '내일'
  return format(d, 'M/d (eee)', { locale: ko })
}

export default function SchedulePage() {
  const supabase = createClient()
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [loading, setLoading] = useState(true)
  const [driverName, setDriverName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // 현재 기사 정보
    const { data: emp } = await supabase
      .from('employees')
      .select('id, name')
      .eq('auth_user_id', user.id)
      .single()

    if (!emp) { setLoading(false); return }
    setDriverName(emp.name)

    // 오늘 ~ 14일 배차 조회 (RLS: 본인 것만)
    const today = format(new Date(), 'yyyy-MM-dd')
    const twoWeeks = format(addDays(new Date(), 13), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('dispatches')
      .select('*, routes(id,route_name,origin,destination), vehicles(id,plate_number,vehicle_type)')
      .eq('driver_id', emp.id)
      .gte('dispatch_date', today)
      .lte('dispatch_date', twoWeeks)
      .order('dispatch_date')
      .order('departure_time')

    setDispatches((data ?? []) as Dispatch[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-gray-400 text-lg">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* 인사말 */}
      <div className="bg-[#1E40AF] text-white rounded-2xl p-5">
        <p className="text-blue-200 text-base">안녕하세요</p>
        <p className="text-2xl font-bold mt-1">{driverName || '기사'} 님 👋</p>
        <p className="text-blue-200 text-sm mt-2">
          {format(new Date(), 'yyyy년 M월 d일 (eee)', { locale: ko })} 기준
        </p>
        <div className="mt-3 bg-white/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-sm font-medium">앞으로 2주 배차</span>
          <span className="text-2xl font-bold">{dispatches.length}건</span>
        </div>
      </div>

      {/* 배차 목록 */}
      {dispatches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <Circle size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-lg font-medium">앞으로 2주 배차가 없습니다.</p>
          <p className="text-gray-400 text-sm mt-1">관리자에게 문의해 주세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dispatches.map((d) => {
            const style = STATUS_STYLE[d.status] ?? STATUS_STYLE['배차']
            const isCompleted = d.status === '운행완료'
            const dateLabel = getDayLabel(d.dispatch_date)
            const isToday_ = isToday(parseISO(d.dispatch_date))

            return (
              <div
                key={d.id}
                className={`bg-white rounded-2xl border-2 p-5 ${
                  isToday_ ? 'border-[#1E40AF]' : 'border-gray-100'
                } ${isCompleted ? 'opacity-70' : ''}`}
              >
                {/* 날짜 + 상태 */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {isCompleted
                      ? <CheckCircle2 size={20} className="text-green-500" />
                      : <Circle size={20} className={isToday_ ? 'text-[#1E40AF]' : 'text-gray-300'} />
                    }
                    <span className={`text-lg font-bold ${isToday_ ? 'text-[#1E40AF]' : 'text-gray-800'}`}>
                      {dateLabel}
                    </span>
                    {isToday_ && (
                      <span className="bg-[#1E40AF] text-white text-xs font-bold px-2 py-0.5 rounded-full">TODAY</span>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </div>

                {/* 노선 정보 */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin size={20} className="text-[#1E40AF] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xl font-bold text-gray-900">
                        {(d.routes as { route_name: string } | null)?.route_name ?? '-'}
                      </p>
                      {(d.routes as unknown as { origin?: string; destination?: string } | null)?.origin && (
                        <p className="text-base text-gray-500 mt-0.5">
                          {(d.routes as unknown as { origin: string; destination: string }).origin}
                          {' → '}
                          {(d.routes as unknown as { origin: string; destination: string }).destination}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Clock size={18} className="text-gray-400" />
                      <span className="text-lg font-semibold text-gray-700">
                        {d.departure_time
                          ? d.departure_time.slice(0, 5)
                          : '시간 미정'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Car size={18} className="text-gray-400" />
                      <span className="text-lg font-semibold text-gray-700">
                        {(d.vehicles as { plate_number: string } | null)?.plate_number ?? '차량 미배정'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 비고 */}
                {d.notes && (
                  <div className="mt-3 bg-amber-50 rounded-xl px-4 py-2.5 text-sm text-amber-700">
                    📌 {d.notes}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
