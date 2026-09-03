export const CUSTOMER_EXTENSION_RELEASE = {
  version: "03.09.S1",
  technicalVersion: "33.0.1",
  updatedAt: "03/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable.zip?v=03.09.S1",
  downloadName: "superlovable-03.09.S1.zip",
  changelog: [
    {
      version: "03.09.S1",
      date: "03/09/2026",
      changes: [
        "Interface aprimorada para uma configuração mais simples, clara e intuitiva.",
        "Integrações otimizadas para oferecer mais estabilidade e continuidade durante o uso.",
        "Execução automática de tarefas simples e complexas, com continuidade inteligente em todas as etapas.",
        "Maior agilidade na aplicação das alterações, reduzindo interrupções e ações manuais durante o processo.",
        "Histórico de comandos preservado para facilitar consultas, acompanhamento e reutilização.",
        "Proteção avançada das informações e funcionamento otimizado para uso contínuo.",
      ],
    },
  ],
} as const;

export const ADMIN_EXTENSION_RELEASE = {
  version: "32.0.44",
  updatedAt: "03/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable-admin-v32.0.44.zip",
  downloadName: "superlovable-v32.0.44-admin.zip",
} as const;

// Compatibilidade: a home pública sempre aponta para a edição comercial.
export const EXTENSION_RELEASE = CUSTOMER_EXTENSION_RELEASE;
