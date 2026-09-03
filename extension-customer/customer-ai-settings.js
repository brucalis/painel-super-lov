(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const PANEL_OPEN_KEY = "sl_connection_panel_open_v2";
  const BATCH_TASK_KEY = "sl_agent_batch_task_v1";
  const CONTEXT_RECOVERY_KEY = "sl_context_recovery_v1";
  const WATCHDOG_RECOVERY_KEY = "sl_watchdog_recovery_v1";
  const providerLabel = { groq: "Groq", gemini: "Gemini" };
  const providerLinks = {
    groq: "https://console.groq.com/keys",
    gemini: "https://aistudio.google.com/app/apikey",
  };
  const connectionState = {
    groq: false,
    gemini: false,
    github: false,
    project: false,
    ready: false,
  };

  let panelPreferenceLoaded = false;
  let panelPreferredOpen = null;
  let suppressPanelToggle = false;
  let recoveryScheduled = false;
  let lastExecutionActivityAt = Date.now();

  function isContextInvalidated(value) {
    return /Extension context invalidated/i.test(String(value?.message || value || ""));
  }

  function localNumber(key) {
    try { return Number(localStorage.getItem(key) || 0); } catch { return 0; }
  }

  function setLocalNumber(key, value) {
    try { localStorage.setItem(key, String(value)); } catch {}
  }

  function showRecoveryMessage(message) {
    const agent = document.getElementById("sl-github-agent");
    const progress = document.getElementById("sl-agent-progress");
    const status = document.getElementById("sl-agent-status");
    if (agent) agent.hidden = false;
    if (status) status.textContent = message;
    if (progress) {
      progress.hidden = false;
      progress.innerHTML = `<div class="sl-agent-note">${message}</div>`;
    }
  }

  function reloadForRecovery(message, guardKey, minimumIntervalMs) {
    if (recoveryScheduled) return;
    const now = Date.now();
    if (now - localNumber(guardKey) < minimumIntervalMs) return;
    recoveryScheduled = true;
    setLocalNumber(guardKey, now);
    showRecoveryMessage(message);
    setTimeout(() => location.reload(), 650);
  }

  function recoverInvalidatedContext(error) {
    if (!isContextInvalidated(error)) return false;
    reloadForRecovery(
      "A extensão foi atualizada. Reconectando e retomando do último ponto seguro…",
      CONTEXT_RECOVERY_KEY,
      6_000,
    );
    return true;
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) reject(new Error(runtimeError.message));
          else resolve(result || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(values, () => {
          const runtimeError = chrome.runtime?.lastError;
          if (runtimeError) reject(new Error(runtimeError.message));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function safeStorageGet(keys) {
    try {
      return await storageGet(keys);
    } catch (error) {
      recoverInvalidatedContext(error);
      throw error;
    }
  }

  async function safeStorageSet(values) {
    try {
      await storageSet(values);
    } catch (error) {
      recoverInvalidatedContext(error);
      throw error;
    }
  }

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
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível concluir a configuração.");
    return data;
  };

  function setPanelOpen(details, open) {
    if (!details || details.open === open) return;
    suppressPanelToggle = true;
    details.open = open;
    queueMicrotask(() => { suppressPanelToggle = false; });
  }

  async function persistPanelPreference(open) {
    panelPreferredOpen = open;
    try { await safeStorageSet({ [PANEL_OPEN_KEY]: open }); } catch {}
  }

  async function loadPanelPreference() {
    try {
      const stored = await safeStorageGet([PANEL_OPEN_KEY]);
      if (typeof stored[PANEL_OPEN_KEY] === "boolean") panelPreferredOpen = stored[PANEL_OPEN_KEY];
    } catch {}
    panelPreferenceLoaded = true;
    renderOverallStatus();
  }

  function renderProjectStatus() {
    const status = document.getElementById("sl-project-status");
    if (!status) return;
    if (connectionState.github && connectionState.project) {
      status.dataset.kind = "success";
      status.textContent = "GitHub e projeto conectados";
    } else if (connectionState.github) {
      status.dataset.kind = "warning";
      status.textContent = "GitHub conectado. Selecione o projeto para continuar.";
    } else {
      status.dataset.kind = "warning";
      status.textContent = "GitHub ainda não conectado";
    }
  }

  function renderOverallStatus() {
    const summary = document.getElementById("sl-connection-summary");
    const details = document.getElementById("sl-connection-status");
    const list = document.getElementById("sl-connection-checklist");
    if (!summary || !details) return;

    const complete = connectionState.groq && connectionState.gemini && connectionState.github && connectionState.project;
    const becameComplete = complete && !connectionState.ready;
    connectionState.ready = complete;
    summary.dataset.kind = complete ? "success" : "warning";
    summary.innerHTML = `
      <span class="sl-connection-dot"></span>
      <span><strong>Status:</strong> ${complete ? "Conectado" : "Não conectado"}</span>
      <small>${complete ? "Tudo pronto para usar" : "Clique para concluir a configuração"}</small>
      <span class="sl-connection-chevron">⌄</span>`;

    if (list) {
      const item = (done, text) => `<span class="${done ? "is-ready" : ""}"><b>${done ? "✓" : "○"}</b>${text}</span>`;
      list.innerHTML =
        item(connectionState.groq, "Conexão principal") +
        item(connectionState.gemini, "Conexão de contingência") +
        item(connectionState.github && connectionState.project, "Projeto");
    }
    renderProjectStatus();

    if (!complete) {
      setPanelOpen(details, true);
    } else if (becameComplete) {
      setPanelOpen(details, false);
      void persistPanelPreference(false);
    } else if (panelPreferenceLoaded && typeof panelPreferredOpen === "boolean") {
      setPanelOpen(details, panelPreferredOpen);
    }
  }

  function updateProvider(provider, data) {
    const status = document.getElementById(`sl-ai-${provider}-status`);
    const button = document.getElementById(`sl-ai-${provider}-save`);
    const remove = document.getElementById(`sl-ai-${provider}-remove`);
    if (!status) return;
    const configured = Boolean(data?.configured);
    connectionState[provider] = configured;
    status.dataset.kind = configured ? "success" : "warning";
    status.textContent = configured
      ? `${providerLabel[provider]} conectado (${data.keyHint || "chave protegida"})`
      : "Ainda não conectado";
    if (button) button.textContent = configured ? "Substituir" : "Conectar";
    if (remove) remove.style.display = configured ? "inline-flex" : "none";
    renderOverallStatus();
  }

  async function refresh() {
    try {
      const data = await request();
      updateProvider("groq", data.groq);
      updateProvider("gemini", data.gemini);
    } catch (error) {
      if (recoverInvalidatedContext(error)) return;
      ["groq", "gemini"].forEach((provider) => {
        connectionState[provider] = false;
        const status = document.getElementById(`sl-ai-${provider}-status`);
        if (status) {
          status.dataset.kind = "error";
          status.textContent = error.message;
        }
      });
      renderOverallStatus();
    }
  }

  async function save(event, provider) {
    event.preventDefault();
    const input = document.getElementById(`sl-ai-${provider}-key`);
    const status = document.getElementById(`sl-ai-${provider}-status`);
    const apiKey = String(input?.value || "").trim();
    if (!apiKey) {
      status.dataset.kind = "error";
      status.textContent = "Cole sua chave para continuar.";
      return;
    }
    status.dataset.kind = "warning";
    status.textContent = "Validando conexão…";
    try {
      await request("", { method: "PUT", body: JSON.stringify({ provider, api_key: apiKey }) });
      input.value = "";
      await refresh();
      await globalThis.superLovableGithubAgentRefresh?.();
    } catch (error) {
      if (recoverInvalidatedContext(error)) return;
      status.dataset.kind = "error";
      status.textContent = error.message;
    }
  }

  async function remove(provider) {
    if (!confirm(`Remover a chave ${providerLabel[provider]} desta licença?`)) return;
    try {
      await request(`?provider=${provider}`, { method: "DELETE" });
      await refresh();
      await globalThis.superLovableGithubAgentRefresh?.();
    } catch (error) {
      if (!recoverInvalidatedContext(error)) throw error;
    }
  }

  function providerForm(provider, title, description, placeholder) {
    return `<form id="sl-ai-${provider}-form" class="sl-setup-block">
      <div class="sl-setup-heading">
        <div><strong>${title}</strong><small>${description}</small></div>
        <a href="${providerLinks[provider]}" target="_blank" rel="noopener noreferrer">Criar chave ↗</a>
      </div>
      <p id="sl-ai-${provider}-status" class="sl-setup-status" data-kind="info">Verificando…</p>
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
      #sl-github-agent.sl-customer-execution-panel { margin: 10px 0 12px; }
      #sl-github-agent.sl-customer-execution-panel[hidden] { display: none !important; }
      #sl-project-connection { display: flex; flex-direction: column; gap: 8px; }
      #sl-project-status { margin: 0; font-size: 11px; line-height: 1.4; color: var(--ql-text-secondary); }
      #sl-project-status[data-kind="success"] { color: var(--ql-success); }
      #sl-project-status[data-kind="warning"] { color: var(--ql-warning); }
      #sl-project-controls > .sl-agent-actions { margin-top: 0; }
      #sl-project-controls #sl-agent-project-row { margin-top: 8px; }
    `;
    document.head.appendChild(style);
  }

  function ensureProjectScaffold() {
    const target = document.getElementById("sl-project-connection");
    if (!target) return null;
    let status = document.getElementById("sl-project-status");
    if (!status) {
      status = document.createElement("p");
      status.id = "sl-project-status";
      target.appendChild(status);
    }
    let controls = document.getElementById("sl-project-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.id = "sl-project-controls";
      target.appendChild(controls);
    }
    return controls;
  }

  function executionIsVisible() {
    const progress = document.getElementById("sl-agent-progress");
    return Boolean(progress && !progress.hidden && String(progress.textContent || "").trim());
  }

  function syncAgentLayout() {
    const agent = document.getElementById("sl-github-agent");
    if (!agent) return;

    const composer = document.querySelector(".sp-compose-card");
    if (composer?.parentElement && (agent.parentElement !== composer.parentElement || agent.nextElementSibling !== composer)) {
      composer.parentElement.insertBefore(agent, composer);
    }
    agent.classList.add("sl-customer-execution-panel");

    const title = agent.querySelector(".sl-agent-title");
    if (title?.firstChild?.nodeType === Node.TEXT_NODE) title.firstChild.textContent = "Execução atual ";

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

    agent.hidden = !executionIsVisible();
    renderProjectStatus();
  }

  function markExecutionActivity(mutations) {
    const relevant = mutations.some((mutation) => {
      const element = mutation.target?.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
      return Boolean(element?.closest?.("#sl-agent-status, #sl-agent-progress"));
    });
    if (relevant) lastExecutionActivityAt = Date.now();
  }

  async function watchdog() {
    if (recoveryScheduled || Date.now() - lastExecutionActivityAt < 180_000) return;
    try {
      const stored = await safeStorageGet([BATCH_TASK_KEY]);
      const task = stored[BATCH_TASK_KEY];
      if (!task || task.status !== "running") return;
      const guard = `${task.rootTaskId || "task"}:${task.nextIndex || 0}`;
      const previousGuard = (() => { try { return localStorage.getItem(WATCHDOG_RECOVERY_KEY) || ""; } catch { return ""; } })();
      if (previousGuard === guard && Date.now() - localNumber(`${WATCHDOG_RECOVERY_KEY}:time`) < 180_000) return;
      try {
        localStorage.setItem(WATCHDOG_RECOVERY_KEY, guard);
        setLocalNumber(`${WATCHDOG_RECOVERY_KEY}:time`, Date.now());
      } catch {}
      reloadForRecovery(
        "A execução ficou sem resposta. Reabrindo a etapa automaticamente a partir do último ponto seguro…",
        `${WATCHDOG_RECOVERY_KEY}:reload`,
        120_000,
      );
    } catch (error) {
      recoverInvalidatedContext(error);
    }
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
        <p class="sl-connection-intro">Conclua as três conexões uma única vez para liberar todos os recursos.</p>
        <div id="sl-connection-checklist" class="sl-connection-checklist"></div>
        ${providerForm("groq", "Conexão principal", "Utilizada primeiro para executar suas solicitações.", "Cole aqui a chave gerada")}
        ${providerForm("gemini", "Conexão de contingência", "Assume automaticamente quando necessário.", "Cole aqui a chave gerada")}
        <div id="sl-project-connection" class="sl-project-connection"></div>
      </div>`;
    host.appendChild(details);

    details.addEventListener("toggle", () => {
      if (suppressPanelToggle) return;
      void persistPanelPreference(details.open);
    });
    ["groq", "gemini"].forEach((provider) => {
      document.getElementById(`sl-ai-${provider}-form`)?.addEventListener("submit", (event) => save(event, provider));
      document.getElementById(`sl-ai-${provider}-remove`)?.addEventListener("click", () => remove(provider));
    });

    globalThis.superLovableOpenConnectionStatus = () => {
      setPanelOpen(details, true);
      void persistPanelPreference(true);
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    ensureProjectScaffold();
    renderOverallStatus();
    void loadPanelPreference();
    refresh().then(() => globalThis.superLovableGithubAgentRefresh?.()).catch((error) => recoverInvalidatedContext(error));
    syncAgentLayout();
  }

  document.addEventListener("superlovable:github-status", (event) => {
    const detail = event.detail || {};
    connectionState.github = Boolean(detail.github);
    connectionState.project = Boolean(detail.project);
    renderOverallStatus();
    syncAgentLayout();
  });

  window.addEventListener("error", (event) => recoverInvalidatedContext(event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => recoverInvalidatedContext(event.reason));

  const observer = new MutationObserver((mutations) => {
    markExecutionActivity(mutations);
    mount();
    syncAgentLayout();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

  setInterval(() => void watchdog(), 30_000);
  setTimeout(() => {
    try { localStorage.removeItem(CONTEXT_RECOVERY_KEY); } catch {}
  }, 12_000);

  mount();
  syncAgentLayout();
})();
