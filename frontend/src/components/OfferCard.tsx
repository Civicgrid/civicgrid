"use client";

import { Zap, Loader2 } from "lucide-react";
import type { EnergyOffer } from "@/lib/soroban";
import { clsx } from "clsx";

interface OfferCardProps {
  offer: EnergyOffer;
  currentAddress: string | null;
  accepting: boolean;
  onAccept: () => void;
}

export function OfferCard({ offer, currentAddress, accepting, onAccept }: OfferCardProps) {
  const isOwn = offer.producer === currentAddress;
  const total = offer.kwh_amount * offer.price_per_kwh;
  const fee   = (total * 50n) / 10_000n; // 0.5 %

  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <div className="card flex items-center justify-between gap-4">
      {/* Icon */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-900/30 text-brand-500">
        <Zap className="h-5 w-5" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-lg font-bold text-white">
            {offer.kwh_amount.toString()} kWh
          </span>
          <span className="badge-green">Open</span>
          {isOwn && <span className="badge-yellow">Your listing</span>}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          Producer:{" "}
          <span className="font-mono text-gray-400">{shortAddr(offer.producer)}</span>
        </p>
      </div>

      {/* Pricing */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-white">
          {offer.price_per_kwh.toString()} / kWh
        </p>
        <p className="text-xs text-gray-500">
          Total: {total.toString()} · Fee: {fee.toString()}
        </p>
      </div>

      {/* Action */}
      {!isOwn && currentAddress && (
        <button
          onClick={onAccept}
          disabled={accepting}
          className={clsx(
            "btn-primary flex items-center gap-1.5 text-sm flex-shrink-0",
            accepting && "opacity-70"
          )}
        >
          {accepting ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Accepting…</>
          ) : (
            "Buy"
          )}
        </button>
      )}
    </div>
  );
}
