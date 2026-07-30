import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/projects/remove-watermark")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        const { removeWatermark } = await import("@/lib/watermark.server");

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }

        const result = await removeWatermark({
          projectId: String(body.projectId ?? ""),
          deviceId: String(body.deviceId ?? ""),
          licenseKey: String(body.licenseKey ?? ""),
        });

        return json(result.body, result.http);
      },
    },
  },
});
