import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/status")({
  server: { handlers: {
    OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
    GET: async ({ request }) => {
      const { json } = await import("@/lib/license.server");
      try {
        const agent = await import("@/lib/github-agent.server");
        const auth = await agent.requireAgentLicense(request);
        const connection = await agent.getLicenseConnection(auth.license.id);
        return json({ ok: true, configured: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.GITHUB_PRIVATE_KEY && process.env.GITHUB_APP_SLUG), ai: { gemini: Boolean(process.env.GEMINI_API_KEY), groq: Boolean(process.env.GROQ_API_KEY) }, connection });
      } catch (error) {
        if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
        return json({ ok: false, error: "Não foi possível consultar o agente." }, 500);
      }
    },
  } },
});
