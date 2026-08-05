import { LicenseSessionManager, LICENSE_STATES } from '../core/license-session.js';
import { LicenseBootstrapController } from '../core/license-bootstrap-controller.js';
import { activateLicenseRemote, validateLicenseRemote } from '../core/license-api-adapter.js';
import { beginGithubConnection, disconnectGithubRemote, fetchGithubRepositories, fetchGithubStatus } from '../core/github-api-adapter.js';
import { disconnectGithub, getGithubConnection, hasWritableProject, saveGithubConnection } from '../core/github-connection.js';
import { getProjectContext, projectLabel, selectBranch, selectRepository } from '../core/project-context.js';
import { improvePromptLocally } from '../core/local-prompt-enhancer.js';
import { TaskOrchestrator } from '../core/task-orchestrator.js';
import { listTasks, removeTask } from '../core/task-store.js';
import { TASK_STATUS } from '../core/task-contracts.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const manager = new LicenseSessionManager({
  validateRemote: (payload) => payload.reason === 'activation' ? activateLicenseRemote(payload) : validateLicenseRemote(payload)
});
const controller = new LicenseBootstrapController({
  sessionManager: manager,
  root: document.body,
  loadingElement: $('[data-license-loading]'),
  mainElement: $('[data-license-main]'),
  gateElement: $('[data-license-gate]'),
  statusElement: $('#licenseStatus')
});
const taskOrchestrator = new TaskOrchestrator({ getProjectContext });

const VIEW_META = {
  create: ['CRIAR', 'O que você quer alterar?'], queue: ['FILA', 'Alterações aguardando execução'],
  history: ['HISTÓRICO', 'Tudo o que já foi alterado'], projects: ['PROJETOS', 'Escolha o repositório conectado'],
  tools: ['FERRAMENTAS', 'Ações técnicas do projeto'], integrations: ['INTEGRAÇÕES', 'Conecte os serviços necessários'],
  help: ['AJUDA', 'Orientações para cada configuração'], settings: ['CONFIGURAÇÕES', 'Preferências e acesso']
};
const FINISHED = new Set([TASK_STATUS.COMPLETED, TASK_STATUS.FAILED, TASK_STATUS.CANCELLED, TASK_STATUS.ROLLED_BACK]);
const STATUS_LABELS = {
  draft: 'Rascunho', queued: 'Na fila', authorizing: 'Autorizando', reading_repository: 'Lendo repositório',
  planning: 'Planejando', awaiting_confirmation: 'Aguardando confirmação', editing: 'Editando', validating: 'Validando',
  committing: 'Criando commit', syncing: 'Sincronizando', completed: 'Concluído', failed: 'Falhou', cancelled: 'Cancelado', rolled_back: 'Revertido'
};

let githubConnection = await getGithubConnection();
let projectContext = await getProjectContext();
let selectedMode = 'general';
let currentPlannedTask = null;

