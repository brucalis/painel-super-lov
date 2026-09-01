// Fonte única para a versão exibida na home e no painel administrativo.
// Em toda nova versão, atualize version, updatedAt, downloadName e o ZIP.
// O changelog exibido na home é voltado ao cliente: registre apenas mudanças
// perceptíveis de funcionalidade, design, estabilidade ou desempenho. Detalhes
// internos de backend, APIs, infraestrutura e painel administrativo não entram.
export const EXTENSION_RELEASE = {
  version: "32.0.38",
  updatedAt: "01/09/2026 (horário de Brasília)",
  downloadPath: "/super-lovable-v32.0.38.zip?v=32.0.38-execution-result",
  downloadName: "superlovable-v32.0.38.zip",
  changelog: [
    {
      version: "32.0.38",
      date: "01/09/2026",
      changes: [
        "O resultado de cada alteração agora informa claramente se o build foi aprovado ou precisa de revisão.",
        "Alterações que exigem revisão mantêm o projeto principal protegido e exibem um botão direto para o Pull Request.",
        "O GitHub não abre mais sozinho: o usuário decide quando deseja consultar os detalhes da execução.",
      ],
    },
    {
      version: "32.0.37",
      date: "01/09/2026",
      changes: [
        "A extensão verifica automaticamente se o ambiente de validação está disponível antes de iniciar uma alteração.",
        "Quando o validador estiver temporariamente indisponível, o usuário recebe uma orientação clara para tentar novamente.",
        "O pacote de instalação agora usa um arquivo versionado para evitar downloads antigos armazenados pelo navegador.",
      ],
    },
    {
      version: "32.0.36",
      date: "31/08/2026",
      changes: [
        "Alterações agora podem passar por um build isolado antes de serem aplicadas ao projeto principal.",
        "Falhas de instalação ou compilação mantêm a mudança em revisão sem interromper o projeto publicado.",
        "A validação usa limites de tempo, memória e processamento para manter o serviço estável.",
      ],
    },
    {
      version: "32.0.35",
      date: "31/08/2026",
      changes: [
        "Agora é possível desfazer imediatamente a última alteração aplicada pelo agente.",
        "A reversão modifica somente os arquivos daquela execução, preservando o restante do projeto.",
        "Se houver alterações posteriores nos mesmos arquivos, a extensão solicita revisão antes de continuar.",
      ],
    },
    {
      version: "32.0.34",
      date: "31/08/2026",
      changes: [
        "Cada alteração agora recebe uma classificação automática de risco antes de chegar ao projeto principal.",
        "Arquivos sensíveis, credenciais e operações destrutivas são bloqueados antes do envio.",
        "Mudanças simples continuam automáticas; configurações e áreas críticas pedem revisão preventiva.",
      ],
    },
    {
      version: "32.0.33",
      date: "31/08/2026",
      changes: [
        "Alterações agora passam por uma branch segura e um Pull Request antes de chegar ao projeto principal.",
        "Quando o GitHub exigir revisão, a extensão abre automaticamente a tela correta sem forçar a mudança.",
        "A conexão GitHub mantém a experiência rápida e registra melhor cada alteração aplicada.",
      ],
    },
    {
      version: "32.0.32",
      date: "18/08/2026",
      changes: [
        "O agente agora entende a estrutura real de qualquer projeto antes de escolher os arquivos necessários.",
        "Pedidos simples e complexos usam contexto progressivo para reduzir falhas e acelerar o processamento.",
        "A seleção de outra inteligência artificial acontece automaticamente quando o serviço principal estiver indisponível.",
      ],
    },
    {
      version: "32.0.29",
      date: "18/08/2026",
      changes: [
        "O agente encontra arquivos equivalentes mesmo quando a IA informa uma pasta ou capitalização diferente.",
        "Projetos com rotas e componentes organizados de formas diferentes agora continuam o processamento.",
        "Arquivos principais do projeto são priorizados para reduzir novas chamadas à inteligência artificial.",
      ],
    },
    {
      version: "32.0.28",
      date: "18/08/2026",
      changes: [
        "O agente busca automaticamente arquivos adicionais solicitados pela IA.",
        "Pedidos de contexto agora continuam o processamento sem interromper a tarefa.",
      ],
    },
    {
      version: "32.0.27",
      date: "18/08/2026",
      changes: [
        "O agente reduz automaticamente o contexto antes de acionar a IA de contingência.",
        "Falhas de limite agora liberam a tarefa e permitem tentar novamente com contexto reduzido.",
        "O acompanhamento informa a falha sem deixar o processamento travado.",
      ],
    },
    {
      version: "32.0.26",
      date: "17/08/2026",
      changes: [
        "Pesquisa por qualquer trecho do nome facilita encontrar projetos no GitHub Sync.",
        "Acompanhamento visual mostra cada etapa da análise até a publicação do commit.",
        "Identificação da licença vitalícia ficou mais compacta para ampliar a área de trabalho.",
      ],
    },
    {
      version: "32.0.25",
      date: "17/08/2026",
      changes: [
        "Novo agente para preparar alterações no código e enviá-las pelo GitHub Sync.",
        "Conexão do GitHub e seleção do projeto feitas apenas na primeira utilização.",
        "Resumo dos arquivos alterados exibido antes da confirmação do commit.",
      ],
    },
    {
      version: "32.0.24",
      date: "17/08/2026",
      changes: [
        "Novo modo experimental para selecionar e editar elementos diretamente no preview.",
        "Pedidos incompatíveis com edição visual segura agora são identificados antes da execução.",
        "Histórico de uma etapa permite desfazer a última alteração aplicada no preview.",
      ],
    },
    {
      version: "32.0.23",
      date: "17/08/2026",
      changes: [
        "Envio de comandos restaurado sem depender do servidor da extensão anterior.",
        "Maior estabilidade na comunicação com o projeto aberto na Lovable.",
      ],
    },
    {
      version: "32.0.22",
      date: "13/08/2026",
      changes: [
        "O período contratado agora começa somente na primeira ativação da licença.",
        "Contador de tempo restante corrigido e disponível nos planos temporários.",
        "Planos vitalício e revenda continuam sem contagem regressiva.",
      ],
    },
    {
      version: "32.0.21",
      date: "12/08/2026",
      changes: [
        "Funcionamento estável da versão 32.0.18 restaurado no pacote de instalação.",
        "Correção do erro de token ao abrir e utilizar a extensão.",
        "Ativação disponível pela chave de licença ou pelo e-mail usado na compra.",
      ],
    },
    {
      version: "32.0.20",
      date: "12/08/2026",
      changes: [
        "Agora você pode ativar a extensão com a chave de licença ou com o e-mail usado na compra.",
        "Orientações de ativação mais claras na extensão e na página de download.",
      ],
    },
    {
      version: "32.0.19",
      date: "12/08/2026",
      changes: [
        "Pacote de instalação protegido contra cópias e alterações não autorizadas.",
        "Otimizações internas no arquivo distribuído, sem mudanças na experiência de uso.",
      ],
    },
    {
      version: "32.0.18",
      date: "11/08/2026",
      changes: [
        "Sessão da licença mais estável durante o uso e entre várias abas do mesmo navegador.",
        "Separação mais confiável entre perfis do Chrome e dispositivos diferentes.",
      ],
    },
    {
      version: "32.0.17",
      date: "11/08/2026",
      changes: [
        "Melhor reconhecimento da licença ao reinstalar no mesmo navegador.",
        "Mensagens de ativação adaptadas a diferentes tamanhos de tela e zoom.",
      ],
    },
    {
      version: "32.0.16",
      date: "11/08/2026",
      changes: [
        "A reinstalação no mesmo perfil do navegador agora recupera a licença sem consumir outro dispositivo.",
        "Novas orientações para licença inválida, expirada ou já utilizada no limite permitido.",
        "Aviso de renovação nos três dias finais dos planos semanal, mensal e anual.",
      ],
    },
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
