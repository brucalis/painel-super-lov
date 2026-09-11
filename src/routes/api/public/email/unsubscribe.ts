import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/email/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") || "";
        const { unsubscribeByToken } = await import("@/lib/email-campaigns.server");
        const ok = await unsubscribeByToken(token);
        return new Response(
          `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;background:#f6f4fa;color:#24202b;display:grid;min-height:100vh;place-items:center;margin:0"><main style="max-width:520px;background:white;border:1px solid #e6def2;border-radius:16px;padding:32px;text-align:center"><h1>${ok ? "Preferência atualizada" : "Link inválido"}</h1><p>${ok ? "Você não receberá novas campanhas promocionais da Superlovable. Mensagens essenciais sobre acessos já adquiridos ainda poderão ser enviadas." : "Não foi possível validar este link. Se precisar, responda ao e-mail recebido."}</p></main></body></html>`,
          { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});
