import { useInvestors } from '@/hooks/useSupabaseData'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import type { ContactPreference } from '@/integrations/supabase/types'

const contactLabels: Record<ContactPreference, string> = {
  email: '이메일',
  phone: '전화',
  kakao: '카카오톡',
}

export default function InvestorListPage() {
  const { data: investors, isLoading, error } = useInvestors()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">투자자 관리</h1>
        <p className="text-sm text-gray-500 mt-1">등록된 투자자 목록입니다.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          데이터를 불러오지 못했습니다.
        </div>
      ) : !investors || investors.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          등록된 투자자가 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>전화번호</TableHead>
                <TableHead>선호 연락방법</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.map((investor) => (
                <TableRow key={investor.id}>
                  <TableCell className="font-medium">{investor.name}</TableCell>
                  <TableCell>{investor.email ?? '-'}</TableCell>
                  <TableCell>{investor.phone ?? '-'}</TableCell>
                  <TableCell>{contactLabels[investor.preferred_contact]}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(investor.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
