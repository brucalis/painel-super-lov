import { getProjectContext, projectLabel } from '../core/project-context.js';
import { listTasks } from '../core/task-store.js';
import { TASK_STATUS } from '../core/task-contracts.js';
import { downloadProject, getPublishStatus, runBuildCheck, runSecurityScan, scanProjectBranding } from '../core/project-tools-adapter.js';

const $ = (selector, root = document) => root.querySelector(selector);

function ensureToolsUi() {
  const grid = $('#toolsGrid');
  if (!grid || grid.children.length) return;
  const tools = [
    ['toolDownload','↓','Baixar projeto','Gera o ZIP a partir do repositório selecionado.','Baixar ZIP'],
    ['toolBuild','✓','Verificar build','Valida dependências, TypeScript, lint e compilação.','Executar'],
    ['toolSecurity','◈','Analisar segurança','Procura segredos expostos e configurações frágeis.','Analisar'],
    ['toolFiles','≡','Arquivos alterados','Mostra arquivos registrados nas tarefas recentes.','Ver arquivos'],
    ['toolRollback','↶','Desfazer alteração','Cria um novo commit de reversão.','Localizar commit'],
    ['toolBranding','◇','Marcas do projeto','Separa marcas no código do badge oficial.','Analisar marcas'],
    ['toolPublish','↗','Publicação','Verifica sincronização e orienta a publicação.','Verificar']
  ];
  grid.innerHTML = tools.map(([id,icon,title,text,label]) => `<article class="tool-card"><div class="tool-card-head"><span>${icon}</span><div><h3>${title}</h3><p>${text}</p></div></div><button id="${id}">${label}</button></article>`).join('');
}

function setStatus(message, tone = 'neutral') {
  const node = $('#toolsStatus');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function renderResult(title, content) {
  const panel = $('#toolResult');
  if (!panel) return;
  panel.hidden = false;
  panel.innerHTML = `<div class="tool-result-heading"><strong>${title}</strong><button id="closeToolResult">×</button></div>${content}`;
  $('#closeToolResult')?.addEventListener('click', () => { panel.hidden = true; });
}

async function requireContext() {
  const context = await getProjectContext();
  if (!context?.repository?.fullName || !context?.branch) throw new Error('Selecione um projeto e uma branch antes de usar esta ferramenta.');
  return context;
}

async function run(button, operation) {
  button.disabled = true;
  setStatus('Executando…');
  try {
    const context = await requireContext();
    const result = await operation(context);
    setStatus(`Concluído em ${projectLabel(context)}.`, 'success');
    return result;
  } catch (error) {
    setStatus(error.message, 'error');
    throw error;
  } finally {
    button.disabled = false;
  }
}

function checks(items = []) {
  return `<ul class="tool-check-list">${items.map(item => `<li data-status="${item.status || 'info'}"><span>${item.status === 'passed' ? '✓' : '•'}</span><strong>${item.name || item.title || 'Verificação'}</strong>${item.detail ? `<small>${item.detail}</small>` : ''}</li>`).join('')}</ul>`;
}

ensureToolsUi();

$('#toolDownload')?.addEventListener('click', async (event) => {
  try {
    const result = await run(event.currentTarget, downloadProject);
    if (result.blob) {
      const url = URL.createObjectURL(result.blob);
      await chrome.downloads.download({ url, filename: result.filename, saveAs: true });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else if (result.downloadUrl) {
      await chrome.downloads.download({ url: result.downloadUrl, filename: result.filename, saveAs: true });
    }
    renderResult('Download preparado', '<p>O ZIP foi preparado a partir do repositório e da branch selecionados.</p>');
  } catch {}
});

$('#toolBuild')?.addEventListener('click', async (event) => {
  try { const result = await run(event.currentTarget, runBuildCheck); renderResult('Verificação do projeto', `${checks(result.checks)}<p>${result.message || ''}</p>`); } catch {}
});

$('#toolSecurity')?.addEventListener('click', async (event) => {
  try { const result = await run(event.currentTarget, runSecurityScan); renderResult('Análise de segurança', `<div class="security-score">${result.score ?? '—'}<small>/100</small></div>${checks(result.findings)}`); } catch {}
});

$('#toolFiles')?.addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  try {
    const context = await requireContext();
    const tasks = (await listTasks()).filter(task => task.repository === context.repository.fullName && task.branch === context.branch && task.changedFiles?.length);
    const files = [...new Map(tasks.flatMap(task => task.changedFiles.map(file => [file.path || file.file, { ...file, commitSha: task.commitSha }])).filter(([path]) => path)).values()];
    renderResult('Arquivos alterados', files.length ? `<ul class="changed-file-list">${files.map(file => `<li><strong>${file.path || file.file}</strong><small>${file.commitSha ? `Commit ${file.commitSha.slice(0,7)}` : 'Sem commit'}</small></li>`).join('')}</ul>` : '<p>Nenhum arquivo alterado foi registrado.</p>');
  } catch (error) { setStatus(error.message, 'error'); } finally { event.currentTarget.disabled = false; }
});

$('#toolRollback')?.addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  try {
    const context = await requireContext();
    const latest = (await listTasks()).find(task => task.repository === context.repository.fullName && task.branch === context.branch && task.status === TASK_STATUS.COMPLETED && task.commitSha);
    if (!latest) throw new Error('Não existe alteração concluída para desfazer.');
    renderResult('Desfazer última alteração', `<p>Commit disponível: <strong>${latest.commitSha.slice(0,7)}</strong></p><button class="primary-action" data-rollback-task="${latest.id}">Desfazer com segurança</button>`);
  } catch (error) { setStatus(error.message, 'error'); } finally { event.currentTarget.disabled = false; }
});

$('#toolBranding')?.addEventListener('click', async (event) => {
  try {
    const result = await run(event.currentTarget, scanProjectBranding);
    const items = result.codeControlled || [];
    renderResult('Marcas encontradas', `${items.length ? `<ul class="changed-file-list">${items.map(item => `<li><strong>${item.match}</strong><small>${item.file}</small></li>`).join('')}</ul>` : '<p>Nenhuma marca controlada pelo código foi encontrada.</p>'}${result.platformControlled?.detected ? `<div class="platform-guidance"><strong>${result.platformControlled.label}</strong><p>${result.platformControlled.guidance}</p></div>` : ''}`);
  } catch {}
});

$('#toolPublish')?.addEventListener('click', async (event) => {
  try { const result = await run(event.currentTarget, getPublishStatus); renderResult('Publicação', `<p><strong>${result.codeSynced ? 'Código sincronizado' : 'Sincronização pendente'}</strong></p><p>${result.guidance || ''}</p>`); } catch {}
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-rollback-task]');
  if (!button) return;
  window.dispatchEvent(new CustomEvent('superlovable:rollback-request', { detail: { taskId: button.dataset.rollbackTask } }));
  const panel = $('#toolResult');
  if (panel) panel.hidden = true;
});
