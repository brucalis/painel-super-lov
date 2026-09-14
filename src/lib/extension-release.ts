export const CUSTOMER_EXTENSION_RELEASE = {
  version: "12.09.S5",
  technicalVersion: "33.0.28",
  updatedAt: "14/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable.zip?v=12.09.S5",
  downloadName: "superlovable-12.09.S5.zip",
  changelog: [
    {
      version: "12.09.S5",
      date: "14/09/2026",
      changes: [
        "Corrigida a conexão da Mistral com rota dedicada no backend e ponte específica na extensão.",
        "A tela deixa de mascarar falhas da Mistral como backend antigo e passa a expor o erro real quando houver rejeição da API.",
        "Mantido o roteamento inteligente Mistral + Gemini + Cloudflare e o contexto otimizado.",
      ],
    },
    {
      version: "11.09.S4",
      date: "12/09/2026",
      changes: [
        "Corrigido o link para criação da chave da API Mistral para console.mistral.ai/api-keys.",
        "Mantido o stack inteligente Mistral + Gemini + Cloudflare e a otimização de contexto da versão S3.",
      ],
    },
    {
      version: "11.09.S3",
      date: "11/09/2026",
      changes: [
        "Mistral entra no stack comercial e OpenRouter é removido da edição do cliente.",
        "Roteamento inteligente: tarefas simples e médias priorizam Mistral; tarefas complexas priorizam Gemini; Cloudflare atua como contingência.",
        "Contexto enviado às IAs passa a ser reduzido conforme a complexidade do pedido para economizar tokens, saldo e tempo de resposta.",
        "A ferramenta funciona com pelo menos uma IA conectada, mas recomenda Mistral + Gemini + Cloudflare para máxima continuidade.",
      ],
    },
    {
      version: "11.09.S2",
      date: "11/09/2026",
      changes: [
        "Projeto Lovable aberto passa a ser identificado automaticamente e associado ao repositório quando o vínculo pode ser detectado.",
        "Depois da primeira associação manual, a Super Lovable memoriza o projeto e reduz a necessidade de selecionar repositório novamente.",
        "Onboarding do GitHub ficou progressivo e a atualização da extensão ganhou limpeza segura de cache sem remover login ou licença.",
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
  ],
} as const;

export const ADMIN_EXTENSION_RELEASE = {
  version: "32.0.44",
  updatedAt: "03/09/2026 (horário de Brasília)",
  downloadPath: "https://painel-super-lov.lovable.app/super-lovable-admin-v32.0.44.zip",
  downloadName: "superlovable-v32.0.44-admin.zip",
} as const;

export const EXTENSION_RELEASE = CUSTOMER_EXTENSION_RELEASE;
