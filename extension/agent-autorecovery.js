// Super Lovable — recuperação automática da execução em etapas.
(() => {
  if (globalThis.__superLovableAutoRecoveryLoaded) return;
  globalThis.__superLovableAutoRecoveryLoaded = true;

  const TASK_KEY = "sl_agent_batch_task_v1";
  const RECOVERY_KEY = "sl_agent_recovery_state_v1";
  const MAX_RECOVERIES_PER_STAGE = 3;
  const NORMAL_DELAYS = [900, 2_200, 5_000];
  const RATE_LIMIT_DELAYS = [8_000, 16_000, 30_000];

  let scheduledTimer = null;
  let scheduledSignature = "";

  const storage = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

  function setStatus(message, kind = "warning") {
    const status = document.getElementById("sl-agent-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function recoveryButton() {
    const buttons = [...document.querySelectorAll("#sl-agent-progress button")];
    return buttons.find((button) =>
      /^(Retomar da etapa|Continuar da etapa|Tentar novamente com contexto reduzido)/i.test(
        String(button.textContent || "").trim(),
      ),
    );
  }

  function visibleErrorText() {
    return String(document.getElementById("sl-agent-progress")?.textContent || "");
  }

  function delayFor(errorText, attempt) {
    const rateLimited = /rate limit|limite temporário|429|tokens per minute|requests per minute/i.test(
      errorText,
    );
    const delays = rateLimited ? RATE_LIMIT_DELAYS : NORMAL_DELAYS;
    return delays[Math.min(attempt, delays.length - 1)];
  }

  async function recoveryContext() {
    const data = await storage([TASK_KEY, RECOVERY_KEY]);
    const task = data[TASK_KEY] || null;
    const recovery = data[RECOVERY_KEY] || { taskId: "", stages: {} };
    const taskId = String(task?.id || "single");
    const stage = Number.isFinite(Number(task?.nextIndex)) ? Number(task.nextIndex) : -1;
    const key = `${taskId}:${stage}`;
    if (recovery.taskId && recovery.taskId !== taskId) {
      return { task, taskId, stage, key, recovery: { taskId, stages: {} } };
    }
    return {
      task,
      taskId,
      stage,
      key,
      recovery: { taskId, stages: recovery.stages || {} },
    };
  }

  async function clearRecoveryWhenDone() {
    const data = await storage([TASK_KEY]);
    if (!data[TASK_KEY]) await storageRemove([RECOVERY_KEY]);
  }

  async function maybeRecover() {
    if (scheduledTimer) return;
    const button = recoveryButton();
    if (!button || button.disabled) return;

    const context = await recoveryContext();
    const attempts = Number(context.recovery.stages[context.key] || 0);
    if (attempts >= MAX_RECOVERIES_PER_STAGE) {
      setStatus(
        "A Super Lovable tentou se recuperar automaticamente várias vezes. A execução ficou preservada para evitar repetir alterações incorretas.",
        "error",
      );
      return;
    }

    const errorText = visibleErrorText();
    const delay = delayFor(errorText, attempts);
    const signature = `${context.key}:${attempts}:${String(button.textContent || "")}`;
    if (scheduledSignature === signature) return;
    scheduledSignature = signature;

    const stageLabel = context.stage >= 0 ? `etapa ${context.stage + 1}` : "alteração";
    setStatus(
      `Recuperando automaticamente a ${stageLabel} — tentativa ${attempts + 1}/${MAX_RECOVERIES_PER_STAGE}…`,
      "warning",
    );

    const originalLabel = String(button.textContent || "");
    button.disabled = true;
    button.textContent = "Retomando automaticamente…";

    scheduledTimer = setTimeout(async () => {
      scheduledTimer = null;
      try {
        const fresh = await recoveryContext();
        const nextAttempts = Number(fresh.recovery.stages[fresh.key] || 0) + 1;
        fresh.recovery.stages[fresh.key] = nextAttempts;
        await storageSet({ [RECOVERY_KEY]: fresh.recovery });

        button.disabled = false;
        button.textContent = originalLabel;
        button.click();
      } catch (error) {
        button.disabled = false;
        button.textContent = originalLabel;
        setStatus(
          error instanceof Error
            ? `Falha ao retomar automaticamente: ${error.message}`
            : "Falha ao retomar automaticamente.",
          "error",
        );
      } finally {
        scheduledSignature = "";
      }
    }, delay);
  }

  const observer = new MutationObserver(() => {
    void maybeRecover();
    void clearRecoveryWhenDone();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // Cobre também o caso em que a página/preview é recarregada e a tarefa persistida
  // reaparece depois que a conexão com o GitHub termina de sincronizar.
  setInterval(() => {
    void maybeRecover();
    void clearRecoveryWhenDone();
  }, 1_500);
})();
