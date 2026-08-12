import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleGithubCallback } = await import("@/lib/github-callback.server");
        return handleGithubCallback(request);
      },
    },
  },
});
