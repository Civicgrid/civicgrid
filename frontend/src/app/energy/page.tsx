"use client";

import { useState, useEffect } from "react";
import { Zap, Plus, TrendingUp, RefreshCw, AlertTriangle } from "lucide-react";
import { useFreighter } from "@/lib/useFreighter";
import { gridTrade, type EnergyOffer } from "@/lib/soroban";
import { WalletButton } from "@/components/WalletButton";
import { OfferCard } from "@/components/OfferCard";
import { clsx } from "clsx";

export default function EnergyPage() {
  const { address, connected } = useFreighter();

  const [offers, setOffers] = useState<EnergyOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState<bigint | null>(null);

  // New offer form
  const [showForm, setShowForm] = useState(false);
  const [kwhAmount, setKwhAmount]     = useState("");
  const [pricePerKwh, setPricePerKwh] = useState("");
  const [listing, setListing]         = useState(false);
  const [txHash, setTxHash]           = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  async function loadOffers() {
    setLoading(true);
    try {
      const data = await gridTrade.getOpenOffers();
      setOffers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOffers(); }, []);

  async function handleListOffer() {
    if (!address || !kwhAmount || !pricePerKwh) return;
    setListing(true);
    setError(null);
    try {
      const hash = await gridTrade.listOffer(
        address,
        BigInt(kwhAmount),
        BigInt(pricePerKwh)
      );
      setTxHash(hash);
      setShowForm(false);
      setKwhAmount(""); setPricePerKwh("");
      await loadOffers();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
    } finally {
      setListing(false);
    }
  }

  async function handleAccept(offerId: bigint) {
    if (!address) return;
    setAccepting(offerId);
    setError(null);
    try {
      const hash = await gridTrade.acceptOffer(address, offerId);
      setTxHash(hash);
      await loadOffers();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
    } finally {
      setAccepting(null);
    }
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-10 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-900/30 text-brand-500">
              <Zap className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">GridTrade</h1>
              <p className="text-gray-400">P2P Energy Marketplace · KYC-gated atomic swaps</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadOffers}
              disabled={loading}
              className="btn-secondary flex items-center gap-1.5"
            >
              <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </button>
            {connected && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="btn-primary flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                List Energy
              </button>
            )}
          </div>
        </div>

        {/* Wallet gate */}
        {!connected && (
          <div className="card mb-6 flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="text-gray-400">Connect your wallet to trade energy.</p>
            <WalletButton />
          </div>
        )}

        {/* List offer form */}
        {connected && showForm && (
          <div className="card mb-8 border-green-800/40">
            <h2 className="mb-4 font-semibold text-white">New Energy Listing</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">kWh Amount</label>
                <input
                  type="number"
                  min="1"
                  value={kwhAmount}
                  onChange={(e) => setKwhAmount(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Price per kWh (in token units)</label>
                <input
                  type="number"
                  min="1"
                  value={pricePerKwh}
                  onChange={(e) => setPricePerKwh(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
            {kwhAmount && pricePerKwh && (
              <p className="mt-2 text-xs text-gray-500">
                Total value: {Number(kwhAmount) * Number(pricePerKwh)} · Protocol fee (0.5 %): {(Number(kwhAmount) * Number(pricePerKwh) * 0.005).toFixed(2)}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleListOffer}
                disabled={listing || !kwhAmount || !pricePerKwh}
                className="btn-primary"
              >
                {listing ? "Submitting…" : "Submit Offer"}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-800/40 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* TX success */}
        {txHash && (
          <div className="mb-4 rounded-lg border border-green-800/40 bg-green-900/20 px-4 py-3 text-xs text-green-400">
            ✓ Transaction:{" "}
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

        {/* Stats bar */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[
            { label: "Open Offers", value: offers.length },
            { label: "Protocol Fee", value: "0.5 %" },
            { label: "Settlement", value: "Atomic" },
          ].map((s) => (
            <div key={s.label} className="card text-center">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Offers list */}
        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card h-24 animate-pulse bg-gray-800/50" />
            ))}
          </div>
        ) : offers.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 py-16 text-center">
            <Zap className="h-10 w-10 text-gray-700" />
            <p className="text-gray-500">No open energy offers. Be the first to list!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id.toString()}
                offer={offer}
                currentAddress={address}
                accepting={accepting === offer.id}
                onAccept={() => handleAccept(offer.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
