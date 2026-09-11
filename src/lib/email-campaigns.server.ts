import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSetting, logEvent } from "@/lib/license.server";

// As tabelas são adicionadas pela migration deste módulo e ainda não fazem parte do arquivo de tipos gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as unknown as { from: (table: string) => any };
const ACCESS_URL = "https://painel-super-lov.lovable.app/";
const ACTIVE_REMINDER_HOURS = [3, 6, 12, 24] as const;

type AudienceStatus =
  | "all"
  | "awaiting_activation"
  | "activated"
  | "active"
  | "expired"
  | "pending"
  | "canceled"
  | "refunded"
  | "revoked";
type CampaignInput = {
  name: string;
  subject: string;
  body: string;
  audienceStatus: AudienceStatus;
  audiencePlan?: string | null;
};
type AutomationStep = { hours: number; subject: string; body: string };
type AutomationSettings = { enabled: boolean; steps: AutomationStep[] };
type LicenseWithCustomer = {
  id: string;
  license_key?: string;
  plan?: string;
  plan_name?: string;
  order_id?: string | null;
  status?: string;
  is_lifetime?: boolean;
  expires_at?: string | null;
  activation_started_at?: string | null;
  last_validated_at?: string | null;
  created_at: string;
  license_devices?: Array<{ first_seen_at?: string | null }>;
  customers?: { id?: string; email?: string; full_name?: string | null } | null;
};
type DeliveryStatus = { status: string };
type QueueDelivery = {
  id: string;
  campaign_id?: string | null;
  license_id?: string | null;
  purpose: string;
  subject: string;
  body: string;
  step_key?: string | null;
  attempts?: number;
};

const defaultAutomation: AutomationSettings = {
  enabled: false,
  steps: ACTIVE_REMINDER_HOURS.map((hours) => ({
    hours,
    subject:
      hours === 24
        ? "Último lembrete sobre seu acesso à Superlovable"
        : "Seu acesso à Superlovable está disponível",
    body: `Olá, {{nome}}! Sua licença {{licenca}} ainda aguarda ativação. Acesse {{link_acesso}} para começar.${hours === 24 ? " Se precisar de ajuda, responda a este e-mail." : ""}`,
  })),
};

function safeJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const stored = safeJson<AutomationSettings>(
    await getSetting("email_activation_automation"),
    defaultAutomation,
  );
  const byHour = new Map((stored.steps || []).map((step) => [Number(step.hours), step]));
  return {
    enabled: Boolean(stored.enabled),
    steps: ACTIVE_REMINDER_HOURS.map(
      (hours) => byHour.get(hours) || defaultAutomation.steps.find((step) => step.hours === hours)!,
    ),
  };
}

export async function saveAutomationSettings(settings: AutomationSettings) {
  const normalized = {
    enabled: Boolean(settings.enabled),
    steps: ACTIVE_REMINDER_HOURS.map((hours) => {
      const step = settings.steps.find((item) => Number(item.hours) === hours);
      if (!step?.subject.trim() || !step?.body.trim())
        throw new Error(`Preencha o assunto e a mensagem do lembrete de ${hours}h.`);
      return {
        hours,
        subject: step.subject.trim().slice(0, 180),
        body: step.body.trim().slice(0, 12_000),
      };
    }),
  };
  const { error } = await db()
    .from("app_settings")
    .upsert(
      {
        key: "email_activation_automation",
        value: JSON.stringify(normalized),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);
  return normalized;
}

function render(template: string, license: LicenseWithCustomer) {
  const customer = license.customers || {};
  const values: Record<string, string> = {
    nome: String(customer.full_name || "Cliente"),
    email: String(customer.email || ""),
    licenca: String(license.license_key || ""),
    plano: String(license.plan_name || license.plan || "Superlovable"),
    pedido: String(license.order_id || "Não informado"),
    link_acesso: ACCESS_URL,
    link_download: ACCESS_URL,
  };
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => values[key] ?? "");
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char,
  );

