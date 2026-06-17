export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          building: string | null
          company_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          district: string | null
          full_address: string
          house_no: string | null
          id: string
          is_default: boolean
          latitude: number | null
          longitude: number | null
          moo: string | null
          note: string | null
          postal_code: string | null
          province: string | null
          room_no: string | null
          street: string | null
          sub_district: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          building?: string | null
          company_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          district?: string | null
          full_address: string
          house_no?: string | null
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          moo?: string | null
          note?: string | null
          postal_code?: string | null
          province?: string | null
          room_no?: string | null
          street?: string | null
          sub_district?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          building?: string | null
          company_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          district?: string | null
          full_address?: string
          house_no?: string | null
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          moo?: string | null
          note?: string | null
          postal_code?: string | null
          province?: string | null
          room_no?: string | null
          street?: string | null
          sub_district?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_branch_access: {
        Row: {
          branch_id: string
          can_pos: boolean
          created_at: string
          created_by_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          can_pos?: boolean
          created_at?: string
          created_by_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          can_pos?: boolean
          created_at?: string
          created_by_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_branch_access_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_branch_access_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_branch_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_acceptance_logs: {
        Row: {
          accepted_at: string
          accepted_channel: string
          agreement_title: string
          agreement_type: string
          agreement_version: string
          agreement_version_id: string
          booking_id: string | null
          company_id: string | null
          consent_action: string
          content_hash: string
          correction_of_acceptance_id: string | null
          created_at: string
          customer_confirmation_method: string
          customer_user_id: string | null
          evidence_snapshot: Json
          id: string
          ip_address: unknown
          metadata: Json
          official_document_id: string | null
          order_id: string | null
          rendered_text_hash: string
          request_id: string | null
          session_id: string | null
          source_id: string | null
          source_type: string
          staff_remark: string
          staff_user_id: string | null
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string
          user_agent: string | null
          walk_in_phone: string | null
        }
        Insert: {
          accepted_at?: string
          accepted_channel: string
          agreement_title: string
          agreement_type: string
          agreement_version: string
          agreement_version_id: string
          booking_id?: string | null
          company_id?: string | null
          consent_action: string
          content_hash: string
          correction_of_acceptance_id?: string | null
          created_at?: string
          customer_confirmation_method?: string
          customer_user_id?: string | null
          evidence_snapshot?: Json
          id?: string
          ip_address?: unknown
          metadata?: Json
          official_document_id?: string | null
          order_id?: string | null
          rendered_text_hash: string
          request_id?: string | null
          session_id?: string | null
          source_id?: string | null
          source_type: string
          staff_remark?: string
          staff_user_id?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string
          user_agent?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          accepted_at?: string
          accepted_channel?: string
          agreement_title?: string
          agreement_type?: string
          agreement_version?: string
          agreement_version_id?: string
          booking_id?: string | null
          company_id?: string | null
          consent_action?: string
          content_hash?: string
          correction_of_acceptance_id?: string | null
          created_at?: string
          customer_confirmation_method?: string
          customer_user_id?: string | null
          evidence_snapshot?: Json
          id?: string
          ip_address?: unknown
          metadata?: Json
          official_document_id?: string | null
          order_id?: string | null
          rendered_text_hash?: string
          request_id?: string | null
          session_id?: string | null
          source_id?: string | null
          source_type?: string
          staff_remark?: string
          staff_user_id?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string
          user_agent?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_acceptance_logs_agreement_version_id_fkey"
            columns: ["agreement_version_id"]
            isOneToOne: false
            referencedRelation: "agreement_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_correction_of_acceptance_id_fkey"
            columns: ["correction_of_acceptance_id"]
            isOneToOne: false
            referencedRelation: "agreement_acceptance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_official_document_id_fkey"
            columns: ["official_document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptance_logs_walk_in_phone_fkey"
            columns: ["walk_in_phone"]
            isOneToOne: false
            referencedRelation: "walk_in_customers"
            referencedColumns: ["phone"]
          },
        ]
      }
      agreement_evidence_files: {
        Row: {
          acceptance_id: string
          file_hash: string
          file_type: string
          id: string
          metadata: Json
          storage_bucket: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          acceptance_id: string
          file_hash?: string
          file_type: string
          id?: string
          metadata?: Json
          storage_bucket: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          acceptance_id?: string
          file_hash?: string
          file_type?: string
          id?: string
          metadata?: Json
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_evidence_files_acceptance_id_fkey"
            columns: ["acceptance_id"]
            isOneToOne: false
            referencedRelation: "agreement_acceptance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_evidence_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_versions: {
        Row: {
          agreement_type: string
          content_body: string
          content_format: string
          content_hash: string
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          metadata: Json
          published_at: string | null
          published_by: string | null
          rendered_text_hash: string
          replaces_version_id: string | null
          retired_at: string | null
          retired_by: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          version: string
        }
        Insert: {
          agreement_type: string
          content_body: string
          content_format?: string
          content_hash?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          metadata?: Json
          published_at?: string | null
          published_by?: string | null
          rendered_text_hash?: string
          replaces_version_id?: string | null
          retired_at?: string | null
          retired_by?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version: string
        }
        Update: {
          agreement_type?: string
          content_body?: string
          content_format?: string
          content_hash?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          metadata?: Json
          published_at?: string | null
          published_by?: string | null
          rendered_text_hash?: string
          replaces_version_id?: string | null
          retired_at?: string | null
          retired_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreement_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_versions_replaces_version_id_fkey"
            columns: ["replaces_version_id"]
            isOneToOne: false
            referencedRelation: "agreement_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_versions_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_versions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_branch_inventory: {
        Row: {
          asset_id: string
          available: number
          branch_code: string | null
          branch_id: string
          branch_name: string
          created_at: string
          id: string
          incoming: number
          inventory_id: string
          notes: string | null
          on_hand: number
          reserved: number
          safety_stock: number
          updated_at: string
        }
        Insert: {
          asset_id: string
          available?: number
          branch_code?: string | null
          branch_id: string
          branch_name: string
          created_at?: string
          id?: string
          incoming?: number
          inventory_id: string
          notes?: string | null
          on_hand?: number
          reserved?: number
          safety_stock?: number
          updated_at?: string
        }
        Update: {
          asset_id?: string
          available?: number
          branch_code?: string | null
          branch_id?: string
          branch_name?: string
          created_at?: string
          id?: string
          incoming?: number
          inventory_id?: string
          notes?: string | null
          on_hand?: number
          reserved?: number
          safety_stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_access_branch_inventory_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_access_branch_inventory_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_checklist_template_items: {
        Row: {
          created_at: string
          id: string
          instruction: string | null
          is_required: boolean
          label: string
          photo_required: boolean
          response_type: Database["public"]["Enums"]["rental_checklist_item_response_type"]
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instruction?: string | null
          is_required?: boolean
          label: string
          photo_required?: boolean
          response_type?: Database["public"]["Enums"]["rental_checklist_item_response_type"]
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instruction?: string | null
          is_required?: boolean
          label?: string
          photo_required?: boolean
          response_type?: Database["public"]["Enums"]["rental_checklist_item_response_type"]
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_access_checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "asset_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_checklist_templates: {
        Row: {
          asset_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["rental_checklist_kind"]
          name: string
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["rental_checklist_kind"]
          name: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["rental_checklist_kind"]
          name?: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_access_checklist_templates_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_documents: {
        Row: {
          asset_id: string
          created_at: string
          description: string | null
          document_kind: Database["public"]["Enums"]["asset_document_kind"]
          expires_at: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_url: string
          id: string
          is_downloadable: boolean
          issued_at: string | null
          mime_type: string | null
          service_event_id: string | null
          sort_order: number
          storage_bucket: string | null
          storage_path: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["asset_document_visibility"]
        }
        Insert: {
          asset_id: string
          created_at?: string
          description?: string | null
          document_kind?: Database["public"]["Enums"]["asset_document_kind"]
          expires_at?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url: string
          id?: string
          is_downloadable?: boolean
          issued_at?: string | null
          mime_type?: string | null
          service_event_id?: string | null
          sort_order?: number
          storage_bucket?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["asset_document_visibility"]
        }
        Update: {
          asset_id?: string
          created_at?: string
          description?: string | null
          document_kind?: Database["public"]["Enums"]["asset_document_kind"]
          expires_at?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          is_downloadable?: boolean
          issued_at?: string | null
          mime_type?: string | null
          service_event_id?: string | null
          sort_order?: number
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["asset_document_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "rental_access_documents_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_access_documents_service_event_id_fkey"
            columns: ["service_event_id"]
            isOneToOne: false
            referencedRelation: "asset_service_events"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_filter_options: {
        Row: {
          asset_id: string
          created_at: string
          filter_option_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          filter_option_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          filter_option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_filter_options_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_filter_options_filter_option_id_fkey"
            columns: ["filter_option_id"]
            isOneToOne: false
            referencedRelation: "filter_options"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_matches: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          match_type: string
          note: string | null
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          match_type?: string
          note?: string | null
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          match_type?: string
          note?: string | null
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_access_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_access_matches_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_service_events: {
        Row: {
          asset_id: string
          cost_amount: number
          created_at: string
          currency_code: string
          details: string | null
          event_type: Database["public"]["Enums"]["rental_service_event_type"]
          id: string
          next_due_at: string | null
          notes: string | null
          performed_by_user_id: string | null
          service_date: string
          title: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          asset_id: string
          cost_amount?: number
          created_at?: string
          currency_code?: string
          details?: string | null
          event_type: Database["public"]["Enums"]["rental_service_event_type"]
          id?: string
          next_due_at?: string | null
          notes?: string | null
          performed_by_user_id?: string | null
          service_date: string
          title: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          asset_id?: string
          cost_amount?: number
          created_at?: string
          currency_code?: string
          details?: string | null
          event_type?: Database["public"]["Enums"]["rental_service_event_type"]
          id?: string
          next_due_at?: string | null
          notes?: string | null
          performed_by_user_id?: string | null
          service_date?: string
          title?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_access_service_events_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_access_service_events_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          brand: string | null
          buffer_days: number
          category_keys: string[]
          code: string
          created_at: string
          currency_code: string
          daily_enabled: boolean
          daily_rate: number
          deposit_amount: number
          description_cn: string | null
          description_en: string
          description_jp: string | null
          description_th: string
          detail_blocks: Json
          filter_keys: string[]
          id: string
          image_urls: string[]
          is_hidden: boolean
          last_rented_at: string | null
          last_serviced_at: string | null
          main_category_key: string
          max_rental_days: number
          min_rental_days: number
          monthly_enabled: boolean
          monthly_rate: number
          name_cn: string | null
          name_en: string
          name_jp: string | null
          name_th: string
          next_service_due_at: string | null
          pricing_model: Database["public"]["Enums"]["rental_pricing_model"]
          rental_count: number
          search_keywords: string[]
          search_vector: unknown
          service_cycle_unit:
            | Database["public"]["Enums"]["rental_service_cycle_unit"]
            | null
          service_cycle_value: number
          slug: string
          sort_order: number
          spec_summary: Json
          status: Database["public"]["Enums"]["asset_status"]
          storage_branch_id: string | null
          storage_inventory_id: string | null
          storage_location_code: string | null
          storage_location_note: string | null
          tag_keys: string[]
          thumbnail_url: string | null
          updated_at: string
          view_count: number
          weekly_enabled: boolean
          weekly_rate: number
        }
        Insert: {
          brand?: string | null
          buffer_days?: number
          category_keys?: string[]
          code: string
          created_at?: string
          currency_code?: string
          daily_enabled?: boolean
          daily_rate?: number
          deposit_amount?: number
          description_cn?: string | null
          description_en: string
          description_jp?: string | null
          description_th: string
          detail_blocks?: Json
          filter_keys?: string[]
          id?: string
          image_urls?: string[]
          is_hidden?: boolean
          last_rented_at?: string | null
          last_serviced_at?: string | null
          main_category_key?: string
          max_rental_days?: number
          min_rental_days?: number
          monthly_enabled?: boolean
          monthly_rate?: number
          name_cn?: string | null
          name_en: string
          name_jp?: string | null
          name_th: string
          next_service_due_at?: string | null
          pricing_model?: Database["public"]["Enums"]["rental_pricing_model"]
          rental_count?: number
          search_keywords?: string[]
          search_vector?: unknown
          service_cycle_unit?:
            | Database["public"]["Enums"]["rental_service_cycle_unit"]
            | null
          service_cycle_value?: number
          slug: string
          sort_order?: number
          spec_summary?: Json
          status?: Database["public"]["Enums"]["asset_status"]
          storage_branch_id?: string | null
          storage_inventory_id?: string | null
          storage_location_code?: string | null
          storage_location_note?: string | null
          tag_keys?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          view_count?: number
          weekly_enabled?: boolean
          weekly_rate?: number
        }
        Update: {
          brand?: string | null
          buffer_days?: number
          category_keys?: string[]
          code?: string
          created_at?: string
          currency_code?: string
          daily_enabled?: boolean
          daily_rate?: number
          deposit_amount?: number
          description_cn?: string | null
          description_en?: string
          description_jp?: string | null
          description_th?: string
          detail_blocks?: Json
          filter_keys?: string[]
          id?: string
          image_urls?: string[]
          is_hidden?: boolean
          last_rented_at?: string | null
          last_serviced_at?: string | null
          main_category_key?: string
          max_rental_days?: number
          min_rental_days?: number
          monthly_enabled?: boolean
          monthly_rate?: number
          name_cn?: string | null
          name_en?: string
          name_jp?: string | null
          name_th?: string
          next_service_due_at?: string | null
          pricing_model?: Database["public"]["Enums"]["rental_pricing_model"]
          rental_count?: number
          search_keywords?: string[]
          search_vector?: unknown
          service_cycle_unit?:
            | Database["public"]["Enums"]["rental_service_cycle_unit"]
            | null
          service_cycle_value?: number
          slug?: string
          sort_order?: number
          spec_summary?: Json
          status?: Database["public"]["Enums"]["asset_status"]
          storage_branch_id?: string | null
          storage_inventory_id?: string | null
          storage_location_code?: string | null
          storage_location_note?: string | null
          tag_keys?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          view_count?: number
          weekly_enabled?: boolean
          weekly_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_main_category_key_fkey"
            columns: ["main_category_key"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "rental_accesses_storage_branch_id_fkey"
            columns: ["storage_branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_accesses_storage_inventory_id_fkey"
            columns: ["storage_inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_document_settings: {
        Row: {
          address_en: string
          address_th: string
          branch_id: string
          branch_tax_code: string
          company_name_en: string
          company_name_th: string
          created_at: string
          email: string
          footer_note: string
          logo_path: string | null
          phone: string
          print_config: Json
          stamp_path: string | null
          tax_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_en?: string
          address_th?: string
          branch_id: string
          branch_tax_code?: string
          company_name_en?: string
          company_name_th?: string
          created_at?: string
          email?: string
          footer_note?: string
          logo_path?: string | null
          phone?: string
          print_config?: Json
          stamp_path?: string | null
          tax_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_en?: string
          address_th?: string
          branch_id?: string
          branch_tax_code?: string
          company_name_en?: string
          company_name_th?: string
          created_at?: string
          email?: string
          footer_note?: string
          logo_path?: string | null
          phone?: string
          print_config?: Json
          stamp_path?: string | null
          tax_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_document_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_document_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_at: string
          cart_id: string
          discount_percent: number
          id: string
          name: string
          original_unit_price: number
          product_id: string
          quantity: number
          sku_id: string
          thumbnail: string | null
          unit_price: number
        }
        Insert: {
          added_at?: string
          cart_id: string
          discount_percent?: number
          id?: string
          name: string
          original_unit_price: number
          product_id: string
          quantity?: number
          sku_id: string
          thumbnail?: string | null
          unit_price: number
        }
        Update: {
          added_at?: string
          cart_id?: string
          discount_percent?: number
          id?: string
          name?: string
          original_unit_price?: number
          product_id?: string
          quantity?: number
          sku_id?: string
          thumbnail?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_terms: {
        Row: {
          created_at: string
          display_value: string
          id: number
          is_active: boolean
          kind: string
          normalized_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_value: string
          id?: number
          is_active?: boolean
          kind: string
          normalized_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_value?: string
          id?: number
          is_active?: boolean
          kind?: string
          normalized_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_name: string | null
          file_size: number
          id: string
          kind: Database["public"]["Enums"]["chat_attachment_kind"]
          message_id: string
          mime_type: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_name?: string | null
          file_size: number
          id?: string
          kind: Database["public"]["Enums"]["chat_attachment_kind"]
          message_id: string
          mime_type: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_name?: string | null
          file_size?: number
          id?: string
          kind?: Database["public"]["Enums"]["chat_attachment_kind"]
          message_id?: string
          mime_type?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          archived_at: string | null
          closed_at: string | null
          created_at: string
          customer_id: string | null
          id: string
          last_message_id: string | null
          status: Database["public"]["Enums"]["chat_conversation_status"]
          subject_id: string | null
          subject_type: Database["public"]["Enums"]["chat_subject_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_message_id?: string | null
          status?: Database["public"]["Enums"]["chat_conversation_status"]
          subject_id?: string | null
          subject_type?: Database["public"]["Enums"]["chat_subject_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          last_message_id?: string | null
          status?: Database["public"]["Enums"]["chat_conversation_status"]
          subject_id?: string | null
          subject_type?: Database["public"]["Enums"]["chat_subject_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          message_type: Database["public"]["Enums"]["chat_message_type"]
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["chat_message_type"]
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["chat_message_type"]
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          left_at: string | null
          participant_role: Database["public"]["Enums"]["chat_participant_role"]
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          participant_role?: Database["public"]["Enums"]["chat_participant_role"]
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          participant_role?: Database["public"]["Enums"]["chat_participant_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          billing_address: Json | null
          billing_cycle: string
          created_at: string
          credit_limit: number
          credit_term_days: number
          credit_used: number
          id: string
          kyc_documents: Json | null
          kyc_rejection_reason: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          name: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          billing_cycle?: string
          created_at?: string
          credit_limit?: number
          credit_term_days?: number
          credit_used?: number
          id?: string
          kyc_documents?: Json | null
          kyc_rejection_reason?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          name: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          billing_cycle?: string
          created_at?: string
          credit_limit?: number
          credit_term_days?: number
          credit_used?: number
          id?: string
          kyc_documents?: Json | null
          kyc_rejection_reason?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          name?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_page_assets: {
        Row: {
          asset_id: string
          content_page_id: string
          created_at: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          content_page_id: string
          created_at?: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          content_page_id?: string
          created_at?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_page_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_page_assets_content_page_id_fkey"
            columns: ["content_page_id"]
            isOneToOne: false
            referencedRelation: "content_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      content_page_products: {
        Row: {
          content_page_id: string
          created_at: string
          product_id: string
          sort_order: number
        }
        Insert: {
          content_page_id: string
          created_at?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          content_page_id?: string
          created_at?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_page_products_content_page_id_fkey"
            columns: ["content_page_id"]
            isOneToOne: false
            referencedRelation: "content_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_page_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pages: {
        Row: {
          blocks: Json
          content_type: string
          cover_image_url: string | null
          created_at: string
          excerpt_cn: string | null
          excerpt_en: string
          excerpt_jp: string | null
          excerpt_th: string
          id: string
          is_active: boolean
          main_category_key: string | null
          provider_id: string | null
          published_at: string | null
          service_areas: string[]
          slug: string
          sort_order: number
          title_cn: string | null
          title_en: string
          title_jp: string | null
          title_th: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          content_type: string
          cover_image_url?: string | null
          created_at?: string
          excerpt_cn?: string | null
          excerpt_en: string
          excerpt_jp?: string | null
          excerpt_th: string
          id?: string
          is_active?: boolean
          main_category_key?: string | null
          provider_id?: string | null
          published_at?: string | null
          service_areas?: string[]
          slug: string
          sort_order?: number
          title_cn?: string | null
          title_en: string
          title_jp?: string | null
          title_th: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          content_type?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt_cn?: string | null
          excerpt_en?: string
          excerpt_jp?: string | null
          excerpt_th?: string
          id?: string
          is_active?: boolean
          main_category_key?: string | null
          provider_id?: string | null
          published_at?: string | null
          service_areas?: string[]
          slug?: string
          sort_order?: number
          title_cn?: string | null
          title_en?: string
          title_jp?: string | null
          title_th?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pages_main_category_key_fkey"
            columns: ["main_category_key"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "content_pages_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      customer_tax_profiles: {
        Row: {
          billing_address: string
          branch_code: string
          branch_type: string
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_kind: string
          customer_user_id: string | null
          email: string
          id: string
          is_default: boolean
          legal_name: string
          phone: string
          rejection_reason: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          tax_id: string
          tax_id_normalized: string
          updated_at: string
          updated_by: string | null
          walk_in_phone: string | null
        }
        Insert: {
          billing_address: string
          branch_code?: string
          branch_type?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_kind?: string
          customer_user_id?: string | null
          email?: string
          id?: string
          is_default?: boolean
          legal_name: string
          phone?: string
          rejection_reason?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          tax_id: string
          tax_id_normalized: string
          updated_at?: string
          updated_by?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          billing_address?: string
          branch_code?: string
          branch_type?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_kind?: string
          customer_user_id?: string | null
          email?: string
          id?: string
          is_default?: boolean
          legal_name?: string
          phone?: string
          rejection_reason?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          tax_id?: string
          tax_id_normalized?: string
          updated_at?: string
          updated_by?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_tax_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tax_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tax_profiles_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tax_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tax_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tax_profiles_walk_in_phone_fkey"
            columns: ["walk_in_phone"]
            isOneToOne: false
            referencedRelation: "walk_in_customers"
            referencedColumns: ["phone"]
          },
        ]
      }
      document_events: {
        Row: {
          created_at: string
          document_id: string
          event_type: string
          id: string
          metadata: Json
          reason: string | null
          staff_user_id: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          event_type: string
          id?: string
          metadata?: Json
          reason?: string | null
          staff_user_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          event_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
          staff_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_events_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          branch_id: string | null
          created_at: string
          document_type: string
          id: string
          last_number: number
          period: string
          prefix: string
          sequence_key: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          document_type: string
          id?: string
          last_number?: number
          period: string
          prefix: string
          sequence_key?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          document_type?: string
          id?: string
          last_number?: number
          period?: string
          prefix?: string
          sequence_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_groups: {
        Row: {
          created_at: string
          filter_type: string
          id: string
          is_active: boolean
          key: string
          label_en: string
          label_th: string
          main_category_key: string
          match_logic: string
          sort_order: number
          spec_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          filter_type: string
          id?: string
          is_active?: boolean
          key: string
          label_en: string
          label_th: string
          main_category_key: string
          match_logic?: string
          sort_order?: number
          spec_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          filter_type?: string
          id?: string
          is_active?: boolean
          key?: string
          label_en?: string
          label_th?: string
          main_category_key?: string
          match_logic?: string
          sort_order?: number
          spec_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_groups_main_category_key_fkey"
            columns: ["main_category_key"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      filter_options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_active: boolean
          key: string
          label_en: string
          label_th: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_active?: boolean
          key: string
          label_en: string
          label_th: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_active?: boolean
          key?: string
          label_en?: string
          label_th?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "filter_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_recognition_events: {
        Row: {
          booking_id: string
          created_at: string
          currency_code: string
          id: string
          metadata: Json
          recognition_type: string
          recognized_amount: number
          recognized_at: string
          related_document_id: string | null
          revenue_category: string
          source_id: string
          source_type: string
          status: string
          tax_treatment: string
          vat_amount: number
          vat_rate: number
          wht_amount: number
          wht_rate: number
          wht_treatment: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          currency_code?: string
          id?: string
          metadata?: Json
          recognition_type: string
          recognized_amount: number
          recognized_at?: string
          related_document_id?: string | null
          revenue_category?: string
          source_id: string
          source_type?: string
          status?: string
          tax_treatment?: string
          vat_amount?: number
          vat_rate?: number
          wht_amount?: number
          wht_rate?: number
          wht_treatment?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          metadata?: Json
          recognition_type?: string
          recognized_amount?: number
          recognized_at?: string
          related_document_id?: string | null
          revenue_category?: string
          source_id?: string
          source_type?: string
          status?: string
          tax_treatment?: string
          vat_amount?: number
          vat_rate?: number
          wht_amount?: number
          wht_rate?: number
          wht_treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_recognition_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recognition_events_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recognition_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_deposit_disposition_events"
            referencedColumns: ["id"]
          },
        ]
      }
      home_banners: {
        Row: {
          created_at: string
          cta_label_cn: string | null
          cta_label_en: string
          cta_label_jp: string | null
          cta_label_th: string
          id: string
          image_url: string
          is_active: boolean
          link_target: string
          link_url: string
          mobile_image_url: string | null
          sort_order: number
          subtitle_cn: string | null
          subtitle_en: string
          subtitle_jp: string | null
          subtitle_th: string
          title_cn: string | null
          title_en: string
          title_jp: string | null
          title_th: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label_cn?: string | null
          cta_label_en: string
          cta_label_jp?: string | null
          cta_label_th: string
          id?: string
          image_url: string
          is_active?: boolean
          link_target?: string
          link_url: string
          mobile_image_url?: string | null
          sort_order?: number
          subtitle_cn?: string | null
          subtitle_en: string
          subtitle_jp?: string | null
          subtitle_th: string
          title_cn?: string | null
          title_en: string
          title_jp?: string | null
          title_th: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label_cn?: string | null
          cta_label_en?: string
          cta_label_jp?: string | null
          cta_label_th?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_target?: string
          link_url?: string
          mobile_image_url?: string | null
          sort_order?: number
          subtitle_cn?: string | null
          subtitle_en?: string
          subtitle_jp?: string | null
          subtitle_th?: string
          title_cn?: string | null
          title_en?: string
          title_jp?: string | null
          title_th?: string
          updated_at?: string
        }
        Relationships: []
      }
      home_category_groups: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          label_cn: string | null
          label_en: string
          label_jp: string | null
          label_th: string
          main_category_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label_cn?: string | null
          label_en: string
          label_jp?: string | null
          label_th: string
          main_category_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label_cn?: string | null
          label_en?: string
          label_jp?: string | null
          label_th?: string
          main_category_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_category_groups_main_category_key_fkey"
            columns: ["main_category_key"]
            isOneToOne: true
            referencedRelation: "main_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      home_category_options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_active: boolean
          label_cn: string | null
          label_en: string
          label_jp: string | null
          label_th: string
          option_key: string
          search_query_cn: string | null
          search_query_en: string | null
          search_query_jp: string | null
          search_query_th: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_active?: boolean
          label_cn?: string | null
          label_en: string
          label_jp?: string | null
          label_th: string
          option_key: string
          search_query_cn?: string | null
          search_query_en?: string | null
          search_query_jp?: string | null
          search_query_th?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_active?: boolean
          label_cn?: string | null
          label_en?: string
          label_jp?: string | null
          label_th?: string
          option_key?: string
          search_query_cn?: string | null
          search_query_en?: string | null
          search_query_jp?: string | null
          search_query_th?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_category_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "home_category_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      home_featured_assets: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_featured_rental_accesses_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      home_featured_products: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_featured_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      home_link_cards: {
        Row: {
          content_page_id: string | null
          created_at: string
          description_cn: string | null
          description_en: string | null
          description_jp: string | null
          description_th: string | null
          id: string
          image_url: string | null
          is_active: boolean
          link_target: string
          link_url: string | null
          section_key: string
          sort_order: number
          title_cn: string | null
          title_en: string | null
          title_jp: string | null
          title_th: string | null
          updated_at: string
        }
        Insert: {
          content_page_id?: string | null
          created_at?: string
          description_cn?: string | null
          description_en?: string | null
          description_jp?: string | null
          description_th?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_target?: string
          link_url?: string | null
          section_key: string
          sort_order?: number
          title_cn?: string | null
          title_en?: string | null
          title_jp?: string | null
          title_th?: string | null
          updated_at?: string
        }
        Update: {
          content_page_id?: string | null
          created_at?: string
          description_cn?: string | null
          description_en?: string | null
          description_jp?: string | null
          description_th?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_target?: string
          link_url?: string | null
          section_key?: string
          sort_order?: number
          title_cn?: string | null
          title_en?: string | null
          title_jp?: string | null
          title_th?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_link_cards_content_page_id_fkey"
            columns: ["content_page_id"]
            isOneToOne: false
            referencedRelation: "content_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      home_partner_logos: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          link_target: string
          link_url: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          link_target?: string
          link_url: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_target?: string
          link_url?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventories: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_default: boolean
          is_default_rental: boolean
          name: string
          notes: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_default_rental?: boolean
          name: string
          notes?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_default_rental?: boolean
          name?: string
          notes?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_change_log: {
        Row: {
          action: string
          branch_id: string
          changed_by: string
          created_at: string
          id: string
          inventory_id: string
          new_values: Json | null
          note: string | null
          old_values: Json | null
          sku_id: string
        }
        Insert: {
          action: string
          branch_id: string
          changed_by: string
          created_at?: string
          id?: string
          inventory_id: string
          new_values?: Json | null
          note?: string | null
          old_values?: Json | null
          sku_id: string
        }
        Update: {
          action?: string
          branch_id?: string
          changed_by?: string
          created_at?: string
          id?: string
          inventory_id?: string
          new_values?: Json | null
          note?: string | null
          old_values?: Json | null
          sku_id?: string
        }
        Relationships: []
      }
      kyc_document_access_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          document_id: string | null
          document_type: Database["public"]["Enums"]["kyc_document_type"] | null
          id: string
          ip_address: unknown
          kyc_profile_id: string | null
          reason: string | null
          result: string
          storage_bucket: string | null
          storage_path: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          document_id?: string | null
          document_type?:
            | Database["public"]["Enums"]["kyc_document_type"]
            | null
          id?: string
          ip_address?: unknown
          kyc_profile_id?: string | null
          reason?: string | null
          result: string
          storage_bucket?: string | null
          storage_path?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          document_id?: string | null
          document_type?:
            | Database["public"]["Enums"]["kyc_document_type"]
            | null
          id?: string
          ip_address?: unknown
          kyc_profile_id?: string | null
          reason?: string | null
          result?: string
          storage_bucket?: string | null
          storage_path?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      kyc_documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["kyc_document_type"]
          expires_at: string | null
          file_size_bytes: number | null
          id: string
          issued_at: string | null
          kyc_profile_id: string
          mime_type: string | null
          storage_path: string
          uploaded_at: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          document_type: Database["public"]["Enums"]["kyc_document_type"]
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          issued_at?: string | null
          kyc_profile_id: string
          mime_type?: string | null
          storage_path: string
          uploaded_at?: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["kyc_document_type"]
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          issued_at?: string | null
          kyc_profile_id?: string
          mime_type?: string | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_kyc_profile_id_fkey"
            columns: ["kyc_profile_id"]
            isOneToOne: false
            referencedRelation: "kyc_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_documents_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_pickup_overrides: {
        Row: {
          booking_id: string
          branch_id: string | null
          created_at: string
          id: string
          kyc_profile_id: string | null
          overridden_by_user_id: string
          override_reason: string
        }
        Insert: {
          booking_id: string
          branch_id?: string | null
          created_at?: string
          id?: string
          kyc_profile_id?: string | null
          overridden_by_user_id: string
          override_reason: string
        }
        Update: {
          booking_id?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          kyc_profile_id?: string | null
          overridden_by_user_id?: string
          override_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_pickup_overrides_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_pickup_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_pickup_overrides_kyc_profile_id_fkey"
            columns: ["kyc_profile_id"]
            isOneToOne: false
            referencedRelation: "kyc_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_pickup_overrides_overridden_by_user_id_fkey"
            columns: ["overridden_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["kyc_customer_type"]
          id: string
          identity_hash: string
          identity_last4: string
          identity_type: Database["public"]["Enums"]["kyc_identity_type"]
          rejected_at: string | null
          rejection_note: string | null
          rejection_reason_code: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          revoked_note: string | null
          revoked_reason_code: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          user_id: string | null
          valid_until: string | null
          verification_method: string | null
          verified_at: string | null
          verified_branch_id: string | null
          verified_by_user_id: string | null
          walk_in_phone: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          customer_type: Database["public"]["Enums"]["kyc_customer_type"]
          id?: string
          identity_hash: string
          identity_last4: string
          identity_type: Database["public"]["Enums"]["kyc_identity_type"]
          rejected_at?: string | null
          rejection_note?: string | null
          rejection_reason_code?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_note?: string | null
          revoked_reason_code?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id?: string | null
          valid_until?: string | null
          verification_method?: string | null
          verified_at?: string | null
          verified_branch_id?: string | null
          verified_by_user_id?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["kyc_customer_type"]
          id?: string
          identity_hash?: string
          identity_last4?: string
          identity_type?: Database["public"]["Enums"]["kyc_identity_type"]
          rejected_at?: string | null
          rejection_note?: string | null
          rejection_reason_code?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          revoked_note?: string | null
          revoked_reason_code?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id?: string | null
          valid_until?: string | null
          verification_method?: string | null
          verified_at?: string | null
          verified_branch_id?: string | null
          verified_by_user_id?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_profiles_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_profiles_verified_branch_id_fkey"
            columns: ["verified_branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_profiles_verified_by_user_id_fkey"
            columns: ["verified_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_verification_decisions: {
        Row: {
          created_at: string
          customer_type: Database["public"]["Enums"]["kyc_customer_type"]
          decided_at: string
          decided_by_name: string | null
          decided_by_role: string
          decided_by_user_id: string
          id: string
          identity_type: Database["public"]["Enums"]["kyc_identity_type"]
          ip_address: unknown
          kyc_profile_id: string
          method: string
          outcome: string
          reason_code: string | null
          reviewed_document_ids: string[]
          user_agent: string | null
          valid_until: string | null
          vat_status: Database["public"]["Enums"]["kyc_vat_status"] | null
          visual_review_confirmed: boolean
        }
        Insert: {
          created_at?: string
          customer_type: Database["public"]["Enums"]["kyc_customer_type"]
          decided_at?: string
          decided_by_name?: string | null
          decided_by_role: string
          decided_by_user_id: string
          id?: string
          identity_type: Database["public"]["Enums"]["kyc_identity_type"]
          ip_address?: unknown
          kyc_profile_id: string
          method?: string
          outcome: string
          reason_code?: string | null
          reviewed_document_ids?: string[]
          user_agent?: string | null
          valid_until?: string | null
          vat_status?: Database["public"]["Enums"]["kyc_vat_status"] | null
          visual_review_confirmed?: boolean
        }
        Update: {
          created_at?: string
          customer_type?: Database["public"]["Enums"]["kyc_customer_type"]
          decided_at?: string
          decided_by_name?: string | null
          decided_by_role?: string
          decided_by_user_id?: string
          id?: string
          identity_type?: Database["public"]["Enums"]["kyc_identity_type"]
          ip_address?: unknown
          kyc_profile_id?: string
          method?: string
          outcome?: string
          reason_code?: string | null
          reviewed_document_ids?: string[]
          user_agent?: string | null
          valid_until?: string | null
          vat_status?: Database["public"]["Enums"]["kyc_vat_status"] | null
          visual_review_confirmed?: boolean
        }
        Relationships: []
      }
      main_categories: {
        Row: {
          created_at: string
          description_en: string | null
          description_th: string | null
          entity_types: string[]
          icon: string | null
          is_active: boolean
          key: string
          label_en: string
          label_th: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_th?: string | null
          entity_types?: string[]
          icon?: string | null
          is_active?: boolean
          key: string
          label_en: string
          label_th: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_th?: string | null
          entity_types?: string[]
          icon?: string | null
          is_active?: boolean
          key?: string
          label_en?: string
          label_th?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      manual_payment_request_items: {
        Row: {
          amount_due: number
          created_at: string
          description: string | null
          id: string
          label: string
          metadata: Json
          payment_request_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          amount_due: number
          created_at?: string
          description?: string | null
          id?: string
          label: string
          metadata?: Json
          payment_request_id: string
          target_id: string
          target_type: string
        }
        Update: {
          amount_due?: number
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          metadata?: Json
          payment_request_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_payment_request_items_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "manual_payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payment_request_slips: {
        Row: {
          file_size_bytes: number
          id: string
          mime_type: string
          original_filename: string | null
          payment_request_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sha256_hash: string | null
          status: string
          storage_bucket: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          file_size_bytes: number
          id?: string
          mime_type: string
          original_filename?: string | null
          payment_request_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sha256_hash?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          file_size_bytes?: number
          id?: string
          mime_type?: string
          original_filename?: string | null
          payment_request_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sha256_hash?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_payment_request_slips_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "manual_payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payment_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          currency: string
          customer_id: string
          customer_note: string | null
          id: string
          payment_method: string
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_type: string
          status: string
          submitted_at: string | null
          total_amount_due: number
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          customer_note?: string | null
          id?: string
          payment_method?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type: string
          status?: string
          submitted_at?: string | null
          total_amount_due: number
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          customer_note?: string | null
          id?: string
          payment_method?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type?: string
          status?: string
          submitted_at?: string | null
          total_amount_due?: number
          updated_at?: string
        }
        Relationships: []
      }
      mixed_checkout_sessions: {
        Row: {
          allocation_plan_snapshot: Json
          amount_total: number
          booking_deposit_total_amount: number
          cart_id: string | null
          checkout_kind: string
          created_at: string
          currency_code: string
          expires_at: string
          id: string
          idempotency_key: string
          sale_order_id: string | null
          sale_subtotal_amount: number
          shipping_amount: number
          status: string
          updated_at: string
          user_id: string
          validation_snapshot: Json
        }
        Insert: {
          allocation_plan_snapshot?: Json
          amount_total: number
          booking_deposit_total_amount?: number
          cart_id?: string | null
          checkout_kind: string
          created_at?: string
          currency_code?: string
          expires_at: string
          id?: string
          idempotency_key: string
          sale_order_id?: string | null
          sale_subtotal_amount?: number
          shipping_amount?: number
          status?: string
          updated_at?: string
          user_id: string
          validation_snapshot?: Json
        }
        Update: {
          allocation_plan_snapshot?: Json
          amount_total?: number
          booking_deposit_total_amount?: number
          cart_id?: string | null
          checkout_kind?: string
          created_at?: string
          currency_code?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          sale_order_id?: string | null
          sale_subtotal_amount?: number
          shipping_amount?: number
          status?: string
          updated_at?: string
          user_id?: string
          validation_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mixed_checkout_sessions_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_checkout_sessions_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_checkout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mixed_payment_allocations: {
        Row: {
          allocation_type: string
          amount: number
          created_at: string
          currency_code: string
          failure_code: string | null
          failure_message: string | null
          finalized_at: string | null
          id: string
          metadata: Json
          mixed_checkout_session_id: string
          mixed_payment_attempt_id: string | null
          order_id: string | null
          order_line_id: string | null
          paid_at: string | null
          rental_booking_id: string | null
          status: string
          target_id: string | null
          target_type: string
          tax_category: string
          updated_at: string
          user_id: string
          wht_amount: number
          wht_rate: number
        }
        Insert: {
          allocation_type: string
          amount: number
          created_at?: string
          currency_code?: string
          failure_code?: string | null
          failure_message?: string | null
          finalized_at?: string | null
          id?: string
          metadata?: Json
          mixed_checkout_session_id: string
          mixed_payment_attempt_id?: string | null
          order_id?: string | null
          order_line_id?: string | null
          paid_at?: string | null
          rental_booking_id?: string | null
          status?: string
          target_id?: string | null
          target_type: string
          tax_category: string
          updated_at?: string
          user_id: string
          wht_amount?: number
          wht_rate?: number
        }
        Update: {
          allocation_type?: string
          amount?: number
          created_at?: string
          currency_code?: string
          failure_code?: string | null
          failure_message?: string | null
          finalized_at?: string | null
          id?: string
          metadata?: Json
          mixed_checkout_session_id?: string
          mixed_payment_attempt_id?: string | null
          order_id?: string | null
          order_line_id?: string | null
          paid_at?: string | null
          rental_booking_id?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          tax_category?: string
          updated_at?: string
          user_id?: string
          wht_amount?: number
          wht_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "mixed_payment_allocations_mixed_checkout_session_id_fkey"
            columns: ["mixed_checkout_session_id"]
            isOneToOne: false
            referencedRelation: "mixed_checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_payment_allocations_mixed_payment_attempt_id_fkey"
            columns: ["mixed_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_payment_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_payment_allocations_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_payment_allocations_rental_booking_id_fkey"
            columns: ["rental_booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_payment_allocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mixed_payment_attempts: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          expires_at: string | null
          failure_code: string | null
          failure_message: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri: string | null
          gateway_charge_id: string | null
          gateway_source_id: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: Database["public"]["Enums"]["payment_attempt_method"]
          mixed_checkout_session_id: string
          qr_image_url: string | null
          raw_gateway_response: Json
          status: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          method: Database["public"]["Enums"]["payment_attempt_method"]
          mixed_checkout_session_id: string
          qr_image_url?: string | null
          raw_gateway_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_attempt_method"]
          mixed_checkout_session_id?: string
          qr_image_url?: string | null
          raw_gateway_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mixed_payment_attempts_mixed_checkout_session_id_fkey"
            columns: ["mixed_checkout_session_id"]
            isOneToOne: false
            referencedRelation: "mixed_checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixed_payment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      official_documents: {
        Row: {
          branch_id: string | null
          company_id: string | null
          created_at: string
          currency_code: string
          customer_user_id: string | null
          document_no: string | null
          document_type: string
          id: string
          idempotency_key: string | null
          issued_at: string | null
          issued_by: string | null
          last_printed_at: string | null
          original_document_id: string | null
          print_count: number
          snapshot: Json
          source_id: string
          source_type: string
          status: string
          subtotal: number
          tax_profile_id: string | null
          template_key: string
          template_version: number
          total_amount: number
          updated_at: string
          vat_amount: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          walk_in_phone: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          currency_code?: string
          customer_user_id?: string | null
          document_no?: string | null
          document_type: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          issued_by?: string | null
          last_printed_at?: string | null
          original_document_id?: string | null
          print_count?: number
          snapshot?: Json
          source_id: string
          source_type: string
          status?: string
          subtotal?: number
          tax_profile_id?: string | null
          template_key: string
          template_version?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          currency_code?: string
          customer_user_id?: string | null
          document_no?: string | null
          document_type?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          issued_by?: string | null
          last_printed_at?: string | null
          original_document_id?: string | null
          print_count?: number
          snapshot?: Json
          source_id?: string
          source_type?: string
          status?: string
          subtotal?: number
          tax_profile_id?: string | null
          template_key?: string
          template_version?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "official_documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_original_document_id_fkey"
            columns: ["original_document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_tax_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_documents_walk_in_phone_fkey"
            columns: ["walk_in_phone"]
            isOneToOne: false
            referencedRelation: "walk_in_customers"
            referencedColumns: ["phone"]
          },
        ]
      }
      order_idempotency_keys: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          order_id: string
          request_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          order_id: string
          request_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          request_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_idempotency_keys_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          line_total: number
          name: string
          order_id: string
          original_unit_price: number | null
          product_id: string
          quantity: number
          sku_id: string
          thumbnail: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          line_total: number
          name: string
          order_id: string
          original_unit_price?: number | null
          product_id: string
          quantity: number
          sku_id: string
          thumbnail?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          line_total?: number
          name?: string
          order_id?: string
          original_unit_price?: number | null
          product_id?: string
          quantity?: number
          sku_id?: string
          thumbnail?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          address_snapshot: Json
          cart_id: string | null
          checkout_mode: Database["public"]["Enums"]["order_checkout_mode"]
          company_id: string | null
          created_at: string
          currency_code: string
          discount_total: number
          fulfillment_status: Database["public"]["Enums"]["order_fulfillment_status"]
          grand_total: number
          id: string
          inventory_applied_at: string | null
          inventory_reversed_at: string | null
          mixed_checkout_session_id: string | null
          mixed_payment_attempt_id: string | null
          notes: string | null
          order_number: string
          payment_method:
            | Database["public"]["Enums"]["order_payment_method"]
            | null
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          pickup_branch_id: string | null
          pos_branch_code: string | null
          pos_branch_id: string | null
          pos_branch_name: string | null
          pos_paid_amount: number
          pos_payment_method: string | null
          pos_staff_user_id: string | null
          shipped_at: string | null
          shipping_breakdown: Json
          shipping_cost: number
          shipping_mode:
            | Database["public"]["Enums"]["order_shipping_mode"]
            | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tracking_carrier: string | null
          tracking_note: string | null
          tracking_number: string | null
          updated_at: string
          user_id: string | null
          walk_in_phone: string | null
        }
        Insert: {
          address_id?: string | null
          address_snapshot?: Json
          cart_id?: string | null
          checkout_mode: Database["public"]["Enums"]["order_checkout_mode"]
          company_id?: string | null
          created_at?: string
          currency_code?: string
          discount_total?: number
          fulfillment_status: Database["public"]["Enums"]["order_fulfillment_status"]
          grand_total: number
          id?: string
          inventory_applied_at?: string | null
          inventory_reversed_at?: string | null
          mixed_checkout_session_id?: string | null
          mixed_payment_attempt_id?: string | null
          notes?: string | null
          order_number?: string
          payment_method?:
            | Database["public"]["Enums"]["order_payment_method"]
            | null
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          pickup_branch_id?: string | null
          pos_branch_code?: string | null
          pos_branch_id?: string | null
          pos_branch_name?: string | null
          pos_paid_amount?: number
          pos_payment_method?: string | null
          pos_staff_user_id?: string | null
          shipped_at?: string | null
          shipping_breakdown?: Json
          shipping_cost?: number
          shipping_mode?:
            | Database["public"]["Enums"]["order_shipping_mode"]
            | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tracking_carrier?: string | null
          tracking_note?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          address_id?: string | null
          address_snapshot?: Json
          cart_id?: string | null
          checkout_mode?: Database["public"]["Enums"]["order_checkout_mode"]
          company_id?: string | null
          created_at?: string
          currency_code?: string
          discount_total?: number
          fulfillment_status?: Database["public"]["Enums"]["order_fulfillment_status"]
          grand_total?: number
          id?: string
          inventory_applied_at?: string | null
          inventory_reversed_at?: string | null
          mixed_checkout_session_id?: string | null
          mixed_payment_attempt_id?: string | null
          notes?: string | null
          order_number?: string
          payment_method?:
            | Database["public"]["Enums"]["order_payment_method"]
            | null
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          pickup_branch_id?: string | null
          pos_branch_code?: string | null
          pos_branch_id?: string | null
          pos_branch_name?: string | null
          pos_paid_amount?: number
          pos_payment_method?: string | null
          pos_staff_user_id?: string | null
          shipped_at?: string | null
          shipping_breakdown?: Json
          shipping_cost?: number
          shipping_mode?:
            | Database["public"]["Enums"]["order_shipping_mode"]
            | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tracking_carrier?: string | null
          tracking_note?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_mixed_checkout_session_id_fkey"
            columns: ["mixed_checkout_session_id"]
            isOneToOne: false
            referencedRelation: "mixed_checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_mixed_payment_attempt_id_fkey"
            columns: ["mixed_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_branch_id_fkey"
            columns: ["pickup_branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_branch_id_fkey"
            columns: ["pos_branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_staff_user_id_fkey"
            columns: ["pos_staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_walk_in_phone_fkey"
            columns: ["walk_in_phone"]
            isOneToOne: false
            referencedRelation: "walk_in_customers"
            referencedColumns: ["phone"]
          },
        ]
      }
      partner_profiles: {
        Row: {
          business_hours_preset_key: string | null
          business_hours_text: string | null
          business_hours_timezone: string
          contact_email: string | null
          contact_phone: string | null
          content_blocks: Json
          cover_image_url: string | null
          created_at: string
          description_en: string | null
          description_th: string | null
          directory_type: string
          entity_type: string
          id: string
          internal_notes: string | null
          is_featured: boolean
          is_public: boolean
          is_verified: boolean
          kyc_documents: Json
          line_id: string | null
          line_url: string | null
          main_category_key: string | null
          main_image_url: string | null
          maps_url: string | null
          name_en: string | null
          name_th: string
          search_keywords: string[]
          secondary_category_keys: string[]
          service_areas: string[]
          slug: string
          sort_order: number
          tagline_en: string | null
          tagline_th: string | null
          thumbnail_image_url: string | null
          updated_at: string
          verification_cancelled_at: string | null
          verification_cancelled_by_user_id: string | null
          verified_at: string | null
          verified_by_user_id: string | null
          verified_notes: string | null
          verified_until: string | null
        }
        Insert: {
          business_hours_preset_key?: string | null
          business_hours_text?: string | null
          business_hours_timezone?: string
          contact_email?: string | null
          contact_phone?: string | null
          content_blocks?: Json
          cover_image_url?: string | null
          created_at?: string
          description_en?: string | null
          description_th?: string | null
          directory_type: string
          entity_type?: string
          id?: string
          internal_notes?: string | null
          is_featured?: boolean
          is_public?: boolean
          is_verified?: boolean
          kyc_documents?: Json
          line_id?: string | null
          line_url?: string | null
          main_category_key?: string | null
          main_image_url?: string | null
          maps_url?: string | null
          name_en?: string | null
          name_th: string
          search_keywords?: string[]
          secondary_category_keys?: string[]
          service_areas?: string[]
          slug: string
          sort_order?: number
          tagline_en?: string | null
          tagline_th?: string | null
          thumbnail_image_url?: string | null
          updated_at?: string
          verification_cancelled_at?: string | null
          verification_cancelled_by_user_id?: string | null
          verified_at?: string | null
          verified_by_user_id?: string | null
          verified_notes?: string | null
          verified_until?: string | null
        }
        Update: {
          business_hours_preset_key?: string | null
          business_hours_text?: string | null
          business_hours_timezone?: string
          contact_email?: string | null
          contact_phone?: string | null
          content_blocks?: Json
          cover_image_url?: string | null
          created_at?: string
          description_en?: string | null
          description_th?: string | null
          directory_type?: string
          entity_type?: string
          id?: string
          internal_notes?: string | null
          is_featured?: boolean
          is_public?: boolean
          is_verified?: boolean
          kyc_documents?: Json
          line_id?: string | null
          line_url?: string | null
          main_category_key?: string | null
          main_image_url?: string | null
          maps_url?: string | null
          name_en?: string | null
          name_th?: string
          search_keywords?: string[]
          secondary_category_keys?: string[]
          service_areas?: string[]
          slug?: string
          sort_order?: number
          tagline_en?: string | null
          tagline_th?: string | null
          thumbnail_image_url?: string | null
          updated_at?: string
          verification_cancelled_at?: string | null
          verification_cancelled_by_user_id?: string | null
          verified_at?: string | null
          verified_by_user_id?: string | null
          verified_notes?: string | null
          verified_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_profiles_main_category_key_fkey"
            columns: ["main_category_key"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "partner_profiles_verification_cancelled_by_user_id_fkey"
            columns: ["verification_cancelled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_profiles_verified_by_user_id_fkey"
            columns: ["verified_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_alerts: {
        Row: {
          audience: string
          booking_id: string | null
          created_at: string
          id: string
          kind: string
          message: string
          metadata: Json
          mixed_checkout_session_id: string | null
          mixed_payment_allocation_id: string | null
          mixed_payment_attempt_id: string | null
          order_id: string | null
          payment_attempt_id: string | null
          rental_booking_payment_attempt_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          audience: string
          booking_id?: string | null
          created_at?: string
          id?: string
          kind: string
          message: string
          metadata?: Json
          mixed_checkout_session_id?: string | null
          mixed_payment_allocation_id?: string | null
          mixed_payment_attempt_id?: string | null
          order_id?: string | null
          payment_attempt_id?: string | null
          rental_booking_payment_attempt_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
        }
        Update: {
          audience?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string
          metadata?: Json
          mixed_checkout_session_id?: string | null
          mixed_payment_allocation_id?: string | null
          mixed_payment_attempt_id?: string | null
          order_id?: string | null
          payment_attempt_id?: string | null
          rental_booking_payment_attempt_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_alerts_mixed_checkout_session_id_fkey"
            columns: ["mixed_checkout_session_id"]
            isOneToOne: false
            referencedRelation: "mixed_checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_alerts_mixed_payment_allocation_id_fkey"
            columns: ["mixed_payment_allocation_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_alerts_mixed_payment_attempt_id_fkey"
            columns: ["mixed_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_alerts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_alerts_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_alerts_rental_booking_payment_attempt_id_fkey"
            columns: ["rental_booking_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocated_at: string
          allocation_type: string
          branch_id: string | null
          created_at: string
          currency_code: string
          deposit_lifecycle_status: string | null
          direction: string
          external_reference: string
          gross_amount: number
          id: string
          idempotency_key: string | null
          metadata: Json
          net_amount: number
          notes: string
          original_allocation_id: string | null
          payment_attempt_id: string | null
          payment_method: string | null
          payment_reference: string
          payment_source_id: string | null
          payment_source_type: string | null
          proof_storage_bucket: string | null
          proof_storage_path: string | null
          proof_url: string | null
          related_document_id: string | null
          reversal_of_allocation_id: string | null
          source_id: string
          source_type: string
          staff_user_id: string | null
          status: string
          updated_at: string
          vat_amount: number
          vat_treatment: string
        }
        Insert: {
          allocated_at?: string
          allocation_type: string
          branch_id?: string | null
          created_at?: string
          currency_code?: string
          deposit_lifecycle_status?: string | null
          direction: string
          external_reference?: string
          gross_amount?: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          net_amount?: number
          notes?: string
          original_allocation_id?: string | null
          payment_attempt_id?: string | null
          payment_method?: string | null
          payment_reference?: string
          payment_source_id?: string | null
          payment_source_type?: string | null
          proof_storage_bucket?: string | null
          proof_storage_path?: string | null
          proof_url?: string | null
          related_document_id?: string | null
          reversal_of_allocation_id?: string | null
          source_id: string
          source_type: string
          staff_user_id?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_treatment?: string
        }
        Update: {
          allocated_at?: string
          allocation_type?: string
          branch_id?: string | null
          created_at?: string
          currency_code?: string
          deposit_lifecycle_status?: string | null
          direction?: string
          external_reference?: string
          gross_amount?: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          net_amount?: number
          notes?: string
          original_allocation_id?: string | null
          payment_attempt_id?: string | null
          payment_method?: string | null
          payment_reference?: string
          payment_source_id?: string | null
          payment_source_type?: string | null
          proof_storage_bucket?: string | null
          proof_storage_path?: string | null
          proof_url?: string | null
          related_document_id?: string | null
          reversal_of_allocation_id?: string | null
          source_id?: string
          source_type?: string
          staff_user_id?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_original_allocation_id_fkey"
            columns: ["original_allocation_id"]
            isOneToOne: false
            referencedRelation: "payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_reversal_of_allocation_id_fkey"
            columns: ["reversal_of_allocation_id"]
            isOneToOne: false
            referencedRelation: "payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          expires_at: string | null
          failure_code: string | null
          failure_message: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri: string | null
          gateway_charge_id: string | null
          gateway_source_id: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: Database["public"]["Enums"]["payment_attempt_method"]
          order_id: string
          qr_image_url: string | null
          raw_gateway_response: Json
          status: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          method: Database["public"]["Enums"]["payment_attempt_method"]
          order_id: string
          qr_image_url?: string | null
          raw_gateway_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_attempt_method"]
          order_id?: string
          qr_image_url?: string | null
          raw_gateway_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          booking_id: string | null
          event_type: string
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_charge_id: string | null
          gateway_event_id: string | null
          id: string
          mixed_checkout_session_id: string | null
          mixed_payment_attempt_id: string | null
          order_id: string | null
          payment_attempt_id: string | null
          pos_rental_payment_attempt_id: string | null
          processed_at: string | null
          processing_error: string | null
          raw_payload: Json
          received_at: string
          rental_booking_payment_attempt_id: string | null
          signature_header: string | null
          status: Database["public"]["Enums"]["payment_event_status"]
        }
        Insert: {
          booking_id?: string | null
          event_type: string
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_charge_id?: string | null
          gateway_event_id?: string | null
          id?: string
          mixed_checkout_session_id?: string | null
          mixed_payment_attempt_id?: string | null
          order_id?: string | null
          payment_attempt_id?: string | null
          pos_rental_payment_attempt_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_payload?: Json
          received_at?: string
          rental_booking_payment_attempt_id?: string | null
          signature_header?: string | null
          status?: Database["public"]["Enums"]["payment_event_status"]
        }
        Update: {
          booking_id?: string | null
          event_type?: string
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_charge_id?: string | null
          gateway_event_id?: string | null
          id?: string
          mixed_checkout_session_id?: string | null
          mixed_payment_attempt_id?: string | null
          order_id?: string | null
          payment_attempt_id?: string | null
          pos_rental_payment_attempt_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_payload?: Json
          received_at?: string
          rental_booking_payment_attempt_id?: string | null
          signature_header?: string | null
          status?: Database["public"]["Enums"]["payment_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_mixed_checkout_session_id_fkey"
            columns: ["mixed_checkout_session_id"]
            isOneToOne: false
            referencedRelation: "mixed_checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_mixed_payment_attempt_id_fkey"
            columns: ["mixed_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_pos_rental_payment_attempt_id_fkey"
            columns: ["pos_rental_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "pos_rental_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_rental_booking_payment_attempt_id_fkey"
            columns: ["rental_booking_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_payment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          admin_note: string | null
          booking_id: string
          cancellation_event_id: string | null
          created_at: string
          currency_code: string
          customer_confirmed_destination_at: string
          customer_note: string | null
          failed_at: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"] | null
          gateway_charge_id: string | null
          gateway_payment_reference: string | null
          id: string
          manual_transfer_reference: string | null
          metadata: Json
          needs_customer_contact_at: string | null
          original_mixed_payment_allocation_id: string | null
          original_payment_source_type: string
          original_rental_booking_payment_attempt_id: string | null
          processed_by_user_id: string | null
          processing_at: string | null
          refund_amount: number
          refund_bank_account_name: string
          refund_bank_account_number: string
          refund_bank_name: string
          refund_contact_phone: string
          refund_proof_id: string | null
          refund_type: string
          refunded_at: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          booking_id: string
          cancellation_event_id?: string | null
          created_at?: string
          currency_code?: string
          customer_confirmed_destination_at: string
          customer_note?: string | null
          failed_at?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"] | null
          gateway_charge_id?: string | null
          gateway_payment_reference?: string | null
          id?: string
          manual_transfer_reference?: string | null
          metadata?: Json
          needs_customer_contact_at?: string | null
          original_mixed_payment_allocation_id?: string | null
          original_payment_source_type: string
          original_rental_booking_payment_attempt_id?: string | null
          processed_by_user_id?: string | null
          processing_at?: string | null
          refund_amount: number
          refund_bank_account_name: string
          refund_bank_account_number: string
          refund_bank_name: string
          refund_contact_phone: string
          refund_proof_id?: string | null
          refund_type?: string
          refunded_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          booking_id?: string
          cancellation_event_id?: string | null
          created_at?: string
          currency_code?: string
          customer_confirmed_destination_at?: string
          customer_note?: string | null
          failed_at?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"] | null
          gateway_charge_id?: string | null
          gateway_payment_reference?: string | null
          id?: string
          manual_transfer_reference?: string | null
          metadata?: Json
          needs_customer_contact_at?: string | null
          original_mixed_payment_allocation_id?: string | null
          original_payment_source_type?: string
          original_rental_booking_payment_attempt_id?: string | null
          processed_by_user_id?: string | null
          processing_at?: string | null
          refund_amount?: number
          refund_bank_account_name?: string
          refund_bank_account_number?: string
          refund_bank_name?: string
          refund_contact_phone?: string
          refund_proof_id?: string | null
          refund_type?: string
          refunded_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_cancellation_event_id_fkey"
            columns: ["cancellation_event_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_cancellation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_original_mixed_payment_allocation_id_fkey"
            columns: ["original_mixed_payment_allocation_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_original_rental_booking_payment_attempt_id_fkey"
            columns: ["original_rental_booking_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_processed_by_user_id_fkey"
            columns: ["processed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_refund_proof_id_fkey"
            columns: ["refund_proof_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_deposit_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_document_issuance_tasks: {
        Row: {
          attempt_count: number
          created_at: string
          document_type: string
          error_code: string | null
          error_message: string | null
          held_balance_event_id: string
          id: string
          issued_at: string | null
          last_attempted_at: string | null
          official_document_id: string | null
          payment_source_id: string
          payment_source_type: string
          rental_booking_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          document_type: string
          error_code?: string | null
          error_message?: string | null
          held_balance_event_id: string
          id?: string
          issued_at?: string | null
          last_attempted_at?: string | null
          official_document_id?: string | null
          payment_source_id: string
          payment_source_type: string
          rental_booking_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          document_type?: string
          error_code?: string | null
          error_message?: string | null
          held_balance_event_id?: string
          id?: string
          issued_at?: string | null
          last_attempted_at?: string | null
          official_document_id?: string | null
          payment_source_id?: string
          payment_source_type?: string
          rental_booking_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_document_issuance_tasks_held_balance_event_id_fkey"
            columns: ["held_balance_event_id"]
            isOneToOne: false
            referencedRelation: "rental_held_balance_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_document_issuance_tasks_official_document_id_fkey"
            columns: ["official_document_id"]
            isOneToOne: false
            referencedRelation: "official_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_document_issuance_tasks_rental_booking_id_fkey"
            columns: ["rental_booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_rental_payment_attempts: {
        Row: {
          amount: number
          branch_id: string | null
          confirm_failed_at: string | null
          confirm_failure_reason: string | null
          created_at: string
          currency_code: string
          expired_at: string | null
          expires_at: string | null
          failed_at: string | null
          gateway: string | null
          gateway_charge_id: string | null
          gateway_source_id: string | null
          id: string
          idempotency_key: string
          metadata: Json
          paid_at: string | null
          payment_method: string
          payment_purpose: string
          qr_image_url: string | null
          rental_booking_id: string
          staff_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          confirm_failed_at?: string | null
          confirm_failure_reason?: string | null
          created_at?: string
          currency_code?: string
          expired_at?: string | null
          expires_at?: string | null
          failed_at?: string | null
          gateway?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          paid_at?: string | null
          payment_method: string
          payment_purpose: string
          qr_image_url?: string | null
          rental_booking_id: string
          staff_user_id: string
          status: string
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          confirm_failed_at?: string | null
          confirm_failure_reason?: string | null
          created_at?: string
          currency_code?: string
          expired_at?: string | null
          expires_at?: string | null
          failed_at?: string | null
          gateway?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          paid_at?: string | null
          payment_method?: string
          payment_purpose?: string
          qr_image_url?: string | null
          rental_booking_id?: string
          staff_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_rental_payment_attempts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_rental_payment_attempts_rental_booking_id_fkey"
            columns: ["rental_booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_rental_payment_attempts_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_filter_options: {
        Row: {
          created_at: string
          filter_option_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          filter_option_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          filter_option_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_filter_options_filter_option_id_fkey"
            columns: ["filter_option_id"]
            isOneToOne: false
            referencedRelation: "filter_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_filter_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_metrics: {
        Row: {
          add_to_cart_count: number
          avg_rating: number
          created_at: string
          last_rented_at: string | null
          last_sold_at: string | null
          order_count: number
          product_id: string
          rental_count: number
          return_rate: number
          review_count: number
          trending_score: number
          updated_at: string
          view_count: number
          wishlist_count: number
        }
        Insert: {
          add_to_cart_count?: number
          avg_rating?: number
          created_at?: string
          last_rented_at?: string | null
          last_sold_at?: string | null
          order_count?: number
          product_id: string
          rental_count?: number
          return_rate?: number
          review_count?: number
          trending_score?: number
          updated_at?: string
          view_count?: number
          wishlist_count?: number
        }
        Update: {
          add_to_cart_count?: number
          avg_rating?: number
          created_at?: string
          last_rented_at?: string | null
          last_sold_at?: string | null
          order_count?: number
          product_id?: string
          rental_count?: number
          return_rate?: number
          review_count?: number
          trending_score?: number
          updated_at?: string
          view_count?: number
          wishlist_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_metrics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_skus: {
        Row: {
          attributes: Json
          created_at: string
          currency_code: string
          discount_percent: number
          id: string
          label_cn: string | null
          label_en: string
          label_jp: string | null
          label_th: string
          media_gallery: Json
          original_price: number | null
          price: number
          pricing_tiers: Json
          product_id: string
          promo_end_at: string | null
          promo_start_at: string | null
          sku_code: string
          stock: number
          updated_at: string
          use_product_images: boolean
        }
        Insert: {
          attributes?: Json
          created_at?: string
          currency_code?: string
          discount_percent?: number
          id: string
          label_cn?: string | null
          label_en: string
          label_jp?: string | null
          label_th: string
          media_gallery?: Json
          original_price?: number | null
          price: number
          pricing_tiers?: Json
          product_id: string
          promo_end_at?: string | null
          promo_start_at?: string | null
          sku_code: string
          stock?: number
          updated_at?: string
          use_product_images?: boolean
        }
        Update: {
          attributes?: Json
          created_at?: string
          currency_code?: string
          discount_percent?: number
          id?: string
          label_cn?: string | null
          label_en?: string
          label_jp?: string | null
          label_th?: string
          media_gallery?: Json
          original_price?: number | null
          price?: number
          pricing_tiers?: Json
          product_id?: string
          promo_end_at?: string | null
          promo_start_at?: string | null
          sku_code?: string
          stock?: number
          updated_at?: string
          use_product_images?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_skus_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_keys: string[]
          created_at: string
          description_cn: string | null
          description_en: string
          description_jp: string | null
          description_th: string
          detail_blocks: Json
          documents: Json
          filter_keys: string[]
          id: string
          is_hidden: boolean
          main_category_key: string
          media_gallery: Json
          media_links: Json
          name_cn: string | null
          name_en: string
          name_jp: string | null
          name_th: string
          search_keywords: string[]
          search_vector: unknown
          shipping_size: Database["public"]["Enums"]["product_shipping_size"]
          slug: string
          spec: Json
          supplier_ids: string[]
          tag_keys: string[]
          type: Database["public"]["Enums"]["catalog_product_type"]
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_keys?: string[]
          created_at?: string
          description_cn?: string | null
          description_en: string
          description_jp?: string | null
          description_th: string
          detail_blocks?: Json
          documents?: Json
          filter_keys?: string[]
          id: string
          is_hidden?: boolean
          main_category_key?: string
          media_gallery?: Json
          media_links?: Json
          name_cn?: string | null
          name_en: string
          name_jp?: string | null
          name_th: string
          search_keywords?: string[]
          search_vector?: unknown
          shipping_size?: Database["public"]["Enums"]["product_shipping_size"]
          slug: string
          spec?: Json
          supplier_ids?: string[]
          tag_keys?: string[]
          type: Database["public"]["Enums"]["catalog_product_type"]
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_keys?: string[]
          created_at?: string
          description_cn?: string | null
          description_en?: string
          description_jp?: string | null
          description_th?: string
          detail_blocks?: Json
          documents?: Json
          filter_keys?: string[]
          id?: string
          is_hidden?: boolean
          main_category_key?: string
          media_gallery?: Json
          media_links?: Json
          name_cn?: string | null
          name_en?: string
          name_jp?: string | null
          name_th?: string
          search_keywords?: string[]
          search_vector?: unknown
          shipping_size?: Database["public"]["Enums"]["product_shipping_size"]
          slug?: string
          spec?: Json
          supplier_ids?: string[]
          tag_keys?: string[]
          type?: Database["public"]["Enums"]["catalog_product_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_main_category_key_fkey"
            columns: ["main_category_key"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      public_contact_settings: {
        Row: {
          created_at: string
          id: boolean
          line_url: string
          support_phone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: boolean
          line_url?: string
          support_phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: boolean
          line_url?: string
          support_phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_contact_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_asset_events: {
        Row: {
          actor_user_id: string | null
          allocation_id: string | null
          asset_id: string
          booking_id: string | null
          event_at: string
          event_type: Database["public"]["Enums"]["rental_asset_event_type"]
          from_hub_id: string | null
          from_status: Database["public"]["Enums"]["rental_asset_status"] | null
          id: string
          metadata: Json
          notes: string | null
          to_hub_id: string | null
          to_status: Database["public"]["Enums"]["rental_asset_status"] | null
        }
        Insert: {
          actor_user_id?: string | null
          allocation_id?: string | null
          asset_id: string
          booking_id?: string | null
          event_at?: string
          event_type: Database["public"]["Enums"]["rental_asset_event_type"]
          from_hub_id?: string | null
          from_status?:
            | Database["public"]["Enums"]["rental_asset_status"]
            | null
          id?: string
          metadata?: Json
          notes?: string | null
          to_hub_id?: string | null
          to_status?: Database["public"]["Enums"]["rental_asset_status"] | null
        }
        Update: {
          actor_user_id?: string | null
          allocation_id?: string | null
          asset_id?: string
          booking_id?: string | null
          event_at?: string
          event_type?: Database["public"]["Enums"]["rental_asset_event_type"]
          from_hub_id?: string | null
          from_status?:
            | Database["public"]["Enums"]["rental_asset_status"]
            | null
          id?: string
          metadata?: Json
          notes?: string | null
          to_hub_id?: string | null
          to_status?: Database["public"]["Enums"]["rental_asset_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_asset_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_asset_events_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_asset_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "rental_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_asset_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_assets: {
        Row: {
          asset_code: string
          barcode: string | null
          created_at: string
          hub_id: string | null
          id: string
          metadata: Json
          notes: string | null
          serial_number: string | null
          sku_id: string
          status: Database["public"]["Enums"]["rental_asset_status"]
          updated_at: string
        }
        Insert: {
          asset_code: string
          barcode?: string | null
          created_at?: string
          hub_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          serial_number?: string | null
          sku_id: string
          status?: Database["public"]["Enums"]["rental_asset_status"]
          updated_at?: string
        }
        Update: {
          asset_code?: string
          barcode?: string | null
          created_at?: string
          hub_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          serial_number?: string | null
          sku_id?: string
          status?: Database["public"]["Enums"]["rental_asset_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_assets_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "product_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_assets: {
        Row: {
          allocated_at: string
          allocated_by: string | null
          allocation_status: Database["public"]["Enums"]["rental_asset_allocation_status"]
          asset_id: string
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          released_at: string | null
          released_by: string | null
          updated_at: string
        }
        Insert: {
          allocated_at?: string
          allocated_by?: string | null
          allocation_status?: Database["public"]["Enums"]["rental_asset_allocation_status"]
          asset_id: string
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          released_at?: string | null
          released_by?: string | null
          updated_at?: string
        }
        Update: {
          allocated_at?: string
          allocated_by?: string | null
          allocation_status?: Database["public"]["Enums"]["rental_asset_allocation_status"]
          asset_id?: string
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          released_at?: string | null
          released_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_assets_allocated_by_fkey"
            columns: ["allocated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "rental_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_assets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_assets_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_cancellation_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          booking_id: string
          cancellation_initiator: string
          cancellation_local_date_snapshot: string
          cancellation_reason_code: string | null
          cancellation_reason_note: string | null
          cancellation_source: string
          cancellation_source_event_id: string | null
          cancelled_at: string
          created_at: string
          id: string
          metadata: Json
          pickup_date_snapshot: string | null
          previous_booking_deposit_payment_status: string | null
          previous_status: string
          qualifies_for_restriction: boolean
          qualifying_cancellation_count_after: number | null
          refund_amount_due: number
          refund_cutoff_date_snapshot: string | null
          refund_eligible: boolean
          refund_policy_version: string
          refund_timezone: string
          restriction_window_started_at: string | null
          user_id: string | null
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          booking_id: string
          cancellation_initiator: string
          cancellation_local_date_snapshot: string
          cancellation_reason_code?: string | null
          cancellation_reason_note?: string | null
          cancellation_source: string
          cancellation_source_event_id?: string | null
          cancelled_at?: string
          created_at?: string
          id?: string
          metadata?: Json
          pickup_date_snapshot?: string | null
          previous_booking_deposit_payment_status?: string | null
          previous_status: string
          qualifies_for_restriction?: boolean
          qualifying_cancellation_count_after?: number | null
          refund_amount_due?: number
          refund_cutoff_date_snapshot?: string | null
          refund_eligible?: boolean
          refund_policy_version?: string
          refund_timezone?: string
          restriction_window_started_at?: string | null
          user_id?: string | null
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          booking_id?: string
          cancellation_initiator?: string
          cancellation_local_date_snapshot?: string
          cancellation_reason_code?: string | null
          cancellation_reason_note?: string | null
          cancellation_source?: string
          cancellation_source_event_id?: string | null
          cancelled_at?: string
          created_at?: string
          id?: string
          metadata?: Json
          pickup_date_snapshot?: string | null
          previous_booking_deposit_payment_status?: string | null
          previous_status?: string
          qualifies_for_restriction?: boolean
          qualifying_cancellation_count_after?: number | null
          refund_amount_due?: number
          refund_cutoff_date_snapshot?: string | null
          refund_eligible?: boolean
          refund_policy_version?: string
          refund_timezone?: string
          restriction_window_started_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_cancellation_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_cancellation_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_cancellation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_checklist_items: {
        Row: {
          booking_checklist_id: string
          checked: boolean | null
          checked_at: string | null
          checked_by_user_id: string | null
          created_at: string
          id: string
          instruction: string | null
          is_required: boolean
          label: string
          photo_urls: string[]
          remark: string | null
          response_number: number | null
          response_text: string | null
          response_type: Database["public"]["Enums"]["rental_checklist_item_response_type"]
          result_status: Database["public"]["Enums"]["rental_checklist_item_result"]
          sort_order: number
          template_item_id: string | null
          updated_at: string
        }
        Insert: {
          booking_checklist_id: string
          checked?: boolean | null
          checked_at?: string | null
          checked_by_user_id?: string | null
          created_at?: string
          id?: string
          instruction?: string | null
          is_required?: boolean
          label: string
          photo_urls?: string[]
          remark?: string | null
          response_number?: number | null
          response_text?: string | null
          response_type?: Database["public"]["Enums"]["rental_checklist_item_response_type"]
          result_status?: Database["public"]["Enums"]["rental_checklist_item_result"]
          sort_order?: number
          template_item_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_checklist_id?: string
          checked?: boolean | null
          checked_at?: string | null
          checked_by_user_id?: string | null
          created_at?: string
          id?: string
          instruction?: string | null
          is_required?: boolean
          label?: string
          photo_urls?: string[]
          remark?: string | null
          response_number?: number | null
          response_text?: string | null
          response_type?: Database["public"]["Enums"]["rental_checklist_item_response_type"]
          result_status?: Database["public"]["Enums"]["rental_checklist_item_result"]
          sort_order?: number
          template_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_checklist_items_booking_checklist_id_fkey"
            columns: ["booking_checklist_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_checklist_items_checked_by_user_id_fkey"
            columns: ["checked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_checklist_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "asset_checklist_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_checklists: {
        Row: {
          asset_id: string
          booking_id: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["rental_checklist_kind"]
          notes: string | null
          performed_by_user_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["rental_checklist_status"]
          template_id: string | null
          template_name: string | null
          template_version: number | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          booking_id: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["rental_checklist_kind"]
          notes?: string | null
          performed_by_user_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["rental_checklist_status"]
          template_id?: string | null
          template_name?: string | null
          template_version?: number | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          booking_id?: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["rental_checklist_kind"]
          notes?: string | null
          performed_by_user_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["rental_checklist_status"]
          template_id?: string | null
          template_name?: string | null
          template_version?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_checklists_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_checklists_completed_by_user_id_fkey"
            columns: ["completed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_checklists_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_checklists_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "asset_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_deposit_action_logs: {
        Row: {
          action: string
          booking_id: string
          branch_id: string | null
          change_summary: string
          created_at: string
          id: string
          new_values: Json
          old_values: Json | null
          reason: string | null
          staff_user_id: string | null
        }
        Insert: {
          action: string
          booking_id: string
          branch_id?: string | null
          change_summary: string
          created_at?: string
          id?: string
          new_values?: Json
          old_values?: Json | null
          reason?: string | null
          staff_user_id?: string | null
        }
        Update: {
          action?: string
          booking_id?: string
          branch_id?: string | null
          change_summary?: string
          created_at?: string
          id?: string
          new_values?: Json
          old_values?: Json | null
          reason?: string | null
          staff_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_deposit_action_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_action_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_action_logs_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_deposit_agreements: {
        Row: {
          accepted_at: string
          accepted_terms_version: string
          agreement_acceptance_log_id: string | null
          agreement_version_id: string | null
          booking_id: string
          content_hash: string
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json
          payment_attempt_id: string | null
          rendered_text_hash: string
          terms_snapshot: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_terms_version: string
          agreement_acceptance_log_id?: string | null
          agreement_version_id?: string | null
          booking_id: string
          content_hash?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          payment_attempt_id?: string | null
          rendered_text_hash?: string
          terms_snapshot: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          accepted_terms_version?: string
          agreement_acceptance_log_id?: string | null
          agreement_version_id?: string | null
          booking_id?: string
          content_hash?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          payment_attempt_id?: string | null
          rendered_text_hash?: string
          terms_snapshot?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_deposit_agreeme_agreement_acceptance_log_id_fkey"
            columns: ["agreement_acceptance_log_id"]
            isOneToOne: false
            referencedRelation: "agreement_acceptance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_agreements_agreement_version_id_fkey"
            columns: ["agreement_version_id"]
            isOneToOne: false
            referencedRelation: "agreement_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_agreements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_agreements_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_agreements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_deposit_disposition_events: {
        Row: {
          accepted_terms_version: string | null
          actor_type: string
          actor_user_id: string | null
          agreement_acceptance_log_id: string | null
          agreement_version_id: string | null
          booking_deposit_payment_source_type: string | null
          booking_id: string
          cancellation_event_id: string | null
          created_at: string
          currency_code: string
          disposition: string
          forfeited_amount: number
          id: string
          metadata: Json
          mixed_payment_allocation_id: string | null
          no_show_event_id: string | null
          occurred_at: string
          policy_version: string
          reason: string | null
          rental_booking_payment_attempt_id: string | null
          source_event_type: string
          terms_accepted_at: string | null
          user_id: string | null
        }
        Insert: {
          accepted_terms_version?: string | null
          actor_type?: string
          actor_user_id?: string | null
          agreement_acceptance_log_id?: string | null
          agreement_version_id?: string | null
          booking_deposit_payment_source_type?: string | null
          booking_id: string
          cancellation_event_id?: string | null
          created_at?: string
          currency_code?: string
          disposition?: string
          forfeited_amount: number
          id?: string
          metadata?: Json
          mixed_payment_allocation_id?: string | null
          no_show_event_id?: string | null
          occurred_at?: string
          policy_version?: string
          reason?: string | null
          rental_booking_payment_attempt_id?: string | null
          source_event_type: string
          terms_accepted_at?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_terms_version?: string | null
          actor_type?: string
          actor_user_id?: string | null
          agreement_acceptance_log_id?: string | null
          agreement_version_id?: string | null
          booking_deposit_payment_source_type?: string | null
          booking_id?: string
          cancellation_event_id?: string | null
          created_at?: string
          currency_code?: string
          disposition?: string
          forfeited_amount?: number
          id?: string
          metadata?: Json
          mixed_payment_allocation_id?: string | null
          no_show_event_id?: string | null
          occurred_at?: string
          policy_version?: string
          reason?: string | null
          rental_booking_payment_attempt_id?: string | null
          source_event_type?: string
          terms_accepted_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_deposit_dispos_rental_booking_payment_attem_fkey"
            columns: ["rental_booking_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposi_agreement_acceptance_log_id_fkey"
            columns: ["agreement_acceptance_log_id"]
            isOneToOne: false
            referencedRelation: "agreement_acceptance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposi_mixed_payment_allocation_id_fkey"
            columns: ["mixed_payment_allocation_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposition_e_cancellation_event_id_fkey"
            columns: ["cancellation_event_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_cancellation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposition_ev_agreement_version_id_fkey"
            columns: ["agreement_version_id"]
            isOneToOne: false
            referencedRelation: "agreement_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposition_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposition_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposition_events_no_show_event_id_fkey"
            columns: ["no_show_event_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_no_show_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_disposition_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_deposit_proofs: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          created_by_user_id: string | null
          file_size_bytes: number | null
          file_url: string
          id: string
          mime_type: string | null
          notes: string | null
          payment_method: string | null
          proof_kind: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          amount?: number
          booking_id: string
          created_at?: string
          created_by_user_id?: string | null
          file_size_bytes?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          payment_method?: string | null
          proof_kind?: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          created_by_user_id?: string | null
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          payment_method?: string | null
          proof_kind?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_deposit_proofs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_deposit_proofs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_deposit_slips: {
        Row: {
          created_at: string
          file_size_bytes: number
          id: string
          mime_type: string
          original_filename: string
          rental_booking_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_bucket: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_size_bytes: number
          id?: string
          mime_type: string
          original_filename: string
          rental_booking_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          original_filename?: string
          rental_booking_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_deposit_slips_rental_booking_id_fkey"
            columns: ["rental_booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_documents: {
        Row: {
          amount: number | null
          asset_id: string | null
          booking_checklist_id: string | null
          booking_id: string
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          description: string | null
          document_type: Database["public"]["Enums"]["rental_booking_document_type"]
          file_name: string | null
          file_size_bytes: number | null
          file_url: string
          id: string
          issued_at: string | null
          mime_type: string | null
          storage_bucket: string | null
          storage_path: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["asset_document_visibility"]
        }
        Insert: {
          amount?: number | null
          asset_id?: string | null
          booking_checklist_id?: string | null
          booking_id: string
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          description?: string | null
          document_type?: Database["public"]["Enums"]["rental_booking_document_type"]
          file_name?: string | null
          file_size_bytes?: number | null
          file_url: string
          id?: string
          issued_at?: string | null
          mime_type?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["asset_document_visibility"]
        }
        Update: {
          amount?: number | null
          asset_id?: string | null
          booking_checklist_id?: string | null
          booking_id?: string
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          description?: string | null
          document_type?: Database["public"]["Enums"]["rental_booking_document_type"]
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          issued_at?: string | null
          mime_type?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["asset_document_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_documents_booking_checklist_id_fkey"
            columns: ["booking_checklist_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_documents_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_documents_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_fulfillments: {
        Row: {
          booking_checklist_id: string | null
          booking_id: string
          branch_id: string | null
          created_at: string
          event_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          kyc_authorized_via: string | null
          kyc_override_id: string | null
          kyc_profile_id: string | null
          kyc_status_snapshot: Database["public"]["Enums"]["kyc_status"] | null
          kyc_valid_until_snapshot: string | null
          notes: string | null
          performed_by_user_id: string | null
          signature_storage_path: string | null
          signature_url: string | null
          status_after: Database["public"]["Enums"]["rental_booking_status"]
        }
        Insert: {
          booking_checklist_id?: string | null
          booking_id: string
          branch_id?: string | null
          created_at?: string
          event_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          kyc_authorized_via?: string | null
          kyc_override_id?: string | null
          kyc_profile_id?: string | null
          kyc_status_snapshot?: Database["public"]["Enums"]["kyc_status"] | null
          kyc_valid_until_snapshot?: string | null
          notes?: string | null
          performed_by_user_id?: string | null
          signature_storage_path?: string | null
          signature_url?: string | null
          status_after: Database["public"]["Enums"]["rental_booking_status"]
        }
        Update: {
          booking_checklist_id?: string | null
          booking_id?: string
          branch_id?: string | null
          created_at?: string
          event_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          kyc_authorized_via?: string | null
          kyc_override_id?: string | null
          kyc_profile_id?: string | null
          kyc_status_snapshot?: Database["public"]["Enums"]["kyc_status"] | null
          kyc_valid_until_snapshot?: string | null
          notes?: string | null
          performed_by_user_id?: string | null
          signature_storage_path?: string | null
          signature_url?: string | null
          status_after?: Database["public"]["Enums"]["rental_booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_fulfillments_booking_checklist_id_fkey"
            columns: ["booking_checklist_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_fulfillments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_fulfillments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_fulfillments_kyc_override_id_fkey"
            columns: ["kyc_override_id"]
            isOneToOne: false
            referencedRelation: "kyc_pickup_overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_fulfillments_kyc_profile_id_fkey"
            columns: ["kyc_profile_id"]
            isOneToOne: false
            referencedRelation: "kyc_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_fulfillments_performed_by_user_id_fkey"
            columns: ["performed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_handover_items: {
        Row: {
          asset_id: string | null
          booking_id: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          id: string
          item_name: string
          pickup_checked: boolean
          pickup_checked_at: string | null
          pickup_checked_by_user_id: string | null
          pickup_note: string | null
          preparation_note: string | null
          quantity_handed_over: number | null
          quantity_prepared: number
          quantity_returned: number | null
          return_checked_at: string | null
          return_checked_by_user_id: string | null
          return_note: string | null
          return_status: Database["public"]["Enums"]["rental_booking_handover_return_status"]
          sort_order: number
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          asset_id?: string | null
          booking_id: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          item_name: string
          pickup_checked?: boolean
          pickup_checked_at?: string | null
          pickup_checked_by_user_id?: string | null
          pickup_note?: string | null
          preparation_note?: string | null
          quantity_handed_over?: number | null
          quantity_prepared?: number
          quantity_returned?: number | null
          return_checked_at?: string | null
          return_checked_by_user_id?: string | null
          return_note?: string | null
          return_status?: Database["public"]["Enums"]["rental_booking_handover_return_status"]
          sort_order?: number
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          asset_id?: string | null
          booking_id?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          item_name?: string
          pickup_checked?: boolean
          pickup_checked_at?: string | null
          pickup_checked_by_user_id?: string | null
          pickup_note?: string | null
          preparation_note?: string | null
          quantity_handed_over?: number | null
          quantity_prepared?: number
          quantity_returned?: number | null
          return_checked_at?: string | null
          return_checked_by_user_id?: string | null
          return_note?: string | null
          return_status?: Database["public"]["Enums"]["rental_booking_handover_return_status"]
          sort_order?: number
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_handover_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_handover_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_handover_items_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_handover_items_pickup_checked_by_user_id_fkey"
            columns: ["pickup_checked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_handover_items_return_checked_by_user_id_fkey"
            columns: ["return_checked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_handover_items_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_no_show_events: {
        Row: {
          admin_user_id: string | null
          booking_id: string
          created_at: string
          deposit_outcome: string
          id: string
          marked_at: string
          metadata: Json
          pickup_date_snapshot: string
          previous_deposit_refund_status: string | null
          previous_status: string
          reason: string | null
        }
        Insert: {
          admin_user_id?: string | null
          booking_id: string
          created_at?: string
          deposit_outcome?: string
          id?: string
          marked_at?: string
          metadata?: Json
          pickup_date_snapshot: string
          previous_deposit_refund_status?: string | null
          previous_status?: string
          reason?: string | null
        }
        Update: {
          admin_user_id?: string | null
          booking_id?: string
          created_at?: string
          deposit_outcome?: string
          id?: string
          marked_at?: string
          metadata?: Json
          pickup_date_snapshot?: string
          previous_deposit_refund_status?: string | null
          previous_status?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_no_show_events_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_no_show_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_payment_attempts: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency_code: string
          expires_at: string | null
          failure_code: string | null
          failure_message: string | null
          gateway: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri: string | null
          gateway_charge_id: string | null
          gateway_source_id: string | null
          id: string
          idempotency_key: string
          metadata: Json
          method: Database["public"]["Enums"]["payment_attempt_method"]
          qr_image_url: string | null
          raw_gateway_response: Json
          status: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          method: Database["public"]["Enums"]["payment_attempt_method"]
          qr_image_url?: string | null
          raw_gateway_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          gateway?: Database["public"]["Enums"]["payment_gateway"]
          gateway_authorize_uri?: string | null
          gateway_charge_id?: string | null
          gateway_source_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_attempt_method"]
          qr_image_url?: string | null
          raw_gateway_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_payment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_booking_payment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_booking_payment_lines: {
        Row: {
          applied_to_deposit_at: string | null
          applies_to_security_deposit: boolean
          booking_id: string
          created_at: string
          description_en: string
          description_th: string
          forfeited_at: string | null
          gross_amount: number
          id: string
          is_refundable: boolean
          line_type: string
          metadata: Json
          net_payable_amount: number
          reduces_remaining_security_deposit: boolean
          refunded_at: string | null
          source: string
          status: string
          tax_category: string
          updated_at: string
          wht_amount: number
          wht_applicable: boolean
          wht_certificate_required: boolean
          wht_rate: number
        }
        Insert: {
          applied_to_deposit_at?: string | null
          applies_to_security_deposit?: boolean
          booking_id: string
          created_at?: string
          description_en: string
          description_th: string
          forfeited_at?: string | null
          gross_amount?: number
          id?: string
          is_refundable?: boolean
          line_type: string
          metadata?: Json
          net_payable_amount?: number
          reduces_remaining_security_deposit?: boolean
          refunded_at?: string | null
          source?: string
          status?: string
          tax_category: string
          updated_at?: string
          wht_amount?: number
          wht_applicable?: boolean
          wht_certificate_required?: boolean
          wht_rate?: number
        }
        Update: {
          applied_to_deposit_at?: string | null
          applies_to_security_deposit?: boolean
          booking_id?: string
          created_at?: string
          description_en?: string
          description_th?: string
          forfeited_at?: string | null
          gross_amount?: number
          id?: string
          is_refundable?: boolean
          line_type?: string
          metadata?: Json
          net_payable_amount?: number
          reduces_remaining_security_deposit?: boolean
          refunded_at?: string | null
          source?: string
          status?: string
          tax_category?: string
          updated_at?: string
          wht_amount?: number
          wht_applicable?: boolean
          wht_certificate_required?: boolean
          wht_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_booking_payment_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_bookings: {
        Row: {
          asset_code: string | null
          asset_id: string | null
          asset_name: string | null
          asset_slug: string | null
          asset_snapshot: Json
          asset_thumbnail: string | null
          booker_name: string | null
          booker_phone: string | null
          booking_deposit_confirm_failed_at: string | null
          booking_deposit_confirm_failure_reason: string | null
          booking_deposit_mixed_allocation_id: string | null
          booking_deposit_paid_amount: number
          booking_deposit_paid_at: string | null
          booking_deposit_payment_attempt_id: string | null
          booking_deposit_payment_status: string
          booking_deposit_policy_version: string
          booking_deposit_pos_attempt_id: string | null
          booking_deposit_terms_accepted_at: string | null
          booking_deposit_terms_version: string | null
          cancellation_initiator: string | null
          cancellation_reason: string | null
          cancellation_refund_amount_due: number | null
          cancellation_refund_cutoff_date: string | null
          cancellation_refund_eligible: boolean | null
          cancellation_source: string | null
          cancellation_source_event_id: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          checkout_paid_amount: number
          checkout_payment_method: string | null
          checkout_total_amount: number
          created_at: string
          currency_code: string
          daily_rate: number
          deposit_amount: number
          deposit_notes: string | null
          deposit_paid_amount: number
          deposit_paid_at: string | null
          deposit_payment_method: string | null
          deposit_payment_status: string
          deposit_refund_amount: number
          deposit_refund_notes: string | null
          deposit_refund_status: string
          deposit_refunded_at: string | null
          end_date: string
          hub_id: string | null
          hub_name: string | null
          id: string
          kyc_profile_id: string | null
          matched_product_id: string | null
          matched_product_name: string | null
          monthly_rate: number
          no_show_at: string | null
          no_show_marked_by_user_id: string | null
          no_show_reason: string | null
          no_show_source_event_id: string | null
          pickup_at: string | null
          pickup_branch_id: string | null
          pos_branch_code: string | null
          pos_branch_id: string | null
          pos_branch_name: string | null
          pos_staff_user_id: string | null
          pricing_breakdown: Json
          pricing_model: Database["public"]["Enums"]["rental_pricing_model"]
          product_id: string | null
          product_name: string
          rental_days: number
          rental_total: number
          return_branch_id: string | null
          returned_at: string | null
          sku_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["rental_booking_status"]
          thumbnail: string | null
          updated_at: string
          user_id: string | null
          walk_in_phone: string | null
          weekly_rate: number
        }
        Insert: {
          asset_code?: string | null
          asset_id?: string | null
          asset_name?: string | null
          asset_slug?: string | null
          asset_snapshot?: Json
          asset_thumbnail?: string | null
          booker_name?: string | null
          booker_phone?: string | null
          booking_deposit_confirm_failed_at?: string | null
          booking_deposit_confirm_failure_reason?: string | null
          booking_deposit_mixed_allocation_id?: string | null
          booking_deposit_paid_amount?: number
          booking_deposit_paid_at?: string | null
          booking_deposit_payment_attempt_id?: string | null
          booking_deposit_payment_status?: string
          booking_deposit_policy_version?: string
          booking_deposit_pos_attempt_id?: string | null
          booking_deposit_terms_accepted_at?: string | null
          booking_deposit_terms_version?: string | null
          cancellation_initiator?: string | null
          cancellation_reason?: string | null
          cancellation_refund_amount_due?: number | null
          cancellation_refund_cutoff_date?: string | null
          cancellation_refund_eligible?: boolean | null
          cancellation_source?: string | null
          cancellation_source_event_id?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          checkout_paid_amount?: number
          checkout_payment_method?: string | null
          checkout_total_amount?: number
          created_at?: string
          currency_code?: string
          daily_rate: number
          deposit_amount?: number
          deposit_notes?: string | null
          deposit_paid_amount?: number
          deposit_paid_at?: string | null
          deposit_payment_method?: string | null
          deposit_payment_status?: string
          deposit_refund_amount?: number
          deposit_refund_notes?: string | null
          deposit_refund_status?: string
          deposit_refunded_at?: string | null
          end_date: string
          hub_id?: string | null
          hub_name?: string | null
          id?: string
          kyc_profile_id?: string | null
          matched_product_id?: string | null
          matched_product_name?: string | null
          monthly_rate?: number
          no_show_at?: string | null
          no_show_marked_by_user_id?: string | null
          no_show_reason?: string | null
          no_show_source_event_id?: string | null
          pickup_at?: string | null
          pickup_branch_id?: string | null
          pos_branch_code?: string | null
          pos_branch_id?: string | null
          pos_branch_name?: string | null
          pos_staff_user_id?: string | null
          pricing_breakdown?: Json
          pricing_model?: Database["public"]["Enums"]["rental_pricing_model"]
          product_id?: string | null
          product_name: string
          rental_days: number
          rental_total: number
          return_branch_id?: string | null
          returned_at?: string | null
          sku_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["rental_booking_status"]
          thumbnail?: string | null
          updated_at?: string
          user_id?: string | null
          walk_in_phone?: string | null
          weekly_rate?: number
        }
        Update: {
          asset_code?: string | null
          asset_id?: string | null
          asset_name?: string | null
          asset_slug?: string | null
          asset_snapshot?: Json
          asset_thumbnail?: string | null
          booker_name?: string | null
          booker_phone?: string | null
          booking_deposit_confirm_failed_at?: string | null
          booking_deposit_confirm_failure_reason?: string | null
          booking_deposit_mixed_allocation_id?: string | null
          booking_deposit_paid_amount?: number
          booking_deposit_paid_at?: string | null
          booking_deposit_payment_attempt_id?: string | null
          booking_deposit_payment_status?: string
          booking_deposit_policy_version?: string
          booking_deposit_pos_attempt_id?: string | null
          booking_deposit_terms_accepted_at?: string | null
          booking_deposit_terms_version?: string | null
          cancellation_initiator?: string | null
          cancellation_reason?: string | null
          cancellation_refund_amount_due?: number | null
          cancellation_refund_cutoff_date?: string | null
          cancellation_refund_eligible?: boolean | null
          cancellation_source?: string | null
          cancellation_source_event_id?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          checkout_paid_amount?: number
          checkout_payment_method?: string | null
          checkout_total_amount?: number
          created_at?: string
          currency_code?: string
          daily_rate?: number
          deposit_amount?: number
          deposit_notes?: string | null
          deposit_paid_amount?: number
          deposit_paid_at?: string | null
          deposit_payment_method?: string | null
          deposit_payment_status?: string
          deposit_refund_amount?: number
          deposit_refund_notes?: string | null
          deposit_refund_status?: string
          deposit_refunded_at?: string | null
          end_date?: string
          hub_id?: string | null
          hub_name?: string | null
          id?: string
          kyc_profile_id?: string | null
          matched_product_id?: string | null
          matched_product_name?: string | null
          monthly_rate?: number
          no_show_at?: string | null
          no_show_marked_by_user_id?: string | null
          no_show_reason?: string | null
          no_show_source_event_id?: string | null
          pickup_at?: string | null
          pickup_branch_id?: string | null
          pos_branch_code?: string | null
          pos_branch_id?: string | null
          pos_branch_name?: string | null
          pos_staff_user_id?: string | null
          pricing_breakdown?: Json
          pricing_model?: Database["public"]["Enums"]["rental_pricing_model"]
          product_id?: string | null
          product_name?: string
          rental_days?: number
          rental_total?: number
          return_branch_id?: string | null
          returned_at?: string | null
          sku_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["rental_booking_status"]
          thumbnail?: string | null
          updated_at?: string
          user_id?: string | null
          walk_in_phone?: string | null
          weekly_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_bookings_booking_deposit_mixed_allocation_id_fkey"
            columns: ["booking_deposit_mixed_allocation_id"]
            isOneToOne: false
            referencedRelation: "mixed_payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_booking_deposit_payment_attempt_id_fkey"
            columns: ["booking_deposit_payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_booking_deposit_pos_attempt_id_fkey"
            columns: ["booking_deposit_pos_attempt_id"]
            isOneToOne: false
            referencedRelation: "pos_rental_payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_cancellation_source_event_id_fkey"
            columns: ["cancellation_source_event_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_cancellation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_cancelled_by_user_id_fkey"
            columns: ["cancelled_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_kyc_profile_id_fkey"
            columns: ["kyc_profile_id"]
            isOneToOne: false
            referencedRelation: "kyc_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_no_show_event_fk"
            columns: ["no_show_source_event_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_no_show_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_no_show_marked_by_user_id_fkey"
            columns: ["no_show_marked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_pickup_branch_id_fkey"
            columns: ["pickup_branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_pos_branch_id_fkey"
            columns: ["pos_branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_pos_staff_user_id_fkey"
            columns: ["pos_staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_product_id_sku_id_fkey"
            columns: ["product_id", "sku_id"]
            isOneToOne: false
            referencedRelation: "product_skus"
            referencedColumns: ["product_id", "id"]
          },
          {
            foreignKeyName: "rental_bookings_rental_access_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_return_branch_id_fkey"
            columns: ["return_branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_walk_in_phone_fkey"
            columns: ["walk_in_phone"]
            isOneToOne: false
            referencedRelation: "walk_in_customers"
            referencedColumns: ["phone"]
          },
        ]
      }
      rental_held_balance_events: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string
          currency_code: string
          event_type: string
          id: string
          idempotency_key: string | null
          metadata: Json
          occurred_at: string
          payment_method: string | null
          rental_booking_id: string
          source_id: string
          source_type: string
          staff_user_id: string | null
          status: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string
          currency_code?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          payment_method?: string | null
          rental_booking_id: string
          source_id: string
          source_type: string
          staff_user_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          currency_code?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          payment_method?: string | null
          rental_booking_id?: string
          source_id?: string
          source_type?: string
          staff_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_held_balance_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_held_balance_events_rental_booking_id_fkey"
            columns: ["rental_booking_id"]
            isOneToOne: false
            referencedRelation: "rental_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_held_balance_events_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_order_payment_slips: {
        Row: {
          created_at: string
          file_size_bytes: number
          id: string
          mime_type: string
          order_id: string
          original_filename: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_bucket: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_size_bytes: number
          id?: string
          mime_type: string
          order_id: string
          original_filename: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          order_id?: string
          original_filename?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_order_payment_slips_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_providers: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          google_maps_url: string | null
          is_verified: boolean
          kyc_documents: Json
          line_id: string | null
          line_url: string | null
          provider_id: string
          provider_type: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          google_maps_url?: string | null
          is_verified?: boolean
          kyc_documents?: Json
          line_id?: string | null
          line_url?: string | null
          provider_id: string
          provider_type: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          google_maps_url?: string | null
          is_verified?: boolean
          kyc_documents?: Json
          line_id?: string | null
          line_url?: string | null
          provider_id?: string
          provider_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      sku_branch_inventory: {
        Row: {
          available: number
          branch_code: string | null
          branch_id: string
          branch_name: string
          created_at: string
          id: string
          incoming: number
          inventory_id: string
          inventory_kind: Database["public"]["Enums"]["sku_inventory_kind"]
          notes: string | null
          on_hand: number
          product_id: string
          reserved: number
          safety_stock: number
          sku_id: string
          updated_at: string
        }
        Insert: {
          available?: number
          branch_code?: string | null
          branch_id: string
          branch_name: string
          created_at?: string
          id?: string
          incoming?: number
          inventory_id: string
          inventory_kind?: Database["public"]["Enums"]["sku_inventory_kind"]
          notes?: string | null
          on_hand?: number
          product_id: string
          reserved?: number
          safety_stock?: number
          sku_id: string
          updated_at?: string
        }
        Update: {
          available?: number
          branch_code?: string | null
          branch_id?: string
          branch_name?: string
          created_at?: string
          id?: string
          incoming?: number
          inventory_id?: string
          inventory_kind?: Database["public"]["Enums"]["sku_inventory_kind"]
          notes?: string | null
          on_hand?: number
          product_id?: string
          reserved?: number
          safety_stock?: number
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sku_branch_inventory_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_branch_inventory_new_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_branch_inventory_new_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "product_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      store_branches: {
        Row: {
          address_en: string
          address_th: string
          code: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          is_public: boolean
          latitude: number | null
          longitude: number | null
          name_en: string
          name_th: string
          notes: string
          phone: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          address_en?: string
          address_th?: string
          code: string
          created_at?: string
          email?: string
          id: string
          is_active?: boolean
          is_public?: boolean
          latitude?: number | null
          longitude?: number | null
          name_en: string
          name_th: string
          notes?: string
          phone?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address_en?: string
          address_th?: string
          code?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          latitude?: number | null
          longitude?: number | null
          name_en?: string
          name_th?: string
          notes?: string
          phone?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_configs: {
        Row: {
          created_at: string
          description: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_configs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_save_list: {
        Row: {
          asset_id: string | null
          created_at: string
          item_type: string
          service_id: string | null
          user_id: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          item_type: string
          service_id?: string | null
          user_id: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          item_type?: string
          service_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_save_list_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_save_list_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "content_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_save_list_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_saved_partners: {
        Row: {
          created_at: string
          partner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          partner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_saved_partners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_wishlist: {
        Row: {
          created_at: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_status: string
          anonymized_at: string | null
          avatar_url: string | null
          created_at: string
          deactivation_requested_at: string | null
          deleted_at: string | null
          deletion_reason: string | null
          deletion_requested_at: string | null
          first_name: string | null
          full_name: string | null
          id: string
          id_card_url: string | null
          kyc_rejection_reason: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          last_name: string | null
          lifecycle_note: string | null
          lifecycle_updated_at: string | null
          lifecycle_updated_by: string | null
          membership_level: Database["public"]["Enums"]["membership_level"]
          pdpa_consent_url: string | null
          pdpa_consented_at: string | null
          phone: string | null
          platform_role: Database["public"]["Enums"]["platform_role"]
          rental_booking_restriction_applied_at: string | null
          rental_booking_restriction_cancellation_count: number
          rental_booking_restriction_overridden_at: string | null
          rental_booking_restriction_overridden_by: string | null
          rental_booking_restriction_override_reason: string | null
          rental_booking_restriction_reason: string | null
          rental_booking_restriction_source_event_id: string | null
          rental_booking_restriction_status: string
          rental_booking_restriction_unrestricted_at: string | null
          rental_booking_restriction_unrestricted_by: string | null
          rental_booking_restriction_window_started_at: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          anonymized_at?: string | null
          avatar_url?: string | null
          created_at?: string
          deactivation_requested_at?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          id_card_url?: string | null
          kyc_rejection_reason?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          last_name?: string | null
          lifecycle_note?: string | null
          lifecycle_updated_at?: string | null
          lifecycle_updated_by?: string | null
          membership_level?: Database["public"]["Enums"]["membership_level"]
          pdpa_consent_url?: string | null
          pdpa_consented_at?: string | null
          phone?: string | null
          platform_role?: Database["public"]["Enums"]["platform_role"]
          rental_booking_restriction_applied_at?: string | null
          rental_booking_restriction_cancellation_count?: number
          rental_booking_restriction_overridden_at?: string | null
          rental_booking_restriction_overridden_by?: string | null
          rental_booking_restriction_override_reason?: string | null
          rental_booking_restriction_reason?: string | null
          rental_booking_restriction_source_event_id?: string | null
          rental_booking_restriction_status?: string
          rental_booking_restriction_unrestricted_at?: string | null
          rental_booking_restriction_unrestricted_by?: string | null
          rental_booking_restriction_window_started_at?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          anonymized_at?: string | null
          avatar_url?: string | null
          created_at?: string
          deactivation_requested_at?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          id_card_url?: string | null
          kyc_rejection_reason?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          last_name?: string | null
          lifecycle_note?: string | null
          lifecycle_updated_at?: string | null
          lifecycle_updated_by?: string | null
          membership_level?: Database["public"]["Enums"]["membership_level"]
          pdpa_consent_url?: string | null
          pdpa_consented_at?: string | null
          phone?: string | null
          platform_role?: Database["public"]["Enums"]["platform_role"]
          rental_booking_restriction_applied_at?: string | null
          rental_booking_restriction_cancellation_count?: number
          rental_booking_restriction_overridden_at?: string | null
          rental_booking_restriction_overridden_by?: string | null
          rental_booking_restriction_override_reason?: string | null
          rental_booking_restriction_reason?: string | null
          rental_booking_restriction_source_event_id?: string | null
          rental_booking_restriction_status?: string
          rental_booking_restriction_unrestricted_at?: string | null
          rental_booking_restriction_unrestricted_by?: string | null
          rental_booking_restriction_window_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_lifecycle_updated_by_fkey"
            columns: ["lifecycle_updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_rental_booking_restriction_overridden_by_fkey"
            columns: ["rental_booking_restriction_overridden_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_rental_booking_restriction_source_event_id_fkey"
            columns: ["rental_booking_restriction_source_event_id"]
            isOneToOne: false
            referencedRelation: "rental_booking_cancellation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_rental_booking_restriction_unrestricted_by_fkey"
            columns: ["rental_booking_restriction_unrestricted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      walk_in_customers: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          full_name: string | null
          id_card_storage_path: string | null
          id_card_url: string | null
          linked_user_id: string | null
          notes: string | null
          phone: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          full_name?: string | null
          id_card_storage_path?: string | null
          id_card_url?: string | null
          linked_user_id?: string | null
          notes?: string | null
          phone: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          full_name?: string | null
          id_card_storage_path?: string | null
          id_card_url?: string | null
          linked_user_id?: string | null
          notes?: string | null
          phone?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "walk_in_customers_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walk_in_customers_linked_user_id_fkey"
            columns: ["linked_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walk_in_customers_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assets_resync_filter_options_from_tags: {
        Args: { p_asset_id: string }
        Returns: undefined
      }
      assets_sync_filter_keys: {
        Args: { p_asset_id: string }
        Returns: undefined
      }
      autocomplete_assets: {
        Args: { p_include_hidden?: boolean; p_limit?: number; prefix: string }
        Returns: {
          brand: string
          category_keys: string[]
          code: string
          id: string
          main_category_key: string
          name_cn: string
          name_en: string
          name_jp: string
          name_th: string
          similarity_score: number
          slug: string
          status: Database["public"]["Enums"]["asset_status"]
          thumbnail_url: string
        }[]
      }
      autocomplete_products: {
        Args: { p_limit?: number; prefix: string }
        Returns: {
          category_keys: string[]
          id: string
          media_gallery: Json
          name_cn: string
          name_en: string
          name_jp: string
          name_th: string
          similarity_score: number
          slug: string
          type: Database["public"]["Enums"]["catalog_product_type"]
        }[]
      }
      chat_archive_inactive_conversations: { Args: never; Returns: number }
      chat_can_access_conversation: {
        Args: { target_conversation_id: string }
        Returns: boolean
      }
      chat_is_participant: {
        Args: { target_conversation_id: string }
        Returns: boolean
      }
      chat_is_platform_admin: { Args: never; Returns: boolean }
      chat_mark_deleted_message_attachments_for_cleanup: {
        Args: never
        Returns: number
      }
      f_apply_order_inventory: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      f_cancel_customer_rental_booking_refund_request: {
        Args: {
          p_booking_id: string
          p_cancellation_local_date: string
          p_cancellation_reason_code: string
          p_cancellation_reason_note: string
          p_cancelled_at: string
          p_currency_code: string
          p_gateway: Database["public"]["Enums"]["payment_gateway"]
          p_gateway_charge_id: string
          p_gateway_payment_reference: string
          p_original_mixed_payment_allocation_id: string
          p_original_payment_source_type: string
          p_original_rental_booking_payment_attempt_id: string
          p_pickup_local_date: string
          p_refund_amount: number
          p_refund_bank_account_name: string
          p_refund_bank_account_number: string
          p_refund_bank_name: string
          p_refund_contact_phone: string
          p_refund_customer_note: string
          p_refund_cutoff_date: string
          p_refund_policy_version: string
          p_refund_timezone: string
          p_restriction_window_started_at: string
          p_user_id: string
        }
        Returns: Json
      }
      f_cancel_pos_sale: { Args: { p_order_id: string }; Returns: Json }
      f_get_active_agreement_version: {
        Args: { p_agreement_type: string; p_as_of?: string }
        Returns: {
          agreement_type: string
          content_body: string
          content_format: string
          content_hash: string
          effective_from: string
          id: string
          rendered_text_hash: string
          title: string
          version: string
        }[]
      }
      f_next_document_number: {
        Args: {
          p_branch_id: string
          p_document_type: string
          p_period: string
          p_prefix: string
        }
        Returns: string
      }
      filter_resync_main_category: {
        Args: { p_main_category: string }
        Returns: undefined
      }
      is_company_admin: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      normalize_catalog_search_keyword_term: {
        Args: { raw_value: string }
        Returns: string
      }
      normalize_catalog_tag_term: {
        Args: { raw_value: string }
        Returns: string
      }
      products_resync_filter_options_from_tags: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      products_sync_filter_keys: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      revoke_kyc_profile: {
        Args: {
          p_decided_by_name: string
          p_decided_by_role: string
          p_decided_by_user_id: string
          p_ip_address?: unknown
          p_profile_id: string
          p_reason_code: string
          p_user_agent?: string
        }
        Returns: Json
      }
      search_products: {
        Args: {
          p_brands?: string[]
          p_categories?: string[]
          p_dynamic_filters?: Json
          p_in_stock?: boolean
          p_limit?: number
          p_max_price?: number
          p_min_price?: number
          p_offset?: number
          p_type?: string
          q?: string
        }
        Returns: {
          brand: string
          category_keys: string[]
          description_cn: string
          description_en: string
          description_jp: string
          description_th: string
          id: string
          max_price: number
          media_gallery: Json
          min_price: number
          name_cn: string
          name_en: string
          name_jp: string
          name_th: string
          rank: number
          slug: string
          spec: Json
          total_count: number
          total_rental: number
          total_stock: number
          trending_score: number
          type: Database["public"]["Enums"]["catalog_product_type"]
        }[]
      }
      sync_all_product_sku_inventory_summaries: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      sync_product_sku_inventory_summary: {
        Args: { p_sku_id: string }
        Returns: undefined
      }
      upsert_catalog_term: {
        Args: { raw_value: string; term_kind: string }
        Returns: undefined
      }
      verify_kyc_profile: {
        Args: {
          p_decided_by_name: string
          p_decided_by_role: string
          p_decided_by_user_id: string
          p_ip_address?: unknown
          p_profile_id: string
          p_reviewed_document_ids: string[]
          p_user_agent?: string
          p_vat_status?: Database["public"]["Enums"]["kyc_vat_status"]
          p_visual_review_confirmed: boolean
        }
        Returns: Json
      }
    }
    Enums: {
      asset_document_kind:
        | "manual"
        | "certificate"
        | "brochure"
        | "spec_sheet"
        | "service_attachment"
        | "internal_note"
        | "other"
      asset_document_visibility:
        | "public"
        | "customer_after_booking"
        | "internal"
      asset_status: "draft" | "active" | "archived"
      catalog_product_type: "sale" | "rental" | "hybrid"
      chat_attachment_kind: "image" | "document"
      chat_conversation_status: "open" | "closed" | "archived"
      chat_message_type: "text" | "attachment" | "system"
      chat_participant_role: "customer" | "staff" | "super_admin" | "system"
      chat_subject_type:
        | "general"
        | "product"
        | "asset"
        | "order"
        | "rental_booking"
      company_role: "b2b_admin" | "b2b_user"
      kyc_customer_type: "individual" | "company"
      kyc_document_type:
        | "id_card"
        | "signature"
        | "vat_certificate"
        | "company_cert"
        | "passport"
      kyc_identity_type: "national_id" | "passport" | "juristic_id"
      kyc_status: "pending" | "verified" | "rejected" | "expired" | "revoked"
      kyc_vat_status: "vat_registered" | "not_vat_registered"
      membership_level: "bronze" | "silver" | "gold"
      order_checkout_mode: "payment" | "quotation"
      order_fulfillment_status:
        | "not_applicable"
        | "unfulfilled"
        | "preparing"
        | "ready_for_carrier_pickup"
        | "shipped"
        | "delivered"
        | "returned"
        | "cancelled"
      order_payment_method:
        | "credit_card"
        | "promptpay"
        | "company_credit"
        | "cash"
        | "qr_transfer"
        | "bank_transfer"
        | "card"
        | "other"
      order_payment_status:
        | "not_applicable"
        | "pending_review"
        | "awaiting_payment"
        | "paid"
        | "deferred"
        | "cancelled"
        | "refunded"
      order_shipping_mode: "delivery" | "pickup"
      order_status: "submitted" | "confirmed" | "completed" | "cancelled"
      payment_attempt_method: "credit_card" | "promptpay"
      payment_attempt_status:
        | "created"
        | "pending"
        | "requires_action"
        | "paid"
        | "failed"
        | "expired"
        | "cancelled"
        | "refunded"
        | "finalizing"
        | "finalized"
        | "partial_finalized"
        | "finalization_failed"
      payment_event_status: "received" | "processed" | "ignored" | "failed"
      payment_gateway: "omise"
      platform_role: "customer" | "staff" | "super_admin"
      product_shipping_size: "free" | "s" | "m" | "l" | "xl"
      rental_asset_allocation_status:
        | "allocated"
        | "picked_up"
        | "returned"
        | "released"
        | "cancelled"
      rental_asset_event_type:
        | "created"
        | "status_changed"
        | "allocated"
        | "picked_up"
        | "returned"
        | "released"
        | "maintenance_started"
        | "maintenance_completed"
        | "hub_transferred"
        | "retired"
        | "note"
      rental_asset_status:
        | "available"
        | "reserved"
        | "out_on_rent"
        | "inspection"
        | "maintenance"
        | "retired"
        | "lost"
      rental_booking_document_type:
        | "repair"
        | "fine"
        | "damage_evidence"
        | "handover"
        | "other"
      rental_booking_handover_return_status:
        | "pending"
        | "returned_complete"
        | "returned_partial"
        | "missing"
        | "damaged"
      rental_booking_status:
        | "draft"
        | "confirmed"
        | "cancelled"
        | "picked_up"
        | "returned"
        | "no_show"
      rental_checklist_item_response_type: "check" | "text" | "number"
      rental_checklist_item_result:
        | "pending"
        | "passed"
        | "failed"
        | "not_applicable"
      rental_checklist_kind: "pickup" | "return" | "inspection" | "service"
      rental_checklist_status:
        | "draft"
        | "in_progress"
        | "completed"
        | "cancelled"
      rental_pricing_model: "daily"
      rental_service_cycle_unit: "day" | "week" | "month" | "year"
      rental_service_event_type:
        | "inspection"
        | "preventive_maintenance"
        | "repair"
        | "cleaning"
        | "calibration"
        | "other"
      sku_inventory_kind: "sale" | "rental" | "shared"
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
  public: {
    Enums: {
      asset_document_kind: [
        "manual",
        "certificate",
        "brochure",
        "spec_sheet",
        "service_attachment",
        "internal_note",
        "other",
      ],
      asset_document_visibility: [
        "public",
        "customer_after_booking",
        "internal",
      ],
      asset_status: ["draft", "active", "archived"],
      catalog_product_type: ["sale", "rental", "hybrid"],
      chat_attachment_kind: ["image", "document"],
      chat_conversation_status: ["open", "closed", "archived"],
      chat_message_type: ["text", "attachment", "system"],
      chat_participant_role: ["customer", "staff", "super_admin", "system"],
      chat_subject_type: [
        "general",
        "product",
        "asset",
        "order",
        "rental_booking",
      ],
      company_role: ["b2b_admin", "b2b_user"],
      kyc_customer_type: ["individual", "company"],
      kyc_document_type: [
        "id_card",
        "signature",
        "vat_certificate",
        "company_cert",
        "passport",
      ],
      kyc_identity_type: ["national_id", "passport", "juristic_id"],
      kyc_status: ["pending", "verified", "rejected", "expired", "revoked"],
      kyc_vat_status: ["vat_registered", "not_vat_registered"],
      membership_level: ["bronze", "silver", "gold"],
      order_checkout_mode: ["payment", "quotation"],
      order_fulfillment_status: [
        "not_applicable",
        "unfulfilled",
        "preparing",
        "ready_for_carrier_pickup",
        "shipped",
        "delivered",
        "returned",
        "cancelled",
      ],
      order_payment_method: [
        "credit_card",
        "promptpay",
        "company_credit",
        "cash",
        "qr_transfer",
        "bank_transfer",
        "card",
        "other",
      ],
      order_payment_status: [
        "not_applicable",
        "pending_review",
        "awaiting_payment",
        "paid",
        "deferred",
        "cancelled",
        "refunded",
      ],
      order_shipping_mode: ["delivery", "pickup"],
      order_status: ["submitted", "confirmed", "completed", "cancelled"],
      payment_attempt_method: ["credit_card", "promptpay"],
      payment_attempt_status: [
        "created",
        "pending",
        "requires_action",
        "paid",
        "failed",
        "expired",
        "cancelled",
        "refunded",
        "finalizing",
        "finalized",
        "partial_finalized",
        "finalization_failed",
      ],
      payment_event_status: ["received", "processed", "ignored", "failed"],
      payment_gateway: ["omise"],
      platform_role: ["customer", "staff", "super_admin"],
      product_shipping_size: ["free", "s", "m", "l", "xl"],
      rental_asset_allocation_status: [
        "allocated",
        "picked_up",
        "returned",
        "released",
        "cancelled",
      ],
      rental_asset_event_type: [
        "created",
        "status_changed",
        "allocated",
        "picked_up",
        "returned",
        "released",
        "maintenance_started",
        "maintenance_completed",
        "hub_transferred",
        "retired",
        "note",
      ],
      rental_asset_status: [
        "available",
        "reserved",
        "out_on_rent",
        "inspection",
        "maintenance",
        "retired",
        "lost",
      ],
      rental_booking_document_type: [
        "repair",
        "fine",
        "damage_evidence",
        "handover",
        "other",
      ],
      rental_booking_handover_return_status: [
        "pending",
        "returned_complete",
        "returned_partial",
        "missing",
        "damaged",
      ],
      rental_booking_status: [
        "draft",
        "confirmed",
        "cancelled",
        "picked_up",
        "returned",
        "no_show",
      ],
      rental_checklist_item_response_type: ["check", "text", "number"],
      rental_checklist_item_result: [
        "pending",
        "passed",
        "failed",
        "not_applicable",
      ],
      rental_checklist_kind: ["pickup", "return", "inspection", "service"],
      rental_checklist_status: [
        "draft",
        "in_progress",
        "completed",
        "cancelled",
      ],
      rental_pricing_model: ["daily"],
      rental_service_cycle_unit: ["day", "week", "month", "year"],
      rental_service_event_type: [
        "inspection",
        "preventive_maintenance",
        "repair",
        "cleaning",
        "calibration",
        "other",
      ],
      sku_inventory_kind: ["sale", "rental", "shared"],
    },
  },
} as const
