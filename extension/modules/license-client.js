/**
 * license-client.js — camada única de comunicação com o servidor de licenças.
 *
 * Funciona no popup e no service worker (via importScripts). Não conhece
 * segredos: apenas a URL pública da API e o token temporário da própria
 * licença. Nenhuma lógica capaz de gerar chaves válidas vive aqui — toda
 * decisão de validade é do servidor.
 *
 * >>> CONFIGURE AQUI a URL do seu servidor de licenças (também ajustável em
 * Ajustes › Licença, e refletido em host_permissions no manifest).
 */
(function (root) {
  const DEFAULT_LICENSE_SERVER_URL = 'https://licencas.superlovable.app';

  const KEYS = {
    device: 'extension_device_id',
    license: 'license_state',
    server: 'license_server_url',
  };

  const REQUEST_TIMEOUT_MS = 15000;
  const VALIDATE_EVERY_MS = 12 * 60 * 60 * 1000; // 12 horas
  const STALE_BEFORE_PROTECTED_MS = 24 * 60 * 60 * 1000;

  // Motivos de bloqueio em linguagem amigável.
  const REASONS = {
    none: 'Ative seu acesso para usar os recursos da SUPER LOVABLE.',
    invalid: 'Esta chave não foi reconhecida. Confira os caracteres e tente novamente.',
    expired: 'Seu acesso expirou. Renove para continuar usando os recursos.',
    canceled: 'Esta licença foi cancelada.',
    refunded: 'Esta licença foi reembolsada e não está mais ativa.',
    revoked: 'Esta licença foi revogada. Fale com o suporte se acredita ser um engano.',
    device_limit: 'O limite de dispositivos desta licença foi atingido. Desative outro dispositivo para continuar.',
    device_not_authorized: 'Este dispositivo não está autorizado nesta licença.',
    version_too_old: 'Atualize a extensão: esta versão é anterior à mínima exigida pela sua licença.',
    offline_expired: 'Conecte-se à internet para validar seu acesso.',
    offline: 'Sem conexão no momento. Conecte-se à internet para validar seu acesso.',
    server_error: 'O servidor de licenças está indisponível no momento. Tente novamente em instantes.',
  };

  const BLOCKING_STATUS = new Set([
    'invalid', 'expired', 'canceled', 'cancelled', 'refunded', 'revoked',
    'device_limit', 'device_not_authorized', 'version_too_old',
  ]);

  // ---------------- utilidades de armazenamento ----------------
  function get(key, fallback = null) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (r) => {
          if (chrome.runtime.lastError) return resolve(fallback);
          resolve(r && r[key] !== undefined ? r[key] : fallback);
        });
      } catch (e) {
        resolve(fallback);
      }
    });
  }

  function set(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => resolve(!chrome.runtime.lastError));
      } catch (e) {
        resolve(false);
      }
    });
  }

  // ---------------- identificador do dispositivo ----------------
  /** Aleatório, estável enquanto a extensão estiver instalada. Nada invasivo. */
  async function getDeviceId() {
    let id = await get(KEYS.device, null);
    if (typeof id === 'string' && /^[0-9a-f]{32}$/i.test(id)) return id;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await set({ [KEYS.device]: id });
    return id;
  }

  /** Nome genérico do dispositivo: navegador + sistema, sem fingerprint. */
  function getDeviceName() {
    const ua = (root.navigator && root.navigator.userAgent) || '';
    let browser = 'Navegador Chromium';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Brave/.test(ua)) browser = 'Brave';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    let os = 'Sistema desconhecido';
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Linux/.test(ua)) os = 'Linux';
    return `${browser} • ${os}`;
  }

  function getExtensionVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return '0.0.0';
    }
  }

  async function getServerUrl() {
    const custom = await get(KEYS.server, '');
    const url = (typeof custom === 'string' && custom.trim()) || DEFAULT_LICENSE_SERVER_URL;
    return url.replace(/\/+$/, '');
  }

  async function setServerUrl(url) {
    await set({ [KEYS.server]: (url || '').trim() });
  }

  // ---------------- chave ----------------
  /** Aceita colar com ou sem hífens; devolve sempre LVA-XXXX-XXXX-XXXX-XXXX. */
  function formatKey(raw) {
    const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = clean.startsWith('LVA') ? clean.slice(3) : clean;
    const groups = body.slice(0, 16).match(/.{1,4}/g) || [];
    return ['LVA', ...groups].join('-').replace(/-$/, '');
  }

  function isKeyComplete(value) {
    return /^LVA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(formatKey(value));
  }

  // ---------------- rede ----------------
  async function request(path, { method = 'POST', body = null, token = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const base = await getServerUrl();
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) {
        const status = (data && (data.status || data.reason)) || httpToStatus(res.status);
        return { ok: false, httpStatus: res.status, status, message: (data && data.message) || REASONS[status] || REASONS.server_error, data };
      }
      return { ok: true, httpStatus: res.status, data: data || {} };
    } catch (e) {
      const offline = e.name === 'AbortError' || !navigatorOnline();
      return {
        ok: false,
        network: true,
        status: offline ? 'offline' : 'server_error',
        message: offline ? REASONS.offline : REASONS.server_error,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function navigatorOnline() {
    return root.navigator ? root.navigator.onLine !== false : true;
  }

  function httpToStatus(code) {
    if (code === 401 || code === 403) return 'invalid';
    if (code === 402) return 'expired';
    if (code === 409) return 'device_limit';
    if (code === 426) return 'version_too_old';
    if (code === 404) return 'invalid';
    return 'server_error';
  }

  // ---------------- estado da licença ----------------
  function emptyState() {
    return {
      license_token: null,
      status: 'none',
      plan: null,
      plan_name: null,
      expires_at: null,
      is_lifetime: false,
      last_successful_validation: null,
      offline_grace_until: null,
      device_count: null,
      device_limit: null,
      key_hint: null,
      message: REASONS.none,
    };
  }

  async function getStoredLicense() {
    const stored = await get(KEYS.license, null);
    return { ...emptyState(), ...(stored || {}) };
  }

  async function saveLicense(patch) {
    const current = await getStoredLicense();
    const next = { ...current, ...patch };
    await set({ [KEYS.license]: next });
    return next;
  }

  async function clearLicense() {
    await set({ [KEYS.license]: emptyState() });
    return emptyState();
  }

  /**
   * Normaliza a resposta do servidor. A hora do servidor manda: as janelas de
   * validade e de tolerância offline são calculadas a partir de server_time.
   */
  function mapResponse(data, previous) {
    const serverTime = Date.parse(data.server_time || '') || Date.now();
    const drift = serverTime - Date.now(); // diferença entre relógio local e servidor
    const graceMs = Number(data.offline_grace_seconds) > 0
      ? Number(data.offline_grace_seconds) * 1000
      : null;
    const graceUntil = data.offline_grace_until
      ? Date.parse(data.offline_grace_until)
      : graceMs
        ? serverTime + graceMs
        : null;

    return {
      license_token: data.license_token || data.token || previous.license_token || null,
      status: data.status || 'active',
      plan: data.plan || previous.plan || null,
      plan_name: data.plan_name || data.plan || previous.plan_name || null,
      expires_at: data.is_lifetime ? null : (data.expires_at || null),
      is_lifetime: !!data.is_lifetime,
      last_successful_validation: new Date(serverTime).toISOString(),
      offline_grace_until: graceUntil ? new Date(graceUntil).toISOString() : null,
      device_count: data.device_count ?? previous.device_count ?? null,
      device_limit: data.device_limit ?? previous.device_limit ?? null,
      key_hint: data.key_hint || previous.key_hint || null,
      minimum_version: data.minimum_version || null,
      server_drift_ms: drift,
      message: null,
    };
  }

  /** Agora corrigido pela diferença de relógio observada no servidor. */
  function now(state) {
    return Date.now() + (Number(state && state.server_drift_ms) || 0);
  }

  function isWithinOfflineGrace(state) {
    if (!state || !state.last_successful_validation) return false;
    if (!state.offline_grace_until) return false;
    return now(state) < Date.parse(state.offline_grace_until);
  }

  function isExpired(state) {
    if (!state || state.is_lifetime) return false;
    if (!state.expires_at) return false;
    return now(state) >= Date.parse(state.expires_at);
  }

  /** Verdadeiro só quando os recursos protegidos podem ser usados. */
  function hasActiveLicense(state) {
    if (!state || !state.license_token) return false;
    if (state.status !== 'active') return false;
    if (isExpired(state)) return false;
    // Sem validação recente, exige estar dentro do prazo offline informado.
    const last = Date.parse(state.last_successful_validation || '') || 0;
    const fresh = now(state) - last < VALIDATE_EVERY_MS;
    return fresh || isWithinOfflineGrace(state);
  }

  /** Motivo amigável do bloqueio, ou null quando liberado. */
  function blockReason(state) {
    if (!state || !state.license_token) return REASONS.none;
    if (BLOCKING_STATUS.has(state.status)) return REASONS[state.status] || REASONS.invalid;
    if (isExpired(state)) return REASONS.expired;
    if (hasActiveLicense(state)) return null;
    return REASONS.offline_expired;
  }

  function daysLeft(state) {
    if (!state || state.is_lifetime || !state.expires_at) return null;
    return Math.ceil((Date.parse(state.expires_at) - now(state)) / 86400000);
  }

  // ---------------- operações públicas ----------------
  async function activateLicense(rawKey) {
    let key = formatKey(rawKey); // nunca registrada em console
    if (!isKeyComplete(key)) {
      key = null;
      return { ok: false, status: 'invalid', message: 'Informe a chave completa no formato LVA-XXXX-XXXX-XXXX-XXXX.' };
    }
    const res = await request('/activate-license', {
      body: {
        license_key: key,
        device_id: await getDeviceId(),
        device_name: getDeviceName(),
        extension_version: getExtensionVersion(),
      },
    });
    key = null; // chave digitada some da memória logo após o envio

    if (!res.ok) {
      if (res.network) return { ok: false, status: res.status, message: res.message };
      await saveLicense({ status: res.status, message: res.message, license_token: null });
      return { ok: false, status: res.status, message: res.message };
    }

    const previous = await getStoredLicense();
    const mapped = mapResponse(res.data, previous);
    if (mapped.status !== 'active') {
      await saveLicense({ ...mapped, message: REASONS[mapped.status] || REASONS.invalid });
      return { ok: false, status: mapped.status, message: REASONS[mapped.status] || REASONS.invalid };
    }
    const saved = await saveLicense(mapped);
    return { ok: true, status: 'active', state: saved };
  }

  async function validateLicense({ silent = true } = {}) {
    const state = await getStoredLicense();
    if (!state.license_token) return { ok: false, status: 'none', message: REASONS.none, state };

    const res = await request('/validate-license', {
      token: state.license_token,
      body: {
        device_id: await getDeviceId(),
        extension_version: getExtensionVersion(),
      },
    });

    if (!res.ok) {
      // Falha de rede não invalida: vale a tolerância offline concedida pelo servidor.
      if (res.network) {
        const allowed = isWithinOfflineGrace(state) && !isExpired(state);
        return {
          ok: allowed,
          offline: true,
          status: allowed ? 'active' : 'offline_expired',
          message: allowed ? null : REASONS.offline_expired,
          state,
        };
      }
      const saved = await saveLicense({ status: res.status, message: res.message });
      return { ok: false, status: res.status, message: res.message, state: saved };
    }

    const mapped = mapResponse(res.data, state);
    const saved = await saveLicense(mapped);
    const ok = hasActiveLicense(saved);
    if (!silent) { /* chamador decide o que exibir */ }
    return { ok, status: saved.status, message: ok ? null : blockReason(saved), state: saved };
  }

  /** Revalida apenas quando a última confirmação já está antiga. */
  async function ensureFresh() {
    const state = await getStoredLicense();
    if (!state.license_token) return { ok: false, status: 'none', message: REASONS.none, state };
    const last = Date.parse(state.last_successful_validation || '') || 0;
    if (now(state) - last < STALE_BEFORE_PROTECTED_MS) {
      return { ok: hasActiveLicense(state), status: state.status, message: blockReason(state), state };
    }
    return validateLicense();
  }

  async function deactivateDevice() {
    const state = await getStoredLicense();
    if (state.license_token) {
      await request('/deactivate-device', {
        token: state.license_token,
        body: { device_id: await getDeviceId(), extension_version: getExtensionVersion() },
      });
    }
    // Só a licença é apagada: histórico, fila, anexos e ajustes permanecem.
    return clearLicense();
  }

  const LicenseClient = {
    KEYS,
    REASONS,
    VALIDATE_EVERY_MS,
    DEFAULT_LICENSE_SERVER_URL,
    activateLicense,
    validateLicense,
    ensureFresh,
    deactivateDevice,
    getStoredLicense,
    clearLicense,
    hasActiveLicense,
    isWithinOfflineGrace,
    isExpired,
    blockReason,
    daysLeft,
    formatKey,
    isKeyComplete,
    getDeviceId,
    getDeviceName,
    getExtensionVersion,
    getServerUrl,
    setServerUrl,
    emptyState,
  };

  root.LicenseClient = LicenseClient;
  if (typeof module !== 'undefined' && module.exports) module.exports = LicenseClient;
})(typeof self !== 'undefined' ? self : globalThis);
