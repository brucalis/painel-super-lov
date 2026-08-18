import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authorizeUrl,
  createInstallationToken,
  exchangeCodeForToken,
  fetchGithubUser,
  findUserInstallationId,
  listInstallationRepos,
} from "@/lib/github.server";
import { requireActiveExtensionLicense } from "@/lib/lovable-official.server";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "SuperLovable-Agent";
const MAX_CONTEXT_FILES = 14;
const MAX_CONTEXT_CHARS = 60_000;
const REDUCED_CONTEXT_FILES = 6;
const REDUCED_CONTEXT_CHARS = 12_000;
const GROQ_CONTEXT_CHARS = 16_000;
const GROQ_RETRY_CONTEXT_CHARS = 8_000;
const GROQ_MAX_COMPLETION_TOKENS = 2_000;

type LicenseAuth = Awaited<ReturnType<typeof requireActiveExtensionLicense>>;
type ProposedFile = { path: string; content: string };
type ContextFile = { path: string; content: string };

class AgentPlanError extends Error {
  code: string;
  retryable: boolean;
  status: number;

  constructor(message: string, code: string, retryable = false, status = 500) {
    super(message);
    this.name = "AgentPlanError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export function agentErrorDetails(error: unknown) {
  if (error instanceof AgentPlanError) {
    return { message: error.message, code: error.code, retryable: error.retryable, status: error.status };
  }
  return {
    message: error instanceof Error ? error.message : "Falha ao planejar alteração.",
    code: "AGENT_PLAN_FAILED",
    retryable: false,
    status: 500,
  };
}

const headers = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": USER_AGENT,
});

export async function requireAgentLicense(request: Request): Promise<LicenseAuth> {
  return requireActiveExtensionLicense(request);
}

export async function createLicenseGithubState(licenseId: string) {
  const state = randomBytes(32).toString("hex");
  const { error } = await supabaseAdmin.from("github_license_oauth_states").insert({
    state,
    license_id: licenseId,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  } as never);
  if (error) throw new Error("Não foi possível iniciar a conexão com o GitHub.");
  return state;
}

async function consumeLicenseGithubState(state: string) {
  const { data } = await supabaseAdmin
    .from("github_license_oauth_states")
    .select("state, license_id, used, expires_at")
    .eq("state", state)
    .maybeSingle();
  const row = data as { state: string; license_id: string; used: boolean; expires_at: string } | null;
  if (!row || row.used || Date.parse(row.expires_at) < Date.now()) return null;
  await supabaseAdmin.from("github_license_oauth_states").update({ used: true } as never).eq("state", state);
  return row;
}

export function publicGithubCallback(request: Request) {
  return new URL("/api/public/agent/github/callback", new URL(request.url).origin).toString();
}

export async function startLicenseGithubConnection(request: Request, licenseId: string) {
  const state = await createLicenseGithubState(licenseId);
  return authorizeUrl(state, publicGithubCallback(request));
}

