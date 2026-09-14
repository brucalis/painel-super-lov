import { createFileRoute } from "@tanstack/react-router";

const CREDENTIAL_API_VERSION = "ai-credentials-mistral-direct-v1";

export const Route = createFileRoute("/api/public/agent/ai-credentials-mistral")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      PUT: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const credentials = await import("@/lib/customer-ai-credentials.server");
          const auth = await agent.requireAgentLicense(request);
          if (!credentials.isCustomerEdition(request)) {
            return json({ ok: false, error: "Recurso exclusivo da edição do cliente." }, 404);
          }

          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const apiKey = String(body.api_key ?? body.apiKey ?? body.key ?? "").trim();
          if (!apiKey) {
            return json({ ok: false, error: "Cole sua chave da Mistral para continuar." }, 422);
          }

          const result = await credentials.saveCustomerAiKey(auth.license.id, "mistral", apiKey);
          return json({
            ok: true,
            ...result,
            provider: "mistral",
            credentialApiVersion: CREDENTIAL_API_VERSION,
          });
        } catch (error) {
          if (error instanceof Response) {
            return json({ ok: false, error: await error.text() }, error.status);
          }
          console.error("[customer-ai/mistral-direct] falha inesperada", error);
          return json({ ok: false, error: "Não foi possível salvar a credencial da Mistral." }, 500);
        }
      },
    },
  },
});
