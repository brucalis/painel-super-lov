import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireAppUser, removeConnection, json } = await import("@/lib/github.server");
        try {
          const userId = await requireAppUser(request);
          await removeConnection(userId);
          return json({ ok: true, connected: false });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error("[github/disconnect] falha");
          return json({ ok: false, message: "Falha ao desconectar." }, 500);
        }
      },
    },
  },
});
