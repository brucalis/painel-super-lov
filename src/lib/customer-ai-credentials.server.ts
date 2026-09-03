import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AgentAiProvider } from "@/lib/github-agent.server";

const EDITION_HEADER = "x-super-lovable-edition";
const CUSTOMER_EDITION = "customer-s1";
const DEFAULT_MODEL = "gpt-5-mini";
const MODEL_PREFERENCE = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini", "gpt-5", "gpt-4.1"];

type CredentialRow = {
  provider: string;
  encrypted_key: string;
  encryption_iv: string;
  encryption_tag: string;
  key_hint: string;
  model: string;
  validated_at: string | null;
};

function database() {
  return supabaseAdmin as unknown as {
    from: (table: string) => any;
  };
}

function masterKey() {
  const secret =
    process.env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.LICENSE_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (secret.length < 24) throw new Error("CUSTOMER_CREDENTIALS_ENCRYPTION_KEY_NOT_CONFIGURED");
  return createHash("sha256").update(secret).digest();
}

function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    encryptedKey: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptApiKey(row: CredentialRow) {
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
  return request.headers.get(EDITION_HEADER) === CUSTOMER_EDITION;
}

function keyHint(apiKey: string) {
  return `sk-••••••••${apiKey.slice(-4)}`;
}

async function validateOpenAiKey(apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new Response("A chave da OpenAI é inválida ou não possui acesso à API.", { status: 422 });
    if (response.status === 429)
      throw new Response("A conta OpenAI atingiu um limite temporário ou precisa de créditos de API.", { status: 429 });
    if (!response.ok)
      throw new Response("Não foi possível validar a chave na OpenAI agora.", { status: 503 });
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const available = new Set((data.data || []).map((item) => String(item.id || "")));
    return MODEL_PREFERENCE.find((model) => available.has(model)) || DEFAULT_MODEL;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Não foi possível conectar à OpenAI para validar a chave.", { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function customerCredentialStatus(licenseId: string) {
  const { data } = await database()
    .from("github_license_ai_credentials")
    .select("provider,key_hint,model,validated_at")
    .eq("license_id", licenseId)
    .maybeSingle();
  return data
    ? {
        configured: true,
        provider: "openai",
        keyHint: String(data.key_hint || ""),
        model: String(data.model || DEFAULT_MODEL),
        validatedAt: data.validated_at || null,
      }
    : { configured: false, provider: "openai", keyHint: null, model: null, validatedAt: null };
}

export async function saveCustomerOpenAiKey(licenseId: string, rawKey: string) {
  const apiKey = String(rawKey || "").trim();
  if (apiKey.length < 30 || !apiKey.startsWith("sk-"))
    throw new Response("Informe uma chave de API válida da OpenAI.", { status: 422 });
  const model = await validateOpenAiKey(apiKey);
  const encrypted = encryptApiKey(apiKey);
  const { error } = await database().from("github_license_ai_credentials").upsert({
    license_id: licenseId,
    provider: "openai",
    encrypted_key: encrypted.encryptedKey,
    encryption_iv: encrypted.iv,
    encryption_tag: encrypted.tag,
    key_hint: keyHint(apiKey),
    model,
    validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Não foi possível salvar a credencial da OpenAI.");
  return { configured: true, provider: "openai", keyHint: keyHint(apiKey), model };
}

export async function deleteCustomerOpenAiKey(licenseId: string) {
  const { error } = await database()
    .from("github_license_ai_credentials")
    .delete()
    .eq("license_id", licenseId);
  if (error) throw new Error("Não foi possível remover a credencial da OpenAI.");
}

export async function customerAiProvider(
  request: Request,
  licenseId: string,
  required = true,
): Promise<AgentAiProvider | undefined> {
  if (!isCustomerEdition(request)) return undefined;
  const { data } = await database()
    .from("github_license_ai_credentials")
    .select("provider,encrypted_key,encryption_iv,encryption_tag,key_hint,model,validated_at")
    .eq("license_id", licenseId)
    .maybeSingle();
  if (!data) {
    if (required)
      throw new Response("Conecte sua chave da OpenAI uma única vez antes de enviar comandos.", {
        status: 428,
      });
    return undefined;
  }
  return {
    kind: "openai",
    apiKey: decryptApiKey(data as CredentialRow),
    model: String(data.model || DEFAULT_MODEL),
  };
}
