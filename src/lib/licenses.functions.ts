import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./admin.server";

const createSchema = z.object({
  plan: z.string().min(1).default("pro"),
  plan_name: z.string().min(1).default("Plano Pro"),
  is_lifetime: z.boolean().default(false),
  duration_days: z.number().int().positive().nullable().optional(),
  duration_minutes: z.number().int().positive().nullable().optional(),
  device_limit: z.number().int().min(1).max(50).default(1),
  order_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  minimum_version: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  customer_phone: z.string().nullable().optional(),
});

export const createLicense = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const { createLicenseRecord, sendLicenseEmail } = await import("./license.server");
    const license = await createLicenseRecord({
      plan: data.plan,
      plan_name: data.plan_name,
      is_lifetime: data.is_lifetime,
      duration_days: data.duration_days ?? null,
      duration_minutes: data.duration_minutes ?? null,
      device_limit: data.device_limit,
      order_id: data.order_id ?? null,
      notes: data.notes ?? null,
      minimum_version: data.minimum_version ?? null,
      source: "painel",
      customer: data.customer_email
        ? {
            email: data.customer_email,
            full_name: data.customer_name ?? null,
            phone: data.customer_phone ?? null,
          }
        : null,
    });
    const email = data.customer_email
      ? await sendLicenseEmail(license.id, {
          product_name: data.plan_name,
          order_id: data.order_id ?? null,
        })
      : { sent: false, reason: "customer_email_missing" };
    return { license, email };
  });

export const resendLicenseWebhook = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ license_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { dispatchOutbound } = await import("./license.server");
    await dispatchOutbound("license.created", data.license_id);
    return { ok: true };
  });

export const rotateSalesSecret = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { randomBytes } = await import("crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = randomBytes(24).toString("hex");
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "sales_webhook_secret", value, updated_at: new Date().toISOString() });
    return { value };
  });

export const generateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { randomBytes } = await import("crypto");
    return { value: randomBytes(24).toString("hex") };
  });

export const rotateEnsinaflixSecret = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { randomBytes } = await import("crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = randomBytes(24).toString("hex");
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "ensinaflix_webhook_secret", value, updated_at: new Date().toISOString() });
    return { value };
  });

export const getEnsinaflixSecretStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { getSetting } = await import("./license.server");
    const stored = await getSetting("ensinaflix_webhook_secret");
    const env =
      process.env.ENSAINAFLIX_WEBHOOK_SECRET || process.env.ENSINAFLIX_WEBHOOK_SECRET || "";
    const value = env || stored || "";
    return {
      configured: !!value,
      source: env ? "env" : stored ? "painel" : null,
      hint: value ? `${value.slice(0, 4)}••••${value.slice(-4)}` : null,
      full: env ? null : stored,
    };
  });

const sendGridSchema = z.object({
  api_key: z.string().trim().optional(),
  from_email: z.string().email(),
  from_name: z.string().trim().min(1).default("Superlovable"),
  reply_to: z.union([z.string().email(), z.literal("")]).optional(),
  subject_template: z.string().trim().min(1),
  body_template: z.string().trim().min(1),
  download_url: z.string().url(),
  enabled: z.boolean(),
});

export const saveSendGridSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => sendGridSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = [
      { key: "sendgrid_from_email", value: data.from_email },
      { key: "sendgrid_from_name", value: data.from_name },
      { key: "sendgrid_reply_to", value: data.reply_to || "" },
      { key: "sendgrid_enabled", value: String(data.enabled) },
      { key: "sendgrid_subject_template", value: data.subject_template },
      { key: "sendgrid_body_template", value: data.body_template },
      { key: "sendgrid_download_url", value: data.download_url },
    ];
    if (data.api_key) rows.push({ key: "sendgrid_api_key", value: data.api_key });
    await supabaseAdmin.from("app_settings").upsert(
      rows.map((row) => ({ ...row, updated_at: new Date().toISOString() })),
      { onConflict: "key" },
    );
    return { ok: true };
  });

