import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/project/remove-badge")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const tools = await import("@/lib/github-project-tools.server");
          const auth = await agent.requireAgentLicense(request);
          return json({ ok: true, ...(await tools.removeLovableBadgeViaGithub(auth.license.id)) });
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: error instanceof Error ? error.message : "Falha ao remover a badge." }, 500);
        }
      },
    },
  },
});
