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
const MAX_CONTEXT_FILES = 8;
const MAX_CONTEXT_CHARS = 18_000;
const REDUCED_CONTEXT_FILES = 4;
const REDUCED_CONTEXT_CHARS = 8_000;
const REPOSITORY_MAP_CHARS = 18_000;
const REDUCED_REPOSITORY_MAP_CHARS = 8_000;
const GROQ_CONTEXT_CHARS = 6_000;
const GROQ_RETRY_CONTEXT_CHARS = 2_800;
const GROQ_MAX_COMPLETION_TOKENS = 1_200;
const MAX_CONTEXT_ROUNDS = 5;
const PROVIDER_TIMEOUT_MS = 45_000;
const TRANSIENT_RETRY_DELAYS = [700, 1_600];

type LicenseAuth = Awaited<ReturnType<typeof requireActiveExtensionLicense>>;
type ProposedFile = { path: string; content: string };
type ContextFile = { path: string; content: string };
type ProposedEdit = { path: string; search: string; replace: string };
type RiskLevel = "low" | "medium" | "high" | "blocked";
type ValidationReport = {
  riskLevel: RiskLevel;
  autoMerge: boolean;
  filesChecked: number;
  changedCharacters: number;
  reasons: string[];
  warnings: string[];
};
type SandboxValidation = {
  status: "passed" | "failed" | "skipped" | "unavailable";
  stage: string;
  output: string;
  duration_ms?: number;
};

