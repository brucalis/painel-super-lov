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
          if (!stack.grok || !stack.cloudflare) {
            return json(
              {
                ok: false,
                error: "Conecte Grok e Cloudflare para usar a Super Lovable. Gemini e OpenRouter são contingências opcionais.",
                code: "CUSTOMER_REQUIRED_AI_NOT_CONFIGURED",
                requiredProviders: ["grok", "cloudflare"],
              },
              428,
            );
          }

          const providers = [stack.grok, stack.cloudflare, stack.gemini, stack.openrouter].filter(
            (credential): credential is NonNullable<typeof credential> => Boolean(credential),
          );
          let lastError: unknown = null;
          for (const credential of providers) {
            try {
              const result = await customerAgent.planAgentRunCustomerProvider(
                auth,
                prompt,
                credential,
              );
              return json({ ok: true, resilient: true, providerUsed: credential.provider, ...result });
            } catch (error) {
              lastError = error;
              const details = agent.agentErrorDetails(error);
              console.warn("[github-agent/customer-stack] provedor falhou; tentando próximo", {
                provider: credential.provider,
                code: details.code,
                status: details.status,
                message: details.message,
              });
            }
          }

          if (lastError instanceof Response) {
            return json(
              {
                ok: false,
                error: "Nenhuma das IAs configuradas conseguiu concluir o planejamento agora. Suas credenciais continuam salvas para a próxima tentativa.",
                code: "CUSTOMER_AI_STACK_EXHAUSTED",
              },
              lastError.status >= 400 && lastError.status < 600 ? lastError.status : 503,
            );
          }
          return json(
            {
              ok: false,
              error: "Nenhuma das IAs configuradas conseguiu concluir o planejamento agora. Suas credenciais continuam salvas para a próxima tentativa.",
              code: "CUSTOMER_AI_STACK_EXHAUSTED",
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
