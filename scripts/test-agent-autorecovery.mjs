import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../extension/github-agent-panel.js", import.meta.url), "utf8");
const watcher = await readFile(new URL("../extension/agent-autorecovery.js", import.meta.url), "utf8");

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
