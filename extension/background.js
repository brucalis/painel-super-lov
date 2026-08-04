// SUPER LOVABLE — background service worker (MV3)
// Além de repassar uploads e consultas, hospeda o motor único da fila:
// é ele que envia ou enfileira, detecta a conclusão e avança sozinho,
// inclusive com o popup fechado.
importScripts('modules/device-identity-manager.js');
importScripts('modules/license-client.js');
importScripts('modules/lovable-sender.js');
importScripts('modules/queue-engine.js');

const LICENSE_ALARM = 'super_lovable_license_check';
const QUEUE_ALARM = 'super_lovable_queue_tick';


// Validação na instalação/atualização e a cada início do navegador.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (typeof DeviceIdentityManager !== 'undefined') {
    await DeviceIdentityManager.ensure({ reason: details.reason });
  }
  bootLicense('instalação');
});
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
  if (alarm.name === QUEUE_ALARM) {
    QueueEngine.tick().catch(() => {});
    return;
  }
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
const PROTECTED = new Set([
  'uploadToStorage',
  'superLovableForward',
  'superLovableTool',
  'SUPER_LOVABLE_SUBMIT_PROMPT',
  'SUPER_LOVABLE_ENQUEUE_PROMPT',
]);

// Ações da fila que apenas leem/controlam o estado (sem envio).
const QUEUE_CONTROL = {
  SUPER_LOVABLE_QUEUE_SNAPSHOT: () => QueueEngine.snapshot(),
  SUPER_LOVABLE_QUEUE_TICK: () => QueueEngine.tick().then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_PAUSE: () => QueueEngine.pause().then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_RESUME: () => QueueEngine.resume().then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_CONFIRM: () => QueueEngine.confirmCompletion(),
  SUPER_LOVABLE_QUEUE_KEEP_WAITING: () => QueueEngine.keepWaiting(),
  SUPER_LOVABLE_QUEUE_RETRY: (d) => QueueEngine.retry(d.id).then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_SKIP: (d) => QueueEngine.skip(d.id).then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_EDIT: (d) => QueueEngine.edit(d.id, d.text).then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_SEND_NOW: (d) => QueueEngine.sendNow(d.id),
  SUPER_LOVABLE_QUEUE_SET_MODE: (d) => QueueEngine.setMode(d.id, d.mode),
  SUPER_LOVABLE_QUEUE_REMOVE: (d) => QueueEngine.remove(d.id).then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_MOVE: (d) => QueueEngine.moveTo(d.id, d.index).then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_DUPLICATE: (d) => QueueEngine.duplicate(d.id).then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_CLEAR_DONE: () => QueueEngine.clearDone().then(() => ({ success: true })),
  SUPER_LOVABLE_QUEUE_CLEAR_ALL: () => QueueEngine.clearAll().then(() => ({ success: true })),
  SUPER_LOVABLE_EXECUTION_STATE: (d) => QueueEngine.getLovableExecutionState(d && d.projectId),
};

const QUEUE_KEY = 'lca_queue';
const PENDING_KEY = 'super_lovable_pending_history';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const action = request.action || request.type;

  if (action === 'licenseChanged') {
    bootLicense().then(() => sendResponse({ success: true }));
    return true;
  }

  if (action === 'licenseStatus') {
    LicenseClient.getStoredLicense().then((state) =>
      sendResponse({ success: true, active: LicenseClient.hasActiveLicense(state), status: state.status })
    );
    return true;
  }

  if (QUEUE_CONTROL[action]) {
    QUEUE_CONTROL[action](request.data || {})
      .then((r) => sendResponse({ success: true, ...r }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (PROTECTED.has(action)) {
    licenseGate().then((gate) => {
      if (!gate.allowed) return sendResponse({ success: false, blocked: true, error: gate.reason });
      handleProtected({ ...request, action }).then(sendResponse).catch((err) =>
        sendResponse({ success: false, error: err.message })
      );
    });
    return true;
  }

  if (action === 'apiFetch') {
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
  if (request.action === 'SUPER_LOVABLE_SUBMIT_PROMPT') {
    return QueueEngine.submitOrQueuePrompt(request.data || {});
  }
  if (request.action === 'SUPER_LOVABLE_ENQUEUE_PROMPT') {
    const data = { ...(request.data || {}), forceQueue: true };
    return QueueEngine.submitOrQueuePrompt({ ...data, forceQueue: true });
  }
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
 * Agora usa a mesma função central: envia na hora quando a Lovable está livre
 * e enfileira automaticamente quando há execução em andamento.
 */
async function handleForward({ text, projectId, origin }) {
  void QUEUE_KEY; void PENDING_KEY;
  const res = await QueueEngine.submitOrQueuePrompt({
    text,
    projectId,
    source: origin === 'native_toolbar' ? 'native_toolbar' : 'native_chat',
    attachments: [],
  });
  const snap = await QueueEngine.snapshot();
  return { ...res, queueSize: snap.summary.total, position: res.position || snap.summary.total };
}


bootLicense();

// Mantém a fila viva mesmo com o popup fechado: alarme periódico + tick imediato.
chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 0.5 });
QueueEngine.scheduleTick(1500);

