import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../extension/github-agent-panel.js", import.meta.url), "utf8");
const watcher = await readFile(new URL("../extension/agent-autorecovery.js", import.meta.url), "utf8");
const customerSettings = await readFile(new URL("../extension-customer/customer-ai-settings.js", import.meta.url), "utf8");
const sidepanel = await readFile(new URL("../extension/sidepanel.js", import.meta.url), "utf8");

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
  assert.match(panel, /MAX_AUTOMATIC_ATTEMPTS = 4/);
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


test("requisições do agente possuem timeout abortável", () => {
  assert.match(panel, /REQUEST_TIMEOUT_MS = 90_000/);
  assert.match(panel, /AbortController/);
  assert.match(panel, /controller\.abort\("REQUEST_TIMEOUT"\)/);
  assert.match(panel, /REQUEST_TIMEOUT/);
});

test("etapas e tarefas complexas têm prazos absolutos", () => {
  assert.match(panel, /BATCH_DEADLINE_MS = 8 \* 60_000/);
  assert.match(panel, /TASK_DEADLINE_MS = 25 \* 60_000/);
  assert.match(panel, /assertDeadline\(taskDeadline, "task"\)/);
  assert.match(panel, /planAndCommit\(batchPrompt, label, false, batchDeadline\)/);
});

test("tarefas encerradas não entram novamente no ciclo automático", () => {
  assert.match(panel, /TERMINAL_TASK_STATUSES/);
  assert.match(panel, /TERMINAL_TASK_STATUSES\.has\(task\.status\)/);
  assert.match(panel, /não será retomada em loop/);
});


test("painel comercial recolhe conexões completas e permite rolagem", () => {
  assert.match(customerSettings, /becameComplete \|\| !userOpenedCompletePanel/);
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
