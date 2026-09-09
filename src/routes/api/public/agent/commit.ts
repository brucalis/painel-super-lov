import { createFileRoute } from "@tanstack/react-router";

function isRetryableCommitResponse(status: number, message: string) {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    /projeto mudou|main mudou|temporariamente|timeout|tempo esgotado/i.test(message)
  );
}

export const Route = createFileRoute("/api/public/agent/commit")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const resilient = await import("@/lib/github-agent-resilient.server");
          const auth = await agent.requireAgentLicense(request);
          const body = (await request.json()) as { run_id?: string };
          const runId = String(body.run_id || "");
          const result = await resilient.commitAgentRunResilient(auth, runId);

          // O commit pode ter entrado na main mesmo se uma atualização ampla de metadados
          // do run falhar por incompatibilidade de coluna. Reforçamos aqui o mínimo
          // necessário para histórico e rollback: status + SHA aplicado.
          if (result?.commitSha && runId) {
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const now = new Date().toISOString();
              const { error } = await supabaseAdmin
                .from("github_agent_runs")
                .update({
                  status: "merged",
                  commit_sha: String(result.commitSha),
                  merge_commit_sha: String(result.commitSha),
                  merged_at: now,
                  updated_at: now,
                  error: null,
                } as never)
                .eq("id", runId)
                .eq("license_id", auth.license.id);
              if (error) {
                console.warn("[super-lovable/commit] não foi possível reforçar metadados do histórico", error);
              }
            } catch (syncError) {
              console.warn("[super-lovable/commit] falha não bloqueante ao sincronizar histórico", syncError);
            }
          }

          return json({
            ok: true,
            flow_mode: "direct-main-v5-history-sync",
            creates_pull_requests: false,
            ...result,
          });
        } catch (error) {
          if (error instanceof Response) {
            const message = await error.text();
            return json(
              {
                ok: false,
                error: message,
                code: error.status === 409 ? "GITHUB_STATE_CHANGED" : `COMMIT_${error.status}`,
                retryable: isRetryableCommitResponse(error.status, message),
              },
              error.status,
            );
          }
          const message = error instanceof Error ? error.message : "Falha ao aplicar alteração.";
          return json(
            {
              ok: false,
              error: message,
              code: "COMMIT_FAILED",
              retryable: /GitHub respondeu (?:408|409|425|429|5\d\d)|timeout|tempo esgotado/i.test(
                message,
              ),
            },
            500,
          );
        }
      },
    },
  },
});
