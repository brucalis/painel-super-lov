

// Validação de key: ver fnx-license.js (lvbValidate)
const OPTIMIZE_URL = "https://painel-super-lov.lovable.app/api/public/optimize-prompt";
// Remote notifications feed removed (previous owner's server).
const PACKAGES_URL = "https://hyjsaialebpskwfvinig.supabase.co/rest/v1/packages?select=*&is_active=eq.true&order=sort_order.asc";
const EXT_PAYMENT_URL = "https://hyjsaialebpskwfvinig.supabase.co/functions/v1/process-extension-payment";
const PROXY_COMMAND_URL = "https://hyjsaialebpskwfvinig.supabase.co/functions/v1/proxy-command";
const REMOVE_WATERMARK_URL = "https://hyjsaialebpskwfvinig.supabase.co/functions/v1/remove-watermark";
const PUBLISH_PROJECT_URL = "https://hyjsaialebpskwfvinig.supabase.co/functions/v1/publish-project";
const PROMPT_IMAGE_PUBLIC_BASE_URL = "https://extensaosorax.lovable.app";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anNhaWFsZWJwc2t3ZnZpbmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjEyOTcsImV4cCI6MjEwMDI5NzI5N30.xRzxMfr92xxRxMwgNG_0iz9J2Rc6SQV3fLgVKItJgrg";

function cleanupLovablePromptLocks() {
  try { chrome.storage.local.set({ ql_shield_active: false, ql_native_chat: false, tsExtensionLayoutMode: 'sidebar' }); } catch (_) {}
  try {
    document.getElementById('ql-shield-overlay')?.remove();
    document.getElementById('ql-native-badge')?.remove();
    document.getElementById('ql-native-return-btn')?.remove();
    document.getElementById('ql-native-sending-overlay')?.remove();
    document.getElementById('ts-native-badge')?.remove();
    document.getElementById('ts-skill-badge')?.remove();
    document.getElementById('ts-popup-attach-preview')?.remove();
    document.getElementById('ts-floating-launcher')?.remove();
    document.getElementById('ts-floating-action-menu')?.remove();
    document.getElementById('ts-floating-submenu')?.remove();
    document.body?.classList.remove('ts-native-chat-active');
    document.querySelectorAll('.ts-native-composer-wrap').forEach(el => el.classList.remove('ts-native-composer-wrap'));
    const sendBtn = document.getElementById('chatinput-send-message-button');
    if (sendBtn) {
      sendBtn.classList.remove('ql-native-send-active', 'ql-native-sending');
      sendBtn.style.animation = '';
      sendBtn.disabled = false;
    }
    document.querySelectorAll('[data-ql-shield-disabled]').forEach(el => {
      delete el.dataset.qlShieldDisabled;
      delete el.dataset.qlShieldTabindex;
      delete el.dataset.qlShieldEditable;
      el.removeAttribute('tabindex');
      if (el.contentEditable === 'false') el.contentEditable = 'true';
    });
  } catch (_) {}
}

cleanupLovablePromptLocks();
setInterval(cleanupLovablePromptLocks, 1000);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cleanupLovablePromptLocks, { once: true });
} else {
  cleanupLovablePromptLocks();
}

function normalizePromptImageUrl(url) {
  return String(url || '');
}

// ============= Floating sidebar button injected into the Lovable page DOM =============
window.__tsSidebarCollapsed = window.__tsSidebarCollapsed || false;

function injectSidebarCollapseFloatingButton() {
  // Apenas na janela principal: evita setas duplicadas dentro de iframes
  if (window.top !== window) return;
  if (document.getElementById("ts-sidebar-collapse-floating-button")) {
    return;
  }

  const button = document.createElement("button");

  button.id = "ts-sidebar-collapse-floating-button";
  button.type = "button";
  button.textContent = "›";
  button.title = "Recolher extensão";

  button.style.cssText = [
    "position: fixed !important",
    "top: 50% !important",
    "right: 380px !important",
    "transform: translateY(-50%) !important",
    "width: 28px !important",
    "height: 52px !important",
    "z-index: 2147483647 !important",
    "display: flex !important",
    "opacity: 1 !important",
    "visibility: visible !important",
    "pointer-events: auto !important",
    "align-items: center !important",
    "justify-content: center !important",
    "border: none !important",
    "border-radius: 12px 0 0 12px !important",
    "cursor: pointer !important",
    "background: #ff4a4a !important",
    "color: #ffffff !important",
    "box-shadow: -4px 4px 14px rgba(0, 0, 0, 0.18) !important",
    "font-size: 16px !important",
    "font-weight: 700 !important",
    "padding: 0 !important",
    "margin: 0 !important",
    "transition: right 280ms ease !important"
  ].join("; ") + ";";

  button.addEventListener("click", () => {
    window.postMessage(
      {
        type: "TS_TOGGLE_EXTENSION_SIDEBAR"
      },
      "*"
    );
  });

  document.body.appendChild(button);

  console.info("[TS Extension] Floating sidebar button injected");
}

function updateSidebarCollapseFloatingButtonUI(collapsed) {
  const button = document.getElementById("ts-sidebar-collapse-floating-button");
  if (!button) return;

  const layoutMode = window.__tsExtensionLayoutMode || "sidebar";
  if (layoutMode === "popup" || layoutMode === "floating") {
    button.style.setProperty("display", "none", "important");
    return;
  }
  button.style.setProperty("display", "flex", "important");
  // When sidebar is open, button sits on its left edge (right: 380px).
  // When collapsed, button slides to right: 0 as an external tab.
  button.style.setProperty("right", collapsed ? "0" : "380px", "important");
  button.textContent = collapsed ? "‹" : "›";
  button.title = collapsed ? "Abrir extensão" : "Recolher extensão";
  button.setAttribute("aria-label", button.title);
}

function setSidebarCollapseFloatingButtonState(collapsed) {
  window.__tsSidebarCollapsed = Boolean(collapsed);
  injectSidebarCollapseFloatingButton();
  updateSidebarCollapseFloatingButtonUI(window.__tsSidebarCollapsed);

  try {
    chrome.storage.local.set({ sidebarCollapsed: window.__tsSidebarCollapsed });
  } catch (_) {}

  // Storage change is observed by overlay.js to collapse/expand the iframe.
  // No need to talk to the background / sidePanel API anymore.
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== "TS_TOGGLE_EXTENSION_SIDEBAR") return;
  setSidebarCollapseFloatingButtonState(!window.__tsSidebarCollapsed);
});

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    injectSidebarCollapseFloatingButton
  );
} else {
  injectSidebarCollapseFloatingButton();
}

const sidebarButtonObserver = new MutationObserver(() => {
  if (!document.getElementById("ts-sidebar-collapse-floating-button")) {
    injectSidebarCollapseFloatingButton();
  }
});

sidebarButtonObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

try {
  chrome.storage.local.get({ sidebarCollapsed: false, tsExtensionLayoutMode: "sidebar" }, (r) => {
    window.__tsSidebarCollapsed = Boolean(r && r.sidebarCollapsed);
    window.__tsExtensionLayoutMode = (r && r.tsExtensionLayoutMode) || "sidebar";
    injectSidebarCollapseFloatingButton();
    updateSidebarCollapseFloatingButtonUI(window.__tsSidebarCollapsed);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.sidebarCollapsed) {
      window.__tsSidebarCollapsed = Boolean(changes.sidebarCollapsed.newValue);
    }
    if (changes.tsExtensionLayoutMode) {
      window.__tsExtensionLayoutMode = changes.tsExtensionLayoutMode.newValue || "sidebar";
    }
    if (changes.sidebarCollapsed || changes.tsExtensionLayoutMode) {
      injectSidebarCollapseFloatingButton();
      updateSidebarCollapseFloatingButtonUI(window.__tsSidebarCollapsed);
    }
  });
} catch (_) {}

// Voice dictation now runs entirely inside the side panel (chrome-extension context).



function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
    return '';
  } catch(e) { return ''; }
}

function decodeJwtPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch(e) {
    return null;
  }
}

async function sendPromptNativeViaBackground(mensagem, modoPlano, attachedFilesSnapshot) {
  const attachments = Array.isArray(attachedFilesSnapshot) ? attachedFilesSnapshot : qlAttachedFiles;
  const storage = await new Promise((r) => chrome.storage.local.get(['lovable_token', 'lovable_projectId'], r));
  let token = storage.lovable_token || '';
  const projectId = storage.lovable_projectId || '';
  if (token.startsWith('Bearer ')) token = token.slice(7);

  if (!projectId) {
    throw new Error('Projeto Lovable não identificado.');
  }
  if (!token) {
    throw new Error('Token Lovable não encontrado. Faça login novamente na Lovable.');
  }

  // Envio via Edge Function "send-lovable-prompt" — método inline (LovaSiri).
  const baseMessage = String(mensagem || '').trim();

  const _b64FromFile = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); res(s.split(',')[1] || ''); };
    r.onerror = () => rej(new Error('Falha ao ler arquivo'));
    r.readAsDataURL(file);
  });
  const _inlineFiles = [];
  const _zipFiles = [];
  for (const f of attachments) {
    // Método inline: se existir rawFile, envie pelo base64 mesmo que o upload antigo
    // por link tenha falhado. ZIP não pode depender do fluxo antigo de signed URL.
    if (f.uploading && !f.rawFile) continue;
    const rf = f.rawFile;
    if (!rf) continue;
    const name = f.file_name || rf.name || 'file';
    const type = (rf.type || f.file_type || '').toLowerCase();
    const isZip = type === 'application/zip' || type === 'application/x-zip-compressed' || /\.zip$/i.test(name);
    let b64 = '';
    try { b64 = await _b64FromFile(rf); } catch(e) { console.warn('[QL Inline Send] Falha ao ler anexo:', name, e); continue; }
    if (!b64) continue;
    if (isZip) {
      _zipFiles.push({ file_name: name, content_type: 'application/x-zip-compressed', data_base64: b64 });
    } else {
      _inlineFiles.push({ name: name, file_name: name, content_type: type || 'image/png', data_base64: b64 });
    }
  }

  const edgePayload = {
    token: token,
    projectId: projectId,
    message: baseMessage,
    files: _inlineFiles,
    zipFiles: _zipFiles,
    attachedFiles: [],
    current_page: (typeof location !== 'undefined' ? location.pathname : '/') || '/',
    current_viewport_width: (typeof window !== 'undefined' && window.innerWidth) || 1336,
    current_viewport_height: (typeof window !== 'undefined' && window.innerHeight) || 861,
    current_viewport_dpr: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  };

  if (attachments.some(f => f && f.rawFile) && (_inlineFiles.length + _zipFiles.length) === 0) {
    throw new Error('Arquivo anexado, mas não entrou no payload inline.');
  }

  const resp = await bgFetchRaw(
    'https://hyjsaialebpskwfvinig.supabase.co/functions/v1/send-lovable-prompt',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(edgePayload),
    }
  );

  const data = resp && resp.data ? resp.data : {};
  const upstreamStatus = data.status || resp.status;

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    throw new Error('Sessão Lovable expirada. Recarregue a página e tente novamente.');
  }
  if (upstreamStatus === 402) {
    throw new Error('Você precisa ter pelo menos 1 crédito na sua conta Lovable.');
  }
  if (!resp || !resp.ok || data.ok === false || data.success === false) {
    const errMsg =
      (data && (data.error || (data.data && (data.data.error || data.data.message)))) ||
      ('Erro ' + (upstreamStatus || resp?.status || 'desconhecido') + ' ao enviar via edge function');
    throw new Error(errMsg);
  }

  return { success: true, method: 'edge_send_lovable_prompt', data: data.data || data };
}

function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "proxyFetch",
      url,
      method: options.method || "POST",
      headers: options.headers || {},
      body: options.body || null,
    }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("[bgFetch] runtime error:", chrome.runtime.lastError.message);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!resp) {
        return reject(new Error("Sem resposta do background"));
      }
      if (resp.data && typeof resp.data === "object") {
        resolve(resp.data);
      } else if (!resp.ok) {
        reject(new Error("Fetch failed via background (status " + resp.status + ")"));
      } else {
        resolve(resp.data);
      }
    });
  });
}

function bgFetchRaw(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "proxyFetch",
      url,
      method: options.method || "POST",
      headers: options.headers || {},
      body: options.body || null,
    }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp) return reject(new Error("Sem resposta do background"));
      resolve(resp);
    });
  });
}

function lovableApiFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "lovableApiFetch",
      url,
      method: options.method || "POST",
      headers: options.headers || {},
      body: options.body || null,
    }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp) return reject(new Error("Sem resposta do background"));
      resolve(resp);
    });
  });
}

(function injectHook(){
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("pageHook.js");
    s.onload = () => s.remove();
    (document.documentElement || document.head || document.body).appendChild(s);
  } catch (e) {
    console.warn("[ContentScript] falha ao injetar pageHook", e);
  }
})();

// --- GCS upload bridge: iframe (chrome-extension origin) -> pageHook (lovable.dev origin) ---
(function gcsUploadBridge(){
  try {
    window.addEventListener("message", (event) => {
      const d = event.data;
      if (!d || typeof d !== "object") return;
      // From iframe -> forward to page MAIN world
      if (d.type === "TS_PAGE_UPLOAD_TO_GCS" && event.source !== window) {
        try {
          window.postMessage({
            type: "TS_PAGE_UPLOAD_TO_GCS",
            requestId: d.requestId,
            uploadUrl: d.uploadUrl,
            contentType: d.contentType,
            arrayBuffer: d.arrayBuffer
          }, "*");
        } catch (e) { console.warn("[TS Upload] forward to page failed", e); }
        return;
      }
      // From pageHook -> relay back to iframe
      if (d.type === "TS_PAGE_UPLOAD_TO_GCS_RESULT" && event.source === window) {
        try {
          const iframe = document.getElementById("ts-community-overlay-iframe");
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(d, "*");
          }
        } catch (e) { console.warn("[TS Upload] relay to iframe failed", e); }
      }
    });
  } catch (e) { console.warn("[ContentScript] gcsUploadBridge falhou", e); }
})();

// --- Auto Approve bridge: forward extension settings to pageHook ---
(function autoApproveBridge(){
  function push(enabled, reviewSubmit){
    try { window.postMessage({ type: "lovableAutoApproveConfig", enabled: !!enabled, reviewSubmit: !!reviewSubmit }, "*"); } catch(e){}
  }
  function pull(){
    chrome.storage.local.get(["sp_auto_approve","sp_auto_review_submit"], r => push((r && typeof r.sp_auto_approve !== 'undefined') ? r.sp_auto_approve : true, (r && typeof r.sp_auto_review_submit !== 'undefined') ? r.sp_auto_review_submit : true));
  }
  try {
    pull();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && (changes.sp_auto_approve || changes.sp_auto_review_submit)) pull();
    });
    let pushes = 0;
    const iv = setInterval(() => {
      pushes++;
      pull();
      if (pushes >= 5) clearInterval(iv);
    }, 800);
  } catch(e) { console.warn("[ContentScript] autoApproveBridge falhou", e); }
})();

// --- Auto Approve: detect blue action button and send its text via sendPrompt ---
(function autoApproveActionButton(){
  let enabled = true;
  const processedActionButtons = new WeakSet();
  const VALID_LABELS = ["approve", "submit", "continue", "confirm", "apply"];

  function refresh(){
    try {
      chrome.storage.local.get(["sp_auto_approve"], r => {
        enabled = (r && typeof r.sp_auto_approve !== 'undefined') ? !!r.sp_auto_approve : true;
      });
    } catch(e){}
  }
  refresh();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.sp_auto_approve) {
        enabled = (typeof changes.sp_auto_approve.newValue !== 'undefined')
          ? !!changes.sp_auto_approve.newValue
          : true;
      }
    });
  } catch(e){}

  function findLovableActionButton(){
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((button) => {
      const text = (button.innerText || button.textContent || "").trim();
      if (!text) return false;
      const normalized = text.toLowerCase();
      if (!VALID_LABELS.includes(normalized)) return false;
      const isVisible = button.offsetParent !== null && !button.disabled
        && button.getAttribute("aria-disabled") !== "true";
      if (!isVisible) return false;
      let isBlueButton = false;
      try {
        const cls = (button.className && button.className.toString && button.className.toString()) || "";
        if (cls.toLowerCase().includes("blue")) isBlueButton = true;
        if (!isBlueButton) {
          const bg = window.getComputedStyle(button).backgroundColor || "";
          if (bg.includes("rgb")) isBlueButton = true;
        }
      } catch(e){}
      return isBlueButton;
    });
  }

  async function handleDetectedLovableActionButton(){
    if (!enabled) return false;
    const button = findLovableActionButton();
    if (!button) return false;
    if (processedActionButtons.has(button)) return false;
    if (button.dataset.tsAutoPromptSent === "true") return false;
    const text = (button.innerText || button.textContent || "").trim();
    if (!text) return false;
    processedActionButtons.add(button);
    button.dataset.tsAutoPromptSent = "true";
    console.info("[TS Extension] Auto action detected. Sending button text as prompt:", text);
    try {
      await sendPromptNativeViaBackground(text, false, []);
    } catch(err) {
      console.error("[TS Extension] Auto action sendPrompt failed:", err);
    }
    return true;
  }

  let scheduled = false;
  function schedule(){
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; handleDetectedLovableActionButton(); }, 500);
  }

  function start(){
    if (!document.body) { setTimeout(start, 200); return; }
    const obs = new MutationObserver(() => { if (enabled) schedule(); });
    obs.observe(document.body, { childList: true, subtree: true });
    console.info("[TS Extension] Auto action observer started");
    schedule();
  }
  start();
})();


let qlSessionId = null;
let qlHeartbeatInterval = null;
let qlUserName = null;
let qlExpiresAt = null;
let qlActivatedAt = null;
let qLicenseStatus = "active";
let qlOnlineCount = 0;
let qlMinimized = false;
let qlHeight = 520;
let qlSpeechRecognition = null;
let qlIsRecording = false;
let qlDeviceId = null;
let qlShieldActive = false;
let qlActiveTab = 'prompt';
let qlChatHistory = [];
let qLicenseKey = null;
let qLicenseType = null;
let qLicenseLifetime = false;
const QL_HISTORY_KEY = 'ql_chat_history';
const QL_MAX_HISTORY = 200;

function getDeviceId(){
  return getHardwareFingerprint();
}
function isTrialLicense() {
  return (
    qLicenseType === 'trial' ||
    (qLicenseKey && qLicenseKey.startsWith('TRIAL-')) ||
    qLicenseStatus === 'trial'
  );
}

function isLifetimeLicense() {
  return (
    qLicenseLifetime === true ||
    qLicenseLifetime === "true" ||
    (!qlExpiresAt && qLicenseStatus === "active" && qLicenseType !== "trial")
  );
}


function _buildFloatingUI(){
  if(document.getElementById("ql-floating")) return;

  const box = document.createElement("div");
  box.id = "ql-floating";
  const initialLeft = Math.max(10, window.innerWidth - 400);
  box.style.left = initialLeft + "px";
  box.style.top = "80px";

  chrome.storage.local.get(["ql_license_valid","ql_license_key","ql_minimized","ql_height","ql_dark_mode","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_license_type","ql_license_lifetime","ql_session_id"], async (res) => {
    qlMinimized = res.ql_minimized || false;
    qlHeight = res.ql_height || 520;
    qlDeviceId = await getDeviceId();

    if(res.ql_dark_mode === false) {
      box.classList.add("ql-light");
    }
    if(qlMinimized) {
      box.classList.add("ql-minimized");
    }

    document.body.appendChild(box);

    if(res.ql_license_valid){
      qlUserName = res.ql_user_name || null;
      qlExpiresAt = res.ql_expires_at || null;
      qlActivatedAt = res.ql_activated_at || null;
      qLicenseStatus = res.ql_license_status || null;
      qLicenseKey = res.ql_license_key || null;
      qLicenseType = res.ql_license_type || 'paid';
      qLicenseLifetime = res.ql_license_lifetime || false;
      qlSessionId = res.ql_session_id || null;
      showMainUI(box);

      if(res.ql_license_key) {
        lvbValidate(bgFetch, res.ql_license_key, qlDeviceId).then(data => {
          if(data.valid) {
            qlUserName = data.user_name || qlUserName;
            qlExpiresAt = data.expires_at || qlExpiresAt;
            qlActivatedAt = data.activated_at || qlActivatedAt;
            qLicenseStatus = data.status || qLicenseStatus;
            qLicenseType = data.license_type || 'paid';
            qLicenseLifetime = data.lifetime || false;
            qlSessionId = data.session_id || qlSessionId;
            chrome.storage.local.set({ ql_user_name: qlUserName, ql_expires_at: qlExpiresAt, ql_activated_at: qlActivatedAt, ql_license_status: qLicenseStatus, ql_license_type: qLicenseType, ql_license_lifetime: qLicenseLifetime, ql_session_id: qlSessionId });
            const nameEl = document.querySelector(".ql-profile-name");
            if(nameEl) nameEl.textContent = qlUserName || "User";
            updateTrialCountdown();
          } else if(data.reason === "device_conflict") {
            chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
            const b = document.getElementById("ql-floating");
            if(b) showLicenseGate(b);
            setTimeout(() => showCustomAlert("Acesso Negado", data.message), 500);
          } else {
            chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
            const b = document.getElementById("ql-floating");
            if(b) showLicenseGate(b);
          }
        }).catch(() => {});
      } else {
        // Flag válida sem chave armazenada: estado inconsistente, exigir key
        chrome.storage.local.remove(["ql_license_valid"]);
        showLicenseGate(box);
      }
    } else {
      showLicenseGate(box);
    }

    setupDrag();
    setupResize();
  });

  // Sincroniza ativação/desativação entre o chat flutuante e o painel lateral
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area !== 'local' || !changes.ql_license_valid) return;
    const nowValid = changes.ql_license_valid.newValue === true;
    const wasValid = changes.ql_license_valid.oldValue === true;
    if(nowValid === wasValid) return;
    const b = document.getElementById("ql-floating");
    if(!b) return;
    if(nowValid) {
      chrome.storage.local.get(["ql_license_key","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_license_type","ql_license_lifetime","ql_session_id"], (res) => {
        qlUserName = res.ql_user_name || null;
        qlExpiresAt = res.ql_expires_at || null;
        qlActivatedAt = res.ql_activated_at || null;
        qLicenseStatus = res.ql_license_status || null;
        qLicenseKey = res.ql_license_key || null;
        qLicenseType = res.ql_license_type || 'paid';
        qLicenseLifetime = res.ql_license_lifetime || false;
        qlSessionId = res.ql_session_id || null;
        showMainUI(b);
      });
    } else {
      qLicenseKey = null; qlSessionId = null;
      showLicenseGate(b);
    }
  });
}

function showLicenseGate(box){
  box.innerHTML = templateLicenseGate(qlMinimized);

  setTimeout(() => {
    const btn = document.getElementById("ql-validate-btn");
    if(btn) btn.addEventListener("click", validateLicense);
    const buyBtn = document.getElementById("ql-buy-license-btn");
    if(buyBtn) buyBtn.addEventListener("click", () => showPaymentUI(box));
    setupMinimize();
  }, 50);
}

async function validateLicense(){
  const input = document.getElementById("ql-license-input");
  const log = document.getElementById("ql-license-log");
  const key = input ? input.value.trim() : "";

  if(!key){
    if(log){ log.className = "ql-log-error"; log.innerText = "Insira uma chave"; }
    return;
  }

  if(log){ log.className = "ql-log-info"; log.innerText = "Validando..."; }

  try{
    if(!qlDeviceId) qlDeviceId = await getDeviceId();

    const data = await lvbValidate(bgFetch, key, qlDeviceId);

    if(data.valid){
      qlSessionId = data.session_id;
      qlUserName = data.user_name;
      qlExpiresAt = data.expires_at;
      qlActivatedAt = data.activated_at;
      qLicenseStatus = data.status;
      qLicenseType = data.license_type || 'paid';
      qLicenseLifetime = data.lifetime || false;
      qLicenseKey = key;
      qlOnlineCount = data.online_count || 0;

      chrome.storage.local.set({
  ql_license_valid: true,
  ql_license_key: key,
  ql_session_id: data.session_id,
  ql_user_name: data.user_name || null,
  ql_expires_at: data.expires_at || null,
  ql_activated_at: data.activated_at || null,
  ql_license_status: data.status || null,
  ql_license_type: qLicenseType,
  ql_license_lifetime: qLicenseLifetime
}, () => {
        if(log){ log.className = "ql-log-success"; log.innerText = "" + data.message; }
        setTimeout(() => {
          const box = document.getElementById("ql-floating");
          if(box) showMainUI(box);
          startHeartbeat(key);
        }, 800);
      });
    } else {
      if(log){ log.className = "ql-log-error"; log.innerText = "" + data.message; }
    }
  }catch(err){
    if(log){ log.className = "ql-log-error"; log.innerText = "Erro de conexão"; }
  }
}

