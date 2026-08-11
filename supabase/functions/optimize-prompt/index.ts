import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_PROMPT_LENGTH = 8_000;
const REQUESTS_PER_MINUTE = 12;
const AI_MODELS = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function effectiveStatus(license: Record<string, unknown>) {
  if (license.status !== "active") return String(license.status || "inactive");
  if (!license.is_lifetime && license.expires_at) {
    const expiresAt = Date.parse(String(license.expires_at));
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "expired";
  }
  return "active";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Banco de licenças indisponível." }, 503);
    if (!lovableApiKey) return json({ error: "Lovable AI não habilitada no back-end da Superlovable." }, 503);

    const authorization = request.headers.get("authorization") || "";
    const sessionToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!sessionToken) return json({ error: "Sessão da licença não encontrada." }, 401);

    let body: { prompt?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Requisição inválida." }, 400);
    }
    const prompt = String(body.prompt || "").trim();
    if (prompt.length < 3) return json({ error: "Digite um prompt antes de otimizar." }, 400);
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return json({ error: `O prompt deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres.` }, 413);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const tokenHash = await sha256(sessionToken);
    const { data: device, error: deviceError } = await supabase
      .from("license_devices")
      .select("*, licenses(*)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (deviceError) return json({ error: "Não foi possível validar a licença." }, 503);
    if (!device || !device.active || !device.licenses) return json({ error: "Dispositivo não autorizado." }, 403);
    if (effectiveStatus(device.licenses) !== "active") return json({ error: "Licença indisponível." }, 403);

    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from("license_events")
      .select("id", { count: "exact", head: true })
      .eq("license_id", device.licenses.id)
      .eq("type", "prompt.optimized")
      .gte("created_at", since);
    if ((count || 0) >= REQUESTS_PER_MINUTE) {
      return json({ error: "Muitas otimizações em sequência. Aguarde um minuto e tente novamente." }, 429);
    }

    let aiResponse: Response | null = null;
    let raw = "";
    let selectedModel = AI_MODELS[0];
    for (const model of AI_MODELS) {
      selectedModel = model;
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 2_000,
          messages: [
            {
              role: "system",
              content:
                "Você é o otimizador de prompts da Superlovable. Reescreva o pedido para ficar claro, específico e executável por uma IA que cria e edita aplicações. Preserve integralmente intenção, requisitos, nomes, números, URLs e restrições. Organize objetivo, contexto, requisitos e critérios de aceite sem inventar fatos. Não execute nem responda ao pedido e não explique o que fez. Retorne somente o prompt otimizado, no mesmo idioma do original.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      raw = await aiResponse.text();
      if (aiResponse.status !== 404) break;
    }

    if (!aiResponse || !aiResponse.ok) {
      const status = aiResponse?.status || 502;
      let message = `Falha no Lovable AI (${status}).`;
      if (status === 402) message = "Os créditos de IA da Superlovable estão indisponíveis.";
      if (status === 429) message = "O Lovable AI está temporariamente no limite. Tente novamente em instantes.";
      await supabase.from("license_events").insert({
        license_id: device.licenses.id,
        type: "prompt.optimize_failed",
        message,
        metadata: { status, detail: raw.slice(0, 250), source: "edge-function" },
      });
      return json({ error: message }, status >= 400 && status <= 599 ? status : 502);
    }

    let optimized = "";
    let usage: unknown = null;
    try {
      const data = JSON.parse(raw);
      optimized = String(data.choices?.[0]?.message?.content || "").trim();
      usage = data.usage || null;
    } catch {
      optimized = raw.trim();
    }
    if (!optimized) return json({ error: "O Lovable AI não retornou um prompt otimizado." }, 502);

    await supabase.from("license_events").insert({
      license_id: device.licenses.id,
      type: "prompt.optimized",
      message: "Prompt otimizado pelo back-end da Superlovable.",
      metadata: {
        input_length: prompt.length,
        output_length: optimized.length,
        model: selectedModel,
        usage,
        source: "edge-function",
      },
    });
    return json({ optimized_prompt: optimized, source: "superlovable-backend" });
  } catch (error) {
    console.error("[optimize-prompt]", error);
    return json({ error: "O otimizador está temporariamente indisponível." }, 500);
  }
});
