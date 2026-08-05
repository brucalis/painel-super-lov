/*
 * SUPER LOVABLE V2 — adaptador da API de licenças
 *
 * Esta camada evita acoplar a interface a um endpoint específico. O endereço
 * pode ser alterado pelo painel administrativo sem republicar a extensão.
 */

import { simulateLicenseRequest } from './license-simulator.js';

const SETTINGS_KEY = 'slv2_license_api_settings';
const DEFAULT_SETTINGS = Object.freeze({
  baseUrl: 'https://painel-super-lov.lovable.app',
  validatePath: '/api/licenses/validate',
  activatePath: '/api/licenses/activate',
  deactivatePath: '/api/licenses/deactivate',
  timeoutMs: 12000
});

function storageGet(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[key] || null);
    });
  });
}

function storageSet(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function cleanBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(url)) throw new Error('O servidor de licenças deve usar HTTPS.');
  return url;
}

function normalizePath(value, fallback) {
  const path = String(value || fallback).trim();
  return path.startsWith('/') ? path : `/${path}`;
}

export async function getLicenseApiSettings() {
  const stored = await storageGet(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored || {})
  };
}

export async function saveLicenseApiSettings(input = {}) {
  const current = await getLicenseApiSettings();
  const next = {
    baseUrl: cleanBaseUrl(input.baseUrl || current.baseUrl),
    validatePath: normalizePath(input.validatePath, current.validatePath),
    activatePath: normalizePath(input.activatePath, current.activatePath),
    deactivatePath: normalizePath(input.deactivatePath, current.deactivatePath),
    timeoutMs: Math.max(3000, Math.min(Number(input.timeoutMs) || current.timeoutMs, 30000))
  };
  await storageSet(SETTINGS_KEY, next);
  return next;
}

async function request(pathName, payload) {
  const simulated = await simulateLicenseRequest(payload);
  if (simulated) return normalizeLicenseResponse(simulated);

  const settings = await getLicenseApiSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

  try {
    const response = await fetch(`${settings.baseUrl}${pathName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Super-Lovable-Client': 'chrome-extension-v2'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit'
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error = new Error(data?.message || `Servidor retornou ${response.status}.`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return normalizeLicenseResponse(data || {});
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao validar a licença.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeLicenseResponse(data) {
  const rawStatus = String(data.status || data.license_status || '').toLowerCase();
  let status = rawStatus;

  if (data.valid === true && !status) status = 'active';
  if (data.valid === false && !status) status = 'invalid';
  if (data.expired === true) status = 'expired';
  if (data.revoked === true) status = 'revoked';
  if (data.device_limit_reached === true) status = 'device_limit';

  return {
    status,
    valid: data.valid === true || ['active', 'valid', 'enabled'].includes(status),
    plan: data.plan || data.plan_name || data.license?.plan || null,
    expiresAt: data.expiresAt || data.expires_at || data.license?.expires_at || null,
    deviceId: data.deviceId || data.device_id || data.activation?.device_id || null,
    devicesUsed: data.devicesUsed ?? data.devices_used ?? null,
    devicesLimit: data.devicesLimit ?? data.devices_limit ?? null,
    role: data.role || data.access_level || 'user',
    message: data.message || null,
    raw: data
  };
}

export async function validateLicenseRemote(payload) {
  const settings = await getLicenseApiSettings();
  return request(settings.validatePath, payload);
}

export async function activateLicenseRemote(payload) {
  const settings = await getLicenseApiSettings();
  return request(settings.activatePath, payload);
}

export async function deactivateLicenseRemote(payload) {
  const settings = await getLicenseApiSettings();
  return request(settings.deactivatePath, payload);
}
