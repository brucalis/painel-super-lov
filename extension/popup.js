// Lovable Chat Assistant - popup logic

let currentProjectId = null;
let authToken = null;
let cookieString = '';
let browserSessionId = null;
let isBusy = false;
const attachments = [];

const GIT_SHA = '04b3668677038d15039de65e27688c38ab80e9ab';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const LOV_PLATFORM =
  '{"platform":"web","version":"96d78a825f60be3df0ab1bd832c8f511eb4b5775"}';

// ---------- Utils ----------
function generateRandomId(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomHex(bytes) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timeSortableId() {
  return generateRandomHex(3);
}

function randomFourId() {
  return generateRandomHex(2);
}

function generateMessageId() {
  const r = timeSortableId();
  const r2 = randomFourId();
  return {
    userMessageId: `umsg_01ktevtptd${r2}s0d2${r}x8cq70a${generateRandomId(4)}`,
    aiMessageId: `aimsg_01ktevtpvh${r}7n2rj62vz7`,
  };
}

// ---------- DOM ----------
const els = {};
document.addEventListener('DOMContentLoaded', async () => {
  els.messages = document.getElementById('messages');
  els.empty = document.getElementById('emptyState');
  els.input = document.getElementById('messageInput');
  els.send = document.getElementById('sendBtn');
  els.fileInput = document.getElementById('fileInput');
  els.previews = document.getElementById('filePreviews');
  els.status = document.getElementById('status');
  els.project = document.getElementById('projectLabel');

  els.send.addEventListener('click', sendMessage);
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.input.addEventListener('input', () => {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 96) + 'px';
  });
  els.fileInput.addEventListener('change', (e) => {
    Array.from(e.target.files || []).forEach(addAttachment);
    e.target.value = '';
  });

  await init();
});

function setStatus(text, kind = 'info', ms = 4000) {
  els.status.textContent = text;
  els.status.className = `status show ${kind}`;
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => {
    els.status.className = 'status';
    els.status.textContent = '';
  }, ms);
}

function setBusy(v) {
  isBusy = v;
  els.input.disabled = v;
  els.send.disabled = v;
  els.fileInput.disabled = v;
}

// ---------- Auth / Projeto ----------
async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentProjectId = extractProjectId(tab && tab.url);
    els.project.textContent = currentProjectId
      ? `Projeto: ${currentProjectId}`
      : 'Nenhum projeto detectado (abra lovable.dev/projects/…)';

    const cookies = await chrome.cookies.getAll({ domain: 'lovable.dev' });
    cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const session = cookies.find((c) => c.name === 'lovable-session-id-v2');
    const sbToken = cookies.find((c) => c.name === 'sb-access-token');
    authToken = (sbToken && sbToken.value) || (session && session.value) || null;

    const stored = await chrome.storage.local.get('browserSessionId');
    browserSessionId = stored.browserSessionId || crypto.randomUUID();
    await chrome.storage.local.set({ browserSessionId });

    if (!authToken) setStatus('Sessão não encontrada. Faça login em lovable.dev.', 'error', 6000);
    else if (currentProjectId) setStatus('Conectado ao projeto.', 'success', 2500);
  } catch (err) {
    setStatus(`Erro de inicialização: ${err.message}`, 'error', 6000);
  }
}

function extractProjectId(url) {
  if (!url) return null;
  const m =
    url.match(/lovable\.dev\/projects\/([0-9a-zA-Z-]+)/) ||
    url.match(/id-preview--([0-9a-fA-F-]{36})/) ||
    url.match(/preview--([0-9a-zA-Z-]+)\.lovable\.app/);
  return m ? m[1] : null;
}

function apiHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    'User-Agent': UA,
    Origin: 'https://lovable.dev',
    Referer: 'https://lovable.dev/',
    Cookie: cookieString,
    'x-client-git-sha': GIT_SHA,
    'x-browser-session-id': browserSessionId,
    'x-lov-platform': LOV_PLATFORM,
    ...extra,
  };
}

// ---------- Anexos ----------
class Attachment {
  constructor(file) {
    this.id = generateRandomId(8);
    this.file = file;
    this.status = 'pending';
    this.progress = 0;
    this.downloadUrl = null;
  }

