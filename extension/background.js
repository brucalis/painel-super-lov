// Lovable Chat Assistant - background service worker (MV3)

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
  return false;
});

async function handleUpload({ url, headers, body }) {
  const bytes = new Uint8Array(body);
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: bytes,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload GCS falhou: ${res.status} ${text.slice(0, 200)}`);
  }
  return { success: true, status: res.status };
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
