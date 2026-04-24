'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarDays, Wallet, LogOut } from 'lucide-react'

const tabs = [
  { href: '/schedule', label: '배차관리', icon: CalendarDays },
  { href: '/earnings', label: '수당 내역', icon: Wallet },
]

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [empName, setEmpName] = useState<string>('')

  useEffect(() => {
    try {
      const emp = sessionStorage.getItem('employee')
      if (emp) setEmpName(JSON.parse(emp).name ?? '')
    } catch { /* ignore */ }
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    sessionStorage.removeItem('employee')
    window.location.href = '/login'
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 상단 헤더 */}
      <header className="bg-[#1E40AF] text-white px-4 py-4 flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold leading-tight">경남전세버스</h1>
          {empName && <p className="text-blue-200 text-xs mt-0.5">{empName} 기사님</p>}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-blue-200 hover:text-white transition-colors text-sm min-h-[44px] px-2"
        >
          <LogOut size={18} />
          <span className="text-xs">로그아웃</span>
        </button>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] text-xs font-medium transition-colors ${
                active ? 'text-[#1E40AF]' : 'text-gray-500'
              }`}
            >
              <Icon size={24} />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
