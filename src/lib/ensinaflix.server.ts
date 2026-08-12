// Webhook público da Ensinaflix. Só roda no servidor.
// Nenhuma verificação de sessão de usuário: a proteção é o segredo próprio do webhook.
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLicenseRecord, dispatchOutbound, logEvent, safeEqual } from "./license.server";

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, x-webhook-secret, x-signature",
  "access-control-max-age": "86400",
};

export function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function preflightRes(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function maskEmail(email: string): string {
  const [user, domain] = String(email || "").split("@");
  if (!domain) return "***";
  return `${user.slice(0, 2)}***@${domain}`;
}

export type NormalizedEvent = ReturnType<typeof normalizeEnsinaflixWebhook>;

export function normalizeEnsinaflixWebhook(body: Record<string, any>) {
  const p = (body?.payload ?? {}) as Record<string, any>;
  const order = (p.order ?? {}) as Record<string, any>;
  const customer = (p.customer ?? {}) as Record<string, any>;
  const product = (p.product ?? {}) as Record<string, any>;
  const offer = (p.offer ?? {}) as Record<string, any>;
  const payment = (p.payment ?? {}) as Record<string, any>;
  const subscription = (p.subscription ?? {}) as Record<string, any>;
  const subscriptionPlan = (p.subscription_plan ?? {}) as Record<string, any>;

  const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

  return {
    eventType: String(body?.event ?? "").toLowerCase().trim(),
    eventLabel: str(body?.event_label),
    isTest: p.test === true,
    orderId: str(order.id),
    orderStatus: String(order.status ?? p.status ?? subscription.effective_status ?? subscription.status ?? "").toLowerCase().trim(),
    isRenewal: order.is_renewal === true || String(body?.event ?? "").toLowerCase() === "assinatura_renovada",
    customerName: str(customer.name),
    customerEmail: String(customer.email ?? "").trim().toLowerCase() || null,
    customerPhone: str(customer.phone),
    customerDocument: str(customer.docNumber ?? customer.document),
    productId: str(product.id),
    productName: str(product.name),
    offerId: str(offer.id ?? order.product_offer_id ?? subscriptionPlan.id),
    offerPublicId: str(offer.public_id ?? subscriptionPlan.public_id),
    offerName: str(offer.name ?? subscriptionPlan.name),
    subscriptionId: str(subscription.id),
    subscriptionStatus: String(subscription.effective_status ?? subscription.status ?? "").toLowerCase().trim(),
    subscriptionInterval: str(subscriptionPlan.interval),
    periodStart: str(subscription.current_period_start ?? order.period_start),
    periodEnd: str(subscription.current_period_end ?? order.period_end),
    billingType: str(product.billing_type),
    amount: p.amount ?? order.amount ?? offer.price ?? null,
    currency: str(p.currency ?? order.currency ?? offer.currency),
    paymentMethod: str(payment.method ?? p.paymentMethod),
    gateway: str(payment.gateway),
    gatewayTransactionId: str(payment.gateway_transaction_id),
    createdAt: str(p.createdAt ?? order.created_at),
    paidAt: str(p.paidAt),
    timestamp: str(body?.timestamp),
    rawPayload: body,
  };
}

export function eventKeyFor(n: NormalizedEvent, raw: string): string {
  if (n.gatewayTransactionId)
    return `ensinaflix:${n.gatewayTransactionId}:${n.eventType}:${n.orderStatus || "na"}`;
  if (n.orderId) return `ensinaflix:${n.orderId}:${n.eventType}:${n.timestamp ?? "na"}`;
  if (n.subscriptionId)
    return `ensinaflix:subscription:${n.subscriptionId}:${n.eventType}:${n.periodEnd ?? n.timestamp ?? "na"}`;
  return `ensinaflix:hash:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}

export type LicenseAction =
  | "CREATE_LICENSE"
  | "ACTIVATE_LICENSE"
  | "RENEW_LICENSE"
  | "KEEP_ACTIVE"
  | "EXPIRE_LICENSE"
  | "CANCEL_LICENSE"
  | "REFUND_LICENSE"
  | "REVOKE_LICENSE"
  | "MARK_PENDING"
  | "IGNORE_EVENT";

/** Nomes de evento conhecidos da Ensinaflix (pt e en). */
export const ENSINAFLIX_EVENT_MAP: Record<string, LicenseAction> = {
  pedido_criado: "MARK_PENDING",
  order_created: "MARK_PENDING",
  pedido_pendente: "MARK_PENDING",
  order_pending: "MARK_PENDING",
  pedido_pago: "CREATE_LICENSE",
  order_paid: "CREATE_LICENSE",
  pedido_aprovado: "CREATE_LICENSE",
  order_approved: "CREATE_LICENSE",
  compra_aprovada: "CREATE_LICENSE",
  assinatura_renovada: "RENEW_LICENSE",
  subscription_renewed: "RENEW_LICENSE",
  assinatura_ativa: "KEEP_ACTIVE",
  assinatura_criada: "MARK_PENDING",
  assinatura_em_atraso: "MARK_PENDING",
  assinatura_expirada: "EXPIRE_LICENSE",
  subscription_expired: "EXPIRE_LICENSE",
  assinatura_cancelada: "CANCEL_LICENSE",
  subscription_canceled: "CANCEL_LICENSE",
  subscription_cancelled: "CANCEL_LICENSE",
  pedido_cancelado: "CANCEL_LICENSE",
  order_canceled: "CANCEL_LICENSE",
  reembolso: "REFUND_LICENSE",
  pedido_reembolsado: "REFUND_LICENSE",
  refund: "REFUND_LICENSE",
  refunded: "REFUND_LICENSE",
  chargeback: "REVOKE_LICENSE",
  estorno: "REVOKE_LICENSE",
  falha_pagamento: "MARK_PENDING",
  payment_failed: "MARK_PENDING",
};

const PENDING_STATUS = ["pending", "pendente", "waiting_payment", "processing", "failed", "falhou"];
const CANCEL_STATUS = ["canceled", "cancelled", "cancelado"];
const REFUND_STATUS = ["refunded", "reembolsado", "estornado"];
const CHARGEBACK_STATUS = ["chargeback", "disputa"];
const EXPIRE_STATUS = ["expired", "expirado", "expirada"];

const PURCHASE_CONFIRMED_EVENTS = new Set([
  "pedido_pago", "order_paid", "pedido_aprovado", "order_approved", "compra_aprovada",
]);
const RENEWAL_CONFIRMED_EVENTS = new Set(["assinatura_renovada", "subscription_renewed"]);

/** Somente eventos explicitamente financeiros podem criar ou renovar acesso. */
export function resolveLicenseAction(input: {
  event: string;
  orderStatus: string;
  isRenewal: boolean;
}): LicenseAction {
  const event = (input.event || "").toLowerCase();
  const status = (input.orderStatus || "").toLowerCase();

  if (RENEWAL_CONFIRMED_EVENTS.has(event)) return "RENEW_LICENSE";
  if (PURCHASE_CONFIRMED_EVENTS.has(event)) return "CREATE_LICENSE";

  if (CHARGEBACK_STATUS.includes(status) || event.includes("chargeback")) return "REVOKE_LICENSE";
  if (REFUND_STATUS.includes(status) || event.includes("reembol") || event.includes("refund"))
    return "REFUND_LICENSE";
  if (EXPIRE_STATUS.includes(status) || event.includes("expir")) return "EXPIRE_LICENSE";
  if (CANCEL_STATUS.includes(status) || event.includes("cancel")) return "CANCEL_LICENSE";

  const mapped = ENSINAFLIX_EVENT_MAP[event];
  if (PENDING_STATUS.includes(status)) return "MARK_PENDING";
  return mapped ?? "IGNORE_EVENT";
}

export type Mapping = {
  id: string;
  plan_code: string;
  plan_name: string;
  duration_days: number | null;
  duration_minutes?: number | null;
  is_lifetime: boolean;
  device_limit: number;
};

// Catálogo oficial como fallback operacional. A tabela continua tendo
// prioridade e pode sobrescrever essas regras pelo painel, mas uma migração
// ainda não aplicada nunca deve impedir uma venda paga de gerar a licença.
const DEFAULT_PRODUCT_MAPPINGS: Array<Mapping & {
  product_id: string;
  offer_public_id?: string | null;
}> = [
  { id: "default-test", product_id: "03c254c0-8ce0-4fe7-b378-ea8798e27be8", plan_code: "test_30m", plan_name: "Teste · 30 minutos", duration_days: null, duration_minutes: 30, is_lifetime: false, device_limit: 1 },
  { id: "default-weekly", product_id: "e5f93c9a-015e-4e10-9c84-331290f21b2c", offer_public_id: "okfncdob1o", plan_code: "weekly", plan_name: "Semanal · 7 dias", duration_days: 7, duration_minutes: null, is_lifetime: false, device_limit: 1 },
  { id: "default-monthly", product_id: "63428865-119f-4316-a9f1-7e24162ef258", offer_public_id: "fkt54kvcqq", plan_code: "monthly", plan_name: "Mensal · 30 dias", duration_days: 30, duration_minutes: null, is_lifetime: false, device_limit: 1 },
  { id: "default-annual", product_id: "6aad4d1b-a84e-4ab2-a819-521452ca1e54", offer_public_id: "swh4m14h19", plan_code: "annual", plan_name: "Anual · 12 meses", duration_days: 365, duration_minutes: null, is_lifetime: false, device_limit: 1 },
  { id: "default-lifetime", product_id: "b979f6cd-1a69-44d5-b20d-498a434823e2", plan_code: "lifetime", plan_name: "Vitalícia", duration_days: null, duration_minutes: null, is_lifetime: true, device_limit: 1 },
];

/** Prioridade: produto+oferta pública > oferta pública > produto > id da oferta. */
export async function findMapping(n: NormalizedEvent): Promise<Mapping | null> {
  const { data } = await supabaseAdmin
    .from("license_product_mappings")
    .select("*")
    .eq("provider", "ensinaflix")
    .eq("is_active", true);
  const rows = (data ?? []) as any[];
  const tries: ((r: any) => boolean)[] = [
    (r) =>
      !!n.productId &&
      !!n.offerPublicId &&
      r.ensinaflix_product_id === n.productId &&
      r.ensinaflix_offer_public_id === n.offerPublicId,
    (r) => !!n.offerPublicId && r.ensinaflix_offer_public_id === n.offerPublicId,
    (r) => !!n.productId && r.ensinaflix_product_id === n.productId,
    (r) => !!n.offerId && r.ensinaflix_offer_id === n.offerId,
  ];
  for (const test of tries) {
    const hit = rows.find(test);
    if (hit) return hit as Mapping;
  }
  // Produtos com assinatura podem conter vários planos (por exemplo,
  // Semanal comercial e TESTE). Quando o catálogo informa uma oferta oficial,
  // produto e oferta precisam coincidir para não liberar uma compra de teste
  // como se fosse o plano comercial.
  const fallback = DEFAULT_PRODUCT_MAPPINGS.find(
    (item) =>
      item.product_id === n.productId &&
      (!item.offer_public_id || item.offer_public_id === n.offerPublicId),
  );
  return fallback ?? null;
}

async function findLicense(n: NormalizedEvent) {
  if (n.subscriptionId) {
    const { data } = await supabaseAdmin
      .from("licenses")
      .select("*")
      .eq("external_subscription_id", n.subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (n.orderId) {
    const { data } = await supabaseAdmin
      .from("licenses")
      .select("*")
      .eq("order_id", n.orderId)
      .maybeSingle();
    if (data) return data;
  }
  if (n.customerEmail) {
    const { data: cust } = await supabaseAdmin
      .from("customers")
      .select("id")
      .ilike("email", n.customerEmail)
      .maybeSingle();
    if (cust) {
      const { data } = await supabaseAdmin
        .from("licenses")
        .select("*")
        .eq("customer_id", cust.id)
        .eq("external_product_id", n.productId ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }

  }
  return null;
}

export type ProcessResult = {
  processed: boolean;
  reason?: string;
  action: LicenseAction;
  licenseId?: string | null;
  license?: Record<string, unknown> | null;
};

export async function processEnsinaflixEvent(
  n: NormalizedEvent,
  options: { retryEmail?: boolean } = {},
): Promise<ProcessResult> {
  const action = resolveLicenseAction({
    event: n.eventType,
    orderStatus: n.orderStatus,
    isRenewal: n.isRenewal,
  });

  if (action === "IGNORE_EVENT" || action === "MARK_PENDING" || action === "KEEP_ACTIVE")
    return { processed: false, reason: "EVENT_IGNORED", action, licenseId: null };

  if (action === "CREATE_LICENSE" || action === "RENEW_LICENSE" || action === "ACTIVATE_LICENSE") {
    const mapping = await findMapping(n);
    if (!mapping)
      return { processed: false, reason: "UNKNOWN_PRODUCT_MAPPING", action, licenseId: null };

    // O número do pedido é a identidade da compra. Eventos automáticos repetidos
    // nunca criam outra chave nem reenviam e-mail. O reenvio só ocorre por ação
    // administrativa explícita no painel.
    const existingForOrder = n.orderId ? await findLicense(n) : null;
    if (existingForOrder && existingForOrder.order_id === n.orderId) {
      let email: { sent: boolean; reason?: string } = { sent: true };
      if (options.retryEmail) {
        const { sendLicenseEmail } = await import("./license.server");
        email = await sendLicenseEmail(existingForOrder.id, {
          product_name: n.productName, product_id: n.productId, billing_type: n.billingType,
          offer_name: n.offerName, offer_id: n.offerId, offer_public_id: n.offerPublicId,
          subscription_interval: n.subscriptionInterval, subscription_id: n.subscriptionId,
          order_id: n.orderId, amount: n.amount, currency: n.currency,
          payment_method: n.paymentMethod, paid_at: n.paidAt,
        });
      }
      return {
        processed: true,
        reason: options.retryEmail
          ? (email.sent ? undefined : `EMAIL_NOT_SENT:${email.reason || "unknown"}`)
          : "ORDER_ALREADY_PROCESSED",
        action,
        licenseId: existingForOrder.id,
        license: existingForOrder,
      };
    }

    // Cada pagamento/renovação confirmado recebe uma nova chave. A
    // idempotência do webhook impede duplicidade para o mesmo evento.
    const license = await createLicenseRecord({
      plan: mapping.plan_code,
      plan_name: mapping.plan_name,
      is_lifetime: mapping.is_lifetime,
      duration_days: mapping.duration_days,
      duration_minutes: mapping.duration_minutes,
      // Alguns eventos enviam apenas YYYY-MM-DD em period_end. Nesse caso,
      // usamos a duração do mapeamento para não encerrar horas antes do prazo.
      expires_at: mapping.is_lifetime || !n.periodEnd?.includes("T") ? null : n.periodEnd,
      device_limit: mapping.device_limit,
      order_id: n.orderId,
      external_product_id: n.productId,
      external_subscription_id: n.subscriptionId,
      source: "ensinaflix",
      customer: n.customerEmail
        ? {
            email: n.customerEmail,
            full_name: n.customerName,
            phone: n.customerPhone,
            document: n.customerDocument,
          }
        : null,
    });
    const { sendLicenseEmail } = await import("./license.server");
    const email = await sendLicenseEmail(license.id, {
      product_name: n.productName,
      product_id: n.productId,
      billing_type: n.billingType,
      offer_name: n.offerName,
      offer_id: n.offerId,
      offer_public_id: n.offerPublicId,
      subscription_interval: n.subscriptionInterval,
      subscription_id: n.subscriptionId,
      order_id: n.orderId,
      amount: n.amount,
      currency: n.currency,
      payment_method: n.paymentMethod,
      paid_at: n.paidAt,
    });
    return {
      processed: true,
      reason: email.sent ? undefined : `EMAIL_NOT_SENT:${email.reason || "unknown"}`,
      action: "CREATE_LICENSE",
      licenseId: license.id,
      license: {
        id: license.id,
        license_key: license.license_key,
        key_hint: license.key_hint,
        plan: license.plan,
        plan_name: license.plan_name,
        is_lifetime: license.is_lifetime,
        expires_at: license.expires_at,
        device_limit: license.device_limit,
        order_id: license.order_id,
      },
    };
  }

  // Cancelamento / expiração / reembolso / chargeback
  const target = await findLicense(n);
  if (!target) return { processed: false, reason: "LICENSE_NOT_FOUND", action, licenseId: null };

  const status =
    action === "EXPIRE_LICENSE"
      ? "expired"
      : action === "REFUND_LICENSE"
        ? "refunded"
        : action === "REVOKE_LICENSE"
          ? "revoked"
          : "canceled";

  await supabaseAdmin.from("licenses").update({ status }).eq("id", target.id);
  await supabaseAdmin.from("license_devices").update({ active: false }).eq("license_id", target.id);
  await logEvent(target.id, `license.${status}`, `Atualizada pela Ensinaflix (${n.eventType}).`, {
    order_id: n.orderId,
    reason: action === "REVOKE_LICENSE" ? "chargeback" : n.eventType,
  });
  await dispatchOutbound("license.updated", target.id);
  return { processed: true, action, licenseId: target.id };
}
