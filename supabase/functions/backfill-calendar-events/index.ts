/**
 * backfill-calendar-events: calendar_event_id 없는 schedule에 Google Calendar 이벤트 생성
 *
 * Body: (none — 전체 대상 처리)
 *
 * 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken } from '../_shared/google-auth.ts'

interface ScheduleRow {
  id: string
  title: string
  scheduled_at: string | null
  commitment_id: string | null
  fund_id: string | null
  commitments: {
    investors: {
      name: string
      email: string
      phone: string
    } | null
  } | null
  funds: {
    name: string
  } | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Fetch schedules without calendar_event_id and not cancelled
    const { data: schedules, error: schedErr } = await supabase
      .from('schedules')
      .select(`
        id,
        title,
        scheduled_at,
        commitment_id,
        fund_id,
        commitments (
          investors ( name, email, phone )
        ),
        funds ( name )
      `)
      .is('calendar_event_id', null)
      .neq('status', 'cancelled')

    if (schedErr)
      throw new Error(`schedules fetch failed: ${schedErr.message}`)
    if (!schedules || schedules.length === 0) {
      return jsonResponse({ processed: 0, succeeded: 0, failed: 0 })
    }

    // 2. Get service account token
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')!
    const token = await getAccessToken(serviceAccountJson, [
      'https://www.googleapis.com/auth/calendar',
    ])

    let succeeded = 0
    let failed = 0

    // 3. Create calendar events
    for (const schedule of schedules as unknown as ScheduleRow[]) {
      try {
        const investor = schedule.commitments?.investors
        const fundName = schedule.funds?.name ?? '(펀드명 없음)'
        const investorName = investor?.name ?? '(투자자명 없음)'

        const today = new Date().toISOString().split('T')[0]
        const eventDate = schedule.scheduled_at
          ? schedule.scheduled_at.split('T')[0]
          : today

        const eventTitle = `[출자의향 검토] ${investorName} - ${fundName}`
        const description = [
          investor?.name ? `투자자: ${investor.name}` : null,
          investor?.email ? `이메일: ${investor.email}` : null,
          investor?.phone ? `연락처: ${investor.phone}` : null,
          schedule.commitment_id
            ? `commitment_id: ${schedule.commitment_id}`
            : null,
        ]
          .filter(Boolean)
          .join('\n')

        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: eventTitle,
              description,
              start: { date: eventDate },
              end: { date: eventDate },
            }),
          },
        )

        if (!calRes.ok) {
          const errText = await calRes.text()
          console.error(
            `Calendar event creation failed for schedule ${schedule.id}:`,
            errText,
          )
          failed++
          continue
        }

        const calData = await calRes.json()
        const calendarEventId: string = calData.id
        const calendarEventUrl: string = calData.htmlLink ?? null

        const { error: updateErr } = await supabase
          .from('schedules')
          .update({
            calendar_event_id: calendarEventId,
            calendar_event_url: calendarEventUrl,
            calendar_id: calendarId,
          })
          .eq('id', schedule.id)

        if (updateErr) {
          console.error(
            `Schedule update failed for ${schedule.id}:`,
            updateErr.message,
          )
          failed++
        } else {
          succeeded++
        }
      } catch (innerErr: unknown) {
        const msg =
          innerErr instanceof Error ? innerErr.message : String(innerErr)
        console.error(`Error processing schedule ${schedule.id}:`, msg)
        failed++
      }
    }

    return jsonResponse({
      processed: schedules.length,
      succeeded,
      failed,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('backfill-calendar-events error:', message)
    return errorResponse(message)
  }
})
