export type UserRole = 'admin' | 'operator' | 'viewer'
export type FundStatus = 'active' | 'fundraising' | 'closed' | 'archived'
export type CommitmentStatus = 'new' | 'reviewing' | 'confirmed' | 'rejected' | 'on_hold' | 'completed'
export type ScheduleStatus = 'pending' | 'done' | 'cancelled'
export type ScheduleType = 'review' | 'meeting' | 'deadline'
export type DocumentStatus = 'draft' | 'generated' | 'sent' | 'failed' | 'archived'
export type EmailStatus = 'pending' | 'sent' | 'failed'
export type ProvisioningStatus = 'pending' | 'provisioning' | 'ready' | 'failed'
export type ContactPreference = 'email' | 'phone' | 'kakao'

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          name: string | null
          role: UserRole
          created_at: string
        }
        Insert: {
          id: string
          email: string
          name?: string | null
          role?: UserRole
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          role?: UserRole
          created_at?: string
        }
        Relationships: []
      }
      funds: {
        Row: {
          id: string
          name: string
          fund_code: string | null
          target_amount: number
          current_amount: number
          status: FundStatus
          description: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          fund_code?: string | null
          target_amount: number
          current_amount?: number
          status?: FundStatus
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          fund_code?: string | null
          target_amount?: number
          current_amount?: number
          status?: FundStatus
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      investors: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          preferred_contact: ContactPreference
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          preferred_contact?: ContactPreference
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          preferred_contact?: ContactPreference
          created_at?: string
        }
        Relationships: []
      }
      commitments: {
        Row: {
          id: string
          fund_id: string
          investor_id: string
          requested_amount: number
          confirmed_amount: number | null
          status: CommitmentStatus
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fund_id: string
          investor_id: string
          requested_amount: number
          confirmed_amount?: number | null
          status?: CommitmentStatus
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          fund_id?: string
          investor_id?: string
          requested_amount?: number
          confirmed_amount?: number | null
          status?: CommitmentStatus
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'commitments_fund_id_fkey'
            columns: ['fund_id']
            isOneToOne: false
            referencedRelation: 'funds'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'commitments_investor_id_fkey'
            columns: ['investor_id']
            isOneToOne: false
            referencedRelation: 'investors'
            referencedColumns: ['id']
          }
        ]
      }
      schedules: {
        Row: {
          id: string
          commitment_id: string | null
          fund_id: string | null
          type: ScheduleType
          title: string
          scheduled_at: string
          status: ScheduleStatus
          calendar_event_id: string | null
          calendar_event_url: string | null
          calendar_id: string | null
          review_due: string | null
        }
        Insert: {
          id?: string
          commitment_id?: string | null
          fund_id?: string | null
          type: ScheduleType
          title: string
          scheduled_at: string
          status?: ScheduleStatus
          calendar_event_id?: string | null
          calendar_event_url?: string | null
          calendar_id?: string | null
          review_due?: string | null
        }
        Update: {
          id?: string
          commitment_id?: string | null
          fund_id?: string | null
          type?: ScheduleType
          title?: string
          scheduled_at?: string
          status?: ScheduleStatus
          calendar_event_id?: string | null
          calendar_event_url?: string | null
          calendar_id?: string | null
          review_due?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          commitment_id: string | null
          fund_id: string | null
          type: string
          title: string
          status: DocumentStatus
          google_doc_id: string | null
          drive_file_id: string | null
          pdf_file_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          commitment_id?: string | null
          fund_id?: string | null
          type: string
          title: string
          status?: DocumentStatus
          google_doc_id?: string | null
          drive_file_id?: string | null
          pdf_file_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          commitment_id?: string | null
          fund_id?: string | null
          type?: string
          title?: string
          status?: DocumentStatus
          google_doc_id?: string | null
          drive_file_id?: string | null
          pdf_file_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          id: string
          commitment_id: string | null
          investor_id: string | null
          fund_id: string | null
          subject: string
          status: EmailStatus
          error_message: string | null
          provider_message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          commitment_id?: string | null
          investor_id?: string | null
          fund_id?: string | null
          subject: string
          status?: EmailStatus
          error_message?: string | null
          provider_message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          commitment_id?: string | null
          investor_id?: string | null
          fund_id?: string | null
          subject?: string
          status?: EmailStatus
          error_message?: string | null
          provider_message_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          id: string
          commitment_id: string | null
          fund_id: string | null
          action: string
          description: string | null
          performed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          commitment_id?: string | null
          fund_id?: string | null
          action: string
          description?: string | null
          performed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          commitment_id?: string | null
          fund_id?: string | null
          action?: string
          description?: string | null
          performed_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      fund_assets: {
        Row: {
          id: string
          fund_id: string
          drive_folder_id: string | null
          drive_folder_url: string | null
          intake_form_id: string | null
          intake_form_url: string | null
          intake_folder_id: string | null
          intake_spreadsheet_id: string | null
          intake_spreadsheet_url: string | null
          confirmation_folder_id: string | null
          provisioning_status: ProvisioningStatus
        }
        Insert: {
          id?: string
          fund_id: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          intake_form_id?: string | null
          intake_form_url?: string | null
          intake_folder_id?: string | null
          intake_spreadsheet_id?: string | null
          intake_spreadsheet_url?: string | null
          confirmation_folder_id?: string | null
          provisioning_status?: ProvisioningStatus
        }
        Update: {
          id?: string
          fund_id?: string
          drive_folder_id?: string | null
          drive_folder_url?: string | null
          intake_form_id?: string | null
          intake_form_url?: string | null
          intake_folder_id?: string | null
          intake_spreadsheet_id?: string | null
          intake_spreadsheet_url?: string | null
          confirmation_folder_id?: string | null
          provisioning_status?: ProvisioningStatus
        }
        Relationships: []
      }
      template_versions: {
        Row: {
          id: string
          fund_id: string | null
          type: string
          version: number
          google_template_doc_id: string | null
          variables: Record<string, unknown> | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          fund_id?: string | null
          type: string
          version?: number
          google_template_doc_id?: string | null
          variables?: Record<string, unknown> | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          fund_id?: string | null
          type?: string
          version?: number
          google_template_doc_id?: string | null
          variables?: Record<string, unknown> | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'template_versions_fund_id_fkey'
            columns: ['fund_id']
            isOneToOne: false
            referencedRelation: 'funds'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: UserRole
      fund_status: FundStatus
      commitment_status: CommitmentStatus
      schedule_status: ScheduleStatus
      document_status: DocumentStatus
      email_status: EmailStatus
      provisioning_status: ProvisioningStatus
      contact_preference: ContactPreference
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Fund = Database['public']['Tables']['funds']['Row']
export type Investor = Database['public']['Tables']['investors']['Row']
export type Commitment = Database['public']['Tables']['commitments']['Row']
export type Schedule = Database['public']['Tables']['schedules']['Row']
export type Document = Database['public']['Tables']['documents']['Row']
export type EmailLog = Database['public']['Tables']['email_logs']['Row']
export type ActivityLog = Database['public']['Tables']['activity_logs']['Row']
export type FundAsset = Database['public']['Tables']['fund_assets']['Row']
export type TemplateVersion = Database['public']['Tables']['template_versions']['Row']
