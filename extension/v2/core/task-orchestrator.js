import { createTask, TASK_STATUS, validateTask } from './task-contracts.js';
import { saveTask, updateTask, setActiveTask } from './task-store.js';
import { createRemoteTask } from './task-agent-adapter.js';

export class TaskOrchestrator {
  constructor({ getProjectContext } = {}) {
    if (typeof getProjectContext !== 'function') {
      throw new TypeError('getProjectContext é obrigatório.');
    }
    this.getProjectContext = getProjectContext;
    this.running = false;
  }

  async createDraft({ prompt, improvedPrompt = null, source = 'text', attachments = [] } = {}) {
    const context = await this.getProjectContext();
    if (!context?.repository?.fullName || !context?.branch) {
      throw new Error('Selecione um repositório e uma branch antes de continuar.');
    }

    const task = createTask({
      projectId: context.projectId || context.repository.id || context.repository.fullName,
      repository: context.repository.fullName,
      branch: context.branch,
      prompt,
      improvedPrompt,
      source,
      attachments
    });

    const check = validateTask(task);
    if (!check.valid) throw new Error(check.errors.join(' '));
    await saveTask(task);
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

      const result = await createRemoteTask({
        id: current.id,
        repository: current.repository,
        branch: current.branch,
        prompt: current.improvedPrompt || current.prompt,
        originalPrompt: current.prompt,
        attachments: current.attachments,
        delivery: current.delivery,
        projectId: current.projectId
      });

      return updateTask(task.id, TASK_STATUS.AWAITING_CONFIRMATION, {
        remoteTaskId: result.remoteTaskId || null,
        plan: result.plan || null,
        riskLevel: result.plan?.riskLevel || current.riskLevel,
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
}
