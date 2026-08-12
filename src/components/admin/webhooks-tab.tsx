import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateWebhookSecret, rotateSalesSecret } from "@/lib/licenses.functions";
import { fmt } from "@/lib/licenses-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { WebhookEventsLog } from "./webhook-events-log";

type Outbound = {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: string;
};

type SalesEvent = {
  id: string;
  provider: string;
  event_type: string | null;
  external_id: string | null;
  processed: boolean;
  signature_valid: boolean;
  error: string | null;
  created_at: string;
};

export function WebhooksTab() {
  const rotate = useServerFn(rotateSalesSecret);
  const genSecret = useServerFn(generateWebhookSecret);
  const [inboundSecret, setInboundSecret] = useState<string>("");
  const [hooks, setHooks] = useState<Outbound[]>([]);
  const [events, setEvents] = useState<SalesEvent[]>([]);
  const [form, setForm] = useState({ name: "", url: "", secret: "" });
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;

  async function load() {
    const [{ data: setting }, { data: outbound }, { data: log }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "sales_webhook_secret").maybeSingle(),
      supabase.from("outbound_webhooks").select("*").order("created_at", { ascending: false }),
      supabase.from("sales_webhook_events").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setInboundSecret(setting?.value ?? "");
    setHooks((outbound ?? []) as Outbound[]);
    setEvents((log ?? []) as SalesEvent[]);
  }

  useEffect(() => {
    load();
  }, []);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast.success("Copiado.");
  }

  async function addHook() {
    if (!form.name || !form.url) return toast.error("Informe nome e URL.");
    const secret = form.secret || (await genSecret({})).value;
    const { error } = await supabase.from("outbound_webhooks").insert({
      name: form.name,
      url: form.url,
      secret,
      events: ["license.created", "license.updated"],
    });
    if (error) return toast.error(error.message);
    setForm({ name: "", url: "", secret: "" });
    toast.success("Webhook de saída cadastrado.");
    load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Webhook de entrada (plataforma de vendas)</CardTitle>
          <CardDescription>
            Configure esta URL na sua plataforma. Ela cria, renova, cancela ou reembolsa licenças
            automaticamente e devolve na resposta os dados da licença gerada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL do endpoint</Label>
            <div className="flex gap-2">
              <Input readOnly value={`${baseUrl}/api/public/webhooks/sales`} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => copy(`${baseUrl}/api/public/webhooks/sales`)}>
                Copiar
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Segredo (assinatura HMAC SHA-256 do corpo)</Label>
            <div className="flex gap-2">
              <Input readOnly value={inboundSecret || "não configurado"} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => copy(inboundSecret)} disabled={!inboundSecret}>
                Copiar
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  const { value } = await rotate({});
                  setInboundSecret(value);
                  toast.success("Novo segredo gerado.");
                }}
              >
                Gerar novo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie a assinatura no cabeçalho <code>x-webhook-signature</code>. Sem segredo configurado, o
              endpoint aceita chamadas sem assinatura.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks de saída</CardTitle>
          <CardDescription>
            Recebem <code>license.created</code> e <code>license.updated</code> com os dados da licença.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input
              placeholder="https://sua-plataforma.com/webhook"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <Button onClick={addHook}>Adicionar</Button>
          </div>
          {hooks.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
              <div className="min-w-40 flex-1">
                <p className="font-medium">{h.name}</p>
                <p className="truncate text-xs text-muted-foreground">{h.url}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => copy(h.secret)}>
                Copiar segredo
              </Button>
              <Switch
                checked={h.active}
                onCheckedChange={async (v) => {
                  await supabase.from("outbound_webhooks").update({ active: v }).eq("id", h.id);
                  setHooks((prev) => prev.map((x) => (x.id === h.id ? { ...x, active: v } : x)));
                }}
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await supabase.from("outbound_webhooks").delete().eq("id", h.id);
                  load();
                }}
              >
                Remover
              </Button>
            </div>
          ))}
          {!hooks.length && <p className="text-sm text-muted-foreground">Nenhum webhook de saída cadastrado.</p>}
        </CardContent>
      </Card>

      <WebhookEventsLog />
    </div>
  );
}
