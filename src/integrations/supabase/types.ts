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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          document: string | null
          email: string
          external_id: string | null
          full_name: string | null
          id: string
          metadata: Json
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email: string
          external_id?: string | null
          full_name?: string | null
          id?: string
          metadata?: Json
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string
          external_id?: string | null
          full_name?: string | null
          id?: string
          metadata?: Json
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      license_devices: {
        Row: {
          active: boolean
          device_id: string
          device_name: string | null
          extension_version: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          license_id: string
          token_hash: string
        }
        Insert: {
          active?: boolean
          device_id: string
          device_name?: string | null
          extension_version?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          license_id: string
          token_hash: string
        }
        Update: {
          active?: boolean
          device_id?: string
          device_name?: string | null
          extension_version?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          license_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_devices_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      license_events: {
        Row: {
          created_at: string
          id: string
          license_id: string | null
          message: string | null
          metadata: Json
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          license_id?: string | null
          message?: string | null
          metadata?: Json
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          license_id?: string | null
          message?: string | null
          metadata?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_events_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      license_product_mappings: {
        Row: {
          created_at: string
          device_limit: number
          duration_days: number | null
          ensinaflix_offer_id: string | null
          ensinaflix_offer_public_id: string | null
          ensinaflix_product_id: string | null
          id: string
          is_active: boolean
          is_lifetime: boolean
          plan_code: string
          plan_name: string
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_limit?: number
          duration_days?: number | null
          ensinaflix_offer_id?: string | null
          ensinaflix_offer_public_id?: string | null
          ensinaflix_product_id?: string | null
          id?: string
          is_active?: boolean
          is_lifetime?: boolean
          plan_code: string
          plan_name: string
          provider?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_limit?: number
          duration_days?: number | null
          ensinaflix_offer_id?: string | null
          ensinaflix_offer_public_id?: string | null
          ensinaflix_product_id?: string | null
          id?: string
          is_active?: boolean
          is_lifetime?: boolean
          plan_code?: string
          plan_name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          created_at: string
          customer_id: string | null
          device_limit: number
          expires_at: string | null
          id: string
          is_lifetime: boolean
          key_hint: string
          last_validated_at: string | null
          license_key: string
          minimum_version: string | null
          notes: string | null
          offline_grace_seconds: number
          order_id: string | null
          plan: string
          plan_name: string
          source: string
          status: Database["public"]["Enums"]["license_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          device_limit?: number
          expires_at?: string | null
          id?: string
          is_lifetime?: boolean
          key_hint: string
          last_validated_at?: string | null
          license_key: string
          minimum_version?: string | null
          notes?: string | null
          offline_grace_seconds?: number
          order_id?: string | null
          plan?: string
          plan_name?: string
          source?: string
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          device_limit?: number
          expires_at?: string | null
          id?: string
          is_lifetime?: boolean
          key_hint?: string
          last_validated_at?: string | null
          license_key?: string
          minimum_version?: string | null
          notes?: string | null
          offline_grace_seconds?: number
          order_id?: string | null
          plan?: string
          plan_name?: string
          source?: string
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_webhook_deliveries: {
        Row: {
          created_at: string
          error: string | null
          event: string
          id: string
          license_id: string | null
          ok: boolean
          payload: Json
          status_code: number | null
          webhook_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event: string
          id?: string
          license_id?: string | null
          ok?: boolean
          payload?: Json
          status_code?: number | null
          webhook_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          license_id?: string | null
          ok?: boolean
          payload?: Json
          status_code?: number | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhook_deliveries_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_webhooks: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          name: string
          secret: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          name: string
          secret: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          name?: string
          secret?: string
          url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sales_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string | null
          external_id: string | null
          id: string
          license_id: string | null
          payload: Json
          processed: boolean
          provider: string
          signature_valid: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          license_id?: string | null
          payload?: Json
          processed?: boolean
          provider?: string
          signature_valid?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          license_id?: string | null
          payload?: Json
          processed?: boolean
          provider?: string
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sales_webhook_events_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          customer_email: string | null
          duration_ms: number | null
          environment: string
          event_key: string
          event_label: string | null
          event_type: string | null
          http_status: number | null
          id: string
          is_test: boolean
          license_id: string | null
          order_id: string | null
          payload: Json | null
          processed_at: string | null
          processing_error: string | null
          processing_status: string
          provider: string
          received_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          duration_ms?: number | null
          environment?: string
          event_key: string
          event_label?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          is_test?: boolean
          license_id?: string | null
          order_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          provider?: string
          received_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          duration_ms?: number | null
          environment?: string
          event_key?: string
          event_label?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          is_test?: boolean
          license_id?: string | null
          order_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          provider?: string
          received_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      license_status:
        | "active"
        | "expired"
        | "canceled"
        | "refunded"
        | "revoked"
        | "pending"
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
      app_role: ["admin", "user"],
      license_status: [
        "active",
        "expired",
        "canceled",
        "refunded",
        "revoked",
        "pending",
      ],
    },
  },
} as const
