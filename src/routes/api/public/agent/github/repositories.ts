import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/agent/github/repositories")({ server: { handlers: {
  OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
  GET: async ({ request }) => {
    const { json } = await import("@/lib/license.server");
    try { const agent = await import("@/lib/github-agent.server"); const auth = await agent.requireAgentLicense(request); return json({ ok: true, repositories: await agent.repositoriesForLicense(auth.license.id) }); }
    catch (error) { if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status); return json({ ok: false, error: error instanceof Error ? error.message : "Falha ao listar projetos." }, 500); }
  },
  POST: async ({ request }) => {
    const { json } = await import("@/lib/license.server");
    try { const agent = await import("@/lib/github-agent.server"); const auth = await agent.requireAgentLicense(request); const body = await request.json() as { repository?: string; branch?: string }; return json({ ok: true, ...(await agent.bindRepository(auth.license.id, String(body.repository || ""), body.branch)) }); }
    catch (error) { if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status); return json({ ok: false, error: error instanceof Error ? error.message : "Falha ao selecionar projeto." }, 500); }
  },
} } });

