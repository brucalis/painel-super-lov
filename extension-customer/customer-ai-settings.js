(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;
  const API = "https://painel-super-lov.lovable.app/api/public/agent";
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
    if (!response.ok || data.ok === false) throw new Error(data.error || "Não foi possível configurar a inteligência artificial.");
    return data;
  };
  const label = { groq: "Groq", gemini: "Gemini" };

  function updateProvider(provider, data) {
    const status = document.getElementById(`sl-ai-${provider}-status`);
    const button = document.getElementById(`sl-ai-${provider}-save`);
    const remove = document.getElementById(`sl-ai-${provider}-remove`);
    if (!status) return;
    status.dataset.kind = data?.configured ? "success" : "warning";
    status.textContent = data?.configured
      ? `${label[provider]} conectado (${data.keyHint || "chave protegida"})`
      : provider === "groq" ? "Principal: conecte sua API key gratuita do Groq." : "Contingência: conecte sua API key gratuita do Gemini.";
    button.textContent = data?.configured ? "Substituir" : "Conectar";
    remove.style.display = data?.configured ? "inline-flex" : "none";
  }
  async function refresh() {
    try {
      const data = await request();
      updateProvider("groq", data.groq);
      updateProvider("gemini", data.gemini);
    } catch (error) {
      ["groq", "gemini"].forEach((provider) => {
        const status = document.getElementById(`sl-ai-${provider}-status`);
        if (status) { status.dataset.kind = "error"; status.textContent = error.message; }
      });
    }
  }
  async function save(event, provider) {
    event.preventDefault();
    const input = document.getElementById(`sl-ai-${provider}-key`);
    const status = document.getElementById(`sl-ai-${provider}-status`);
    const apiKey = String(input?.value || "").trim();
    if (!apiKey) return;
    status.dataset.kind = "warning";
    status.textContent = `Validando ${label[provider]}…`;
    try {
      await request("", { method: "PUT", body: JSON.stringify({ provider, api_key: apiKey }) });
      input.value = "";
      await refresh();
      await globalThis.superLovableGithubAgentRefresh?.();
    } catch (error) { status.dataset.kind = "error"; status.textContent = error.message; }
  }
  async function remove(provider) {
    if (!confirm(`Remover a chave ${label[provider]} desta licença?`)) return;
    await request(`?provider=${provider}`, { method: "DELETE" });
    await refresh();
    await globalThis.superLovableGithubAgentRefresh?.();
  }
  function providerForm(provider, placeholder) {
    return `<form id="sl-ai-${provider}-form" class="sl-agent-project">
      <p id="sl-ai-${provider}-status" data-kind="info">Verificando ${label[provider]}…</p>
      <input id="sl-ai-${provider}-key" type="password" autocomplete="off" spellcheck="false" placeholder="${placeholder}">
      <div class="sl-agent-actions">
        <button type="submit" id="sl-ai-${provider}-save">Conectar</button>
        <button type="button" id="sl-ai-${provider}-remove" style="display:none">Remover</button>
      </div>
    </form>`;
  }
  function mount() {
    if (document.getElementById("sl-customer-ai") || !document.getElementById("sl-github-agent")) return;
    const section = document.createElement("section");
    section.id = "sl-customer-ai";
    section.innerHTML = `<div class="sl-agent-title"><span>Suas inteligências artificiais</span><span>03.09.S1</span></div>
      <small>O Groq é usado primeiro. Se atingir o limite, o Gemini assume automaticamente. As chaves são criptografadas no servidor e nunca ficam salvas no navegador.</small>
      ${providerForm("groq", "API key do Groq (gsk_…)")}
      ${providerForm("gemini", "API key do Gemini (AIza…)")}`;
    const agent = document.getElementById("sl-github-agent");
    agent.parentElement?.insertBefore(section, agent);
    ["groq", "gemini"].forEach((provider) => {
      document.getElementById(`sl-ai-${provider}-form`)?.addEventListener("submit", (event) => save(event, provider));
      document.getElementById(`sl-ai-${provider}-remove`)?.addEventListener("click", () => remove(provider));
    });
    refresh();
  }
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
