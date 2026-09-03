(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;
  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const headers = async () => {
    const session = await new Promise((resolve) => chrome.storage.local.get(["ql_session_id"], resolve));
    if (!session.ql_session_id) throw new Error("Valide sua licença novamente.");
    return {
      Authorization: `Bearer ${session.ql_session_id}`,
      "Content-Type": "application/json",
      "X-Super-Lovable-Edition": "customer-s1",
    };
  };
  const request = async (options = {}) => {
    const response = await fetch(`${API}/ai-credentials`, {
      ...options,
      headers: { ...(await headers()), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível configurar a OpenAI.");
    return data;
  };
  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);

  async function refresh() {
    const status = document.getElementById("sl-customer-ai-status");
    const form = document.getElementById("sl-customer-ai-form");
    if (!status || !form) return;
    try {
      const data = await request();
      status.dataset.kind = data.configured ? "success" : "warning";
      status.textContent = data.configured
        ? `OpenAI conectada (${data.keyHint || "chave protegida"}) · ${data.model || "modelo automático"}`
        : "Conecte sua chave da API OpenAI uma única vez.";
      form.dataset.configured = data.configured ? "true" : "false";
      document.getElementById("sl-customer-ai-remove").style.display = data.configured ? "inline-flex" : "none";
      document.getElementById("sl-customer-ai-save").textContent = data.configured ? "Substituir chave" : "Conectar OpenAI";
    } catch (error) {
      status.dataset.kind = "error";
      status.textContent = error.message;
    }
  }

  async function save(event) {
    event.preventDefault();
    const input = document.getElementById("sl-customer-ai-key");
    const status = document.getElementById("sl-customer-ai-status");
    const value = String(input?.value || "").trim();
    if (!value) return;
    status.dataset.kind = "warning";
    status.textContent = "Validando a chave diretamente com a OpenAI…";
    try {
      await request({ method: "PUT", body: JSON.stringify({ api_key: value }) });
      input.value = "";
      await refresh();
      await globalThis.superLovableGithubAgentRefresh?.();
    } catch (error) {
      status.dataset.kind = "error";
      status.textContent = error.message;
    }
  }

  async function remove() {
    if (!confirm("Remover a chave OpenAI conectada a esta licença?")) return;
    await request({ method: "DELETE" });
    await refresh();
    await globalThis.superLovableGithubAgentRefresh?.();
  }

  function mount() {
    if (document.getElementById("sl-customer-ai") || !document.getElementById("sl-github-agent")) return;
    const section = document.createElement("section");
    section.id = "sl-customer-ai";
    section.innerHTML = `
      <div class="sl-agent-title"><span>Inteligência artificial</span><span>VERSÃO 03.09.S1</span></div>
      <p id="sl-customer-ai-status" data-kind="info">Verificando OpenAI…</p>
      <form id="sl-customer-ai-form" class="sl-agent-project">
        <input id="sl-customer-ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="Cole sua API key da OpenAI (sk-…)">
        <small>A chave é criptografada no servidor e nunca é salva no navegador. A cobrança da API é feita pela OpenAI na sua própria conta.</small>
        <div class="sl-agent-actions">
          <button type="submit" id="sl-customer-ai-save">Conectar OpenAI</button>
          <button type="button" id="sl-customer-ai-remove" style="display:none">Remover</button>
        </div>
      </form>`;
    const agent = document.getElementById("sl-github-agent");
    agent.parentElement?.insertBefore(section, agent);
    section.querySelector("form")?.addEventListener("submit", save);
    section.querySelector("#sl-customer-ai-remove")?.addEventListener("click", remove);
    refresh();
  }
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
