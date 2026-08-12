// BYPASS INJECTED

// Capture Lovable Bearer token from outgoing api.lovable.dev requests
try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      try {
        const headers = details.requestHeaders || [];
        const authHeader = headers.find(h => h.name && h.name.toLowerCase() === "authorization");
        if (!authHeader || !authHeader.value || !authHeader.value.startsWith("Bearer ")) return;
        chrome.storage.local.set({
          lovableBearerToken: authHeader.value,
          lovableBearerTokenCapturedAt: Date.now()
        });
      } catch(e) {}
    },
    { urls: ["https://api.lovable.dev/*"] },
    ["requestHeaders", "extraHeaders"]
  );
} catch(e) {
  console.warn("[Background] webRequest listener failed:", e && e.message);
}

// Update/branding remote checks were removed. The extension no longer contacts
// the previous owner's Supabase or update endpoints; the helpers below are kept
// as inert no-ops so existing call sites remain valid.
let extUpdateState = { checkedAt: 0, blocked: false, data: null };

// Neutralized: no longer contacts the previous owner's update servers.
async function extFetchRelease() {
  return null;
}

// Neutralized: never blocks the extension and never fetches remote update data.
// It simply clears any stale "update" state so the panel stays unlocked.
async function refreshExtensionBlockState(force) {
  extUpdateState = { checkedAt: Date.now(), blocked: false, data: null };
  try {
    chrome.storage.local.set({
      lp_update_blocked: false,
      lp_force_update: false,
      lp_latest_version: null,
      lp_download_url: null,
      lp_update_title: null,
      lp_update_changelog: null,
      lp_update_checked_at: Date.now(),
    });
  } catch (_) {}
  return extUpdateState;
}

function openMandatoryUpdate(data) {
  // Neutralized: no external download tab is opened.
}

// Neutralized: no remote branding is fetched from the previous owner's Supabase.
async function prefetchBranding() {
  return;
}

try {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
      soundNotificationsEnabled: true
    });
    prefetchBranding();
  });
  chrome.runtime.onStartup.addListener(() => { prefetchBranding(); refreshExtensionBlockState(true); });
  // Also prefetch immediately on service-worker boot
  prefetchBranding();
  refreshExtensionBlockState(true);
  setInterval(() => refreshExtensionBlockState(true), 20000);
} catch(_){}



// The extension UI now lives as an overlay injected into lovable.dev by
// the content script. The chrome.sidePanel API is kept only as a fallback
// for users that explicitly open it; the icon click toggles the overlay.

async function openLovableTabAndToggle() {
  try {
    const tabs = await chrome.tabs.query({ url: ["https://lovable.dev/*", "https://*.lovable.dev/*"] });
    let target = tabs && tabs[0];
    if (!target) {
      target = await chrome.tabs.create({ url: "https://lovable.dev/" });
      return; // content script will mount overlay on load (default expanded)
    }
    try { await chrome.tabs.update(target.id, { active: true }); } catch (_) {}
    try { await chrome.windows.update(target.windowId, { focused: true }); } catch (_) {}
    chrome.tabs.sendMessage(target.id, { type: "TS_TOGGLE_OVERLAY" }, () => void chrome.runtime.lastError);
  } catch (err) {
    console.error("[Background] toggle overlay error:", err);
  }
}

