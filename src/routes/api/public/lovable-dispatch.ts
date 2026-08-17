import { createFileRoute } from "@tanstack/react-router";

type DispatchBody = {
  method?: unknown;
  prompt?: unknown;
  image_urls?: unknown;
  reference_urls?: unknown;
  project_id?: unknown;
};

export const Route = createFileRoute("/api/public/lovable-dispatch")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/license.server");
        return preflight();
      },
      POST: async ({ request }) => {
        const { json, logEvent } = await import("@/lib/license.server");
        const { buildWithLovableUrl, officialCapabilities, requireActiveExtensionLicense } = await import(
          "@/lib/lovable-official.server"
        );

        let auth: Awaited<ReturnType<typeof requireActiveExtensionLicense>>;
        try {
          auth = await requireActiveExtensionLicense(request);
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
          return json({ ok: false, error: "Não foi possível validar a licença." }, 500);
        }

        let body: DispatchBody;
        try {
          body = (await request.json()) as DispatchBody;
        } catch {
          return json({ ok: false, error: "Requisição inválida." }, 400);
        }

        const method = String(body.method || "build_with_url");
        const prompt = String(body.prompt || "").trim();
        const imageUrls = Array.isArray(body.image_urls) ? body.image_urls.map(String).slice(0, 5) : [];
        const referenceUrls = Array.isArray(body.reference_urls) ? body.reference_urls.map(String).slice(0, 5) : [];

        if (method === "build_with_url") {
          try {
            const openUrl = buildWithLovableUrl({ prompt, imageUrls, referenceUrls });
            await logEvent(auth.license.id, "lovable.official_build_url", "Link oficial da Lovable gerado.", {
              prompt_length: prompt.length,
              image_count: imageUrls.length,
              reference_count: referenceUrls.length,
            });
            return json({
              ok: true,
              method,
              action: "open_url",
              open_url: openUrl,
              scope: "new_project",
              confirmed_execution: false,
              message: "Abra o link para a Lovable criar um novo projeto com o prompt informado.",
            });
          } catch (error) {
            return json({ ok: false, error: error instanceof Error ? error.message : "Prompt inválido." }, 400);
          }
        }

        const capabilities = officialCapabilities();
        if (method === "lovable_mcp") {
          return json({
            ok: false,
            code: "LOVABLE_MCP_CLIENT_NOT_SUPPORTED",
            method,
            capability: capabilities.methods.lovable_mcp,
            message: "O MCP está disponível na conta, mas a extensão Super Lovable não é um dos clientes OAuth aceitos atualmente pelo servidor oficial.",
          }, 501);
        }

        if (method === "github_sync") {
          return json({
            ok: false,
            code: "GITHUB_PROJECT_LINK_REQUIRED",
            method,
            capability: capabilities.methods.github_sync,
            message: "Conecte o GitHub e vincule o repositório do projeto antes de enviar alterações por Git Sync.",
          }, 409);
        }

        return json({ ok: false, error: "Método de integração desconhecido." }, 400);
      },
    },
  },
});
