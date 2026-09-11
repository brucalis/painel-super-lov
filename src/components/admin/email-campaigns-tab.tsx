import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, ChevronDown, MailPlus, Settings2, Users } from "lucide-react";
import {
  createEmailCampaign,
  getEmailCampaignDashboard,
  runEmailCampaignQueue,
  updateEmailAutomation,
} from "@/lib/licenses.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type AudienceStatus =
  | "all"
  | "awaiting_activation"
  | "activated"
  | "active"
  | "expired"
  | "pending"
  | "canceled"
  | "refunded"
  | "revoked";
type Step = { hours: 3 | 6 | 12 | 24; subject: string; body: string };
type Campaign = {
  id: string;
  name: string;
  subject: string;
  audience_status: string;
  audience_statuses?: AudienceStatus[] | null;
  audience_plan?: string | null;
  sent_count: number;
  recipients_total: number;
  failed_count: number;
  skipped_count?: number;
  status: string;
  scheduled_for?: string | null;
  created_at: string;
};
type Dashboard = {
  settings: { enabled: boolean; steps: Step[] };
  schedulerStatus: string;
  campaigns: Campaign[];
  deliveries: Array<{ status: string }>;
  counts: Record<string, number>;
  plans: Array<{ value: string; label: string }>;
};

const AUDIENCES: Record<AudienceStatus, string> = {
  all: "Todos os clientes",
  awaiting_activation: "Aguardando ativação",
  activated: "Já ativaram",
  active: "Licenças ativas",
  expired: "Licenças expiradas",
  pending: "Licenças pendentes",
  canceled: "Licenças canceladas",
  refunded: "Licenças reembolsadas",
  revoked: "Licenças revogadas",
};
const EMPTY_FORM = {
  name: "",
  subject: "",
  body: "",
  audienceStatuses: ["awaiting_activation"] as AudienceStatus[],
  audiencePlan: "all",
  bodyFormat: "text" as "text" | "html",
  delivery: "now" as "now" | "scheduled",
  scheduledFor: "",
};
const fmt = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const statusLabel = (status: string) =>
  ({
    scheduled: "Agendada",
    queued: "Na fila",
    sending: "Enviando",
    completed: "Concluída",
    failed: "Com falhas",
    cancelled: "Cancelada",
  })[status] || status;

