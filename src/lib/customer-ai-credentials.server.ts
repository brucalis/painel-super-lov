import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AgentAiProvider } from "@/lib/github-agent.server";

const CUSTOMER_EDITION = "customer-s1";
const FALLBACK_PREFIX = "customer_ai_credentials";

export type CustomerProvider = "groq" | "gemini";
type CredentialRow = {
  provider: CustomerProvider;
  encrypted_key: string;
  encryption_iv: string;
  encryption_tag: string;
  key_hint: string;
  model: string;
  validated_at: string | null;
};

type AppSettingRow = { key?: string; value?: string };

const db = () => supabaseAdmin as unknown as { from: (table: string) => any };
const masterKey = () => {
  const secret =
    process.env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.LICENSE_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (secret.length < 24) throw new Error("CUSTOMER_CREDENTIALS_ENCRYPTION_KEY_NOT_CONFIGURED");
  return createHash("sha256").update(secret).digest();
};

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encrypted_key: encrypted.toString("base64"),
    encryption_iv: iv.toString("base64"),
    encryption_tag: cipher.getAuthTag().toString("base64"),
  };
}

function decrypt(row: CredentialRow) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(row.encryption_iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.encryption_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_key, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isCustomerEdition(request: Request) {
  return request.headers.get("x-super-lovable-edition") === CUSTOMER_EDITION;
}

const hint = (value: string) => `••••••••${value.slice(-4)}`;
const fallbackKey = (licenseId: string, provider: CustomerProvider) =>
  `${FALLBACK_PREFIX}:${licenseId}:${provider}`;

function storageError() {
  return new Response(
    "Não foi possível concluir a configuração segura agora. Tente novamente em alguns instantes.",
    { status: 503 },
  );
}

function safeCredentialRow(value: unknown): CredentialRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const provider = String(row.provider || "");
  if (provider !== "groq" && provider !== "gemini") return null;
  const required = ["encrypted_key", "encryption_iv", "encryption_tag", "key_hint", "model"];
  if (required.some((key) => !String(row[key] || ""))) return null;
  return {
    provider,
    encrypted_key: String(row.encrypted_key),
    encryption_iv: String(row.encryption_iv),
    encryption_tag: String(row.encryption_tag),
    key_hint: String(row.key_hint),
    model: String(row.model),
    validated_at: row.validated_at ? String(row.validated_at) : null,
  };
}

