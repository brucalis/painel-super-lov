
const SVG_ICONS = {
  wrench: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  zap: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  msgSquare: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  trendUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  palette: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5"/><circle cx="17.5" cy="10.5" r="0.5"/><circle cx="8.5" cy="7.5" r="0.5"/><circle cx="6.5" cy="12" r="0.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  box: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  moon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  headphones: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  sparkles: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  sidePanel: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  star: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  party: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 12"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>',
  clipboard: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
  key: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  package: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
  phone: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  card: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  money: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  arrowLeft: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  alarm: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></svg>',
  paperclip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  ban: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  rocket: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91 0z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  cart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  checkCircle: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  lock: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  logout: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  briefcase: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  arrowRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  checkSmall: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  msgBig: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
};

const PROMPT_TEMPLATES = [
  { icon: SVG_ICONS.wrench, label: "Bugs", prompt: "Analise o código e identifique todos os bugs, erros e falhas. Corrija cada um deles explicando o problema e a solução aplicada." },
  { icon: SVG_ICONS.edit, label: "Refatorar", prompt: "Elabore um plano completo de refatoração e otimização do sistema em etapas." },
  { icon: SVG_ICONS.shield, label: "Erros", prompt: "Implemente tratamento de erros robusto em todo o código, incluindo try/catch, validações e mensagens de erro amigáveis para o usuário." },
  { icon: SVG_ICONS.zap, label: "Otimizar", prompt: "Analise e otimize a performance do sistema, identificando gargalos, melhorando queries, reduzindo re-renders e aplicando boas práticas." },
  { icon: SVG_ICONS.msgSquare, label: "Comentários", prompt: "Adicione comentários claros e documentação em todo o código, explicando a lógica, parâmetros e retornos de cada função." },
  { icon: SVG_ICONS.trendUp, label: "SEO", prompt: "Monte um plano completo de criação e otimização de SEO para este site. Inclua: análise de meta tags (title, description, og:image), estrutura de headings (H1-H6), sitemap.xml, robots.txt, dados estruturados (JSON-LD), performance (Core Web Vitals), acessibilidade, URLs amigáveis, canonical tags, alt text em imagens, lazy loading, e estratégias de link building interno. Implemente todas as melhorias identificadas." },
  { icon: SVG_ICONS.palette, label: "UI", prompt: "Melhore a interface do usuário tornando-a mais moderna, responsiva e acessível, seguindo boas práticas de UX/UI." },
  { icon: SVG_ICONS.box, label: "Componentes", prompt: "Reorganize o código separando em componentes reutilizáveis, bem estruturados e com responsabilidades únicas." },
  { icon: SVG_ICONS.search, label: "Review", prompt: "Faça uma revisão completa do código identificando problemas de qualidade, segurança, performance e sugerindo melhorias." },
];

