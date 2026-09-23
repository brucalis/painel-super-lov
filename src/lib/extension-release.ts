export const CUSTOMER_EXTENSION_RELEASE = {
  version: "1.0.2 Stable",
  technicalVersion: "33.0.31",
  updatedAt: "23/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable.zip?v=1.0.2-stable",
  downloadName: "superlovable-1.0.2-stable.zip",
  changelog: [
    {
      version: "1.0.2 Stable",
      date: "23/09/2026",
      changes: [
        "O atalho de novo projeto agora abre diretamente a página inicial da Lovable, sem preencher ou enviar comandos automaticamente.",
      ],
    },
    {
      version: "1.0.1 Stable",
      date: "22/09/2026",
      changes: [
        "Remoção da identificação visual do projeto por alteração direta e segura no repositório conectado.",
        "Download do projeto em ZIP diretamente pelo GitHub, inclusive para repositórios privados autorizados.",
        "Mensagens mais claras quando a conta ou o projeto ainda precisam ser conectados.",
      ],
    },
    {
      version: "1.0 Stable",
      date: "14/09/2026",
      changes: [
        "Versão estável final desta fase, com pré-checagem silenciosa de licença, GitHub, projeto e IAs antes da execução.",
        "Proteção contra solicitações duplicadas, recuperação conservadora após recarga e diagnóstico técnico local sem armazenar segredos.",
        "Stack comercial consolidado em Mistral + Gemini + Cloudflare, mantendo detecção automática de projeto, histórico, parada e reversão de alterações.",
      ],
    },
  ],
} as const;

export const ADMIN_EXTENSION_RELEASE = {
  version: "32.0.49 Teste",
  updatedAt: "23/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable-admin-v32.0.49-teste.zip?v=32.0.49",
  downloadName: "superlovable-v32.0.49-teste-admin.zip",
} as const;

export const EXTENSION_RELEASE = CUSTOMER_EXTENSION_RELEASE;
