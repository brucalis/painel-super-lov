(() => {
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;
  if (globalThis.__superLovableMistralCredentialFixInstalled) return;
  globalThis.__superLovableMistralCredentialFixInstalled = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  const GENERIC_SUFFIX = "/api/public/agent/ai-credentials";
  const DIRECT_SUFFIX = "/api/public/agent/ai-credentials-mistral";

  function providerFromBody(body) {
    if (!body || typeof body !== "string") return "";
    try {
      const data = JSON.parse(body);
      return String(data.provider ?? data.ai_provider ?? data.providerId ?? data.type ?? "").trim().toLowerCase();
    } catch {
      return "";
    }
  }

  globalThis.fetch = async (input, init = {}) => {
    try {
      const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
      const url = typeof input === "string" ? input : String(input?.url || "");
      if (method === "PUT" && url.endsWith(GENERIC_SUFFIX) && providerFromBody(init?.body) === "mistral") {
        const directUrl = url.slice(0, -GENERIC_SUFFIX.length) + DIRECT_SUFFIX;
        return originalFetch(directUrl, init);
      }
    } catch (error) {
      console.warn("[Superlovable] Não foi possível aplicar a rota direta da Mistral; usando rota padrão.", error);
    }
    return originalFetch(input, init);
  };
})();
