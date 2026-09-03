import { useEffect, useState } from "react";

const PDF_PARTS = [
  "/tutorial-pdf/part-0.txt",
  "/tutorial-pdf/part-1-0.txt",
  "/tutorial-pdf/part-1-1.txt",
  "/tutorial-pdf/part-1-2.txt",
  "/tutorial-pdf/part-1-3.txt",
  "/tutorial-pdf/part-1-4.txt",
  "/tutorial-pdf/part-1-5.txt",
  "/tutorial-pdf/part-1-6.txt",
  "/tutorial-pdf/part-1-7.txt",
  "/tutorial-pdf/part-1-8.txt",
  "/tutorial-pdf/part-1-9.txt",
  "/tutorial-pdf/part-2.txt",
  "/tutorial-pdf/part-3.txt",
  "/tutorial-pdf/part-4.txt",
  "/tutorial-pdf/part-5-0.txt",
  "/tutorial-pdf/part-5-1.txt",
  "/tutorial-pdf/part-5-2.txt",
  "/tutorial-pdf/part-5-3.txt",
  "/tutorial-pdf/part-5-4.txt",
  "/tutorial-pdf/part-5-5.txt",
  "/tutorial-pdf/part-5-6.txt",
  "/tutorial-pdf/part-5-7.txt",
  "/tutorial-pdf/part-5-8.txt",
  "/tutorial-pdf/part-5-9.txt",
  "/tutorial-pdf/part-6.txt",
];

export function TutorialPdfViewer() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;

    Promise.all(
      PDF_PARTS.map(async (path) => {
        const response = await fetch(path, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`Falha ao carregar ${path}`);
        }
        return response.text();
      }),
    )
      .then((parts) => {
        if (!active) return;

        const base64 = parts.join("").replace(/\s/g, "");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        );
        setPdfUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return (
    <section
      id="tutorial"
      className="mt-20 scroll-mt-8 overflow-hidden rounded-[2rem] border border-fuchsia-400/20 bg-gradient-to-br from-[#111936] via-[#0b1229] to-[#17102f] p-5 shadow-[0_28px_80px_rgba(4,7,20,0.45)] sm:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
            Guia completo · 12 páginas
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Tutorial Super Lovable
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
            Do primeiro acesso ao uso diário: instalação, ativação, Groq + Gemini,
            GitHub, prompts, histórico, Skills, anexos, voz e solução de problemas.
          </p>
        </div>

        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-fuchsia-300/40 hover:bg-white/10"
          >
            Abrir em tela cheia ↗
          </a>
        ) : null}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#080d20]">
        {error ? (
          <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-slate-300">
            Não foi possível carregar o tutorial agora. Recarregue a página e tente novamente.
          </div>
        ) : pdfUrl ? (
          <iframe
            title="Tutorial completo da Super Lovable"
            src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
            className="h-[72vh] min-h-[560px] w-full bg-[#080d20]"
          />
        ) : (
          <div className="flex min-h-[420px] items-center justify-center gap-3 px-6 text-sm text-slate-300">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-300 border-t-transparent" />
            Carregando tutorial...
          </div>
        )}
      </div>
    </section>
  );
}
