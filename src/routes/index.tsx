import { createFileRoute } from "@tanstack/react-router";
import { EXTENSION_RELEASE } from "@/lib/extension-release";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SUPER LOVABLE — Extensão Chrome premium para Lovable.dev" },
      {
        name: "description",
        content:
          "Baixe a SUPER LOVABLE: fila de comandos, gravação de voz, histórico, atalhos e painel dentro do Lovable.dev, com anexos íntegros.",
      },
      { property: "og:title", content: "SUPER LOVABLE — Extensão Chrome premium para Lovable.dev" },
      {
        property: "og:description",
        content:
          "Baixe a SUPER LOVABLE: fila de comandos, gravação de voz, histórico, atalhos e painel dentro do Lovable.dev, com anexos íntegros.",
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
  "Abra um projeto em lovable.dev e clique no ícone da SUPER LOVABLE.",
];

const features = [
  "Fila de comandos com envio sequencial e detecção de conclusão",
  "Gravação de voz com pausa, retomada e envio como anexo",
  "Histórico completo com busca, favoritos e reenvio",
  "9 atalhos rápidos para correções, SEO, segurança e responsividade",
  "Barra e mini painel injetados no próprio chat do Lovable",
  "Modo Escudo contra envios acidentais e projeto trocado",
];

function Index() {
  const download = () => {
    fetch(EXTENSION_RELEASE.downloadPath, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = EXTENSION_RELEASE.downloadName;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <main className="min-h-screen bg-[#0B1020] text-slate-100">
      <style>{`
        @keyframes downloadPulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 10px 40px -10px rgba(139, 92, 246, 0.8);
          }
          50% {
            transform: scale(1.035);
            box-shadow: 0 12px 48px -8px rgba(217, 70, 239, 0.95);
          }
        }

        .download-pulse {
          animation: downloadPulse 2.2s ease-in-out infinite;
          will-change: transform, box-shadow;
        }

        .download-pulse:hover {
          animation-play-state: paused;
          transform: scale(1.045);
        }

        @media (prefers-reduced-motion: reduce) {
          .download-pulse {
            animation: none;
          }
        }
      `}</style>

      <section className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="mt-3 bg-gradient-to-r from-sky-400 via-violet-500 to-fuchsia-500 bg-clip-text text-5xl font-bold text-transparent">
          SUPER LOVABLE
        </h1>
        <p className="mt-4 text-lg text-slate-300">
          Painel premium para a plataforma Lovable.dev: envie comandos, grave sua voz,
          organize uma fila automática e acompanhe todo o histórico — sem sair do projeto.
        </p>

        <button
          onClick={download}
          className="download-pulse mt-8 rounded-xl bg-gradient-to-r from-sky-500 via-violet-600 to-fuchsia-600 px-6 py-3 font-medium text-white transition hover:opacity-95"
        >
          Baixar extensão (.zip)
        </button>
        <p className="mt-3 text-sm text-slate-400">
          Versão {EXTENSION_RELEASE.version} · atualizada em {EXTENSION_RELEASE.updatedAt}
        </p>

        <h2 className="mt-14 text-xl font-semibold">Como instalar</h2>
        <ol className="mt-4 space-y-2 text-slate-300">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="font-mono text-sm text-fuchsia-400">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <h2 className="mt-12 text-xl font-semibold">O que está incluído</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <li
              key={f}
              className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200 backdrop-blur"
            >
              {f}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
