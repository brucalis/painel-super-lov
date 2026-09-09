// Super Lovable — controle leve de interrupção da execução comercial.
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
  let activityTimer = null;

  function isExecutionRequest(input) {
    const url = typeof input === "string" ? input : String(input?.url || "");
    return EXECUTION_PATH.test(url);
  }

  function combinedSignal(existing) {
    if (!existing) return executionController.signal;
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
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

  const storageRemove = (keys) =>
    new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

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
    }, 1000);
    setTimeout(stopCleanupLoop, 8000);
  }

  function executionLooksActive() {
    if (stopped) return false;
    const status = String(document.getElementById("sl-agent-status")?.textContent || "");
    const progress = document.getElementById("sl-agent-progress");
    if (!progress || progress.hidden) return false;
    const combined = `${status} ${String(progress.textContent || "")}`;
    return !/Concluído|concluída|aplicada com sucesso|Falha no processamento|interrompida pelo usuário/i.test(combined);
  }

  function syncStopButton() {
    const button = document.getElementById("sl-agent-stop");
    if (!button) return;
    const active = executionLooksActive();
    button.hidden = !active;
    button.disabled = stopped;
    button.textContent = stopped ? "Parando…" : "Parar execução";
    if (!active && activityTimer) {
      clearInterval(activityTimer);
      activityTimer = null;
    }
  }

  function startActivityWatch() {
    if (activityTimer) return;
    activityTimer = setInterval(syncStopButton, 1000);
    syncStopButton();
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

  function newExecutionCycle() {
    stopped = false;
    if (executionController.signal.aborted) executionController = new AbortController();
    stopCleanupLoop();
    mountStopButton();
    startActivityWatch();
  }

  // Só inicia o monitoramento quando o usuário realmente envia um comando.
  window.addEventListener("click", (event) => {
    if (event.target?.closest?.("#sp-send")) newExecutionCycle();
  }, true);

  // Observa apenas inserção/remoção de nós e para de depender de characterData.
  // Isso evita acordar o script a cada mudança textual durante login/validação da licença.
  const observer = new MutationObserver(() => {
    if (!document.getElementById("sl-agent-stop")) mountStopButton();
  });

  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    mountStopButton();
  }, { once: true });

  mountStopButton();
  globalThis.superLovableStopExecution = stopExecution;
})();