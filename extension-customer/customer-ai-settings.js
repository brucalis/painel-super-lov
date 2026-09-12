(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const PANEL_OPEN_KEY = "sl_connection_panel_open_v6";
  const BATCH_TASK_KEY = "sl_agent_batch_task_v1";
  const CONTEXT_RECOVERY_KEY = "sl_context_recovery_v2";
  const WATCHDOG_RECOVERY_KEY = "sl_watchdog_recovery_v2";
  const AI_PROVIDERS = ["mistral", "gemini", "cloudflare"];
  const providerLabel = { mistral: "Mistral", gemini: "Gemini", cloudflare: "Cloudflare" };
  const providerLinks = {
    mistral: "https://console.mistral.ai/api-keys",
    gemini: "https://aistudio.google.com/app/apikey",
    cloudflare: "https://dash.cloudflare.com/",
  };

  const connectionState = {
    mistral: false,
    gemini: false,
    cloudflare: false,
    github: false,
    project: false,
    repository: "",
    ready: false,
  };

  let panelPreferredOpen = null;
  let suppressPanelToggle = false;
  let userOpenedCompletePanel = false;
  let recoveryScheduled = false;
  let syncScheduled = false;
  let lastExecutionActivityAt = Date.now();
  let lastExecutionSnapshot = "";

  function isContextInvalidated(value) { return /Extension context invalidated/i.test(String(value?.message || value || "")); }
  function localNumber(key) { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } }
  function setLocalNumber(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
  function showRecoveryMessage(message) {
    const agent = document.getElementById("sl-github-agent");
    const progress = document.getElementById("sl-agent-progress");
    const status = document.getElementById("sl-agent-status");
    if (agent) agent.hidden = false;
    if (status && status.textContent !== message) status.textContent = message;
    if (progress) {
      progress.hidden = false;
      const html = `<div class="sl-agent-note">${message}</div>`;
      if (progress.innerHTML !== html) progress.innerHTML = html;
    }
  }
  function reloadForRecovery(message, guardKey, minimumIntervalMs) {
    if (recoveryScheduled) return;
    const now = Date.now();
    if (now - localNumber(guardKey) < minimumIntervalMs) return;
    recoveryScheduled = true;
    setLocalNumber(guardKey, now);
    showRecoveryMessage(message);
    setTimeout(() => location.reload(), 700);
  }
  function recoverInvalidatedContext(error) {
    if (!isContextInvalidated(error)) return false;
    reloadForRecovery("A extensão foi atualizada. Reconectando…", CONTEXT_RECOVERY_KEY, 15_000);
    return true;
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime?.id) return reject(new Error("Extension context invalidated"));
        chrome.storage.local.get(keys, (result) => {
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) reject(new Error(runtimeError.message));
          else resolve(result || {});
        });
      } catch (error) { reject(error); }
    });
  }
  function storageSet(values) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime?.id) return reject(new Error("Extension context invalidated"));
        chrome.storage.local.set(values, () => {
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) reject(new Error(runtimeError.message));
          else resolve();
        });
      } catch (error) { reject(error); }
    });
  }
  async function safeStorageGet(keys) { try { return await storageGet(keys); } catch (error) { recoverInvalidatedContext(error); throw error; } }
  async function safeStorageSet(values) { try { await storageSet(values); } catch (error) { recoverInvalidatedContext(error); throw error; } }

  const request = async (path = "", options = {}) => {
    const session = await safeStorageGet(["ql_session_id"]);
    if (!session.ql_session_id) throw new Error("Valide sua licença novamente.");
    const response = await fetch(`${API}/ai-credentials${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.ql_session_id}`,
        "Content-Type": "application/json",
        "X-Super-Lovable-Edition": "customer-s1",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const raw = data.error || "Não foi possível concluir a configuração.";
      if (/Provedor inválido/i.test(raw)) throw new Error("O backend do painel ainda está em uma versão anterior. Publique a atualização do Painel Super Lovable e tente novamente.");
      throw new Error(raw);
    }
    return data;
  };

  function setPanelOpen(details, open) {
    if (!details || details.open === open) return;
    suppressPanelToggle = true;
    details.open = open;
    queueMicrotask(() => { suppressPanelToggle = false; });
  }
  async function persistPanelPreference(open) { panelPreferredOpen = open; try { await safeStorageSet({ [PANEL_OPEN_KEY]: open }); } catch {} }
  async function loadPanelPreference() {
    try { const stored = await safeStorageGet([PANEL_OPEN_KEY]); if (typeof stored[PANEL_OPEN_KEY] === "boolean") panelPreferredOpen = stored[PANEL_OPEN_KEY]; } catch {}
    renderOverallStatus();
  }
  function setStatusText(element, kind, text) {
    if (!element) return;
    if (element.dataset.kind !== kind) element.dataset.kind = kind;
    if (element.textContent !== text) element.textContent = text;
  }

  function renderProjectStatus() {
    const status = document.getElementById("sl-project-status");
    if (!status) return;
    const switchButton = document.getElementById("sl-agent-switch-project");
    if (connectionState.github && connectionState.project) {
      setStatusText(status, "success", `Repositório selecionado: ${connectionState.repository || "projeto selecionado"}`);
      if (switchButton) switchButton.style.display = "inline-flex";
    } else if (connectionState.github) {
      setStatusText(status, "warning", "GitHub conectado. Selecione o repositório para continuar.");
      if (switchButton) switchButton.style.display = "none";
    } else {
      setStatusText(status, "warning", "GitHub ainda não conectado");
      if (switchButton) switchButton.style.display = "none";
    }
  }

  function renderOverallStatus() {
    const summary = document.getElementById("sl-connection-summary");
    const details = document.getElementById("sl-connection-status");
    const list = document.getElementById("sl-connection-checklist");
    if (!summary || !details) return;

    const aiCount = AI_PROVIDERS.filter((provider) => connectionState[provider]).length;
    const aiReady = aiCount > 0;
    const projectReady = connectionState.github && connectionState.project;
    const operational = aiReady && projectReady;
    const fullRedundancy = aiCount === AI_PROVIDERS.length;
    const becameOperational = operational && !connectionState.ready;
    connectionState.ready = operational;

    const stateKey = `${operational}:${aiCount}:${projectReady}`;
    if (summary.dataset.state !== stateKey) {
      summary.dataset.state = stateKey;
      summary.dataset.kind = operational ? "success" : "warning";
      let helper = "Conecte pelo menos uma IA; recomendamos as três para máxima continuidade";
      if (aiReady && !projectReady) helper = `${aiCount}/3 IAs prontas · conclua a conexão do projeto`;
      if (operational) helper = fullRedundancy ? "Mistral + Gemini + Cloudflare disponíveis" : `${aiCount}/3 IAs conectadas · contingência parcial`;
      summary.innerHTML = `
        <span class="sl-connection-dot"></span>
        <span><strong>Status:</strong> ${operational ? "Conectado" : "Configuração necessária"}</span>
        <small>${helper}</small>
        <span class="sl-connection-chevron">⌄</span>`;
    }

    if (list) {
      const checklistState = [connectionState.mistral, connectionState.gemini, connectionState.cloudflare, projectReady].map(Boolean).join(":");
      if (list.dataset.state !== checklistState) {
        list.dataset.state = checklistState;
        const item = (done, text) => `<span class="${done ? "is-ready" : ""}"><b>${done ? "✓" : "○"}</b>${text}</span>`;
        list.innerHTML =
          item(connectionState.mistral, "Mistral · código rápido") +
          item(connectionState.gemini, "Gemini · contexto complexo") +
          item(connectionState.cloudflare, "Cloudflare · contingência") +
          item(projectReady, "Projeto");
      }
    }
    renderProjectStatus();
    if (!operational) {
      userOpenedCompletePanel = false;
      setPanelOpen(details, true);
    } else if (becameOperational || !userOpenedCompletePanel) {
      setPanelOpen(details, false);
      void persistPanelPreference(false);
    }
  }

  function updateProvider(provider, data) {
    const status = document.getElementById(`sl-ai-${provider}-status`);
    const button = document.getElementById(`sl-ai-${provider}-save`);
    const remove = document.getElementById(`sl-ai-${provider}-remove`);
    if (!status) return;
    const configured = Boolean(data?.configured);
    connectionState[provider] = configured;
    setStatusText(status, configured ? "success" : "warning", configured ? `${providerLabel[provider]} conectado (${data.keyHint || "chave protegida"})` : "Ainda não conectado");
    if (button) button.textContent = configured ? "Substituir" : "Conectar";
    if (remove) remove.style.display = configured ? "inline-flex" : "none";
    renderOverallStatus();
  }

  async function refresh() {
    try {
      const data = await request();
      AI_PROVIDERS.forEach((provider) => updateProvider(provider, data[provider]));
    } catch (error) {
      if (recoverInvalidatedContext(error)) return;
      AI_PROVIDERS.forEach((provider) => {
        const status = document.getElementById(`sl-ai-${provider}-status`);
        if (!status) return;
        setStatusText(status, connectionState[provider] ? "warning" : "error", connectionState[provider] ? "Não foi possível verificar agora. A credencial salva foi mantida." : error.message);
      });
      renderOverallStatus();
    }
  }

  async function save(event, provider) {
    event.preventDefault();
    const input = document.getElementById(`sl-ai-${provider}-key`);
    const accountInput = provider === "cloudflare" ? document.getElementById("sl-ai-cloudflare-account") : null;
    const status = document.getElementById(`sl-ai-${provider}-status`);
    const apiKey = String(input?.value || "").trim();
    const accountId = String(accountInput?.value || "").trim();
    if (!apiKey) { setStatusText(status, "error", "Cole sua chave para continuar."); return; }
    if (provider === "cloudflare" && !accountId) { setStatusText(status, "error", "Informe também o Account ID da Cloudflare."); return; }
    const hadConnection = Boolean(connectionState[provider]);
    setStatusText(status, "warning", `Validando ${providerLabel[provider]}…`);
    try {
      const payload = { provider, ai_provider: provider, api_key: apiKey };
      if (provider === "cloudflare") payload.account_id = accountId;
      await request("", { method: "PUT", body: JSON.stringify(payload) });
      if (input) input.value = "";
      if (accountInput) accountInput.value = "";
      await refresh();
      await globalThis.superLovableGithubAgentRefresh?.();
    } catch (error) {
      if (recoverInvalidatedContext(error)) return;
      setStatusText(status, hadConnection ? "warning" : "error", hadConnection ? `A nova credencial não foi aceita. A conexão anterior com ${providerLabel[provider]} foi mantida.` : error.message);
      renderOverallStatus();
    }
  }

  async function remove(provider) {
    if (!confirm(`Remover a credencial ${providerLabel[provider]} desta licença?`)) return;
    try {
      await request(`?provider=${provider}`, { method: "DELETE" });
      await refresh();
      await globalThis.superLovableGithubAgentRefresh?.();
    } catch (error) {
      if (!recoverInvalidatedContext(error)) console.warn("[Superlovable] Falha ao remover credencial:", error);
    }
  }

  function providerForm(provider, title, description, placeholder) {
    const accountField = provider === "cloudflare" ? `<input id="sl-ai-cloudflare-account" type="text" autocomplete="off" spellcheck="false" placeholder="Account ID da Cloudflare">` : "";
    return `<form id="sl-ai-${provider}-form" class="sl-setup-block">
      <div class="sl-setup-heading">
        <div><strong>${title}</strong><small>${description}</small></div>
        <a href="${providerLinks[provider]}" target="_blank" rel="noopener noreferrer">Criar credencial ↗</a>
      </div>
      <p id="sl-ai-${provider}-status" class="sl-setup-status" data-kind="info">Verificando…</p>
      ${accountField}
      <input id="sl-ai-${provider}-key" type="password" autocomplete="off" spellcheck="false" placeholder="${placeholder}">
      <div class="sl-agent-actions">
        <button type="submit" id="sl-ai-${provider}-save">Conectar</button>
        <button type="button" id="sl-ai-${provider}-remove" style="display:none">Remover</button>
      </div>
    </form>`;
  }

  function injectCustomerLayoutStyles() {
    if (document.getElementById("sl-customer-layout-style")) return;
    const style = document.createElement("style");
    style.id = "sl-customer-layout-style";
    style.textContent = `
      .sp-body { overflow-y: auto !important; overflow-x: hidden !important; }
      #sp-tab-content { flex: 0 0 auto !important; min-height: auto !important; overflow: visible !important; }
      #sl-connection-status-host { scroll-margin-top: 8px; }
      #sl-github-agent.sl-customer-execution-panel { margin: 10px 0 12px; }
      #sl-github-agent.sl-customer-execution-panel[hidden] { display: none !important; }
      #sl-project-connection { display: flex; flex-direction: column; gap: 8px; }
      #sl-project-status { margin: 0; font-size: 11px; line-height: 1.4; color: var(--ql-text-secondary); }
      #sl-project-status[data-kind="success"] { color: var(--ql-success); }
      #sl-project-status[data-kind="warning"] { color: var(--ql-warning); }
      .sp-customer-license-countdown { color: #a5f3fc; font-size: 10px; font-weight: 700; }
      .sp-customer-license-countdown[data-urgent="true"] { color: var(--ql-warning); }
      #sl-project-controls > .sl-agent-actions { margin-top: 0; flex-wrap: wrap; }
      #sl-agent-switch-project { border-color: rgba(103,232,249,.4); color: #a5f3fc; }
      #sl-project-controls #sl-agent-project-row { margin-top: 8px; }
      #sl-ai-cloudflare-account { margin-bottom: 6px; }
    `;
    document.head.appendChild(style);
  }

  function ensureProjectScaffold() {
    const target = document.getElementById("sl-project-connection");
    if (!target) return null;
    let status = document.getElementById("sl-project-status");
    if (!status) { status = document.createElement("p"); status.id = "sl-project-status"; target.appendChild(status); }
    let controls = document.getElementById("sl-project-controls");
    if (!controls) { controls = document.createElement("div"); controls.id = "sl-project-controls"; target.appendChild(controls); }
    return controls;
  }
  function executionIsVisible() {
    const progress = document.getElementById("sl-agent-progress");
    return Boolean(progress && !progress.hidden && String(progress.textContent || "").trim());
  }
  function syncAgentLayout() {
    syncScheduled = false;
    const agent = document.getElementById("sl-github-agent");
    if (!agent) return;
    const composer = document.querySelector(".sp-compose-card");
    if (composer?.parentElement && (agent.parentElement !== composer.parentElement || agent.nextElementSibling !== composer)) composer.parentElement.insertBefore(agent, composer);
    if (!agent.classList.contains("sl-customer-execution-panel")) agent.classList.add("sl-customer-execution-panel");
    const title = agent.querySelector(".sl-agent-title");
    if (title?.firstChild?.nodeType === Node.TEXT_NODE && title.firstChild.textContent !== "Execução atual ") title.firstChild.textContent = "Execução atual ";
    const controls = ensureProjectScaffold();
    const connectButton = document.getElementById("sl-agent-connect");
    const actionRow = connectButton?.parentElement;
    const projectRow = document.getElementById("sl-agent-project-row");
    if (controls && actionRow && actionRow.parentElement !== controls) controls.appendChild(actionRow);
    if (controls && projectRow && projectRow.parentElement !== controls) controls.appendChild(projectRow);
    const status = document.getElementById("sl-agent-status");
    const progress = document.getElementById("sl-agent-progress");
    const combinedText = `${status?.textContent || ""} ${progress?.textContent || ""}`;
    if (isContextInvalidated(combinedText)) recoverInvalidatedContext(combinedText);
    const shouldHide = !executionIsVisible();
    if (agent.hidden !== shouldHide) agent.hidden = shouldHide;
    renderProjectStatus();
  }
  function scheduleSyncAgentLayout() { if (syncScheduled) return; syncScheduled = true; setTimeout(syncAgentLayout, 120); }
  function updateExecutionActivity() {
    const status = document.getElementById("sl-agent-status");
    const progress = document.getElementById("sl-agent-progress");
    const snapshot = `${status?.textContent || ""}\n${progress?.textContent || ""}`;
    if (snapshot !== lastExecutionSnapshot) {
      lastExecutionSnapshot = snapshot;
      lastExecutionActivityAt = Date.now();
      scheduleSyncAgentLayout();
    }
  }
  async function watchdog() {
    updateExecutionActivity();
    if (recoveryScheduled || Date.now() - lastExecutionActivityAt < 180_000) return;
    try {
      const stored = await safeStorageGet([BATCH_TASK_KEY, "ql_license_valid"]);
      if (!stored.ql_license_valid) return;
      const task = stored[BATCH_TASK_KEY];
      if (!task || task.status !== "running") return;
      const guard = `${task.rootTaskId || "task"}:${task.nextIndex || 0}`;
      const previousGuard = (() => { try { return localStorage.getItem(WATCHDOG_RECOVERY_KEY) || ""; } catch { return ""; } })();
      if (previousGuard === guard && Date.now() - localNumber(`${WATCHDOG_RECOVERY_KEY}:time`) < 240_000) return;
      try { localStorage.setItem(WATCHDOG_RECOVERY_KEY, guard); setLocalNumber(`${WATCHDOG_RECOVERY_KEY}:time`, Date.now()); } catch {}
      reloadForRecovery("A execução ficou sem resposta. Retomando do último ponto seguro…", `${WATCHDOG_RECOVERY_KEY}:reload`, 180_000);
    } catch (error) { recoverInvalidatedContext(error); }
  }

  function mount() {
    const host = document.getElementById("sl-connection-status-host");
    if (!host || document.getElementById("sl-connection-status")) return;
    injectCustomerLayoutStyles();
    const details = document.createElement("details");
    details.id = "sl-connection-status";
    details.className = "sl-connection-card";
    details.innerHTML = `
      <summary id="sl-connection-summary" data-kind="warning"></summary>
      <div class="sl-connection-content">
        <p class="sl-connection-intro"><strong>Roteamento inteligente de IA.</strong> Tarefas simples priorizam Mistral; tarefas complexas priorizam Gemini; Cloudflare entra como contingência econômica. Basta uma IA para funcionar, mas recomendamos conectar as três.</p>
        <div id="sl-connection-checklist" class="sl-connection-checklist"></div>
        ${providerForm("mistral", "Mistral · Código rápido", "Prioridade para alterações simples e médias, usando Codestral quando disponível.", "Cole aqui sua chave Mistral")}
        ${providerForm("gemini", "Gemini · Contexto complexo", "Prioridade automática para tarefas grandes e multiarquivo.", "Cole aqui a chave Gemini")}
        ${providerForm("cloudflare", "Cloudflare · Contingência", "Terceira opção automática para preservar continuidade quando as demais atingirem limite.", "Cole aqui seu API Token Workers AI")}
        <div id="sl-project-connection" class="sl-project-connection"></div>
      </div>`;
    host.appendChild(details);

    details.addEventListener("toggle", () => {
      if (suppressPanelToggle) return;
      if (connectionState.ready) userOpenedCompletePanel = details.open;
      void persistPanelPreference(details.open);
    });
    AI_PROVIDERS.forEach((provider) => {
      document.getElementById(`sl-ai-${provider}-form`)?.addEventListener("submit", (event) => save(event, provider));
      document.getElementById(`sl-ai-${provider}-remove`)?.addEventListener("click", () => remove(provider));
    });

    globalThis.superLovableOpenConnectionStatus = () => {
      if (connectionState.ready) userOpenedCompletePanel = true;
      setPanelOpen(details, true);
      void persistPanelPreference(true);
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    globalThis.superLovableCloseConnectionStatus = () => {
      userOpenedCompletePanel = false;
      setPanelOpen(details, false);
      void persistPanelPreference(false);
    };

    ensureProjectScaffold();
    renderOverallStatus();
    void loadPanelPreference();
    refresh().then(() => globalThis.superLovableGithubAgentRefresh?.()).catch((error) => recoverInvalidatedContext(error));
    scheduleSyncAgentLayout();
  }

  document.addEventListener("superlovable:github-status", (event) => {
    const detail = event.detail || {};
    connectionState.github = Boolean(detail.github);
    connectionState.project = Boolean(detail.project);
    connectionState.repository = String(detail.repository || "");
    renderOverallStatus();
    scheduleSyncAgentLayout();
  });

  const observer = new MutationObserver(() => { mount(); scheduleSyncAgentLayout(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(updateExecutionActivity, 5_000);
  setInterval(() => void watchdog(), 30_000);
  setTimeout(() => { try { localStorage.removeItem(CONTEXT_RECOVERY_KEY); } catch {} }, 20_000);
  mount();
  scheduleSyncAgentLayout();
})();