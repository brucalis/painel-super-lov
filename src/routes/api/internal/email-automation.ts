import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/internal/email-automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getSetting, safeEqual, json } = await import("@/lib/license.server");
        const configured =
          process.env.EMAIL_CAMPAIGN_CRON_SECRET ||
          (await getSetting("email_campaign_cron_secret")) ||
          "";
        const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
        if (!configured || !supplied || !safeEqual(configured, supplied))
          return json({ ok: false, error: "Não autorizado." }, 401);
        try {
          const { processEmailQueue } = await import("@/lib/email-campaigns.server");
          return json({ ok: true, ...(await processEmailQueue(30)) });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : "Falha na automação." },
            500,
          );
        }
      },
    },
  },
});
