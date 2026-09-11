// Super Lovable — contexto automático do projeto aberto no Lovable.
// Mantém a extensão comercial sincronizada com o projeto atual sem exigir
// seleção repetida de repositório. Não intercepta nem altera requisições do Lovable.
(() => {
  if (window.top !== window || globalThis.__superLovableProjectContextLoaded) return;
  globalThis.__superLovableProjectContextLoaded = true;

  const CONTEXT_KEY = "sl_lovable_project_context_v1";
  const MAP_KEY = "sl_lovable_repo_map_v1";
  const RESERVED_GITHUB_PATHS = new Set([
    "about", "apps", "collections", "contact", "enterprise", "events", "explore",
    "features", "issues", "login", "marketplace", "new", "notifications", "orgs",
    "pricing", "pulls", "search", "settings", "site", "sponsors", "topics", "trending",
  ]);

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (value) => new Promise((resolve) => chrome.storage.local.set(value, resolve));

  function projectIdFromLocation() {
    const match = location.pathname.match(/\/projects\/([0-9a-f-]{8,})/i);
    return match ? match[1] : "";
  }

  function normalizeGithubRepository(href) {
    try {
      const url = new URL(String(href || ""), location.href);
      if (!/(^|\.)github\.com$/i.test(url.hostname)) return "";
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return "";
      if (RESERVED_GITHUB_PATHS.has(String(parts[0]).toLowerCase())) return "";
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/i, "");
      if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return "";
      return `${owner}/${repo}`;
    } catch {
      return "";
    }
  }

  function detectRepositoryFromPage() {
    const anchors = Array.from(document.querySelectorAll('a[href*="github.com/"]'));
    const candidates = anchors
      .map((anchor) => ({
        repo: normalizeGithubRepository(anchor.href),
        hint: `${anchor.textContent || ""} ${anchor.getAttribute("aria-label") || ""} ${anchor.getAttribute("title") || ""}`.toLowerCase(),
      }))
      .filter((item) => item.repo);

    const explicit = candidates.find((item) => /github|repository|reposit[oó]rio|sync/.test(item.hint));
    return (explicit || candidates[0])?.repo || "";
  }

  async function resolveContext() {
    const projectId = projectIdFromLocation();
    const data = await storageGet([CONTEXT_KEY, MAP_KEY]);
    const map = data[MAP_KEY] && typeof data[MAP_KEY] === "object" ? data[MAP_KEY] : {};
    const detectedRepository = detectRepositoryFromPage();

    if (projectId && detectedRepository && map[projectId] !== detectedRepository) {
      map[projectId] = detectedRepository;
      await storageSet({ [MAP_KEY]: map });
    }

    const repository = detectedRepository || (projectId ? String(map[projectId] || "") : "");
    const context = {
      projectId,
      repository,
      source: detectedRepository ? "lovable-page" : repository ? "saved-map" : "project-url",
      href: location.href,
      updatedAt: new Date().toISOString(),
    };

    const previous = data[CONTEXT_KEY] || {};
    const changed = previous.projectId !== context.projectId || previous.repository !== context.repository || previous.href !== context.href;
    if (changed) await storageSet({ [CONTEXT_KEY]: context });
    return context;
  }

  let lastHref = "";
  async function scan() {
    const href = location.href;
    const shouldScan = href !== lastHref || Boolean(projectIdFromLocation());
    if (!shouldScan) return;
    lastHref = href;
    await resolveContext().catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "SUPERLOVABLE_GET_PROJECT_CONTEXT") return false;
    resolveContext()
      .then((context) => sendResponse({ ok: true, context }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Não foi possível identificar o projeto." }));
    return true;
  });

  window.addEventListener("popstate", () => void scan());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void scan();
  });
  setInterval(() => void scan(), 2000);
  void scan();
})();