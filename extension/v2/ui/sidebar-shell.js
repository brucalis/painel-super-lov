// Protótipo isolado da navegação da Super Lovable v2.
// Não altera nem importa módulos da extensão atualmente distribuída.

const navigationItems = Array.from(document.querySelectorAll('.nav-item[data-view]'));
const eyebrow = document.querySelector('.workspace-header .eyebrow');
const title = document.querySelector('.workspace-header h1');

const views = Object.freeze({
  create: ['CRIAR', 'O que você quer alterar?'],
  queue: ['FILA', 'Acompanhe suas tarefas'],
  history: ['HISTÓRICO', 'Veja tudo o que já foi realizado'],
  projects: ['PROJETOS', 'Gerencie seus projetos conectados'],
  tools: ['FERRAMENTAS', 'Ações rápidas e seguras'],
  integrations: ['INTEGRAÇÕES', 'Conecte os serviços do seu projeto'],
  help: ['AJUDA', 'Orientações passo a passo'],
  settings: ['CONFIGURAÇÕES', 'Personalize sua experiência'],
});

navigationItems.forEach((item) => {
  item.addEventListener('click', () => {
    navigationItems.forEach((candidate) => candidate.classList.remove('active'));
    item.classList.add('active');

    const view = item.dataset.view;
    const [label, heading] = views[view] || views.create;
    eyebrow.textContent = label;
    title.textContent = heading;
  });
});
