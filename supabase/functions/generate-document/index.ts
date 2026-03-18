/**
 * generate-document: 출자확인서 등 문서를 Google Docs 템플릿으로 생성 + PDF 변환
 *
 * Body: { commitment_id: string, user_name?: string }
 *
 * 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_ROOT_FOLDER_ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken } from '../_shared/google-auth.ts'
import {
  findOrCreateFolder,
  copyDoc,
  createBlankDoc,
  replaceVariablesInDoc,
  exportDocAsPdf,
  uploadPdfToDrive,
} from '../_shared/google-drive.ts'

function formatAmount(amount: number | null): string {
  if (!amount) return '0원'
  return amount.toLocaleString('ko-KR') + '원'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    const body = await req.json()
    const { commitment_id: commitmentId, user_name: userName } = body

    if (!commitmentId) {
      return errorResponse('commitment_id is required', 400)
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

    const investor = commitment.investors as any
    const fund = commitment.funds as any
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
      fund_id: commitment.fund_id,
      action: 'document_generation',
      description: `문서 생성 요청: ${docTitle}`,
      performed_by: userName ?? null,
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
      const fundFolderId = await findOrCreateFolder(
        token,
        fund.name,
        rootFolderId,
      )
      confirmationFolderId = await findOrCreateFolder(
        token,
        '출자확인서',
        fundFolderId,
      )

      await supabase
        .from('fund_assets')
        .upsert({
          fund_id: commitment.fund_id,
          confirmation_folder_id: confirmationFolderId,
        })
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
      googleDocId = await copyDoc(
        token,
        templateRow.google_template_doc_id,
        docTitle,
        confirmationFolderId,
      )
    } else {
      googleDocId = await createBlankDoc(
        token,
        docTitle,
        confirmationFolderId,
      )
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
    const pdfFileId = await uploadPdfToDrive(
      token,
      pdfBytes,
      pdfFilename,
      confirmationFolderId,
    )

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

    return jsonResponse({
      document_id: documentId,
      google_doc_id: googleDocId,
      pdf_file_id: pdfFileId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('generate-document error:', message)
    return errorResponse(message)
  }
})
