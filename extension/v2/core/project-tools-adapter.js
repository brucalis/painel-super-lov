const SETTINGS_KEY = 'slv2_project_tools_settings';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  simulatorEnabled: true,
  baseUrl: 'https://painel-super-lov.lovable.app',
  downloadPath: '/api/github/project/download',
  buildPath: '/api/editor/tools/build',
  securityPath: '/api/editor/tools/security',
  brandingPath: '/api/editor/tools/branding',
  publishStatusPath: '/api/editor/tools/publish-status',
  timeoutMs: 30000
});

function readSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve({ ...DEFAULT_SETTINGS, ...(result?.[SETTINGS_KEY] || {}) });
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, payload = {}, responseType = 'json') {
  const settings = await readSettings();
  if (!settings.enabled) throw new Error('As ferramentas remotas ainda não foram configuradas.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const url = `${String(settings.baseUrl).replace(/\/+$/, '')}${path}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Super-Lovable-Client': 'chrome-extension-v2' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || `Servidor retornou ${response.status}.`);
    }
    return responseType === 'blob' ? response.blob() : response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao executar a ferramenta.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function assertProject(context) {
  if (!context?.repository?.fullName || !context?.branch) {
    throw new Error('Selecione um repositório e uma branch antes de usar esta ferramenta.');
  }
}

export async function downloadProject(context) {
  assertProject(context);
  const settings = await readSettings();
  if (settings.simulatorEnabled) {
    await wait(500);
    return {
      simulated: true,
      downloadUrl: `https://github.com/${context.repository.fullName}/archive/refs/heads/${encodeURIComponent(context.branch)}.zip`,
      filename: `${context.repository.name || 'projeto'}-${context.branch}.zip`
    };
  }
  const blob = await request(settings.downloadPath, {
    repository: context.repository.fullName,
    branch: context.branch
  }, 'blob');
  return { blob, filename: `${context.repository.name || 'projeto'}-${context.branch}.zip` };
}

export async function runBuildCheck(context) {
  assertProject(context);
  const settings = await readSettings();
  if (settings.simulatorEnabled) {
    await wait(900);
    return {
      success: true,
      simulated: true,
      checks: [
        { name: 'Dependências', status: 'passed' },
        { name: 'TypeScript', status: 'passed' },
        { name: 'Lint', status: 'passed' },
        { name: 'Build', status: 'passed' }
      ],
      message: 'Projeto validado no simulador de desenvolvimento.'
    };
  }
  return request(settings.buildPath, { repository: context.repository.fullName, branch: context.branch });
}

export async function runSecurityScan(context) {
  assertProject(context);
  const settings = await readSettings();
  if (settings.simulatorEnabled) {
    await wait(800);
    return {
      success: true,
      simulated: true,
      score: 92,
      findings: [
        { severity: 'info', title: 'Nenhum segredo exposto detectado', detail: 'Verificação simulada.' },
        { severity: 'low', title: 'Revisar dependências periodicamente', detail: 'Mantenha o lockfile atualizado.' }
      ]
    };
  }
  return request(settings.securityPath, { repository: context.repository.fullName, branch: context.branch });
}

export async function scanProjectBranding(context) {
  assertProject(context);
  const settings = await readSettings();
  if (settings.simulatorEnabled) {
    await wait(650);
    return {
      success: true,
      simulated: true,
      codeControlled: [
        { file: 'src/components/Footer.tsx', match: 'Made with Lovable', removable: true }
      ],
      platformControlled: {
        detected: true,
        label: 'Badge oficial Edit with Lovable',
        removableByCode: false,
        guidance: 'Abra Project Settings na Lovable e desative o badge, quando seu plano permitir.'
      }
    };
  }
  return request(settings.brandingPath, { repository: context.repository.fullName, branch: context.branch });
}

export async function getPublishStatus(context) {
  assertProject(context);
  const settings = await readSettings();
  if (settings.simulatorEnabled) {
    await wait(450);
    return {
      success: true,
      simulated: true,
      codeSynced: true,
      publishedUpToDate: false,
      guidance: 'O código está sincronizado. Na Lovable, clique em Publish e depois em Update. Essa ação não consome créditos de construção.'
    };
  }
  return request(settings.publishStatusPath, { repository: context.repository.fullName, branch: context.branch });
}
