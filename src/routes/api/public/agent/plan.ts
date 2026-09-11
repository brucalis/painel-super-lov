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
          const credentials = await import("@/lib/customer-ai-credentials.server");
          const customerAgent = await import("@/lib/github-agent-customer-stack.server");
          const auth = await agent.requireAgentLicense(request);
          const customerEdition = credentials.isCustomerEdition(request);
          const body = (await request.json()) as { prompt?: string; reduced_context?: boolean };
          const prompt = String(body.prompt || "").trim();
          if (prompt.length < 3) return json({ ok: false, error: "Descreva a alteração desejada." }, 400);
          if (prompt.length > 8_000) return json({ ok: false, error: "O pedido é muito longo." }, 413);

          if (!customerEdition) {
            return json({
              ok: true,
              resilient: true,
              ...(await resilient.planAgentRunResilient(auth, prompt, {
                reducedContext: Boolean(body.reduced_context),
              })),
            });
          }

          const stack = await credentials.customerProviderStack(request, auth.license.id);
          if (!stack.cloudflare) {
            return json(
              {
                ok: false,
                error: "Conecte a Cloudflare para usar a Super Lovable. Gemini e OpenRouter são contingências opcionais.",
                code: "CUSTOMER_REQUIRED_AI_NOT_CONFIGURED",
                requiredProviders: ["cloudflare"],
              },
              428,
            );
          }

          const providers = [stack.cloudflare, stack.gemini, stack.openrouter].filter(
            (credential): credential is NonNullable<typeof credential> => Boolean(credential),
          );
          const traceId = crypto.randomUUID();
          const prepared = await customerAgent.prepareCustomerPlan(auth, prompt, {
            reducedContext: Boolean(body.reduced_context),
          });
          const failures: Array<{ provider: string; status: number; message: string; durationMs: number }> = [];
          let lastError: unknown = null;

          const readFailure = async (error: unknown) => {
            let status = 503;
            let message = "indisponível nesta tentativa";
            if (error instanceof Response) {
              status = error.status;
              message = await error.clone().text().catch(() => message);
            } else {
              const details = agent.agentErrorDetails(error);
              status = details.status;
              message = details.message;
            }
            const safeMessage = String(message || "indisponível nesta tentativa")
              .replace(/(?:sk|AIza|gsk_|eyJ)[A-Za-z0-9._-]{12,}/g, "[credencial oculta]")
              .slice(0, 180);
            return { status, message: safeMessage };
          };

          for (const credential of providers) {
            const startedAt = Date.now();
            try {
              const result = await customerAgent.planPreparedCustomerProvider(auth, prompt, credential, prepared);
              return json({
                ok: true,
                resilient: true,
                traceId,
                providerUsed: credential.provider,
                providerAttempt: 1,
                ...result,
              });
            } catch (error) {
              lastError = error;
              const failure = await readFailure(error);
              failures.push({ provider: credential.provider, ...failure, durationMs: Date.now() - startedAt });
            }
            const failure = failures[failures.length - 1];
            console.warn("[github-agent/customer-stack] provedor falhou; tentando próximo", {
              traceId,
              provider: credential.provider,
              status: failure.status,
              message: failure.message,
              durationMs: failure.durationMs,
            });
          }

          const summary = failures
            .map((item) => `${item.provider}: ${item.status}${item.message ? ` (${item.message})` : ""}`)
            .join(" · ")
            .slice(0, 520);
          const errorMessage = summary
            ? `Nenhuma das IAs configuradas conseguiu concluir o planejamento. Diagnóstico: ${summary}`
            : "Nenhuma das IAs configuradas conseguiu concluir o planejamento agora. Suas credenciais continuam salvas para a próxima tentativa.";

          if (lastError instanceof Response) {
            return json(
              {
                ok: false,
                error: errorMessage,
                code: "CUSTOMER_AI_STACK_EXHAUSTED",
                traceId,
                providerFailures: failures,
                retryable: failures.some((item) => item.status === 408 || item.status === 429 || item.status >= 500),
              },
              lastError.status >= 400 && lastError.status < 600 ? lastError.status : 503,
            );
          }
          return json(
            {
              ok: false,
              error: errorMessage,
              code: "CUSTOMER_AI_STACK_EXHAUSTED",
              traceId,
              providerFailures: failures,
              retryable: failures.some((item) => item.status === 408 || item.status === 429 || item.status >= 500),
            },
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