function showMainUI(box){
  const greeting = qlUserName || "User";
  const statusBadge = qLicenseStatus === "trial" ? '<span class="ql-status-badge ql-badge-test">TEST</span>' : '<span class="ql-status-badge ql-badge-pro">PRO</span>';

  box.innerHTML = templateMainUI(greeting, statusBadge, qlMinimized);
  box.style.height = qlHeight + "px";

  setTimeout(() => {
    updateSyncStatus();
    setupSend();
    setupStorageWatch();
    setupMinimize();
    setupSuggestionChips();
    setupWatermarkButton();
    updateTrialCountdown();
    setupDrag();
    setupResize();
    setupDarkMode();
    setupOptimize();
    setupSpeech();
    setupNotifications();
    setupModoPlano();
    setupFileAttachment();
    setupShield();
    setupTabs();
    loadChatHistory();
    setupNativeChatButton();
    setupClipboardPaste();
    setupDownloadProject();
    setupCreateProject();
    setupPublishProject();
    // checkForUpdatePopup();
    checkResellerRolePopup();

    chrome.storage.local.get(["ql_license_key", "ql_session_id"], (res) => {
      if(res.ql_license_key) {
        qlSessionId = res.ql_session_id || qlSessionId;
        startHeartbeat(res.ql_license_key);
      }
    });

    const sidePanelBtn = document.getElementById("ql-sidepanel-btn");
    if(sidePanelBtn){
      sidePanelBtn.addEventListener("click", () => {
        const floatingBox = document.getElementById("ql-floating");
        if(floatingBox) {
          floatingBox.style.transition = "opacity 0.3s ease, transform 0.3s ease";
          floatingBox.style.opacity = "0";
          floatingBox.style.transform = "translateX(20px) scale(0.95)";
        }

        chrome.runtime.sendMessage({ action: "activateSidebar" }, (resp) => {
          if(resp && resp.ok){
            setTimeout(() => {
              if(floatingBox) floatingBox.remove();
              if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
              if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);
            }, 350);
          } else {
            if(floatingBox) {
              floatingBox.style.opacity = "1";
              floatingBox.style.transform = "none";
            }
            showCustomAlert("Erro", "Não foi possível abrir o painel lateral. Verifique se seu navegador suporta esta funcionalidade.");
          }
        });
      });
    }

    const logoutBtn = document.getElementById("ql-logout-btn");
    if(logoutBtn){
      logoutBtn.addEventListener("click", () => {
        if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
          qlUserName = null; qlExpiresAt = null; qlActivatedAt = null; qLicenseStatus = null; qlSessionId = null; qLicenseKey = null;
          showLicenseGate(box);
        });
      });
    }
  }, 30);
}

function showCustomAlert(title, message){
  const alert = document.getElementById("ql-custom-alert");
  if(!alert) return;
  const titleEl = alert.querySelector(".ql-alert-title");
  const msgEl = alert.querySelector(".ql-alert-message");
  const okBtn = alert.querySelector(".ql-alert-ok-btn");
  if(titleEl) titleEl.textContent = title;
  if(msgEl) msgEl.textContent = message;
  alert.style.display = "flex";
  if(okBtn) {
    okBtn.onclick = () => { alert.style.display = "none"; };
  }
  setTimeout(() => { alert.style.display = "none"; }, 4000);
}

function setupOptimize(){
  const btn = document.getElementById("ql-optimize-btn");
  if(!btn) return;
  btn.addEventListener("click", async () => {
    const textarea = document.getElementById("ql-msg");
    if(!textarea || !textarea.value.trim()) {
      showCustomAlert("Atenção", "Digite um prompt antes de otimizar.");
      return;
    }
    const original = textarea.value.trim();
    btn.classList.add("ql-tool-loading");
    btn.disabled = true;

    const storageData = await new Promise(r => chrome.storage.local.get(["ql_session_id"], r));
    const licenseToken = storageData.ql_session_id || "";

    try {
      if (!licenseToken) throw new Error("Sessão da licença não encontrada. Valide sua chave novamente.");
      const requestOptions = {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": "Bearer " + licenseToken
        },
        body: JSON.stringify({ prompt: original })
      };
      let result = await bgFetchRaw(OPTIMIZE_URL, requestOptions);
      if (result && result.status === 404) {
        await new Promise(resolve => setTimeout(resolve, 700));
        result = await bgFetchRaw(OPTIMIZE_URL + "?retry=" + Date.now(), requestOptions);
      }
      const data = result && result.data && typeof result.data === "object" ? result.data : {};
      if (!result || result.ok !== true) throw new Error(data.error || "O otimizador não respondeu (status " + (result && result.status || 0) + ").");
      const optimized = String(data.optimized_prompt || "").trim();
      if (!optimized) throw new Error(data.error || "O Lovable AI retornou uma resposta vazia.");
      textarea.value = optimized;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      textarea.focus();
      showCustomAlert("Prompt Otimizado!", "Seu prompt foi aprimorado com IA e está pronto para envio.");
    } catch(err) {
      console.error("[Optimize] erro:", err);
      showCustomAlert("Erro", "Falha ao conectar com o otimizador: " + (err.message || ""));
    } finally {
      btn.classList.remove("ql-tool-loading");
      btn.disabled = false;
    }
  });
}

function setupSpeech(){
  const btn = document.getElementById("ql-speech-btn");
  if(!btn) return;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition) {
    btn.title = "Speech não suportado neste navegador";
    btn.style.opacity = "0.4";
    btn.style.cursor = "not-allowed";
    return;
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if(qlIsRecording && qlSpeechRecognition) {
      qlSpeechRecognition.stop();
      return;
    }

    try {
      qlSpeechRecognition = new SpeechRecognition();
      qlSpeechRecognition.lang = "pt-BR";
      qlSpeechRecognition.continuous = true;
      qlSpeechRecognition.interimResults = true;
      qlSpeechRecognition.maxAlternatives = 1;

      let finalTranscript = "";
      const textarea = document.getElementById("ql-msg");

      qlSpeechRecognition.onstart = () => {
        qlIsRecording = true;
        btn.classList.add("ql-recording");
        finalTranscript = textarea ? textarea.value : "";
        
      };

      qlSpeechRecognition.onresult = (event) => {
        let interim = "";
        for(let i = event.resultIndex; i < event.results.length; i++){
          const transcript = event.results[i][0].transcript;
          if(event.results[i].isFinal){
            finalTranscript += transcript + " ";
          } else {
            interim += transcript;
          }
        }
        if(textarea) textarea.value = finalTranscript + interim;
      };

      qlSpeechRecognition.onerror = (event) => {
        console.warn("[QL Speech] Erro:", event.error);
        qlIsRecording = false;
        btn.classList.remove("ql-recording");
        
        if(event.error === "not-allowed") {
          showCustomAlert("Permissão Negada", "Permita o acesso ao microfone nas configurações do navegador.");
        } else if(event.error === "no-speech") {
          showCustomAlert("Sem Áudio", "Nenhuma fala detectada. Tente novamente.");
        } else if(event.error !== "aborted") {
          showCustomAlert("Erro de Voz", "Erro: " + event.error);
        }
      };

      qlSpeechRecognition.onend = () => {
        qlIsRecording = false;
        btn.classList.remove("ql-recording");
        if(textarea) textarea.value = finalTranscript.trim();
        
      };

      qlSpeechRecognition.start();
    } catch(err) {
      console.error("[QL Speech] Falha ao iniciar:", err);
      qlIsRecording = false;
      btn.classList.remove("ql-recording");
      showCustomAlert("Erro", "Não foi possível iniciar o reconhecimento de voz.");
    }
  });
}

function setupNotifications(){
  const bellBtn = document.querySelector(".ql-notif-btn");
  const panel = document.getElementById("ql-notif-panel");
  const closeBtn = document.getElementById("ql-notif-close");
  if(!bellBtn || !panel) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if(!isOpen) loadNotifications();
  });

  if(closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.style.display = "none";
    });
  }

  checkUnreadNotifications();
}

async function loadNotifications(){
  // Neutralized: remote notifications feed disabled (previous owner's server).
  const list = document.getElementById("ql-notif-list");
  if(!list) return;
  list.innerHTML = '<p class="ql-notif-empty">Nenhuma notificação.</p>';
  const badge = document.querySelector(".ql-notif-badge");
  if(badge) badge.style.display = "none";
}

async function checkUnreadNotifications(){
  // Neutralized: no remote unread check.
  const badge = document.querySelector(".ql-notif-badge");
  if(badge) badge.style.display = "none";
}

function setupSuggestionChips(){
  const container = document.getElementById("ql-chips");
  if(!container) return;
  PROMPT_TEMPLATES.forEach((t) => {
    const chip = document.createElement("button");
    chip.className = "ql-chip";
    chip.innerHTML = t.icon + " " + t.label;
    chip.title = t.prompt;
    chip.addEventListener("click", () => {
      const textarea = document.getElementById("ql-msg");
      if(textarea) textarea.value = t.prompt;
    });
    container.appendChild(chip);
  });
}

const WATERMARK_PROMPT = "Remova a marca d'\u00e1gua do Lovable. Para isso, adicione no in\u00edcio do arquivo CSS principal do projeto (src/index.css, src/styles.css, src/App.css ou o arquivo CSS global existente) exatamente esta regra CSS, sem alterar mais nada:\n\n#lovable-badge {\n  display: none !important;\n}\n\nN\u00e3o modifique nenhum outro arquivo, layout, texto ou componente. Apenas insira essa regra no CSS global.";

const WM_CSS_PATHS = ["src/styles.css","src/index.css","src/App.css","src/global.css","app/globals.css","styles/globals.css"];

