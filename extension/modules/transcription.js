// transcription.js — converte a gravação do microfone em texto.
// O microfone da SUPER LOVABLE não anexa áudio: ele transcreve a fala
// e coloca o texto direto no campo do prompt.
(function (root) {
  async function endpointFromSettings() {
    try {
      const custom = root.SettingsManager && root.SettingsManager.get('transcriptionEndpoint');
      if (custom && String(custom).trim()) return String(custom).trim();
    } catch (e) { /* usa o padrão */ }
    const base = await root.LicenseClient.getServerUrl();
    return `${base}/transcribe`;
  }

  /**
   * @param {File|Blob} file áudio gravado
   * @returns {Promise<string>} texto transcrito
   */
  async function transcribe(file) {
    const state = await root.LicenseClient.getStoredLicense();
    if (!state.license_token) throw new Error('Ative sua licença para usar a transcrição por voz.');
    if (!file || file.size < 1024) throw new Error('Gravação muito curta. Fale novamente por alguns segundos.');

    const url = await endpointFromSettings();
    const form = new FormData();
    form.append('file', file, file.name || 'gravacao.webm');

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.license_token}` },
      body: form,
    });
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.error || `Não foi possível transcrever (${res.status}).`);
    const text = String(data.text || '').trim();
    if (!text) throw new Error('Não entendemos o áudio. Tente falar mais perto do microfone.');
    return text;
  }

  root.Transcription = { transcribe };
})(typeof window !== 'undefined' ? window : globalThis);
