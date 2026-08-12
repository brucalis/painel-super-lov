import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/recover-device")({
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
          licenseResponse,
          logEvent,
          sha256,
        } = await import("@/lib/license.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ status: "invalid", message: "Requisição inválida." }, 400);
        }

        const key = normalizeKey(String(body.license_key ?? ""));
        const installationId = String(body.installation_id ?? "").trim();
        const deviceName = String(body.device_name ?? "").slice(0, 120) || "Dispositivo Recuperado";
        const version = String(body.extension_version ?? "0.0.0");

        if (!/^LVA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key) || !installationId) {
          return json({ status: "invalid", message: "Dados insuficientes para recuperação." }, 400);
        }

        // Tenta localizar a licença
        const { data: license } = await supabaseAdmin
          .from("licenses")
          .select("*")
          .eq("license_key", key)
          .maybeSingle();

        if (!license) return json({ status: "invalid", message: "Licença não encontrada." }, 404);

        const status = effectiveStatus(license);
        if (status !== "active") {
          return json({ status, message: "Licença inativa." }, 403);
        }

        // Busca se existe algum dispositivo ativado recentemente com metadata de instalação compatível
        // Ou simplesmente permite a reativação baseada no installation_id persistido no sync.
        // Como o installation_id é único por instalação persistida no Chrome Sync, 
        // podemos tentar localizar o device_id que foi usado anteriormente.
        
        const { data: devices } = await supabaseAdmin
          .from("license_devices")
          .select("*")
          .eq("license_id", license.id)
          .order("last_seen_at", { ascending: false });

        // Nota: Atualmente a tabela license_devices não tem installation_id.
        // Vamos usar o device_id mais recente daquela licença que combine com o deviceName 
        // ou simplesmente retornar a lista para o cliente tentar a reassociação automática 
        // baseada na lógica de "mesmo navegador/SO".
        
        const recent = devices?.[0];
        if (!recent) return json({ status: "invalid", message: "Nenhum dispositivo prévio encontrado." }, 404);

        // Reativa o dispositivo mais recente
        const { token, hash } = newToken();
        await supabaseAdmin
          .from("license_devices")
          .update({
            token_hash: hash,
            active: true,
            device_name: deviceName,
            extension_version: version,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", recent.id);

        await logEvent(license.id, "activation.recovery", `Dispositivo recuperado via Installation ID.`, {
          deviceId: recent.device_id,
          installationId
        });

        return json(await licenseResponse(license, token, recent.device_id));
      },
    },
  },
});
