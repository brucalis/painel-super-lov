import { createFileRoute } from "@tanstack/react-router";

const MAX_PROMPT_LENGTH = 8_000;
const REQUESTS_PER_MINUTE = 12;
const AI_MODELS = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"] as const;

export const Route = createFileRoute("/api/public/optimize-prompt")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json, sha256, effectiveStatus, logEvent } = await import("@/lib/license.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json({ error: "Sessão da licença não encontrada." }, 401);

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

        let body: { prompt?: unknown } = {};
        try {
          body = (await request.json()) as { prompt?: unknown };
        } catch {
          return json({ error: "Requisição inválida." }, 400);
        }

        const prompt = String(body.prompt || "").trim();
        if (prompt.length < 3) return json({ error: "Digite um prompt antes de otimizar." }, 400);
        if (prompt.length > MAX_PROMPT_LENGTH) {
          return json({ error: `O prompt deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres.` }, 413);
        }

        const since = new Date(Date.now() - 60_000).toISOString();
        const { count } = await supabaseAdmin
          .from("license_events")
          .select("id", { count: "exact", head: true })
          .eq("license_id", device.licenses.id)
          .eq("type", "prompt.optimized")
          .gte("created_at", since);
        if ((count || 0) >= REQUESTS_PER_MINUTE) {
          return json({ error: "Muitas otimizações em sequência. Aguarde um minuto e tente novamente." }, 429);
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return json({ error: "O Lovable AI ainda não está habilitado neste projeto." }, 503);

        let response: Response | null = null;
        let raw = "";
        let selectedModel: (typeof AI_MODELS)[number] = AI_MODELS[0];
        for (const model of AI_MODELS) {
          selectedModel = model;
          response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              temperature: 0.3,
              max_tokens: 2_000,
              messages: [
                {
                  role: "system",
                  content:
                    "Você é o otimizador de prompts da Super Lovable. Reescreva o pedido do usuário para ficar claro, específico e executável por uma IA que cria e edita aplicações. Preserve integralmente a intenção, os requisitos, nomes, números, URLs e restrições. Sempre produza uma versão materialmente aprimorada, mesmo quando o texto original já for curto ou claro: acrescente contexto útil, organize objetivo, requisitos e critérios de aceite, sem inventar fatos. Nunca devolva o texto original sem alteração. Não responda ao pedido e não explique o que fez. Retorne somente o prompt otimizado, no mesmo idioma do texto original.",
                },
                { role: "user", content: prompt },
              ],
            }),
          });
          raw = await response.text();
          if (response.status !== 404) break;
        }

        if (!response) return json({ error: "O Lovable AI não respondeu." }, 502);
        if (!response.ok) {
          let message = `Falha no Lovable AI (${response.status}).`;
          if (response.status === 402) message = "Os créditos de IA do projeto Super Lovable estão indisponíveis.";
          if (response.status === 429) message = "O Lovable AI está temporariamente no limite. Tente novamente em instantes.";
          await logEvent(device.licenses.id, "prompt.optimize_failed", message, {
            status: response.status,
            detail: raw.slice(0, 250),
          });
          return json({ error: message }, response.status);
        }

        let optimized = "";
        let usage: unknown = null;
        try {
          const data = JSON.parse(raw) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: unknown;
          };
          optimized = String(data.choices?.[0]?.message?.content || "").trim();
          usage = data.usage || null;
        } catch {
          optimized = raw.trim();
        }

        if (!optimized) return json({ error: "O Lovable AI não retornou um prompt otimizado." }, 502);

        await logEvent(device.licenses.id, "prompt.optimized", "Prompt otimizado pelo Lovable AI.", {
          input_length: prompt.length,
          output_length: optimized.length,
          model: selectedModel,
          usage,
        });

        return json({ optimized_prompt: optimized });
      },
    },
  },
});
