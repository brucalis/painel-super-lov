export const CREDIT_BADGES = Object.freeze({
  NO_BUILD_CREDITS: 'Não consome créditos de construção',
  EXTERNAL_COST: 'Pode gerar custo externo',
  LOVABLE_CREDITS: 'Pode consumir créditos da Lovable'
});

export const HELP_GUIDES = Object.freeze([
  {
    id: 'lovable-github',
    category: 'Lovable',
    title: 'Conectar o projeto da Lovable ao GitHub',
    summary: 'Vincule o projeto ao repositório que a Super Lovable editará.',
    badge: CREDIT_BADGES.NO_BUILD_CREDITS,
    tone: 'safe',
    steps: [
      'Abra o projeto correto na Lovable.',
      'Entre nas configurações do projeto e localize GitHub.',
      'Autorize a conta e escolha o repositório desejado.',
      'Confirme a branch principal e aguarde a primeira sincronização.',
      'Volte para a Super Lovable e atualize a lista de projetos.'
    ],
    warning: 'Não envie uma mensagem ao agente da Lovable para fazer essa conexão. Use a área de configurações do projeto.'
  },
  {
    id: 'lovable-cloud',
    category: 'Lovable',
    title: 'Ativar o Lovable Cloud',
    summary: 'Ative banco, autenticação, armazenamento e funções quando o projeto exigir esses recursos.',
    badge: CREDIT_BADGES.EXTERNAL_COST,
    tone: 'attention',
    steps: [
      'Abra Project Settings no projeto correto.',
      'Acesse Cloud e clique em ativar.',
      'Escolha a região adequada.',
      'Revise os limites e o saldo de infraestrutura.',
      'Volte para a extensão e execute novamente o diagnóstico.'
    ],
    warning: 'A ativação não é uma mensagem de construção, mas o uso da infraestrutura pode consumir saldo Cloud.'
  },
  {
    id: 'supabase-connect',
    category: 'Supabase',
    title: 'Conectar uma conta Supabase',
    summary: 'Autorize somente os projetos que deseja administrar pela extensão.',
    badge: CREDIT_BADGES.EXTERNAL_COST,
    tone: 'attention',
    steps: [
      'Abra Integrações na Super Lovable.',
      'Clique em Conectar Supabase.',
      'Conclua a autorização na página oficial.',
      'Selecione o projeto Supabase correto.',
      'Execute o diagnóstico antes de aplicar migrations ou RLS.'
    ],
    warning: 'A conexão não consome créditos da Lovable. O Supabase pode aplicar os limites do plano da conta.'
  },
  {
    id: 'publish-update',
    category: 'Publicação',
    title: 'Atualizar o projeto publicado',
    summary: 'Publique a versão que já foi sincronizada pelo GitHub.',
    badge: CREDIT_BADGES.NO_BUILD_CREDITS,
    tone: 'safe',
    steps: [
      'Confirme na extensão que o commit foi concluído.',
      'Aguarde a sincronização do GitHub com a Lovable.',
      'Abra a área Publish do projeto.',
      'Clique em Update ou publique a nova versão.',
      'Abra o endereço público e confirme a alteração.'
    ],
    warning: 'Não peça ao agente para publicar. Use o controle de publicação da interface.'
  },
  {
    id: 'custom-domain',
    category: 'Publicação',
    title: 'Adicionar domínio personalizado',
    summary: 'Configure o domínio diretamente no painel do projeto e no provedor de DNS.',
    badge: CREDIT_BADGES.EXTERNAL_COST,
    tone: 'attention',
    steps: [
      'Abra as configurações de domínio do projeto.',
      'Informe o domínio que será usado.',
      'Copie os registros DNS apresentados.',
      'Cadastre os registros no provedor do domínio.',
      'Aguarde a validação e ative o domínio.'
    ],
    warning: 'A configuração não consome créditos de construção, mas o registro do domínio pode ter custo próprio.'
  },
  {
    id: 'secrets',
    category: 'Segurança',
    title: 'Cadastrar secrets e chaves privadas',
    summary: 'Armazene credenciais no ambiente seguro, nunca no código ou em anexos.',
    badge: CREDIT_BADGES.NO_BUILD_CREDITS,
    tone: 'safe',
    steps: [
      'Abra o painel seguro do provedor usado pelo backend.',
      'Crie o secret com o nome exato esperado pelo projeto.',
      'Cole o valor somente no campo protegido.',
      'Salve e execute um teste da integração.',
      'Confirme que nenhuma chave foi incluída no repositório.'
    ],
    warning: 'Nunca envie service_role, chaves secretas ou tokens em prompts, anexos ou arquivos versionados.'
  },
  {
    id: 'webhooks',
    category: 'Integrações',
    title: 'Configurar um webhook externo',
    summary: 'Cadastre o endpoint gerado pelo projeto no serviço que enviará os eventos.',
    badge: CREDIT_BADGES.EXTERNAL_COST,
    tone: 'attention',
    steps: [
      'Crie ou publique o endpoint receptor.',
      'Copie a URL HTTPS do endpoint.',
      'Abra o painel da plataforma que enviará o evento.',
      'Cadastre a URL e selecione somente os eventos necessários.',
      'Envie um teste e confira os logs e a assinatura do webhook.'
    ],
    warning: 'A configuração não consome créditos da Lovable, mas funções, tráfego e serviços externos podem ter cobrança.'
  },
  {
    id: 'avoid-agent',
    category: 'Créditos',
    title: 'Evitar consumo acidental de créditos',
    summary: 'Use a extensão e as áreas administrativas, sem enviar comandos ao agente da Lovable.',
    badge: CREDIT_BADGES.LOVABLE_CREDITS,
    tone: 'danger',
    steps: [
      'Faça as edições no campo da Super Lovable.',
      'Confirme o repositório e a branch antes de executar.',
      'Use configurações, Publish, Cloud e domínio diretamente nos respectivos painéis.',
      'Não cole o mesmo comando no chat da Lovable.',
      'Confira o histórico e o commit antes de publicar.'
    ],
    warning: 'Mensagens enviadas ao Agent Mode ou Plan Mode podem consumir créditos da conta Lovable.'
  }
]);

export function findGuide(id) {
  return HELP_GUIDES.find((guide) => guide.id === id) || null;
}

export function searchGuides(term = '') {
  const normalized = String(term).trim().toLocaleLowerCase('pt-BR');
  if (!normalized) return HELP_GUIDES;
  return HELP_GUIDES.filter((guide) => [guide.title, guide.summary, guide.category, guide.warning]
    .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalized)));
}
