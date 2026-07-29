import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lovable Chat Assistant — Extensão Chrome MV3" },
      {
        name: "description",
        content:
          "Baixe a extensão Chrome Lovable Chat Assistant: converse com a IA do seu projeto Lovable e envie arquivos direto pelo popup.",
      },
      { property: "og:title", content: "Lovable Chat Assistant — Extensão Chrome MV3" },
      {
        property: "og:description",
        content:
          "Cliente de chat integrado para Lovable.dev com upload de arquivos em 3 etapas e autenticação por cookies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  "Descompacte o arquivo baixado.",
  "Abra chrome://extensions no Chrome (ou outro navegador Chromium).",
  "Ative o Modo do desenvolvedor no canto superior direito.",
  "Clique em Carregar sem compactação e selecione a pasta descompactada.",
  "Abra um projeto em lovable.dev e clique no ícone da extensão.",
];

function Index() {
  const download = () => {
    fetch("/lovable-chat-assistant.zip")
      .then((res) => {
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "lovable-chat-assistant.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-6 py-20">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          Chrome Extension · Manifest V3
        </p>
        <h1 className="mt-3 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 bg-clip-text text-5xl font-bold text-transparent">
          Lovable Chat Assistant
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Cliente de chat integrado para a plataforma Lovable.dev. Converse com a IA do
          projeto atual direto pelo popup, com anexos enviados via fluxo de upload em
          três etapas à prova de CORS.
        </p>

        <button
          onClick={download}
          className="mt-8 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-orange-500 px-6 py-3 font-medium text-white shadow-lg transition hover:opacity-90"
        >
          Baixar extensão (.zip)
        </button>

        <h2 className="mt-14 text-xl font-semibold">Como instalar</h2>
        <ol className="mt-4 space-y-2 text-muted-foreground">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="font-mono text-sm text-pink-500">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <h2 className="mt-12 text-xl font-semibold">O que está incluído</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            "Autenticação automática via cookies de lovable.dev",
            "Detecção do project ID pela aba ativa",
            "Upload em 3 etapas: signed URL → GCS → download URL",
            "Fallback fetch → XHR → service worker contra CORS",
            "Preview de anexos com progresso e remoção",
            "Barra de status com erros e sucessos temporários",
          ].map((f) => (
            <li
              key={f}
              className="rounded-lg border border-border bg-card p-4 text-sm text-card-foreground"
            >
              {f}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
