(function(){
  // The side panel is visible when this loads => it's not collapsed.
  try { chrome.storage.local.set({ sidebarCollapsed: false }); } catch(_){}

  if (typeof window.TS_DEBUG === "undefined") window.TS_DEBUG = false;
  const tsDebug = (...args) => { if (window.TS_DEBUG) console.log(...args); };

  const SUPABASE_URL = "https://hyjsaialebpskwfvinig.supabase.co";
  // Validação de key: ver fnx-license.js (lvbValidate)
  const OPTIMIZE_URL = "https://painel-super-lov.lovable.app/api/public/optimize-prompt";
  // Remote notifications & version/update feeds removed (previous owner's server).
  const USER_ROLES_URL = SUPABASE_URL + "/rest/v1/user_roles?select=role";
  const PROXY_COMMAND_URL = SUPABASE_URL + "/functions/v1/proxy-command";
  const PROMPT_IMAGE_PUBLIC_BASE_URL = "https://extensaosorax.lovable.app";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anNhaWFsZWJwc2t3ZnZpbmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjEyOTcsImV4cCI6MjEwMDI5NzI5N30.xRzxMfr92xxRxMwgNG_0iz9J2Rc6SQV3fLgVKItJgrg";

  function normalizePromptImageUrl(url) {
    return String(url || '');
  }

  let sessionId = null, userName = null, expiresAt = null, licenseStatus = null, heartbeatInterval = null, deviceId = null, isResellerUser = false;
  let spIsRecording = false;
  let spAttachedFiles = [];
  let spActiveTab = 'prompt';
  let spChatHistory = [];
  let licenseKey = null;
  let licenseType = null;
  let licenseLifetime = false;
  const SP_MAX_FILES = 15;
  const SP_MAX_FILE_SIZE = 20 * 1024 * 1024;
  const SP_HISTORY_KEY = 'ql_chat_history';
  const SP_MAX_HISTORY = 200;
  const SP_SKILLS_KEY = 'sp_user_skills';
  let spSkills = [];
  let spSkillFormState = null; // null = list, {} = new, {id,...} = edit

  // --- Built-in Lovable Skills (read-only) ---
  const SP_BUILTIN_SKILLS = [
    {
      id: 'builtin_accessibility',
      builtin: true,
      icon: '◈',
      name: 'Accessibility Review',
      description: 'Audita acessibilidade (WCAG 2.1 AA)',
      prefix: '/skill:accessibility',
      content: ''
    },
    {
      id: 'builtin_redesign',
      builtin: true,
      icon: '✦',
      name: 'Redesign',
      description: 'Refina o design mantendo a funcionalidade',
      prefix: '/skill:redesign',
      content: ''
    },
    {
      id: 'builtin_seo_review',
      builtin: true,
      icon: '◎',
      name: 'SEO Review',
      description: 'Auditoria técnica e on-page de SEO',
      prefix: '/skill:seo-review',
      content: ''
    },
    {
      id: 'builtin_video_creator',
      builtin: true,
      icon: '▶',
      name: 'Video Creator',
      description: 'Gera vídeos curtos para o projeto',
      prefix: '/skill:video-creator',
      content: ''
    },
    {
      id: 'builtin_skill_creator',
      builtin: true,
      icon: '◆',
      name: 'Skill Creator',
      description: 'Cria uma nova skill reutilizável',
      content: 'Me ajude a criar uma nova skill reutilizável para o Lovable. Faça as perguntas necessárias para entender: (1) qual tarefa específica essa skill resolve, (2) quando ela deve ser acionada, (3) qual o output esperado, (4) restrições/convenções do projeto que precisam ser seguidas. Em seguida, gere o prompt final da skill com nome, descrição curta (uma linha, focada em quando usar) e corpo do prompt pronto para colar.'
    }
  ];

  function buildSkillMessage(userMessage, skill) {
    var message = String(userMessage || '').trim();
    if (!skill) return message;
    if (skill.prefix) {
      if (!message) return skill.prefix;
      if (message.indexOf('/skill:') === 0) return message;
      return skill.prefix + ' ' + message;
    }
    if (skill.content) {
      return message ? (skill.content + '\n\n---\n\n' + message) : skill.content;
    }
    return message;
  }

  function spGetAllSkills() {
    return SP_BUILTIN_SKILLS.concat(spSkills);
  }
  const CURRENT_EXT_VERSION = "10.3";

  // --- Utilities ---
  function safeSendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return reject(new Error("Extension context invalidated"));
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

function isTrialLicense() {
  return (
    licenseType === 'trial' ||
    (licenseKey && licenseKey.startsWith('TRIAL-')) ||
    licenseStatus === 'trial'
  );
}

function isLifetimeLicense() {
  return true;
}

  async function refreshLovableTokenFromActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];

    if (!tab || !tab.id || !/lovable\.dev/.test(tab.url || "")) {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        window.postMessage({ type: "lovableRequestToken" }, "*");
        setTimeout(() => {
          window.postMessage({ type: "lovableRequestToken" }, "*");
        }, 150);
      }
    });

    await new Promise(resolve => setTimeout(resolve, 900));
    return true;
  } catch (e) {
    console.warn("[SP] Falha ao pedir token atualizado:", e);
    return false;
  }
}

  async function sendPromptNativeViaBackground(mensagem, modoPlano = false, attachedFilesSnapshot) {
  const attachments = Array.isArray(attachedFilesSnapshot) ? attachedFilesSnapshot : spAttachedFiles;
  await refreshLovableTokenFromActiveTab();

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const activeUrl = tabs?.[0]?.url || "";
  const match = activeUrl.match(/projects\/([0-9a-fA-F-]{36})/i);

  const storage = await new Promise((resolve) => {
    chrome.storage.local.get(
      ["lovable_token", "lovable_projectId"],
      resolve
    );
  });

  const projectId = match
    ? match[1]
    : String(storage.lovable_projectId || "").trim();

  if (storage.lovable_projectId && storage.lovable_projectId !== projectId) {
    await chrome.storage.local.remove(["lovable_token", "lovable_projectId"]);
    throw new Error("Projeto mudou. Aguarde sincronizar novamente.");
  }

  let token = String(storage.lovable_token || "").trim();
  token = token.replace(/^Bearer\s+/i, "").trim();

  if (!projectId) {
    throw new Error("Projeto Lovable não identificado.");
  }
  if (!token) {
    throw new Error("Token Lovable não encontrado. Faça login novamente na Lovable.");
  }

  const nativeImageFiles = attachments
    .filter(f => f.is_native_image && f.file_id && !f.uploading && !f.uploadFailed)
    .map(f => ({
      file_id: f.file_id,
      file_name: f.file_name,
      name: f.name || f.file_name,
      file_type: f.file_type,
      type: f.type || f.file_type,
      file_url: f.file_url,
      url: f.url || f.file_url,
    }));

  const tempImageUrls = attachments
    .filter(f => f.is_temp_image && f.download_url && !f.uploading && !f.uploadFailed)
    .map(f => f.download_url);

  const otherFiles = attachments
    .filter(f => !f.is_temp_image && !f.is_native_image && f.file_id && !f.uploading && !f.uploadFailed)
    .map(f => ({ file_id: f.file_id, file_name: f.file_name }));

  const baseMessage = String(mensagem || "").trim();
  const userPrompt = tempImageUrls.length
    ? baseMessage + "\n\nURLs das imagens anexadas:\n" + tempImageUrls.map((url, index) => (index + 1) + ". " + url).join("\n")
    : baseMessage;

  const userMessageId = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('msg_' + Date.now() + '_' + Math.random().toString(36).slice(2));
  // Sender identity is rendered via the chat card header (relabeled from
  // "LOV 3" to "Enviado por Superlovable" by overlay.js on lovable.dev).
  // Do NOT prepend it to the body — would show as a duplicate second line.
  const brandedUserPrompt = userPrompt;
  const syntheticMessage = "For the code present, I get the error below.\n\nPlease think step-by-step in order to resolve it.\n```\n" + userPrompt + "\n```\n";

  const payload = {
    id: userMessageId,
    files: [...nativeImageFiles, ...otherFiles],
    selected_elements: [],
    chat_only: false,
    contains_error: true,
    intent: "fix_error",
    message: syntheticMessage,
    message_intent_metadata: {
      fix_error_metadata: {
        errors: [
          { error_type: "runtime", error_message: brandedUserPrompt, build_event_id: "" }
        ]
      }
    },
    error_ids: [],
    runtime_errors: [],
    network_requests: [],
    session_replay: "",
    thread_id: "main",
    view: "preview",
    view_description: "The user is currently viewing the preview. ",
    model: null,
    optimisticImageUrls: []
  };

  // ===== Final payload validation (popup + sidepanel share this builder) =====
  tsDebug("[TS Native Send] spAttachedFiles:", spAttachedFiles);
  tsDebug("[TS Native Send] nativeImageFiles:", nativeImageFiles);
  tsDebug("[TS Native Send] final payload files:", payload.files);
  tsDebug("[TS Native Send] final payload:", payload);

  const hasAttachments = attachments.length > 0;
  if (hasAttachments) {
    const hasInlineRaw = attachments.some(a => a && a.rawFile);
    if (!hasInlineRaw && nativeImageFiles.length === 0 && otherFiles.length === 0 && tempImageUrls.length === 0) {
      showAlert('Erro', 'Imagem anexada, mas não entrou no payload. Verifique o console.');
      throw new Error('Imagem anexada, mas não entrou no payload. Verifique o console.');
    }
  }
  if (nativeImageFiles.length > 0) {
    const allValid = nativeImageFiles.every(item =>
      item.file_id && item.file_name && item.name &&
      item.file_type && item.type &&
      item.file_url && item.url
    );
    if (!allValid) {
      console.warn('[TS Native Send] nativeImageFiles inválidos:', nativeImageFiles);
      showAlert('Erro', 'Imagem anexada, mas não entrou no payload. Verifique o console.');
      throw new Error('Imagem anexada, mas não entrou no payload. Verifique o console.');
    }
  }

  // Envio via Edge Function "send-lovable-prompt" — método inline (LovaSiri).
  // Imagens e ZIPs são enviados como base64 no payload; sem links no prompt.
  const _b64FromFile = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result || ''); res(s.split(',')[1] || ''); };
    r.onerror = () => rej(new Error('Falha ao ler arquivo'));
    r.readAsDataURL(file);
  });
  const _inlineFiles = [];
  const _zipFiles = [];
  for (const f of attachments) {
    // Método inline: se existir rawFile, ele deve ser enviado mesmo que o upload antigo
    // por link tenha falhado. ZIP não pode depender do fluxo antigo de signed URL.
    if (f.uploading && !f.rawFile) continue;
    const rf = f.rawFile;
    if (!rf) continue;
    const name = f.file_name || rf.name || 'file';
    const type = (rf.type || f.file_type || '').toLowerCase();
    const isZip = type === 'application/zip' || type === 'application/x-zip-compressed' || /\.zip$/i.test(name);
    let b64 = '';
    try { b64 = await _b64FromFile(rf); } catch(e) { console.warn('[TS Inline Send] Falha ao ler anexo:', name, e); continue; }
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
    showAlert('Erro', 'Arquivo anexado, mas não entrou no payload inline. Verifique o console.');
    throw new Error('Arquivo anexado, mas não entrou no payload inline.');
  }

  const result = await bgFetchRaw(
    SUPABASE_URL + "/functions/v1/send-lovable-prompt",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify(edgePayload)
    }
  );

  const data = (result && result.data) ? result.data : {};
  const upstreamStatus = data.status || result?.status;

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    throw new Error("Sessão Lovable expirada. Recarregue a página e tente novamente.");
  }
  if (upstreamStatus === 402) {
    throw new Error("Você precisa ter pelo menos 1 crédito na sua conta Lovable.");
  }
  if (!result || result.ok !== true || data.ok === false || data.success === false) {
    throw new Error(
      (data && (data.error || data?.data?.message || data?.data?.error)) ||
      "Erro " + (upstreamStatus || result?.status || "desconhecido") + " ao enviar via edge function"
    );
  }

  return {
    success: true,
    method: "edge_send_lovable_prompt",
    data: data.data || data
  };
}

  function bgFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return reject(new Error("Extension context invalidated"));
        chrome.runtime.sendMessage({ action: "proxyFetch", url, method: opts.method || "POST", headers: opts.headers || {}, body: opts.body || null }, (resp) => {
          if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if(!resp) return reject(new Error("No response"));
          if(resp.data && typeof resp.data === "object") resolve(resp.data);
          else if(!resp.ok) reject(new Error("Fetch failed (" + resp.status + ")"));
          else resolve(resp.data);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

  function bgFetchRaw(url, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return reject(new Error("Extension context invalidated"));
        chrome.runtime.sendMessage({ action: "proxyFetch", url, method: opts.method || "POST", headers: opts.headers || {}, body: opts.body || null }, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp) return reject(new Error("No response"));
          resolve(resp);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

  function lovableApiFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return reject(new Error("Extension context invalidated"));
        chrome.runtime.sendMessage({ action: "lovableApiFetch", url, method: opts.method || "POST", headers: opts.headers || {}, body: opts.body || null }, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp) return reject(new Error("No response"));
          resolve(resp);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

  function getDeviceId() {
    return getHardwareFingerprint();
  }

  function showAlert(title, message) {
    const existing = document.querySelector('.sp-alert-overlay');
    if(existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'sp-alert-overlay';
    overlay.innerHTML = spTemplateAlert(title, message);
    document.body.appendChild(overlay);
    overlay.querySelector('.sp-alert-ok').addEventListener('click', () => overlay.remove());
    setTimeout(() => overlay.remove(), 4000);
  }

  // --- Settings Modal (Auto Approve etc.) ---
  function openSettingsModal() {
    const existing = document.querySelector('.sp-settings-overlay');
    if (existing) { existing.remove(); return; }

    chrome.storage.local.get(['sp_auto_approve','sp_auto_review_submit','soundNotificationsEnabled','notifyWhenDoneEnabled'], function(r) {
      const enabled = (r && typeof r.sp_auto_approve !== 'undefined') ? !!r.sp_auto_approve : true;
      const reviewEnabled = (r && typeof r.sp_auto_review_submit !== 'undefined') ? !!r.sp_auto_review_submit : true;
      const notifyEnabled = (r && typeof r.soundNotificationsEnabled !== 'undefined') ? r.soundNotificationsEnabled !== false : (r && typeof r.notifyWhenDoneEnabled !== 'undefined' ? r.notifyWhenDoneEnabled !== false : true);
      const overlay = document.createElement('div');
      overlay.className = 'sp-alert-overlay sp-settings-overlay';
      overlay.innerHTML =
        '<div class="sp-alert-box" style="max-width:360px">' +
          '<div class="sp-alert-title" style="display:flex;align-items:center;gap:8px">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
            '<span>Configurações</span>' +
          '</div>' +
          '<div class="sp-alert-msg" style="text-align:left;display:flex;flex-direction:column;gap:10px">' +
            '<label class="sp-setting-row" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:10px;border:1px solid var(--ql-border);background:var(--ql-bg-elevated)">' +
              '<input type="checkbox" id="sp-auto-approve-toggle" ' + (enabled ? 'checked' : '') + ' style="margin-top:3px;width:16px;height:16px;accent-color:var(--ql-accent);cursor:pointer" />' +
              '<span style="flex:1">' +
                '<span style="display:block;font-weight:700;font-size:13px;color:var(--ql-text-primary);margin-bottom:4px">Aprovar automaticamente ações das Skills</span>' +
                '<span style="display:block;font-size:11px;color:var(--ql-text-muted);line-height:1.45">Quando o Lovable pedir confirmação para uma ação de Skill/agente, a extensão irá aprovar sozinha. <strong>Uso avançado</strong>: arquivos podem ser alterados sem confirmação manual.</span>' +
                '<span id="sp-auto-approve-status" style="display:' + (enabled ? 'inline-block' : 'none') + ';margin-top:8px;padding:3px 8px;border-radius:6px;background:rgba(34,197,94,0.12);color:#16a34a;font-size:10px;font-weight:700"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.check + '</span> Auto Approve habilitado</span>' +
              '</span>' +
            '</label>' +
            '<label class="sp-setting-row" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:10px;border:1px solid var(--ql-border);background:var(--ql-bg-elevated)">' +
              '<input type="checkbox" id="sp-auto-review-toggle" ' + (reviewEnabled ? 'checked' : '') + ' style="margin-top:3px;width:16px;height:16px;accent-color:var(--ql-accent);cursor:pointer" />' +
              '<span style="flex:1">' +
                '<span style="display:block;font-weight:700;font-size:13px;color:var(--ql-text-primary);margin-bottom:4px">Enviar automaticamente formulários de revisão</span>' +
                '<span style="display:block;font-size:11px;color:var(--ql-text-muted);line-height:1.45">Quando aparecer um "Review answers", a extensão coleta as opções já selecionadas no formulário e envia o Submit sozinha. Se não conseguir extrair as respostas, a aprovação automática é ignorada.</span>' +
                '<span id="sp-auto-review-status" style="display:' + (reviewEnabled ? 'inline-block' : 'none') + ';margin-top:8px;padding:3px 8px;border-radius:6px;background:rgba(34,197,94,0.12);color:#16a34a;font-size:10px;font-weight:700"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.check + '</span> Auto Submit habilitado</span>' +
              '</span>' +
            '</label>' +
            '<label class="sp-setting-row" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:10px;border:1px solid var(--ql-border);background:var(--ql-bg-elevated)">' +
              '<input type="checkbox" id="sp-notify-done-toggle" ' + (notifyEnabled ? 'checked' : '') + ' style="margin-top:3px;width:16px;height:16px;accent-color:var(--ql-accent);cursor:pointer" />' +
              '<span style="flex:1">' +
                '<span style="display:block;font-weight:700;font-size:13px;color:var(--ql-text-primary);margin-bottom:4px">Tocar som quando o Lovable terminar</span>' +
                '<span style="display:block;font-size:11px;color:var(--ql-text-muted);line-height:1.45">Toca um som de notificação quando o Lovable terminar de processar/editar a sua solicitação.</span>' +
                '<span id="sp-notify-done-status" style="display:' + (notifyEnabled ? 'inline-block' : 'none') + ';margin-top:8px;padding:3px 8px;border-radius:6px;background:rgba(34,197,94,0.12);color:#16a34a;font-size:10px;font-weight:700"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.check + '</span> Som habilitado</span>' +
              '</span>' +
            '</label>' +
          '</div>' +
          '<button class="sp-alert-ok">Fechar</button>' +
        '</div>';
      document.body.appendChild(overlay);
      const toggle = overlay.querySelector('#sp-auto-approve-toggle');
      const statusEl = overlay.querySelector('#sp-auto-approve-status');
      toggle.addEventListener('change', function() {
        const val = !!toggle.checked;
        chrome.storage.local.set({ sp_auto_approve: val });
        if (statusEl) statusEl.style.display = val ? 'inline-block' : 'none';
      });
      const reviewToggle = overlay.querySelector('#sp-auto-review-toggle');
      const reviewStatusEl = overlay.querySelector('#sp-auto-review-status');
      reviewToggle.addEventListener('change', function() {
        const val = !!reviewToggle.checked;
        chrome.storage.local.set({ sp_auto_review_submit: val });
        if (reviewStatusEl) reviewStatusEl.style.display = val ? 'inline-block' : 'none';
      });
      const notifyToggle = overlay.querySelector('#sp-notify-done-toggle');
      const notifyStatusEl = overlay.querySelector('#sp-notify-done-status');
      notifyToggle.addEventListener('change', function() {
        const val = !!notifyToggle.checked;
        chrome.storage.local.set({ soundNotificationsEnabled: val, notifyWhenDoneEnabled: val });
        if (notifyStatusEl) notifyStatusEl.style.display = val ? 'inline-block' : 'none';
      });
      overlay.querySelector('.sp-alert-ok').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    });
  }

  // --- Sound notifications toggle (replaces gear button) ---
  function updateSoundButtonUI(enabled) {
    const btn = document.querySelector('#sp-sound-toggle');
    if (!btn) return;
    const on = btn.querySelector('.sp-sound-icon-on');
    const off = btn.querySelector('.sp-sound-icon-off');
    if (on) on.style.display = enabled ? 'block' : 'none';
    if (off) off.style.display = enabled ? 'none' : 'block';
    btn.title = enabled ? 'Notificações sonoras ativadas' : 'Notificações sonoras desativadas';
    btn.classList.toggle('ts-sound-enabled', enabled);
    btn.classList.toggle('ts-sound-disabled', !enabled);
  }

  async function toggleSoundNotifications() {
    const current = await new Promise(r => chrome.storage.local.get(['soundNotificationsEnabled'], s => r(s.soundNotificationsEnabled !== false)));
    const next = !current;
    await new Promise(r => chrome.storage.local.set({ soundNotificationsEnabled: next, notifyWhenDoneEnabled: next }, r));
    updateSoundButtonUI(next);
  }

  function initSoundButtonUI() {
    chrome.storage.local.get(['soundNotificationsEnabled'], (s) => {
      updateSoundButtonUI(s.soundNotificationsEnabled !== false);
    });
  }
  // Poll for button presence (rendered later)
  const _soundBtnInit = setInterval(() => {
    if (document.querySelector('#sp-sound-toggle')) {
      clearInterval(_soundBtnInit);
      initSoundButtonUI();
    }
  }, 300);

  // --- Allow external floating button (in host page) to close this side panel ---
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'tsClosePanel') {
        try { window.close(); } catch(_){}
      }
      if (msg && msg.target && msg.target !== 'sidepanel') return;
    });
  } catch(_){}



  function tsPlayPromptSentSoundInActiveTab() {
    try {
      chrome.storage.local.get(['soundNotificationsEnabled'], (s) => {
        if (s.soundNotificationsEnabled === false) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs && tabs[0] && tabs[0].id;
          if (!tabId) return;
          try { chrome.tabs.sendMessage(tabId, { action: 'tsPlayPromptSentSound' }, () => void chrome.runtime.lastError); } catch(_){}
        });
      });
    } catch(_){}
  }

  // --- Header Event Listeners ---
  // document.getElementById('sp-back-to-popup').addEventListener('click', () => {
  //   try { chrome.storage.local.set({ ql_sidebar_mode: false }); } catch(e) {}
  //   try { chrome.runtime.sendMessage({ action: "deactivateSidebar" }); } catch(e) {}
  //   try { window.close(); } catch(e) {}
  // });

  function syncThemeButton() {
    const themeBtn = document.querySelector('.sp-theme-btn');
    if (!themeBtn) return;
    const isLight = document.body.classList.contains('sp-light');
    const moon = themeBtn.querySelector('.sp-theme-moon');
    const sun = themeBtn.querySelector('.sp-theme-sun');
    if (moon) moon.style.display = isLight ? 'block' : 'none';
    if (sun) sun.style.display = isLight ? 'none' : 'block';
  }

  function setTheme(isLight) {
    document.body.classList.toggle('sp-light', isLight);
    chrome.storage.local.set({ ql_dark_mode: !isLight });
    syncThemeButton();
  }

  // --- Notifications ---
  const notifPanel = document.getElementById('sp-notif-panel');

