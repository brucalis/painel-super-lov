import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  createEmailCampaign,
  getEmailCampaignDashboard,
  runEmailCampaignQueue,
  updateEmailAutomation,
} from "@/lib/licenses.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Step = { hours: 3 | 6 | 12 | 24; subject: string; body: string };
type Campaign = {
  id: string;
  name: string;
  subject: string;
  audience_status: string;
  audience_plan?: string | null;
  sent_count: number;
  recipients_total: number;
  failed_count: number;
  status: string;
  created_at: string;
};
type Delivery = {
  id: string;
  accepted_at?: string | null;
  created_at: string;
  recipient_name?: string | null;
  recipient_email: string;
  purpose: string;
  step_key?: string | null;
  status: string;
  error?: string | null;
  subject: string;
};
type Dashboard = {
  settings: { enabled: boolean; steps: Step[] };
  schedulerStatus: string;
  campaigns: Campaign[];
  deliveries: Delivery[];
  counts: Record<string, number>;
  plans: Array<{ value: string; label: string }>;
};

const AUDIENCES: Record<string, string> = {
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

const fmt = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function EmailCampaignsTab() {
  const getDashboard = useServerFn(getEmailCampaignDashboard);
  const createCampaign = useServerFn(createEmailCampaign);
  const saveAutomation = useServerFn(updateEmailAutomation);
  const runQueue = useServerFn(runEmailCampaignQueue);
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    subject: string;
    body: string;
    audienceStatus: keyof typeof AUDIENCES;
    audiencePlan: string;
  }>({
    name: "",
    subject: "",
    body: "",
    audienceStatus: "awaiting_activation",
    audiencePlan: "all",
  });

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
    return Number(data.counts[form.audienceStatus] ?? data.counts.all ?? 0);
  }, [data, form.audienceStatus]);

  async function submitCampaign() {
    setBusy(true);
    try {
      const result = await createCampaign({
        data: {
          ...form,
          audiencePlan: form.audiencePlan === "all" ? null : form.audiencePlan,
        },
      });
      toast.success(
        `Campanha criada para ${result.recipients} cliente(s). ${result.processing.sent} envio(s) aceito(s) agora.`,
      );
      setForm({
        name: "",
        subject: "",
        body: "",
        audienceStatus: "awaiting_activation",
        audiencePlan: "all",
      });
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
        data.settings.enabled
          ? "Lembretes automáticos ativados."
          : "Lembretes automáticos pausados.",
      );
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
        `Processamento concluído: ${result.sent} enviados, ${result.skipped} interrompidos e ${result.failed} falharam.`,
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível processar a fila.");
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return <div className="py-12 text-center text-muted-foreground">Carregando campanhas…</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Clientes", data.counts.all],
          ["Aguardando ativação", data.counts.awaiting_activation],
          ["Já ativaram", data.counts.activated],
          ["Expirados", data.counts.expired],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Lembretes de ativação</CardTitle>
              <CardDescription>
                Envia após 3h, 6h, 12h e 24h. A sequência para automaticamente quando a licença é
                ativada.
              </CardDescription>
              <p className="mt-2 text-xs text-muted-foreground">
                Agendador:{" "}
                {data.schedulerStatus === "active"
                  ? "automático a cada 15 minutos"
                  : "modo manual — use Processar fila agora"}
                .
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="automation-enabled">Automação ativa</Label>
              <Switch
                id="automation-enabled"
                checked={data.settings.enabled}
                onCheckedChange={(enabled) =>
                  setData({ ...data, settings: { ...data.settings, enabled } })
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.settings.steps.map((step, index) => (
            <div key={step.hours} className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium">Lembrete após {step.hours} horas</h3>
                <Badge variant="outline">Somente se não ativou</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <div>
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
                <div>
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
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Variáveis: {"{{nome}}"}, {"{{email}}"}, {"{{licenca}}"}, {"{{plano}}"}, {"{{pedido}}"} e{" "}
            {"{{link_acesso}}"}. O agendador verifica a fila a cada 15 minutos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveSteps} disabled={busy}>
              Salvar automação
            </Button>
            <Button variant="outline" onClick={processNow} disabled={busy}>
              Processar fila agora
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova campanha</CardTitle>
          <CardDescription>
            Crie uma mensagem para um segmento. Cada cliente recebe apenas um e-mail por campanha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Nome interno da campanha</Label>
              <Input
                placeholder="Ex.: Oferta de revenda"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div>
              <Label>Assunto do e-mail</Label>
              <Input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
              />
            </div>
            <div>
              <Label>Lista por situação</Label>
              <Select
                value={form.audienceStatus}
                onValueChange={(audienceStatus) => setForm({ ...form, audienceStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Estimativa atual: {selectedCount} cliente(s).
              </p>
            </div>
            <div>
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
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea
              className="min-h-48"
              placeholder="Escreva a mensagem personalizada…"
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            O número final pode ser menor ao combinar situação e tipo de licença. Variáveis
            disponíveis: {"{{nome}}"}, {"{{email}}"}, {"{{licenca}}"}, {"{{plano}}"}, {"{{pedido}}"}{" "}
            e {"{{link_acesso}}"}.
          </p>
          <Button
            onClick={submitCampaign}
            disabled={busy || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
          >
            Criar e iniciar campanha
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas recentes</CardTitle>
          <CardDescription>
            “Enviado” significa que o SendGrid aceitou a mensagem para entrega.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data.campaigns.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    Nenhuma campanha criada.
                  </TableCell>
                </TableRow>
              )}
              {data.campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="font-medium">{campaign.name}</div>
                    <div className="max-w-72 truncate text-xs text-muted-foreground">
                      {campaign.subject}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {AUDIENCES[campaign.audience_status] || campaign.audience_status}
                    {campaign.audience_plan ? ` · ${campaign.audience_plan}` : ""}
                  </TableCell>
                  <TableCell className="text-sm">
                    {campaign.sent_count}/{campaign.recipients_total} enviados
                    {campaign.failed_count ? ` · ${campaign.failed_count} falhas` : ""}
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
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmt(campaign.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos envios</CardTitle>
          <CardDescription>
            Histórico de campanhas, lembretes e reenvios individuais.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.deliveries.slice(0, 30).map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="text-xs">
                    {fmt(delivery.accepted_at || delivery.created_at)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {delivery.recipient_name || "—"}
                    <div className="text-muted-foreground">{delivery.recipient_email}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {delivery.purpose === "activation_reminder"
                      ? `Lembrete ${delivery.step_key}`
                      : delivery.purpose === "individual"
                        ? "Individual"
                        : "Campanha"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        delivery.status === "sent"
                          ? "default"
                          : delivery.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {delivery.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                    {delivery.error || delivery.subject}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
