import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/plan")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const resilient = await import("@/lib/github-agent-resilient.server");
          const openrouterAgent = await import("@/lib/github-agent-openrouter.server");
          const credentials = await import("@/lib/customer-ai-credentials.server");
          const auth = await agent.requireAgentLicense(request);
          const customerEdition = credentials.isCustomerEdition(request);
          const [ai, openrouter] = await Promise.all([
            credentials.customerAiProvider(request, auth.license.id, false),
            credentials.customerOpenRouterProvider(request, auth.license.id),
          ]);
          const body = (await request.json()) as { prompt?: string; reduced_context?: boolean };
          const prompt = String(body.prompt || "").trim();
          if (prompt.length < 3) return json({ ok: false, error: "Descreva a alteração desejada." }, 400);
          if (prompt.length > 8_000) return json({ ok: false, error: "O pedido é muito longo." }, 413);

          if (customerEdition && !ai && !openrouter) {
            return json(
              {
                ok: false,
                error: "Conecte pelo menos uma API: Groq, Gemini ou OpenRouter.",
                code: "CUSTOMER_AI_NOT_CONFIGURED",
              },
              428,
            );
          }

          if (ai || !customerEdition) {
            try {
              return json({
                ok: true,
                resilient: true,
                ...(await resilient.planAgentRunResilient(auth, prompt, {
                  reducedContext: Boolean(body.reduced_context),
                  ai,
                })),
              });
            } catch (primaryError) {
              const details = agent.agentErrorDetails(primaryError);
              const fallbackCodes = new Set([
                "AI_RATE_LIMITED",
                "AI_PROVIDER_UNAVAILABLE",
                "CUSTOMER_AI_UNAUTHORIZED",
                "AI_CONTEXT_TOO_LARGE",
                "AI_PLAN_TRUNCATED",
                "CONTEXT_ROUNDS_EXHAUSTED",
                "AI_EDIT_NOT_UNIQUE",
                "AI_INVALID_EDIT_PATH",
                "AI_CHANGE_TOO_BROAD",
              ]);
              const canFallback = Boolean(
                customerEdition &&
                  openrouter &&
                  (details.retryable || fallbackCodes.has(details.code) || details.status >= 500),
              );
              if (!canFallback) throw primaryError;
              console.warn("[github-agent/plan] Groq/Gemini falharam; acionando OpenRouter", {
                code: details.code,
                status: details.status,
                message: details.message,
              });
            }
          }

          if (customerEdition && openrouter) {
            return json({
              ok: true,
              resilient: true,
              ...(await openrouterAgent.planAgentRunOpenRouter(auth, prompt, openrouter)),
            });
          }

          return json(
            { ok: false, error: "Nenhum provedor de IA conseguiu iniciar o planejamento." },
            503,
          );
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          const agent = await import("@/lib/github-agent.server");
          const details = agent.agentErrorDetails(error);
          return json({ ok: false, error: details.message, code: details.code, retryable: details.retryable }, details.status);
        }
      },
    },
  },
});
