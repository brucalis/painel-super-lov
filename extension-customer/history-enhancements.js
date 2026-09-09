(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;
  if (globalThis.__superLovableHistoryEnhancementsLoaded) return;
  globalThis.__superLovableHistoryEnhancementsLoaded = true;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const HISTORY_KEY = "ql_chat_history";
  let busy = false;

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

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
    const response = await fetch(`${API}${path}`, {
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
    const projectStatus = String(document.getElementById("sl-project-status")?.textContent || "");
    const fromProject = projectStatus.match(/Repositório selecionado:\s*([^\s]+)/i)?.[1];
    if (fromProject) return fromProject;
    const agentStatus = String(document.getElementById("sl-agent-status")?.textContent || "");
    return agentStatus.match(/Projeto conectado:\s*([^\s]+)/i)?.[1] || "";
  }

  function commitUrl(repository, sha) {
    return repository && sha ? `https://github.com/${repository}/commit/${sha}` : "";
  }

  async function localPromptHistory() {
    const data = await storageGet([HISTORY_KEY]);
    return Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  }

  async function backendHistory() {
    try {
      const data = await request("/history?limit=100");
      return Array.isArray(data.history) ? data.history : [];
    } catch {
      return [];
    }
  }

  async function latestRollbackable() {
    const history = await backendHistory();
    return history.find((item) => item?.id && item?.commitSha && !item?.rollbackSha && item?.status !== "rolled_back") || null;
  }

  async function rollbackLatest(button) {
    if (busy) return;
    const target = await latestRollbackable();
    if (!target) {
      alert("Não encontrei uma alteração recente disponível para desfazer.");
      return;
    }
    const shortSha = String(target.commitSha || "").slice(0, 7);
    if (!confirm(`Desfazer a última alteração da Super Lovable${shortSha ? ` (${shortSha})` : ""}?\n\nIsso criará um novo commit de reversão na main.`)) return;
    busy = true;
    const previous = button?.textContent || "Desfazer última ação";
    if (button) { button.disabled = true; button.textContent = "Desfazendo…"; }
    try {
      const result = await request("/rollback", {
        method: "POST",
        body: JSON.stringify({ run_id: target.id }),
      });
      const rollbackSha = result.rollbackCommitSha || result.rollbackSha || result.commitSha || "";
      alert(`Alteração desfeita com sucesso${rollbackSha ? `. Commit ${String(rollbackSha).slice(0, 7)}` : ""}.`);
      document.querySelector(".sl-history-refresh")?.click();
      setTimeout(enhance, 300);
    } catch (error) {
      alert(error.message || "Não foi possível desfazer a alteração.");
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = previous; }
    }
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
  }

  async function enrichPromptCards(view) {
    const cards = [...view.querySelectorAll(".sl-history-card")];
    if (!cards.length) return;
    const local = (await localPromptHistory()).slice().reverse();
    const backend = await backendHistory();
    const repository = currentRepository();

    cards.forEach((card, index) => {
      if (card.querySelector(".sl-history-actions")) return;
      const item = local[index];
      if (!item?.commitSha) return;
      const matched = backend.find((entry) => String(entry?.commitSha || "").startsWith(String(item.commitSha).slice(0, 7)));
      const repo = matched?.repository || repository;
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
        undo.addEventListener("click", async () => {
          if (busy || !confirm("Desfazer esta alteração? Um novo commit de reversão será criado na main.")) return;
          busy = true;
          undo.disabled = true;
          undo.textContent = "Desfazendo…";
          try {
            await request("/rollback", { method: "POST", body: JSON.stringify({ run_id: matched.id }) });
            alert("Alteração desfeita com sucesso.");
            setTimeout(enhance, 250);
          } catch (error) {
            alert(error.message || "Não foi possível desfazer a alteração.");
          } finally {
            busy = false;
            undo.disabled = false;
            undo.textContent = "Desfazer esta ação";
          }
        });
        actions.appendChild(undo);
      }
      if (actions.childElementCount) card.appendChild(actions);
    });
  }

  async function rebuildGithubFallback(view) {
    const list = view.querySelector(".sl-history-list");
    const empty = list?.querySelector(".sl-history-empty") || view.querySelector(".sl-history-empty");
    if (!empty || !/Ainda não há commits/i.test(empty.textContent || "")) return;
    const local = (await localPromptHistory()).filter((item) => item?.commitSha).slice().reverse();
    const repository = currentRepository();
    if (!local.length || !repository) return;
    const target = list || empty.parentElement;
    if (!target) return;
    target.innerHTML = local.map((item) => {
      const url = commitUrl(repository, item.commitSha);
      return `<div class="sl-history-card" data-status="ok">
        <p>${escapeHtml(item.text || "Alteração aplicada pela Super Lovable")}</p>
        <div class="sl-history-meta"><span class="sl-history-status">Concluído</span><span>${escapeHtml(repository)}</span><span>${escapeHtml(String(item.commitSha).slice(0, 7))}</span></div>
        <div class="sl-history-actions"><button type="button" class="sl-history-action" data-local-commit-url="${escapeHtml(url)}">Ver no GitHub</button></div>
        <div class="sl-history-local-note">Registro recuperado do histórico local da extensão.</div>
      </div>`;
    }).join("");
    target.querySelectorAll("[data-local-commit-url]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.getAttribute("data-local-commit-url");
        if (url) chrome.tabs.create({ url });
      });
    });
  }

  async function enhance() {
    ensureStyles();
    const historyTab = document.querySelector('.sp-tab[data-tab="history"]');
    const view = document.getElementById("sl-history-view");
    if (!historyTab?.classList.contains("sp-tab-active") || !view) return;
    await addUndoToolbar(view);
    const activeView = document.querySelector('.sl-history-tabs button.is-active')?.getAttribute("data-view") || "prompts";
    if (activeView === "github") await rebuildGithubFallback(view);
    else await enrichPromptCards(view);
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
  setTimeout(() => enhance().catch(() => {}), 700);
})();
