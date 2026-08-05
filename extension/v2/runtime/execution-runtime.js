import { TaskOrchestrator } from '../core/task-orchestrator.js';
import { getProjectContext } from '../core/project-context.js';
import { getTask, listTasks } from '../core/task-store.js';
import { TASK_STATUS } from '../core/task-contracts.js';

const orchestrator = new TaskOrchestrator({ getProjectContext });
const STATUS_LABELS = {
  editing: 'Editando arquivos',
  validating: 'Validando projeto',
  committing: 'Criando commit',
  syncing: 'Sincronizando com a Lovable',
  completed: 'Alteração concluída',
  failed: 'Falha na execução',
  rolled_back: 'Alteração desfeita'
};

function ensureExecutionDialog() {
  let dialog = document.querySelector('#executionDialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'executionDialog';
  dialog.className = 'task-dialog execution-dialog';
  dialog.innerHTML = `
    <div class="execution-body">
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">EXECUÇÃO</p>
          <h2 id="executionTitle">Preparando alteração</h2>
        </div>
        <button class="dialog-close" id="executionClose" aria-label="Fechar" disabled>×</button>
      </div>
      <p id="executionMessage">Validando o projeto selecionado…</p>
      <div class="execution-progress" aria-hidden="true"><span id="executionProgressBar"></span></div>
      <ol class="execution-steps" id="executionSteps">
        <li data-step="editing">Editar arquivos</li>
        <li data-step="validating">Validar sintaxe e build</li>
        <li data-step="committing">Criar commit</li>
        <li data-step="syncing">Sincronizar projeto</li>
      </ol>
      <section class="execution-result" id="executionResult" hidden></section>
    </div>`;
  document.body.appendChild(dialog);
  dialog.querySelector('#executionClose').addEventListener('click', () => dialog.close());
  return dialog;
}

function setExecutionState(status, message) {
  const dialog = ensureExecutionDialog();
  const order = ['editing', 'validating', 'committing', 'syncing'];
  const index = order.indexOf(status);
  dialog.querySelector('#executionTitle').textContent = STATUS_LABELS[status] || 'Executando alteração';
  dialog.querySelector('#executionMessage').textContent = message || STATUS_LABELS[status] || '';
  dialog.querySelector('#executionProgressBar').style.width = `${index < 0 ? 100 : ((index + 1) / order.length) * 100}%`;
  dialog.querySelectorAll('[data-step]').forEach((item, itemIndex) => {
    item.classList.toggle('active', item.dataset.step === status);
    item.classList.toggle('done', index >= 0 && itemIndex < index);
  });
}

function showExecutionResult(task) {
  const dialog = ensureExecutionDialog();
  const result = dialog.querySelector('#executionResult');
  const validation = task.validation || {};
  const files = Array.isArray(task.changedFiles) ? task.changedFiles : [];
  result.hidden = false;
  result.innerHTML = `
    <strong>${task.status === TASK_STATUS.COMPLETED ? 'Alteração aplicada com sucesso' : 'Operação finalizada'}</strong>
    <p>${task.message || ''}</p>
    ${task.commitSha ? `<p><b>Commit:</b> ${task.commitSha.slice(0, 10)}</p>` : ''}
    <div class="validation-grid">
      <span class="${validation.syntax === 'passed' ? 'passed' : ''}">Sintaxe</span>
      <span class="${validation.typecheck === 'passed' ? 'passed' : ''}">TypeScript</span>
      <span class="${validation.build === 'passed' ? 'passed' : ''}">Build</span>
    </div>
    ${files.length ? `<details><summary>${files.length} arquivo(s) alterado(s)</summary><ul>${files.map((file) => `<li>${file.path} · ${file.action}</li>`).join('')}</ul></details>` : ''}
    ${task.commitUrl ? `<button class="quiet-action" id="openCommit">Ver commit</button>` : ''}`;

  const openCommit = result.querySelector('#openCommit');
  if (openCommit) openCommit.addEventListener('click', () => chrome.tabs.create({ url: task.commitUrl }));
  dialog.querySelector('#executionClose').disabled = false;
}

async function executeLatestApprovedTask() {
  const tasks = await listTasks();
  const task = tasks.find((item) => item.status === TASK_STATUS.AWAITING_CONFIRMATION);
  if (!task) return;

  const dialog = ensureExecutionDialog();
  dialog.querySelector('#executionResult').hidden = true;
  dialog.querySelector('#executionClose').disabled = true;
  if (!dialog.open) dialog.showModal();
  setExecutionState('editing', 'Confirmando o repositório e iniciando a edição…');

  try {
    const completed = await orchestrator.execute(task);
    setExecutionState('completed', completed.message || 'Alteração concluída.');
    showExecutionResult(completed);
    const feedback = document.querySelector('#taskFeedback');
    if (feedback) feedback.textContent = 'Alteração concluída e commit criado.';
  } catch (error) {
    setExecutionState('failed', error.message);
    dialog.querySelector('#executionClose').disabled = false;
    const result = dialog.querySelector('#executionResult');
    result.hidden = false;
    result.innerHTML = `<strong>Não foi possível concluir</strong><p>${error.message}</p>`;
  }
}

async function decorateTaskCards() {
  const tasks = await listTasks();
  document.querySelectorAll('[data-task-id]').forEach((card) => {
    const task = tasks.find((item) => item.id === card.dataset.taskId);
    if (!task) return;
    const actions = card.querySelector('.task-actions');
    if (!actions) return;

    if (task.status === TASK_STATUS.COMPLETED && task.commitSha && !actions.querySelector('[data-task-action="rollback"]')) {
      const rollback = document.createElement('button');
      rollback.dataset.taskAction = 'rollback';
      rollback.textContent = 'Desfazer';
      rollback.className = 'danger-text';
      actions.prepend(rollback);
    }

    if (task.commitUrl && !actions.querySelector('[data-task-action="commit"]')) {
      const commit = document.createElement('button');
      commit.dataset.taskAction = 'commit';
      commit.textContent = 'Commit';
      actions.prepend(commit);
    }
  });
}

async function rollbackTask(task) {
  const confirmed = globalThis.confirm('Desfazer esta alteração criando um novo commit de reversão?');
  if (!confirmed) return;

  const dialog = ensureExecutionDialog();
  dialog.querySelector('#executionResult').hidden = true;
  dialog.querySelector('#executionClose').disabled = true;
  if (!dialog.open) dialog.showModal();
  setExecutionState('committing', 'Preparando a reversão da alteração…');

  try {
    const reverted = await orchestrator.rollback(task);
    setExecutionState('rolled_back', reverted.message || 'Alteração desfeita.');
    const result = dialog.querySelector('#executionResult');
    result.hidden = false;
    result.innerHTML = `<strong>Alteração desfeita</strong><p>${reverted.message || ''}</p>${reverted.rollbackSha ? `<p><b>Commit de reversão:</b> ${reverted.rollbackSha.slice(0, 10)}</p>` : ''}`;
    dialog.querySelector('#executionClose').disabled = false;
  } catch (error) {
    setExecutionState('failed', error.message);
    dialog.querySelector('#executionClose').disabled = false;
  }
}

const planDialog = document.querySelector('#taskPlanDialog');
planDialog?.addEventListener('close', () => {
  if (planDialog.returnValue === 'confirm') void executeLatestApprovedTask();
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-task-action="rollback"], [data-task-action="commit"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const card = button.closest('[data-task-id]');
  const task = await getTask(card?.dataset.taskId);
  if (!task) return;
  if (button.dataset.taskAction === 'commit' && task.commitUrl) {
    await chrome.tabs.create({ url: task.commitUrl });
    return;
  }
  if (button.dataset.taskAction === 'rollback') await rollbackTask(task);
}, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.slv2_task_store) return;
  const tasks = changes.slv2_task_store.newValue?.tasks || [];
  const activeId = changes.slv2_task_store.newValue?.activeTaskId;
  const active = tasks.find((item) => item.id === activeId);
  if (active) setExecutionState(active.status, active.message);
  queueMicrotask(decorateTaskCards);
});

const observer = new MutationObserver(() => queueMicrotask(decorateTaskCards));
observer.observe(document.body, { childList: true, subtree: true });
void decorateTaskCards();
