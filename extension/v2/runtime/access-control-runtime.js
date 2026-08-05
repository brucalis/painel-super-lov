const ADMIN_ROLES = new Set(['admin', 'administrator', 'owner', 'superadmin']);

function normalizeRole(value) {
  return String(value || 'user').trim().toLowerCase();
}

function ensureAdvancedProjectToggle(isAdmin) {
  const mount = document.querySelector('#projectMemoryMount');
  if (!mount || isAdmin || document.querySelector('#projectAdvancedToggle')) return;

  const button = document.createElement('button');
  button.id = 'projectAdvancedToggle';
  button.type = 'button';
  button.className = 'quiet-action project-advanced-toggle';
  button.textContent = 'Configurações avançadas do projeto';
  button.setAttribute('aria-expanded', 'false');
  mount.hidden = true;
  mount.before(button);

  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.textContent = expanded ? 'Configurações avançadas do projeto' : 'Ocultar configurações avançadas';
    mount.hidden = expanded;
  });
}

function applyRole(session = {}) {
  const role = normalizeRole(session.role);
  const isAdmin = ADMIN_ROLES.has(role);
  document.body.dataset.accessRole = isAdmin ? 'admin' : 'user';

  const integrationsNav = document.querySelector('[data-view="integrations"] span:nth-child(2)');
  if (integrationsNav) integrationsNav.textContent = isAdmin ? 'Integrações' : 'Conexões';

  const external = document.querySelector('#externalIntegrationsMount');
  if (external) external.hidden = !isAdmin;

  ensureAdvancedProjectToggle(isAdmin);
}

globalThis.addEventListener('superlovable:license-state', (event) => applyRole(event.detail || {}));

chrome.storage.local.get('slv2_license_session', (result) => {
  applyRole(result?.slv2_license_session || {});
});

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('v2/runtime/access-control.css');
document.head.appendChild(link);
