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
    <main className="relative min-h-screen overflow-hidden bg-[#050817] text-slate-100">
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

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_12%,rgba(236,72,153,0.18),transparent_32%),radial-gradient(circle_at_15%_42%,rgba(139,92,246,0.14),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/70 to-transparent" />

      <section className="relative mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-400/25 bg-white/[0.04] shadow-[0_0_35px_rgba(217,70,239,0.18)]">
            <img src="/favicon.png" alt="" className="h-8 w-8" />
          </div>
          <span className="text-sm font-semibold tracking-[0.22em] text-white/80">SUPER LOVABLE</span>
        </div>

        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
              Extensão premium para Lovable.dev
            </div>
            <h1 className="mt-6 max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
              Crie sem interrupções com a <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-violet-400 bg-clip-text text-transparent">Super Lovable.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Envie comandos, grave sua voz, organize uma fila automática e acompanhe todo o histórico sem sair do projeto.
            </p>

            <button
              onClick={download}
              className="download-pulse mt-9 rounded-2xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-600 px-7 py-4 font-semibold text-white transition hover:brightness-110"
            >
              Baixar extensão (.zip)
            </button>
            <p className="mt-4 text-sm text-slate-400">
              Versão {EXTENSION_RELEASE.version} · atualizada em {EXTENSION_RELEASE.updatedAt}
            </p>
          </div>

          <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-[0_30px_90px_rgba(76,29,149,0.28)] backdrop-blur-xl">
            <div className="absolute -inset-px -z-10 rounded-[2rem] bg-gradient-to-br from-fuchsia-500/20 via-transparent to-violet-500/20 blur-xl" />
            <img src="/extension-banner.png" alt="Super Lovable — recursos da extensão" className="w-full rounded-[1.35rem]" />
          </div>
        </div>

        <div className="mt-20 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 backdrop-blur">
            <h2 className="text-xl font-semibold">Como instalar</h2>
            <ol className="mt-6 space-y-4 text-slate-300">
              {steps.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/15 text-xs font-bold text-fuchsia-300">{i + 1}</span>
                  <span className="pt-0.5 text-sm leading-6">{s}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 backdrop-blur">
            <h2 className="text-xl font-semibold">O que está incluído</h2>
            <ul className="mt-6 space-y-3">
              {features.map((f) => (
                <li key={f} className="flex gap-3 text-sm leading-6 text-slate-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-pink-400 to-violet-400 shadow-[0_0_10px_rgba(244,114,182,0.8)]" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
