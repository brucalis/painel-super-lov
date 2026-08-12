const SP_SVG = {
  sparkles: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  mic: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  wrench: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  edit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  shield: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  zap: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  msgSq: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  trendUp: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  palette: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5"/><circle cx="17.5" cy="10.5" r="0.5"/><circle cx="8.5" cy="7.5" r="0.5"/><circle cx="6.5" cy="12" r="0.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  box: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  search: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',

  paperclip: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',

eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',

download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',

  refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  book: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  flask: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6l-5.5 9.5A2 2 0 0 0 5.2 21h13.6a2 2 0 0 0 1.7-3.5L15 8V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>',
  phone: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  bug: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>',
  trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  arrowRight: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  arrowLeft: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  briefcase: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  globe: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  checkCircle: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  ban: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  rocket: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91 0z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  alarm: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/></svg>',
  send: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
};

const SP_TEMPLATES = [
  {
    icon: SP_SVG.wrench,
    label: "Corrigir Bug",
    prompt: "Identifique falhas, erros de lógica e bugs no código fornecido. Forneça a correção exata para cada problema encontrado, acompanhada de uma explicação clara sobre a causa raiz e a solução aplicada, garantindo que o código funcione perfeitamente e sem erros."
  },
  {
    icon: SP_SVG.refresh,
    label: "Refatorar",
    prompt: "Analise a estrutura do código e proponha uma refatoração completa para torná-lo mais limpo, modular e seguindo os princípios SOLID e Clean Code. Reduza a complexidade ciclomática e melhore a legibilidade e manutenibilidade sem alterar a funcionalidade original."
  },
  {
    icon: SP_SVG.palette,
    label: "Melhorar UI",
    prompt: `Você é um Diretor de Arte e Desenvolvedor Frontend de elite, reconhecido por criar interfaces premiadas (nível Awwwards/Apple). Seu objetivo é transformar a página atual em uma experiência visual "Premium", focada em sofisticação, minimalismo moderno e fluidez absoluta.

1. Refino Estético e Identidade Visual (Premium Look):

Color Theory & Depth: Aplique uma paleta de cores sofisticada (tonalidades sóbrias com acentos vibrantes calculados). Implemente profundidade usando camadas de sombras suaves (Soft Shadows), Glassmorphism (blur de fundo) e gradientes lineares sutis que guiam o olhar.
Typography Engine: Reestruture a hierarquia tipográfica. Utilize escalas fluídas, ajuste o line-height para máxima legibilidade e o letter-spacing para um aspecto editorial. Garanta que o contraste entre títulos (Bold/Display) e corpo de texto seja elegante.
2. Precisão de Layout e Espaçamento (The 8pt Grid):

Visual Rhythm: Aplique um sistema de grade rigoroso (8px grid). Corrija inconsistências de padding e margin. Utilize o "espaço em branco" (White Space) como elemento de design para permitir que o conteúdo "respire" e reduzir a carga cognitiva.
Layout Modernization: Se apropriado, implemente estruturas contemporâneas como Bento Grids, seções com Full-height impactantes e alinhamentos assimétricos que mantenham o equilíbrio visual.
3. Micro-interações e Motion Design (The "Feel"):

Smooth Transitions: Adicione micro-interações em botões, links e cards (hover effects com cubic-bezier para movimentos naturais).
Staggered Animations: Implemente entradas de conteúdo suaves (fade-in, slide-up) com atrasos escalonados (stagger) para criar uma sensação de refinamento tecnológico enquanto o usuário navega.
Feedback Visual: Garanta que cada ação do usuário (clique, hover, scroll) tenha uma resposta visual fluida e elegante, elevando a percepção de qualidade do software.
4. Limpeza de Código e Refatoração CSS:

CSS Architecture: Elimine estilos redundantes, corrija "hacks" de CSS e unifique variáveis de design (tokens). Use Tailwind CSS ou CSS moderno de forma modular e altamente organizada.
Pixel Perfection: Corrija pequenos desalinhamentos, bordas mal renderizadas ou elementos sobrepostos. Garanta que o layout seja impecável em todas as resoluções (Retina-ready).
Diretriz de Execução: Analise a página atual como um crítico de design. Identifique o que a torna "comum" e aplique as mudanças necessárias para torná-la "extraordinária". O resultado final deve ser uma página que não apenas funcione perfeitamente, mas que transmita autoridade, luxo e atenção obsessiva aos detalhes.`
  },
  {
    icon: SP_SVG.book,
    label: "Explicar Código",
    prompt: "Forneça uma explicação técnica detalhada e didática sobre o funcionamento deste código. Descreva o papel de cada função, componente e lógica de negócio, facilitando a compreensão do fluxo de dados e a arquitetura da solução para outros desenvolvedores."
  },
  {
    icon: SP_SVG.zap,
    label: "Otimizar",
    prompt: `Você é um Engenheiro de Software Principal (L6/L7) especializado em sistemas reativos de alta escala e otimização de infraestrutura frontend/backend. Seu objetivo é transformar o código atual em um estado de "World-Class Engineering".

1. Auditoria e Diagnóstico de Performance (Critical Path):

Core Web Vitals: Analise e corrija LCP, FID e CLS. Reduza o Total Blocking Time (TBT).
Network Efficiency: Implemente estratégias de cache agressivas (Stale-While-Revalidate), compressão de assets e otimização de payloads JSON.
Bundle Analysis: Identifique e elimine dead code. Implemente Code Splitting por rota e por componente de baixa prioridade.
2. Refatoração Arquitetural (Robustez e Escalabilidade):

Design Patterns: Aplique padrões apropriados (Factory, Observer, Strategy) para eliminar condicionais complexas e acoplamento rígido.
State Management: Otimize o fluxo de dados. Substitua contextos globais pesados por estados atômicos ou bibliotecas de busca de dados (ex: TanStack Query) para gerenciar cache local e sincronização.
Type Safety: Eleve a cobertura de TypeScript para strict: true, eliminando any e garantindo contratos de interface rigorosos entre frontend e API.
3. Resiliência e Debugging Avançado:

Error Handling: Implemente uma camada de abstração para erros que capture falhas silenciosas e forneça feedback elegante ao usuário, além de telemetria.
Race Conditions: Identifique e neutralize condições de corrida em chamadas assíncronas e atualizações de estado concorrentes.
Security: Audite o código em busca de vulnerabilidades de injeção, XSS e vazamento de dados sensíveis no client-side.
4. Otimização de UI/UX Engine:

Rendering: Minimize re-renders desnecessários usando Profiling. Implemente virtualização para listas extensas e lazy-loading para elementos fora da viewport.
Asset Pipeline: Garanta que todas as imagens usem formatos modernos (WebP/Avif), tamanhos responsivos (srcset) e decodificação assíncrona.
Diretriz de Resposta: Não apenas corrija o código; explique a decisão arquitetural tomada, o impacto esperado em milissegundos ou bytes, e como essa mudança previne débitos técnicos futuros. Se houver um trade-off entre legibilidade e performance extrema, justifique a escolha.`
  },
  {
    icon: SP_SVG.shield,
    label: "Segurança",
    prompt: `Você é um Engenheiro de Segurança de nível Staff, especializado em OWASP Top 10, criptografia e infraestrutura segura. Sua missão é realizar um Security Audit profundo no sistema fornecido, identificar vulnerabilidades críticas e implementar correções imediatas (hotfixes) sem comprometer a disponibilidade.

1. Auditoria Ofensiva (Vulnerability Assessment):

OWASP Top 10: Varra o código em busca de injeções (SQLi, NoSQL, Command), Broken Access Control, e falhas de autenticação.
XSS & CSRF: Identifique superfícies de ataque para Cross-Site Scripting (Refletido, Armazenado e DOM-based) e garanta a presença de proteções contra Cross-Site Request Forgery.
Sensitive Data Exposure: Localize chaves de API, segredos, ou PII (Informações Pessoais Identificáveis) expostas no código ou em logs. Verifique a força dos algoritmos de hashing e criptografia utilizados.
2. Defesa de Camada de Aplicação (Hardening):

Authorization & Authentication: Valide se o sistema segue o princípio do "Menor Privilégio" (Least Privilege). Garanta que a validação de permissões ocorra no Server-Side e não apenas na UI.
Input Sanitization: Implemente uma camada rigorosa de sanitização e validação de tipos para todas as entradas de usuário, utilizando esquemas de validação (Zod, Joi, etc.) ou tipos fortes.
Security Headers: Configure ou recomende headers de segurança críticos (CSP - Content Security Policy, HSTS, X-Frame-Options, X-Content-Type-Options).
3. Resiliência de Infraestrutura e Banco de Dados:

RLS & DB Security: Se houver banco de dados (ex: Supabase/PostgreSQL), audite as políticas de Row Level Security (RLS) para garantir que um usuário nunca acesse dados de outro.
Rate Limiting & DoS: Implemente ou sugira mecanismos de controle de taxa (Rate Limit) para prevenir ataques de força bruta ou negação de serviço.
Dependency Audit: Analise bibliotecas externas em busca de vulnerabilidades conhecidas (CVEs) e sugira atualizações ou substituições seguras.
4. Relatório de Remediação:

Para cada falha encontrada: Classifique a severidade (Baixa, Média, Alta, Crítica), descreva o vetor de ataque e forneça o código corrigido.
Explique o impacto da correção na lógica de negócio e como validar que a vulnerabilidade foi mitigada.
Instrução de Execução: Não ignore falhas "teóricas". Trate cada brecha como um potencial ponto de entrada para um ataque real. Entregue um código blindado contra os ataques mais modernos da web.`
  },
  {
    icon: SP_SVG.flask,
    label: "Criar Teste",
    prompt: "Desenvolva uma suíte abrangente de testes unitários para este código, cobrindo caminhos felizes e casos de borda. Utilize frameworks modernos e garanta uma alta cobertura de código, seguindo as melhores práticas de Clean Testing e isolamento de dependências."
  },
  {
    icon: SP_SVG.phone,
    label: "Responsividade",
    prompt: `Você é um Especialista em Interfaces Adaptativas com foco em acessibilidade e performance mobile. Sua missão é refatorar a estrutura de uma página para que ela seja 100% responsiva, garantindo uma experiência nativa em qualquer resolução, de relógios inteligentes a monitores ultrawide.

1. Estratégia "Mobile-First" e Arquitetura Fluida:

Refatoração CSS/Tailwind: Reestruture o código priorizando dispositivos móveis. Use unidades relativas (rem, em, vh, vw, %) em vez de valores fixos (px).
Layout Engine: Implemente CSS Grid para layouts bidimensionais complexos e Flexbox para componentes unidimensionais, garantindo que o conteúdo se ajuste organicamente ao container pai.
Fluid Typography: Utilize funções como clamp() para que fontes e espaçamentos escalem suavemente entre breakpoints, eliminando degraus visuais bruscos.
2. Otimização de Assets e Mídia:

Imagens Adaptativas: Implemente aspect-ratio para evitar saltos de layout (CLS). Configure object-fit: cover/contain e garanta que imagens pesadas sejam redimensionadas ou ocultadas em telas menores.
Breakpoints Estratégicos: Não foque apenas em dispositivos comuns (iPhone/Pixel). Crie breakpoints baseados no "ponto de quebra" do conteúdo, garantindo integridade visual em resoluções intermediárias (tablets em modo paisagem, dobráveis).
3. Ergonomia e Interação Touch:

Touch Targets: Garanta que todos os elementos clicáveis tenham uma área mínima de 44x44px.
Interações de Dispositivo: Ajuste estados de hover para não serem disparados acidentalmente no toque. Implemente menus hamburger ou bottom bars intuitivos para mobile sem comprometer a versão desktop.
Overflow Control: Identifique e corrija qualquer "scroll horizontal" indesejado, garantindo que o viewport seja respeitado rigorosamente.
4. Resiliência de Componentes Complexos:

Data Tables: Transforme tabelas complexas em cards empilháveis ou implemente containers com scroll horizontal controlado em telas pequenas.
Modais e Overlays: Garanta que diálogos ocupem a tela cheia em mobile com scroll interno, evitando que o fundo da página role simultaneamente.
Instrução de Execução: Analise o código atual e identifique elementos com larguras fixas ou posicionamento absoluto que quebram o layout. Entregue a versão refatorada com comentários técnicos sobre a hierarquia visual adotada e como a legibilidade foi preservada em cada nível de largura.`
  }
];

function spEscapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function spSanitizeUrl(url) {
  if (!url) return '';
  try {
    const p = new URL(url);
    return (p.protocol === 'http:' || p.protocol === 'https:') ? url : '';
  } catch(e) { return ''; }
}

function spTemplateLicenseGate() {
  return '<div class="sp-license-gate">' +
    '<img class="sp-login-logo" src="/icons/icon128.png" alt="' + ((window.tsBrandName && window.tsBrandName()) || 'Superlovable') + '">' +
    '<p class="sp-gate-title">Bem vindo a <span data-ts-brand="name">' + ((window.tsBrandName && window.tsBrandName()) || 'Superlovable') + '</span></p>' +
    '<p class="sp-gate-desc">Insira sua chave de licença para desbloquear.</p>' +
    '<input class="sp-input" id="sp-license-input" placeholder="LVA-XXXX-XXXX-XXXX-XXXX" spellcheck="false">' +
    '<button class="sp-btn-primary" id="sp-validate-btn">Validar Licença</button>' +

    '<div class="sp-gate-actions">' +

    '</div>' +
    '<div class="sp-log" id="sp-license-log" role="alert"></div>' +
    '<a class="sp-license-cta" id="sp-license-cta" href="https://superlovable-lp.lovable.app/" target="_blank" rel="noopener noreferrer" style="display:none">Acessar agora</a>' +
  '</div>';
}

