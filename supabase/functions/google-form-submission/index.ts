import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
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

// ── Preferred contact mapping ───────────────────────────────────────────────

function mapPreferredContact(raw: string): string {
  const map: Record<string, string> = {
    '이메일': 'email',
    '전화': 'phone',
    '카카오톡': 'kakao',
  }
  return map[raw?.trim()] ?? 'email'
}

// ── Amount parser ───────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    // 1. Secret validation
    const formSecret = Deno.env.get('GOOGLE_FORM_SECRET') ?? ''
    const incomingSecret = req.headers.get('x-form-secret') ?? ''
    if (formSecret && incomingSecret !== formSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const {
      fund_id: rawFundId,
      이름: investorName,
      이메일: investorEmail,
      연락처: investorPhone,
      선호연락방식: preferredContactRaw,
      출자의향금액: amountRaw,
      비고: notes,
      form_id: formId,
    } = body

    // Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2. Resolve fund_id
    let fundId: string = rawFundId
    let fundName = ''

    if (!fundId && formId) {
      const { data: assetRow, error: assetErr } = await supabase
        .from('fund_assets')
        .select('fund_id, funds(name)')
        .eq('intake_form_id', formId)
        .single()
      if (assetErr || !assetRow) {
        throw new Error(`fund not found for form_id=${formId}: ${assetErr?.message}`)
      }
      fundId = assetRow.fund_id
      fundName = (assetRow.funds as any)?.name ?? ''
    } else if (fundId) {
      const { data: fundRow, error: fundErr } = await supabase
        .from('funds')
        .select('name')
        .eq('id', fundId)
        .single()
      if (fundErr || !fundRow) {
        throw new Error(`fund not found: ${fundErr?.message}`)
      }
      fundName = fundRow.name
    } else {
      throw new Error('fund_id or form_id is required')
    }

    // 3. Upsert investor
    const preferredContact = mapPreferredContact(preferredContactRaw)
    const { data: investorRow, error: investorErr } = await supabase
      .from('investors')
      .upsert(
        {
          email: investorEmail,
          name: investorName,
          phone: investorPhone,
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

    // 4. Insert commitment
    const requestedAmount = parseAmount(amountRaw ?? '')
    const { data: commitmentRow, error: commitmentErr } = await supabase
      .from('commitments')
      .insert({
        fund_id: fundId,
        investor_id: investorId,
        requested_amount: requestedAmount,
        status: 'new',
        notes: notes ?? null,
      })
      .select('id')
      .single()
    if (commitmentErr || !commitmentRow) {
      throw new Error(`commitment insert failed: ${commitmentErr?.message}`)
    }
    const commitmentId: string = commitmentRow.id

    // 5. Insert schedule (review_due = 7 days from now)
    const reviewDue = new Date()
    reviewDue.setDate(reviewDue.getDate() + 7)
    const reviewDueDate = reviewDue.toISOString().split('T')[0] // YYYY-MM-DD

    const { data: scheduleRow, error: scheduleErr } = await supabase
      .from('schedules')
      .insert({
        commitment_id: commitmentId,
        fund_id: fundId,
        type: 'review',
        title: '출자의향 검토',
        status: 'pending',
        review_due: reviewDueDate,
      })
      .select('id')
      .single()
    if (scheduleErr || !scheduleRow) {
      throw new Error(`schedule insert failed: ${scheduleErr?.message}`)
    }
    const scheduleId: string = scheduleRow.id

    // 6. Google Calendar event
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID')!
    const token = await getAccessToken(serviceAccountJson, [
      'https://www.googleapis.com/auth/calendar',
    ])

    const eventTitle = `[출자의향 검토] ${investorName} - ${fundName}`
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
          start: { date: reviewDueDate },
          end: { date: reviewDueDate },
          description: `투자자: ${investorName}\n이메일: ${investorEmail}\n연락처: ${investorPhone}\n출자의향금액: ${amountRaw}\ncommitment_id: ${commitmentId}`,
        }),
      },
    )

    let calendarEventId: string | null = null
    let calendarEventUrl: string | null = null

    if (calRes.ok) {
      const calData = await calRes.json()
      calendarEventId = calData.id ?? null
      calendarEventUrl = calData.htmlLink ?? null

      // Update schedule with calendar info
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

    // 7. Response
    return new Response(
      JSON.stringify({
        investor_id: investorId,
        commitment_id: commitmentId,
        schedule_id: scheduleId,
        fund_id: fundId,
        fund_name: fundName,
        calendar_event_id: calendarEventId,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('google-form-submission error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
