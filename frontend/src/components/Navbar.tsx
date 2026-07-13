"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Zap, Vote, Grid } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { clsx } from "clsx";

const LINKS = [
  { href: "/identity", label: "CivicID",   icon: Shield },
  { href: "/energy",   label: "GridTrade",  icon: Zap    },
  { href: "/dao",      label: "GridDAO",    icon: Vote   },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Grid className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg">CivicGrid</span>
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-1 sm:flex">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                pathname.startsWith(href)
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Wallet button */}
        <WalletButton />
      </div>
    </nav>
  );
}
