import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useFund,
  useCommitments,
  useFundSchedules,
  useFundDocuments,
  useFundEmailLogs,
  useFundActivityLogs,
  useFundInvestors,
} from '@/hooks/useSupabaseData'
import { useProvisionFund } from '@/hooks/useSupabaseMutations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatAmount, formatDate } from '@/lib/utils'
import type {
  CommitmentStatus,
  FundStatus,
  ProvisioningStatus,
  ScheduleType,
  ScheduleStatus,
  DocumentStatus,
  EmailStatus,
} from '@/integrations/supabase/types'
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  RefreshCw,
  UserPlus,
  FileText,
  Mail,
  CalendarPlus,
  FolderOpen,
  FileSpreadsheet,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react'

// ── 상태 설정 ──

const commitmentStatusConfig: Record<
  CommitmentStatus,
  { label: string; className: string }
> = {
  new: { label: '신규', className: 'bg-blue-100 text-blue-800' },
  reviewing: { label: '검토중', className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-800' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-800' },
  on_hold: { label: '보류', className: 'bg-gray-100 text-gray-800' },
  completed: { label: '완료', className: 'bg-purple-100 text-purple-800' },
}

const fundStatusConfig: Record<
  FundStatus,
  { label: string; className: string }
> = {
  active: { label: '운영중', className: 'bg-green-100 text-green-800' },
  fundraising: { label: '모집중', className: 'bg-blue-100 text-blue-800' },
  closed: { label: '종료', className: 'bg-gray-100 text-gray-800' },
  archived: { label: '보관', className: 'bg-gray-100 text-gray-600' },
}

const provisioningConfig: Record<
  ProvisioningStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  pending: {
    label: '대기',
    className: 'bg-gray-100 text-gray-700',
    icon: Clock,
  },
  provisioning: {
    label: '프로비저닝 중',
    className: 'bg-yellow-100 text-yellow-700',
    icon: Loader2,
  },
  ready: {
    label: '준비완료',
    className: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },
  failed: {
    label: '실패',
    className: 'bg-red-100 text-red-700',
    icon: AlertCircle,
  },
}

const scheduleTypeLabels: Record<ScheduleType, string> = {
  review: '검토',
  meeting: '회의',
  deadline: '마감',
}

const scheduleStatusConfig: Record<
  ScheduleStatus,
  { label: string; className: string }
> = {
  pending: { label: '예정', className: 'bg-yellow-100 text-yellow-800' },
  done: { label: '완료', className: 'bg-green-100 text-green-800' },
  cancelled: { label: '취소', className: 'bg-gray-100 text-gray-800' },
}

const docStatusConfig: Record<
  DocumentStatus,
  { label: string; className: string }
> = {
  draft: { label: '초안', className: 'bg-gray-100 text-gray-800' },
  generated: { label: '생성', className: 'bg-blue-100 text-blue-800' },
  sent: { label: '발송', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-800' },
  archived: { label: '보관', className: 'bg-gray-100 text-gray-600' },
}

const emailStatusConfig: Record<
  EmailStatus,
  { label: string; className: string }
> = {
  pending: { label: '대기', className: 'bg-yellow-100 text-yellow-800' },
  sent: { label: '발송', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-800' },
}

// ── 탭 정의 ──

type TabKey =
  | 'info'
  | 'assets'
  | 'investors'
  | 'commitments'
  | 'schedules'
  | 'documents'
  | 'emails'
  | 'activity'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'info', label: '기본정보' },
  { key: 'assets', label: '운영자산' },
  { key: 'investors', label: '출자자/조합원' },
  { key: 'commitments', label: '출자의향' },
  { key: 'schedules', label: '일정' },
  { key: 'documents', label: '문서' },
  { key: 'emails', label: '메일로그' },
  { key: 'activity', label: '활동로그' },
]

// ── 유틸 ──

function StatusBadge({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
      title="복사"
    >
      {copied ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  )
}

function ExternalLinkButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
      title="열기"
    >
      <ExternalLink className="h-4 w-4" />
    </a>
  )
}

// ── 메인 컴포넌트 ──

