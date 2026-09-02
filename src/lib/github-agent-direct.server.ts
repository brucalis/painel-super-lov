import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createInstallationToken } from "@/lib/github.server";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "SuperLovable-Agent";
const MAX_FILES = 8;

type DirectAgentAuth = { license: { id: string } };
type ProposedFile = { path: string; content: string };
type RiskLevel = "low" | "medium" | "high" | "blocked";
type ValidationReport = {
  riskLevel: RiskLevel;
  filesChecked: number;
  changedCharacters: number;
  reasons: string[];
  warnings: string[];
  mode: "direct";
};

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": USER_AGENT,
});

async function githubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...githubHeaders(token), ...(init?.headers || {}) },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub respondeu ${response.status}: ${raw.slice(0, 500)}`);
  }
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

function sanitizeFiles(value: unknown): ProposedFile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_FILES).flatMap((item): ProposedFile[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const path = String(candidate.path || "").trim();
    const content = String(candidate.content ?? "");
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("..") ||
      /(^|\/)(\.env|node_modules|dist|\.output)(\/|$)|lock$/i.test(path)
    ) {
      return [];
    }
    if (content.length > 300_000 || /trecho reduzido automaticamente/i.test(content)) {
      return [];
    }
    return [{ path, content }];
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

async function readRepositoryFileOptional(
  token: string,
  repo: string,
  ref: string,
  path: string,
): Promise<string | null> {
  const response = await fetch(
    `${GITHUB_API}/repos/${repo}/contents/${contentPath(path)}?ref=${encodeURIComponent(ref)}`,
    { headers: githubHeaders(token) },
  );
  if (response.status === 404) return null;
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub respondeu ${response.status}: ${raw.slice(0, 500)}`);
  }
  const file = JSON.parse(raw) as { content?: string; encoding?: string };
  return file.encoding === "base64" && file.content ? decodeBase64Utf8(file.content) : "";
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
      reasons.push(`${file.path} afeta uma área sensível.`);
    } else if (MEDIUM_RISK_AGENT_PATH.test(file.path)) {
      riskLevel = raiseRisk(riskLevel, "medium");
      reasons.push(`${file.path} altera configuração ou roteamento.`);
    }

    const original = await readRepositoryFileOptional(token, repo, branch, file.path);
    if (original === null) warnings.push(`${file.path} será criado como um arquivo novo.`);
    changedCharacters += changedCharacterCount(original || "", file.content);
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
    reasons.push("O volume total da alteração é relevante.");
  }

  return {
    riskLevel,
    filesChecked: files.length,
    changedCharacters,
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
    mode: "direct",
  };
}

async function getLicenseConnection(licenseId: string) {
  const { data } = await supabaseAdmin
    .from("github_license_connections")
    .select("*")
    .eq("license_id", licenseId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function updateRun(runId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("github_agent_runs")
    .update({ ...values, updated_at: new Date().toISOString() } as never)
    .eq("id", runId);
  if (error) console.error("[super-lovable] falha ao atualizar execução", error);
}

async function createCommit(
  token: string,
  repo: string,
  parentSha: string,
  files: Array<{ path: string; content: string | null }>,
  message: string,
) {
  const baseCommit = await githubJson<{ tree: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/commits/${parentSha}`,
    token,
  );
  const treeItems: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string | null;
  }> = [];

  for (const file of files) {
    if (file.content === null) {
      treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await githubJson<{ sha: string }>(
      `${GITHUB_API}/repos/${repo}/git/blobs`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      },
    );
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await githubJson<{ sha: string }>(
    `${GITHUB_API}/repos/${repo}/git/trees`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }),
    },
  );

  return githubJson<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });
}

async function moveBranch(token: string, repo: string, branch: string, sha: string) {
  await githubJson(
    `${GITHUB_API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false }),
    },
  );
}

