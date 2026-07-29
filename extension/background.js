// SUPER LOVABLE — background service worker (MV3)
// Não monta requisições de chat: apenas repassa uploads, consultas e registros.
importScripts('modules/license-client.js');

const LICENSE_ALARM = 'super_lovable_license_check';

// Validação na instalação/atualização e a cada início do navegador.
chrome.runtime.onInstalled.addListener(() => { bootLicense('instalação'); });
chrome.runtime.onStartup.addListener(() => { bootLicense('início do navegador'); });

async function bootLicense() {
  try {
    await LicenseClient.getDeviceId(); // primeira execução: cria o identificador
    await chrome.alarms.create(LICENSE_ALARM, { periodInMinutes: 720 }); // 12 horas
    const state = await LicenseClient.getStoredLicense();
    if (state.license_token) await LicenseClient.validateLicense();
    await broadcastLicense();
  } catch (e) {
    console.warn('Licença: verificação inicial indisponível.', e.message);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== LICENSE_ALARM) return;
  const state = await LicenseClient.getStoredLicense();
  if (!state.license_token) return;
  await LicenseClient.validateLicense();
  await broadcastLicense();
});

async function broadcastLicense() {
  const state = await LicenseClient.getStoredLicense();
  const active = LicenseClient.hasActiveLicense(state);
  try { await chrome.runtime.sendMessage({ action: 'licenseState', active }); } catch (e) { /* sem ouvintes */ }
  try {
    const tabs = await chrome.tabs.query({ url: ['https://lovable.dev/*', 'https://*.lovable.dev/*'] });
    for (const t of tabs) chrome.tabs.sendMessage(t.id, { action: 'licenseState', active }, () => chrome.runtime.lastError);
  } catch (e) { /* nenhuma aba aberta */ }
  return active;
}

/** Portão das operações protegidas: revalida quando a confirmação está antiga. */
async function licenseGate() {
  const res = await LicenseClient.ensureFresh();
  if (res.ok) return { allowed: true };
  return { allowed: false, reason: res.message || LicenseClient.REASONS.none };
}

// Ações que exigem licença ativa (o restante da extensão segue intacto).
const PROTECTED = new Set(['uploadToStorage', 'superLovableForward', 'superLovableTool']);

const QUEUE_KEY = 'lca_queue';
const PENDING_KEY = 'super_lovable_pending_history';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'licenseChanged') {
    bootLicense().then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'licenseStatus') {
    LicenseClient.getStoredLicense().then((state) =>
      sendResponse({ success: true, active: LicenseClient.hasActiveLicense(state), status: state.status })
    );
    return true;
  }

  if (PROTECTED.has(request.action)) {
    licenseGate().then((gate) => {
      if (!gate.allowed) return sendResponse({ success: false, blocked: true, error: gate.reason });
      handleProtected(request).then(sendResponse).catch((err) =>
        sendResponse({ success: false, error: err.message })
      );
    });
    return true;
  }

  if (request.action === 'apiFetch') {
    handleApiFetch(request.data).then(sendResponse).catch((err) =>
      sendResponse({ success: false, error: err.message })
    );
    return true;
  }
  return false;
});

/** Despacha as ações protegidas depois da verificação de licença. */
async function handleProtected(request) {
  if (request.action === 'uploadToStorage') return handleUpload(request.data);
  if (request.action === 'superLovableForward') return handleForward(request.data);
  if (request.action === 'superLovableTool') {
    await chrome.storage.local.set({ super_lovable_pending_tool: request.data });
    return { success: true };
  }
  return { success: false, error: 'Ação desconhecida.' };
}


async function handleUpload({ url, headers, body, byteLength }) {
  const bytes = new Uint8Array(body);
  if (byteLength && bytes.byteLength !== byteLength) {
    throw new Error(`Bytes perdidos no transporte (${bytes.byteLength} de ${byteLength}).`);
  }
  const res = await fetch(url, { method: 'PUT', headers, body: bytes });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload GCS falhou: ${res.status} ${text.slice(0, 200)}`);
  }
  return { success: true, status: res.status, bytes: bytes.byteLength };
}

async function handleApiFetch({ url, method, headers, body }) {
  const res = await fetch(url, {
    method: method || 'GET',
    headers,
    body,
    credentials: 'include',
  });
  const text = await res.text();
  return { success: res.ok, status: res.status, body: text };
}

/**
 * Texto capturado no campo nativo da Lovable.
 * O envio real continua exclusivamente no fluxo original do popup: aqui o
 * pedido só entra na fila e no registro pendente de histórico.
 */
async function handleForward({ text, projectId, origin }) {
  const store = await chrome.storage.local.get([QUEUE_KEY, PENDING_KEY]);
  const queue = Array.isArray(store[QUEUE_KEY]) ? store[QUEUE_KEY] : [];
  const item = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text,
    model: 'auto',
    mode: 'prompt',
    date: Date.now(),
    attempts: 0,
    status: 'pendente',
    error: null,
    origin: origin || 'chat nativo redirecionado',
    projectId: projectId || null,
    attachmentNames: [],
  };
  queue.push(item);

  const pending = Array.isArray(store[PENDING_KEY]) ? store[PENDING_KEY] : [];
  pending.push({
    text,
    project: projectId || null,
    status: 'na fila',
    origin: item.origin,
    date: item.date,
    attachments: [],
  });

  await chrome.storage.local.set({ [QUEUE_KEY]: queue, [PENDING_KEY]: pending.slice(-100) });
  try {
    await chrome.action.setBadgeText({ text: String(queue.length) });
    await chrome.action.setBadgeBackgroundColor({ color: '#8B5CF6' });
  } catch (e) { /* badge é opcional */ }

  return { success: true, queued: true, position: queue.length, queueSize: queue.length };
}

bootLicense();
