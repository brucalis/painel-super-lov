import { createInstallationToken } from "@/lib/github.server";
import { getLicenseConnection } from "@/lib/github-agent.server";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "super-lovable-project-tools";
const BADGE_RULE = "#lovable-badge {\n  display: none !important;\n}";
const CSS_CANDIDATES = [
  "src/index.css",
  "src/styles.css",
  "src/App.css",
  "src/global.css",
  "app/globals.css",
  "styles/globals.css",
];

const githubHeaders = (token: string, json = true) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
  "User-Agent": USER_AGENT,
  "X-GitHub-Api-Version": "2022-11-28",
});

async function githubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...githubHeaders(token), ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) {
    throw new Response(payload.message || `GitHub respondeu ${response.status}.`, { status: response.status });
  }
  return payload as T;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function selectedProject(licenseId: string) {
  const connection = await getLicenseConnection(licenseId);
  const installationId = Number(connection?.installation_id || 0);
  const repository = String(connection?.repository_full_name || "");
  const branch = String(connection?.branch || "main");
  if (!installationId || !repository) {
    throw new Response("Conecte o GitHub e selecione o projeto antes de continuar.", { status: 422 });
  }
  return {
    repository,
    branch,
    token: await createInstallationToken(installationId),
  };
}

function badgeAlreadyHidden(css: string) {
  return /#lovable-badge[^{}]*\{[^}]*display\s*:\s*none\s*!important\s*;?/i.test(css);
}

function appendBadgeRule(css: string) {
  return `${css.replace(/\s+$/, "")}\n\n${BADGE_RULE}\n`;
}

export async function removeLovableBadgeViaGithub(licenseId: string) {
  const { repository, branch, token } = await selectedProject(licenseId);
  const ref = await githubJson<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
    token,
  );
  const commit = await githubJson<{ tree: { sha: string } }>(
    `${GITHUB_API}/repos/${repository}/git/commits/${ref.object.sha}`,
    token,
  );
  const tree = await githubJson<{ tree?: Array<{ path?: string; type?: string }> }>(
    `${GITHUB_API}/repos/${repository}/git/trees/${commit.tree.sha}?recursive=1`,
    token,
  );
  const paths = (tree.tree || [])
    .filter((item) => item.type === "blob")
    .map((item) => String(item.path || ""));
  let cssPath = CSS_CANDIDATES.find((candidate) => paths.includes(candidate));
  if (!cssPath) {
    cssPath = paths.find((path) => /(?:^|\/)(?:index|global|globals|styles|app)\.css$/i.test(path));
  }
  if (!cssPath) throw new Response("Não foi possível localizar o CSS global do projeto.", { status: 422 });

  const file = await githubJson<{ content?: string; encoding?: string; sha: string }>(
    `${GITHUB_API}/repos/${repository}/contents/${encodePath(cssPath)}?ref=${encodeURIComponent(branch)}`,
    token,
  );
  if (file.encoding !== "base64" || !file.content) {
    throw new Response("O GitHub não retornou o conteúdo do CSS global.", { status: 502 });
  }
  const css = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
  if (badgeAlreadyHidden(css)) {
    return { repository, branch, path: cssPath, already_removed: true, commit_sha: null };
  }

  const updated = await githubJson<{ commit?: { sha?: string } }>(
    `${GITHUB_API}/repos/${repository}/contents/${encodePath(cssPath)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({
        message: "Remove Lovable badge",
        content: Buffer.from(appendBadgeRule(css), "utf8").toString("base64"),
        sha: file.sha,
        branch,
      }),
    },
  );
  return {
    repository,
    branch,
    path: cssPath,
    already_removed: false,
    commit_sha: String(updated.commit?.sha || ""),
  };
}

export async function downloadSelectedProject(licenseId: string) {
  const { repository, branch, token } = await selectedProject(licenseId);
  const response = await fetch(
    `${GITHUB_API}/repos/${repository}/zipball/${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token, false), redirect: "follow" },
  );
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Response(payload.message || `GitHub respondeu ${response.status}.`, { status: response.status });
  }
  const repositoryName = repository.split("/").pop() || "projeto";
  return new Response(response.body, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${repositoryName}-${branch}.zip"`,
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "content-disposition",
    },
  });
}
