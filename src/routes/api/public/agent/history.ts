import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/history")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      GET: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const history = await import("@/lib/github-agent-history.server");
          const auth = await agent.requireAgentLicense(request);
          const url = new URL(request.url);
          const limit = Number(url.searchParams.get("limit") || 80);
          return json({ ok: true, history: await history.getAgentHistory(auth, limit) });
        } catch (error) {
          if (error instanceof Response) {
            return json({ ok: false, error: await error.text() }, error.status);
          }
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Falha ao carregar histórico.",
            },
            500,
          );
        }
      },
    },
  },
});
