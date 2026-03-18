import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login, register } = useAuth()
  const navigate = useNavigate()

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setSuccessMsg(null)
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setName('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('비밀번호가 일치하지 않습니다.')
        return
      }
      if (password.length < 8) {
        setError('비밀번호는 8자 이상이어야 합니다.')
        return
      }
    }

    setLoading(true)

    if (mode === 'login') {
      const { error } = await login(email, password)
      setLoading(false)
      if (error) {
        const msg = error.message ?? ''
        if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.')
        } else if (msg.includes('Email not confirmed')) {
          setError('이메일 인증이 필요합니다. Supabase 대시보드에서 "Confirm email"을 비활성화하거나 인증 메일을 확인하세요.')
        } else {
          setError(msg || '로그인 중 오류가 발생했습니다.')
        }
      } else {
        navigate('/dashboard')
      }
    } else {
      const { error } = await register(email, password, name)
      setLoading(false)
      if (error) {
        const msg = error.message ?? ''
        if (msg.includes('already registered') || msg.includes('User already registered')) {
          setError('이미 가입된 이메일입니다. 로그인 탭에서 로그인하세요.')
        } else if (msg.includes('over_email_send_rate_limit') || msg.includes('rate limit')) {
          setError('이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도하세요.')
        } else if (msg.includes('Signups not allowed')) {
          setError('회원가입이 비활성화되어 있습니다. Supabase 대시보드 설정을 확인하세요.')
        } else {
          setError(msg || '회원가입 중 오류가 발생했습니다.')
        }
      } else {
        setSuccessMsg('가입 완료! 바로 로그인하세요. (이메일 인증이 비활성화된 경우)')
        setTimeout(() => switchMode('login'), 2000)
      }
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── 왼쪽 브랜딩 패널 ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0B1F3A] flex-col justify-between p-12 relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full border border-white" />
          <div className="absolute top-[10%] right-[10%] w-[400px] h-[400px] rounded-full border border-white" />
          <div className="absolute bottom-[-5%] left-[-5%] w-[400px] h-[400px] rounded-full border border-white" />
        </div>

        {/* 로고 */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-[#1E6FD9] flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M3 17L9 11L13 15L21 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 7H21V11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-lg leading-none">PATHWAY</p>
              <p className="text-[#7BA3CC] text-xs tracking-[0.15em]">PARTNERS</p>
            </div>
          </div>
        </div>

        {/* 메인 카피 */}
        <div className="relative z-10">
          <h2 className="text-4xl font-light text-white leading-tight mb-4">
            투자의 여정을<br />
            <span className="font-semibold text-[#4A9FE0]">체계적으로</span><br />
            관리합니다
          </h2>
          <p className="text-[#7BA3CC] text-sm leading-relaxed max-w-xs">
            출자의향 접수부터 확정, 문서 생성까지<br />
            펀드 운영의 전 과정을 하나의 플랫폼에서.
          </p>

          {/* 기능 태그 */}
          <div className="flex flex-wrap gap-2 mt-8">
            {['펀드 관리', '출자의향 추적', '일정 관리', '문서 자동화'].map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-[#A8C8E8] border border-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 하단 카피라이트 */}
        <div className="relative z-10">
          <p className="text-[#4A6A8A] text-xs">
            © 2026 PATHWAY Partners. Fund Platform v1.0
          </p>
        </div>
      </div>

      {/* ── 오른쪽 폼 패널 ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* 모바일용 로고 */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M3 17L9 11L13 15L21 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-bold text-[#0B1F3A] text-sm tracking-wide">PATHWAY PARTNERS</span>
          </div>

          {/* 탭 */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-8">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-[#0B1F3A] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-white text-[#0B1F3A] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              회원가입
            </button>
          </div>

          {/* 헤딩 */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#0B1F3A]">
              {mode === 'login' ? '환영합니다' : '계정 만들기'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'login'
                ? '계정에 로그인하여 대시보드로 이동하세요'
                : '정보를 입력하여 새 계정을 생성하세요'}
            </p>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                  이름
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="홍길동"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11 border-gray-200 focus:border-[#1E6FD9] focus:ring-[#1E6FD9]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 border-gray-200 focus:border-[#1E6FD9] focus:ring-[#1E6FD9]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === 'signup' ? '8자 이상 입력하세요' : '비밀번호 입력'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="h-11 border-gray-200 focus:border-[#1E6FD9] focus:ring-[#1E6FD9]"
              />
            </div>

            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                  비밀번호 확인
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="비밀번호를 다시 입력하세요"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="h-11 border-gray-200 focus:border-[#1E6FD9] focus:ring-[#1E6FD9]"
                />
              </div>
            )}

            {/* 에러 / 성공 메시지 */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-100">
                <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-green-600">{successMsg}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#0B1F3A] hover:bg-[#1E3A5F] text-white font-medium rounded-lg transition-colors mt-2"
            >
              {loading
                ? (mode === 'login' ? '로그인 중...' : '가입 중...')
                : (mode === 'login' ? '로그인' : '회원가입')}
            </Button>

            {mode === 'login' && (
              <p className="text-xs text-center text-gray-400 pt-2">
                관리자 승인이 필요한 서비스입니다.<br />
                계정 발급 문의:{' '}
                <a href="mailto:admin@pathwaypartners.one" className="text-[#1E6FD9] hover:underline">
                  admin@pathwaypartners.one
                </a>
              </p>
            )}

            {mode === 'signup' && (
              <p className="text-xs text-center text-gray-400 pt-2">
                가입 후 관리자 승인이 있어야 플랫폼을 이용할 수 있습니다.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
