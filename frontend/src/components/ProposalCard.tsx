"use client";

import { CheckCircle, Play, Clock, XCircle, Users } from "lucide-react";
import type { Proposal } from "@/lib/soroban";
import { clsx } from "clsx";

interface ProposalCardProps {
  proposal: Proposal;
  currentAddress: string | null;
  onApprove: () => void;
  onExecute: () => void;
}

const STATUS_STYLE: Record<Proposal["status"], string> = {
  Active:   "badge-yellow",
  Passed:   "badge-blue",
  Executed: "badge-green",
  Rejected: "badge-red",
};

const STATUS_ICON: Record<Proposal["status"], React.ElementType> = {
  Active:   Clock,
  Passed:   CheckCircle,
  Executed: CheckCircle,
  Rejected: XCircle,
};

export function ProposalCard({ proposal, currentAddress, onApprove, onExecute }: ProposalCardProps) {
  const StatusIcon = STATUS_ICON[proposal.status];
  const hasApproved = currentAddress
    ? proposal.approvals.includes(currentAddress)
    : false;
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <div className="card space-y-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-mono">#{proposal.id.toString()}</span>
            <span className={STATUS_STYLE[proposal.status]}>
              <StatusIcon className="h-3 w-3" />
              {proposal.status}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-white line-clamp-2">
            {proposal.description}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-white">
            {proposal.amount.toString()}
          </p>
          <p className="text-xs text-gray-500">stroops</p>
        </div>
      </div>

      {/* Recipient */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Recipient:</span>
        <span className="font-mono text-gray-400">{shortAddr(proposal.recipient)}</span>
      </div>

      {/* Approvals */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Users className="h-3.5 w-3.5" />
        <span>{proposal.approvals.length} approval(s)</span>
        {proposal.approvals.length > 0 && (
          <div className="flex gap-1">
            {proposal.approvals.map((a) => (
              <span key={a} className="badge-blue font-mono">{shortAddr(a)}</span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {currentAddress && (
        <div className="flex gap-2 pt-1">
          {proposal.status === "Active" && !hasApproved && (
            <button
              onClick={onApprove}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <CheckCircle className="h-3.5 w-3.5" /> Approve
            </button>
          )}
          {proposal.status === "Active" && hasApproved && (
            <span className="badge-green">
              <CheckCircle className="h-3 w-3" /> You approved
            </span>
          )}
          {proposal.status === "Passed" && (
            <button
              onClick={onExecute}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <Play className="h-3.5 w-3.5" /> Execute
            </button>
          )}
        </div>
      )}
    </div>
  );
}
