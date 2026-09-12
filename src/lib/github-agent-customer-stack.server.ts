import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createInstallationToken } from "@/lib/github.server";
import type { CustomerProviderCredential } from "@/lib/customer-ai-credentials.server";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "SuperLovable-CustomerAI";
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_CHARS = 24_000;
const REDUCED_CONTEXT_FILES = 3;
const REDUCED_CONTEXT_CHARS = 10_000;
const CLOUDFLARE_CODE_MODEL = "@cf/openai/gpt-oss-20b";

type AgentAuth = { license: { id: string } };
type ContextFile = { path: string; content: string };
type ProposedFile = { path: string; content: string };
type ProposedEdit = { path: string; search: string; replace: string };
export type CustomerTaskComplexity = "simple" | "medium" | "complex";

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": USER_AGENT,
});

async function githubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...githubHeaders(token), ...(init?.headers || {}) } });
  const raw = await response.text();
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}: ${raw.slice(0, 320)}`);
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}
function contentPath(path: string) { return path.split("/").map(encodeURIComponent).join("/"); }
function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function safePath(path: string) {
  return Boolean(path && !path.startsWith("/") && !path.includes("..") &&
    !/(^|\/)(\.env(?:\.|$)|\.git|\.github\/workflows|node_modules|dist|\.output)(\/|$)/i.test(path) &&
    !/(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock)$/i.test(path) &&
    !/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|pdf|mp4|mp3)$/i.test(path));
}
function promptWords(prompt: string) {
  return prompt.toLowerCase().split(/[^a-z0-9á-ú_-]+/).filter((word) => word.length >= 4);
}
function scorePath(path: string, prompt: string) {
  const lower = path.toLowerCase();
  const words = promptWords(prompt);
  let score = words.reduce((total, word) => total + (lower.includes(word) ? 9 : 0), 0);
  if (/\.(tsx|ts|jsx|js|css|json|md|html)$/.test(lower)) score += 3;
  if (lower.includes("route") || lower.includes("page") || lower.includes("component")) score += 3;
  if (/^src\/(routes|pages)\/index\.(tsx|ts|jsx|js)$/.test(lower)) score += 24;
  if (/^src\/(app|main)\.(tsx|ts|jsx|js)$/.test(lower)) score += 18;
  return score;
}

export function classifyCustomerTask(prompt: string): CustomerTaskComplexity {
  const text = String(prompt || "").toLowerCase();
  const complexSignals = /(reformul|redesign|refator|arquitet|integra|várias seções|varias secoes|múltipl|multipl|responsiv.*página|pagina inteira|site inteiro|fluxo completo|autentica|banco de dados)/i;
  const simpleSignals = /(troque|mude|altere|remova|adicione|corrija).{0,80}(texto|cor|título|titulo|link|botão|botao|badge|menu|label|placeholder|classe)/i;
  if (text.length > 1800 || complexSignals.test(text)) return "complex";
  if (text.length < 500 && simpleSignals.test(text)) return "simple";
  return "medium";
}

function contextBudget(complexity: CustomerTaskComplexity, reduced: boolean) {
  if (reduced) return { chars: REDUCED_CONTEXT_CHARS, files: REDUCED_CONTEXT_FILES };
  if (complexity === "simple") return { chars: 8_000, files: 2 };
  if (complexity === "medium") return { chars: 16_000, files: 4 };
  return { chars: MAX_CONTEXT_CHARS, files: MAX_CONTEXT_FILES };
}

function promptAwareExcerpt(full: string, prompt: string, allowance: number) {
  if (full.length <= allowance) return full;
  const lower = full.toLowerCase();
  const words = promptWords(prompt);
  let bestIndex = -1;
  let bestScore = 0;
  for (const word of words) {
    let from = 0;
    let occurrences = 0;
    while (occurrences < 8) {
      const index = lower.indexOf(word, from);
      if (index < 0) break;
      const start = Math.max(0, index - Math.floor(allowance / 2));
      const end = Math.min(lower.length, start + allowance);
      const window = lower.slice(start, end);
      const score = words.reduce((total, candidate) => total + (window.includes(candidate) ? candidate.length : 0), 0);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
      occurrences += 1;
      from = index + word.length;
    }
  }
  if (bestIndex < 0) return full.slice(0, allowance);
  let start = Math.max(0, bestIndex - Math.floor(allowance * 0.42));
  if (start + allowance > full.length) start = Math.max(0, full.length - allowance);
  return full.slice(start, start + allowance);
}

async function readRepositoryFile(token: string, repo: string, branch: string, path: string) {
  const file = await githubJson<{ content?: string; encoding?: string }>(`${GITHUB_API}/repos/${repo}/contents/${contentPath(path)}?ref=${encodeURIComponent(branch)}`, token);
  return file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
}

async function selectedContext(token: string, repo: string, branch: string, prompt: string, reducedContext = false) {
  const complexity = classifyCustomerTask(prompt);
  const budget = contextBudget(complexity, reducedContext);
  const ref = await githubJson<{ object: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const commit = await githubJson<{ tree: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/commits/${ref.object.sha}`, token);
  const tree = await githubJson<{ tree?: Array<{ path?: string; type?: string; size?: number }> }>(`${GITHUB_API}/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`, token);
  const repositoryPaths = (tree.tree || []).filter((item) => item.type === "blob" && safePath(String(item.path || ""))).map((item) => String(item.path || ""));
  const candidates = [...repositoryPaths].sort((a, b) => scorePath(b, prompt) - scorePath(a, prompt)).slice(0, complexity === "simple" ? 8 : 18);
  const files: ContextFile[] = [];
  let remaining = budget.chars;
  for (const path of candidates) {
    if (files.length >= budget.files || remaining <= 0) break;
    try {
      const full = await readRepositoryFile(token, repo, branch, path);
      if (!full) continue;
      const allowance = Math.min(remaining, complexity === "simple" ? 4_000 : 7_000);
      const content = promptAwareExcerpt(full, prompt, allowance);
      remaining -= content.length;
      files.push({ path, content });
    } catch {}
  }
  return { baseSha: ref.object.sha, repositoryPaths, candidates, files, complexity };
}

