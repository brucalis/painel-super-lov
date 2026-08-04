# SUPER LOVABLE V2 — contrato da API de licenças

## Objetivo desta etapa

Conectar a identidade persistente do dispositivo e o carregamento silencioso da licença a uma API real, sem misturar essa lógica ao popup legado.

A extensão agora possui um adaptador configurável em:

`extension/v2/core/license-api-adapter.js`

A tela executável de validação está em:

`extension/v2/runtime/license-test.html`

## Endpoints esperados

Por padrão, o adaptador procura:

- `POST /api/licenses/validate`
- `POST /api/licenses/activate`
- `POST /api/licenses/deactivate`

O domínio inicial configurado é:

`https://painel-super-lov.lovable.app`

Esses caminhos podem ser alterados em `chrome.storage.local`, pela chave `slv2_license_api_settings`, sem republicar a extensão.

## Corpo enviado pela extensão

```json
{
  "licenseKey": "LVA-XXXX-XXXX-XXXX-XXXX",
  "deviceId": "slv2_xxxxxxxxx",
  "installationId": "slv2_xxxxxxxxx",
  "extensionVersion": "2.0.0",
  "reason": "activation"
}
```

Valores possíveis de `reason`:

- `activation`
- `manual`
- `cache-stale`
- `background-refresh`
- `device-migration`

## Resposta de sucesso

```json
{
  "status": "active",
  "valid": true,
  "plan": "Vitalício",
  "expires_at": null,
  "device_id": "slv2_xxxxxxxxx",
  "devices_used": 1,
  "devices_limit": 1,
  "role": "user",
  "message": "Licença ativa"
}
```

Também são aceitos os campos camelCase:

- `expiresAt`
- `deviceId`
- `devicesUsed`
- `devicesLimit`

## Estados reconhecidos

- `active`, `valid` ou `enabled`
- `expired`
- `device_limit`
- `revoked`, `blocked` ou `disabled`
- `invalid`

## Regra obrigatória no servidor

A ativação deve usar uma operação idempotente.

Chave lógica recomendada:

```text
license_id + device_id
```

Se essa combinação já existir, o servidor deve atualizar `last_seen_at`, `extension_version` e demais metadados. Não deve criar um novo dispositivo.

Pseudo-SQL:

```sql
insert into license_devices (
  license_id,
  device_id,
  extension_version,
  first_seen_at,
  last_seen_at
)
values (...)
on conflict (license_id, device_id)
do update set
  extension_version = excluded.extension_version,
  last_seen_at = now();
```

Isso impede que atualização ou reinstalação no mesmo perfil consuma outra vaga.

## Respostas de bloqueio

### Licença expirada

```json
{
  "status": "expired",
  "valid": false,
  "expires_at": "2026-08-05T12:00:00Z",
  "message": "Sua licença expirou."
}
```

### Limite de dispositivos

```json
{
  "status": "device_limit",
  "valid": false,
  "devices_used": 1,
  "devices_limit": 1,
  "message": "Esta licença já está ativa em outro dispositivo."
}
```

### Licença revogada

```json
{
  "status": "revoked",
  "valid": false,
  "message": "Esta licença foi desativada."
}
```

## Como abrir a tela de teste

Na branch de desenvolvimento, altere temporariamente o `default_popup` do `manifest.json` para:

```json
"default_popup": "v2/runtime/license-test.html"
```

Depois:

1. Abra `chrome://extensions`.
2. Ative o modo do desenvolvedor.
3. Carregue a pasta `extension` sem compactação.
4. Abra o popup.
5. Observe que primeiro aparece somente “Preparando sua extensão”.
6. A tela de ativação só aparece depois da conclusão do bootstrap.

Não publicar essa alteração de `default_popup` na versão estável antes dos testes.

## Cenários mínimos de teste

### 1. Primeira ativação

- Sem cache local.
- Informar uma chave válida.
- Resultado esperado: tela principal e um único dispositivo no painel.

### 2. Reabrir a extensão

- Fechar e abrir novamente.
- Resultado esperado: interface liberada imediatamente pelo cache, sem piscar a ativação.

### 3. Atualizar a versão

- Alterar apenas a versão do manifest.
- Recarregar a extensão.
- Resultado esperado: mesmo `deviceId`, sem nova vaga consumida.

### 4. Reinstalar no mesmo perfil preservando dados

- Recarregar a pasta ou atualizar a extensão.
- Resultado esperado: mesmo dispositivo.

### 5. Licença expirada

- Marcar a licença como expirada no servidor.
- Resultado esperado: bloqueio imediato após validação.

### 6. Servidor temporariamente fora do ar

- Com uma validação recente e não expirada, simular falha da API.
- Resultado esperado: `offline_grace` por até 24 horas.

### 7. Outro perfil do Chrome

- Instalar em outro perfil.
- Resultado esperado: outro `deviceId` e aplicação normal do limite contratado.

## Observação técnica

Uma remoção completa dos dados da extensão apaga o identificador local. Nenhuma extensão Chrome comum consegue acessar um número de série de hardware confiável. Para esse cenário, o painel deve oferecer uma ação controlada de “substituir dispositivo” ou “desvincular dispositivo anterior”.