function wmEnsureBadgeHidden(css){
  var src = String(css || "");
  // Só considera removida se existir uma regra do #lovable-badge com display:none dentro do bloco dela.
  if(/#lovable-badge[^{}]*\{[^}]*display\s*:\s*none/i.test(src)) return { changed:false, css:src };
  return { changed:true, css: src.replace(/\s+$/,"") + "\n\n#lovable-badge {\n  display: none !important;\n}\n" };
}

function wmGetGlobalCss(projectId, token){
  return new Promise(function(resolve, reject){
    chrome.runtime.sendMessage({ action:"downloadProject", projectId: projectId, token: token }, function(resp){
      if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if(!resp || !resp.success) return reject(new Error((resp && resp.error) || "Falha ao carregar arquivos do projeto."));
      var files = resp.files || [], match = null;
      var wmGetPath = function(f){ return String((f && (f.path || f.name || f.file_path)) || "").replace(/^\//,""); };
      var wmGetContent = function(f){ return f.content != null ? f.content : (f.contents != null ? f.contents : f.text); };
      for(var i=0;i<files.length && !match;i++){
        var p = wmGetPath(files[i]);
        if(WM_CSS_PATHS.indexOf(p) !== -1) match = { file:files[i], path:p };
      }
      if(!match){
        // Fallback: só um .css claramente global (tailwind/:root). Nunca escolhe um arquivo arbitrário.
        var cssFiles = files.filter(function(f){ var p = wmGetPath(f); return /\.css$/i.test(p) && p.indexOf("node_modules") === -1; });
        var found = cssFiles.find(function(f){ var c = wmGetContent(f); return typeof c === "string" && (/@tailwind|@import\s+["']tailwindcss/i.test(c) || c.indexOf(":root") !== -1); });
        if(found) match = { file: found, path: wmGetPath(found) };
      }
      if(!match) return reject(new Error("CSS global do projeto não encontrado."));
      var f2 = match.file;
      var content = f2.content != null ? f2.content : (f2.contents != null ? f2.contents : f2.text);
      if(typeof content !== "string") return reject(new Error("Conteúdo do CSS global indisponível."));
      resolve({ path: match.path, css: content });
    });
  });
}

function setupWatermarkButton(){
  var btn = document.getElementById("ql-remove-watermark");
  if(!btn) return;
  btn.addEventListener("click", async function(){
    var log = document.getElementById("ql-log");
    btn.disabled = true;
    btn.textContent = "\u23f3 Removendo...";

    await requestLatestTokenFromHook();

    var storageData = await new Promise(function(resolve){
      chrome.storage.local.get(["lovable_projectId","lovable_token"], resolve);
    });
    var pid = storageData.lovable_projectId || "";
    var rawToken = storageData.lovable_token || "";
    if(!pid || !rawToken){
      if(log){ log.className = "ql-log-error"; log.innerText = "\u26a0 Projeto n\u00e3o sincronizado."; }
      btn.disabled = false;
      btn.textContent = "\ud83d\udeab Remover Marca de \u00c1gua";
      return;
    }
    var bare = rawToken.indexOf("Bearer ") === 0 ? rawToken.slice(7) : rawToken;

    try {
      // Edita o CSS diretamente via edit-code: sem IA, sem consumo de créditos.
      var current = await wmGetGlobalCss(pid, bare);
      var result = wmEnsureBadgeHidden(current.css);
      if(!result.changed){
        if(log){ log.className = "ql-log-success"; log.innerText = "\u2713 Marca d'\u00e1gua j\u00e1 estava removida."; }
      } else {
        var resp = await lovableApiFetch("https://api.lovable.dev/projects/" + encodeURIComponent(pid) + "/edit-code", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + bare },
          body: JSON.stringify({
            changes: [{ path: current.path, content: result.css }],
            commit_message: "Remove Lovable watermark badge",
            file_edit_type: "CodeEdit",
            uploads: []
          })
        });
        if(!resp || !(resp.ok === true || (typeof resp.status === "number" && resp.status >= 200 && resp.status < 300))){
          var bodyTxt = "";
          try { bodyTxt = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data); } catch(e){}
          throw new Error("edit-code falhou: " + (resp && resp.status) + " " + bodyTxt);
        }
        if(log){ log.className = "ql-log-success"; log.innerText = "\u2713 Marca d'\u00e1gua removida! Atualize a preview."; }
      }
    } catch(err) {
      if(log){ log.className = "ql-log-error"; log.innerText = "\u2717 " + (err.message || err); }
    } finally {
      btn.disabled = false;
      btn.textContent = "\ud83d\udeab Remover Marca de \u00c1gua";
    }
  });
}

function showPublishedUrlModal(url){
  var existing = document.getElementById("ql-publish-modal");
  if(existing) existing.remove();
  var overlay = document.createElement("div");
  overlay.id = "ql-publish-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);font-family:Inter,sans-serif";
  overlay.innerHTML =
    '<div style="background:#111113;border:1px solid rgba(245,158,11,0.35);border-radius:16px;padding:24px;max-width:420px;width:90%;box-shadow:0 24px 80px -12px rgba(0,0,0,0.8)">' +
      '<div style="font-size:32px;text-align:center;margin-bottom:8px">\ud83c\udf89</div>' +
      '<h3 style="margin:0 0 8px;color:#fbbf24;font-size:18px;font-weight:700;text-align:center">Projeto Publicado!</h3>' +
      '<p style="margin:0 0 16px;color:#a1a1aa;font-size:13px;text-align:center">Seu projeto est\u00e1 ao vivo. Acesse pelo link abaixo:</p>' +
      '<div style="background:#0a0a0b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;margin-bottom:16px;word-break:break-all"><a href="' + url + '" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:13px">' + url + '</a></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="ql-publish-copy" style="flex:1;padding:10px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#f4f4f5;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600">\ud83d\udccb Copiar</button>' +
        '<button id="ql-publish-open" style="flex:1;padding:10px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700">\ud83d\udd17 Abrir</button>' +
      '</div>' +
      '<button id="ql-publish-close" style="width:100%;margin-top:8px;padding:8px;border:none;background:transparent;color:#71717a;cursor:pointer;font-size:12px">Fechar</button>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById("ql-publish-copy").addEventListener("click", function(){
    navigator.clipboard.writeText(url);
    this.textContent = "\u2713 Copiado!";
  });
  document.getElementById("ql-publish-open").addEventListener("click", function(){ window.open(url, "_blank"); });
  document.getElementById("ql-publish-close").addEventListener("click", function(){ overlay.remove(); });
  overlay.addEventListener("click", function(e){ if(e.target === overlay) overlay.remove(); });
}

function setupPublishProject(){
  var btn = document.getElementById("ql-publish-project");
  if(!btn) return;
  btn.addEventListener("click", async function(){
    var log = document.getElementById("ql-log");
    btn.disabled = true;
    btn.textContent = "\u23f3 Publicando...";

    await requestLatestTokenFromHook();

    var storageData = await new Promise(function(resolve){
      chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], resolve);
    });
    var projectId = storageData.lovable_projectId || "";
    var token = storageData.lovable_token || "";
    var licenseKey = storageData.ql_license_key || "";

    if(!projectId || !token){
      if(log){ log.className = "ql-log-error"; log.innerText = "\u26a0 Projeto n\u00e3o sincronizado."; }
      btn.disabled = false;
      btn.textContent = "\ud83c\udf10 Publicar Projeto";
      return;
    }

    if(token.startsWith("Bearer ")) token = token.slice(7);

    try {
      var result = await bgFetch(PUBLISH_PROJECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ license_key: licenseKey, token_lovable: token, project_id: projectId })
      });

      if(result && result.success === false){
        throw new Error(result.error_display || result.message || "Erro ao publicar");
      }

      if(log){ log.className = "ql-log-success"; log.innerText = "\u2713 Projeto publicado!"; }
      if(result && result.url) showPublishedUrlModal(result.url);
    } catch(err) {
      if(log){ log.className = "ql-log-error"; log.innerText = "\u2717 " + (err.message || err); }
    } finally {
      btn.disabled = false;
      btn.textContent = "\ud83c\udf10 Publicar Projeto";
    }
  });
}

function updateTrialCountdown(){
  const el = document.getElementById("ql-trial-countdown");
  if(!el) return;

  if(window.qlCountdownInterval) {
    clearInterval(window.qlCountdownInterval);
    window.qlCountdownInterval = null;
  }

  if(isLifetimeLicense()){
    el.style.display = "block";
    el.innerHTML =
      '<div class="ql-lifetime-card">' +
        '<span class="ql-lifetime-icon">∞</span>' +
        '<span class="ql-lifetime-label">VITALÍCIO</span>' +
        '<span class="ql-lifetime-status">Acesso vitalício ativado</span>' +
      '</div>';
    return;
  }

  if(!qlExpiresAt){
  el.style.display = "block";
  el.innerHTML =
    '<div class="ql-lifetime-card">' +
      '<span class="ql-lifetime-icon">∞</span>' +
      '<span class="ql-lifetime-label">VITALÍCIO</span>' +
      '<span class="ql-lifetime-status">Acesso sem expiração</span>' +
    '</div>';
  return;
}

  el.style.display = "block";

  const createdAt = Date.now();
  const expiresMs = new Date(qlExpiresAt).getTime();
  const totalDuration = Math.max(expiresMs - createdAt, 3600000);

  function update(){
    const remaining = expiresMs - Date.now();

    if(remaining <= 0){
      el.innerHTML = '<span class="ql-countdown-expired"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.clock + '</span> Licença expirada</span><div class="ql-trial-bar"><div class="ql-trial-bar-fill ql-bar-expired" style="width:0%"></div></div>';
      handleLicenseExpired();
      return;
    }

    const days = Math.floor(remaining / 86400000);
    const hrs = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));

    let timeStr = '';
    if(days > 0) timeStr = days + 'd ' + hrs + 'h ' + mins + 'm';
    else if(hrs > 0) timeStr = hrs + 'h ' + mins + 'm ' + String(secs).padStart(2,'0') + 's';
    else timeStr = mins + ':' + String(secs).padStart(2,'0');

    const urgentClass = pct < 20 ? ' ql-bar-urgent' : '';
    const label = isTrialLicense() ? 'Teste expira em' : 'Plano expira em';

    el.innerHTML = '<div class="ql-countdown-row"><span class="ql-countdown-icon">' + SVG_ICONS.clock + '</span><span class="ql-countdown-label">' + label + '</span><span class="ql-countdown-time">' + timeStr + '</span></div><div class="ql-trial-bar"><div class="ql-trial-bar-fill' + urgentClass + '" style="width:' + pct + '%"></div></div>';
  }

  update();
  window.qlCountdownInterval = setInterval(update, 1000);
}

function setupMinimize(){
  const btn = document.getElementById("ql-minimize");
  if(!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = document.getElementById("ql-floating");
    if(!box) return;
    qlMinimized = !qlMinimized;
    box.classList.toggle("ql-minimized", qlMinimized);
    btn.textContent = qlMinimized ? "□" : "−";
    chrome.storage.local.set({ ql_minimized: qlMinimized });
  });
}

function setupDarkMode(){
  const moonBtn = document.querySelector('.ql-icon-btn[title="Tema"]');
  if(!moonBtn) return;
  moonBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = document.getElementById("ql-floating");
    if(!box) return;
    const isLight = box.classList.toggle("ql-light");
    chrome.storage.local.set({ ql_dark_mode: !isLight });
  });
}

function setupModoPlano(){ /* removido */ }

function setupShield(){
  const btn = document.getElementById("ql-shield-btn");
  if(btn) btn.remove();
  qlShieldActive = false;
  cleanupLovablePromptLocks();
}

function injectShieldOverlay(){
  cleanupLovablePromptLocks();
}

function removeShieldOverlay(){
  const overlay = document.getElementById('ql-shield-overlay');
  if(overlay) overlay.remove();

  const chatForm = document.querySelector('form#chat-input');
  if(!chatForm) return;

  const inputs = chatForm.querySelectorAll('[data-ql-shield-disabled]');
  inputs.forEach(el => {
    const wasDis = el.dataset.qlShieldDisabled;
    if(wasDis === 'true') el.disabled = true;
    else if(wasDis === '' || wasDis === 'false') el.disabled = false;
    delete el.dataset.qlShieldDisabled;

    const oldTab = el.dataset.qlShieldTabindex;
    if(oldTab) el.setAttribute('tabindex', oldTab);
    else el.removeAttribute('tabindex');
    delete el.dataset.qlShieldTabindex;

    if(el.dataset.qlShieldEditable === 'true') {
      el.contentEditable = 'true';
      delete el.dataset.qlShieldEditable;
    }
  });
}


function startHeartbeat(licenseKey){
  if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);

  qlHeartbeatInterval = setInterval(async () => {
    try {
      const data = await lvbValidate(bgFetch, licenseKey, qlDeviceId);

      if(!data.valid){
        clearInterval(qlHeartbeatInterval);
        const msg = data.reason === "device_conflict" ? data.message : null;
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
          const box = document.getElementById("ql-floating");
          if(box) showLicenseGate(box);
          if(msg) setTimeout(() => showCustomAlert("Acesso Negado", msg), 500);
        });
        return;
      }

      qlOnlineCount = data.online_count || 0;
      const countEl = document.getElementById("ql-online-count");
      if(countEl) countEl.textContent = qlOnlineCount;

      if(data.user_name) {
        qlUserName = data.user_name;
        qLicenseStatus = data.status || qLicenseStatus;
        qlExpiresAt = data.expires_at || qlExpiresAt;
        qlActivatedAt = data.activated_at || qlActivatedAt;
qLicenseType = data.license_type || qLicenseType || 'paid';
qLicenseLifetime = data.lifetime || false;

chrome.storage.local.set({
  ql_user_name: qlUserName,
  ql_license_status: qLicenseStatus,
  ql_expires_at: qlExpiresAt,
  ql_activated_at: qlActivatedAt,
  ql_license_type: qLicenseType,
  ql_license_lifetime: qLicenseLifetime
});
        const nameEl = document.querySelector(".ql-profile-name");
        if(nameEl) nameEl.textContent = data.user_name;
      }

    } catch(err) {
      console.warn("[QL] Heartbeat error", err);
    }
  }, 20000);
}

let qlExpiredHandled = false;

