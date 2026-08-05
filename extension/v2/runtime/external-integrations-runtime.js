import {
  PROVIDERS,
  connectExternalProvider,
  disconnectExternalProvider,
  getExternalIntegrationsState,
  listExternalEvents,
  testExternalProvider
} from '../core/external-integrations-adapter.js';

const CATEGORY_LABELS = {
  payments: 'Pagamentos',
  email: 'E-mail',
  storage: 'Mídia',
  automation: 'Automação',
  webhooks: 'Webhooks'
};

const $ = (selector) => document.querySelector(selector);
let state = await getExternalIntegrationsState();

function providerCard(provider) {
  const connected = Boolean(state.connections[provider.id]);
  return `
    <article class="external-card" data-provider="${provider.id}">
      <div class="external-card-top">
        <span class="external-logo">${provider.name.slice(0, 2).toUpperCase()}</span>
        <div><h3>${provider.name}</h3><p>${CATEGORY_LABELS[provider.category] || provider.category}</p></div>
        <span class="external-status ${connected ? 'connected' : ''}">${connected ? 'Conectado' : 'Não conectado'}</span>
      </div>
      <div class="external-capabilities">${provider.capabilities.map((item) => `<span>${item.replaceAll('_', ' ')}</span>`).join('')}</div>
      <div class="external-actions">
        <button data-external-action="${connected ? 'test' : 'connect'}">${connected ? 'Testar' : 'Conectar'}</button>
        ${connected ? '<button data-external-action="disconnect" class="danger-text">Desconectar</button>' : ''}
        ${connected && provider.capabilities.includes('webhooks') ? '<button data-external-action="webhook">Testar webhook</button>' : ''}
      </div>
    </article>`;
}

async function render() {
  state = await getExternalIntegrationsState();
  const grid = $('#externalIntegrationsGrid');
  if (grid) grid.innerHTML = PROVIDERS.map(providerCard).join('');
  const events = await listExternalEvents();
  const target = $('#externalEvents');
  if (target) {
    target.innerHTML = events.length
      ? events.slice(0, 12).map((event) => `<li><span class="event-dot ${event.status}"></span><div><strong>${event.message}</strong><small>${new Date(event.createdAt).toLocaleString('pt-BR')}</small></div></li>`).join('')
      : '<li class="external-empty">Nenhum evento registrado.</li>';
  }
}

async function handleAction(button) {
  const card = button.closest('[data-provider]');
  const providerId = card?.dataset.provider;
  if (!providerId) return;
  const feedback = $('#externalFeedback');
  button.disabled = true;
  feedback.textContent = 'Processando…';
  try {
    if (button.dataset.externalAction === 'connect') {
      await connectExternalProvider(providerId);
      feedback.textContent = 'Integração conectada em modo de teste.';
    } else if (button.dataset.externalAction === 'disconnect') {
      await disconnectExternalProvider(providerId);
      feedback.textContent = 'Integração desconectada.';
    } else if (button.dataset.externalAction === 'webhook') {
      const result = await testExternalProvider(providerId, 'webhook');
      feedback.textContent = result.message;
    } else {
      const result = await testExternalProvider(providerId, 'connection');
      feedback.textContent = result.message;
    }
    await render();
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-external-action]');
  if (button) void handleAction(button);
});

void render();
