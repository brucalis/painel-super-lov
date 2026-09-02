// Fonte única para a versão exibida na home e no painel administrativo.
// Em toda nova versão, atualize version, updatedAt, downloadName e o ZIP.
// O changelog exibido na home é voltado ao cliente: registre apenas mudanças
// perceptíveis de funcionalidade, design, estabilidade ou desempenho.
export const EXTENSION_RELEASE = {
  version: "32.0.41",
  updatedAt: "02/09/2026 (horário de Brasília)",
  downloadPath: "/super-lovable-v32.0.41.zip?v=32.0.41-history",
  downloadName: "superlovable-v32.0.41.zip",
  changelog: [
    {
      version: "32.0.41",
      date: "02/09/2026",
      changes: [
        "O histórico de prompts agora permanece disponível mesmo depois de atualizar a página da Lovable.",
        "A aba Histórico ganhou uma visualização separada dos commits da Super Lovable, com acesso direto às alterações no GitHub.",
        "Pedidos mais complexos agora tentam se recuperar automaticamente quando uma IA interrompe a resposta antes de concluir o plano.",
      ],
    },
    {
      version: "32.0.40",
      date: "02/09/2026",
      changes: [
        "As alterações passaram a ser aplicadas diretamente na branch principal do projeto, sem criar Pull Request.",
        "O fluxo ficou mais rápido e elimina a etapa manual de revisão e merge no GitHub.",
        "A opção Desfazer também passou a operar diretamente na branch principal quando não existem alterações posteriores conflitantes.",
      ],
    },
    {
      version: "32.0.39",
      date: "01/09/2026",
      changes: [
        "A conexão segura com o validador passou a ser conferida antes de iniciar alterações.",
        "A comunicação com a VPS ficou mais resistente a falhas de autenticação.",
        "Alterações visuais simples deixaram de exigir revisão apenas pela localização dos arquivos.",
      ],
    },
    {
      version: "32.0.38",
      date: "01/09/2026",
      changes: [
        "O resultado de cada alteração passou a informar o estado da validação com mais clareza.",
        "Melhorias na apresentação dos detalhes de cada execução.",
      ],
    },
  ],
} as const;
