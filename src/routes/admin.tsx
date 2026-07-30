import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LicensesTab } from "@/components/admin/licenses-tab";
import { CustomersTab } from "@/components/admin/customers-tab";
import { WebhooksTab } from "@/components/admin/webhooks-tab";
import { EnsinaflixTab } from "@/components/admin/ensinaflix-tab";

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
        content: "Gere chaves, ajuste prazos, acompanhe dispositivos e integre sua plataforma de vendas.",
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
    return <main className="grid min-h-screen place-items-center text-muted-foreground">Carregando painel…</main>;
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
    fetch("/super-lovable.zip")
      .then((res) => {
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "super-lovable-admin.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Painel de licenças</h1>
          <p className="text-sm text-muted-foreground">Conectado como {email}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          Sair
        </Button>
      </header>

      <section className="mb-8 rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Extensão do administrador</h2>
            <p className="text-sm text-muted-foreground">
              Versão {EXTENSION_VERSION} · atualizada em {EXTENSION_UPDATED_AT}. Chaves com nível
              administrador liberam servidor de licenças e endpoints; chaves comuns não veem esses
              campos.
            </p>
          </div>
          <Button onClick={downloadAdminExtension}>Baixar extensão do administrador</Button>
        </div>
      </section>


      <Tabs defaultValue="licenses">
        <TabsList className="mb-6">
          <TabsTrigger value="licenses">Licenças</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="ensinaflix">Ensinaflix</TabsTrigger>
        </TabsList>
        <TabsContent value="licenses">
          <LicensesTab />
        </TabsContent>
        <TabsContent value="customers">
          <CustomersTab />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhooksTab />
        </TabsContent>
        <TabsContent value="ensinaflix">
          <EnsinaflixTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
