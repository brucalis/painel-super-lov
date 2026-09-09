export const CUSTOMER_EXTENSION_RELEASE = {
  version: "09.09.S7",
  technicalVersion: "33.0.19",
  updatedAt: "09/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable.zip?v=09.09.S7",
  downloadName: "superlovable-09.09.S7.zip",
  changelog: [
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
