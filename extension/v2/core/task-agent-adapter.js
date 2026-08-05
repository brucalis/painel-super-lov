const SETTINGS_KEY = 'slv2_task_agent_settings';
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  baseUrl: 'https://painel-super-lov.lovable.app',
  createTaskPath: '/api/editor/tasks',
  taskStatusPath: '/api/editor/tasks/{id}',
  timeoutMs: 20000,
  simulatorEnabled: true
});

function getStored() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[SETTINGS_KEY] || null);
    });
  });
}

export async function getTaskAgentSettings() {
  return { ...DEFAULT_SETTINGS, ...((await getStored()) || {}) };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateTask(task) {
  await wait(350);
  return {
    remoteTaskId: `sim-${task.id}`,
    status: 'awaiting_confirmation',
    plan: {
      summary: 'Analisar o pedido, localizar os arquivos relacionados e aplicar a alteração com validação antes do commit.',
      steps: [
        'Ler a estrutura do repositório selecionado.',
        'Localizar os arquivos diretamente relacionados ao pedido.',
        'Preparar alterações mínimas e reversíveis.',
        'Executar validações de sintaxe e build.',
        'Criar commit somente após confirmação.'
      ],
      estimatedFiles: 3,
      riskLevel: 'low'
    },
    message: 'Plano criado em modo de desenvolvimento.'
  };
}

async function request(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Super-Lovable-Client': 'chrome-extension-v2' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `Servidor retornou ${response.status}.`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao criar a tarefa.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function createRemoteTask(task) {
  const settings = await getTaskAgentSettings();
  if (settings.simulatorEnabled) return simulateTask(task);
  if (!settings.enabled) throw new Error('O agente de edição ainda não foi configurado.');
  const base = String(settings.baseUrl || '').replace(/\/+$/, '');
  return request(`${base}${settings.createTaskPath}`, task, settings.timeoutMs);
}
