import { useMemo, useState } from "react";
import {
  Archive,
  BrainCircuit,
  Code2,
  Eraser,
  Github,
  History,
  KeyRound,
  Mic,
  Paperclip,
  RotateCcw,
  Sparkles,
} from "lucide-react";

const categories = ["Todos", "Criação", "Produtividade", "Integrações", "Utilitários"] as const;
type Category = Exclude<(typeof categories)[number], "Todos">;
type SelectedCategory = (typeof categories)[number];

type Feature = {
  title: string;
  category: Category;
  icon: typeof Mic;
  short: string;
  description: string;
};

const premiumFeatures: Feature[] = [
  {
    title: "Envio por voz",
    category: "Criação",
    icon: Mic,
    short: "Dite seus comandos sem precisar digitar.",
    description:
      "Use o microfone para transformar sua fala em comando diretamente no chat da Super Lovable. Ideal para registrar ideias rápidas e acelerar o trabalho no projeto.",
  },
  {
    title: "Otimizar prompt",
    category: "Criação",
    icon: Sparkles,
    short: "Deixe sua instrução mais clara antes do envio.",
    description:
      "A Super Lovable reorganiza e aprimora sua solicitação para deixá-la mais objetiva, completa e fácil de interpretar, ajudando a obter alterações mais precisas.",
  },
  {
    title: "Refatorar",
    category: "Criação",
    icon: Code2,
    short: "Melhore a estrutura do código com mais precisão.",
    description:
      "Use o recurso de refatoração para orientar limpeza, reorganização e melhoria estrutural do código, preservando o comportamento esperado do projeto.",
  },
  {
    title: "Histórico",
    category: "Produtividade",
    icon: History,
    short: "Consulte e reutilize comandos anteriores.",
    description:
      "Acesse os prompts já enviados para recuperar instruções, reaproveitar comandos e acompanhar com mais facilidade a evolução do trabalho realizado.",
  },
  {
    title: "Skills",
    category: "Produtividade",
    icon: BrainCircuit,
    short: "Salve instruções para tarefas recorrentes.",
    description:
      "Crie Skills com orientações que você usa com frequência. Assim, tarefas repetitivas podem seguir um padrão sem exigir que você escreva toda a instrução novamente.",
  },
  {
    title: "Envio de arquivos",
    category: "Produtividade",
    icon: Paperclip,
    short: "Anexe imagens e documentos aos seus prompts.",
    description:
      "Envie materiais de referência junto com o comando para dar mais contexto à solicitação e facilitar alterações que dependem de imagens, documentos e outros arquivos.",
  },
  {
    title: "Groq + Gemini",
    category: "Integrações",
    icon: KeyRound,
    short: "Use suas próprias credenciais de IA.",
    description:
      "Cadastre suas chaves do Groq e do Gemini uma única vez. A extensão usa essas integrações no fluxo de IA e pode trabalhar com contingência entre os provedores configurados.",
  },
  {
    title: "GitHub integrado",
    category: "Integrações",
    icon: Github,
    short: "Conecte o projeto ao seu repositório.",
    description:
      "Integre a Super Lovable ao GitHub para organizar alterações, versionamento e continuidade do projeto dentro do fluxo de trabalho da extensão.",
  },
  {
    title: "Download em ZIP",
    category: "Utilitários",
    icon: Archive,
    short: "Baixe uma cópia dos arquivos do projeto.",
    description:
      "Gere um arquivo ZIP do projeto para manter uma cópia local, arquivar versões, revisar arquivos ou utilizar o conteúdo em outros fluxos de trabalho.",
  },
  {
    title: "Remover marca d’água",
    category: "Utilitários",
    icon: Eraser,
    short: "Deixe a apresentação do projeto mais limpa.",
    description:
      "Acesse a ferramenta dedicada à remoção da marca d’água para deixar a visualização do projeto mais limpa dentro do fluxo disponibilizado pela extensão.",
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const [flipped, setFlipped] = useState(false);
  const Icon = feature.icon;

  return (
    <button
      type="button"
      aria-pressed={flipped}
      aria-label={`${feature.title}. ${flipped ? "Voltar para o resumo" : "Ver como funciona"}`}
      onClick={() => setFlipped((current) => !current)}
      className="group h-[270px] w-full cursor-pointer text-left [perspective:1400px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b1c]"
    >
      <div
        className={`relative h-full w-full rounded-[1.7rem] transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        <div className="absolute inset-0 overflow-hidden rounded-[1.7rem] border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.035] to-violet-500/[0.04] p-5 shadow-[0_22px_55px_rgba(3,6,20,0.38)] transition duration-300 [backface-visibility:hidden] group-hover:-translate-y-1 group-hover:border-fuchsia-400/25 group-hover:shadow-[0_25px_65px_rgba(126,34,206,0.2)]">
          <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/15 to-violet-500/10 text-fuchsia-200 shadow-[0_0_30px_rgba(217,70,239,0.1)]">
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {feature.category}
                </span>
              </div>

              <h3 className="mt-5 text-xl font-bold tracking-tight text-white">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{feature.short}</p>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.07] pt-4">
              <span className="text-xs font-semibold text-fuchsia-300">Clique para descobrir</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition group-hover:border-fuchsia-400/30 group-hover:text-fuchsia-200">
                <RotateCcw className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 overflow-hidden rounded-[1.7rem] border border-fuchsia-400/25 bg-gradient-to-br from-[#24113e] via-[#111936] to-[#0a1229] p-5 shadow-[0_22px_55px_rgba(3,6,20,0.38)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="pointer-events-none absolute -bottom-12 -left-10 h-36 w-36 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-pink-400/20 bg-pink-400/10 text-pink-200">
                  <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-200">Como funciona</span>
              </div>

              <h3 className="mt-4 text-lg font-bold text-white">{feature.title}</h3>
              <p className="mt-3 text-[13px] leading-5.5 text-slate-300">{feature.description}</p>
            </div>

            <div className="flex items-center justify-end border-t border-white/[0.07] pt-4 text-xs font-medium text-fuchsia-200">
              Clique para voltar
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export function PremiumFeatures() {
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory>("Todos");

  const filteredFeatures = useMemo(() => {
    if (selectedCategory === "Todos") return premiumFeatures;
    return premiumFeatures.filter((feature) => feature.category === selectedCategory);
  }, [selectedCategory]);

  const countForCategory = (category: SelectedCategory) =>
    category === "Todos"
      ? premiumFeatures.length
      : premiumFeatures.filter((feature) => feature.category === category).length;

  return (
    <section className="mt-20 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_28px_90px_rgba(4,7,20,0.28)] backdrop-blur sm:p-8">
      <div className="pointer-events-none absolute" />
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
          <Sparkles className="h-3.5 w-3.5" />
          Recursos premium
        </div>

        <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Mais controle para criar, editar e evoluir seus projetos.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
          Explore os recursos da Super Lovable. Clique em qualquer card para virar e entender rapidamente como cada função pode ajudar no seu fluxo.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2.5" role="tablist" aria-label="Categorias de recursos premium">
        {categories.map((category) => {
          const active = selectedCategory === category;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedCategory(category)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-fuchsia-300/35 bg-gradient-to-r from-fuchsia-500/20 to-violet-500/20 text-white shadow-[0_0_24px_rgba(217,70,239,0.13)]"
                  : "border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {category}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/10 text-fuchsia-100" : "bg-white/[0.05] text-slate-500"}`}>
                {countForCategory(category)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filteredFeatures.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}
