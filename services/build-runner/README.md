# Super Lovable Build Runner

Serviço privado para validar o build de uma alteração antes do merge. O código é executado em um contêiner descartável, sem credenciais e sem rede durante o build.

## Requisitos da VPS

- Docker e Docker Compose;
- mínimo recomendado de 2 vCPU, 4 GB de RAM e 20 GB livres;
- HTTPS configurado pelo Coolify;
- acesso ao socket Docker somente pelo serviço;
- `RUNNER_SECRET` aleatório com pelo menos 48 caracteres.

## Coolify

Crie um recurso Docker Compose apontando o diretório `services/build-runner` e cadastre:

```text
RUNNER_SECRET=<segredo forte>
MAX_CONCURRENT_BUILDS=1
BUILD_TIMEOUT_MS=180000
BUILD_MEMORY=1g
BUILD_CPUS=1
BUILD_IMAGE=node:22-alpine
```

Associe um domínio HTTPS à porta 8080. No projeto Lovable, cadastre o mesmo segredo como `BUILD_RUNNER_SECRET` e a URL pública como `BUILD_RUNNER_URL`.

O endpoint `/health` não expõe dados do projeto. O endpoint `/validate` exige autenticação Bearer.
