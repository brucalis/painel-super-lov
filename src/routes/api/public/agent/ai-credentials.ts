import { createFileRoute } from "@tanstack/react-router";

const CREDENTIAL_API_VERSION = "ai-credentials-v3-provider-resilience";
const SUPPORTED_AI_PROVIDERS = ["groq", "gemini", "openrouter"] as const;

type Provider = (typeof SUPPORTED_AI_PROVIDERS)[number];

type CredentialBody = {
  provider?: unknown;
  ai_provider?: unknown;
  providerId?: unknown;
  type?: unknown;
  api_key?: unknown;
  apiKey?: unknown;
  key?: unknown;
};

function normalizeProvider(value: unknown): Provider | "" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

  if (normalized.includes("openrouter")) return "openrouter";
  if (normalized.includes("groq")) return "groq";
  if (normalized.includes("gemini")) return "gemini";
  return "";
}

function inferProviderFromKey(value: unknown): Provider | "" {
  const apiKey = String(value ?? "").trim();
  if (/^sk-or-/i.test(apiKey)) return "openrouter";
  if (/^gsk_/i.test(apiKey)) return "groq";
  if (/^AIza/i.test(apiKey)) return "gemini";
  return "";
}

function resolveProvider(body: CredentialBody) {
  const apiKey = String(body.api_key ?? body.apiKey ?? body.key ?? "").trim();
  const candidates = [body.provider, body.ai_provider, body.providerId, body.type];
  const provider = candidates.map(normalizeProvider).find(Boolean) || inferProviderFromKey(apiKey);
  return { provider, apiKey };
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
          const body = (await request.json()) as CredentialBody;
          const { provider, apiKey } = resolveProvider(body);
          if (!provider) {
            return json(
              {
                ok: false,
                error: "Provedor inválido.",
                credentialApiVersion: CREDENTIAL_API_VERSION,
                supportedProviders: [...SUPPORTED_AI_PROVIDERS],
              },
              400,
            );
          }
          return json({
            ok: true,
            ...(await credentials.saveCustomerAiKey(auth.license.id, provider, apiKey)),
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