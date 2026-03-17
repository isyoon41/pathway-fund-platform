import { useDocuments } from '@/hooks/useSupabaseData'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import type { DocumentStatus } from '@/integrations/supabase/types'
import { ExternalLink } from 'lucide-react'

const docStatusConfig: Record<DocumentStatus, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-gray-100 text-gray-800' },
  generated: { label: '생성완료', className: 'bg-blue-100 text-blue-800' },
  sent: { label: '발송완료', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-800' },
  archived: { label: '보관', className: 'bg-gray-100 text-gray-500' },
}

export default function DocumentListPage() {
  const { data: documents, isLoading, error } = useDocuments()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">문서 관리</h1>
        <p className="text-sm text-gray-500 mt-1">전체 문서 목록입니다.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          데이터를 불러오지 못했습니다.
        </div>
      ) : !documents || documents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          문서가 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>생성일</TableHead>
                <TableHead>Google Docs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => {
                const cfg = docStatusConfig[d.status]
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell>{d.type}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                      >
                        {cfg.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(d.created_at)}
                    </TableCell>
                    <TableCell>
                      {d.google_doc_id ? (
                        <a
                          href={`https://docs.google.com/document/d/${d.google_doc_id}`}
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
