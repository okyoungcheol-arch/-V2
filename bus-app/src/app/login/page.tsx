'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loginId, setLoginId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // employees 테이블에서 login_id로 직원 조회
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('id, name, role, pin_code, auth_user_id, status')
        .eq('login_id', loginId)
        .eq('status', '재직')
        .single()

      if (empError || !employee) {
        setError('아이디를 확인해 주세요.')
        return
      }

      if (employee.pin_code !== pin) {
        setError('비밀번호(PIN)가 올바르지 않습니다.')
        return
      }

      // auth_user_id가 연결된 경우 Supabase Auth 로그인
      if (employee.auth_user_id) {
        // 세션 쿠키 기반 로그인 처리
        // 실제 배포 시 별도 RPC 함수로 처리 권장
      }

      // 역할에 따라 리다이렉트
      if (employee.role === 'admin' || employee.role === 'staff') {
        router.push('/dashboard')
      } else {
        router.push('/schedule')
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1E40AF] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1E40AF] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">버</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">경남전세버스</h1>
          <p className="text-sm text-gray-500 mt-1">통합 관리 시스템</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* 아이디 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              아이디
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="아이디 입력"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              비밀번호 (PIN)
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN 번호 입력"
              required
              inputMode="numeric"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent"
            />
          </div>

          {/* 오류 메시지 */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#1E40AF] text-white text-base font-semibold rounded-xl hover:bg-blue-800 active:bg-blue-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px]"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
