import { createFileRoute } from "@tanstack/react-router";

const FLOW_MODE = "direct-main-v3";
const CREDENTIAL_API_VERSION = "ai-credentials-v4-openrouter-fallback";
const SUPPORTED_AI_PROVIDERS = ["groq", "gemini", "openrouter"] as const;

export const Route = createFileRoute("/api/public/agent/version")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      GET: async () => {
        const { json } = await import("@/lib/license.server");
        return json({
          ok: true,
          service: "super-lovable-agent",
          flow_mode: FLOW_MODE,
          creates_pull_requests: false,
          target_branch: "main",
          validation_mode: "static-before-direct-commit",
          credential_api_version: CREDENTIAL_API_VERSION,
          supported_ai_providers: [...SUPPORTED_AI_PROVIDERS],
        });
      },
    },
  },
});