import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import type { Profile, UserRole } from '@/integrations/supabase/types'

const roleLabels: Record<UserRole, string> = {
  admin: '관리자',
  operator: '운영자',
  viewer: '뷰어',
}

export default function UserSettingsPage() {
  const { profile: currentProfile } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('viewer')

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Profile[]
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      setEditingId(null)
      toast({ title: '역할이 변경되었습니다.' })
    },
    onError: () => {
      toast({
        title: '역할 변경에 실패했습니다.',
        variant: 'destructive',
      })
    },
  })

  if (currentProfile?.role !== 'admin') {
    return (
      <div className="p-8 text-center text-muted-foreground">
        관리자만 접근할 수 있습니다.
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">사용자 설정</h1>
        <p className="text-sm text-gray-500 mt-1">사용자 역할을 관리합니다.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          데이터를 불러오지 못했습니다.
        </div>
      ) : !profiles || profiles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          사용자가 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name ?? '-'}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>
                    {editingId === p.id ? (
                      <Select
                        value={editRole}
                        onValueChange={(v) => setEditRole(v as UserRole)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">관리자</SelectItem>
                          <SelectItem value="operator">운영자</SelectItem>
                          <SelectItem value="viewer">뷰어</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">{roleLabels[p.role]}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(p.created_at)}
                  </TableCell>
                  <TableCell>
                    {p.id === currentProfile.id ? (
                      <span className="text-xs text-muted-foreground">본인</span>
                    ) : editingId === p.id ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            updateRole.mutate({ id: p.id, role: editRole })
                          }
                          disabled={updateRole.isPending}
                        >
                          저장
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(p.id)
                          setEditRole(p.role)
                        }}
                      >
                        역할 변경
                      </Button>
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