function spTemplateMainUI(greeting, statusBadge) {
  return '<div id="sp-update-banner" style="display:none"></div>' +
    '<div class="sp-profile-card">' +

      '<div class="sp-profile-top">' +

        '<div class="sp-profile-left">' +
          '<span class="sp-profile-name" id="sp-name">' + greeting + '</span>' +
          statusBadge +
        '</div>' +

        '<div class="sp-profile-actions">' +
          '<button class="sp-profile-action sp-notif-btn" title="Notificações">' +

  '<svg class="sp-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
  '</svg>' +

  '<span class="sp-profile-badge">1</span>' +

'</button>' +
          '<button class="sp-profile-action sp-logout-btn" title="Sair">' +

  '<svg class="sp-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
    '<polyline points="16 17 21 12 16 7"/>' +
    '<line x1="21" y1="12" x2="9" y2="12"/>' +
  '</svg>' +

'</button>' +
        '</div>' +

      '</div>' +

      '<div class="sp-sync-status" id="sp-sync"><span style="vertical-align:middle">' + SP_SVG.clock + '</span> Aguardando sincronização...</div>' +
      '<div class="sp-trial-countdown" id="sp-countdown" style="display:none"></div>' +

    '</div>' +
    '<div id="sp-reseller-btn" style="display:none;margin-bottom:14px">' +
      '<a href="https://extensaosorax.lovable.app/painelrevenda" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid rgba(var(--ts-brand-primary-rgb),0.3);background:rgba(var(--ts-brand-primary-rgb),0.06);color:var(--ql-accent);text-decoration:none;font-size:12px;font-weight:700;transition:all 0.2s">' +
        '<span style="vertical-align:middle;display:inline-flex">' + SP_SVG.briefcase + '</span> Painel do Revendedor<span style="margin-left:auto;font-size:10px;opacity:0.6;display:inline-flex">' + SP_SVG.arrowRight + '</span>' +
      '</a>' +
    '</div>' +
    '<textarea class="sp-textarea" id="sp-msg" rows="3" placeholder="Digite seu comando..." spellcheck="false"></textarea>' +
    '<div id="sp-attach-preview" class="sp-attach-preview" style="display:none"></div>' +
    '<div class="sp-action-bar">' +
      '<div class="sp-action-left"><label class="sp-toggle"><input type="checkbox" id="sp-modo-plano"><span class="sp-toggle-slider"></span></label><span class="sp-toggle-label">Plano</span></div>' +
      '<div class="sp-action-center">' +

  '<button class="sp-tool-btn" id="sp-attach-btn" title="Anexar imagem">' + SP_SVG.paperclip + '</button>' +

  '<button class="sp-tool-btn" id="sp-speech" title="Ditar comando">' + SP_SVG.mic + '</button>' +

  '<button class="sp-tool-btn" id="sp-remove-watermark-btn" title="Remove Watermark">' + SP_SVG.eye + '</button>' +

  '<button class="sp-tool-btn" id="sp-download-btn" title="Baixar arquivos">' + SP_SVG.download + '</button>' +

'</div>' +
      '<button class="sp-send-btn" id="sp-send">Enviar</button>' +
    '</div>' +
    '<input type="file" id="sp-file-input" multiple style="display:none" accept="*/*">' +
    '<div class="sp-log" id="sp-log"></div>' +
    '<span class="sp-shortcuts-title">ATALHOS R\u00c1PIDOS</span>' +
    '<div class="sp-shortcuts-grid" id="sp-chips"></div>' +
    '<button id="sp-remove-watermark" class="sp-watermark-btn"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.eye + '</span> Remover Marca de \u00c1gua</button>' +
    '<button id="sp-publish-project" class="sp-watermark-btn" style="background:linear-gradient(135deg,rgba(59,130,246,0.14),rgba(37,99,235,0.08));border-color:rgba(59,130,246,0.35);color:#60a5fa;margin-top:6px"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.globe + '</span> Publicar Projeto</button>';
}

