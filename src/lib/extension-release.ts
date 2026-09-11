export const CUSTOMER_EXTENSION_RELEASE = {
  version: "11.09.S2",
  technicalVersion: "33.0.25",
  updatedAt: "11/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable.zip?v=11.09.S2",
  downloadName: "superlovable-11.09.S2.zip",
  changelog: [
    {
      version: "11.09.S2",
      date: "11/09/2026",
      changes: [
        "Projeto Lovable aberto passa a ser identificado automaticamente e associado ao repositório quando o vínculo pode ser detectado.",
        "Depois da primeira associação manual, a Super Lovable memoriza o projeto e reduz a necessidade de selecionar repositório novamente.",
        "Onboarding do GitHub ficou progressivo e a atualização da extensão ganhou limpeza segura de cache sem remover login ou licença.",
        "Cloudflare, Gemini e OpenRouter continuam usando exclusivamente as credenciais informadas pelo próprio usuário.",
      ],
    },
    {
      version: "11.09.S1",
      date: "11/09/2026",
      changes: [
        "Fluxo das inteligências mais rápido e previsível durante contingências.",
        "Diagnóstico de conexão e recuperação automática mais consistentes.",
      ],
    },
    {
      version: "10.09.S1",
      date: "10/09/2026",
      changes: [
        "Mais estabilidade na execução de solicitações longas e tarefas em etapas.",
        "Recuperação automática aprimorada para manter o trabalho em andamento.",
      ],
    },
    {
      version: "09.09.S10",
      date: "09/09/2026",
      changes: [
        "Hotfix de desempenho: removido o loop de MutationObserver do controle Parar execução.",
        "A validação da licença e o carregamento inicial deixam de sofrer re-renderizações contínuas.",
        "O botão Parar execução continua disponível durante tarefas ativas por monitoramento leve, somente enquanto há execução.",
      ],
    },
    {
      version: "09.09.S9",
      date: "09/09/2026",
      changes: [
        "Parar execução permanece visível durante toda a tarefa, inclusive ao navegar entre Prompt e Histórico.",
        "Histórico local passa a consolidar registros duplicados e mantém run ID, commit e repositório da execução real.",
        "Rollback direto envia também o SHA do commit e o backend reforça a sincronização mínima necessária para histórico e reversão.",
      ],
    },
    {
      version: "09.09.S8",
      date: "09/09/2026",
      changes: [
        "Histórico passa a registrar também comandos capturados diretamente do chat da Lovable.",
        "Commits diretos ficam disponíveis na aba GitHub com link e reversão mesmo quando o histórico remoto demora a sincronizar.",
        "O botão Parar execução passa a aparecer em qualquer execução ativa, inclusive comandos disparados pelo chat da Lovable.",
      ],
    },
    {
      version: "09.09.S7",
      date: "09/09/2026",
      changes: [
        "Hotfix de desempenho no controle Parar execução.",
        "O monitoramento de parada não acompanha mais cada alteração de texto da interface durante login e validação da licença.",
        "A validação inicial e o carregamento da página ficam mais leves, mantendo o botão Parar execução somente durante tarefas ativas.",
      ],
    },
    {
      version: "09.09.S6",
      date: "09/09/2026",
      changes: [
        "Execuções em andamento ganham o botão Parar execução.",
        "Ao interromper, novas etapas, tentativas e retomadas automáticas são canceladas e o usuário pode enviar um novo comando.",
        "Se um commit já tiver sido confirmado antes da interrupção, ele permanece no histórico e pode ser desfeito pela ação de reversão.",
      ],
    },
    {
      version: "09.09.S5",
      date: "09/09/2026",
      changes: [
        "Histórico passa a mostrar links dos commits da Super Lovable no GitHub.",
        "A aba GitHub recupera commits pelo histórico local quando o backend ainda não os lista.",
        "Prompts e GitHub ganham ação para desfazer a última alteração com commit de reversão na main.",
      ],
    },
    {
      version: "09.09.S4",
      date: "09/09/2026",
      changes: [
        "Cloudflare passa a ser a IA principal obrigatória.",
        "Gemini vira a segunda tentativa opcional e OpenRouter fica como última contingência.",
        "Grok foi removido da interface comercial e o diagnóstico de backend desatualizado ficou mais claro.",
      ],
    },
    {
      version: "09.09.S3",
      date: "09/09/2026",
      changes: [
        "Grok (xAI) e Cloudflare Workers AI passam a formar a dupla principal obrigatória.",
        "Gemini e OpenRouter ficam como contingências opcionais no fluxo Grok → Cloudflare → Gemini → OpenRouter.",
        "Falhas temporárias mantêm as credenciais salvas e acionam automaticamente o próximo provedor disponível.",
      ],
    },
    {
      version: "09.09.S2",
      date: "09/09/2026",
      changes: [
        "OpenRouter passa a usar diretamente a rota de credenciais já registrada e aceita pelo backend.",
        "Nova versão e URL de download evitam reutilização do ZIP 09.09.S1 em cache do navegador/CDN.",
      ],
    },
    {
      version: "09.09.S1",
      date: "09/09/2026",
      changes: [
        "OpenRouter adicionado ao fluxo comercial de contingência.",
        "Melhorias de diagnóstico na configuração das credenciais de IA.",
      ],
    },
    {
      version: "08.09.S3",
      date: "08/09/2026",
      changes: [
        "OpenRouter adicionado como terceira IA de contingência.",
        "A ferramenta permanece conectada quando uma API temporariamente atinge limite; as demais assumem automaticamente.",
      ],
    },
    { version: "08.09.S2", date: "08/09/2026", changes: ["Processamento mais rápido e previsível.", "Melhorias de fluidez em solicitações completas."] },
    { version: "08.09.S1", date: "08/09/2026", changes: ["Maior estabilidade em solicitações complexas.", "Execução e recuperação de etapas mais eficientes."] },
    { version: "04.09.S5", date: "04/09/2026", changes: ["Mais liberdade para gerenciar suas conexões.", "Melhorias de segurança e navegação."] },
    { version: "04.09.S4", date: "04/09/2026", changes: ["Melhorias no acompanhamento das licenças.", "Informações de ativação mais claras e consistentes."] },
    { version: "04.09.S3", date: "04/09/2026", changes: ["Melhorias na navegação e nas configurações.", "Gestão de projetos e informações da licença mais práticas."] },
    { version: "04.09.S2", date: "04/09/2026", changes: ["Melhorias de estabilidade em tarefas complexas.", "Processamento contínuo mais previsível e seguro."] },
    { version: "04.09.S1", date: "04/09/2026", changes: ["Correções de desempenho e validação.", "Acompanhamento de execução mais leve e estável."] },
    { version: "03.09.S4", date: "03/09/2026", changes: ["Melhorias na organização da interface.", "Acompanhamento e recuperação mais estáveis durante as alterações."] },
    { version: "03.09.S3", date: "03/09/2026", changes: ["Configuração das conexões mais estável.", "Recuperação automática no armazenamento seguro das credenciais."] },
    { version: "03.09.S2", date: "03/09/2026", changes: ["Melhorias na interface e na integração.", "Correções de estabilidade na configuração inicial."] },
    { version: "03.09.S1", date: "03/09/2026", changes: ["Versão estável e robusta para uso contínuo.", "Execução automática de tarefas simples e complexas.", "Histórico de comandos preservado."] },
  ],
} as const;

export const ADMIN_EXTENSION_RELEASE = {
  version: "32.0.44",
  updatedAt: "03/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable-admin-v32.0.44.zip",
  downloadName: "superlovable-v32.0.44-admin.zip",
} as const;

export const EXTENSION_RELEASE = CUSTOMER_EXTENSION_RELEASE;