function handleLicenseExpired(){
  if(qlExpiredHandled) return;
  qlExpiredHandled = true;
  if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
  if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);

  const overlay = document.createElement("div");
  overlay.className = "ql-sweetalert-overlay";
  overlay.innerHTML = templateExpiredOverlay();

  const box = document.getElementById("ql-floating");
  if(box) box.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("ql-sweetalert-visible"));

  const renewBtn = overlay.querySelector("#ql-sweetalert-renew");
  if(renewBtn){
    renewBtn.addEventListener("click", () => {
      overlay.remove();
      if(box) showPaymentUI(box);
    });
  }

  const closeBtn = overlay.querySelector("#ql-sweetalert-close");
  if(closeBtn){
    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("ql-sweetalert-visible");
      setTimeout(() => {
        overlay.remove();
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_license_status"], () => {
          if(box) showLicenseGate(box);
        });
      }, 300);
    });
  }
}

async function showPaymentUI(box, preselectedPkg){
  if(preselectedPkg){
    showCheckoutScreen(box, preselectedPkg);
    return;
  }

  box.innerHTML = templatePaymentUI(qlMinimized);

  setupMinimize();
  setupDrag();
  setupResize();

  const backBtn = document.getElementById("ql-pay-back");
  if(backBtn){
    backBtn.addEventListener("click", () => {
      chrome.storage.local.get(["ql_license_valid"], (res) => {
        if(res.ql_license_valid) showMainUI(box);
        else showLicenseGate(box);
      });
    });
  }

  try {
    const packages = await bgFetch(PACKAGES_URL, {
      method: "GET",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY }
    });

    const list = document.getElementById("ql-packages-list");
    if(!list) return;
    if(!packages || !Array.isArray(packages) || packages.length === 0){
      list.innerHTML = '<div class="ql-pay-loading">Nenhum plano disponível.</div>';
      return;
    }

    list.innerHTML = packages.map(pkg => templatePackageCard(pkg)).join('');

    list.querySelectorAll(".ql-pkg-card").forEach(card => {
      card.querySelector(".ql-pkg-select-btn").addEventListener("click", () => {
        const pkg = {
          id: card.getAttribute("data-pkg-id"),
          name: card.getAttribute("data-pkg-name"),
          price: card.getAttribute("data-pkg-price")
        };
        showCheckoutScreen(box, pkg);
      });
    });

  } catch(err) {
    console.error("[QL] Package load error:", err);
    const list = document.getElementById("ql-packages-list");
    if(list) list.innerHTML = '<div class="ql-pay-loading">Erro ao carregar planos. Tente novamente.</div>';
  }
}

function showCheckoutScreen(box, pkg){
  box.innerHTML = templateCheckoutScreen(pkg, qlMinimized);

  setupMinimize();
  setupDrag();
  setupResize();

  let selectedMethod = "mpesa";

  const backBtn = document.getElementById("ql-checkout-back");
  if(backBtn){
    backBtn.addEventListener("click", () => showPaymentUI(box));
  }

  document.querySelectorAll(".ql-method-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ql-method-btn").forEach(b => b.classList.remove("ql-method-active"));
      btn.classList.add("ql-method-active");
      selectedMethod = btn.getAttribute("data-method");
      const hint = document.getElementById("ql-phone-hint");
      if(hint) hint.textContent = selectedMethod === "mpesa" ? "M-Pesa: 84 ou 85" : "e-Mola: 86 ou 87";
    });
  });

  const confirmBtn = document.getElementById("ql-confirm-pay");
  if(confirmBtn){
    confirmBtn.addEventListener("click", async () => {
      const phone = (document.getElementById("ql-pay-phone") || {}).value ? (document.getElementById("ql-pay-phone") || {}).value.replace(/\D/g,"") : "";
      const log = document.getElementById("ql-pay-log");

      if(phone.length !== 9){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "Número deve ter 9 dígitos."; }
        return;
      }
      const prefix = phone.substring(0,2);
      if(selectedMethod === "mpesa" && !["84","85"].includes(prefix)){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "M-Pesa: use 84 ou 85."; }
        return;
      }
      if(selectedMethod === "emola" && !["86","87"].includes(prefix)){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "e-Mola: use 86 ou 87."; }
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = "Processando...";
      if(log){ log.className = "ql-pay-log ql-pay-info"; log.textContent = "Enviando solicitação de pagamento..."; }

      try {
        const storageData = await new Promise(r => chrome.storage.local.get(["ql_license_key"], r));
        const licenseKey = storageData.ql_license_key || "";

        const result = await bgFetch(EXT_PAYMENT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
          body: JSON.stringify({
            packageId: pkg.id,
            numero: phone,
            metodo: selectedMethod,
            license_key: licenseKey || undefined
          })
        });

        if(result && result.status === "sucesso"){
          const bodyEl = document.getElementById("ql-body");
          if(bodyEl){
            bodyEl.innerHTML = templatePaymentSuccess(result.license_key);

            const copyBtn = document.getElementById("ql-copy-key");
            if(copyBtn){
              copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(result.license_key).then(() => {
                  copyBtn.textContent = "Copiado!";
                  setTimeout(() => { copyBtn.textContent = "Copiar Chave"; }, 2000);
                }).catch(() => {
                  const keyEl = document.getElementById("ql-new-key");
                  if(keyEl){ const r = document.createRange(); r.selectNodeContents(keyEl); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); }
                  copyBtn.textContent = "Seleccionado — Ctrl+C";
                });
              });
            }

            const activateBtn = document.getElementById("ql-activate-key");
            if(activateBtn){
              activateBtn.addEventListener("click", async () => {
                activateBtn.disabled = true;
                const originalText = activateBtn.textContent;
                activateBtn.textContent = "Validando...";
                try {
                  if(!qlDeviceId) qlDeviceId = await getDeviceId();
                  const licenseData = await lvbValidate(bgFetch, result.license_key, qlDeviceId);
                  if(!licenseData.valid) {
                    throw new Error(licenseData.message || "Licença não validada.");
                  }
                  chrome.storage.local.set({
                    ql_license_valid: true,
                    ql_license_key: result.license_key,
                    ql_expires_at: licenseData.expires_at || null,
                    ql_activated_at: licenseData.activated_at || null,
                    ql_license_status: licenseData.status || "active",
                    ql_license_type: licenseData.license_type || "paid",
                    ql_license_lifetime: licenseData.lifetime === true,
                    ql_session_id: licenseData.session_id,
                    ql_user_name: licenseData.user_name || null
                  }, () => {
                    qlExpiresAt = licenseData.expires_at || null;
                    qLicenseStatus = licenseData.status || "active";
                    qlSessionId = licenseData.session_id;
                    qlExpiredHandled = false;
                    showMainUI(box);
                    startHeartbeat(result.license_key);
                  });
                } catch (error) {
                  activateBtn.disabled = false;
                  activateBtn.textContent = originalText;
                  window.alert(error.message || "Não foi possível validar a licença.");
                }
              });
            }
          }
        } else {
          const errMsg = (result && result.error) ? result.error : "Pagamento falhou. Tente novamente.";
          if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "" + errMsg; }
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Pagar " + pkg.price + " MZN";
        }
      } catch(err) {
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "" + (err.message || "Erro de conexão."); }
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Pagar " + pkg.price + " MZN";
      }
    });
  }
}

// Robust initialization: wait for document.body AND Lovable app shell
function qlBootstrap() {
  requestLatestTokenFromHook();
}

// Primary init
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(qlBootstrap, 50);
} else {
  document.addEventListener("DOMContentLoaded", function() { setTimeout(qlBootstrap, 50); });
}

// Retry with increasing delays for SPA navigation / late renders
var qlRetryCount = 0;
var qlRetryDelays = [300, 600, 1000, 1500, 2000, 3000, 4000, 5000];
function qlRetryInit() {
  if (document.getElementById("ql-floating") || qlRetryCount >= qlRetryDelays.length) return;
  var delay = qlRetryDelays[qlRetryCount];
  qlRetryCount++;
  setTimeout(function() {
    if (!document.getElementById("ql-floating") && document.body) {
      createUI();
    }
    qlRetryInit();
  }, delay);
}
//qlRetryInit();

function updateSyncStatus(){
  chrome.storage.local.get(["lovable_projectId","lovable_token"], (res)=>{
    const status = document.getElementById("ql-sync-status");
    if(!status) return;
    if(res.lovable_projectId && res.lovable_token){
      status.className = "ql-sync-status ql-sync-ok";
      const pid = res.lovable_projectId.substring(0, 6);
      status.innerHTML = '<span class="ql-sync-text"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.checkSmall + '</span> Sincronizado! Projeto: ' + pid + '...</span>';
    } else {
      status.className = "ql-sync-status ql-sync-waiting";
      status.innerHTML = '<span class="ql-sync-text"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.clock + '</span> Aguardando sincronização...</span>';
    }
  });
}

function setupStorageWatch(){
  chrome.storage.onChanged.addListener((changes)=>{
    if(changes.lovable_projectId || changes.lovable_token){
      updateSyncStatus();
    }
  });
}

function requestLatestTokenFromHook(timeoutMs = 1200){
  return new Promise((resolve)=>{
    let finished = false;

    function finish(updated){
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(onStorageChange);
      resolve(updated);
    }

    function onStorageChange(changes, area){
      if(area !== "local") return;
      if(changes.lovable_token && changes.lovable_token.newValue){
        finish(true);
      }
    }

    const timer = setTimeout(()=> finish(false), Math.max(300, timeoutMs));
    chrome.storage.onChanged.addListener(onStorageChange);

    try {
      window.postMessage({ type: "lovableRequestToken" }, "*");
      setTimeout(()=> window.postMessage({ type: "lovableRequestToken" }, "*"), 120);
    } catch(e) {
      finish(false);
    }
  });
}

// ===== CHAT HISTORY SYSTEM (Floating Popup) =====
function loadChatHistory(cb) {
  chrome.storage.local.get([QL_HISTORY_KEY], (res) => {
    qlChatHistory = res[QL_HISTORY_KEY] || [];
    updateHistoryBadge();
    if(cb) cb();
  });
}

function saveChatHistory() {
  if(qlChatHistory.length > QL_MAX_HISTORY) qlChatHistory = qlChatHistory.slice(-QL_MAX_HISTORY);
  chrome.storage.local.set({ [QL_HISTORY_KEY]: qlChatHistory });
}

function addToChatHistory(text, status) {
  qlChatHistory.push({ text: text, timestamp: new Date().toISOString(), status: status || 'ok' });
  saveChatHistory();
  updateHistoryBadge();
}

