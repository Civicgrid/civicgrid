"use client";

import { useState, useEffect, useCallback } from "react";

// Types from @stellar/freighter-api
declare global {
  interface Window {
    freighter?: {
      isConnected: () => Promise<boolean>;
      getPublicKey: () => Promise<string>;
      getNetwork: () => Promise<string>;
      signTransaction: (
        xdr: string,
        opts?: { network?: string; networkPassphrase?: string; accountToSign?: string }
      ) => Promise<string>;
    };
  }
}

export interface FreighterState {
  connected: boolean;
  address: string | null;
  network: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
}

export function useFreighter(): FreighterState {
  const [connected, setConnected]   = useState(false);
  const [address, setAddress]       = useState<string | null>(null);
  const [network, setNetwork]       = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Attempt to restore a previously connected session on mount
  useEffect(() => {
    (async () => {
      try {
        if (typeof window === "undefined" || !window.freighter) return;
        const isConn = await window.freighter.isConnected();
        if (isConn) {
          const [pk, net] = await Promise.all([
            window.freighter.getPublicKey(),
            window.freighter.getNetwork(),
          ]);
          setAddress(pk);
          setNetwork(net);
          setConnected(true);
        }
      } catch (_) {
        // Freighter not installed or permission revoked — silently ignore
      }
    })();
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.freighter) {
      window.open("https://www.freighter.app/", "_blank");
      return;
    }
    setConnecting(true);
    try {
      const [pk, net] = await Promise.all([
        window.freighter.getPublicKey(),
        window.freighter.getNetwork(),
      ]);
      setAddress(pk);
      setNetwork(net);
      setConnected(true);
    } catch (e) {
      console.error("Freighter connect failed:", e);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    setAddress(null);
    setNetwork(null);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!window.freighter) throw new Error("Freighter not installed");
      return window.freighter.signTransaction(xdr, {
        networkPassphrase: network ?? undefined,
      });
    },
    [network]
  );

  return { connected, address, network, connecting, connect, disconnect, signTransaction };
}
