import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LicensesTab } from "@/components/admin/licenses-tab";
import { CustomersTab } from "@/components/admin/customers-tab";
import { WebhooksTab } from "@/components/admin/webhooks-tab";
import { EnsinaflixTab } from "@/components/admin/ensinaflix-tab";
import { EmailCampaignsTab } from "@/components/admin/email-campaigns-tab";
import { ADMIN_EXTENSION_RELEASE } from "@/lib/extension-release";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel de licenças SUPER LOVABLE" },
      {
        name: "description",
        content:
          "Gerencie licenças, prazos, clientes e webhooks de venda da extensão SUPER LOVABLE em um só painel.",
      },
      { property: "og:title", content: "Painel de licenças SUPER LOVABLE" },
      {
        property: "og:description",
        content:
          "Gere chaves, ajuste prazos, acompanhe dispositivos e integre sua plataforma de vendas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "denied" | "ok">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.session.user.email ?? "");
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setState(role ? "ok" : "denied");
    })();
  }, [navigate]);

  if (state === "loading") {
    return (
      <main className="grid min-h-screen place-items-center text-muted-foreground">
        Carregando painel…
      </main>
    );
  }

  if (state === "denied") {
    return (
      <main className="grid min-h-screen place-items-center px-4 text-center">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="text-muted-foreground">
            A conta {email} não tem permissão de administrador neste painel.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sair
          </Button>
        </div>
      </main>
    );
  }

  const downloadAdminExtension = () => {
    fetch(ADMIN_EXTENSION_RELEASE.downloadPath, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = ADMIN_EXTENSION_RELEASE.downloadName.replace(".zip", "-admin.zip");
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050817] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(217,70,239,0.16),transparent_30%),radial-gradient(circle_at_5%_35%,rgba(124,58,237,0.18),transparent_32%)]" />
      <div className="relative mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-400/25 bg-white/[0.06] shadow-[0_0_35px_rgba(217,70,239,0.2)]">
              <img src="/favicon.png" alt="" className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-fuchsia-300">
                SUPER LOVABLE
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white">Painel administrativo</h1>
              <p className="text-sm text-slate-400">Conectado como {email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-white/15 bg-white/[0.05] text-white hover:bg-white/10 hover:text-white"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sair
          </Button>
        </header>

        <section className="mb-8 rounded-2xl border border-fuchsia-400/20 bg-gradient-to-r from-fuchsia-500/[0.12] to-violet-500/[0.08] p-5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium text-white">Extensão do administrador</h2>
              <p className="text-sm text-slate-300">
                Versão {ADMIN_EXTENSION_RELEASE.version} · atualizada em{" "}
                {ADMIN_EXTENSION_RELEASE.updatedAt}. Chaves com nível administrador liberam servidor
                de licenças e endpoints; chaves comuns não veem esses campos.
              </p>
            </div>
            <Button
              className="bg-gradient-to-r from-pink-500 to-violet-600 text-white hover:brightness-110"
              onClick={downloadAdminExtension}
            >
              Baixar extensão do administrador
            </Button>
          </div>
        </section>

        <Tabs defaultValue="licenses">
          <TabsList className="mb-6 h-auto flex-wrap border border-white/10 bg-white/[0.07] p-1.5 text-slate-300">
            <TabsTrigger value="licenses">Licenças</TabsTrigger>
            <TabsTrigger value="customers">Clientes</TabsTrigger>
            <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="ensinaflix">Ensinaflix</TabsTrigger>
          </TabsList>
          <TabsContent value="licenses">
            <LicensesTab />
          </TabsContent>
          <TabsContent value="customers">
            <CustomersTab />
          </TabsContent>
          <TabsContent value="campaigns">
            <EmailCampaignsTab />
          </TabsContent>
          <TabsContent value="webhooks">
            <WebhooksTab />
          </TabsContent>
          <TabsContent value="ensinaflix">
            <EnsinaflixTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
