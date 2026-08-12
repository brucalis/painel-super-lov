import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/transcribe")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json, sha256, effectiveStatus } = await import("@/lib/license.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json({ error: "Sem token de licença." }, 401);

        const { data: device } = await supabaseAdmin
          .from("license_devices")
          .select("*, licenses(*)")
          .eq("token_hash", sha256(token))
          .maybeSingle();

        if (!device || !device.active || !device.licenses) {
          return json({ error: "Dispositivo não autorizado." }, 403);
        }
        if (effectiveStatus(device.licenses) !== "active") {
          return json({ error: "Licença indisponível." }, 403);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Envie o áudio em multipart/form-data." }, 400);
        }
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 1024) {
          return json({ error: "Áudio vazio ou muito curto. Grave novamente." }, 400);
        }
        if (file.size > 20 * 1024 * 1024) {
          return json({ error: "Áudio muito grande (máximo 20 MB)." }, 400);
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return json({ error: "Transcrição indisponível no servidor." }, 500);

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-transcribe");
        upstream.append("file", file, file.name || "recording.webm");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });
        const raw = await res.text();
        if (!res.ok) {
          return json({ error: `Falha na transcrição (${res.status}).`, detail: raw.slice(0, 300) }, res.status);
        }
        let text = "";
        try {
          text = String((JSON.parse(raw) as { text?: string }).text || "");
        } catch {
          text = raw;
        }
        return json({ text: text.trim() });
      },
    },
  },
});
