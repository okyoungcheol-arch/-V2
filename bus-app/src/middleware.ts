import { NextResponse, type NextRequest } from 'next/server'

// 관리자/직원 전용 경로
const ADMIN_ROUTES = [
  '/dashboard', '/dispatches', '/installments',
  '/bank', '/ledger', '/routes', '/vehicles',
  '/employees', '/clients', '/operations',
]
// 기사 전용 경로
const DRIVER_ROUTES = ['/schedule', '/earnings']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 정적 파일·API·로그인 페이지는 통과
  if (pathname.startsWith('/api/') || pathname === '/login') {
    return NextResponse.next()
  }

  const role = request.cookies.get('emp_role')?.value

  // 미로그인 → 로그인 페이지로
  if (!role) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 루트 → 역할별 홈으로
  if (pathname === '/') {
    const dest = role === 'user' ? '/schedule' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // 기사(user)가 관리자 페이지 접근 시 → /schedule 로
  if (role === 'user' && ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/schedule', request.url))
  }

  // 관리자/직원이 기사 페이지 접근 시 → /dashboard 로
  if ((role === 'admin' || role === 'staff') && DRIVER_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
