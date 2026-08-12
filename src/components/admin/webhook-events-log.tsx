import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/licenses-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";

type EventRow = {
  id: string; event_type: string | null; order_id: string | null; customer_email: string | null;
  is_test: boolean; processing_status: string; processing_error: string | null;
  http_status: number | null; payload: unknown; received_at: string;
};

const LABELS: Record<string, string> = { received: "Recebido", processing: "Processando", processed: "Processado", ignored: "Ignorado", duplicate: "Duplicado", failed: "Falhou" };

export function WebhookEventsLog() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [viewing, setViewing] = useState<EventRow | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const { data } = await supabase.from("webhook_events").select("*").eq("provider", "ensinaflix").order("received_at", { ascending: false }).limit(50);
    setEvents((data ?? []) as EventRow[]);
    if (!silent) setLoading(false);
  }
  useEffect(() => { load(); const timer = window.setInterval(() => load(true), 15000); return () => window.clearInterval(timer); }, []);

  const info = (event: EventRow) => {
    const root = (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, any>;
    const p = (root.payload ?? {}) as Record<string, any>;
    return {
      name: p.product?.name ? String(p.product.name) : null,
      product: p.product?.id ? String(p.product.id) : null,
      offer: p.offer?.public_id ?? p.subscription_plan?.public_id ?? p.offer?.id ?? p.subscription_plan?.id ?? null,
    };
  };
  const rows = events.filter((event) => {
    if (status !== "all" && event.processing_status !== status) return false;
    const meta = info(event);
    return [event.event_type, event.order_id, event.customer_email, event.processing_error, meta.name, meta.product, meta.offer].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase());
  });
  function copy(value: string) { navigator.clipboard?.writeText(value); toast.success("Copiado."); }
  function download(event: EventRow, format: "json" | "txt") {
    const clean = (value: string | null) => String(value || "sem-id").replace(/[^a-zA-Z0-9_-]+/g, "-");
    const json = JSON.stringify(event.payload, null, 2);
    const content = format === "json" ? json : ["LOG DE WEBHOOK — ENSINAFLIX", `Evento: ${event.event_type || "não informado"}`, `Pedido: ${event.order_id || "não informado"}`, `Cliente: ${event.customer_email || "não informado"}`, `Recebido em: ${event.received_at}`, `Situação: ${LABELS[event.processing_status] || event.processing_status}`, `HTTP: ${event.http_status ?? "não informado"}`, event.processing_error ? `Erro: ${event.processing_error}` : "", "", "PAYLOAD COMPLETO", json].filter(Boolean).join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `webhook-${clean(event.event_type)}-pedido-${clean(event.order_id)}.${format}`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  return <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Recebimentos recentes</CardTitle><CardDescription>Eventos da Ensinaflix atualizados automaticamente a cada 15 segundos.</CardDescription></div><Button variant="outline" disabled={loading} onClick={() => load()}>{loading ? "Atualizando…" : "Atualizar agora"}</Button></div></CardHeader>
    <CardContent className="space-y-4 p-0">
      <div className="grid gap-2 px-4 md:grid-cols-[1fr_220px]"><Input placeholder="Buscar por pedido, cliente, produto ou oferta…" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todas as situações</option><option value="processed">Processados</option><option value="ignored">Ignorados</option><option value="failed">Falhas</option><option value="duplicate">Duplicados</option><option value="processing">Processando</option></select></div>
      <Table><TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Evento</TableHead><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Produto / oferta</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader><TableBody>
        {!rows.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{events.length ? "Nenhum evento corresponde aos filtros." : "Nenhum evento recebido ainda."}</TableCell></TableRow>}
        {rows.map((event) => { const meta = info(event); return <TableRow key={event.id}><TableCell className="text-xs">{fmt(event.received_at)}</TableCell><TableCell className="text-xs">{event.event_type} {event.is_test && <Badge variant="outline">teste</Badge>}</TableCell><TableCell className="text-xs">{event.order_id ?? "—"}</TableCell><TableCell className="text-xs">{event.customer_email ?? "—"}</TableCell><TableCell className="max-w-64 text-xs"><div className="font-medium">{meta.name ?? "Não identificado"}</div><div className="font-mono text-[11px] text-muted-foreground">{meta.product && `product: ${meta.product}`}{meta.offer && ` · oferta/plano: ${meta.offer}`}</div></TableCell><TableCell><Badge variant={event.processing_status === "failed" ? "destructive" : "default"}>{LABELS[event.processing_status] ?? event.processing_status}{event.http_status ? ` · ${event.http_status}` : ""}</Badge></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setViewing(event)}>Ver payload</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" title="Baixar payload"><Download className="h-4 w-4" /><ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => download(event, "json")}>Baixar JSON</DropdownMenuItem><DropdownMenuItem onClick={() => download(event, "txt")}>Baixar TXT</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell></TableRow>; })}
      </TableBody></Table>
      {viewing && <div className="border-t p-4"><div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-sm font-medium">Payload completo · {viewing.event_type}</p><p className="text-xs text-muted-foreground">Recebido em {fmt(viewing.received_at)}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copy(JSON.stringify(viewing.payload, null, 2))}>Copiar JSON</Button><Button size="sm" variant="ghost" onClick={() => setViewing(null)}>Fechar</Button></div></div>{viewing.processing_error && <p className="mb-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">Erro: {viewing.processing_error}</p>}<pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(viewing.payload, null, 2)}</pre></div>}
    </CardContent>
  </Card>;
}
