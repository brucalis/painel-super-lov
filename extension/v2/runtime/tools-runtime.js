import { getProjectContext, projectLabel } from '../core/project-context.js';
import { listTasks } from '../core/task-store.js';
import { TASK_STATUS } from '../core/task-contracts.js';
import {
  downloadProject,
  getPublishStatus,
  runBuildCheck,
  runSecurityScan,
  scanProjectBranding
} from '../core/project-tools-adapter.js';

const $ = (selector, root = document) => root.querySelector(selector);

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
  panel.innerHTML = `<div class="tool-result-heading"><strong>${title}</strong><button id="closeToolResult" aria-label="Fechar">×</button></div>${content}`;
  $('#closeToolResult')?.addEventListener('click', () => { panel.hidden = true; });
}

function checkList(items = []) {
  return `<ul class="tool-check-list">${items.map((item) => `<li data-status="${item.status || 'info'}"><span>${item.status === 'passed' ? '✓' : '•'}</span><strong>${item.name || item.title}</strong>${item.detail ? `<small>${item.detail}</small>` : ''}</li>`).join('')}</ul>`;
}

async function requireContext() {
  const context = await getProjectContext();
  if (!context?.repository?.fullName || !context?.branch) {
    throw new Error('Selecione um projeto e uma branch antes de usar esta ferramenta.');
  }
  return context;
}

async function runTool(button, action) {
  button.disabled = true;
  setStatus('Executando ferramenta…');
  try {
    const context = await requireContext();
    const result = await action(context);
    setStatus(`Concluído em ${projectLabel(context)}.`, 'success');
    return { context, result };
  } catch (error) {
    setStatus(error.message, 'error');
    throw error;
  } finally {
    button.disabled = false;
  }
}

$('#toolDownload')?.addEventListener('click', async (event) => {
  try {
    const { result } = await runTool(event.currentTarget, downloadProject);
    if (result.blob) {
      const url = URL.createObjectURL(result.blob);
      await chrome.downloads.download({ url, filename: result.filename, saveAs: true });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else if (result.downloadUrl) {
      await chrome.downloads.download({ url: result.downloadUrl, filename: result.filename, saveAs: true });
    }
    renderResult('Download preparado', '<p>O arquivo ZIP foi preparado a partir do repositório e da branch selecionados.</p>');
  } catch {}
});

$('#toolBuild')?.addEventListener('click', async (event) => {
  try {
    const { result } = await runTool(event.currentTarget, runBuildCheck);
    renderResult('Verificação do projeto', `${checkList(result.checks)}<p>${result.message || ''}</p>`);
  } catch {}
});

$('#toolSecurity')?.addEventListener('click', async (event) => {
  try {
    const { result } = await runTool(event.currentTarget, runSecurityScan);
    renderResult('Análise de segurança', `<div class="security-score">${result.score ?? '—'}<small>/100</small></div>${checkList(result.findings)}`);
  } catch {}
});

$('#toolFiles')?.addEventListener('click', async (event) => {
  try {
    event.currentTarget.disabled = true;
    const context = await requireContext();
    const tasks = (await listTasks()).filter((task) => task.repository === context.repository.fullName && task.branch === context.branch && Array.isArray(task.changedFiles) && task.changedFiles.length);
    const files = tasks.flatMap((task) => task.changedFiles.map((file) => ({ ...file, taskId: task.id, commitSha: task.commitSha })));
    const unique = [...new Map(files.map((file) => [file.path || file.file, file])).values()];
    renderResult('Arquivos alterados', unique.length ? `<ul class="changed-file-list">${unique.map((file) => `<li><strong>${file.path || file.file}</strong><small>${file.commitSha ? `Commit ${file.commitSha.slice(0, 7)}` : 'Sem commit'}</small></li>`).join('')}</ul>` : '<p>Nenhum arquivo alterado foi registrado para este projeto.</p>');
    setStatus('Histórico de arquivos carregado.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    event.currentTarget.disabled = false;
  }
});

$('#toolRollback')?.addEventListener('click', async (event) => {
  try {
    event.currentTarget.disabled = true;
    const context = await requireContext();
    const tasks = await listTasks();
    const latest = tasks.find((task) => task.repository === context.repository.fullName && task.branch === context.branch && task.status === TASK_STATUS.COMPLETED && task.commitSha);
    if (!latest) throw new Error('Não existe uma alteração concluída disponível para desfazer neste projeto.');
    renderResult('Desfazer última alteração', `<p>Último commit disponível: <strong>${latest.commitSha.slice(0, 7)}</strong>.</p><button class="primary-action" data-rollback-task="${latest.id}">Desfazer com segurança</button><p class="tool-note">A reversão cria um novo commit e preserva o histórico.</p>`);
    setStatus('Alteração encontrada. Confirme no painel.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    event.currentTarget.disabled = false;
  }
});

$('#toolBranding')?.addEventListener('click', async (event) => {
  try {
    const { result } = await runTool(event.currentTarget, scanProjectBranding);
    const codeItems = result.codeControlled || [];
    renderResult('Marcas encontradas', `${codeItems.length ? `<h3>Presentes no código</h3><ul class="changed-file-list">${codeItems.map((item) => `<li><strong>${item.match}</strong><small>${item.file} · pode ser removida por edição do código</small></li>`).join('')}</ul>` : '<p>Nenhuma marca controlada pelo código foi encontrada.</p>'}${result.platformControlled?.detected ? `<div class="platform-guidance"><strong>${result.platformControlled.label}</strong><p>${result.platformControlled.guidance}</p><small>Esse item não será ocultado por CSS nem contornado pela extensão.</small></div>` : ''}`);
  } catch {}
});

$('#toolPublish')?.addEventListener('click', async (event) => {
  try {
    const { result } = await runTool(event.currentTarget, getPublishStatus);
    renderResult('Publicação do projeto', `<div class="publish-status"><span class="status-dot ${result.codeSynced ? 'ok' : ''}"></span><strong>${result.codeSynced ? 'Código sincronizado' : 'Sincronização pendente'}</strong></div><p>${result.guidance || ''}</p><p class="tool-note">A extensão não enviará mensagens ao agente da Lovable para publicar.</p>`);
  } catch {}
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-rollback-task]');
  if (!button) return;
  window.dispatchEvent(new CustomEvent('superlovable:rollback-request', { detail: { taskId: button.dataset.rollbackTask } }));
  $('#toolResult').hidden = true;
});
