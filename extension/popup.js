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

  // Mantém o mesmo envio; usa o adaptador (Escudo/histórico/sons) quando existir.
  const dispatchSend = () => (window.LCA?.sendMessage || sendMessage)();
  els.send.addEventListener('click', dispatchSend);
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      dispatchSend();
    }
  });
  els.input.addEventListener('input', () => {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 96) + 'px';
  });
  els.fileInput.addEventListener('change', (e) => {
    // Validação nova (tipos/limites) quando disponível; caso contrário, fluxo original.
    const add = window.AttachmentManager
      ? (f) => window.AttachmentManager.add(f)
      : addAttachment;
    Array.from(e.target.files || []).forEach(add);
    e.target.value = '';
  });

  await init();

  // Módulos adicionais (não interferem no fluxo de envio original)
  try {
    await window.LCA_UI?.boot();
  } catch (err) {
    console.error('Falha ao iniciar módulos adicionais:', err);
    setStatus(`Módulos adicionais indisponíveis: ${err.message}`, 'error', 6000);
  }
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
    // Content-Type real do arquivo; o mesmo valor usado para assinar a URL.
    const contentType = this.file.type || 'application/octet-stream';
    this.originalByteLength = this.file.size;
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

    // Bytes originais, sem conversão para string/base64 em nenhum ponto.
    const fileBuffer = await this.file.arrayBuffer();
    this.uploadedByteLength = fileBuffer.byteLength;
    if (this.uploadedByteLength !== this.originalByteLength) {
      throw new Error(
        `Leitura incompleta do arquivo (${this.uploadedByteLength} de ${this.originalByteLength} bytes).`
      );
    }
    let uploadSuccess = false;

    // Etapa 2: PUT para o GCS
    try {
      const uploadResponse = await fetch(uploadData.url, {
        method: 'PUT',
        mode: 'cors',
        headers: {
          'Content-Type': contentType,
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
          xhr.setRequestHeader('Content-Type', contentType);
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
                    'Content-Type': contentType,
                    'x-goog-content-length-range':
                      uploadData.headers['x-goog-content-length-range'],
                    'x-goog-meta-user_id': uploadData.headers['x-goog-meta-user_id'],
                  },
                  // transporte byte a byte (sem JSON de texto / base64)
                  body: Array.from(new Uint8Array(fileBuffer)),
                  byteLength: fileBuffer.byteLength,
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
    if (this.uploadedByteLength !== this.originalByteLength) {
      throw new Error('Tamanho enviado diferente do arquivo original.');
    }
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
  return att;
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


// ---------- escolha do modo de envio ----------
// Pop-up simples: envio automático (sai sozinho quando a Lovable ficar livre)
// ou envio pendente (fica guardado para editar e enviar manualmente).
function chooseSendMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get('sl_send_mode_pref', (r) => {
      const pref = r && r.sl_send_mode_pref;
      if (pref === 'auto' || pref === 'pending') return resolve(pref);

      const back = document.createElement('div');
      back.className = 'sl-modal-back';
      back.innerHTML = `
        <div class="sl-modal" role="dialog" aria-modal="true" aria-label="Como enviar este prompt">
          <h3>Como você quer enviar?</h3>
          <button class="sl-mode auto" data-mode="auto">
            <b>Envio automático</b>
            <span>Sai na hora se a Lovable estiver parada. Se estiver executando, entra na fila e é enviado sozinho ao terminar.</span>
          </button>
          <button class="sl-mode pending" data-mode="pending">
            <b>Envio pendente</b>
            <span>Fica guardado na fila para você editar e enviar manualmente quando quiser.</span>
          </button>
          <label class="sl-remember"><input type="checkbox" id="slRemember" /> Sempre usar a opção escolhida</label>
          <button class="sl-cancel" data-mode="">Cancelar</button>
        </div>`;
      document.body.appendChild(back);
      back.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mode]');
        if (!btn) return;
        const mode = btn.dataset.mode;
        const remember = back.querySelector('#slRemember').checked;
        back.remove();
        if (mode && remember) chrome.storage.local.set({ sl_send_mode_pref: mode });
        resolve(mode || null);
      });
    });
  });
}

async function sendMessage() {
  if (isBusy) return;
  const message = els.input.value.trim();
  if (!message && attachments.length === 0) return;
  if (!currentProjectId) return setStatus('Nenhum projeto detectado na aba ativa.', 'error');
  if (!authToken) return setStatus('Sem token de sessão. Faça login em lovable.dev.', 'error');

  const sendMode = await chooseSendMode();
  if (!sendMode) return;

  // Modo de otimização ativo: só o identificador viaja aqui. A instrução
  // interna é combinada ao texto no motor de envio, nunca no campo de texto.
  const promptMode = await window.PromptModes.getActive();

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

    // Função central: o motor no service worker envia agora (quando a Lovable
    // está livre) ou enfileira. O payload, os IDs e o endpoint continuam
    // exatamente os mesmos — apenas passaram a viver no background para que a
    // fila siga funcionando com o popup fechado.
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'SUPER_LOVABLE_SUBMIT_PROMPT',
          data: {
            projectId: currentProjectId,
            text: message,
            attachments: files,
            source: 'popup',
            mode: sendMode,
            promptMode,
          },
        },
        (r) => {
          void chrome.runtime.lastError;
          resolve(r || { success: false, error: 'Sem resposta da SUPER LOVABLE.' });
        }
      );
    });

    if (!res.success) throw new Error(res.error || 'Não foi possível enviar.');

    attachments.splice(0).forEach((a) => a.el?.remove());
    if (res.pending) {
      appendMessage('ai', `Guardado como envio pendente (posição ${res.position}). Abra a aba Fila para editar e enviar quando quiser.`);
      setStatus('Prompt pendente na fila.', 'info', 6000);
    } else if (res.sent) {
      appendMessage('ai', 'Comando enviado à Lovable. Acompanhe a resposta na aba do projeto.');
      setStatus('Mensagem enviada.', 'success');
    } else {
      appendMessage('ai', `Adicionado à fila na posição ${res.position}. O envio é automático assim que a Lovable ficar livre.`);
      setStatus(`Na fila — posição ${res.position}.`, 'info', 6000);
    }
  } catch (err) {
    setStatus(err.message, 'error', 7000);
    appendMessage('ai', `⚠️ ${err.message}`);
  } finally {
    setBusy(false);
  }
}


// ---------- API pública para os módulos adicionais ----------
// Exposição do estado já existente. Nada aqui altera autenticação, montagem
// do body, geração de IDs, upload ou o endpoint de chat.
window.LCA = {
  get projectId() { return currentProjectId; },
  get authToken() { return authToken; },
  get cookieString() { return cookieString; },
  get browserSessionId() { return browserSessionId; },
  get isBusy() { return isBusy; },
  attachments,
  els,
  Attachment,
  apiHeaders,
  addAttachment,
  removeAttachment,
  appendMessage,
  setStatus,
  setBusy,
  sendMessage,
  generateRandomId,
  generateMessageId,
  extractProjectId,
};