export async function getBuildRunnerHealth() {
  const runnerUrl = String(process.env.BUILD_RUNNER_URL || "").replace(/\/$/, "");
  const configured = Boolean(runnerUrl && process.env.BUILD_RUNNER_SECRET);
  if (!configured) return { configured: false, ok: false, error: "RUNNER_NOT_CONFIGURED" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`${runnerUrl}/health`, {
      headers: {
        Accept: "application/json",
        "X-Runner-Secret": String(process.env.BUILD_RUNNER_SECRET || ""),
      },
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || result.ok !== true || result.secret_valid !== true) {
      return {
        configured: true,
        ok: false,
        error:
          result.secret_valid === false
            ? "RUNNER_UNAUTHORIZED"
            : String(result.error || `RUNNER_HTTP_${response.status}`),
      };
    }
    return {
      configured: true,
      ok: true,
      activeBuilds: Math.max(0, Number(result.active_builds || 0)),
      capacity: Math.max(1, Number(result.capacity || 1)),
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : "RUNNER_UNAVAILABLE",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientProviderStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryDelayFromResponse(response: Response | null, fallback: number) {
  if (!response) return fallback;
  const raw = response.headers.get("retry-after");
  const seconds = Number(raw || 0);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(15_000, seconds * 1_000);
  return fallback;
}

async function providerFetch(url: string, init: RequestInit) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      lastResponse = response;
      if (
        !isTransientProviderStatus(response.status) ||
        attempt === TRANSIENT_RETRY_DELAYS.length
      ) {
        return response;
      }
    } catch (error) {
      if (attempt === TRANSIENT_RETRY_DELAYS.length) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await wait(
      retryDelayFromResponse(
        lastResponse,
        TRANSIENT_RETRY_DELAYS[attempt] + Math.floor(Math.random() * 350),
      ),
    );
  }
  if (lastResponse) return lastResponse;
  throw new Error("AI_PROVIDER_TIMEOUT");
}

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
    return {
      message: error.message,
      code: error.code,
      retryable: error.retryable,
      status: error.status,
    };
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
  const row = data as {
    state: string;
    license_id: string;
    used: boolean;
    expires_at: string;
  } | null;
  if (!row || row.used || Date.parse(row.expires_at) < Date.now()) return null;
  await supabaseAdmin
    .from("github_license_oauth_states")
    .update({ used: true } as never)
    .eq("state", state);
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
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;background:#130b22;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:520px;padding:32px;text-align:center"><h1>${title}</h1><p style="color:#d8cdea;line-height:1.6">${message}</p>${action}<p style="color:#9f8db8;font-size:13px;margin-top:22px">Depois, volte para a extensão Super Lovable.</p></main></body></html>`,
    {
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function finishLicenseGithubConnection(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state)
    return callbackPage(
      "Conexão incompleta",
      "O GitHub não devolveu os dados necessários. Tente conectar novamente.",
    );
  const stateRow = await consumeLicenseGithubState(state);
  if (!stateRow)
    return callbackPage("Conexão expirada", "Volte para a extensão e inicie a conexão novamente.");

  try {
    const userToken = await exchangeCodeForToken(code, publicGithubCallback(request));
    const user = await fetchGithubUser(userToken);
    const installationId = await findUserInstallationId(userToken);
    await supabaseAdmin.from("github_license_connections").upsert(
      {
        license_id: stateRow.license_id,
        github_user_id: user.id,
        github_login: user.login,
        github_avatar_url: user.avatar_url,
        installation_id: installationId,
        status: installationId ? "connected" : "pending_installation",
        connected_at: installationId ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "license_id" },
    );

    if (!installationId) {
      const slug = process.env.GITHUB_APP_SLUG;
      const installUrl = slug
        ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`
        : undefined;
      return callbackPage(
        "Autorização concluída",
        "Agora instale a Super Lovable somente nos repositórios que você escolher. Quando terminar, volte à extensão e clique novamente em Conectar GitHub para confirmar a instalação.",
        installUrl,
      );
    }
    return callbackPage(
      "GitHub conectado",
      "A autorização foi concluída. Agora selecione o projeto uma única vez na extensão.",
    );
  } catch (error) {
    console.error("[github-agent/callback]", error);
    return callbackPage(
      "Falha na conexão",
      "Não foi possível concluir a autorização. Volte para a extensão e tente novamente.",
    );
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

export async function disconnectLicenseGithub(licenseId: string) {
  const { error } = await supabaseAdmin
    .from("github_license_connections")
    .delete()
    .eq("license_id", licenseId);
  if (error) throw new Error("Não foi possível desconectar a conta do GitHub.");

  await supabaseAdmin
    .from("github_license_oauth_states")
    .delete()
    .eq("license_id", licenseId);

  return { disconnected: true };
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
  await supabaseAdmin
    .from("github_license_connections")
    .update({
      repository_id: repository.id,
      repository_full_name: repository.full_name,
      repository_url: repository.html_url,
      branch: selectedBranch,
      status: "ready",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("license_id", licenseId);
  return { repository, branch: selectedBranch };
}

async function githubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers(token), ...(init?.headers || {}) },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}: ${raw.slice(0, 240)}`);
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

function scorePath(path: string, prompt: string) {
  const lower = path.toLowerCase();
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9á-ú_-]+/)
    .filter((word) => word.length >= 4);
  let score = words.reduce((total, word) => total + (lower.includes(word) ? 8 : 0), 0);
  if (/\.(tsx|ts|jsx|js|css|json|sql)$/.test(lower)) score += 2;
  if (lower.includes("route") || lower.includes("page") || lower.includes("component")) score += 2;
  if (/^src\/(routes|pages)\/index\.(tsx|ts|jsx|js)$/.test(lower)) score += 24;
  if (/^src\/(app|main)\.(tsx|ts|jsx|js)$/.test(lower)) score += 20;
  if (/lock|node_modules|dist|\.output|routeTree\.gen/.test(lower)) score -= 100;
  return score;
}

async function repoContext(
  token: string,
  repo: string,
  branch: string,
  prompt: string,
  reduced = false,
) {
  const ref = await githubJson<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );
  const commit = await githubJson<{ tree: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/commits/${ref.object.sha}`,
    token,
  );
  const tree = await githubJson<{ tree: Array<{ path: string; type: string; size?: number }> }>(
    `${GITHUB_API}/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`,
    token,
  );
  const repositoryPaths = tree.tree
    .filter((item) => item.type === "blob")
    .map((item) => item.path)
    .filter((path) => !/node_modules|dist|\.output|routeTree\.gen|(^|\/)\./i.test(path));
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
    const file = await githubJson<{ content?: string; encoding?: string }>(
      `${GITHUB_API}/repos/${repo}/contents/${contentPath(item.path)}?ref=${encodeURIComponent(branch)}`,
      token,
    );
    const content =
      file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
    if (!content || used >= contextLimit) continue;
    const remaining = contextLimit - used;
    const selected = content.slice(0, remaining);
    if (!selected) continue;
    used += selected.length;
    files.push({ path: item.path, content: selected });
  }
  const mapLimit = reduced ? REDUCED_REPOSITORY_MAP_CHARS : REPOSITORY_MAP_CHARS;
  const availableFiles = repositoryPaths
    .sort(
      (left, right) =>
        scorePath(right, prompt) - scorePath(left, prompt) || left.localeCompare(right),
    )
    .join("\n")
    .slice(0, mapLimit)
    .split("\n")
    .filter(Boolean);
  return {
    baseSha: ref.object.sha,
    treeSha: commit.tree.sha,
    files,
    repositoryPaths,
    availableFiles,
    contextChars: used,
    reduced,
  };
}

function extractJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA não retornou um plano de código válido.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function requestedContextPaths(summary: unknown) {
  const text = String(summary || "").trim();
  if (!/^CONTEXT_REQUIRED\s*:/i.test(text)) return [];
  return text
    .replace(/^CONTEXT_REQUIRED\s*:/i, "")
    .split(/[,\n]/)
    .map((path) => path.trim().replace(/^['"`]|['"`]$/g, ""))
    .filter((path) => path && !path.startsWith("/") && !path.includes(".."))
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .slice(0, MAX_CONTEXT_FILES);
}

function contextRequestPaths(parsed: Record<string, unknown>) {
  const request = parsed.context_request;
  const structured =
    request &&
    typeof request === "object" &&
    Array.isArray((request as Record<string, unknown>).paths)
      ? ((request as Record<string, unknown>).paths as unknown[])
      : [];
  return [
    ...structured.map(String).map((path) => path.trim()),
    ...requestedContextPaths(parsed.summary),
  ]
    .filter((path) => path && !path.startsWith("/") && !path.includes(".."))
    .filter((path, index, all) => all.indexOf(path) === index)
    .slice(0, MAX_CONTEXT_FILES);
}

async function requestedRepoContext(
  token: string,
  repo: string,
  branch: string,
  paths: string[],
  repositoryPaths: string[],
  reduced: boolean,
) {
  const files: ContextFile[] = [];
  const missing: string[] = [];
  const resolved: Array<{ requested: string; actual: string }> = [];
  const resolvePath = (requested: string) => {
    const normalized = requested.toLowerCase();
    const exact = repositoryPaths.find((path) => path.toLowerCase() === normalized);
    if (exact) return exact;
    const basename = normalized.split("/").pop() || normalized;
    const sameName = repositoryPaths.filter(
      (path) => (path.toLowerCase().split("/").pop() || "") === basename,
    );
    if (sameName.length) {
      const requestedParts = normalized.split("/");
      return sameName.sort((left, right) => {
        const score = (candidate: string) => {
          const parts = candidate.toLowerCase().split("/");
          const value = requestedParts.reduce(
            (total, part) => total + (parts.includes(part) ? 4 : 0),
            0,
          );
          return value - parts.length;
        };
        return score(right) - score(left) || left.localeCompare(right);
      })[0];
    }
    return null;
  };
  let remaining = reduced ? REDUCED_CONTEXT_CHARS : MAX_CONTEXT_CHARS;
  for (const path of paths) {
    if (remaining <= 0) break;
    const actualPath = resolvePath(path);
    if (!actualPath) {
      missing.push(path);
      continue;
    }
    try {
      const file = await githubJson<{ content?: string; encoding?: string }>(
        `${GITHUB_API}/repos/${repo}/contents/${contentPath(actualPath)}?ref=${encodeURIComponent(branch)}`,
        token,
      );
      const content =
        file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
      if (!content) {
        missing.push(path);
        continue;
      }
      const selected = content.slice(0, remaining);
      remaining -= selected.length;
      files.push({ path: actualPath, content: selected });
      if (actualPath !== path) resolved.push({ requested: path, actual: actualPath });
    } catch {
      missing.push(path);
    }
  }
  return { files, missing, resolved };
}

export type AgentAiProvider = {
  kind: "customer";
  groq?: { apiKey: string; model: string };
  gemini?: { apiKey: string; model: string };
};

const systemPrompt = `Você é um agente de programação geral. O pedido pode se referir a qualquer projeto. "available_files" é o mapa de caminhos reais do repositório e "files" contém trechos de arquivos já carregados. Não invente caminhos. Retorne SOMENTE JSON válido no formato {"summary":"resumo em português","commit_message":"mensagem curta em português","edits":[{"path":"caminho existente","search":"trecho EXATO atual","replace":"novo trecho"}],"new_files":[{"path":"novo caminho","content":"conteúdo completo"}]}. Para arquivos existentes, NUNCA devolva o arquivo completo: use somente edits cirúrgicos com o menor trecho único possível. Preserve tudo que não foi solicitado. Nunca use nem copie o marcador "trecho reduzido automaticamente". Nunca inclua segredos, .env, lockfiles, arquivos gerados ou binários. No máximo 12 edições e 4 arquivos novos. Se precisar ler outros arquivos antes de editar, escolha caminhos EXATOS de "available_files" e retorne {"summary":"CONTEXT_REQUIRED","commit_message":"","edits":[],"new_files":[],"context_request":{"paths":["caminho/real"]}}.`;

async function callGeminiModel(prompt: string, model: string, keyOverride?: string) {
  const key = keyOverride || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const response = await providerFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    },
  );
  const raw = await response.text();
  if (!response.ok) throw new Error(`GEMINI_${response.status}:${raw.slice(0, 180)}`);
  const data = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return {
    provider: "gemini",
    model,
    raw: String(data.candidates?.[0]?.content?.parts?.[0]?.text || ""),
  };
}

