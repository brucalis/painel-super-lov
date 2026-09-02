import { createFileRoute } from "@tanstack/react-router";

const FLOW_MODE = "direct-main-v3";

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
        });
      },
    },
  },
});
