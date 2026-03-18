import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { CommitmentStatus } from '@/integrations/supabase/types'
import { useAuth } from '@/contexts/AuthContext'

export function useCreateFund() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fund: {
      name: string
      fund_code?: string
      target_amount: number
      description?: string
      status?: 'active' | 'fundraising' | 'closed' | 'archived'
    }) => {
      const { data, error } = await supabase
        .from('funds')
        .insert(fund)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funds'] })
    },
  })
}

export function useUpdateFund() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string
      name?: string
      target_amount?: number
      current_amount?: number
      status?: 'active' | 'fundraising' | 'closed' | 'archived'
      description?: string
    }) => {
      const { data, error } = await supabase
        .from('funds')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['fund', variables.id] })
    },
  })
}

export function useUpdateCommitmentStatus() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      fundId,
      note,
    }: {
      id: string
      status: CommitmentStatus
      fundId?: string
      note?: string
    }) => {
      const { data, error } = await supabase
        .from('commitments')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      // 활동 로그 삽입
      const statusLabels: Record<CommitmentStatus, string> = {
        new: '신규',
        reviewing: '검토중',
        confirmed: '확정',
        rejected: '반려',
        on_hold: '보류',
        completed: '완료',
      }

      await supabase.from('activity_logs').insert({
        commitment_id: id,
        fund_id: fundId ?? null,
        action: 'status_change',
        description: `출자의향 상태가 "${statusLabels[status]}"으로 변경되었습니다.${note ? ` 메모: ${note}` : ''}`,
        performed_by: user?.id ?? null,
      })

      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
      queryClient.invalidateQueries({ queryKey: ['commitment', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['activity_logs', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] })
    },
  })
}

export function useRequestDocumentGeneration() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      commitmentId,
      fundId,
      type,
    }: {
      commitmentId: string
      fundId: string
      type: string
    }) => {
      const { data, error } = await supabase.functions.invoke(
        'generate-document',
        {
          body: { commitment_id: commitmentId, fund_id: fundId, type },
        }
      )
      if (error) throw error

      await supabase.from('activity_logs').insert({
        commitment_id: commitmentId,
        fund_id: fundId,
        action: 'document_generation_requested',
        description: `${type} 문서 생성이 요청되었습니다.`,
        performed_by: user?.id ?? null,
      })

      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.commitmentId] })
      queryClient.invalidateQueries({ queryKey: ['activity_logs', variables.commitmentId] })
    },
  })
}

export function useRequestEmailSend() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      commitmentId,
      investorId,
      fundId,
      subject,
    }: {
      commitmentId: string
      investorId: string
      fundId: string
      subject: string
    }) => {
      const { data, error } = await supabase
        .from('email_logs')
        .insert({
          commitment_id: commitmentId,
          investor_id: investorId,
          fund_id: fundId,
          subject,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error

      await supabase.from('activity_logs').insert({
        commitment_id: commitmentId,
        fund_id: fundId,
        action: 'email_send_requested',
        description: `이메일 발송이 요청되었습니다. 제목: ${subject}`,
        performed_by: user?.id ?? null,
      })

      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['email_logs', variables.commitmentId] })
      queryClient.invalidateQueries({ queryKey: ['activity_logs', variables.commitmentId] })
    },
  })
}

export function useProvisionFund() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fundId: string) => {
      // 프로비저닝 상태를 provisioning으로 업데이트
      await supabase
        .from('fund_assets')
        .upsert({ fund_id: fundId, provisioning_status: 'provisioning' })

      const { data, error } = await supabase.functions.invoke(
        'provision-fund',
        {
          body: { fund_id: fundId },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: (_data, fundId) => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
    },
  })
}