async function readFallbackRows(licenseId: string): Promise<CredentialRow[]> {
  const keys = (["groq", "gemini"] as CustomerProvider[]).map((provider) =>
    fallbackKey(licenseId, provider),
  );
  const { data, error } = await db().from("app_settings").select("key,value").in("key", keys);
  if (error) throw error;
  return ((data || []) as AppSettingRow[]).flatMap((item) => {
    try {
      const parsed = safeCredentialRow(JSON.parse(String(item.value || "{}")));
      return parsed ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

async function saveFallbackRow(licenseId: string, row: CredentialRow) {
  const { error } = await db().from("app_settings").upsert(
    {
      key: fallbackKey(licenseId, row.provider),
      value: JSON.stringify(row),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw error;
}

async function deleteFallbackRow(licenseId: string, provider: CustomerProvider) {
  const { error } = await db()
    .from("app_settings")
    .delete()
    .eq("key", fallbackKey(licenseId, provider));
  if (error) throw error;
}

async function readPrimaryRows(licenseId: string) {
  const { data, error } = await db()
    .from("github_license_ai_credentials")
    .select("provider,encrypted_key,encryption_iv,encryption_tag,key_hint,model,validated_at")
    .eq("license_id", licenseId);
  if (error) return { available: false, rows: [] as CredentialRow[], error };
  return {
    available: true,
    rows: ((data || []) as unknown[])
      .map(safeCredentialRow)
      .filter((row): row is CredentialRow => Boolean(row)),
    error: null,
  };
}

async function promoteFallbackRows(licenseId: string, rows: CredentialRow[]) {
  for (const row of rows) {
    const { error } = await db().from("github_license_ai_credentials").upsert(
      {
        license_id: licenseId,
        ...row,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "license_id,provider" },
    );
    if (!error) {
      await deleteFallbackRow(licenseId, row.provider).catch(() => undefined);
    }
  }
}

async function credentialRows(licenseId: string): Promise<CredentialRow[]> {
  const primary = await readPrimaryRows(licenseId);
  let fallback: CredentialRow[] = [];
  try {
    fallback = await readFallbackRows(licenseId);
  } catch (fallbackError) {
    if (!primary.available) {
      console.error("[customer-ai] armazenamento de credenciais indisponível", {
        primaryCode: String(primary.error?.code || "unknown"),
        fallbackCode: String((fallbackError as any)?.code || "unknown"),
      });
      throw storageError();
    }
  }

  if (!primary.available) return fallback;
  if (!fallback.length) return primary.rows;

  const merged = new Map<CustomerProvider, CredentialRow>();
  for (const row of primary.rows) merged.set(row.provider, row);
  const missing = fallback.filter((row) => !merged.has(row.provider));
  for (const row of missing) merged.set(row.provider, row);

  if (missing.length) {
    await promoteFallbackRows(licenseId, missing).catch(() => undefined);
  }
  return [...merged.values()];
}

async function validate(provider: CustomerProvider, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const url =
      provider === "groq"
        ? "https://api.groq.com/openai/v1/models"
        : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      headers: provider === "groq" ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Response(
        `A chave ${provider === "groq" ? "Groq" : "Gemini"} é inválida ou não possui acesso.`,
        { status: 422 },
      );
    }
    if (response.status === 429) {
      throw new Response(
        `A conta ${provider === "groq" ? "Groq" : "Gemini"} atingiu o limite temporário.`,
        { status: 429 },
      );
    }
    if (!response.ok) throw new Response("Não foi possível validar essa chave agora.", { status: 503 });
    const data = (await response.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ name?: string }>;
    };
    if (provider === "groq") {
      const models = new Set((data.data || []).map((item) => String(item.id || "")));
      return (
        ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"].find((id) => models.has(id)) ||
        "openai/gpt-oss-20b"
      );
    }
    const models = new Set(
      (data.models || []).map((item) => String(item.name || "").replace(/^models\//, "")),
    );
    return (
      ["gemini-2.5-flash", "gemini-2.5-flash-lite"].find((id) => models.has(id)) ||
      "gemini-2.5-flash"
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Não foi possível conectar ao provedor para validar a chave.", { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function customerCredentialStatus(licenseId: string) {
  const rows = await credentialRows(licenseId);
  const status = (provider: CustomerProvider) => {
    const row = rows.find((item) => item.provider === provider);
    return row
      ? {
          configured: true,
          keyHint: row.key_hint,
          model: row.model,
          validatedAt: row.validated_at,
        }
      : { configured: false, keyHint: null, model: null, validatedAt: null };
  };
  return {
    groq: status("groq"),
    gemini: status("gemini"),
    configured: rows.some((row) => row.provider === "groq" || row.provider === "gemini"),
  };
}

export async function saveCustomerAiKey(
  licenseId: string,
  providerValue: string,
  rawKey: string,
) {
  if (!["groq", "gemini"].includes(providerValue)) {
    throw new Response("Provedor inválido.", { status: 400 });
  }
  const provider = providerValue as CustomerProvider;
  const apiKey = String(rawKey || "").trim();
  if (apiKey.length < 20) throw new Response("Informe uma chave de API válida.", { status: 422 });

  const model = await validate(provider, apiKey);
  const row: CredentialRow = {
    provider,
    ...encrypt(apiKey),
    key_hint: hint(apiKey),
    model,
    validated_at: new Date().toISOString(),
  };

  const { error: primaryError } = await db().from("github_license_ai_credentials").upsert(
    {
      license_id: licenseId,
      ...row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "license_id,provider" },
  );

  if (primaryError) {
    console.warn("[customer-ai] armazenamento principal indisponível; usando contingência", {
      code: String(primaryError.code || "unknown"),
    });
    try {
      await saveFallbackRow(licenseId, row);
    } catch (fallbackError) {
      console.error("[customer-ai] falha também no armazenamento de contingência", {
        code: String((fallbackError as any)?.code || "unknown"),
      });
      throw storageError();
    }
  } else {
    await deleteFallbackRow(licenseId, provider).catch(() => undefined);
  }

  return { provider, configured: true, keyHint: hint(apiKey), model };
}

export async function deleteCustomerAiKey(licenseId: string, providerValue: string) {
  if (!["groq", "gemini"].includes(providerValue)) {
    throw new Response("Provedor inválido.", { status: 400 });
  }
  const provider = providerValue as CustomerProvider;
  const { error: primaryError } = await db()
    .from("github_license_ai_credentials")
    .delete()
    .eq("license_id", licenseId)
    .eq("provider", provider);

  let fallbackError: unknown = null;
  try {
    await deleteFallbackRow(licenseId, provider);
  } catch (error) {
    fallbackError = error;
  }

  if (primaryError && fallbackError) throw storageError();
}

export async function customerAiProvider(
  request: Request,
  licenseId: string,
  required = true,
): Promise<AgentAiProvider | undefined> {
  if (!isCustomerEdition(request)) return undefined;
  const rows = await credentialRows(licenseId);
  const groq = rows.find((row) => row.provider === "groq");
  const gemini = rows.find((row) => row.provider === "gemini");
  if (!groq && !gemini) {
    if (required) {
      throw new Response("Conecte sua chave do Groq ou Gemini antes de enviar comandos.", {
        status: 428,
      });
    }
    return undefined;
  }
  return {
    kind: "customer",
    groq: groq ? { apiKey: decrypt(groq), model: groq.model } : undefined,
    gemini: gemini ? { apiKey: decrypt(gemini), model: gemini.model } : undefined,
  };
}
