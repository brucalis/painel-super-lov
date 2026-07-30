// watermark-remover.js — fluxo real de "Remover marca d'água".
// Não envia prompt pelo chat, não altera CSS/DOM do preview e não guarda segredos.
// Toda autorização é refeita no backend próprio da SUPER LOVABLE.
(function (root) {
  const PATH_REMOVE = '/projects/remove-watermark';
  const PATH_STATUS = '/projects/watermark-status';
  const MIN_INTERVAL_MS = 8000;

  let inFlight = false;
  let lastAt = 0;

  const MESSAGES = {
    PROJECT_NOT_SYNCED: 'Nenhum projeto sincronizado. Abra o projeto na Lovable e tente novamente.',
    LICENSE_INVALID: 'Sua licença não está ativa. Ative o acesso para usar esta ferramenta.',
    AUTH_ERROR: 'Não foi possível autenticar este dispositivo na sua licença.',
    RATE_LIMITED: 'Aguarde alguns segundos antes de tentar de novo.',
    WATERMARK_REMOVAL_UNAVAILABLE: 'Não foi possível remover a marca deste projeto automaticamente.',
    WATERMARK_REMOVED: 'Marca d’água removida com sucesso',
    UNEXPECTED: 'Erro inesperado ao remover a marca. Tente novamente.',
  };

  async function currentProjectId() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const m = (tab?.url || '').match(/lovable\.(?:dev|app)\/projects\/([0-9a-zA-Z-]+)/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  async function post(path, body) {
    const base = await window.LicenseClient.getServerUrl();
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { httpStatus: res.status, data: data || {} };
  }

  const WatermarkRemover = {
    MESSAGES,

    /** Executa o fluxo completo. Retorna { state, code, message }. */
    async run() {
      if (inFlight) return { state: 'processing', code: 'RATE_LIMITED', message: MESSAGES.RATE_LIMITED };
      if (Date.now() - lastAt < MIN_INTERVAL_MS) {
        return { state: 'error', code: 'RATE_LIMITED', message: MESSAGES.RATE_LIMITED };
      }

      const projectId = await currentProjectId();
      if (!projectId) {
        return { state: 'not_synced', code: 'PROJECT_NOT_SYNCED', message: MESSAGES.PROJECT_NOT_SYNCED };
      }

      const license = await window.LicenseClient.getStoredLicense();
      const active = await window.LicenseClient.hasActiveLicense();
      if (!active || !license?.license_key) {
        return { state: 'license_invalid', code: 'LICENSE_INVALID', message: MESSAGES.LICENSE_INVALID };
      }

      const deviceId = await window.LicenseClient.getDeviceId();

      inFlight = true;
      lastAt = Date.now();
      try {
        const { httpStatus, data } = await post(PATH_REMOVE, {
          projectId,
          deviceId,
          licenseKey: license.license_key,
        });

        if (data.ok && data.code === 'WATERMARK_REMOVED') {
          let confirmed = true;
          try {
            const check = await post(PATH_STATUS, { projectId, licenseKey: license.license_key });
            confirmed = !!check.data?.last?.ok;
          } catch (e) {
            console.warn('watermark status check', e);
          }
          return {
            state: 'done',
            code: 'WATERMARK_REMOVED',
            projectId,
            confirmed,
            message: MESSAGES.WATERMARK_REMOVED,
          };
        }

        const code = data.code || 'UNEXPECTED';
        const stateByCode = {
          PROJECT_NOT_SYNCED: 'not_synced',
          LICENSE_INVALID: 'license_invalid',
          AUTH_ERROR: 'auth_error',
          RATE_LIMITED: 'error',
          WATERMARK_REMOVAL_UNAVAILABLE: 'unavailable',
        };
        console.warn('remove-watermark falhou', httpStatus, code, data.message || '');
        return {
          state: stateByCode[code] || 'error',
          code,
          projectId,
          message: data.message || MESSAGES[code] || MESSAGES.UNEXPECTED,
        };
      } catch (e) {
        console.error('remove-watermark erro', e);
        return { state: 'error', code: 'UNEXPECTED', message: MESSAGES.UNEXPECTED };
      } finally {
        inFlight = false;
      }
    },
  };

  root.WatermarkRemover = WatermarkRemover;
})(typeof window !== 'undefined' ? window : self);
