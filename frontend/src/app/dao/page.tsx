"use client";

import { useState, useEffect } from "react";
import { Vote, Plus, CheckCircle, Clock, XCircle, TrendingUp, Gift } from "lucide-react";
import { useFreighter } from "@/lib/useFreighter";
import { gridDao, type Proposal, type Grant } from "@/lib/soroban";
import { WalletButton } from "@/components/WalletButton";
import { ProposalCard } from "@/components/ProposalCard";
import { GrantCard } from "@/components/GrantCard";
import { clsx } from "clsx";

type Tab = "proposals" | "grants" | "treasury";

export default function DaoPage() {
  const { address, connected } = useFreighter();

  const [tab, setTab] = useState<Tab>("treasury");
  const [balance, setBalance] = useState<string>("—");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New proposal form state
  const [showPropForm, setShowPropForm] = useState(false);
  const [propDesc, setPropDesc] = useState("");
  const [propRecipient, setPropRecipient] = useState("");
  const [propAmount, setPropAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [bal, props, grnts] = await Promise.all([
        gridDao.treasuryBalance(),
        gridDao.getProposals(),
        gridDao.getGrants(),
      ]);
      setBalance(bal);
      setProposals(props);
      setGrants(grnts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleCreateProposal() {
    if (!address || !propDesc || !propRecipient || !propAmount) return;
    setSubmitting(true);
    setError(null);
    try {
      const hash = await gridDao.createProposal(
        address,
        propDesc,
        propRecipient,
        BigInt(propAmount)
      );
      setTxHash(hash);
      setShowPropForm(false);
      setPropDesc(""); setPropRecipient(""); setPropAmount("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create proposal");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(proposalId: bigint) {
    if (!address) return;
    setError(null);
    try {
      const hash = await gridDao.approveProposal(address, proposalId);
      setTxHash(hash);
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Failed to approve");
    }
  }

  async function handleExecute(proposalId: bigint) {
    if (!address) return;
    setError(null);
    try {
      const hash = await gridDao.executeProposal(address, proposalId);
      setTxHash(hash);
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Failed to execute");
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "treasury", label: "Treasury", icon: TrendingUp },
    { id: "proposals", label: "Proposals", icon: Vote },
    { id: "grants", label: "Grants", icon: Gift },
  ];

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-900/30 text-civic-indigo">
            <Vote className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">GridDAO</h1>
            <p className="text-gray-400">Multi-sig treasury · Proposals · Streaming grants</p>
          </div>
        </div>

        {/* Wallet gate */}
        {!connected && (
          <div className="card mb-6 flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-gray-400">Connect your wallet to interact with the DAO.</p>
            <WalletButton />
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition",
                tab === id
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Error / TX */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-800/40 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {txHash && (
          <div className="mb-4 rounded-lg border border-green-800/40 bg-green-900/20 px-4 py-3 text-xs text-green-400">
            ✓{" "}
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {txHash.slice(0, 20)}…
            </a>
          </div>
        )}

        {/* ── Treasury Tab ── */}
        {tab === "treasury" && (
          <div className="space-y-6">
            <div className="card">
              <p className="text-xs text-gray-500">Treasury Balance</p>
              <p className="mt-1 text-4xl font-bold text-white">
                {loading ? "…" : balance}{" "}
                <span className="text-lg text-gray-500">XLM</span>
              </p>
              <p className="mt-2 text-xs text-gray-600">
                Funded by 0.5 % of all GridTrade energy swaps
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Total Proposals", value: proposals.length },
                { label: "Active Grants", value: grants.filter((g) => g.active).length },
                { label: "Protocol Fee", value: "0.5 %" },
              ].map((s) => (
                <div key={s.label} className="card text-center">
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="card border-indigo-800/30 bg-indigo-900/10">
              <p className="text-sm font-semibold text-white">How the DAO works</p>
              <ol className="mt-2 space-y-1.5 text-sm text-gray-400 list-decimal list-inside">
                <li>GridTrade auto-forwards 0.5 % of every swap to this treasury.</li>
                <li>Any DAO signer can create a fund-transfer proposal.</li>
                <li>Proposals pass once the multi-sig threshold of approvals is reached.</li>
                <li>Passed proposals can be executed, releasing funds to the recipient.</li>
                <li>Streaming grants release funds incrementally per approved milestone.</li>
              </ol>
            </div>
          </div>
        )}

        {/* ── Proposals Tab ── */}
        {tab === "proposals" && (
          <div>
            <div className="mb-4 flex justify-between">
              <p className="text-sm text-gray-500">{proposals.length} proposals on-chain</p>
              {connected && (
                <button
                  onClick={() => setShowPropForm(!showPropForm)}
                  className="btn-primary flex items-center gap-1.5 text-xs"
                >
                  <Plus className="h-3 w-3" /> New Proposal
                </button>
              )}
            </div>

            {showPropForm && (
              <div className="card mb-6 border-indigo-800/40">
                <h3 className="mb-3 font-semibold text-white">Create Proposal</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400">Description</label>
                    <textarea
                      value={propDesc}
                      onChange={(e) => setPropDesc(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      placeholder="Describe the funding request…"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Recipient Address</label>
                    <input
                      value={propRecipient}
                      onChange={(e) => setPropRecipient(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
                      placeholder="G…"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Amount (stroops)</label>
                    <input
                      type="number"
                      value={propAmount}
                      onChange={(e) => setPropAmount(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      placeholder="e.g. 1000000"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateProposal} disabled={submitting} className="btn-primary text-xs">
                      {submitting ? "Submitting…" : "Submit"}
                    </button>
                    <button onClick={() => setShowPropForm(false)} className="btn-secondary text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="card h-24 animate-pulse bg-gray-800/50" />
                ))}
              </div>
            ) : proposals.length === 0 ? (
              <div className="card flex flex-col items-center gap-3 py-12 text-center">
                <Vote className="h-10 w-10 text-gray-700" />
                <p className="text-gray-500">No proposals yet. Create the first one!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {proposals.map((p) => (
                  <ProposalCard
                    key={p.id.toString()}
                    proposal={p}
                    currentAddress={address}
                    onApprove={() => handleApprove(p.id)}
                    onExecute={() => handleExecute(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Grants Tab ── */}
        {tab === "grants" && (
          <div>
            <p className="mb-4 text-sm text-gray-500">{grants.length} grants on-chain</p>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="card h-24 animate-pulse bg-gray-800/50" />
                ))}
              </div>
            ) : grants.length === 0 ? (
              <div className="card flex flex-col items-center gap-3 py-12 text-center">
                <Gift className="h-10 w-10 text-gray-700" />
                <p className="text-gray-500">No active grants. Grants are created by DAO admins.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {grants.map((g) => (
                  <GrantCard key={g.id.toString()} grant={g} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
