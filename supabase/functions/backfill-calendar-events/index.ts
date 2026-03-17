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

// ── Types ───────────────────────────────────────────────────────────────────

interface ScheduleRow {
  id: string
  title: string
  review_due: string | null
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

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

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
        review_due,
        commitment_id,
        fund_id,
        commitments (
          investors ( name, email, phone )
        ),
        funds ( name )
      `)
      .is('calendar_event_id', null)
      .neq('status', 'cancelled')

    if (schedErr) throw new Error(`schedules fetch failed: ${schedErr.message}`)
    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, succeeded: 0, failed: 0 }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Get service account token
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')!
    const token = await getAccessToken(serviceAccountJson, [
      'https://www.googleapis.com/auth/calendar',
    ])

    let succeeded = 0
    let failed = 0

    // 3. Create calendar events for each schedule
    for (const schedule of (schedules as unknown as ScheduleRow[])) {
      try {
        const investor = schedule.commitments?.investors
        const fundName = schedule.funds?.name ?? '(펀드명 없음)'
        const investorName = investor?.name ?? '(투자자명 없음)'

        // Determine event date: use review_due or today
        const today = new Date().toISOString().split('T')[0]
        const eventDate = schedule.review_due
          ? schedule.review_due.split('T')[0]
          : today

        const eventTitle = `[출자의향 검토] ${investorName} - ${fundName}`
        const description = [
          investor?.name ? `투자자: ${investor.name}` : null,
          investor?.email ? `이메일: ${investor.email}` : null,
          investor?.phone ? `연락처: ${investor.phone}` : null,
          schedule.commitment_id ? `commitment_id: ${schedule.commitment_id}` : null,
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
          console.error(`Calendar event creation failed for schedule ${schedule.id}:`, errText)
          failed++
          continue
        }

        const calData = await calRes.json()
        const calendarEventId: string = calData.id
        const calendarEventUrl: string = calData.htmlLink ?? null

        // Update schedule
        const { error: updateErr } = await supabase
          .from('schedules')
          .update({
            calendar_event_id: calendarEventId,
            calendar_event_url: calendarEventUrl,
            calendar_id: calendarId,
          })
          .eq('id', schedule.id)

        if (updateErr) {
          console.error(`Schedule update failed for ${schedule.id}:`, updateErr.message)
          failed++
        } else {
          succeeded++
        }
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
        console.error(`Error processing schedule ${schedule.id}:`, msg)
        failed++
      }
    }

    // 4. Response
    return new Response(
      JSON.stringify({
        processed: schedules.length,
        succeeded,
        failed,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('backfill-calendar-events error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
