import {
  addProjectDecision,
  clearProjectMemory,
  getProjectMemory,
  removeProjectDecision,
  saveProjectMemory
} from '../core/project-memory-store.js';
import { getProjectContext } from '../core/project-context.js';

const $ = (selector, root = document) => root.querySelector(selector);
let context = await getProjectContext();
let memory = null;

function ensureStyles() {
  if (document.querySelector('link[href="project-memory.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'project-memory.css';
  document.head.appendChild(link);
}

function injectUi() {
  const panel = document.querySelector('[data-panel="projects"]');
  if (!panel || $('#projectMemoryCard')) return;
  panel.insertAdjacentHTML('beforeend', `
    <section class="memory-card" id="projectMemoryCard">
      <div class="section-heading">
        <div><p class="eyebrow">MEMÓRIA DO PROJETO</p><h2>Regras que devem ser lembradas</h2></div>
        <span class="memory-project-label" id="memoryProjectLabel">Nenhum projeto</span>
      </div>
      <p class="memory-intro">Essas informações acompanham todas as tarefas deste repositório e branch. Elas não são enviadas ao chat da Lovable.</p>
      <div class="memory-grid">
        <label>Nome da marca<input id="memoryBrandName" placeholder="Ex.: Super Lovable" /></label>
        <label>Objetivo do produto<input id="memoryProductGoal" placeholder="O que o projeto precisa entregar" /></label>
        <label class="memory-wide">Identidade visual<textarea id="memoryVisualIdentity" placeholder="Estilo, referências, aparência e sensação visual"></textarea></label>
        <label>Cores<input id="memoryColors" placeholder="#7c3aed, #ec4899, azul-marinho" /></label>
        <label>Tipografia<input id="memoryTypography" placeholder="Fontes e regras tipográficas" /></label>
        <label class="memory-wide">Público<textarea id="memoryAudience" placeholder="Quem usa ou compra este projeto"></textarea></label>
        <label class="memory-wide">Tom de comunicação<textarea id="memoryTone" placeholder="Como os textos devem soar"></textarea></label>
        <label class="memory-wide">Tecnologias<input id="memoryTechnologies" placeholder="React, TypeScript, Supabase, Stripe…" /></label>
        <label class="memory-wide">Regras permanentes<textarea id="memoryRules" placeholder="Uma regra por linha. Ex.: preservar funções existentes"></textarea></label>
        <label class="memory-wide">Restrições<textarea id="memoryRestrictions" placeholder="Uma restrição por linha. Ex.: não alterar o checkout"></textarea></label>
        <label class="memory-wide">Integrações conectadas<input id="memoryIntegrations" placeholder="GitHub, Supabase, Mercado Pago…" /></label>
        <label class="memory-wide">Arquivos importantes<input id="memoryFiles" placeholder="src/App.tsx, supabase/functions/webhook/index.ts…" /></label>
        <label class="memory-wide">Observações<textarea id="memoryNotes" placeholder="Outras informações que devem acompanhar o projeto"></textarea></label>
      </div>
      <div class="memory-actions">
        <button class="primary-action" id="saveProjectMemory">Salvar memória</button>
        <button class="quiet-action danger-text" id="clearProjectMemory">Limpar memória</button>
      </div>
      <p class="memory-feedback" id="memoryFeedback" role="status"></p>
      <section class="memory-decisions">
        <div class="section-heading"><div><p class="eyebrow">DECISÕES</p><h3>Histórico de escolhas importantes</h3></div></div>
        <div class="decision-form"><input id="decisionTitle" placeholder="Título da decisão" /><textarea id="decisionDescription" placeholder="O que foi decidido e por quê"></textarea><button id="addProjectDecision">Registrar decisão</button></div>
        <div id="projectDecisions" class="decision-list"></div>
      </section>
    </section>`);
}

function splitList(value) {
  return String(value || '').split(/\n|,/g).map((item) => item.trim()).filter(Boolean);
}

function setValue(id, value) {
  const element = $(`#${id}`);
  if (element) element.value = Array.isArray(value) ? value.join('\n') : value || '';
}

function renderDecisions() {
  const target = $('#projectDecisions');
  if (!target) return;
  target.innerHTML = memory?.decisions?.length
    ? memory.decisions.map((item) => `<article data-decision-id="${item.id}"><div><strong>${item.title || 'Decisão'}</strong><p>${item.description || ''}</p><small>${new Date(item.createdAt).toLocaleString('pt-BR')}</small></div><button data-remove-decision aria-label="Remover decisão">×</button></article>`).join('')
    : '<p class="memory-empty">Nenhuma decisão registrada.</p>';
}

async function loadMemory() {
  context = await getProjectContext();
  const repository = context?.repository?.fullName;
  const branch = context?.branch;
  const card = $('#projectMemoryCard');
  const enabled = Boolean(repository && branch);
  card?.classList.toggle('is-disabled', !enabled);
  card?.querySelectorAll('input, textarea, button').forEach((element) => { element.disabled = !enabled; });
  $('#memoryProjectLabel').textContent = enabled ? `${repository} · ${branch}` : 'Selecione um projeto';
  if (!enabled) return;
  memory = await getProjectMemory(repository, branch);
  setValue('memoryBrandName', memory.brand.name);
  setValue('memoryProductGoal', memory.productGoal);
  setValue('memoryVisualIdentity', memory.brand.visualIdentity);
  setValue('memoryColors', memory.brand.colors);
  setValue('memoryTypography', memory.brand.typography);
  setValue('memoryAudience', memory.audience);
  setValue('memoryTone', memory.communicationTone);
  setValue('memoryTechnologies', memory.technologies);
  setValue('memoryRules', memory.permanentRules);
  setValue('memoryRestrictions', memory.restrictions);
  setValue('memoryIntegrations', memory.connectedIntegrations);
  setValue('memoryFiles', memory.importantFiles);
  setValue('memoryNotes', memory.notes);
  renderDecisions();
}

async function saveMemory() {
  const repository = context?.repository?.fullName;
  const branch = context?.branch;
  if (!repository || !branch) return;
  const button = $('#saveProjectMemory');
  button.disabled = true;
  try {
    memory = await saveProjectMemory(repository, branch, {
      brand: {
        name: $('#memoryBrandName').value,
        visualIdentity: $('#memoryVisualIdentity').value,
        colors: splitList($('#memoryColors').value),
        typography: $('#memoryTypography').value
      },
      productGoal: $('#memoryProductGoal').value,
      audience: $('#memoryAudience').value,
      communicationTone: $('#memoryTone').value,
      technologies: splitList($('#memoryTechnologies').value),
      permanentRules: splitList($('#memoryRules').value),
      restrictions: splitList($('#memoryRestrictions').value),
      connectedIntegrations: splitList($('#memoryIntegrations').value),
      importantFiles: splitList($('#memoryFiles').value),
      notes: $('#memoryNotes').value
    });
    $('#memoryFeedback').textContent = 'Memória salva. As próximas tarefas usarão este contexto.';
    globalThis.dispatchEvent(new CustomEvent('superlovable:project-memory-updated', { detail: { repository, branch } }));
  } catch (error) {
    $('#memoryFeedback').textContent = error.message;
  } finally { button.disabled = false; }
}

ensureStyles();
injectUi();
await loadMemory();

$('#saveProjectMemory')?.addEventListener('click', saveMemory);
$('#clearProjectMemory')?.addEventListener('click', async () => {
  if (!context?.repository?.fullName || !context?.branch) return;
  if (!globalThis.confirm('Apagar toda a memória deste projeto e branch?')) return;
  await clearProjectMemory(context.repository.fullName, context.branch);
  await loadMemory();
  $('#memoryFeedback').textContent = 'Memória removida.';
});
$('#addProjectDecision')?.addEventListener('click', async () => {
  if (!context?.repository?.fullName || !context?.branch) return;
  memory = await addProjectDecision(context.repository.fullName, context.branch, {
    title: $('#decisionTitle').value,
    description: $('#decisionDescription').value
  });
  $('#decisionTitle').value = '';
  $('#decisionDescription').value = '';
  renderDecisions();
});
$('#projectDecisions')?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-remove-decision]');
  const article = button?.closest('[data-decision-id]');
  if (!article || !context?.repository?.fullName || !context?.branch) return;
  memory = await removeProjectDecision(context.repository.fullName, context.branch, article.dataset.decisionId);
  renderDecisions();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.slv2_github_connection || changes.slv2_project_context)) void loadMemory();
});
