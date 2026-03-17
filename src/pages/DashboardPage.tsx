import { useNavigate } from 'react-router-dom'
import { useDashboardStats, useCommitments, useActivityLogs } from '@/hooks/useSupabaseData'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount, formatDate } from '@/lib/utils'
import type { CommitmentStatus } from '@/integrations/supabase/types'
import { Briefcase, TrendingUp, Clock, FileX } from 'lucide-react'

const statusConfig: Record<CommitmentStatus, { label: string; className: string }> = {
  new: { label: '신규', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  reviewing: { label: '검토중', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-800 border-red-200' },
  on_hold: { label: '보류', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  completed: { label: '완료', className: 'bg-purple-100 text-purple-800 border-purple-200' },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: commitments, isLoading: commitmentsLoading } = useCommitments()
  const { data: activities, isLoading: activitiesLoading } = useActivityLogs()

  const recentCommitments = commitments?.slice(0, 10) ?? []
  const recentActivities = activities?.slice(0, 10) ?? []

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">펀드 운영 현황을 확인하세요.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">운영 펀드 수</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '-' : stats?.activeFunds ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">활성 + 모집중</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행중 출자의향</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '-' : stats?.inProgressCommitments ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">신규 + 검토중</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">검토 대기</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '-' : stats?.pendingReview ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">신규 상태</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">미발송 문서</CardTitle>
            <FileX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '-' : stats?.unsentDocuments ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">생성완료 미발송</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Commitments */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">최근 출자의향 현황</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {commitmentsLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : recentCommitments.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  출자의향이 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>투자자</TableHead>
                      <TableHead>펀드</TableHead>
                      <TableHead>신청금액</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCommitments.map((c) => {
                      const investor = c.investors as { name: string } | null
                      const fund = c.funds as { name: string } | null
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
                          <TableCell className="text-muted-foreground text-sm">
                            {fund?.name ?? '-'}
                          </TableCell>
                          <TableCell>{formatAmount(c.requested_amount)}</TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                            >
                              {cfg.label}
                            </span>
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

        {/* Recent Activities */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">최근 활동</CardTitle>
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="text-center text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : recentActivities.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground">
                  활동 내역이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="flex flex-col gap-1">
                      <p className="text-sm leading-tight">
                        {activity.description ?? activity.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(activity.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
