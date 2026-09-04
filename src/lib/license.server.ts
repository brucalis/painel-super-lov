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

/** Token repetível por vínculo. Evita que duas abas ativando ao mesmo tempo
 * invalidem a sessão uma da outra. O segredo nunca é enviado ao cliente. */
export function deviceToken(licenseId: string, browserBinding: string): { token: string; hash: string } {
  const secret = process.env.LICENSE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) return newToken();
  const token = createHmac("sha256", secret)
    .update(`superlovable-license:${licenseId}:${browserBinding}`)
    .digest("hex");
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
      "access-control-allow-headers": "authorization, content-type, x-super-lovable-edition",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    },
  });
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, x-super-lovable-edition",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
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
  activation_started_at?: string | null;
  duration_minutes?: number | null;
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

export async function licenseResponse(license: LicenseRow, token: string | null, deviceId?: string) {
  const [{ count }, { data: customer }] = await Promise.all([
    supabaseAdmin
      .from("license_devices")
      .select("id", { count: "exact", head: true })
      .eq("license_id", license.id)
      .eq("active", true),
    license.customer_id
      ? supabaseAdmin.from("customers").select("full_name").eq("id", license.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    status: effectiveStatus(license),
    license_token: token,
    license_key: license.license_key,
    user_name: String(customer?.full_name || "").trim() || null,
    access_role: license.access_role === "admin" ? "admin" : "user",
    plan: license.plan,
    plan_name: license.plan_name,
    expires_at: license.expires_at,
    activation_started_at: license.activation_started_at ?? null,
    duration_minutes: license.duration_minutes ?? null,
    is_lifetime: license.is_lifetime,
    device_count: count ?? 0,
    device_limit: license.device_limit,
    key_hint: license.key_hint,
    minimum_version: license.minimum_version,
    offline_grace_seconds: license.offline_grace_seconds,
    server_time: new Date().toISOString(),
    device_id: deviceId,
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
  duration_minutes?: number | null;
  expires_at?: string | null;
  device_limit?: number;
  order_id?: string | null;
  external_product_id?: string | null;
  external_subscription_id?: string | null;
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
  // O numero do pedido identifica uma unica compra. Isso protege tanto o
  // webhook quanto tentativas manuais repetidas depois de falha/timeout.
  if (input.order_id?.trim()) {
    const normalizedOrderId = input.order_id.trim();
    const { data: existingOrderLicense } = await supabaseAdmin
      .from("licenses")
      .select("*")
      .eq("order_id", normalizedOrderId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingOrderLicense) return existingOrderLicense;
  }

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
  // Novas licenças temporárias aguardam a primeira ativação. O prazo comprado
  // fica preservado em minutos e o vencimento só é calculado nesse momento.
  const durationMinutes = isLifetime
    ? null
    : input.duration_minutes ?? (input.duration_days ? input.duration_days * 1440 : null);
  const expiresAt = !isLifetime && input.expires_at && !durationMinutes
    ? new Date(input.expires_at).toISOString()
    : null;

  const key = generateLicenseKey();
  const baseInsert = {
      license_key: key,
      key_hint: keyHint(key),
      customer_id: customerId,
      plan: input.plan ?? "pro",
      plan_name: input.plan_name ?? "Plano Pro",
      status: "active" as const,
      is_lifetime: isLifetime,
      expires_at: expiresAt,
      activation_started_at: null,
      duration_minutes: durationMinutes,
      device_limit: input.device_limit ?? 1,
      minimum_version: input.minimum_version ?? null,
      order_id: input.order_id ?? null,
      source: input.source ?? "manual",
      notes: input.notes ?? null,
  };
  // As colunas externas foram adicionadas depois do cadastro manual. Alguns
  // projetos publicados ainda estão com o cache do schema anterior; nesse
  // cenário a licença precisa continuar sendo criada normalmente.
  const withExternalReferences = {
    ...baseInsert,
    external_product_id: input.external_product_id ?? null,
    external_subscription_id: input.external_subscription_id ?? null,
  };
  let { data, error } = await supabaseAdmin.from("licenses").insert(withExternalReferences as never).select("*").single();
  if (error && /external_(product|subscription)_id/i.test(error.message)) {
    ({ data, error } = await supabaseAdmin.from("licenses").insert(baseInsert).select("*").single());
  }
  // Compatibilidade durante publicacoes em que o frontend chegou antes da
  // migration de validade. O prazo temporario comeca na criacao somente nesse
  // modo de contingencia; assim a venda nao e perdida nem vira acesso infinito.
  if (error && /activation_started_at|duration_minutes/i.test(error.message)) {
    const legacyInsert = {
      ...baseInsert,
      expires_at: isLifetime || !durationMinutes
        ? expiresAt
        : new Date(Date.now() + durationMinutes * 60000).toISOString(),
    } as Record<string, unknown>;
    delete legacyInsert.activation_started_at;
    delete legacyInsert.duration_minutes;
    ({ data, error } = await supabaseAdmin.from("licenses").insert(legacyInsert as never).select("*").single());
  }
  if (error) throw new Error(error.message);
  if (!data) throw new Error("A licença não foi criada.");

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

/** Envia a chave diretamente pelo SendGrid configurado no painel. */
export async function sendLicenseEmail(
  licenseId: string,
  context: {
    product_name?: string | null;
    product_id?: string | null;
    billing_type?: string | null;
    offer_name?: string | null;
    offer_id?: string | null;
    offer_public_id?: string | null;
    subscription_interval?: string | null;
    subscription_id?: string | null;
    order_id?: string | null;
    amount?: unknown;
    currency?: string | null;
    payment_method?: string | null;
    paid_at?: string | null;
  } = {},
): Promise<{ sent: boolean; reason?: string }> {
  const [{ data: license }, enabled, storedKey, fromEmail, fromName, replyTo, subjectTemplate, bodyTemplate, downloadUrl] = await Promise.all([
    supabaseAdmin
      .from("licenses")
      .select("*, customers(email, full_name)")
      .eq("id", licenseId)
      .maybeSingle(),
    getSetting("sendgrid_enabled"),
    getSetting("sendgrid_api_key"),
    getSetting("sendgrid_from_email"),
    getSetting("sendgrid_from_name"),
    getSetting("sendgrid_reply_to"),
    getSetting("sendgrid_subject_template"),
    getSetting("sendgrid_body_template"),
    getSetting("sendgrid_download_url"),
  ]);
  if (enabled !== "true") return { sent: false, reason: "disabled" };
  const apiKey = process.env.SENDGRID_API_KEY || storedKey || "";
  const customer = license?.customers as { email?: string; full_name?: string | null } | null;
  if (!license || !customer?.email) return { sent: false, reason: "customer_email_missing" };
  if (!apiKey || !fromEmail) return { sent: false, reason: "sendgrid_not_configured" };

  const validity = license.is_lifetime
    ? "Acesso vitalício"
    : license.expires_at
    ? `Válida até ${new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo"
      }).format(new Date(license.expires_at))}`
    : license.duration_minutes
    ? "A validade começa na primeira ativação"
    : "Validade não informada";
  const safeName = customer.full_name || "Cliente";
  const productName = context.product_name || license.plan_name;
  const subscriptionType = context.subscription_interval || (license.is_lifetime ? "vitalício" : license.plan_name);
  const orderId = context.order_id || license.order_id || "Não informado";
  const offerName = context.offer_name || "Oferta principal";
  const paymentMethod = context.payment_method || "Pagamento confirmado";
  const paidAt = formatWebhookDate(context.paid_at);
  const amount = formatWebhookAmount(context.amount, context.currency || "BRL");
  const downloadLink = downloadUrl || "https://painel-super-lov.lovable.app/";
  const variables: Record<string, string> = {
    nome: safeName,
    email: customer.email,
    produto: productName,
    plano: license.plan_name,
    tipo_assinatura: subscriptionType,
    licenca: license.license_key,
    validade: validity,
    link_download: downloadLink,
    pedido: orderId,
    oferta: offerName,
    valor: amount,
    metodo_pagamento: paymentMethod,
    data_pagamento: paidAt,
    "payload.customer.name": safeName,
    "payload.customer.email": customer.email,
    "payload.product.id": context.product_id || "",
    "payload.product.name": productName,
    "payload.product.billing_type": context.billing_type || "",
    "payload.offer.id": context.offer_id || "",
    "payload.offer.public_id": context.offer_public_id || "",
    "payload.offer.name": offerName,
    "payload.order.id": orderId,
    "payload.subscription.id": context.subscription_id || "",
    "payload.subscription_plan.interval": subscriptionType,
    "payload.amount": amount,
    "payload.paymentMethod": paymentMethod,
    "payload.paidAt": paidAt,
  };
  const render = (template: string) => template.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, key) => variables[key] ?? "");
  const subject = render(subjectTemplate || "Bem-vindo(a) à Superlovable — sua licença está pronta");
  const text = render(bodyTemplate || `Olá, {{nome}}!\n\nSeja muito bem-vindo(a) à Superlovable. Seu pagamento foi confirmado e seu acesso já está liberado.\n\nProduto: {{produto}}\nPlano: {{plano}}\nLicença: {{licenca}}\nValidade: {{validade}}\n\nBaixe a extensão e consulte as instruções aqui:\n{{link_download}}\n\nCada licença pode ser utilizada em um navegador/dispositivo por vez. Se tiver qualquer dúvida, responda a este e-mail e nossa equipe ajudará você.`);
  const html = buildLicenseEmailHtml({
    name: safeName,
    message: text,
    product: productName,
    plan: license.plan_name,
    licenseKey: license.license_key,
    validity,
    orderId,
    downloadLink,
  });
  const payload: Record<string, unknown> = {
    personalizations: [{
      to: [{ email: customer.email, name: safeName }],
      subject,
      headers: { "X-Entity-Ref-ID": `superlovable-license-${license.id}` },
      custom_args: { message_type: "license_delivery", order_id: String(orderId) },
    }],
    from: { email: fromEmail, name: fromName || "Superlovable" },
    content: [{ type: "text/plain", value: text }, { type: "text/html", value: html }],
    categories: ["transactional", "license-delivery"],
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
      subscription_tracking: { enable: false },
    },
  };
  if (replyTo) payload.reply_to = { email: replyTo };
  let response: Response;
  try {
    response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    await logEvent(licenseId, "email.failed", "SendGrid indisponível; a licença foi gerada normalmente.", {
      detail: error instanceof Error ? error.message : "network_error",
    });
    return { sent: false, reason: "sendgrid_unavailable" };
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    if (/maximum credits exceeded/i.test(detail)) {
      await logEvent(licenseId, "email.failed", "Cota de envios do SendGrid atingida; a licença foi gerada normalmente.", {
        status: response.status,
        detail,
      });
      return { sent: false, reason: "sendgrid_quota_exceeded" };
    }
    await logEvent(licenseId, "email.failed", "Falha ao enviar e-mail da licença.", { status: response.status, detail });
    return { sent: false, reason: `sendgrid_${response.status}` };
  }
  await logEvent(licenseId, "email.sent", `Chave enviada para ${customer.email}.`);
  return { sent: true };
}

/** Envia um e-mail de demonstração sem criar pedido, cliente ou licença. */
export async function sendSendGridTestEmail(
  toEmail: string,
): Promise<{ sent: boolean; reason?: string; detail?: string }> {
  const [storedKey, fromEmail, fromName, replyTo, subjectTemplate, bodyTemplate, downloadUrl] = await Promise.all([
    getSetting("sendgrid_api_key"),
    getSetting("sendgrid_from_email"),
    getSetting("sendgrid_from_name"),
    getSetting("sendgrid_reply_to"),
    getSetting("sendgrid_subject_template"),
    getSetting("sendgrid_body_template"),
    getSetting("sendgrid_download_url"),
  ]);
  const apiKey = process.env.SENDGRID_API_KEY || storedKey || "";
  if (!apiKey || !fromEmail)
    return { sent: false, reason: "sendgrid_not_configured", detail: "Configure a API Key e o remetente verificado." };

  const downloadLink = downloadUrl || "https://painel-super-lov.lovable.app/";
  const variables: Record<string, string> = {
    nome: "Cliente de teste",
    email: toEmail,
    produto: "Superlovable",
    plano: "Plano de demonstração",
    tipo_assinatura: "teste de integração",
    licenca: "LVA-TEST-TEST-TEST-TEST",
    validade: "E-mail de teste — nenhuma licença foi criada",
    link_download: downloadLink,
    pedido: "TESTE-SENDGRID",
    oferta: "Teste de envio",
    valor: "R$ 0,00",
    metodo_pagamento: "Teste administrativo",
    data_pagamento: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  };
  variables["payload.customer.name"] = variables.nome;
  variables["payload.customer.email"] = variables.email;
  variables["payload.product.name"] = variables.produto;
  variables["payload.offer.name"] = variables.oferta;
  variables["payload.order.id"] = variables.pedido;
  variables["payload.amount"] = variables.valor;
  variables["payload.paymentMethod"] = variables.metodo_pagamento;
  variables["payload.paidAt"] = variables.data_pagamento;

  const render = (template: string) => template.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, key) => variables[key] ?? "");
  const subject = `[TESTE] ${render(subjectTemplate || "Bem-vindo(a) à Superlovable — sua licença está pronta")}`;
  const text = render(bodyTemplate || "Olá, {{nome}}!\n\nEste é um teste da integração da Superlovable com o SendGrid. Se você recebeu esta mensagem, a API, o remetente e o layout estão funcionando corretamente.");
  const html = buildLicenseEmailHtml({
    name: variables.nome,
    message: text,
    product: variables.produto,
    plan: variables.plano,
    licenseKey: variables.licenca,
    validity: variables.validade,
    orderId: variables.pedido,
    downloadLink,
  });
  const payload: Record<string, unknown> = {
    personalizations: [{ to: [{ email: toEmail, name: "Cliente de teste" }], subject }],
    from: { email: fromEmail, name: fromName || "Superlovable" },
    content: [{ type: "text/plain", value: text }, { type: "text/html", value: html }],
  };
  if (replyTo) payload.reply_to = { email: replyTo };

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      if (/maximum credits exceeded/i.test(detail)) {
        return {
          sent: false,
          reason: "sendgrid_quota_exceeded",
          detail: "A cota de envios da conta SendGrid foi atingida. Aguarde a renovação da cota ou aumente o limite no SendGrid; nenhuma compra ou configuração do painel causou este bloqueio.",
        };
      }
      return { sent: false, reason: `sendgrid_${response.status}`, detail: detail || `HTTP ${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: "sendgrid_unavailable",
      detail: error instanceof Error ? error.message : "Não foi possível acessar o SendGrid.",
    };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char);
}

function formatWebhookDate(value?: string | null): string {
  if (!value) return "Não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatWebhookAmount(value: unknown, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "Não informado";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function buildLicenseEmailHtml(input: {
  name: string;
  message: string;
  product: string;
  plan: string;
  licenseKey: string;
  validity: string;
  orderId: string;
  downloadLink: string;
}): string {
  const safeLink = escapeHtml(input.downloadLink);
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#202124">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e2e8;border-radius:16px;overflow:hidden">
        <tr><td style="height:5px;background:#8f35ff"></td></tr>
        <tr><td style="padding:28px 32px 12px">
          <div style="font-size:13px;color:#6f42c1;font-weight:700">SUPERLOVABLE</div>
          <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.25;color:#202124">Sua licença está pronta</h1>
          <p style="margin:0;color:#5f6368;font-size:15px;line-height:1.6">Olá, ${escapeHtml(input.name)}. Seu pagamento foi confirmado e seu acesso já foi liberado.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 30px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 22px;background:#faf8ff;border:1px solid #e4d9fb;border-radius:12px">
            <tr><td style="padding:22px">
              <div style="font-size:12px;color:#6a6572;text-transform:uppercase;letter-spacing:.8px">Chave de licença</div>
              <div style="margin:8px 0 18px;font-family:Consolas,Monaco,monospace;font-size:19px;font-weight:700;color:#5f259f;word-break:break-all">${escapeHtml(input.licenseKey)}</div>
              <div style="font-size:14px;line-height:1.8;color:#4b4b52"><strong>Produto:</strong> ${escapeHtml(input.product)}<br><strong>Plano:</strong> ${escapeHtml(input.plan)}<br><strong>Validade:</strong> ${escapeHtml(input.validity)}<br><strong>Pedido:</strong> ${escapeHtml(input.orderId)}</div>
            </td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:8px;background:#6f2dbd">
            <a href="${safeLink}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px">Acessar extensão e instruções</a>
          </td></tr></table>
          <p style="margin:22px 0 0;color:#5f6368;font-size:13px;line-height:1.6">Use a licença em um navegador ou dispositivo por vez. Se precisar de ajuda, responda a este e-mail.</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#fafafa;color:#777;font-size:12px;border-top:1px solid #eeeeee">Mensagem transacional referente ao pedido ${escapeHtml(input.orderId)}.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
