const VISUAL_KEY = 'slv2_visual_selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ slv2_last_installed_at: new Date().toISOString() }).catch(() => {});
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request?.action || request?.type;

  if (action === 'SLV2_VISUAL_SELECTION') {
    const selection = request.selection || null;
    chrome.storage.local.set({ [VISUAL_KEY]: selection }).then(() => {
      chrome.runtime.sendMessage({ action: 'SLV2_VISUAL_SELECTION_UPDATED', selection }).catch(() => {});
      sendResponse({ success: true });
    }).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (action === 'SLV2_GET_VISUAL_SELECTION') {
    chrome.storage.local.get(VISUAL_KEY).then((result) => {
      sendResponse({ success: true, selection: result?.[VISUAL_KEY] || null });
    }).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (action === 'SLV2_CLEAR_VISUAL_SELECTION') {
    chrome.storage.local.remove(VISUAL_KEY).then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (action === 'SLV2_OPEN_POPUP') {
    chrome.action.openPopup().then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (action === 'SLV2_DOWNLOAD_URL') {
    const { url, filename, saveAs = true } = request.data || {};
    if (!url) {
      sendResponse({ success: false, error: 'URL de download ausente.' });
      return false;
    }
    chrome.downloads.download({ url, filename, saveAs }).then((downloadId) => {
      sendResponse({ success: true, downloadId });
    }).catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});
