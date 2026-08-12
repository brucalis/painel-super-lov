import { createFileRoute } from "@tanstack/react-router";

/**
 * Alias público do callback: usado quando o site publicado está atrás do
 * gate de autenticação da Lovable e o GitHub precisa alcançar a URL sem sessão.
 */
export const Route = createFileRoute("/api/public/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleGithubCallback } = await import("@/lib/github-callback.server");
        return handleGithubCallback(request);
      },
    },
  },
});
