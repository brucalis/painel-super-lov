import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const {
          requireAppUser,
          createOAuthState,
          authorizeUrl,
          callbackUrl,
          json,
        } = await import("@/lib/github.server");
        try {
          const userId = await requireAppUser(request);
          const url = new URL(request.url);
          const redirectTo = url.searchParams.get("redirect_to");
          const state = await createOAuthState(userId, redirectTo);
          const authorize = authorizeUrl(state, callbackUrl(request));
          if (url.searchParams.get("redirect") === "1") {
            return Response.redirect(authorize, 302);
          }
          return json({ ok: true, authorize_url: authorize });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error("[github/connect]", error);
          return json({ ok: false, message: "Falha ao iniciar conexão GitHub." }, 500);
        }
      },
      POST: async ({ request }) => {
        const { requireAppUser, createOAuthState, authorizeUrl, callbackUrl, json } = await import(
          "@/lib/github.server"
        );
        try {
          const userId = await requireAppUser(request);
          const state = await createOAuthState(userId, null);
          return json({ ok: true, authorize_url: authorizeUrl(state, callbackUrl(request)) });
        } catch (error) {
          if (error instanceof Response) return error;
          console.error("[github/connect]", error);
          return json({ ok: false, message: "Falha ao iniciar conexão GitHub." }, 500);
        }
      },
    },
  },
});
