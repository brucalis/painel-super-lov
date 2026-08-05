const STORAGE_KEY = 'slv2_external_integrations';

export const PROVIDERS = Object.freeze([
  { id: 'stripe', name: 'Stripe', category: 'payments', auth: 'oauth_or_secret', capabilities: ['checkout', 'subscriptions', 'webhooks', 'refunds'] },
  { id: 'mercado_pago', name: 'Mercado Pago', category: 'payments', auth: 'oauth', capabilities: ['checkout', 'pix', 'subscriptions', 'webhooks'] },
  { id: 'paypal', name: 'PayPal', category: 'payments', auth: 'oauth', capabilities: ['checkout', 'subscriptions', 'webhooks', 'refunds'] },
  { id: 'resend', name: 'Resend', category: 'email', auth: 'secret', capabilities: ['transactional_email', 'domains', 'webhooks'] },
  { id: 'brevo', name: 'Brevo', category: 'email', auth: 'secret', capabilities: ['transactional_email', 'contacts', 'automations'] },
  { id: 'cloudinary', name: 'Cloudinary', category: 'storage', auth: 'secret', capabilities: ['images', 'transformations', 'delivery'] },
  { id: 'n8n', name: 'n8n', category: 'automation', auth: 'webhook_or_secret', capabilities: ['webhooks', 'workflows', 'events'] },
  { id: 'make', name: 'Make', category: 'automation', auth: 'webhook', capabilities: ['webhooks', 'scenarios', 'events'] },
  { id: 'custom_webhook', name: 'Webhook personalizado', category: 'webhooks', auth: 'url_and_secret', capabilities: ['receive', 'send', 'signatures', 'logs'] }
]);

const DEFAULT_STATE = Object.freeze({
  simulatorEnabled: true,
  connections: {},
  eventLog: []
});

function storageGet() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[STORAGE_KEY] || null);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    });
  });
}

export async function getExternalIntegrationsState() {
  return { ...DEFAULT_STATE, ...((await storageGet()) || {}) };
}

async function saveState(patch) {
  const current = await getExternalIntegrationsState();
  return storageSet({ ...current, ...patch });
}

function logEntry(providerId, type, status, message) {
  return { id: crypto.randomUUID(), providerId, type, status, message, createdAt: new Date().toISOString() };
}

export async function connectExternalProvider(providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) throw new Error('Integração não reconhecida.');
  const state = await getExternalIntegrationsState();
  if (!state.simulatorEnabled) throw new Error('O backend real desta integração ainda não foi configurado.');
  const connection = {
    providerId,
    status: 'connected',
    accountLabel: providerId === 'custom_webhook' ? 'Endpoint de teste' : 'Conta de demonstração',
    connectedAt: new Date().toISOString(),
    source: 'simulator',
    capabilities: provider.capabilities
  };
  const event = logEntry(providerId, 'connection', 'success', `${provider.name} conectado em modo de teste.`);
  await saveState({ connections: { ...state.connections, [providerId]: connection }, eventLog: [event, ...state.eventLog].slice(0, 100) });
  return connection;
}

export async function disconnectExternalProvider(providerId) {
  const state = await getExternalIntegrationsState();
  const connections = { ...state.connections };
  delete connections[providerId];
  const event = logEntry(providerId, 'disconnection', 'success', 'Integração desconectada.');
  await saveState({ connections, eventLog: [event, ...state.eventLog].slice(0, 100) });
}

export async function testExternalProvider(providerId, action = 'connection') {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  const state = await getExternalIntegrationsState();
  if (!provider) throw new Error('Integração não reconhecida.');
  if (!state.connections[providerId]) throw new Error(`Conecte ${provider.name} antes de testar.`);
  await new Promise((resolve) => setTimeout(resolve, 450));
  const result = {
    success: true,
    providerId,
    action,
    requestId: `sim-${crypto.randomUUID()}`,
    message: action === 'webhook' ? 'Webhook de teste recebido e assinatura validada.' : 'Conexão testada com sucesso.',
    checkedAt: new Date().toISOString()
  };
  const event = logEntry(providerId, action, 'success', result.message);
  await saveState({ eventLog: [event, ...state.eventLog].slice(0, 100) });
  return result;
}

export async function listExternalEvents() {
  return (await getExternalIntegrationsState()).eventLog;
}
