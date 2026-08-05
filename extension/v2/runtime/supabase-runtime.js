import { beginSupabaseConnection, disconnectSupabase, fetchSupabaseProjects, getSupabaseConnection, inspectSupabaseProject, runSupabaseAction, saveSupabaseConnection } from '../core/supabase-api-adapter.js';
const $ = selector => document.querySelector(selector);
let connection = await getSupabaseConnection();

function ensureCardIdentity() {
  const action = $('#supabaseAction');
  const card = action?.closest('.integration-card');
  if (card && !card.id) card.id = 'supabaseCard';
}

function renderProjects() {
  const select = $('#supabaseProjectSelect');
  if (!select) return;
  select.innerHTML = '<option value="">Selecione um projeto</option>';
  for (const project of connection.projects || []) {
    const option = document.createElement('option');
    option.value = project.ref;
    option.textContent = `${project.name} · ${project.region}`;
    option.selected = connection.selectedProject?.ref === project.ref;
    select.appendChild(option);
  }
  select.disabled = connection.status !== 'connected';
}

function renderConnection() {
  ensureCardIdentity();
  const connected = connection.status === 'connected';
  if ($('#supabaseStatusText')) $('#supabaseStatusText').textContent = connected ? `Conectado como ${connection.accountEmail || 'conta autorizada'}` : 'Não conectado';
  if ($('#supabaseAction')) $('#supabaseAction').textContent = connected ? 'Atualizar projetos' : 'Conectar Supabase';
  if ($('#disconnectSupabase')) $('#disconnectSupabase').hidden = !connected;
  if ($('#supabaseWorkspace')) $('#supabaseWorkspace').hidden = !connected;
  $('#supabaseCard')?.classList.toggle('supabase-connected', connected);
  renderProjects();
}

function renderInspection(result) {
  const target = $('#supabaseResult');
  if (!target) return;
  target.hidden = false;
  target.innerHTML = `<div class="supabase-summary-grid">
    <article><strong>${result.database?.tables ?? 0}</strong><span>Tabelas</span></article>
    <article><strong>${result.database?.migrations ?? 0}</strong><span>Migrations</span></article>
    <article><strong>${result.database?.rlsEnabled ?? 0}</strong><span>Com RLS</span></article>
    <article><strong>${result.functions?.deployed ?? 0}</strong><span>Edge Functions</span></article>
    <article><strong>${result.storage?.buckets ?? 0}</strong><span>Buckets</span></article>
    <article><strong>${result.secrets?.configured ?? 0}</strong><span>Secrets</span></article>
  </div>${result.database?.rlsMissing ? `<p class="supabase-warning">${result.database.rlsMissing} tabela(s) precisam de RLS.</p>` : ''}
  ${(result.secrets?.missing || []).length ? `<p class="supabase-warning">Secrets pendentes: ${result.secrets.missing.join(', ')}</p>` : ''}`;
}

async function connectOrRefresh() {
  const button = $('#supabaseAction');
  if (!button) return;
  button.disabled = true;
  try {
    if (connection.status !== 'connected') {
      const response = await beginSupabaseConnection();
      if (response.authorizationUrl) {
        await chrome.tabs.create({ url: response.authorizationUrl });
        $('#supabaseStatusText').textContent = 'Conclua a autorização e clique novamente para atualizar.';
        return;
      }
      connection = await saveSupabaseConnection({ status: response.status || 'connected', accountEmail: response.accountEmail || null, connectedAt: new Date().toISOString(), source: response.simulated ? 'simulator' : 'backend' });
    }
    const response = await fetchSupabaseProjects();
    connection = await saveSupabaseConnection({ projects: response.projects || [] });
    renderConnection();
  } catch (error) {
    if ($('#supabaseStatusText')) $('#supabaseStatusText').textContent = error.message;
  } finally { button.disabled = false; }
}

async function runAction(action) {
  const feedback = $('#supabaseFeedback');
  if (!connection.selectedProject) {
    if (feedback) feedback.textContent = 'Selecione um projeto Supabase.';
    return;
  }
  const sensitive = new Set(['apply_migration','update_rls','deploy_function','save_secret']);
  if (sensitive.has(action) && !confirm('Esta ação altera recursos do Supabase. Deseja continuar?')) return;
  if (feedback) feedback.textContent = 'Processando…';
  try {
    const result = action === 'inspect' ? await inspectSupabaseProject(connection.selectedProject) : await runSupabaseAction(connection.selectedProject, action);
    if (feedback) feedback.textContent = result.message || 'Ação concluída.';
    if (action === 'inspect') renderInspection(result);
  } catch (error) {
    if (feedback) feedback.textContent = error.message;
  }
}

$('#supabaseAction')?.addEventListener('click', connectOrRefresh);
$('#disconnectSupabase')?.addEventListener('click', async () => { connection = await disconnectSupabase(); renderConnection(); });
$('#supabaseProjectSelect')?.addEventListener('change', async event => {
  const project = (connection.projects || []).find(item => item.ref === event.target.value) || null;
  connection = await saveSupabaseConnection({ selectedProject: project });
  if ($('#supabaseFeedback')) $('#supabaseFeedback').textContent = project ? `${project.name} selecionado.` : 'Nenhum projeto selecionado.';
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-supabase-action]');
  if (button) void runAction(button.dataset.supabaseAction);
});

renderConnection();
