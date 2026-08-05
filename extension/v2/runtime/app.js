import { LicenseSessionManager, LICENSE_STATES } from '../core/license-session.js';
import { LicenseBootstrapController } from '../core/license-bootstrap-controller.js';
import { activateLicenseRemote, validateLicenseRemote } from '../core/license-api-adapter.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const manager = new LicenseSessionManager({
  validateRemote: (payload) => payload.reason === 'activation'
    ? activateLicenseRemote(payload)
    : validateLicenseRemote(payload)
});

const controller = new LicenseBootstrapController({
  sessionManager: manager,
  root: document.body,
  loadingElement: $('[data-license-loading]'),
  mainElement: $('[data-license-main]'),
  gateElement: $('[data-license-gate]'),
  statusElement: $('#licenseStatus')
});

const VIEW_META = {
  create: ['CRIAR', 'O que você quer alterar?'],
  queue: ['FILA', 'Alterações aguardando execução'],
  history: ['HISTÓRICO', 'Tudo o que já foi alterado'],
  projects: ['PROJETOS', 'Escolha o repositório conectado'],
  tools: ['FERRAMENTAS', 'Ações técnicas do projeto'],
  integrations: ['INTEGRAÇÕES', 'Conecte os serviços necessários'],
  help: ['AJUDA', 'Orientações para cada configuração'],
  settings: ['CONFIGURAÇÕES', 'Preferências e acesso']
};

function isAllowed(session) {
  return [LICENSE_STATES.ACTIVE_CACHED, LICENSE_STATES.ACTIVE_VERIFIED, LICENSE_STATES.OFFLINE_GRACE].includes(session?.state);
}

function formatDate(value) {
  if (!value) return 'Sem prazo informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

function shortDevice(value) {
  if (!value) return '—';
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

function stateCopy(session) {
  const map = {
    [LICENSE_STATES.EXPIRED]: ['Licença expirada', 'Seu período de acesso terminou. Renove para continuar usando a extensão.'],
    [LICENSE_STATES.DEVICE_LIMIT]: ['Limite de dispositivos', 'Esta licença já atingiu o número máximo de dispositivos autorizados.'],
    [LICENSE_STATES.REVOKED]: ['Licença desativada', 'Esta licença foi desativada no painel administrativo.'],
    [LICENSE_STATES.ERROR]: ['Não foi possível validar', session?.message || 'Verifique sua conexão e tente novamente.'],
    [LICENSE_STATES.ACTIVATION_REQUIRED]: ['Ative seu acesso', session?.message || 'Informe a chave recebida na compra.']
  };
  return map[session?.state] || ['Ative seu acesso', session?.message || 'Informe sua chave.'];
}

function renderLicense(session) {
  if (!session) return;

  if (isAllowed(session)) {
    $('#licenseSummary').textContent = session.plan ? `${session.plan} ativo` : 'Licença ativa';
    $('#settingsPlan').textContent = session.plan || 'Ativo';
    $('#settingsExpiry').textContent = formatDate(session.expiresAt);
    $('#settingsDevice').textContent = shortDevice(session.deviceId);
    $('[data-license-main]').removeAttribute('aria-disabled');
    $('.workspace').setAttribute('aria-busy', 'false');
    return;
  }

  const [title, message] = stateCopy(session);
  $('#gateTitle').textContent = title;
  $('#gateMessage').textContent = message;
  $('#gateBadge').textContent = title;
  $('#licenseStatus').textContent = session.message || '';
  $('#licenseStatus').dataset.state = session.state || '';
  $('[data-license-main]').setAttribute('aria-disabled', 'true');
}

function activateView(name) {
  if (!isAllowed(window.__SLV2_LICENSE__)) return;

  $$('.nav-item[data-view]').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  $$('.panel-view').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
  const [eyebrow, title] = VIEW_META[name] || VIEW_META.create;
  $('#viewEyebrow').textContent = eyebrow;
  $('#viewTitle').textContent = title;
}

function wireInterface() {
  $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => activateView(button.dataset.view)));

  $$('.shortcut-strip button[data-shortcut]').forEach((button) => button.addEventListener('click', () => {
    const input = $('#taskInput');
    const prefix = button.dataset.shortcut;
    input.value = input.value.trim() ? `${prefix}\n\n${input.value.trim()}` : prefix;
    input.focus();
  }));

  $('#improveButton').addEventListener('click', () => {
    const input = $('#taskInput');
    const original = input.value.trim();
    if (!original) {
      input.focus();
      return;
    }
    input.value = `OBJETIVO\n${original}\n\nRESTRIÇÕES\n- Preservar funcionalidades existentes.\n- Não alterar áreas não solicitadas.\n\nCRITÉRIOS DE ACEITE\n- Implementação funcional e sem regressões.`;
  });

  $('#planButton').addEventListener('click', () => {
    if (!isAllowed(window.__SLV2_LICENSE__)) return;
    const input = $('#taskInput');
    if (!input.value.trim()) {
      input.focus();
      return;
    }
    $('#connectionSummary').textContent = 'GitHub ainda não conectado';
    activateView('integrations');
  });

  $('#connectGithub').addEventListener('click', () => activateView('integrations'));
  $('#projectSelector').addEventListener('click', () => activateView('projects'));
}

async function validateNow() {
  const button = $('#validateLicenseNow');
  button.disabled = true;
  $('.workspace').setAttribute('aria-busy', 'true');
  try {
    const cached = await manager.readCachedSession();
    if (!cached?.licenseKey) {
      await manager.clearLocalSession();
      const session = await controller.start();
      window.__SLV2_LICENSE__ = session;
      renderLicense(session);
      return;
    }

    controller.setView('booting', { state: LICENSE_STATES.BOOTING });
    const session = await manager.verify(cached, { reason: 'manual' });
    window.__SLV2_LICENSE__ = session;
    if (isAllowed(session)) controller.setView('main', session);
    else controller.setView('activation', session);
    renderLicense(session);
  } finally {
    button.disabled = false;
    $('.workspace').setAttribute('aria-busy', 'false');
  }
}

$('#activateLicense').addEventListener('click', async () => {
  const button = $('#activateLicense');
  const key = $('#licenseKey').value.trim();
  if (!key) {
    $('#licenseStatus').textContent = 'Digite a chave de acesso.';
    $('#licenseStatus').dataset.state = 'error';
    return;
  }

  button.disabled = true;
  try {
    const session = await controller.activate(key);
    window.__SLV2_LICENSE__ = session;
    renderLicense(session);
  } finally {
    button.disabled = false;
  }
});

$('#validateLicenseNow').addEventListener('click', validateNow);

globalThis.addEventListener('superlovable:license-state', (event) => {
  if (!event.detail || event.detail.state === LICENSE_STATES.BOOTING) return;
  window.__SLV2_LICENSE__ = event.detail;
  renderLicense(event.detail);
});

wireInterface();
const initialSession = await controller.start();
window.__SLV2_LICENSE__ = initialSession;
renderLicense(initialSession);
