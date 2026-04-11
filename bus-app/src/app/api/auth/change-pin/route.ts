import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { login_id, current_pin, new_pin } = await request.json()

  if (!login_id || !current_pin || !new_pin) {
    return NextResponse.json({ error: '모든 항목을 입력해 주세요.' }, { status: 400 })
  }

  if (new_pin.length < 4) {
    return NextResponse.json({ error: '새 비밀번호는 4자리 이상 입력해 주세요.' }, { status: 400 })
  }

  // 현재 PIN 확인
  const { data: employee, error } = await supabaseAdmin
    .from('employees')
    .select('id, pin_code, status')
    .eq('login_id', login_id)
    .eq('status', '재직')
    .single()

  if (error || !employee) {
    return NextResponse.json({ error: '아이디를 확인해 주세요.' }, { status: 401 })
  }

  if (employee.pin_code !== current_pin) {
    return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 새 PIN 저장
  const { error: updateError } = await supabaseAdmin
    .from('employees')
    .update({ pin_code: new_pin })
    .eq('id', employee.id)

  if (updateError) {
    return NextResponse.json({ error: '저장 중 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
