import { useParams, useNavigate } from 'react-router-dom'
import {
  useCommitment,
  useSchedules,
  useDocuments,
  useEmailLogs,
  useActivityLogs,
} from '@/hooks/useSupabaseData'
import {
  useUpdateCommitmentStatus,
  useRequestDocumentGeneration,
  useRequestEmailSend,
} from '@/hooks/useSupabaseMutations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount, formatDate } from '@/lib/utils'
import type { CommitmentStatus, DocumentStatus, EmailStatus, ScheduleStatus } from '@/integrations/supabase/types'
import { ArrowLeft, ExternalLink, FileText, Mail } from 'lucide-react'

const statusConfig: Record<CommitmentStatus, { label: string; className: string }> = {
  new: { label: '신규', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  reviewing: { label: '검토중', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-800 border-red-200' },
  on_hold: { label: '보류', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  completed: { label: '완료', className: 'bg-purple-100 text-purple-800 border-purple-200' },
}

const docStatusLabels: Record<DocumentStatus, string> = {
  draft: '초안',
  generated: '생성완료',
  sent: '발송완료',
  failed: '실패',
  archived: '보관',
}

const emailStatusLabels: Record<EmailStatus, string> = {
  pending: '대기',
  sent: '발송완료',
  failed: '실패',
}

const scheduleStatusLabels: Record<ScheduleStatus, string> = {
  pending: '대기',
  done: '완료',
  cancelled: '취소',
}

export default function CommitmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: commitment, isLoading, error } = useCommitment(id)
  const { data: schedules } = useSchedules(id)
  const { data: documents } = useDocuments(id)
  const { data: emailLogs } = useEmailLogs(id)
  const { data: activities } = useActivityLogs(id)

  const updateStatus = useUpdateCommitmentStatus()
  const requestDocGen = useRequestDocumentGeneration()
  const requestEmail = useRequestEmailSend()

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">불러오는 중...</div>
  }

  if (error || !commitment) {
    return (
      <div className="p-8 text-center text-destructive">출자의향을 찾을 수 없습니다.</div>
    )
  }

  const investor = commitment.investors as {
    name: string
    email: string | null
    phone: string | null
    preferred_contact: string
  } | null

  const fund = commitment.funds as { name: string } | null
  const cfg = statusConfig[commitment.status]

  async function handleStatusChange(status: CommitmentStatus) {
    if (!id) return
    await updateStatus.mutateAsync({
      id,
      status,
      fundId: commitment?.fund_id ?? undefined,
    })
  }

  async function handleDocGeneration() {
    if (!id || !commitment) return
    await requestDocGen.mutateAsync({
      commitmentId: id,
      fundId: commitment.fund_id,
      type: 'confirmation_letter',
    })
  }

  async function handleEmailSend() {
    if (!id || !commitment || !investor?.name) return
    await requestEmail.mutateAsync({
      commitmentId: id,
      investorId: commitment.investor_id,
      fundId: commitment.fund_id,
      subject: `[${fund?.name ?? ''}] 출자의향 확인서 발송`,
    })
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/commitments')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {investor?.name ?? '알 수 없음'}
            </h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
            >
              {cfg.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{fund?.name ?? '-'}</p>
        </div>
      </div>

      {/* Basic info + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">출자의향 기본 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">투자자명</dt>
                  <dd className="font-medium mt-1">{investor?.name ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">연락처</dt>
                  <dd className="font-medium mt-1">
                    {investor?.email ?? investor?.phone ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">선호 연락 방법</dt>
                  <dd className="font-medium mt-1">{investor?.preferred_contact ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">펀드</dt>
                  <dd className="font-medium mt-1">{fund?.name ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">신청금액</dt>
                  <dd className="font-medium mt-1">{formatAmount(commitment.requested_amount)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">확정금액</dt>
                  <dd className="font-medium mt-1">
                    {commitment.confirmed_amount
                      ? formatAmount(commitment.confirmed_amount)
                      : '-'}
                  </dd>
                </div>
                {commitment.notes && (
                  <div className="col-span-2">
                    <dt className="text-sm text-muted-foreground">메모</dt>
                    <dd className="font-medium mt-1">{commitment.notes}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-muted-foreground">등록일</dt>
                  <dd className="font-medium mt-1">{formatDate(commitment.created_at)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">워크플로우 액션</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {commitment.status === 'new' && (
                <Button
                  className="w-full"
                  onClick={() => handleStatusChange('reviewing')}
                  disabled={updateStatus.isPending}
                >
                  검토 시작
                </Button>
              )}

              {commitment.status === 'reviewing' && (
                <>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => handleStatusChange('confirmed')}
                    disabled={updateStatus.isPending}
                  >
                    확정
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleStatusChange('rejected')}
                    disabled={updateStatus.isPending}
                  >
                    반려
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleStatusChange('on_hold')}
                    disabled={updateStatus.isPending}
                  >
                    보류
                  </Button>
                </>
              )}

              {commitment.status === 'confirmed' && (
                <>
                  <Button
                    className="w-full"
                    onClick={handleDocGeneration}
                    disabled={requestDocGen.isPending}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {requestDocGen.isPending ? '생성 요청 중...' : '문서 생성 요청'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleEmailSend}
                    disabled={requestEmail.isPending}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {requestEmail.isPending ? '요청 중...' : '메일 발송 요청'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => handleStatusChange('completed')}
                    disabled={updateStatus.isPending}
                  >
                    완료 처리
                  </Button>
                </>
              )}

              {commitment.status === 'on_hold' && (
                <Button
                  className="w-full"
                  onClick={() => handleStatusChange('reviewing')}
                  disabled={updateStatus.isPending}
                >
                  검토 재개
                </Button>
              )}

              {(commitment.status === 'rejected' ||
                commitment.status === 'completed') && (
                <p className="text-sm text-muted-foreground text-center">
                  추가 액션이 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="schedules">
        <TabsList>
          <TabsTrigger value="schedules">
            일정 ({schedules?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="documents">
            문서 ({documents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="emails">
            이메일 ({emailLogs?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="activity">
            활동 로그 ({activities?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Schedules */}
        <TabsContent value="schedules">
          <Card>
            <CardContent className="p-0">
              {!schedules || schedules.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  일정이 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제목</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>예정일</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>캘린더</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.title}</TableCell>
                        <TableCell>{s.type}</TableCell>
                        <TableCell>{formatDate(s.scheduled_at)}</TableCell>
                        <TableCell>{scheduleStatusLabels[s.status]}</TableCell>
                        <TableCell>
                          {s.calendar_event_url ? (
                            <a
                              href={s.calendar_event_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                            >
                              열기
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card>
            <CardContent className="p-0">
              {!documents || documents.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  문서가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제목</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>생성일</TableHead>
                      <TableHead>링크</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell>{d.type}</TableCell>
                        <TableCell>{docStatusLabels[d.status]}</TableCell>
                        <TableCell>{formatDate(d.created_at)}</TableCell>
                        <TableCell>
                          {d.google_doc_id ? (
                            <a
                              href={`https://docs.google.com/document/d/${d.google_doc_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                            >
                              Google Docs
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Logs */}
        <TabsContent value="emails">
          <Card>
            <CardContent className="p-0">
              {!emailLogs || emailLogs.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  이메일 발송 이력이 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제목</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>발송일</TableHead>
                      <TableHead>오류</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailLogs.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.subject}</TableCell>
                        <TableCell>{emailStatusLabels[e.status]}</TableCell>
                        <TableCell>{formatDate(e.created_at)}</TableCell>
                        <TableCell className="text-destructive text-sm">
                          {e.error_message ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Logs */}
        <TabsContent value="activity">
          <Card>
            <CardContent className="p-0">
              {!activities || activities.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  활동 로그가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>액션</TableHead>
                      <TableHead>설명</TableHead>
                      <TableHead>일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.action}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {a.description ?? '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(a.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
