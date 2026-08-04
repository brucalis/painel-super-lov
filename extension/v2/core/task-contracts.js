// Super Lovable v2 — contratos compartilhados do motor de tarefas.
// Este módulo ainda não está conectado à extensão atual.

export const TASK_STATUS = Object.freeze({
  DRAFT: 'draft',
  QUEUED: 'queued',
  AUTHORIZING: 'authorizing',
  READING_REPOSITORY: 'reading_repository',
  PLANNING: 'planning',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  EDITING: 'editing',
  VALIDATING: 'validating',
  COMMITTING: 'committing',
  SYNCING: 'syncing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ROLLED_BACK: 'rolled_back',
});

export const TASK_SOURCE = Object.freeze({
  TEXT: 'text',
  AUDIO: 'audio',
  SHORTCUT: 'shortcut',
  TOOL: 'tool',
});

export const CHANGE_DELIVERY = Object.freeze({
  COMMIT: 'commit',
  PULL_REQUEST: 'pull_request',
  PREVIEW_ONLY: 'preview_only',
});

export const RISK_LEVEL = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

export function createTask(input = {}) {
  const now = new Date().toISOString();

  return {
    id: input.id || crypto.randomUUID(),
    projectId: input.projectId || null,
    repository: input.repository || null,
    branch: input.branch || null,
    prompt: String(input.prompt || '').trim(),
    improvedPrompt: input.improvedPrompt || null,
    source: input.source || TASK_SOURCE.TEXT,
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    status: TASK_STATUS.DRAFT,
    riskLevel: input.riskLevel || RISK_LEVEL.LOW,
    delivery: input.delivery || CHANGE_DELIVERY.COMMIT,
    plan: null,
    changedFiles: [],
    commitSha: null,
    pullRequestUrl: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function transitionTask(task, nextStatus, patch = {}) {
  if (!task || !task.id) {
    throw new TypeError('Uma tarefa válida é obrigatória.');
  }

  if (!Object.values(TASK_STATUS).includes(nextStatus)) {
    throw new TypeError(`Estado de tarefa inválido: ${nextStatus}`);
  }

  const next = {
    ...task,
    ...patch,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  if (nextStatus === TASK_STATUS.COMPLETED) {
    next.completedAt = next.updatedAt;
  }

  return next;
}

export function validateTask(task) {
  const errors = [];

  if (!task?.id) errors.push('Tarefa sem identificador.');
  if (!task?.prompt) errors.push('O comando não pode estar vazio.');
  if (!task?.repository) errors.push('Nenhum repositório foi associado.');
  if (!Object.values(TASK_STATUS).includes(task?.status)) {
    errors.push('Estado de tarefa inválido.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
