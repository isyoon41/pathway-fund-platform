/**
 * IntakeFormPage — 비로그인 공개 출자의향서 접수 페이지
 * URL: /intake/:fundCode
 *
 * 외부 투자자가 별도 가입 없이 출자의향을 제출할 수 있는 페이지입니다.
 */

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

// ── 상태 타입 ─────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'not_found' | 'form' | 'submitting' | 'success' | 'error'

interface FundInfo {
  id: string
  name: string
  description: string | null
}

interface FormValues {
  name: string
  email: string
  phone: string
  preferred_contact: string
  amount: string
  notes: string
}

const EMPTY_FORM: FormValues = {
  name: '',
  email: '',
  phone: '',
  preferred_contact: 'email',
  amount: '',
  notes: '',
}

// ── 금액 포매터 (입력 중 콤마 표시) ──────────────────────────────────────────

function formatNumberInput(value: string): string {
  const digits = value.replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10).toLocaleString('ko-KR') : ''
}

function stripCommas(value: string): string {
  return value.replace(/,/g, '')
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function IntakeFormPage() {
  const { fundCode } = useParams<{ fundCode: string }>()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [fund, setFund] = useState<FundInfo | null>(null)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [amountDisplay, setAmountDisplay] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // 펀드 정보 로드
  useEffect(() => {
    if (!fundCode) {
      setPageState('not_found')
      return
    }

    async function loadFund() {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/intake-submit?fund_code=${encodeURIComponent(fundCode ?? '')}`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          },
        )

        if (!res.ok) {
          setPageState('not_found')
          return
        }

        const fundData = await res.json()
        setFund(fundData)
        setPageState('form')
      } catch {
        setPageState('not_found')
      }
    }

    loadFund()
  }, [fundCode])

  // 폼 제출
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fund) return

    setPageState('submitting')
    setErrorMessage('')

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/intake-submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            fund_code: fundCode,
            name: form.name,
            email: form.email,
            phone: form.phone,
            preferred_contact: form.preferred_contact,
            amount: stripCommas(form.amount),
            notes: form.notes,
          }),
        },
      )

      const result = await res.json()

      if (!res.ok) {
        setErrorMessage(result.error ?? '제출 중 오류가 발생했습니다.')
        setPageState('error')
        return
      }

      setPageState('success')
    } catch (err) {
      setErrorMessage('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      setPageState('error')
    }
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
          P
        </div>
        <span className="font-semibold text-gray-900">PATHWAY Partners</span>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          {/* 로딩 */}
          {pageState === 'loading' && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">펀드 정보를 불러오는 중...</p>
            </div>
          )}

          {/* 펀드 없음 */}
          {pageState === 'not_found' && (
            <div className="text-center py-24">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                펀드를 찾을 수 없습니다
              </h2>
              <p className="text-sm text-muted-foreground">
                URL을 다시 확인하거나 담당자에게 문의해 주세요.
              </p>
            </div>
          )}

          {/* 폼 */}
          {(pageState === 'form' || pageState === 'submitting') && fund && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* 펀드 타이틀 */}
              <div className="bg-primary/5 border-b px-6 py-5">
                <p className="text-xs font-medium text-primary uppercase tracking-wide mb-1">
                  출자의향서
                </p>
                <h1 className="text-xl font-bold text-gray-900">{fund.name}</h1>
                {fund.description && (
                  <p className="text-sm text-gray-600 mt-1.5">{fund.description}</p>
                )}
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {/* 이름 */}
                <div className="space-y-1.5">
                  <Label htmlFor="intake-name">
                    이름 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="intake-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    placeholder="홍길동"
                    autoComplete="name"
                  />
                </div>

                {/* 이메일 */}
                <div className="space-y-1.5">
                  <Label htmlFor="intake-email">
                    이메일 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="intake-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                    placeholder="hong@example.com"
                    autoComplete="email"
                  />
                </div>

                {/* 연락처 */}
                <div className="space-y-1.5">
                  <Label htmlFor="intake-phone">연락처</Label>
                  <Input
                    id="intake-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="010-0000-0000"
                    autoComplete="tel"
                  />
                </div>

                {/* 선호 연락 방식 */}
                <div className="space-y-1.5">
                  <Label htmlFor="intake-contact">선호 연락 방식</Label>
                  <Select
                    value={form.preferred_contact}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, preferred_contact: v }))
                    }
                  >
                    <SelectTrigger id="intake-contact">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">이메일</SelectItem>
                      <SelectItem value="phone">전화</SelectItem>
                      <SelectItem value="kakao">카카오톡</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 출자의향금액 */}
                <div className="space-y-1.5">
                  <Label htmlFor="intake-amount">
                    출자의향금액 (원)
                  </Label>
                  <Input
                    id="intake-amount"
                    value={amountDisplay}
                    onChange={(e) => {
                      const formatted = formatNumberInput(e.target.value)
                      setAmountDisplay(formatted)
                      setForm((f) => ({ ...f, amount: stripCommas(formatted) }))
                    }}
                    placeholder="예: 50,000,000"
                    inputMode="numeric"
                  />
                  {amountDisplay && (
                    <p className="text-xs text-muted-foreground">
                      {parseInt(stripCommas(amountDisplay), 10).toLocaleString('ko-KR')}원
                      {parseInt(stripCommas(amountDisplay), 10) >= 100000000 &&
                        ` (${(parseInt(stripCommas(amountDisplay), 10) / 100000000).toFixed(1)}억원)`}
                    </p>
                  )}
                </div>

                {/* 비고 */}
                <div className="space-y-1.5">
                  <Label htmlFor="intake-notes">기타 메시지</Label>
                  <Textarea
                    id="intake-notes"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="문의사항이나 전달 사항이 있으면 입력해주세요."
                    rows={3}
                  />
                </div>

                {/* 안내 문구 */}
                <p className="text-xs text-muted-foreground bg-gray-50 rounded-lg p-3 leading-relaxed">
                  본 양식은 출자 의향을 확인하기 위한 것으로, 법적 구속력이 없습니다.
                  접수 후 담당자가 선호하신 연락 방법으로 연락드릴 예정입니다.
                </p>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={pageState === 'submitting'}
                >
                  {pageState === 'submitting' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      제출 중...
                    </>
                  ) : (
                    '출자의향서 제출'
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* 성공 */}
          {pageState === 'success' && fund && (
            <div className="bg-white rounded-xl border shadow-sm p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                출자의향서가 접수되었습니다
              </h2>
              <p className="text-sm text-gray-600 mb-1">
                <strong>{fund.name}</strong>에 대한 출자의향을 주셔서 감사합니다.
              </p>
              <p className="text-sm text-muted-foreground">
                담당자가 영업일 기준 2~3일 내에 연락드릴 예정입니다.
              </p>
            </div>
          )}

          {/* 오류 */}
          {pageState === 'error' && (
            <div className="bg-white rounded-xl border shadow-sm p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                제출에 실패했습니다
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                {errorMessage || '오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}
              </p>
              <Button variant="outline" onClick={() => setPageState('form')}>
                다시 시도
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="border-t bg-white px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} PATHWAY Partners. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
