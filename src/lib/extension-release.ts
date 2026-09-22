export const CUSTOMER_EXTENSION_RELEASE = {
  version: "1.0.1 Stable",
  technicalVersion: "33.0.30",
  updatedAt: "22/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable.zip?v=1.0.1-stable",
  downloadName: "superlovable-1.0.1-stable.zip",
  changelog: [
    {
      version: "1.0.1 Stable",
      date: "22/09/2026",
      changes: [
        "Remoção da identificação visual do projeto por alteração direta e segura no repositório conectado.",
        "Download do projeto em ZIP diretamente pelo GitHub, inclusive para repositórios privados autorizados.",
        "Mensagens mais claras quando a conta ou o projeto ainda precisam ser conectados.",
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

export const EXTENSION_RELEASE = CUSTOMER_EXTENSION_RELEASE;
