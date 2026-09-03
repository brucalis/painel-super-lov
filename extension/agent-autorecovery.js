// Super Lovable — vigia de retomada autônoma orientada pelo estado persistido.
// A política e os checkpoints pertencem ao github-agent-panel. Este arquivo apenas
// acorda o orquestrador após recarga/recriação do painel; não procura nem clica botões.
(() => {
  if (globalThis.__superLovableAutoRecoveryLoaded) return;
  globalThis.__superLovableAutoRecoveryLoaded = true;

  const TASK_KEY = "sl_agent_batch_task_v1";
  let wakeTimer = null;

  function scheduleWake(delay = 250) {
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(async () => {
      wakeTimer = null;
      try {
        await globalThis.superLovableGithubAgentResumePending?.();
      } catch {
        // O painel exibe erros sanitizados e mantém o checkpoint para a próxima
        // retomada. O vigia não duplica logs nem decisões de recuperação.
      }
    }, delay);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[TASK_KEY]?.newValue) return;
    scheduleWake();
  });

  window.addEventListener("pageshow", () => scheduleWake(500));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleWake(300);
  });

  // Cobre a recriação do side panel pelo Chrome sem acoplar a retomada ao DOM.
  setInterval(() => scheduleWake(0), 3_000);
  scheduleWake(700);
})();
