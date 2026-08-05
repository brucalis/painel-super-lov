import {
  beginSupabaseConnection,
  disconnectSupabase,
  fetchSupabaseProjects,
  getSupabaseConnection,
  inspectSupabaseProject,
  runSupabaseAction,
  saveSupabaseConnection
} from '../core/supabase-api-adapter.js';

const $ = (selector) => document.querySelector(selector);

function injectSupabaseUi() {
  if (!document.querySelector('link[href="supabase.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'supabase.css';
    document.head.appendChild(link);
  }

  const integrations = document.querySelector('[data-panel="integrations"] .integration-grid');
  if (!integrations || $('#supabaseAction')) return;

  const oldCard = [...integrations.querySelectorAll('.integration-card')].find((card) => card.textContent.includes('Supabase'));
  if (oldCard) oldCard.remove();

  integrations.insertAdjacentHTML('beforeend', `
    <article class="integration-card" id="supabaseCard">
      <div><span class="service-icon">SB</span><div><h2>Supabase</h2><p id="supabaseStatusText">Não conectado</p></div></div>
      <button class="primary-action" id="supabaseAction">Conectar Supabase</button>
      <button class="quiet-action danger-text" id="disconnectSupabase" hidden>Desconectar</button>
    </article>
    <section class="supabase-workspace" id="supabaseWorkspace" hidden>
      <div class="section-heading"><div><p class="eyebrow">BACKEND</p><h2>Projeto Supabase</h2></div></div>
      <div class="supabase-toolbar">
        <label class="field-label">Projeto<select id="supabaseProjectSelect"><option value="">Selecione um projeto</option></select></label>
        <button class="quiet-action" data-supabase-action="inspect">Inspecionar</button>
      </div>
      <div class="supabase-actions">
        <button data-supabase-action="prepare_migration"><strong>Migrations</strong><small>Preparar alterações de banco</small></button>
        <button data-supabase-action="update_rls"><strong>Políticas RLS</strong><small>Revisar e aplicar acesso seguro</small></button>
        <button data-supabase-action="configure_auth"><strong>Autenticação</strong><small>Login, cadastro e provedores</small></button>
        <button data-supabase-action="configure_storage"><strong>Storage</strong><small>Buckets e regras de arquivos</small></button>
        <button data-supabase-action="deploy_function"><strong>Edge Functions</strong><small>Endpoints e webhooks</small></button>
        <button data-supabase-action="save_secret"><strong>Secrets</strong><small>Credenciais fora do código</small></button>
      </div>
      <p class="supabase-feedback" id="supabaseFeedback" role="status"></p>
      <section class="supabase-result" id="supabaseResult" hidden></section>
    </section>`);
}

injectSupabaseUi();
let connection = await getSupabaseConnection();

function renderProjects() {
  const select = $('#supabaseProjectSelect');
  if (!select) return;
  select.innerHTML = '<option value="">Selecione um projeto</option>';
  connection.projects.forEach((project) => {
    const option = document.createElement('option');
    option.value = project.ref;
    option.textContent = `${project.name} · ${project.region}`;
    option.selected = connection.selectedProject?.ref === project.ref;
    select.appendChild(option);
  });
  select.disabled = connection.status !== 'connected';
}

function renderConnection() {
  const connected = connection.status === 'connected';
  $('#supabaseStatusText').textContent = connected ? `Conectado como ${connection.accountEmail || 'conta autorizada'}` : 'Não conectado';
  $('#supabaseAction').textContent = connected ? 'Atualizar projetos' : 'Conectar Supabase';
  $('#disconnectSupabase').hidden = !connected;
  $('#supabaseWorkspace').hidden = !connected;
  $('#supabaseCard').classList.toggle('supabase-connected', connected);
  renderProjects();
}

function renderInspection(result) {
  const target = $('#supabaseResult');
  target.hidden = false;
  target.innerHTML = `
    <div class="supabase-summary-grid">
      <article><strong>${result.database?.tables ?? 0}</strong><span>Tabelas</span></article>
      <article><strong>${result.database?.migrations ?? 0}</strong><span>Migrations</span></article>
      <article><strong>${result.database?.rlsEnabled ?? 0}</strong><span>Com RLS</span></article>
      <article><strong>${result.functions?.deployed ?? 0}</strong><span>Edge Functions</span></article>
      <article><strong>${result.storage?.buckets ?? 0}</strong><span>Buckets</span></article>
      <article><strong>${result.secrets?.configured ?? 0}</strong><span>Secrets</span></article>
    </div>
    ${result.database?.rlsMissing ? `<p class="supabase-warning">${result.database.rlsMissing} tabela(s) ainda precisam de política RLS.</p>` : ''}
    ${(result.secrets?.missing || []).length ? `<p class="supabase-warning">Secret pendente: ${result.secrets.missing.join(', ')}</p>` : ''}
    <p class="helper-text">Nenhuma ação administrativa é executada sem confirmação. Secrets nunca são gravados no repositório.</p>`;
}

async function connectOrRefresh() {
  const button = $('#supabaseAction');
  button.disabled = true;
  try {
    if (connection.status !== 'connected') {
      const response = await beginSupabaseConnection();
      if (response.authorizationUrl) {
        await chrome.tabs.create({ url: response.authorizationUrl });
        $('#supabaseStatusText').textContent = 'Conclua a autorização na aba aberta e depois clique em Atualizar projetos.';
        return;
      }
      connection = await saveSupabaseConnection({
        status: response.status || 'connected', accountEmail: response.accountEmail || null,
        connectedAt: new Date().toISOString(), source: response.simulated ? 'simulator' : 'backend'
      });
    }
    const response = await fetchSupabaseProjects();
    connection = await saveSupabaseConnection({ projects: response.projects || [] });
    renderConnection();
  } catch (error) {
    $('#supabaseStatusText').textContent = error.message;
  } finally { button.disabled = false; }
}

async function runAction(action) {
  if (!connection.selectedProject) {
    $('#supabaseFeedback').textContent = 'Selecione um projeto Supabase.';
    return;
  }
  const destructive = new Set(['apply_migration', 'update_rls', 'deploy_function', 'save_secret']);
  if (destructive.has(action) && !globalThis.confirm('Esta ação altera recursos do Supabase. Deseja continuar?')) return;
  $('#supabaseFeedback').textContent = 'Processando ação…';
  try {
    const result = action === 'inspect'
      ? await inspectSupabaseProject(connection.selectedProject)
      : await runSupabaseAction(connection.selectedProject, action);
    $('#supabaseFeedback').textContent = result.message || 'Ação concluída.';
    if (action === 'inspect') renderInspection(result);
  } catch (error) {
    $('#supabaseFeedback').textContent = error.message;
  }
}

$('#supabaseAction')?.addEventListener('click', connectOrRefresh);
$('#disconnectSupabase')?.addEventListener('click', async () => { connection = await disconnectSupabase(); renderConnection(); });
$('#supabaseProjectSelect')?.addEventListener('change', async (event) => {
  const project = connection.projects.find((item) => item.ref === event.target.value) || null;
  connection = await saveSupabaseConnection({ selectedProject: project });
  $('#supabaseFeedback').textContent = project ? `${project.name} selecionado.` : 'Nenhum projeto selecionado.';
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-supabase-action]');
  if (button) void runAction(button.dataset.supabaseAction);
});

renderConnection();
