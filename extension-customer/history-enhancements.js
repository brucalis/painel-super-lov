(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;
  if (globalThis.__superLovableHistoryEnhancementsLoaded) return;
  globalThis.__superLovableHistoryEnhancementsLoaded = true;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const HISTORY_KEY = "ql_chat_history";
  const ACTIVE_KEY = "sl_agent_active_history_id";
  const EXECUTION_PATH = /\/api\/public\/agent\/(decompose|plan|commit)(?:[/?#]|$)/i;
  const originalFetch = globalThis.fetch.bind(globalThis);
  let busy = false;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (value) => new Promise((resolve) => chrome.storage.local.set(value, resolve));

  async function authHeaders() {
    const data = await storageGet(["ql_session_id"]);
    if (!data.ql_session_id) throw new Error("Valide sua chave de ativação novamente.");
    return {
      Authorization: `Bearer ${data.ql_session_id}`,
      "Content-Type": "application/json",
      "X-Super-Lovable-Edition": "customer-s1",
    };
  }

  async function request(path, options = {}) {
    const response = await originalFetch(`${API}${path}`, {
      ...options,
      headers: { ...(await authHeaders()), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Servidor respondeu ${response.status}.`);
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function currentRepository() {
    const status = String(document.getElementById("sl-agent-status")?.textContent || "");
    const match = status.match(/Projeto conectado:\s*([^\s]+)\s*\(([^)]+)\)/i);
    if (match) return match[1];
    const projectStatus = String(document.getElementById("sl-project-status")?.textContent || "");
    return projectStatus.match(/Repositório selecionado:\s*([^\s]+)/i)?.[1] || "";
  }

  function commitUrl(repository, sha) {
    return repository && sha ? `https://github.com/${repository}/commit/${sha}` : "";
  }

  async function readLocalHistory() {
    const data = await storageGet([HISTORY_KEY]);
    return Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  }

  function dedupeHistory(history) {
    const result = [];
    const seen = new Map();
    for (const item of history) {
      if (!item) continue;
      const key = `${String(item.text || "").trim()}::${String(item.runId || "")}`;
      const previousIndex = seen.get(key);
      if (previousIndex == null || !String(item.text || "").trim()) {
        seen.set(key, result.length);
        result.push(item);
        continue;
      }
      const previous = result[previousIndex];
      result[previousIndex] = {
        ...previous,
        ...item,
        id: previous.id || item.id,
        timestamp: previous.timestamp || item.timestamp,
        status: item.status === "ok" || item.status === "merged" ? item.status : previous.status || item.status,
        commitSha: item.commitSha || previous.commitSha,
        runId: item.runId || previous.runId,
      };
    }
    return result.slice(-200);
  }

  async function writeLocalHistory(history) {
    const trimmed = dedupeHistory(history);
    await storageSet({ [HISTORY_KEY]: trimmed });
    const badge = document.querySelector('.sp-tab[data-tab="history"] .sp-tab-badge');
    if (badge) badge.textContent = String(trimmed.length);
    return trimmed;
  }

  async function ensurePromptRecord(prompt) {
    const text = String(prompt || "").trim();
    if (!text) return null;
    let history = await readLocalHistory();
    const now = Date.now();
    const matching = history.filter((item) => {
      const age = now - new Date(item?.timestamp || item?.updatedAt || 0).getTime();
      return item?.text === text && Number.isFinite(age) && age < 60_000;
    });
    if (matching.length) {
      const keep = matching.find((item) => item.runId) || matching[0];
      history = history.filter((item) => item === keep || item?.text !== text || (now - new Date(item?.timestamp || item?.updatedAt || 0).getTime()) >= 60_000);
      await writeLocalHistory(history);
      await storageSet({ [ACTIVE_KEY]: keep.id });
      return keep.id;
    }
    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    history.push({ id, text, timestamp: new Date().toISOString(), status: "processing", source: "github-agent" });
    await writeLocalHistory(history);
    await storageSet({ [ACTIVE_KEY]: id });
    return id;
  }

  async function attachRunId(runId, prompt = "") {
    if (!runId) return;
    let history = await readLocalHistory();
    let active = (await storageGet([ACTIVE_KEY]))[ACTIVE_KEY];
    if (!active && prompt) active = await ensurePromptRecord(prompt);
    history = await readLocalHistory();
    let index = history.findIndex((item) => item?.id === active);
    if (index < 0) index = history.findIndex((item) => item?.text === prompt && item?.status === "processing");
    if (index < 0) return;
    history[index] = { ...history[index], runId, updatedAt: new Date().toISOString() };
    await writeLocalHistory(history);
  }

  async function completeLocalRecord(runId, result) {
    let history = await readLocalHistory();
    let index = history.findIndex((item) => item?.runId === runId);
    if (index < 0) {
      const active = (await storageGet([ACTIVE_KEY]))[ACTIVE_KEY];
      index = history.findIndex((item) => item?.id === active);
    }
    if (index < 0) return;
    history[index] = {
      ...history[index],
      runId,
      status: "ok",
      commitSha: result.commitSha || result.commit_sha || null,
      repository: result.repository || history[index].repository || currentRepository(),
      branch: result.branch || history[index].branch || "main",
      summary: result.summary || history[index].summary || "",
      updatedAt: new Date().toISOString(),
    };
    await writeLocalHistory(history);
    await storageSet({ [ACTIVE_KEY]: null });
  }

  function bodyJson(init) {
    try { return JSON.parse(String(init?.body || "{}")); } catch { return {}; }
  }

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : String(input?.url || "");
    const match = url.match(EXECUTION_PATH);
    if (!match) return originalFetch(input, init);

    const kind = match[1];
    const body = bodyJson(init);
    if ((kind === "decompose" || kind === "plan") && body.prompt) {
      await ensurePromptRecord(body.prompt).catch(() => {});
    }

    const response = await originalFetch(input, init);
    try {
      const data = await response.clone().json();
      if (kind === "plan" && response.ok && data?.ok !== false && data?.runId) {
        await attachRunId(String(data.runId), body.prompt || "");
      }
      if (kind === "commit" && response.ok && data?.ok !== false) {
        const runId = String(body.run_id || data.runId || "");
        if (runId && data.commitSha) await completeLocalRecord(runId, data);
      }
    } catch {}
    return response;
  };

  async function backendHistory() {
    try {
      const data = await request("/history?limit=100");
      return Array.isArray(data.history) ? data.history : [];
    } catch {
      return [];
    }
  }

  async function combinedHistory() {
    const [backend, local] = await Promise.all([backendHistory(), readLocalHistory()]);
    const bySha = new Set();
    const result = [];
    for (const item of backend) {
      if (item?.commitSha) bySha.add(String(item.commitSha));
      result.push(item);
    }
    for (const item of [...local].reverse()) {
      if (!item?.commitSha || bySha.has(String(item.commitSha))) continue;
      result.push({
        id: item.runId || item.id,
        localId: item.id,
        repository: item.repository || currentRepository(),
        branch: item.branch || "main",
        prompt: item.text || "",
        summary: item.summary || item.text || "Alteração aplicada pela Super Lovable",
        status: "merged",
        commitSha: item.commitSha,
        commitUrl: commitUrl(item.repository || currentRepository(), item.commitSha),
        createdAt: item.timestamp || null,
        updatedAt: item.updatedAt || null,
        localOnly: true,
      });
    }
    return result;
  }

  async function latestRollbackable() {
    const history = await combinedHistory();
    return history.find((item) => item?.id && item?.commitSha && !item?.rollbackSha && item?.status !== "rolled_back") || null;
  }

  async function rollbackItem(target, button) {
    if (busy || !target?.id) return;
    const shortSha = String(target.commitSha || "").slice(0, 7);
    if (!confirm(`Desfazer esta alteração${shortSha ? ` (${shortSha})` : ""}?\n\nIsso criará um novo commit de reversão na main.`)) return;
    busy = true;
    const previous = button?.textContent || "Desfazer";
    if (button) { button.disabled = true; button.textContent = "Desfazendo…"; }
    try {
      const result = await request("/rollback", {
        method: "POST",
        body: JSON.stringify({ run_id: target.id, commit_sha: target.commitSha || "" }),
      });
      alert(`Alteração desfeita com sucesso${result.commitSha ? `. Commit ${String(result.commitSha).slice(0, 7)}` : ""}.`);
      setTimeout(() => enhance().catch(() => {}), 300);
    } catch (error) {
      alert(error.message || "Não foi possível desfazer a alteração.");
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = previous; }
    }
  }

  async function rollbackLatest(button) {
    const target = await latestRollbackable();
    if (!target) {
      alert("Não encontrei uma alteração recente disponível para desfazer.");
      return;
    }
    await rollbackItem(target, button);
  }

  function ensureStyles() {
    if (document.getElementById("sl-history-enhancement-styles")) return;
    const style = document.createElement("style");
    style.id = "sl-history-enhancement-styles";
    style.textContent = `
      .sl-history-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
      .sl-history-action,.sl-history-undo-last{border:1px solid rgba(190,115,255,.26);background:rgba(145,62,225,.13);color:#eadcff;border-radius:8px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer}
      .sl-history-undo-last{border-color:rgba(255,190,71,.34);background:rgba(255,190,71,.09);color:#ffd987;white-space:nowrap}
      .sl-history-action[data-kind="undo"]{border-color:rgba(255,190,71,.34);background:rgba(255,190,71,.09);color:#ffd987}
      .sl-history-action:disabled,.sl-history-undo-last:disabled{opacity:.55;cursor:wait}
      .sl-history-local-note{font-size:10px;color:#9f91af;line-height:1.35}
    `;
    document.head.appendChild(style);
  }

  async function addUndoToolbar(view) {
    const toolbar = view.querySelector(".sl-history-toolbar");
    if (!toolbar || toolbar.querySelector(".sl-history-undo-last")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sl-history-undo-last";
    button.textContent = "Desfazer última ação";
    button.addEventListener("click", () => rollbackLatest(button));
    toolbar.appendChild(button);
    if (globalThis.superLovableExecutionIsActive?.()) globalThis.superLovableStopExecution && setTimeout(() => globalThis.dispatchEvent(new Event("sl-history-stop-sync")), 0);
  }

  async function enrichPromptCards(view) {
    const cards = [...view.querySelectorAll(".sl-history-card")];
    if (!cards.length) return;
    const local = (await readLocalHistory()).slice().reverse();
    const combined = await combinedHistory();
    const repository = currentRepository();

    cards.forEach((card, index) => {
      if (card.querySelector(".sl-history-actions")) return;
      const item = local[index];
      if (!item?.commitSha) return;
      const matched = combined.find((entry) => String(entry?.commitSha || "").startsWith(String(item.commitSha).slice(0, 7)));
      const repo = matched?.repository || item.repository || repository;
      const url = matched?.commitUrl || commitUrl(repo, item.commitSha);
      const actions = document.createElement("div");
      actions.className = "sl-history-actions";
      if (url) {
        const open = document.createElement("button");
        open.type = "button";
        open.className = "sl-history-action";
        open.textContent = "Ver no GitHub";
        open.addEventListener("click", () => chrome.tabs.create({ url }));
        actions.appendChild(open);
      }
      if (matched?.id && !matched?.rollbackSha) {
        const undo = document.createElement("button");
        undo.type = "button";
        undo.className = "sl-history-action";
        undo.dataset.kind = "undo";
        undo.textContent = "Desfazer esta ação";
        undo.addEventListener("click", () => rollbackItem(matched, undo));
        actions.appendChild(undo);
      }
      if (actions.childElementCount) card.appendChild(actions);
    });
  }

  async function rebuildGithubView(view) {
    const history = (await combinedHistory()).filter((item) => item?.commitSha);
    view.innerHTML = `
      <div class="sl-history-toolbar">
        <small>${history.length} commit${history.length === 1 ? "" : "s"} da Super Lovable</small>
        <button class="sl-history-refresh" type="button">Atualizar</button>
      </div>
      <div class="sl-history-list">
        ${history.length ? history.map((item) => {
          const repo = item.repository || currentRepository();
          const url = item.commitUrl || commitUrl(repo, item.commitSha);
          return `<div class="sl-history-card" data-status="${escapeHtml(item.status || "merged")}">
            <p>${escapeHtml(item.summary || item.prompt || "Alteração aplicada pela Super Lovable")}</p>
            <div class="sl-history-meta"><span class="sl-history-status">Aplicado</span><span>${escapeHtml(repo)}</span><span>${escapeHtml(String(item.commitSha).slice(0, 7))}</span></div>
            <div class="sl-history-actions">
              ${url ? `<button type="button" class="sl-history-action" data-commit-url="${escapeHtml(url)}">Ver no GitHub</button>` : ""}
              ${item.id && !item.rollbackSha ? `<button type="button" class="sl-history-action" data-kind="undo" data-run-id="${escapeHtml(item.id)}">Desfazer esta ação</button>` : ""}
            </div>
            ${item.localOnly ? '<div class="sl-history-local-note">Registro recuperado diretamente da execução local da extensão.</div>' : ""}
          </div>`;
        }).join("") : '<div class="sl-history-empty">Ainda não há commits aplicados pela Super Lovable neste histórico.</div>'}
      </div>`;

    view.querySelector(".sl-history-refresh")?.addEventListener("click", () => rebuildGithubView(view));
    view.querySelectorAll("[data-commit-url]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.getAttribute("data-commit-url");
        if (url) chrome.tabs.create({ url });
      });
    });
    view.querySelectorAll("[data-run-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-run-id");
        const target = history.find((item) => String(item.id) === String(id));
        if (target) await rollbackItem(target, button);
      });
    });
    await addUndoToolbar(view);
  }

  async function enhance() {
    ensureStyles();
    const historyTab = document.querySelector('.sp-tab[data-tab="history"]');
    const view = document.getElementById("sl-history-view");
    if (!historyTab?.classList.contains("sp-tab-active") || !view) return;
    const activeView = document.querySelector('.sl-history-tabs button.is-active')?.getAttribute("data-view") || "prompts";
    if (activeView === "github") await rebuildGithubView(view);
    else {
      await addUndoToolbar(view);
      await enrichPromptCards(view);
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer._timer);
    observer._timer = setTimeout(() => enhance().catch(() => {}), 120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.('.sp-tab[data-tab="history"], .sl-history-tabs button, .sl-history-refresh')) {
      setTimeout(() => enhance().catch(() => {}), 180);
    }
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[HISTORY_KEY]) setTimeout(() => enhance().catch(() => {}), 100);
  });

  setTimeout(() => enhance().catch(() => {}), 700);
})();