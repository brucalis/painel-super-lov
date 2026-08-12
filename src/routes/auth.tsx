import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar no painel de licenças — SUPER LOVABLE" },
      {
        name: "description",
        content:
          "Acesso restrito ao painel administrativo de licenças da SUPER LOVABLE: gere chaves, acompanhe clientes e prazos.",
      },
      { property: "og:title", content: "Entrar no painel de licenças — SUPER LOVABLE" },
      {
        property: "og:description",
        content: "Acesso restrito ao painel administrativo de licenças da SUPER LOVABLE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/admin" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada. Se o login não abrir sozinho, entre com seus dados.");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (!signInError) navigate({ to: "/admin" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Painel de licenças</CardTitle>
          <CardDescription>
            Acesso restrito. O primeiro cadastro deste painel vira administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="signin" className="flex-1">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Criar conta
              </TabsTrigger>
            </TabsList>
            {(["signin", "signup"] as const).map((tab) => (
              <TabsContent key={tab} value={tab}>
                <form className="space-y-4" onSubmit={tab === "signin" ? signIn : signUp}>
                  <div className="space-y-2">
                    <Label htmlFor={`${tab}-email`}>E-mail</Label>
                    <Input
                      id={`${tab}-email`}
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${tab}-password`}>Senha</Label>
                    <Input
                      id={`${tab}-password`}
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={tab === "signin" ? "current-password" : "new-password"}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Aguarde…" : tab === "signin" ? "Entrar" : "Criar conta"}
                  </Button>
                </form>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