function updateHistoryBadge() {
  const badge = document.getElementById('ql-history-badge');
  if(!badge) return;
  if(qlChatHistory.length > 0) {
    badge.textContent = qlChatHistory.length;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function formatChatDate(dateStr) {
  var d = new Date(dateStr);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = (today - msgDay) / 86400000;
  if(diff === 0) return 'Hoje';
  if(diff === 1) return 'Ontem';
  if(diff < 7) return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];
  return d.toLocaleDateString('pt-BR');
}

function formatChatTime(dateStr) {
  var d = new Date(dateStr);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function renderHistoryView() {
  const container = document.getElementById('ql-tab-content');
  if(!container) return;

  if(!qlChatHistory.length) {
    container.innerHTML = '<div class="ql-chat-empty"><div style="margin-bottom:8px;color:var(--ql-text-muted,#71717a)">' + SVG_ICONS.msgBig + '</div><div style="font-size:13px;font-weight:600;color:var(--ql-text-primary,#f4f4f5)">Nenhuma mensagem</div><div style="font-size:11px;color:var(--ql-text-muted,#71717a);margin-top:4px">Seus prompts enviados aparecerão aqui.</div></div>';
    return;
  }

  let html = '<div class="ql-chat-messages">';
  let lastDate = '';
  for(let i = 0; i < qlChatHistory.length; i++) {
    const m = qlChatHistory[i];
    const dateLabel = formatChatDate(m.timestamp);
    if(dateLabel !== lastDate) {
      html += '<div class="ql-chat-date-divider"><span class="ql-chat-date-label">' + dateLabel + '</span></div>';
      lastDate = dateLabel;
    }
    const statusClass = m.status === 'error' ? 'ql-chat-status-err' : 'ql-chat-status-ok';
    const statusText = m.status === 'error' ? SVG_ICONS.x + ' Erro' : SVG_ICONS.check + ' Enviado';
    const truncated = m.text.length > 300 ? escapeHtml(m.text.substring(0, 300)) + '…' : escapeHtml(m.text);
    html += '<div class="ql-chat-bubble" title="' + escapeHtml(m.text) + '">' + truncated +
      '<div class="ql-chat-meta"><span class="' + statusClass + '">' + statusText + '</span><span class="ql-chat-time">' + formatChatTime(m.timestamp) + '</span></div></div>';
  }
  html += '</div>';
  html += '<div class="ql-chat-actions"><span class="ql-chat-count">' + qlChatHistory.length + ' mensagen' + (qlChatHistory.length === 1 ? '' : 's') + '</span><button class="ql-chat-clear" id="ql-chat-clear"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.trash + '</span> Limpar</button></div>';
  container.innerHTML = html;

  const msgs = container.querySelector('.ql-chat-messages');
  if(msgs) msgs.scrollTop = msgs.scrollHeight;

  const clearBtn = document.getElementById('ql-chat-clear');
  if(clearBtn) {
    clearBtn.addEventListener('click', () => {
      qlChatHistory = [];
      saveChatHistory();
      updateHistoryBadge();
      renderHistoryView();
    });
  }
}

function renderPromptView() {
  const container = document.getElementById('ql-tab-content');
  if(!container) return;
  container.innerHTML =
    '<textarea id="ql-msg" rows="3" placeholder="Digite seu comando..." spellcheck="false"></textarea>' +
    '<div id="ql-attach-preview" class="ql-attach-preview" style="display:none"></div>' +
    '<div class="ql-action-bar">' +
      '<div class="ql-action-center">' +
        '<button id="ql-attach-btn" class="ql-attach-btn" title="Anexar arquivo (m\u00e1x. 10)">\ud83d\udcce</button>' +
        '<button id="ql-optimize-btn" class="ql-tool-btn" title="Otimizar com IA">' + SVG_ICONS.sparkles + '</button>' +
        '<button id="ql-speech-btn" class="ql-tool-btn" title="Voz para texto">' + SVG_ICONS.mic + '</button>' +
      '</div>' +
      '<div class="ql-action-right-send">' +
        '<button id="ql-send" class="ql-send-btn">Enviar</button>' +
      '</div>' +
    '</div>' +
    '<input type="file" id="ql-file-input" multiple style="display:none" accept="*/*">' +
    '<div id="ql-log"></div>' +
    '<div class="ql-shortcuts-section">' +
      '<span class="ql-shortcuts-title">ATALHOS R\u00c1PIDOS</span>' +
      '<div class="ql-shortcuts-grid" id="ql-chips"></div>' +
    '</div>' +
    '<button id="ql-remove-watermark" class="ql-watermark-btn">\ud83d\udeab Remover Marca de \u00c1gua</button>' +
    '<button id="ql-download-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(37,99,235,0.08));border-color:rgba(59,130,246,0.3);color:#60a5fa;margin-top:6px">\ud83d\udce5 Baixar Todos Arquivos</button>' +
    '<button id="ql-create-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(34,197,94,0.14),rgba(16,185,129,0.08));border-color:rgba(34,197,94,0.35);color:#4ade80;margin-top:6px">\ud83d\ude80 Criar Projeto no Lovable</button>' +
    '<button id="ql-publish-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(245,158,11,0.14),rgba(217,119,6,0.08));border-color:rgba(245,158,11,0.35);color:#fbbf24;margin-top:6px">\ud83c\udf10 Publicar Projeto</button>' +
    '<div id="ql-download-status" style="display:none"></div>';
  // Re-setup all prompt tab features
  setupSend();
  setupSuggestionChips();
  setupWatermarkButton();
  setupOptimize();
  setupSpeech();
  setupModoPlano();
  setupFileAttachment();
  setupShield();
  setupNativeChatButton();
  setupClipboardPaste();
  setupDownloadProject();
  setupCreateProject();
  setupPublishProject();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.ql-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      qlActiveTab = target;
      document.querySelectorAll('.ql-tab').forEach(t => t.classList.toggle('ql-tab-active', t.getAttribute('data-tab') === target));
      if(target === 'history') {
        loadChatHistory(() => renderHistoryView());
      } else {
        renderPromptView();
      }
    });
  });
}


// ===== FILE ATTACHMENT SYSTEM =====
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
let qlAttachedFiles = [];

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isImageType(type) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(type);
}

async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1280;
      let w = img.width, h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = file.type === 'image/png' ? undefined : 0.8;
      canvas.toBlob((blob) => {
        if (!blob) return resolve({ file, previewUrl: null });
        const compressed = new File([blob], file.name, { type: outputType });
        const previewUrl = URL.createObjectURL(blob);
        resolve({ file: compressed, previewUrl });
      }, outputType, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, previewUrl: null }); };
    img.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function decodeJwtUserId(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return null;
  return payload.sub || payload.user_id || null;
}

const UPLOAD_IMAGE_EDGE_URL = 'https://hyjsaialebpskwfvinig.supabase.co/functions/v1/upload-prompt-image';
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function uploadImageToStorage(file) {
  const contentType = file.type || 'image/png';
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });

  const sd = await new Promise(r => chrome.storage.local.get(['ql_license_key'], r));
  const licKey = sd.ql_license_key || '';

  const resp = await bgFetch(UPLOAD_IMAGE_EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      license_key: licKey,
      file_name: file.name || 'image.png',
      content_type: contentType,
      base64,
    }),
  });

  if (!resp || resp.success === false || !resp.url) {
    throw new Error((resp && (resp.error_display || resp.error)) || 'Falha no upload da imagem');
  }

  return {
    file_id: resp.path || ('img_' + crypto.randomUUID()),
    file_name: file.name || 'image',
    download_url: normalizePromptImageUrl(resp.url),
    is_temp_image: true,
  };
}

async function uploadFileDirect(file, token) {
  if (IMAGE_MIME_TYPES.includes(file.type)) {
    return await uploadImageToStorage(file);
  }

  const fileId = crypto.randomUUID();
  const userId = decodeJwtUserId(token);
  if (!userId) throw new Error('Não foi possível extrair userId do token');

  const inferContentType = (f) => {
    if (f && typeof f.type === 'string' && f.type.trim()) return f.type;
    const name = (f && f.name ? f.name : '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const map = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      zip: 'application/zip',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      webm: 'video/webm'
    };
    return map[ext] || 'application/octet-stream';
  };

  const buildUploadFileName = (id, f) => {
    const rawName = f && f.name ? String(f.name) : '';
    const ext = rawName.includes('.') ? rawName.split('.').pop().toLowerCase() : '';
    const safeExt = ext && /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
    return id + '.' + safeExt;
  };

  const contentType = inferContentType(file);
  const uploadFileName = buildUploadFileName(fileId, file);

  const uploadUrlResp = await bgFetch('https://api.lovable.dev/files/generate-upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      file_name: uploadFileName,
      content_type: contentType,
      status: 'uploading'
    })
  });

  var signedUrl = (uploadUrlResp && uploadUrlResp.url) || (uploadUrlResp && uploadUrlResp.signed_url) || (uploadUrlResp && uploadUrlResp.signedUrl) || (uploadUrlResp && uploadUrlResp.data && uploadUrlResp.data.url) || null;
  if (!signedUrl) throw new Error('URL assinada não retornada');

  await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
        else reject(new Error('Upload PUT falhou: ' + xhr.status));
      };
      xhr.onerror = () => reject(new Error('Erro de rede no upload'));
      xhr.send(file);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });

  let downloadUrl = '';
  try {
    const dlResp = await bgFetch('https://api.lovable.dev/files/generate-download-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        dir_name: userId,
        file_name: uploadFileName
      })
    });
    downloadUrl = (dlResp && (dlResp.url || dlResp.signed_url || dlResp.signedUrl || (dlResp.data && dlResp.data.url))) || '';
  } catch (e) {
    console.warn('[QL Upload] download-url confirmation failed (non-critical):', e);
  }

  return { file_id: uploadFileName, file_name: file.name || 'file', download_url: downloadUrl, is_temp_image: false };
}

function applyUploadResult(target, result) {
  target.file_id = result.file_id || null;
  target.file_name = result.file_name || target.file_name;
  target.download_url = result.download_url || '';
  target.is_temp_image = !!result.is_temp_image;
  target.uploading = false;
  target.uploadFailed = false;
  /* keep rawFile for inline send */
}

function applyUploadFailure(target) {
  target.uploading = false;
  target.uploadFailed = true;
  target.is_temp_image = false;
  target.download_url = '';
  target.file_id = 'local_direct_' + crypto.randomUUID();
}

function renderAttachPreview() {
  const container = document.getElementById('ql-attach-preview');
  if (!container) return;
  if (qlAttachedFiles.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = qlAttachedFiles.map((f, i) => {
    const thumbHtml = f.previewUrl
      ? '<img class="ql-attach-thumb" src="' + f.previewUrl + '" alt="">'
      : '<div class="ql-attach-icon">' + SVG_ICONS.file + '</div>';
    const uploadingClass = f.uploading ? ' ql-attach-uploading' : '';
    return '<div class="ql-attach-item' + uploadingClass + '" data-idx="' + i + '">' +
      thumbHtml +
      '<div class="ql-attach-info"><span class="ql-attach-name" title="' + escapeHtml(f.file_name) + '">' + escapeHtml(f.file_name) + '</span><span class="ql-attach-size">' + escapeHtml(f.sizeLabel) + '</span></div>' +
      '<button class="ql-attach-remove" data-idx="' + i + '">' + SVG_ICONS.x + '</button>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.ql-attach-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'));
      if (qlAttachedFiles[idx] && qlAttachedFiles[idx].previewUrl) {
        URL.revokeObjectURL(qlAttachedFiles[idx].previewUrl);
      }
      qlAttachedFiles.splice(idx, 1);
      renderAttachPreview();
    });
  });
}

function setupFileAttachment() {
  const attachBtn = document.getElementById('ql-attach-btn');
  const fileInput = document.getElementById('ql-file-input');
  if (!attachBtn || !fileInput) return;

  attachBtn.addEventListener('click', () => {
    if (qlAttachedFiles.length >= MAX_FILES) {
      showCustomAlert('Limite', 'Máximo de ' + MAX_FILES + ' arquivos.');
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;
    await handleFilesAttach(files);
  });
}

function setupSend(){
  const btn = document.getElementById("ql-send");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    var msgEl = document.getElementById("ql-msg");
    const mensagem = msgEl ? (msgEl.value || "").trim() : "";
    const modoPlano = false;
    const log = document.getElementById("ql-log");

    if(!mensagem){
      if(log){ log.className = "ql-log-error"; log.innerText = "Prompt vazio"; }
      return;
    }

    const attachedFilesSnapshot = qlAttachedFiles.map((f) => ({ ...f }));

    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(["ql_license_key","ql_session_id"], resolve);
    });
    const licenseKey = storageData.ql_license_key || "";

    const hasTempImage = attachedFilesSnapshot.some(f => f.is_temp_image && !f.uploading && !f.uploadFailed);
    const hasRegularFile = attachedFilesSnapshot.some(f => !f.is_temp_image && (f.file_id || f.rawFile) && !f.uploading);

    try{
      if(log){
        log.className = "ql-log-info";
        log.innerText = hasTempImage || hasRegularFile ? "Preparando anexos para envio..." : "Enviando prompt...";
      }
      btn.classList.add("ql-sending");
      btn.disabled = true;

      var stillUploading = attachedFilesSnapshot.some(f => f.uploading && !f.rawFile);
      if (stillUploading) {
        throw new Error("Aguarde o upload dos arquivos terminar.");
      }

      await sendPromptNativeViaBackground(mensagem, modoPlano, attachedFilesSnapshot);
      if(log){
        log.className = "ql-log-success";
        if (hasTempImage && hasRegularFile) {
          log.innerText = "Prompt enviado com imagem e arquivo!";
        } else if (hasTempImage) {
          log.innerText = "Prompt enviado com imagem!";
        } else if (hasRegularFile) {
          log.innerText = "Prompt enviado com arquivo!";
        } else {
          log.innerText = "Prompt enviado!";
        }
      }
      

      // Save to chat history
      addToChatHistory(mensagem, 'ok');

      var msgEl = document.getElementById("ql-msg");
      if(msgEl) msgEl.value = "";

      qlAttachedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      qlAttachedFiles = [];
      renderAttachPreview();
    }catch(err){
      if(log){ log.className = "ql-log-error"; log.innerText = "" + (err.message || err); }
      addToChatHistory(mensagem, 'error');
    } finally {
      btn.classList.remove("ql-sending");
      btn.disabled = false;
    }
  });
}

// Store references to avoid stacking listeners
let _dragCleanup = null;
let _resizeCleanup = null;

