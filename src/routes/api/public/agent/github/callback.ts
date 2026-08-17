import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/agent/github/callback")({ server: { handlers: { GET: async ({ request }) => (await import("@/lib/github-agent.server")).finishLicenseGithubConnection(request) } } });

