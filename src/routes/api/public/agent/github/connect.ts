import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/github/connect")({
  server: { handlers: {
    OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
    POST: async ({ request }) => {
      const { json } = await import("@/lib/license.server");
      try {
        const agent = await import("@/lib/github-agent.server");
        const auth = await agent.requireAgentLicense(request);
        const authorizeUrl = await agent.startLicenseGithubConnection(request, auth.license.id);
        return json({ ok: true, authorize_url: authorizeUrl });
      } catch (error) {
        if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
        return json({ ok: false, error: error instanceof Error ? error.message : "Falha ao conectar." }, 500);
      }
    },
  } },
});

