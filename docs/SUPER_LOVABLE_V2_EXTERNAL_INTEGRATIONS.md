# Super Lovable V2 — Integrações externas

## Escopo desta etapa

A extensão passa a oferecer uma central modular para serviços externos, sem armazenar credenciais privadas no navegador ou no repositório.

Provedores preparados:

- Stripe
- Mercado Pago
- PayPal
- Resend
- Brevo
- Cloudinary
- n8n
- Make
- Webhook personalizado

## Regras obrigatórias

1. OAuth deve ser concluído pelo backend da Super Lovable.
2. Client secrets, API secrets, service roles e signing secrets nunca ficam na extensão.
3. Webhooks devem validar assinatura, timestamp e idempotência.
4. Eventos recebidos devem gerar logs sem registrar dados sensíveis completos.
5. A extensão só recebe estados resumidos e identificadores seguros.
6. Desconectar uma integração deve revogar ou invalidar o vínculo no backend.
7. Ações financeiras e destrutivas exigem confirmação do usuário.

## Fluxo real futuro

Extensão → backend Super Lovable → OAuth/API do provedor → cofre de segredos → endpoint ou Edge Function do projeto.

## Endpoints provisórios esperados

- POST `/api/integrations/:provider/connect`
- GET `/api/integrations`
- POST `/api/integrations/:provider/test`
- DELETE `/api/integrations/:provider`
- GET `/api/integrations/events`
- POST `/api/webhooks/:provider`

## Dados reais pendentes

Ao final do projeto será necessário definir:

- domínio definitivo do backend;
- URLs de callback OAuth;
- provedores realmente oferecidos no lançamento;
- política de armazenamento e rotação de secrets;
- formato dos logs de auditoria;
- limite de retenção dos eventos;
- endpoints públicos para webhooks;
- política de tentativas, filas e idempotência.
