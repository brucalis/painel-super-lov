// Fonte única para a versão exibida na home e no painel administrativo.
// Em toda nova versão, atualize version, updatedAt, downloadName, o ZIP e
// adicione a nova entrada no início de changelog.
export const EXTENSION_RELEASE = {
  version: "32.0.11",
  updatedAt: "11/08/2026 às 17:10 (horário de Brasília)",
  downloadPath: "/super-lovable.zip",
  downloadName: "superlovable-v32.0.11.zip",
  changelog: [
    {
      version: "32.0.11",
      date: "11/08/2026",
      changes: [
        "Corrigido o botão Otimizar para tratar corretamente falhas HTTP do Lovable AI.",
        "O texto otimizado agora atualiza o campo e dispara os eventos de edição da interface.",
        "Adicionadas mensagens de erro claras para sessão, créditos, limite e indisponibilidade da IA.",
      ],
    },
    {
      version: "32.0.10",
      date: "11/08/2026",
      changes: [
        "O botão Otimizar agora usa o Lovable AI do projeto Super Lovable.",
        "Removida a dependência do endpoint de IA pertencente à ferramenta anterior.",
        "Otimização isolada do projeto do cliente, com autenticação da licença e proteção contra abuso.",
      ],
    },
    {
      version: "32.0.9",
      date: "11/08/2026",
      changes: [
        "Base funcional da versão 32.0.7 restaurada para o envio e a sincronização.",
        "Paleta roxa aplicada exclusivamente nos arquivos visuais, sem alterar a lógica da extensão.",
        "Corrigida a falha de inicialização do service worker presente na versão 32.0.8.",
      ],
    },
    {
      version: "32.0.8",
      date: "10/08/2026",
      changes: [
        "Versão substituída pela 32.0.9 devido a uma falha no carregamento do service worker.",
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
