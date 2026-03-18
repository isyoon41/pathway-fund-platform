/**
 * sync-commitment-schedule: commitment 상태 변경 시 schedule + Calendar 동기화
 *
 * Body: { commitment_id: string, new_status: string }
 *
 * 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken } from '../_shared/google-auth.ts'

function mapScheduleStatus(
  commitmentStatus: string,
): 'done' | 'cancelled' | 'pending' {
  if (commitmentStatus === 'confirmed') return 'done'
  if (
    commitmentStatus === 'cancelled' ||
    commitmentStatus === 'rejected'
  )
    return 'cancelled'
  return 'pending'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    const body = await req.json()
    const { commitment_id: commitmentId, new_status: newStatus } = body

    if (!commitmentId || !newStatus) {
      return errorResponse('commitment_id and new_status are required', 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Fetch schedules
    const { data: schedules, error: schedErr } = await supabase
      .from('schedules')
      .select('id, calendar_event_id, calendar_id, title, status')
      .eq('commitment_id', commitmentId)

    if (schedErr) throw new Error(`schedules fetch failed: ${schedErr.message}`)
    if (!schedules || schedules.length === 0) {
      return jsonResponse({
        updated_schedules: 0,
        calendar_events_updated: 0,
        schedule_status: null,
      })
    }

    // 2. Update all schedules
    const scheduleStatus = mapScheduleStatus(newStatus)
    const { error: updateErr } = await supabase
      .from('schedules')
      .update({ status: scheduleStatus })
      .eq('commitment_id', commitmentId)

    if (updateErr)
      throw new Error(`schedules update failed: ${updateErr.message}`)

    // 3. Google Calendar sync
    const schedulesWithEvent = schedules.filter((s) => s.calendar_event_id)
    let calendarEventsUpdated = 0

    if (schedulesWithEvent.length > 0) {
      const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
      const defaultCalendarId = Deno.env.get('GOOGLE_CALENDAR_ID')

      if (serviceAccountJson && defaultCalendarId) {
        const token = await getAccessToken(serviceAccountJson, [
          'https://www.googleapis.com/auth/calendar',
        ])

        for (const schedule of schedulesWithEvent) {
          const eventCalendarId = schedule.calendar_id ?? defaultCalendarId
          const eventId = schedule.calendar_event_id

          let eventPatch: Record<string, unknown> = {}

          if (newStatus === 'confirmed') {
            eventPatch = {
              description: '상태: 확정\n출자의향이 확정되었습니다.',
              colorId: '2',
            }
          } else if (
            newStatus === 'cancelled' ||
            newStatus === 'rejected'
          ) {
            const prefix =
              newStatus === 'rejected' ? '[거절]' : '[취소]'
            const currentTitle: string = schedule.title ?? ''
            const newTitle =
              currentTitle.startsWith('[취소]') ||
              currentTitle.startsWith('[거절]')
                ? currentTitle
                : `${prefix} ${currentTitle}`
            eventPatch = {
              summary: newTitle,
              description: `상태: ${newStatus === 'rejected' ? '거절' : '취소'}`,
              colorId: '11',
            }
          } else {
            eventPatch = { description: `상태 변경: ${newStatus}` }
          }

          const patchRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(eventCalendarId)}/events/${encodeURIComponent(eventId)}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(eventPatch),
            },
          )

          if (patchRes.ok) {
            calendarEventsUpdated++
          } else {
            const errText = await patchRes.text()
            console.error(
              `Calendar PATCH failed for event ${eventId}:`,
              errText,
            )
          }
        }
      }
    }

    return jsonResponse({
      updated_schedules: schedules.length,
      calendar_events_updated: calendarEventsUpdated,
      schedule_status: scheduleStatus,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync-commitment-schedule error:', message)
    return errorResponse(message)
  }
})