const systemPrompt = `Você é o agente de programação da Super Lovable. Retorne SOMENTE JSON válido, sem markdown e sem explicações fora do JSON. Formato: {"summary":"resumo em português","commit_message":"mensagem curta em português","edits":[{"path":"arquivo existente","search":"trecho EXATO e único do conteúdo atual","replace":"novo trecho"}],"new_files":[{"path":"novo arquivo","content":"conteúdo completo"}]}. Use exclusivamente caminhos listados em available_files. Para arquivos existentes, faça alterações cirúrgicas e nunca devolva o arquivo inteiro. Preserve tudo que não foi solicitado. Não edite .env, workflows, lockfiles, binários, arquivos gerados ou segredos. No máximo 8 edits e 4 arquivos no total. O campo search deve copiar literalmente um trecho único presente em files. Priorize a menor alteração possível para reduzir tokens, latência e risco.`;

function providerLabel(provider: CustomerProviderCredential["provider"]) {
  return provider === "mistral" ? "Mistral" : provider === "gemini" ? "Gemini" : "Cloudflare";
}
function extractJson(raw: string, provider: string) {
  const cleaned = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch {
    const first = cleaned.indexOf("{"); const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
    throw new Response(`${provider} não retornou um plano de código válido.`, { status: 502 });
  }
}
function compactProviderPayload(payload: string, maxChars: number) {
  if (payload.length <= maxChars) return payload;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown> & { files?: ContextFile[]; available_files?: string[] };
    const files = (parsed.files || []).map((file) => ({
      path: file.path,
      content: String(file.content || "").slice(0, Math.max(1600, Math.floor(maxChars / Math.max(1, (parsed.files || []).length + 1)))),
    }));
    return JSON.stringify({ ...parsed, available_files: (parsed.available_files || []).slice(0, 320), files }).slice(0, maxChars);
  } catch { return payload.slice(0, maxChars); }
}
function providerTimeoutMs(provider: CustomerProviderCredential["provider"]) {
  if (provider === "mistral") return 32_000;
  if (provider === "gemini") return 36_000;
  return 30_000;
}