document.addEventListener('click', function(e) {
const themeBtn = e.target.closest('.sp-theme-btn');

if (themeBtn) {
  setTheme(!document.body.classList.contains('sp-light'));
  return;
}

const loginThemeBtn = e.target.closest('#sp-login-theme-btn');
if (loginThemeBtn) {
  setTheme(!document.body.classList.contains('sp-light'));
  return;
}

const buyBtn = e.target.closest('.sp-buy-btn');
if (buyBtn) {
  window.open((window.LVB_API_BASE || 'https://lvbsonic.replit.app') + '/planos', '_blank');
  return;
}

const soundBtn = e.target.closest('.sp-sound-btn');
  if (soundBtn) {
    e.stopPropagation();
    toggleSoundNotifications();
    return;
  }

  const lockBtn = e.target.closest('.sp-lock-btn');
  if (lockBtn) {
    e.stopPropagation();
    chrome.storage.local.get({ ts_intercept_locked: false }, (r) => {
      const newLocked = !r.ts_intercept_locked;
      chrome.storage.local.set({ ts_intercept_locked: newLocked });
      updateLockBtnVisual(newLocked);
    });
    return;
  }

  const settingsBtn = e.target.closest('.sp-settings-btn');
  if (settingsBtn) {
    e.stopPropagation();
    openSettingsModal();
    return;
  }

const logoutBtn = e.target.closest('.sp-logout-btn');
  if (logoutBtn) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    chrome.storage.local.remove(
      ["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"],
      () => {
        userName = null;
        expiresAt = null;
        licenseStatus = null;
        sessionId = null;
        licenseKey = null;
        showLicenseGate();
      }
    );

    return;
  }

  const notifBtn = e.target.closest('.sp-notif-btn');
  if (notifBtn) {
    e.stopPropagation();
    const isOpen = notifPanel.style.display !== 'none';
    notifPanel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) loadNotifications();
    return;
  }

  const layoutBtn = e.target.closest('.sp-layout-btn');
  if (layoutBtn) {
    e.stopPropagation();
    toggleExtensionLayoutMode();
    return;
  }
});

function setExtensionLayoutMode(mode) {
  const isPopup = false;
  const stored = 'sidebar';
  try { chrome.storage.local.set({ tsExtensionLayoutMode: stored }); } catch(_) {}
  try {
    window.parent && window.parent.postMessage({ type: 'TS_OVERLAY_SET_LAYOUT', mode: stored }, '*');
  } catch(_) {}
  // Update icon state
  document.querySelectorAll('.sp-layout-btn').forEach((btn) => {
    const sb = btn.querySelector('.sp-layout-icon-sidebar');
    const fl = btn.querySelector('.sp-layout-icon-floating');
    if (sb) sb.style.display = isPopup ? 'none' : 'block';
    if (fl) fl.style.display = isPopup ? 'block' : 'none';
  });
}

function toggleExtensionLayoutMode() {
  setExtensionLayoutMode('sidebar');
}

