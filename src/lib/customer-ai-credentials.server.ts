import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AgentAiProvider } from "@/lib/github-agent.server";

const CUSTOMER_EDITION = "customer-s1";
export type CustomerProvider = "groq" | "gemini";
type CredentialRow = { provider: CustomerProvider; encrypted_key: string; encryption_iv: string; encryption_tag: string; key_hint: string; model: string; validated_at: string | null };

const db = () => supabaseAdmin as unknown as { from: (table: string) => any };
const masterKey = () => {
  const secret = process.env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY || process.env.LICENSE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (secret.length < 24) throw new Error("CUSTOMER_CREDENTIALS_ENCRYPTION_KEY_NOT_CONFIGURED");
  return createHash("sha256").update(secret).digest();
};
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { encrypted_key: encrypted.toString("base64"), encryption_iv: iv.toString("base64"), encryption_tag: cipher.getAuthTag().toString("base64") };
}
function decrypt(row: CredentialRow) {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(row.encryption_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.encryption_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.encrypted_key, "base64")), decipher.final()]).toString("utf8");
}
export function isCustomerEdition(request: Request) {
  return request.headers.get("x-super-lovable-edition") === CUSTOMER_EDITION;
}
const hint = (value: string) => `••••••••${value.slice(-4)}`;

async function validate(provider: CustomerProvider, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = provider === "groq"
      ? "https://api.groq.com/openai/v1/models"
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      headers: provider === "groq" ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new Response(`A chave ${provider === "groq" ? "Groq" : "Gemini"} é inválida ou não possui acesso.`, { status: 422 });
    if (response.status === 429)
      throw new Response(`A conta ${provider === "groq" ? "Groq" : "Gemini"} atingiu o limite temporário.`, { status: 429 });
    if (!response.ok) throw new Response("Não foi possível validar essa chave agora.", { status: 503 });
    const data = (await response.json()) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
    if (provider === "groq") {
      const models = new Set((data.data || []).map((item) => String(item.id || "")));
      return ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"].find((id) => models.has(id)) || "openai/gpt-oss-20b";
    }
    const models = new Set((data.models || []).map((item) => String(item.name || "").replace(/^models\//, "")));
    return ["gemini-2.5-flash", "gemini-2.5-flash-lite"].find((id) => models.has(id)) || "gemini-2.5-flash";
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Não foi possível conectar ao provedor para validar a chave.", { status: 503 });
  } finally { clearTimeout(timeout); }
}

export async function customerCredentialStatus(licenseId: string) {
  const { data } = await db().from("github_license_ai_credentials").select("provider,key_hint,model,validated_at").eq("license_id", licenseId);
  const rows = (data || []) as CredentialRow[];
  const status = (provider: CustomerProvider) => {
    const row = rows.find((item) => item.provider === provider);
    return row ? { configured: true, keyHint: row.key_hint, model: row.model, validatedAt: row.validated_at } : { configured: false, keyHint: null, model: null, validatedAt: null };
  };
  return { groq: status("groq"), gemini: status("gemini"), configured: rows.some((row) => row.provider === "groq" || row.provider === "gemini") };
}
export async function saveCustomerAiKey(licenseId: string, providerValue: string, rawKey: string) {
  if (!["groq", "gemini"].includes(providerValue)) throw new Response("Provedor inválido.", { status: 400 });
  const provider = providerValue as CustomerProvider;
  const apiKey = String(rawKey || "").trim();
  if (apiKey.length < 20) throw new Response("Informe uma chave de API válida.", { status: 422 });
  const model = await validate(provider, apiKey);
  const { error } = await db().from("github_license_ai_credentials").upsert({
    license_id: licenseId, provider, ...encrypt(apiKey), key_hint: hint(apiKey), model,
    validated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "license_id,provider" });
  if (error) throw new Error("Não foi possível salvar a credencial.");
  return { provider, configured: true, keyHint: hint(apiKey), model };
}
export async function deleteCustomerAiKey(licenseId: string, providerValue: string) {
  if (!["groq", "gemini"].includes(providerValue)) throw new Response("Provedor inválido.", { status: 400 });
  const { error } = await db().from("github_license_ai_credentials").delete().eq("license_id", licenseId).eq("provider", providerValue);
  if (error) throw new Error("Não foi possível remover a credencial.");
}
export async function customerAiProvider(request: Request, licenseId: string, required = true): Promise<AgentAiProvider | undefined> {
  if (!isCustomerEdition(request)) return undefined;
  const { data } = await db().from("github_license_ai_credentials").select("provider,encrypted_key,encryption_iv,encryption_tag,key_hint,model,validated_at").eq("license_id", licenseId);
  const rows = (data || []) as CredentialRow[];
  const groq = rows.find((row) => row.provider === "groq");
  const gemini = rows.find((row) => row.provider === "gemini");
  if (!groq && !gemini) {
    if (required) throw new Response("Conecte sua chave do Groq ou Gemini antes de enviar comandos.", { status: 428 });
    return undefined;
  }
  return {
    kind: "customer",
    groq: groq ? { apiKey: decrypt(groq), model: groq.model } : undefined,
    gemini: gemini ? { apiKey: decrypt(gemini), model: gemini.model } : undefined,
  };
}