export const getSendGridSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { getSetting } = await import("./license.server");
    const [storedKey, fromEmail, fromName, replyTo, enabled, subjectTemplate, bodyTemplate, downloadUrl] = await Promise.all([
      getSetting("sendgrid_api_key"), getSetting("sendgrid_from_email"),
      getSetting("sendgrid_from_name"), getSetting("sendgrid_reply_to"), getSetting("sendgrid_enabled"),
      getSetting("sendgrid_subject_template"), getSetting("sendgrid_body_template"), getSetting("sendgrid_download_url"),
    ]);
    const envConfigured = !!process.env.SENDGRID_API_KEY;
    return {
      configured: envConfigured || !!storedKey,
      key_hint: envConfigured ? "configurada no ambiente" : storedKey ? `${storedKey.slice(0, 5)}••••${storedKey.slice(-4)}` : null,
      from_email: fromEmail || "", from_name: fromName || "Superlovable", reply_to: replyTo || "",
      enabled: enabled === "true",
      subject_template: subjectTemplate || "Bem-vindo(a) à Superlovable — sua licença está pronta",
      body_template: bodyTemplate || "Olá, {{nome}}!\n\nSeja muito bem-vindo(a) à Superlovable. Seu pagamento foi confirmado e seu acesso já está liberado.\n\nProduto: {{produto}}\nPlano: {{plano}}\nLicença: {{licenca}}\nValidade: {{validade}}\n\nBaixe a extensão e consulte as instruções aqui:\n{{link_download}}\n\nCada licença pode ser utilizada em um navegador/dispositivo por vez. Se tiver qualquer dúvida, responda a este e-mail e nossa equipe ajudará você.",
      download_url: downloadUrl || "https://painel-super-lov.lovable.app/",
    };
  });

export const resendLicenseEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ license_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendLicenseEmail } = await import("./license.server");
    return sendLicenseEmail(data.license_id);
  });

export const sendSendGridTest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ email: z.string().trim().email() }).parse(data))
  .handler(async ({ data }) => {
    const { sendSendGridTestEmail } = await import("./license.server");
    return sendSendGridTestEmail(data.email);
  });

export const reprocessEnsinaflixWebhook = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeEnsinaflixWebhook, processEnsinaflixEvent } = await import("./ensinaflix.server");
    const { data: event, error } = await supabaseAdmin
      .from("webhook_events")
      .select("id, provider, payload, is_test")
      .eq("id", data.event_id)
      .eq("provider", "ensinaflix")
      .single();
    if (error || !event) throw new Error("Evento da Ensinaflix não encontrado.");

    const normalized = normalizeEnsinaflixWebhook(event.payload as Record<string, unknown>);
    if (normalized.isTest || event.is_test) {
      throw new Error("Eventos de teste não geram licenças.");
    }

    await supabaseAdmin.from("webhook_events").update({
      processing_status: "processing",
      processing_error: null,
      processed_at: null,
    }).eq("id", event.id);

    try {
      const result = await processEnsinaflixEvent(normalized);
      const status = result.processed
        ? "processed"
        : result.reason === "EVENT_IGNORED" ? "ignored" : "failed";
      await supabaseAdmin.from("webhook_events").update({
        processing_status: status,
        processing_error: result.reason ?? null,
        license_id: result.licenseId ?? null,
        http_status: result.processed ? 200 : 422,
        processed_at: new Date().toISOString(),
      }).eq("id", event.id);
      return { ok: result.processed, status, reason: result.reason ?? null, license_id: result.licenseId ?? null };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha desconhecida no reprocessamento.";
      await supabaseAdmin.from("webhook_events").update({
        processing_status: "failed",
        processing_error: message,
        http_status: 500,
        processed_at: new Date().toISOString(),
      }).eq("id", event.id);
      throw caught;
    }
  });