// Restore icon state on load
try {
  chrome.storage.local.get({ tsExtensionLayoutMode: 'sidebar' }, (r) => {
    const mode = (r && r.tsExtensionLayoutMode) || 'sidebar';
    setExtensionLayoutMode(mode);
  });
} catch(_) {}

// ===== Popup mode bridge: share templates and run actions on behalf of the launcher =====
function tsPostTemplatesToParent() {
  try {
    if (typeof SP_TEMPLATES === 'undefined' || !Array.isArray(SP_TEMPLATES)) return;
    const slim = SP_TEMPLATES.map(t => ({ icon: t.icon, label: t.label, prompt: t.prompt }));
    window.parent && window.parent.postMessage({ type: 'TS_OVERLAY_TEMPLATES', templates: slim }, '*');
  } catch(_) {}
}
// Send immediately and on a short delay (in case parent listener attaches late).
tsPostTemplatesToParent();
setTimeout(tsPostTemplatesToParent, 400);
setTimeout(tsPostTemplatesToParent, 1500);

function tsReplyPopup(ok, message) {
  try { window.parent && window.parent.postMessage({ type: 'TS_POPUP_RESULT', ok: !!ok, message: message || '' }, '*'); } catch(_) {}
}

window.addEventListener('message', async (event) => {
  const data = event && event.data;
  if (!data || data.type !== 'TS_POPUP_ACTION') return;
  const action = data.action;
  try {
    if (action === 'send') {
      const ta = document.getElementById('sp-msg');
      if (ta) ta.value = String(data.prompt || '');
      // Popup may pass uploaded file metadata explicitly — hydrate spAttachedFiles
      const incomingFiles = Array.isArray(data.files) ? data.files : null;
      tsDebug('[TS Native Send] pending attachments:', incomingFiles);
      if (incomingFiles && incomingFiles.length) {
        spAttachedFiles = incomingFiles.map(f => {
          const ftype = f.file_type || f.type || '';
          const isImg = (ftype || '').indexOf('image/') === 0;
          // If popup forwarded an image with a valid file_id+file_url, treat as native image
          // even if upstream forgot to set the flag. Matches sidepanel's payload builder.
          const isNative = !!f.is_native_image || (isImg && !!f.file_id && !!(f.file_url || f.url));
          return {
            file_id: f.file_id || null,
            file_name: f.file_name || f.name || 'file',
            name: f.name || f.file_name || 'file',
            file_type: ftype,
            type: ftype,
            file_url: f.file_url || f.url || '',
            url: f.url || f.file_url || '',
            download_url: f.download_url || '',
            is_temp_image: !!f.is_temp_image && !isNative,
            is_native_image: isNative,
            uploading: false,
            uploadFailed: false,
            previewUrl: null,
            rawFile: null,
            sizeLabel: '',
          };
        });
        if (typeof spRenderAttachPreview === 'function') spRenderAttachPreview();
      }
      tsDebug('[TS Native Send] files sent (hydrated spAttachedFiles):', spAttachedFiles);
      if (typeof handleSend === 'function') {
        await handleSend();
        tsReplyPopup(true, 'Prompt enviado');
      } else { tsReplyPopup(false, 'handleSend indisponível'); }
    } else if (action === 'attach') {
      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.length) { tsReplyPopup(false, 'Nenhum arquivo'); return; }
      if (typeof spHandleFilesAttach === 'function') {
        await spHandleFilesAttach(files);
        tsReplyPopup(true, 'Arquivo anexado — envie o prompt para incluir');
      } else { tsReplyPopup(false, 'Anexo indisponível'); }
    } else if (action === 'detach') {
      try {
        const name = String(data.name || '');
        const size = Number(data.size || 0);
        const idx = spAttachedFiles.findIndex(f =>
          (f.file_name === name) && (!size || !f.rawFile || f.rawFile.size === size)
        );
        if (idx >= 0) {
          const item = spAttachedFiles[idx];
          if (item && item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl); } catch(_){} }
          spAttachedFiles.splice(idx, 1);
          if (typeof spRenderAttachPreview === 'function') spRenderAttachPreview();
          tsReplyPopup(true, 'Anexo removido');
        } else {
          tsReplyPopup(false, 'Anexo não encontrado');
        }
      } catch(e) { tsReplyPopup(false, '' + (e && e.message || String(e))); }
    } else if (action === 'optimize') {
      const btn = document.getElementById('sp-optimize');
      if (btn) { btn.click(); tsReplyPopup(true, 'Otimizando…'); }
      else tsReplyPopup(false, 'Otimizar indisponível');
    } else if (action === 'watermark') {
      const btn = document.getElementById('sp-remove-watermark');
      if (btn) { btn.click(); tsReplyPopup(true, 'Removendo marca d\'água'); }
      else tsReplyPopup(false, 'Marca d\'água indisponível');
    } else if (action === 'download') {
      const btn = document.getElementById('sp-download-project');
      if (btn) { btn.click(); tsReplyPopup(true, 'Baixando arquivos'); }
      else tsReplyPopup(false, 'Download indisponível');
    }
  } catch(err) {
    tsReplyPopup(false, '' + (err && err.message ? err.message : String(err)));
  }
});



