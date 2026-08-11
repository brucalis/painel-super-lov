import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getEnsinaflixSecretStatus, rotateEnsinaflixSecret, getSendGridSettings, saveSendGridSettings } from "@/lib/licenses.functions";
import { fmt } from "@/lib/licenses-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";

type WebhookEvent = {
  id: string;
  event_type: string | null;
  event_label: string | null;
  order_id: string | null;
  customer_email: string | null;
  is_test: boolean;
  environment: string;
  processing_status: string;
  processing_error: string | null;
  http_status: number | null;
  duration_ms: number | null;
  payload: unknown;
  received_at: string;
};

type Mapping = {
  id: string;
  ensinaflix_product_id: string | null;
  ensinaflix_offer_public_id: string | null;
  ensinaflix_offer_id: string | null;
  plan_code: string;
  plan_name: string;
  duration_days: number | null;
  duration_minutes: number | null;
  is_lifetime: boolean;
  device_limit: number;
  is_active: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  received: "Recebido",
  processing: "Processando",
  processed: "Processado",
  ignored: "Ignorado",
  duplicate: "Duplicado",
  failed: "Falhou",
};

export function EnsinaflixTab() {
  const rotate = useServerFn(rotateEnsinaflixSecret);
  const status = useServerFn(getEnsinaflixSecretStatus);
  const getEmailSettings = useServerFn(getSendGridSettings);
  const saveEmailSettings = useServerFn(saveSendGridSettings);
  const [secret, setSecret] = useState<{ configured: boolean; hint: string | null; full: string | null; source: string | null }>({
    configured: false,
    hint: null,
    full: null,
    source: null,
  });
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [viewing, setViewing] = useState<WebhookEvent | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [eventStatus, setEventStatus] = useState("all");
  const [eventsLoading, setEventsLoading] = useState(false);
  const [form, setForm] = useState({
    ensinaflix_product_id: "",
    ensinaflix_offer_public_id: "",
    period: "monthly",
    device_limit: "1",
  });
  const [emailForm, setEmailForm] = useState({ api_key: "", from_email: "", from_name: "Superlovable", reply_to: "", enabled: false });
  const [emailConfigured, setEmailConfigured] = useState<string | null>(null);

  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
  const endpoint = `${baseUrl}/api/public/webhooks/ensinaflix`;

  async function load(silent = false) {
    if (!silent) setEventsLoading(true);
    const [{ data: ev }, { data: mp }] = await Promise.all([
      supabase
        .from("webhook_events")
        .select("*")
        .eq("provider", "ensinaflix")
        .order("received_at", { ascending: false })
        .limit(50),
      supabase.from("license_product_mappings").select("*").order("created_at", { ascending: false }),
    ]);
    setEvents((ev ?? []) as WebhookEvent[]);
    setMaps((mp ?? []) as Mapping[]);
    setSecret(await status({}));
    const email = await getEmailSettings({});
    setEmailConfigured(email.key_hint);
    setEmailForm((current) => ({ ...current, from_email: email.from_email, from_name: email.from_name, reply_to: email.reply_to, enabled: email.enabled }));
    if (!silent) setEventsLoading(false);
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(timer);
  }, []);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast.success("Copiado.");
  }

  function downloadPayload(event: WebhookEvent, format: "json" | "txt") {
    const clean = (value: string | null) => String(value || "sem-id").replace(/[^a-zA-Z0-9_-]+/g, "-");
    const stamp = new Date(event.received_at).toISOString().replace(/[:.]/g, "-");
    const filename = `webhook-${clean(event.event_type)}-pedido-${clean(event.order_id)}-${stamp}.${format}`;
    const json = JSON.stringify(event.payload, null, 2);
    const content = format === "json"
      ? json
      : [
          "LOG DE WEBHOOK — ENSINAFLIX",
          `Evento: ${event.event_type || "não informado"}`,
          `Pedido: ${event.order_id || "não informado"}`,
          `Cliente: ${event.customer_email || "não informado"}`,
          `Recebido em: ${event.received_at}`,
          `Situação: ${STATUS_LABEL[event.processing_status] || event.processing_status}`,
          `HTTP: ${event.http_status ?? "não informado"}`,
          event.processing_error ? `Erro: ${event.processing_error}` : "",
          "",
          "PAYLOAD COMPLETO",
          json,
        ].filter((line) => line !== "").join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success(`Payload baixado em ${format.toUpperCase()}.`);
  }

  const counts = {
    processed: events.filter((e) => e.processing_status === "processed").length,
    ignored: events.filter((e) => e.processing_status === "ignored").length,
    failed: events.filter((e) => e.processing_status === "failed").length,
  };
  const last = events[0];
  const eventIds = (event: WebhookEvent) => {
    const root = (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, any>;
    const payload = (root.payload ?? {}) as Record<string, any>;
    return {
      productId: payload.product?.id ? String(payload.product.id) : null,
      productName: payload.product?.name ? String(payload.product.name) : null,
      checkoutSlug: payload.product?.checkout_slug ? String(payload.product.checkout_slug) : null,
      offerId: payload.offer?.id ?? payload.order?.product_offer_id ?? null,
      offerPublicId: payload.offer?.public_id ? String(payload.offer.public_id) : null,
      offerName: payload.offer?.name ? String(payload.offer.name) : null,
    };
  };
  const filteredEvents = events.filter((event) => {
    if (eventStatus !== "all" && event.processing_status !== eventStatus) return false;
    const ids = eventIds(event);
    const haystack = [
      event.event_type, event.order_id, event.customer_email, event.processing_error,
      ids.productId, ids.productName, ids.checkoutSlug, ids.offerId, ids.offerPublicId, ids.offerName,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(eventSearch.trim().toLowerCase());
  });

  async function addMapping() {
    if (!form.ensinaflix_product_id && !form.ensinaflix_offer_public_id)
      return toast.error("Informe o ID do produto ou o ID público da oferta.");
    const periods: Record<string, { code: string; name: string; days?: number; minutes?: number; lifetime?: boolean }> = {
      test: { code: "test_30m", name: "Teste · 30 minutos", minutes: 30 },
      weekly: { code: "weekly", name: "Semanal · 7 dias", days: 7 },
      monthly: { code: "monthly", name: "Mensal · 30 dias", days: 30 },
      annual: { code: "annual", name: "Anual · 12 meses", days: 365 },
      lifetime: { code: "lifetime", name: "Vitalícia", lifetime: true },
    };
    const selected = periods[form.period] || periods.monthly;
    const { error } = await supabase.from("license_product_mappings").insert({
      provider: "ensinaflix",
      ensinaflix_product_id: form.ensinaflix_product_id || null,
      ensinaflix_offer_public_id: form.ensinaflix_offer_public_id || null,
      plan_code: selected.code,
      plan_name: selected.name,
      duration_days: selected.days ?? null,
      duration_minutes: selected.minutes ?? null,
      is_lifetime: !!selected.lifetime,
      device_limit: 1,
    });
    if (error) return toast.error(error.message);
    toast.success("Mapeamento cadastrado.");
    setForm({ ...form, ensinaflix_product_id: "", ensinaflix_offer_public_id: "" });
    load();
  }

  async function runInternalTest() {
    const body = {
      event: "pedido_pago",
      event_label: "Pedido pago",
      payload: {
        test: true,
        order: { id: Date.now(), status: "completed", amount: 197, is_renewal: false },
        customer: { name: "Teste Painel", email: "teste@painel.local" },
        status: "paid",
      },
      timestamp: new Date().toISOString(),
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    toast[res.ok ? "success" : "error"](`HTTP ${res.status} — ${JSON.stringify(out).slice(0, 160)}`);
    load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Webhook Ensinaflix</CardTitle>
          <CardDescription>
            Rota pública, sem login. Configure esta URL na Ensinaflix para criar e atualizar licenças
            automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>Webhook público: ativo</Badge>
            <Badge variant={secret.configured ? "default" : "destructive"}>
              Proteção: {secret.configured ? `segredo configurado (${secret.hint})` : "sem segredo"}
            </Badge>
            {last && (
              <Badge variant="outline">
                Último evento: {last.event_type} · HTTP {last.http_status ?? "—"} · {fmt(last.received_at)}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label>URL do endpoint</Label>
            <div className="flex gap-2">
              <Input readOnly value={endpoint} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => copy(endpoint)}>
                Copiar URL
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Segredo do webhook</Label>
            <div className="flex flex-wrap gap-2">
              <Input readOnly value={secret.hint ?? "não configurado"} className="max-w-xs font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={async () => {
                  const { value } = await rotate({});
                  copy(value);
                  toast.success("Novo segredo gerado e copiado.");
                  load();
                }}
              >
                Gerar novo segredo
              </Button>
              {secret.full && (
                <Button variant="outline" onClick={() => copy(`${endpoint}?secret=${secret.full}`)}>
                  Copiar URL com segredo
                </Button>
              )}
              <Button variant="outline" onClick={runInternalTest}>
                Testar internamente
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie no cabeçalho <code>x-webhook-secret</code> ou, se a plataforma não permitir cabeçalhos,
              use <code>?secret=…</code> na URL.
            </p>
          </div>

          <div className="flex gap-3 text-sm text-muted-foreground">
            <span>Processados: {counts.processed}</span>
            <span>Ignorados: {counts.ignored}</span>
            <span>Falhas: {counts.failed}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Envio de licenças pelo SendGrid</CardTitle>
          <CardDescription>A chave é enviada automaticamente ao e-mail do comprador depois da confirmação do pagamento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={emailConfigured ? "default" : "destructive"}>API: {emailConfigured || "não configurada"}</Badge>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>API Key do SendGrid</Label><Input type="password" placeholder={emailConfigured ? "Deixe vazio para manter a atual" : "SG..."} value={emailForm.api_key} onChange={(e) => setEmailForm({ ...emailForm, api_key: e.target.value })} /></div>
            <div><Label>E-mail remetente verificado</Label><Input type="email" value={emailForm.from_email} onChange={(e) => setEmailForm({ ...emailForm, from_email: e.target.value })} /></div>
            <div><Label>Nome do remetente</Label><Input value={emailForm.from_name} onChange={(e) => setEmailForm({ ...emailForm, from_name: e.target.value })} /></div>
            <div><Label>Responder para (opcional)</Label><Input type="email" value={emailForm.reply_to} onChange={(e) => setEmailForm({ ...emailForm, reply_to: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={async () => {
              const activeForm = { ...emailForm, enabled: true };
              await saveEmailSettings({ data: activeForm });
              toast.success("SendGrid salvo e envio automático ativado.");
              setEmailForm({ ...activeForm, api_key: "" });
              load();
            }}>Salvar e ativar</Button>
            {emailForm.enabled && <Button variant="outline" onClick={async () => {
              const disabledForm = { ...emailForm, enabled: false };
              await saveEmailSettings({ data: disabledForm });
              setEmailForm({ ...disabledForm, api_key: "" });
              toast.success("Envio automático desativado.");
              load();
            }}>Desativar envio automático</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapeamento de produtos e ofertas</CardTitle>
          <CardDescription>Define o plano e a validade gerada para cada produto/oferta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-6">
            <Input
              placeholder="product.id"
              value={form.ensinaflix_product_id}
              onChange={(e) => setForm({ ...form, ensinaflix_product_id: e.target.value })}
            />
            <Input
              placeholder="offer.public_id"
              value={form.ensinaflix_offer_public_id}
              onChange={(e) => setForm({ ...form, ensinaflix_offer_public_id: e.target.value })}
            />
            <select className="rounded-md border bg-background px-3 text-sm" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
              <option value="test">Teste · 30 minutos</option><option value="weekly">Semanal · 7 dias</option><option value="monthly">Mensal · 30 dias</option><option value="annual">Anual · 12 meses</option><option value="lifetime">Vitalícia</option>
            </select>
            <Button onClick={addMapping}>Adicionar</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Oferta</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!maps.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhum mapeamento — sem ele o webhook responde UNKNOWN_PRODUCT_MAPPING.
                  </TableCell>
                </TableRow>
              )}
              {maps.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.ensinaflix_product_id ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{m.ensinaflix_offer_public_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {m.plan_name} <span className="text-muted-foreground">({m.plan_code})</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.is_lifetime ? "Vitalícia" : m.duration_minutes ? `${m.duration_minutes} minutos` : `${m.duration_days} dias`}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        await supabase.from("license_product_mappings").delete().eq("id", m.id);
                        load();
                      }}
                    >
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Logs dos webhooks recebidos</CardTitle>
              <CardDescription>
                Os 50 eventos mais recentes são atualizados automaticamente a cada 15 segundos. Clique em Ver payload para abrir o JSON completo.
              </CardDescription>
            </div>
            <Button variant="outline" disabled={eventsLoading} onClick={() => load()}>
              {eventsLoading ? "Atualizando…" : "Atualizar agora"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <div className="grid gap-2 px-4 md:grid-cols-[1fr_220px]">
            <Input
              placeholder="Buscar por pedido, cliente, produto, oferta ou checkout…"
              value={eventSearch}
              onChange={(event) => setEventSearch(event.target.value)}
            />
            <select className="rounded-md border bg-background px-3 text-sm" value={eventStatus} onChange={(event) => setEventStatus(event.target.value)}>
              <option value="all">Todas as situações</option>
              <option value="processed">Processados</option>
              <option value="ignored">Ignorados</option>
              <option value="failed">Falhas</option>
              <option value="duplicate">Duplicados</option>
              <option value="processing">Processando</option>
            </select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Produto / oferta</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filteredEvents.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {events.length ? "Nenhum evento corresponde aos filtros." : "Nenhum evento recebido ainda."}
                  </TableCell>
                </TableRow>
              )}
              {filteredEvents.map((e) => {
                const ids = eventIds(e);
                return <TableRow key={e.id}>
                  <TableCell className="text-xs">{fmt(e.received_at)}</TableCell>
                  <TableCell className="text-xs">
                    {e.event_type} {e.is_test && <Badge variant="outline">teste</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{e.order_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.customer_email ?? "—"}</TableCell>
                  <TableCell className="max-w-64 text-xs">
                    <div className="font-medium">{ids.productName ?? ids.productId ?? "Não identificado"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {ids.productId && `product: ${ids.productId}`}
                      {ids.offerPublicId && ` · offer: ${ids.offerPublicId}`}
                      {!ids.offerPublicId && ids.offerId !== null && ` · offer.id: ${ids.offerId}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.processing_status === "failed" ? "destructive" : "default"}>
                      {STATUS_LABEL[e.processing_status] ?? e.processing_status}
                      {e.http_status ? ` · ${e.http_status}` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(e)}>Ver payload</Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Baixar payload" aria-label="Opções para baixar payload">
                            <Download className="h-4 w-4" />
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => downloadPayload(e, "json")}>Baixar JSON</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => downloadPayload(e, "txt")}>Baixar TXT</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
          {viewing && (
            <div className="border-t p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Payload completo · {viewing.event_type}</p>
                  <p className="text-xs text-muted-foreground">Recebido em {fmt(viewing.received_at)} · pedido {viewing.order_id ?? "não identificado"}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(JSON.stringify(viewing.payload, null, 2))}>Copiar JSON</Button>
                  <Button size="sm" variant="ghost" onClick={() => setViewing(null)}>Fechar</Button>
                </div>
              </div>
              {viewing.processing_error && <p className="mb-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">Erro: {viewing.processing_error}</p>}
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(viewing.payload, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
