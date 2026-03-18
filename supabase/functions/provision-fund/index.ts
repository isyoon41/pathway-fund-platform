/**
 * provision-fund: 펀드 생성 시 Google Drive 폴더 + Tally.so 폼 URL 연결
 *
 * Body: { fund_id: string }
 *
 * 1. Google Drive에 펀드 폴더 구조 생성 (ROOT/{펀드명}/출자의향접수/, 출자확인서/)
 * 2. fund_assets에 Tally 폼 URL + Drive 폴더 ID 저장
 *
 * 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_KEY — 서비스 계정 JSON
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID — 루트 폴더 ID
 *   TALLY_FORM_BASE_URL — 예: https://tally.so/r/{formId} (펀드별 폼 또는 공통 폼)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken } from '../_shared/google-auth.ts'
import { findOrCreateFolder } from '../_shared/google-drive.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    const body = await req.json()
    const { fund_id: fundId } = body

    if (!fundId) {
      return errorResponse('fund_id is required', 400)
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
      .upsert(
        { fund_id: fundId, provisioning_status: 'provisioning' },
        { onConflict: 'fund_id' },
      )

    // 3. Get service account token (Drive scope)
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
    const token = await getAccessToken(serviceAccountJson, [
      'https://www.googleapis.com/auth/drive',
    ])

    // 4. Create Drive folder structure: ROOT/{펀드명}/
    const rootFolderId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')!
    const fundFolderId = await findOrCreateFolder(token, fund.name, rootFolderId)
    const intakeFolderId = await findOrCreateFolder(
      token,
      '출자의향접수',
      fundFolderId,
    )
    const confirmationFolderId = await findOrCreateFolder(
      token,
      '출자확인서',
      fundFolderId,
    )

    // 5. Determine Tally form URL
    // 기본: TALLY_FORM_BASE_URL 환경변수 (공통 폼)
    // 펀드별 폼이 필요하면 Tally 대시보드에서 폼 생성 후 fund_assets에 직접 입력
    const tallyFormBaseUrl = Deno.env.get('TALLY_FORM_BASE_URL') ?? ''
    // 쿼리파라미터로 fund_id를 넘겨 Tally hidden field로 매핑
    const intakeFormUrl = tallyFormBaseUrl
      ? `${tallyFormBaseUrl}?fund_id=${fundId}`
      : null

    // 6. Build Google Drive folder URL
    const driveFolderUrl = `https://drive.google.com/drive/folders/${fundFolderId}`

    // 7. Update fund_assets
    await supabase
      .from('fund_assets')
      .update({
        drive_folder_id: fundFolderId,
        drive_folder_url: driveFolderUrl,
        intake_folder_id: intakeFolderId,
        confirmation_folder_id: confirmationFolderId,
        intake_form_url: intakeFormUrl,
        provisioning_status: 'ready',
      })
      .eq('fund_id', fundId)

    // 8. Activity log
    await supabase.from('activity_logs').insert({
      fund_id: fundId,
      action: 'provision_complete',
      description: `펀드 운영자산 프로비저닝 완료: Drive 폴더 생성, Tally 폼 연결`,
    })

    return jsonResponse({
      fund_id: fundId,
      drive_folder_id: fundFolderId,
      drive_folder_url: driveFolderUrl,
      intake_folder_id: intakeFolderId,
      confirmation_folder_id: confirmationFolderId,
      intake_form_url: intakeFormUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('provision-fund error:', message)
    return errorResponse(message)
  }
})
