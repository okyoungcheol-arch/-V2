'use client'

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, Search } from 'lucide-react'

export interface Column<T> {
  key: keyof T | string
  label: string
  sortable?: boolean
  render?: (value: unknown, row: T) => React.ReactNode
  className?: string
}

interface StandardDataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  searchKeys?: (keyof T)[]
  searchPlaceholder?: string
  emptyMessage?: string
  actions?: (row: T) => React.ReactNode
  fillHeight?: boolean  // true 시 부모 높이를 채우며 테이블 내부 스크롤
}

export default function StandardDataTable<T extends { id: string }>({
  data,
  columns,
  searchKeys = [],
  searchPlaceholder = '검색...',
  emptyMessage = '데이터가 없습니다.',
  actions,
  fillHeight = false,
}: StandardDataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const filtered = useMemo(() => {
    let result = [...data]
    if (search && searchKeys.length > 0) {
      const q = search.toLowerCase()
      result = result.filter((row) =>
        searchKeys.some((key) =>
          String(row[key] ?? '').toLowerCase().includes(q)
        )
      )
    }
    if (sortKey) {
      result.sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey]
        const bv = (b as Record<string, unknown>)[sortKey]
        const aStr = String(av ?? '')
        const bStr = String(bv ?? '')
        return sortDir === 'asc'
          ? aStr.localeCompare(bStr, 'ko')
          : bStr.localeCompare(aStr, 'ko')
      })
    }
    return result
  }, [data, search, searchKeys, sortKey, sortDir])

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${fillHeight ? 'h-full min-h-0' : ''}`}>
      {/* 검색 */}
      {searchKeys.length > 0 && (
        <div className="relative w-72 flex-shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
          />
        </div>
      )}

      {/* 테이블 */}
      <div className={`overflow-auto rounded-xl border border-gray-200 bg-white ${fillHeight ? 'flex-1 min-h-0' : ''}`}>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide ${col.className ?? ''}`}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(String(col.key))}
                      className="flex items-center gap-1 hover:text-gray-900"
                    >
                      {col.label}
                      {sortKey === String(col.key) ? (
                        sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      ) : (
                        <ChevronDown size={14} className="text-gray-300" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">작업</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actions ? 1 : 0)}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {columns.map((col) => {
                    const rawValue = (row as Record<string, unknown>)[String(col.key)]
                    return (
                      <td
                        key={String(col.key)}
                        className={`px-4 py-3 text-gray-700 ${col.className ?? ''}`}
                      >
                        {col.render ? col.render(rawValue, row) : String(rawValue ?? '-')}
                      </td>
                    )
                  })}
                  {actions && (
                    <td className="px-4 py-3 text-right">
                      {actions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 결과 수 */}
      <p className="text-xs text-gray-400 text-right flex-shrink-0">
        총 {filtered.length}건
      </p>
    </div>
  )
}
