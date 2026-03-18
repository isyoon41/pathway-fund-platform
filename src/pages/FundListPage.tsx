import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFunds } from '@/hooks/useSupabaseData'
import { useCreateFund } from '@/hooks/useSupabaseMutations'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount, formatDate } from '@/lib/utils'
import type { FundStatus, ProvisioningStatus } from '@/integrations/supabase/types'
import { Plus } from 'lucide-react'

const fundStatusConfig: Record<FundStatus, { label: string; className: string }> = {
  active: { label: '운영중', className: 'bg-green-100 text-green-800' },
  fundraising: { label: '모집중', className: 'bg-blue-100 text-blue-800' },
  closed: { label: '종료', className: 'bg-gray-100 text-gray-800' },
  archived: { label: '보관', className: 'bg-gray-100 text-gray-500' },
}

const provisioningStatusConfig: Record<ProvisioningStatus, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-yellow-100 text-yellow-800' },
  provisioning: { label: '진행중', className: 'bg-blue-100 text-blue-800' },
  ready: { label: '완료', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-800' },
}

export default function FundListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: funds, isLoading, error } = useFunds()
  const createFund = useCreateFund()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    fund_code: '',
    target_amount: '',
    description: '',
    status: 'fundraising' as FundStatus,
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await createFund.mutateAsync({
      name: form.name,
      fund_code: form.fund_code.trim() || undefined,
      target_amount: Number(form.target_amount),
      description: form.description || undefined,
      status: form.status,
    })
    setDialogOpen(false)
    setForm({ name: '', fund_code: '', target_amount: '', description: '', status: 'fundraising' })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">펀드 관리</h1>
          <p className="text-sm text-gray-500 mt-1">등록된 펀드 목록입니다.</p>
        </div>
        {profile?.role === 'admin' && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            펀드 추가
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">데이터를 불러오지 못했습니다.</div>
      ) : !funds || funds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">등록된 펀드가 없습니다.</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>펀드명</TableHead>
                <TableHead>목표금액</TableHead>
                <TableHead>현재금액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.map((fund) => {
                const fCfg = fundStatusConfig[fund.status]
                return (
                  <TableRow
                    key={fund.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/funds/${fund.id}`)}
                  >
                    <TableCell className="font-medium">{fund.name}</TableCell>
                    <TableCell>{formatAmount(fund.target_amount)}</TableCell>
                    <TableCell>{formatAmount(fund.current_amount)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${fCfg.className}`}
                      >
                        {fCfg.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(fund.created_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Fund Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>펀드 추가</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fund-name">펀드명 *</Label>
              <Input
                id="fund-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                placeholder="예: 패스웨이 밸류업 1호"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-code">
                펀드 코드
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  (출자의향서 URL에 사용, 영문·숫자·하이픈)
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">/intake/</span>
                <Input
                  id="fund-code"
                  value={form.fund_code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      fund_code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    }))
                  }
                  placeholder="예: valueup-1, equity-5"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                비워두면 펀드 ID(UUID)가 자동 사용됩니다.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-target">목표금액 (원) *</Label>
              <Input
                id="fund-target"
                type="number"
                value={form.target_amount}
                onChange={(e) => setForm((f) => ({ ...f, target_amount: e.target.value }))}
                required
                placeholder="예: 10000000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-status">상태</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as FundStatus }))}
              >
                <SelectTrigger id="fund-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fundraising">모집중</SelectItem>
                  <SelectItem value="active">운영중</SelectItem>
                  <SelectItem value="closed">종료</SelectItem>
                  <SelectItem value="archived">보관</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-desc">설명</Label>
              <Textarea
                id="fund-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="펀드에 대한 설명을 입력하세요."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createFund.isPending}>
                {createFund.isPending ? '생성중...' : '생성'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
