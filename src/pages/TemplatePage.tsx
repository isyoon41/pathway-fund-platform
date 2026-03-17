import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'
import type { TemplateVersion } from '@/integrations/supabase/types'

export default function TemplatePage() {
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['template_versions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_versions')
        .select('*, funds(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as (TemplateVersion & { funds: { name: string } | null })[]
    },
  })

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">템플릿 관리</h1>
        <p className="text-sm text-gray-500 mt-1">문서 템플릿 버전 목록입니다.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          데이터를 불러오지 못했습니다.
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          등록된 템플릿이 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>유형</TableHead>
                <TableHead>펀드</TableHead>
                <TableHead>버전</TableHead>
                <TableHead>활성</TableHead>
                <TableHead>생성일</TableHead>
                <TableHead>Google Docs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.type}</TableCell>
                  <TableCell>{t.funds?.name ?? '-'}</TableCell>
                  <TableCell>v{t.version}</TableCell>
                  <TableCell>
                    {t.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2.5 py-0.5 text-xs font-semibold">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2.5 py-0.5 text-xs font-semibold">
                        비활성
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(t.created_at)}
                  </TableCell>
                  <TableCell>
                    {t.google_template_doc_id ? (
                      <a
                        href={`https://docs.google.com/document/d/${t.google_template_doc_id}`}
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
        </div>
      )}
    </div>
  )
}