export async function commitAgentRunDirect(auth: DirectAgentAuth, runId: string) {
  const { data } = await supabaseAdmin
    .from("github_agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("license_id", auth.license.id)
    .maybeSingle();

  const run = data as Record<string, unknown> | null;
  if (!run || run.status !== "planned") {
    throw new Response("Plano não encontrado ou já utilizado.", { status: 409 });
  }

  const connection = await getLicenseConnection(auth.license.id);
  const installationId = Number(connection?.installation_id || 0);
  if (!installationId) {
    throw new Response("Conexão GitHub indisponível.", { status: 422 });
  }

  const token = await createInstallationToken(installationId);
  const repo = String(run.repository_full_name || "");
  const branch = String(run.branch || connection?.branch || "main");
  const proposed = sanitizeFiles(run.proposed_files);
  if (!proposed.length) {
    throw new Response("O plano não contém arquivos válidos para aplicar.", { status: 422 });
  }

  const ref = await githubJson<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );
  if (ref.object.sha !== run.base_sha) {
    throw new Response(
      "O projeto mudou depois do plano. Gere a alteração novamente para evitar sobrescrever mudanças mais recentes.",
      { status: 409 },
    );
  }

  const validation = await validateProposedChanges(token, repo, branch, proposed);
  await updateRun(runId, {
    risk_level: validation.riskLevel,
    validation_report: { ...validation, directApply: true, targetBranch: branch },
    requires_review: false,
    pull_request_number: null,
    pull_request_url: null,
  });

  if (validation.riskLevel === "blocked") {
    const reason =
      validation.reasons.join(" ") || "A alteração foi bloqueada pela validação de segurança.";
    await updateRun(runId, { status: "blocked", error: reason });
    throw new Response(reason, { status: 422 });
  }

  const commit = await createCommit(
    token,
    repo,
    ref.object.sha,
    proposed,
    String(run.commit_message || "aplicar alteração pela Super Lovable"),
  );

  try {
    await moveBranch(token, repo, branch, commit.sha);
  } catch (error) {
    const message =
      error instanceof Error
        ? `O GitHub não permitiu gravar diretamente em ${branch}: ${error.message}`
        : `O GitHub não permitiu gravar diretamente em ${branch}.`;
    await updateRun(runId, { status: "failed", error: message });
    throw new Response(message, { status: 409 });
  }

  const completedAt = new Date().toISOString();
  const validationReasons = [
    ...validation.reasons,
    ...validation.warnings,
    "Alteração aplicada diretamente na branch principal, sem Pull Request.",
  ];

  await updateRun(runId, {
    status: "merged",
    commit_sha: commit.sha,
    merge_commit_sha: commit.sha,
    working_branch: branch,
    pull_request_number: null,
    pull_request_url: null,
    merged_at: completedAt,
    risk_level: validation.riskLevel,
    validation_report: {
      ...validation,
      reasons: validationReasons,
      directApply: true,
      targetBranch: branch,
      pullRequestsDisabled: true,
    },
    requires_review: false,
    sandbox_status: "skipped",
    sandbox_report: {
      status: "skipped",
      stage: "direct-main",
      output: "Fluxo direto ativado: nenhuma branch temporária ou Pull Request foi criada.",
    },
    error: null,
  });

  return {
    runId,
    commitSha: commit.sha,
    repository: repo,
    branch,
    summary: run.summary,
    merged: true,
    direct: true,
    requiresReview: false,
    riskLevel: validation.riskLevel,
    validationReasons,
    sandboxStatus: "skipped",
    flowMode: "direct-main-v3",
  };
}

export async function rollbackAgentRunDirect(auth: DirectAgentAuth, runId: string) {
  const { data } = await supabaseAdmin
    .from("github_agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("license_id", auth.license.id)
    .maybeSingle();

  const run = data as Record<string, unknown> | null;
  if (!run || run.status !== "merged") {
    throw new Response("Somente alterações já aplicadas podem ser desfeitas.", { status: 422 });
  }
  if (run.rollback_status === "merged") {
    throw new Response("Essa alteração já foi desfeita.", { status: 409 });
  }

  const connection = await getLicenseConnection(auth.license.id);
  const installationId = Number(connection?.installation_id || 0);
  if (!installationId) throw new Response("Conexão GitHub indisponível.", { status: 422 });

  const token = await createInstallationToken(installationId);
  const repo = String(run.repository_full_name || "");
  const branch = String(run.branch || connection?.branch || "main");
  const baseSha = String(run.base_sha || "");
  const appliedSha = String(run.merge_commit_sha || run.commit_sha || "");
  const proposed = sanitizeFiles(run.proposed_files);

  if (!baseSha || !appliedSha || !proposed.length) {
    throw new Response("Não existem dados suficientes para desfazer essa alteração.", { status: 422 });
  }

  const currentRef = await githubJson<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );

  const conflicts: string[] = [];
  const rollbackFiles: Array<{ path: string; content: string | null }> = [];

  for (const file of proposed) {
    const [original, applied, current] = await Promise.all([
      readRepositoryFileOptional(token, repo, baseSha, file.path),
      readRepositoryFileOptional(token, repo, appliedSha, file.path),
      readRepositoryFileOptional(token, repo, branch, file.path),
    ]);

    if (current !== applied) conflicts.push(file.path);
    rollbackFiles.push({ path: file.path, content: original });
  }

  if (conflicts.length) {
    const message = `Não foi possível desfazer automaticamente porque estes arquivos mudaram depois: ${conflicts.join(", ")}.`;
    await updateRun(runId, { rollback_status: "blocked", error: message });
    throw new Response(message, { status: 409 });
  }

  const rollbackCommit = await createCommit(
    token,
    repo,
    currentRef.object.sha,
    rollbackFiles,
    `desfazer: ${String(run.commit_message || "alteração da Super Lovable")}`,
  );

  await moveBranch(token, repo, branch, rollbackCommit.sha);
  const completedAt = new Date().toISOString();
  await updateRun(runId, {
    rollback_status: "merged",
    rollback_commit_sha: rollbackCommit.sha,
    rollback_merged_at: completedAt,
    error: null,
  });

  return {
    runId,
    commitSha: rollbackCommit.sha,
    repository: repo,
    branch,
    direct: true,
    requiresReview: false,
    conflicts: [],
  };
}
