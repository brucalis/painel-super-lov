import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/projects/watermark-status")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        const { watermarkStatus } = await import("@/lib/watermark.server");

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }

        const res = await watermarkStatus(String(body.projectId ?? ""), String(body.licenseKey ?? ""));
        if (!res.ok) return json({ ok: false, code: "LICENSE_INVALID", message: "Licença inválida." }, 401);
        return json({ ok: true, last: res.last });
      },
    },
  },
});
