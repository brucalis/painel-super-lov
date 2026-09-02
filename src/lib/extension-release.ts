// Fonte única para a versão exibida na home e no painel administrativo.
// Em toda nova versão, atualize version, updatedAt, downloadName e o ZIP.
// O changelog exibido na home é voltado ao cliente: registre apenas mudanças
// perceptíveis de funcionalidade, design, estabilidade ou desempenho.
export const EXTENSION_RELEASE = {
  version: "32.0.43",
  updatedAt: "02/09/2026 (horário de Brasília)",
  downloadPath:
    "https://raw.githubusercontent.com/brucalis/painel-super-lov/main/public/super-lovable-v32.0.43.zip?v=32.0.43-resilient",
  downloadName: "superlovable-v32.0.43.zip",
  changelog: [
    {
      version: "32.0.43",
      date: "02/09/2026",
      changes: [
        "Falhas recuperáveis durante a execução agora são tratadas automaticamente, sem exigir que o usuário clique para retomar a tarefa.",
        "O agente relê a main e refaz edições quando um trecho mudou, ficou ambíguo ou a IA devolveu uma resposta incompleta.",
        "Commits diretos ficaram idempotentes: se a resposta se perder depois da gravação, a extensão reconhece o commit já aplicado em vez de duplicar a alteração.",
        "Limites temporários e falhas de comunicação recebem novas tentativas com espera progressiva e preservação das etapas já concluídas.",
      ],
    },
    {
      version: "32.0.42",
      date: "02/09/2026",
      changes: [
        "Pedidos complexos agora são divididos automaticamente em etapas menores e coordenadas antes da execução.",
        "Cada etapa é aplicada sequencialmente na main, reduzindo respostas muito grandes da IA e melhorando a estabilidade em projetos com muitos arquivos.",
        "Se uma tarefa em etapas for interrompida, a extensão preserva o progresso e permite continuar do ponto em que parou.",
      ],
    },
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
  ],
} as const;
