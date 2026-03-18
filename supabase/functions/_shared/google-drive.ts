/**
 * Google Drive helper functions for folder & file management.
 * Also includes Google Sheets helpers (Sheets API v4).
 */

export async function findOrCreateFolder(
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
  if (!searchRes.ok)
    throw new Error(`Drive search failed: ${await searchRes.text()}`)
  const searchData = await searchRes.json()

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id as string
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
  if (!createRes.ok)
    throw new Error(`Folder creation failed: ${await createRes.text()}`)
  const createData = await createRes.json()
  return createData.id as string
}

export async function copyDoc(
  token: string,
  templateDocId: string,
  title: string,
  parentId: string,
): Promise<string> {
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
  return data.id as string
}

export async function createBlankDoc(
  token: string,
  title: string,
  parentId: string,
): Promise<string> {
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
  return data.id as string
}

export async function replaceVariablesInDoc(
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
  if (!res.ok)
    throw new Error(`Doc batchUpdate failed: ${await res.text()}`)
}

export async function exportDocAsPdf(
  token: string,
  docId: string,
): Promise<Uint8Array> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=application/pdf`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`PDF export failed: ${await res.text()}`)
  const buffer = await res.arrayBuffer()
  return new Uint8Array(buffer)
}

export async function uploadPdfToDrive(
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
    metaBytes.length +
      pdfHeaderBytes.length +
      pdfBytes.length +
      closingBytes.length,
  )
  let offset = 0
  combined.set(metaBytes, offset)
  offset += metaBytes.length
  combined.set(pdfHeaderBytes, offset)
  offset += pdfHeaderBytes.length
  combined.set(pdfBytes, offset)
  offset += pdfBytes.length
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
  return data.id as string
}

// ── Google Sheets helpers ──────────────────────────────────────────────────

/**
 * Drive scope로 취득한 token으로 Sheets 파일을 Drive에 생성 후,
 * Sheets API로 헤더 행을 입력합니다.
 * Returns: { spreadsheetId, spreadsheetUrl }
 */
export async function createSpreadsheetWithHeaders(
  token: string,
  title: string,
  parentFolderId: string,
  headers: string[],
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // 1. Drive API로 Sheets 파일 생성 (Drive scope으로 가능)
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [parentFolderId],
    }),
  })
  if (!createRes.ok)
    throw new Error(`Spreadsheet creation failed: ${await createRes.text()}`)
  const createData = await createRes.json()
  const spreadsheetId = createData.id as string
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`

  // 2. Sheets API로 헤더 행 작성 (Drive scope이 있으면 Sheets도 접근 가능)
  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [headers] }),
    },
  )
  if (!headerRes.ok) {
    console.warn(`Header row write failed (non-fatal): ${await headerRes.text()}`)
  }

  return { spreadsheetId, spreadsheetUrl }
}

/**
 * 기존 스프레드시트에 새 행을 추가합니다.
 */
export async function appendSheetRow(
  token: string,
  spreadsheetId: string,
  values: (string | number | null)[],
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values] }),
    },
  )
  if (!res.ok)
    throw new Error(`Sheet row append failed: ${await res.text()}`)
}
