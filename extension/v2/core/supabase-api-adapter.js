const SETTINGS_KEY = 'slv2_supabase_settings';
const CONNECTION_KEY = 'slv2_supabase_connection';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  simulatorEnabled: true,
  baseUrl: 'https://painel-super-lov.lovable.app',
  connectPath: '/api/supabase/connect',
  statusPath: '/api/supabase/status',
  projectsPath: '/api/supabase/projects',
  inspectPath: '/api/supabase/projects/{ref}/inspect',
  actionPath: '/api/supabase/projects/{ref}/actions',
  timeoutMs: 20000
});

function storageGet(key) {
  return new Promise((resolve, reject) => chrome.storage.local.get(key, (result) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(result?.[key] || null);
  }));
}

function storageSet(key, value) {
  return new Promise((resolve, reject) => chrome.storage.local.set({ [key]: value }, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(value);
  }));
}

export async function getSupabaseSettings() {
  return { ...DEFAULT_SETTINGS, ...((await storageGet(SETTINGS_KEY)) || {}) };
}

export async function getSupabaseConnection() {
  return (await storageGet(CONNECTION_KEY)) || {
    status: 'disconnected',
    accountEmail: null,
    projects: [],
    selectedProject: null,
    connectedAt: null,
    source: null
  };
}

export async function saveSupabaseConnection(patch = {}) {
  const current = await getSupabaseConnection();
  return storageSet(CONNECTION_KEY, { ...current, ...patch });
}

export async function disconnectSupabase() {
  return storageSet(CONNECTION_KEY, {
    status: 'disconnected', accountEmail: null, projects: [], selectedProject: null, connectedAt: null, source: null
  });
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function simulate(operation, payload = {}) {
  await wait(250);
  if (operation === 'connect') return { status: 'connected', accountEmail: 'teste@superlovable.dev', simulated: true };
  if (operation === 'projects') return {
    projects: [
      { ref: 'slv2-demo-main', name: 'Área de membros', region: 'sa-east-1', status: 'ACTIVE_HEALTHY' },
      { ref: 'slv2-demo-store', name: 'Checkout e assinaturas', region: 'us-east-1', status: 'ACTIVE_HEALTHY' }
    ], simulated: true
  };
  if (operation === 'inspect') return {
    project: payload.project,
    health: 'healthy',
    database: { tables: 8, migrations: 12, rlsEnabled: 7, rlsMissing: 1 },
    auth: { enabled: true, providers: ['email'] },
    storage: { buckets: 2 },
    functions: { deployed: 3 },
    secrets: { configured: 4, missing: ['PAYMENT_WEBHOOK_SECRET'] },
    simulated: true
  };
  return { success: true, operation, message: 'Ação preparada em modo de desenvolvimento.', simulated: true };
}

async function request(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `Supabase retornou ${response.status}.`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao comunicar com a integração Supabase.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function beginSupabaseConnection() {
  const settings = await getSupabaseSettings();
  if (settings.simulatorEnabled) return simulate('connect');
  if (!settings.enabled) throw new Error('A integração Supabase ainda não foi configurada.');
  return request(`${String(settings.baseUrl).replace(/\/+$/, '')}${settings.connectPath}`, { method: 'POST' }, settings.timeoutMs);
}

export async function fetchSupabaseProjects() {
  const settings = await getSupabaseSettings();
  if (settings.simulatorEnabled) return simulate('projects');
  return request(`${String(settings.baseUrl).replace(/\/+$/, '')}${settings.projectsPath}`, {}, settings.timeoutMs);
}

export async function inspectSupabaseProject(project) {
  const settings = await getSupabaseSettings();
  if (settings.simulatorEnabled) return simulate('inspect', { project });
  const path = settings.inspectPath.replace('{ref}', encodeURIComponent(project.ref));
  return request(`${String(settings.baseUrl).replace(/\/+$/, '')}${path}`, {}, settings.timeoutMs);
}

export async function runSupabaseAction(project, action, payload = {}) {
  const settings = await getSupabaseSettings();
  if (settings.simulatorEnabled) return simulate(action, { project, payload });
  const path = settings.actionPath.replace('{ref}', encodeURIComponent(project.ref));
  return request(`${String(settings.baseUrl).replace(/\/+$/, '')}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload })
  }, settings.timeoutMs);
}
