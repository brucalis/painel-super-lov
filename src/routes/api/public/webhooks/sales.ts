import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de ENTRADA da plataforma de vendas.
 * URL: POST /api/public/webhooks/sales
 * Autenticação: cabeçalho `x-webhook-signature: sha256=<hmac>` sobre o corpo cru,
 * ou `x-webhook-secret: <segredo>` quando a plataforma não assina.
 * Resposta: os dados da licença gerada (a plataforma pode usar direto na entrega).
 */
export const Route = createFileRoute("/api/public/webhooks/sales")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const {
          json,
          hmac,
          safeEqual,
          getSetting,
          createLicenseRecord,
          dispatchOutbound,
          logEvent,
        } = await import("@/lib/license.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const raw = await request.text();
        const secret = await getSetting("sales_webhook_secret");
        const signature = (request.headers.get("x-webhook-signature") || "").replace(/^sha256=/, "");
        const plain = request.headers.get("x-webhook-secret") || "";

        let valid = false;
        if (secret) {
          if (signature) valid = safeEqual(signature, hmac(secret, raw));
          else if (plain) valid = safeEqual(plain, secret);
        }

        let payload: Record<string, any> = {};
        try {
          payload = JSON.parse(raw || "{}");
        } catch {
          payload = { _raw: raw.slice(0, 2000) };
        }

        const provider = String(payload.provider || request.headers.get("x-webhook-provider") || "generic");
        const eventType = String(
          payload.event || payload.event_type || payload.type || payload.status || "unknown",
        ).toLowerCase();
        const data = payload.data ?? payload;
        const buyer = data.buyer ?? data.customer ?? data.client ?? {};
        const externalId = String(
          data.order_id ?? data.transaction ?? data.id ?? payload.order_id ?? "",
        );

        const { data: logRow } = await supabaseAdmin
          .from("sales_webhook_events")
          .insert({
            provider,
            event_type: eventType,
            external_id: externalId || null,
            signature_valid: valid,
            payload: payload as never,
          })
          .select("id")
          .single();

        if (!valid) {
          return json({ status: "unauthorized", message: "Assinatura inválida." }, 401);
        }

        const finish = async (patch: { processed?: boolean; error?: string | null; license_id?: string | null }) => {
          if (logRow) await supabaseAdmin.from("sales_webhook_events").update(patch).eq("id", logRow.id);
        };

        const APPROVE = [
          "purchase.approved", "order.paid", "payment.approved", "approved", "paid",
          "purchase_approved", "compra_aprovada", "sale.completed", "completed",
        ];
        const CANCEL = ["subscription.canceled", "subscription.cancelled", "canceled", "cancelled", "purchase.canceled"];
        const REFUND = ["refund", "refunded", "purchase.refunded", "chargeback", "purchase.chargeback"];
        const RENEW = ["subscription.renewed", "renewed", "purchase.renewed", "renewal"];

        try {
          if (APPROVE.includes(eventType) || RENEW.includes(eventType)) {
            const email = String(buyer.email ?? data.email ?? "").trim();
            if (!email) {
              await finish({ error: "E-mail do comprador ausente." });
              return json({ status: "error", message: "E-mail do comprador ausente." }, 422);
            }

            // Proteção adicional para as duas ofertas oficiais da página de vendas.
            // Mesmo que um integrador envie um payload genérico sem duration_days/
            // is_lifetime, o código público do checkout determina o prazo correto.
            const nestedPayload = payload.payload ?? {};
            const offer = data.offer ?? nestedPayload.offer ?? payload.offer ?? {};
            const offerCode = String(
              offer.public_id ??
              offer.publicId ??
              data.offer_public_id ??
              nestedPayload.offer_public_id ??
              offer.id ??
              data.offer_id ??
              "",
            ).trim().toLowerCase();
            const isOfficial30Days = offerCode === "qzygzw1";
            const isOfficialLifetime = offerCode === "xy3nvpg";

            const rawDuration = Number(data.duration_days ?? payload.duration_days ?? 0) || null;
            const rawLifetime = Boolean(data.is_lifetime ?? payload.is_lifetime ?? false);
            const durationDays = isOfficial30Days ? 30 : isOfficialLifetime ? null : rawDuration;
            const isLifetime = isOfficialLifetime ? true : isOfficial30Days ? false : rawLifetime;
            const plan = isOfficialLifetime
              ? "lifetime"
              : isOfficial30Days
                ? "monthly"
                : String(data.plan ?? payload.plan ?? "pro");
            const planName = isOfficialLifetime
              ? "Vitalícia"
              : isOfficial30Days
                ? "30 dias"
                : String(data.plan_name ?? payload.plan_name ?? "Plano Pro");

            // Renovação: estende a licença existente do mesmo pedido/cliente.
            if (RENEW.includes(eventType) && externalId) {
              const { data: existing } = await supabaseAdmin
                .from("licenses")
                .select("*")
                .eq("order_id", externalId)
                .maybeSingle();
              if (existing) {
                const base = existing.expires_at && Date.parse(existing.expires_at) > Date.now()
                  ? Date.parse(existing.expires_at)
                  : Date.now();
                const next = new Date(base + (durationDays ?? 30) * 86400000).toISOString();
                await supabaseAdmin
                  .from("licenses")
                  .update({ expires_at: next, status: "active" })
                  .eq("id", existing.id);
                await logEvent(existing.id, "license.renewed", `Renovada até ${next}.`, { provider });
                await dispatchOutbound("license.updated", existing.id);
                await finish({ processed: true, license_id: existing.id });
                return json({
                  status: "ok",
                  action: "renewed",
                  license: { id: existing.id, license_key: existing.license_key, expires_at: next },
                });
              }
            }

            const license = await createLicenseRecord({
              plan,
              plan_name: planName,
              is_lifetime: isLifetime,
              duration_days: durationDays ?? (isLifetime ? null : 365),
              device_limit: Number(data.device_limit ?? payload.device_limit ?? 1) || 1,
              order_id: externalId || null,
              source: provider,
              customer: {
                email,
                full_name: buyer.name ?? buyer.full_name ?? data.name ?? null,
                phone: buyer.phone ?? data.phone ?? null,
                document: buyer.document ?? buyer.doc ?? null,
                external_id: String(buyer.id ?? data.customer_id ?? "") || null,
              },
            });

            await finish({ processed: true, license_id: license.id });
            return json({
              status: "ok",
              action: "created",
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
              customer: { email },
            });
          }

          if (CANCEL.includes(eventType) || REFUND.includes(eventType)) {
            const newStatus = REFUND.includes(eventType) ? "refunded" : "canceled";
            let query = supabaseAdmin.from("licenses").select("id");
            const email = String(buyer.email ?? data.email ?? "").trim();
            if (externalId) query = query.eq("order_id", externalId);
            const { data: found } = await query.limit(5);

            let ids = (found ?? []).map((r) => r.id);
            if (!ids.length && email) {
              const { data: cust } = await supabaseAdmin
                .from("customers")
                .select("id")
                .ilike("email", email)
                .maybeSingle();
              if (cust) {
                const { data: byCust } = await supabaseAdmin
                  .from("licenses")
                  .select("id")
                  .eq("customer_id", cust.id);
                ids = (byCust ?? []).map((r) => r.id);
              }
            }

            for (const id of ids) {
              await supabaseAdmin.from("licenses").update({ status: newStatus }).eq("id", id);
              await supabaseAdmin.from("license_devices").update({ active: false }).eq("license_id", id);
              await logEvent(id, `license.${newStatus}`, `Atualizada por webhook (${eventType}).`, { provider });
              await dispatchOutbound("license.updated", id);
            }
            await finish({ processed: true, license_id: ids[0] ?? null });
            return json({ status: "ok", action: newStatus, affected: ids.length });
          }

          await finish({ processed: true, error: "Evento ignorado." });
          return json({ status: "ignored", event: eventType });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          await finish({ error: message });
          return json({ status: "error", message }, 500);
        }
      },
    },
  },
});