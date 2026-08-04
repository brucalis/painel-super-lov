import { LicenseSessionManager, LICENSE_STATES } from '../core/license-session.js';
import { LicenseBootstrapController } from '../core/license-bootstrap-controller.js';
import {
  activateLicenseRemote,
  validateLicenseRemote
} from '../core/license-api-adapter.js';

const $ = (selector) => document.querySelector(selector);
const loadingElement = $('[data-license-view="booting"]');
const mainElement = $('[data-license-view="main"]');
const gateElement = $('[data-license-view="activation"]');

const manager = new LicenseSessionManager({
  validateRemote: (payload) => {
    if (payload.reason === 'activation') return activateLicenseRemote(payload);
    return validateLicenseRemote(payload);
  }
});

const controller = new LicenseBootstrapController({
  sessionManager: manager,
  root: document.body,
  loadingElement,
  mainElement,
  gateElement,
  statusElement: $('#feedback')
});

function shortDevice(value) {
  if (!value) return '—';
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function formatDate(value) {
  if (!value) return 'Sem prazo informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function describeState(session) {
  const map = {
    [LICENSE_STATES.ACTIVE_CACHED]: 'Licença carregada do cache e sendo conferida em segundo plano.',
    [LICENSE_STATES.ACTIVE_VERIFIED]: 'Licença confirmada pelo servidor.',
    [LICENSE_STATES.OFFLINE_GRACE]: 'Servidor indisponível. Acesso temporário mantido pela última validação.',
    [LICENSE_STATES.EXPIRED]: 'Esta licença expirou. Renove o acesso para continuar.',
    [LICENSE_STATES.DEVICE_LIMIT]: 'O limite de dispositivos desta licença foi atingido.',
    [LICENSE_STATES.REVOKED]: 'Esta licença foi desativada pelo servidor.',
    [LICENSE_STATES.ERROR]: session?.message || 'Não foi possível validar a licença.',
    [LICENSE_STATES.ACTIVATION_REQUIRED]: session?.message || 'Informe sua chave para ativar este dispositivo.'
  };
  return map[session?.state] || session?.message || '';
}

function renderSession(session) {
  if (!session) return;
  if ([LICENSE_STATES.ACTIVE_CACHED, LICENSE_STATES.ACTIVE_VERIFIED, LICENSE_STATES.OFFLINE_GRACE].includes(session.state)) {
    $('#planValue').textContent = session.plan || 'Ativo';
    $('#expiryValue').textContent = formatDate(session.expiresAt);
    $('#deviceValue').textContent = shortDevice(session.deviceId);
    $('#sourceValue').textContent = session.source || '—';
    $('#mainMessage').textContent = describeState(session);
    return;
  }

  const titles = {
    [LICENSE_STATES.EXPIRED]: 'Acesso expirado',
    [LICENSE_STATES.DEVICE_LIMIT]: 'Limite de dispositivos atingido',
    [LICENSE_STATES.REVOKED]: 'Licença desativada',
    [LICENSE_STATES.ERROR]: 'Não foi possível validar',
    [LICENSE_STATES.ACTIVATION_REQUIRED]: 'Ative seu acesso'
  };
  $('#activationTitle').textContent = titles[session.state] || 'Ative seu acesso';
  $('#activationMessage').textContent = describeState(session);
  $('#activationBadge').textContent = session.state === LICENSE_STATES.EXPIRED ? 'Licença expirada' : 'Ativação necessária';
}

async function boot() {
  const session = await controller.start();
  renderSession(session);
}

$('#activateLicense').addEventListener('click', async () => {
  const button = $('#activateLicense');
  const feedback = $('#feedback');
  const key = $('#licenseKey').value.trim();
  feedback.className = 'feedback';
  feedback.textContent = '';

  if (!key) {
    feedback.classList.add('error');
    feedback.textContent = 'Digite a chave de acesso.';
    return;
  }

  button.disabled = true;
  try {
    const session = await controller.activate(key);
    renderSession(session);
    if (![LICENSE_STATES.ACTIVE_VERIFIED, LICENSE_STATES.ACTIVE_CACHED].includes(session.state)) {
      feedback.classList.add('error');
      feedback.textContent = describeState(session);
    }
  } finally {
    button.disabled = false;
  }
});

$('#validateNow').addEventListener('click', async () => {
  const button = $('#validateNow');
  button.disabled = true;
  try {
    const cached = await manager.readCachedSession();
    if (!cached?.licenseKey) {
      await manager.clearLocalSession();
      return boot();
    }
    controller.setView('booting', { state: LICENSE_STATES.BOOTING });
    const session = await manager.verify(cached, { reason: 'manual' });
    if ([LICENSE_STATES.ACTIVE_VERIFIED, LICENSE_STATES.OFFLINE_GRACE].includes(session.state)) {
      controller.setView('main', session);
    } else {
      controller.setView('activation', session);
    }
    renderSession(session);
  } finally {
    button.disabled = false;
  }
});

$('#clearSession').addEventListener('click', async () => {
  await manager.clearLocalSession();
  $('#licenseKey').value = '';
  await boot();
});

globalThis.addEventListener('superlovable:license-state', (event) => renderSession(event.detail));

boot();
