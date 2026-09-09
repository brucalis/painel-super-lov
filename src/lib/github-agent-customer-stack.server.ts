import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createInstallationToken } from "@/lib/github.server";
import type { CustomerProviderCredential } from "@/lib/customer-ai-credentials.server";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "SuperLovable-CustomerAI";
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_CHARS = 30_000;
const FOCUSED_CONTEXT_CHARS = 38_000;

type AgentAuth = { license: { id: string } };
type ContextFile = { path: string; content: string };
type ProposedFile = { path: string; content: string };
type ProposedEdit = { path: string; search: string; replace: string };

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

function contentPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}
function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function safePath(path: string) {
  return Boolean(
    path && !path.startsWith("/") && !path.includes("..") &&
    !/(^|\/)(\.env(?:\.|$)|\.git|\.github\/workflows|node_modules|dist|\.output)(\/|$)/i.test(path) &&
    !/(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock)$/i.test(path) &&
    !/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|pdf|mp4|mp3)$/i.test(path),
  );
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
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
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

async function selectedContext(token: string, repo: string, branch: string, prompt: string) {
  const ref = await githubJson<{ object: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const commit = await githubJson<{ tree: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/commits/${ref.object.sha}`, token);
  const tree = await githubJson<{ tree?: Array<{ path?: string; type?: string; size?: number }> }>(`${GITHUB_API}/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`, token);
  const repositoryPaths = (tree.tree || []).filter((item) => item.type === "blob" && safePath(String(item.path || ""))).map((item) => String(item.path || ""));
  const candidates = [...repositoryPaths].sort((a, b) => scorePath(b, prompt) - scorePath(a, prompt)).slice(0, 18);
  const files: ContextFile[] = [];
  let remaining = MAX_CONTEXT_CHARS;
  for (const path of candidates) {
    if (files.length >= MAX_CONTEXT_FILES || remaining <= 0) break;
    try {
      const full = await readRepositoryFile(token, repo, branch, path);
      if (!full) continue;
      const allowance = Math.min(remaining, 7_000);
      const content = promptAwareExcerpt(full, prompt, allowance);
      remaining -= content.length;
      files.push({ path, content });
    } catch {}
  }
  return { baseSha: ref.object.sha, repositoryPaths, candidates, files };
}

async function focusedContext(token: string, repo: string, branch: string, prompt: string, paths: string[]) {
  const files: ContextFile[] = [];
  let remaining = FOCUSED_CONTEXT_CHARS;
  for (const path of paths.slice(0, 3)) {
    if (remaining <= 0) break;
    try {
      const full = await readRepositoryFile(token, repo, branch, path);
      if (!full) continue;
      const allowance = Math.min(remaining, 16_000);
      const content = promptAwareExcerpt(full, prompt, allowance);
      remaining -= content.length;
      files.push({ path, content });
    } catch {}
  }
  return files;
}

const systemPrompt = `Você é o agente de programação da Super Lovable. Retorne SOMENTE JSON válido, sem markdown e sem explicações fora do JSON. Formato: {"summary":"resumo em português","commit_message":"mensagem curta em português","edits":[{"path":"arquivo existente","search":"trecho EXATO e único do conteúdo atual","replace":"novo trecho"}],"new_files":[{"path":"novo arquivo","content":"conteúdo completo"}]}. Use exclusivamente caminhos listados em available_files. Para arquivos existentes, faça alterações cirúrgicas e nunca devolva o arquivo inteiro. Preserve tudo que não foi solicitado. Não edite .env, workflows, lockfiles, binários, arquivos gerados ou segredos. No máximo 8 edits e 4 arquivos no total. Se o contexto não mostrar exatamente o trecho necessário, faça uma alteração menor e segura em um arquivo carregado. O campo search deve copiar literalmente um trecho único presente em files.`;

function providerLabel(provider: CustomerProviderCredential["provider"]) {
  return provider === "grok" ? "Grok" : provider === "cloudflare" ? "Cloudflare" : provider === "gemini" ? "Gemini" : "OpenRouter";
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
      content: String(file.content || "").slice(0, Math.max(1800, Math.floor(maxChars / Math.max(1, (parsed.files || []).length + 1)))),
    }));
    return JSON.stringify({ ...parsed, available_files: (parsed.available_files || []).slice(0, 420), files }).slice(0, maxChars);
  } catch {
    return payload.slice(0, maxChars);
  }
}

function providerTimeoutMs(provider: CustomerProviderCredential["provider"]) {
  if (provider === "cloudflare") return 50_000;
  if (provider === "openrouter") return 65_000;
  if (provider === "gemini") return 30_000;
  return 40_000;
}

async function resolveGeminiModel(apiKey: string, preferred: string, signal: AbortSignal) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, { signal });
  if (!response.ok) return preferred || "gemini-2.5-flash";
  const data = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
  const available = (data.models || [])
    .filter((item) => (item.supportedGenerationMethods || []).includes("generateContent"))
    .map((item) => String(item.name || "").replace(/^models\//, ""))
    .filter(Boolean);
  if (preferred && available.includes(preferred)) return preferred;
  return available.find((id) => id === "gemini-2.5-flash")
    || available.find((id) => id === "gemini-2.5-flash-lite")
    || available.find((id) => /flash/i.test(id))
    || available[0]
    || preferred
    || "gemini-2.5-flash";
}

async function callProvider(payload: string, credential: CustomerProviderCredential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs(credential.provider));
  const label = providerLabel(credential.provider);
  try {
    let response: Response;
    let raw = "";
    let model = credential.model;
    const providerPayload = compactProviderPayload(
      payload,
      credential.provider === "cloudflare" ? 16_000 : credential.provider === "openrouter" ? 22_000 : 30_000,
    );

    if (credential.provider === "grok") {
      model ||= "grok-4.6";
      response = await fetch("https://api.x.ai/v1/chat/completions", {
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
      }
      if (!response.ok) raw = text;
    } else if (credential.provider === "cloudflare") {
      if (!credential.accountId) throw new Response("A conexão Cloudflare está sem Account ID. Substitua a credencial.", { status: 422 });
      model ||= "@cf/meta/llama-3.1-8b-instruct-fp8";
      response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(credential.accountId)}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: providerPayload }], max_tokens: 1800, temperature: 0.1 }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text) as { result?: { response?: string } };
        raw = String(data.result?.response || "");
      } else raw = text;
    } else if (credential.provider === "gemini") {
      model ||= "gemini-2.5-flash";
      const invokeGemini = async (modelId: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(credential.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text: providerPayload }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2600, responseMimeType: "application/json" } }),
        signal: controller.signal,
      });
      response = await invokeGemini(model);
      if (response.status === 404) {
        model = await resolveGeminiModel(credential.apiKey, model, controller.signal);
        response = await invokeGemini(model);
      }
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        raw = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
      } else raw = text;
    } else {
      model ||= "openrouter/free";
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://painel-super-lov.lovable.app", "X-Title": "Super Lovable" },
        body: JSON.stringify({ model, temperature: 0.1, max_tokens: 2200, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: providerPayload }] }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text) as { model?: string; choices?: Array<{ message?: { content?: string } }> };
        model = String(data.model || model);
        raw = String(data.choices?.[0]?.message?.content || "");
      } else raw = text;
    }

    if (response.status === 401 || response.status === 403) throw new Response(`A credencial ${label} salva não foi aceita. Ela foi mantida; substitua a API quando puder.`, { status: 401 });
    if (response.status === 429) throw new Response(`${label} atingiu o limite temporário. A credencial continua salva e a próxima IA será tentada.`, { status: 429 });
    if (!response.ok) throw new Response(`${label} indisponível no momento (${response.status}).`, { status: response.status >= 500 ? 503 : 502 });
    return { provider: credential.provider, model, raw };
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
      const first = content.indexOf(edit.search);
      const last = content.lastIndexOf(edit.search);
      if (first < 0 || first !== last) throw new Response(`${provider} não encontrou um trecho único em ${path}.`, { status: 422 });
      content = `${content.slice(0, first)}${edit.replace}${content.slice(first + edit.search.length)}`;
    }
    files.push({ path, content });
  }
  const newFiles = sanitizeNewFiles(parsed.new_files).filter((file) => !repositoryPaths.some((path) => path.toLowerCase() === file.path.toLowerCase()));
  return [...files, ...newFiles].slice(0, 8);
}

function canRetryWithFocusedContext(error: unknown) {
  return error instanceof Response && (error.status === 422 || error.status === 502);
}

async function attemptProviderPlan(
  payload: string,
  credential: CustomerProviderCredential,
  token: string,
  repo: string,
  branch: string,
  repositoryPaths: string[],
) {
  const label = providerLabel(credential.provider);
  const ai = await callProvider(payload, credential);
  const parsed = extractJson(ai.raw, label);
  const files = await materializePlan(parsed, token, repo, branch, repositoryPaths, label);
  if (!files.length) throw new Response(String(parsed.summary || `${label} não propôs uma alteração segura nesta tentativa.`), { status: 422 });
  return { ai, parsed, files };
}

export async function planAgentRunCustomerProvider(auth: AgentAuth, prompt: string, credential: CustomerProviderCredential) {
  const { data: connection } = await supabaseAdmin.from("github_license_connections").select("*").eq("license_id", auth.license.id).maybeSingle();
  const row = connection as Record<string, unknown> | null;
  const installationId = Number(row?.installation_id || 0);
  const repo = String(row?.repository_full_name || "");
  const branch = String(row?.branch || "main");
  if (!installationId || !repo) throw new Response("Conecte e selecione o projeto GitHub primeiro.", { status: 422 });
  const token = await createInstallationToken(installationId);
  const context = await selectedContext(token, repo, branch, prompt);
  const basePayload = JSON.stringify({
    request: prompt,
    repository: repo,
    branch,
    available_files: context.repositoryPaths.slice(0, 1200),
    files: context.files,
  });

  let attempt;
  try {
    attempt = await attemptProviderPlan(basePayload, credential, token, repo, branch, context.repositoryPaths);
  } catch (error) {
    if (!canRetryWithFocusedContext(error)) throw error;
    const focusedFiles = await focusedContext(token, repo, branch, prompt, context.candidates);
    if (!focusedFiles.length) throw error;
    const retryPayload = JSON.stringify({
      request: prompt,
      repository: repo,
      branch,
      instruction: "RECUPERAÇÃO DE CONTEXTO: produza agora uma alteração menor e segura. Copie search literalmente dos trechos carregados. Não invente caminhos nem solicite mais contexto.",
      available_files: context.repositoryPaths.slice(0, 1200),
      files: focusedFiles,
    });
    attempt = await attemptProviderPlan(retryPayload, credential, token, repo, branch, context.repositoryPaths);
  }

  const label = providerLabel(credential.provider);
  const summary = String(attempt.parsed.summary || `Alteração preparada por ${label}.`).slice(0, 2000);
  const commitMessage = String(attempt.parsed.commit_message || "aplicar alteração pela Super Lovable").slice(0, 120);
  const { data, error } = await supabaseAdmin.from("github_agent_runs").insert({
    license_id: auth.license.id,
    repository_full_name: repo,
    branch,
    prompt,
    provider: attempt.ai.provider,
    model: attempt.ai.model,
    status: "planned",
    summary,
    commit_message: commitMessage,
    proposed_files: attempt.files as never,
    base_sha: context.baseSha,
  } as never).select("id").single();
  if (error || !data) throw new Response(`Não foi possível salvar o plano gerado por ${label}.`, { status: 500 });
  return {
    runId: String((data as { id: string }).id),
    summary,
    commitMessage,
    files: attempt.files.map((file) => file.path),
    provider: attempt.ai.provider,
    model: attempt.ai.model,
    automaticRecoveries: [],
    recoveryCount: 0,
    fallback: credential.provider !== "cloudflare",
  };
}