function isAllowed(session) {
  return [LICENSE_STATES.ACTIVE_CACHED, LICENSE_STATES.ACTIVE_VERIFIED, LICENSE_STATES.OFFLINE_GRACE].includes(session?.state);
}
function formatDate(value) {
  if (!value) return 'Sem prazo informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}
function shortDevice(value) {
  if (!value) return '—';
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}
function stateCopy(session) {
  const map = {
    [LICENSE_STATES.EXPIRED]: ['Licença expirada', 'Seu período de acesso terminou. Renove para continuar usando a extensão.'],
    [LICENSE_STATES.DEVICE_LIMIT]: ['Limite de dispositivos', 'Esta licença já atingiu o número máximo de dispositivos autorizados.'],
    [LICENSE_STATES.REVOKED]: ['Licença desativada', 'Esta licença foi desativada no painel administrativo.'],
    [LICENSE_STATES.ERROR]: ['Não foi possível validar', session?.message || 'Verifique sua conexão e tente novamente.'],
    [LICENSE_STATES.ACTIVATION_REQUIRED]: ['Ative seu acesso', session?.message || 'Informe a chave recebida na compra.']
  };
  return map[session?.state] || ['Ative seu acesso', session?.message || 'Informe sua chave.'];
}
function renderLicense(session) {
  if (!session) return;
  if (isAllowed(session)) {
    $('#licenseSummary').textContent = session.plan ? `${session.plan} ativo` : 'Licença ativa';
    $('#settingsPlan').textContent = session.plan || 'Ativo';
    $('#settingsExpiry').textContent = formatDate(session.expiresAt);
    $('#settingsDevice').textContent = shortDevice(session.deviceId);
    $('[data-license-main]').removeAttribute('aria-disabled');
    $('.workspace').setAttribute('aria-busy', 'false');
    return;
  }
  const [title, message] = stateCopy(session);
  $('#gateTitle').textContent = title;
  $('#gateMessage').textContent = message;
  $('#gateBadge').textContent = title;
  $('#licenseStatus').textContent = session.message || '';
  $('#licenseStatus').dataset.state = session.state || '';
  $('[data-license-main]').setAttribute('aria-disabled', 'true');
}
function activateView(name) {
  if (!isAllowed(window.__SLV2_LICENSE__)) return;
  $$('.nav-item[data-view]').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.panel-view').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
  const [eyebrow, title] = VIEW_META[name] || VIEW_META.create;
  $('#viewEyebrow').textContent = eyebrow;
  $('#viewTitle').textContent = title;
}

function renderRepositories() {
  const select = $('#repositorySelect');
  const selected = githubConnection.selectedRepository?.fullName || '';
  select.innerHTML = '<option value="">Selecione um repositório</option>';
  githubConnection.repositories.forEach((repository) => {
    const option = document.createElement('option');
    option.value = repository.fullName;
    option.textContent = `${repository.fullName}${repository.private ? ' · privado' : ''}${repository.permissions.write ? '' : ' · somente leitura'}`;
    option.disabled = !repository.permissions.write;
    option.selected = repository.fullName === selected;
    select.appendChild(option);
  });
}
function renderBranches(branches = []) {
  const select = $('#branchSelect');
  select.innerHTML = '<option value="">Selecione uma branch</option>';
  branches.forEach((branch) => {
    const option = document.createElement('option');
    option.value = branch;
    option.textContent = branch;
    option.selected = branch === githubConnection.selectedBranch;
    select.appendChild(option);
  });
  select.disabled = branches.length === 0;
}
function renderGithub() {
  const connected = githubConnection.status === 'connected';
  const writable = hasWritableProject(githubConnection);
  const label = projectLabel(projectContext);
  $('#githubStatusText').textContent = connected ? `Conectado como ${githubConnection.accountLogin}` : 'Não conectado';
  $('#githubAction').textContent = connected ? 'Atualizar acesso' : 'Conectar GitHub';
  $('#disconnectGithub').hidden = !connected;
  $('#connectionSummary').textContent = label;
  $('#projectState').textContent = writable ? `Projeto pronto: ${label}` : connected ? 'Escolha um repositório e uma branch com permissão de escrita.' : 'Conecte o GitHub para listar seus repositórios.';
  $('#projectSelector').innerHTML = writable ? `${githubConnection.selectedRepository.name} <span>⌄</span>` : 'Selecionar projeto <span>⌄</span>';
  $('#connectionDot').classList.toggle('connected', writable);
  ['planButton', 'taskInput', 'attachButton', 'recordButton', 'improveButton'].forEach((id) => { $(`#${id}`).disabled = !writable; });
  $('#composerCard').classList.toggle('is-disabled', !writable);
  $('#projectAlertTitle').textContent = writable ? 'Projeto conectado e pronto' : connected ? 'Selecione o projeto que deseja editar' : 'Conecte um projeto para começar';
  $('#projectAlertText').textContent = writable ? `As alterações serão preparadas para ${label}. Nenhum comando será enviado ao chat da Lovable.` : connected ? 'Escolha um repositório e uma branch com permissão de escrita.' : 'A Super Lovable fará as alterações no repositório autorizado e manterá o histórico de tudo.';
  $('#connectGithub').textContent = writable ? 'Trocar projeto' : connected ? 'Selecionar projeto' : 'Conectar GitHub';
  renderRepositories();
}
async function refreshGithubState({ loadRepositories = true } = {}) {
  const status = await fetchGithubStatus();
  githubConnection = await saveGithubConnection({ status: status.status || 'connected', accountLogin: status.accountLogin || status.login || null, accountName: status.accountName || status.name || null, installationId: status.installationId || null, connectedAt: githubConnection.connectedAt || new Date().toISOString(), source: status.simulated ? 'simulator' : 'backend' });
  if (loadRepositories) {
    const response = await fetchGithubRepositories();
    githubConnection = await saveGithubConnection({ repositories: response.repositories || [] });
  }
  projectContext = await getProjectContext();
  renderGithub();
}
async function connectGithub() {
  const button = $('#githubAction');
  button.disabled = true;
  try {
    const response = await beginGithubConnection();
    if (response.authorizationUrl) {
      await chrome.tabs.create({ url: response.authorizationUrl });
      $('#githubStatusText').textContent = 'Conclua a autorização na aba aberta e depois clique em Atualizar acesso.';
      return;
    }
    await refreshGithubState();
    activateView('projects');
  } catch (error) {
    $('#githubStatusText').textContent = error.message;
  } finally { button.disabled = false; }
}

function emptyTaskMarkup(text) {
  return `<div class="empty-state"><span>◇</span><strong>${text}</strong><p>As tarefas aparecerão aqui automaticamente.</p></div>`;
}
function taskCard(task) {
  const text = (task.improvedPrompt || task.prompt || '').slice(0, 150);
  const error = task.error?.message ? `<p class="task-error">${task.error.message}</p>` : '';
  return `<article class="task-card" data-task-id="${task.id}"><div class="task-card-top"><span class="task-status status-${task.status}">${STATUS_LABELS[task.status] || task.status}</span><time>${formatDate(task.updatedAt)}</time></div><strong>${text || 'Tarefa sem descrição'}</strong><p>${task.repository} · ${task.branch}</p>${error}<div class="task-actions"><button data-task-action="details">Detalhes</button>${FINISHED.has(task.status) ? '<button data-task-action="remove">Remover</button>' : ''}</div></article>`;
}
async function renderTasks() {
  const tasks = await listTasks();
  const active = tasks.filter((task) => !FINISHED.has(task.status));
  const finished = tasks.filter((task) => FINISHED.has(task.status));
  $('#queueCount').textContent = String(active.length);
  $('#recentTasks').innerHTML = tasks.length ? tasks.slice(0, 3).map(taskCard).join('') : emptyTaskMarkup('Nenhuma tarefa por aqui');
  $('#queueTasks').innerHTML = active.length ? active.map(taskCard).join('') : emptyTaskMarkup('A fila está vazia');
  $('#historyTasks').innerHTML = finished.length ? finished.map(taskCard).join('') : emptyTaskMarkup('Nenhuma tarefa finalizada');
}
function openPlan(task) {
  currentPlannedTask = task;
  const plan = task.plan || {};
  $('#planSummary').textContent = plan.summary || 'Plano preparado para revisão.';
  $('#planSteps').innerHTML = (plan.steps || []).map((step) => `<li>${step}</li>`).join('');
  $('#planRepository').textContent = `${task.repository} · ${task.branch}`;
  $('#planRisk').textContent = `Risco: ${plan.riskLevel || task.riskLevel || 'baixo'}`;
  $('#taskPlanDialog').showModal();
}
async function createAndPlanTask() {
  if (!hasWritableProject(githubConnection)) return activateView('projects');
  const input = $('#taskInput');
  const prompt = input.value.trim();
  if (!prompt) return input.focus();
  const button = $('#planButton');
  button.disabled = true;
  $('#taskFeedback').textContent = 'Criando e planejando a tarefa…';
  try {
    const draft = await taskOrchestrator.createDraft({ prompt, source: 'text' });
    await renderTasks();
    const planned = await taskOrchestrator.plan(draft);
    await renderTasks();
    openPlan(planned);
    $('#taskFeedback').textContent = 'Plano criado. Revise antes de aplicar.';
  } catch (error) {
    $('#taskFeedback').textContent = error.message;
  } finally { button.disabled = false; }
}

function wireInterface() {
  $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => activateView(button.dataset.view)));
  $$('.shortcut-strip button[data-shortcut]').forEach((button) => button.addEventListener('click', () => {
    selectedMode = button.dataset.mode || 'general';
    const input = $('#taskInput');
    const prefix = button.dataset.shortcut;
    input.value = input.value.trim() ? `${prefix}\n\n${input.value.trim()}` : prefix;
    input.focus();
  }));
  $('#improveButton').addEventListener('click', () => {
    const input = $('#taskInput');
    const result = improvePromptLocally(input.value, { mode: selectedMode });
    if (!result.original) return input.focus();
    input.value = result.improved;
    $('#taskFeedback').textContent = result.changed ? 'Prompt organizado. Revise antes de planejar.' : 'O prompt já estava estruturado.';
  });
  $('#planButton').addEventListener('click', createAndPlanTask);
  $('#connectGithub').addEventListener('click', () => githubConnection.status === 'connected' ? activateView('projects') : activateView('integrations'));
  $('#projectSelector').addEventListener('click', () => activateView('projects'));
  $('#githubAction').addEventListener('click', connectGithub);
  $('#refreshProjects').addEventListener('click', () => refreshGithubState());
  $('#disconnectGithub').addEventListener('click', async () => {
    await disconnectGithubRemote().catch(() => null);
    githubConnection = await disconnectGithub();
    projectContext = await getProjectContext();
    renderGithub();
  });
  $('#repositorySelect').addEventListener('change', async (event) => {
    const repository = githubConnection.repositories.find((item) => item.fullName === event.target.value);
    if (!repository) return;
    githubConnection = await selectRepository(repository);
    projectContext = await getProjectContext();
    const branches = [repository.defaultBranch, 'develop', 'staging'].filter((value, index, array) => value && array.indexOf(value) === index);
    renderBranches(branches);
    renderGithub();
  });
  $('#branchSelect').addEventListener('change', async (event) => {
    if (!event.target.value) return;
    githubConnection = await selectBranch(event.target.value);
    projectContext = await getProjectContext();
    renderGithub();
  });
  document.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-task-action]');
    if (!action) return;
    const card = action.closest('[data-task-id]');
    const tasks = await listTasks();
    const task = tasks.find((item) => item.id === card?.dataset.taskId);
    if (!task) return;
    if (action.dataset.taskAction === 'details') openPlan(task);
    if (action.dataset.taskAction === 'remove') { await removeTask(task.id); await renderTasks(); }
  });
  $('#taskPlanDialog').addEventListener('close', () => {
    if ($('#taskPlanDialog').returnValue === 'confirm' && currentPlannedTask) {
      $('#taskFeedback').textContent = 'Plano aprovado. A execução real será conectada na próxima etapa.';
    }
  });
}