function spTemplateStatusBadge(status) {
  if (status === 'trial') {
    return '<span class="sp-status-badge sp-badge-test">TEST</span>';
  }
  return '<span class="sp-status-badge sp-badge-pro">PRO</span>';
}

function spTemplateAlert(title, message) {
  return '<div class="sp-alert-box">' +
    '<div class="sp-alert-icon">' + SP_SVG.checkCircle + '</div>' +
    '<div class="sp-alert-title">' + spEscapeHtml(title) + '</div>' +
    '<div class="sp-alert-message">' + spEscapeHtml(message) + '</div>' +
    '<button class="sp-alert-ok">OK</button>' +
  '</div>';
}

function spTemplateNotifItem(n) {
  const date = new Date(n.created_at).toLocaleDateString('pt-BR');
  const safeLink = spSanitizeUrl(n.link);
  const linkHtml = safeLink
    ? '<a href="' + spEscapeHtml(safeLink) + '" target="_blank" rel="noopener noreferrer" class="sp-notif-link">Abrir link <span style="vertical-align:middle;display:inline-flex">' + SP_SVG.arrowRight + '</span></a>'
    : '';
  return '<div class="sp-notif-item">' +
    '<div class="sp-notif-item-title">' + spEscapeHtml(n.title) + '</div>' +
    '<div class="sp-notif-item-msg">' + spEscapeHtml(n.message) + '</div>' +
    linkHtml +
    '<div class="sp-notif-item-date">' + date + '</div>' +
  '</div>';
}

