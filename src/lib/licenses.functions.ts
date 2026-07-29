import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./admin.server";

const createSchema = z.object({
  plan: z.string().min(1).default("pro"),
  plan_name: z.string().min(1).default("Plano Pro"),
  is_lifetime: z.boolean().default(false),
  duration_days: z.number().int().positive().nullable().optional(),
  device_limit: z.number().int().min(1).max(50).default(1),
  order_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  minimum_version: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  customer_phone: z.string().nullable().optional(),
});

export const createLicense = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const { createLicenseRecord } = await import("./license.server");
    return createLicenseRecord({
      plan: data.plan,
      plan_name: data.plan_name,
      is_lifetime: data.is_lifetime,
      duration_days: data.duration_days ?? null,
      device_limit: data.device_limit,
      order_id: data.order_id ?? null,
      notes: data.notes ?? null,
      minimum_version: data.minimum_version ?? null,
      source: "painel",
      customer: data.customer_email
        ? {
            email: data.customer_email,
            full_name: data.customer_name ?? null,
            phone: data.customer_phone ?? null,
          }
        : null,
    });
  });

export const resendLicenseWebhook = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ license_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { dispatchOutbound } = await import("./license.server");
    await dispatchOutbound("license.created", data.license_id);
    return { ok: true };
  });

export const rotateSalesSecret = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { randomBytes } = await import("crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = randomBytes(24).toString("hex");
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "sales_webhook_secret", value, updated_at: new Date().toISOString() });
    return { value };
  });

export const generateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { randomBytes } = await import("crypto");
    return { value: randomBytes(24).toString("hex") };
  });

export const rotateEnsinaflixSecret = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { randomBytes } = await import("crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = randomBytes(24).toString("hex");
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "ensinaflix_webhook_secret", value, updated_at: new Date().toISOString() });
    return { value };
  });

export const getEnsinaflixSecretStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { getSetting } = await import("./license.server");
    const stored = await getSetting("ensinaflix_webhook_secret");
    const env =
      process.env.ENSAINAFLIX_WEBHOOK_SECRET || process.env.ENSINAFLIX_WEBHOOK_SECRET || "";
    const value = env || stored || "";
    return {
      configured: !!value,
      source: env ? "env" : stored ? "painel" : null,
      hint: value ? `${value.slice(0, 4)}••••${value.slice(-4)}` : null,
      full: env ? null : stored,
    };
  });
