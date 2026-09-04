import { supabase } from "@/integrations/supabase/client";

export type LicenseStatus = "active" | "expired" | "canceled" | "refunded" | "revoked" | "pending";

export type Customer = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  document: string | null;
  external_id: string | null;
  created_at: string;
};

export type License = {
  id: string;
  license_key: string;
  key_hint: string;
  customer_id: string | null;
  plan: string;
  plan_name: string;
  status: LicenseStatus;
  is_lifetime: boolean;
  expires_at: string | null;
  activation_started_at: string | null;
  duration_minutes: number | null;
  device_limit: number;
  minimum_version: string | null;
  order_id: string | null;
  source: string;
  notes: string | null;
  last_validated_at: string | null;
  created_at: string;
  customers?: Customer | null;
  license_devices?: Array<{ first_seen_at: string | null }>;
};

export const STATUS_LABEL: Record<LicenseStatus, string> = {
  active: "Ativa",
  expired: "Expirada",
  canceled: "Cancelada",
  refunded: "Reembolsada",
  revoked: "Revogada",
  pending: "Pendente",
};

export function isExpired(license: License) {
  return (
    !license.is_lifetime && !!license.expires_at && Date.parse(license.expires_at) <= Date.now()
  );
}

export function effectiveStatus(license: License): LicenseStatus {
  if (license.status === "active" && isExpired(license)) return "expired";
  return license.status;
}

export function daysLeft(license: License) {
  if (license.is_lifetime || !license.expires_at) return null;
  return Math.ceil((Date.parse(license.expires_at) - Date.now()) / 86400000);
}

export function activationStartedAt(
  license: License,
  devices: Array<{ first_seen_at?: string | null }> = license.license_devices ?? [],
) {
  if (license.activation_started_at) return license.activation_started_at;
  const firstDeviceActivation = devices
    .map((device) => device.first_seen_at)
    .filter((value): value is string => !!value && !Number.isNaN(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return firstDeviceActivation ?? license.last_validated_at ?? null;
}

export function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export async function fetchLicenses() {
  const { data, error } = await supabase
    .from("licenses")
    .select("*, customers(*), license_devices(first_seen_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as License[];
}

export async function fetchCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Customer[];
}
