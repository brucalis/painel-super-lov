import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/status")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      GET: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const credentials = await import("@/lib/customer-ai-credentials.server");
          const auth = await agent.requireAgentLicense(request);
          const customerEdition = credentials.isCustomerEdition(request);
          const [connection, runnerHealth, customerAi] = await Promise.all([
            agent.getLicenseConnection(auth.license.id),
            agent.getBuildRunnerHealth(),
            customerEdition ? credentials.customerCredentialStatus(auth.license.id) : Promise.resolve(null),
          ]);
          const runnerError = "error" in runnerHealth ? runnerHealth.error : null;
          const runner = {
            ...runnerHealth,
            validation_configured: runnerHealth.configured,
            validation_ok: runnerHealth.ok,
            validation_error: runnerHealth.ok ? null : runnerError,
            configured: true,
            ok: true,
            advisory: true,
          };
          const customerOperational = Boolean(customerAi?.requiredConfigured);
          const actualMistral = customerAi?.mistral || { configured: false };
          const actualGemini = customerAi?.gemini || { configured: false };
          const actualCloudflare = customerAi?.cloudflare || { configured: false };
          return json({
            ok: true,
            flow_mode: "direct-main-v7-smart-ai-routing",
            edition: customerEdition ? "11.09.S3" : "32.0.44",
            configured: Boolean(
              process.env.GITHUB_APP_ID && process.env.GITHUB_CLIENT_ID &&
              process.env.GITHUB_CLIENT_SECRET && process.env.GITHUB_PRIVATE_KEY &&
              process.env.GITHUB_APP_SLUG
            ),
            ai: {
              customerConfigured: customerOperational,
              configuredCount: Number(customerAi?.configuredCount || 0),
              mistral: customerEdition ? actualMistral : { configured: false },
              gemini: customerEdition ? actualGemini : Boolean(process.env.GEMINI_API_KEY),
              cloudflare: customerEdition ? actualCloudflare : { configured: false },
              groq: customerEdition ? { configured: false } : Boolean(process.env.GROQ_API_KEY),
              providerStatus: customerEdition
                ? { mistral: actualMistral, gemini: actualGemini, cloudflare: actualCloudflare }
                : null,
            },
            runner,
            connection,
          });
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: "Não foi possível consultar o agente." }, 500);
        }
      },
    },
  },
});
