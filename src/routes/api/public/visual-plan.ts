import { createFileRoute } from "@tanstack/react-router";

const MAX_PROMPT_LENGTH = 2_000;
const ALLOWED_STYLES = new Set([
  "color", "backgroundColor", "fontSize", "fontWeight", "fontStyle",
  "textAlign", "lineHeight", "letterSpacing", "borderRadius", "borderColor",
  "borderWidth", "borderStyle", "padding", "paddingTop", "paddingRight",
  "paddingBottom", "paddingLeft", "margin", "marginTop", "marginRight",
  "marginBottom", "marginLeft", "width", "maxWidth", "minHeight", "opacity",
]);

type VisualOperation =
  | { type: "replace_text"; value: string }
  | { type: "set_style"; property: string; value: string }
  | { type: "set_image_src"; value: string }
  | { type: "hide_element"; value: boolean };

function parseJsonObject(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não retornou um plano válido.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function sanitizeOperations(value: unknown): VisualOperation[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item): VisualOperation[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const type = String(candidate.type || "");
    if (type === "replace_text") return [{ type, value: String(candidate.value || "").slice(0, 5_000) }];
    if (type === "set_style") {
      const property = String(candidate.property || "");
      const styleValue = String(candidate.value || "").trim().slice(0, 200);
      if (!ALLOWED_STYLES.has(property) || !styleValue || /url\s*\(|expression\s*\(/i.test(styleValue)) return [];
      return [{ type, property, value: styleValue }];
    }
    if (type === "set_image_src") {
      const imageUrl = String(candidate.value || "").trim();
      return /^https:\/\//i.test(imageUrl) ? [{ type, value: imageUrl.slice(0, 2_000) }] : [];
    }
    if (type === "hide_element") return [{ type, value: Boolean(candidate.value) }];
    return [];
  });
}

export const Route = createFileRoute("/api/public/visual-plan")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json, logEvent } = await import("@/lib/license.server");
        const { requireActiveExtensionLicense } = await import("@/lib/lovable-official.server");
        let auth: Awaited<ReturnType<typeof requireActiveExtensionLicense>>;
        try {
          auth = await requireActiveExtensionLicense(request);
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: "Não foi possível validar a licença." }, 500);
        }

        let body: { prompt?: unknown; element?: unknown };
        try { body = (await request.json()) as typeof body; }
        catch { return json({ ok: false, error: "Requisição inválida." }, 400); }
        const prompt = String(body.prompt || "").trim();
        if (prompt.length < 3) return json({ ok: false, error: "Descreva a edição desejada." }, 400);
        if (prompt.length > MAX_PROMPT_LENGTH) return json({ ok: false, error: "O pedido é muito longo." }, 413);
        if (!body.element || typeof body.element !== "object") return json({ ok: false, error: "Selecione um elemento primeiro." }, 400);

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return json({ ok: false, error: "O planejador visual ainda não está configurado." }, 503);
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            temperature: 0.1,
            max_tokens: 1_500,
            messages: [
              {
                role: "system",
                content: `Você converte pedidos de edição visual em operações seguras sobre UM elemento HTML já selecionado. Retorne somente JSON no formato {"classification":"supported|requires_agent|unsupported","summary":"...","operations":[],"reason":"..."}. Operações aceitas: {"type":"replace_text","value":"..."}, {"type":"set_style","property":"...","value":"..."}, {"type":"set_image_src","value":"https://..."}, {"type":"hide_element","value":true}. Propriedades CSS permitidas: ${[...ALLOWED_STYLES].join(", ")}. Se o pedido criar componentes, páginas, lógica, dados, navegação, múltiplos elementos ou alterar código, use requires_agent e nenhuma operação. Não invente URLs.`,
              },
              { role: "user", content: JSON.stringify({ request: prompt, selected_element: body.element }) },
            ],
          }),
        });
        const raw = await response.text();
        if (!response.ok) return json({ ok: false, error: `Planejador visual indisponível (${response.status}).` }, response.status);
        try {
          const envelope = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
          const plan = parseJsonObject(String(envelope.choices?.[0]?.message?.content || ""));
          const classification = ["supported", "requires_agent", "unsupported"].includes(String(plan.classification))
            ? String(plan.classification) : "unsupported";
          const operations = classification === "supported" ? sanitizeOperations(plan.operations) : [];
          const effectiveClassification = classification === "supported" && !operations.length ? "unsupported" : classification;
          await logEvent(auth.license.id, "visual.plan_created", "Plano de edição visual criado.", {
            classification: effectiveClassification, operation_count: operations.length,
          });
          return json({ ok: true, classification: effectiveClassification, summary: String(plan.summary || ""), reason: String(plan.reason || ""), operations });
        } catch {
          return json({ ok: false, error: "Não foi possível interpretar o plano visual." }, 502);
        }
      },
    },
  },
});
