import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/rollback")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const direct = await import("@/lib/github-agent-direct.server");
          const auth = await agent.requireAgentLicense(request);
          const body = (await request.json()) as { run_id?: string };
          return json({
            ok: true,
            flow_mode: "direct-main-v3",
            ...(await direct.rollbackAgentRunDirect(auth, String(body.run_id || ""))),
          });
        } catch (error) {
          if (error instanceof Response) {
            return json({ ok: false, error: await error.text() }, error.status);
          }
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Não foi possível desfazer a alteração.",
            },
            500,
          );
        }
      },
    },
  },
});
