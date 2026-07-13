"use client";

import { useState } from "react";
import { Shield, CheckCircle, XCircle, Clock, Plus } from "lucide-react";
import { useFreighter } from "@/lib/useFreighter";
import { civicId } from "@/lib/soroban";
import { WalletButton } from "@/components/WalletButton";
import { CredentialBadge } from "@/components/CredentialBadge";
import { clsx } from "clsx";

type CredentialType = "KYC" | "PROPERTY" | "CIVIC";

const CREDENTIAL_META: Record<CredentialType, { label: string; description: string; color: string }> = {
  KYC: {
    label: "Identity (KYC)",
    description: "Verifies your real-world identity. Required to participate in GridTrade.",
    color: "blue",
  },
  PROPERTY: {
    label: "Property Ownership",
    description: "Attests ownership of physical assets — solar panels, land, or infrastructure.",
    color: "amber",
  },
  CIVIC: {
    label: "Civic Participation",
    description: "Recognises active participation in DAO governance and community projects.",
    color: "indigo",
  },
};

export default function IdentityPage() {
  const { address, connected, connect } = useFreighter();
  const [credentials, setCredentials] = useState<Record<CredentialType, boolean | null>>({
    KYC: null,
    PROPERTY: null,
    CIVIC: null,
  });
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState<CredentialType | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function loadCredentials() {
    if (!address) return;
    setLoading(true);
    try {
      const result = await civicId.getAllCredentials(address);
      setCredentials({
        KYC:      result.KYC      ?? false,
        PROPERTY: result.PROPERTY ?? false,
        CIVIC:    result.CIVIC    ?? false,
      });
    } catch (e) {
      console.error("Failed to load credentials:", e);
    } finally {
      setLoading(false);
    }
  }

  async function requestMint(type: CredentialType) {
    if (!address) return;
    setMinting(type);
    try {
      // In production this calls the KYC oracle backend which verifies
      // the user then submits the mint_credential transaction.
      const res = await fetch("/api/kyc/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, credentialType: type }),
      });
      const data = await res.json();
      if (data.txHash) {
        setTxHash(data.txHash);
        await loadCredentials();
      }
    } catch (e) {
      console.error("Mint failed:", e);
    } finally {
      setMinting(null);
    }
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-900/30 text-civic-blue">
            <Shield className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">CivicID</h1>
            <p className="text-gray-400">Manage your on-chain soulbound credentials</p>
          </div>
        </div>

        {/* Wallet */}
        {!connected ? (
          <div className="card flex flex-col items-center gap-4 py-12 text-center">
            <Shield className="h-12 w-12 text-gray-600" />
            <p className="text-gray-400">Connect your Freighter wallet to view and mint credentials.</p>
            <WalletButton />
          </div>
        ) : (
          <>
            {/* Connected address */}
            <div className="card mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Connected Wallet</p>
                <p className="font-mono text-sm text-white">{address}</p>
              </div>
              <button
                onClick={loadCredentials}
                disabled={loading}
                className="btn-secondary text-xs"
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {/* Credential cards */}
            <div className="grid gap-4">
              {(Object.keys(CREDENTIAL_META) as CredentialType[]).map((type) => {
                const meta = CREDENTIAL_META[type];
                const status = credentials[type];
                return (
                  <div
                    key={type}
                    className={clsx(
                      "card flex items-start justify-between gap-4",
                      status === true && "border-green-800/40",
                      status === false && "border-gray-800",
                      status === null && "border-gray-800 opacity-60"
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <CredentialBadge type={type} active={status === true} />
                        <div>
                          <h3 className="font-semibold text-white">{meta.label}</h3>
                          <p className="text-xs text-gray-500">{meta.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {status === true && (
                        <span className="badge-green">
                          <CheckCircle className="h-3 w-3" /> Active
                        </span>
                      )}
                      {status === false && (
                        <button
                          onClick={() => requestMint(type)}
                          disabled={minting === type}
                          className="btn-primary flex items-center gap-1 text-xs py-1.5 px-3"
                        >
                          {minting === type ? (
                            <Clock className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          {minting === type ? "Requesting…" : "Request Credential"}
                        </button>
                      )}
                      {status === null && (
                        <span className="badge-yellow">
                          <Clock className="h-3 w-3" /> Not Loaded
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TX hash toast */}
            {txHash && (
              <div className="mt-6 card border-green-800/40 bg-green-900/20">
                <p className="text-xs text-green-400">
                  ✓ Transaction submitted:{" "}
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {txHash.slice(0, 16)}…
                  </a>
                </p>
              </div>
            )}

            {/* Info box */}
            <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5 text-sm text-gray-400">
              <p className="font-semibold text-gray-300">How credentials work</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Credentials are Soulbound Tokens — they cannot be transferred.</li>
                <li>The KYC oracle verifies your identity off-chain, then mints the SBT.</li>
                <li>GridTrade automatically checks KYC status before any swap.</li>
                <li>Revocation is possible by the issuing oracle for compliance.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
