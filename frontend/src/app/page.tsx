import Link from "next/link";
import { Shield, Zap, Vote, ArrowRight, Globe, Lock, TrendingUp } from "lucide-react";

// ── Pillar card data ──────────────────────────────────────────────────────────
const PILLARS = [
  {
    icon: Shield,
    color: "text-civic-blue",
    bg: "bg-blue-900/20 border-blue-800/40",
    title: "CivicID",
    subtitle: "Identity & Credentials",
    description:
      "Soulbound Tokens (SBTs) represent KYC status, civic credentials, and property ownership. Non-transferable, on-chain, forever yours.",
    href: "/identity",
    cta: "Mint Your ID",
    stats: [{ label: "Credential Types", value: "3" }, { label: "Revocable", value: "Yes" }],
  },
  {
    icon: Zap,
    color: "text-brand-500",
    bg: "bg-green-900/20 border-green-800/40",
    title: "GridTrade",
    subtitle: "P2P Energy Marketplace",
    description:
      "Solar producers tokenize surplus kWh and sell via atomic swaps. KYC-gated participation ensures a trusted, compliant marketplace.",
    href: "/energy",
    cta: "Trade Energy",
    stats: [{ label: "Protocol Fee", value: "0.5 %" }, { label: "Gating", value: "CivicID" }],
  },
  {
    icon: Vote,
    color: "text-civic-indigo",
    bg: "bg-indigo-900/20 border-indigo-800/40",
    title: "GridDAO",
    subtitle: "Treasury & Governance",
    description:
      "Multi-sig treasury funded by GridTrade fees. Issue milestone-based streaming grants to community infrastructure projects.",
    href: "/dao",
    cta: "Join the DAO",
    stats: [{ label: "Threshold", value: "Multi-sig" }, { label: "Grants", value: "Streaming" }],
  },
];

const FEATURES = [
  {
    icon: Lock,
    title: "Soulbound Identity",
    body: "Non-transferable SBTs anchor civic identity on-chain. Each credential is auditable, revocable, and interoperable across the platform.",
  },
  {
    icon: Zap,
    title: "Atomic Energy Swaps",
    body: "kWh tokens change hands atomically — no custodian, no settlement lag. Producers get paid instantly; buyers get verified energy credits.",
  },
  {
    icon: TrendingUp,
    title: "Sustainable Funding",
    body: "Every energy trade feeds 0.5 % into the DAO treasury, creating a self-sustaining fund for civic infrastructure grants.",
  },
  {
    icon: Globe,
    title: "Stellar Speed",
    body: "Sub-5-second finality and $0.00001 fees on Stellar make micro-transactions and real-time energy trading economically viable.",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-32 text-center">
        {/* Decorative gradient orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-brand-600/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-civic-indigo/10 blur-3xl"
        />

        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-600/40 bg-brand-600/10 px-4 py-1.5 text-xs font-semibold text-brand-500 uppercase tracking-widest">
          Built on Stellar · Powered by Soroban
        </span>

        <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
          Identity, Energy &amp; Governance{" "}
          <span className="bg-gradient-to-r from-brand-500 to-civic-indigo bg-clip-text text-transparent">
            for the Decentralized Web
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
          CivicGrid weaves three high-impact ecosystem concepts into a single cohesive platform —
          a blueprint for next-generation digital civic infrastructure on Stellar.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/identity" className="btn-primary flex items-center gap-2 text-base px-7 py-3">
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/dao" className="btn-secondary text-base px-7 py-3">
            Explore the DAO
          </Link>
        </div>
      </section>

      {/* ── Three Pillars ── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white">Three Pillars, One Platform</h2>
            <p className="mt-3 text-gray-400">
              Each pillar is a standalone Soroban smart contract — together they form an integrated civic ecosystem.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {PILLARS.map(({ icon: Icon, color, bg, title, subtitle, description, href, cta, stats }) => (
              <article
                key={title}
                className={`card flex flex-col border ${bg} transition hover:scale-[1.02]`}
              >
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800 ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white">{title}</h3>
                <p className="text-sm text-gray-500">{subtitle}</p>
                <p className="mt-3 flex-1 text-sm text-gray-400">{description}</p>
                <div className="mt-4 flex gap-4">
                  {stats.map((s) => (
                    <div key={s.label} className="text-center">
                      <p className="text-lg font-bold text-white">{s.value}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
                <Link
                  href={href}
                  className={`btn-primary mt-6 flex items-center justify-center gap-2 ${color === "text-civic-blue" ? "bg-blue-600 hover:bg-blue-700" : color === "text-civic-indigo" ? "bg-indigo-600 hover:bg-indigo-700" : ""}`}
                >
                  {cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="border-t border-gray-800 bg-gray-900/40 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-white">
            Why CivicGrid?
          </h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <div className="mt-1 flex-shrink-0">
                  <Icon className="h-6 w-6 text-brand-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm text-gray-400">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl rounded-2xl border border-brand-600/30 bg-gradient-to-br from-brand-900/40 to-indigo-900/40 p-12 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to join the grid?</h2>
          <p className="mt-3 text-gray-400">
            Connect your Freighter wallet and mint your CivicID in seconds.
          </p>
          <Link href="/identity" className="btn-primary mt-8 inline-flex items-center gap-2 text-base px-8 py-3">
            Mint CivicID <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 px-6 py-10 text-center text-sm text-gray-600">
        <p>
          CivicGrid · Built on{" "}
          <a href="https://stellar.org" className="text-gray-500 hover:text-white">
            Stellar
          </a>{" "}
          · Open Source
        </p>
      </footer>
    </div>
  );
}