export function EmailCampaignsTab() {
  const getDashboard = useServerFn(getEmailCampaignDashboard);
  const createCampaign = useServerFn(createEmailCampaign);
  const saveAutomation = useServerFn(updateEmailAutomation);
  const runQueue = useServerFn(runEmailCampaignQueue);
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      setData((await getDashboard({})) as Dashboard);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível carregar as campanhas.",
      );
    }
  }, [getDashboard]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedCount = useMemo(() => {
    if (!data) return 0;
    if (form.audienceStatuses.includes("all")) return Number(data.counts.all || 0);
    return Math.min(
      Number(data.counts.all || 0),
      form.audienceStatuses.reduce((total, status) => total + Number(data.counts[status] || 0), 0),
    );
  }, [data, form.audienceStatuses]);

  function toggleAudience(status: AudienceStatus) {
    setForm((current) => {
      if (status === "all") return { ...current, audienceStatuses: ["all"] };
      const currentStatuses = current.audienceStatuses.filter((item) => item !== "all");
      const next = currentStatuses.includes(status)
        ? currentStatuses.filter((item) => item !== status)
        : [...currentStatuses, status];
      return { ...current, audienceStatuses: next.length ? next : ["all"] };
    });
  }

  async function submitCampaign() {
    if (form.delivery === "scheduled" && !form.scheduledFor) {
      toast.error("Escolha a data e o horário do envio.");
      return;
    }
    setBusy(true);
    try {
      const result = await createCampaign({
        data: {
          name: form.name,
          subject: form.subject,
          body: form.body,
          audienceStatuses: form.audienceStatuses,
          audiencePlan: form.audiencePlan === "all" ? null : form.audiencePlan,
          bodyFormat: form.bodyFormat,
          scheduledFor:
            form.delivery === "scheduled" ? new Date(form.scheduledFor).toISOString() : null,
        },
      });
      toast.success(
        result.scheduled
          ? `Campanha agendada para ${result.recipients} cliente(s).`
          : `Campanha criada para ${result.recipients} cliente(s). ${result.processing.sent} envio(s) aceito(s).`,
      );
      setForm(EMPTY_FORM);
      setCampaignOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a campanha.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSteps() {
    if (!data) return;
    setBusy(true);
    try {
      await saveAutomation({ data: data.settings });
      toast.success(
        data.settings.enabled ? "Lembretes automáticos ativados." : "Lembretes pausados.",
      );
      setAutomationOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a automação.");
    } finally {
      setBusy(false);
    }
  }

  async function processNow() {
    setBusy(true);
    try {
      const result = await runQueue({});
      toast.success(
        `${result.sent} enviados, ${result.skipped} interrompidos e ${result.failed} falharam.`,
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível processar a fila.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="py-12 text-center text-slate-300">Carregando campanhas…</div>;
  const audienceLabel = form.audienceStatuses.includes("all")
    ? AUDIENCES.all
    : form.audienceStatuses.map((status) => AUDIENCES[status]).join(", ");

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <button
          type="button"
          onClick={() => setCampaignOpen(true)}
          className="rounded-2xl border border-fuchsia-400/20 bg-white/[0.07] p-5 text-left transition hover:border-fuchsia-400/50 hover:bg-white/[0.1]"
        >
          <MailPlus className="mb-4 h-7 w-7 text-fuchsia-300" />
          <span className="block text-lg font-semibold text-white">Nova campanha</span>
          <span className="mt-1 block text-sm text-slate-300">
            Escolha o público, crie o e-mail e programe o envio.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setAutomationOpen(true)}
          className="rounded-2xl border border-violet-400/20 bg-white/[0.07] p-5 text-left transition hover:border-violet-400/50 hover:bg-white/[0.1]"
        >
          <Settings2 className="mb-4 h-7 w-7 text-violet-300" />
          <span className="flex items-center gap-2 text-lg font-semibold text-white">
            Lembretes de ativação
            <Badge className={data.settings.enabled ? "bg-emerald-500" : "bg-slate-600"}>
              {data.settings.enabled ? "Ativos" : "Pausados"}
            </Badge>
          </span>
          <span className="mt-1 block text-sm text-slate-300">
            Configure os e-mails de 3h, 6h, 12h e 24h.
          </span>
        </button>
        <Button
          variant="outline"
          onClick={processNow}
          disabled={busy}
          className="h-auto border-white/15 bg-white/[0.05] text-white hover:bg-white/10 hover:text-white"
        >
          Processar fila
        </Button>
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Clientes", data.counts.all, Users],
          ["Aguardando", data.counts.awaiting_activation, CalendarClock],
          ["Ativados", data.counts.activated, Users],
          ["Expirados", data.counts.expired, CalendarClock],
        ].map(([label, value, Icon]) => (
          <Card
            key={String(label)}
            className="border-white/10 bg-white/[0.06] text-white shadow-none"
          >
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">{String(label)}</p>
                <p className="mt-1 text-2xl font-semibold">{String(value)}</p>
              </div>
              <Icon className="h-5 w-5 text-fuchsia-300" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-white/10 bg-white/[0.96] shadow-2xl shadow-violet-950/20">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Campanhas</CardTitle>
            <CardDescription>
              Acompanhe programação, público e progresso dos envios.
            </CardDescription>
          </div>
          <Badge variant="outline">
            Agendador {data.schedulerStatus === "active" ? "ativo" : "manual"}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Programação</TableHead>
                <TableHead className="min-w-48">Progresso</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data.campaigns.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    Nenhuma campanha criada.
                  </TableCell>
                </TableRow>
              ) : null}
              {data.campaigns.map((campaign) => {
                const completed =
                  Number(campaign.sent_count || 0) +
                  Number(campaign.failed_count || 0) +
                  Number(campaign.skipped_count || 0);
                const progress = campaign.recipients_total
                  ? Math.round((completed / campaign.recipients_total) * 100)
                  : 0;
                const statuses = campaign.audience_statuses?.length
                  ? campaign.audience_statuses
                  : (campaign.audience_status.split(",") as AudienceStatus[]);
                return (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div className="font-medium">{campaign.name}</div>
                      <div className="max-w-64 truncate text-xs text-muted-foreground">
                        {campaign.subject}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 text-xs">
                      {statuses.map((status) => AUDIENCES[status] || status).join(", ")}
                      {campaign.audience_plan ? ` · ${campaign.audience_plan}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      {campaign.status === "scheduled"
                        ? fmt(campaign.scheduled_for)
                        : fmt(campaign.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>
                          {campaign.sent_count}/{campaign.recipients_total} enviados
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          campaign.status === "completed"
                            ? "default"
                            : campaign.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {statusLabel(campaign.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
            <DialogDescription>
              Configure o público, o conteúdo e quando a campanha deve começar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Título interno</Label>
              <Input
                id="campaign-name"
                placeholder="Ex.: Oferta de revenda"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-subject">Assunto do e-mail</Label>
              <Input
                id="campaign-subject"
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Perfis de clientes</Label>
              <Popover open={audienceOpen} onOpenChange={setAudienceOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">{audienceLabel}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-2" align="start">
                  {Object.entries(AUDIENCES).map(([value, label]) => {
                    const status = value as AudienceStatus;
                    return (
                      <label
                        key={status}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={form.audienceStatuses.includes(status)}
                          onCheckedChange={() => toggleAudience(status)}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Estimativa: até {selectedCount} cliente(s). Duplicados são removidos.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tipo de licença</Label>
              <Select
                value={form.audiencePlan}
                onValueChange={(audiencePlan) => setForm({ ...form, audiencePlan })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {data.plans.map((plan) => (
                    <SelectItem key={plan.value} value={plan.value}>
                      {plan.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select
                value={form.bodyFormat}
                onValueChange={(bodyFormat: "text" | "html") => setForm({ ...form, bodyFormat })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto com layout da Super Lovable</SelectItem>
                  <SelectItem value="html">HTML personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quando enviar</Label>
              <Select
                value={form.delivery}
                onValueChange={(delivery: "now" | "scheduled") => setForm({ ...form, delivery })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Enviar agora</SelectItem>
                  <SelectItem value="scheduled">Agendar data e horário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.delivery === "scheduled" ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="scheduled-for">Data e horário</Label>
                <Input
                  id="scheduled-for"
                  type="datetime-local"
                  min={new Date().toISOString().slice(0, 16)}
                  value={form.scheduledFor}
                  onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })}
                />
              </div>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="campaign-body">Corpo do e-mail</Label>
              <Textarea
                id="campaign-body"
                className="min-h-64 font-mono text-sm"
                placeholder={
                  form.bodyFormat === "html"
                    ? "Cole ou escreva aqui o HTML do conteúdo…"
                    : "Escreva a mensagem personalizada…"
                }
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Variáveis: {"{{nome}}"}, {"{{email}}"}, {"{{licenca}}"},{" {{plano}}"},{" "}
                {"{{pedido}}"}, {"{{link_acesso}}"}.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submitCampaign}
              disabled={busy || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
            >
              {form.delivery === "scheduled" ? "Agendar campanha" : "Criar e enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={automationOpen} onOpenChange={setAutomationOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lembretes de ativação</DialogTitle>
            <DialogDescription>
              A sequência para automaticamente quando a licença é ativada.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
            <div>
              <Label htmlFor="automation-enabled">Automação ativa</Label>
              <p className="text-xs text-muted-foreground">
                Verificação{" "}
                {data.schedulerStatus === "active"
                  ? "automática a cada 15 minutos"
                  : "em modo manual"}
                .
              </p>
            </div>
            <Switch
              id="automation-enabled"
              checked={data.settings.enabled}
              onCheckedChange={(enabled) =>
                setData({ ...data, settings: { ...data.settings, enabled } })
              }
            />
          </div>
          <div className="space-y-4 py-2">
            {data.settings.steps.map((step, index) => (
              <section key={step.hours} className="rounded-xl border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium">Após {step.hours} horas</h3>
                  <Badge variant="outline">Se não ativou</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                  <div className="space-y-2">
                    <Label>Assunto</Label>
                    <Input
                      value={step.subject}
                      onChange={(event) => {
                        const steps = [...data.settings.steps];
                        steps[index] = { ...step, subject: event.target.value };
                        setData({ ...data, settings: { ...data.settings, steps } });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem</Label>
                    <Textarea
                      value={step.body}
                      onChange={(event) => {
                        const steps = [...data.settings.steps];
                        steps[index] = { ...step, body: event.target.value };
                        setData({ ...data, settings: { ...data.settings, steps } });
                      }}
                    />
                  </div>
                </div>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutomationOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveSteps} disabled={busy}>
              Salvar configurações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
