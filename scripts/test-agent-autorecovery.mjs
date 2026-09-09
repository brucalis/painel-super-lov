import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../extension/github-agent-panel.js", import.meta.url), "utf8");
const watcher = await readFile(new URL("../extension/agent-autorecovery.js", import.meta.url), "utf8");
const customerSettings = await readFile(new URL("../extension-customer/customer-ai-settings.js", import.meta.url), "utf8");
const sidepanel = await readFile(new URL("../extension/sidepanel.js", import.meta.url), "utf8");
const batches = await readFile(new URL("../src/lib/github-agent-batches.server.ts", import.meta.url), "utf8");
const agentServer = await readFile(new URL("../src/lib/github-agent.server.ts", import.meta.url), "utf8");
const resilient = await readFile(new URL("../src/lib/github-agent-resilient.server.ts", import.meta.url), "utf8");
const credentials = await readFile(new URL("../src/lib/customer-ai-credentials.server.ts", import.meta.url), "utf8");
const customerStackAgent = await readFile(new URL("../src/lib/github-agent-customer-stack.server.ts", import.meta.url), "utf8");
const planRoute = await readFile(new URL("../src/routes/api/public/agent/plan.ts", import.meta.url), "utf8");
const credentialsRoute = await readFile(new URL("../src/routes/api/public/agent/ai-credentials.ts", import.meta.url), "utf8");

test("a retomada não depende de botões ou cliques no DOM", () => {
  assert.doesNotMatch(panel, /Retomar da etapa|Continuar da etapa/);
  assert.doesNotMatch(watcher, /querySelector|button\.click|\.click\(\)/);
  assert.match(watcher, /superLovableGithubAgentResumePending/);
});

test("tarefas persistidas retomam pelo checkpoint", () => {
  assert.match(panel, /loadBatchTask\(\)/);
  assert.match(panel, /superLovableGithubAgentResumePending/);
  assert.match(panel, /runBatchTask\(task\)/);
  assert.match(panel, /nextIndex/);
});

test("commit perdido é reconciliado antes de criar outro plano", () => {
  assert.match(panel, /let planned = null/);
  assert.match(panel, /run_id: planned\.runId/);
  assert.match(panel, /Confirmando automaticamente a aplicação/);
});

test("falhas complexas são classificadas, repetidas e subdivididas", () => {
  assert.match(panel, /MAX_AUTOMATIC_ATTEMPTS = 2/);
  assert.match(panel, /function recoveryKind/);
  assert.match(panel, /RATE_LIMIT_DELAYS_MS/);
  assert.match(panel, /repartitionFailedBatch/);
  assert.match(panel, /MAX_BATCH_REPARTITIONS/);
});

test("erros de autenticação não entram em repetição automática", () => {
  assert.match(panel, /TERMINAL_ERROR_CODES/);
  assert.match(panel, /HTTP_401/);
  assert.match(panel, /HTTP_403/);
  assert.match(panel, /kind === "terminal"/);
});

test("requisições usam limites específicos por operação", () => {
  assert.match(panel, /REQUEST_TIMEOUT_MS = 90_000/);
  assert.match(panel, /PLAN_TIMEOUT_MS = 180_000/);
  assert.match(panel, /COMMIT_TIMEOUT_MS = 270_000/);
  assert.match(panel, /function requestTimeoutFor/);
  assert.match(panel, /controller\.abort\("REQUEST_TIMEOUT"\)/);
});

test("etapas e tarefas complexas têm orçamento dinâmico e limitado", () => {
  assert.match(panel, /BATCH_DEADLINE_MS = 14 \* 60_000/);
  assert.match(panel, /MAX_TASK_DEADLINE_MS = 60 \* 60_000/);
  assert.match(panel, /function taskDeadlineMs/);
  assert.match(panel, /extendTaskDeadlineAfterRepartition/);
  assert.match(panel, /assertDeadline\(taskDeadline, "task"\)/);
});

test("páginas completas recebem decomposição mínima segura", () => {
  assert.match(batches, /function isFullProductBuild/);
  assert.match(batches, /return 4/);
  assert.match(batches, /fullProductBuildFallback/);
  assert.match(batches, /deterministic-full-build/);
  assert.match(batches, /produza entre 3 e 6 lotes/);
  assert.match(panel, /planAndCommit\(batchPrompt, label, true, batchDeadline\)/);
});

