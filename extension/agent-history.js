// Super Lovable — histórico persistente de prompts e commits do GitHub.
(() => {
  if (globalThis.__superLovableAgentHistoryLoaded) return;
  globalThis.__superLovableAgentHistoryLoaded = true;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const HISTORY_KEY = "ql_chat_history";
  const ACTIVE_KEY = "sl_agent_active_history_id";
  const LAST_RESULT_KEY = "sl_agent_last_result";
  const MAX_HISTORY = 200;

  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (value) =>
    new Promise((resolve) => chrome.storage.local.set(value, resolve));

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function authHeaders() {
    const data = await storageGet(["ql_session_id"]);
    if (!data.ql_session_id) throw new Error("Valide sua chave de ativação novamente.");
    return {
      Authorization: `Bearer ${data.ql_session_id}`,
      "Content-Type": "application/json",
    };
  }

  async function agentRequest(path) {
    const response = await fetch(`${API}${path}`, { headers: await authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Servidor respondeu ${response.status}.`);
    }
    return data;
  }

  async function readHistory() {
    const data = await storageGet([HISTORY_KEY]);
    return Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  }

  async function writeHistory(history) {
    const trimmed = history.slice(-MAX_HISTORY);
    await storageSet({ [HISTORY_KEY]: trimmed });
    const badge = document.querySelector('.sp-tab[data-tab="history"] .sp-tab-badge');
    if (badge) badge.textContent = String(trimmed.length);
    return trimmed;
  }

  async function startPromptRecord(prompt) {
    const history = await readHistory();
    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    history.push({
      id,
      text: String(prompt || "").trim(),
      timestamp: new Date().toISOString(),
      status: "processing",
      source: "github-agent",
    });
    await writeHistory(history);
    await storageSet({ [ACTIVE_KEY]: id });
    return id;
  }

  async function updatePromptRecord(status, extra = {}) {
    const state = await storageGet([HISTORY_KEY, ACTIVE_KEY]);
    const history = Array.isArray(state[HISTORY_KEY]) ? state[HISTORY_KEY] : [];
    const id = state[ACTIVE_KEY];
    if (!id) return;
    const index = history.findIndex((item) => item && item.id === id);
    if (index < 0) return;
    history[index] = {
      ...history[index],
      ...extra,
      status,
      updatedAt: new Date().toISOString(),
    };
    await writeHistory(history);
    if (status !== "processing") {
      await storageSet({ [ACTIVE_KEY]: null });
    }
  }

  function currentRepository() {
    const status = String(document.getElementById("sl-agent-status")?.textContent || "");
    const match = status.match(/Projeto conectado:\s*([^\s]+)\s*\(([^)]+)\)/i);
    return match ? { repository: match[1], branch: match[2] } : {};
  }

  async function rememberLastResult(kind, text, commitSha) {
    await storageSet({
      [LAST_RESULT_KEY]: {
        kind,
        text,
        commitSha: commitSha || null,
        timestamp: new Date().toISOString(),
        ...currentRepository(),
      },
    });
  }

  function installStyles() {
    if (document.getElementById("sl-history-styles")) return;
    const style = document.createElement("style");
    style.id = "sl-history-styles";
    style.textContent = `
      .sl-history-shell{display:flex;flex-direction:column;gap:12px;padding:2px 0 14px}
      .sl-history-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px}
      .sl-history-tabs button{border:0;border-radius:9px;padding:9px 8px;background:transparent;color:var(--ql-text-muted,#aa9db8);font-size:12px;font-weight:700;cursor:pointer}
      .sl-history-tabs button.is-active{background:rgba(153,68,255,.22);color:#fff;box-shadow:inset 0 0 0 1px rgba(191,128,255,.22)}
      .sl-history-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .sl-history-toolbar small{color:var(--ql-text-muted,#9e90ad)}
      .sl-history-clear,.sl-history-refresh{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#d8cdea;border-radius:8px;padding:6px 9px;font-size:11px;cursor:pointer}
      .sl-history-list{display:flex;flex-direction:column;gap:8px;max-height:440px;overflow:auto;padding-right:3px}
      .sl-history-card{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035);border-radius:12px;padding:10px 11px;display:flex;flex-direction:column;gap:6px}
      .sl-history-card[data-status="ok"],.sl-history-card[data-status="merged"]{border-color:rgba(55,214,153,.23)}
      .sl-history-card[data-status="error"],.sl-history-card[data-status="failed"],.sl-history-card[data-status="blocked"]{border-color:rgba(255,84,120,.25)}
      .sl-history-card[data-status="processing"],.sl-history-card[data-status="planned"]{border-color:rgba(255,190,71,.22)}
      .sl-history-card p{margin:0;color:#eee7f7;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      .sl-history-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:#9f91af;font-size:10px}
      .sl-history-status{padding:2px 6px;border-radius:99px;background:rgba(255,255,255,.07);font-weight:700}
      .sl-history-card button{align-self:flex-start;border:1px solid rgba(190,115,255,.26);background:rgba(145,62,225,.13);color:#eadcff;border-radius:8px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer}
      .sl-history-empty{padding:24px 12px;text-align:center;color:#9f91af;font-size:12px;border:1px dashed rgba(255,255,255,.1);border-radius:12px}
      .sl-last-result{margin-top:8px;border:1px solid rgba(96,220,171,.2);background:rgba(36,170,122,.08);border-radius:10px;padding:9px 10px;color:#dff9ef;font-size:11px;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function statusLabel(status) {
    const labels = {
      processing: "Processando",
      planned: "Planejado",
      ok: "Concluído",
      merged: "Aplicado",
      error: "Erro",
      failed: "Falhou",
      blocked: "Bloqueado",
    };
    return labels[status] || status || "Registrado";
  }

  async function renderPromptHistory(view) {
    const history = (await readHistory()).slice().reverse();
    view.innerHTML = `
      <div class="sl-history-toolbar">
        <small>${history.length} prompt${history.length === 1 ? "" : "s"}</small>
        <button class="sl-history-clear" type="button">Limpar prompts</button>
      </div>
      <div class="sl-history-list">
        ${history.length ? history.map((item) => `
          <div class="sl-history-card" data-status="${escapeHtml(item.status || "")}">
            <p>${escapeHtml(item.text || "")}</p>
            <div class="sl-history-meta">
              <span class="sl-history-status">${escapeHtml(statusLabel(item.status))}</span>
              <span>${escapeHtml(formatDate(item.timestamp || item.updatedAt))}</span>
              ${item.commitSha ? `<span>${escapeHtml(String(item.commitSha).slice(0, 7))}</span>` : ""}
            </div>
            ${item.error ? `<small style="color:#ff8ba4">${escapeHtml(item.error)}</small>` : ""}
          </div>
        `).join("") : '<div class="sl-history-empty">Os prompts enviados pela Super Lovable aparecerão aqui e continuarão disponíveis após atualizar a página.</div>'}
      </div>`;

    view.querySelector(".sl-history-clear")?.addEventListener("click", async () => {
      await writeHistory([]);
      renderPromptHistory(view);
    });
  }

  async function renderGithubHistory(view) {
    view.innerHTML = '<div class="sl-history-empty">Carregando commits da Super Lovable…</div>';
    try {
      const data = await agentRequest("/history?limit=100");
      const commits = (Array.isArray(data.history) ? data.history : []).filter(
        (item) => item && item.commitSha,
      );
      view.innerHTML = `
        <div class="sl-history-toolbar">
          <small>${commits.length} commit${commits.length === 1 ? "" : "s"} da Super Lovable</small>
          <button class="sl-history-refresh" type="button">Atualizar</button>
        </div>
        <div class="sl-history-list">
          ${commits.length ? commits.map((item) => `
            <div class="sl-history-card" data-status="${escapeHtml(item.status || "")}">
              <p>${escapeHtml(item.summary || item.commitMessage || "Alteração aplicada pela Super Lovable")}</p>
              <div class="sl-history-meta">
                <span class="sl-history-status">${escapeHtml(statusLabel(item.status))}</span>
                <span>${escapeHtml(item.repository || "")}</span>
                <span>${escapeHtml(String(item.commitSha || "").slice(0, 7))}</span>
                <span>${escapeHtml(formatDate(item.mergedAt || item.updatedAt || item.createdAt))}</span>
              </div>
              ${item.commitUrl ? `<button type="button" data-commit-url="${escapeHtml(item.commitUrl)}">Ver alteração no GitHub</button>` : ""}
            </div>
          `).join("") : '<div class="sl-history-empty">Ainda não há commits aplicados pela Super Lovable neste histórico.</div>'}
        </div>`;

      view.querySelector(".sl-history-refresh")?.addEventListener("click", () =>
        renderGithubHistory(view),
      );
      view.querySelectorAll("[data-commit-url]").forEach((button) => {
        button.addEventListener("click", () => {
          const url = button.getAttribute("data-commit-url");
          if (url) chrome.tabs.create({ url });
        });
      });
    } catch (error) {
      view.innerHTML = `<div class="sl-history-empty">${escapeHtml(error.message || "Não foi possível carregar os commits.")}</div>`;
    }
  }

  async function enhanceHistoryTab() {
    const tab = document.querySelector('.sp-tab[data-tab="history"]');
    const container = document.getElementById("sp-tab-content");
    if (!tab?.classList.contains("sp-tab-active") || !container) return;
    if (container.querySelector("#sl-history-shell")) return;

    installStyles();
    container.innerHTML = `
      <div class="sl-history-shell" id="sl-history-shell">
        <div class="sl-history-tabs">
          <button type="button" data-view="prompts" class="is-active">Prompts</button>
          <button type="button" data-view="github">GitHub</button>
        </div>
        <div id="sl-history-view"></div>
      </div>`;
    const view = container.querySelector("#sl-history-view");
    if (!view) return;

    const buttons = [...container.querySelectorAll(".sl-history-tabs button")];
    const selectView = async (name) => {
      buttons.forEach((button) =>
        button.classList.toggle("is-active", button.getAttribute("data-view") === name),
      );
      if (name === "github") await renderGithubHistory(view);
      else await renderPromptHistory(view);
    };
    buttons.forEach((button) =>
      button.addEventListener("click", () => selectView(button.getAttribute("data-view") || "prompts")),
    );
    await selectView("prompts");
  }

  async function restoreLastResult() {
    const panel = document.getElementById("sl-github-agent");
    const progress = document.getElementById("sl-agent-progress");
    if (!panel || !progress || !progress.hidden || progress.childElementCount) return;
    const data = await storageGet([LAST_RESULT_KEY]);
    const last = data[LAST_RESULT_KEY];
    if (!last?.text || !last?.timestamp) return;
    const age = Date.now() - new Date(last.timestamp).getTime();
    if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) return;
    progress.hidden = false;
    progress.innerHTML = `<div class="sl-last-result"><strong>Última execução</strong><br>${escapeHtml(last.text)}${last.commitSha ? `<br><small>Commit ${escapeHtml(String(last.commitSha).slice(0, 7))}</small>` : ""}</div>`;
  }

  let lastObservedStatus = "";
  async function inspectAgentStatus() {
    const el = document.getElementById("sl-agent-status");
    if (!el) return;
    const text = String(el.textContent || "").trim();
    if (!text || text === lastObservedStatus) return;
    lastObservedStatus = text;

    const commit = text.match(/Alteração\s+([0-9a-f]{7,40})\s+aplicada/i)?.[1] || null;
    if (/^Concluído\./i.test(text) || /aplicada\. Aguarde o preview/i.test(text)) {
      await updatePromptRecord("ok", { commitSha: commit });
      await rememberLastResult("success", text, commit);
      return;
    }

    const kind = el.dataset.kind || "";
    if (kind === "error" || /não foi possível|falha|erro/i.test(text)) {
      const state = await storageGet([ACTIVE_KEY]);
      if (state[ACTIVE_KEY]) {
        await updatePromptRecord("error", { error: text });
        await rememberLastResult("error", text, null);
      }
    }
  }

  window.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.("#sp-send");
      if (!button || !document.getElementById("sl-github-agent")) return;
      const prompt = String(document.getElementById("sp-msg")?.value || "").trim();
      if (!prompt) return;
      startPromptRecord(prompt).catch(() => {});
    },
    true,
  );

  const observer = new MutationObserver(() => {
    enhanceHistoryTab().catch(() => {});
    inspectAgentStatus().catch(() => {});
    restoreLastResult().catch(() => {});
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "data-kind"],
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[HISTORY_KEY]) return;
    const tab = document.querySelector('.sp-tab[data-tab="history"]');
    if (tab?.classList.contains("sp-tab-active")) {
      const shell = document.getElementById("sl-history-shell");
      const active = shell?.querySelector(".sl-history-tabs button.is-active")?.getAttribute("data-view");
      if (active === "prompts") {
        const view = document.getElementById("sl-history-view");
        if (view) renderPromptHistory(view).catch(() => {});
      }
    }
  });

  installStyles();
  enhanceHistoryTab().catch(() => {});
  inspectAgentStatus().catch(() => {});
  restoreLastResult().catch(() => {});
})();
