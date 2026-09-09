import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createInstallationToken } from "@/lib/github.server";
import type { CustomerProviderCredential } from "@/lib/customer-ai-credentials.server";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "SuperLovable-CustomerAI";
const PROVIDER_TIMEOUT_MS = 25_000;
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_CHARS = 30_000;

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
function scorePath(path: string, prompt: string) {
  const lower = path.toLowerCase();
  const words = prompt.toLowerCase().split(/[^a-z0-9á-ú_-]+/).filter((word) => word.length >= 4);
  let score = words.reduce((total, word) => total + (lower.includes(word) ? 9 : 0), 0);
  if (/\.(tsx|ts|jsx|js|css|json|md|html)$/.test(lower)) score += 3;
  if (lower.includes("route") || lower.includes("page") || lower.includes("component")) score += 3;
  if (/^src\/(routes|pages)\/index\.(tsx|ts|jsx|js)$/.test(lower)) score += 24;
  if (/^src\/(app|main)\.(tsx|ts|jsx|js)$/.test(lower)) score += 18;
  return score;
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
      const file = await githubJson<{ content?: string; encoding?: string }>(`${GITHUB_API}/repos/${repo}/contents/${contentPath(path)}?ref=${encodeURIComponent(branch)}`, token);
      const full = file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
      if (!full) continue;
      const allowance = Math.min(remaining, 7_000);
      const content = full.length <= allowance ? full : full.slice(0, allowance);
      remaining -= content.length;
      files.push({ path, content });
    } catch {}
  }
  return { baseSha: ref.object.sha, repositoryPaths, files };
}

const systemPrompt = `Você é o agente de programação da Super Lovable. Retorne SOMENTE JSON válido, sem markdown e sem explicações fora do JSON. Formato: {"summary":"resumo em português","commit_message":"mensagem curta em português","edits":[{"path":"arquivo existente","search":"trecho EXATO e único do conteúdo atual","replace":"novo trecho"}],"new_files":[{"path":"novo arquivo","content":"conteúdo completo"}]}. Use exclusivamente caminhos listados em available_files. Para arquivos existentes, faça alterações cirúrgicas e nunca devolva o arquivo inteiro. Preserve tudo que não foi solicitado. Não edite .env, workflows, lockfiles, binários, arquivos gerados ou segredos. No máximo 8 edits e 4 arquivos no total. Se o contexto não mostrar exatamente o trecho necessário, prefira uma alteração menor em um arquivo que esteja carregado em vez de inventar conteúdo.`;

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

async function callProvider(payload: string, credential: CustomerProviderCredential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  const label = providerLabel(credential.provider);
  try {
    let response: Response;
    let raw = "";
    let model = credential.model;

    if (credential.provider === "grok") {
      model ||= "grok-4.6";
      response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.1, max_tokens: 2200, response_format: { type: "json_object" }, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: payload }] }),
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
        body: JSON.stringify({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: payload }], max_tokens: 2200, temperature: 0.1 }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text) as { result?: { response?: string } };
        raw = String(data.result?.response || "");
      } else raw = text;
    } else if (credential.provider === "gemini") {
      model ||= "gemini-2.5-flash";
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(credential.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text: payload }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2200, responseMimeType: "application/json" } }),
        signal: controller.signal,
      });
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
        body: JSON.stringify({ model, temperature: 0.1, max_tokens: 2200, response_format: { type: "json_object" }, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: payload }] }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) {
        const data = JSON.parse(text) as { model?: string; choices?: Array<{ message?: { content?: string } }> };
        model = String(data.model || model); raw = String(data.choices?.[0]?.message?.content || "");
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
    const row = item as Record<string, unknown>; const path = String(row.path || "").trim(); const search = String(row.search ?? ""); const replace = String(row.replace ?? "");
    if (!safePath(path) || !search || search.length > 30_000 || replace.length > 80_000) return [];
    return [{ path, search, replace }];
  });
}
function sanitizeNewFiles(value: unknown): ProposedFile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item): ProposedFile[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>; const path = String(row.path || "").trim(); const content = String(row.content ?? "");
    if (!safePath(path) || !content || content.length > 180_000) return [];
    return [{ path, content }];
  });
}
async function readRepositoryFile(token: string, repo: string, branch: string, path: string) {
  const file = await githubJson<{ content?: string; encoding?: string }>(`${GITHUB_API}/repos/${repo}/contents/${contentPath(path)}?ref=${encodeURIComponent(branch)}`, token);
  return file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
}
async function materializePlan(parsed: Record<string, unknown>, token: string, repo: string, branch: string, repositoryPaths: string[], provider: string) {
  const edits = sanitizeEdits(parsed.edits); const byPath = new Map<string, ProposedEdit[]>();
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
      if (first < 0 || first !== last) throw new Response(`${provider} não encontrou um trecho único em ${path}. A próxima IA pode tentar com uma nova leitura.`, { status: 422 });
      content = `${content.slice(0, first)}${edit.replace}${content.slice(first + edit.search.length)}`;
    }
    files.push({ path, content });
  }
  const newFiles = sanitizeNewFiles(parsed.new_files).filter((file) => !repositoryPaths.some((path) => path.toLowerCase() === file.path.toLowerCase()));
  return [...files, ...newFiles].slice(0, 8);
}

export async function planAgentRunCustomerProvider(auth: AgentAuth, prompt: string, credential: CustomerProviderCredential) {
  const { data: connection } = await supabaseAdmin.from("github_license_connections").select("*").eq("license_id", auth.license.id).maybeSingle();
  const row = connection as Record<string, unknown> | null;
  const installationId = Number(row?.installation_id || 0); const repo = String(row?.repository_full_name || ""); const branch = String(row?.branch || "main");
  if (!installationId || !repo) throw new Response("Conecte e selecione o projeto GitHub primeiro.", { status: 422 });
  const token = await createInstallationToken(installationId);
  const context = await selectedContext(token, repo, branch, prompt);
  const payload = JSON.stringify({ request: prompt, repository: repo, branch, available_files: context.repositoryPaths.slice(0, 1200), files: context.files });
  const ai = await callProvider(payload, credential);
  const label = providerLabel(credential.provider);
  const parsed = extractJson(ai.raw, label);
  const files = await materializePlan(parsed, token, repo, branch, context.repositoryPaths, label);
  if (!files.length) throw new Response(String(parsed.summary || `${label} não propôs uma alteração segura nesta tentativa.`), { status: 422 });
  const summary = String(parsed.summary || `Alteração preparada por ${label}.`).slice(0, 2000);
  const commitMessage = String(parsed.commit_message || "aplicar alteração pela Super Lovable").slice(0, 120);
  const { data, error } = await supabaseAdmin.from("github_agent_runs").insert({ license_id: auth.license.id, repository_full_name: repo, branch, prompt, provider: ai.provider, model: ai.model, status: "planned", summary, commit_message: commitMessage, proposed_files: files as never, base_sha: context.baseSha } as never).select("id").single();
  if (error || !data) throw new Response(`Não foi possível salvar o plano gerado por ${label}.`, { status: 500 });
  return { runId: String((data as { id: string }).id), summary, commitMessage, files: files.map((file) => file.path), provider: ai.provider, model: ai.model, automaticRecoveries: [], recoveryCount: 0, fallback: credential.provider !== "grok" };
}
