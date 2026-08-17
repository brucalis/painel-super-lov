// Super Lovable GitHub Agent — fluxo simples: conectar uma vez, escrever e enviar.
(() => {
  if (globalThis.__superlovableGithubAgentLoaded) return;
  globalThis.__superlovableGithubAgentLoaded = true;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  let state = { ready: false, busy: false, pendingRunId: null };

  const storage = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const auth = async () => {
    const data = await storage(["ql_session_id"]);
    if (!data.ql_session_id) throw new Error("Valide sua chave de ativação novamente.");
    return { Authorization: `Bearer ${data.ql_session_id}`, "Content-Type": "application/json" };
  };
  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { ...(await auth()), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Servidor respondeu ${response.status}.`);
    return data;
  };
  const setStatus = (message, kind = "info") => {
    const el = document.getElementById("sl-agent-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
  };

  async function refresh() {
    try {
      const data = await request("/status");
      const connection = data.connection || {};
      const configured = data.configured && (data.ai?.gemini || data.ai?.groq);
      const connect = document.getElementById("sl-agent-connect");
      const picker = document.getElementById("sl-agent-project-row");
      state.ready = configured && connection.status === "ready" && Boolean(connection.repository_full_name);
      if (!configured) {
        setStatus("Servidor em configuração. Cadastre as chaves de IA e da GitHub App no painel.", "warning");
        if (connect) connect.style.display = "none";
        return;
      }
      if (!connection.installation_id) {
        setStatus("Conecte seu GitHub uma única vez para escolher o projeto.", "warning");
        if (connect) connect.style.display = "inline-flex";
        if (picker) picker.style.display = "none";
        return;
      }
      if (connect) connect.style.display = "none";
      if (connection.repository_full_name) {
        setStatus(`Projeto conectado: ${connection.repository_full_name} (${connection.branch || "main"})`, "success");
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
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadRepositories() {
    const select = document.getElementById("sl-agent-repository");
    if (!select) return;
    const data = await request("/github/repositories");
    select.innerHTML = '<option value="">Escolha o projeto…</option>' + data.repositories.map((repo) => `<option value="${repo.full_name}">${repo.full_name}</option>`).join("");
  }

  async function bind() {
    try {
      const select = document.getElementById("sl-agent-repository");
      if (!select?.value) throw new Error("Escolha um repositório.");
      setStatus("Salvando projeto…");
      await request("/github/repositories", { method: "POST", body: JSON.stringify({ repository: select.value }) });
      await refresh();
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function execute(prompt) {
    if (state.busy) return;
    if (!state.ready) { setStatus("Conecte e selecione o projeto antes de enviar.", "error"); return; }
    state.busy = true;
    setStatus("Analisando o projeto e preparando a alteração…");
    try {
      const plan = await request("/plan", { method: "POST", body: JSON.stringify({ prompt }) });
      state.pendingRunId = plan.runId;
      const files = (plan.files || []).join(", ");
      const approved = window.confirm(`${plan.summary}\n\nArquivos: ${files}\n\nConfirmar envio para o GitHub?`);
      if (!approved) { setStatus("Alteração cancelada. Nenhum commit foi enviado.", "warning"); return; }
      setStatus("Enviando a alteração para o GitHub…");
      const result = await request("/commit", { method: "POST", body: JSON.stringify({ run_id: plan.runId }) });
      setStatus(`Concluído. Commit ${String(result.commitSha || "").slice(0, 7)} enviado. Aguarde o preview da Lovable atualizar.`, "success");
      const textarea = document.getElementById("sp-msg");
      if (textarea) textarea.value = "";
    } catch (error) {
      setStatus(error.message || "Não foi possível concluir a alteração.", "error");
    } finally { state.busy = false; }
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
        <select id="sl-agent-repository"><option value="">Escolha o projeto…</option></select>
        <button type="button" id="sl-agent-bind">Usar projeto</button>
      </div>`;
    const card = composer.closest(".sp-compose-card");
    card?.parentElement?.insertBefore(panel, card);
    document.getElementById("sl-agent-connect")?.addEventListener("click", connect);
    document.getElementById("sl-agent-refresh")?.addEventListener("click", refresh);
    document.getElementById("sl-agent-bind")?.addEventListener("click", bind);
    refresh();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("#sp-send");
    if (!button || !document.getElementById("sl-github-agent")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const prompt = String(document.getElementById("sp-msg")?.value || "").trim();
    if (!prompt) { setStatus("Digite o que deseja alterar no projeto.", "error"); return; }
    execute(prompt);
  }, true);

  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();