async function openLovableTabAndShowExtension() {
  try {
    const tabs = await chrome.tabs.query({ url: ["https://lovable.dev/*", "https://*.lovable.dev/*"] });
    let target = tabs && tabs[0];
    if (!target) {
      await chrome.storage.local.set({ sidebarCollapsed: false, tsExtensionLayoutMode: "sidebar" });
      await chrome.tabs.create({ url: "https://lovable.dev/" });
      return;
    }
    try { await chrome.tabs.update(target.id, { active: true }); } catch (_) {}
    try { await chrome.windows.update(target.windowId, { focused: true }); } catch (_) {}
    await chrome.storage.local.set({ sidebarCollapsed: false, tsExtensionLayoutMode: "sidebar" });
  } catch (err) {
    console.error("[Background] show blocked extension error:", err);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const updateState = await refreshExtensionBlockState(true);
  if (updateState.blocked) {
    await openLovableTabAndShowExtension();
    return;
  }
  if (tab && tab.url && /^https:\/\/([^/]+\.)?lovable\.dev\//.test(tab.url)) {
    chrome.tabs.sendMessage(tab.id, { type: "TS_TOGGLE_OVERLAY" }, () => void chrome.runtime.lastError);
    return;
  }
  await openLovableTabAndToggle();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg && msg.action === "getUpdateStatus") {
    refreshExtensionBlockState(true).then((state) => sendResponse({ ok: true, blocked: state.blocked, data: state.data }));
    return true;
  }

  if (extUpdateState.blocked) {
    sendResponse({ ok: false, success: false, update_required: true, error: "Atualização disponível. Atualize a extensão quando quiser." });
    return true;
  }

  refreshExtensionBlockState(false);

  if (msg && msg.action === "lovableSync") {
    const updates = {};
    if (msg.token) updates.lovable_token = msg.token;
    if (msg.projectId) updates.lovable_projectId = msg.projectId;
    if (Object.keys(updates).length) {
      chrome.storage.local.set(updates, () => {
      });
    }
  }


  if (msg && msg.action === "openSidePanel") {
    // This can only work if triggered from a user gesture context
    if (sender.tab && sender.tab.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        console.warn("[Background] openSidePanel deferred:", err.message);
        sendResponse({ ok: false, error: err.message });
      });
    } else {
      sendResponse({ ok: false, error: "No tab context" });
    }
    return true;
  }



  if (msg && msg.action === "lovableApiFetch") {
    (async () => {
      try {
        let tab = null;
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTabs && activeTabs[0] && /^https:\/\/([^/]+\.)?lovable\.dev\//.test(activeTabs[0].url || '')) {
          tab = activeTabs[0];
        } else {
          const lovableTabs = await chrome.tabs.query({ url: ["https://lovable.dev/*", "https://*.lovable.dev/*"] });
          tab = (lovableTabs && lovableTabs[0]) || null;
        }
        if (!tab || !tab.id) {
          sendResponse({ ok: false, status: 0, data: { error: "Abra uma aba do Lovable antes de enviar." } });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: async (url, options) => {
            try {
              const r = await fetch(url, options);
              const text = await r.text();
              let data;
              try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
              return { ok: r.ok, status: r.status, data };
            } catch (err) {
              return { ok: false, status: 0, data: { error: (err && err.message) || 'fetch failed in page' } };
            }
          },
          args: [msg.url, {
            method: msg.method || 'POST',
            headers: msg.headers || {},
            body: msg.body || null,
            credentials: 'include',
          }],
        });
        const value = (results && results[0] && results[0].result) || { ok: false, status: 0, data: { error: 'sem resposta da página Lovable' } };
        sendResponse(value);
      } catch (err) {
        console.error("[Background] lovableApiFetch error:", err);
        sendResponse({ ok: false, status: 0, data: { error: err.message || "Falha no executeScript." } });
      }
    })();
    return true;
  }

  if (msg && msg.action === "proxyFetch") {
    (async () => {
      try {
        var opts = {
          method: msg.method || "POST",
          headers: msg.headers || {},
        };
        if (msg.body) opts.body = msg.body;
        var resp = await fetch(msg.url, opts);
        var text = await resp.text();
        var data;
        try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
        sendResponse({ ok: resp.ok, status: resp.status, data: data });
      } catch(err) {
        console.error("[Background] proxyFetch error:", err);
        sendResponse({ ok: false, status: 0, data: { error: err.message || "Fetch failed in background" } });
      }
    })();
    return true;
  }

  // --- READ_COOKIES: read HttpOnly cookies for JWT token ---
  if (msg && msg.action === "readCookies") {
    var cookieNames = [
      "lovable-session-id.id",
      "lovable-session-id.custom",
      "lovable-session-id.refresh",
      "lovable-session-id.sig"
    ];
    var foundTokens = [];
    var checkedCount = 0;
    cookieNames.forEach(function(name) {
      chrome.cookies.get({ url: "https://lovable.dev", name: name }, function(cookie) {
        checkedCount++;
        if (cookie && cookie.value) {
          var parts = cookie.value.split(".");
          if (parts.length === 3 && cookie.value.indexOf("eyJ") === 0) {
            foundTokens.push({
              token: cookie.value,
              cookieName: name,
              httpOnly: cookie.httpOnly
            });
          }
        }
        if (checkedCount === cookieNames.length) {
          sendResponse({ success: foundTokens.length > 0, tokens: foundTokens });
        }
      });
    });
    return true;
  }

  // --- DOWNLOAD_PROJECT: fetch project source code from Lovable API ---
  if (msg && msg.action === "downloadProject") {
    (async function() {
      // Tenta os dois domínios da API do Lovable — o antigo e o novo.
      var bases = ["https://lovable-api.com", "https://api.lovable.dev"];
      var lastError = "Download falhou";
      for (var bi = 0; bi < bases.length; bi++) {
        try {
          var apiUrl = bases[bi] + "/projects/" + msg.projectId + "/source-code";
          var resp = await fetch(apiUrl, {
            method: "GET",
            headers: {
              "Authorization": "Bearer " + msg.token,
              "Accept": "application/json"
            }
          });
          if (!resp.ok) { lastError = "API retornou " + resp.status; continue; }
          var data = await resp.json();
          sendResponse({ success: true, files: data.files || [] });
          return;
        } catch(err) {
          lastError = err.message || "Download falhou";
        }
      }
      sendResponse({ success: false, error: lastError });
    })();
    return true;
  }

});

