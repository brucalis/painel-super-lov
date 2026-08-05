import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/repositories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAppUser, getConnection, listInstallationRepos, json } = await import(
          "@/lib/github.server"
        );
        try {
          const userId = await requireAppUser(request);
          const connection = await getConnection(userId);
          if (!connection || !connection.installation_id) {
            return json({ ok: false, code: "NOT_CONNECTED", repositories: [] }, 404);
          }
          const repositories = await listInstallationRepos(connection.installation_id);
          return json({ ok: true, repositories });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error("[github/repositories] falha ao listar repositórios");
          return json({ ok: false, message: "Falha ao listar repositórios." }, 500);
        }
      },
    },
  },
});
