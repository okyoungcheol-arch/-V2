'use server'

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface DispatchItem {
  id: string
  operation_date: string
  departure_time: string | null   // 노선.default_departure_time
  origin: string | null           // 노선.origin
  plate_number: string | null
  destination: string | null      // 노선.destination
}

// 노선 테이블: 출발시간·출발지·도착지 모두 여기서 가져옴
type RouteRow = {
  route_code: string
  default_departure_time: string | null
  origin: string | null
  destination: string | null
}

type RawDispatch = {
  id: string
  operation_date: string
  route_code: string | null
  plate_number: string | null
}

async function getRouteMap(): Promise<Map<string, RouteRow>> {
  const { data } = await supabase
    .from('routes')
    .select('route_code, default_departure_time, origin, destination')
  return new Map((data ?? []).map((r: RouteRow) => [r.route_code, r]))
}

function enrich(rows: RawDispatch[], routeMap: Map<string, RouteRow>): DispatchItem[] {
  return rows.map((d) => {
    const route = d.route_code ? routeMap.get(d.route_code) : null
    return {
      id:             d.id,
      operation_date: d.operation_date,
      departure_time: route?.default_departure_time ?? null,
      origin:         route?.origin ?? null,
      plate_number:   d.plate_number,
      destination:    route?.destination ?? null,
    }
  })
}

// 오늘 배차 조회: 배차.운행일자=오늘, 노선코드로 노선 조인
export async function fetchTodayDispatches(plate4?: string): Promise<DispatchItem[]> {
  const today = new Date().toISOString().slice(0, 10)
  const routeMap = await getRouteMap()

  const { data, error } = await supabase
    .from('dispatches')
    .select('id, operation_date, route_code, plate_number')
    .eq('operation_date', today)
    .neq('status', '취소')
    .not('route_code', 'is', null)
    .order('plate_number')

  if (error) throw new Error(error.message)

  const rows = enrich((data ?? []) as RawDispatch[], routeMap)
  const sorted = rows.sort((a, b) =>
    (a.departure_time ?? '99:99').localeCompare(b.departure_time ?? '99:99')
  )

  if (plate4?.trim()) {
    return sorted.filter((d) => d.plate_number?.endsWith(plate4.trim()) ?? false)
  }
  return sorted
}

// 운행결과 조회: 년월 + 차량번호(끝 4자리), 노선코드로 노선 조인
export async function fetchMonthDispatches(month: string, plate4: string): Promise<DispatchItem[]> {
  if (!plate4.trim()) return []

  const [year, mon] = month.split('-').map(Number)
  const start   = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const end     = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const routeMap = await getRouteMap()

  const { data, error } = await supabase
    .from('dispatches')
    .select('id, operation_date, route_code, plate_number')
    .gte('operation_date', start)
    .lte('operation_date', end)
    .neq('status', '취소')
    .not('route_code', 'is', null)
    .order('operation_date')

  if (error) throw new Error(error.message)

  const rows = enrich((data ?? []) as RawDispatch[], routeMap)
  return rows
    .filter((d) => d.plate_number?.endsWith(plate4.trim()) ?? false)
    .sort((a, b) => {
      const dateCmp = a.operation_date.localeCompare(b.operation_date)
      if (dateCmp !== 0) return dateCmp
      return (a.departure_time ?? '99:99').localeCompare(b.departure_time ?? '99:99')
    })
}
