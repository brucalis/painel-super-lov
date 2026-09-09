// Super Lovable — controle persistente de interrupção da execução comercial.
(() => {
  if (globalThis.__superLovableExecutionStopLoaded) return;
  globalThis.__superLovableExecutionStopLoaded = true;
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const BATCH_TASK_KEY = "sl_agent_batch_task_v1";
  const EXECUTION_STATE_KEY = "sl_execution_state_v4";
  const EXECUTION_PATH = /\/api\/public\/agent\/(decompose|plan|commit)(?:[/?#]|$)/i;
  const originalFetch = globalThis.fetch.bind(globalThis);

  let stopped = false;
  let active = false;
  let stage = "";
  let executionController = new AbortController();
  let idleTimer = null;

  const storageSet = (value) => new Promise((resolve) => chrome.storage.local.set(value, resolve));
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

  function stageLabel(kind) {
    if (kind === "decompose") return "Organizando o pedido";
    if (kind === "plan") return "Planejando a alteração";
    if (kind === "commit") return "Aplicando a alteração na main";
    return "Executando alteração";
  }

  async function persistState() {
    try {
      await storageSet({
        [EXECUTION_STATE_KEY]: {
          active,
          stopped,
          stage,
          updatedAt: Date.now(),
        },
      });
    } catch {}
  }

  function ensureStyles() {
    if (document.getElementById("sl-stop-styles")) return;
    const style = document.createElement("style");
    style.id = "sl-stop-styles";
    style.textContent = `
      .sl-stop-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 10px;padding:9px 10px;border:1px solid rgba(255,91,122,.35);background:rgba(255,68,105,.08);border-radius:10px}
      .sl-stop-bar[hidden]{display:none!important}
      .sl-stop-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
      .sl-stop-copy strong{font-size:11px;color:#ffd9e1}
      .sl-stop-copy small{font-size:10px;color:#bbaebf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sl-stop-button{border:1px solid rgba(255,91,122,.55);background:rgba(255,68,105,.16);color:#ffd8e0;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
      .sl-stop-button:disabled{opacity:.55;cursor:wait}
      .sl-history-stop{border:1px solid rgba(255,91,122,.45)!important;background:rgba(255,68,105,.11)!important;color:#ffd8e0!important}
    `;
    document.head.appendChild(style);
  }

  function renderPersistentBar() {
    ensureStyles();
    const panel = document.getElementById("sl-github-agent");
    if (!panel) return;
    let bar = document.getElementById("sl-stop-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "sl-stop-bar";
      bar.className = "sl-stop-bar";
      const progress = document.getElementById("sl-agent-progress");
      if (progress?.parentElement) progress.parentElement.insertBefore(bar, progress);
      else panel.appendChild(bar);
    }
    bar.hidden = !active;
    bar.innerHTML = `
      <div class="sl-stop-copy"><strong>Execução em andamento</strong><small>${stage || "Processando alteração…"}</small></div>
      <button type="button" class="sl-stop-button" ${stopped ? "disabled" : ""}>${stopped ? "Parando…" : "Parar execução"}</button>`;
    bar.querySelector("button")?.addEventListener("click", () => void stopExecution());
  }

  function renderHistoryStopButton() {
    const toolbar = document.querySelector("#sl-history-view .sl-history-toolbar");
    if (!toolbar) return;
    let button = toolbar.querySelector(".sl-history-stop");
    if (!active) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "sl-history-stop";
      button.textContent = "Parar execução";
      button.addEventListener("click", () => void stopExecution());
      toolbar.appendChild(button);
    }
  }

  function syncUi() {
    renderPersistentBar();
    renderHistoryStopButton();
  }

  function setActive(kind) {
    clearTimeout(idleTimer);
    stopped = false;
    active = true;
    stage = stageLabel(kind);
    if (executionController.signal.aborted) executionController = new AbortController();
    void persistState();
    syncUi();
  }

  function finishSoon(delay = 12000) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      active = false;
      stage = "";
      void persistState();
      syncUi();
    }, delay);
  }

  function finishNow() {
    clearTimeout(idleTimer);
    active = false;
    stage = "";
    void persistState();
    syncUi();
  }

  function combinedSignal(existing) {
    if (!existing) return executionController.signal;
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      return AbortSignal.any([existing, executionController.signal]);
    }
    return executionController.signal;
  }

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : String(input?.url || "");
    const match = url.match(EXECUTION_PATH);
    if (!match) return originalFetch(input, init);
    if (stopped) throw new DOMException("Execução interrompida pelo usuário.", "AbortError");

    const kind = match[1];
    setActive(kind);
    try {
      const response = await originalFetch(input, { ...init, signal: combinedSignal(init?.signal) });
      if (kind === "commit") finishNow();
      else if (!response.ok) finishSoon(2500);
      else finishSoon(15000);
      return response;
    } catch (error) {
      if (executionController.signal.aborted) finishNow();
      else finishSoon(2500);
      throw error;
    }
  };

  async function stopExecution() {
    if (!active || stopped) return;
    stopped = true;
    stage = "Interrompendo novas etapas e tentativas";
    syncUi();
    try { executionController.abort("USER_CANCELLED"); } catch {}
    try { await storageRemove([BATCH_TASK_KEY]); } catch {}
    const status = document.getElementById("sl-agent-status");
    if (status) {
      status.textContent = "Execução interrompida pelo usuário. Você já pode enviar um novo comando.";
      status.dataset.kind = "warning";
    }
    finishNow();
  }

  const observer = new MutationObserver(() => syncUi());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.('.sp-tab[data-tab="prompt"], .sp-tab[data-tab="history"], .sl-history-tabs button')) {
      setTimeout(syncUi, 120);
    }
  }, true);

  ensureStyles();
  syncUi();
  globalThis.superLovableStopExecution = stopExecution;
  globalThis.superLovableExecutionIsActive = () => active;
})();