'use client'

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Bus, Shield, Users, BarChart3, KeyRound, ChevronLeft, CheckCircle2 } from 'lucide-react'

const FEATURES = [
  { icon: BarChart3, title: '배차 · 운행 관리',  desc: '실시간 배차 현황 및 스케줄 관리' },
  { icon: Shield,    title: '할부 · 금융 관리',  desc: '차량 할부 및 금전출납부 자동화' },
  { icon: Users,     title: '기사 · 직원 관리',  desc: '역할별 접근 권한 및 수당 관리' },
]

type Mode = 'login' | 'change-pin'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')

  // ── 로그인 상태
  const [loginId, setLoginId] = useState('')
  const [pin, setPin]         = useState('')
  const [showPin, setShowPin] = useState(false)
  const [remember, setRemember] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // ── 비밀번호 변경 상태
  const [cpId, setCpId]           = useState('')
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew]         = useState('')
  const [cpConfirm, setCpConfirm] = useState('')
  const [showCpCurrent, setShowCpCurrent] = useState(false)
  const [showCpNew, setShowCpNew]         = useState(false)
  const [cpError, setCpError]   = useState('')
  const [cpSuccess, setCpSuccess] = useState(false)
  const [cpLoading, setCpLoading] = useState(false)

  // 저장된 로그인 정보 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem('remember_login')
      if (saved) {
        const { login_id, pin_code } = JSON.parse(saved)
        setLoginId(login_id ?? '')
        setPin(pin_code ?? '')
        setRemember(true)
      }
    } catch { /* ignore */ }
  }, [])

  // ── 모드 전환 시 초기화
  function switchMode(next: Mode) {
    setLoginError(''); setCpError(''); setCpSuccess(false)
    setCpId(''); setCpCurrent(''); setCpNew(''); setCpConfirm('')
    setMode(next)
  }

  // ── 로그인
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: loginId, pin_code: pin }),
      })
      const data = await res.json()
      if (!res.ok) { setLoginError(data.error || '로그인 중 오류가 발생했습니다.'); return }

      if (remember) {
        localStorage.setItem('remember_login', JSON.stringify({ login_id: loginId, pin_code: pin }))
      } else {
        localStorage.removeItem('remember_login')
      }
      sessionStorage.setItem('employee', JSON.stringify(data))
      window.location.href = (data.role === 'admin' || data.role === 'staff') ? '/dashboard' : '/schedule'
    } catch {
      setLoginError('로그인 중 오류가 발생했습니다.')
    } finally {
      setLoginLoading(false)
    }
  }

  // ── 비밀번호 변경
  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault()
    setCpError('')
    if (cpNew !== cpConfirm) { setCpError('새 비밀번호가 일치하지 않습니다.'); return }
    if (cpNew.length < 4)    { setCpError('새 비밀번호는 4자리 이상 입력해 주세요.'); return }
    setCpLoading(true)
    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: cpId, current_pin: cpCurrent, new_pin: cpNew }),
      })
      const data = await res.json()
      if (!res.ok) { setCpError(data.error || '변경 중 오류가 발생했습니다.'); return }
      setCpSuccess(true)
      // 저장된 PIN도 갱신
      try {
        const saved = localStorage.getItem('remember_login')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.login_id === cpId) {
            localStorage.setItem('remember_login', JSON.stringify({ login_id: cpId, pin_code: cpNew }))
            setPin(cpNew)
          }
        }
      } catch { /* ignore */ }
    } catch {
      setCpError('변경 중 오류가 발생했습니다.')
    } finally {
      setCpLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── 왼쪽 브랜드 패널 (데스크톱) ── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-shrink-0 relative flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E40AF] to-[#1e3a8a]" />
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute right-8 top-1/3 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -left-16 -bottom-16 w-72 h-72 rounded-full bg-white/5" />

        <div className="relative">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
            <Bus size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">경남전세버스</h1>
          <p className="text-blue-200 text-base">통합 관리 시스템</p>
        </div>

        <div className="relative space-y-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <Icon size={18} className="text-blue-200" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{title}</p>
                <p className="text-blue-300 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative text-blue-400 text-xs">© 2025 경남전세버스. All rights reserved.</p>
      </div>

      {/* ── 오른쪽 폼 영역 ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">

          {/* 모바일 로고 */}
          <div className="lg:hidden text-center mb-10">
            <div className="w-16 h-16 bg-[#1E40AF] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bus size={28} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">경남전세버스</h1>
            <p className="text-sm text-gray-500 mt-1">통합 관리 시스템</p>
          </div>

          {/* ════════════ 로그인 폼 ════════════ */}
          {mode === 'login' && (
            <>
              <div className="hidden lg:block mb-8">
                <h2 className="text-2xl font-bold text-gray-900">로그인</h2>
                <p className="text-gray-500 text-sm mt-1">계정 정보를 입력하세요</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">아이디</label>
                  <input
                    type="text"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="아이디 입력"
                    required
                    autoComplete="username"
                    className={ic}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">비밀번호 (PIN)</label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="PIN 번호 입력"
                      required
                      inputMode="numeric"
                      autoComplete="current-password"
                      className={ic + ' pr-12'}
                    />
                    <button type="button" onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                      {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <input type="checkbox" id="remember" checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 accent-[#1E40AF] cursor-pointer" />
                  <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer select-none">
                    로그인 정보 저장
                  </label>
                </div>

                {loginError && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{loginError}</p>}

                <button type="submit" disabled={loginLoading}
                  className="w-full py-3.5 bg-[#1E40AF] text-white text-base font-semibold rounded-xl hover:bg-blue-800 active:bg-blue-900 transition-colors disabled:opacity-50 min-h-[52px]">
                  {loginLoading ? '로그인 중...' : '로그인'}
                </button>
              </form>

              {/* 비밀번호 변경 링크 */}
              <div className="mt-6 text-center">
                <button onClick={() => switchMode('change-pin')}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1E40AF] transition-colors">
                  <KeyRound size={14} />
                  비밀번호 변경
                </button>
              </div>
            </>
          )}

          {/* ════════════ 비밀번호 변경 폼 ════════════ */}
          {mode === 'change-pin' && (
            <>
              <div className="hidden lg:flex items-center gap-3 mb-8">
                <button onClick={() => switchMode('login')}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">비밀번호 변경</h2>
                  <p className="text-gray-500 text-sm mt-0.5">현재 비밀번호 확인 후 변경됩니다</p>
                </div>
              </div>

              {/* 모바일 헤더 */}
              <div className="lg:hidden flex items-center gap-2 mb-8">
                <button onClick={() => switchMode('login')}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700">
                  <ChevronLeft size={20} />
                </button>
                <span className="font-bold text-gray-900">비밀번호 변경</span>
              </div>

              {cpSuccess ? (
                /* 변경 완료 */
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} className="text-green-600" />
                  </div>
                  <p className="font-bold text-gray-900 text-lg mb-1">변경 완료!</p>
                  <p className="text-sm text-gray-500 mb-6">새 비밀번호로 로그인해 주세요.</p>
                  <button onClick={() => switchMode('login')}
                    className="w-full py-3.5 bg-[#1E40AF] text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors min-h-[52px]">
                    로그인 화면으로
                  </button>
                </div>
              ) : (
                <form onSubmit={handleChangePin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">아이디</label>
                    <input type="text" value={cpId} onChange={(e) => setCpId(e.target.value)}
                      placeholder="아이디 입력" required autoComplete="username" className={ic} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">현재 비밀번호</label>
                    <div className="relative">
                      <input
                        type={showCpCurrent ? 'text' : 'password'}
                        value={cpCurrent}
                        onChange={(e) => setCpCurrent(e.target.value)}
                        placeholder="현재 PIN 입력"
                        required
                        inputMode="numeric"
                        className={ic + ' pr-12'}
                      />
                      <button type="button" onClick={() => setShowCpCurrent(!showCpCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                        {showCpCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">새 비밀번호</label>
                    <div className="relative">
                      <input
                        type={showCpNew ? 'text' : 'password'}
                        value={cpNew}
                        onChange={(e) => setCpNew(e.target.value)}
                        placeholder="새 PIN 입력 (4자리 이상)"
                        required
                        inputMode="numeric"
                        className={ic + ' pr-12'}
                      />
                      <button type="button" onClick={() => setShowCpNew(!showCpNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                        {showCpNew ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">새 비밀번호 확인</label>
                    <input
                      type="password"
                      value={cpConfirm}
                      onChange={(e) => setCpConfirm(e.target.value)}
                      placeholder="새 PIN 재입력"
                      required
                      inputMode="numeric"
                      className={ic}
                    />
                  </div>

                  {cpError && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{cpError}</p>}

                  <button type="submit" disabled={cpLoading}
                    className="w-full py-3.5 bg-[#1E40AF] text-white text-base font-semibold rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-50 min-h-[52px]">
                    {cpLoading ? '변경 중...' : '비밀번호 변경'}
                  </button>

                  <div className="text-center">
                    <button type="button" onClick={() => switchMode('login')}
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                      취소
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}

const ic = 'w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:border-transparent transition-shadow'
