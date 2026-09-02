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
          return json({
            ok: true,
            flow_mode: "direct-main-v4-resilient",
            creates_pull_requests: false,
            ...(await resilient.commitAgentRunResilient(auth, String(body.run_id || ""))),
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