async function validateNow() {
  const button = $('#validateLicenseNow');
  button.disabled = true;
  $('.workspace').setAttribute('aria-busy', 'true');
  try {
    const cached = await manager.readCachedSession();
    if (!cached?.licenseKey) {
      await manager.clearLocalSession();
      const session = await controller.start();
      window.__SLV2_LICENSE__ = session;
      renderLicense(session);
      return;
    }
    controller.setView('booting', { state: LICENSE_STATES.BOOTING });
    const session = await manager.verify(cached, { reason: 'manual' });
    window.__SLV2_LICENSE__ = session;
    if (isAllowed(session)) controller.setView('main', session); else controller.setView('activation', session);
    renderLicense(session);
  } finally {
    button.disabled = false;
    $('.workspace').setAttribute('aria-busy', 'false');
  }
}

$('#activateLicense').addEventListener('click', async () => {
  const button = $('#activateLicense');
  const key = $('#licenseKey').value.trim();
  if (!key) {
    $('#licenseStatus').textContent = 'Digite a chave de acesso.';
    $('#licenseStatus').dataset.state = 'error';
    return;
  }
  button.disabled = true;
  try {
    const session = await controller.activate(key);
    window.__SLV2_LICENSE__ = session;
    renderLicense(session);
  } finally { button.disabled = false; }
});
$('#validateLicenseNow').addEventListener('click', validateNow);
globalThis.addEventListener('superlovable:license-state', (event) => {
  if (!event.detail || event.detail.state === LICENSE_STATES.BOOTING) return;
  window.__SLV2_LICENSE__ = event.detail;
  renderLicense(event.detail);
});

wireInterface();
const initialSession = await controller.start();
window.__SLV2_LICENSE__ = initialSession;
renderLicense(initialSession);
renderGithub();
await renderTasks();
if (githubConnection.status === 'connected') await refreshGithubState().catch(() => renderGithub());