test("tentativas do agente legado não são multiplicadas entre camadas", () => {
  assert.match(agentServer, /TRANSIENT_RETRY_DELAYS: number\[\] = \[\]/);
  assert.match(agentServer, /MAX_CONTEXT_ROUNDS = 2/);
  assert.match(agentServer, /PROVIDER_TIMEOUT_MS = 25_000/);
  assert.match(resilient, /MAX_PLAN_ATTEMPTS = 1/);
});

test("stack comercial usa Cloudflare primeiro e contingencias opcionais", () => {
  assert.match(credentialsRoute, /\["cloudflare", "gemini", "openrouter"\]/);
  assert.match(credentialsRoute, /REQUIRED_AI_PROVIDERS = \["cloudflare"\]/);
  assert.match(credentials, /llama-3\.1-8b-instruct-fp8/);
  assert.match(credentials, /openrouter\/free/);
  assert.match(planRoute, /!stack\.cloudflare/);
  assert.match(planRoute, /stack\.cloudflare, stack\.gemini, stack\.openrouter/);
  assert.match(planRoute, /CUSTOMER_REQUIRED_AI_NOT_CONFIGURED/);
});

test("planner comercial suporta Cloudflare Gemini e OpenRouter", () => {
  assert.match(customerStackAgent, /api\.cloudflare\.com\/client\/v4\/accounts/);
  assert.match(customerStackAgent, /generativelanguage\.googleapis\.com/);
  assert.match(customerStackAgent, /openrouter\.ai\/api\/v1\/chat\/completions/);
});

test("painel só exige Cloudflare e projeto", () => {
  assert.match(customerSettings, /REQUIRED_PROVIDERS = \["cloudflare"\]/);
  assert.doesNotMatch(customerSettings, /providerForm\("grok"/);
  assert.match(customerSettings, /const requiredReady = REQUIRED_PROVIDERS\.every/);
  assert.match(customerSettings, /const operational = requiredReady && projectReady/);
  assert.match(customerSettings, /Gemini · 2ª tentativa opcional/);
  assert.match(customerSettings, /OpenRouter · Última contingência/);
  assert.match(customerSettings, /A nova credencial não foi aceita\. A conexão anterior/);
});

test("Cloudflare pede Account ID além do API Token", () => {
  assert.match(customerSettings, /sl-ai-cloudflare-account/);
  assert.match(customerSettings, /account_id/);
  assert.match(credentials, /Informe também o Account ID da Cloudflare/);
});

test("falha temporária de consulta não apaga conexões já conhecidas", () => {
  assert.match(customerSettings, /A credencial salva foi mantida/);
  assert.doesNotMatch(customerSettings, /connectionState\[provider\] = false;\s*const status = document\.getElementById/);
});

test("backend antigo produz diagnóstico explícito", () => {
  assert.match(customerSettings, /backend do painel ainda está em uma versão anterior/i);
  assert.match(customerSettings, /ai_provider: provider/);
});

test("tarefas encerradas não entram novamente no ciclo automático", () => {
  assert.match(panel, /TERMINAL_TASK_STATUSES/);
  assert.match(panel, /TERMINAL_TASK_STATUSES\.has\(task\.status\)/);
  assert.match(panel, /não será retomada em loop/);
});

test("painel comercial recolhe conexões completas e permite rolagem", () => {
  assert.match(customerSettings, /becameOperational \|\| !userOpenedCompletePanel/);
  assert.match(customerSettings, /\.sp-body \{ overflow-y: auto !important/);
  assert.match(customerSettings, /superLovableCloseConnectionStatus/);
});

test("usuário pode trocar repositório sem refazer as demais conexões", () => {
  assert.match(panel, /chooseAnotherRepository/);
  assert.match(panel, /sl-agent-switch-project/);
  assert.match(panel, /Suas demais conexões serão mantidas/);
  assert.match(customerSettings, /Repositório selecionado:/);
});

test("perfil comercial usa primeiro nome e mostra validade temporária", () => {
  assert.match(sidepanel, /function getFirstName/);
  assert.match(sidepanel, /sp-customer-license-countdown/);
  assert.match(sidepanel, /Tempo restante/);
});
