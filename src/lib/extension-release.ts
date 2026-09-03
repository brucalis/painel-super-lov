export const CUSTOMER_EXTENSION_RELEASE = {
  version: "03.09.S3",
  technicalVersion: "33.0.3",
  updatedAt: "03/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable.zip?v=03.09.S3",
  downloadName: "superlovable-03.09.S3.zip",
  changelog: [
    {
      version: "03.09.S3",
      date: "03/09/2026",
      changes: [
        "Configuração das conexões mais estável.",
        "Recuperação automática no armazenamento seguro das credenciais.",
      ],
    },
    {
      version: "03.09.S2",
      date: "03/09/2026",
      changes: [
        "Melhorias na interface e na integração.",
        "Correções de estabilidade na configuração inicial.",
      ],
    },
    {
      version: "03.09.S1",
      date: "03/09/2026",
      changes: [
        "Versão estável e robusta para uso contínuo.",
        "Execução automática de tarefas simples e complexas.",
        "Histórico de comandos preservado.",
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
