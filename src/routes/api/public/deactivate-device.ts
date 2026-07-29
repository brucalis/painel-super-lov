import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/deactivate-device")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json, sha256, logEvent } = await import("@/lib/license.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json({ status: "invalid" }, 401);

        const { data: device } = await supabaseAdmin
          .from("license_devices")
          .select("id, license_id, device_name")
          .eq("token_hash", sha256(token))
          .maybeSingle();

        if (device) {
          await supabaseAdmin
            .from("license_devices")
            .update({ active: false, token_hash: sha256(`revoked:${device.id}:${Date.now()}`) })
            .eq("id", device.id);
          await logEvent(
            device.license_id,
            "device.deactivated",
            `Dispositivo desativado (${device.device_name ?? device.id}).`,
          );
        }
        return json({ status: "ok", server_time: new Date().toISOString() });
      },
    },
  },
});