function callbackPage(title: string, message: string, actionUrl?: string) {
  const action = actionUrl
    ? `<a href="${actionUrl}" style="display:inline-block;margin-top:18px;padding:12px 18px;border-radius:10px;background:#7c3aed;color:white;text-decoration:none;font-weight:700">Instalar no repositório</a>`
    : "";
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;background:#130b22;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:520px;padding:32px;text-align:center"><h1>${title}</h1><p style="color:#d8cdea;line-height:1.6">${message}</p>${action}<p style="color:#9f8db8;font-size:13px;margin-top:22px">Depois, volte para a extensão Super Lovable.</p></main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function finishLicenseGithubConnection(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return callbackPage("Conexão incompleta", "O GitHub não devolveu os dados necessários. Tente conectar novamente.");
  const stateRow = await consumeLicenseGithubState(state);
  if (!stateRow) return callbackPage("Conexão expirada", "Volte para a extensão e inicie a conexão novamente.");

  try {
    const userToken = await exchangeCodeForToken(code, publicGithubCallback(request));
    const user = await fetchGithubUser(userToken);
    const installationId = await findUserInstallationId(userToken);
    await supabaseAdmin.from("github_license_connections").upsert({
      license_id: stateRow.license_id,
      github_user_id: user.id,
      github_login: user.login,
      github_avatar_url: user.avatar_url,
      installation_id: installationId,
      status: installationId ? "connected" : "pending_installation",
      connected_at: installationId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "license_id" });

    if (!installationId) {
      const slug = process.env.GITHUB_APP_SLUG;
      const installUrl = slug ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` : undefined;
      return callbackPage("Autorização concluída", "Agora instale a Super Lovable somente nos repositórios que você escolher. Quando terminar, volte à extensão e clique novamente em Conectar GitHub para confirmar a instalação.", installUrl);
    }
    return callbackPage("GitHub conectado", "A autorização foi concluída. Agora selecione o projeto uma única vez na extensão.");
  } catch (error) {
    console.error("[github-agent/callback]", error);
    return callbackPage("Falha na conexão", "Não foi possível concluir a autorização. Volte para a extensão e tente novamente.");
  }
}

export async function getLicenseConnection(licenseId: string) {
  const { data } = await supabaseAdmin
    .from("github_license_connections")
    .select("*")
    .eq("license_id", licenseId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function repositoriesForLicense(licenseId: string) {
  const connection = await getLicenseConnection(licenseId);
  const installationId = Number(connection?.installation_id || 0);
  if (!installationId) return [];
  return listInstallationRepos(installationId);
}

export async function bindRepository(licenseId: string, fullName: string, branch?: string) {
  const connection = await getLicenseConnection(licenseId);
  const installationId = Number(connection?.installation_id || 0);
  if (!installationId) throw new Error("Conecte o GitHub primeiro.");
  const repositories = await listInstallationRepos(installationId);
  const repository = repositories.find((item) => item.full_name === fullName);
  if (!repository) throw new Error("Esse repositório não foi autorizado na instalação.");
  const selectedBranch = String(branch || repository.default_branch || "main").trim();
  await supabaseAdmin.from("github_license_connections").update({
    repository_id: repository.id,
    repository_full_name: repository.full_name,
    repository_url: repository.html_url,
    branch: selectedBranch,
    status: "ready",
    updated_at: new Date().toISOString(),
  } as never).eq("license_id", licenseId);
  return { repository, branch: selectedBranch };
}

async function githubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...headers(token), ...(init?.headers || {}) } });
  const raw = await response.text();
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}: ${raw.slice(0, 240)}`);
  return raw ? JSON.parse(raw) as T : ({} as T);
}

function contentPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function scorePath(path: string, prompt: string) {
  const lower = path.toLowerCase();
  const words = prompt.toLowerCase().split(/[^a-z0-9á-ú_-]+/).filter((word) => word.length >= 4);
  let score = words.reduce((total, word) => total + (lower.includes(word) ? 8 : 0), 0);
  if (/\.(tsx|ts|jsx|js|css|json|sql)$/.test(lower)) score += 2;
  if (lower.includes("route") || lower.includes("page") || lower.includes("component")) score += 2;
  if (/lock|node_modules|dist|\.output|routeTree\.gen/.test(lower)) score -= 100;
  return score;
}

async function repoContext(token: string, repo: string, branch: string, prompt: string, reduced = false) {
  const ref = await githubJson<{ object: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const commit = await githubJson<{ tree: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/commits/${ref.object.sha}`, token);
  const tree = await githubJson<{ tree: Array<{ path: string; type: string; size?: number }> }>(`${GITHUB_API}/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`, token);
  const candidates = tree.tree
    .filter((item) => item.type === "blob" && (item.size || 0) < 120_000)
    .map((item) => ({ ...item, score: scorePath(item.path, prompt) }))
    .filter((item) => item.score > -50)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, reduced ? REDUCED_CONTEXT_FILES : MAX_CONTEXT_FILES);
  const files: ContextFile[] = [];
  let used = 0;
  const contextLimit = reduced ? REDUCED_CONTEXT_CHARS : MAX_CONTEXT_CHARS;
  for (const item of candidates) {
    const file = await githubJson<{ content?: string; encoding?: string }>(`${GITHUB_API}/repos/${repo}/contents/${contentPath(item.path)}?ref=${encodeURIComponent(branch)}`, token);
    const content = file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
    if (!content || used >= contextLimit) continue;
    const remaining = contextLimit - used;
    const selected = content.slice(0, remaining);
    if (!selected) continue;
    used += selected.length;
    files.push({ path: item.path, content: selected });
  }
  return { baseSha: ref.object.sha, treeSha: commit.tree.sha, files, contextChars: used, reduced };
}

function extractJson(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não retornou um plano de código válido.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

const systemPrompt = `Você é o agente de programação da Super Lovable. Receberá um pedido e arquivos reais de um projeto conectado ao GitHub. Retorne SOMENTE JSON válido no formato {"summary":"resumo em português","commit_message":"mensagem curta em português","files":[{"path":"caminho existente ou novo","content":"conteúdo completo final"}]}. Faça a menor alteração correta que cumpra o pedido. Preserve arquitetura, estilo, TypeScript e recursos existentes. Nunca inclua segredos, .env, lockfiles, arquivos gerados ou binários. No máximo 8 arquivos. Se o contexto for insuficiente, retorne {"summary":"CONTEXT_REQUIRED: caminhos adicionais separados por vírgula","commit_message":"","files":[]}.`;

async function callGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const model = process.env.GEMINI_CODE_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`GEMINI_${response.status}:${raw.slice(0, 180)}`);
  const data = JSON.parse(raw) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return { provider: "gemini", model, raw: String(data.candidates?.[0]?.content?.parts?.[0]?.text || "") };
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}

function compactPayload(payload: string, maxChars: number) {
  try {
    const parsed = JSON.parse(payload) as { request?: string; repository?: string; branch?: string; files?: ContextFile[] };
    let remaining = maxChars;
    const files = (parsed.files || []).flatMap((file) => {
      if (remaining <= 0) return [];
      const allowance = Math.min(remaining, Math.max(1_200, Math.floor(maxChars / Math.max(1, parsed.files?.length || 1))));
      const content = String(file.content || "");
      const selected = content.length <= allowance
        ? content
        : `${content.slice(0, Math.floor(allowance * 0.7))}\n/* ... trecho reduzido automaticamente ... */\n${content.slice(-Math.floor(allowance * 0.3))}`;
      remaining -= selected.length;
      return [{ path: file.path, content: selected }];
    });
    return JSON.stringify({ request: parsed.request, repository: parsed.repository, branch: parsed.branch, context_reduced: true, files });
  } catch {
    return payload.slice(0, maxChars);
  }
}

function isGroqCapacityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /GROQ_(413|429)|request too large|tokens per minute|\bTPM\b/i.test(message);
}

async function callGroq(prompt: string, reducedContext: boolean) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");
  const model = process.env.GROQ_CODE_MODEL || "openai/gpt-oss-20b";
  console.info("[github-agent] chamada Groq", {
    model,
    approximateInputTokens: estimateTokens(`${systemPrompt}\n${prompt}`),
    reducedContext,
  });
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`GROQ_${response.status}:${raw.slice(0, 180)}`);
  const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
  return { provider: "groq", model, raw: String(data.choices?.[0]?.message?.content || "") };
}

async function generatePlan(payload: string, forceReduced = false) {
  try { return await callGemini(payload); }
  catch (geminiError) {
    console.warn("[github-agent] Gemini indisponível; acionando Groq com contexto reduzido", {
      error: geminiError instanceof Error ? geminiError.message : String(geminiError),
      originalApproximateTokens: estimateTokens(payload),
    });
    const compact = compactPayload(payload, forceReduced ? GROQ_RETRY_CONTEXT_CHARS : GROQ_CONTEXT_CHARS);
    try {
      return await callGroq(compact, true);
    } catch (groqError) {
      console.error("[github-agent] Groq indisponível", {
        model: process.env.GROQ_CODE_MODEL || "openai/gpt-oss-20b",
        approximateInputTokens: estimateTokens(compact),
        reducedContext: true,
        error: groqError instanceof Error ? groqError.message : String(groqError),
      });
      if (isGroqCapacityError(groqError)) {
        throw new AgentPlanError(
          "Este projeto enviou informações demais para a IA de uma só vez. Tente novamente com o contexto reduzido.",
          "AI_CONTEXT_TOO_LARGE",
          !forceReduced,
          413,
        );
      }
      throw new AgentPlanError(
        "A inteligência artificial ficou indisponível durante o processamento. Tente novamente em alguns instantes.",
        "AI_PROVIDER_UNAVAILABLE",
        true,
        503,
      );
    }
  }
}

function sanitizeFiles(value: unknown): ProposedFile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item): ProposedFile[] => {
    if (!item || typeof item !== "object") return [];
    const path = String((item as Record<string, unknown>).path || "").trim();
    const content = String((item as Record<string, unknown>).content ?? "");
    if (!path || path.startsWith("/") || path.includes("..") || /(^|\/)(\.env|node_modules|dist|\.output)(\/|$)|lock$/i.test(path)) return [];
    if (content.length > 300_000) return [];
    return [{ path, content }];
  });
}

export async function planAgentRun(auth: LicenseAuth, prompt: string, options: { reducedContext?: boolean } = {}) {
  const connection = await getLicenseConnection(auth.license.id);
  const installationId = Number(connection?.installation_id || 0);
  const repo = String(connection?.repository_full_name || "");
  const branch = String(connection?.branch || "main");
  if (!installationId || !repo) throw new Error("Conecte e selecione o projeto GitHub primeiro.");
  const token = await createInstallationToken(installationId);
  const reducedContext = Boolean(options.reducedContext);
  const context = await repoContext(token, repo, branch, prompt, reducedContext);
  const payload = JSON.stringify({ request: prompt, repository: repo, branch, files: context.files });
  console.info("[github-agent] contexto preparado", {
    repository: repo,
    files: context.files.length,
    contextChars: context.contextChars,
    approximateTokens: estimateTokens(payload),
    reducedContext,
  });
  const ai = await generatePlan(payload, reducedContext);
  const parsed = extractJson(ai.raw);
  const files = sanitizeFiles(parsed.files);
  if (!files.length) throw new Error(String(parsed.summary || "A IA não propôs uma alteração segura."));
  const summary = String(parsed.summary || "Alteração preparada.").slice(0, 2_000);
  const commitMessage = String(parsed.commit_message || "aplicar alteração pela Super Lovable").slice(0, 120);
  const { data, error } = await supabaseAdmin.from("github_agent_runs").insert({
    license_id: auth.license.id,
    repository_full_name: repo,
    branch,
    prompt,
    provider: ai.provider,
    model: ai.model,
    status: "planned",
    summary,
    commit_message: commitMessage,
    proposed_files: files as never,
    base_sha: context.baseSha,
  } as never).select("id").single();
  if (error || !data) throw new Error("Não foi possível salvar o plano da alteração.");
  return { runId: String((data as { id: string }).id), summary, commitMessage, files: files.map((file) => file.path), provider: ai.provider };
}

export async function commitAgentRun(auth: LicenseAuth, runId: string) {
  const { data } = await supabaseAdmin.from("github_agent_runs").select("*").eq("id", runId).eq("license_id", auth.license.id).maybeSingle();
  const run = data as Record<string, unknown> | null;
  if (!run || run.status !== "planned") throw new Error("Plano não encontrado ou já utilizado.");
  const connection = await getLicenseConnection(auth.license.id);
  const installationId = Number(connection?.installation_id || 0);
  if (!installationId) throw new Error("Conexão GitHub indisponível.");
  const token = await createInstallationToken(installationId);
  const repo = String(run.repository_full_name);
  const branch = String(run.branch);
  const ref = await githubJson<{ object: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (ref.object.sha !== run.base_sha) throw new Error("O projeto mudou depois do plano. Gere a alteração novamente para evitar conflito.");
  const baseCommit = await githubJson<{ tree: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/commits/${ref.object.sha}`, token);
  const proposed = sanitizeFiles(run.proposed_files);
  const elements: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const file of proposed) {
    const blob = await githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/blobs`, token, { method: "POST", body: JSON.stringify({ content: file.content, encoding: "utf-8" }) });
    elements.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/trees`, token, { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: elements }) });
  const commit = await githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/commits`, token, { method: "POST", body: JSON.stringify({ message: String(run.commit_message), tree: tree.sha, parents: [ref.object.sha] }) });
  await githubJson(`${GITHUB_API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
  await supabaseAdmin.from("github_agent_runs").update({ status: "committed", commit_sha: commit.sha, updated_at: new Date().toISOString() } as never).eq("id", runId);
  return { commitSha: commit.sha, repository: repo, branch, summary: run.summary };
}
