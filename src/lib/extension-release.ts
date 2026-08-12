// Fonte única para a versão exibida na home e no painel administrativo.
// Em toda nova versão, atualize version, updatedAt, downloadName e o ZIP.
// O changelog exibido na home é voltado ao cliente: registre apenas mudanças
// perceptíveis de funcionalidade, design, estabilidade ou desempenho. Detalhes
// internos de backend, APIs, infraestrutura e painel administrativo não entram.
export const EXTENSION_RELEASE = {
  version: "32.0.15",
  updatedAt: "11/08/2026 às 19:00 (horário de Brasília)",
  downloadPath: "/super-lovable.zip",
  downloadName: "superlovable-v32.0.15.zip",
  changelog: [
    {
      version: "32.0.15",
      date: "11/08/2026",
      changes: [
        "A licença agora é reconhecida após atualizar ou reinstalar no mesmo navegador.",
        "Mensagens mais claras quando a chave já estiver ativa em outro navegador ou dispositivo.",
      ],
    },
    {
      version: "32.0.14",
      date: "11/08/2026",
      changes: [
        "Otimização de prompts isolada do chat e do projeto Lovable do usuário.",
        "Maior disponibilidade e estabilidade da função Otimizar.",
      ],
    },
    {
      version: "32.0.13",
      date: "11/08/2026",
      changes: [
        "Melhorias de estabilidade na otimização de prompts.",
        "Removidos avisos indevidos relacionados às notificações sonoras.",
      ],
    },
    {
      version: "32.0.12",
      date: "11/08/2026",
      changes: [
        "Função Otimizar mais estável e confiável.",
        "Melhorias de desempenho e disponibilidade dos recursos de IA.",
      ],
    },
    {
      version: "32.0.11",
      date: "11/08/2026",
      changes: [
        "O texto aprimorado agora aparece corretamente no campo do prompt.",
        "Mensagens mais claras quando não for possível concluir uma otimização.",
      ],
    },
    {
      version: "32.0.10",
      date: "11/08/2026",
      changes: [
        "O botão Otimizar passou a aprimorar prompts com inteligência artificial.",
        "Otimização executada sem interferir no projeto aberto pelo usuário.",
      ],
    },
    {
      version: "32.0.9",
      date: "11/08/2026",
      changes: [
        "Maior estabilidade no envio de prompts e na sincronização com a Lovable.",
        "Nova paleta roxa aplicada à interface da extensão.",
      ],
    },
    {
      version: "32.0.8",
      date: "10/08/2026",
      changes: [
        "Nova identidade visual com fundo azul-marinho e superfícies em roxo-escuro.",
        "Botões e destaques atualizados com o gradiente rosa, fúcsia e violeta da marca.",
      ],
    },
    {
      version: "32.0.7",
      date: "10/08/2026",
      changes: [
        "Identidade e textos atualizados para Superlovable.",
        "Novo banner premium adicionado à extensão.",
        "Ícones e favicon substituídos pelo raio colorido com fundo transparente.",
      ],
    },
    {
      version: "32.0.6",
      date: "10/08/2026",
      changes: [
        "Identidade visual da extensão totalmente renovada.",
        "Removidas as referências visuais da marca anterior.",
      ],
    },
    {
      version: "32.0.5",
      date: "10/08/2026",
      changes: [
        "Ativação segura da extensão por chave de licença.",
        "Informações de versão e atualização adicionadas à página de download.",
      ],
    },
  ],
} as const;
