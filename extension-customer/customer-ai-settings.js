(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
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

  const request = async (path = "", options = {}) => {
    const session = await new Promise((resolve) => chrome.storage.local.get(["ql_session_id"], resolve));
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

  function renderOverallStatus() {
    const summary = document.getElementById("sl-connection-summary");
    const details = document.getElementById("sl-connection-status");
    const list = document.getElementById("sl-connection-checklist");
    if (!summary || !details) return;

    const complete = connectionState.groq && connectionState.gemini && connectionState.github && connectionState.project;
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
    if (!complete && !details.dataset.userToggled) details.open = true;
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
      status.dataset.kind = "error";
      status.textContent = error.message;
    }
  }

  async function remove(provider) {
    if (!confirm(`Remover a chave ${providerLabel[provider]} desta licença?`)) return;
    await request(`?provider=${provider}`, { method: "DELETE" });
    await refresh();
    await globalThis.superLovableGithubAgentRefresh?.();
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

  function adoptAgentPanel() {
    const agent = document.getElementById("sl-github-agent");
    const target = document.getElementById("sl-project-connection");
    if (agent && target && agent.parentElement !== target) target.appendChild(agent);
  }

  function mount() {
    const host = document.getElementById("sl-connection-status-host");
    if (!host || document.getElementById("sl-connection-status")) return;

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
      details.dataset.userToggled = "true";
    });
    ["groq", "gemini"].forEach((provider) => {
      document.getElementById(`sl-ai-${provider}-form`)?.addEventListener("submit", (event) => save(event, provider));
      document.getElementById(`sl-ai-${provider}-remove`)?.addEventListener("click", () => remove(provider));
    });

    globalThis.superLovableOpenConnectionStatus = () => {
      details.open = true;
      details.dataset.userToggled = "true";
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    adoptAgentPanel();
    renderOverallStatus();
    refresh().then(() => globalThis.superLovableGithubAgentRefresh?.());
  }

  document.addEventListener("superlovable:github-status", (event) => {
    const detail = event.detail || {};
    connectionState.github = Boolean(detail.github);
    connectionState.project = Boolean(detail.project);
    renderOverallStatus();
    adoptAgentPanel();
  });

  new MutationObserver(() => {
    mount();
    adoptAgentPanel();
  }).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();