async function callGemini(prompt: string, customer?: { apiKey: string; model: string }) {
  const models = [
    customer?.model,
    customer ? undefined : process.env.GEMINI_CODE_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index);
  let lastError: unknown;
  for (const model of models) {
    try {
      return await callGeminiModel(prompt, model, customer?.apiKey);
    } catch (error) {
      lastError = error;
      console.warn("[github-agent] modelo Gemini indisponível", {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError || new Error("GEMINI_NOT_CONFIGURED");
}

async function callLovableGateway(prompt: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_GATEWAY_NOT_CONFIGURED");
  const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
  let lastError: unknown;
  for (const model of models) {
    try {
      const response = await providerFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 4_000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`LOVABLE_GATEWAY_${response.status}:${raw.slice(0, 180)}`);
      const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
      return {
        provider: "lovable-gateway",
        model,
        raw: String(data.choices?.[0]?.message?.content || ""),
      };
    } catch (error) {
      lastError = error;
      console.warn("[github-agent] modelo do Lovable AI indisponível", {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError || new Error("LOVABLE_GATEWAY_UNAVAILABLE");
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}

function compactPayload(payload: string, maxChars: number) {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown> & {
      files?: ContextFile[];
      available_files?: string[];
    };
    let remaining = maxChars;
    const files = (parsed.files || []).flatMap((file) => {
      if (remaining <= 0) return [];
      const allowance = Math.min(
        remaining,
        Math.max(1_200, Math.floor(maxChars / Math.max(1, parsed.files?.length || 1))),
      );
      const content = String(file.content || "");
      const selected =
        content.length <= allowance
          ? content
          : `${content.slice(0, Math.floor(allowance * 0.7))}\n/* ... trecho reduzido automaticamente ... */\n${content.slice(-Math.floor(allowance * 0.3))}`;
      remaining -= selected.length;
      return [{ path: file.path, content: selected }];
    });
    const mapBudget = Math.max(2_000, Math.floor(maxChars * 0.35));
    const availableFiles = (parsed.available_files || [])
      .join("\n")
      .slice(0, mapBudget)
      .split("\n")
      .filter(Boolean);
    return JSON.stringify({
      request: parsed.request,
      repository: parsed.repository,
      branch: parsed.branch,
      context_round: parsed.context_round,
      requested_files: parsed.requested_files,
      resolved_files: parsed.resolved_files,
      missing_files: parsed.missing_files,
      context_reduced: true,
      available_files: availableFiles,
      files,
    });
  } catch {
    return payload.slice(0, maxChars);
  }
}

function isGroqContextError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /GROQ_413|request too large|context length|maximum context/i.test(message);
}

function isGroqRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /GROQ_429|rate limit|tokens per minute|requests per minute|\bTPM\b|\bRPM\b/i.test(message);
}

function providerErrorCode(error: unknown, prefix: string) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(new RegExp(`${prefix}_(\\d{3})`, "i"));
  if (match) return match[1];
  if (/NOT_CONFIGURED/i.test(message)) return "não configurado";
  if (/AbortError|TIMEOUT/i.test(message)) return "tempo esgotado";
  return "indisponível";
}

async function callGroq(prompt: string, reducedContext: boolean, customer?: { apiKey: string; model: string }) {
  const key = customer?.apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");
  const model = customer?.model || process.env.GROQ_CODE_MODEL || "openai/gpt-oss-20b";
  console.info("[github-agent] chamada Groq", {
    model,
    approximateInputTokens: estimateTokens(`${systemPrompt}\n${prompt}`),
    reducedContext,
  });
  const response = await providerFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`GROQ_${response.status}:${raw.slice(0, 180)}`);
  const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
  return { provider: "groq", model, raw: String(data.choices?.[0]?.message?.content || "") };
}

async function generatePlan(payload: string, forceReduced = false, customerAi?: AgentAiProvider) {
  if (customerAi) {
    let groqError: unknown = null;
    if (customerAi.groq) {
      try {
        const compact = compactPayload(payload, forceReduced ? GROQ_RETRY_CONTEXT_CHARS : GROQ_CONTEXT_CHARS);
        return await callGroq(compact, true, customerAi.groq);
      } catch (error) {
        groqError = error;
      }
    }
    if (customerAi.gemini) {
      try {
        return await callGemini(payload, customerAi.gemini);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const status = Number(message.match(/GEMINI_(\d{3})/)?.[1] || 0);
        if (status === 429) throw new AgentPlanError("Suas cotas gratuitas do Groq e do Gemini estão temporariamente esgotadas.", "AI_RATE_LIMITED", true, 429);
        if (status === 401 || status === 403) throw new AgentPlanError("A chave Gemini conectada é inválida ou perdeu acesso.", "CUSTOMER_AI_UNAUTHORIZED", false, 401);
      }
    }
    const groqStatus = Number((groqError instanceof Error ? groqError.message : "").match(/GROQ_(\d{3})/)?.[1] || 0);
    if (groqStatus === 429) throw new AgentPlanError("Sua cota gratuita do Groq foi atingida. Configure também o Gemini como contingência.", "AI_RATE_LIMITED", true, 429);
    if (groqStatus === 401 || groqStatus === 403) throw new AgentPlanError("A chave Groq conectada é inválida ou perdeu acesso.", "CUSTOMER_AI_UNAUTHORIZED", false, 401);
    throw new AgentPlanError("Os provedores configurados pelo cliente estão temporariamente indisponíveis.", "AI_PROVIDER_UNAVAILABLE", true, 503);
  }
  try {
    return await callGemini(payload);
  } catch (geminiError) {
    console.warn("[github-agent] Gemini direto indisponível; acionando Lovable AI", {
      error: geminiError instanceof Error ? geminiError.message : String(geminiError),
      originalApproximateTokens: estimateTokens(payload),
    });
    try {
      return await callLovableGateway(payload);
    } catch (gatewayError) {
      console.warn("[github-agent] Lovable AI indisponível; acionando Groq", {
        error: gatewayError instanceof Error ? gatewayError.message : String(gatewayError),
      });
      const compact = compactPayload(
        payload,
        forceReduced ? GROQ_RETRY_CONTEXT_CHARS : GROQ_CONTEXT_CHARS,
      );
      try {
        return await callGroq(compact, true);
      } catch (groqError) {
        let finalGroqError = groqError;
        if (isGroqContextError(groqError) && !forceReduced) {
          const ultraCompact = compactPayload(payload, GROQ_RETRY_CONTEXT_CHARS);
          try {
            return await callGroq(ultraCompact, true);
          } catch (retryError) {
            finalGroqError = retryError;
          }
        }
        console.error("[github-agent] Groq indisponível", {
          model: process.env.GROQ_CODE_MODEL || "openai/gpt-oss-20b",
          approximateInputTokens: estimateTokens(compact),
          reducedContext: true,
          error: finalGroqError instanceof Error ? finalGroqError.message : String(finalGroqError),
        });
        if (isGroqContextError(finalGroqError)) {
          throw new AgentPlanError(
            "Este projeto enviou informações demais para a IA de uma só vez. Tente novamente com o contexto reduzido.",
            "AI_CONTEXT_TOO_LARGE",
            !forceReduced,
            413,
          );
        }
        if (isGroqRateLimitError(finalGroqError)) {
          throw new AgentPlanError(
            "As IAs gratuitas atingiram o limite temporário de uso. O projeto e o prompt estão corretos; aguarde alguns instantes e envie novamente.",
            "AI_RATE_LIMITED",
            false,
            429,
          );
        }
        throw new AgentPlanError(
          `Nenhum provedor de IA conseguiu concluir o processamento (Gemini: ${providerErrorCode(geminiError, "GEMINI")}; Lovable AI: ${providerErrorCode(gatewayError, "LOVABLE_GATEWAY")}; Groq: ${providerErrorCode(finalGroqError, "GROQ")}). Tente novamente em alguns instantes.`,
          "AI_PROVIDER_UNAVAILABLE",
          !forceReduced,
          503,
        );
      }
    }
  }
}

function sanitizeFiles(value: unknown): ProposedFile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item): ProposedFile[] => {
    if (!item || typeof item !== "object") return [];
    const path = String((item as Record<string, unknown>).path || "").trim();
    const content = String((item as Record<string, unknown>).content ?? "");
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("..") ||
      /(^|\/)(\.env|node_modules|dist|\.output)(\/|$)|lock$/i.test(path)
    )
      return [];
    if (content.length > 300_000 || /trecho reduzido automaticamente/i.test(content)) return [];
    return [{ path, content }];
  });
}