async function resolveGeminiModels(apiKey: string, preferred: string, signal: AbortSignal) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, { signal });
  if (!response.ok) return [...new Set([preferred, "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean))];
  const data = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
  const available = (data.models || []).filter((item) => (item.supportedGenerationMethods || []).includes("generateContent")).map((item) => String(item.name || "").replace(/^models\//, "")).filter(Boolean);
  return [...new Set([...(preferred && available.includes(preferred) ? [preferred] : []), available.find((id) => id === "gemini-2.5-flash"), available.find((id) => id === "gemini-2.5-flash-lite"), available.find((id) => /flash/i.test(id)), available[0], "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter((id): id is string => Boolean(id)))];
}

async function callProvider(payload: string, credential: CustomerProviderCredential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs(credential.provider));
  const label = providerLabel(credential.provider);
  try {
    let response: Response;
    let raw = "";
    let model = credential.model;
    const providerPayload = compactProviderPayload(payload, credential.provider === "cloudflare" ? 10_000 : credential.provider === "mistral" ? 18_000 : 22_000);

    if (credential.provider === "mistral") {
      model ||= "codestral-2508";
      response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.1, max_tokens: 2200, response_format: { type: "json_object" }, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: providerPayload }] }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text) as { model?: string; choices?: Array<{ message?: { content?: string } }> };
        model = String(data.model || model);
        raw = String(data.choices?.[0]?.message?.content || "");
      } else raw = text;
    } else if (credential.provider === "gemini") {
      model ||= "gemini-2.5-flash";
      const invokeGemini = async (modelId: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(credential.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text: providerPayload }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2600, responseMimeType: "application/json" } }),
        signal: controller.signal,
      });
      const candidates = await resolveGeminiModels(credential.apiKey, model, controller.signal);
      response = await invokeGemini(candidates[0] || model);
      model = candidates[0] || model;
      for (let index = 1; response.status === 404 && index < candidates.length; index += 1) { model = candidates[index]; response = await invokeGemini(model); }
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        raw = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
      } else raw = text;
    } else {
      if (!credential.accountId) throw new Response("A conexão Cloudflare está sem Account ID. Substitua a credencial.", { status: 422 });
      model = CLOUDFLARE_CODE_MODEL;
      response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(credential.accountId)}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: providerPayload }], max_tokens: 1500, temperature: 0.1, response_format: { type: "json_object" } }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) { const data = JSON.parse(text) as { result?: { response?: string } }; raw = String(data.result?.response || ""); } else raw = text;
    }

    if (response.status === 401 || response.status === 403) throw new Response(`A credencial ${label} salva não foi aceita. Ela foi mantida; substitua a API quando puder.`, { status: 401 });
    if (response.status === 429) throw new Response(`${label} atingiu o limite temporário. A credencial continua salva e a próxima IA será tentada.`, { status: 429 });
    if (!response.ok) throw new Response(`${label} indisponível no momento (${response.status}).`, { status: response.status >= 500 ? 503 : 502 });
    return { provider: credential.provider, model, raw, approximateInputTokens: Math.ceil(providerPayload.length / 4) };
  } catch (error) {
    if (error instanceof Response) throw error;
    if (controller.signal.aborted) throw new Response(`${label} demorou além do limite desta tentativa. A credencial continua conectada.`, { status: 504 });
    throw new Response(`Não foi possível comunicar com ${label} nesta tentativa.`, { status: 503 });
  } finally { clearTimeout(timeout); }
}

function sanitizeEdits(value: unknown): ProposedEdit[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item): ProposedEdit[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const path = String(row.path || "").trim();
    const search = String(row.search ?? "");
    const replace = String(row.replace ?? "");
    if (!safePath(path) || !search || search.length > 30_000 || replace.length > 80_000) return [];
    return [{ path, search, replace }];
  });
}
function sanitizeNewFiles(value: unknown): ProposedFile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item): ProposedFile[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const path = String(row.path || "").trim();
    const content = String(row.content ?? "");
    if (!safePath(path) || !content || content.length > 180_000) return [];
    return [{ path, content }];
  });
}
async function materializePlan(parsed: Record<string, unknown>, token: string, repo: string, branch: string, repositoryPaths: string[], provider: string) {
  const edits = sanitizeEdits(parsed.edits);
  const byPath = new Map<string, ProposedEdit[]>();
  for (const edit of edits) {
    const actualPath = repositoryPaths.find((candidate) => candidate.toLowerCase() === edit.path.toLowerCase());
    if (!actualPath) continue;
    byPath.set(actualPath, [...(byPath.get(actualPath) || []), { ...edit, path: actualPath }]);
  }
  const files: ProposedFile[] = [];
  for (const [path, pathEdits] of byPath) {
    let content = await readRepositoryFile(token, repo, branch, path);
    for (const edit of pathEdits) {
      const first = content.indexOf(edit.search); const last = content.lastIndexOf(edit.search);
      if (first < 0 || first !== last) throw new Response(`${provider} não encontrou um trecho único em ${path}.`, { status: 422 });
      content = `${content.slice(0, first)}${edit.replace}${content.slice(first + edit.search.length)}`;
    }
    files.push({ path, content });
  }
  const newFiles = sanitizeNewFiles(parsed.new_files).filter((file) => !repositoryPaths.some((path) => path.toLowerCase() === file.path.toLowerCase()));
  return [...files, ...newFiles].slice(0, 8);
}

