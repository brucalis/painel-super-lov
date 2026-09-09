// Super Lovable — controle de interrupção da execução comercial.
(() => {
  if (globalThis.__superLovableExecutionStopLoaded) return;
  globalThis.__superLovableExecutionStopLoaded = true;
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const BATCH_TASK_KEY = "sl_agent_batch_task_v1";
  const EXECUTION_PATH = /\/api\/public\/agent\/(?:decompose|plan|commit)(?:[/?#]|$)/i;
  const originalFetch = globalThis.fetch.bind(globalThis);

  let stopped = false;
  let executionController = new AbortController();
  let cleanupTimer = null;

  function isExecutionRequest(input) {
    const url = typeof input === "string" ? input : String(input?.url || "");
    return EXECUTION_PATH.test(url);
  }

  function newExecutionCycle() {
    stopped = false;
    if (executionController.signal.aborted) executionController = new AbortController();
    stopCleanupLoop();
    syncStopButton();
  }

  function combinedSignal(existing) {
    if (!existing) return executionController.signal;
    if (typeof AbortSignal?.any === "function") {
      return AbortSignal.any([existing, executionController.signal]);
    }
    return executionController.signal;
  }

  globalThis.fetch = (input, init = {}) => {
    if (!isExecutionRequest(input)) return originalFetch(input, init);
    if (stopped) {
      return Promise.reject(new DOMException("Execução interrompida pelo usuário.", "AbortError"));
    }
    return originalFetch(input, { ...init, signal: combinedSignal(init?.signal) });
  };

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function storageRemove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }

  async function clearPendingTask() {
    try {
      await storageRemove([BATCH_TASK_KEY]);
    } catch {}
  }

  function stopCleanupLoop() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  function startCleanupLoop() {
    stopCleanupLoop();
    cleanupTimer = setInterval(() => {
      if (!stopped) return stopCleanupLoop();
      void clearPendingTask();
    }, 500);
    setTimeout(stopCleanupLoop, 12_000);
  }

  function showStoppedState() {
    const status = document.getElementById("sl-agent-status");
    const progress = document.getElementById("sl-agent-progress");
    if (status) {
      status.textContent = "Execução interrompida pelo usuário. Você já pode enviar um novo comando.";
      status.dataset.kind = "warning";
    }
    if (progress) {
      progress.hidden = false;
      progress.innerHTML = `
        <div class="sl-agent-result" style="border-color:rgba(255,190,71,.3)">
          <strong>Execução interrompida</strong>
          <p>Novas etapas e tentativas foram canceladas. Se um commit já tiver sido confirmado no GitHub antes da interrupção, ele continuará aparecendo no histórico e poderá ser desfeito.</p>
        </div>`;
    }
  }

  async function stopExecution() {
    if (stopped) return;
    stopped = true;
    try { executionController.abort("USER_CANCELLED"); } catch {}
    await clearPendingTask();
    startCleanupLoop();
    showStoppedState();
    syncStopButton();
  }

  function executionLooksActive() {
    const status = String(document.getElementById("sl-agent-status")?.textContent || "");
    const progress = document.getElementById("sl-agent-progress");
    if (stopped) return false;
    return Boolean(progress && !progress.hidden) && !/Concluído|concluída|aplicada com sucesso|Falha no processamento|interrompida pelo usuário/i.test(status + " " + String(progress?.textContent || ""));
  }

  function syncStopButton() {
    const button = document.getElementById("sl-agent-stop");
    if (!button) return;
    const active = executionLooksActive();
    button.hidden = !active;
    button.disabled = stopped;
    button.textContent = stopped ? "Parando…" : "Parar execução";
  }

  function mountStopButton() {
    const panel = document.getElementById("sl-github-agent");
    if (!panel || document.getElementById("sl-agent-stop")) return;
    const actions = panel.querySelector(".sl-agent-actions");
    if (!actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "sl-agent-stop";
    button.className = "sl-agent-danger";
    button.hidden = true;
    button.textContent = "Parar execução";
    button.addEventListener("click", () => void stopExecution());
    actions.appendChild(button);
    syncStopButton();
  }

  // O clique de envio passa primeiro pelo window (capture) e inicia um novo ciclo
  // antes de o listener do agente, registrado no document, executar.
  window.addEventListener("click", (event) => {
    if (event.target?.closest?.("#sp-send")) newExecutionCycle();
  }, true);

  const observer = new MutationObserver(() => {
    mountStopButton();
    if (stopped) showStoppedState();
    syncStopButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  setInterval(syncStopButton, 500);
  mountStopButton();

  globalThis.superLovableStopExecution = stopExecution;
})();
