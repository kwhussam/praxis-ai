export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_report_usage: {
        Row: {
          count: number
          created_at: string | null
          id: string
          practice_id: string | null
          updated_at: string | null
          usage_date: string
          user_id: string | null
        }
        Insert: {
          count?: number
          created_at?: string | null
          id?: string
          practice_id?: string | null
          updated_at?: string | null
          usage_date?: string
          user_id?: string | null
        }
        Update: {
          count?: number
          created_at?: string | null
          id?: string
          practice_id?: string | null
          updated_at?: string | null
          usage_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_report_usage_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_manifests: {
        Row: {
          anonymized_at: string | null
          assessment_profile: string
          created_at: string
          encrypted_snapshot: Json
          facts_version: string
          id: string
          manifest: Json
          manifest_sha256: string
          manifest_version: string
          pdf_template_version: string
          practice_id: string
          report_format_version: string
          scoring_version: string
          snapshot_sha256: string
          source_check_id: string
        }
        Insert: {
          anonymized_at?: string | null
          assessment_profile: string
          created_at: string
          encrypted_snapshot: Json
          facts_version: string
          id?: string
          manifest: Json
          manifest_sha256: string
          manifest_version: string
          pdf_template_version: string
          practice_id: string
          report_format_version: string
          scoring_version: string
          snapshot_sha256: string
          source_check_id: string
        }
        Update: {
          anonymized_at?: string | null
          assessment_profile?: string
          created_at?: string
          encrypted_snapshot?: Json
          facts_version?: string
          id?: string
          manifest?: Json
          manifest_sha256?: string
          manifest_version?: string
          pdf_template_version?: string
          practice_id?: string
          report_format_version?: string
          scoring_version?: string
          snapshot_sha256?: string
          source_check_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_manifests_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_manifests_source_check_id_fkey"
            columns: ["source_check_id"]
            isOneToOne: false
            referencedRelation: "security_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          anonymized_at: string | null
          created_at: string | null
          id: string
          legal_hold_reason: string | null
          legal_hold_set_at: string | null
          legal_hold_set_by: string | null
          legal_hold_until: string | null
          metadata: Json
          practice_id: string | null
          request_id: string | null
          result: string
          retention_until: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          anonymized_at?: string | null
          created_at?: string | null
          id?: string
          legal_hold_reason?: string | null
          legal_hold_set_at?: string | null
          legal_hold_set_by?: string | null
          legal_hold_until?: string | null
          metadata?: Json
          practice_id?: string | null
          request_id?: string | null
          result?: string
          retention_until?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          anonymized_at?: string | null
          created_at?: string | null
          id?: string
          legal_hold_reason?: string | null
          legal_hold_set_at?: string | null
          legal_hold_set_by?: string | null
          legal_hold_until?: string | null
          metadata?: Json
          practice_id?: string | null
          request_id?: string | null
          result?: string
          retention_until?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "backoffice_audit_events_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_idempotency_keys: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          key: string
          request_hash: string
          result: Json
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          key: string
          request_hash: string
          result?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          key?: string
          request_hash?: string
          result?: Json
        }
        Relationships: []
      }
      backoffice_rate_limit: {
        Row: {
          actor_user_id: string
          count: number
          created_at: string
          endpoint: string
          id: string
          updated_at: string
          window_start: string
        }
        Insert: {
          actor_user_id: string
          count?: number
          created_at?: string
          endpoint: string
          id?: string
          updated_at?: string
          window_start: string
        }
        Update: {
          actor_user_id?: string
          count?: number
          created_at?: string
          endpoint?: string
          id?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      consent_log: {
        Row: {
          accepted: boolean
          accepted_at: string
          created_at: string | null
          id: string
          ip_hash: string | null
          practice_id: string | null
          type: string
          user_agent_hash: string | null
          user_id: string | null
          version: string
          withdrawn_at: string | null
        }
        Insert: {
          accepted: boolean
          accepted_at: string
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          practice_id?: string | null
          type: string
          user_agent_hash?: string | null
          user_id?: string | null
          version: string
          withdrawn_at?: string | null
        }
        Update: {
          accepted?: boolean
          accepted_at?: string
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          practice_id?: string | null
          type?: string
          user_agent_hash?: string | null
          user_id?: string | null
          version?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_log_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      data_processing_agreements: {
        Row: {
          accepted_at: string | null
          document_url: string | null
          id: string
          metadata: Json
          practice_id: string | null
          status: string
          user_id: string | null
          version: string
        }
        Insert: {
          accepted_at?: string | null
          document_url?: string | null
          id?: string
          metadata?: Json
          practice_id?: string | null
          status?: string
          user_id?: string | null
          version?: string
        }
        Update: {
          accepted_at?: string | null
          document_url?: string | null
          id?: string
          metadata?: Json
          practice_id?: string | null
          status?: string
          user_id?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_processing_agreements_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          completed_at: string | null
          id: string
          metadata: Json
          practice_id: string | null
          report: Json
          requested_at: string | null
          requested_by: string | null
          state: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          metadata?: Json
          practice_id?: string | null
          report?: Json
          requested_at?: string | null
          requested_by?: string | null
          state?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          metadata?: Json
          practice_id?: string | null
          report?: Json
          requested_at?: string | null
          requested_by?: string | null
          state?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          created_at: string | null
          id: string
          payload: Json
          recipient: string
          sent_at: string | null
          status: string
          template: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          payload?: Json
          recipient: string
          sent_at?: string | null
          status?: string
          template: string
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json
          recipient?: string
          sent_at?: string | null
          status?: string
          template?: string
        }
        Relationships: []
      }
      endpoint_rate_limit: {
        Row: {
          count: number
          created_at: string | null
          endpoint: string
          id: string
          practice_id: string | null
          updated_at: string | null
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string | null
          endpoint: string
          id?: string
          practice_id?: string | null
          updated_at?: string | null
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string | null
          endpoint?: string
          id?: string
          practice_id?: string | null
          updated_at?: string | null
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_rate_limit_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      external_check_usage: {
        Row: {
          count: number
          created_at: string | null
          id: string
          practice_id: string | null
          updated_at: string | null
          usage_date: string
          user_id: string | null
        }
        Insert: {
          count?: number
          created_at?: string | null
          id?: string
          practice_id?: string | null
          updated_at?: string | null
          usage_date?: string
          user_id?: string | null
        }
        Update: {
          count?: number
          created_at?: string | null
          id?: string
          practice_id?: string | null
          updated_at?: string | null
          usage_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_check_usage_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_access_points: {
        Row: {
          bssid: string
          channel: string
          created_at: string
          expected_encryption: string
          id: string
          location: string
          metadata: Json
          practice_id: string
          ssid: string
          updated_at: string
          vendor: string
        }
        Insert: {
          bssid: string
          channel?: string
          created_at?: string
          expected_encryption: string
          id?: string
          location?: string
          metadata?: Json
          practice_id: string
          ssid: string
          updated_at?: string
          vendor?: string
        }
        Update: {
          bssid?: string
          channel?: string
          created_at?: string
          expected_encryption?: string
          id?: string
          location?: string
          metadata?: Json
          practice_id?: string
          ssid?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_access_points_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          criticality: string
          detail: string | null
          id: string
          metadata: Json
          name: string
          owner: string | null
          practice_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criticality: string
          detail?: string | null
          id?: string
          metadata?: Json
          name: string
          owner?: string | null
          practice_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criticality?: string
          detail?: string | null
          id?: string
          metadata?: Json
          name?: string
          owner?: string | null
          practice_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_known_devices: {
        Row: {
          created_at: string
          criticality: string
          device_type: string
          hostname: string
          id: string
          last_confirmed_at: string
          location: string
          mac_address: string
          metadata: Json
          owner: string
          practice_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criticality: string
          device_type: string
          hostname?: string
          id?: string
          last_confirmed_at: string
          location?: string
          mac_address: string
          metadata?: Json
          owner?: string
          practice_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criticality?: string
          device_type?: string
          hostname?: string
          id?: string
          last_confirmed_at?: string
          location?: string
          mac_address?: string
          metadata?: Json
          owner?: string
          practice_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_known_devices_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_events: {
        Row: {
          anonymized_at: string | null
          created_at: string | null
          details: Json | null
          id: string
          message: string
          practice_id: string | null
          resolved_at: string | null
          severity: string | null
          title: string
          type: string | null
        }
        Insert: {
          anonymized_at?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          message?: string
          practice_id?: string | null
          resolved_at?: string | null
          severity?: string | null
          title?: string
          type?: string | null
        }
        Update: {
          anonymized_at?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          message?: string
          practice_id?: string | null
          resolved_at?: string | null
          severity?: string | null
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_events_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_snapshots: {
        Row: {
          anonymized_at: string | null
          category_scores: Json
          checked_at: string | null
          checks: Json
          devices: Json
          email_security: Json
          encrypted_checks: Json
          id: string
          payload_sha256: string | null
          practice_id: string | null
          score: number
          source: string
          ssl: Json
        }
        Insert: {
          anonymized_at?: string | null
          category_scores?: Json
          checked_at?: string | null
          checks?: Json
          devices?: Json
          email_security?: Json
          encrypted_checks?: Json
          id?: string
          payload_sha256?: string | null
          practice_id?: string | null
          score: number
          source: string
          ssl?: Json
        }
        Update: {
          anonymized_at?: string | null
          category_scores?: Json
          checked_at?: string | null
          checks?: Json
          devices?: Json
          email_security?: Json
          encrypted_checks?: Json
          id?: string
          payload_sha256?: string | null
          practice_id?: string | null
          score?: number
          source?: string
          ssl?: Json
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_snapshots_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_targets: {
        Row: {
          consent_accepted_at: string | null
          created_at: string
          enabled: boolean
          id: string
          leak_scan_allowed: boolean
          metadata: Json
          practice_id: string
          target_type: string
          updated_at: string
          value: string
          value_normalized: string | null
        }
        Insert: {
          consent_accepted_at?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          leak_scan_allowed?: boolean
          metadata?: Json
          practice_id: string
          target_type: string
          updated_at?: string
          value: string
          value_normalized?: string | null
        }
        Update: {
          consent_accepted_at?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          leak_scan_allowed?: boolean
          metadata?: Json
          practice_id?: string
          target_type?: string
          updated_at?: string
          value?: string
          value_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_targets_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_plan_pricing: {
        Row: {
          active: boolean
          billing: string | null
          created_at: string | null
          id: string
          margin_cents: number
          partner_id: string | null
          plan: string
          price_cents: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          billing?: string | null
          created_at?: string | null
          id?: string
          margin_cents?: number
          partner_id?: string | null
          plan: string
          price_cents: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          billing?: string | null
          created_at?: string | null
          id?: string
          margin_cents?: number
          partner_id?: string | null
          plan?: string
          price_cents?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_plan_pricing_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "white_label_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_practices: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          partner_id: string | null
          practice_id: string | null
          role: Database["public"]["Enums"]["partner_role"]
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          partner_id?: string | null
          practice_id?: string | null
          role: Database["public"]["Enums"]["partner_role"]
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          partner_id?: string | null
          practice_id?: string | null
          role?: Database["public"]["Enums"]["partner_role"]
        }
        Relationships: [
          {
            foreignKeyName: "partner_practices_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_audit_events: {
        Row: {
          actor_user_id: string | null
          anonymized_at: string | null
          created_at: string
          error_code: string | null
          expires_at: string | null
          id: string
          identity_verification: string | null
          legal_hold_reason: string | null
          legal_hold_set_at: string | null
          legal_hold_set_by: string | null
          legal_hold_until: string | null
          practice_id: string | null
          request_id: string | null
          reset_request_id: string
          result: string
          retention_until: string
          target_user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          anonymized_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id?: string
          identity_verification?: string | null
          legal_hold_reason?: string | null
          legal_hold_set_at?: string | null
          legal_hold_set_by?: string | null
          legal_hold_until?: string | null
          practice_id?: string | null
          request_id?: string | null
          reset_request_id: string
          result: string
          retention_until?: string
          target_user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          anonymized_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id?: string
          identity_verification?: string | null
          legal_hold_reason?: string | null
          legal_hold_set_at?: string | null
          legal_hold_set_by?: string | null
          legal_hold_until?: string | null
          practice_id?: string | null
          request_id?: string | null
          reset_request_id?: string
          result?: string
          retention_until?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_audit_events_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_rate_limit: {
        Row: {
          count: number
          dimension: string
          subject_hash: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          dimension: string
          subject_hash: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          dimension?: string
          subject_hash?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      platform_staff: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          mfa_required: boolean
          role: Database["public"]["Enums"]["platform_staff_role"]
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          mfa_required?: boolean
          role: Database["public"]["Enums"]["platform_staff_role"]
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          mfa_required?: boolean
          role?: Database["public"]["Enums"]["platform_staff_role"]
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      practice_access_audit: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_hash: string | null
          metadata: Json
          practice_id: string | null
          resource: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json
          practice_id?: string | null
          resource: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json
          practice_id?: string | null
          resource?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_access_audit_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_activation_requests: {
        Row: {
          city: string
          contact_email: string
          contact_first_name: string
          contact_last_name: string
          contact_phone: string
          country_code: string
          created_at: string
          display_name: string
          domain: string | null
          id: string
          legal_name: string
          postal_code: string
          practice_id: string | null
          practice_kind: string
          requester_user_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          street: string
          updated_at: string
        }
        Insert: {
          city: string
          contact_email: string
          contact_first_name: string
          contact_last_name: string
          contact_phone: string
          country_code: string
          created_at?: string
          display_name: string
          domain?: string | null
          id?: string
          legal_name: string
          postal_code: string
          practice_id?: string | null
          practice_kind: string
          requester_user_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          street: string
          updated_at?: string
        }
        Update: {
          city?: string
          contact_email?: string
          contact_first_name?: string
          contact_last_name?: string
          contact_phone?: string
          country_code?: string
          created_at?: string
          display_name?: string
          domain?: string | null
          id?: string
          legal_name?: string
          postal_code?: string
          practice_id?: string | null
          practice_kind?: string
          requester_user_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          street?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_activation_requests_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          delivery_channel: string
          expires_at: string
          id: string
          intended_role: Database["public"]["Enums"]["practice_member_role"]
          invited_by: string | null
          practice_id: string
          proof_reference: string | null
          status: string
          target_email: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          delivery_channel?: string
          expires_at: string
          id?: string
          intended_role?: Database["public"]["Enums"]["practice_member_role"]
          invited_by?: string | null
          practice_id: string
          proof_reference?: string | null
          status?: string
          target_email: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          delivery_channel?: string
          expires_at?: string
          id?: string
          intended_role?: Database["public"]["Enums"]["practice_member_role"]
          invited_by?: string | null
          practice_id?: string
          proof_reference?: string | null
          status?: string
          target_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_invitations_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_memberships: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          practice_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["practice_member_role"]
          status: string
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          practice_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["practice_member_role"]
          status?: string
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          practice_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["practice_member_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_memberships_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          city: string | null
          contact_email: string | null
          contact_first_name: string | null
          contact_last_name: string | null
          contact_phone: string | null
          country_code: string | null
          created_at: string | null
          created_by_staff_id: string | null
          deleted_at: string | null
          display_name: string | null
          domain: string | null
          email: string | null
          id: string
          legal_name: string | null
          name: string
          onboarding_status: string
          owner_id: string | null
          plan: string | null
          postal_code: string | null
          practice_kind: string | null
          street: string | null
          updated_at: string | null
          white_label_partner_id: string | null
        }
        Insert: {
          city?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_phone?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          deleted_at?: string | null
          display_name?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          onboarding_status?: string
          owner_id?: string | null
          plan?: string | null
          postal_code?: string | null
          practice_kind?: string | null
          street?: string | null
          updated_at?: string | null
          white_label_partner_id?: string | null
        }
        Update: {
          city?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_phone?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          deleted_at?: string | null
          display_name?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          onboarding_status?: string
          owner_id?: string | null
          plan?: string | null
          postal_code?: string | null
          practice_kind?: string | null
          street?: string | null
          updated_at?: string | null
          white_label_partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practices_white_label_partner_id_fkey"
            columns: ["white_label_partner_id"]
            isOneToOne: false
            referencedRelation: "white_label_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          anonymized_at: string | null
          assessment_manifest_id: string | null
          check_id: string | null
          client_sync_id: string | null
          content: Json | null
          created_at: string | null
          encrypted_content: Json
          format_version: string | null
          id: string
          input_hash: string | null
          payload_sha256: string | null
          pdf_url: string | null
          practice_id: string | null
          report_manifest: Json | null
          report_manifest_sha256: string | null
          scoring_version: string | null
        }
        Insert: {
          anonymized_at?: string | null
          assessment_manifest_id?: string | null
          check_id?: string | null
          client_sync_id?: string | null
          content?: Json | null
          created_at?: string | null
          encrypted_content?: Json
          format_version?: string | null
          id?: string
          input_hash?: string | null
          payload_sha256?: string | null
          pdf_url?: string | null
          practice_id?: string | null
          report_manifest?: Json | null
          report_manifest_sha256?: string | null
          scoring_version?: string | null
        }
        Update: {
          anonymized_at?: string | null
          assessment_manifest_id?: string | null
          check_id?: string | null
          client_sync_id?: string | null
          content?: Json | null
          created_at?: string | null
          encrypted_content?: Json
          format_version?: string | null
          id?: string
          input_hash?: string | null
          payload_sha256?: string | null
          pdf_url?: string | null
          practice_id?: string | null
          report_manifest?: Json | null
          report_manifest_sha256?: string | null
          scoring_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_assessment_manifest_practice_fkey"
            columns: ["assessment_manifest_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "assessment_manifests"
            referencedColumns: ["id", "practice_id"]
          },
          {
            foreignKeyName: "reports_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "security_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      router_firewall_rules: {
        Row: {
          action: string
          created_at: string
          destination: string
          direction: string
          enabled: boolean
          id: string
          imported_at: string | null
          last_reviewed_at: string | null
          metadata: Json
          name: string
          owner: string
          ports: string
          practice_id: string
          protocol: string
          purpose: string
          source: string
          source_view: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          destination?: string
          direction: string
          enabled?: boolean
          id?: string
          imported_at?: string | null
          last_reviewed_at?: string | null
          metadata?: Json
          name: string
          owner?: string
          ports?: string
          practice_id: string
          protocol: string
          purpose?: string
          source?: string
          source_view: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          destination?: string
          direction?: string
          enabled?: boolean
          id?: string
          imported_at?: string | null
          last_reviewed_at?: string | null
          metadata?: Json
          name?: string
          owner?: string
          ports?: string
          practice_id?: string
          protocol?: string
          purpose?: string
          source?: string
          source_view?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "router_firewall_rules_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      router_wifi_configurations: {
        Row: {
          created_at: string
          metadata: Json
          open_wifi: boolean
          practice_id: string
          tkip: boolean
          updated_at: string
          wpa2_aes: boolean
          wpa2_wpa3_mixed_mode: boolean
          wpa3: boolean
          wps: boolean
        }
        Insert: {
          created_at?: string
          metadata?: Json
          open_wifi?: boolean
          practice_id: string
          tkip?: boolean
          updated_at?: string
          wpa2_aes?: boolean
          wpa2_wpa3_mixed_mode?: boolean
          wpa3?: boolean
          wps?: boolean
        }
        Update: {
          created_at?: string
          metadata?: Json
          open_wifi?: boolean
          practice_id?: string
          tkip?: boolean
          updated_at?: string
          wpa2_aes?: boolean
          wpa2_wpa3_mixed_mode?: boolean
          wpa3?: boolean
          wps?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "router_wifi_configurations_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: true
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      security_checks: {
        Row: {
          anonymized_at: string | null
          client_sync_id: string | null
          completed_at: string | null
          encrypted_payload: Json
          id: string
          payload_sha256: string | null
          practice_id: string | null
          results: Json | null
          score: number | null
          scoring_version: string | null
          type: string
        }
        Insert: {
          anonymized_at?: string | null
          client_sync_id?: string | null
          completed_at?: string | null
          encrypted_payload?: Json
          id?: string
          payload_sha256?: string | null
          practice_id?: string | null
          results?: Json | null
          score?: number | null
          scoring_version?: string | null
          type: string
        }
        Update: {
          anonymized_at?: string | null
          client_sync_id?: string | null
          completed_at?: string | null
          encrypted_payload?: Json
          id?: string
          payload_sha256?: string | null
          practice_id?: string | null
          results?: Json | null
          score?: number | null
          scoring_version?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_checks_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_practice_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assignment_purpose: string | null
          id: string
          practice_id: string
          revoked_at: string | null
          staff_user_id: string
          status: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignment_purpose?: string | null
          id?: string
          practice_id: string
          revoked_at?: string | null
          staff_user_id: string
          status?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignment_purpose?: string | null
          id?: string
          practice_id?: string
          revoked_at?: string | null
          staff_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_practice_assignments_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_partners: {
        Row: {
          accent_color: string | null
          company_name: string
          created_at: string | null
          features: Json
          id: string
          logo_url: string | null
          owner_id: string | null
          pricing: Json
          primary_color: string | null
          report_branding: Json
          support_email: string | null
          support_phone: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          company_name: string
          created_at?: string | null
          features?: Json
          id?: string
          logo_url?: string | null
          owner_id?: string | null
          pricing?: Json
          primary_color?: string | null
          report_branding?: Json
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          company_name?: string
          created_at?: string | null
          features?: Json
          id?: string
          logo_url?: string | null
          owner_id?: string | null
          pricing?: Json
          primary_color?: string | null
          report_branding?: Json
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wlan_scans: {
        Row: {
          client_sync_id: string | null
          created_at: string | null
          devices_found: number | null
          encrypted_payload: Json
          id: string
          network_info: Json | null
          payload_sha256: string | null
          practice_id: string | null
          risk_level: string | null
          vulnerabilities: Json | null
        }
        Insert: {
          client_sync_id?: string | null
          created_at?: string | null
          devices_found?: number | null
          encrypted_payload?: Json
          id?: string
          network_info?: Json | null
          payload_sha256?: string | null
          practice_id?: string | null
          risk_level?: string | null
          vulnerabilities?: Json | null
        }
        Update: {
          client_sync_id?: string | null
          created_at?: string | null
          devices_found?: number | null
          encrypted_payload?: Json
          id?: string
          network_info?: Json | null
          payload_sha256?: string | null
          practice_id?: string | null
          risk_level?: string | null
          vulnerabilities?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "wlan_scans_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anonymize_backoffice_audit_events: {
        Args: { batch_size?: number; retention_days?: number }
        Returns: number
      }
      anonymize_password_reset_audit_events: {
        Args: { batch_size?: number; retention_days?: number }
        Returns: number
      }
      audit_partner_practice_access: {
        Args: {
          p_action: string
          p_ip_hash?: string
          p_metadata?: Json
          p_practice_id: string
          p_resource: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: undefined
      }
      backfill_practice_memberships: { Args: never; Returns: undefined }
      backoffice_actor_can: {
        Args: { p_actor: string; p_capability: string; p_practice_id?: string }
        Returns: boolean
      }
      backoffice_approve_practice_request: {
        Args: {
          p_activation_request_id: string
          p_actor: string
          p_expires_at: string
          p_idempotency_key: string
          p_proof_reference: string
          p_request_id: string
        }
        Returns: Json
      }
      backoffice_assign_consultant: {
        Args: {
          p_actor: string
          p_consultant_user_id: string
          p_idempotency_key: string
          p_practice_id: string
          p_purpose?: string
          p_request_id: string
        }
        Returns: Json
      }
      backoffice_consume_rate_limit: {
        Args: {
          p_actor: string
          p_endpoint: string
          p_limit: number
          p_window_minutes: number
        }
        Returns: boolean
      }
      backoffice_create_invitation: {
        Args: {
          p_actor: string
          p_delivery_channel: string
          p_expires_at: string
          p_idempotency_key: string
          p_intended_role: Database["public"]["Enums"]["practice_member_role"]
          p_practice_id: string
          p_proof_reference: string
          p_request_id: string
          p_target_email: string
        }
        Returns: Json
      }
      backoffice_create_practice: {
        Args: {
          p_actor: string
          p_city: string
          p_contact_email: string
          p_contact_first_name: string
          p_contact_last_name: string
          p_contact_phone: string
          p_country_code: string
          p_display_name: string
          p_domain?: string
          p_idempotency_key: string
          p_legal_name: string
          p_postal_code: string
          p_practice_kind: string
          p_request_id: string
          p_street: string
        }
        Returns: Json
      }
      backoffice_fail: {
        Args: {
          p_action: string
          p_actor: string
          p_error: string
          p_practice_id: string
          p_request_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      backoffice_grant_membership: {
        Args: {
          p_actor: string
          p_idempotency_key: string
          p_practice_id: string
          p_request_id: string
          p_role: Database["public"]["Enums"]["practice_member_role"]
          p_user_id: string
        }
        Returns: Json
      }
      backoffice_guard_ids: {
        Args: { p_key: string; p_request_id: string }
        Returns: string
      }
      backoffice_hash: { Args: { p_payload: Json }; Returns: string }
      backoffice_list_consultant_assignments: {
        Args: { p_actor: string; p_practice_id: string }
        Returns: {
          assigned_at: string
          assignment_purpose: string
          email: string
          id: string
          revoked_at: string
          staff_user_id: string
          status: string
        }[]
      }
      backoffice_list_consultants: {
        Args: { p_actor: string }
        Returns: {
          email: string
          status: string
          user_id: string
        }[]
      }
      backoffice_reserve: {
        Args: {
          p_action: string
          p_actor: string
          p_hash: string
          p_key: string
        }
        Returns: Json
      }
      backoffice_reserve_commit: {
        Args: {
          p_action: string
          p_actor: string
          p_key: string
          p_result: Json
        }
        Returns: undefined
      }
      backoffice_reserve_release: {
        Args: { p_action: string; p_actor: string; p_key: string }
        Returns: undefined
      }
      backoffice_revoke_consultant_assignment: {
        Args: {
          p_actor: string
          p_assignment_id: string
          p_idempotency_key: string
          p_request_id: string
        }
        Returns: Json
      }
      backoffice_revoke_invitation: {
        Args: {
          p_actor: string
          p_idempotency_key: string
          p_invitation_id: string
          p_request_id: string
        }
        Returns: Json
      }
      backoffice_revoke_membership: {
        Args: {
          p_actor: string
          p_idempotency_key: string
          p_practice_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      backoffice_transfer_ownership: {
        Args: {
          p_actor: string
          p_idempotency_key: string
          p_new_owner: string
          p_practice_id: string
          p_request_id: string
        }
        Returns: Json
      }
      backoffice_update_practice: {
        Args: {
          p_actor: string
          p_idempotency_key: string
          p_new_status?: string
          p_patch?: Json
          p_practice_id: string
          p_request_id: string
        }
        Returns: Json
      }
      backoffice_valid_practice_transition: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      can_access_practice: {
        Args: {
          p_practice_id: string
          p_required_role?: string
          p_user_id: string
        }
        Returns: boolean
      }
      cleanup_email_outbox: {
        Args: { retention_days?: number }
        Returns: number
      }
      complete_privacy_deletion: {
        Args: { p_practice_id: string; p_user_id: string }
        Returns: Json
      }
      consume_ai_report_quota: {
        Args: {
          p_limit: number
          p_practice_id: string
          p_usage_date: string
          p_user_id: string
        }
        Returns: boolean
      }
      consume_external_check_quota: {
        Args: {
          p_limit: number
          p_practice_id: string
          p_usage_date: string
          p_user_id: string
        }
        Returns: boolean
      }
      consume_rate_limit_window: {
        Args: {
          p_endpoint: string
          p_limit: number
          p_practice_id: string
          p_window_minutes: number
        }
        Returns: boolean
      }
      create_or_get_own_practice: {
        Args: { p_domain: string; p_email?: string }
        Returns: {
          domain: string
          email: string
          id: string
          name: string
          plan: string
          white_label_partner_id: string
        }[]
      }
      current_user_can_access_partner_profile: {
        Args: { p_partner_id: string }
        Returns: boolean
      }
      current_user_can_access_practice: {
        Args: { p_practice_id: string; p_required_role?: string }
        Returns: boolean
      }
      current_user_owns_practice: {
        Args: { p_practice_id: string }
        Returns: boolean
      }
      current_user_platform_role: { Args: never; Returns: string }
      partner_role_rank: { Args: { p_role: string }; Returns: number }
      password_reset_consume_rate_limit: {
        Args: {
          p_dimension: string
          p_limit: number
          p_subject_hash: string
          p_window_minutes: number
        }
        Returns: boolean
      }
      password_reset_finalize: {
        Args: {
          p_actor: string
          p_expires_at: string
          p_identity_verification: string
          p_key: string
          p_practice_id: string
          p_request_id: string
          p_reset_request_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      password_reset_release_with_failure: {
        Args: {
          p_actor: string
          p_error_code: string
          p_identity_verification: string
          p_key: string
          p_practice_id: string
          p_request_id: string
          p_reset_request_id: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      persist_assessment_report: {
        Args: {
          p_assessment_profile: string
          p_client_sync_id?: string
          p_created_at: string
          p_encrypted_report: Json
          p_encrypted_snapshot: Json
          p_facts_version: string
          p_manifest: Json
          p_manifest_id: string
          p_manifest_sha256: string
          p_manifest_version: string
          p_pdf_template_version: string
          p_practice_id: string
          p_report_format_version: string
          p_report_id: string
          p_report_sha256: string
          p_report_summary: Json
          p_scoring_version: string
          p_snapshot_sha256: string
          p_source_check_id: string
        }
        Returns: Json
      }
      practice_member_role_rank: { Args: { p_role: string }; Returns: number }
      redeem_practice_invitation: {
        Args: {
          p_idempotency_key: string
          p_invitation_id: string
          p_request_id: string
          p_user: string
        }
        Returns: Json
      }
      report_check_belongs_to_practice: {
        Args: { p_check_id: string; p_practice_id: string }
        Returns: boolean
      }
      report_manifest_belongs_to_practice: {
        Args: { p_manifest_id: string; p_practice_id: string }
        Returns: boolean
      }
      request_practice_activation: {
        Args: {
          p_city: string
          p_contact_first_name: string
          p_contact_last_name: string
          p_contact_phone: string
          p_country_code: string
          p_display_name: string
          p_domain?: string
          p_legal_name: string
          p_postal_code: string
          p_practice_kind: string
          p_street: string
        }
        Returns: Json
      }
      transfer_practice_ownership: {
        Args: { p_actor?: string; p_new_owner: string; p_practice_id: string }
        Returns: undefined
      }
    }
    Enums: {
      partner_role: "owner" | "manager" | "viewer" | "white_label"
      platform_staff_role: "platform_admin" | "security_consultant" | "support"
      practice_member_role:
        | "practice_owner"
        | "practice_manager"
        | "assessor"
        | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      partner_role: ["owner", "manager", "viewer", "white_label"],
      platform_staff_role: ["platform_admin", "security_consultant", "support"],
      practice_member_role: [
        "practice_owner",
        "practice_manager",
        "assessor",
        "viewer",
      ],
    },
  },
} as const

