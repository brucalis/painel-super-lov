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

const systemPrompt = `Você é um agente de programação geral. O pedido pode se referir a qualquer projeto. "available_files" é o mapa de caminhos reais do repositório e "files" contém arquivos já carregados. Não invente caminhos. Retorne SOMENTE JSON válido no formato {"summary":"resumo em português","commit_message":"mensagem curta em português","files":[{"path":"caminho existente ou novo","content":"conteúdo completo final"}]}. Faça a menor alteração correta que cumpra o pedido, preserve a arquitetura e o estilo encontrados e devolva o conteúdo completo final de cada arquivo alterado. Nunca inclua segredos, .env, lockfiles, arquivos gerados ou binários. No máximo 8 arquivos. Se precisar ler outros arquivos antes de editar, escolha caminhos EXATOS de "available_files" e retorne {"summary":"CONTEXT_REQUIRED","commit_message":"","files":[],"context_request":{"paths":["caminho/real"]}}.`;

async function callGeminiModel(prompt: string, model: string) {
  const key = process.env.GEMINI_API_KEY;
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

async function callGemini(prompt: string) {
  const models = [
    process.env.GEMINI_CODE_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index);
  let lastError: unknown;
  for (const model of models) {
    try {
      return await callGeminiModel(prompt, model);
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

async function callGroq(prompt: string, reducedContext: boolean) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");
  const model = process.env.GROQ_CODE_MODEL || "openai/gpt-oss-20b";
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

async function generatePlan(payload: string, forceReduced = false) {
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
    if (content.length > 300_000) return [];
    return [{ path, content }];
  });
}

export async function planAgentRun(
  auth: LicenseAuth,
  prompt: string,
  options: { reducedContext?: boolean } = {},
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
  let ai = await generatePlan(payload, reducedContext);
  let parsed = extractJson(ai.raw);
  let files = sanitizeFiles(parsed.files);
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
    ai = await generatePlan(payload, reducedContext);
    parsed = extractJson(ai.raw);
    files = sanitizeFiles(parsed.files);
  }
  if (!files.length) {
    const remainingPaths = contextRequestPaths(parsed);
    if (remainingPaths.length) {
      throw new AgentPlanError(
        "Não foi possível concluir a seleção automática dos arquivos deste projeto. Tente novamente; o agente fará uma nova leitura do repositório.",
        "CONTEXT_ROUNDS_EXHAUSTED",
        true,
        422,
      );
    }
    throw new Error(String(parsed.summary || "A IA não propôs uma alteração segura."));
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
  await githubJson(
    `${GITHUB_API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    token,
    { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) },
  );
  await supabaseAdmin
    .from("github_agent_runs")
    .update({
      status: "committed",
      commit_sha: commit.sha,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", runId);
  return { commitSha: commit.sha, repository: repo, branch, summary: run.summary };
}
