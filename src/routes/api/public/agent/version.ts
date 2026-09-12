import { createFileRoute } from "@tanstack/react-router";

const FLOW_MODE = "direct-main-v7-smart-ai-routing";
const CREDENTIAL_API_VERSION = "ai-credentials-v9-mistral-gemini-cloudflare";
const SUPPORTED_AI_PROVIDERS = ["mistral", "gemini", "cloudflare"] as const;
const REQUIRED_AI_PROVIDERS: readonly string[] = [];

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
          required_ai_providers: [...REQUIRED_AI_PROVIDERS],
          ai_fallback_order: [...SUPPORTED_AI_PROVIDERS],
          smart_routing: {
            simple: ["mistral", "gemini", "cloudflare"],
            medium: ["mistral", "gemini", "cloudflare"],
            complex: ["gemini", "mistral", "cloudflare"],
          },
        });
      },
    },
  },
});
