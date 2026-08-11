// Superlovable / SUPERLOVABLE — integração com o painel oficial de licenças.
(function () {
  "use strict";

  const API_BASE = "https://painel-super-lov.lovable.app/api/public";
  const ACTIVATE_URL = API_BASE + "/activate-license";
  const VALIDATE_URL = API_BASE + "/validate-license";
  const RESET_PAGE = "https://painel-super-lov.lovable.app";
  const REQUEST_TIMEOUT_MS = 15000;

  const MESSAGES = Object.freeze({
    ok: "Licença validada com sucesso.",
    invalid: "Esta chave não foi reconhecida. Confira os caracteres e tente novamente.",
    expired: "Seu acesso expirou. Renove para continuar.",
    canceled: "Esta licença foi cancelada.",
    refunded: "Esta licença foi reembolsada e não está mais ativa.",
    revoked: "Esta licença foi revogada.",
    device_limit: "Esta licença já está ativa em outro navegador ou dispositivo. Para trocar, solicite a liberação do acesso anterior.",
    device_not_authorized: "Esta licença está vinculada a outro navegador ou dispositivo.",
    version_too_old: "Atualize a extensão para continuar.",
    offline: "Sem conexão com o servidor de licenças.",
    server_error: "O servidor de licenças está indisponível. Tente novamente.",
    empty: "Digite sua chave de licença para continuar.",
  });

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  function formatKey(raw) {
    const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const body = clean.startsWith("LVA") ? clean.slice(3) : clean;
    const groups = body.slice(0, 16).match(/.{1,4}/g) || [];
    return ["LVA", ...groups].join("-").replace(/-$/, "");
  }

  function isCompleteKey(value) {
    return /^LVA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
  }

  function invalidResponse(reason, message) {
    const status = reason || "invalid";
    return {
      valid: false,
      reason: status,
      message: message || MESSAGES[status] || MESSAGES.invalid,
      expires_at: null,
      activated_at: null,
      status,
      license_type: null,
      lifetime: false,
      session_id: null,
      user_name: null,
      online_count: 0,
      plan: null,
    };
  }

  function validResponse(data, token) {
    if (!data || data.status !== "active" || !token) {
      return invalidResponse((data && data.status) || "invalid", data && data.message);
    }
    return {
      valid: true,
      reason: null,
      message: data.message || MESSAGES.ok,
      expires_at: data.is_lifetime ? null : (data.expires_at || null),
      activated_at: data.server_time || new Date().toISOString(),
      status: "active",
      license_type: "paid",
      lifetime: data.is_lifetime === true,
      session_id: token,
      user_name: data.user_name || null,
      online_count: Number(data.device_count) || 0,
      plan: data.plan || null,
      plan_name: data.plan_name || null,
      device_limit: Number(data.device_limit) || 1,
      access_role: data.access_role === "admin" ? "admin" : "user",
    };
  }

  function statusFromHttp(status) {
    if (status === 402) return "expired";
    if (status === 409) return "device_limit";
    if (status === 426) return "version_too_old";
    if (status === 401 || status === 403 || status === 404) return "invalid";
    return "server_error";
  }

  async function request(url, body, token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers = { "Accept": "application/json", "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) {
        const status = (data && (data.status || data.reason)) || statusFromHttp(response.status);
        return { ok: false, status, message: (data && data.message) || MESSAGES[status] };
      }
      return { ok: true, data: data || {} };
    } catch (error) {
      return {
        ok: false,
        status: error && error.name === "AbortError" ? "offline" : "server_error",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  function extensionVersion() {
    try { return chrome.runtime.getManifest().version; } catch (_) { return "0.0.0"; }
  }

  function deviceName() {
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : "Chrome";
    const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Chromium";
    return browser + " • " + os;
  }

  /**
   * Primeiro uso: ativa a chave e recebe um token do dispositivo.
   * Usos seguintes/heartbeat: valida o token sem reenviar a chave.
   * Qualquer falha mantém a extensão bloqueada.
   */
  async function lvbValidate(_legacyFetcher, rawKey, deviceId) {
    const key = formatKey(rawKey);
    if (!isCompleteKey(key)) return invalidResponse("invalid", MESSAGES.empty);
    if (!deviceId) return invalidResponse("invalid", "Identificação do dispositivo indisponível.");

    const stored = await storageGet(["ql_session_id", "ql_license_key"]);
    const sameLicense = formatKey(stored.ql_license_key || "") === key;
    const existingToken = sameLicense ? String(stored.ql_session_id || "").trim() : "";

    if (existingToken) {
      const validation = await request(VALIDATE_URL, {
        device_id: String(deviceId),
        extension_version: extensionVersion(),
      }, existingToken);
      if (validation.ok) return validResponse(validation.data, existingToken);

      // Token inválido não é motivo para liberar nem reativar silenciosamente.
      // O usuário deve informar/confirmar a chave novamente após o estado local
      // ser limpo pelos chamadores existentes.
      return invalidResponse(validation.status, validation.message);
    }

    const activation = await request(ACTIVATE_URL, {
      license_key: key,
      device_id: String(deviceId),
      device_name: deviceName(),
      extension_version: extensionVersion(),
    });
    if (!activation.ok) return invalidResponse(activation.status, activation.message);

    const token = String(activation.data.license_token || activation.data.token || "").trim();
    return validResponse(activation.data, token);
  }

  const root = (typeof window !== "undefined" && window) || globalThis;
  root.LVB_API_BASE = API_BASE;
  root.LVB_API_BASES = [API_BASE];
  root.LVB_VALIDATE_URL = VALIDATE_URL;
  root.LVB_RESET_PAGE = RESET_PAGE;
  root.lvbValidate = lvbValidate;
})();
