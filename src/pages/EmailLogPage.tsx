import { useEmailLogs } from '@/hooks/useSupabaseData'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import type { EmailStatus } from '@/integrations/supabase/types'

const emailStatusConfig: Record<EmailStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-yellow-100 text-yellow-800' },
  sent: { label: '발송완료', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-800' },
}

export default function EmailLogPage() {
  const { data: emailLogs, isLoading, error } = useEmailLogs()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">이메일 발송 이력</h1>
        <p className="text-sm text-gray-500 mt-1">전체 이메일 발송 이력입니다.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          데이터를 불러오지 못했습니다.
        </div>
      ) : !emailLogs || emailLogs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          이메일 발송 이력이 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>발송일</TableHead>
                <TableHead>오류 메시지</TableHead>
                <TableHead>메시지 ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailLogs.map((e) => {
                const cfg = emailStatusConfig[e.status]
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.subject}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                      >
                        {cfg.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(e.created_at)}
                    </TableCell>
                    <TableCell className="text-destructive text-sm">
                      {e.error_message ?? '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">
                      {e.provider_message_id ?? '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
