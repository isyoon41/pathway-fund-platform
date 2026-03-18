/**
 * provision-fund: 펀드 생성 시 Google Drive 폴더 + 스프레드시트 자동 생성
 *
 * Body: { fund_id: string }
 *
 * 1. Google Drive에 펀드 폴더 구조 생성
 *    ROOT/{펀드명}/
 *      ├── 출자의향접수/   ← 접수응답 스프레드시트 생성
 *      └── 출자확인서/
 * 2. 출자의향접수 폴더에 응답 기록용 Google Spreadsheet 생성 (헤더 포함)
 * 3. fund_assets에 Drive 폴더 ID/URL + 스프레드시트 ID/URL + Tally 폼 URL 저장
 *
 * 환경변수:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — 서비스 계정 JSON (drive + sheets 스코프)
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID — 루트 폴더 ID (펀드운영_루트)
 *   TALLY_FORM_BASE_URL         — 예: https://tally.so/r/{formId}
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken } from '../_shared/google-auth.ts'
import {
  findOrCreateFolder,
  createSpreadsheetWithHeaders,
} from '../_shared/google-drive.ts'

// 출자의향 접수응답 스프레드시트 헤더
const INTAKE_SHEET_HEADERS = [
  '접수일시',
  '이름',
  '이메일',
  '연락처',
  '선호연락방식',
  '출자의향금액(원)',
  '비고',
  'commitment_id',
  'investor_id',
]

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

    // 1. 펀드 이름 + 코드 조회
    const { data: fund, error: fundErr } = await supabase
      .from('funds')
      .select('id, name, fund_code')
      .eq('id', fundId)
      .single()
    if (fundErr || !fund) throw new Error(`fund not found: ${fundErr?.message}`)

    // 2. 프로비저닝 시작 상태로 upsert
    await supabase
      .from('fund_assets')
      .upsert(
        { fund_id: fundId, provisioning_status: 'provisioning' },
        { onConflict: 'fund_id' },
      )

    // 3. 서비스 계정 액세스 토큰 (Drive + Sheets 스코프)
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
    const token = await getAccessToken(serviceAccountJson, [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ])

    // 4. Drive 폴더 구조 생성: ROOT/{펀드명}/출자의향접수/, 출자확인서/
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

    // 5. 출자의향접수 폴더에 응답 기록용 스프레드시트 생성
    const sheetTitle = `${fund.name} 출자의향 접수응답`
    const { spreadsheetId, spreadsheetUrl } = await createSpreadsheetWithHeaders(
      token,
      sheetTitle,
      intakeFolderId,
      INTAKE_SHEET_HEADERS,
    )

    // 6. 자체 출자의향서 폼 URL 생성
    // fund_code가 있으면 /intake/{fund_code}, 없으면 /intake/{fund_id}
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://pathway-fund-platform.vercel.app'
    const intakeSlug = (fund as any).fund_code || fundId
    const intakeFormUrl = `${siteUrl}/intake/${intakeSlug}`

    // 7. Drive 폴더 URL
    const driveFolderUrl = `https://drive.google.com/drive/folders/${fundFolderId}`

    // 8. fund_assets 업데이트
    await supabase
      .from('fund_assets')
      .update({
        drive_folder_id: fundFolderId,
        drive_folder_url: driveFolderUrl,
        intake_folder_id: intakeFolderId,
        confirmation_folder_id: confirmationFolderId,
        intake_form_url: intakeFormUrl,
        intake_spreadsheet_id: spreadsheetId,
        intake_spreadsheet_url: spreadsheetUrl,
        provisioning_status: 'ready',
      })
      .eq('fund_id', fundId)

    // 9. 활동 로그
    await supabase.from('activity_logs').insert({
      fund_id: fundId,
      action: 'provision_complete',
      description: `펀드 운영자산 프로비저닝 완료: Drive 폴더 생성 (${driveFolderUrl}), 출자의향 접수응답 스프레드시트 생성`,
    })

    return jsonResponse({
      fund_id: fundId,
      drive_folder_id: fundFolderId,
      drive_folder_url: driveFolderUrl,
      intake_folder_id: intakeFolderId,
      confirmation_folder_id: confirmationFolderId,
      intake_form_url: intakeFormUrl,
      intake_spreadsheet_id: spreadsheetId,
      intake_spreadsheet_url: spreadsheetUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('provision-fund error:', message)

    // 실패 시 상태 업데이트
    try {
      const body = await new Response(null).json().catch(() => ({}))
      if ((body as any)?.fund_id) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )
        await supabase
          .from('fund_assets')
          .update({ provisioning_status: 'failed' })
          .eq('fund_id', (body as any).fund_id)
      }
    } catch (_) { /* ignore */ }

    return errorResponse(message)
  }
})
