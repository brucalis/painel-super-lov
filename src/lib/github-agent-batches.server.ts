const MAX_BATCHES = 6;
const MAX_BATCH_INSTRUCTION_CHARS = 2200;
const DECOMPOSER_TIMEOUT_MS = 35_000;

type BatchStep = {
  id: string;
  title: string;
  instruction: string;
};

type DecompositionResult = {
  batched: boolean;
  strategy: "single" | "coordinated-batches-v1";
  complexityScore: number;
  batches: BatchStep[];
  provider: string;
};

function complexityScore(prompt: string) {
  const text = String(prompt || "").trim();
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const explicitStages = (text.match(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:ETAPA|FASE|PASSO)\s*\d+/gi) || [])
    .length;
  const listItems = (text.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/g) || []).length;
  const architectureTerms = (
    text.match(
      /\b(?:rota|route|página|page|componente|component|utilit|tipo|interface|filtro|responsiv|navega|backend|frontend|integra|estado|valida|dashboard|métrica|insight)\w*/gi,
    ) || []
  ).length;

  let score = 0;
  if (text.length >= 1400) score += 2;
  if (text.length >= 2800) score += 2;
  if (text.length >= 5000) score += 2;
  if (lines.length >= 24) score += 1;
  if (lines.length >= 45) score += 1;
  score += Math.min(4, Math.floor(explicitStages / 2));
  score += Math.min(3, Math.floor(listItems / 6));
  score += Math.min(3, Math.floor(architectureTerms / 8));
  return score;
}

function shouldBatch(prompt: string) {
  const score = complexityScore(prompt);
  const explicitStages = (prompt.match(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:ETAPA|FASE|PASSO)\s*\d+/gi) || [])
    .length;
  return score >= 5 || explicitStages >= 4 || prompt.length >= 3200;
}

function safeJson(raw: string) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("DECOMPOSER_INVALID_JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function sanitizeBatches(value: unknown): BatchStep[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_BATCHES).flatMap((item, index): BatchStep[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const title = String(candidate.title || `Etapa ${index + 1}`).trim().slice(0, 120);
    let instruction = String(candidate.instruction || candidate.objective || "").trim();
    if (!instruction) return [];
    instruction = instruction.slice(0, MAX_BATCH_INSTRUCTION_CHARS);
    return [
      {
        id: `batch-${index + 1}`,
        title,
        instruction,
      },
    ];
  });
}

