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

          if (runId && /^[0-9a-f]{40}$/i.test(commitSha)) {
            const { data: run } = await supabaseAdmin
              .from("github_agent_runs")
              .select("id,status,commit_sha,merge_commit_sha")
              .eq("id", runId)
              .eq("license_id", auth.license.id)
              .maybeSingle();
            const row = run as Record<string, unknown> | null;
            if (row && row.status !== "merged" && !row.commit_sha && !row.merge_commit_sha) {
              const now = new Date().toISOString();
              await supabaseAdmin
                .from("github_agent_runs")
                .update({
                  status: "merged",
                  commit_sha: commitSha,
                  merge_commit_sha: commitSha,
                  merged_at: now,
                  updated_at: now,
                  error: null,
                } as never)
                .eq("id", runId)
                .eq("license_id", auth.license.id);
            }
          }

          return json({
            ok: true,
            flow_mode: "direct-main-v5-history-sync",
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