function marketingSecret() {
  return (
    process.env.EMAIL_CAMPAIGN_SECRET ||
    process.env.LICENSE_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function unsubscribeToken(email: string) {
  const normalized = email.trim().toLowerCase();
  const encoded = Buffer.from(normalized).toString("base64url");
  const signature = createHmac("sha256", marketingSecret())
    .update(`unsubscribe:${normalized}`)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export async function unsubscribeByToken(token: string) {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied || !marketingSecret()) return false;
  let email = "";
  try {
    email = Buffer.from(encoded, "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    return false;
  }
  if (!email.includes("@")) return false;
  const expected = createHmac("sha256", marketingSecret())
    .update(`unsubscribe:${email}`)
    .digest("base64url");
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  const { error } = await db()
    .from("email_suppressions")
    .upsert(
      { email, reason: "unsubscribe", created_at: new Date().toISOString() },
      { onConflict: "email" },
    );
  return !error;
}

async function sendCustomEmail(
  license: LicenseWithCustomer,
  subjectTemplate: string,
  bodyTemplate: string,
  purpose: string,
) {
  const [enabled, storedKey, fromEmail, fromName, replyTo] = await Promise.all([
    getSetting("sendgrid_enabled"),
    getSetting("sendgrid_api_key"),
    getSetting("sendgrid_from_email"),
    getSetting("sendgrid_from_name"),
    getSetting("sendgrid_reply_to"),
  ]);
  if (enabled !== "true") return { sent: false, reason: "disabled" };
  const apiKey = process.env.SENDGRID_API_KEY || storedKey || "";
  const email = String(license.customers?.email || "").trim();
  if (!email) return { sent: false, reason: "customer_email_missing" };
  if (!apiKey || !fromEmail) return { sent: false, reason: "sendgrid_not_configured" };
  const subject = render(subjectTemplate, license).slice(0, 180);
  const text = render(bodyTemplate, license);
  const unsubscribeUrl =
    purpose === "campaign"
      ? `${ACCESS_URL}api/public/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email))}`
      : "";
  const unsubscribeFooter = unsubscribeUrl
    ? `<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#777">Não quero receber futuras ofertas</a>`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f4fa;font-family:Arial,sans-serif;color:#24202b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#fff;border:1px solid #e6def2;border-radius:16px;overflow:hidden"><tr><td style="height:6px;background:linear-gradient(90deg,#6f2dbd,#f97316)"></td></tr><tr><td style="padding:30px"><div style="font-weight:800;color:#6f2dbd;font-size:13px;letter-spacing:.8px">SUPERLOVABLE</div><h1 style="font-size:24px;line-height:1.3;margin:12px 0 20px">${escapeHtml(subject)}</h1><div style="font-size:15px;line-height:1.7;white-space:pre-wrap">${escapeHtml(text)}</div><a href="${ACCESS_URL}" style="display:inline-block;margin-top:24px;padding:13px 20px;border-radius:9px;background:#6f2dbd;color:#fff;text-decoration:none;font-weight:700">Acessar a Superlovable</a></td></tr><tr><td style="padding:16px 30px;background:#fafafa;color:#777;font-size:12px">Você recebeu esta mensagem por possuir um acesso à Superlovable.${unsubscribeFooter}</td></tr></table></td></tr></table></body></html>`;
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email, name: license.customers?.full_name || "Cliente" }],
            subject,
            custom_args: { message_type: purpose, license_id: String(license.id) },
          },
        ],
        from: { email: fromEmail, name: fromName || "Superlovable" },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        content: [
          {
            type: "text/plain",
            value: `${text}${unsubscribeUrl ? `\n\nNão quero receber futuras ofertas: ${unsubscribeUrl}` : ""}`,
          },
          { type: "text/html", value: html },
        ],
        categories: [purpose === "activation_reminder" ? "activation-reminder" : "campaign"],
      }),
    });
    if (!response.ok)
      return {
        sent: false,
        reason: `sendgrid_${response.status}`,
        detail: (await response.text()).slice(0, 300),
      };
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: "sendgrid_unavailable",
      detail: error instanceof Error ? error.message : "network_error",
    };
  }
}

function matchesAudience(
  license: LicenseWithCustomer,
  status: AudienceStatus,
  plan?: string | null,
) {
  if (plan && plan !== "all" && license.plan !== plan) return false;
  const activated = Boolean(
    license.activation_started_at ||
    license.last_validated_at ||
    license.license_devices?.some((device) => device.first_seen_at),
  );
  const expired =
    license.status === "expired" ||
    (license.status === "active" &&
      !license.is_lifetime &&
      license.expires_at &&
      Date.parse(license.expires_at) <= Date.now());
  if (status === "all") return true;
  if (status === "awaiting_activation") return license.status === "active" && !activated;
  if (status === "activated") return license.status === "active" && activated && !expired;
  if (status === "active") return license.status === "active" && !expired;
  if (status === "expired") return expired;
  return license.status === status;
}