function explicitStageFallback(prompt: string): BatchStep[] {
  const text = String(prompt || "").trim();
  const marker = /(?:^|\n)\s*(?:#{1,4}\s*)?((?:ETAPA|FASE|PASSO)\s*\d+[^\n]*)/gi;
  const matches = [...text.matchAll(marker)];

  if (matches.length >= 2) {
    const prefix = text.slice(0, matches[0].index || 0).trim();
    const sections = matches.map((match, index) => {
      const start = match.index || 0;
      const end = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
      return text.slice(start, end).trim();
    });
    const groupSize = Math.max(1, Math.ceil(sections.length / MAX_BATCHES));
    const batches: BatchStep[] = [];
    for (let index = 0; index < sections.length; index += groupSize) {
      const chunk = sections.slice(index, index + groupSize).join("\n\n");
      batches.push({
        id: `batch-${batches.length + 1}`,
        title: `Bloco ${batches.length + 1}`,
        instruction: `${prefix ? `Contexto geral:\n${prefix.slice(0, 900)}\n\n` : ""}${chunk}\n\nExecute somente este bloco agora. Preserve as etapas já concluídas e não antecipe os blocos seguintes. Priorize alterações cirúrgicas e limite este lote a no máximo 4 arquivos modificados quando possível.`.slice(
          0,
          MAX_BATCH_INSTRUCTION_CHARS,
        ),
      });
    }
    return batches.slice(0, MAX_BATCHES);
  }

  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length < 3) return [];
  const target = Math.min(MAX_BATCHES, Math.max(2, Math.ceil(text.length / 1800)));
  const chunks: string[] = Array.from({ length: target }, () => "");
  let cursor = 0;
  for (const paragraph of paragraphs) {
    if (chunks[cursor] && chunks[cursor].length + paragraph.length > 1800 && cursor < target - 1) {
      cursor += 1;
    }
    chunks[cursor] += `${chunks[cursor] ? "\n\n" : ""}${paragraph}`;
  }
  return chunks
    .filter(Boolean)
    .map((chunk, index) => ({
      id: `batch-${index + 1}`,
      title: `Bloco ${index + 1}`,
      instruction: `${chunk}\n\nExecute somente este bloco agora, preservando tudo que já foi concluído nos blocos anteriores. Faça alterações cirúrgicas e mantenha este lote pequeno.`.slice(
        0,
        MAX_BATCH_INSTRUCTION_CHARS,
      ),
    }));
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DECOMPOSER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const decompositionPrompt = `Você é o orquestrador de um agente de programação. Sua única tarefa é dividir um pedido complexo em LOTES PEQUENOS, ORDENADOS e COORDENADOS para serem executados sequencialmente no mesmo repositório.

Retorne SOMENTE JSON válido no formato:
{"batches":[{"title":"nome curto","instruction":"instrução autocontida do lote"}]}

Regras obrigatórias:
- produza entre 2 e 6 lotes;
- preserve a ordem de dependências: primeiro estrutura/tipos/utilitários, depois componentes/páginas, depois navegação/integração e por último revisão quando isso fizer sentido;
- cada lote deve ser pequeno o suficiente para normalmente alterar no máximo 4 arquivos e usar no máximo 6 edições cirúrgicas;
- não invente caminhos de arquivos, porque outro agente vai descobrir os arquivos reais;
- cada instruction deve conter somente o trabalho daquele lote e as restrições globais necessárias;
- não repita a implementação do lote anterior no lote seguinte;
- não inclua código completo, apenas objetivos claros de implementação;
- o último lote deve incluir a validação final necessária, mas não deve desfazer nem reescrever o que já foi implementado.`;

async function tryGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const model = process.env.GEMINI_CODE_MODEL || "gemini-2.5-flash";
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${decompositionPrompt}\n\nPEDIDO ORIGINAL:\n${prompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.05,
          responseMimeType: "application/json",
          maxOutputTokens: 1800,
        },
      }),
    },
  );
  const raw = await response.text();
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const data = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return {
    provider: "gemini",
    raw: String(data.candidates?.[0]?.content?.parts?.[0]?.text || ""),
  };
}

async function tryLovableGateway(prompt: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_GATEWAY_NOT_CONFIGURED");
  const response = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.05,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: decompositionPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`LOVABLE_GATEWAY_${response.status}`);
  const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string }> }> };
  return {
    provider: "lovable-gateway",
    raw: String(data.choices?.[0]?.message?.content || ""),
  };
}

async function tryGroq(prompt: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");
  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_CODE_MODEL || "openai/gpt-oss-20b",
      temperature: 0.05,
      max_completion_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: decompositionPrompt },
        { role: "user", content: prompt.slice(0, 7_500) },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`GROQ_${response.status}`);
  const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string }> }> };
  return {
    provider: "groq",
    raw: String(data.choices?.[0]?.message?.content || ""),
  };
}

async function decomposeWithAi(prompt: string) {
  const providers = [tryGemini, tryLovableGateway, tryGroq];
  for (const provider of providers) {
    try {
      const result = await provider(prompt);
      const parsed = safeJson(result.raw);
      const batches = sanitizeBatches(parsed.batches);
      if (batches.length >= 2) return { batches, provider: result.provider };
    } catch (error) {
      console.warn("[github-agent/batches] provedor de decomposição indisponível", {
        provider: provider.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return null;
}

export async function decomposeAgentPrompt(prompt: string): Promise<DecompositionResult> {
  const normalized = String(prompt || "").trim();
  const score = complexityScore(normalized);
  if (!shouldBatch(normalized)) {
    return {
      batched: false,
      strategy: "single",
      complexityScore: score,
      batches: [],
      provider: "heuristic",
    };
  }

  const ai = await decomposeWithAi(normalized);
  const batches = ai?.batches?.length ? ai.batches : explicitStageFallback(normalized);
  if (batches.length < 2) {
    return {
      batched: false,
      strategy: "single",
      complexityScore: score,
      batches: [],
      provider: ai?.provider || "fallback",
    };
  }

  return {
    batched: true,
    strategy: "coordinated-batches-v1",
    complexityScore: score,
    batches: batches.slice(0, MAX_BATCHES),
    provider: ai?.provider || "deterministic-fallback",
  };
}
