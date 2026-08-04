/*
 * SUPER LOVABLE V2 — identidade persistente do dispositivo
 *
 * Objetivo:
 * - evitar que uma reinstalação ou atualização gere um novo dispositivo;
 * - migrar IDs antigos sem consumir outra ativação;
 * - manter uma identidade local estável por perfil do navegador;
 * - não coletar hardware, e-mail, IP ou dados pessoais.
 *
 * Observação importante:
 * Uma extensão não consegue garantir a mesma identidade após o usuário limpar
 * completamente todos os dados do navegador. Para reinstalações normais e
 * atualizações, chrome.storage.local normalmente é preservado. Para cenários
 * em que o armazenamento local seja apagado, o backend deve permitir
 * reativação idempotente por licença + instalação previamente conhecida ou
 * oferecer um fluxo de recuperação controlado.
 */

export const DEVICE_STORAGE_KEYS = Object.freeze({
  CURRENT: 'slv2_device_identity',
  LEGACY_CANDIDATES: Object.freeze([
    'deviceId',
    'device_id',
    'slDeviceId',
    'superLovableDeviceId',
    'installationId'
  ])
});

const DEVICE_SCHEMA_VERSION = 2;
const DEVICE_PREFIX = 'SLD';

function getStorageArea() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error('chrome.storage.local indisponível');
  }
  return globalThis.chrome.storage.local;
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    getStorageArea().get(keys, (result) => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result || {});
    });
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    getStorageArea().set(values, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function normalizeLegacyId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  return trimmed;
}

function randomHex(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return [...buffer].map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

async function createIdentity(source = 'generated') {
  const createdAt = new Date().toISOString();
  const seed = `${randomHex(24)}:${createdAt}:${globalThis.chrome?.runtime?.id || 'unpacked'}`;
  const digest = await sha256Hex(seed);
  const id = `${DEVICE_PREFIX}-${digest.slice(0, 24).toUpperCase()}`;

  return Object.freeze({
    schemaVersion: DEVICE_SCHEMA_VERSION,
    id,
    source,
    createdAt,
    lastSeenAt: createdAt
  });
}

async function migrateLegacyIdentity(snapshot) {
  for (const key of DEVICE_STORAGE_KEYS.LEGACY_CANDIDATES) {
    const legacyId = normalizeLegacyId(snapshot[key]);
    if (!legacyId) continue;

    const digest = await sha256Hex(`legacy:${legacyId}`);
    const now = new Date().toISOString();
    return Object.freeze({
      schemaVersion: DEVICE_SCHEMA_VERSION,
      id: `${DEVICE_PREFIX}-${digest.slice(0, 24).toUpperCase()}`,
      source: `legacy:${key}`,
      legacyId,
      createdAt: now,
      lastSeenAt: now
    });
  }
  return null;
}

function isValidIdentity(identity) {
  return Boolean(
    identity &&
    identity.schemaVersion === DEVICE_SCHEMA_VERSION &&
    typeof identity.id === 'string' &&
    identity.id.startsWith(`${DEVICE_PREFIX}-`) &&
    identity.id.length >= 20
  );
}

export async function getOrCreateDeviceIdentity() {
  const keys = [DEVICE_STORAGE_KEYS.CURRENT, ...DEVICE_STORAGE_KEYS.LEGACY_CANDIDATES];
  const snapshot = await storageGet(keys);
  const current = snapshot[DEVICE_STORAGE_KEYS.CURRENT];

  if (isValidIdentity(current)) {
    const refreshed = {
      ...current,
      lastSeenAt: new Date().toISOString()
    };
    await storageSet({ [DEVICE_STORAGE_KEYS.CURRENT]: refreshed });
    return Object.freeze(refreshed);
  }

  const migrated = await migrateLegacyIdentity(snapshot);
  const identity = migrated || await createIdentity();
  await storageSet({ [DEVICE_STORAGE_KEYS.CURRENT]: identity });
  return identity;
}

export async function getDeviceId() {
  const identity = await getOrCreateDeviceIdentity();
  return identity.id;
}

export async function getDeviceIdentityForSupport() {
  const identity = await getOrCreateDeviceIdentity();
  return {
    id: identity.id,
    source: identity.source,
    createdAt: identity.createdAt,
    lastSeenAt: identity.lastSeenAt,
    schemaVersion: identity.schemaVersion
  };
}