async function audience(status: AudienceStatus, plan?: string | null, excludeSuppressed = false) {
  const { data, error } = await db()
    .from("licenses")
    .select("*, customers(id,email,full_name), license_devices(first_seen_at)")
    .not("customer_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const suppressions = excludeSuppressed
    ? await db().from("email_suppressions").select("email")
    : { data: [] };
  const suppressed = new Set(
    ((suppressions.data || []) as Array<{ email?: string }>).map((row) =>
      String(row.email || "").toLowerCase(),
    ),
  );
  const unique = new Map<string, LicenseWithCustomer>();
  for (const license of (data || []) as LicenseWithCustomer[]) {
    const email = String(license.customers?.email || "")
      .trim()
      .toLowerCase();
    if (
      email &&
      !suppressed.has(email) &&
      matchesAudience(license, status, plan) &&
      !unique.has(email)
    )
      unique.set(email, license);
  }
  return [...unique.values()];
}

export async function createCampaign(input: CampaignInput) {
  const recipients = await audience(input.audienceStatus, input.audiencePlan, true);
  if (!recipients.length) throw new Error("Nenhum cliente corresponde aos filtros selecionados.");
  const { data: campaign, error } = await db()
    .from("email_campaigns")
    .insert({
      name: input.name,
      subject: input.subject,
      body: input.body,
      audience_status: input.audienceStatus,
      audience_plan: input.audiencePlan === "all" ? null : input.audiencePlan || null,
      status: "queued",
      recipients_total: recipients.length,
    })
    .select("*")
    .single();
  if (error || !campaign) throw new Error(error?.message || "Não foi possível criar a campanha.");
  const deliveries = recipients.map((license) => ({
    campaign_id: campaign.id,
    license_id: license.id,
    customer_id: license.customers?.id || null,
    recipient_email: license.customers?.email,
    recipient_name: license.customers?.full_name || null,
    purpose: "campaign",
    dedupe_key: `campaign:${campaign.id}:${license.customers?.email?.toLowerCase()}`,
    subject: input.subject,
    body: input.body,
    status: "queued",
    scheduled_for: new Date().toISOString(),
  }));
  const { error: deliveryError } = await db().from("email_campaign_deliveries").insert(deliveries);
  if (deliveryError) {
    await db().from("email_campaigns").update({ status: "failed" }).eq("id", campaign.id);
    throw new Error(deliveryError.message);
  }
  return { campaign, recipients: recipients.length };
}

export async function queuePersonalizedEmail(licenseId: string, subject: string, body: string) {
  const { data: license, error } = await db()
    .from("licenses")
    .select("*, customers(id,email,full_name)")
    .eq("id", licenseId)
    .maybeSingle();
  if (error || !license?.customers?.email)
    throw new Error("Licença ou e-mail do cliente não encontrado.");
  const dedupe = `individual:${licenseId}:${Date.now()}:${randomUUID()}`;
  const { data: delivery, error: insertError } = await db()
    .from("email_campaign_deliveries")
    .insert({
      license_id: licenseId,
      customer_id: license.customers.id,
      recipient_email: license.customers.email,
      recipient_name: license.customers.full_name || null,
      purpose: "individual",
      dedupe_key: dedupe,
      subject,
      body,
      status: "queued",
      scheduled_for: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !delivery)
    throw new Error(insertError?.message || "Não foi possível registrar o envio.");
  const result = await sendCustomEmail(license, subject, body, "individual");
  await db()
    .from("email_campaign_deliveries")
    .update(
      result.sent
        ? {
            status: "sent",
            accepted_at: new Date().toISOString(),
            attempts: 1,
            error: null,
            updated_at: new Date().toISOString(),
          }
        : {
            status: "failed",
            attempts: 1,
            error:
              `${result.reason || "send_failed"}${result.detail ? `: ${result.detail}` : ""}`.slice(
                0,
                500,
              ),
            updated_at: new Date().toISOString(),
          },
    )
    .eq("id", delivery.id);
  if (result.sent)
    await logEvent(
      licenseId,
      "email.individual.sent",
      `Mensagem personalizada aceita pelo SendGrid para ${license.customers.email}.`,
      { delivery_id: delivery.id },
    );
  return { processed: 1, sent: result.sent ? 1 : 0, failed: result.sent ? 0 : 1, skipped: 0 };
}

async function seedActivationReminders() {
  const settings = await getAutomationSettings();
  if (!settings.enabled) return 0;
  const candidates = await audience("awaiting_activation");
  let queued = 0;
  for (const license of candidates) {
    const ageHours = (Date.now() - Date.parse(license.created_at)) / 3_600_000;
    const step = [...settings.steps]
      .sort((a, b) => b.hours - a.hours)
      .find((item) => ageHours >= item.hours);
    if (!step) continue;
    const dedupeKey = `activation:${license.id}:${step.hours}h`;
    const { error } = await db()
      .from("email_campaign_deliveries")
      .upsert(
        {
          license_id: license.id,
          customer_id: license.customers?.id || null,
          recipient_email: license.customers?.email,
          recipient_name: license.customers?.full_name || null,
          purpose: "activation_reminder",
          step_key: `${step.hours}h`,
          dedupe_key: dedupeKey,
          subject: step.subject,
          body: step.body,
          status: "queued",
          scheduled_for: new Date().toISOString(),
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
    if (!error) queued += 1;
  }
  return queued;
}

async function refreshCampaign(campaignId: string) {
  const { data } = await db()
    .from("email_campaign_deliveries")
    .select("status")
    .eq("campaign_id", campaignId);
  const rows = (data || []) as DeliveryStatus[];
  const sent = rows.filter((row) => row.status === "sent").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const skipped = rows.filter((row) => row.status === "skipped").length;
  const pending = rows.some((row) => ["queued", "processing"].includes(row.status));
  await db()
    .from("email_campaigns")
    .update({
      sent_count: sent,
      failed_count: failed,
      skipped_count: skipped,
      status: pending ? "sending" : failed && !sent ? "failed" : "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

export async function processEmailQueue(limit = 30) {
  await seedActivationReminders();
  const { data, error } = await db()
    .from("email_campaign_deliveries")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(Math.min(50, Math.max(1, limit)));
  if (error) throw new Error(error.message);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const campaigns = new Set<string>();
  for (const delivery of (data || []) as QueueDelivery[]) {
    const { data: claimed } = await db()
      .from("email_campaign_deliveries")
      .update({
        status: "processing",
        attempts: Number(delivery.attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    if (delivery.campaign_id) campaigns.add(delivery.campaign_id);
    const { data: license } = await db()
      .from("licenses")
      .select("*, customers(id,email,full_name), license_devices(first_seen_at)")
      .eq("id", delivery.license_id)
      .maybeSingle();
    const activated = Boolean(
      license?.activation_started_at ||
      license?.last_validated_at ||
      license?.license_devices?.some(
        (device: { first_seen_at?: string | null }) => device.first_seen_at,
      ),
    );
    if (
      !license ||
      (delivery.purpose === "activation_reminder" && (activated || license.status !== "active"))
    ) {
      await db()
        .from("email_campaign_deliveries")
        .update({
          status: "skipped",
          error: activated ? "Licença ativada antes do envio." : "Licença indisponível.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      skipped += 1;
      continue;
    }
    const result = await sendCustomEmail(
      license,
      delivery.subject,
      delivery.body,
      delivery.purpose,
    );
    if (result.sent) {
      await db()
        .from("email_campaign_deliveries")
        .update({
          status: "sent",
          accepted_at: new Date().toISOString(),
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      await logEvent(
        license.id,
        `email.${delivery.purpose}.sent`,
        `E-mail aceito pelo SendGrid para ${license.customers?.email}.`,
        { delivery_id: delivery.id, step: delivery.step_key || null },
      );
      sent += 1;
    } else {
      const reason =
        `${result.reason || "send_failed"}${result.detail ? `: ${result.detail}` : ""}`.slice(
          0,
          500,
        );
      const retryable =
        /unavailable|429|500|502|503|504/i.test(reason) && Number(delivery.attempts || 0) < 3;
      await db()
        .from("email_campaign_deliveries")
        .update(
          retryable
            ? {
                status: "queued",
                error: reason,
                scheduled_for: new Date(
                  Date.now() + Math.max(5, Number(delivery.attempts || 0) * 10) * 60_000,
                ).toISOString(),
                updated_at: new Date().toISOString(),
              }
            : { status: "failed", error: reason, updated_at: new Date().toISOString() },
        )
        .eq("id", delivery.id);
      if (!retryable) failed += 1;
    }
  }
  for (const campaignId of campaigns) await refreshCampaign(campaignId);
  return { processed: (data || []).length, sent, failed, skipped };
}

export async function campaignDashboard() {
  const [settings, schedulerStatus, campaigns, deliveries, licenses] = await Promise.all([
    getAutomationSettings(),
    getSetting("email_campaign_scheduler_status"),
    db().from("email_campaigns").select("*").order("created_at", { ascending: false }).limit(30),
    db()
      .from("email_campaign_deliveries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    audience("all"),
  ]);
  const counts = {
    all: licenses.length,
    awaiting_activation: 0,
    activated: 0,
    active: 0,
    expired: 0,
  };
  for (const license of licenses) {
    if (matchesAudience(license, "awaiting_activation")) counts.awaiting_activation += 1;
    if (matchesAudience(license, "activated")) counts.activated += 1;
    if (matchesAudience(license, "active")) counts.active += 1;
    if (matchesAudience(license, "expired")) counts.expired += 1;
  }
  return {
    settings,
    schedulerStatus: schedulerStatus || "unknown",
    campaigns: campaigns.data || [],
    deliveries: deliveries.data || [],
    counts,
    plans: [
      ...new Map(
        licenses.map((license) => [license.plan, license.plan_name || license.plan]),
      ).entries(),
    ].map(([value, label]) => ({ value, label })),
  };
}
