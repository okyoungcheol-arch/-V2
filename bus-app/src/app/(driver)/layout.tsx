'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Wallet } from 'lucide-react'

const tabs = [
  { href: '/schedule', label: '배차 일정', icon: CalendarDays },
  { href: '/earnings', label: '수당 내역', icon: Wallet },
]

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 상단 헤더 */}
      <header className="bg-[#1E40AF] text-white px-4 py-4 flex-shrink-0">
        <h1 className="text-lg font-bold">경남전세버스</h1>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* 하단 탭바 — 최소 44px 터치 영역 */}
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
