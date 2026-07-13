"use client";

import { Wallet, LogOut, Loader2 } from "lucide-react";
import { useFreighter } from "@/lib/useFreighter";

export function WalletButton() {
  const { connected, address, connecting, connect, disconnect } = useFreighter();

  if (connecting) {
    return (
      <button disabled className="btn-secondary flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting…
      </button>
    );
  }

  if (connected && address) {
    const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 font-mono text-xs text-gray-300 sm:inline">
          {short}
        </span>
        <button
          onClick={disconnect}
          aria-label="Disconnect wallet"
          className="rounded-lg border border-gray-700 bg-gray-800 p-1.5 text-gray-400 transition hover:border-red-700 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button onClick={connect} className="btn-primary flex items-center gap-2 text-sm">
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </button>
  );
}
