import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/activate-license")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const {
          json,
          normalizeKey,
          newToken,
          effectiveStatus,
          versionLt,
          licenseResponse,
          logEvent,
        } = await import("@/lib/license.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ status: "invalid", message: "Requisição inválida." }, 400);
        }

        const key = normalizeKey(String(body.license_key ?? ""));
        const deviceId = String(body.device_id ?? "").trim();
        const deviceName = String(body.device_name ?? "").slice(0, 120) || null;
        const version = String(body.extension_version ?? "0.0.0");

        if (!/^LVA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key) || !deviceId) {
          return json({ status: "invalid", message: "Chave ou dispositivo inválido." }, 400);
        }

        const { data: license } = await supabaseAdmin
          .from("licenses")
          .select("*")
          .eq("license_key", key)
          .maybeSingle();

        if (!license) return json({ status: "invalid", message: "Chave não reconhecida." }, 404);

        const status = effectiveStatus(license);
        if (status !== "active") {
          await logEvent(license.id, "activation.denied", `Ativação negada: ${status}.`, { deviceId });
          return json({ status, message: "Licença indisponível." }, status === "expired" ? 402 : 403);
        }

        if (license.minimum_version && versionLt(version, license.minimum_version)) {
          return json({ status: "version_too_old", minimum_version: license.minimum_version }, 426);
        }

        const { data: existing } = await supabaseAdmin
          .from("license_devices")
          .select("*")
          .eq("license_id", license.id)
          .eq("device_id", deviceId)
          .maybeSingle();

        if (!existing) {
          const { count } = await supabaseAdmin
            .from("license_devices")
            .select("id", { count: "exact", head: true })
            .eq("license_id", license.id)
            .eq("active", true);
          if ((count ?? 0) >= license.device_limit) {
            await logEvent(license.id, "activation.denied", "Limite de dispositivos atingido.", {
              deviceId,
            });
            return json({ status: "device_limit", device_limit: license.device_limit }, 409);
          }
        }

        const { token, hash } = newToken();
        if (existing) {
          await supabaseAdmin
            .from("license_devices")
            .update({
              token_hash: hash,
              active: true,
              device_name: deviceName,
              extension_version: version,
              last_seen_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabaseAdmin.from("license_devices").insert({
            license_id: license.id,
            device_id: deviceId,
            device_name: deviceName,
            extension_version: version,
            token_hash: hash,
          });
        }

        await supabaseAdmin
          .from("licenses")
          .update({ last_validated_at: new Date().toISOString() })
          .eq("id", license.id);
        await logEvent(license.id, "activation.success", `Dispositivo ativado (${deviceName ?? deviceId}).`, {
          deviceId,
          version,
        });

        return json(await licenseResponse(license, token));
      },
    },
  },
});
