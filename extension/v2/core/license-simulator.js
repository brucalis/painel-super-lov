/*
 * SUPER LOVABLE V2 — simulador local de licença
 *
 * Uso exclusivo da branch de desenvolvimento. Permite validar a interface e o
 * fluxo de estados antes de conectar os endpoints reais do painel.
 * Não substitui a validação do servidor e não deve ser ativado em produção.
 */

const SIMULATOR_KEY = 'slv2_license_simulator';

const DEFAULT_STATE = Object.freeze({
  enabled: true,
  scenario: 'active',
  plan: 'Vitalício',
  durationMinutes: 25,
  devicesLimit: 1
});

function storageGet() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(SIMULATOR_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[SIMULATOR_KEY] || null);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [SIMULATOR_KEY]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

export async function getLicenseSimulatorSettings() {
  const stored = await storageGet();
  return { ...DEFAULT_STATE, ...(stored || {}) };
}

export async function saveLicenseSimulatorSettings(input = {}) {
  const current = await getLicenseSimulatorSettings();
  const next = {
    enabled: input.enabled ?? current.enabled,
    scenario: String(input.scenario || current.scenario),
    plan: String(input.plan || current.plan),
    durationMinutes: Math.max(1, Number(input.durationMinutes) || current.durationMinutes),
    devicesLimit: Math.max(1, Number(input.devicesLimit) || current.devicesLimit)
  };
  await storageSet(next);
  return next;
}

function futureIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export async function simulateLicenseRequest(payload) {
  const settings = await getLicenseSimulatorSettings();
  if (!settings.enabled) return null;

  const base = {
    plan: settings.plan,
    deviceId: payload?.deviceId || null,
    devicesUsed: 1,
    devicesLimit: settings.devicesLimit
  };

  switch (settings.scenario) {
    case 'expired':
      return {
        ...base,
        status: 'expired',
        valid: false,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
        message: 'A licença simulada expirou.'
      };
    case 'device_limit':
      return {
        ...base,
        status: 'device_limit',
        valid: false,
        devicesUsed: settings.devicesLimit,
        message: 'Limite de dispositivos atingido no cenário de teste.'
      };
    case 'revoked':
      return {
        ...base,
        status: 'revoked',
        valid: false,
        message: 'A licença simulada foi desativada.'
      };
    case 'invalid':
      return {
        ...base,
        status: 'invalid',
        valid: false,
        message: 'Chave inválida no cenário de teste.'
      };
    case 'active':
    default:
      return {
        ...base,
        status: 'active',
        valid: true,
        expiresAt: futureIso(settings.durationMinutes),
        message: 'Licença simulada validada com sucesso.'
      };
  }
}
