/* SUPER LOVABLE V2 — estado da conexão GitHub */

const STORAGE_KEY = 'slv2_github_connection';

const EMPTY_STATE = Object.freeze({
  status: 'disconnected',
  accountLogin: null,
  accountName: null,
  installationId: null,
  repositories: [],
  selectedRepository: null,
  selectedBranch: null,
  connectedAt: null,
  lastCheckedAt: null,
  source: 'none'
});

function storageGet() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[STORAGE_KEY] || null);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function normalizeRepository(repository) {
  if (!repository) return null;
  const fullName = String(repository.fullName || repository.full_name || '').trim();
  if (!fullName || !fullName.includes('/')) return null;
  return {
    id: repository.id || fullName,
    fullName,
    name: repository.name || fullName.split('/')[1],
    owner: repository.owner || fullName.split('/')[0],
    private: Boolean(repository.private),
    defaultBranch: repository.defaultBranch || repository.default_branch || 'main',
    permissions: {
      read: repository.permissions?.read !== false,
      write: repository.permissions?.write === true || repository.permissions?.push === true
    }
  };
}

export async function getGithubConnection() {
  const stored = await storageGet();
  if (!stored) return { ...EMPTY_STATE };
  return {
    ...EMPTY_STATE,
    ...stored,
    repositories: Array.isArray(stored.repositories)
      ? stored.repositories.map(normalizeRepository).filter(Boolean)
      : [],
    selectedRepository: normalizeRepository(stored.selectedRepository)
  };
}

export async function saveGithubConnection(input = {}) {
  const current = await getGithubConnection();
  const next = {
    ...current,
    ...input,
    repositories: Array.isArray(input.repositories)
      ? input.repositories.map(normalizeRepository).filter(Boolean)
      : current.repositories,
    selectedRepository: input.selectedRepository === undefined
      ? current.selectedRepository
      : normalizeRepository(input.selectedRepository),
    lastCheckedAt: new Date().toISOString()
  };
  await storageSet(next);
  return next;
}

export async function disconnectGithub() {
  await storageSet({ ...EMPTY_STATE });
  return { ...EMPTY_STATE };
}

export function isGithubConnected(connection) {
  return connection?.status === 'connected' && Boolean(connection?.accountLogin);
}

export function hasWritableProject(connection) {
  return Boolean(
    isGithubConnected(connection) &&
    connection?.selectedRepository?.fullName &&
    connection?.selectedRepository?.permissions?.write &&
    connection?.selectedBranch
  );
}
