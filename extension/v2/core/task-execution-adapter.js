const SETTINGS_KEY = 'slv2_task_execution_settings';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  simulatorEnabled: true,
  baseUrl: 'https://painel-super-lov.lovable.app',
  executePath: '/api/editor/tasks/{id}/execute',
  rollbackPath: '/api/editor/tasks/{id}/rollback',
  timeoutMs: 60000
});

function storageGet(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[key] || null);
    });
  });
}

export async function getTaskExecutionSettings() {
  return { ...DEFAULT_SETTINGS, ...((await storageGet(SETTINGS_KEY)) || {}) };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function simulatedSha(taskId, prefix = 'sim') {
  const raw = `${prefix}-${taskId}-${Date.now()}`;
  return Array.from(new TextEncoder().encode(raw))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40)
    .padEnd(40, '0');
}

async function simulateExecution(task, onProgress) {
  const steps = [
    ['editing', 'Aplicando as alterações planejadas…'],
    ['validating', 'Executando validações de sintaxe e build…'],
    ['committing', 'Criando commit no repositório…'],
    ['syncing', 'Aguardando sincronização do projeto…']
  ];

  for (const [status, message] of steps) {
    await wait(420);
    await onProgress?.({ status, message });
  }

  const commitSha = simulatedSha(task.id);
  return {
    success: true,
    status: 'completed',
    commitSha,
    commitUrl: `https://github.com/${task.repository}/commit/${commitSha}`,
    changedFiles: [
      { path: 'src/routes/index.tsx', action: 'modified', additions: 14, deletions: 3 },
      { path: 'src/components/ui/task-preview.tsx', action: 'added', additions: 38, deletions: 0 },
      { path: 'src/index.css', action: 'modified', additions: 9, deletions: 1 }
    ],
    validation: {
      syntax: 'passed',
      typecheck: 'passed',
      build: 'passed'
    },
    message: 'Alteração simulada, validada e registrada com sucesso.'
  };
}

async function simulateRollback(task, onProgress) {
  await onProgress?.({ status: 'committing', message: 'Preparando commit de reversão…' });
  await wait(450);
  await onProgress?.({ status: 'syncing', message: 'Aguardando sincronização da reversão…' });
  await wait(450);
  const rollbackSha = simulatedSha(task.id, 'rollback');
  return {
    success: true,
    status: 'rolled_back',
    rollbackSha,
    rollbackUrl: `https://github.com/${task.repository}/commit/${rollbackSha}`,
    message: 'Alteração revertida em modo de desenvolvimento.'
  };
}

async function request(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Super-Lovable-Client': 'chrome-extension-v2'
      },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `Servidor retornou ${response.status}.`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado durante a execução da tarefa.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function interpolate(path, id) {
  return String(path).replace('{id}', encodeURIComponent(id));
}

export async function executeRemoteTask(task, { onProgress } = {}) {
  const settings = await getTaskExecutionSettings();
  if (settings.simulatorEnabled) return simulateExecution(task, onProgress);
  if (!settings.enabled) throw new Error('O motor real de edição ainda não foi configurado.');
  const base = String(settings.baseUrl || '').replace(/\/+$/, '');
  return request(`${base}${interpolate(settings.executePath, task.remoteTaskId || task.id)}`, task, settings.timeoutMs);
}

export async function rollbackRemoteTask(task, { onProgress } = {}) {
  const settings = await getTaskExecutionSettings();
  if (settings.simulatorEnabled) return simulateRollback(task, onProgress);
  if (!settings.enabled) throw new Error('O motor real de reversão ainda não foi configurado.');
  const base = String(settings.baseUrl || '').replace(/\/+$/, '');
  return request(`${base}${interpolate(settings.rollbackPath, task.remoteTaskId || task.id)}`, {
    taskId: task.id,
    repository: task.repository,
    branch: task.branch,
    commitSha: task.commitSha
  }, settings.timeoutMs);
}
