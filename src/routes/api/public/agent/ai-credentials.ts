import { createFileRoute } from "@tanstack/react-router";

const CREDENTIAL_API_VERSION = "ai-credentials-v7-cloudflare-primary";
const SUPPORTED_AI_PROVIDERS = ["cloudflare", "gemini", "openrouter"] as const;
const REQUIRED_AI_PROVIDERS = ["cloudflare"] as const;
type Provider = (typeof SUPPORTED_AI_PROVIDERS)[number];

type CredentialBody = {
  provider?: unknown;
  ai_provider?: unknown;
  providerId?: unknown;
  type?: unknown;
  api_key?: unknown;
  apiKey?: unknown;
  key?: unknown;
  account_id?: unknown;
  accountId?: unknown;
};

function normalizeProvider(value: unknown): Provider | "" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  if (normalized.includes("openrouter")) return "openrouter";
  if (normalized.includes("cloudflare")) return "cloudflare";
  if (normalized.includes("gemini")) return "gemini";
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
          if (!credentials.isCustomerEdition(request)) return json({ ok: false, error: "Recurso exclusivo da edição do cliente." }, 404);
          return json({
            ok: true,
            ...(await credentials.customerCredentialStatus(auth.license.id)),
            credentialApiVersion: CREDENTIAL_API_VERSION,
            supportedProviders: [...SUPPORTED_AI_PROVIDERS],
            requiredProviders: [...REQUIRED_AI_PROVIDERS],
            fallbackOrder: [...SUPPORTED_AI_PROVIDERS],
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
          if (!credentials.isCustomerEdition(request)) return json({ ok: false, error: "Recurso exclusivo da edição do cliente." }, 404);
          const body = (await request.json().catch(() => ({}))) as CredentialBody;
          const provider = normalizeProvider(body.provider ?? body.ai_provider ?? body.providerId ?? body.type);
          const apiKey = String(body.api_key ?? body.apiKey ?? body.key ?? "").trim();
          const accountId = String(body.account_id ?? body.accountId ?? "").trim();
          if (!provider) return json({ ok: false, error: "Provedor inválido (rota v7).", supportedProviders: [...SUPPORTED_AI_PROVIDERS] }, 400);
          return json({
            ok: true,
            ...(await credentials.saveCustomerAiKey(auth.license.id, provider, apiKey, { accountId })),
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
          if (!credentials.isCustomerEdition(request)) return json({ ok: false, error: "Recurso exclusivo da edição do cliente." }, 404);
          const provider = normalizeProvider(new URL(request.url).searchParams.get("provider"));
          if (!provider) return json({ ok: false, error: "Provedor inválido (rota v7)." }, 400);
          await credentials.deleteCustomerAiKey(auth.license.id, provider);
          return json({ ok: true, provider, configured: false, credentialApiVersion: CREDENTIAL_API_VERSION });
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: "Não foi possível remover a credencial." }, 500);
        }
      },
    },
  },
});
