import { createFileRoute } from "@tanstack/react-router";

function isMalformedAiJson(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /unterminated string|unexpected end of json|expected.*json|json.*position|plano de código válido/i.test(
    message,
  );
}

export const Route = createFileRoute("/api/public/agent/plan")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/license.server")).preflight(),
      POST: async ({ request }) => {
        const { json } = await import("@/lib/license.server");
        try {
          const agent = await import("@/lib/github-agent.server");
          const auth = await agent.requireAgentLicense(request);
          const body = (await request.json()) as {
            prompt?: string;
            reduced_context?: boolean;
          };
          const prompt = String(body.prompt || "").trim();
          if (prompt.length < 3)
            return json({ ok: false, error: "Descreva a alteração desejada." }, 400);
          if (prompt.length > 8_000)
            return json({ ok: false, error: "O pedido é muito longo." }, 413);

          try {
            return json({
              ok: true,
              ...(await agent.planAgentRun(auth, prompt, {
                reducedContext: Boolean(body.reduced_context),
              })),
            });
          } catch (firstError) {
            if (!isMalformedAiJson(firstError)) throw firstError;

            console.warn("[github-agent/plan] resposta JSON truncada; refazendo plano compacto", {
              error: firstError instanceof Error ? firstError.message : String(firstError),
            });

            const recoveryPrompt = `${prompt}\n\nINSTRUÇÃO INTERNA DE RECUPERAÇÃO: a resposta anterior da IA foi truncada. Gere um plano JSON mais compacto. Use edits cirúrgicos pequenos, não repita arquivos inteiros, priorize os arquivos essenciais e mantenha a resposta suficientemente curta para terminar o JSON.`;

            try {
              return json({
                ok: true,
                recovered_from_truncated_json: true,
                ...(await agent.planAgentRun(auth, recoveryPrompt, { reducedContext: true })),
              });
            } catch (retryError) {
              if (isMalformedAiJson(retryError)) {
                return json(
                  {
                    ok: false,
                    error:
                      "A IA interrompeu a resposta antes de terminar o plano. A Super Lovable vai tentar novamente com um contexto menor.",
                    code: "AI_PLAN_TRUNCATED",
                    retryable: true,
                  },
                  502,
                );
              }
              throw retryError;
            }
          }
        } catch (error) {
          if (error instanceof Response)
            return json({ ok: false, error: await error.text() }, error.status);
          const agent = await import("@/lib/github-agent.server");
          const details = agent.agentErrorDetails(error);
          return json(
            {
              ok: false,
              error: details.message,
              code: details.code,
              retryable: details.retryable,
            },
            details.status,
          );
        }
      },
    },
  },
});
