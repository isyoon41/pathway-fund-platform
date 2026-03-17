import { useSchedules } from '@/hooks/useSupabaseData'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import type { ScheduleStatus, ScheduleType } from '@/integrations/supabase/types'
import { ExternalLink } from 'lucide-react'

const scheduleTypeLabels: Record<ScheduleType, string> = {
  review: '검토',
  meeting: '미팅',
  deadline: '마감',
}

const scheduleStatusConfig: Record<ScheduleStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-yellow-100 text-yellow-800' },
  done: { label: '완료', className: 'bg-green-100 text-green-800' },
  cancelled: { label: '취소', className: 'bg-gray-100 text-gray-800' },
}

export default function ScheduleListPage() {
  const { data: schedules, isLoading, error } = useSchedules()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">일정 관리</h1>
        <p className="text-sm text-gray-500 mt-1">전체 일정 목록입니다.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          데이터를 불러오지 못했습니다.
        </div>
      ) : !schedules || schedules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          등록된 일정이 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>예정일</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>캘린더 이벤트</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((s) => {
                const cfg = scheduleStatusConfig[s.status]
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell>{scheduleTypeLabels[s.type]}</TableCell>
                    <TableCell>{formatDate(s.scheduled_at)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                      >
                        {cfg.label}
                      </span>
                    </TableCell>
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
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