function setupDrag(){
  if(_dragCleanup) { _dragCleanup(); _dragCleanup = null; }

  const box = document.getElementById("ql-floating");
  const header = document.getElementById("ql-header");
  if(!box || !header) return;

  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function onPointerDown(e){
    if(e.target.closest(".ql-minimize-btn") || e.target.closest(".ql-icon-btn") || e.target.closest("button")) return;
    if(e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;
    dragging = true;
    try { header.setPointerCapture(e.pointerId); } catch(ex){}
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "none";
  }

  function onPointerMove(e){
    if(!dragging) return;
    let newLeft = startLeft + (e.clientX - startX);
    let newTop = startTop + (e.clientY - startY);
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - box.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - box.offsetHeight));
    box.style.left = newLeft + "px";
    box.style.top = newTop + "px";
  }

  function onPointerUp(e){
    if(!dragging) return;
    dragging = false;
    try { header.releasePointerCapture(e.pointerId); } catch(ex){}
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "";
  }

  header.addEventListener("pointerdown", onPointerDown, {passive:false});

  _dragCleanup = function(){
    header.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  };
}

function setupResize(){
  if(_resizeCleanup) { _resizeCleanup(); _resizeCleanup = null; }

  const box = document.getElementById("ql-floating");
  const handle = document.getElementById("ql-resize-handle");
  if(!box || !handle) return;

  let resizing = false, startY = 0, startH = 0;

  function onDown(e){
    e.preventDefault();
    e.stopPropagation();
    resizing = true;
    startY = e.clientY;
    startH = box.offsetHeight;
    try { handle.setPointerCapture(e.pointerId); } catch(ex){}
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.userSelect = "none";
  }

  function onMove(e){
    if(!resizing) return;
    let newH = startH + (e.clientY - startY);
    newH = Math.max(200, Math.min(newH, window.innerHeight * 0.8));
    box.style.height = newH + "px";
  }

  function onUp(e){
    if(!resizing) return;
    resizing = false;
    qlHeight = box.offsetHeight;
    chrome.storage.local.set({ ql_height: qlHeight });
    try { handle.releasePointerCapture(e.pointerId); } catch(ex){}
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.style.userSelect = "";
  }

  handle.addEventListener("pointerdown", onDown, {passive:false});

  _resizeCleanup = function(){
    handle.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
}

// ===== CLIPBOARD PASTE (Ctrl+V) for ANY Files =====
function setupClipboardPaste() {
  var textarea = document.getElementById('ql-msg');
  if (!textarea) return;

  // --- Drag and Drop ---
  var dropZone = document.getElementById('ql-floating') || textarea;
  var dragOverlay = null;

  function showDragOverlay() {
    if (dragOverlay) return;
    dragOverlay = document.createElement('div');
    dragOverlay.className = 'ql-drag-overlay';
    dragOverlay.innerHTML = '<div class="ql-drag-overlay-inner"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.folder + '</span> Solte os arquivos aqui</div>';
    var parent = document.getElementById('ql-floating');
    if (parent) parent.appendChild(dragOverlay);
  }

  function hideDragOverlay() {
    if (dragOverlay) { dragOverlay.remove(); dragOverlay = null; }
  }

  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); e.stopPropagation(); showDragOverlay(); });
  dropZone.addEventListener('dragleave', function(e) { e.preventDefault(); e.stopPropagation(); if (!dropZone.contains(e.relatedTarget)) hideDragOverlay(); });
  dropZone.addEventListener('drop', async function(e) {
    e.preventDefault(); e.stopPropagation(); hideDragOverlay();
    var files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    await handleFilesAttach(files);
  });

  // --- Paste (images + non-image files) ---
  textarea.addEventListener('paste', async function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var filesToAttach = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.kind === 'file') {
        e.preventDefault();
        var file = item.getAsFile();
        if (file) filesToAttach.push(file);
      }
    }
    if (filesToAttach.length > 0) await handleFilesAttach(filesToAttach);
  });
}

async function handleFilesAttach(files) {
  if (qlAttachedFiles.length >= MAX_FILES) {
    showCustomAlert('Limite', 'Maximo ' + MAX_FILES + ' arquivos.');
    return;
  }
  var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token'], r); });
  var token = sd.lovable_token || '';
  if (!token) { showCustomAlert('Erro', 'Token nao capturado.'); return; }
  if (token.indexOf('Bearer ') === 0) token = token.slice(7);

  for (var fi = 0; fi < files.length; fi++) {
    var file = files[fi];
    if (qlAttachedFiles.length >= MAX_FILES) break;
    if (file.size > MAX_FILE_SIZE) { showCustomAlert('Grande', file.name + ' excede 20MB.'); continue; }

    var processedFile = file;
    var previewUrl = null;
    if (IMAGE_MIME_TYPES.indexOf(file.type) >= 0) {
      var compressed = await compressImage(file);
      processedFile = compressed.file;
      previewUrl = compressed.previewUrl;
    }

    var idx = qlAttachedFiles.length;
    var isZipInline = /\.zip$/i.test(file.name || '') || processedFile.type === 'application/zip' || processedFile.type === 'application/x-zip-compressed';
    qlAttachedFiles.push({
      file_id: null,
      file_name: file.name || ('file_' + Date.now()),
      previewUrl: previewUrl,
      file_type: processedFile.type,
      sizeLabel: formatFileSize(processedFile.size),
      uploading: !isZipInline,
      uploadFailed: false,
      is_temp_image: false,
      rawFile: processedFile
    });
    renderAttachPreview();

    if (isZipInline) {
      qlAttachedFiles[idx].file_id = 'inline_zip_' + crypto.randomUUID();
      qlAttachedFiles[idx].uploading = false;
      qlAttachedFiles[idx].uploadFailed = false;
      renderAttachPreview();
      continue;
    }

    try {
      var res = await uploadFileDirect(processedFile, token);
      applyUploadResult(qlAttachedFiles[idx], res);
      renderAttachPreview();
    } catch(err) {
      applyUploadFailure(qlAttachedFiles[idx]);
      renderAttachPreview();
    }
  }
  showCustomAlert('Anexado', files.length + ' arquivo(s) adicionado(s)!');
}

// ===== DOWNLOAD ALL PROJECT FILES (Popup) =====
// Remote extension_versions feed removed (previous owner's server).
var USER_ROLES_URL_POPUP = "https://hyjsaialebpskwfvinig.supabase.co/rest/v1/user_roles?select=role";
var CURRENT_EXT_VERSION_POPUP = "10.3";

function setupDownloadProject() {
  var btn = document.getElementById('ql-download-project');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    var statusEl = document.getElementById('ql-download-status');
    btn.disabled = true;
    btn.textContent = 'Preparando...';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'ql-log-info'; statusEl.textContent = 'Verificando token e projeto...'; }

    try {
      var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_projectId'], r); });
      var authToken = sd.lovable_token || '';
      var storedProjectId = sd.lovable_projectId || '';
      if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);

      var projectId = storedProjectId;
      if (!projectId) throw new Error('Abra uma pagina de projeto do Lovable primeiro.');
      if (!authToken) {
        var cookieResponse = await new Promise(function(resolve) {
          chrome.runtime.sendMessage({ action: "readCookies" }, function(resp) { resolve(resp); });
        });
        if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
          authToken = cookieResponse.tokens[0].token;
        }
      }
      if (!authToken) throw new Error('Token nao encontrado. Abra um projeto no Lovable e aguarde a sincronizacao.');

      btn.textContent = 'Baixando...';
      if (statusEl) statusEl.textContent = 'Baixando arquivos do projeto...';

      var dlResponse = await new Promise(function(resolve) {
        chrome.runtime.sendMessage({ action: "downloadProject", projectId: projectId, token: authToken }, function(resp) { resolve(resp); });
      });

      if (!dlResponse || !dlResponse.success) throw new Error(dlResponse && dlResponse.error ? dlResponse.error : 'Download falhou');
      var files = dlResponse.files;
      if (!files || files.length === 0) throw new Error('Nenhum arquivo encontrado no projeto.');

      if (statusEl) statusEl.textContent = 'Criando ZIP com ' + files.length + ' arquivos...';
      btn.textContent = 'Empacotando...';
      if (typeof JSZip === 'undefined') throw new Error('JSZip nao carregado. Use o Painel Lateral.');

      var zip = new JSZip();
      var imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff'];
      var addedFiles = 0;
      for (var fi = 0; fi < files.length; fi++) {
        var f = files[fi];
        if (!f.name || f.sizeExceeded) continue;
        if (f.contents && f.binary) { zip.file(f.name, f.contents, { base64: true, binary: true }); addedFiles++; }
        else if (!f.contents && imageExts.some(function(ext) { return f.name.toLowerCase().endsWith(ext); })) {
          try {
            var imgResp = await fetch('https://api.lovable.dev/projects/' + projectId + '/files/raw?path=' + encodeURIComponent(f.name), { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken }, credentials: 'omit', mode: 'cors' });
            if (imgResp.ok) { zip.file(f.name, await imgResp.arrayBuffer(), { binary: true }); addedFiles++; }
            else if (f.contents) { zip.file(f.name, f.contents); addedFiles++; }
          } catch(imgErr) { if (f.contents) { zip.file(f.name, f.contents); addedFiles++; } }
        } else if (f.contents) { zip.file(f.name, f.contents); addedFiles++; }
      }

      var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = 'lovable-' + projectId.substring(0, 8) + '-' + new Date().toISOString().split('T')[0] + '.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);

      if (statusEl) { statusEl.className = 'ql-log-success'; statusEl.textContent = addedFiles + ' arquivos baixados!'; }
      btn.textContent = 'Download Completo!';
      setTimeout(function() { btn.textContent = 'Baixar Todos Arquivos'; btn.disabled = false; if (statusEl) statusEl.style.display = 'none'; }, 4000);
    } catch(err) {
      if (statusEl) { statusEl.className = 'ql-log-error'; statusEl.textContent = (err.message || err); statusEl.style.display = 'block'; }
      btn.textContent = 'Falhou';
      setTimeout(function() { btn.textContent = 'Baixar Todos Arquivos'; btn.disabled = false; }, 3000);
    }
  });
}

// ===== UPDATE CHECK (Popup) =====
async function checkForUpdatePopup() {
  // Neutralized: remote version/update check disabled (previous owner's server).
  return;
}

// ===== RESELLER ROLE CHECK (Popup) =====
async function checkResellerRolePopup() {
  try {
    var storageData = await new Promise(function(r) { chrome.storage.local.get(["ql_license_key"], r); });
    if (!storageData.ql_license_key) return;
    var licData = await bgFetch("https://hyjsaialebpskwfvinig.supabase.co/rest/v1/ts_licenses?select=user_id&license_key=eq." + encodeURIComponent(storageData.ql_license_key) + "&limit=1", { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
    if (!licData || !licData.length || !licData[0].user_id) return;
    var userId = licData[0].user_id;
    var roleData = await bgFetch(USER_ROLES_URL_POPUP + "&user_id=eq." + userId, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } });
    if (roleData && Array.isArray(roleData) && roleData.some(function(r) { return r.role === 'reseller' || r.role === 'admin'; })) {
      var btn = document.getElementById('ql-reseller-btn');
      if (btn) btn.style.display = 'block';
    }
  } catch(e) {}
}

// ===== NATIVE CHAT MODE =====
let qlNativeChatActive = false;
let qlNativeChatCleanup = null;

function activateNativeChat() {
  qlNativeChatActive = false;
  cleanupLovablePromptLocks();
}

function deactivateNativeChat() {
  qlNativeChatActive = false;
  chrome.storage.local.set({ ql_native_chat: false });

  // Clean up injected elements
  if (qlNativeChatCleanup) { qlNativeChatCleanup(); qlNativeChatCleanup = null; }

  const badge = document.getElementById("ql-native-badge");
  if (badge) badge.remove();
  const returnBtn = document.getElementById("ql-native-return-btn");
  if (returnBtn) returnBtn.remove();

  // Restore send button
  const sendBtn = document.getElementById("chatinput-send-message-button");
  if (sendBtn) {
    sendBtn.classList.remove("ql-native-send-active");
    sendBtn.style.animation = "";
  }

  // Show the extension again
  const floatingBox = document.getElementById("ql-floating");
  if (floatingBox) {
    floatingBox.style.display = "";
    floatingBox.style.opacity = "0";
    floatingBox.style.transform = "scale(0.95)";
    requestAnimationFrame(() => {
      floatingBox.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      floatingBox.style.opacity = "1";
      floatingBox.style.transform = "scale(1) translateX(0)";
    });
  } else {
    // Rebuild if removed
    _buildFloatingUI();
  }
}

