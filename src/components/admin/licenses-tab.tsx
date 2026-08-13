import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createLicense, resendLicenseEmail, resendLicenseWebhook } from "@/lib/licenses.functions";
import {
  fetchLicenses,
  effectiveStatus,
  daysLeft,
  fmt,
  STATUS_LABEL,
  type License,
  type LicenseStatus,
} from "@/lib/licenses-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Device = {
  id: string;
  device_id: string;
  device_name: string | null;
  extension_version: string | null;
  active: boolean;
  first_seen_at: string;
  last_seen_at: string;
};

type EventRow = { id: string; type: string; message: string | null; created_at: string };

function statusVariant(status: LicenseStatus) {
  if (status === "active") return "default" as const;
  if (status === "pending") return "secondary" as const;
  return "destructive" as const;
}

export function LicensesTab() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detail, setDetail] = useState<License | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const resendAccess = useServerFn(resendLicenseEmail);

  async function handleResendAccess(license: License) {
    if (!license.customers?.email) {
      toast.error("Esta licença não possui e-mail de cliente cadastrado.");
      return;
    }
    setResendingId(license.id);
    try {
      const result = await resendAccess({ data: { license_id: license.id } });
      if (result.sent) {
        toast.success(`Acesso reenviado para ${license.customers.email}.`);
      } else {
        const reasons: Record<string, string> = {
          disabled: "O envio automático de e-mails está desativado nas configurações.",
          customer_email_missing: "Esta licença não possui e-mail de cliente cadastrado.",
          sendgrid_not_configured: "O serviço de e-mail ainda não está configurado.",
          sendgrid_quota_exceeded: "A cota de envios do SendGrid foi atingida.",
          sendgrid_unavailable: "O serviço de e-mail está temporariamente indisponível.",
        };
        toast.error(reasons[result.reason || ""] || `Não foi possível reenviar o acesso (${result.reason || "falha não informada"}).`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reenviar o acesso.");
    } finally {
      setResendingId(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      setLicenses(await fetchLicenses());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return licenses.filter((l) => {
      const status = effectiveStatus(l);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      return [l.license_key, l.order_id, l.plan_name, l.customers?.email, l.customers?.full_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [licenses, search, statusFilter]);

  const stats = useMemo(() => {
    const active = licenses.filter((l) => effectiveStatus(l) === "active").length;
    const expiring = licenses.filter((l) => {
      const d = daysLeft(l);
      return effectiveStatus(l) === "active" && d !== null && d <= 7;
    }).length;
    return { total: licenses.length, active, expiring };
  }, [licenses]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Licenças", value: stats.total },
          { label: "Ativas", value: stats.active },
          { label: "Vencendo em 7 dias", value: stats.expiring },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por chave, e-mail, pedido…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={load}>
            Atualizar
          </Button>
          <NewLicenseDialog onCreated={load} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chave</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Ativada em</TableHead>
                <TableHead>Expira em</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!loading && !filtered.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Nenhuma licença encontrada.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((l) => {
                const status = effectiveStatus(l);
                const d = daysLeft(l);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.license_key}</TableCell>
                    <TableCell>
                      <div className="text-sm">{l.customers?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.customers?.email ?? "sem cliente"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{l.plan_name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(status)}>{STATUS_LABEL[status]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.activation_started_at ? (
                        fmt(l.activation_started_at)
                      ) : (
                        <span className="text-amber-600">Aguardando primeira ativação</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.is_lifetime ? (
                        "Vitalícia"
                      ) : !l.activation_started_at ? (
                        <span className="text-muted-foreground">Prazo ainda não iniciado</span>
                      ) : (
                        <>
                          {fmt(l.expires_at)}
                          {d !== null && status === "active" && (
                            <span className="ml-2 text-xs text-muted-foreground">({d}d)</span>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.source}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!l.customers?.email || resendingId === l.id}
                          onClick={() => handleResendAccess(l)}
                        >
                          {resendingId === l.id ? "Reenviando…" : "Reenviar acesso"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDetail(l)}>
                          Gerenciar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LicenseDetailDialog license={detail} onClose={() => setDetail(null)} onChanged={load} />
    </div>
  );
}

function NewLicenseDialog({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createLicense);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    period: "monthly",
    device_limit: "1",
    email: "",
    name: "",
    phone: "",
    order_id: "",
    notes: "",
  });

  async function submit() {
    setBusy(true);
    try {
      const periods: Record<string, { plan: string; name: string; days?: number; minutes?: number; lifetime?: boolean }> = {
        test: { plan: "test_30m", name: "Teste · 30 minutos", minutes: 30 },
        weekly: { plan: "weekly", name: "Semanal · 7 dias", days: 7 },
        monthly: { plan: "monthly", name: "Mensal · 30 dias", days: 30 },
        annual: { plan: "annual", name: "Anual · 12 meses", days: 365 },
        lifetime: { plan: "lifetime", name: "Vitalícia", lifetime: true },
      };
      const selected = periods[form.period] || periods.monthly;
      const created = await create({
        data: {
          plan: selected.plan,
          plan_name: selected.name,
          is_lifetime: !!selected.lifetime,
          duration_days: selected.days ?? null,
          duration_minutes: selected.minutes ?? null,
          device_limit: Number(form.device_limit) || 1,
          order_id: form.order_id || null,
          notes: form.notes || null,
          customer_email: form.email || null,
          customer_name: form.name || null,
          customer_phone: form.phone || null,
        },
      });
      await navigator.clipboard?.writeText(created.license.license_key).catch(() => {});
      if (form.email && !created.email.sent) {
        toast.warning(`Licença criada, mas o e-mail não foi enviado (${created.email.reason || "motivo não informado"}).`);
      } else {
        toast.success(`Licença criada: ${created.license.license_key}${form.email ? " e enviada por e-mail" : " (copiada)"}.`);
      }
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Gerar licença</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar nova licença</DialogTitle>
          <DialogDescription>A chave é criada no formato LVA-XXXX-XXXX-XXXX-XXXX.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Tipo e período da licença</Label>
            <Select value={form.period} onValueChange={(period) => setForm({ ...form, period })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Teste · 30 minutos</SelectItem>
                <SelectItem value="weekly">Semanal · 7 dias</SelectItem>
                <SelectItem value="monthly">Mensal · 30 dias</SelectItem>
                <SelectItem value="annual">Anual · 12 meses</SelectItem>
                <SelectItem value="lifetime">Vitalícia</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Nos planos temporários, a validade começa somente na primeira ativação e não reinicia ao atualizar ou reinstalar a extensão.</p>
          </div>
          <div className="space-y-2">
              <Label>Limite de navegadores/dispositivos</Label>
            <Input
              type="number"
              min={1}
              value={form.device_limit}
              onChange={(e) => setForm({ ...form, device_limit: e.target.value })}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail do cliente</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Nome do cliente</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Pedido / referência</Label>
            <Input value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Gerando…" : "Gerar licença"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LicenseDetailDialog({
  license,
  onClose,
  onChanged,
}: {
  license: License | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const resend = useServerFn(resendLicenseWebhook);
  const resendAccess = useServerFn(resendLicenseEmail);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!license) return;
    setExpiry(license.expires_at ? license.expires_at.slice(0, 10) : "");
    supabase
      .from("license_devices")
      .select("*")
      .eq("license_id", license.id)
      .order("last_seen_at", { ascending: false })
      .then(({ data }) => setDevices((data ?? []) as Device[]));
    supabase
      .from("license_events")
      .select("id, type, message, created_at")
      .eq("license_id", license.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setEvents((data ?? []) as EventRow[]));
  }, [license]);

  if (!license) return null;

  async function patch(values: Record<string, unknown>, message: string) {
    setBusy(true);
    const { error } = await supabase.from("licenses").update(values as never).eq("id", license!.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await supabase.from("license_events").insert({ license_id: license!.id, type: "admin.update", message });
    toast.success(message);
    onChanged();
    onClose();
  }

  function addDays(days: number) {
    const base =
      license!.expires_at && Date.parse(license!.expires_at) > Date.now()
        ? Date.parse(license!.expires_at)
        : Date.now();
    return patch(
      { expires_at: new Date(base + days * 86400000).toISOString(), is_lifetime: false, status: "active" },
      `Prazo estendido em ${days} dias.`,
    );
  }

  async function toggleDevice(device: Device) {
    const { error } = await supabase
      .from("license_devices")
      .update({ active: !device.active })
      .eq("id", device.id);
    if (error) return toast.error(error.message);
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, active: !d.active } : d)));
    toast.success(device.active ? "Dispositivo desativado." : "Dispositivo reativado.");
  }

  async function removeLicense() {
    if (!confirm("Excluir esta licença definitivamente?")) return;
    const { error } = await supabase.from("licenses").delete().eq("id", license!.id);
    if (error) return toast.error(error.message);
    toast.success("Licença excluída.");
    onChanged();
    onClose();
  }

  async function handleResendAccess() {
    if (!license.customers?.email) return toast.error("Esta licença não possui e-mail de cliente cadastrado.");
    setBusy(true);
    try {
      const result = await resendAccess({ data: { license_id: license.id } });
      if (result.sent) toast.success(`Acesso reenviado para ${license.customers.email}.`);
      else toast.error(`Não foi possível reenviar o acesso (${result.reason || "falha não informada"}).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reenviar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!license} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{license.license_key}</DialogTitle>
          <DialogDescription>
            {license.plan_name} · criada em {fmt(license.created_at)} · origem {license.source}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{license.customers?.full_name ?? "Sem nome"}</p>
              <p className="text-muted-foreground">{license.customers?.email ?? "sem e-mail"}</p>
              <p className="text-muted-foreground">{license.customers?.phone ?? "sem telefone"}</p>
              <p className="text-xs text-muted-foreground">Pedido: {license.order_id ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                Última validação: {fmt(license.last_validated_at)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Prazo e situação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <p>
                  <span className="font-medium">Ativada em:</span>{" "}
                  {license.activation_started_at ? fmt(license.activation_started_at) : "Aguardando primeira ativação"}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Expira em:</span>{" "}
                  {license.is_lifetime
                    ? "Vitalícia"
                    : license.activation_started_at
                      ? fmt(license.expires_at)
                      : "Prazo ainda não iniciado"}
                </p>
              </div>
              <Select
                value={license.status}
                onValueChange={(v) => patch({ status: v }, `Situação alterada para ${STATUS_LABEL[v as LicenseStatus]}.`)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                <Button
                  variant="outline"
                  disabled={!expiry || busy}
                  onClick={() =>
                    patch(
                      { expires_at: new Date(`${expiry}T23:59:59`).toISOString(), is_lifetime: false },
                      "Validade atualizada.",
                    )
                  }
                >
                  Salvar
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => addDays(30)}>
                  +30 dias
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => addDays(365)}>
                  +1 ano
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => patch({ is_lifetime: true, expires_at: null }, "Licença tornada vitalícia.")}
                >
                  Vitalícia
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Limite de dispositivos</Label>
                <Input
                  type="number"
                  min={1}
                  defaultValue={license.device_limit}
                  className="w-24"
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 1;
                    if (v !== license.device_limit) patch({ device_limit: v }, `Limite ajustado para ${v}.`);
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Navegadores/dispositivos ({devices.filter((d) => d.active).length}/{license.device_limit})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!devices.length && <p className="text-sm text-muted-foreground">Nenhum dispositivo ativado.</p>}
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <p>{d.device_name ?? d.device_id}</p>
                  <p className="text-xs text-muted-foreground">
                    v{d.extension_version ?? "?"} · visto em {fmt(d.last_seen_at)}
                  </p>
                </div>
                <Button size="sm" variant={d.active ? "outline" : "secondary"} onClick={() => toggleDevice(d)}>
                  {d.active ? "Desativar" : "Reativar"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {!events.length && <p className="text-muted-foreground">Sem registros.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex justify-between gap-4 border-b py-1 last:border-0">
                <span>{e.message ?? e.type}</span>
                <span className="shrink-0 text-muted-foreground">{fmt(e.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(license.license_key);
              toast.success("Chave copiada.");
            }}
          >
            Copiar chave
          </Button>
          <Button variant="outline" disabled={busy || !license.customers?.email} onClick={handleResendAccess}>
            {busy ? "Reenviando…" : "Reenviar acesso"}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await resend({ data: { license_id: license.id } });
              toast.success("Webhook reenviado.");
            }}
          >
            Reenviar webhook
          </Button>
          <Button variant="destructive" onClick={removeLicense}>
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
