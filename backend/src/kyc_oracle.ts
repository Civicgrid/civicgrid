/**
 * kyc_oracle.ts — KYC Identity Oracle
 *
 * Exposes an HTTP endpoint the Next.js frontend calls when a user requests
 * a credential. In a production system this would:
 *   1. Accept a signed proof from a KYC provider (Persona, Jumio, etc.)
 *   2. Verify the proof server-side (signature + expiry check)
 *   3. Call mint_credential on the civic_id Soroban contract
 *
 * This implementation simulates the verification step so the full flow
 * can be demonstrated on Testnet without a real KYC provider.
 */

import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { invokeContract, config, oracleKeypair } from "./soroban";

// ── Request validation ────────────────────────────────────────────────────────

const MintRequestSchema = z.object({
  /** Stellar G-address of the wallet requesting the credential. */
  address: z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address"),
  /** Which credential type to issue. */
  credentialType: z.enum(["Kyc", "Property", "Civic"]),
  /**
   * Off-chain proof token from KYC provider.
   * In production: a JWT signed by Persona / Jumio / Stripe Identity.
   * Here: any non-empty string is accepted (simulation mode).
   */
  proofToken: z.string().min(1).optional(),
  /** Optional IPFS CID or DID document URL for the credential metadata. */
  metadataUri: z.string().max(256).optional(),
});

type MintRequest = z.infer<typeof MintRequestSchema>;

// ── Simulated KYC verification ────────────────────────────────────────────────

/**
 * verifyProof — replace with real provider SDK call in production.
 *
 * @returns  object with `valid` flag and optional `expiresAt` UNIX timestamp.
 */
async function verifyProof(
  _address: string,
  credType: string,
  _proofToken: string | undefined
): Promise<{ valid: boolean; expiresAt: number }> {
  // Simulate a 200 ms provider round-trip
  await new Promise((r) => setTimeout(r, 200));

  // In simulation mode every request succeeds.
  // Kyc credentials expire in 1 year; others are perpetual (0).
  const expiresAt =
    credType === "Kyc"
      ? Math.floor(Date.now() / 1000) + 365 * 24 * 3600
      : 0;

  return { valid: true, expiresAt };
}

// ── Soroban credential type encoding ─────────────────────────────────────────

/**
 * Encodes a CredentialType string into the Soroban enum ScVal format.
 * Matches the on-chain enum variant order:
 *   0 = Kyc, 1 = Property, 2 = Civic
 */
function encodeCredentialType(credType: string) {
  const variants: Record<string, number> = {
    Kyc:      0,
    Property: 1,
    Civic:    2,
  };
  const idx = variants[credType];
  if (idx === undefined) throw new Error(`Unknown credential type: ${credType}`);
  // Soroban enum: xdr.ScVal with type SCV_VEC containing a symbol
  return nativeToScVal({ [credType]: null });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export function kycOracleRouter(): Router {
  const router = Router();

  /**
   * POST /api/kyc/mint
   * Body: { address, credentialType, proofToken?, metadataUri? }
   * Response: { txHash } on success
   */
  router.post("/mint", async (req: Request, res: Response) => {
    // 1. Validate input
    const parsed = MintRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
    }

    const { address, credentialType, proofToken, metadataUri } = parsed.data as MintRequest;

    // 2. Rate-limit guard (simple in-memory; use Redis in prod)
    if (isRateLimited(address, credentialType)) {
      return res.status(429).json({
        error: "Too many requests. Please wait before requesting another credential.",
      });
    }

    // 3. Verify the off-chain proof
    let proof: { valid: boolean; expiresAt: number };
    try {
      proof = await verifyProof(address, credentialType, proofToken);
    } catch (e: any) {
      console.error("[KYC Oracle] Proof verification error:", e);
      return res.status(502).json({ error: "KYC provider error" });
    }

    if (!proof.valid) {
      return res.status(403).json({ error: "KYC verification failed" });
    }

    // 4. Mint the credential on-chain
    try {
      const kp  = oracleKeypair();
      const uri = metadataUri ?? `ipfs://civicgrid/${credentialType.toLowerCase()}/${address}`;

      const txHash = await invokeContract(
        config.civicIdContract,
        "mint_credential",
        [
          new Address(address).toScVal(),
          encodeCredentialType(credentialType),
          nativeToScVal(uri,           { type: "string" }),
          nativeToScVal(BigInt(proof.expiresAt), { type: "u64" }),
        ],
        kp
      );

      console.log(
        `[KYC Oracle] Minted ${credentialType} for ${address} → tx ${txHash}`
      );
      recordIssuance(address, credentialType);

      return res.json({ txHash, expiresAt: proof.expiresAt });
    } catch (e: any) {
      console.error("[KYC Oracle] Mint failed:", e);
      return res.status(500).json({ error: e.message ?? "Mint transaction failed" });
    }
  });

  /**
   * POST /api/kyc/revoke
   * Body: { address, credentialType }
   * Requires the request to originate from a trusted admin IP or carry
   * an admin JWT (simplified here to a static bearer token).
   */
  router.post("/revoke", async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.ORACLE_ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = z.object({
      address:        z.string().regex(/^G[A-Z2-7]{55}$/),
      credentialType: z.enum(["Kyc", "Property", "Civic"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const { address, credentialType } = parsed.data;

    try {
      const kp = oracleKeypair();
      const txHash = await invokeContract(
        config.civicIdContract,
        "revoke_credential",
        [
          new Address(address).toScVal(),
          encodeCredentialType(credentialType),
        ],
        kp
      );
      console.log(`[KYC Oracle] Revoked ${credentialType} for ${address} → tx ${txHash}`);
      return res.json({ txHash });
    } catch (e: any) {
      console.error("[KYC Oracle] Revoke failed:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
// Replace with Redis + sliding-window in production.

const issuanceLog = new Map<string, number>();

function issuanceKey(address: string, credType: string): string {
  return `${address}:${credType}`;
}

function isRateLimited(address: string, credType: string): boolean {
  const key  = issuanceKey(address, credType);
  const last = issuanceLog.get(key);
  if (!last) return false;
  // Allow one request per credential type per 60 seconds
  return Date.now() - last < 60_000;
}

function recordIssuance(address: string, credType: string): void {
  issuanceLog.set(issuanceKey(address, credType), Date.now());
}