export default function FundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('info')

  const { data: fund, isLoading, error } = useFund(id)
  const { data: commitments } = useCommitments(id)
  const { data: schedules } = useFundSchedules(id)
  const { data: documents } = useFundDocuments(id)
  const { data: emailLogs } = useFundEmailLogs(id)
  const { data: activityLogs } = useFundActivityLogs(id)
  const { data: fundInvestors } = useFundInvestors(id)
  const provisionFund = useProvisionFund()

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        불러오는 중...
      </div>
    )
  }

  if (error || !fund) {
    return (
      <div className="p-8 text-center text-destructive">
        펀드를 찾을 수 없습니다.
      </div>
    )
  }

  const fundAssets = (fund as Record<string, unknown>).fund_assets as
    | {
        intake_form_id: string | null
        intake_form_url: string | null
        intake_spreadsheet_id: string | null
        intake_folder_id: string | null
        confirmation_folder_id: string | null
        provisioning_status: ProvisioningStatus
      }[]
    | null

  const asset = Array.isArray(fundAssets) ? fundAssets[0] : null
  const fStatus = fundStatusConfig[fund.status]

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* ── 헤더 ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/funds')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{fund.name}</h1>
              <StatusBadge label={fStatus.label} className={fStatus.className} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {fund.description ?? ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/commitments?fund=${id}`)}
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            출자자 추가
          </Button>
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-1.5" />
            문서 생성
          </Button>
          <Button variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-1.5" />
            메일 발송
          </Button>
          <Button variant="outline" size="sm">
            <CalendarPlus className="h-4 w-4 mr-1.5" />
            일정 추가
          </Button>
        </div>
      </div>

      {/* ── 탭 네비게이션 ── */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── 탭 내용 ── */}
      {activeTab === 'info' && (
        <TabInfo fund={fund} />
      )}
      {activeTab === 'assets' && (
        <TabAssets
          asset={asset}
          fundId={id!}
          provisionFund={provisionFund}
        />
      )}
      {activeTab === 'investors' && (
        <TabInvestors data={fundInvestors} navigate={navigate} />
      )}
      {activeTab === 'commitments' && (
        <TabCommitments data={commitments} navigate={navigate} />
      )}
      {activeTab === 'schedules' && <TabSchedules data={schedules} />}
      {activeTab === 'documents' && <TabDocuments data={documents} />}
      {activeTab === 'emails' && <TabEmails data={emailLogs} />}
      {activeTab === 'activity' && <TabActivity data={activityLogs} />}
    </div>
  )
}

// ════════════════════════════════════════
// 탭 1: 기본정보
// ════════════════════════════════════════

function TabInfo({ fund }: { fund: Record<string, unknown> }) {
  const fStatus = fundStatusConfig[(fund.status as FundStatus)]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">펀드 기본 정보</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <dt className="text-sm text-muted-foreground">펀드명</dt>
            <dd className="font-medium mt-1">{fund.name as string}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">상태</dt>
            <dd className="mt-1">
              <StatusBadge label={fStatus.label} className={fStatus.className} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">목표규모</dt>
            <dd className="font-medium mt-1">
              {formatAmount(fund.target_amount as number)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">현재규모</dt>
            <dd className="font-medium mt-1">
              {formatAmount(fund.current_amount as number)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">담당자</dt>
            <dd className="font-medium mt-1">-</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">생성일</dt>
            <dd className="font-medium mt-1">
              {formatDate(fund.created_at as string)}
            </dd>
          </div>
          {(fund.description as string | null) && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-sm text-muted-foreground">설명</dt>
              <dd className="font-medium mt-1">{String(fund.description)}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════
// 탭 2: 운영자산
// ════════════════════════════════════════

function TabAssets({
  asset,
  fundId,
  provisionFund,
}: {
  asset: {
    intake_form_id: string | null
    intake_form_url: string | null
    intake_spreadsheet_id: string | null
    intake_folder_id: string | null
    confirmation_folder_id: string | null
    provisioning_status: ProvisioningStatus
  } | null
  fundId: string
  provisionFund: ReturnType<typeof useProvisionFund>
}) {
  const status = asset?.provisioning_status ?? 'pending'
  const pConfig = provisioningConfig[status]
  const PIcon = pConfig.icon
  const canProvision = !asset || status === 'pending' || status === 'failed'

  const driveBaseUrl = 'https://drive.google.com/drive/folders/'
  const formBaseUrl = 'https://docs.google.com/forms/d/'
  const sheetBaseUrl = 'https://docs.google.com/spreadsheets/d/'

  type AssetRow = {
    icon: typeof FolderOpen
    label: string
    id: string | null
    url: string | null
    editUrl?: string | null
  }

  const rows: AssetRow[] = [
    {
      icon: FolderOpen,
      label: 'Drive 폴더',
      id: null, // root folder id would come from fund_assets later
      url: null,
    },
    {
      icon: FolderOpen,
      label: '출자의향접수 폴더',
      id: asset?.intake_folder_id ?? null,
      url: asset?.intake_folder_id
        ? `${driveBaseUrl}${asset.intake_folder_id}`
        : null,
    },
    {
      icon: FolderOpen,
      label: '출자확인서 폴더',
      id: asset?.confirmation_folder_id ?? null,
      url: asset?.confirmation_folder_id
        ? `${driveBaseUrl}${asset.confirmation_folder_id}`
        : null,
    },
    {
      icon: ClipboardList,
      label: '출자의향 접수폼',
      id: asset?.intake_form_id ?? null,
      url: asset?.intake_form_url ?? null,
      editUrl: asset?.intake_form_id
        ? `${formBaseUrl}${asset.intake_form_id}/edit`
        : null,
    },
    {
      icon: FileSpreadsheet,
      label: '응답 스프레드시트',
      id: asset?.intake_spreadsheet_id ?? null,
      url: asset?.intake_spreadsheet_id
        ? `${sheetBaseUrl}${asset.intake_spreadsheet_id}`
        : null,
    },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">운영 자산 현황</CardTitle>
        <div className="flex items-center gap-2">
          <StatusBadge label={pConfig.label} className={pConfig.className} />
          {canProvision && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => provisionFund.mutateAsync(fundId)}
              disabled={provisionFund.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${provisionFund.isPending ? 'animate-spin' : ''}`}
              />
              {provisionFund.isPending ? '생성 중...' : '재시도'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {rows.map((row) => {
            const Icon = row.icon
            const isReady = !!row.id || !!row.url
            return (
              <div
                key={row.label}
                className={`flex items-center justify-between px-6 py-4 ${
                  row.label === '출자의향 접수폼'
                    ? 'bg-blue-50/50'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium">{row.label}</span>
                  {isReady ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {row.id && <CopyButton text={row.id} />}
                  {row.url && <ExternalLinkButton href={row.url} />}
                  {row.editUrl && (
                    <a
                      href={row.editUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                    >
                      편집
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {asset && (
          <div className="px-6 py-3 border-t bg-gray-50 text-xs text-muted-foreground">
            마지막 프로비저닝: {new Date().toLocaleString('ko-KR')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════
// 탭 3: 출자자/조합원
// ════════════════════════════════════════

function TabInvestors({
  data,
  navigate,
}: {
  data: unknown[] | undefined
  navigate: ReturnType<typeof useNavigate>
}) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          등록된 출자자가 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead>신청금액</TableHead>
              <TableHead>확정금액</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row: any) => {
              const investor = row.investors
              const cfg = commitmentStatusConfig[row.status as CommitmentStatus]
              return (
                <TableRow
                  key={row.investor_id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/investors`)}
                >
                  <TableCell className="font-medium">
                    {investor?.name ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {investor?.email ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {investor?.phone ?? '-'}
                  </TableCell>
                  <TableCell>{formatAmount(row.requested_amount)}</TableCell>
                  <TableCell>
                    {row.confirmed_amount
                      ? formatAmount(row.confirmed_amount)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={cfg.label} className={cfg.className} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════
// 탭 4: 출자의향
// ════════════════════════════════════════

function TabCommitments({
  data,
  navigate,
}: {
  data: unknown[] | undefined
  navigate: ReturnType<typeof useNavigate>
}) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          출자의향이 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>투자자</TableHead>
              <TableHead>신청금액</TableHead>
              <TableHead>확정금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>비고</TableHead>
              <TableHead>등록일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c: any) => {
              const investor = c.investors
              const cfg = commitmentStatusConfig[c.status as CommitmentStatus]
              return (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/commitments/${c.id}`)}
                >
                  <TableCell className="font-medium">
                    {investor?.name ?? '-'}
                  </TableCell>
                  <TableCell>{formatAmount(c.requested_amount)}</TableCell>
                  <TableCell>
                    {c.confirmed_amount
                      ? formatAmount(c.confirmed_amount)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={cfg.label} className={cfg.className} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                    {c.notes ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(c.created_at)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════
// 탭 5: 일정
// ════════════════════════════════════════

function TabSchedules({ data }: { data: unknown[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          등록된 일정이 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>유형</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>일시</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>관련 투자자</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s: any) => {
              const sCfg =
                scheduleStatusConfig[s.status as ScheduleStatus]
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {scheduleTypeLabels[s.type as ScheduleType] ?? s.type}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{s.title}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(s.scheduled_at).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={sCfg.label} className={sCfg.className} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {s.commitments?.investors?.name ?? '-'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════
// 탭 6: 문서
// ════════════════════════════════════════

function TabDocuments({ data }: { data: unknown[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          문서가 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>문서명</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>투자자</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((d: any) => {
              const dCfg = docStatusConfig[d.status as DocumentStatus]
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.type}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={dCfg.label} className={dCfg.className} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {d.commitments?.investors?.name ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(d.created_at)}
                  </TableCell>
                  <TableCell>
                    {d.google_doc_id && (
                      <a
                        href={`https://docs.google.com/document/d/${d.google_doc_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        열기
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════
// 탭 7: 메일로그
// ════════════════════════════════════════

function TabEmails({ data }: { data: unknown[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          이메일 발송 이력이 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>수신자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>오류</TableHead>
              <TableHead>발송일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((e: any) => {
              const eCfg = emailStatusConfig[e.status as EmailStatus]
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.subject}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {e.investors?.name ?? '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={eCfg.label} className={eCfg.className} />
                  </TableCell>
                  <TableCell className="text-sm text-red-500 max-w-[200px] truncate">
                    {e.error_message ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(e.created_at)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ════════════════════════════════════════
// 탭 8: 활동로그
// ════════════════════════════════════════

function TabActivity({ data }: { data: unknown[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          활동 내역이 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {data.map((a: any) => (
            <div key={a.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                    {a.action}
                  </span>
                  <span className="text-sm">{a.description}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.profiles?.name ?? '시스템'} ·{' '}
                  {new Date(a.created_at).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
