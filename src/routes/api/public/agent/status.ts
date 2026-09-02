import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/status")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      GET: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const auth = await agent.requireAgentLicense(request);
          const [connection, runnerHealth] = await Promise.all([
            agent.getLicenseConnection(auth.license.id),
            agent.getBuildRunnerHealth(),
          ]);
          const runnerError = "error" in runnerHealth ? runnerHealth.error : null;

          // O runner é uma camada de validação, não uma etapa de autorização.
          // A extensão permanece operacional se ele estiver temporariamente indisponível.
          const runner = {
            ...runnerHealth,
            validation_configured: runnerHealth.configured,
            validation_ok: runnerHealth.ok,
            validation_error: runnerHealth.ok ? null : runnerError,
            configured: true,
            ok: true,
            advisory: true,
          };

          return json({
            ok: true,
            configured: Boolean(
              process.env.GITHUB_APP_ID &&
                process.env.GITHUB_CLIENT_ID &&
                process.env.GITHUB_CLIENT_SECRET &&
                process.env.GITHUB_PRIVATE_KEY &&
                process.env.GITHUB_APP_SLUG,
            ),
            ai: {
              gemini: Boolean(process.env.GEMINI_API_KEY),
              groq: Boolean(process.env.GROQ_API_KEY),
            },
            runner,
            connection,
          });
        } catch (error) {
          if (error instanceof Response) {
            return json({ ok: false, error: await error.text() }, error.status);
          }
          return json({ ok: false, error: "Não foi possível consultar o agente." }, 500);
        }
      },
    },
  },
});