async function attemptProviderPlan(payload: string, credential: CustomerProviderCredential, token: string, repo: string, branch: string, repositoryPaths: string[]) {
  const label = providerLabel(credential.provider);
  const ai = await callProvider(payload, credential);
  const parsed = extractJson(ai.raw, label);
  const files = await materializePlan(parsed, token, repo, branch, repositoryPaths, label);
  if (!files.length) throw new Response(String(parsed.summary || `${label} não propôs uma alteração segura nesta tentativa.`), { status: 422 });
  return { ai, parsed, files };
}

export type PreparedCustomerPlan = {
  token: string; repo: string; branch: string; baseSha: string; repositoryPaths: string[]; payload: string; complexity: CustomerTaskComplexity;
};

export async function prepareCustomerPlan(auth: AgentAuth, prompt: string, options: { reducedContext?: boolean } = {}): Promise<PreparedCustomerPlan> {
  const { data: connection } = await supabaseAdmin.from("github_license_connections").select("*").eq("license_id", auth.license.id).maybeSingle();
  const row = connection as Record<string, unknown> | null;
  const installationId = Number(row?.installation_id || 0);
  const repo = String(row?.repository_full_name || "");
  const branch = String(row?.branch || "main");
  if (!installationId || !repo) throw new Response("Conecte e selecione o projeto GitHub primeiro.", { status: 422 });
  const token = await createInstallationToken(installationId);
  const context = await selectedContext(token, repo, branch, prompt, Boolean(options.reducedContext));
  const basePayload = JSON.stringify({ request: prompt, complexity: context.complexity, repository: repo, branch, available_files: context.repositoryPaths.slice(0, context.complexity === "simple" ? 250 : 700), files: context.files });
  return { token, repo, branch, baseSha: context.baseSha, repositoryPaths: context.repositoryPaths, payload: basePayload, complexity: context.complexity };
}

export async function planPreparedCustomerProvider(auth: AgentAuth, prompt: string, credential: CustomerProviderCredential, prepared: PreparedCustomerPlan) {
  const attempt = await attemptProviderPlan(prepared.payload, credential, prepared.token, prepared.repo, prepared.branch, prepared.repositoryPaths);
  const label = providerLabel(credential.provider);
  const summary = String(attempt.parsed.summary || `Alteração preparada por ${label}.`).slice(0, 2000);
  const commitMessage = String(attempt.parsed.commit_message || "aplicar alteração pela Super Lovable").slice(0, 120);
  const { data, error } = await supabaseAdmin.from("github_agent_runs").insert({
    license_id: auth.license.id, repository_full_name: prepared.repo, branch: prepared.branch, prompt,
    provider: attempt.ai.provider, model: attempt.ai.model, status: "planned", summary, commit_message: commitMessage,
    proposed_files: attempt.files as never, base_sha: prepared.baseSha,
  } as never).select("id").single();
  if (error || !data) throw new Response(`Não foi possível salvar o plano gerado por ${label}.`, { status: 500 });
  return {
    runId: String((data as { id: string }).id), summary, commitMessage, files: attempt.files.map((file) => file.path),
    provider: attempt.ai.provider, model: attempt.ai.model, complexity: prepared.complexity,
    approximateInputTokens: attempt.ai.approximateInputTokens, automaticRecoveries: [], recoveryCount: 0,
  };
}

export async function planAgentRunCustomerProvider(auth: AgentAuth, prompt: string, credential: CustomerProviderCredential, options: { reducedContext?: boolean } = {}) {
  const prepared = await prepareCustomerPlan(auth, prompt, options);
  return planPreparedCustomerProvider(auth, prompt, credential, prepared);
}