function spTemplateUpdateBanner(version, changelog, dlUrl) {
  return '<div style="padding:10px 12px;background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.08));border:1px solid rgba(251,191,36,0.3);border-radius:10px;margin:8px 0">' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
      '<span style="font-size:14px;display:inline-flex;vertical-align:middle">' + SP_SVG.bell + '</span>' +
      '<strong style="font-size:11px;color:#f59e0b">Nova atualização v' + version + '!</strong>' +
    '</div>' +
    '<p style="font-size:10px;color:#a1a1aa;margin:0 0 6px;white-space:pre-line">' + (changelog || '') + '</p>' +
    (dlUrl ? '<a href="' + dlUrl + '" target="_blank" style="display:inline-block;padding:4px 12px;background:#f59e0b;color:#000;border-radius:6px;text-decoration:none;font-size:10px;font-weight:700">Baixar v' + version + '</a>' : '') +
  '</div>';
}

function spTemplateCountdown(label, timeStr, pct, urgentClass) {
  return '<div class="sp-countdown-row">' +
    '<span style="display:inline-flex;vertical-align:middle">' + SP_SVG.clock + '</span>' +
    '<span class="sp-countdown-label">' + label + '</span>' +
    '<span class="sp-countdown-time">' + timeStr + '</span>' +
  '</div>' +
  '<div class="sp-trial-bar">' +
    '<div class="sp-trial-bar-fill' + urgentClass + '" style="width:' + pct + '%"></div>' +
  '</div>';
}