  render() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'file-chip';
      this.el.innerHTML = `
        <button class="remove" title="Remover">×</button>
        <span class="name"></span>
        <span class="state"></span>
        <span class="bar"><i></i></span>`;
      this.el.querySelector('.remove').addEventListener('click', () => removeAttachment(this.id));
      els.previews.appendChild(this.el);
    }
    this.el.querySelector('.name').textContent = this.file.name;
    this.el.querySelector('.bar i').style.width = `${this.progress}%`;
    const state = this.el.querySelector('.state');
    if (this.status === 'uploading') state.innerHTML = '<span class="spinner"></span>enviando…';
    else if (this.status === 'done') state.textContent = 'pronto';
    else if (this.status === 'error') state.textContent = 'falhou';
    else state.textContent = `${Math.round(this.file.size / 1024)} KB`;
    this.el.classList.toggle('done', this.status === 'done');
    this.el.classList.toggle('error', this.status === 'error');
  }

  async upload() {
    this.status = 'uploading';
    this.progress = 10;
    this.render();

    // Etapa 1: Gerar URL de upload
    const uploadUrlResponse = await fetch(
      `https://api.lovable.dev/projects/${currentProjectId}/files/generate-upload-url`,
      {
        method: 'POST',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          original_file_name: this.file.name,
          content_type: this.file.type || 'application/octet-stream',
          file_size_bytes: this.file.size,
          original_file_size_bytes: this.file.size,
        }),
      }
    );
    if (!uploadUrlResponse.ok) {
      throw new Error(`generate-upload-url falhou: ${uploadUrlResponse.status}`);
    }
    const uploadData = await uploadUrlResponse.json();
    this.progress = 35;
    this.render();

    const fileBuffer = await this.file.arrayBuffer();
    let uploadSuccess = false;

    // Etapa 2: PUT para o GCS
    try {
      const uploadResponse = await fetch(uploadData.url, {
        method: 'PUT',
        mode: 'cors',
        headers: {
          'Content-Type': this.file.type,
          'x-goog-content-length-range': uploadData.headers['x-goog-content-length-range'],
          'x-goog-meta-user_id': uploadData.headers['x-goog-meta-user_id'],
        },
        body: fileBuffer,
      });
      uploadSuccess = uploadResponse.ok;
      if (!uploadSuccess) throw new Error(`status ${uploadResponse.status}`);
    } catch (fetchError) {
      console.log('Fetch failed, trying alternative method:', fetchError);
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadData.url);
          xhr.setRequestHeader('Content-Type', this.file.type);
          xhr.setRequestHeader(
            'x-goog-content-length-range',
            uploadData.headers['x-goog-content-length-range']
          );
          xhr.setRequestHeader('x-goog-meta-user_id', uploadData.headers['x-goog-meta-user_id']);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              this.progress = 35 + Math.round((e.loaded / e.total) * 50);
              this.render();
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              uploadSuccess = true;
              resolve();
            } else {
              reject(new Error(`XHR upload failed: ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error('XHR network error'));
          xhr.send(fileBuffer);
        });
      } catch (xhrError) {
        console.log('XHR failed, trying background script:', xhrError);
        try {
          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              {
                action: 'uploadToStorage',
                data: {
                  url: uploadData.url,
                  headers: {
                    'Content-Type': this.file.type,
                    'x-goog-content-length-range':
                      uploadData.headers['x-goog-content-length-range'],
                    'x-goog-meta-user_id': uploadData.headers['x-goog-meta-user_id'],
                  },
                  body: Array.from(new Uint8Array(fileBuffer)),
                  fileId: this.id,
                },
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                  uploadSuccess = true;
                  resolve(response);
                } else {
                  reject(new Error((response && response.error) || 'erro desconhecido'));
                }
              }
            );
          });
        } catch (bgError) {
          throw new Error(`Todos os métodos de upload falharam: ${bgError.message}`);
        }
      }
    }

    if (!uploadSuccess) throw new Error('Upload não confirmado pelo storage.');
    this.progress = 90;
    this.render();

    // Etapa 3: Gerar URL de download
    const fileId = uploadData.file_id;
    const [dirName, fileName] = fileId.split('/');
    const downloadUrlResponse = await fetch(
      'https://api.lovable.dev/files/generate-download-url',
      {
        method: 'POST',
        headers: apiHeaders(),
        credentials: 'include',
        body: JSON.stringify({ dir_name: dirName, file_name: fileName }),
      }
    );
    if (!downloadUrlResponse.ok) {
      throw new Error(`generate-download-url falhou: ${downloadUrlResponse.status}`);
    }
    const dl = await downloadUrlResponse.json();
    this.downloadUrl = dl.url || dl.download_url || dl.signed_url;
    this.fileId = fileId;
    this.status = 'done';
    this.progress = 100;
    this.render();
    return this.downloadUrl;
  }
}

function addAttachment(file) {
  if (!currentProjectId) return setStatus('Abra um projeto do Lovable antes de anexar.', 'error');
  const att = new Attachment(file);
  attachments.push(att);
  att.render();
}

function removeAttachment(id) {
  const i = attachments.findIndex((a) => a.id === id);
  if (i === -1) return;
  attachments[i].el?.remove();
  attachments.splice(i, 1);
}

// ---------- Mensagens ----------
function appendMessage(role, text, meta) {
  els.empty?.remove();
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  if (meta) {
    const m = document.createElement('span');
    m.className = 'meta';
    m.textContent = meta;
    div.appendChild(m);
  }
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
  return div;
}

async function sendMessage() {
  if (isBusy) return;
  const message = els.input.value.trim();
  if (!message && attachments.length === 0) return;
  if (!currentProjectId) return setStatus('Nenhum projeto detectado na aba ativa.', 'error');
  if (!authToken) return setStatus('Sem token de sessão. Faça login em lovable.dev.', 'error');

  setBusy(true);
  try {
    const files = [];
    for (const att of attachments) {
      if (att.status === 'done' && att.downloadUrl) {
        files.push({ url: att.downloadUrl, name: att.file.name, type: att.file.type });
        continue;
      }
      try {
        setStatus(`Enviando ${att.file.name}…`, 'info', 8000);
        const url = await att.upload();
        files.push({ url, name: att.file.name, type: att.file.type });
      } catch (err) {
        att.status = 'error';
        att.render();
        throw err;
      }
    }

    appendMessage(
      'user',
      message || '(somente arquivos)',
      files.length ? `${files.length} arquivo(s) anexado(s)` : ''
    );
    els.input.value = '';
    els.input.style.height = 'auto';

    const ids = generateMessageId();
    const messageBody = {
      id: ids.userMessageId,
      message: message,
      files: files,
      selected_elements: [],
      chat_only: false,
      optimisticImageUrls: files.map((f) => f.url),
      intent: 'fix_error',
      message_intent_metadata: {
        fix_error_metadata: {
          errors: [
            {
              error_type: 'build',
              error_message: '',
              build_event_id: 'main:agent#00000000000123#bld:ZDP4ZE3D',
            },
          ],
        },
      },
      contains_error: true,
      error_ids: ['main:agent#00000000000123#bld:ZDP4ZE3D'],
      ai_message_id: ids.aiMessageId,
      thread_id: 'main',
      current_page: '/',
      current_viewport_width: 1465,
      current_viewport_height: 408,
      current_viewport_dpr: 0.8999999761581421,
      view: 'preview',
      view_description: 'The user is currently viewing the preview.',
      model: null,
      network_requests: [],
      runtime_errors: [],
      integration_metadata: {
        browser: {
          preview_viewport_width: 1465,
          preview_viewport_height: 408,
          is_logged_out: true,
        },
      },
    };

    const response = await fetch(`https://api.lovable.dev/projects/${currentProjectId}/chat`, {
      method: 'POST',
      headers: apiHeaders(),
      credentials: 'include',
      body: JSON.stringify(messageBody),
    });

    const raw = await response.text();
    if (!response.ok) throw new Error(`Chat falhou: ${response.status} ${raw.slice(0, 160)}`);

    let reply = raw;
    try {
      const json = JSON.parse(raw);
      reply = json.message || json.content || json.response || raw;
    } catch (_) {
      /* resposta em stream/texto */
    }
    appendMessage('ai', typeof reply === 'string' ? reply : JSON.stringify(reply, null, 2));

    attachments.splice(0).forEach((a) => a.el?.remove());
    setStatus('Mensagem enviada.', 'success');
  } catch (err) {
    setStatus(err.message, 'error', 7000);
    appendMessage('ai', `⚠️ ${err.message}`);
  } finally {
    setBusy(false);
  }
}
