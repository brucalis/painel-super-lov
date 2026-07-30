// Núcleo do servidor de licenças. Só roda no servidor.
import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I, O, 0, 1

export function generateLicenseKey(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `LVA-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

export function keyHint(key: string): string {
  return `LVA-••••-••••-••••-${key.slice(-4)}`;
}

export function normalizeKey(raw: string): string {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith("LVA") ? clean.slice(3) : clean;
  const groups = body.slice(0, 16).match(/.{1,4}/g) || [];
  return ["LVA", ...groups].join("-");
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: sha256(token) };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmac(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

export type LicenseRow = {
  id: string;
  license_key: string;
  key_hint: string;
  plan: string;
  plan_name: string;
  status: string;
  is_lifetime: boolean;
  expires_at: string | null;
  device_limit: number;
  minimum_version: string | null;
  offline_grace_seconds: number;
  customer_id: string | null;
  access_role?: string | null;
};

/** Retorna a situação efetiva considerando a data de expiração. */
export function effectiveStatus(license: LicenseRow): string {
  if (license.status !== "active") return license.status;
  if (!license.is_lifetime && license.expires_at && Date.parse(license.expires_at) <= Date.now())
    return "expired";
  return "active";
}

export function versionLt(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

export async function logEvent(
  licenseId: string | null,
  type: string,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("license_events").insert({
    license_id: licenseId,
    type,
    message,
    metadata: metadata as never,
  });
}

export async function licenseResponse(license: LicenseRow, token: string | null) {
  const { count } = await supabaseAdmin
    .from("license_devices")
    .select("id", { count: "exact", head: true })
    .eq("license_id", license.id)
    .eq("active", true);

  return {
    status: effectiveStatus(license),
    license_token: token,
    plan: license.plan,
    plan_name: license.plan_name,
    expires_at: license.expires_at,
    is_lifetime: license.is_lifetime,
    device_count: count ?? 0,
    device_limit: license.device_limit,
    key_hint: license.key_hint,
    minimum_version: license.minimum_version,
    offline_grace_seconds: license.offline_grace_seconds,
    server_time: new Date().toISOString(),
  };
}

/** Envia a licença para todos os webhooks de saída inscritos no evento. */
export async function dispatchOutbound(event: string, licenseId: string) {
  const [{ data: hooks }, { data: license }] = await Promise.all([
    supabaseAdmin.from("outbound_webhooks").select("*").eq("active", true),
    supabaseAdmin
      .from("licenses")
      .select("*, customers(id, email, full_name, phone, document, external_id)")
      .eq("id", licenseId)
      .maybeSingle(),
  ]);
  if (!hooks?.length || !license) return;

  const targets = hooks.filter((h) => (h.events || []).includes(event));
  const payload = {
    event,
    sent_at: new Date().toISOString(),
    license: {
      id: license.id,
      license_key: license.license_key,
      key_hint: license.key_hint,
      plan: license.plan,
      plan_name: license.plan_name,
      status: license.status,
      is_lifetime: license.is_lifetime,
      expires_at: license.expires_at,
      device_limit: license.device_limit,
      order_id: license.order_id,
      source: license.source,
      created_at: license.created_at,
    },
    customer: license.customers ?? null,
  };
  const body = JSON.stringify(payload);

  await Promise.all(
    targets.map(async (hook) => {
      let statusCode: number | null = null;
      let ok = false;
      let error: string | null = null;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-superlovable-event": event,
            "x-superlovable-signature": `sha256=${hmac(hook.secret, body)}`,
          },
          body,
        });
        statusCode = res.status;
        ok = res.ok;
        if (!res.ok) error = (await res.text()).slice(0, 500);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await supabaseAdmin.from("outbound_webhook_deliveries").insert({
        webhook_id: hook.id,
        event,
        license_id: licenseId,
        status_code: statusCode,
        ok,
        error,
        payload: payload as never,
      });
    }),
  );
}

/** Cria uma licença nova, com cliente opcional. Usada pelo painel e pelo webhook de vendas. */
export async function createLicenseRecord(input: {
  plan?: string;
  plan_name?: string;
  is_lifetime?: boolean;
  duration_days?: number | null;
  expires_at?: string | null;
  device_limit?: number;
  order_id?: string | null;
  source?: string;
  notes?: string | null;
  minimum_version?: string | null;
  customer?: {
    email: string;
    full_name?: string | null;
    phone?: string | null;
    document?: string | null;
    external_id?: string | null;
  } | null;
}) {
  let customerId: string | null = null;
  if (input.customer?.email) {
    const email = input.customer.email.trim().toLowerCase();
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      customerId = existing.id;
      await supabaseAdmin
        .from("customers")
        .update({
          full_name: input.customer.full_name ?? undefined,
          phone: input.customer.phone ?? undefined,
          document: input.customer.document ?? undefined,
          external_id: input.customer.external_id ?? undefined,
        })
        .eq("id", existing.id);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("customers")
        .insert({
          email,
          full_name: input.customer.full_name ?? null,
          phone: input.customer.phone ?? null,
          document: input.customer.document ?? null,
          external_id: input.customer.external_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      customerId = created.id;
    }
  }

  const isLifetime = !!input.is_lifetime;
  let expiresAt: string | null = null;
  if (!isLifetime) {
    if (input.expires_at) expiresAt = new Date(input.expires_at).toISOString();
    else if (input.duration_days)
      expiresAt = new Date(Date.now() + input.duration_days * 86400000).toISOString();
  }

  const key = generateLicenseKey();
  const { data, error } = await supabaseAdmin
    .from("licenses")
    .insert({
      license_key: key,
      key_hint: keyHint(key),
      customer_id: customerId,
      plan: input.plan ?? "pro",
      plan_name: input.plan_name ?? "Plano Pro",
      status: "active",
      is_lifetime: isLifetime,
      expires_at: expiresAt,
      device_limit: input.device_limit ?? 1,
      minimum_version: input.minimum_version ?? null,
      order_id: input.order_id ?? null,
      source: input.source ?? "manual",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logEvent(data.id, "license.created", `Licença criada (${input.source ?? "manual"}).`);
  await dispatchOutbound("license.created", data.id);
  return data;
}

export async function getSetting(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}
