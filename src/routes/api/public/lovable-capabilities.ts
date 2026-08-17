import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/lovable-capabilities")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      GET: async () => {
        const { json } = await import("@/lib/license.server");
        const { officialCapabilities } = await import("@/lib/lovable-official.server");
        return json({ ok: true, ...officialCapabilities() });
      },
    },
  },
});
