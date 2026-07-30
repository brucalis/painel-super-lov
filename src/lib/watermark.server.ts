// watermark.server.ts — núcleo do fluxo "Remover marca d'água".
// Só roda no servidor. Nenhum token interno é devolvido ao navegador.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { effectiveStatus, normalizeKey, type LicenseRow } from "@/lib/license.server";

export type RemoveWatermarkInput = {
  projectId: string;
  deviceId: string;
  licenseKey: string;
};

export type RemoveWatermarkResult = {
  http: number;
  body: Record<string, unknown>;
};

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const DEDUPE_MS = 20_000;

const PROJECT_ID_RE = /^[A-Za-z0-9-]{6,64}$/;

function fail(http: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return { http, body: { ok: false, code, message, ...extra } };
}

async function log(entry: {
  license_id: string | null;
  device_id: string;
  project_id: string;
  result_code: string;
  ok: boolean;
  mechanism?: string | null;
  error?: string | null;
}) {
  try {
    await supabaseAdmin.from("watermark_removal_requests").insert({
      license_id: entry.license_id,
      device_id: entry.device_id,
      project_id: entry.project_id,
      result_code: entry.result_code,
      ok: entry.ok,
      mechanism: entry.mechanism ?? null,
      error: entry.error ?? null,
    });
  } catch {
    // o log nunca pode derrubar a operação
  }
}

/**
 * Executa a remoção usando exclusivamente um mecanismo oficialmente autorizado
 * e configurado pelo dono da conta em variáveis de ambiente.
 * Sem configuração oficial, devolvemos indisponível — nunca sucesso falso,
 * nunca CSS, nunca manipulação de DOM.
 */
async function runAuthorizedRemoval(projectId: string): Promise<
  { ok: true; mechanism: string; detail: string } | { ok: false; code: string; message: string; detail?: string }
> {
  const endpoint = process.env.WATERMARK_REMOVAL_API_URL;
  const token = process.env.WATERMARK_REMOVAL_API_TOKEN;

  if (!endpoint || !token) {
    return {
      code: "WATERMARK_REMOVAL_UNAVAILABLE",
      message: "Não foi possível remover a marca deste projeto automaticamente.",
      ok: false,
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ project_id: projectId, badge: false, show_badge: false }),
    });
    const text = (await res.text()).slice(0, 500);
    if (!res.ok) {
      return {
        ok: false,
        code: res.status === 401 || res.status === 403 ? "AUTH_ERROR" : "WATERMARK_REMOVAL_UNAVAILABLE",
        message:
          res.status === 401 || res.status === 403
            ? "A credencial oficial configurada não tem permissão para este projeto."
            : "Não foi possível remover a marca deste projeto automaticamente.",
        detail: text,
      };
    }
    return { ok: true, mechanism: "official_api", detail: text };
  } catch (e) {
    return {
      ok: false,
      code: "WATERMARK_REMOVAL_UNAVAILABLE",
      message: "Não foi possível remover a marca deste projeto automaticamente.",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function removeWatermark(input: RemoveWatermarkInput): Promise<RemoveWatermarkResult> {
  const projectId = String(input.projectId || "").trim();
  const deviceId = String(input.deviceId || "").trim();
  const licenseKey = normalizeKey(String(input.licenseKey || ""));

  if (!PROJECT_ID_RE.test(projectId)) {
    return fail(400, "PROJECT_NOT_SYNCED", "Nenhum projeto sincronizado foi identificado.");
  }
  if (!deviceId || deviceId.length > 128) {
    return fail(400, "AUTH_ERROR", "Dispositivo não identificado.");
  }
  if (!/^LVA(-[A-Z0-9]{4}){4}$/.test(licenseKey)) {
    return fail(401, "LICENSE_INVALID", "Licença inválida.");
  }

  const { data: license } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("license_key", licenseKey)
    .maybeSingle();

  if (!license) {
    await log({ license_id: null, device_id: deviceId, project_id: projectId, result_code: "LICENSE_INVALID", ok: false });
    return fail(401, "LICENSE_INVALID", "Licença inválida.");
  }

  const status = effectiveStatus(license as unknown as LicenseRow);
  if (status !== "active") {
    await log({ license_id: license.id, device_id: deviceId, project_id: projectId, result_code: "LICENSE_INVALID", ok: false, error: status });
    return fail(403, "LICENSE_INVALID", "Sua licença não está ativa.", { status });
  }

  const { data: device } = await supabaseAdmin
    .from("license_devices")
    .select("id, active")
    .eq("license_id", license.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!device || !device.active) {
    await log({ license_id: license.id, device_id: deviceId, project_id: projectId, result_code: "AUTH_ERROR", ok: false });
    return fail(403, "AUTH_ERROR", "Este dispositivo não está autorizado nesta licença.");
  }

  // proteção contra repetição e rate limit por licença
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("watermark_removal_requests")
    .select("id, project_id, created_at")
    .eq("license_id", license.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const list = recent ?? [];
  if (list.length >= RATE_MAX) {
    return fail(429, "RATE_LIMITED", "Muitas tentativas seguidas. Aguarde alguns segundos e tente novamente.");
  }
  const duplicate = list.find(
    (r) => r.project_id === projectId && Date.now() - Date.parse(r.created_at) < DEDUPE_MS,
  );
  if (duplicate) {
    return fail(429, "RATE_LIMITED", "Esta solicitação já está em andamento para este projeto.");
  }

  const result = await runAuthorizedRemoval(projectId);

  if (!result.ok) {
    await log({
      license_id: license.id,
      device_id: deviceId,
      project_id: projectId,
      result_code: result.code,
      ok: false,
      error: result.detail ?? null,
    });
    return fail(result.code === "AUTH_ERROR" ? 403 : 501, result.code, result.message);
  }

  await log({
    license_id: license.id,
    device_id: deviceId,
    project_id: projectId,
    result_code: "WATERMARK_REMOVED",
    ok: true,
    mechanism: result.mechanism,
  });

  return {
    http: 200,
    body: {
      ok: true,
      code: "WATERMARK_REMOVED",
      message: "Marca d'água removida com sucesso",
      project_id: projectId,
      mechanism: result.mechanism,
      checked_at: new Date().toISOString(),
    },
  };
}

/** Consulta o último resultado registrado para o projeto (confirmação do estado). */
export async function watermarkStatus(projectId: string, licenseKey: string) {
  const key = normalizeKey(licenseKey);
  const { data: license } = await supabaseAdmin
    .from("licenses")
    .select("id")
    .eq("license_key", key)
    .maybeSingle();
  if (!license) return { ok: false, code: "LICENSE_INVALID" as const };
  const { data } = await supabaseAdmin
    .from("watermark_removal_requests")
    .select("result_code, ok, created_at")
    .eq("license_id", license.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ok: true as const, last: data ?? null };
}
