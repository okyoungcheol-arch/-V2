import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Service Role Key — RLS 우회 (서버에서만 실행)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { login_id, pin_code } = await request.json()

  if (!login_id || !pin_code) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력해 주세요.' }, { status: 400 })
  }

  const { data: employee, error } = await supabaseAdmin
    .from('employees')
    .select('id, name, role, pin_code, status')
    .eq('login_id', login_id)
    .eq('status', '재직')
    .single()

  if (error || !employee) {
    return NextResponse.json({ error: '아이디를 확인해 주세요.' }, { status: 401 })
  }

  if (employee.pin_code !== pin_code) {
    return NextResponse.json({ error: '비밀번호(PIN)가 올바르지 않습니다.' }, { status: 401 })
  }

  const response = NextResponse.json({
    id: employee.id,
    name: employee.name,
    role: employee.role,
  })

  // 역할 쿠키 설정 — 미들웨어 접근 제어에 사용
  response.cookies.set('emp_role', employee.role, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7일
    httpOnly: false,           // 클라이언트에서도 읽기 가능
  })

  return response
}
