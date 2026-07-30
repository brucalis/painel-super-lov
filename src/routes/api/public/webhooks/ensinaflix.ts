import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook PÚBLICO da Ensinaflix.
 * POST /api/public/webhooks/ensinaflix
 * Sem sessão, sem cookie, sem JWT de usuário e sem papel de administrador.
 * A proteção é um segredo exclusivo do webhook (header `x-webhook-secret` ou `?secret=`).
 */
export const Route = createFileRoute("/api/public/webhooks/ensinaflix")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflightRes } = await import("@/lib/ensinaflix.server");
        return preflightRes();
      },
      GET: async () => {
        const { jsonRes } = await import("@/lib/ensinaflix.server");
        return jsonRes({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
      },
      POST: async ({ request }) => {
        const started = Date.now();
        const {
          jsonRes,
          normalizeEnsinaflixWebhook,
          eventKeyFor,
          processEnsinaflixEvent,
          maskEmail,
        } = await import("@/lib/ensinaflix.server");
        const { safeEqual, getSetting } = await import("@/lib/license.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const raw = await request.text();

        let body: Record<string, any> = {};
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          return jsonRes(
            { success: false, error: "INVALID_PAYLOAD", message: "Payload obrigatório incompleto." },
            400,
          );
        }

        const n = normalizeEnsinaflixWebhook(body);

        // Registra tentativas recusadas para aparecerem no painel (diagnóstico).
        const logRejected = async (error: string, status: number) => {
          try {
            await supabaseAdmin.from("webhook_events").insert({
              provider: "ensinaflix",
              event_key: `ensinaflix:rejected:${error}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
              event_type: n.eventType || "desconhecido",
              event_label: n.eventLabel,
              order_id: n.orderId,
              customer_email: n.customerEmail,
              payload: body as never,
              is_test: n.isTest,
              environment: n.isTest ? "sandbox" : "production",
              processing_status: "failed",
              processing_error: error,
              http_status: status,
              duration_ms: Date.now() - started,
              processed_at: new Date().toISOString(),
            });
          } catch {
            /* nunca derruba o webhook por causa do log */
          }
        };

        // ---- segredo próprio do webhook -------------------------------------
        const configured =
          process.env.ENSAINAFLIX_WEBHOOK_SECRET ||
          process.env.ENSINAFLIX_WEBHOOK_SECRET ||
          (await getSetting("ensinaflix_webhook_secret")) ||
          "";
        const allowUnsignedTest = process.env.ALLOW_UNSIGNED_TEST_WEBHOOKS !== "false";

        if (configured) {
          const url = new URL(request.url);
          const headerSecret =
            request.headers.get("x-webhook-secret") ||
            request.headers.get("x-secret") ||
            request.headers.get("x-api-key") ||
            request.headers.get("x-webhook-token") ||
            (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
          const provided =
            headerSecret ||
            url.searchParams.get("secret") ||
            url.searchParams.get("token") ||
            (typeof body?.secret === "string" ? body.secret : "") ||
            "";
          const ok = provided ? safeEqual(provided, configured) : false;
          if (!ok && !(n.isTest && allowUnsignedTest && !provided)) {
            await logRejected("INVALID_WEBHOOK_SECRET", 401);
            return jsonRes(
              {
                success: false,
                error: "INVALID_WEBHOOK_SECRET",
                message: provided
                  ? "Segredo enviado não confere."
                  : "Nenhum segredo recebido. Use ?secret=… na URL ou o cabeçalho x-webhook-secret.",
              },
              401,
            );
          }
        }

        // ---- validação mínima -----------------------------------------------
        if (!body.event || !body.payload || !n.orderId || !n.customerEmail) {
          const faltando = [
            !body.event && "event",
            !body.payload && "payload",
            !n.orderId && "payload.order.id",
            !n.customerEmail && "payload.customer.email",
          ].filter(Boolean);
          await logRejected(`INVALID_PAYLOAD: ${faltando.join(", ")}`, 400);
          return jsonRes(
            {
              success: false,
              error: "INVALID_PAYLOAD",
              message: `Payload obrigatório incompleto. Faltando: ${faltando.join(", ")}`,
            },
            400,
          );
        }


        const eventKey = eventKeyFor(n, raw);
        const environment = n.isTest ? "sandbox" : "production";

        // ---- idempotência ----------------------------------------------------
        const { data: already } = await supabaseAdmin
          .from("webhook_events")
          .select("id, processing_status")
          .eq("provider", "ensinaflix")
          .eq("event_key", eventKey)
          .maybeSingle();

        if (already) {
          return jsonRes({ success: true, duplicate: true, message: "Evento já processado." });
        }

        const { data: logRow } = await supabaseAdmin
          .from("webhook_events")
          .insert({
            provider: "ensinaflix",
            event_key: eventKey,
            event_type: n.eventType,
            event_label: n.eventLabel,
            order_id: n.orderId,
            customer_email: n.customerEmail,
            payload: body as never,
            is_test: n.isTest,
            environment,
            processing_status: "processing",
          })
          .select("id")
          .single();

        const finish = async (patch: Record<string, unknown>, status: number, payload: unknown) => {
          if (logRow)
            await supabaseAdmin
              .from("webhook_events")
              .update({
                ...patch,
                http_status: status,
                duration_ms: Date.now() - started,
                processed_at: new Date().toISOString(),
              })
              .eq("id", logRow.id);
          console.log(
            JSON.stringify({
              provider: "ensinaflix",
              event: n.eventType,
              orderId: n.orderId,
              email: maskEmail(n.customerEmail ?? ""),
              isTest: n.isTest,
              result: patch.processing_status,
              durationMs: Date.now() - started,
              httpStatus: status,
            }),
          );
          return jsonRes(payload as never, status);
        };

        // ---- evento de teste: valida tudo, sem tocar em dados reais ----------
        if (n.isTest) {
          return finish({ processing_status: "processed" }, 200, {
            success: true,
            test: true,
            message: "Webhook de teste recebido com sucesso.",
            event: n.eventType,
            order_id: n.orderId,
          });
        }

        try {
          const result = await processEnsinaflixEvent(n);
          if (!result.processed) {
            return finish(
              {
                processing_status: result.reason === "EVENT_IGNORED" ? "ignored" : "processed",
                processing_error: result.reason ?? null,
                license_id: result.licenseId ?? null,
              },
              200,
              { success: true, processed: false, reason: result.reason },
            );
          }
          return finish(
            { processing_status: "processed", license_id: result.licenseId ?? null },
            200,
            {
              success: true,
              processed: true,
              action: result.action,
              license: result.license ?? null,
            },
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return finish({ processing_status: "failed", processing_error: message }, 500, {
            success: false,
            error: "INTERNAL_ERROR",
            message,
          });
        }
      },
    },
  },
});