function safeAgentPath(path: string) {
  return Boolean(
    path &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    !/(^|\/)(\.env|node_modules|dist|\.output)(\/|$)|lock$/i.test(path),
  );
}

function sanitizeEdits(value: unknown): ProposedEdit[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item): ProposedEdit[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const path = String(candidate.path || "").trim();
    const search = String(candidate.search ?? "");
    const replace = String(candidate.replace ?? "");
    if (!safeAgentPath(path) || !search || search === replace) return [];
    if (search.length > 20_000 || replace.length > 40_000) return [];
    if (/trecho reduzido automaticamente/i.test(search + replace)) return [];
    return [{ path, search, replace }];
  });
}

const BLOCKED_AGENT_PATH =
  /(^|\/)(\.env(?:\.|$)|\.github\/workflows|node_modules|dist|\.output)(\/|$)|(?:^|\/)(?:id_rsa|id_ed25519|.*\.(?:pem|p12|pfx|key))$|(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock)$/i;
const HIGH_RISK_AGENT_PATH =
  /(^|\/)(?:auth|authentication|billing|payment|checkout|license|security)(\/|\.|-|$)|(^|\/)supabase\/(?:migrations|functions)(\/|$)|(^|\/)(?:api|server)(\/|\.|-|$)|package\.json$/i;
const MEDIUM_RISK_AGENT_PATH =
  /(^|\/)(?:config|middleware)(\/|\.|-|$)|(^|\/)(?:router|route-tree|routeTree)(?:\.|-|$)|(?:manifest|vite\.config|tsconfig)\.(?:json|js|ts)$/i;
const SECRET_CONTENT =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|github_pat|sk_live|sk_test)_[A-Za-z0-9_-]{16,}|\bAKIA[0-9A-Z]{16}\b/i;
const DESTRUCTIVE_SQL = /\b(?:drop\s+(?:table|schema|database)|truncate\s+table)\b/i;

function riskRank(level: RiskLevel) {
  return { low: 0, medium: 1, high: 2, blocked: 3 }[level];
}

