// Super Lovable GitHub Agent — fluxo simples: conectar uma vez, escrever e enviar.
(() => {
  if (globalThis.__superlovableGithubAgentLoaded) return;
  globalThis.__superlovableGithubAgentLoaded = true;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  let state = {
    ready: false,
    busy: false,
    pendingRunId: null,
    repositories: [],
    progressTimer: null,
    lastPrompt: "",
  };

  const storage = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const auth = async () => {
    const data = await storage(["ql_session_id"]);
    if (!data.ql_session_id) throw new Error("Valide sua chave de ativação novamente.");
    return { Authorization: `Bearer ${data.ql_session_id}`, "Content-Type": "application/json" };
  };
  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...(await auth()), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `Servidor respondeu ${response.status}.`);
      error.code = data.code || `HTTP_${response.status}`;
      error.retryable = Boolean(data.retryable);
      throw error;
    }
    return data;
  };
  const setStatus = (message, kind = "info") => {
    const el = document.getElementById("sl-agent-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
  };
  const progressSteps = [
    ["context", "Lendo estrutura e arquivos do projeto"],
    ["ai", "Analisando o pedido com a inteligência artificial"],
    ["plan", "Preparando o plano e os arquivos"],
    ["confirm", "Aguardando sua confirmação"],
    ["commit", "Enviando alterações para o GitHub"],
    ["done", "Alteração concluída"],
  ];
  const renderProgress = (active, detail = "") => {
    const box = document.getElementById("sl-agent-progress");
    if (!box) return;
    if (!active) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const activeIndex = progressSteps.findIndex(([id]) => id === active);
    box.hidden = false;
    box.innerHTML =
      `<div class="sl-agent-progress-title">Acompanhamento da alteração</div>` +
      progressSteps
        .map(([id, label], index) => {
          const status =
            index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
          const icon =
            status === "done"
              ? "✓"
              : status === "active"
                ? '<span class="sl-agent-spinner"></span>'
                : "·";
          return `<div class="sl-agent-step" data-status="${status}"><span>${icon}</span><span>${label}${index === activeIndex && detail ? `<small>${detail}</small>` : ""}</span></div>`;
        })
        .join("");
  };
  const startPlanningProgress = () => {
    clearInterval(state.progressTimer);
    const stages = [
      ["context", "Conectando ao repositório…"],
      ["ai", "Gemini em uso; Groq assume automaticamente se necessário…"],
      ["plan", "Organizando as alterações propostas…"],
    ];
    let index = 0;
    renderProgress(...stages[index]);
    state.progressTimer = setInterval(() => {
      if (index < stages.length - 1) renderProgress(...stages[++index]);
    }, 3500);
  };
  const stopProgressTimer = () => {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  };

  async function refresh() {
    try {
      const data = await request("/status");
      const connection = data.connection || {};
      const configured = data.configured && (data.ai?.gemini || data.ai?.groq);
      const connect = document.getElementById("sl-agent-connect");
      const picker = document.getElementById("sl-agent-project-row");
      state.ready =
        configured && connection.status === "ready" && Boolean(connection.repository_full_name);
      if (!configured) {
        setStatus(
          "Servidor em configuração. Cadastre as chaves de IA e da GitHub App no painel.",
          "warning",
        );
        if (connect) connect.style.display = "none";
        return;
      }
      if (!connection.installation_id) {
        setStatus(
          connection.status === "pending_installation"
            ? "Instale a GitHub App e depois clique novamente em Conectar GitHub."
            : "Conecte seu GitHub uma única vez para escolher o projeto.",
          "warning",
        );
        if (connect) connect.style.display = "inline-flex";
        if (picker) picker.style.display = "none";
        return;
      }
      if (connect) connect.style.display = "none";
      if (connection.repository_full_name) {
        setStatus(
          `Projeto conectado: ${connection.repository_full_name} (${connection.branch || "main"})`,
          "success",
        );
        if (picker) picker.style.display = "none";
        return;
      }
      setStatus("GitHub conectado. Selecione seu projeto abaixo.");
      if (picker) picker.style.display = "flex";
      await loadRepositories();
    } catch (error) {
      setStatus(error.message || "Não foi possível consultar o agente.", "error");
    }
  }

  async function connect() {
    try {
      setStatus("Abrindo autorização segura do GitHub…");
      const data = await request("/github/connect", { method: "POST", body: "{}" });
      await chrome.tabs.create({ url: data.authorize_url });
      setStatus("Conclua a autorização na nova aba e depois clique em Atualizar.", "warning");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function loadRepositories() {
    const select = document.getElementById("sl-agent-repository");
    if (!select) return;
    const data = await request("/github/repositories");
    state.repositories = data.repositories || [];
    filterRepositories("");
  }

  function filterRepositories(term) {
    const select = document.getElementById("sl-agent-repository");
    if (!select) return;
    const current = select.value;
    const query = String(term || "")
      .trim()
      .toLocaleLowerCase("pt-BR");
    const filtered = state.repositories.filter((repo) =>
      String(repo.full_name || "")
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
    select.innerHTML =
      `<option value="">${filtered.length ? `Escolha entre ${filtered.length} projeto(s)…` : "Nenhum projeto encontrado"}</option>` +
      filtered
        .map((repo) => `<option value="${repo.full_name}">${repo.full_name}</option>`)
        .join("");
    if (filtered.some((repo) => repo.full_name === current)) select.value = current;
    const count = document.getElementById("sl-agent-search-count");
    if (count)
      count.textContent = query
        ? `${filtered.length} resultado(s)`
        : `${state.repositories.length} projeto(s) disponível(is)`;
  }

  async function bind() {
    try {
      const select = document.getElementById("sl-agent-repository");
      if (!select?.value) throw new Error("Escolha um repositório.");
      setStatus("Salvando projeto…");
      await request("/github/repositories", {
        method: "POST",
        body: JSON.stringify({ repository: select.value }),
      });
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  const renderFailure = (error) => {
    renderProgress("error", "Falha no processamento");
    const box = document.getElementById("sl-agent-progress");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = "";
    const failure = document.createElement("div");
    failure.className = "sl-agent-progress-error";
    const message = document.createElement("p");
    message.textContent = `Falha no processamento: ${String(error.message || error)}`;
    failure.appendChild(message);
    const actions = document.createElement("div");
    actions.className = "sl-agent-error-actions";
    if (error.retryable) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Tentar novamente com contexto reduzido";
      retry.addEventListener("click", () => execute(state.lastPrompt, true));
      actions.appendChild(retry);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar tarefa";
    cancel.addEventListener("click", () => {
      renderProgress(false);
      setStatus("Tarefa cancelada. Você já pode enviar o próximo comando.", "warning");
    });
    actions.appendChild(cancel);
    failure.appendChild(actions);
    box.appendChild(failure);
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function execute(prompt, reducedContext = false, automaticAttempt = 0) {
    if (state.busy) return;
    if (!state.ready) {
      setStatus("Conecte e selecione o projeto antes de enviar.", "error");
      return;
    }
    state.busy = true;
    state.lastPrompt = prompt;
    setStatus(
      reducedContext
        ? "Tentando novamente com menos informações do projeto…"
        : "Analisando o projeto e preparando a alteração…",
    );
    startPlanningProgress();
    try {
      const plan = await request("/plan", {
        method: "POST",
        body: JSON.stringify({ prompt, reduced_context: reducedContext }),
      });
      stopProgressTimer();
      state.pendingRunId = plan.runId;
      const files = (plan.files || []).join(", ");
      renderProgress(
        "confirm",
        `${plan.provider === "groq" ? "Groq" : "Gemini"} preparou ${plan.files?.length || 0} arquivo(s): ${files}`,
      );
      setStatus("Enviando a alteração para o GitHub…");
      renderProgress("commit", `${plan.files?.length || 0} arquivo(s) aprovado(s).`);
      const result = await request("/commit", {
        method: "POST",
        body: JSON.stringify({ run_id: plan.runId }),
      });
      setStatus(
        `Concluído. Commit ${String(result.commitSha || "").slice(0, 7)} enviado. Aguarde o preview da Lovable atualizar.`,
        "success",
      );
      renderProgress(
        "done",
        `Commit ${String(result.commitSha || "").slice(0, 7)} publicado em ${result.repository || "GitHub"}.`,
      );
      const textarea = document.getElementById("sp-msg");
      if (textarea) textarea.value = "";
    } catch (error) {
      stopProgressTimer();
      if (error.retryable && automaticAttempt < 2) {
        const nextReduced = reducedContext || automaticAttempt >= 0;
        const delay = 900 + Math.floor(Math.random() * 900);
        setStatus("Ajustando o contexto e tentando novamente automaticamente…", "warning");
        renderProgress("context", "Nova leitura automática do projeto…");
        state.busy = false;
        await wait(delay);
        return execute(state.lastPrompt, nextReduced, automaticAttempt + 1);
      }
      setStatus(error.message || "Não foi possível concluir a alteração.", "error");
      renderFailure(error);
    } finally {
      state.busy = false;
    }
  }

  function mount() {
    if (document.getElementById("sl-github-agent")) return;
    const composer = document.getElementById("sp-msg");
    if (!composer) return;
    document.getElementById("sl-visual-tools")?.remove();
    const panel = document.createElement("section");
    panel.id = "sl-github-agent";
    panel.innerHTML = `
      <div class="sl-agent-title"><span>Agente Super Lovable</span><span>GITHUB SYNC</span></div>
      <p id="sl-agent-status" data-kind="info">Verificando conexão…</p>
      <div class="sl-agent-actions">
        <button type="button" id="sl-agent-connect">Conectar GitHub</button>
        <button type="button" id="sl-agent-refresh">Atualizar</button>
      </div>
      <div id="sl-agent-project-row" class="sl-agent-project" style="display:none">
        <input id="sl-agent-repository-search" type="search" placeholder="Pesquisar por nome, ex.: connect" autocomplete="off">
        <small id="sl-agent-search-count"></small>
        <div class="sl-agent-project-select">
        <select id="sl-agent-repository"><option value="">Escolha o projeto…</option></select>
        <button type="button" id="sl-agent-bind">Usar projeto</button>
        </div>
      </div>
      <div id="sl-agent-progress" hidden></div>`;
    const card = composer.closest(".sp-compose-card");
    card?.parentElement?.insertBefore(panel, card);
    document.getElementById("sl-agent-connect")?.addEventListener("click", connect);
    document.getElementById("sl-agent-refresh")?.addEventListener("click", refresh);
    document.getElementById("sl-agent-bind")?.addEventListener("click", bind);
    document
      .getElementById("sl-agent-repository-search")
      ?.addEventListener("input", (event) => filterRepositories(event.target.value));
    refresh();
  }

  globalThis.superLovableGithubAgentExecute = (prompt) => {
    if (!document.getElementById("sl-github-agent")) return false;
    execute(String(prompt || "").trim());
    return true;
  };

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("#sp-send");
      if (!button || !document.getElementById("sl-github-agent")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const prompt = String(document.getElementById("sp-msg")?.value || "").trim();
      if (!prompt) {
        setStatus("Digite o que deseja alterar no projeto.", "error");
        return;
      }
      execute(prompt);
    },
    true,
  );

  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
