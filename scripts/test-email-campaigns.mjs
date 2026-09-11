import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const server = readFileSync(
  new URL("../src/lib/email-campaigns.server.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../src/routes/api/internal/email-automation.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260911200000_email_campaigns.sql", import.meta.url),
  "utf8",
);
const schedulingMigration = readFileSync(
  new URL("../supabase/migrations/20260911213000_email_campaign_scheduling.sql", import.meta.url),
  "utf8",
);
const panel = readFileSync(
  new URL("../src/components/admin/email-campaigns-tab.tsx", import.meta.url),
  "utf8",
);

test("lembretes usam os quatro marcos e param após ativação", () => {
  assert.match(server, /\[3, 6, 12, 24\]/);
  assert.match(server, /activation_started_at/);
  assert.match(server, /Licença ativada antes do envio/);
  assert.match(server, /status !== "active"/);
});

test("campanhas deduplicam clientes e registram fila", () => {
  assert.match(server, /const unique = new Map/);
  assert.match(server, /dedupe_key/);
  assert.match(migration, /dedupe_key text not null unique/);
  assert.match(migration, /email_deliveries_queue_idx/);
  assert.match(migration, /email_suppressions/);
  assert.match(server, /excludeSuppressed/);
});

test("rota automática exige segredo e agenda execução periódica", () => {
  assert.match(route, /safeEqual/);
  assert.match(route, /EMAIL_CAMPAIGN_CRON_SECRET/);
  assert.match(migration, /\*\/15 \* \* \* \*/);
  assert.match(migration, /email_campaign_cron_secret/);
  assert.match(migration, /email_campaign_scheduler_status/);
});

test("painel oferece configuração limpa, múltiplos públicos e progresso", () => {
  assert.match(panel, /Aguardando ativação/);
  assert.match(panel, /Tipo de licença/);
  assert.match(panel, /HTML personalizado/);
  assert.match(panel, /Agendar campanha/);
  assert.match(panel, /Progress value/);
  assert.match(panel, /audienceStatuses/);
  assert.match(schedulingMigration, /scheduled_for/);
  assert.match(schedulingMigration, /audience_statuses/);
  assert.match(schedulingMigration, /body_format/);
});
