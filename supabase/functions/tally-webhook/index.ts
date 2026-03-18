/**
 * tally-webhook: Tally.so 폼 제출 시 호출되는 웹훅
 *
 * Tally webhook payload 구조:
 * {
 *   "eventId": "...",
 *   "eventType": "FORM_RESPONSE",
 *   "createdAt": "2026-...",
 *   "data": {
 *     "responseId": "...",
 *     "submissionId": "...",
 *     "formId": "...",
 *     "formName": "...",
 *     "createdAt": "...",
 *     "fields": [
 *       { "key": "question_xxx", "label": "이름", "type": "INPUT_TEXT", "value": "홍길동" },
 *       { "key": "question_yyy", "label": "이메일", "type": "INPUT_EMAIL", "value": "hong@..." },
 *       { "key": "question_zzz", "label": "연락처", "type": "INPUT_TEXT", "value": "010-..." },
 *       { "key": "question_aaa", "label": "선호연락방식", "type": "MULTIPLE_CHOICE", "value": "카카오톡" },
 *       { "key": "question_bbb", "label": "출자의향금액", "type": "INPUT_TEXT", "value": "50000000" },
 *       { "key": "question_ccc", "label": "비고", "type": "TEXTAREA", "value": "..." },
 *       { "key": "question_ddd", "label": "fund_id", "type": "HIDDEN", "value": "uuid..." }
 *     ]
 *   }
 * }
 *
 * 처리:
 * 1. Tally signing secret 검증
 * 2. fields에서 이름/이메일/연락처/선호연락방식/출자의향금액/비고/fund_id 추출
 * 3. investor upsert → commitment 생성 → schedule 생성
 * 4. 펀드별 Google Spreadsheet에 응답 행 추가 (provision-fund 에서 생성된 시트)
 * 5. (선택) Google Calendar 이벤트 생성
 *
 * 환경변수:
 *   TALLY_SIGNING_SECRET       — Tally webhook signing secret
 *   GOOGLE_SERVICE_ACCOUNT_KEY — 서비스 계정 JSON (drive + sheets 스코프)
 *   GOOGLE_CALENDAR_ID         — Google Calendar ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken } from '../_shared/google-auth.ts'
import { appendSheetRow } from '../_shared/google-drive.ts'

// ── Field extractor ─────────────────────────────────────────────────────────

interface TallyField {
  key: string
  label: string
  type: string
  value: unknown
}

function getFieldValue(fields: TallyField[], label: string): string {
  const field = fields.find(
    (f) => f.label.trim().toLowerCase() === label.toLowerCase(),
  )
  if (!field) return ''
  if (field.value === null || field.value === undefined) return ''
  // MULTIPLE_CHOICE can be an array or object with id/name
  if (typeof field.value === 'object') {
    if (Array.isArray(field.value)) {
      return field.value.map((v: any) => v?.name ?? v).join(', ')
    }
    return (field.value as any)?.name ?? JSON.stringify(field.value)
  }
  return String(field.value)
}

// ── Preferred contact mapping ───────────────────────────────────────────────

function mapPreferredContact(raw: string): string {
  const map: Record<string, string> = {
    이메일: 'email',
    전화: 'phone',
    카카오톡: 'kakao',
  }
  return map[raw?.trim()] ?? 'email'
}

// ── Amount parser ───────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

// ── Webhook signature verification ──────────────────────────────────────────

async function verifyTallySignature(
  payload: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload),
  )
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return signature === expectedSignature
}

// ── KST datetime formatter ──────────────────────────────────────────────────

function toKSTDatetime(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date()
  // UTC+9
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19)
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    // 1. Read raw body for signature verification
    const rawBody = await req.text()
    const tallySecret = Deno.env.get('TALLY_SIGNING_SECRET') ?? ''

    if (tallySecret) {
      const signature = req.headers.get('tally-signature')
      const isValid = await verifyTallySignature(rawBody, signature, tallySecret)
      if (!isValid) {
        console.error('Invalid Tally webhook signature')
        return errorResponse('Unauthorized', 401)
      }
    }

    const body = JSON.parse(rawBody)

    // 2. Validate event type
    if (body.eventType !== 'FORM_RESPONSE') {
      return jsonResponse({ message: 'Ignored non-response event' })
    }

    const fields: TallyField[] = body.data?.fields ?? []
    const submittedAt = body.data?.createdAt ?? new Date().toISOString()

    // 3. Extract field values
    const investorName = getFieldValue(fields, '이름')
    const investorEmail = getFieldValue(fields, '이메일')
    const investorPhone = getFieldValue(fields, '연락처')
    const preferredContactRaw = getFieldValue(fields, '선호연락방식')
    const amountRaw = getFieldValue(fields, '출자의향금액')
    const notes = getFieldValue(fields, '비고')
    const fundIdFromField = getFieldValue(fields, 'fund_id')

    if (!investorName || !investorEmail) {
      return errorResponse('이름과 이메일은 필수입니다.', 400)
    }

    // 4. Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 5. Resolve fund_id (hidden field 또는 form 매핑)
    let fundId = fundIdFromField
    let fundName = ''

    if (!fundId) {
      // Tally form ID → fund_assets 매핑으로 fallback
      const tallyFormId = body.data?.formId
      if (tallyFormId) {
        const { data: assetRow } = await supabase
          .from('fund_assets')
          .select('fund_id, funds(name)')
          .eq('intake_form_id', tallyFormId)
          .single()
        if (assetRow) {
          fundId = assetRow.fund_id
          fundName = (assetRow.funds as any)?.name ?? ''
        }
      }
    }

    if (!fundId) {
      return errorResponse('fund_id를 확인할 수 없습니다.', 400)
    }

    if (!fundName) {
      const { data: fundRow } = await supabase
        .from('funds')
        .select('name')
        .eq('id', fundId)
        .single()
      fundName = fundRow?.name ?? ''
    }

    // 6. Upsert investor
    const preferredContact = mapPreferredContact(preferredContactRaw)
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
    if (investorErr || !investorRow) {
      throw new Error(`investor upsert failed: ${investorErr?.message}`)
    }
    const investorId: string = investorRow.id

    // 7. Insert commitment
    const requestedAmount = parseAmount(amountRaw)
    const { data: commitmentRow, error: commitmentErr } = await supabase
      .from('commitments')
      .insert({
        fund_id: fundId,
        investor_id: investorId,
        requested_amount: requestedAmount,
        status: 'new',
        notes: notes || null,
      })
      .select('id')
      .single()
    if (commitmentErr || !commitmentRow) {
      throw new Error(`commitment insert failed: ${commitmentErr?.message}`)
    }
    const commitmentId: string = commitmentRow.id

    // 8. Insert schedule (review_due = 7 days from now)
    const reviewDue = new Date()
    reviewDue.setDate(reviewDue.getDate() + 7)
    const reviewDueDate = reviewDue.toISOString().split('T')[0]

    const { data: scheduleRow, error: scheduleErr } = await supabase
      .from('schedules')
      .insert({
        commitment_id: commitmentId,
        fund_id: fundId,
        type: 'review',
        title: '출자의향 검토',
        status: 'pending',
        scheduled_at: reviewDueDate,
      })
      .select('id')
      .single()
    if (scheduleErr || !scheduleRow) {
      throw new Error(`schedule insert failed: ${scheduleErr?.message}`)
    }
    const scheduleId: string = scheduleRow.id

    // 9. Activity log
    await supabase.from('activity_logs').insert({
      commitment_id: commitmentId,
      fund_id: fundId,
      action: 'tally_submission',
      description: `Tally.so를 통한 출자의향 접수: ${investorName} (${investorEmail}), 금액: ${amountRaw || '미입력'}`,
    })

    // 10. Google Spreadsheet에 응답 행 추가 ─────────────────────────────────
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    if (serviceAccountJson) {
      try {
        // fund_assets에서 스프레드시트 ID 조회
        const { data: assetRow } = await supabase
          .from('fund_assets')
          .select('intake_spreadsheet_id')
          .eq('fund_id', fundId)
          .single()

        const spreadsheetId = assetRow?.intake_spreadsheet_id

        if (spreadsheetId) {
          const sheetToken = await getAccessToken(serviceAccountJson, [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets',
          ])

          // 헤더 순서: 접수일시, 이름, 이메일, 연락처, 선호연락방식, 출자의향금액(원), 비고, commitment_id, investor_id
          await appendSheetRow(sheetToken, spreadsheetId, [
            toKSTDatetime(submittedAt),
            investorName,
            investorEmail,
            investorPhone || '',
            preferredContactRaw || '',
            requestedAmount || '',
            notes || '',
            commitmentId,
            investorId,
          ])
          console.log(`Sheet row appended: ${spreadsheetId}`)
        } else {
          console.warn(`No spreadsheet found for fund ${fundId} — skipping sheet append`)
        }
      } catch (sheetError) {
        // Non-fatal: DB에는 이미 저장됨
        console.error('Spreadsheet append error (non-fatal):', sheetError)
      }
    }

    // 11. Google Calendar event (optional) ───────────────────────────────────
    let calendarEventId: string | null = null
    let calendarEventUrl: string | null = null

    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')

    if (serviceAccountJson && calendarId) {
      try {
        const calToken = await getAccessToken(serviceAccountJson, [
          'https://www.googleapis.com/auth/calendar',
        ])

        const eventTitle = `[출자의향 검토] ${investorName} - ${fundName}`
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${calToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: eventTitle,
              start: { date: reviewDueDate },
              end: { date: reviewDueDate },
              description: `투자자: ${investorName}\n이메일: ${investorEmail}\n연락처: ${investorPhone}\n출자의향금액: ${amountRaw}\ncommitment_id: ${commitmentId}`,
            }),
          },
        )

        if (calRes.ok) {
          const calData = await calRes.json()
          calendarEventId = calData.id ?? null
          calendarEventUrl = calData.htmlLink ?? null

          await supabase
            .from('schedules')
            .update({
              calendar_event_id: calendarEventId,
              calendar_event_url: calendarEventUrl,
              calendar_id: calendarId,
            })
            .eq('id', scheduleId)
        } else {
          const calErr = await calRes.text()
          console.error('Calendar event creation failed:', calErr)
        }
      } catch (calError) {
        console.error('Calendar integration error (non-fatal):', calError)
      }
    }

    // 12. Response
    return jsonResponse({
      investor_id: investorId,
      commitment_id: commitmentId,
      schedule_id: scheduleId,
      fund_id: fundId,
      fund_name: fundName,
      calendar_event_id: calendarEventId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('tally-webhook error:', message)
    return errorResponse(message)
  }
})
