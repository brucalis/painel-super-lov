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
          deviceToken,
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

        const rawCredential = String(body.credential ?? body.license_key ?? "").trim();
        const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawCredential)
          ? rawCredential.toLowerCase()
          : null;
        const key = email ? "" : normalizeKey(rawCredential);
        const deviceId = String(body.device_id ?? "").trim();
        const installationId = String(body.installation_id ?? "").trim() || null;
        const deviceName = String(body.device_name ?? "").slice(0, 120) || null;
        const version = String(body.extension_version ?? "0.0.0");

        if ((!email && !/^LVA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) || !deviceId) {
          return json({ status: "invalid", message: "Chave, e-mail ou dispositivo inválido." }, 400);
        }

        let license = null;
        if (email) {
          const { data: customer } = await supabaseAdmin
            .from("customers")
            .select("id")
            .ilike("email", email)
            .limit(1)
            .maybeSingle();
          if (customer) {
            const { data: customerLicenses } = await supabaseAdmin
              .from("licenses")
              .select("*")
              .eq("customer_id", customer.id)
              .order("created_at", { ascending: false });
            license = customerLicenses?.find((item) => effectiveStatus(item) === "active")
              ?? customerLicenses?.[0]
              ?? null;
          }
        } else {
          const result = await supabaseAdmin
            .from("licenses")
            .select("*")
            .eq("license_key", key)
            .maybeSingle();
          license = result.data;
        }

        if (!license)
          return json({
            status: "invalid",
            message: "Essa licença é inválida. Acesse a ferramenta e desbloqueie a Lovable Ilimitada agora mesmo.",
          }, 404);

        const status = effectiveStatus(license);
        if (status !== "active") {
          await logEvent(license.id, "activation.denied", `Ativação negada: ${status}.`, { deviceId });
          return json({
            status,
            message: status === "expired"
              ? "O tempo da sua licença expirou. Continue usando a Lovable Ilimitada sem interrupções. Adquira agora a sua licença."
              : "Essa licença não está disponível para ativação.",
          }, status === "expired" ? 402 : 403);
        }

        if (license.minimum_version && versionLt(version, license.minimum_version)) {
          return json({ status: "version_too_old", minimum_version: license.minimum_version }, 426);
        }

        let { data: existing } = await supabaseAdmin
          .from("license_devices")
          .select("*")
          .eq("license_id", license.id)
          .eq("device_id", deviceId)
          .maybeSingle();

        // O identificador do perfil do navegador sobrevive à reinstalação. Se
        // o fingerprint local mudar, recuperamos o mesmo registro e a mesma
        // vaga de dispositivo em vez de consumir uma nova.
        let installationColumnAvailable = true;
        if (!existing && installationId) {
          const { data: byInstallation, error: installationError } = await supabaseAdmin
            .from("license_devices")
            .select("*")
            .eq("license_id", license.id)
            .eq("installation_id", installationId)
            .maybeSingle();
          if (installationError && /installation_id|schema cache/i.test(installationError.message)) {
            installationColumnAvailable = false;
          }
          existing = byInstallation;
        }

        // Migração única das ativações anteriores à versão 32.0.16: quando a
        // licença permitia apenas um dispositivo e existe exatamente um vínculo
        // antigo sem installation_id, associamos esse vínculo ao perfil atual.
        let claimedLegacyDevice = false;
        if (!existing && installationId && license.device_limit === 1 && installationColumnAvailable) {
          const { data: legacyDevices } = await supabaseAdmin
            .from("license_devices")
            .select("*")
            .eq("license_id", license.id)
            .eq("active", true)
            .is("installation_id", null)
            .order("last_seen_at", { ascending: false });
          if (legacyDevices?.length) {
            existing = legacyDevices[0];
            claimedLegacyDevice = true;
          }
        }

        // Compatibilidade temporária para bancos que ainda não receberam a
        // coluna installation_id: permite recuperar somente o único vínculo
        // da licença e somente quando o navegador/SO informado é o mesmo.
        if (!existing && !installationColumnAvailable && license.device_limit === 1) {
          const { data: legacyDevices } = await supabaseAdmin
            .from("license_devices")
            .select("*")
            .eq("license_id", license.id)
            .eq("active", true)
            .order("last_seen_at", { ascending: false });
          if (legacyDevices?.length === 1 && legacyDevices[0].device_name === deviceName) {
            existing = legacyDevices[0];
          }
        }

        // Se testes antigos criaram vínculos duplicados ao aumentar o limite,
        // mantém apenas o mais recente durante a migração para um dispositivo.
        if (existing && claimedLegacyDevice) {
          await supabaseAdmin
            .from("license_devices")
            .update({ active: false })
            .eq("license_id", license.id)
            .eq("active", true)
            .is("installation_id", null)
            .neq("id", existing.id);
        }

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
            return json({
              status: "device_limit",
              device_limit: license.device_limit,
              message: "Essa licença já está ativa em outro dispositivo e atingiu o número de dispositivos permitidos. Adquira novas licenças e continue usando a Lovable Ilimitada.",
            }, 409);
          }
        }

        // O mesmo perfil recebe sempre o mesmo token. Isso torna a ativação
        // idempotente mesmo quando content script, painel e várias abas chegam
        // juntos após uma reinstalação.
        const tokenBinding = installationId || String(existing?.id || deviceId);
        const { token, hash } = deviceToken(String(license.id), tokenBinding);
        if (existing) {
          const devicePatch: Record<string, unknown> = {
              token_hash: hash,
              device_id: deviceId,
              active: true,
              device_name: deviceName,
              extension_version: version,
              last_seen_at: new Date().toISOString(),
          };
          if (installationColumnAvailable) devicePatch.installation_id = installationId;
          await supabaseAdmin
            .from("license_devices")
            .update(devicePatch as never)
            .eq("id", existing.id);
        } else {
          const newDevice: Record<string, unknown> = {
            license_id: license.id,
            device_id: deviceId,
            device_name: deviceName,
            extension_version: version,
            token_hash: hash,
          };
          if (installationColumnAvailable) newDevice.installation_id = installationId;
          await supabaseAdmin.from("license_devices").insert(newDevice as never);
        }

        await supabaseAdmin
          .from("licenses")
          .update({ last_validated_at: new Date().toISOString() })
          .eq("id", license.id);
        await logEvent(license.id, "activation.success", `Dispositivo ativado (${deviceName ?? deviceId}).`, {
          deviceId,
          version,
        });

        return json(await licenseResponse(license, token, deviceId));
      },
    },
  },
});