// Create Lovable project directly via page (ported from working extension)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== "createLovableProjectInPage") return;
  (async () => {
    try {
      let tab = null;
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs && activeTabs[0] && /^https:\/\/([^/]+\.)?lovable\.dev\//.test(activeTabs[0].url || '')) {
        tab = activeTabs[0];
      } else {
        const lovableTabs = await chrome.tabs.query({ url: ["https://lovable.dev/*", "https://*.lovable.dev/*"] });
        tab = (lovableTabs && lovableTabs[0]) || null;
      }
      if (!tab || !tab.id) {
        sendResponse({ ok: false, error: "Abra uma aba do Lovable antes de criar o projeto." });
        return;
      }
      const stored = await chrome.storage.local.get(['lovable_token', 'lovable_token_global', 'lovableBearerToken']);
      const token = String((msg.token || stored.lovableBearerToken || stored.lovable_token_global || stored.lovable_token || '')).replace(/^Bearer\s+/i, '').trim();

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          files: ['castle-v2.js'],
        });
      } catch (e) {
        console.warn('[Background] Castle script inject falhou:', e && e.message);
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: async ({ token, title }) => {
          const API_BASE = 'https://api.lovable.dev';
          const CASTLE_PK = 'pk_TaKsqF94pjCsoyepV6mH3V24AXoM6A7M';
          const asJson = async (response) => { const text = await response.text(); try { return JSON.parse(text); } catch (e) { return { raw: text }; } };
          const readFirebaseAuth = async () => {
            const fromValue = (value) => {
              if (!value || typeof value !== 'object') return null;
              const user = value.value && typeof value.value === 'object' ? value.value : value;
              const manager = user.stsTokenManager || user.tokenManager || {};
              const accessToken = manager.accessToken || user.accessToken || '';
              const refreshToken = manager.refreshToken || user.refreshToken || '';
              const expirationTime = Number(manager.expirationTime || user.expirationTime || 0);
              if (!accessToken && !refreshToken) return null;
              return { accessToken, refreshToken, expirationTime };
            };
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i) || '';
                if (!/firebase:authUser|authUser/i.test(key)) continue;
                const parsed = JSON.parse(localStorage.getItem(key) || 'null');
                const found = fromValue(parsed);
                if (found) return found;
              }
            } catch (e) {}
            try {
              return await new Promise((resolve) => {
                const req = indexedDB.open('firebaseLocalStorageDb');
                req.onerror = () => resolve(null);
                req.onsuccess = () => {
                  const db = req.result;
                  try {
                    const tx = db.transaction('firebaseLocalStorage', 'readonly');
                    const store = tx.objectStore('firebaseLocalStorage');
                    const all = store.getAll();
                    all.onerror = () => resolve(null);
                    all.onsuccess = () => {
                      const rows = all.result || [];
                      for (const row of rows) { const found = fromValue(row); if (found) { resolve(found); return; } }
                      resolve(null);
                    };
                  } catch (e) { resolve(null); }
                };
              });
            } catch (e) { return null; }
          };
          const refreshFirebaseToken = async (refreshToken) => {
            if (!refreshToken) return '';
            try {
              const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
              const r = await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyBQNjlw9Vp4tP4VVeANzyPJnqbG2wLbYPw', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
              const data = await asJson(r);
              return r.ok ? (data.id_token || data.access_token || '') : '';
            } catch (e) { return ''; }
          };
          const readSupabaseAuth = () => {
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i) || '';
                if (!/^sb-.*-auth-token$/.test(key)) continue;
                const raw = localStorage.getItem(key); if (!raw) continue;
                let parsed; try { parsed = JSON.parse(raw); } catch (e) { continue; }
                let accessToken = '', refreshToken = '', expiresAt = 0;
                if (Array.isArray(parsed)) { accessToken = parsed[0] || ''; refreshToken = parsed[1] || ''; }
                else if (parsed && typeof parsed === 'object') {
                  accessToken = parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token) || '';
                  refreshToken = parsed.refresh_token || (parsed.currentSession && parsed.currentSession.refresh_token) || '';
                  expiresAt = Number(parsed.expires_at || (parsed.currentSession && parsed.currentSession.expires_at) || 0);
                }
                if (accessToken) return { accessToken, refreshToken, expirationTime: expiresAt * 1000 };
              }
            } catch (e) {}
            return null;
          };
          const getFreshToken = async () => {
            const storedAuth = await readFirebaseAuth();
            if (storedAuth) {
              const expiresSoon = storedAuth.expirationTime && storedAuth.expirationTime - Date.now() < 300000;
              if (expiresSoon && storedAuth.refreshToken) { const refreshed = await refreshFirebaseToken(storedAuth.refreshToken); if (refreshed) return refreshed; }
              if (storedAuth.accessToken) return storedAuth.accessToken;
            }
            const sb = readSupabaseAuth();
            if (sb && sb.accessToken) return sb.accessToken;
            return String(token || '').replace(/^Bearer\s+/i, '').trim();
          };
          const createCastleHeader = async () => {
            try {
              if (!window.Castle || typeof window.Castle.configure !== 'function') return {};
              window.__lovasiriCastleClient = window.__lovasiriCastleClient || window.Castle.configure({ pk: CASTLE_PK });
              const castleToken = await window.__lovasiriCastleClient.createRequestToken();
              return castleToken ? { 'X-Castle-Request-Token': castleToken } : {};
            } catch (e) { return {}; }
          };
          const freshToken = await getFreshToken();
          const makeHeaders = async (json = true) => ({
            'Accept': 'application/json',
            ...(json ? { 'Content-Type': 'application/json' } : {}),
            ...(freshToken ? { 'Authorization': 'Bearer ' + freshToken } : {}),
            ...await createCastleHeader(),
          });
          const pickWorkspaces = (payload) => {
            if (!payload || typeof payload !== 'object') return [];
            if (Array.isArray(payload.workspaces)) return payload.workspaces;
            if (Array.isArray(payload.data)) return payload.data;
            if (payload.workspace) return [payload.workspace];
            return [];
          };
          const wsUrls = [API_BASE + '/v1/workspaces', API_BASE + '/user/workspaces', API_BASE + '/workspaces'];
          let workspaces = [], workspaceStatus = 0, workspacePayload = null;
          for (const url of wsUrls) {
            try {
              const r = await fetch(url, { method: 'GET', headers: await makeHeaders(false), credentials: 'include' });
              workspaceStatus = r.status;
              const data = await asJson(r); workspacePayload = data;
              if (r.ok) { workspaces = pickWorkspaces(data).filter(w => w && w.id); if (workspaces.length) break; }
            } catch (e) {}
          }
          if (!workspaces.length) {
            const why = workspacePayload && (workspacePayload.message || workspacePayload.error || workspacePayload.type);
            return { ok: false, error: why || 'Não consegui encontrar seu workspace Lovable.', status: workspaceStatus, details: workspacePayload };
          }
          const workspace = workspaces.find(w => !/free/i.test(String(w.plan || ''))) || workspaces[0];
          const workspaceId = workspace.id;
          const projectTitle = title || ('Projeto ' + new Date().toLocaleString('pt-BR'));
          const bodies = [
            { description: projectTitle, tech_stack: 'modern', visibility: 'private', metadata: { chat_mode_enabled: true, fullscreen_enabled: true } },
            { description: projectTitle, visibility: 'private', metadata: { fullscreen_enabled: true } },
          ];
          const urls = [API_BASE + '/v1/workspaces/' + encodeURIComponent(workspaceId) + '/projects', API_BASE + '/workspaces/' + encodeURIComponent(workspaceId) + '/projects'];
          let last = null;
          for (const url of urls) {
            for (const body of bodies) {
              try {
                const r = await fetch(url, { method: 'POST', headers: await makeHeaders(true), credentials: 'include', body: JSON.stringify(body) });
                const data = await asJson(r);
                last = { status: r.status, data, url };
                if (r.ok) {
                  const project = data.project || data.data || data;
                  const id = project.id || project.project_id || data.id || data.projectId;
                  const link = project.editor_url || project.url || project.link || data.editor_url || data.url || data.link || (id ? 'https://lovable.dev/projects/' + id : 'https://lovable.dev/');
                  return { ok: true, success: true, link, projectId: id || '', workspaceId, data };
                }
                if (r.status !== 400 && r.status !== 404 && r.status !== 422) break;
              } catch (e) { last = { status: 0, data: { error: e.message }, url }; }
            }
          }
          const msg2 = (last && last.data && (last.data.message || last.data.error || last.data.type)) || 'Falha ao criar projeto no Lovable.';
          if (last && last.status === 401) return { ok: false, status: 401, error: 'Sua sessão do Lovable não autorizou a criação. Atualize a aba do Lovable.dev, confirme que está logado e tente novamente.', details: last };
          if (last && last.status === 402) return { ok: false, status: 402, error: 'Sua conta Lovable precisa ter créditos/plano disponível para criar projeto.', details: last };
          if (/castle|denied|captcha/i.test(String(msg2))) return { ok: false, status: last && last.status, error: 'O Lovable bloqueou a automação por segurança. Atualize a aba do Lovable.dev e tente novamente.', details: last };
          return { ok: false, status: last && last.status, error: msg2, details: last };
        },
        args: [{ token, title: msg.title || '' }],
      });
      const value = (results && results[0] && results[0].result) || { ok: false, error: 'sem resposta da página Lovable' };
      if (value && value.ok && value.projectId) {
        chrome.storage.local.set({ lovable_projectId: value.projectId });
      }
      sendResponse(value);
    } catch (err) {
      console.error("[Background] createLovableProjectInPage error:", err);
      sendResponse({ ok: false, error: err.message || "Falha ao criar pela aba Lovable." });
    }
  })();
  return true;
});
