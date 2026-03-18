/**
 * intake-submit: 자체 출자의향서 폼 제출 처리
 *
 * GET  ?fund_code={code}  → 펀드 공개 정보 반환 (비로그인 허용)
 * POST { fund_code, name, email, phone, preferred_contact, amount, notes }
 *      → investor upsert + commitment insert + schedule insert
 *         + Google Spreadsheet 행 추가
 *
 * verify_jwt: false  ← 비로그인 공개 접근 허용
 *
 * 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_KEY — 서비스 계정 JSON
 *   GOOGLE_CALENDAR_ID         — Google Calendar ID (선택)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken } from '../_shared/google-auth.ts'
import { appendSheetRow } from '../_shared/google-drive.ts'

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  const digits = String(raw).replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

function mapPreferredContact(raw: string): string {
  const map: Record<string, string> = {
    이메일: 'email',
    전화: 'phone',
    카카오톡: 'kakao',
    email: 'email',
    phone: 'phone',
    kakao: 'kakao',
  }
  return map[raw?.trim()] ?? 'email'
}

function toKSTDatetime(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date()
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19)
}

// ── Lookup fund by fund_code or id ───────────────────────────────────────────

async function resolveFund(
  supabase: ReturnType<typeof createClient>,
  fundCode: string,
): Promise<{ id: string; name: string; description: string | null } | null> {
  // 1. fund_code로 검색
  const { data: byCode } = await supabase
    .from('funds')
    .select('id, name, description')
    .eq('fund_code', fundCode)
    .single()
  if (byCode) return byCode

  // 2. UUID(id)로 fallback
  const { data: byId } = await supabase
    .from('funds')
    .select('id, name, description')
    .eq('id', fundCode)
    .single()
  return byId ?? null
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // ── GET: 펀드 공개 정보 반환 ────────────────────────────────────────────
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const fundCode = url.searchParams.get('fund_code')
      if (!fundCode) return errorResponse('fund_code is required', 400)

      const fund = await resolveFund(supabase, fundCode)
      if (!fund) return errorResponse('펀드를 찾을 수 없습니다.', 404)

      return jsonResponse({
        id: fund.id,
        name: fund.name,
        description: fund.description,
      })
    }

    // ── POST: 출자의향 접수 ──────────────────────────────────────────────────
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const body = await req.json()
    const {
      fund_code: fundCode,
      name: investorName,
      email: investorEmail,
      phone: investorPhone,
      preferred_contact: preferredContactRaw,
      amount: amountRaw,
      notes,
    } = body

    if (!fundCode) return errorResponse('fund_code is required', 400)
    if (!investorName || !investorEmail)
      return errorResponse('이름과 이메일은 필수입니다.', 400)

    // 1. 펀드 확인
    const fund = await resolveFund(supabase, fundCode)
    if (!fund) return errorResponse('펀드를 찾을 수 없습니다.', 404)

    // 2. Investor upsert
    const preferredContact = mapPreferredContact(preferredContactRaw ?? '')
    const { data: investorRow, error: investorErr } = await supabase
      .from('investors')
      .upsert(
        {
          email: investorEmail,
          name: investorName,
          phone: investorPhone || null,
          preferred_contact: preferredContact,
        },
        { onConflict: 'email' },
      )
      .select('id')
      .single()
    if (investorErr || !investorRow)
      throw new Error(`investor upsert failed: ${investorErr?.message}`)
    const investorId: string = investorRow.id

    // 3. Commitment insert
    const requestedAmount = parseAmount(amountRaw ?? '0')
    const { data: commitmentRow, error: commitmentErr } = await supabase
      .from('commitments')
      .insert({
        fund_id: fund.id,
        investor_id: investorId,
        requested_amount: requestedAmount,
        status: 'new',
        notes: notes || null,
      })
      .select('id')
      .single()
    if (commitmentErr || !commitmentRow)
      throw new Error(`commitment insert failed: ${commitmentErr?.message}`)
    const commitmentId: string = commitmentRow.id

    // 4. Schedule insert (검토 일정: 7일 후)
    const reviewDue = new Date()
    reviewDue.setDate(reviewDue.getDate() + 7)
    const reviewDueDate = reviewDue.toISOString().split('T')[0]

    const { data: scheduleRow, error: scheduleErr } = await supabase
      .from('schedules')
      .insert({
        commitment_id: commitmentId,
        fund_id: fund.id,
        type: 'review',
        title: '출자의향 검토',
        status: 'pending',
        scheduled_at: reviewDueDate,
      })
      .select('id')
      .single()
    if (scheduleErr || !scheduleRow)
      throw new Error(`schedule insert failed: ${scheduleErr?.message}`)
    const scheduleId: string = scheduleRow.id

    // 5. Activity log
    await supabase.from('activity_logs').insert({
      commitment_id: commitmentId,
      fund_id: fund.id,
      action: 'intake_submission',
      description: `출자의향 접수 (자체 폼): ${investorName} (${investorEmail}), 금액: ${requestedAmount.toLocaleString()}원`,
    })

    // 6. Google Spreadsheet 행 추가 ──────────────────────────────────────────
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    if (serviceAccountJson) {
      try {
        const { data: assetRow } = await supabase
          .from('fund_assets')
          .select('intake_spreadsheet_id')
          .eq('fund_id', fund.id)
          .single()

        const spreadsheetId = assetRow?.intake_spreadsheet_id
        if (spreadsheetId) {
          const sheetToken = await getAccessToken(serviceAccountJson, [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets',
          ])
          await appendSheetRow(sheetToken, spreadsheetId, [
            toKSTDatetime(),
            investorName,
            investorEmail,
            investorPhone || '',
            preferredContactRaw || '',
            requestedAmount,
            notes || '',
            commitmentId,
            investorId,
          ])
        }
      } catch (sheetErr) {
        console.error('Sheet append error (non-fatal):', sheetErr)
      }
    }

    // 7. Google Calendar 이벤트 (선택) ───────────────────────────────────────
    let calendarEventId: string | null = null
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')

    if (serviceAccountJson && calendarId) {
      try {
        const calToken = await getAccessToken(serviceAccountJson, [
          'https://www.googleapis.com/auth/calendar',
        ])
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${calToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: `[출자의향 검토] ${investorName} - ${fund.name}`,
              start: { date: reviewDueDate },
              end: { date: reviewDueDate },
              description: `투자자: ${investorName}\n이메일: ${investorEmail}\n연락처: ${investorPhone}\n출자의향금액: ${requestedAmount.toLocaleString()}원\ncommitment_id: ${commitmentId}`,
            }),
          },
        )
        if (calRes.ok) {
          const calData = await calRes.json()
          calendarEventId = calData.id ?? null
          const calendarEventUrl = calData.htmlLink ?? null
          await supabase
            .from('schedules')
            .update({
              calendar_event_id: calendarEventId,
              calendar_event_url: calendarEventUrl,
              calendar_id: calendarId,
            })
            .eq('id', scheduleId)
        }
      } catch (calErr) {
        console.error('Calendar error (non-fatal):', calErr)
      }
    }

    return jsonResponse({
      success: true,
      fund_name: fund.name,
      investor_id: investorId,
      commitment_id: commitmentId,
      schedule_id: scheduleId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('intake-submit error:', message)
    return errorResponse(message)
  }
})
