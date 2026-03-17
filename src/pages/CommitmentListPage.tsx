import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCommitments } from '@/hooks/useSupabaseData'
import { useFunds } from '@/hooks/useSupabaseData'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount, formatDate } from '@/lib/utils'
import type { CommitmentStatus } from '@/integrations/supabase/types'

const statusConfig: Record<CommitmentStatus, { label: string; className: string }> = {
  new: { label: '신규', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  reviewing: { label: '검토중', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-800 border-red-200' },
  on_hold: { label: '보류', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  completed: { label: '완료', className: 'bg-purple-100 text-purple-800 border-purple-200' },
}

export default function CommitmentListPage() {
  const navigate = useNavigate()
  const [selectedFund, setSelectedFund] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const { data: commitments, isLoading } = useCommitments(
    selectedFund !== 'all' ? selectedFund : undefined
  )
  const { data: funds } = useFunds()

  const filtered = commitments?.filter((c) => {
    if (selectedStatus !== 'all' && c.status !== selectedStatus) return false
    return true
  })

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">출자의향 목록</h1>
        <p className="text-sm text-gray-500 mt-1">전체 출자의향 현황입니다.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="w-48">
          <Select value={selectedFund} onValueChange={setSelectedFund}>
            <SelectTrigger>
              <SelectValue placeholder="펀드 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 펀드</SelectItem>
              {funds?.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger>
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="new">신규</SelectItem>
              <SelectItem value="reviewing">검토중</SelectItem>
              <SelectItem value="confirmed">확정</SelectItem>
              <SelectItem value="rejected">반려</SelectItem>
              <SelectItem value="on_hold">보류</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          출자의향이 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>투자자</TableHead>
                <TableHead>펀드</TableHead>
                <TableHead>신청금액</TableHead>
                <TableHead>확정금액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
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
                      {c.confirmed_amount ? formatAmount(c.confirmed_amount) : '-'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
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
        </div>
      )}
    </div>
  )
}
