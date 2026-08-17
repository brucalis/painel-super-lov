export type LovableOfficialMethod = "build_with_url" | "lovable_mcp" | "github_sync";

const MAX_PROMPT_LENGTH = 8_000;

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export function officialCapabilities() {
  const mcpCredentialsPresent = configured("LOVABLE_MCP_CLIENT_ID", "LOVABLE_MCP_CLIENT_SECRET");
  const githubConfigured = configured("GITHUB_APP_ID", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_PRIVATE_KEY");

  return {
    checked_at: new Date().toISOString(),
    methods: {
      build_with_url: {
        status: "available",
        scope: "new_project",
        authorization: "Lovable user confirms and uses their own account in the browser.",
      },
      lovable_mcp: {
        status: mcpCredentialsPresent ? "credentials_present_pending_validation" : "authorization_required",
        scope: "existing_project",
        endpoint: "https://mcp.lovable.dev",
        authorization: "The Super Lovable OAuth client must be accepted by Lovable.",
      },
      github_sync: {
        status: githubConfigured ? "configured" : "configuration_required",
        scope: "existing_project_code",
        authorization: "Each user authorizes selected repositories through the Super Lovable GitHub App.",
      },
    },
  } as const;
}

export function buildWithLovableUrl(input: {
  prompt: string;
  imageUrls?: string[];
  referenceUrls?: string[];
}) {
  const prompt = input.prompt.trim();
  if (prompt.length < 3) throw new Error("Digite um prompt com pelo menos 3 caracteres.");
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`O prompt deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres.`);
  }

  const parts = [`prompt=${encodeURIComponent(prompt)}`];
  for (const imageUrl of input.imageUrls ?? []) {
    if (/^https:\/\//i.test(imageUrl)) parts.push(`imageUrl=${encodeURIComponent(imageUrl)}`);
  }
  for (const referenceUrl of input.referenceUrls ?? []) {
    if (/^https:\/\//i.test(referenceUrl)) parts.push(`url=${encodeURIComponent(referenceUrl)}`);
  }

  return `https://lovable.dev/?autosubmit=true#${parts.join("&")}`;
}

export async function requireActiveExtensionLicense(request: Request) {
  const { sha256, effectiveStatus } = await import("@/lib/license.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Response("Sessão da licença não encontrada.", { status: 401 });

  const { data: device } = await supabaseAdmin
    .from("license_devices")
    .select("*, licenses(*)")
    .eq("token_hash", sha256(token))
    .maybeSingle();

  if (!device || !device.active || !device.licenses) {
    throw new Response("Dispositivo não autorizado.", { status: 403 });
  }
  if (effectiveStatus(device.licenses) !== "active") {
    throw new Response("Licença indisponível.", { status: 403 });
  }
  return { device, license: device.licenses };
}
