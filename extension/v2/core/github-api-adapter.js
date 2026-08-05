/* SUPER LOVABLE V2 — adaptador do backend GitHub */

const SETTINGS_KEY = 'slv2_github_api_settings';
const DEFAULT_SETTINGS = Object.freeze({
  baseUrl: 'https://painel-super-lov.lovable.app',
  connectPath: '/api/github/connect',
  statusPath: '/api/github/status',
  repositoriesPath: '/api/github/repositories',
  branchesPath: '/api/github/branches',
  disconnectPath: '/api/github/disconnect',
  timeoutMs: 15000,
  simulatorEnabled: true
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

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

export async function getGithubApiSettings() {
  return { ...DEFAULT_SETTINGS, ...((await storageGet()) || {}) };
}

export async function saveGithubApiSettings(input = {}) {
  const current = await getGithubApiSettings();
  const baseUrl = String(input.baseUrl || current.baseUrl).trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('A API do GitHub deve usar HTTPS.');
  const next = {
    ...current,
    ...input,
    baseUrl,
    timeoutMs: Math.max(3000, Math.min(Number(input.timeoutMs) || current.timeoutMs, 30000))
  };
  await storageSet(next);
  return next;
}

function simulatedRepositories() {
  return [
    {
      id: 1,
      fullName: 'usuario/projeto-lovable',
      name: 'projeto-lovable',
      owner: 'usuario',
      private: true,
      defaultBranch: 'main',
      permissions: { read: true, write: true }
    },
    {
      id: 2,
      fullName: 'usuario/landing-page',
      name: 'landing-page',
      owner: 'usuario',
      private: false,
      defaultBranch: 'main',
      permissions: { read: true, write: true }
    }
  ];
}

async function request(path, options = {}) {
  const settings = await getGithubApiSettings();
  if (settings.simulatorEnabled) {
    if (path === settings.statusPath) {
      return { status: 'connected', accountLogin: 'usuario', accountName: 'Conta de teste', installationId: 'simulated' };
    }
    if (path === settings.repositoriesPath) return { repositories: simulatedRepositories() };
    if (path === settings.branchesPath) return { branches: ['main', 'develop', 'staging'] };
    if (path === settings.connectPath) return { authorizationUrl: null, simulated: true };
    if (path === settings.disconnectPath) return { success: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const response = await fetch(`${settings.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Super-Lovable-Client': 'chrome-extension-v2' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Servidor retornou ${response.status}.`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao conectar com o GitHub.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function beginGithubConnection() {
  const settings = await getGithubApiSettings();
  return request(settings.connectPath, { method: 'POST' });
}

export async function fetchGithubStatus() {
  const settings = await getGithubApiSettings();
  return request(settings.statusPath);
}

export async function fetchGithubRepositories() {
  const settings = await getGithubApiSettings();
  return request(settings.repositoriesPath);
}

export async function fetchGithubBranches(repositoryFullName) {
  const settings = await getGithubApiSettings();
  return request(settings.branchesPath, { method: 'POST', body: { repository: repositoryFullName } });
}

export async function disconnectGithubRemote() {
  const settings = await getGithubApiSettings();
  return request(settings.disconnectPath, { method: 'POST' });
}
