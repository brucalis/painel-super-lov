import { createFileRoute } from "@tanstack/react-router";

const CREDENTIAL_API_VERSION = "ai-credentials-v2-openrouter";
const SUPPORTED_AI_PROVIDERS = ["groq", "gemini", "openrouter"] as const;

function normalizeProvider(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (normalized === "groq") return "groq";
  if (normalized === "gemini") return "gemini";
  if (normalized === "openrouter") return "openrouter";
  return "";
}

export const Route = createFileRoute("/api/public/agent/ai-credentials")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      GET: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const credentials = await import("@/lib/customer-ai-credentials.server");
          const auth = await agent.requireAgentLicense(request);
          if (!credentials.isCustomerEdition(request)) {
            return json({ ok: false, error: "Recurso exclusivo da edição do cliente." }, 404);
          }
          return json({
            ok: true,
            ...(await credentials.customerCredentialStatus(auth.license.id)),
            credentialApiVersion: CREDENTIAL_API_VERSION,
            supportedProviders: [...SUPPORTED_AI_PROVIDERS],
          });
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: "Não foi possível consultar as credenciais." }, 500);
        }
      },
      PUT: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const credentials = await import("@/lib/customer-ai-credentials.server");
          const auth = await agent.requireAgentLicense(request);
          if (!credentials.isCustomerEdition(request)) {
            return json({ ok: false, error: "Recurso exclusivo da edição do cliente." }, 404);
          }
          const body = (await request.json()) as { provider?: string; api_key?: string };
          const provider = normalizeProvider(body.provider);
          if (!provider) return json({ ok: false, error: "Provedor inválido." }, 400);
          return json({
            ok: true,
            ...(await credentials.saveCustomerAiKey(auth.license.id, provider, body.api_key || "")),
            credentialApiVersion: CREDENTIAL_API_VERSION,
          });
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: "Não foi possível salvar a credencial." }, 500);
        }
      },
      DELETE: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const credentials = await import("@/lib/customer-ai-credentials.server");
          const auth = await agent.requireAgentLicense(request);
          if (!credentials.isCustomerEdition(request)) {
            return json({ ok: false, error: "Recurso exclusivo da edição do cliente." }, 404);
          }
          const provider = normalizeProvider(new URL(request.url).searchParams.get("provider"));
          if (!provider) return json({ ok: false, error: "Provedor inválido." }, 400);
          await credentials.deleteCustomerAiKey(auth.license.id, provider);
          return json({
            ok: true,
            provider,
            configured: false,
            credentialApiVersion: CREDENTIAL_API_VERSION,
          });
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: "Não foi possível remover a credencial." }, 500);
        }
      },
    },
  },
});