function spTemplateAttachItem(f, index) {
  const thumb = f.previewUrl
    ? '<img class="sp-attach-thumb" src="' + f.previewUrl + '" alt="">'
    : '<div class="sp-attach-icon">' + SP_SVG.file + '</div>';
  return '<div class="sp-attach-item' + (f.uploading ? ' sp-attach-uploading' : '') + '">' +
    thumb +
    '<div class="sp-attach-info">' +
      '<span class="sp-attach-name" title="' + spEscapeHtml(f.file_name) + '">' + spEscapeHtml(f.file_name) + '</span>' +
      '<span class="sp-attach-size">' + spEscapeHtml(f.sizeLabel) + '</span>' +
    '</div>' +
    '<button class="sp-attach-remove" data-idx="' + index + '">' + SP_SVG.x + '</button>' +
  '</div>';
}

function spFormatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ========== Chat History Templates ==========
function spTemplateTabs(activeTab, msgCount, skillsCount) {
  var countBadge = msgCount > 0 ? '<span class="sp-tab-badge">' + msgCount + '</span>' : '';
  var skillsBadge = skillsCount > 0 ? '<span class="sp-tab-badge">' + skillsCount + '</span>' : '';
  return '<div class="sp-tabs">' +
    '<button class="sp-tab' + (activeTab === 'prompt' ? ' sp-tab-active' : '') + '" data-tab="prompt">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
      ' Prompt' +
    '</button>' +
    '<button class="sp-tab' + (activeTab === 'skills' ? ' sp-tab-active' : '') + '" data-tab="skills">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>' +
      ' Skills ' + skillsBadge +
    '</button>' +
    '<button class="sp-tab' + (activeTab === 'history' ? ' sp-tab-active' : '') + '" data-tab="history">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      ' Histórico ' + countBadge +
    '</button>' +
  '</div>';
}

// ========== Skills Templates ==========
function spTemplateSkillsEmpty() {
  return '<div class="sp-chat-empty">' +
    '<div class="sp-chat-empty-icon">' + SP_SVG.zap + '</div>' +
    '<div class="sp-chat-empty-title">Nenhuma skill criada</div>' +
    '<div class="sp-chat-empty-desc">Skills são prompts reutilizáveis que você injeta no chat do Lovable com um clique.</div>' +
  '</div>';
}

