/**
 * Camada server-only da integração com o GitHub App "Super Lovable".
 *
 * Regras:
 * - GITHUB_CLIENT_SECRET e GITHUB_PRIVATE_KEY nunca saem daqui.
 * - Nenhum token é devolvido ao frontend.
 * - Todo acesso a repositórios usa installation access token do usuário.
 */

const GITHUB_API = "https://api.github.com";
const UA = "SuperLovable-App";

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

/* ---------------------------------------------------------------- auth app */

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemBody(pem: string, label: string): Uint8Array | null {
  const match = pem.match(
    new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`),
  );
  if (!match) return null;
  const b64 = match[1].replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Envelopa uma chave PKCS#1 (BEGIN RSA PRIVATE KEY) em PKCS#8 para o WebCrypto. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const derLength = (len: number): number[] => {
    if (len < 0x80) return [len];
    const bytes: number[] = [];
    let n = len;
    while (n > 0) {
      bytes.unshift(n & 0xff);
      n >>= 8;
    }
    return [0x80 | bytes.length, ...bytes];
  };
  const algorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ];
  const octet = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const version = [0x02, 0x01, 0x00];
  const inner = [...version, ...algorithm, ...octet];
  return new Uint8Array([0x30, ...derLength(inner.length), ...inner]);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  const pkcs8 = pemBody(normalized, "PRIVATE KEY");
  const pkcs1 = pkcs8 ? null : pemBody(normalized, "RSA PRIVATE KEY");
  const keyData = pkcs8 ?? (pkcs1 ? pkcs1ToPkcs8(pkcs1) : null);
  if (!keyData) throw new Error("GITHUB_PRIVATE_KEY inválida (PEM não reconhecido)");
  return crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer.slice(keyData.byteOffset, keyData.byteOffset + keyData.byteLength) as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** JWT RS256 assinado com a private key — autentica a aplicação (não o usuário). */
export async function createAppJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: env("GITHUB_APP_ID") }),
  );
  const key = await importPrivateKey(env("GITHUB_PRIVATE_KEY"));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

/** Token temporário (1h) com o escopo exato da instalação daquele usuário. */
export async function createInstallationToken(installationId: number): Promise<string> {
  const jwt = await createAppJwt();
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "User-Agent": UA,
    },
  });
  if (!res.ok) throw new Error(`GitHub installation token falhou (${res.status})`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("GitHub não retornou installation token");
  return data.token;
}

/* -------------------------------------------------------------- oauth user */

export function authorizeUrl(state: string, redirectUri: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": UA,
    },
    body: JSON.stringify({
      client_id: env("GITHUB_CLIENT_ID"),
      client_secret: env("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth exchange falhou: ${data.error ?? res.status}`);
  }
  return data.access_token;
}

export type GithubUser = { id: number; login: string; avatar_url: string };

export async function fetchGithubUser(userToken: string): Promise<GithubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${userToken}`,
      "User-Agent": UA,
    },
  });
  if (!res.ok) throw new Error(`GitHub /user falhou (${res.status})`);
  const data = (await res.json()) as GithubUser;
  return { id: data.id, login: data.login, avatar_url: data.avatar_url };
}

/** Descobre a instalação do app pertencente ao usuário autenticado (sem usar a conta dona do app). */
export async function findUserInstallationId(userToken: string): Promise<number | null> {
  const res = await fetch(`${GITHUB_API}/user/installations?per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${userToken}`,
      "User-Agent": UA,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { installations?: Array<{ id: number; app_id: number }> };
  const appId = Number(env("GITHUB_APP_ID"));
  const match = (data.installations ?? []).find((i) => i.app_id === appId) ?? data.installations?.[0];
  return match ? match.id : null;
}

export type Repo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
};

/** Lista apenas os repositórios autorizados naquela instalação. */
export async function listInstallationRepos(installationId: number): Promise<Repo[]> {
  const token = await createInstallationToken(installationId);
  const out: Repo[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const res = await fetch(`${GITHUB_API}/installation/repositories?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": UA,
      },
    });
    if (!res.ok) throw new Error(`GitHub repositórios falhou (${res.status})`);
    const data = (await res.json()) as { repositories?: Repo[] };
    const items = data.repositories ?? [];
    out.push(
      ...items.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        default_branch: r.default_branch,
        html_url: r.html_url,
      })),
    );
    if (items.length < 100) break;
  }
  return out;
}

/* ------------------------------------------------------------ app identity */

/** Valida o Bearer token da Super Lovable e devolve o id do usuário da aplicação. */
export async function requireAppUser(request: Request): Promise<string> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = header.slice(7).trim();
  if (token.split(".").length !== 3) throw new Response("Unauthorized", { status: 401 });

  const { createClient } = await import("@supabase/supabase-js");
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Response("Unauthorized", { status: 401 });
  return String(data.claims.sub);
}

/* ------------------------------------------------------------- persistence */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function createOAuthState(userId: string, redirectTo: string | null) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const state = base64url(bytes);
  const db = await admin();
  const { error } = await db.from("github_oauth_states").insert({
    state,
    user_id: userId,
    redirect_to: redirectTo,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  } as never);
  if (error) throw new Error("Não foi possível iniciar a conexão GitHub");
  return state;
}

export async function consumeOAuthState(state: string) {
  const db = await admin();
  const { data, error } = await db
    .from("github_oauth_states")
    .select("state, user_id, redirect_to, used, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { user_id: string; redirect_to: string | null; used: boolean; expires_at: string };
  if (row.used || new Date(row.expires_at).getTime() < Date.now()) return null;
  await db.from("github_oauth_states").update({ used: true } as never).eq("state", state);
  return row;
}

export async function saveConnection(input: {
  userId: string;
  githubUser: GithubUser;
  installationId: number | null;
}) {
  const db = await admin();
  const { error } = await db.from("github_connections").upsert(
    {
      user_id: input.userId,
      github_user_id: input.githubUser.id,
      github_login: input.githubUser.login,
      github_avatar_url: input.githubUser.avatar_url,
      installation_id: input.installationId,
      status: input.installationId ? "connected" : "pending_installation",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id" },
  );
  if (error) throw new Error("Não foi possível salvar a conexão GitHub");
}

export type Connection = {
  github_user_id: number | null;
  github_login: string | null;
  github_avatar_url: string | null;
  installation_id: number | null;
  status: string;
  connected_at: string;
};

export async function getConnection(userId: string): Promise<Connection | null> {
  const db = await admin();
  const { data } = await db
    .from("github_connections")
    .select("github_user_id, github_login, github_avatar_url, installation_id, status, connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Connection | null) ?? null;
}

export async function removeConnection(userId: string) {
  const db = await admin();
  await db.from("github_connections").delete().eq("user_id", userId);
}

export function callbackUrl(request: Request): string {
  return new URL("/api/github/callback", new URL(request.url).origin).toString();
}
