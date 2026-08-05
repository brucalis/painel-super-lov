import { HELP_GUIDES, searchGuides } from '../core/help-guides.js';

const $ = (selector) => document.querySelector(selector);
let selectedCategory = 'Todos';

function badgeClass(tone) {
  if (tone === 'danger') return 'danger';
  if (tone === 'attention') return 'attention';
  return 'safe';
}

function guideCard(guide) {
  return `<article class="help-card" data-guide-id="${guide.id}">
    <div class="help-card-top"><span class="help-category">${guide.category}</span><span class="help-credit ${badgeClass(guide.tone)}">${guide.badge}</span></div>
    <h3>${guide.title}</h3><p>${guide.summary}</p>
    <button data-help-open="${guide.id}">Ver passo a passo</button>
  </article>`;
}

function renderCategories() {
  const categories = ['Todos', ...new Set(HELP_GUIDES.map((guide) => guide.category))];
  $('#helpCategories').innerHTML = categories.map((category) => `<button class="${category === selectedCategory ? 'active' : ''}" data-help-category="${category}">${category}</button>`).join('');
}

function renderGuides() {
  const term = $('#helpSearch')?.value || '';
  let guides = searchGuides(term);
  if (selectedCategory !== 'Todos') guides = guides.filter((guide) => guide.category === selectedCategory);
  $('#helpGuides').innerHTML = guides.length ? guides.map(guideCard).join('') : '<div class="empty-state"><strong>Nenhuma orientação encontrada</strong><p>Tente outro termo ou categoria.</p></div>';
}

function ensureDialog() {
  let dialog = $('#helpDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'helpDialog';
  dialog.className = 'task-dialog help-dialog';
  dialog.innerHTML = '<div class="help-dialog-body"><div class="dialog-heading"><div><p class="eyebrow">ORIENTAÇÃO</p><h2 id="helpDialogTitle"></h2></div><button class="dialog-close" id="helpDialogClose" aria-label="Fechar">×</button></div><span id="helpDialogBadge" class="help-credit"></span><p id="helpDialogSummary"></p><ol id="helpDialogSteps"></ol><div id="helpDialogWarning" class="help-warning"></div></div>';
  document.body.appendChild(dialog);
  dialog.querySelector('#helpDialogClose').addEventListener('click', () => dialog.close());
  return dialog;
}

function openGuide(id) {
  const guide = HELP_GUIDES.find((item) => item.id === id);
  if (!guide) return;
  const dialog = ensureDialog();
  dialog.querySelector('#helpDialogTitle').textContent = guide.title;
  const badge = dialog.querySelector('#helpDialogBadge');
  badge.textContent = guide.badge;
  badge.className = `help-credit ${badgeClass(guide.tone)}`;
  dialog.querySelector('#helpDialogSummary').textContent = guide.summary;
  dialog.querySelector('#helpDialogSteps').innerHTML = guide.steps.map((step) => `<li>${step}</li>`).join('');
  dialog.querySelector('#helpDialogWarning').textContent = guide.warning;
  if (!dialog.open) dialog.showModal();
}

document.addEventListener('click', (event) => {
  const category = event.target.closest('[data-help-category]');
  if (category) {
    selectedCategory = category.dataset.helpCategory;
    renderCategories();
    renderGuides();
    return;
  }
  const open = event.target.closest('[data-help-open]');
  if (open) openGuide(open.dataset.helpOpen);
});

$('#helpSearch')?.addEventListener('input', renderGuides);

window.addEventListener('superlovable:open-help', (event) => {
  const id = event.detail?.guideId;
  if (id) openGuide(id);
});

renderCategories();
renderGuides();
