import { createTask, TASK_STATUS, validateTask } from './task-contracts.js';
import { getTask, saveTask, updateTask, setActiveTask } from './task-store.js';
import { createRemoteTask } from './task-agent-adapter.js';
import { executeRemoteTask, rollbackRemoteTask } from './task-execution-adapter.js';
import { clearStagedAttachments, getStagedAttachments } from './attachment-store.js';
import { compileProjectMemory, getProjectMemory } from './project-memory-store.js';

function sameProject(task, context) {
  return Boolean(
    task?.repository &&
    task?.branch &&
    context?.repository?.fullName === task.repository &&
    context?.branch === task.branch
  );
}

export class TaskOrchestrator {
  constructor({ getProjectContext } = {}) {
    if (typeof getProjectContext !== 'function') {
      throw new TypeError('getProjectContext é obrigatório.');
    }
    this.getProjectContext = getProjectContext;
    this.running = false;
  }

  async createDraft({ prompt, improvedPrompt = null, source = 'text', attachments = null } = {}) {
    const context = await this.getProjectContext();
    if (!context?.repository?.fullName || !context?.branch) {
      throw new Error('Selecione um repositório e uma branch antes de continuar.');
    }

    const taskAttachments = Array.isArray(attachments) ? attachments : await getStagedAttachments();
    const task = createTask({
      projectId: context.projectId || context.repository.id || context.repository.fullName,
      repository: context.repository.fullName,
      branch: context.branch,
      prompt,
      improvedPrompt,
      source,
      attachments: taskAttachments
    });

    const check = validateTask(task);
    if (!check.valid) throw new Error(check.errors.join(' '));
    await saveTask(task);
    if (taskAttachments.length) await clearStagedAttachments();
    globalThis.dispatchEvent(new CustomEvent('superlovable:attachments-consumed', { detail: { taskId: task.id } }));
    return task;
  }

  async plan(task) {
    if (this.running) throw new Error('Já existe uma tarefa sendo planejada.');
    this.running = true;
    await setActiveTask(task.id);

    try {
      let current = await updateTask(task.id, TASK_STATUS.QUEUED);
      current = await updateTask(task.id, TASK_STATUS.READING_REPOSITORY);
      current = await updateTask(task.id, TASK_STATUS.PLANNING);
      const memory = compileProjectMemory(await getProjectMemory(current.repository, current.branch));

      const result = await createRemoteTask({
        id: current.id,
        repository: current.repository,
        branch: current.branch,
        prompt: current.improvedPrompt || current.prompt,
        originalPrompt: current.prompt,
        attachments: current.attachments,
        delivery: current.delivery,
        projectId: current.projectId,
        projectMemory: memory
      });

      return updateTask(task.id, TASK_STATUS.AWAITING_CONFIRMATION, {
        remoteTaskId: result.remoteTaskId || null,
        plan: result.plan || null,
        riskLevel: result.plan?.riskLevel || current.riskLevel,
        projectMemorySnapshot: memory,
        message: result.message || null
      });
    } catch (error) {
      await updateTask(task.id, TASK_STATUS.FAILED, {
        error: { code: 'TASK_PLANNING_FAILED', message: error?.message || 'Falha ao planejar a alteração.' }
      });
      throw error;
    } finally {
      this.running = false;
      await setActiveTask(null);
    }
  }

  async execute(taskOrId) {
    if (this.running) throw new Error('Já existe uma tarefa em execução.');
    const task = typeof taskOrId === 'string' ? await getTask(taskOrId) : taskOrId;
    if (!task?.id) throw new Error('Tarefa não encontrada.');
    if (task.status !== TASK_STATUS.AWAITING_CONFIRMATION) {
      throw new Error('Esta tarefa não está aguardando confirmação.');
    }

    const context = await this.getProjectContext();
    if (!sameProject(task, context)) {
      throw new Error(`Projeto diferente do planejado. Volte para ${task.repository} · ${task.branch} antes de executar.`);
    }

    this.running = true;
    await setActiveTask(task.id);

    try {
      const result = await executeRemoteTask(task, {
        onProgress: async ({ status, message }) => {
          if (!Object.values(TASK_STATUS).includes(status)) return;
          await updateTask(task.id, status, { message });
        }
      });

      if (!result?.success) throw new Error(result?.message || 'O agente não concluiu a alteração.');

      return updateTask(task.id, TASK_STATUS.COMPLETED, {
        changedFiles: Array.isArray(result.changedFiles) ? result.changedFiles : [],
        commitSha: result.commitSha || null,
        commitUrl: result.commitUrl || null,
        validation: result.validation || null,
        message: result.message || 'Alteração concluída.'
      });
    } catch (error) {
      await updateTask(task.id, TASK_STATUS.FAILED, {
        error: { code: 'TASK_EXECUTION_FAILED', message: error?.message || 'Falha ao executar a alteração.' }
      });
      throw error;
    } finally {
      this.running = false;
      await setActiveTask(null);
    }
  }

  async rollback(taskOrId) {
    if (this.running) throw new Error('Já existe uma operação em andamento.');
    const task = typeof taskOrId === 'string' ? await getTask(taskOrId) : taskOrId;
    if (!task?.id) throw new Error('Tarefa não encontrada.');
    if (task.status !== TASK_STATUS.COMPLETED || !task.commitSha) {
      throw new Error('Somente tarefas concluídas com commit podem ser desfeitas.');
    }

    const context = await this.getProjectContext();
    if (!sameProject(task, context)) {
      throw new Error(`Selecione ${task.repository} · ${task.branch} para desfazer esta alteração.`);
    }

    this.running = true;
    await setActiveTask(task.id);
    try {
      const result = await rollbackRemoteTask(task, {
        onProgress: async ({ status, message }) => {
          if (!Object.values(TASK_STATUS).includes(status)) return;
          await updateTask(task.id, status, { message });
        }
      });

      if (!result?.success) throw new Error(result?.message || 'A reversão não foi concluída.');
      return updateTask(task.id, TASK_STATUS.ROLLED_BACK, {
        rollbackSha: result.rollbackSha || null,
        rollbackUrl: result.rollbackUrl || null,
        message: result.message || 'Alteração revertida.'
      });
    } catch (error) {
      await updateTask(task.id, TASK_STATUS.FAILED, {
        error: { code: 'TASK_ROLLBACK_FAILED', message: error?.message || 'Falha ao desfazer a alteração.' }
      });
      throw error;
    } finally {
      this.running = false;
      await setActiveTask(null);
    }
  }
}