// ---- Template: License Gate ----
function templateLicenseGate(minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-dot"></span>' +
      '<span class="ql-title" data-ts-brand="name">' + ((window.tsBrandName && window.tsBrandName()) || 'Superlovable') + '</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<span class="ql-badge">v4.0</span>' +
      '<button id="ql-minimize" class="ql-minimize-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-license-gate">' +
      '<div class="ql-lock-icon">' + SVG_ICONS.lock + '</div>' +
      '<p class="ql-gate-title">Ativar Licen\u00e7a</p>' +
      '<p class="ql-gate-desc">Use sua chave de licen\u00e7a ou o e-mail informado na compra.</p>' +
      '<div class="ql-field">' +
        '<input id="ql-license-input" placeholder="Chave de licença ou e-mail da compra" spellcheck="false" autocomplete="off">' +
      '</div>' +
      '<button id="ql-validate-btn">Validar Licen\u00e7a</button>' +
      '<div id="ql-license-log"></div>' +
      '<div class="ql-gate-divider"><span data-ts-brand="name">' + ((window.tsBrandName && window.tsBrandName()) || 'Superlovable') + '</span></div>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Main UI ----
function templateMainUI(greeting, statusBadge, minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand" data-ts-brand="name">' + ((window.tsBrandName && window.tsBrandName()) || 'Superlovable') + '</span>' +
      '<span class="ql-badge-pro-header">PRO</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button class="ql-icon-btn ql-notif-btn" title="Notifica\u00e7\u00f5es">' + SVG_ICONS.bell + '<span class="ql-notif-badge" style="display:none">0</span></button>' +
      '<button id="ql-sidepanel-btn" class="ql-icon-btn" title="Abrir no Painel Lateral">' + SVG_ICONS.sidePanel + '</button>' +
      '<button class="ql-icon-btn" title="Tema">' + SVG_ICONS.moon + '</button>' +
      '<button id="ql-logout-btn" class="ql-icon-btn" title="Sair">' + SVG_ICONS.logout + '</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
   '<div id="ql-body">' +
    '<div id="ql-update-banner" style="display:none"></div>' +
    '<div class="ql-profile-card">' +
      '<div class="ql-profile-top">' +
        '<div class="ql-profile-info">' +
          '<span class="ql-profile-name">' + escapeHtml(greeting) + '</span>' +
          statusBadge +
        '</div>' +
      '</div>' +
      '<div id="ql-sync-status" class="ql-sync-status ql-sync-waiting">' +
        '<span class="ql-sync-text"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.clock + '</span> Aguardando sincroniza\u00e7\u00e3o...</span>' +
      '</div>' +
      '<div id="ql-trial-countdown" class="ql-trial-countdown" style="display:none"></div>' +
    '</div>' +
    '<div id="ql-reseller-btn" style="display:none;margin-bottom:14px">' +
      '<a href="https://extensaosorax.lovable.app/painelrevenda" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid rgba(var(--ts-brand-primary-rgb),0.3);background:rgba(var(--ts-brand-primary-rgb),0.06);color:var(--ql-accent);text-decoration:none;font-size:12px;font-weight:700;transition:all 0.2s">' +
        '<span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.briefcase + '</span> Painel do Revendedor<span style="margin-left:auto;font-size:10px;opacity:0.6;display:inline-flex">' + SVG_ICONS.arrowRight + '</span>' +
      '</a>' +
    '</div>' +
    '<!-- Tabs -->' +
    '<div class="ql-tabs" id="ql-tabs">' +
      '<button class="ql-tab ql-tab-active" data-tab="prompt"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.zap + '</span> Prompt</button>' +
      '<button class="ql-tab" data-tab="history"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.msgSquare + '</span> Hist\u00f3rico <span class="ql-tab-badge" id="ql-history-badge" style="display:none">0</span></button>' +
    '</div>' +
    '<div id="ql-tab-content">' +
    '<textarea id="ql-msg" rows="3" placeholder="Digite seu comando..." spellcheck="false"></textarea>' +
    '<div id="ql-attach-preview" class="ql-attach-preview" style="display:none"></div>' +
    '<div class="ql-action-bar">' +
      '<div class="ql-action-center">' +
        '<button id="ql-attach-btn" class="ql-attach-btn" title="Anexar arquivo (m\u00e1x. 10)">' + SVG_ICONS.paperclip + '</button>' +
        '<button id="ql-optimize-btn" class="ql-tool-btn" title="Otimizar com IA">' + SVG_ICONS.sparkles + '</button>' +
        '<button id="ql-speech-btn" class="ql-tool-btn" title="Voz para texto">' + SVG_ICONS.mic + '</button>' +
      '</div>' +
      '<div class="ql-action-right-send">' +
        '<button id="ql-send" class="ql-send-btn">Enviar</button>' +
      '</div>' +
    '</div>' +
    '<input type="file" id="ql-file-input" multiple style="display:none" accept="*/*">' +
    '<div id="ql-log"></div>' +
    '<div class="ql-shortcuts-section">' +
      '<span class="ql-shortcuts-title">ATALHOS R\u00c1PIDOS</span>' +
      '<div class="ql-shortcuts-grid" id="ql-chips"></div>' +
    '</div>' +
    '<button id="ql-remove-watermark" class="ql-watermark-btn"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.ban + '</span> Remover Marca de \u00c1gua</button>' +
    '<button id="ql-download-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(37,99,235,0.08));border-color:rgba(59,130,246,0.3);color:#60a5fa;margin-top:6px"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.download + '</span> Baixar Todos Arquivos</button>' +
    '<button id="ql-create-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(34,197,94,0.14),rgba(16,185,129,0.08));border-color:rgba(34,197,94,0.35);color:#4ade80;margin-top:6px"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.rocket + '</span> Criar Projeto no Lovable</button>' +
    '<button id="ql-publish-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(59,130,246,0.14),rgba(37,99,235,0.08));border-color:rgba(59,130,246,0.35);color:#60a5fa;margin-top:6px"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.globe + '</span> Publicar Projeto</button>' +
    '<div id="ql-download-status" style="display:none"></div>' +
    '</div>' +
  '<div id="ql-footer" class="ql-footer">' +
    '<div class="ql-footer-row">' +
      '<span class="ql-footer-version">v4.0</span>' +
    '</div>' +
    '<span class="ql-badge-mz" data-ts-brand="footer"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.zap + '</span> Desenvolvido por ' + ((window.tsBrandName && window.tsBrandName()) || 'Superlovable') + '</span>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>' +
  '<!-- Notifications Panel -->' +
  '<div id="ql-notif-panel" class="ql-notif-panel" style="display:none">' +
    '<div class="ql-notif-header">' +
      '<span>Notifica\u00e7\u00f5es</span>' +
      '<button id="ql-notif-close" class="ql-notif-close-btn">' + SVG_ICONS.x + '</button>' +
    '</div>' +
    '<div id="ql-notif-list" class="ql-notif-list">' +
      '<p class="ql-notif-empty">Carregando...</p>' +
    '</div>' +
  '</div>' +
  '<!-- Custom Alert -->' +
  '<div id="ql-custom-alert" class="ql-custom-alert" style="display:none">' +
    '<div class="ql-alert-content">' +
      '<div class="ql-alert-icon">' + SVG_ICONS.checkCircle + '</div>' +
      '<div class="ql-alert-title">Sucesso!</div>' +
      '<div class="ql-alert-message"></div>' +
      '<button class="ql-alert-ok-btn">OK</button>' +
    '</div>' +
  '</div>';
}

// ---- Template: Expired License Overlay ----
function templateExpiredOverlay() {
  return '<div class="ql-sweetalert-box">' +
    '<div class="ql-sweetalert-icon">' + SVG_ICONS.alarm + '</div>' +
    '<h2 class="ql-sweetalert-title">Licen\u00e7a Expirada!</h2>' +
    '<p class="ql-sweetalert-text">O prazo da sua licen\u00e7a terminou. Renove agora para continuar.</p>' +
    '<div class="ql-sweetalert-actions">' +
      '<button class="ql-sweetalert-btn ql-sweetalert-btn-primary" id="ql-sweetalert-renew"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.cart + '</span> Renovar Agora</button>' +
      '<button class="ql-sweetalert-btn ql-sweetalert-btn-secondary" id="ql-sweetalert-close">Fechar</button>' +
    '</div>' +
  '</div>';
}

// ---- Template: Payment UI (packages list) ----
function templatePaymentUI(minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand" data-ts-brand="name">' + ((window.tsBrandName && window.tsBrandName()) || 'Superlovable') + '</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button id="ql-pay-back" class="ql-icon-btn" title="Voltar">' + SVG_ICONS.arrowLeft + '</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-pay-section">' +
      '<div class="ql-pay-title">Escolha seu Plano</div>' +
      '<div id="ql-packages-list" class="ql-packages-list">' +
        '<div class="ql-pay-loading"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.clock + '</span> Carregando planos...</div>' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Package Card ----
function templatePackageCard(pkg) {
  const popular = pkg.is_popular ? '<span class="ql-pkg-popular"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.star + '</span> POPULAR</span>' : '';
  const duration = pkg.duration_days ? escapeHtml(String(pkg.duration_days)) + ' dias' : 'Permanente';
  const features = (pkg.features || []).map(function(f) { return '<li>' + escapeHtml(f) + '</li>'; }).join('');
  return '<div class="ql-pkg-card' + (pkg.is_popular ? ' ql-pkg-highlight' : '') + '" data-pkg-id="' + escapeHtml(pkg.id) + '" data-pkg-name="' + escapeHtml(pkg.name) + '" data-pkg-price="' + escapeHtml(String(pkg.price)) + '">' +
    popular +
    '<div class="ql-pkg-name">' + escapeHtml(pkg.name) + '</div>' +
    '<div class="ql-pkg-price">' + escapeHtml(String(pkg.price)) + ' <span>MZN</span></div>' +
    '<div class="ql-pkg-duration">' + duration + '</div>' +
    '<ul class="ql-pkg-features">' + features + '</ul>' +
    '<button class="ql-pkg-select-btn">Selecionar</button>' +
  '</div>';
}

// ---- Template: Checkout Screen ----
function templateCheckoutScreen(pkg, minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.zap + '</span> Pagamento</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button id="ql-checkout-back" class="ql-icon-btn" title="Voltar">' + SVG_ICONS.arrowLeft + '</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-pay-section">' +
      '<div class="ql-selected-pkg"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.package + '</span> <strong>' + escapeHtml(pkg.name) + '</strong> \u2014 ' + escapeHtml(String(pkg.price)) + ' MZN</div>' +
      '<div class="ql-pay-field">' +
        '<label>M\u00e9todo de Pagamento</label>' +
        '<div class="ql-pay-methods">' +
          '<button class="ql-method-btn ql-method-active" data-method="mpesa">' +
            '<span class="ql-method-icon">' + SVG_ICONS.phone + '</span> M-Pesa' +
          '</button>' +
          '<button class="ql-method-btn" data-method="emola">' +
            '<span class="ql-method-icon">' + SVG_ICONS.card + '</span> e-Mola' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ql-pay-field">' +
        '<label>N\u00famero de Telefone</label>' +
        '<input type="tel" id="ql-pay-phone" placeholder="84/85/86/87XXXXXXX" maxlength="9" spellcheck="false">' +
        '<span class="ql-pay-hint" id="ql-phone-hint">M-Pesa: 84 ou 85 | e-Mola: 86 ou 87</span>' +
      '</div>' +
      '<button id="ql-confirm-pay" class="ql-confirm-pay-btn"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.money + '</span> Pagar ' + escapeHtml(String(pkg.price)) + ' MZN</button>' +
      '<div id="ql-pay-log" class="ql-pay-log"></div>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Payment Success ----
function templatePaymentSuccess(licenseKey) {
  return '<div class="ql-pay-section" style="text-align:center;padding:24px 16px">' +
    '<div style="margin-bottom:12px;color:var(--ql-accent)">' + SVG_ICONS.party + '</div>' +
    '<div class="ql-pay-title">Pagamento Confirmado!</div>' +
    '<p style="color:var(--ql-muted);font-size:12px;margin:8px 0 16px">Sua licença foi ativada com sucesso.</p>' +
    '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:12px">' +
      '<p style="font-size:10px;color:var(--ql-muted);margin-bottom:4px">Sua chave de licença</p>' +
      '<p id="ql-new-key" style="font-family:monospace;font-size:13px;color:var(--ql-accent);font-weight:600;word-break:break-all">' + escapeHtml(licenseKey) + '</p>' +
    '</div>' +
    '<button id="ql-copy-key" class="ql-confirm-pay-btn" style="margin-bottom:8px"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.clipboard + '</span> Copiar Chave</button>' +
    '<p style="font-size:10px;color:var(--ql-muted);margin-bottom:12px">Cole a chave acima para ativar a extensão.</p>' +
    '<button id="ql-activate-key" class="ql-buy-btn" style="font-size:12px"><span style="vertical-align:middle;display:inline-flex">' + SVG_ICONS.key + '</span> Ativar Agora</button>' +
  '</div>';
}
