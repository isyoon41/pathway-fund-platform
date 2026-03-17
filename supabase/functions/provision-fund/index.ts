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

// ── Drive helper ────────────────────────────────────────────────────────────

async function findOrCreateFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string> {
  const query = encodeURIComponent(
    `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
  )
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!searchRes.ok) throw new Error(`Drive search failed: ${await searchRes.text()}`)
  const searchData = await searchRes.json()

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  if (!createRes.ok) throw new Error(`Folder creation failed: ${await createRes.text()}`)
  const createData = await createRes.json()
  return createData.id
}

// ── Google Forms helper ─────────────────────────────────────────────────────

async function createIntakeForm(token: string, fundName: string): Promise<{ formId: string; formUrl: string }> {
  // Step 1: Create the form with title
  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: `${fundName} 출자의향서`,
        documentTitle: `${fundName} 출자의향서`,
      },
    }),
  })
  if (!createRes.ok) throw new Error(`Form creation failed: ${await createRes.text()}`)
  const formData = await createRes.json()
  const formId: string = formData.formId
  const formUrl: string = formData.responderUri ?? `https://docs.google.com/forms/d/${formId}/viewform`

  // Step 2: Add fields via batchUpdate
  const batchRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          createItem: {
            item: {
              title: '이름',
              questionItem: {
                question: {
                  required: true,
                  textQuestion: { paragraph: false },
                },
              },
            },
            location: { index: 0 },
          },
        },
        {
          createItem: {
            item: {
              title: '이메일',
              questionItem: {
                question: {
                  required: true,
                  textQuestion: { paragraph: false },
                },
              },
            },
            location: { index: 1 },
          },
        },
        {
          createItem: {
            item: {
              title: '연락처',
              questionItem: {
                question: {
                  required: true,
                  textQuestion: { paragraph: false },
                },
              },
            },
            location: { index: 2 },
          },
        },
        {
          createItem: {
            item: {
              title: '선호연락방식',
              questionItem: {
                question: {
                  required: true,
                  choiceQuestion: {
                    type: 'RADIO',
                    options: [
                      { value: '이메일' },
                      { value: '전화' },
                      { value: '카카오톡' },
                    ],
                  },
                },
              },
            },
            location: { index: 3 },
          },
        },
        {
          createItem: {
            item: {
              title: '출자의향금액',
              questionItem: {
                question: {
                  required: true,
                  textQuestion: { paragraph: false },
                },
              },
            },
            location: { index: 4 },
          },
        },
        {
          createItem: {
            item: {
              title: '비고',
              questionItem: {
                question: {
                  required: false,
                  textQuestion: { paragraph: true },
                },
              },
            },
            location: { index: 5 },
          },
        },
      ],
    }),
  })
  if (!batchRes.ok) throw new Error(`Form fields update failed: ${await batchRes.text()}`)

  return { formId, formUrl }
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json()
    const { fund_id: fundId } = body

    if (!fundId) {
      return new Response(JSON.stringify({ error: 'fund_id is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Fetch fund name
    const { data: fund, error: fundErr } = await supabase
      .from('funds')
      .select('id, name')
      .eq('id', fundId)
      .single()
    if (fundErr || !fund) throw new Error(`fund not found: ${fundErr?.message}`)

    // 2. Upsert fund_assets with provisioning status
    await supabase
      .from('fund_assets')
      .upsert({ fund_id: fundId, provisioning_status: 'provisioning' }, { onConflict: 'fund_id' })

    // 3. Get service account token (Drive + Forms)
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
    const token = await getAccessToken(serviceAccountJson, [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/forms.body',
    ])

    // 4. Create Google Form
    const { formId, formUrl } = await createIntakeForm(token, fund.name)

    // 5. Create Drive folder: ROOT/{펀드명}/출자의향접수/
    const rootFolderId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')!
    const fundFolderId = await findOrCreateFolder(token, fund.name, rootFolderId)
    const intakeFolderId = await findOrCreateFolder(token, '출자의향접수', fundFolderId)

    // 6. Call Apps Script to attach form webhook
    const appsScriptUrl = Deno.env.get('APPS_SCRIPT_PROVISION_URL')!
    const formSecret = Deno.env.get('GOOGLE_FORM_SECRET')!
    const webhookUrl = `https://vamujmnlntijvjcyrpfm.supabase.co/functions/v1/google-form-submission`

    const scriptRes = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'provision',
        formId,
        folderId: intakeFolderId,
        webhookUrl,
        formSecret,
      }),
    })

    if (!scriptRes.ok) {
      const errText = await scriptRes.text()
      console.error('Apps Script provision failed:', errText)
      // Non-fatal: continue with available data
    }

    // 7. Update fund_assets
    await supabase
      .from('fund_assets')
      .update({
        intake_form_id: formId,
        intake_form_url: formUrl,
        intake_folder_id: intakeFolderId,
        provisioning_status: 'ready',
      })
      .eq('fund_id', fundId)

    // 8. Response
    return new Response(
      JSON.stringify({ fund_id: fundId, form_id: formId, form_url: formUrl, folder_id: intakeFolderId }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('provision-fund error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
