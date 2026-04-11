import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  // emp_role 쿠키 삭제
  response.cookies.set('emp_role', '', { path: '/', maxAge: 0 })
  return response
}
