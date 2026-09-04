// Super Lovable GitHub Agent — fluxo direto na main com orquestração de prompts complexos.
(() => {
  if (globalThis.__superlovableGithubAgentLoaded) return;
  globalThis.__superlovableGithubAgentLoaded = true;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const CUSTOMER_EDITION = globalThis.SUPER_LOVABLE_EDITION?.mode === "customer";
  const BATCH_TASK_KEY = "sl_agent_batch_task_v1";
  const MAX_AUTOMATIC_ATTEMPTS = 4;
  const MAX_BATCH_REPARTITIONS = 2;
  const REQUEST_TIMEOUT_MS = 90_000;
  const STATUS_TIMEOUT_MS = 20_000;
  const BATCH_DEADLINE_MS = 8 * 60_000;
  const TASK_DEADLINE_MS = 25 * 60_000;
  const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "cancelled"]);
  const RETRY_DELAYS_MS = [700, 1_500, 3_500, 7_000];
  const RATE_LIMIT_DELAYS_MS = [5_000, 12_000, 25_000, 45_000];
  const TERMINAL_ERROR_CODES = new Set(["INVALID_SESSION", "LICENSE_INACTIVE", "GITHUB_NOT_CONNECTED", "GITHUB_REPOSITORY_NOT_ALLOWED", "GITHUB_PERMISSION_DENIED", "INVALID_GITHUB_TOKEN", "HTTP_401", "HTTP_403"]);
  const CONTEXT_ERROR_CODES = new Set(["AI_CONTEXT_TOO_LARGE", "AI_PLAN_TRUNCATED", "AI_TRUNCATED_CONTENT_BLOCKED", "CONTEXT_ROUNDS_EXHAUSTED"]);
  const REPLAN_ERROR_CODES = new Set(["AI_EDIT_NOT_UNIQUE", "AI_INVALID_EDIT_PATH", "AI_CHANGE_TOO_BROAD", "BASE_BRANCH_MOVED", "STALE_BASE_SHA", "GITHUB_CONFLICT", "HTTP_409", ...CONTEXT_ERROR_CODES]);

  let state = {
    ready: false,
    busy: false,
    pendingRunId: null,
    repositories: [],
    progressTimer: null,
    lastPrompt: "",
    lastAppliedRunId: null,
  };

  const storage = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (values) => new Promise((resolve) => chrome.storage.local.set(values, resolve));
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

  const auth = async () => {
    const data = await storage(["ql_session_id"]);
    if (!data.ql_session_id) throw new Error("Valide sua chave de ativação novamente.");
    return {
      Authorization: `Bearer ${data.ql_session_id}`,
      "Content-Type": "application/json",
      ...(CUSTOMER_EDITION ? { "X-Super-Lovable-Edition": "customer-s1" } : {}),
    };
  };

  const request = async (path, options = {}) => {
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || (path === "/status" ? STATUS_TIMEOUT_MS : REQUEST_TIMEOUT_MS));
    const timeout = setTimeout(() => controller.abort("REQUEST_TIMEOUT"), timeoutMs);
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        signal: controller.signal,
        headers: { ...(await auth()), ...(options.headers || {}) },
      });
    } catch (cause) {
      const timedOut = controller.signal.aborted;
      const error = new Error(timedOut
        ? "A etapa demorou além do limite e será recuperada automaticamente."
        : "A conexão com o servidor foi interrompida.");
      error.code = timedOut ? "REQUEST_TIMEOUT" : "NETWORK_ERROR";
      error.status = timedOut ? 408 : 0;
      error.retryable = true;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `Servidor respondeu ${response.status}.`);
      error.code = data.code || `HTTP_${response.status}`;
      error.status = response.status;
      error.retryAfter = Number(response.headers.get("retry-after") || 0);
      error.retryable = Boolean(data.retryable) || [408, 409, 425, 429].includes(response.status) || response.status >= 500;
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

  const broadcastConnectionStatus = (detail) => {
    if (!CUSTOMER_EDITION) return;
    document.dispatchEvent(new CustomEvent("superlovable:github-status", { detail }));
  };

  const progressSteps = [
    ["context", "Lendo estrutura e arquivos do projeto"],
    ["ai", "Analisando o pedido com a inteligência artificial"],
    ["plan", "Preparando os arquivos da alteração"],
    ["commit", "Aplicando alteração diretamente na main"],
    ["done", "Alteração concluída"],
  ];

  const renderProgress = (active, detail = "", batchLabel = "") => {
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
      `<div class="sl-agent-progress-title">Acompanhamento da alteração${batchLabel ? `<small>${batchLabel}</small>` : ""}</div>` +
      progressSteps
        .map(([id, label], index) => {
          const status = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
          const icon = status === "done" ? "✓" : status === "active" ? '<span class="sl-agent-spinner"></span>' : "·";
          return `<div class="sl-agent-step" data-status="${status}"><span>${icon}</span><span>${label}${index === activeIndex && detail ? `<small>${detail}</small>` : ""}</span></div>`;
        })
        .join("");
  };

  const startPlanningProgress = (batchLabel = "") => {
    clearInterval(state.progressTimer);
    const stages = [
      ["context", "Conectando ao repositório…"],
      ["ai", "Gemini em uso; contingências automáticas se necessário…"],
      ["plan", "Organizando um lote pequeno de alterações…"],
    ];
    let index = 0;
    renderProgress(...stages[index], batchLabel);
    state.progressTimer = setInterval(() => {
      if (index < stages.length - 1) {
        index += 1;
        renderProgress(stages[index][0], stages[index][1], batchLabel);
      }
    }, 3500);
  };

  const stopProgressTimer = () => {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  };

  async function saveBatchTask(task) {
    await storageSet({ [BATCH_TASK_KEY]: task });
  }

  async function loadBatchTask() {
    const data = await storage([BATCH_TASK_KEY]);
    return data[BATCH_TASK_KEY] || null;
  }

  async function clearBatchTask() {
    await storageRemove([BATCH_TASK_KEY]);
  }

  async function refresh() {
    try {
      const data = await request("/status");
      const connection = data.connection || {};
      const groqReady = Boolean(data.ai?.groq?.configured);
      const geminiReady = Boolean(data.ai?.gemini?.configured);
      const configured = data.configured && (CUSTOMER_EDITION ? (groqReady && geminiReady) : (data.ai?.gemini || data.ai?.groq));
      const connect = document.getElementById("sl-agent-connect");
      const disconnect = document.getElementById("sl-agent-disconnect");
      const switchProject = document.getElementById("sl-agent-switch-project");
      const picker = document.getElementById("sl-agent-project-row");
      state.ready = configured && connection.status === "ready" && Boolean(connection.repository_full_name);
      broadcastConnectionStatus({
        ready: state.ready,
        groq: groqReady,
        gemini: geminiReady,
        github: Boolean(connection.installation_id),
        project: Boolean(connection.repository_full_name),
        repository: connection.repository_full_name || "",
      });

      if (!configured) {
        setStatus(CUSTOMER_EDITION ? "Conecte as duas inteligências acima para liberar o chat." : "Servidor em configuração. Cadastre as chaves de IA e da GitHub App no painel.", "warning");
        if (connect) connect.style.display = "none";
        if (disconnect) disconnect.style.display = "none";
        if (switchProject) switchProject.style.display = "none";
        if (picker) picker.style.display = "none";
        return;
      }
      if (!connection.installation_id) {
        setStatus(
          connection.status === "pending_installation"
            ? "Finalize a autorização e depois clique em Atualizar."
            : "Conecte sua conta para escolher o projeto.",
          "warning",
        );
        if (connect) connect.style.display = "inline-flex";
        if (disconnect) disconnect.style.display = "none";
        if (switchProject) switchProject.style.display = "none";
        if (picker) picker.style.display = "none";
        return;
      }
      if (connect) connect.style.display = "none";
      if (disconnect) disconnect.style.display = "inline-flex";
      if (connection.repository_full_name) {
        setStatus(`Projeto conectado: ${connection.repository_full_name} (main)`, "success");
        if (picker) picker.style.display = "none";
        if (switchProject) switchProject.style.display = "inline-flex";
        await restorePendingBatchUi();
        return;
      }
      setStatus("Conta conectada. Selecione seu projeto abaixo.");
      if (switchProject) switchProject.style.display = "none";
      if (picker) picker.style.display = "flex";
      await loadRepositories();
    } catch (error) {
      state.ready = false;
      broadcastConnectionStatus({ ready: false, error: true });
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

  async function disconnectGithub() {
    if (!confirm("Desconectar esta conta do GitHub? O projeto selecionado será removido, mas sua licença e as demais conexões serão mantidas.")) return;
    const button = document.getElementById("sl-agent-disconnect");
    try {
      if (button) button.disabled = true;
      setStatus("Desconectando conta do GitHub…", "warning");
      await request("/github/disconnect", { method: "POST", body: "{}" });
      state.ready = false;
      state.repositories = [];
      await clearBatchTask();
      const box = document.getElementById("sl-agent-progress");
      if (box) {
        box.hidden = true;
        box.innerHTML = "";
      }
      await refresh();
      setStatus("Conta desconectada. Conecte outra conta do GitHub para continuar.", "warning");
    } catch (error) {
      setStatus(error.message || "Não foi possível desconectar a conta.", "error");
    } finally {
      if (button) button.disabled = false;
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
    const query = String(term || "").trim().toLocaleLowerCase("pt-BR");
    const filtered = state.repositories.filter((repo) =>
      String(repo.full_name || "").toLocaleLowerCase("pt-BR").includes(query),
    );
    select.innerHTML =
      `<option value="">${filtered.length ? `Escolha entre ${filtered.length} projeto(s)…` : "Nenhum projeto encontrado"}</option>` +
      filtered.map((repo) => `<option value="${repo.full_name}">${repo.full_name}</option>`).join("");
    if (filtered.some((repo) => repo.full_name === current)) select.value = current;
    const count = document.getElementById("sl-agent-search-count");
    if (count) count.textContent = query ? `${filtered.length} resultado(s)` : `${state.repositories.length} projeto(s) disponível(is)`;
  }

  async function chooseAnotherRepository() {
    try {
      const picker = document.getElementById("sl-agent-project-row");
      const switchProject = document.getElementById("sl-agent-switch-project");
      if (switchProject) switchProject.style.display = "none";
      if (picker) picker.style.display = "flex";
      setStatus("Escolha outro repositório. Suas demais conexões serão mantidas.", "warning");
      await loadRepositories();
      document.getElementById("sl-agent-repository-search")?.focus();
    } catch (error) {
      setStatus(error.message || "Não foi possível listar os repositórios.", "error");
    }
  }

  async function bind() {
    try {
      const select = document.getElementById("sl-agent-repository");
      if (!select?.value) throw new Error("Escolha um repositório.");
      setStatus("Salvando projeto na branch main…");
      await request("/github/repositories", {
        method: "POST",
        body: JSON.stringify({ repository: select.value }),
      });
      await refresh();
      globalThis.superLovableCloseConnectionStatus?.();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function deadlineError(scope) {
    const error = new Error(scope === "task"
      ? "A tarefa atingiu o limite seguro de processamento. As etapas concluídas foram preservadas."
      : "A etapa não avançou dentro do limite seguro e foi interrompida.");
    error.code = scope === "task" ? "TASK_DEADLINE_EXCEEDED" : "BATCH_DEADLINE_EXCEEDED";
    error.retryable = false;
    return error;
  }

  function assertDeadline(deadline, scope) {
    if (Number.isFinite(deadline) && Date.now() >= deadline) throw deadlineError(scope);
  }

  function renderRollbackAction(runId) {
    const box = document.getElementById("sl-agent-progress");
    if (!box || !runId) return;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "sl-agent-rollback";
    action.textContent = "Desfazer esta alteração";
    action.addEventListener("click", () => rollback(runId, action));
    box.appendChild(action);
  }

  function renderExecutionResult(result) {
    const box = document.getElementById("sl-agent-progress");
    if (!box) return;
    const reasons = Array.isArray(result.validationReasons) ? result.validationReasons.filter(Boolean) : [];
    box.hidden = false;
    box.innerHTML = "";
    const card = document.createElement("div");
    card.className = "sl-agent-result is-success";

    const title = document.createElement("strong");
    title.textContent = "Alteração aplicada com sucesso";
    card.appendChild(title);

    const summary = document.createElement("p");
    summary.textContent = "Os arquivos foram gravados diretamente na main. Nenhum Pull Request foi criado.";
    card.appendChild(summary);

    const details = document.createElement("div");
    details.className = "sl-agent-result-details";
    const commit = document.createElement("span");
    commit.textContent = `Commit: ${String(result.commitSha || "").slice(0, 7) || "concluído"}`;
    const risk = document.createElement("span");
    risk.textContent = `Risco estático: ${String(result.riskLevel || "baixo")}`;
    details.append(commit, risk);
    card.appendChild(details);

    if (reasons.length) {
      const reason = document.createElement("small");
      reason.textContent = reasons.join(" ");
      card.appendChild(reason);
    }
    box.appendChild(card);
  }

  function renderBatchExecutionResult(task) {
    const box = document.getElementById("sl-agent-progress");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = "";
    const card = document.createElement("div");
    card.className = "sl-agent-result is-success";

    const title = document.createElement("strong");
    title.textContent = "Tarefa complexa concluída";
    card.appendChild(title);

    const summary = document.createElement("p");
    summary.textContent = `${task.completed.length} etapas foram executadas em sequência e gravadas diretamente na main.`;
    card.appendChild(summary);

    const details = document.createElement("div");
    details.className = "sl-agent-result-details";
    const batches = document.createElement("span");
    batches.textContent = `Etapas: ${task.completed.length}/${task.batches.length}`;
    const commits = document.createElement("span");
    commits.textContent = `Commits: ${task.completed.filter((item) => item.commitSha).length}`;
    details.append(batches, commits);
    card.appendChild(details);

    const list = document.createElement("small");
    list.textContent = task.completed
      .map((item, index) => `${index + 1}. ${item.title} (${String(item.commitSha || "").slice(0, 7)})`)
      .join(" • ");
    card.appendChild(list);
    box.appendChild(card);
  }

  function renderFailure(error, task = null) {
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

    const exhausted = document.createElement("small");
    exhausted.textContent = "A tarefa foi preservada no último ponto seguro. Nenhuma confirmação é necessária durante as recuperações automáticas.";
    actions.appendChild(exhausted);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar tarefa";
    cancel.addEventListener("click", async () => {
      await clearBatchTask();
      renderProgress(false);
      setStatus("Tarefa cancelada. Você já pode enviar o próximo comando.", "warning");
    });
    actions.appendChild(cancel);
    failure.appendChild(actions);
    box.appendChild(failure);
  }

  async function rollback(runId, button) {
    if (state.busy) return;
    state.busy = true;
    if (button) button.disabled = true;
    setStatus("Desfazendo a alteração diretamente na main…");
    try {
      const result = await request("/rollback", {
        method: "POST",
        body: JSON.stringify({ run_id: runId }),
      });
      setStatus("Alteração desfeita. Aguarde o preview atualizar.", "success");
      renderProgress("done", `Reversão ${String(result.commitSha || "").slice(0, 7)} aplicada na main.`);
    } catch (error) {
      setStatus(error.message || "Não foi possível desfazer a alteração.", "error");
      if (button) button.disabled = false;
    } finally {
      state.busy = false;
    }
  }

  function recoveryKind(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || error || "");
    if (TERMINAL_ERROR_CODES.has(code)) return "terminal";
    if (CONTEXT_ERROR_CODES.has(code) || /context|token limit|truncad|json incompleto/i.test(message)) return "context";
    if (REPLAN_ERROR_CODES.has(code) || /branch.*mudou|conflito|trecho.*único/i.test(message)) return "replan";
    if (error?.retryable || Number(error?.status) >= 500 || /timeout|temporar|network|fetch|rate limit|429|indisponível/i.test(message)) {
      return /rate limit|429/i.test(message) || Number(error?.status) === 429 ? "rate-limit" : "transient";
    }
    return "logical";
  }

  function retryDelay(error, attempt) {
    const delays = recoveryKind(error) === "rate-limit" ? RATE_LIMIT_DELAYS_MS : RETRY_DELAYS_MS;
    const serverDelay = Math.max(0, Number(error?.retryAfter || 0) * 1_000);
    const base = Math.max(serverDelay, delays[Math.min(attempt, delays.length - 1)]);
    return base + Math.floor(Math.random() * Math.min(700, Math.max(100, base * 0.15)));
  }

  async function planAndCommit(prompt, batchLabel = "", reducedContext = false, deadline = Infinity) {
    let reduced = reducedContext;
    let lastError = null;
    let planned = null;

    for (let attempt = 0; attempt <= MAX_AUTOMATIC_ATTEMPTS; attempt += 1) {
      assertDeadline(deadline, "batch");
      try {
        if (!planned) {
          startPlanningProgress(batchLabel);
          planned = await request("/plan", {
            method: "POST",
            body: JSON.stringify({ prompt, reduced_context: reduced }),
          });
          stopProgressTimer();
          state.pendingRunId = planned.runId;
        }
        const files = (planned.files || []).join(", ");
        renderProgress("commit", `${planned.provider === "groq" ? "Groq" : "IA"} preparou ${planned.files?.length || 0} arquivo(s)${files ? `: ${files}` : ""}`, batchLabel);
        const result = await request("/commit", {
          method: "POST",
          body: JSON.stringify({ run_id: planned.runId }),
        });
        return { plan: planned, result };
      } catch (error) {
        stopProgressTimer();
        lastError = error;
        const kind = recoveryKind(error);
        if (kind === "terminal" || attempt >= MAX_AUTOMATIC_ATTEMPTS) throw error;

        if (planned && !["context", "replan"].includes(kind)) {
          setStatus(`Confirmando automaticamente a aplicação${batchLabel ? ` de ${batchLabel}` : ""}…`, "warning");
        } else {
          planned = null;
          reduced = reduced || kind === "context";
          setStatus(`Replanejando automaticamente${batchLabel ? ` ${batchLabel}` : ""} com o estado atual da main…`, "warning");
          renderProgress(kind === "context" ? "context" : "ai", kind === "context" ? "Reduzindo somente o contexto excedente…" : "Reconciliando arquivos e alterações já aplicadas…", batchLabel);
        }
        const delay = retryDelay(error, attempt);
        if (Date.now() + delay >= deadline) throw deadlineError("batch");
        await wait(delay);
      }
    }
    throw lastError || new Error("Não foi possível concluir a alteração.");
  }

  function canRepartition(error, batch) {
    return Number(batch?.depth || 0) < MAX_BATCH_REPARTITIONS && ["context", "replan", "logical"].includes(recoveryKind(error));
  }

  async function repartitionFailedBatch(task, batch, index, error) {
    if (!canRepartition(error, batch)) return false;
    setStatus(`A etapa ${index + 1} ficou grande demais. Subdividindo e continuando automaticamente…`, "warning");
    try {
      const decomposition = await request("/decompose", {
        method: "POST",
        body: JSON.stringify({ prompt: [
          batch.instruction, "", "RECUPERAÇÃO AUTOMÁTICA:",
          "Divida somente esta etapa em subtarefas menores, sequenciais e independentes.",
          "Cada subtarefa deve modificar no máximo 2 arquivos e fazer apenas uma responsabilidade.",
          "Não repita etapas já concluídas e não peça confirmação ao usuário.",
          `Falha sanitizada anterior: ${String(error?.code || "UNKNOWN")}`,
        ].join("\n") }),
      });
      if (!decomposition.batched || !Array.isArray(decomposition.batches) || decomposition.batches.length < 2) return false;
      const depth = Number(batch.depth || 0) + 1;
      const replacements = decomposition.batches.slice(0, 6).map((item, childIndex) => ({
        ...item,
        id: `${batch.id || `batch-${index + 1}`}-${depth}-${childIndex + 1}`,
        depth,
        parentId: batch.id || null,
      }));
      task.batches.splice(index, 1, ...replacements);
      task.status = "running";
      task.error = null;
      task.updatedAt = new Date().toISOString();
      await saveBatchTask(task);
      return true;
    } catch {
      return false;
    }
  }

  function buildCoordinatedBatchPrompt(task, batch, index) {
    const completed = task.completed
      .slice(-4)
      .map((item, completedIndex) => `${completedIndex + 1}. ${item.title}: ${item.summary || "concluído"}`)
      .join("\n");

    return `${batch.instruction}\n\nCOORDENAÇÃO DE EXECUÇÃO:\n- Este é o lote ${index + 1} de ${task.batches.length}.\n- Execute SOMENTE o objetivo deste lote.\n- Preserve integralmente o que já foi implementado nos lotes anteriores.\n- Não repita trabalho já concluído e não antecipe os lotes seguintes.\n- Priorize no máximo 4 arquivos modificados e no máximo 6 edições cirúrgicas neste lote.\n- Não instale dependências nem altere backend, banco, autenticação ou integrações, salvo se este lote disser explicitamente que isso faz parte do pedido.\n${completed ? `\nLOTES JÁ CONCLUÍDOS:\n${completed}` : ""}`.slice(0, 7600);
  }

  async function runBatchTask(task) {
    if (state.busy) return;
    state.busy = true;
    task.status = "running";
    task.startedAt = task.startedAt || new Date().toISOString();
    task.deadlineAt = task.deadlineAt || new Date(Date.now() + TASK_DEADLINE_MS).toISOString();
    state.lastPrompt = task.prompt;
    await saveBatchTask(task);

    try {
      const taskDeadline = new Date(task.deadlineAt).getTime();
      assertDeadline(taskDeadline, "task");
      for (let index = task.nextIndex; index < task.batches.length; index += 1) {
        assertDeadline(taskDeadline, "task");
        const batch = task.batches[index];
        batch.startedAt = batch.startedAt || new Date().toISOString();
        const batchDeadline = Math.min(taskDeadline, new Date(batch.startedAt).getTime() + BATCH_DEADLINE_MS);
        const label = `Etapa ${index + 1}/${task.batches.length}: ${batch.title}`;
        task.nextIndex = index;
        task.status = "running";
        task.error = null;
        await saveBatchTask(task);

        setStatus(`${label} — preparando alterações…`);
        const batchPrompt = buildCoordinatedBatchPrompt(task, batch, index);
        let plan;
        let result;
        try {
          ({ plan, result } = await planAndCommit(batchPrompt, label, false, batchDeadline));
        } catch (error) {
          if (await repartitionFailedBatch(task, batch, index, error)) {
            index -= 1;
            continue;
          }
          throw error;
        }

        task.completed.push({
          id: batch.id,
          title: batch.title,
          summary: plan.summary || "Etapa concluída.",
          commitSha: result.commitSha || "",
          runId: result.runId || plan.runId,
          files: plan.files || [],
        });
        task.nextIndex = index + 1;
        task.updatedAt = new Date().toISOString();
        await saveBatchTask(task);
        state.lastAppliedRunId = result.runId || plan.runId;

        setStatus(
          `${label} concluída. Commit ${String(result.commitSha || "").slice(0, 7)} aplicado. Continuando automaticamente…`,
          "success",
        );
        if (index < task.batches.length - 1) {
          renderProgress("done", "Etapa concluída; iniciando o próximo lote…", label);
          await wait(500);
        }
      }

      task.status = "completed";
      task.completedAt = new Date().toISOString();
      await saveBatchTask(task);
      setStatus(
        `Concluído. ${task.completed.length} etapas aplicadas diretamente na main. Aguarde o preview da Lovable atualizar.`,
        "success",
      );
      renderBatchExecutionResult(task);
      if (state.lastAppliedRunId) renderRollbackAction(state.lastAppliedRunId);
      const textarea = document.getElementById("sp-msg");
      if (textarea) textarea.value = "";
      await clearBatchTask();
    } catch (error) {
      stopProgressTimer();
      task.status = "failed";
      task.error = String(error.message || error);
      task.updatedAt = new Date().toISOString();
      await saveBatchTask(task);
      setStatus(
        `Não foi possível concluir a etapa ${task.nextIndex + 1}/${task.batches.length} após todas as recuperações automáticas. As etapas anteriores permanecem salvas.`,
        "error",
      );
      renderFailure(error, task);
    } finally {
      state.busy = false;
    }
  }

  async function executeSingle(prompt, reducedContext = false) {
    state.busy = true;
    state.lastPrompt = prompt;
    setStatus(reducedContext ? "Tentando novamente com menos informações do projeto…" : "Analisando o projeto e preparando a alteração…");
    try {
      const { plan, result } = await planAndCommit(prompt, "", reducedContext);
      setStatus(
        `Concluído. Commit ${String(result.commitSha || "").slice(0, 7)} aplicado na main. Aguarde o preview da Lovable atualizar.`,
        "success",
      );
      renderExecutionResult(result);
      state.lastAppliedRunId = result.runId || plan.runId;
      renderRollbackAction(state.lastAppliedRunId);
      const textarea = document.getElementById("sp-msg");
      if (textarea) textarea.value = "";
    } catch (error) {
      stopProgressTimer();
      setStatus(error.message || "Não foi possível concluir a alteração.", "error");
      renderFailure(error);
    } finally {
      state.busy = false;
    }
  }

  async function execute(prompt, reducedContext = false) {
    if (state.busy) return;
    if (!state.ready) {
      globalThis.superLovableOpenConnectionStatus?.();
      setStatus("Clique na seção Status para conectar e usar o chat.", "error");
      return;
    }

    const normalized = String(prompt || "").trim();
    if (!normalized) {
      setStatus("Digite o que deseja alterar no projeto.", "error");
      return;
    }
    state.lastPrompt = normalized;

    if (reducedContext) {
      await executeSingle(normalized, true);
      return;
    }

    state.busy = true;
    setStatus("Analisando a complexidade do pedido…");
    renderProgress("ai", "Decidindo se a tarefa deve ser dividida em etapas…");

    try {
      let decomposition = null;
      let decompositionError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          decomposition = await request("/decompose", {
            method: "POST",
            body: JSON.stringify({ prompt: normalized }),
          });
          break;
        } catch (error) {
          decompositionError = error;
          if (recoveryKind(error) === "terminal" || attempt >= 2) break;
          setStatus("Reorganizando automaticamente o pedido complexo…", "warning");
          await wait(retryDelay(error, attempt));
        }
      }
      if (!decomposition) throw decompositionError || new Error("Não foi possível organizar o pedido.");

      if (!decomposition.batched || !Array.isArray(decomposition.batches) || decomposition.batches.length < 2) {
        state.busy = false;
        await executeSingle(normalized, false);
        return;
      }

      const task = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: normalized,
        strategy: decomposition.strategy || "coordinated-batches-v1",
        provider: decomposition.provider || "orchestrator",
        complexityScore: decomposition.complexityScore || 0,
        batches: decomposition.batches,
        completed: [],
        nextIndex: 0,
        status: "ready",
        createdAt: new Date().toISOString(),
        startedAt: null,
        deadlineAt: null,
      };
      await saveBatchTask(task);
      state.busy = false;
      setStatus(`Pedido complexo identificado. Executando em ${task.batches.length} etapas coordenadas.`, "success");
      await runBatchTask(task);
    } catch (error) {
      state.busy = false;
      const looksComplex = normalized.length >= 2400 || /(?:ETAPA|FASE|PASSO)\s*\d+/i.test(normalized);
      if (!looksComplex) {
        await executeSingle(normalized, false);
        return;
      }
      setStatus("O coordenador não conseguiu dividir o pedido; executando uma recuperação compacta automaticamente…", "warning");
      await executeSingle(normalized, true);
    }
  }

  async function restorePendingBatchUi() {
    if (state.busy) return;
    const task = await loadBatchTask();
    if (!task || !Array.isArray(task.batches) || task.nextIndex >= task.batches.length) return;
    if (TERMINAL_TASK_STATUSES.has(task.status)) {
      if (task.status === "failed") {
        const error = new Error(task.error || "A tarefa anterior foi interrompida com segurança.");
        renderFailure(error, task);
        setStatus("A tarefa anterior foi encerrada sem novos ciclos automáticos. Envie novamente para iniciar uma nova execução.", "error");
      }
      return;
    }
    const persistedDeadline = task.deadlineAt ? new Date(task.deadlineAt).getTime() : Infinity;
    if (Date.now() >= persistedDeadline) {
      task.status = "failed";
      task.error = deadlineError("task").message;
      task.updatedAt = new Date().toISOString();
      await saveBatchTask(task);
      renderFailure(deadlineError("task"), task);
      setStatus("A tarefa anterior atingiu o limite seguro e não será retomada em loop.", "error");
      return;
    }
    const box = document.getElementById("sl-agent-progress");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = "";
    renderProgress("context", `Retomando automaticamente da etapa ${task.nextIndex + 1}; ${task.completed?.length || 0} já concluída(s)…`, `Etapa ${task.nextIndex + 1}/${task.batches.length}`);
    setStatus("Execução interrompida encontrada. Retomando automaticamente do último ponto seguro…", "warning");
    setTimeout(() => {
      if (!state.busy) void runBatchTask(task);
    }, 350);
  }

  function mount() {
    if (document.getElementById("sl-github-agent")) return;
    const composer = document.getElementById("sp-msg");
    if (!composer) return;
    document.getElementById("sl-visual-tools")?.remove();
    const panel = document.createElement("section");
    panel.id = "sl-github-agent";
    panel.innerHTML = `
      <div class="sl-agent-title"><span>Agente Super Lovable</span><span>MAIN DIRETA</span></div>
      <p id="sl-agent-status" data-kind="info">Verificando conexão…</p>
      <div class="sl-agent-actions">
        <button type="button" id="sl-agent-connect">Conectar GitHub</button>
        <button type="button" id="sl-agent-switch-project" style="display:none">Trocar projeto</button>
        <button type="button" id="sl-agent-disconnect" class="sl-agent-danger" style="display:none">Desconectar conta</button>
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
    document.getElementById("sl-agent-switch-project")?.addEventListener("click", chooseAnotherRepository);
    document.getElementById("sl-agent-disconnect")?.addEventListener("click", disconnectGithub);
    document.getElementById("sl-agent-bind")?.addEventListener("click", bind);
    document.getElementById("sl-agent-repository-search")?.addEventListener("input", (event) => filterRepositories(event.target.value));
    refresh();
  }

  globalThis.superLovableGithubAgentRefresh = refresh;

  globalThis.superLovableGithubAgentResumePending = async () => {
    if (state.busy || !state.ready) return false;
    const task = await loadBatchTask();
    if (!task || !Array.isArray(task.batches) || task.nextIndex >= task.batches.length) return false;
    if (TERMINAL_TASK_STATUSES.has(task.status)) return false;
    const persistedDeadline = task.deadlineAt ? new Date(task.deadlineAt).getTime() : Infinity;
    if (Date.now() >= persistedDeadline) {
      task.status = "failed";
      task.error = deadlineError("task").message;
      task.updatedAt = new Date().toISOString();
      await saveBatchTask(task);
      return false;
    }
    void runBatchTask(task);
    return true;
  };

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