function raiseRisk(current: RiskLevel, next: RiskLevel) {
  return riskRank(next) > riskRank(current) ? next : current;
}

function changedCharacterCount(original: string, next: string) {
  const sharedLength = Math.min(original.length, next.length);
  let changed = Math.abs(original.length - next.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (original[index] !== next[index]) changed += 1;
  }
  return changed;
}

async function validateProposedChanges(
  token: string,
  repo: string,
  branch: string,
  files: ProposedFile[],
): Promise<ValidationReport> {
  let riskLevel: RiskLevel = "low";
  let changedCharacters = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const normalizedPath = file.path.toLowerCase();
    if (seen.has(normalizedPath)) {
      riskLevel = "blocked";
      reasons.push(`O arquivo ${file.path} apareceu mais de uma vez no plano.`);
      continue;
    }
    seen.add(normalizedPath);

    if (BLOCKED_AGENT_PATH.test(file.path)) {
      riskLevel = "blocked";
      reasons.push(`${file.path} é um arquivo protegido e não pode ser alterado pelo agente.`);
    }
    if (SECRET_CONTENT.test(file.content)) {
      riskLevel = "blocked";
      reasons.push(`${file.path} parece conter uma credencial privada.`);
    }
    if (/\.sql$/i.test(file.path) && DESTRUCTIVE_SQL.test(file.content)) {
      riskLevel = "blocked";
      reasons.push(`${file.path} contém uma operação destrutiva de banco de dados.`);
    }
    if (/\.json$/i.test(file.path)) {
      try {
        JSON.parse(file.content);
      } catch {
        riskLevel = "blocked";
        reasons.push(`${file.path} contém JSON inválido.`);
      }
    }

    if (HIGH_RISK_AGENT_PATH.test(file.path)) {
      riskLevel = raiseRisk(riskLevel, "high");
      reasons.push(`${file.path} afeta uma área sensível e exige revisão.`);
    } else if (MEDIUM_RISK_AGENT_PATH.test(file.path)) {
      riskLevel = raiseRisk(riskLevel, "medium");
      reasons.push(`${file.path} altera configuração ou roteamento.`);
    }

    let original = "";
    try {
      original = await readRepositoryFile(token, repo, branch, file.path);
    } catch {
      warnings.push(`${file.path} será criado como um arquivo novo.`);
    }
    changedCharacters += changedCharacterCount(original, file.content);
  }

  if (files.length > 4) {
    riskLevel = raiseRisk(riskLevel, "medium");
    reasons.push("A alteração envolve mais de quatro arquivos.");
  }
  if (changedCharacters > 80_000) {
    riskLevel = raiseRisk(riskLevel, "high");
    reasons.push("O volume total da alteração é elevado.");
  } else if (changedCharacters > 20_000) {
    riskLevel = raiseRisk(riskLevel, "medium");
    reasons.push("O volume total da alteração requer uma conferência adicional.");
  }

  return {
    riskLevel,
    autoMerge: riskLevel === "low",
    filesChecked: files.length,
    changedCharacters,
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
  };
}

