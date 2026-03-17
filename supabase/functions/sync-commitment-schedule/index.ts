import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── JWT / OAuth helpers ─────────────────────────────────────────────────────

async function signJWT(payload: object, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${signingInput}.${encodedSignature}`
}

async function getAccessToken(serviceAccountJson: string, scopes: string[]): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const jwt = await signJWT(
    {
      iss: sa.client_email,
      scope: scopes.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    },
    sa.private_key,
  )

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to get access token: ${err}`)
  }
  const data = await res.json()
  return data.access_token
}

// ── Status mapping ──────────────────────────────────────────────────────────

function mapScheduleStatus(commitmentStatus: string): 'done' | 'cancelled' | 'pending' {
  if (commitmentStatus === 'confirmed') return 'done'
  if (commitmentStatus === 'cancelled' || commitmentStatus === 'rejected') return 'cancelled'
  return 'pending'
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json()
    const { commitment_id: commitmentId, new_status: newStatus } = body

    if (!commitmentId || !newStatus) {
      return new Response(
        JSON.stringify({ error: 'commitment_id and new_status are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Fetch schedules for this commitment
    const { data: schedules, error: schedErr } = await supabase
      .from('schedules')
      .select('id, calendar_event_id, calendar_id, title, status')
      .eq('commitment_id', commitmentId)

    if (schedErr) throw new Error(`schedules fetch failed: ${schedErr.message}`)
    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ updated_schedules: 0, calendar_events_updated: 0, schedule_status: null }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Determine new schedule status
    const scheduleStatus = mapScheduleStatus(newStatus)

    // 3. Update all schedules for this commitment
    const { error: updateErr } = await supabase
      .from('schedules')
      .update({ status: scheduleStatus })
      .eq('commitment_id', commitmentId)

    if (updateErr) throw new Error(`schedules update failed: ${updateErr.message}`)

    // 4. Google Calendar sync for schedules that have calendar_event_id
    const schedulesWithEvent = schedules.filter(s => s.calendar_event_id)
    let calendarEventsUpdated = 0

    if (schedulesWithEvent.length > 0) {
      const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
      const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')!
      const token = await getAccessToken(serviceAccountJson, [
        'https://www.googleapis.com/auth/calendar',
      ])

      for (const schedule of schedulesWithEvent) {
        const eventCalendarId = schedule.calendar_id ?? calendarId
        const eventId = schedule.calendar_event_id

        let eventPatch: Record<string, unknown> = {}

        if (newStatus === 'confirmed') {
          eventPatch = {
            description: '상태: 확정\n출자의향이 확정되었습니다.',
            colorId: '2', // green
          }
        } else if (newStatus === 'cancelled' || newStatus === 'rejected') {
          const prefix = newStatus === 'rejected' ? '[거절]' : '[취소]'
          const currentTitle: string = schedule.title ?? ''
          const newTitle = currentTitle.startsWith('[취소]') || currentTitle.startsWith('[거절]')
            ? currentTitle
            : `${prefix} ${currentTitle}`
          eventPatch = {
            summary: newTitle,
            description: `상태: ${newStatus === 'rejected' ? '거절' : '취소'}`,
            colorId: '11', // red
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
          console.error(`Calendar PATCH failed for event ${eventId}:`, errText)
        }
      }
    }

    return new Response(
      JSON.stringify({
        updated_schedules: schedules.length,
        calendar_events_updated: calendarEventsUpdated,
        schedule_status: scheduleStatus,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync-commitment-schedule error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