function injectNativeChatOverlay() {
  qlNativeChatActive = false;
  cleanupLovablePromptLocks();
  return;

  // Intercept send button click
  function interceptSend(e) {
    if (!qlNativeChatActive) return;
    if (Number(chatForm.dataset.qlNativeBypassUntil || 0) > Date.now()) return;

    // Get text from contenteditable
    const editor = chatForm.querySelector('[contenteditable="true"]');
    const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";

    if (!text) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    sendViaNativeChat(text, editor);
  }

  // Intercept form submit
  function interceptSubmit(e) {
    if (!qlNativeChatActive) return;
    if (Number(chatForm.dataset.qlNativeBypassUntil || 0) > Date.now()) return;

    const editor = chatForm.querySelector('[contenteditable="true"]');
    const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";

    if (!text) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    sendViaNativeChat(text, editor);
  }

  // Intercept Enter key
  function interceptKeydown(e) {
    if (!qlNativeChatActive) return;
    if (Number(chatForm.dataset.qlNativeBypassUntil || 0) > Date.now()) return;
    if (e.key === "Enter" && !e.shiftKey) {
      const editor = chatForm.querySelector('[contenteditable="true"]');
      const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";
      if (!text) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      sendViaNativeChat(text, editor);
    }
  }

  if (sendBtn) sendBtn.addEventListener("click", interceptSend, true);
  chatForm.addEventListener("submit", interceptSubmit, true);
  chatForm.addEventListener("keydown", interceptKeydown, true);

  qlNativeChatCleanup = function() {
    if (sendBtn) sendBtn.removeEventListener("click", interceptSend, true);
    chatForm.removeEventListener("submit", interceptSubmit, true);
    chatForm.removeEventListener("keydown", interceptKeydown, true);
  };
}

async function sendViaNativeChat(text, editor) {
  const sendBtn = document.getElementById("chatinput-send-message-button");

  // Show sending overlay
  showNativeSendingOverlay(true);

  // Visual feedback
  if (sendBtn) {
    sendBtn.style.animation = "none";
    sendBtn.classList.add("ql-native-sending");
    sendBtn.disabled = true;
  }

  try {
    var result = await sendPromptNativeViaBackground(text, false);

    // Clear the editor
    if (editor) {
      editor.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    addToChatHistory(text, "ok");
    showNativeChatToast("\u2713 Prompt enviado com sucesso!", "success");

  } catch (err) {
    addToChatHistory(text, "error");
    showNativeChatToast("\u2717 " + (err.message || "Erro no envio"), "error");
  } finally {
    showNativeSendingOverlay(false);
    if (sendBtn) {
      sendBtn.classList.remove("ql-native-sending");
      sendBtn.classList.add("ql-native-send-active");
      sendBtn.disabled = false;
      // Re-apply blink animation since it may have been cleared
      sendBtn.style.animation = "";
      requestAnimationFrame(() => {
        sendBtn.style.animation = "ql-send-blink 1.5s infinite";
      });
    }
  }
}

function showNativeSendingOverlay(show) {
  const id = "ql-native-sending-overlay";
  const existing = document.getElementById(id);
  if (!show) { if (existing) existing.remove(); return; }
  if (existing) return;
  const el = document.createElement("div");
  el.id = id;
  el.className = "ql-native-sending-overlay";
  el.innerHTML = '<div class="ql-spinner"></div> Enviando prompt...';
  document.body.appendChild(el);
}

function showNativeChatToast(msg, type) {
  const existing = document.getElementById("ql-native-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "ql-native-toast";
  toast.className = "ql-native-toast ql-native-toast-" + type;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("ql-native-toast-visible"));
  setTimeout(() => {
    toast.classList.remove("ql-native-toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function setupNativeChatButton() {
  const btn = document.getElementById("ql-native-chat-btn");
  if (btn) btn.remove();
  cleanupLovablePromptLocks();
}

cleanupLovablePromptLocks();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== "lovableTokenFound") return;

  const currentProjectMatch = location.pathname.match(/projects\/([0-9a-fA-F-]{36})/i);
  const currentProjectId = currentProjectMatch ? currentProjectMatch[1] : null;

  const token = String(event.data.token || "").replace(/^Bearer\s+/i, "").trim();
  const projectId = event.data.projectId || currentProjectId;

  // Always store the latest valid token globally so features like
  // "Criar Projeto" work even when the user is not inside a specific project.
  if (token) {
    chrome.storage.local.set({ lovable_token_global: token });
  }

  if (!currentProjectId || !token || !projectId || projectId !== currentProjectId) {
    chrome.storage.local.remove(["lovable_token", "lovable_projectId"]);
    return;
  }

  chrome.storage.local.set({
    lovable_token: token,
    lovable_projectId: projectId
  });
});


function setupCreateProject() {
  var btn = document.getElementById('ql-create-project');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    var statusEl = document.getElementById('ql-download-status');
    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Criando projeto...';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'ql-log-info'; statusEl.textContent = 'Preparando criação...'; }
    try {
      var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_token_global', 'lovableBearerToken', 'ql_license_key'], r); });
      var authToken = sd.lovableBearerToken || sd.lovable_token_global || sd.lovable_token || '';
      var licenseKey = sd.ql_license_key || '';
      if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);
      if (!licenseKey) throw new Error('Licença não encontrada.');
      if (!authToken) {
        try { window.postMessage({ type: 'lovableRequestToken' }, '*'); } catch(e) {}
        await new Promise(function(r){ setTimeout(r, 600); });
        sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_token_global', 'lovableBearerToken'], r); });
        authToken = (sd.lovableBearerToken || sd.lovable_token_global || sd.lovable_token || '').replace(/^Bearer\s+/i, '');
      }
      if (statusEl) statusEl.textContent = 'Criando projeto no Lovable...';
      var data = await new Promise(function(resolve) {
        chrome.runtime.sendMessage({ action: 'createLovableProjectInPage', token: authToken, title: '' }, function(resp) {
          resolve(resp || { ok: false, error: 'sem resposta' });
        });
      });
      if (!data || (!data.success && !data.ok) || !data.link) {
        throw new Error((data && (data.error_display || data.error)) || 'Falha ao criar projeto');
      }
      if (statusEl) { statusEl.className = 'ql-log-success'; statusEl.textContent = 'Projeto criado! Redirecionando...'; }
      btn.textContent = 'Sucesso!';
      setTimeout(function(){
        try { window.location.href = data.link; }
        catch(e) { window.open(data.link, '_blank'); }
      }, 400);
    } catch(err) {
      console.error('[CreateProject]', err);
      if (statusEl) { statusEl.className = 'ql-log-error'; statusEl.textContent = '' + (err.message || 'Erro'); }
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
}

// --- Notify when Lovable finishes editing (sound) ---
(function lovableDoneSoundFeature(){
  try {
    // Default: enabled
    window.__TS_DONE_SOUND_ENABLED__ = true;
    try {
      chrome.storage.local.get(["soundNotificationsEnabled","notifyWhenDoneEnabled"], function(r){
        if (r && typeof r.soundNotificationsEnabled !== "undefined") {
          window.__TS_DONE_SOUND_ENABLED__ = r.soundNotificationsEnabled !== false;
        } else if (r && typeof r.notifyWhenDoneEnabled !== "undefined") {
          window.__TS_DONE_SOUND_ENABLED__ = r.notifyWhenDoneEnabled !== false;
        } else {
          window.__TS_DONE_SOUND_ENABLED__ = true;
        }
      });
      chrome.storage.onChanged.addListener(function(changes, area){
        if (area === "local" && changes && changes.soundNotificationsEnabled) {
          window.__TS_DONE_SOUND_ENABLED__ = changes.soundNotificationsEnabled.newValue !== false;
        }
      });
    } catch(e){}

    function isSoundEnabled(){ return window.__TS_DONE_SOUND_ENABLED__ !== false; }
    window.__TS_isSoundEnabled = isSoundEnabled;

    var WORKING_INDICATORS = [
      "working","applying","editing","generating","thinking",
      "analyzing","building","creating","reviewing","starting",
      "updating","running"
    ];

    function isLovableCurrentlyWorking(){
      try {
        var chat = document.querySelector('[class*="chat"], main, body');
        var bodyText = (chat ? chat.innerText : document.body.innerText || "").toLowerCase();
        var hasWorkingText = false;
        for (var i=0;i<WORKING_INDICATORS.length;i++){
          if (bodyText.indexOf(WORKING_INDICATORS[i]+"...") !== -1 ||
              bodyText.indexOf(WORKING_INDICATORS[i]+"…") !== -1) {
            hasWorkingText = true; break;
          }
        }
        if (!hasWorkingText) {
          var btns = document.querySelectorAll("button");
          for (var j=0;j<btns.length;j++){
            var b = btns[j];
            var t = (b.innerText || "").trim().toLowerCase();
            var aria = (b.getAttribute("aria-label") || "").toLowerCase();
            if (t === "stop" || t === "cancel" || aria.indexOf("stop") !== -1) {
              return true;
            }
          }
        }
        return hasWorkingText;
      } catch(e){ return false; }
    }

    var wasLovableWorking = false;
    var doneSoundTimeout = null;
    var lastDoneSoundAt = 0;
    var lastPromptSentSoundAt = 0;

    var SOUND_URLS = {
      send: "https://hyjsaialebpskwfvinig.supabase.co/storage/v1/object/public/sounds/send.mp3",
      done: "https://hyjsaialebpskwfvinig.supabase.co/storage/v1/object/public/sounds/done.mp3"
    };

    function playRemoteSound(type, volume){
      try {
        var url = SOUND_URLS[type];
        if (!url) return;
        var audio = new Audio(url);
        audio.volume = (typeof volume === "number") ? volume : 0.8;
        var p = audio.play();
        if (p && p.catch) p.catch(function(err){
          console.warn("[Superlovable] Falha ao reproduzir som:", err);
        });
      } catch(err){
        console.warn("[Superlovable] Falha ao reproduzir som:", err);
      }
    }

    function playLovableDoneSound(){
      if (!isSoundEnabled()) return;
      var now = Date.now();
      if (now - lastDoneSoundAt < 8000) return;
      lastDoneSoundAt = now;
      playRemoteSound("done", 0.8);
    }

    function playPromptSentSound(){
      if (!isSoundEnabled()) return;
      var now = Date.now();
      if (now - lastPromptSentSoundAt < 1000) return;
      lastPromptSentSoundAt = now;
      playRemoteSound("send", 0.8);
    }
    window.__TS_playPromptSentSound = playPromptSentSound;

    // Listen to messages from sidepanel (via background relay) or from page
    try {
      chrome.runtime.onMessage.addListener(function(msg){
        if (msg && msg.action === "tsPlayPromptSentSound") playPromptSentSound();
      });
    } catch(e){}
    window.addEventListener("message", function(ev){
      if (ev && ev.data && ev.data.type === "tsPlayPromptSentSound") playPromptSentSound();
    });

    function check(){
      if (!isSoundEnabled()) return;
      var working = isLovableCurrentlyWorking();
      if (working){
        wasLovableWorking = true;
        if (doneSoundTimeout){ clearTimeout(doneSoundTimeout); doneSoundTimeout = null; }
        return;
      }
      if (wasLovableWorking && !working){
        if (doneSoundTimeout) clearTimeout(doneSoundTimeout);
        doneSoundTimeout = setTimeout(function(){
          if (!isLovableCurrentlyWorking()){
            playLovableDoneSound();
            wasLovableWorking = false;
          }
          doneSoundTimeout = null;
        }, 2500);
      }
    }

    var scheduled = false;
    var observer = new MutationObserver(function(){
      if (scheduled) return;
      scheduled = true;
      setTimeout(function(){ scheduled = false; check(); }, 400);
    });
    function start(){
      if (!document.body) { setTimeout(start, 200); return; }
      observer.observe(document.body, { childList:true, subtree:true, characterData:true });
      console.info("[TS Extension] Lovable done observer started");
    }
    start();
  } catch(e){
    console.warn("[TS Extension] lovableDoneSoundFeature failed", e);
  }
})();
