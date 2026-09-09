(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const API = "https://painel-super-lov.lovable.app/api/public/agent/ai-credentials-openrouter";

  function setStatus(kind, text) {
    const status = document.getElementById("sl-ai-openrouter-status");
    if (!status) return;
    status.dataset.kind = kind;
    status.textContent = text;
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

  async function connectOpenRouter(form) {
    const input = form.querySelector("#sl-ai-openrouter-key");
    const button = form.querySelector("#sl-ai-openrouter-save");
    const apiKey = String(input?.value || "").trim();

    if (!apiKey) {
      setStatus("error", "Cole sua chave do OpenRouter para continuar.");
      return;
    }

    const originalText = button?.textContent || "Conectar";
    if (button) {
      button.disabled = true;
      button.textContent = "Validando…";
    }
    setStatus("warning", "Validando OpenRouter pela rota direta…");

    try {
      const session = await storageGet(["ql_session_id"]);
      if (!session.ql_session_id) throw new Error("Valide sua licença novamente.");

      const response = await fetch(API, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.ql_session_id}`,
          "Content-Type": "application/json",
          "X-Super-Lovable-Edition": "customer-s1",
        },
        body: JSON.stringify({ api_key: apiKey }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || `Falha ao conectar OpenRouter (HTTP ${response.status}).`);
      }

      if (input) input.value = "";
      setStatus("success", `OpenRouter conectado (${data.keyHint || "chave protegida"})`);
      setTimeout(() => location.reload(), 450);
    } catch (error) {
      setStatus("error", error?.message || "Não foi possível conectar o OpenRouter.");
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.id !== "sl-ai-openrouter-form") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void connectOpenRouter(form);
    },
    true,
  );
})();
