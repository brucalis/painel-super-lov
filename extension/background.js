// SUPER LOVABLE — background service worker (MV3)
// Não monta requisições de chat: apenas repassa uploads, consultas e registros.

const QUEUE_KEY = 'lca_queue';
const PENDING_KEY = 'super_lovable_pending_history';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'uploadToStorage') {
    handleUpload(request.data).then(sendResponse).catch((err) =>
      sendResponse({ success: false, error: err.message })
    );
    return true; // resposta assíncrona
  }

  if (request.action === 'apiFetch') {
    handleApiFetch(request.data).then(sendResponse).catch((err) =>
      sendResponse({ success: false, error: err.message })
    );
    return true;
  }

  if (request.action === 'superLovableForward') {
    handleForward(request.data).then(sendResponse).catch((err) =>
      sendResponse({ success: false, error: err.message })
    );
    return true;
  }

  if (request.action === 'superLovableTool') {
    chrome.storage.local.set({ super_lovable_pending_tool: request.data });
    sendResponse({ success: true });
    return true;
  }
  return false;
});

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
