import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/validate-license")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json, sha256, effectiveStatus, versionLt, licenseResponse } = await import(
          "@/lib/license.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json({ status: "invalid", message: "Sem token." }, 401);

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }
        const version = String(body.extension_version ?? "0.0.0");

        const { data: device } = await supabaseAdmin
          .from("license_devices")
          .select("*, licenses(*)")
          .eq("token_hash", sha256(token))
          .maybeSingle();

        if (!device || !device.active || !device.licenses) {
          return json({ status: "device_not_authorized", message: "Dispositivo não autorizado." }, 403);
        }

        const license = device.licenses;
        const status = effectiveStatus(license);
        if (status !== "active") {
          return json({ status, message: "Licença indisponível." }, status === "expired" ? 402 : 403);
        }
        if (license.minimum_version && versionLt(version, license.minimum_version)) {
          return json({ status: "version_too_old", minimum_version: license.minimum_version }, 426);
        }

        const now = new Date().toISOString();
        await supabaseAdmin
          .from("license_devices")
          .update({ last_seen_at: now, extension_version: version })
          .eq("id", device.id);
        await supabaseAdmin.from("licenses").update({ last_validated_at: now }).eq("id", license.id);

        return json(await licenseResponse(license, token, device.device_id));
      },
    },
  },
});
