const STORAGE_KEY = 'slv2_staged_attachments';
const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'png','jpg','jpeg','webp','gif','svg','pdf','txt','md','json','csv','html','css','js','jsx','ts','tsx','xml','yaml','yml','log'
]);

function storageGet() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(Array.isArray(result?.[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    });
  });
}

function extensionOf(name = '') {
  const parts = String(name).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function validateAttachmentFile(file) {
  if (!(file instanceof File)) return { valid: false, message: 'Arquivo inválido.' };
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { valid: false, message: `O formato .${extension || 'desconhecido'} não é permitido.` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { valid: false, message: `${file.name} ultrapassa o limite de 8 MB.` };
  }
  return { valid: true };
}

export async function getStagedAttachments() {
  return storageGet();
}

export async function addAttachmentFiles(fileList) {
  const incoming = [...(fileList || [])];
  const current = await getStagedAttachments();
  if (current.length + incoming.length > MAX_FILES) {
    throw new Error(`Você pode anexar no máximo ${MAX_FILES} arquivos por tarefa.`);
  }

  const accepted = [];
  for (const file of incoming) {
    const validation = validateAttachmentFile(file);
    if (!validation.valid) throw new Error(validation.message);
    accepted.push({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      extension: extensionOf(file.name),
      dataUrl: await readAsDataUrl(file),
      createdAt: new Date().toISOString()
    });
  }

  const next = [...current, ...accepted];
  const total = next.reduce((sum, item) => sum + Number(item.size || 0), 0);
  if (total > MAX_TOTAL_BYTES) throw new Error('Os anexos ultrapassam o limite total de 20 MB.');
  return storageSet(next);
}

export async function removeStagedAttachment(id) {
  const current = await getStagedAttachments();
  return storageSet(current.filter((item) => item.id !== id));
}

export async function clearStagedAttachments() {
  return storageSet([]);
}

export function attachmentSummary(item) {
  const size = Number(item?.size || 0);
  const label = size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${item?.name || 'arquivo'} · ${label}`;
}
