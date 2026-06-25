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
    PostgrestVersion: "14.5"
  }
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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          entity_id: number | null
          entity_id_uuid: string | null
          entity_type: string | null
          id: number
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          entity_id?: number | null
          entity_id_uuid?: string | null
          entity_type?: string | null
          id?: number
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          entity_id?: number | null
          entity_id_uuid?: string | null
          entity_type?: string | null
          id?: number
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      case_financials: {
        Row: {
          case_id: number
          estimate_amount: number | null
          id: number
          invoice_amount: number | null
          memo: string | null
          paid_amount: number | null
          paid_date: string | null
          tax_rate: number | null
          updated_at: string
        }
        Insert: {
          case_id: number
          estimate_amount?: number | null
          id?: number
          invoice_amount?: number | null
          memo?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          tax_rate?: number | null
          updated_at?: string
        }
        Update: {
          case_id?: number
          estimate_amount?: number | null
          id?: number
          invoice_amount?: number | null
          memo?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          tax_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_financials_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_number_counters: {
        Row: {
          case_type: string
          last_sequence: number
          updated_at: string
          year: number
        }
        Insert: {
          case_type: string
          last_sequence?: number
          updated_at?: string
          year: number
        }
        Update: {
          case_type?: string
          last_sequence?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      case_parcels: {
        Row: {
          area: number | null
          aza: string | null
          boundary: unknown
          case_id: number
          chiban: string | null
          chimoku: string | null
          city: string | null
          created_at: string
          geo_status: string
          geom: unknown
          id: number
          memo: string | null
          oaza: string | null
          pref: string | null
          sort_order: number
          tenyo_area: number | null
        }
        Insert: {
          area?: number | null
          aza?: string | null
          boundary?: unknown
          case_id: number
          chiban?: string | null
          chimoku?: string | null
          city?: string | null
          created_at?: string
          geo_status?: string
          geom?: unknown
          id?: number
          memo?: string | null
          oaza?: string | null
          pref?: string | null
          sort_order?: number
          tenyo_area?: number | null
        }
        Update: {
          area?: number | null
          aza?: string | null
          boundary?: unknown
          case_id?: number
          chiban?: string | null
          chimoku?: string | null
          city?: string | null
          created_at?: string
          geo_status?: string
          geom?: unknown
          id?: number
          memo?: string | null
          oaza?: string | null
          pref?: string | null
          sort_order?: number
          tenyo_area?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "case_parcels_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_persons: {
        Row: {
          case_id: number
          created_at: string
          id: number
          memo: string | null
          person_id: number | null
          role: string
          snapshot_address_city: string | null
          snapshot_address_line1: string | null
          snapshot_address_line2: string | null
          snapshot_address_pref: string | null
          snapshot_address_town: string | null
          snapshot_at: string | null
          snapshot_corporate_number: string | null
          snapshot_email: string | null
          snapshot_fax: string | null
          snapshot_name: string | null
          snapshot_name_kana: string | null
          snapshot_phone: string | null
          snapshot_representative_name: string | null
          snapshot_zip: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          case_id: number
          created_at?: string
          id?: number
          memo?: string | null
          person_id?: number | null
          role: string
          snapshot_address_city?: string | null
          snapshot_address_line1?: string | null
          snapshot_address_line2?: string | null
          snapshot_address_pref?: string | null
          snapshot_address_town?: string | null
          snapshot_at?: string | null
          snapshot_corporate_number?: string | null
          snapshot_email?: string | null
          snapshot_fax?: string | null
          snapshot_name?: string | null
          snapshot_name_kana?: string | null
          snapshot_phone?: string | null
          snapshot_representative_name?: string | null
          snapshot_zip?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          case_id?: number
          created_at?: string
          id?: number
          memo?: string | null
          person_id?: number | null
          role?: string
          snapshot_address_city?: string | null
          snapshot_address_line1?: string | null
          snapshot_address_line2?: string | null
          snapshot_address_pref?: string | null
          snapshot_address_town?: string | null
          snapshot_at?: string | null
          snapshot_corporate_number?: string | null
          snapshot_email?: string | null
          snapshot_fax?: string | null
          snapshot_name?: string | null
          snapshot_name_kana?: string | null
          snapshot_phone?: string | null
          snapshot_representative_name?: string | null
          snapshot_zip?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_persons_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_persons_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assigned_user_id: string | null
          case_name: string
          case_number: string
          case_type: string
          created_at: string
          deadline_date: string | null
          id: number
          latitude: number | null
          longitude: number | null
          memo: string | null
          status: string
          submission_date: string | null
          submission_target: string | null
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          case_name: string
          case_number: string
          case_type: string
          created_at?: string
          deadline_date?: string | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          memo?: string | null
          status?: string
          submission_date?: string | null
          submission_target?: string | null
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          case_name?: string
          case_number?: string
          case_type?: string
          created_at?: string
          deadline_date?: string | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          memo?: string | null
          status?: string
          submission_date?: string | null
          submission_target?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          target_id: string
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          body: string
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          lark_notified_at: string | null
          report_date: string
          status: string
          submitted_at: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          body: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lark_notified_at?: string | null
          report_date: string
          status?: string
          submitted_at?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          body?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lark_notified_at?: string | null
          report_date?: string
          status?: string
          submitted_at?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_histories: {
        Row: {
          case_id: number
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          generated_by_user_id: string | null
          highlight_enabled: boolean | null
          id: number
          template_id: number
          transferred_data: Json | null
          version: number
        }
        Insert: {
          case_id: number
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          generated_by_user_id?: string | null
          highlight_enabled?: boolean | null
          id?: number
          template_id: number
          transferred_data?: Json | null
          version?: number
        }
        Update: {
          case_id?: number
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          generated_by_user_id?: string | null
          highlight_enabled?: boolean | null
          id?: number
          template_id?: number
          transferred_data?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_histories_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_histories_generated_by_user_id_fkey"
            columns: ["generated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_histories_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_coordinate_points: {
        Row: {
          created_at: string
          id: number
          imported_by_user_id: string | null
          latitude: number
          longitude: number
          memo: string | null
          point_name: string | null
          source_file_name: string
        }
        Insert: {
          created_at?: string
          id?: number
          imported_by_user_id?: string | null
          latitude: number
          longitude: number
          memo?: string | null
          point_name?: string | null
          source_file_name: string
        }
        Update: {
          created_at?: string
          id?: number
          imported_by_user_id?: string | null
          latitude?: number
          longitude?: number
          memo?: string | null
          point_name?: string | null
          source_file_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_coordinate_points_imported_by_user_id_fkey"
            columns: ["imported_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      location_areas: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: number
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: number
          name?: string
        }
        Relationships: []
      }
      location_municipalities: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: number
          name: string
          prefecture_id: number
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: number
          name: string
          prefecture_id: number
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: number
          name?: string
          prefecture_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "location_municipalities_prefecture_id_fkey"
            columns: ["prefecture_id"]
            isOneToOne: false
            referencedRelation: "location_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      location_prefectures: {
        Row: {
          area_id: number
          code: string
          created_at: string
          display_order: number
          id: number
          name: string
        }
        Insert: {
          area_id: number
          code: string
          created_at?: string
          display_order?: number
          id?: number
          name: string
        }
        Update: {
          area_id?: number
          code?: string
          created_at?: string
          display_order?: number
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_prefectures_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "location_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          address_city: string | null
          address_line1: string | null
          address_line2: string | null
          address_pref: string | null
          address_town: string | null
          corporate_number: string | null
          created_at: string
          default_case_role: string | null
          email: string | null
          fax: string | null
          id: number
          memo: string | null
          name: string
          name_kana: string | null
          name_normalized: string | null
          person_type: string
          phone: string | null
          representative_name: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_pref?: string | null
          address_town?: string | null
          corporate_number?: string | null
          created_at?: string
          default_case_role?: string | null
          email?: string | null
          fax?: string | null
          id?: number
          memo?: string | null
          name: string
          name_kana?: string | null
          name_normalized?: string | null
          person_type?: string
          phone?: string | null
          representative_name?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_pref?: string | null
          address_town?: string | null
          corporate_number?: string | null
          created_at?: string
          default_case_role?: string | null
          email?: string | null
          fax?: string | null
          id?: number
          memo?: string | null
          name?: string
          name_kana?: string | null
          name_normalized?: string | null
          person_type?: string
          phone?: string | null
          representative_name?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      schedule_types: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          actual_end_at: string | null
          actual_minutes: number | null
          actual_start_at: string | null
          case_id: number | null
          case_number: string | null
          co_user_ids: string[]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          end_at: string
          id: string
          is_all_day: boolean
          lark_calendar_id: string | null
          lark_event_etag: string | null
          lark_event_id: string | null
          last_synced_at: string | null
          location: string | null
          memo: string | null
          schedule_type_id: string | null
          start_at: string
          status: string
          sync_error: string | null
          sync_source: string
          sync_status: string
          title: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          work_category_id: string | null
        }
        Insert: {
          actual_end_at?: string | null
          actual_minutes?: number | null
          actual_start_at?: string | null
          case_id?: number | null
          case_number?: string | null
          co_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_at: string
          id?: string
          is_all_day?: boolean
          lark_calendar_id?: string | null
          lark_event_etag?: string | null
          lark_event_id?: string | null
          last_synced_at?: string | null
          location?: string | null
          memo?: string | null
          schedule_type_id?: string | null
          start_at: string
          status?: string
          sync_error?: string | null
          sync_source?: string
          sync_status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          work_category_id?: string | null
        }
        Update: {
          actual_end_at?: string | null
          actual_minutes?: number | null
          actual_start_at?: string | null
          case_id?: number | null
          case_number?: string | null
          co_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_at?: string
          id?: string
          is_all_day?: boolean
          lark_calendar_id?: string | null
          lark_event_etag?: string | null
          lark_event_id?: string | null
          last_synced_at?: string | null
          location?: string | null
          memo?: string | null
          schedule_type_id?: string | null
          start_at?: string
          status?: string
          sync_error?: string | null
          sync_source?: string
          sync_status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          work_category_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_schedule_type_id_fkey"
            columns: ["schedule_type_id"]
            isOneToOne: false
            referencedRelation: "schedule_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      template_categories: {
        Row: {
          created_at: string
          description: string | null
          id: number
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      template_mappings: {
        Row: {
          created_at: string
          field_path: string
          id: number
          is_required: boolean | null
          label: string | null
          placeholder: string
          sort_order: number | null
          template_id: number
        }
        Insert: {
          created_at?: string
          field_path: string
          id?: number
          is_required?: boolean | null
          label?: string | null
          placeholder: string
          sort_order?: number | null
          template_id: number
        }
        Update: {
          created_at?: string
          field_path?: string
          id?: number
          is_required?: boolean | null
          label?: string | null
          placeholder?: string
          sort_order?: number | null
          template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          applicable_case_types: Json | null
          category_id: number
          created_at: string
          description: string | null
          file_path: string
          file_type: string
          id: number
          is_active: boolean
          municipality_id: number | null
          name: string
          original_file_name: string | null
          updated_at: string
          uploaded_by_user_id: string | null
          version: number
        }
        Insert: {
          applicable_case_types?: Json | null
          category_id: number
          created_at?: string
          description?: string | null
          file_path: string
          file_type: string
          id?: number
          is_active?: boolean
          municipality_id?: number | null
          name: string
          original_file_name?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
          version?: number
        }
        Update: {
          applicable_case_types?: Json | null
          category_id?: number
          created_at?: string
          description?: string | null
          file_path?: string
          file_type?: string
          id?: number
          is_active?: boolean
          municipality_id?: number | null
          name?: string
          original_file_name?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "template_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "location_municipalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_signed_in: string | null
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          last_signed_in?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_signed_in?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_case_coordinates: { Args: { p_case_id: number }; Returns: number }
      clear_case_parcel_geo: { Args: { p_parcel_id: number }; Returns: number }
      create_case_with_number:
        | {
            Args: {
              p_assigned_user_id?: string
              p_case_name: string
              p_case_type: string
              p_deadline_date?: string
              p_memo?: string
              p_submission_date?: string
              p_submission_target?: string
            }
            Returns: {
              case_number: string
              id: number
            }[]
          }
        | {
            Args: {
              p_assigned_user_id: string
              p_case_name: string
              p_case_type: string
              p_deadline_date: string
              p_latitude: number
              p_longitude: number
              p_memo: string
              p_submission_date: string
              p_submission_target: string
            }
            Returns: {
              case_number: string
              id: number
            }[]
          }
      current_user_role: { Args: never; Returns: string }
      dashboard_employee_daily_sales: {
        Args: { p_month?: string }
        Returns: {
          assigned_user_id: string
          case_count: number
          employee_name: string
          invoice_amount: number
          paid_amount: number
          sale_date: string
        }[]
      }
      dashboard_monthly_stats: {
        Args: never
        Returns: {
          completed_cases: number
          invoice_amount: number
          new_cases: number
          paid_amount: number
          year_month: string
        }[]
      }
      dashboard_overdue_cases: {
        Args: { p_limit?: number }
        Returns: {
          assigned_user: string
          case_name: string
          case_number: string
          days_remaining: number
          deadline_date: string
          id: number
          status: string
        }[]
      }
      dashboard_summary: { Args: never; Returns: Json }
      dashboard_unpaid_cases: {
        Args: { p_limit?: number }
        Returns: {
          case_id: number
          case_name: string
          case_number: string
          invoice_amount: number
          tax_rate: number
          updated_at: string
        }[]
      }
      find_person_duplicates: {
        Args: { p_query: string; p_threshold?: number }
        Returns: {
          address_city: string
          address_pref: string
          id: number
          name: string
          name_kana: string
          similarity: number
        }[]
      }
      get_all_cases_for_map: { Args: never; Returns: Json }
      get_all_parcels_for_map: { Args: never; Returns: Json }
      get_case_map: { Args: { p_case_id: number }; Returns: Json }
      get_case_parcels_for_map: { Args: { p_case_id: number }; Returns: Json }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      list_cases_safe: {
        Args: {
          p_assigned_user_id?: string
          p_case_type?: string
          p_deadline_from?: string
          p_deadline_to?: string
          p_limit?: number
          p_offset?: number
          p_order?: string
          p_overdue_only?: boolean
          p_q?: string
          p_sort?: string
          p_status?: string
        }
        Returns: {
          assigned_user_id: string
          case_name: string
          case_number: string
          case_type: string
          created_at: string
          deadline_date: string
          id: number
          memo: string
          status: string
          submission_date: string
          submission_target: string
          total_count: number
          updated_at: string
        }[]
      }
      list_persons_safe: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_order?: string
          p_person_type?: string
          p_q?: string
          p_sort?: string
        }
        Returns: {
          address_city: string
          address_line1: string
          address_line2: string
          address_pref: string
          address_town: string
          corporate_number: string
          created_at: string
          default_case_role: string
          email: string
          fax: string
          id: number
          memo: string
          name: string
          name_kana: string
          person_type: string
          phone: string
          representative_name: string
          total_count: number
          updated_at: string
          zip: string
        }[]
      }
      next_case_number: { Args: { p_case_type: string }; Returns: string }
      replace_case_parcels: {
        Args: { p_case_id: number; p_rows: Json }
        Returns: number
      }
      replace_template_mappings: {
        Args: { p_rows: Json; p_template_id: number }
        Returns: number
      }
      set_case_coordinates: {
        Args: { p_case_id: number; p_lat: number; p_lng: number }
        Returns: number
      }
      set_case_parcel_pin: {
        Args: { p_lat: number; p_lng: number; p_parcel_id: number }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