function spTemplateSkillCard(skill) {
  var icon = skill.icon || '✦';
  var name = spEscapeHtml(skill.name || 'Sem nome');
  var desc = spEscapeHtml(skill.description || '');
  var preview = spEscapeHtml((skill.content || '').substring(0, 120));
  if ((skill.content || '').length > 120) preview += '…';
  var builtinBadge = skill.builtin ? '<span class="sp-skill-badge-builtin" title="Skill nativa do Lovable">Lovable</span>' : '';
  var editBtn = skill.builtin ? '' : '<button class="sp-skill-btn sp-skill-edit" title="Editar" data-skill-id="' + spEscapeHtml(skill.id) + '">' + SP_SVG.edit + '</button>';
  var delBtn = skill.builtin ? '' : '<button class="sp-skill-btn sp-skill-del" title="Excluir" data-skill-id="' + spEscapeHtml(skill.id) + '">' + SP_SVG.trash + '</button>';
  return '<div class="sp-skill-card' + (skill.builtin ? ' sp-skill-card-builtin' : '') + '" data-skill-id="' + spEscapeHtml(skill.id) + '">' +
    '<div class="sp-skill-head">' +
      '<span class="sp-skill-icon">' + spEscapeHtml(icon) + '</span>' +
      '<div class="sp-skill-info">' +
        '<div class="sp-skill-name">' + name + builtinBadge + '</div>' +
        (desc ? '<div class="sp-skill-desc">' + desc + '</div>' : '') +
      '</div>' +
      '<div class="sp-skill-actions">' +
        '<button class="sp-skill-btn sp-skill-inject" title="Inserir no prompt" data-skill-id="' + spEscapeHtml(skill.id) + '">' + SP_SVG.arrowRight + '</button>' +
        editBtn + delBtn +
      '</div>' +
    '</div>' +
    (preview ? '<div class="sp-skill-preview">' + preview + '</div>' : '') +
  '</div>';
}

function spTemplateSkillsList(skills) {
  var builtins = (skills || []).filter(function(s){ return s.builtin; });
  var user = (skills || []).filter(function(s){ return !s.builtin; });
  var header = '<div class="sp-skills-toolbar">' +
    '<button class="sp-skills-new" id="sp-skill-new-btn">+ Nova Skill</button>' +
    '<span class="sp-skills-count">' + user.length + ' sua' + (user.length === 1 ? '' : 's') + ' · ' + builtins.length + ' Lovable</span>' +
  '</div>';
  var html = header;
  if (builtins.length) {
    html += '<div class="sp-skills-section-title">Lovable Built-in</div><div class="sp-skills-list">';
    for (var i = 0; i < builtins.length; i++) html += spTemplateSkillCard(builtins[i]);
    html += '</div>';
  }
  html += '<div class="sp-skills-section-title">Suas skills</div>';
  if (!user.length) { html += spTemplateSkillsEmpty(); }
  else {
    html += '<div class="sp-skills-list">';
    for (var j = 0; j < user.length; j++) html += spTemplateSkillCard(user[j]);
    html += '</div>';
  }
  return html;
}

function spTemplateSkillForm(skill) {
  skill = skill || { id: '', name: '', description: '', icon: '✦', content: '' };
  var isEdit = !!skill.id;
  return '<div class="sp-skill-form">' +
    '<div class="sp-skill-form-head">' +
      '<button class="sp-skill-back" id="sp-skill-back"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.arrowLeft + '</span> Voltar</button>' +
      '<span class="sp-skill-form-title">' + (isEdit ? 'Editar Skill' : 'Nova Skill') + '</span>' +
    '</div>' +
    '<input type="hidden" id="sp-skill-id" value="' + spEscapeHtml(skill.id) + '" />' +
    '<div class="sp-skill-field-row">' +
      '<div class="sp-skill-field" style="flex:0 0 70px">' +
        '<label>Ícone</label>' +
        '<input type="text" id="sp-skill-icon" maxlength="2" value="' + spEscapeHtml(skill.icon || '✦') + '" />' +
      '</div>' +
      '<div class="sp-skill-field" style="flex:1">' +
        '<label>Nome *</label>' +
        '<input type="text" id="sp-skill-name" placeholder="Ex: Refatorar componente" value="' + spEscapeHtml(skill.name || '') + '" />' +
      '</div>' +
    '</div>' +
    '<div class="sp-skill-field">' +
      '<label>Descrição</label>' +
      '<input type="text" id="sp-skill-desc" placeholder="Curta descrição (opcional)" value="' + spEscapeHtml(skill.description || '') + '" />' +
    '</div>' +
    '<div class="sp-skill-field">' +
      '<label>Conteúdo do prompt *</label>' +
      '<textarea id="sp-skill-content" rows="10" placeholder="Texto que será inserido no chat do Lovable...">' + spEscapeHtml(skill.content || '') + '</textarea>' +
    '</div>' +
    '<div class="sp-skill-form-actions">' +
      '<button class="sp-skill-cancel" id="sp-skill-cancel">Cancelar</button>' +
      '<button class="sp-skill-save" id="sp-skill-save">' + (isEdit ? 'Salvar alterações' : 'Criar skill') + '</button>' +
    '</div>' +
  '</div>';
}

