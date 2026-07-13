"use client";

import { Gift, CheckCircle, Clock } from "lucide-react";
import type { Grant } from "@/lib/soroban";
import { clsx } from "clsx";

interface GrantCardProps {
  grant: Grant;
}

export function GrantCard({ grant }: GrantCardProps) {
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const pct =
    grant.total_amount > 0n
      ? Number((grant.disbursed * 100n) / grant.total_amount)
      : 0;

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-900/30 text-civic-indigo">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Grant #{grant.id.toString()}</p>
            <p className="font-semibold text-white">
              {shortAddr(grant.grantee)}
            </p>
          </div>
        </div>
        <span className={grant.active ? "badge-green" : "badge-blue"}>
          {grant.active ? "Active" : "Completed"}
        </span>
      </div>

      {/* Progress */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-gray-500">Disbursed</span>
          <span className="text-gray-400">
            {grant.disbursed.toString()} / {grant.total_amount.toString()} ({pct} %)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Milestones</p>
        {grant.milestones.map((ms, idx) => (
          <div
            key={idx}
            className={clsx(
              "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
              ms.released
                ? "border-green-800/40 bg-green-900/10 text-green-400"
                : "border-gray-800 text-gray-400"
            )}
          >
            {ms.released ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
            ) : (
              <Clock className="h-4 w-4 flex-shrink-0 text-gray-600" />
            )}
            <span className="flex-1 truncate">{ms.description}</span>
            <span className="font-mono text-xs">{ms.tranche.toString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
