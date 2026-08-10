// Fonte única para a versão exibida na home e no painel administrativo.
// Em toda nova versão, atualize version, updatedAt, downloadName, o ZIP e
// adicione a nova entrada no início de changelog.
export const EXTENSION_RELEASE = {
  version: "32.0.8",
  updatedAt: "10/08/2026 às 19:25 (horário de Brasília)",
  downloadPath: "/super-lovable.zip",
  downloadName: "superlovable-v32.0.8.zip",
  changelog: [
    {
      version: "32.0.8",
      date: "10/08/2026",
      changes: [
        "Nova identidade visual com fundo azul-marinho e superfícies em roxo-escuro.",
        "Botões e destaques atualizados com o gradiente rosa, fúcsia e violeta da marca.",
        "Pacote de download da home substituído pela nova versão e otimizado.",
      ],
    },
    {
      version: "32.0.7",
      date: "10/08/2026",
      changes: [
        "Identidade e textos corrigidos para Superlovable.",
        "Novo banner premium incluído e comprimido para reduzir o tamanho do pacote.",
        "Ícones e favicon substituídos pelo raio colorido com fundo transparente.",
      ],
    },
    {
      version: "32.0.6",
      date: "10/08/2026",
      changes: [
        "Primeira atualização completa da identidade visual da extensão.",
        "Substituição das referências visuais da antiga marca Fênix.",
        "Novo banner e conjunto de ícones adicionados ao pacote.",
      ],
    },
    {
      version: "32.0.5",
      date: "10/08/2026",
      changes: [
        "Extensão integrada ao projeto do painel de licenças.",
        "Validação real da chave, licença e dispositivo pelos endpoints do painel.",
        "Download centralizado na home com versão, data e horário da atualização.",
      ],
    },
  ],
} as const;
