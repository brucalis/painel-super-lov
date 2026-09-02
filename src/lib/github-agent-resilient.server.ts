import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  agentErrorDetails,
  planAgentRun,
} from "@/lib/github-agent.server";
import { commitAgentRunDirect } from "@/lib/github-agent-direct.server";

const MAX_PLAN_ATTEMPTS = 5;
const LOGIC_RETRY_DELAY_MS = [0, 180, 420, 850, 1_400];
const PROVIDER_RETRY_DELAY_MS = [0, 1_200, 3_000, 6_000, 10_000];

type AgentAuth = Parameters<typeof planAgentRun>[0];
type PlanOptions = { reducedContext?: boolean };

type ErrorInfo = {
  message: string;
  code: string;
  retryable: boolean;
  status: number;
  malformedJson: boolean;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isMalformedAiJson(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /unterminated string|unexpected end of json|expected.*json|json.*position|plano de código válido/i.test(
    message,
  );
}

function errorInfo(error: unknown): ErrorInfo {
  const details = agentErrorDetails(error);
  return {
    ...details,
    malformedJson: isMalformedAiJson(error),
  };
}

function isProviderFailure(info: ErrorInfo) {
  return ["AI_PROVIDER_UNAVAILABLE", "AI_RATE_LIMITED", "AI_CONTEXT_TOO_LARGE"].includes(
    info.code,
  );
}

function isRecoverable(info: ErrorInfo) {
  if (info.malformedJson) return true;
  return [
    "AI_EDIT_NOT_UNIQUE",
    "AI_INVALID_EDIT_PATH",
    "AI_TRUNCATED_CONTENT_BLOCKED",
    "AI_CHANGE_TOO_BROAD",
    "CONTEXT_ROUNDS_EXHAUSTED",
    "AI_CONTEXT_TOO_LARGE",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_RATE_LIMITED",
  ].includes(info.code) || /não propôs uma alteração segura/i.test(info.message);
}

function failingPath(message: string) {
  const match = message.match(/(?:para|de)\s+([^\s]+\.(?:tsx?|jsx?|css|json|md))\s+/i);
  return match?.[1] || "";
}

function recoveryInstruction(info: ErrorInfo, attempt: number) {
  const path = failingPath(info.message);
  const common = [
    "INSTRUÇÃO INTERNA DE RECUPERAÇÃO AUTOMÁTICA:",
    `Esta é a tentativa de recuperação ${attempt + 1}.`,
    "Releia SEMPRE o estado atual da branch main antes de propor qualquer edição; não confie em texto de tentativas anteriores.",
    "Preserve tudo que já foi aplicado por etapas anteriores e conclua somente o objetivo atual.",
  ];

  if (info.malformedJson) {
    return [
      ...common,
      "A resposta anterior terminou antes de fechar o JSON.",
      "Produza uma resposta bem menor: use somente edits cirúrgicos essenciais, sem comentários explicativos e sem repetir arquivos completos.",
      "Se precisar de outro arquivo, solicite CONTEXT_REQUIRED antes de editar.",
    ].join("\n");
  }

  if (info.code === "AI_EDIT_NOT_UNIQUE") {
    return [
      ...common,
      `A edição anterior não encontrou um trecho único${path ? ` em ${path}` : ""}.`,
      path
        ? `Priorize a leitura atual e completa de ${path}. Se ele não estiver integralmente no contexto, solicite CONTEXT_REQUIRED para esse caminho antes de gerar a edição.`
        : "Solicite CONTEXT_REQUIRED para o arquivo exato antes de gerar novamente a edição problemática.",
      "No novo edit.search use um trecho EXISTENTE no arquivo atual e suficientemente específico para ocorrer exatamente uma vez, incluindo linhas vizinhas estáveis quando necessário.",
      "Não reutilize literalmente o search que falhou e não invente conteúdo intermediário.",
    ].join("\n");
  }

  if (info.code === "AI_INVALID_EDIT_PATH") {
    return [
      ...common,
      "A tentativa anterior escolheu um caminho que não existe.",
      "Use exclusivamente caminhos presentes em available_files. Se houver dúvida entre arquivos parecidos, solicite CONTEXT_REQUIRED para o caminho real antes de editar.",
    ].join("\n");
  }

  if (info.code === "AI_CHANGE_TOO_BROAD") {
    return [
      ...common,
      "A tentativa anterior alteraria uma parte excessiva de um arquivo existente.",
      "Não reescreva o arquivo inteiro. Divida a mudança em edits pequenos e independentes, preservando a maior parte do conteúdo atual.",
      "Se o objetivo envolver várias responsabilidades, implemente primeiro a menor estrutura reutilizável necessária e conecte-a com edits cirúrgicos.",
    ].join("\n");
  }

  if (info.code === "CONTEXT_ROUNDS_EXHAUSTED") {
    return [
      ...common,
      "A tentativa anterior pediu contexto demais sem chegar a uma alteração.",
      "Escolha os 1 a 3 arquivos essenciais para este objetivo. Solicite somente esses arquivos e, depois de recebê-los, produza a alteração sem pedir uma varredura ampla do repositório.",
    ].join("\n");
  }

  if (info.code === "AI_TRUNCATED_CONTENT_BLOCKED") {
    return [
      ...common,
      "A tentativa anterior tentou usar conteúdo truncado como código real.",
      "Solicite o arquivo exato novamente e use apenas conteúdo integral retornado pelo repositório. Nunca copie marcadores de truncamento para a alteração.",
    ].join("\n");
  }

  if (isProviderFailure(info)) {
    return [
      ...common,
      "Um provedor de IA ficou indisponível, excedeu limite ou recebeu contexto excessivo.",
      "Mantenha a resposta compacta e priorize somente os arquivos indispensáveis para terminar esta etapa.",
    ].join("\n");
  }

  return [
    ...common,
    "A tentativa anterior não conseguiu materializar uma alteração segura. Reavalie o estado atual do projeto e gere um plano menor, objetivo e executável.",
  ].join("\n");
}

function shouldUseReducedContext(info: ErrorInfo, attempt: number, initialReduced: boolean) {
  if (initialReduced) return true;
  // Falhas de correspondência precisam de MAIS fidelidade do arquivo atual, não de menos contexto.
  if (["AI_EDIT_NOT_UNIQUE", "AI_INVALID_EDIT_PATH", "AI_CHANGE_TOO_BROAD"].includes(info.code)) {
    return false;
  }
  if (info.malformedJson || ["AI_CONTEXT_TOO_LARGE", "AI_PROVIDER_UNAVAILABLE", "AI_RATE_LIMITED"].includes(info.code)) {
    return true;
  }
  return attempt >= 3;
}

export async function planAgentRunResilient(
  auth: AgentAuth,
  prompt: string,
  options: PlanOptions = {},
) {
  const originalPrompt = String(prompt || "").trim();
  let currentPrompt = originalPrompt;
  let lastError: unknown = null;
  const recoveries: Array<{ attempt: number; code: string; message: string }> = [];
  let reducedContext = Boolean(options.reducedContext);

  for (let attempt = 0; attempt < MAX_PLAN_ATTEMPTS; attempt += 1) {
    try {
      const result = await planAgentRun(auth, currentPrompt, { reducedContext });
      return {
        ...result,
        automaticRecoveries: recoveries,
        recoveryCount: recoveries.length,
      };
    } catch (error) {
      lastError = error;
      const info = errorInfo(error);
      if (!isRecoverable(info) || attempt >= MAX_PLAN_ATTEMPTS - 1) throw error;

      recoveries.push({
        attempt: attempt + 1,
        code: info.malformedJson ? "AI_PLAN_TRUNCATED" : info.code,
        message: info.message.slice(0, 500),
      });

      reducedContext = shouldUseReducedContext(
        info,
        attempt,
        Boolean(options.reducedContext),
      );
      currentPrompt = `${originalPrompt}\n\n${recoveryInstruction(info, attempt)}`.slice(0, 11_500);

      console.warn("[github-agent/resilient] recuperando automaticamente o plano", {
        attempt: attempt + 1,
        code: info.code,
        reducedContext,
        message: info.message,
      });

      const delays = isProviderFailure(info) ? PROVIDER_RETRY_DELAY_MS : LOGIC_RETRY_DELAY_MS;
      await wait(delays[Math.min(attempt + 1, delays.length - 1)] || 0);
    }
  }

  throw lastError || new Error("Não foi possível concluir o plano da alteração.");
}

async function existingRun(auth: AgentAuth, runId: string) {
  const { data } = await supabaseAdmin
    .from("github_agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("license_id", auth.license.id)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

function existingSuccess(run: Record<string, unknown>) {
  const commitSha = String(run.merge_commit_sha || run.commit_sha || "");
  if (run.status !== "merged" || !commitSha) return null;
  return {
    runId: String(run.id || ""),
    commitSha,
    repository: String(run.repository_full_name || ""),
    branch: String(run.branch || "main"),
    summary: run.summary,
    merged: true,
    direct: true,
    idempotent: true,
    requiresReview: false,
    riskLevel: String(run.risk_level || "low"),
    validationReasons: ["A alteração já havia sido aplicada anteriormente; nenhuma duplicação foi criada."],
    sandboxStatus: String(run.sandbox_status || "skipped"),
    flowMode: "direct-main-v4-resilient",
  };
}

export async function commitAgentRunResilient(auth: AgentAuth, runId: string) {
  const before = await existingRun(auth, runId);
  if (before) {
    const success = existingSuccess(before);
    if (success) return success;
  }

  try {
    return await commitAgentRunDirect(
      auth as Parameters<typeof commitAgentRunDirect>[0],
      runId,
    );
  } catch (error) {
    // Se o commit entrou na main e apenas a resposta ao navegador se perdeu,
    // uma nova chamada retorna o mesmo sucesso em vez de duplicar o trabalho.
    const after = await existingRun(auth, runId);
    if (after) {
      const success = existingSuccess(after);
      if (success) return success;
    }
    throw error;
  }
}