const notifClose = document.getElementById('sp-notif-close');
if (notifClose) {
  notifClose.addEventListener('click', () => {
    notifPanel.style.display = 'none';
  });
}

  async function loadNotifications() {
    // Neutralized: remote notifications feed disabled (previous owner's server).
    const list = document.getElementById('sp-notif-list');
    if (list) list.innerHTML = '<p class="sp-notif-empty">Nenhuma notificação.</p>';
    const badge = document.querySelector('.sp-notif-badge');
    if (badge) badge.style.display = 'none';
  }

  async function checkUnread() {
    // Neutralized: no remote unread check.
    const badge = document.querySelector('.sp-notif-badge');
    if (badge) badge.style.display = 'none';
  }

  // --- Update Check ---
  async function checkForUpdate() {
    // Neutralized: remote version/update check disabled.
    return;
  }

  // --- Reseller Name (whitelabel) ---
  let spResellerName = '';
  function getSafeName(name) {
    if (!name) return '';
    return name.trim().replace(/[^a-zA-Z0-9À-ÿ\s\-_]/g, '').replace(/\s+/g, '-').substring(0, 40) || '';
  }

  async function loadResellerName() {
    return new Promise(r => chrome.storage.local.get(['ql_reseller_name'], res => {
      spResellerName = (res.ql_reseller_name || '').trim();
      const input = document.getElementById('sp-reseller-name');
      if (input && spResellerName) input.value = spResellerName;
    }));
  }

  document.addEventListener('click', async e => {
    if (e.target.id === 'sp-save-reseller-name') {
      const input = document.getElementById('sp-reseller-name');
      if (!input) return;
      spResellerName = getSafeName(input.value);
      await chrome.storage.local.set({ ql_reseller_name: spResellerName });
      input.value = spResellerName;
      const btn = document.getElementById('sp-save-reseller-name');
      if (btn) { btn.textContent = 'Salvo!'; setTimeout(() => { if (btn) btn.textContent = 'Salvar'; }, 1500); }
    }
  });

  // --- Reseller Role Check ---
  async function checkResellerRole() {
    try {
      const data = await bgFetch(USER_ROLES_URL + "&user_id=eq." + (await getUserId()), { method: "GET", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } });
      if (data && Array.isArray(data) && data.some(r => r.role === 'reseller' || r.role === 'admin')) {
        isResellerUser = true;
        const btn = document.getElementById('sp-reseller-btn');
        if (btn) btn.style.display = 'block';
      }
    } catch(e) {}
  }

  async function getUserId() {
    return new Promise(r => chrome.storage.local.get(["ql_license_key"], res => {
      r(res.ql_license_key || '');
    }));
  }

  // --- License Gate ---
  function showLicenseGate() {
    const body = document.getElementById('sp-body');
    body.innerHTML = spTemplateLicenseGate();
    document.getElementById('sp-validate-btn').addEventListener('click', validateLicense);
  }

  async function validateLicense() {
    const input = document.getElementById('sp-license-input');
    const log = document.getElementById('sp-license-log');
    const key = input ? input.value.trim() : '';
    if(!key) { log.className = 'sp-log sp-log-error'; log.textContent = 'Insira uma chave'; return; }
    log.className = 'sp-log sp-log-info'; log.textContent = 'Validando...';
    try {
      if(!deviceId) deviceId = await getDeviceId();
      const data = await lvbValidate(bgFetch, key, deviceId);
      if(data.valid) {
        sessionId = data.session_id; userName = data.user_name; expiresAt = data.expires_at; 
        licenseStatus = data.status;
licenseType = data.license_type || 'paid';
licenseLifetime = data.lifetime || false;
licenseKey = key;
        chrome.storage.local.set({ ql_license_valid: true, ql_license_key: key, ql_session_id: data.session_id, ql_user_name: data.user_name || null, ql_expires_at: data.expires_at || null, ql_activated_at: data.activated_at || null, ql_license_status: data.status || null, ql_license_lifetime: licenseLifetime, ql_license_type: data.license_type || 'paid', }, () => {
          log.className = 'sp-log sp-log-success'; log.textContent = '' + data.message;
          setTimeout(() => { showMainUI(); startHeartbeat(key); }, 800);
        });
      } else {
        log.className = 'sp-log sp-log-error'; log.textContent = '' + data.message;
      }
    } catch(err) { log.className = 'sp-log sp-log-error'; log.textContent = 'Erro de conexão'; }
  }

  // --- Chat History ---
  function loadChatHistory(cb) {
    chrome.storage.local.get([SP_HISTORY_KEY], function(r) {
      spChatHistory = r[SP_HISTORY_KEY] || [];
      if (cb) cb();
    });
  }

  function saveChatHistory() {
    if (spChatHistory.length > SP_MAX_HISTORY) spChatHistory = spChatHistory.slice(-SP_MAX_HISTORY);
    chrome.storage.local.set({ [SP_HISTORY_KEY]: spChatHistory });
  }

  function addToHistory(text, status) {
    spChatHistory.push({ text: text, timestamp: new Date().toISOString(), status: status || 'ok' });
    saveChatHistory();
    updateHistoryBadge();
  }

  function updateHistoryBadge() {
    var badge = document.querySelector('.sp-tab[data-tab="history"] .sp-tab-badge');
    if (badge) badge.textContent = spChatHistory.length;
  }

  function renderHistoryTab() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML = spTemplateChatHistory(spChatHistory);
    // Scroll to bottom
    var msgs = container.querySelector('.sp-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    // Clear button
    var clearBtn = document.getElementById('sp-chat-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        spChatHistory = [];
        saveChatHistory();
        renderHistoryTab();
      });
    }
  }

  function renderPromptTab() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML = spTemplatePromptContent();
  }

  // --- Skills ---
  function loadSkills(cb) {
    chrome.storage.local.get([SP_SKILLS_KEY], function(r) {
      spSkills = r[SP_SKILLS_KEY] || [];
      if (cb) cb();
    });
  }

  function saveSkills(cb) {
    chrome.storage.local.set({ [SP_SKILLS_KEY]: spSkills }, function() {
      updateSkillsBadge();
      if (cb) cb();
    });
  }

  function updateSkillsBadge() {
    var badge = document.querySelector('.sp-tab[data-tab="skills"] .sp-tab-badge');
    var tab = document.querySelector('.sp-tab[data-tab="skills"]');
    if (!tab) return;
    if (spSkills.length === 0) { if (badge) badge.remove(); return; }
    if (badge) { badge.textContent = spSkills.length; }
    else {
      var b = document.createElement('span');
      b.className = 'sp-tab-badge';
      b.textContent = spSkills.length;
      tab.appendChild(b);
    }
  }

  function renderSkillsTab() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    if (spSkillFormState !== null) {
      container.innerHTML = spTemplateSkillForm(spSkillFormState);
      bindSkillFormEvents();
    } else {
      container.innerHTML = spTemplateSkillsList(spGetAllSkills());
      bindSkillsListEvents();
    }
  }

  function bindSkillsListEvents() {
    var newBtn = document.getElementById('sp-skill-new-btn');
    if (newBtn) newBtn.addEventListener('click', function() {
      spSkillFormState = { id: '', name: '', description: '', icon: '✦', content: '' };
      renderSkillsTab();
    });
    document.querySelectorAll('.sp-skill-edit').forEach(function(b) {
      b.addEventListener('click', function() {
        var id = b.getAttribute('data-skill-id');
        var s = spSkills.find(function(x){ return x.id === id; });
        if (s) { spSkillFormState = Object.assign({}, s); renderSkillsTab(); }
      });
    });
    document.querySelectorAll('.sp-skill-del').forEach(function(b) {
      b.addEventListener('click', function() {
        var id = b.getAttribute('data-skill-id');
        if (!confirm('Excluir esta skill?')) return;
        spSkills = spSkills.filter(function(x){ return x.id !== id; });
        saveSkills(renderSkillsTab);
      });
    });
    document.querySelectorAll('.sp-skill-inject').forEach(function(b) {
      b.addEventListener('click', function() {
        var id = b.getAttribute('data-skill-id');
        var s = spGetAllSkills().find(function(x){ return x.id === id; });
        if (s) injectSkillIntoPrompt(s);
      });
    });
  }

  function bindSkillFormEvents() {
    var back = document.getElementById('sp-skill-back');
    var cancel = document.getElementById('sp-skill-cancel');
    var save = document.getElementById('sp-skill-save');
    function goBack() { spSkillFormState = null; renderSkillsTab(); }
    if (back) back.addEventListener('click', goBack);
    if (cancel) cancel.addEventListener('click', goBack);
    if (save) save.addEventListener('click', function() {
      var id = document.getElementById('sp-skill-id').value;
      var name = document.getElementById('sp-skill-name').value.trim();
      var desc = document.getElementById('sp-skill-desc').value.trim();
      var icon = document.getElementById('sp-skill-icon').value.trim() || '✦';
      var content = document.getElementById('sp-skill-content').value.trim();
      if (!name) { alert('Nome é obrigatório'); return; }
      if (!content) { alert('Conteúdo do prompt é obrigatório'); return; }
      var now = new Date().toISOString();
      if (id) {
        spSkills = spSkills.map(function(s) {
          return s.id === id ? Object.assign({}, s, { name: name, description: desc, icon: icon, content: content, updatedAt: now }) : s;
        });
      } else {
        spSkills.push({
          id: 'sk_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
          name: name, description: desc, icon: icon, content: content,
          createdAt: now, updatedAt: now
        });
      }
      saveSkills(function() { spSkillFormState = null; renderSkillsTab(); });
    });
  }

  var spActiveSkill = null;

  function renderActiveSkillBadge() {
    var box = document.getElementById('sp-active-skill');
    if (!box) return;
    if (!spActiveSkill) { box.style.display = 'none'; box.innerHTML = ''; return; }
    var icon = spActiveSkill.icon || '✦';
    var name = (spActiveSkill.name || 'Skill').replace(/</g, '&lt;');
    box.style.display = '';
    box.innerHTML =
      '<span class="sp-active-skill-chip" title="' + name + ' aplicada">' +
        '<span class="sp-active-skill-ico">' + icon + '</span>' +
        '<span class="sp-active-skill-name">' + name + '</span>' +
        '<button type="button" class="sp-active-skill-x" title="Remover skill">×</button>' +
      '</span>';
    var x = box.querySelector('.sp-active-skill-x');
    if (x) x.addEventListener('click', function() { spActiveSkill = null; renderActiveSkillBadge(); });
  }

  function injectSkillIntoPrompt(skill) {
    spActiveSkill = skill;
    spActiveTab = 'prompt';
    spSkillFormState = null;
    document.querySelectorAll('.sp-tab').forEach(function(t) {
      t.classList.toggle('sp-tab-active', t.getAttribute('data-tab') === 'prompt');
    });
    showMainUIContent();
    setTimeout(function() {
      renderActiveSkillBadge();
      var ta = document.getElementById('sp-msg');
      if (ta) ta.focus();
    }, 0);
  }

  function toggleSkillsPicker() {
    var existing = document.getElementById('sp-skills-picker');
    if (existing) { existing.remove(); return; }
    var btn = document.getElementById('sp-skills-quick');
    if (!btn) return;
    loadSkills(function() {
      var pop = document.createElement('div');
      pop.id = 'sp-skills-picker';
      pop.className = 'sp-skills-picker';
      pop.innerHTML = '<div class="sp-skills-picker-head">Inserir skill</div>' + spTemplateSkillsPicker(spGetAllSkills());
      document.body.appendChild(pop);
      var r = btn.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.left = Math.max(8, r.left) + 'px';
      pop.style.bottom = (window.innerHeight - r.top + 6) + 'px';
      pop.querySelectorAll('.sp-skills-picker-item').forEach(function(it) {
        it.addEventListener('click', function() {
          var id = it.getAttribute('data-skill-id');
          var s = spGetAllSkills().find(function(x){ return x.id === id; });
          pop.remove();
          if (s) injectSkillIntoPrompt(s);
        });
      });
      setTimeout(function() {
        function off(e) {
          if (!pop.contains(e.target) && e.target !== btn) {
            pop.remove();
            document.removeEventListener('click', off);
          }
        }
        document.addEventListener('click', off);
      }, 0);
    });
  }

  // ===== Slash skill autocomplete =====
  var spSkillAcEl = null;
  var spSkillAcItems = [];
  var spSkillAcActive = 0;

  function spSkillAcOpen() { return !!spSkillAcEl; }

  function spSkillAcClose() {
    if (spSkillAcEl) { spSkillAcEl.remove(); spSkillAcEl = null; }
    spSkillAcItems = [];
    spSkillAcActive = 0;
  }

  function spSkillAcCurrentToken(ta) {
    var pos = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    var before = ta.value.slice(0, pos);
    var m = before.match(/(^|\s)\/([a-zA-Z0-9_-]*)$/);
    if (!m) return null;
    return { query: m[2], start: pos - (m[2].length + 1), end: pos };
  }

  function spSkillAcRender(ta, token) {
    var skills = spGetAllSkills().filter(function(s) {
      if (!s.prefix && !s.content) return false;
      if (!token.query) return true;
      var q = token.query.toLowerCase();
      return (s.name || '').toLowerCase().indexOf(q) !== -1 ||
             (s.prefix || '').toLowerCase().indexOf(q) !== -1 ||
             (s.description || '').toLowerCase().indexOf(q) !== -1;
    });
    spSkillAcItems = skills;
    if (!skills.length) { spSkillAcClose(); return; }
    if (spSkillAcActive >= skills.length) spSkillAcActive = 0;

    if (!spSkillAcEl) {
      spSkillAcEl = document.createElement('div');
      spSkillAcEl.id = 'sp-skill-autocomplete';
      spSkillAcEl.setAttribute('role', 'listbox');
      spSkillAcEl.style.cssText = [
        'position:fixed','z-index:99999',
        'background:var(--ql-bg-elevated,#111113)',
        'border:1px solid var(--ql-border,rgba(255,255,255,0.08))',
        'border-radius:14px','box-shadow:0 12px 32px rgba(0,0,0,0.35)',
        'padding:6px','min-width:240px','max-width:340px','max-height:280px',
        'overflow-y:auto','font-family:Inter,system-ui,sans-serif'
      ].join(';');
      document.body.appendChild(spSkillAcEl);
    }
    spSkillAcEl.innerHTML = skills.map(function(s, i) {
      var icon = s.icon || '✦';
      var name = (s.name || '').replace(/</g, '&lt;');
      var desc = (s.description || '').replace(/</g, '&lt;');
      return '<div class="sp-skill-ac-item' + (i === spSkillAcActive ? ' active' : '') + '" data-idx="' + i + '" ' +
        'style="display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;cursor:pointer;' +
        (i === spSkillAcActive ? 'background:rgba(200,76,255,0.16);' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ql-text-primary,#f4f4f5)">' +
          '<span>' + icon + '</span><span>' + name + '</span>' +
        '</div>' +
        (desc ? '<div style="font-size:11px;color:var(--ql-text-muted,#71717a);padding-left:22px">' + desc + '</div>' : '') +
      '</div>';
    }).join('');

    spSkillAcEl.querySelectorAll('.sp-skill-ac-item').forEach(function(el) {
      el.addEventListener('mouseenter', function() {
        spSkillAcActive = parseInt(el.getAttribute('data-idx'), 10) || 0;
        spSkillAcHighlight();
      });
      el.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var idx = parseInt(el.getAttribute('data-idx'), 10) || 0;
        spSkillAcSelect(ta, idx);
      });
    });

    var r = ta.getBoundingClientRect();
    spSkillAcEl.style.left = Math.max(8, r.left) + 'px';
    var w = Math.min(340, Math.max(240, r.width));
    spSkillAcEl.style.width = w + 'px';
    // place above the textarea
    spSkillAcEl.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    spSkillAcEl.style.top = 'auto';
  }

  function spSkillAcHighlight() {
    if (!spSkillAcEl) return;
    spSkillAcEl.querySelectorAll('.sp-skill-ac-item').forEach(function(el, i) {
      var on = i === spSkillAcActive;
      el.classList.toggle('active', on);
      el.style.background = on ? 'rgba(200,76,255,0.16)' : '';
      if (on) {
        var top = el.offsetTop, bot = top + el.offsetHeight;
        if (top < spSkillAcEl.scrollTop) spSkillAcEl.scrollTop = top;
        else if (bot > spSkillAcEl.scrollTop + spSkillAcEl.clientHeight)
          spSkillAcEl.scrollTop = bot - spSkillAcEl.clientHeight;
      }
    });
  }

  function spSkillAcSelect(ta, idx) {
    var skill = spSkillAcItems[idx];
    spSkillAcClose();
    if (!skill) return;
    var token = spSkillAcCurrentToken(ta);
    if (token) {
      ta.value = (ta.value.slice(0, token.start) + ta.value.slice(token.end)).replace(/^\s+/, '');
    }
    injectSkillIntoPrompt(skill);
  }

  function setupSpSkillAutocomplete() {
    var ta = document.getElementById('sp-msg');
    if (!ta) return;
    ta.addEventListener('input', function() {
      var token = spSkillAcCurrentToken(ta);
      if (!token) { spSkillAcClose(); return; }
      spSkillAcRender(ta, token);
    });
    ta.addEventListener('keydown', function(e) {
      if (!spSkillAcOpen()) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        spSkillAcActive = (spSkillAcActive + 1) % spSkillAcItems.length;
        spSkillAcHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        spSkillAcActive = (spSkillAcActive - 1 + spSkillAcItems.length) % spSkillAcItems.length;
        spSkillAcHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        spSkillAcSelect(ta, spSkillAcActive);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        spSkillAcClose();
      }
    });
    ta.addEventListener('blur', function() {
      setTimeout(function() { spSkillAcClose(); }, 150);
    });
    document.addEventListener('click', function(e) {
      if (!spSkillAcEl) return;
      if (spSkillAcEl.contains(e.target) || e.target === ta) return;
      spSkillAcClose();
    });
  }

  function switchTab(tab) {
    spActiveTab = tab;
    spSkillFormState = null;
    document.querySelectorAll('.sp-tab').forEach(function(t) {
      t.classList.toggle('sp-tab-active', t.getAttribute('data-tab') === tab);
    });
    if (tab === 'history') {
      loadChatHistory(function() { renderHistoryTab(); });
    } else if (tab === 'skills') {
      loadSkills(function() { renderSkillsTab(); });
    } else {
      showMainUIContent();
    }
  }

  // --- Main UI ---
  function showMainUI() {
  const greeting = spEscapeHtml(userName || 'User');
  const statusBadge = spTemplateStatusBadge(licenseStatus);
  const body = document.getElementById('sp-body');

  loadChatHistory(function() {
    body.innerHTML = '<div id="sp-update-banner" style="display:none"></div>' +

      '<div class="sp-profile-card">' +
        '<div class="sp-profile-top">' +

          '<div class="sp-profile-left">' +
            '<div class="sp-profile-name-row">' +
              '<span class="sp-profile-name" id="sp-name">' + greeting + '</span>' +
              statusBadge +
            '</div>' +
          '</div>' +

          '<div class="sp-profile-actions">' +

            '<button class="sp-profile-action sp-theme-btn" title="Alternar tema">' +
              '<svg class="sp-theme-icon sp-theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>' +
              '</svg>' +
              '<svg class="sp-theme-icon sp-theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">' +
                '<circle cx="12" cy="12" r="5"/>' +
                '<line x1="12" y1="1" x2="12" y2="3"/>' +
                '<line x1="12" y1="21" x2="12" y2="23"/>' +
                '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>' +
                '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
                '<line x1="1" y1="12" x2="3" y2="12"/>' +
                '<line x1="21" y1="12" x2="23" y2="12"/>' +
                '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>' +
                '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' +
              '</svg>' +
            '</button>' +


            '<button class="sp-profile-action sp-notif-btn" title="Notificações">' +
              '<svg class="sp-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
                '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
              '</svg>' +
              '<span class="sp-notif-badge" style="display:none">0</span>' +
            '</button>' +

            '<button class="sp-profile-action sp-layout-btn" title="Alternar modo flutuante" style="display:none">' +
              '<svg class="sp-action-icon sp-layout-icon-sidebar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
                '<line x1="15" y1="3" x2="15" y2="21"/>' +
              '</svg>' +
              '<svg class="sp-action-icon sp-layout-icon-floating" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">' +
                '<rect x="3" y="3" width="13" height="13" rx="2"/>' +
                '<rect x="9" y="9" width="12" height="12" rx="2" fill="currentColor" fill-opacity="0.15"/>' +
              '</svg>' +
            '</button>' +

            '<button class="sp-profile-action sp-sound-btn" title="Notificações sonoras" id="sp-sound-toggle">' +
              '<svg class="sp-action-icon sp-sound-icon-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
                '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' +
                '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>' +
              '</svg>' +
              '<svg class="sp-action-icon sp-sound-icon-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">' +
                '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
                '<line x1="23" y1="9" x2="17" y2="15"/>' +
                '<line x1="17" y1="9" x2="23" y2="15"/>' +
              '</svg>' +
            '</button>' +

            '<button class="sp-profile-action sp-lock-btn" id="sp-lock-toggle" title="Bloquear teclado (pausa interceptação da extensão)">' +
              '<svg class="sp-action-icon" id="sp-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect x="3" y="11" width="18" height="11" rx="2"/>' +
                '<path id="sp-lock-path" d="M7 11V7a5 5 0 0 1 9.9-1"/>' +
              '</svg>' +
            '</button>' +

            '<button class="sp-profile-action sp-logout-btn" title="Sair">' +
              '<svg class="sp-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
                '<polyline points="16 17 21 12 16 7"/>' +
                '<line x1="21" y1="12" x2="9" y2="12"/>' +
              '</svg>' +
            '</button>' +

          '</div>' +
        '</div>' +

        '<div class="sp-sync-status" id="sp-sync"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.clock + '</span> Aguardando sincronização...</div>' +
        '<div class="sp-trial-countdown" id="sp-countdown" style="display:none"></div>' +
      '</div>' +

      '<div id="sp-reseller-btn" style="display:none;margin-bottom:14px">' +
        '<a href="https://extensaosorax.lovable.app/painelrevenda" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid rgba(var(--ts-brand-primary-rgb),0.3);background:rgba(var(--ts-brand-primary-rgb),0.06);color:var(--ql-accent);text-decoration:none;font-size:12px;font-weight:700;transition:all 0.2s">' +
          '<span style="vertical-align:middle;display:inline-flex">' + SP_SVG.briefcase + '</span> Painel do Revendedor<span style="margin-left:auto;font-size:10px;opacity:0.6;display:inline-flex">' + SP_SVG.arrowRight + '</span>' +
        '</a>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">' +
          '<input type="text" id="sp-reseller-name" placeholder="Nome da sua empresa" style="flex:1;padding:7px 10px;border-radius:8px;border:1px solid rgba(var(--ts-brand-primary-rgb),0.25);background:rgba(var(--ts-brand-primary-rgb),0.05);color:var(--ql-text);font-size:12px;outline:none" />' +
          '<button id="sp-save-reseller-name" style="padding:7px 12px;border-radius:8px;border:none;background:rgba(var(--ts-brand-primary-rgb),0.8);color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Salvar</button>' +
        '</div>' +
      '</div>' +

      spTemplateTabs(spActiveTab, spChatHistory.length, spSkills.length) +
      '<div id="sp-tab-content"></div>';

    document.querySelectorAll('.sp-tab').forEach(function(t) {
      t.addEventListener('click', function() {
        switchTab(t.getAttribute('data-tab'));
      });
    });

    if (spActiveTab === 'history') {
      renderHistoryTab();
    } else if (spActiveTab === 'skills') {
      loadSkills(function() { renderSkillsTab(); });
    } else {
      showMainUIContent();
    }

    loadSkills(function() { updateSkillsBadge(); });


    updateSync();
    // Carrega estado inicial do cadeado
    chrome.storage.local.get({ ts_intercept_locked: false }, (r) => {
      updateLockBtnVisual(Boolean(r.ts_intercept_locked));
    });

    chrome.storage.onChanged.addListener((ch) => {
      if (ch.lovable_projectId || ch.lovable_token) updateSync();
      if (ch.ts_intercept_locked !== undefined) updateLockBtnVisual(Boolean(ch.ts_intercept_locked.newValue));
    });

    // updateCountdown();

    chrome.storage.local.get(["ql_license_key","ql_session_id"], r => {
      if (r.ql_license_key) {
        sessionId = r.ql_session_id || sessionId;
        startHeartbeat(r.ql_license_key);
      }
    });

    checkUnread();
    try { setInterval(() => { checkUnread(); }, 30000); } catch (_) {}
    // checkForUpdate();
    // checkResellerRole();
  loadResellerName();
  });
}

  function showMainUIContent() {
  var container = document.getElementById('sp-tab-content');
  if (!container) return;

  container.innerHTML =
    '<div class="sp-composer-shell">' +
      '<div class="sp-shortcuts-grid sp-shortcuts-modern" id="sp-chips"></div>' +

      '<div class="sp-compose-card">' +
        '<div id="sp-active-skill" class="sp-active-skill" style="display:none"></div>' +
        '<textarea class="sp-textarea sp-textarea-modern" id="sp-msg" rows="5" placeholder="O que vamos criar hoje?" spellcheck="false"></textarea>' +

        '<div id="sp-attach-preview" class="sp-attach-preview" style="display:none"></div>' +

        '<div class="sp-compose-toolbar">' +
          '<div class="sp-compose-tools">' +
  '<button class="sp-icon-tool" id="sp-attach-btn" title="Anexar imagem/arquivo">' + SP_SVG.paperclip + '</button>' +
  '<button class="sp-icon-tool" id="sp-speech" title="Ditar por voz">' + SP_SVG.mic + '</button>' +
  '<button class="sp-icon-tool" id="sp-remove-watermark" title="Remover Marca de Água">' + SP_SVG.eye + '</button>' +
  '<button class="sp-icon-tool" id="sp-download-project" title="Baixar todos os arquivos">' + SP_SVG.download + '</button>' +
  '<button class="sp-icon-tool" id="sp-skills-quick" title="Inserir Skill">' + SP_SVG.zap + '</button>' +
  '<button class="sp-icon-tool" id="sp-create-project-quick" title="Criar Projeto no Lovable"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg></button>' +
'</div>' +

          '<button class="sp-send-modern" id="sp-send" title="Enviar">' + SP_SVG.send + '</button>' +
        '</div>' +
        '<div class="sp-log" id="sp-log"></div>' +
      '</div>' +

      '<div class="sp-mode-row">' +
        '<button class="sp-mini-action" id="sp-optimize" title="Otimizar com IA">' + SP_SVG.sparkles + ' Otimizar</button>' +
      '</div>' +

      '<input type="file" id="sp-file-input" multiple style="display:none" accept="*/*">' +

      '<button id="sp-remove-watermark" class="sp-hidden-action" style="display:none"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.ban + '</span> Remover Marca de Água</button>' +
      '<button id="sp-create-project" class="sp-hidden-action" style="display:none"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.rocket + '</span> Criar Projeto no Lovable</button>' +
      '<button id="sp-publish-project" class="sp-hidden-action" style="display:none"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.globe + '</span> Publicar Projeto</button>' +
      '<div id="sp-download-status" class="sp-log" style="display:none"></div>' +
    '</div>';

  const chips = document.getElementById('sp-chips');
  SP_TEMPLATES.forEach(t => {
    const chip = document.createElement('button');
    chip.className = 'sp-chip sp-chip-modern';
    chip.innerHTML = '<span class="sp-chip-icon">' + t.icon + '</span><span>' + t.label + '</span>';
    chip.title = t.prompt;
    chip.addEventListener('click', () => { document.getElementById('sp-msg').value = t.prompt; });
    chips.appendChild(chip);
  });


  setupSpFileAttachment();
  setupSpClipboardPaste();

  document.getElementById('sp-send').addEventListener('click', handleSend);
  document.getElementById('sp-optimize').addEventListener('click', handleOptimize);

  setupSpSkillAutocomplete();

  document.getElementById('sp-msg').addEventListener('keydown', function(e) {
    if (spSkillAcOpen()) return; // navigation handled by autocomplete
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  setupSpSpeech();
  setupSpShield();
  setupSpDownloadProject();
  var skq = document.getElementById('sp-skills-quick');
  if (skq) skq.addEventListener('click', function(e) { e.stopPropagation(); toggleSkillsPicker(); });
  setupSpWatermarkButton();
  setupSpCreateProject();
  setupSpPublishProject();
}

  // --- Speech Recognition: delegated to the page (lovable.dev) via postMessage ---
  // The overlay iframe runs in chrome-extension:// origin and cannot reliably
  // request microphone permission. We forward start/stop to the parent window
  // (page context) and receive transcripts back. See extension/overlay.js.
  var spBaseTextBeforeDictation = '';
  var spVoiceListenerInstalled = false;

  function updateSpSpeechState(listening) {
    spIsRecording = Boolean(listening);
    var btn = document.getElementById('sp-speech');
    if (btn) {
      btn.classList.toggle('sp-recording', spIsRecording);
      btn.title = spIsRecording ? 'Ouvindo...' : 'Ditar por voz';
      btn.setAttribute('aria-label', spIsRecording ? 'Ouvindo...' : 'Ditar por voz');
    }
    var log = document.getElementById('sp-log');
    if (log) {
      if (spIsRecording) {
        log.className = 'sp-log sp-log-info';
        log.textContent = 'Ouvindo...';
      } else if (log.textContent === 'Ouvindo...') {
        log.className = 'sp-log';
        log.textContent = '';
      }
    }
  }

  function appendSpVoiceTranscript(text) {
    var transcript = String(text || '').trim();
    if (!transcript) return;
    var textarea = document.getElementById('sp-msg');
    if (!textarea) return;
    var base = spBaseTextBeforeDictation || '';
    var joined = base ? (base.replace(/\s+$/, '') + ' ' + transcript) : transcript;
    textarea.value = joined;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
  }

  function postVoiceToParent(msg) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
      }
    } catch (err) {
      console.warn('[TS Voice] postMessage to parent failed:', err);
    }
  }

  function installVoiceBridgeListener() {
    if (spVoiceListenerInstalled) return;
    spVoiceListenerInstalled = true;
    window.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'TS_VOICE_TRANSCRIPT') {
        appendSpVoiceTranscript(data.transcript);
      } else if (data.type === 'TS_VOICE_STATUS') {
        if (data.listening) {
          var ta = document.getElementById('sp-msg');
          spBaseTextBeforeDictation = ta ? String(ta.value || '') : '';
        }
        updateSpSpeechState(Boolean(data.listening));
      } else if (data.type === 'TS_VOICE_ERROR') {
        console.error('[TS Voice] Error from page bridge:', data);
        updateSpSpeechState(false);
        var name = data.error || '';
        if (name === 'NotAllowedError' || name === 'not-allowed' || name === 'SecurityError' || name === 'service-not-allowed') {
          alert('Permissão de microfone negada. Permita o acesso ao microfone para lovable.dev nas configurações do navegador.');
        } else if (name === 'NotFoundError') {
          alert('Nenhum microfone encontrado neste dispositivo.');
        } else if (name === 'NotReadableError') {
          alert('O microfone está em uso por outro aplicativo.');
        } else if (name === 'unsupported') {
          alert(data.message || 'Reconhecimento de voz não suportado neste navegador.');
        } else if (name === 'no-mediadevices') {
          alert('Captura de áudio não suportada neste contexto. Abra a extensão dentro de uma aba do lovable.dev.');
        } else if (data.message) {
          // Silent log; avoid noisy alerts for transient errors like aborted/no-speech
          console.warn('[TS Voice] non-fatal:', data);
        }
      }
    });
  }

  function setupSpSpeech() {
    var btn = document.getElementById('sp-speech');
    if (!btn) return;

    installVoiceBridgeListener();

    var inIframe = false;
    try { inIframe = window.parent && window.parent !== window; } catch (_) {}

    if (!inIframe) {
      // Standalone side panel — keep a friendly message instead of broken mic
      btn.title = 'Abra a extensão dentro de uma aba do lovable.dev para usar o ditado';
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        alert('O ditado por voz agora funciona dentro da página lovable.dev. Abra uma aba do Lovable e use o painel lateral injetado.');
      });
      return;
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[TS Voice] Mic button clicked (iframe → parent bridge)');
      if (spIsRecording) {
        console.log('[TS Voice] Parando reconhecimento (usuário)');
        postVoiceToParent({ type: 'TS_VOICE_STOP' });
        return;
      }
      postVoiceToParent({ type: 'TS_VOICE_START' });
    });
  }

  function updateSync() {
    chrome.storage.local.get(["lovable_projectId","lovable_token"], r => {
      const el = document.getElementById('sp-sync');
      if(!el) return;
      if(r.lovable_projectId && r.lovable_token) { el.className = 'sp-sync-status sp-sync-ok'; el.textContent = 'Sincronizado! Projeto: ' + r.lovable_projectId.substring(0,6) + '...'; }
      else { el.className = 'sp-sync-status sp-sync-waiting'; el.textContent = 'Aguardando sincronização...'; }
    });
  }

  function updateLockBtnVisual(locked) {
    const btn = document.getElementById('sp-lock-toggle');
    if (!btn) return;
    const icon = document.getElementById('sp-lock-icon');
    const path = document.getElementById('sp-lock-path');
    if (locked) {
      btn.title = '🔒 Extensão bloqueada — clique para desbloquear';
      btn.style.color = '#ef4444';
      if (icon) { icon.style.stroke = '#ef4444'; icon.style.strokeWidth = '2.5'; }
      if (path) path.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
    } else {
      btn.title = 'Bloquear teclado (pausa interceptação da extensão)';
      btn.style.color = '';
      if (icon) { icon.style.stroke = ''; icon.style.strokeWidth = '2'; }
      if (path) path.setAttribute('d', 'M7 11V7a5 5 0 0 1 9.9-1');
    }
    // Bloqueia/desbloqueia o botão de envio do sidepanel
    const sendBtn = document.getElementById('sp-send');
    if (sendBtn) {
      sendBtn.disabled = locked;
      sendBtn.style.opacity = locked ? '0.35' : '';
      sendBtn.title = locked ? '🔒 Desbloqueie o cadeado para enviar' : 'Enviar';
    }
  }

  // --- Countdown ---
  function updateCountdown() {
  const el = document.getElementById('sp-countdown');
  if(!el) return;

  if(true) {
    el.style.display = 'flex';
    el.innerHTML =
      '<div class="sp-lifetime-card">' +
        '<span class="sp-lifetime-icon">∞</span>' +
        '<span class="sp-lifetime-label">VITALÍCIO</span>' +
        '<span class="sp-lifetime-status">Acesso sem expiração</span>' +
      '</div>';
    return;
  }

  if(!expiresAt) return;

  el.style.display = 'flex';
  const expiresMs = new Date(expiresAt).getTime();
  const totalDuration = Math.max(expiresMs - Date.now(), 3600000);

  function tick() {
    const remaining = expiresMs - Date.now();
    if(remaining <= 0) {
      el.innerHTML = '<span style="color:var(--ql-danger);font-weight:600;font-size:12px"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.alarm + '</span> Licença expirada</span>';
      return;
    }

    const days = Math.floor(remaining / 86400000);
    const hrs = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
    const timeStr = days > 0 ? days + 'd ' + hrs + 'h ' + mins + 'm' : hrs > 0 ? hrs + 'h ' + mins + 'm ' + String(secs).padStart(2,'0') + 's' : mins + ':' + String(secs).padStart(2,'0');
    const label = isTrialLicense() ? 'Teste expira em' : 'Plano expira em';
    const urgentClass = pct < 20 ? ' sp-bar-urgent' : '';

    el.innerHTML = spTemplateCountdown(label, timeStr, pct, urgentClass);
  }

  tick();
  setInterval(tick, 1000);
}

  // --- JWT Decode ---
  function spDecodeJwtUserId(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return payload.sub || payload.user_id || null;
    } catch(e) { return null; }
  }

  // --- Image Compression ---
  async function spCompressImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_DIM = 1280;
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          if (!blob) return resolve({ file, previewUrl: null });
          resolve({ file: new File([blob], file.name, { type: outputType }), previewUrl: URL.createObjectURL(blob) });
        }, outputType, file.type === 'image/png' ? undefined : 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, previewUrl: null }); };
      img.src = url;
    });
  }

  // --- File Upload ---
  function spInferContentType(file) {
    if (file && typeof file.type === 'string' && file.type.trim()) return file.type;
    const name = (file && file.name ? file.name : '').toLowerCase();
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
  }

  function spBuildUploadFileName(fileId, file) {
    const rawName = file && file.name ? String(file.name) : '';
    const ext = rawName.includes('.') ? rawName.split('.').pop().toLowerCase() : '';
    const safeExt = ext && /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
    return fileId + '.' + safeExt;
  }

  const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const GCS_BASE = 'https://storage.googleapis.com/gpt-engineer-file-uploads';

  // Performs PUT to GCS from the lovable.dev page context (Origin: https://lovable.dev)
  // to avoid CORS rejection when running from the chrome-extension:// iframe.
  // Falls back to direct fetch when no parent page is available (e.g. legacy side panel).
  async function spPutToGcsViaPage(uploadUrl, file) {
    const contentType = file.type;
    const hasPageBridge = (typeof window !== 'undefined') && window.parent && window.parent !== window;
    if (!hasPageBridge) {
      const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      if (!res.ok) throw new Error('PUT falhou: ' + res.status);
      return;
    }
    const arrayBuffer = await file.arrayBuffer();
    const requestId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random();
    await new Promise((resolve, reject) => {
      let done = false;
      function cleanup(){ try { window.removeEventListener('message', onMsg); } catch(_){} clearTimeout(timer); }
      function onMsg(e){
        const d = e && e.data;
        if (!d || d.type !== 'TS_PAGE_UPLOAD_TO_GCS_RESULT' || d.requestId !== requestId) return;
        if (done) return; done = true; cleanup();
        if (d.success) resolve();
        else reject(new Error('PUT falhou: ' + d.status + (d.error ? ' ' + d.error : '')));
      }
      const timer = setTimeout(() => {
        if (done) return; done = true; cleanup();
        reject(new Error('PUT timeout'));
      }, 120000);
      window.addEventListener('message', onMsg);
      try {
        window.parent.postMessage({
          type: 'TS_PAGE_UPLOAD_TO_GCS',
          requestId,
          uploadUrl,
          contentType,
          arrayBuffer
        }, '*', [arrayBuffer]);
      } catch (e) {
        // transferable not supported -> retry without transfer list
        try {
          window.parent.postMessage({
            type: 'TS_PAGE_UPLOAD_TO_GCS',
            requestId,
            uploadUrl,
            contentType,
            arrayBuffer
          }, '*');
        } catch (err) {
          done = true; cleanup(); reject(err);
        }
      }
    });
  }


  // Upload via edge function `upload-prompt-image` (mesmo método LovaSiri).
  // Retorna URL pública do bucket Supabase, marcada como is_temp_image
  // para entrar no fluxo de URLs embutidas no prompt.
  async function spUploadImageNative(file, token) {
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

    console.log('[TS Upload] Uploading via supabase upload-prompt-image');
    const resp = await bgFetch(SUPABASE_URL + '/functions/v1/upload-prompt-image', {
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
      throw new Error((resp && (resp.error_display || resp.error)) || 'Upload da imagem falhou');
    }

    const publicUrl = normalizePromptImageUrl(resp.url);
    const fileId = resp.path || ('img_' + crypto.randomUUID());
    const uploadedFile = {
      file_id: fileId,
      file_name: file.name || 'image',
      name: file.name || 'image',
      file_type: contentType,
      type: contentType,
      file_url: publicUrl,
      url: publicUrl,
    };
    console.log('[TS Upload] Upload complete:', uploadedFile);
    return { ...uploadedFile, is_temp_image: true, download_url: publicUrl, is_native_image: false };
  }

  async function spUploadFileDirect(file, token) {
    if (file.type && file.type.indexOf('image/') === 0) {
      if (IMAGE_MIME_TYPES.indexOf(file.type) < 0) {
        throw new Error('Formato não suportado. Use PNG, JPEG ou WEBP.');
      }
      return await spUploadImageNative(file, token);
    }

    const fileId = crypto.randomUUID();
    const userId = spDecodeJwtUserId(token);
    if (!userId) throw new Error('userId não extraído do token');

    const contentType = spInferContentType(file);
    const uploadFileName = spBuildUploadFileName(fileId, file);

    const uploadResp = await bgFetch('https://api.lovable.dev/files/generate-upload-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ file_name: uploadFileName, content_type: contentType, status: 'uploading' })
    });

    var signedUrl = (uploadResp && uploadResp.url) || (uploadResp && uploadResp.signed_url) || (uploadResp && uploadResp.signedUrl) || (uploadResp && uploadResp.data && uploadResp.data.url) || null;
    if (!signedUrl) throw new Error('URL assinada não retornada');

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('PUT falhou: ' + xhr.status));
      xhr.onerror = () => reject(new Error('Erro de rede'));
      xhr.send(file);
    });

    let downloadUrl = '';
    try {
      const dlResp = await bgFetch('https://api.lovable.dev/files/generate-download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ dir_name: userId, file_name: uploadFileName })
      });
      downloadUrl = (dlResp && (dlResp.url || dlResp.signed_url || dlResp.signedUrl || (dlResp.data && dlResp.data.url))) || '';
    } catch(e) {}

    return { file_id: uploadFileName, file_name: file.name || 'file', download_url: downloadUrl, is_temp_image: false };
  }

  function spApplyUploadResult(target, result) {
    target.file_id = result.file_id || null;
    target.file_name = result.file_name || target.file_name;
    target.download_url = result.download_url || '';
    target.is_temp_image = !!result.is_temp_image;
    target.is_native_image = !!result.is_native_image;
    if (result.is_native_image) {
      target.name = result.name;
      target.file_type = result.file_type;
      target.type = result.type;
      target.file_url = result.file_url;
      target.url = result.url;
    }
    target.uploading = false;
    target.uploadFailed = false;
    /* keep rawFile for inline send */
  }

  function spApplyUploadFailure(target) {
    target.uploading = false;
    target.uploadFailed = true;
    target.is_temp_image = false;
    target.is_native_image = false;
    target.download_url = '';
    target.file_id = 'local_direct_' + crypto.randomUUID();
  }


  // --- Attachment Preview ---
  function tsBroadcastAttachState() {
    try {
      if (window.parent === window) return;
      const items = (spAttachedFiles || []).map(f => ({
        name: f.file_name || '',
        size: (f.rawFile && f.rawFile.size) || 0,
        type: f.file_type || '',
        uploading: !!f.uploading,
        uploadFailed: !!f.uploadFailed,
        ready: !f.uploading && !f.uploadFailed && !!f.file_id,
        // Full uploaded metadata so popup can pass back on send
        upload: (!f.uploading && !f.uploadFailed && f.file_id) ? {
          file_id: f.file_id,
          file_name: f.file_name,
          name: f.name || f.file_name,
          file_type: f.file_type,
          type: f.type || f.file_type,
          file_url: f.file_url || '',
          url: f.url || f.file_url || '',
          download_url: f.download_url || '',
          is_temp_image: !!f.is_temp_image,
          is_native_image: !!f.is_native_image,
        } : null,
      }));
      window.parent.postMessage({ type: 'TS_OVERLAY_ATTACH_STATE', items }, '*');
    } catch(_) {}
  }


  function spRenderAttachPreview() {
    const container = document.getElementById('sp-attach-preview');
    if (container) {
      if (spAttachedFiles.length === 0) { container.style.display = 'none'; container.innerHTML = ''; }
      else {
        container.style.display = 'flex';
        container.innerHTML = spAttachedFiles.map((f, i) => spTemplateAttachItem(f, i)).join('');
        container.querySelectorAll('.sp-attach-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            if (spAttachedFiles[idx] && spAttachedFiles[idx].previewUrl) URL.revokeObjectURL(spAttachedFiles[idx].previewUrl);
            spAttachedFiles.splice(idx, 1);
            spRenderAttachPreview();
          });
        });
      }
    }
    tsBroadcastAttachState();
  }

  // --- File Attachment Setup ---
  function setupSpFileAttachment() {
    const attachBtn = document.getElementById('sp-attach-btn');
    const fileInput = document.getElementById('sp-file-input');
    if (!attachBtn || !fileInput) return;
    attachBtn.addEventListener('click', () => {
      if (spAttachedFiles.length >= SP_MAX_FILES) { showAlert('Limite', 'Máximo ' + SP_MAX_FILES + ' arquivos.'); return; }
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = '';
      if (!files.length) return;
      await spHandleFilesAttach(files);
    });
  }


  // --- Convert file to base64 ---
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

  var REMOVE_WATERMARK_URL = "https://hyjsaialebpskwfvinig.supabase.co/functions/v1/remove-watermark";
  var PUBLISH_PROJECT_URL = "https://hyjsaialebpskwfvinig.supabase.co/functions/v1/publish-project";

  function showSpPublishedUrlModal(url){
    var existing = document.getElementById("sp-publish-modal");
    if(existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "sp-publish-modal";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)";
    overlay.innerHTML =
      '<div style="background:#111113;border:1px solid rgba(245,158,11,0.35);border-radius:16px;padding:20px;max-width:340px;width:90%;box-shadow:0 24px 80px -12px rgba(0,0,0,0.8)">' +
        '<div style="font-size:28px;text-align:center;margin-bottom:6px">\ud83c\udf89</div>' +
        '<h3 style="margin:0 0 6px;color:#fbbf24;font-size:16px;font-weight:700;text-align:center">Projeto Publicado!</h3>' +
        '<p style="margin:0 0 14px;color:#a1a1aa;font-size:12px;text-align:center">Acesse seu projeto pelo link abaixo:</p>' +
        '<div style="background:#0a0a0b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px;margin-bottom:14px;word-break:break-all"><a href="' + url + '" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:12px">' + url + '</a></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button id="sp-publish-copy" style="flex:1;padding:8px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#f4f4f5;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600">\ud83d\udccb Copiar</button>' +
          '<button id="sp-publish-open" style="flex:1;padding:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700">\ud83d\udd17 Abrir</button>' +
        '</div>' +
        '<button id="sp-publish-close" style="width:100%;margin-top:6px;padding:6px;border:none;background:transparent;color:#71717a;cursor:pointer;font-size:11px">Fechar</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("sp-publish-copy").addEventListener("click", function(){
      navigator.clipboard.writeText(url);
      this.textContent = "\u2713 Copiado!";
    });
    document.getElementById("sp-publish-open").addEventListener("click", function(){ window.open(url, "_blank"); });
    document.getElementById("sp-publish-close").addEventListener("click", function(){ overlay.remove(); });
    overlay.addEventListener("click", function(e){ if(e.target === overlay) overlay.remove(); });
  }

  function setupSpPublishProject(){
    var btn = document.getElementById("sp-publish-project");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      var log = document.getElementById("sp-log");
      btn.disabled = true;
      btn.textContent = "\u23f3 Publicando...";

      try {
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        var licKey = sd.ql_license_key || "";

        if(!pid || !token){
          log.className = "sp-log sp-log-error";
          log.textContent = "\u26a0 Projeto n\u00e3o sincronizado.";
          btn.disabled = false;
          btn.textContent = "\ud83c\udf10 Publicar Projeto";
          return;
        }

        if(token.startsWith("Bearer ")) token = token.slice(7);

        var result = await bgFetch(PUBLISH_PROJECT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ license_key: licKey, token_lovable: token, project_id: pid })
        });

        if(result && result.success === false){
          throw new Error(result.error_display || result.message || "Erro ao publicar");
        }

        log.className = "sp-log sp-log-success";
        log.textContent = "\u2713 Projeto publicado!";
        if(result && result.url) showSpPublishedUrlModal(result.url);
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false;
        btn.textContent = "\ud83c\udf10 Publicar Projeto";
      }
    });
  }

  function setWatermarkStatus(message, kind){
    console.info("[TS Extension]", message);
    var log = document.getElementById("sp-log");
    if(log){
      log.className = "sp-log " + (kind === "error" ? "sp-log-error" : (kind === "success" ? "sp-log-success" : "sp-log-info"));
      log.textContent = message;
    }
    var statusEl = document.querySelector("#watermark-status");
    if(statusEl) statusEl.textContent = message;
  }

  function getLovableBearerToken(){
    return new Promise(function(resolve, reject){
      chrome.storage.local.get(["lovableBearerToken","lovable_token"], function(r){
        var token = r && r.lovableBearerToken;
        if(token && typeof token === "string" && token.indexOf("Bearer ") === 0) return resolve(token);
        var raw = r && r.lovable_token;
        if(raw && typeof raw === "string"){
          var t = raw.indexOf("Bearer ") === 0 ? raw : ("Bearer " + raw);
          return resolve(t);
        }
        reject(new Error("Bearer token do Lovable não capturado. Abra o Lovable e execute alguma ação no editor ou no chat antes de tentar remover a marca d'água."));
      });
    });
  }

  function ensureLovableBadgeHidden(css){
    var src = String(css || "");
    // Só considera removida se existir uma regra CSS do #lovable-badge com display:none DENTRO do bloco dela.
    var alreadyHidden = /#lovable-badge[^{}]*\{[^}]*display\s*:\s*none/i.test(src);
    if(alreadyHidden) return { changed: false, css: src };
    var badgeCss = "\n\n#lovable-badge {\n  display: none !important;\n}\n";
    return { changed: true, css: src.replace(/\s+$/,"") + badgeCss };
  }

  function getCurrentStylesCss(projectId){
    return new Promise(function(resolve, reject){
      chrome.storage.local.get(["lovable_token"], function(r){
        var raw = r && r.lovable_token ? r.lovable_token : "";
        if(raw && raw.indexOf("Bearer ") === 0) raw = raw.slice(7);
        if(!raw) return reject(new Error("Token Lovable não encontrado para leitura do projeto."));
        chrome.runtime.sendMessage({ action: "downloadProject", projectId: projectId, token: raw }, function(resp){
          if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if(!resp || !resp.success) return reject(new Error((resp && resp.error) || "Falha ao carregar arquivos do projeto."));
          var files = resp.files || [];
          var knownPaths = ["src/styles.css","src/index.css","src/App.css","src/global.css","app/globals.css","styles/globals.css"];
          var getPath = function(f){ return String((f && (f.path || f.name || f.file_path)) || "").replace(/^\//, ""); };
          var getContent = function(f){ return f.content != null ? f.content : (f.contents != null ? f.contents : f.text); };
          var match = null;
          for(var i = 0; i < files.length; i++){
            if(knownPaths.indexOf(getPath(files[i])) !== -1){ match = files[i]; break; }
          }
          if(!match){
            // Fallback: só um .css claramente global (tailwind/:root). Nunca escolhe um arquivo arbitrário.
            var cssFiles = files.filter(function(f){ var p = getPath(f); return /\.css$/i.test(p) && p.indexOf("node_modules") === -1; });
            match = cssFiles.find(function(f){ var c = getContent(f); return typeof c === "string" && (/@tailwind|@import\s+["']tailwindcss/i.test(c) || c.indexOf(":root") !== -1); }) || null;
          }
          if(!match) return reject(new Error("CSS global do projeto não encontrado (src/styles.css, src/index.css...)."));
          var content = getContent(match);
          if(typeof content !== "string") return reject(new Error("Conteúdo do CSS global indisponível."));
          resolve({ path: getPath(match), css: content });
        });
      });
    });
  }

  async function saveCssToLovable(projectId, updatedCssContent, cssPath){
    if(!updatedCssContent || updatedCssContent.indexOf("#lovable-badge") === -1){
      throw new Error("Updated CSS does not contain #lovable-badge");
    }
    var token = await getLovableBearerToken();
    var url = "https://api.lovable.dev/projects/" + encodeURIComponent(projectId) + "/edit-code";
    console.info("[TS Extension] Calling edit-code endpoint", url);
    var resp = await lovableApiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": token },
      body: JSON.stringify({
        changes: [{ path: cssPath || "src/styles.css", content: updatedCssContent }],
        commit_message: "Remove Lovable watermark badge",
        file_edit_type: "CodeEdit",
        uploads: []
      })
    });
    var status = resp && resp.status;
    var bodyText = "";
    try { bodyText = resp && resp.data ? (typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data)) : ""; } catch(e){}
    console.info("[TS Extension] edit-code response:", status, bodyText);
    var isSuccess = resp && (resp.ok === true || (typeof status === "number" && status >= 200 && status < 300));
    if(!isSuccess){
      throw new Error("edit-code failed: " + status + " " + bodyText);
    }
    return resp.data;
  }

  async function removeLovableWatermark(projectId){
    if(!projectId) throw new Error("projectId não disponível.");
    setWatermarkStatus("Removendo marca d'água...", "info");

    // Edição direta do CSS via edit-code (não usa IA / não consome créditos).
    var current = await getCurrentStylesCss(projectId);
    var result = ensureLovableBadgeHidden(current.css);
    if(!result.changed){
      setWatermarkStatus("Marca d'água já estava removida.", "success");
      return { success: true, already: true };
    }
    await saveCssToLovable(projectId, result.css, current.path);
    setWatermarkStatus("Marca d'água removida com sucesso.", "success");
    return { success: true };
  }


  function setupSpWatermarkButton(){
    var btn = document.getElementById("sp-remove-watermark");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      btn.disabled = true;
      var originalHtml = btn.innerHTML;
      btn.textContent = "";
      try {
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId"], r); });
        var pid = sd.lovable_projectId || "";
        if(!pid) throw new Error("Projeto não sincronizado. Abra um projeto no Lovable.");
        await removeLovableWatermark(pid);
        addToHistory("Remover marca d'água Lovable", "ok");
      } catch(err){
        setWatermarkStatus("Erro ao remover marca d'água: " + (err && err.message ? err.message : err), "error");
        addToHistory("Remover marca d'água Lovable", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml || SP_SVG.eye;
      }
    });
  }


  // --- Send Message ---
  async function handleSend() {
    const msg = document.getElementById('sp-msg').value.trim();
    const modoPlano = false;
    const log = document.getElementById('sp-log');
    const btn = document.getElementById('sp-send');
    const hasAttachments = spAttachedFiles.length > 0;
    if (!msg && !spActiveSkill && !hasAttachments) { log.className = 'sp-log sp-log-error'; log.textContent = 'Prompt vazio'; return; }
    btn.disabled = true; btn.textContent = '…';

    const attachedFilesSnapshot = spAttachedFiles.map(f => ({ ...f }));
    const hasTempImage = attachedFilesSnapshot.some(f => f.is_temp_image && !f.uploading && !f.uploadFailed);
    const hasRegularFile = attachedFilesSnapshot.some(f => !f.is_temp_image && (f.file_id || f.rawFile) && !f.uploading);

    // Combina skill ativa + texto digitado pelo usuário (prefixo /skill:xxx para builtins)
    const finalPrompt = buildSkillMessage(msg, spActiveSkill);

    log.className = 'sp-log sp-log-info';
    log.textContent = hasTempImage || hasRegularFile ? 'Preparando anexos para envio...' : 'Enviando...';

    try {
      if (attachedFilesSnapshot.some(f => f.uploading && !f.rawFile)) {
        throw new Error('Aguarde o upload dos arquivos terminar.');
      }

      await sendPromptNativeViaBackground(finalPrompt, modoPlano, attachedFilesSnapshot);
      try { tsPlayPromptSentSoundInActiveTab(); } catch(_){}
      log.className = 'sp-log sp-log-success';
      if (hasTempImage && hasRegularFile) {
        log.textContent = 'Prompt enviado com imagem e arquivo!';
      } else if (hasTempImage) {
        log.textContent = 'Prompt enviado com imagem!';
      } else if (hasRegularFile) {
        log.textContent = 'Prompt enviado com arquivo!';
      } else {
        log.textContent = 'Prompt enviado!';
      }

      addToHistory(finalPrompt, 'ok');

      document.getElementById('sp-msg').value = '';
      spActiveSkill = null;
      renderActiveSkillBadge();
      spAttachedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      spAttachedFiles = [];
      spRenderAttachPreview();
    } catch(err) { log.className = 'sp-log sp-log-error'; log.textContent = '' + (err.message || err); addToHistory(finalPrompt, 'error'); }
    finally { btn.disabled = false; btn.textContent = '\u2192'; }
  }

  // --- Optimize Prompt ---
  async function handleOptimize() {
    const textarea = document.getElementById('sp-msg');
    const btn = document.getElementById('sp-optimize');
    if(!textarea || !textarea.value.trim()) { showAlert('Atenção', 'Digite um prompt antes de otimizar.'); return; }
    btn.classList.add('sp-tool-loading'); btn.disabled = true;
    try {
      const sd = await new Promise(r => chrome.storage.local.get(["ql_session_id"], r));
      if (!sd.ql_session_id) throw new Error("Sessão da licença não encontrada. Valide sua chave novamente.");
      const requestOptions = { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sd.ql_session_id }, body: JSON.stringify({ prompt: textarea.value.trim() }) };
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
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.focus();
      showAlert('Prompt Otimizado!', 'Seu prompt foi aprimorado com IA e está pronto para envio.');
    } catch(err) { showAlert('Erro', 'Falha ao otimizar: ' + (err.message || '')); }
    finally { btn.classList.remove('sp-tool-loading'); btn.disabled = false; }
  }

  // --- Heartbeat ---
  function startHeartbeat(key) {
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          clearInterval(heartbeatInterval);
          console.warn("[SP] Heartbeat stopped: extension context invalidated");
          return;
        }
        const data = await lvbValidate(bgFetch, key, deviceId);
        if(!data.valid) {
          clearInterval(heartbeatInterval);
          chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => showLicenseGate());
          if(data.reason === 'device_conflict') setTimeout(() => showAlert('Acesso Negado', data.message), 500);
          return;
        }
        if(data.user_name) { userName = data.user_name; const el = document.getElementById('sp-name'); if(el) el.textContent = data.user_name; }
        if(data.expires_at) expiresAt = data.expires_at;
        if(data.status) licenseStatus = data.status;
      } catch(e) {
        if (e.message && e.message.includes("Extension context invalidated")) {
          clearInterval(heartbeatInterval);
          console.warn("[SP] Heartbeat stopped: extension context invalidated");
        }
      }
    }, 20000);
  }

  // --- Clipboard Paste (Ctrl+V) & Drag-and-Drop for ANY Files ---
  function setupSpClipboardPaste() {
    var textarea = document.getElementById('sp-msg');
    if (!textarea) return;

    // --- Drag and Drop ---
    var dropZone = document.getElementById('sp-body') || textarea;
    var dragOverlay = null;

    function showDragOverlay() {
      if (dragOverlay) return;
      dragOverlay = document.createElement('div');
      dragOverlay.className = 'sp-drag-overlay';
      dragOverlay.innerHTML = '<div class="sp-drag-overlay-inner"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.folder + '</span> Solte os arquivos aqui</div>';
      document.body.appendChild(dragOverlay);
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
      await spHandleFilesAttach(files);
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
      if (filesToAttach.length > 0) await spHandleFilesAttach(filesToAttach);
    });
  }

  async function spHandleFilesAttach(files) {
    if (spAttachedFiles.length >= SP_MAX_FILES) {
      showAlert('Limite', 'Maximo ' + SP_MAX_FILES + ' arquivos.');
      return;
    }
    var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token'], r); });
    var token = sd.lovable_token || '';
    if (!token) {
      try { await refreshLovableTokenFromActiveTab(); } catch(_) {}
      sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token'], r); });
      token = sd.lovable_token || '';
    }
    if (!token) {
      showAlert('Token não capturado', 'Abra a aba do Lovable (lovable.dev) e execute alguma ação no editor/chat para capturar o token, depois tente anexar a imagem novamente.');
      return;
    }
    if (token.indexOf('Bearer ') === 0) token = token.slice(7);

    for (var fi = 0; fi < files.length; fi++) {
      var file = files[fi];
      if (spAttachedFiles.length >= SP_MAX_FILES) break;
      if (file.size > SP_MAX_FILE_SIZE) { showAlert('Grande', file.name + ' excede 20MB.'); continue; }

      var processedFile = file;
      var previewUrl = null;
      if (IMAGE_MIME_TYPES.indexOf(file.type) >= 0) {
        var compressed = await spCompressImage(file);
        processedFile = compressed.file;
        previewUrl = compressed.previewUrl;
      }

      var idx = spAttachedFiles.length;
      var isZipInline = /\.zip$/i.test(file.name || '') || processedFile.type === 'application/zip' || processedFile.type === 'application/x-zip-compressed';
      spAttachedFiles.push({
        file_id: null,
        file_name: file.name || ('file_' + Date.now()),
        previewUrl: previewUrl,
        file_type: processedFile.type,
        sizeLabel: spFormatFileSize(processedFile.size),
        uploading: !isZipInline,
        uploadFailed: false,
        is_temp_image: false,
        rawFile: processedFile
      });
      spRenderAttachPreview();

      if (isZipInline) {
        spAttachedFiles[idx].file_id = 'inline_zip_' + crypto.randomUUID();
        spAttachedFiles[idx].uploading = false;
        spAttachedFiles[idx].uploadFailed = false;
        spRenderAttachPreview();
        continue;
      }

      try {
        var res = await spUploadFileDirect(processedFile, token);
        spApplyUploadResult(spAttachedFiles[idx], res);
        spRenderAttachPreview();
      } catch(err) {
        console.error('[TS Upload] Upload failed:', err);
        spApplyUploadFailure(spAttachedFiles[idx]);
        spRenderAttachPreview();
        showAlert('Erro', (err && err.message) || 'Falha no upload.');
      }
    }
    showAlert('Anexado', files.length + ' arquivo(s) adicionado(s)!');
  }

  // --- Download All Project Files ---
  function setupSpDownloadProject() {
    var btn = document.getElementById('sp-download-project');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      var statusEl = document.getElementById('sp-download-status');
      var originalLabel = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Baixando...';
      if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sp-log'; statusEl.textContent = 'Verificando token e projeto...'; }
      try {
        var sd = await new Promise(function(r){ chrome.storage.local.get(['lovable_token','lovable_token_global','lovable_projectId'], r); });
        var authToken = (sd.lovable_token || sd.lovable_token_global || '').replace(/^Bearer\s+/i,'');
        var projectId = sd.lovable_projectId || '';
        if (!projectId) throw new Error('Abra uma página de projeto do Lovable primeiro.');

        if (!authToken) {
          var cookieResponse = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'readCookies' }, function(resp) { resolve(resp); });
          });
          if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
            authToken = cookieResponse.tokens[0].token;
          }
        }
        if (!authToken) throw new Error('Token Lovable não encontrado. Abra o projeto no Lovable e aguarde a sincronização.');

        if (statusEl) statusEl.textContent = 'Baixando arquivos do projeto...';
        var resp = await new Promise(function(resolve){
          chrome.runtime.sendMessage({ action: 'downloadProject', projectId: projectId, token: authToken }, function(r){ resolve(r || { success:false, error: 'sem resposta' }); });
        });
        if (!resp || !resp.success) throw new Error((resp && resp.error) || 'Falha ao baixar arquivos');

        var files = resp.files || [];
        if (!files.length) throw new Error('Nenhum arquivo encontrado no projeto.');
        if (typeof JSZip === 'undefined') throw new Error('JSZip não carregado. Reabra o painel lateral.');

        if (statusEl) statusEl.textContent = 'Criando ZIP com ' + files.length + ' arquivos...';
        var zip = new JSZip();
        var imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff'];
        var addedFiles = 0;
        for (var fi = 0; fi < files.length; fi++) {
          var f = files[fi];
          if (!f.name || f.sizeExceeded) continue;
          if (f.contents && f.binary) {
            zip.file(f.name, f.contents, { base64: true, binary: true });
            addedFiles++;
          } else if (!f.contents && imageExts.some(function(ext) { return f.name.toLowerCase().endsWith(ext); })) {
            try {
              var imgResp = await fetch('https://api.lovable.dev/projects/' + projectId + '/files/raw?path=' + encodeURIComponent(f.name), {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + authToken },
                credentials: 'omit',
                mode: 'cors'
              });
              if (imgResp.ok) {
                zip.file(f.name, await imgResp.arrayBuffer(), { binary: true });
                addedFiles++;
              } else if (f.contents) {
                zip.file(f.name, f.contents);
                addedFiles++;
              }
            } catch(imgErr) {
              if (f.contents) {
                zip.file(f.name, f.contents);
                addedFiles++;
              }
            }
          } else if (f.contents) {
            zip.file(f.name, f.contents);
            addedFiles++;
          }
        }

        var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
        var a = document.createElement('a');
        var objectUrl = URL.createObjectURL(zipBlob);
        a.href = objectUrl;
        a.download = 'lovable-' + projectId.substring(0, 8) + '-' + new Date().toISOString().split('T')[0] + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);

        if (statusEl) { statusEl.className = 'sp-log sp-log-success'; statusEl.textContent = addedFiles + ' arquivos baixados!'; }
        btn.textContent = 'Baixado';
        setTimeout(function(){ btn.disabled = false; btn.innerHTML = originalLabel; if (statusEl) statusEl.style.display = 'none'; }, 4000);
      } catch(err) {
        console.error('[SpDownloadProject]', err);
        if (statusEl) statusEl.className = 'sp-log sp-log-error';
        if (statusEl) statusEl.textContent = '' + (err.message || 'Erro');
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    });
  }

  // --- Initialize ---
  (async function init() {
    deviceId = await getDeviceId();
    chrome.storage.local.get(["ql_dark_mode"], r => {
      // Dark mode is default. Only switch to light if user explicitly saved light mode preference.
      const savedDark = r.ql_dark_mode !== false;
      document.body.classList.toggle('sp-light', !savedDark);
      syncThemeButton();
    });
    chrome.storage.local.get(["ql_license_valid","ql_license_key","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_license_type","ql_license_lifetime","ql_session_id"], async (res) => {
      if(res.ql_license_valid) {
        licenseKey = res.ql_license_key || null;
        licenseType = res.ql_license_type || 'paid';
        licenseLifetime = res.ql_license_lifetime || false;
        userName = res.ql_user_name || null;
        expiresAt = res.ql_expires_at || null;
        licenseStatus = res.ql_license_status || null;
        sessionId = res.ql_session_id || null;
        showMainUI();
        if(res.ql_license_key) {
          try {
            const data = await lvbValidate(bgFetch, res.ql_license_key, deviceId);
            if(data.valid) {
              userName = data.user_name || userName;
expiresAt = data.expires_at || expiresAt;
licenseStatus = data.status || licenseStatus;
licenseType = data.license_type || licenseType || 'paid';
licenseLifetime = data.lifetime || licenseLifetime || false;
licenseKey = res.ql_license_key || licenseKey;
sessionId = data.session_id || sessionId;
              chrome.storage.local.set({
  ql_user_name: userName,
  ql_expires_at: expiresAt,
  ql_license_status: licenseStatus,
  ql_license_type: licenseType,
  ql_license_lifetime: licenseLifetime,
  ql_session_id: sessionId
});
              const nameEl = document.getElementById('sp-name'); if(nameEl) nameEl.textContent = userName || 'User';
              // updateCountdown();
            } else {
              chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
              showLicenseGate();
              if(data.reason === 'device_conflict') setTimeout(() => showAlert('Acesso Negado', data.message), 500);
            }
          } catch(e) {}
        } else {
          // Flag válida sem chave armazenada: estado inconsistente, exigir key
          chrome.storage.local.remove(["ql_license_valid"]);
          showLicenseGate();
        }
      } else {
        showLicenseGate();
      }
    });

    // Sincroniza ativação/desativação entre o painel lateral e o chat flutuante
    chrome.storage.onChanged.addListener((changes, area) => {
      if(area !== 'local' || !changes.ql_license_valid) return;
      const nowValid = changes.ql_license_valid.newValue === true;
      const wasValid = changes.ql_license_valid.oldValue === true;
      if(nowValid === wasValid) return;
      if(nowValid) {
        chrome.storage.local.get(["ql_license_key","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_license_type","ql_license_lifetime","ql_session_id"], (res) => {
          licenseKey = res.ql_license_key || null;
          licenseType = res.ql_license_type || 'paid';
          licenseLifetime = res.ql_license_lifetime || false;
          userName = res.ql_user_name || null;
          expiresAt = res.ql_expires_at || null;
          licenseStatus = res.ql_license_status || null;
          sessionId = res.ql_session_id || null;
          showMainUI();
        });
      } else {
        licenseKey = null; sessionId = null;
        showLicenseGate();
      }
    });
  })();

  // ===== SHIELD SYSTEM (Sidebar) =====
  let spShieldActive = false;

  function setupSpShield() {
    const btn = document.getElementById('sp-shield-btn');
    if (btn) btn.remove();
    spShieldActive = false;
    chrome.storage.local.set({ ql_shield_active: false, ql_native_chat: false });
    removeSpShieldOverlay();
  }

  function injectSpShieldOverlay() {
    removeSpShieldOverlay();
  }

  function removeSpShieldOverlay() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function() {
            const overlay = document.getElementById('ql-shield-overlay');
            if (overlay) overlay.remove();
            const chatForm = document.querySelector('form#chat-input');
            if (!chatForm) return;
            chatForm.querySelectorAll('[data-ql-shield-disabled]').forEach(el => {
              const wasDis = el.dataset.qlShieldDisabled;
              if (wasDis === 'true') el.disabled = true;
              else el.disabled = false;
              delete el.dataset.qlShieldDisabled;
              el.removeAttribute('tabindex');
              if (el.dataset.qlShieldEditable === 'true') { el.contentEditable = 'true'; delete el.dataset.qlShieldEditable; }
            });
          }
        }).catch(() => {});
      }
    });
  }


  function setupSpCreateProject() {
    var btn = document.getElementById('sp-create-project');
    var quickBtn = document.getElementById('sp-create-project-quick');
    if (quickBtn && btn) {
      quickBtn.addEventListener('click', function() { btn.click(); });
    }
    if (!btn) return;
    btn.addEventListener('click', async function() {
      var statusEl = document.getElementById('sp-download-status');
      var originalLabel = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Criando projeto...';
      if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sp-log'; statusEl.textContent = 'Preparando criação...'; }
      try {
        var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_token_global', 'ql_license_key'], r); });
        var authToken = sd.lovable_token || sd.lovable_token_global || '';
        var licenseKey = sd.ql_license_key || '';
        if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);
        if (!licenseKey) throw new Error('Licença não encontrada.');

        async function readAnyToken() {
          var s = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_token_global'], r); });
          var t = s.lovable_token || s.lovable_token_global || '';
          return (t || '').replace(/^Bearer\s+/i, '');
        }

        // Fallback 1: refresh from any active lovable.dev tab
        if (!authToken) {
          if (statusEl) statusEl.textContent = 'Buscando token do Lovable...';
          try { await refreshLovableTokenFromActiveTab(); } catch(e) {}
          authToken = await readAnyToken();
        }

        // Fallback 2: query ALL lovable.dev tabs and trigger pageHook
        if (!authToken) {
          try {
            var lovTabs = await chrome.tabs.query({ url: ['https://lovable.dev/*', 'https://*.lovable.dev/*'] });
            for (var i = 0; i < lovTabs.length; i++) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: lovTabs[i].id },
                  world: 'MAIN',
                  func: function() {
                    window.postMessage({ type: 'lovableRequestToken' }, '*');
                    setTimeout(function(){ window.postMessage({ type: 'lovableRequestToken' }, '*'); }, 150);
                    // force a real authenticated request to trigger fetch wrapper
                    try { fetch('/api/auth/session', { credentials: 'include' }).catch(function(){}); } catch(e) {}
                    try { fetch('https://api.lovable.dev/user/workspaces', { credentials: 'include' }).catch(function(){}); } catch(e) {}
                  }
                });
              } catch(e) {}
            }
            await new Promise(function(r){ setTimeout(r, 1500); });
            authToken = await readAnyToken();
          } catch(e) {}
        }

        // Fallback 3: cookies
        if (!authToken) {
          var cookieResponse = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'readCookies' }, function(resp) { resolve(resp); });
          });
          if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
            authToken = cookieResponse.tokens[0].token;
          }
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
        if (statusEl) statusEl.textContent = 'Projeto criado! Abrindo...';
        btn.textContent = 'Sucesso!';
        setTimeout(function(){
          try { chrome.tabs.create({ url: data.link, active: true }); }
          catch(e) { window.open(data.link, '_blank'); }
          btn.disabled = false;
          btn.innerHTML = originalLabel;
        }, 500);
      } catch(err) {
        console.error('[SpCreateProject]', err);
        if (statusEl) statusEl.textContent = '' + (err.message || 'Erro');
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    });
  }

})();
