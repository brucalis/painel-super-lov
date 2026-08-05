import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const installationId = url.searchParams.get("installation_id");
        const setupAction = url.searchParams.get("setup_action");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        // Endpoint inicial do GitHub App. Nesta primeira etapa ele existe para
        // receber com segurança o retorno do GitHub durante a criação/instalação.
        // A troca do `code` por token será adicionada após o GitHub fornecer
        // Client ID e Client Secret do App. O Client Secret nunca deve ir ao frontend.
        if (error) {
          const redirect = new URL("/", url.origin);
          redirect.searchParams.set("github", "error");
          redirect.searchParams.set("reason", errorDescription || error);
          return Response.redirect(redirect.toString(), 302);
        }

        if (!code && !installationId) {
          return Response.json(
            {
              ok: true,
              endpoint: "github-callback",
              status: "ready",
              message: "Callback do GitHub App ativo e aguardando autorização.",
            },
            { status: 200 },
          );
        }

        const redirect = new URL("/", url.origin);
        redirect.searchParams.set("github", "callback-received");
        if (installationId) redirect.searchParams.set("installation_id", installationId);
        if (setupAction) redirect.searchParams.set("setup_action", setupAction);

        // Não repassamos o `code` OAuth ao navegador. Na próxima etapa ele será
        // consumido aqui no servidor para obter o token e persistir a conexão.
        return Response.redirect(redirect.toString(), 302);
      },
    },
  },
});
