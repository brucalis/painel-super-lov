import { createFileRoute } from "@tanstack/react-router";

const FLOW_MODE = "direct-main-v3";
const CREDENTIAL_API_VERSION = "ai-credentials-v5-library-normalization";
const SUPPORTED_AI_PROVIDERS = ["groq", "gemini", "openrouter"] as const;

export const Route = createFileRoute("/api/public/agent/version")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      GET: async () => {
        const { json } = await import("@/lib/license.server");
        const credentials = await import("@/lib/customer-ai-credentials.server");
        return json({
          ok: true,
          service: "super-lovable-agent",
          flow_mode: FLOW_MODE,
          creates_pull_requests: false,
          target_branch: "main",
          validation_mode: "static-before-direct-commit",
          credential_api_version: CREDENTIAL_API_VERSION,
          customer_ai_module_version: credentials.CUSTOMER_AI_CREDENTIALS_VERSION,
          supported_ai_providers: [...SUPPORTED_AI_PROVIDERS],
        });
      },
    },
  },
});
