import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAppUser, getConnection, json } = await import("@/lib/github.server");
        try {
          const userId = await requireAppUser(request);
          const connection = await getConnection(userId);
          if (!connection) return json({ ok: true, connected: false });
          return json({
            ok: true,
            connected: Boolean(connection.installation_id) && connection.status === "connected",
            status: connection.status,
            github_login: connection.github_login,
            github_user_id: connection.github_user_id,
            github_avatar_url: connection.github_avatar_url,
            installation_id: connection.installation_id,
            connected_at: connection.connected_at,
          });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error("[github/status] falha");
          return json({ ok: false, message: "Falha ao consultar status." }, 500);
        }
      },
    },
  },
});
