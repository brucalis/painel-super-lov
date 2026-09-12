// Super Lovable — automação da experiência comercial.
// Objetivo: licença -> GitHub -> projeto Lovable -> prompt, com o mínimo de cliques.
(() => {
  if (globalThis.__superLovableCustomerExperienceLoaded) return;
  globalThis.__superLovableCustomerExperienceLoaded = true;
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const CONTEXT_KEY = "sl_lovable_project_context_v1";
  const MAP_KEY = "sl_lovable_repo_map_v1";
  const RUNTIME_VERSION_KEY = "sl_runtime_version_v1";
  const CACHE_REFRESH_KEY = "sl_runtime_cache_refresh_required_v1";
  let syncing = false;
  let pendingManualRepository = "";
  let lastAutomaticBinding = "";

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));

  async function headers() {
    const data = await storageGet(["ql_session_id"]);
    if (!data.ql_session_id) return null;
    return {
      Authorization: `Bearer ${data.ql_session_id}`,
      "Content-Type": "application/json",
      "X-Super-Lovable-Edition": "customer-s1",
    };
  }

  async function request(path, options = {}) {
    const auth = await headers();
    if (!auth) return null;
    const response = await fetch(`${API}${path}`, { ...options, headers: { ...auth, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Servidor respondeu ${response.status}.`);
    return data;
  }

  async function currentContext() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (tab?.id && /^https:\/\/([^/]+\.)?lovable\.dev\//i.test(tab.url || "")) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "SUPERLOVABLE_GET_PROJECT_CONTEXT" }).catch(() => null);
        if (response?.ok && response.context) return response.context;
      }
    } catch {}
    const data = await storageGet([CONTEXT_KEY]);
    return data[CONTEXT_KEY] || null;
  }

  async function saveMapping(projectId, repository) {
    if (!projectId || !repository) return;
    const data = await storageGet([MAP_KEY]);
    const map = data[MAP_KEY] && typeof data[MAP_KEY] === "object" ? data[MAP_KEY] : {};
    if (map[projectId] === repository) return;
    map[projectId] = repository;
    await storageSet({ [MAP_KEY]: map });
  }

  function agentIsBusy() {
    const progress = document.getElementById("sl-agent-progress");
    const status = String(document.getElementById("sl-agent-status")?.textContent || "");
    return Boolean(progress && !progress.hidden) || /analisando|planejando|aplicando|processando|execu[cç][aã]o em andamento/i.test(status);
  }
  function setHelpfulStatus(message, kind = "warning") {
    if (agentIsBusy()) return;
    const status = document.getElementById("sl-agent-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }
  async function allowedRepositories() {
    const data = await request("/github/repositories");
    return Array.isArray(data?.repositories) ? data.repositories.map((item) => String(item.full_name || "")) : [];
  }
  async function bindRepository(repository) {
    if (!repository) return false;
    const signature = `${repository}:${Date.now() >> 13}`;
    if (lastAutomaticBinding === signature) return false;
    lastAutomaticBinding = signature;
    await request("/github/repositories", { method: "POST", body: JSON.stringify({ repository }) });
    document.dispatchEvent(new CustomEvent("superlovable:auto-project-bound", { detail: { repository } }));
    return true;
  }

  async function synchronizeProject() {
    if (syncing || agentIsBusy()) return;
    syncing = true;
    try {
      const context = await currentContext();
      if (!context?.projectId) return;
      const statusData = await request("/status");
      if (!statusData) return;
      const connection = statusData.connection || {};
      const aiReady = Boolean(statusData.ai?.mistral?.configured || statusData.ai?.gemini?.configured || statusData.ai?.cloudflare?.configured);

      if (!aiReady) {
        setHelpfulStatus("Conecte pelo menos uma IA para liberar o uso. Recomendamos Mistral + Gemini + Cloudflare para máxima continuidade.");
        return;
      }
      if (!connection.installation_id) {
        setHelpfulStatus("Para começar, conecte seu GitHub. Depois disso, a Super Lovable identifica o projeto aberto automaticamente.");
        return;
      }

      const stored = await storageGet([MAP_KEY]);
      const map = stored[MAP_KEY] && typeof stored[MAP_KEY] === "object" ? stored[MAP_KEY] : {};
      const desiredRepository = String(context.repository || map[context.projectId] || "");
      const connectedRepository = String(connection.repository_full_name || "");

      if (pendingManualRepository && connectedRepository === pendingManualRepository) {
        await saveMapping(context.projectId, connectedRepository);
        pendingManualRepository = "";
      }
      if (!desiredRepository) {
        if (!connectedRepository) setHelpfulStatus("GitHub conectado. Conecte este projeto ao GitHub no Lovable; se o vínculo não for detectado, escolha o repositório uma única vez.");
        return;
      }
      if (connectedRepository === desiredRepository) {
        await saveMapping(context.projectId, desiredRepository);
        return;
      }
      const repositories = await allowedRepositories();
      if (!repositories.includes(desiredRepository)) {
        setHelpfulStatus(`O projeto aberto aponta para ${desiredRepository}, mas esse repositório ainda não está autorizado no GitHub App.`, "warning");
        return;
      }
      setHelpfulStatus(`Projeto detectado: ${desiredRepository}. Sincronizando automaticamente…`, "info");
      await bindRepository(desiredRepository);
      await saveMapping(context.projectId, desiredRepository);
      setHelpfulStatus(`Projeto conectado automaticamente: ${desiredRepository} (main)`, "success");
      const select = document.getElementById("sl-agent-repository");
      if (select) select.value = desiredRepository;
      const picker = document.getElementById("sl-agent-project-row");
      if (picker) picker.style.display = "none";
      const switchProject = document.getElementById("sl-agent-switch-project");
      if (switchProject) switchProject.style.display = "inline-flex";
    } catch (error) {
      console.debug("[Super Lovable] sincronização automática do projeto indisponível:", error?.message || error);
    } finally { syncing = false; }
  }

  async function markRuntimeVersion() {
    try {
      const current = chrome.runtime.getManifest().version;
      const data = await storageGet([RUNTIME_VERSION_KEY]);
      if (data[RUNTIME_VERSION_KEY] && data[RUNTIME_VERSION_KEY] !== current) await storageSet({ [CACHE_REFRESH_KEY]: true });
      await storageSet({ [RUNTIME_VERSION_KEY]: current });
    } catch {}
  }
  async function deepCleanLovableCaches() {
    if (!chrome.browsingData?.remove) return false;
    const data = await storageGet([CACHE_REFRESH_KEY]);
    if (!data[CACHE_REFRESH_KEY]) return false;
    await new Promise((resolve) => chrome.browsingData.remove({ origins: ["https://lovable.dev"], since: 0 }, { cacheStorage: true, serviceWorkers: true }, () => resolve()));
    await new Promise((resolve) => chrome.browsingData.remove({ since: 0 }, { cache: true }, () => resolve()));
    await storageSet({ [CACHE_REFRESH_KEY]: false });
    return true;
  }

  document.addEventListener("change", (event) => {
    const select = event.target?.closest?.("#sl-agent-repository");
    if (!select) return;
    pendingManualRepository = String(select.value || "");
  }, true);
  document.addEventListener("click", (event) => {
    if (!event.target?.closest?.("#sl-agent-refresh")) return;
    void deepCleanLovableCaches();
  }, true);
  document.addEventListener("superlovable:github-status", () => setTimeout(() => void synchronizeProject(), 250));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CONTEXT_KEY] || changes.ql_session_id) setTimeout(() => void synchronizeProject(), 200);
  });

  globalThis.superLovableSynchronizeProject = synchronizeProject;
  globalThis.superLovableDeepCleanLovableCaches = deepCleanLovableCaches;
  void markRuntimeVersion();
  setTimeout(() => void synchronizeProject(), 800);
  setInterval(() => void synchronizeProject(), 4000);
})();