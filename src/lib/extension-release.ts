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
        "Edição comercial com conexão única da chave de API OpenAI de cada cliente.",
        "A chave é validada e criptografada no servidor; nunca fica salva no navegador nem aparece nos logs.",
        "Cada cliente utiliza os créditos e limites da própria conta OpenAI.",
        "Integração GitHub, execução automática de prompts complexos, commits diretos na main e histórico preservados.",
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
