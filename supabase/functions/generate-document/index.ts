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

// ── Drive / Docs helpers ────────────────────────────────────────────────────

async function findOrCreateFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string> {
  // Search for existing folder
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

  // Create folder
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

async function copyDoc(token: string, templateDocId: string, title: string, parentId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${templateDocId}/copy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: title, parents: [parentId] }),
    },
  )
  if (!res.ok) throw new Error(`Doc copy failed: ${await res.text()}`)
  const data = await res.json()
  return data.id
}

async function createBlankDoc(token: string, title: string, parentId: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: title,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
    }),
  })
  if (!res.ok) throw new Error(`Doc creation failed: ${await res.text()}`)
  const data = await res.json()
  return data.id
}

async function replaceVariablesInDoc(
  token: string,
  docId: string,
  variables: Record<string, string>,
): Promise<void> {
  const requests = Object.entries(variables).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: value ?? '',
    },
  }))

  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
  )
  if (!res.ok) throw new Error(`Doc batchUpdate failed: ${await res.text()}`)
}

async function exportDocAsPdf(token: string, docId: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=application/pdf`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`PDF export failed: ${await res.text()}`)
  const buffer = await res.arrayBuffer()
  return new Uint8Array(buffer)
}

async function uploadPdfToDrive(
  token: string,
  pdfBytes: Uint8Array,
  filename: string,
  folderId: string,
): Promise<string> {
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const boundary = '---boundary_pdf_upload'

  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  ]

  const metaBytes = new TextEncoder().encode(bodyParts[0])
  const pdfHeaderBytes = new TextEncoder().encode(bodyParts[1])
  const closingBytes = new TextEncoder().encode(`\r\n--${boundary}--`)

  const combined = new Uint8Array(
    metaBytes.length + pdfHeaderBytes.length + pdfBytes.length + closingBytes.length,
  )
  let offset = 0
  combined.set(metaBytes, offset); offset += metaBytes.length
  combined.set(pdfHeaderBytes, offset); offset += pdfHeaderBytes.length
  combined.set(pdfBytes, offset); offset += pdfBytes.length
  combined.set(closingBytes, offset)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    },
  )
  if (!res.ok) throw new Error(`PDF upload failed: ${await res.text()}`)
  const data = await res.json()
  return data.id
}

// ── Number formatter ─────────────────────────────────────────────────────────

function formatAmount(amount: number | null): string {
  if (!amount) return '0원'
  return amount.toLocaleString('ko-KR') + '원'
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json()
    const { commitment_id: commitmentId, user_name: userName } = body

    if (!commitmentId) {
      return new Response(JSON.stringify({ error: 'commitment_id is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Fetch commitment with joins
    const { data: commitment, error: commitErr } = await supabase
      .from('commitments')
      .select(`
        id,
        fund_id,
        requested_amount,
        confirmed_amount,
        investors ( id, name, email, phone ),
        funds ( id, name )
      `)
      .eq('id', commitmentId)
      .single()
    if (commitErr || !commitment) {
      throw new Error(`commitment not found: ${commitErr?.message}`)
    }

    const investor = (commitment.investors as any)
    const fund = (commitment.funds as any)
    const today = new Date().toISOString().split('T')[0]

    // 2. Insert document record (status=draft)
    const docTitle = `출자확인서_${investor.name}_${fund.name}_${today}`
    const { data: docRow, error: docInsertErr } = await supabase
      .from('documents')
      .insert({
        commitment_id: commitmentId,
        fund_id: commitment.fund_id,
        type: 'confirmation',
        title: docTitle,
        status: 'draft',
      })
      .select('id')
      .single()
    if (docInsertErr || !docRow) {
      throw new Error(`document insert failed: ${docInsertErr?.message}`)
    }
    const documentId: string = docRow.id

    // 3. Activity log
    await supabase.from('activity_logs').insert({
      commitment_id: commitmentId,
      action: '문서 생성 요청',
      actor: userName ?? 'system',
    })

    // 4. Service account token
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
    const token = await getAccessToken(serviceAccountJson, [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ])

    // 5. Resolve or create Drive folder
    const rootFolderId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')!

    const { data: assetRow } = await supabase
      .from('fund_assets')
      .select('confirmation_folder_id')
      .eq('fund_id', commitment.fund_id)
      .single()

    let confirmationFolderId: string = assetRow?.confirmation_folder_id ?? ''

    if (!confirmationFolderId) {
      const fundFolderId = await findOrCreateFolder(token, fund.name, rootFolderId)
      confirmationFolderId = await findOrCreateFolder(token, '출자확인서', fundFolderId)

      // Persist for reuse
      await supabase
        .from('fund_assets')
        .upsert({ fund_id: commitment.fund_id, confirmation_folder_id: confirmationFolderId })
    }

    // 6. Fetch active template
    const { data: templateRow } = await supabase
      .from('template_versions')
      .select('google_template_doc_id')
      .eq('fund_id', commitment.fund_id)
      .eq('type', 'confirmation')
      .eq('is_active', true)
      .single()

    let googleDocId: string

    if (templateRow?.google_template_doc_id) {
      googleDocId = await copyDoc(token, templateRow.google_template_doc_id, docTitle, confirmationFolderId)
    } else {
      googleDocId = await createBlankDoc(token, docTitle, confirmationFolderId)
    }

    // 7. Replace variables
    await replaceVariablesInDoc(token, googleDocId, {
      investor_name: investor.name ?? '',
      fund_name: fund.name ?? '',
      requested_amount: formatAmount(commitment.requested_amount),
      confirmed_amount: formatAmount(commitment.confirmed_amount),
      date: today,
      investor_email: investor.email ?? '',
      investor_phone: investor.phone ?? '',
    })

    // 8. Export as PDF
    const pdfBytes = await exportDocAsPdf(token, googleDocId)

    // 9. Upload PDF to Drive
    const pdfFilename = `${docTitle}.pdf`
    const pdfFileId = await uploadPdfToDrive(token, pdfBytes, pdfFilename, confirmationFolderId)

    // 10. Update document record
    await supabase
      .from('documents')
      .update({
        google_doc_id: googleDocId,
        drive_file_id: googleDocId,
        pdf_file_id: pdfFileId,
        status: 'generated',
      })
      .eq('id', documentId)

    // 11. Response
    return new Response(
      JSON.stringify({ document_id: documentId, google_doc_id: googleDocId, pdf_file_id: pdfFileId }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('generate-document error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