async function validateCommitInSandbox(
  repository: string,
  sha: string,
  githubToken: string,
): Promise<SandboxValidation> {
  const runnerUrl = String(process.env.BUILD_RUNNER_URL || "").replace(/\/$/, "");
  const runnerSecret = String(process.env.BUILD_RUNNER_SECRET || "");
  if (!runnerUrl || !runnerSecret) {
    return {
      status: "skipped",
      stage: "configuration",
      output: "Validador isolado ainda não configurado.",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 210_000);
  try {
    const response = await fetch(`${runnerUrl}/validate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runnerSecret}`,
        "X-Runner-Secret": runnerSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ repository, sha, github_token: githubToken }),
      signal: controller.signal,
    });
    const raw = await response.text();
    const result = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (!response.ok || result.ok === false) {
      return {
        status: "unavailable",
        stage: "runner",
        output: String(result.error || `Validador respondeu ${response.status}.`).slice(0, 4_000),
      };
    }
    const status = String(result.status || "failed");
    return {
      status:
        status === "passed" || status === "skipped" || status === "failed"
          ? status
          : "failed",
      stage: String(result.stage || "build").slice(0, 80),
      output: String(result.output || "").slice(-12_000),
      duration_ms: Number(result.duration_ms || 0) || undefined,
    };
  } catch (error) {
    return {
      status: "unavailable",
      stage: "connection",
      output: error instanceof Error ? error.message.slice(0, 4_000) : "Validador indisponível.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readRepositoryFile(token: string, repo: string, branch: string, path: string) {
  const file = await githubJson<{ content?: string; encoding?: string }>(
    `${GITHUB_API}/repos/${repo}/contents/${contentPath(path)}?ref=${encodeURIComponent(branch)}`,
    token,
  );
  return file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
}

async function readRepositoryFileOptional(
  token: string,
  repo: string,
  ref: string,
  path: string,
) {
  try {
    return await readRepositoryFile(token, repo, ref, path);
  } catch (error) {
    if (error instanceof Error && /GitHub respondeu 404/.test(error.message)) return null;
    throw error;
  }
}

async function materializePlanFiles(
  parsed: Record<string, unknown>,
  token: string,
  repo: string,
  branch: string,
  repositoryPaths: string[],
) {
  const edits = sanitizeEdits(parsed.edits);
  const newFiles = sanitizeFiles(parsed.new_files).filter(
    (file) => !repositoryPaths.some((path) => path.toLowerCase() === file.path.toLowerCase()),
  );
  if (!edits.length && !newFiles.length) return [];

  const byPath = new Map<string, ProposedEdit[]>();
  for (const edit of edits) {
    const actualPath = repositoryPaths.find(
      (path) => path.toLowerCase() === edit.path.toLowerCase(),
    );
    if (!actualPath) {
      throw new AgentPlanError(
        `A IA tentou editar um arquivo inexistente: ${edit.path}.`,
        "AI_INVALID_EDIT_PATH",
        true,
        422,
      );
    }
    byPath.set(actualPath, [...(byPath.get(actualPath) || []), { ...edit, path: actualPath }]);
  }

  const changedFiles: ProposedFile[] = [];
  for (const [path, pathEdits] of byPath) {
    const original = await readRepositoryFile(token, repo, branch, path);
    let content = original;
    for (const edit of pathEdits) {
      const first = content.indexOf(edit.search);
      const last = content.lastIndexOf(edit.search);
      if (first < 0 || first !== last) {
        throw new AgentPlanError(
          `A alteração proposta para ${path} não encontrou um trecho único e seguro. O agente fará uma nova leitura antes de tentar novamente.`,
          "AI_EDIT_NOT_UNIQUE",
          true,
          422,
        );
      }
      content = `${content.slice(0, first)}${edit.replace}${content.slice(first + edit.search.length)}`;
    }
    if (/trecho reduzido automaticamente/i.test(content)) {
      throw new AgentPlanError(
        `A alteração de ${path} foi bloqueada porque continha conteúdo truncado.`,
        "AI_TRUNCATED_CONTENT_BLOCKED",
        true,
        422,
      );
    }
    const changedCharacters =
      Math.abs(content.length - original.length) +
      pathEdits.reduce((total, edit) => total + edit.search.length + edit.replace.length, 0);
    if (original.length > 2_000 && changedCharacters > Math.max(12_000, original.length * 0.65)) {
      throw new AgentPlanError(
        `A alteração de ${path} foi bloqueada porque modificaria uma parte excessiva do arquivo.`,
        "AI_CHANGE_TOO_BROAD",
        false,
        422,
      );
    }
    changedFiles.push({ path, content });
  }
  return [...changedFiles, ...newFiles].slice(0, 8);
}

async function forcePlanWithFocusedContext(
  parsed: Record<string, unknown>,
  context: Awaited<ReturnType<typeof repoContext>>,
  token: string,
  repo: string,
  branch: string,
  prompt: string,
  reducedContext: boolean,
  customerAi?: AgentAiProvider,
) {
  const requested = contextRequestPaths(parsed);
  const rankedPaths = [
    ...requested,
    ...context.files.map((file) => file.path),
    ...context.availableFiles,
  ];
  const selectedPaths = rankedPaths
    .map(
      (path) =>
        context.repositoryPaths.find(
          (candidate) => candidate.toLowerCase() === path.toLowerCase(),
        ) || "",
    )
    .filter((path, index, paths) => path && paths.indexOf(path) === index)
    .slice(0, reducedContext ? 1 : 3);
  const focusedFiles: ContextFile[] = [];
  let remaining = reducedContext ? 24_000 : 90_000;
  for (const path of selectedPaths) {
    if (remaining <= 0) break;
    const content = await readRepositoryFile(token, repo, branch, path);
    if (!content) continue;
    const selected = content.slice(0, remaining);
    focusedFiles.push({ path, content: selected });
    remaining -= selected.length;
  }
  if (!focusedFiles.length) return null;

  const focusedPayload = JSON.stringify({
    request: prompt,
    repository: repo,
    branch,
    instruction:
      "DECISÃO FINAL: os arquivos mais prováveis já estão carregados. Não solicite mais contexto. Produza agora somente edits cirúrgicos para cumprir o pedido. Se o pedido não exigir mudança, explique em summary sem inventar arquivos.",
    files: focusedFiles,
  });
  console.info("[github-agent] decisão com contexto focado", {
    repository: repo,
    files: focusedFiles.map((file) => file.path),
    contextChars: focusedFiles.reduce((total, file) => total + file.content.length, 0),
    approximateTokens: estimateTokens(focusedPayload),
    reducedContext,
  });
  const ai = await generatePlan(focusedPayload, reducedContext, customerAi);
  const focusedParsed = extractJson(ai.raw);
  const files = await materializePlanFiles(
    focusedParsed,
    token,
    repo,
    branch,
    context.repositoryPaths,
  );
  return { ai, parsed: focusedParsed, files };
}

export async function planAgentRun(
  auth: LicenseAuth,
  prompt: string,
  options: { reducedContext?: boolean; ai?: AgentAiProvider } = {},
) {
  const connection = await getLicenseConnection(auth.license.id);
  const installationId = Number(connection?.installation_id || 0);
  const repo = String(connection?.repository_full_name || "");
  const branch = String(connection?.branch || "main");
  if (!installationId || !repo) throw new Error("Conecte e selecione o projeto GitHub primeiro.");
  const token = await createInstallationToken(installationId);
  const reducedContext = Boolean(options.reducedContext);
  const context = await repoContext(token, repo, branch, prompt, reducedContext);
  let payload = JSON.stringify({
    request: prompt,
    repository: repo,
    branch,
    available_files: context.availableFiles,
    files: context.files,
  });
  console.info("[github-agent] contexto preparado", {
    repository: repo,
    files: context.files.length,
    contextChars: context.contextChars,
    approximateTokens: estimateTokens(payload),
    reducedContext,
  });
  let ai = await generatePlan(payload, reducedContext, options.ai);
  let parsed = extractJson(ai.raw);
  let files = await materializePlanFiles(parsed, token, repo, branch, context.repositoryPaths);
  let accumulatedFiles: ContextFile[] = [...context.files];
  const attemptedContextPaths = new Set<string>();
  for (let round = 1; !files.length && round < MAX_CONTEXT_ROUNDS; round += 1) {
    const requestedPaths = contextRequestPaths(parsed).filter((path) => {
      const normalized = path.toLowerCase();
      if (attemptedContextPaths.has(normalized)) return false;
      attemptedContextPaths.add(normalized);
      return true;
    });
    if (!requestedPaths.length) break;
    const requested = await requestedRepoContext(
      token,
      repo,
      branch,
      requestedPaths,
      context.repositoryPaths,
      reducedContext,
    );
    console.info("[github-agent] contexto adicional solicitado", {
      round,
      requestedPaths,
      loadedFiles: requested.files.map((file) => file.path),
      missingFiles: requested.missing,
      resolvedPaths: requested.resolved,
      reducedContext,
    });
    accumulatedFiles = [
      ...accumulatedFiles.filter(
        (file) => !requested.files.some((newFile) => newFile.path === file.path),
      ),
      ...requested.files,
    ];
    payload = JSON.stringify({
      request: prompt,
      repository: repo,
      branch,
      context_round: round + 1,
      requested_files: requestedPaths,
      resolved_files: requested.resolved,
      missing_files: requested.missing,
      available_files: context.availableFiles,
      files: accumulatedFiles,
    });
    ai = await generatePlan(payload, reducedContext, options.ai);
    parsed = extractJson(ai.raw);
    files = await materializePlanFiles(parsed, token, repo, branch, context.repositoryPaths);
  }
  if (!files.length) {
    const remainingPaths = contextRequestPaths(parsed);
    if (remainingPaths.length) {
      const focused = await forcePlanWithFocusedContext(
        parsed,
        context,
        token,
        repo,
        branch,
        prompt,
        reducedContext,
        options.ai,
      );
      if (focused?.files.length) {
        ai = focused.ai;
        parsed = focused.parsed;
        files = focused.files;
      } else {
        throw new AgentPlanError(
          "Não foi possível concluir uma alteração segura com os arquivos selecionados. Tente descrever em qual página ou componente deseja fazer a mudança.",
          "CONTEXT_ROUNDS_EXHAUSTED",
          true,
          422,
        );
      }
    }
    if (!files.length) {
      throw new Error(String(parsed.summary || "A IA não propôs uma alteração segura."));
    }
  }
  const summary = String(parsed.summary || "Alteração preparada.").slice(0, 2_000);
  const commitMessage = String(
    parsed.commit_message || "aplicar alteração pela Super Lovable",
  ).slice(0, 120);
  const { data, error } = await supabaseAdmin
    .from("github_agent_runs")
    .insert({
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
    } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error("Não foi possível salvar o plano da alteração.");
  return {
    runId: String((data as { id: string }).id),
    summary,
    commitMessage,
    files: files.map((file) => file.path),
    provider: ai.provider,
  };
}

export async function commitAgentRun(auth: LicenseAuth, runId: string) {
  const { data } = await supabaseAdmin
    .from("github_agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("license_id", auth.license.id)
    .maybeSingle();
  const run = data as Record<string, unknown> | null;
  if (!run || run.status !== "planned") throw new Error("Plano não encontrado ou já utilizado.");
  const connection = await getLicenseConnection(auth.license.id);
  const installationId = Number(connection?.installation_id || 0);
  if (!installationId) throw new Error("Conexão GitHub indisponível.");
  const token = await createInstallationToken(installationId);
  const repo = String(run.repository_full_name);
  const branch = String(run.branch);
  const workingBranch = `super-lovable/${runId.slice(0, 8)}`;
  const ref = await githubJson<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );
  if (ref.object.sha !== run.base_sha)
    throw new Error(
      "O projeto mudou depois do plano. Gere a alteração novamente para evitar conflito.",
    );
  const baseCommit = await githubJson<{ tree: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/commits/${ref.object.sha}`,
    token,
  );
  const proposed = sanitizeFiles(run.proposed_files);
  if (!proposed.length) throw new Error("O plano não contém arquivos válidos para aplicar.");
  let validation = await validateProposedChanges(token, repo, branch, proposed);
  await supabaseAdmin
    .from("github_agent_runs")
    .update({
      risk_level: validation.riskLevel,
      validation_report: validation as never,
      requires_review: !validation.autoMerge,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", runId);
  if (validation.riskLevel === "blocked") {
    await supabaseAdmin
      .from("github_agent_runs")
      .update({
        status: "blocked",
        error: validation.reasons.join(" "),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", runId);
    throw new AgentPlanError(
      validation.reasons[0] || "A alteração foi bloqueada pela validação de segurança.",
      "CHANGE_BLOCKED",
      false,
      422,
    );
  }
  const elements: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const file of proposed) {
    const blob = await githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    elements.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: elements }),
  });
  const commit = await githubJson<{ sha: string }>(
    `${GITHUB_API}/repos/${repo}/git/commits`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        message: String(run.commit_message),
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    },
  );
  await githubJson(`${GITHUB_API}/repos/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${workingBranch}`, sha: ref.object.sha }),
  });
  await githubJson(
    `${GITHUB_API}/repos/${repo}/git/refs/heads/${encodeURIComponent(workingBranch)}`,
    token,
    { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) },
  );
  const sandboxValidation = await validateCommitInSandbox(repo, commit.sha, token);
  if (sandboxValidation.status !== "passed") {
    const buildReason =
      sandboxValidation.status === "failed"
        ? `O build isolado falhou na etapa ${sandboxValidation.stage}.`
        : sandboxValidation.status === "unavailable"
          ? "O ambiente de validação isolada não respondeu."
          : "O projeto não possui um build compatível com a validação automática.";
    validation = {
      ...validation,
      riskLevel: raiseRisk(validation.riskLevel, "high"),
      autoMerge: false,
      reasons: [...new Set([...validation.reasons, buildReason])],
    };
  }
  await supabaseAdmin
    .from("github_agent_runs")
    .update({
      risk_level: validation.riskLevel,
      validation_report: validation as never,
      requires_review: !validation.autoMerge,
      sandbox_status: sandboxValidation.status,
      sandbox_report: sandboxValidation as never,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", runId);
  const pullRequest = await githubJson<{ number: number; html_url: string }>(
    `${GITHUB_API}/repos/${repo}/pulls`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        title: String(run.commit_message),
        head: workingBranch,
        base: branch,
        body: `Alteração preparada pela Super Lovable.\n\n${String(run.summary || "")}\n\nValidação isolada: **${sandboxValidation.status}** (${sandboxValidation.stage}).`,
      }),
    },
  );
  let merged: { merged: boolean; sha?: string; message?: string } = {
    merged: false,
    message: validation.reasons[0] || "A alteração requer revisão manual.",
  };
  if (validation.autoMerge) {
    try {
      merged = await githubJson<{ merged: boolean; sha?: string; message?: string }>(
        `${GITHUB_API}/repos/${repo}/pulls/${pullRequest.number}/merge`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            merge_method: "squash",
            commit_title: String(run.commit_message),
          }),
        },
      );
    } catch (error) {
      merged = {
        merged: false,
        message:
          error instanceof Error
            ? error.message
            : "O GitHub solicitou revisão manual do Pull Request.",
      };
    }
  }
  if (!merged.merged || !merged.sha) {
    await supabaseAdmin
      .from("github_agent_runs")
      .update({
        status: "awaiting_confirmation",
        working_branch: workingBranch,
        pull_request_number: pullRequest.number,
        pull_request_url: pullRequest.html_url,
        commit_sha: commit.sha,
        error: merged.message || "O GitHub solicitou revisão manual do Pull Request.",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", runId);
    return {
      runId,
      commitSha: commit.sha,
      repository: repo,
      branch,
      summary: run.summary,
      pullRequestUrl: pullRequest.html_url,
      merged: false,
      requiresReview: true,
      riskLevel: validation.riskLevel,
      validationReasons: validation.reasons,
      sandboxStatus: sandboxValidation.status,
    };
  }
  await supabaseAdmin
    .from("github_agent_runs")
    .update({
      status: "merged",
      commit_sha: commit.sha,
      working_branch: workingBranch,
      pull_request_number: pullRequest.number,
      pull_request_url: pullRequest.html_url,
      merge_commit_sha: merged.sha,
      merged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", runId);
  return {
    runId,
    commitSha: merged.sha,
    repository: repo,
    branch,
    summary: run.summary,
    pullRequestUrl: pullRequest.html_url,
    merged: true,
    riskLevel: validation.riskLevel,
    sandboxStatus: sandboxValidation.status,
  };
}

export async function rollbackAgentRun(auth: LicenseAuth, runId: string) {
  const { data } = await supabaseAdmin
    .from("github_agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("license_id", auth.license.id)
    .maybeSingle();
  const run = data as Record<string, unknown> | null;
  if (!run || run.status !== "merged" || !run.merge_commit_sha) {
    throw new AgentPlanError(
      "Somente alterações já aplicadas podem ser desfeitas.",
      "ROLLBACK_NOT_AVAILABLE",
      false,
      422,
    );
  }
  if (run.rollback_status === "merged" || run.rollback_status === "awaiting_confirmation") {
    throw new AgentPlanError(
      "Essa alteração já possui um processo de reversão.",
      "ROLLBACK_ALREADY_CREATED",
      false,
      409,
    );
  }

  const connection = await getLicenseConnection(auth.license.id);
  const installationId = Number(connection?.installation_id || 0);
  if (!installationId) throw new Error("Conexão GitHub indisponível.");
  const token = await createInstallationToken(installationId);
  const repo = String(run.repository_full_name);
  const branch = String(run.branch);
  const baseSha = String(run.base_sha || "");
  const appliedSha = String(run.merge_commit_sha);
  const proposed = sanitizeFiles(run.proposed_files);
  if (!baseSha || !proposed.length) {
    throw new AgentPlanError(
      "Não existem dados suficientes para desfazer essa alteração com segurança.",
      "ROLLBACK_DATA_MISSING",
      false,
      422,
    );
  }

  const currentRef = await githubJson<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );
  const currentCommit = await githubJson<{ tree: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/commits/${currentRef.object.sha}`,
    token,
  );
  const elements: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string | null;
  }> = [];
  const conflicts: string[] = [];

  for (const file of proposed) {
    const [original, applied, current] = await Promise.all([
      readRepositoryFileOptional(token, repo, baseSha, file.path),
      readRepositoryFileOptional(token, repo, appliedSha, file.path),
      readRepositoryFileOptional(token, repo, branch, file.path),
    ]);
    if (current !== applied) conflicts.push(file.path);
    if (original === null) {
      elements.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({ content: original, encoding: "utf-8" }),
    });
    elements.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: currentCommit.tree.sha, tree: elements }),
  });
  const rollbackCommit = await githubJson<{ sha: string }>(
    `${GITHUB_API}/repos/${repo}/git/commits`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        message: `desfazer: ${String(run.commit_message || "alteração da Super Lovable")}`,
        tree: tree.sha,
        parents: [currentRef.object.sha],
      }),
    },
  );
  const rollbackBranch = `super-lovable/revert-${runId.slice(0, 8)}-${Date.now().toString(36)}`;
  await githubJson(`${GITHUB_API}/repos/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${rollbackBranch}`, sha: rollbackCommit.sha }),
  });
  const pullRequest = await githubJson<{ number: number; html_url: string }>(
    `${GITHUB_API}/repos/${repo}/pulls`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        title: `Desfazer: ${String(run.commit_message || "alteração da Super Lovable")}`,
        head: rollbackBranch,
        base: branch,
        body: conflicts.length
          ? `Reversão preparada pela Super Lovable.\n\nRevisão necessária: estes arquivos também foram alterados depois da execução original:\n\n${conflicts.map((path) => `- ${path}`).join("\n")}`
          : "Reversão segura preparada pela Super Lovable.",
      }),
    },
  );

  let merged: { merged: boolean; sha?: string; message?: string } = {
    merged: false,
    message: conflicts.length
      ? "Existem alterações posteriores nos mesmos arquivos."
      : "O GitHub solicitou revisão manual.",
  };
  if (!conflicts.length) {
    try {
      merged = await githubJson<{ merged: boolean; sha?: string; message?: string }>(
        `${GITHUB_API}/repos/${repo}/pulls/${pullRequest.number}/merge`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            merge_method: "squash",
            commit_title: `desfazer: ${String(run.commit_message || "alteração")}`,
          }),
        },
      );
    } catch (error) {
      merged.message = error instanceof Error ? error.message : merged.message;
    }
  }

  const rollbackStatus = merged.merged && merged.sha ? "merged" : "awaiting_confirmation";
  await supabaseAdmin
    .from("github_agent_runs")
    .update({
      rollback_status: rollbackStatus,
      rollback_branch: rollbackBranch,
      rollback_commit_sha: merged.sha || rollbackCommit.sha,
      rollback_pull_request_number: pullRequest.number,
      rollback_pull_request_url: pullRequest.html_url,
      rolled_back_at: merged.merged ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", runId);

  return {
    runId,
    rolledBack: Boolean(merged.merged && merged.sha),
    requiresReview: !merged.merged,
    pullRequestUrl: pullRequest.html_url,
    conflicts,
    commitSha: merged.sha || rollbackCommit.sha,
  };
}
