const SETTINGS_KEY = 'slv2_transcription_settings';
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  simulatorEnabled: true,
  baseUrl: 'https://painel-super-lov.lovable.app',
  path: '/api/audio/transcribe',
  timeoutMs: 45000,
  language: 'pt-BR'
});

function storageGet() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[SETTINGS_KEY] || null);
    });
  });
}

export async function getTranscriptionSettings() {
  return { ...DEFAULT_SETTINGS, ...((await storageGet()) || {}) };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Não foi possível preparar o áudio para transcrição.'));
    reader.readAsDataURL(blob);
  });
}

async function simulateTranscription(recording) {
  await new Promise((resolve) => setTimeout(resolve, 650));
  const seconds = Math.max(1, Math.round(Number(recording?.durationMs || 0) / 1000));
  return {
    text: `Transcrição simulada de um áudio com aproximadamente ${seconds} segundos. Substitua este texto pelo conteúdo reconhecido antes de planejar a alteração.`,
    language: 'pt-BR',
    simulated: true
  };
}

export async function transcribeAudio(recording) {
  if (!recording?.blob || recording.blob.size === 0) throw new Error('O áudio está vazio.');
  const settings = await getTranscriptionSettings();
  if (settings.simulatorEnabled) return simulateTranscription(recording);
  if (!settings.enabled) throw new Error('O serviço de transcrição ainda não foi configurado.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const baseUrl = String(settings.baseUrl || '').replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}${settings.path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Super-Lovable-Client': 'chrome-extension-v2'
      },
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        audioBase64: await blobToBase64(recording.blob),
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
        language: settings.language
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `Servidor retornou ${response.status}.`);
    if (!String(data?.text || '').trim()) throw new Error('O serviço não retornou uma transcrição.');
    return { text: String(data.text).trim(), language: data.language || settings.language, simulated: false };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A transcrição demorou mais do que o esperado.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
