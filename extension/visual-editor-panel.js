// Controls for the safe visual-edit workflow shown inside the Superlovable panel.
(() => {
  if (globalThis.__superlovableVisualPanelLoaded) return;
  globalThis.__superlovableVisualPanelLoaded = true;
  const API_URL = "https://painel-super-lov.lovable.app/api/public/visual-plan";
  let busy = false;

  const storage = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const activeLovableTab = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab?.id || !/^https:\/\/([^/]+\.)?lovable\.dev\//.test(tab.url || "")) throw new Error("Abra um projeto da Lovable na aba ativa.");
    return tab;
  };
  const broadcast = async (message, expectResult = false) => {
    const tab = await activeLovableTab();
    const nonce = crypto.randomUUID();
    if (expectResult) await chrome.storage.local.remove("sl_visual_result");
    chrome.tabs.sendMessage(tab.id, { ...message, nonce }, () => void chrome.runtime.lastError);
    if (!expectResult) return { ok: true };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 75));
      const data = await storage(["sl_visual_result"]);
      if (data.sl_visual_result?.nonce === nonce) return data.sl_visual_result;
    }
    return { ok: false, error: "A página mudou. Selecione o elemento novamente." };
  };
  const status = (text, kind = "info") => {
    const element = document.getElementById("sl-visual-status");
    if (!element) return;
    element.textContent = text; element.dataset.kind = kind;
  };
  function mount() {
    if (document.getElementById("sl-visual-tools")) return;
    const composer = document.getElementById("sp-msg");
    if (!composer) return;
    const container = document.createElement("section");
    container.id = "sl-visual-tools"; container.setAttribute("data-superlovable-ui", "true");
    container.innerHTML = `
      <div class="sl-visual-title"><span>Edição visual experimental</span><span class="sl-visual-badge">SEM CRÉDITO DA CONTA</span></div>
      <div class="sl-visual-actions">
        <button type="button" id="sl-visual-select">Selecionar elemento</button>
        <button type="button" id="sl-visual-apply">Aplicar ao selecionado</button>
        <button type="button" id="sl-visual-undo">Desfazer</button>
      </div>
      <p id="sl-visual-status" data-kind="info">Selecione um elemento no preview. A extensão informa quando a alteração for apenas temporária.</p>`;
    const anchor = composer.closest(".sp-composer-modern") || composer.parentElement;
    anchor?.parentElement?.insertBefore(container, anchor);
    document.getElementById("sl-visual-select")?.addEventListener("click", async () => {
      try {
        await chrome.storage.local.remove(["sl_visual_context", "sl_visual_selected_at"]);
        await broadcast({ action: "visualStartSelection" });
        status("Clique no elemento que deseja editar.", "info");
      } catch (error) { status(error.message, "error"); }
    });
    document.getElementById("sl-visual-apply")?.addEventListener("click", apply);
    document.getElementById("sl-visual-undo")?.addEventListener("click", async () => {
      const response = await broadcast({ action: "visualUndo" }, true);
      status(response.ok ? "Última alteração visual desfeita." : response.error, response.ok ? "success" : "error");
    });
  }
  async function apply() {
    if (busy) return;
    const prompt = String(document.getElementById("sp-msg")?.value || "").trim();
    if (!prompt) { status("Digite no campo abaixo o que deseja alterar.", "error"); return; }
    busy = true; status("Analisando o pedido para o elemento selecionado…");
    try {
      const data = await storage(["sl_visual_context", "ql_session_id"]);
      if (!data.sl_visual_context) throw new Error("Selecione um elemento no preview primeiro.");
      if (!data.ql_session_id) throw new Error("Valide sua chave de ativação novamente.");
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.ql_session_id },
        body: JSON.stringify({ prompt, element: data.sl_visual_context }),
      });
      const plan = await response.json().catch(() => ({}));
      if (!response.ok || !plan.ok) throw new Error(plan.error || "Não foi possível criar o plano visual.");
      if (plan.classification !== "supported") {
        const reason = plan.reason || "Esse pedido exige o agente ou alteração de código e não pode ser executado como edição visual segura.";
        status(reason, "warning"); return;
      }
      const result = await broadcast({ action: "visualApply", operations: plan.operations }, true);
      if (!result.ok) throw new Error(result.error || "Não foi possível aplicar a edição.");
      status(`Aplicado no preview (${result.applied} operação${result.applied === 1 ? "" : "ões"}). Temporário: recarregar a página desfaz a alteração.`, "warning");
    } catch (error) { status(error.message || "Falha na edição visual.", "error"); }
    finally { busy = false; }
  }
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