function spTemplateSkillsPicker(skills) {
  if (!skills || !skills.length) {
    return '<div class="sp-skills-picker-empty">Nenhuma skill disponível.</div>';
  }
  var builtins = skills.filter(function(s){ return s.builtin; });
  var user = skills.filter(function(s){ return !s.builtin; });
  function renderItem(s) {
    return '<button class="sp-skills-picker-item" data-skill-id="' + spEscapeHtml(s.id) + '">' +
      '<span class="sp-skills-picker-icon">' + spEscapeHtml(s.icon || '✦') + '</span>' +
      '<span class="sp-skills-picker-name">' + spEscapeHtml(s.name) + '</span>' +
    '</button>';
  }
  var html = '';
  if (builtins.length) {
    html += '<div class="sp-skills-picker-section">Lovable Built-in</div><div class="sp-skills-picker-list">';
    for (var i = 0; i < builtins.length; i++) html += renderItem(builtins[i]);
    html += '</div>';
  }
  if (user.length) {
    html += '<div class="sp-skills-picker-section">Suas skills</div><div class="sp-skills-picker-list">';
    for (var j = 0; j < user.length; j++) html += renderItem(user[j]);
    html += '</div>';
  }
  return html;
}

function spTemplateChatEmpty() {
  return '<div class="sp-chat-empty">' +
    '<div class="sp-chat-empty-icon">' + SP_SVG.msgSq + '</div>' +
    '<div class="sp-chat-empty-title">Nenhuma mensagem</div>' +
    '<div class="sp-chat-empty-desc">Seus prompts enviados aparecerão aqui como histórico.</div>' +
  '</div>';
}

function spFormatChatDate(dateStr) {
  var d = new Date(dateStr);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = (today - msgDay) / 86400000;
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];
  return d.toLocaleDateString('pt-BR');
}

function spFormatChatTime(dateStr) {
  var d = new Date(dateStr);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function spTemplateChatBubble(msg) {
  var statusClass = msg.status === 'error' ? 'sp-chat-status-err' : 'sp-chat-status-ok';
  var statusText = msg.status === 'error' ? SP_SVG.x + ' Erro' : SP_SVG.check + ' Enviado';
  var truncated = msg.text.length > 300 ? spEscapeHtml(msg.text.substring(0, 300)) + '…' : spEscapeHtml(msg.text);
  return '<div class="sp-chat-bubble" title="' + spEscapeHtml(msg.text) + '">' +
    truncated +
    '<div class="sp-chat-meta">' +
      '<span class="sp-chat-status ' + statusClass + '">' + statusText + '</span>' +
      '<span class="sp-chat-time">' + spFormatChatTime(msg.timestamp) + '</span>' +
      '<span class="sp-chat-check">' + SP_SVG.check + '</span>' +
    '</div>' +
  '</div>';
}

function spTemplateChatHistory(messages) {
  if (!messages || !messages.length) return spTemplateChatEmpty();
  var html = '<div class="sp-chat-messages">';
  var lastDate = '';
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var dateLabel = spFormatChatDate(m.timestamp);
    if (dateLabel !== lastDate) {
      html += '<div class="sp-chat-date-divider"><span class="sp-chat-date-label">' + dateLabel + '</span></div>';
      lastDate = dateLabel;
    }
    html += spTemplateChatBubble(m);
  }
  html += '</div>';
  html += '<div class="sp-chat-actions">' +
    '<span class="sp-chat-count">' + messages.length + ' mensagen' + (messages.length === 1 ? '' : 's') + '</span>' +
    '<button class="sp-chat-clear" id="sp-chat-clear"><span style="vertical-align:middle;display:inline-flex">' + SP_SVG.trash + '</span> Limpar Histórico</button>' +
  '</div>';
  return html;
}
