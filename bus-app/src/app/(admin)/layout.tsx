'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  MapPin,
  CreditCard,
  Landmark,
  BookOpen,
  Car,
  Users,
  Building2,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',    label: '대시보드',  icon: LayoutDashboard },
  { href: '/dispatches',   label: '배차관리',  icon: CalendarDays },
  { href: '/installments', label: '할부관리',  icon: CreditCard },
  { href: '/bank',         label: '은행거래',  icon: Landmark },
  { href: '/ledger',       label: '금전출납부', icon: BookOpen },
  { href: '/routes',       label: '노선관리',  icon: MapPin },
  { href: '/vehicles',     label: '차량관리',  icon: Car },
  { href: '/employees',    label: '직원관리',  icon: Users },
  { href: '/clients',      label: '고객사',    icon: Building2 },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    sessionStorage.removeItem('employee')
    window.location.href = '/login'
  }

  return (
    <div className="flex h-full">
      {/* 사이드바 */}
      <aside
        className={`flex-shrink-0 flex flex-col bg-[#1E40AF] text-white transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* 로고 + 토글 버튼 */}
        <div className="flex items-center justify-between px-3 py-5 border-b border-blue-700 min-h-[72px]">
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <h1 className="text-lg font-bold leading-tight truncate">경남전세버스</h1>
              <p className="text-xs text-blue-200 mt-0.5">통합 관리 시스템</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-blue-200 hover:bg-blue-700 hover:text-white transition-colors flex-shrink-0"
            title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`flex items-center gap-3 py-3 text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center px-0' : 'px-5'
                } ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100 hover:bg-blue-700/60 hover:text-white'
                }`}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* 로그아웃 */}
        <div className="p-3 border-t border-blue-700">
          <button
            onClick={handleLogout}
            title="로그아웃"
            className={`flex items-center gap-3 w-full px-2 py-2.5 text-sm text-blue-100 hover:text-white hover:bg-blue-700/60 rounded-md transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut size={18} className="flex-shrink-0" />
            {!collapsed && <span>로그아웃</span>}
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-hidden bg-gray-50">
        {children}
      </main>
    </div>
  )
}
