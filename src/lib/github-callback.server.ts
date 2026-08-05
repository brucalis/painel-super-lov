import {
  consumeOAuthState,
  exchangeCodeForToken,
  fetchGithubUser,
  findUserInstallationId,
  saveConnection,
  callbackUrl,
} from "@/lib/github.server";

function back(request: Request, params: Record<string, string>) {
  const url = new URL(request.url);
  const redirect = new URL("/admin", url.origin);
  for (const [key, value] of Object.entries(params)) redirect.searchParams.set(key, value);
  return Response.redirect(redirect.toString(), 302);
}

/**
 * Callback do GitHub App. Troca o `code` por user access token no servidor,
 * identifica o usuário pelo `state` (nunca por parâmetros arbitrários do navegador)
 * e persiste apenas metadados públicos + installation_id.
 */
export async function handleGithubCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const installationParam = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return back(request, { github: "error", reason: errorDescription || error });
  }

  if (!code && !installationParam && !state) {
    return Response.json(
      { ok: true, endpoint: "github-callback", status: "ready" },
      { status: 200 },
    );
  }

  if (!state) return back(request, { github: "error", reason: "missing_state" });

  const stateRow = await consumeOAuthState(state);
  if (!stateRow) return back(request, { github: "error", reason: "invalid_state" });

  if (!code) {
    // Instalação sem code (setup URL): sem token de usuário não confirmamos a posse.
    return back(request, { github: "error", reason: "missing_code" });
  }

  try {
    const userToken = await exchangeCodeForToken(code, callbackUrl(request));
    const githubUser = await fetchGithubUser(userToken);

    // installation_id só é aceito se a instalação realmente pertencer a este usuário.
    const ownedInstallation = await findUserInstallationId(userToken);
    const claimed = installationParam ? Number(installationParam) : null;
    const installationId =
      claimed && claimed === ownedInstallation ? claimed : ownedInstallation;

    await saveConnection({ userId: stateRow.user_id, githubUser, installationId });

    return back(request, {
      github: installationId ? "connected" : "install_required",
      ...(setupAction ? { setup_action: setupAction } : {}),
    });
  } catch (err) {
    console.error("[github/callback] falha no fluxo OAuth");
    void err;
    return back(request, { github: "error", reason: "oauth_failed" });
  }
}
