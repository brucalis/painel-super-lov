# SUPER LOVABLE V2 — Licença e identidade do dispositivo

## Objetivos desta etapa

1. Não contar uma atualização da extensão como um novo dispositivo.
2. Não contar uma reinstalação comum no mesmo perfil do navegador como um novo dispositivo.
3. Não mostrar a tela de ativação por alguns segundos quando a licença já está válida.
4. Bloquear corretamente licenças expiradas, revogadas ou acima do limite.
5. Permitir indisponibilidade curta do servidor sem bloquear imediatamente um cliente válido.

## Limitação real do navegador

Uma extensão isolada não possui acesso confiável ao número de série da máquina, placa-mãe, disco ou outro identificador permanente de hardware. Isso é positivo para privacidade.

Também não existe garantia de que `chrome.storage.local` sobreviva quando o usuário:

- remove a extensão marcando a opção para apagar os dados;
- limpa manualmente os dados do navegador;
- cria outro perfil do Chrome;
- usa outro navegador Chromium;
- formata o computador.

Portanto, existem dois níveis diferentes:

### Mesmo perfil do navegador

A identidade criada em `chrome.storage.local` permanece estável em atualizações e normalmente também em reinstalações comuns. Esse caso é resolvido pelo módulo `device-identity.js`.

### Outro perfil do Chrome ou dados apagados

A extensão sozinha não consegue provar com 100% de segurança que é a mesma máquina. Para resolver sem aumentar manualmente o limite, o servidor de licenças precisa aplicar uma política de recuperação idempotente.

## Política recomendada no servidor

O endpoint de validação deve aceitar:

```json
{
  "licenseKey": "LVA-XXXX-XXXX-XXXX-XXXX",
  "deviceId": "SLD-...",
  "installationId": "SLD-...",
  "extensionVersion": "2.0.0",
  "reason": "activation | cache-stale | device-migration | manual"
}
```

Resposta mínima:

```json
{
  "status": "active",
  "plan": "annual",
  "expiresAt": "2027-08-04T23:59:59.000Z",
  "deviceId": "server-device-record-id",
  "message": null
}
```

Estados reconhecidos:

- `active`, `valid` ou `enabled`;
- `expired`;
- `device_limit`;
- `revoked`, `blocked` ou `disabled`.

## Regra idempotente obrigatória

Ativar novamente a mesma combinação `licenseKey + deviceId` nunca deve consumir outra vaga.

No banco, deve existir uma restrição única equivalente a:

```sql
UNIQUE (license_id, device_fingerprint)
```

A operação de ativação deve ser um `upsert`, não um `insert` simples.

Exemplo lógico:

```text
se já existe vínculo da licença com esse deviceId:
    atualizar last_seen_at e extension_version
    retornar ativo
senão se quantidade ativa < limite permitido:
    criar vínculo
    retornar ativo
senão:
    retornar device_limit
```

## Recuperação quando o ID local foi perdido

Para outro perfil ou armazenamento apagado, recomenda-se um fluxo explícito e seguro. Opções:

1. Cliente informa a chave e recebe um código no e-mail da compra.
2. Após confirmar o código, o servidor substitui o dispositivo mais antigo pelo novo.
3. O painel pode permitir “desconectar dispositivo anterior”.
4. Aplicar limite de trocas, por exemplo, duas recuperações a cada 30 dias.

Não é recomendado criar fingerprint invasiva com canvas, fontes, IP ou características de hardware. Além de instável, isso cria riscos de privacidade e falsos positivos.

## Carregamento sem piscar a tela de ativação

A ordem correta é:

1. HTML abre em `data-license-view="booting"`.
2. Apenas um pequeno estado de carregamento neutro aparece.
3. A sessão local é lida.
4. Se o cache válido estiver fresco, a interface principal abre imediatamente.
5. A validação remota ocorre em segundo plano.
6. A tela de ativação só aparece quando o resultado realmente exigir ativação.

Nunca renderizar a tela de licença como estado inicial padrão.

## Cache e segurança

- Cache fresco: 10 minutos.
- Tolerância offline sugerida: 24 horas após a última validação válida.
- A tolerância offline nunca ultrapassa a data de expiração.
- Respostas de expiração, revogação ou limite de dispositivos substituem o cache.
- O cache melhora a experiência, mas não substitui a autoridade do servidor.

## Arquivos desta etapa

- `extension/v2/core/device-identity.js`
- `extension/v2/core/license-session.js`
- `extension/v2/core/license-bootstrap-controller.js`

## Próxima integração

A próxima etapa deve:

1. Adaptar o HTML da interface v2 para os três estados visuais.
2. Implementar `validateRemote` usando o endpoint real do painel.
3. Testar atualização, reinstalação, expiração, revogação e servidor offline.
4. Somente depois migrar o comportamento para o popup em produção.
