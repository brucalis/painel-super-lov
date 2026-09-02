import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AgentHistoryAuth = { license: { id: string } };

function commitUrl(repository: string, sha: string) {
  return repository && sha ? `https://github.com/${repository}/commit/${sha}` : null;
}

export async function getAgentHistory(auth: AgentHistoryAuth, limit = 80) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));
  const { data, error } = await supabaseAdmin
    .from("github_agent_runs")
    .select("*")
    .eq("license_id", auth.license.id)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error("Não foi possível carregar o histórico da Super Lovable.");

  return (data || []).map((item) => {
    const row = item as Record<string, unknown>;
    const repository = String(row.repository_full_name || "");
    const commitSha = String(row.merge_commit_sha || row.commit_sha || "");
    const rollbackSha = String(row.rollback_commit_sha || "");
    return {
      id: String(row.id || ""),
      repository,
      branch: String(row.branch || "main"),
      prompt: String(row.prompt || ""),
      summary: String(row.summary || ""),
      commitMessage: String(row.commit_message || ""),
      provider: String(row.provider || ""),
      model: String(row.model || ""),
      status: String(row.status || ""),
      riskLevel: String(row.risk_level || ""),
      commitSha: commitSha || null,
      commitUrl: commitUrl(repository, commitSha),
      rollbackSha: rollbackSha || null,
      rollbackUrl: commitUrl(repository, rollbackSha),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      mergedAt: row.merged_at || null,
      error: row.error ? String(row.error) : null,
    };
  });
}
