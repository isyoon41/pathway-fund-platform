import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export function useFunds() {
  return useQuery({
    queryKey: ['funds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funds')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useFund(id: string | undefined) {
  return useQuery({
    queryKey: ['fund', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funds')
        .select('*, fund_assets(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCommitments(fundId?: string) {
  return useQuery({
    queryKey: ['commitments', fundId],
    queryFn: async () => {
      let query = supabase
        .from('commitments')
        .select('*, investors(*), funds(name)')
        .order('created_at', { ascending: false })
      if (fundId) {
        query = query.eq('fund_id', fundId)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useCommitment(id: string | undefined) {
  return useQuery({
    queryKey: ['commitment', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commitments')
        .select('*, investors(*), funds(name, status)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useInvestors() {
  return useQuery({
    queryKey: ['investors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investors')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useSchedules(commitmentId?: string) {
  return useQuery({
    queryKey: ['schedules', commitmentId],
    queryFn: async () => {
      let query = supabase
        .from('schedules')
        .select('*')
        .order('scheduled_at', { ascending: true })
      if (commitmentId) {
        query = query.eq('commitment_id', commitmentId)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useDocuments(commitmentId?: string) {
  return useQuery({
    queryKey: ['documents', commitmentId],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
      if (commitmentId) {
        query = query.eq('commitment_id', commitmentId)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useEmailLogs(commitmentId?: string) {
  return useQuery({
    queryKey: ['email_logs', commitmentId],
    queryFn: async () => {
      let query = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
      if (commitmentId) {
        query = query.eq('commitment_id', commitmentId)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useActivityLogs(commitmentId?: string) {
  return useQuery({
    queryKey: ['activity_logs', commitmentId],
    queryFn: async () => {
      let query = supabase
        .from('activity_logs')
        .select('*, profiles(name)')
        .order('created_at', { ascending: false })
      if (commitmentId) {
        query = query.eq('commitment_id', commitmentId)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

// ── Fund-scoped hooks (펀드 상세 페이지용) ──

export function useFundSchedules(fundId?: string) {
  return useQuery({
    queryKey: ['fund_schedules', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select('*, commitments(id, investors(name))')
        .eq('fund_id', fundId!)
        .order('scheduled_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useFundDocuments(fundId?: string) {
  return useQuery({
    queryKey: ['fund_documents', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, commitments(id, investors(name))')
        .eq('fund_id', fundId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useFundEmailLogs(fundId?: string) {
  return useQuery({
    queryKey: ['fund_email_logs', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*, investors(name)')
        .eq('fund_id', fundId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useFundActivityLogs(fundId?: string) {
  return useQuery({
    queryKey: ['fund_activity_logs', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*, profiles(name)')
        .eq('fund_id', fundId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useFundInvestors(fundId?: string) {
  return useQuery({
    queryKey: ['fund_investors', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      // commitments를 통해 해당 펀드에 연결된 투자자 조회
      const { data, error } = await supabase
        .from('commitments')
        .select('investor_id, requested_amount, confirmed_amount, status, investors(*)')
        .eq('fund_id', fundId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard_stats'],
    queryFn: async () => {
      const [fundsResult, commitmentsResult, documentsResult] = await Promise.all([
        supabase.from('funds').select('status').in('status', ['active', 'fundraising']),
        supabase.from('commitments').select('status'),
        supabase.from('documents').select('status').eq('status', 'generated'),
      ])

      if (fundsResult.error) throw fundsResult.error
      if (commitmentsResult.error) throw commitmentsResult.error
      if (documentsResult.error) throw documentsResult.error

      const activeFunds = fundsResult.data?.length ?? 0
      const allCommitments = commitmentsResult.data ?? []
      const inProgressCommitments = allCommitments.filter(
        (c) => c.status === 'new' || c.status === 'reviewing'
      ).length
      const pendingReview = allCommitments.filter(
        (c) => c.status === 'new'
      ).length
      const unsentDocuments = documentsResult.data?.length ?? 0

      return {
        activeFunds,
        inProgressCommitments,
        pendingReview,
        unsentDocuments,
      }
    },
  })
}
