import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getEnsinaflixSecretStatus, rotateEnsinaflixSecret } from "@/lib/licenses.functions";
import { fmt } from "@/lib/licenses-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const [secret, setSecret] = useState<{ configured: boolean; hint: string | null; full: string | null; source: string | null }>({
    configured: false,
    hint: null,
    full: null,
    source: null,
  });
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [maps, setMaps] = useState<Mapping[]>([]);
  const [viewing, setViewing] = useState<WebhookEvent | null>(null);
  const [form, setForm] = useState({
    ensinaflix_product_id: "",
    ensinaflix_offer_public_id: "",
    plan_code: "twelve_months",
    plan_name: "Plano Anual",
    duration_days: "365",
    is_lifetime: false,
    device_limit: "1",
  });

  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
  const endpoint = `${baseUrl}/api/public/webhooks/ensinaflix`;

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, []);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast.success("Copiado.");
  }

  const counts = {
    processed: events.filter((e) => e.processing_status === "processed").length,
    ignored: events.filter((e) => e.processing_status === "ignored").length,
    failed: events.filter((e) => e.processing_status === "failed").length,
  };
  const last = events[0];

  async function addMapping() {
    if (!form.ensinaflix_product_id && !form.ensinaflix_offer_public_id)
      return toast.error("Informe o ID do produto ou o ID público da oferta.");
    const { error } = await supabase.from("license_product_mappings").insert({
      provider: "ensinaflix",
      ensinaflix_product_id: form.ensinaflix_product_id || null,
      ensinaflix_offer_public_id: form.ensinaflix_offer_public_id || null,
      plan_code: form.plan_code,
      plan_name: form.plan_name,
      duration_days: form.is_lifetime ? null : Number(form.duration_days) || null,
      is_lifetime: form.is_lifetime,
      device_limit: Number(form.device_limit) || 1,
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
            <Input
              placeholder="plan_code"
              value={form.plan_code}
              onChange={(e) => setForm({ ...form, plan_code: e.target.value })}
            />
            <Input
              placeholder="Nome do plano"
              value={form.plan_name}
              onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
            />
            <Input
              placeholder="Dias (vazio = vitalícia)"
              value={form.duration_days}
              onChange={(e) =>
                setForm({ ...form, duration_days: e.target.value, is_lifetime: !e.target.value })
              }
            />
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
                    {m.is_lifetime ? "Vitalícia" : `${m.duration_days} dias`}
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
          <CardTitle>Eventos recebidos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!events.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum evento recebido ainda.
                  </TableCell>
                </TableRow>
              )}
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{fmt(e.received_at)}</TableCell>
                  <TableCell className="text-xs">
                    {e.event_type} {e.is_test && <Badge variant="outline">teste</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{e.order_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.customer_email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={e.processing_status === "failed" ? "destructive" : "default"}>
                      {STATUS_LABEL[e.processing_status] ?? e.processing_status}
                      {e.http_status ? ` · ${e.http_status}` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(e)}>
                      Ver payload
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {viewing && (
            <div className="border-t p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Payload · {viewing.event_type}</p>
                <Button size="sm" variant="ghost" onClick={() => setViewing(null)}>
                  Fechar
                </Button>
              </div>
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
