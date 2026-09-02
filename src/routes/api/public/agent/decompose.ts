import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/decompose")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          await agent.requireAgentLicense(request);
          const body = (await request.json()) as { prompt?: string };
          const prompt = String(body.prompt || "").trim();
          if (prompt.length < 3)
            return json({ ok: false, error: "Descreva a alteração desejada." }, 400);
          if (prompt.length > 12_000)
            return json({ ok: false, error: "O pedido é muito longo para uma única tarefa." }, 413);

          const batches = await import("@/lib/github-agent-batches.server");
          return json({ ok: true, ...(await batches.decomposeAgentPrompt(prompt)) });
        } catch (error) {
          if (error instanceof Response)
            return json({ ok: false, error: await error.text() }, error.status);
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Não foi possível organizar o pedido em etapas.",
            },
            500,
          );
        }
      },
    },
  },
});
