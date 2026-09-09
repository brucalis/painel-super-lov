import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agent/rollback")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const direct = await import("@/lib/github-agent-direct.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const auth = await agent.requireAgentLicense(request);
          const body = (await request.json()) as { run_id?: string; commit_sha?: string };
          const runId = String(body.run_id || "");
          const commitSha = String(body.commit_sha || "").trim();

          // A extensão conhece o SHA confirmado pelo GitHub imediatamente, enquanto o
          // registro remoto do run pode ficar alguns instantes com status antigo. Antes
          // do rollback, reconciliamos esse estado usando somente as colunas essenciais.
          // Isso evita depender de campos opcionais de metadados que podem falhar em
          // instalações com schema mais antigo.
          if (runId && /^[0-9a-f]{40}$/i.test(commitSha)) {
            const { data: run } = await supabaseAdmin
              .from("github_agent_runs")
              .select("id,status,commit_sha,merge_commit_sha")
              .eq("id", runId)
              .eq("license_id", auth.license.id)
              .maybeSingle();

            const row = run as Record<string, unknown> | null;
            if (row && row.status !== "merged") {
              const knownSha = String(row.merge_commit_sha || row.commit_sha || "").trim();
              const shaMatches = !knownSha || knownSha.toLowerCase() === commitSha.toLowerCase();

              if (shaMatches) {
                const canonicalSha = knownSha || commitSha;
                const { error: syncError } = await supabaseAdmin
                  .from("github_agent_runs")
                  .update({
                    status: "merged",
                    commit_sha: canonicalSha,
                    merge_commit_sha: canonicalSha,
                    error: null,
                  } as never)
                  .eq("id", runId)
                  .eq("license_id", auth.license.id);

                if (syncError) {
                  // Último fallback: em alguns schemas antigos uma das colunas auxiliares
                  // pode não existir. O status é o requisito mínimo para liberar o fluxo
                  // de reversão quando o SHA já estava persistido anteriormente.
                  const { error: statusError } = await supabaseAdmin
                    .from("github_agent_runs")
                    .update({ status: "merged" } as never)
                    .eq("id", runId)
                    .eq("license_id", auth.license.id);
                  if (statusError) {
                    throw new Response(
                      `Não foi possível sincronizar a alteração antes de desfazer: ${statusError.message}`,
                      { status: 500 },
                    );
                  }
                }
              }
            }
          }

          return json({
            ok: true,
            flow_mode: "direct-main-v6-rollback-reconcile",
            ...(await direct.rollbackAgentRunDirect(auth, runId)),
          });
        } catch (error) {
          if (error instanceof Response) {
            return json({ ok: false, error: await error.text() }, error.status);
          }
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "Não foi possível desfazer a alteração.",
            },
            500,
          );
        }
      },
    },
  },
});