// Superlovable — branding fixo local.
// A versão anterior buscava branding remoto em um Supabase de terceiros.
// Agora o branding é 100% local (branding.config.js), sem chamadas externas.
(function () {
  try {
    if (typeof window !== "undefined" && typeof window.applyBrandingConfig === "function") {
      window.applyBrandingConfig(window.TS_BRANDING_CONFIG || {});
    }
  } catch (_) {}
})();
