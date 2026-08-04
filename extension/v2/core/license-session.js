/*
 * SUPER LOVABLE V2 — sessão de licença
 *
 * Resolve dois problemas principais:
 * 1. Evita exibir a tela de ativação enquanto a licença já salva ainda está
 *    sendo validada.
 * 2. Mantém um cache curto para abertura instantânea, sem ignorar expiração,
 *    revogação ou limite de dispositivos.
 */

import { getOrCreateDeviceIdentity } from './device-identity.js';

export const LICENSE_STATES = Object.freeze({
  BOOTING: 'booting',
  ACTIVE_CACHED: 'active_cached',
  ACTIVE_VERIFIED: 'active_verified',
  ACTIVATION_REQUIRED: 'activation_required',
  EXPIRED: 'expired',
  DEVICE_LIMIT: 'device_limit',
  REVOKED: 'revoked',
  OFFLINE_GRACE: 'offline_grace',
  ERROR: 'error'
});

const STORAGE_KEY = 'slv2_license_session';
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;

function getStorageArea() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error('chrome.storage.local indisponível');
  }
  return globalThis.chrome.storage.local;
}

function storageGet(key) {
  return new Promise((resolve, reject) => {
    getStorageArea().get(key, (result) => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result?.[key] || null);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    getStorageArea().set({ [STORAGE_KEY]: value }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function nowMs() {
  return Date.now();
}

function parseTime(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isExpired(session, at = nowMs()) {
  const expiresAt = parseTime(session?.expiresAt);
  return expiresAt !== null && expiresAt <= at;
}

function isCacheFresh(session, ttlMs, at = nowMs()) {
  const verifiedAt = parseTime(session?.verifiedAt);
  return verifiedAt !== null && at - verifiedAt <= ttlMs;
}

function canUseOfflineGrace(session, graceMs, at = nowMs()) {
  const verifiedAt = parseTime(session?.verifiedAt);
  if (verifiedAt === null || isExpired(session, at)) return false;
  return at - verifiedAt <= graceMs;
}

function normalizeServerState(payload) {
  const status = String(payload?.status || '').toLowerCase();
  if (['active', 'valid', 'enabled'].includes(status)) return LICENSE_STATES.ACTIVE_VERIFIED;
  if (['expired'].includes(status)) return LICENSE_STATES.EXPIRED;
  if (['device_limit', 'device-limit', 'limit_reached'].includes(status)) return LICENSE_STATES.DEVICE_LIMIT;
  if (['revoked', 'blocked', 'disabled'].includes(status)) return LICENSE_STATES.REVOKED;
  return LICENSE_STATES.ACTIVATION_REQUIRED;
}

function publicSession(session, state, source) {
  return Object.freeze({
    state,
    source,
    licenseKey: session?.licenseKey || null,
    plan: session?.plan || null,
    expiresAt: session?.expiresAt || null,
    verifiedAt: session?.verifiedAt || null,
    deviceId: session?.deviceId || null,
    message: session?.message || null
  });
}

export class LicenseSessionManager {
  constructor({
    validateRemote,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    offlineGraceMs = DEFAULT_OFFLINE_GRACE_MS
  } = {}) {
    if (typeof validateRemote !== 'function') {
      throw new TypeError('validateRemote deve ser uma função');
    }
    this.validateRemote = validateRemote;
    this.cacheTtlMs = cacheTtlMs;
    this.offlineGraceMs = offlineGraceMs;
  }

  async readCachedSession() {
    return storageGet(STORAGE_KEY);
  }

  async bootstrap() {
    const device = await getOrCreateDeviceIdentity();
    const cached = await this.readCachedSession();

    if (!cached?.licenseKey) {
      return publicSession({ deviceId: device.id }, LICENSE_STATES.ACTIVATION_REQUIRED, 'no-cache');
    }

    if (isExpired(cached)) {
      return publicSession(cached, LICENSE_STATES.EXPIRED, 'cache-expired');
    }

    if (cached.deviceId && cached.deviceId !== device.id) {
      // Não ativa outro dispositivo automaticamente. A decisão deve vir do backend.
      return this.verify({ ...cached, deviceId: device.id }, { reason: 'device-migration' });
    }

    if (isCacheFresh(cached, this.cacheTtlMs)) {
      // A interface pode abrir imediatamente e a revalidação ocorrer em paralelo.
      void this.verify(cached, { reason: 'background-refresh', silent: true });
      return publicSession(cached, LICENSE_STATES.ACTIVE_CACHED, 'fresh-cache');
    }

    return this.verify(cached, { reason: 'cache-stale' });
  }

  async activate(licenseKey) {
    const normalizedKey = String(licenseKey || '').trim().toUpperCase();
    if (!normalizedKey) {
      return publicSession(null, LICENSE_STATES.ACTIVATION_REQUIRED, 'empty-key');
    }

    const device = await getOrCreateDeviceIdentity();
    return this.verify({ licenseKey: normalizedKey, deviceId: device.id }, { reason: 'activation' });
  }

  async verify(session, { reason = 'manual', silent = false } = {}) {
    const device = await getOrCreateDeviceIdentity();
    const request = {
      licenseKey: session.licenseKey,
      deviceId: device.id,
      installationId: device.id,
      extensionVersion: globalThis.chrome?.runtime?.getManifest?.().version || 'unknown',
      reason
    };

    try {
      const response = await this.validateRemote(request);
      const state = normalizeServerState(response);
      const nextSession = {
        licenseKey: session.licenseKey,
        deviceId: device.id,
        plan: response?.plan || session?.plan || null,
        expiresAt: response?.expiresAt || session?.expiresAt || null,
        verifiedAt: new Date().toISOString(),
        serverDeviceId: response?.deviceId || null,
        message: response?.message || null,
        state
      };

      await storageSet(nextSession);
      return publicSession(nextSession, state, 'remote');
    } catch (error) {
      const cached = await this.readCachedSession();
      if (cached?.licenseKey === session.licenseKey && canUseOfflineGrace(cached, this.offlineGraceMs)) {
        return publicSession(
          { ...cached, message: 'Validação temporariamente indisponível.' },
          LICENSE_STATES.OFFLINE_GRACE,
          silent ? 'background-offline' : 'offline-grace'
        );
      }

      return publicSession(
        { ...session, deviceId: device.id, message: error?.message || 'Falha ao validar licença.' },
        LICENSE_STATES.ERROR,
        'remote-error'
      );
    }
  }

  async clearLocalSession() {
    await storageSet(null);
  }
}

export function shouldShowMainInterface(state) {
  return [
    LICENSE_STATES.ACTIVE_CACHED,
    LICENSE_STATES.ACTIVE_VERIFIED,
    LICENSE_STATES.OFFLINE_GRACE
  ].includes(state);
}

export function shouldShowActivation(state) {
  return [
    LICENSE_STATES.ACTIVATION_REQUIRED,
    LICENSE_STATES.EXPIRED,
    LICENSE_STATES.DEVICE_LIMIT,
    LICENSE_STATES.REVOKED,
    LICENSE_STATES.ERROR
  ].includes(state);
}
