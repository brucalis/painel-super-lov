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
          const auth = await agent.requireAgentLicense(request);
          const body = (await request.json()) as {
            prompt?: string;
            reduced_context?: boolean;
          };
          const prompt = String(body.prompt || "").trim();
          if (prompt.length < 3)
            return json({ ok: false, error: "Descreva a alteração desejada." }, 400);
          if (prompt.length > 8_000)
            return json({ ok: false, error: "O pedido é muito longo." }, 413);

          return json({
            ok: true,
            resilient: true,
            ...(await resilient.planAgentRunResilient(auth, prompt, {
              reducedContext: Boolean(body.reduced_context),
            })),
          });
        } catch (error) {
          if (error instanceof Response)
            return json({ ok: false, error: await error.text() }, error.status);
          const agent = await import("@/lib/github-agent.server");
          const details = agent.agentErrorDetails(error);
          return json(
            {
              ok: false,
              error: details.message,
              code: details.code,
              retryable: details.retryable,
            },
            details.status,
          );
        }
      },
    },
  },
});
