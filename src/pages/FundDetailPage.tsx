import { useParams, useNavigate } from 'react-router-dom'
import { useFund, useCommitments } from '@/hooks/useSupabaseData'
import { useProvisionFund } from '@/hooks/useSupabaseMutations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount, formatDate } from '@/lib/utils'
import type { CommitmentStatus, FundStatus, ProvisioningStatus } from '@/integrations/supabase/types'
import { ArrowLeft, ExternalLink, Settings } from 'lucide-react'

const statusConfig: Record<CommitmentStatus, { label: string; className: string }> = {
  new: { label: '신규', className: 'bg-blue-100 text-blue-800' },
  reviewing: { label: '검토중', className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-800' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-800' },
  on_hold: { label: '보류', className: 'bg-gray-100 text-gray-800' },
  completed: { label: '완료', className: 'bg-purple-100 text-purple-800' },
}

const fundStatusLabels: Record<FundStatus, string> = {
  active: '운영중',
  fundraising: '모집중',
  closed: '종료',
  archived: '보관',
}

const provisioningLabels: Record<ProvisioningStatus, string> = {
  pending: '대기',
  provisioning: '프로비저닝 중',
  ready: '완료',
  failed: '실패',
}

export default function FundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: fund, isLoading, error } = useFund(id)
  const { data: commitments } = useCommitments(id)
  const provisionFund = useProvisionFund()

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">불러오는 중...</div>
    )
  }

  if (error || !fund) {
    return (
      <div className="p-8 text-center text-destructive">
        펀드를 찾을 수 없습니다.
      </div>
    )
  }

  const fundAssets = (fund as Record<string, unknown>).fund_assets as {
    intake_form_url: string | null
    provisioning_status: ProvisioningStatus
  } | null

  const canProvision = !fundAssets || fundAssets.provisioning_status === 'pending' || fundAssets.provisioning_status === 'failed'

  async function handleProvision() {
    if (!id) return
    await provisionFund.mutateAsync(id)
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/funds')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{fund.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {fundStatusLabels[fund.status]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Fund Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">펀드 기본 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">펀드명</dt>
                  <dd className="font-medium mt-1">{fund.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">상태</dt>
                  <dd className="font-medium mt-1">{fundStatusLabels[fund.status]}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">목표금액</dt>
                  <dd className="font-medium mt-1">{formatAmount(fund.target_amount)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">현재금액</dt>
                  <dd className="font-medium mt-1">{formatAmount(fund.current_amount)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm text-muted-foreground">설명</dt>
                  <dd className="font-medium mt-1">{fund.description ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">등록일</dt>
                  <dd className="font-medium mt-1">{formatDate(fund.created_at)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Fund Assets */}
        <div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">펀드 자산 (Google)</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">프로비저닝 상태</p>
                <p className="font-medium mt-1">
                  {fundAssets
                    ? provisioningLabels[fundAssets.provisioning_status]
                    : '미설정'}
                </p>
              </div>
              {fundAssets?.intake_form_url && (
                <div>
                  <p className="text-sm text-muted-foreground">신청 폼</p>
                  <a
                    href={fundAssets.intake_form_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1"
                  >
                    Google Form 열기
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {canProvision && (
                <Button
                  className="w-full"
                  onClick={handleProvision}
                  disabled={provisionFund.isPending}
                >
                  {provisionFund.isPending ? '프로비저닝 중...' : '펀드 프로비저닝'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Commitments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">출자의향 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!commitments || commitments.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              출자의향이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>투자자</TableHead>
                  <TableHead>신청금액</TableHead>
                  <TableHead>확정금액</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitments.map((c) => {
                  const investor = c.investors as { name: string } | null
                  const cfg = statusConfig[c.status]
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
                        {c.confirmed_amount ? formatAmount(c.confirmed_amount) : '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                        >
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(c.created_at)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
