const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve((request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Método não permitido." }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const databaseConfigured = Boolean(Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const aiConfigured = Boolean(Deno.env.get("LOVABLE_API_KEY"));
  return new Response(
    JSON.stringify({
      ok: databaseConfigured && aiConfigured,
      service: "superlovable-prompt-optimizer",
      database_configured: databaseConfigured,
      ai_configured: aiConfigured,
      checked_at: new Date().toISOString(),
    }),
    {
      status: databaseConfigured && aiConfigured ? 200 : 503,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
});
