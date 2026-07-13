"use client";

import { Shield, Home, Users, CheckCircle, XCircle } from "lucide-react";
import { clsx } from "clsx";

type CredentialType = "KYC" | "PROPERTY" | "CIVIC";

const ICONS: Record<CredentialType, React.ElementType> = {
  KYC:      Shield,
  PROPERTY: Home,
  CIVIC:    Users,
};

const COLORS: Record<CredentialType, { active: string; inactive: string }> = {
  KYC:      { active: "bg-blue-900/40 text-blue-400 border-blue-800/40",   inactive: "bg-gray-800 text-gray-600 border-gray-700" },
  PROPERTY: { active: "bg-amber-900/40 text-amber-400 border-amber-800/40", inactive: "bg-gray-800 text-gray-600 border-gray-700" },
  CIVIC:    { active: "bg-indigo-900/40 text-indigo-400 border-indigo-800/40", inactive: "bg-gray-800 text-gray-600 border-gray-700" },
};

interface CredentialBadgeProps {
  type: CredentialType;
  active: boolean | null;
}

export function CredentialBadge({ type, active }: CredentialBadgeProps) {
  const Icon    = ICONS[type];
  const palette = COLORS[type];
  const classes = active ? palette.active : palette.inactive;

  return (
    <div
      className={clsx(
        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border",
        classes
      )}
      title={`${type} credential — ${active ? "active" : "not issued"}`}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}
