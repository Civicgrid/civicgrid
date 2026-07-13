/**
 * index.ts — CivicGrid Oracle Server
 *
 * Starts the Express API that hosts:
 *   - /api/kyc/*    → KYC oracle (credential issuance)
 *   - /api/meter/*  → Smart meter oracle (kWh minting)
 *   - /healthz      → Health check for load-balancers
 */

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { kycOracleRouter }   from "./kyc_oracle";
import { meterOracleRouter, startMeterSimulation } from "./meter_oracle";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "4000", 10);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// Basic request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/healthz", (_req, res) => {
  res.json({
    status:    "ok",
    service:   "civicgrid-oracle",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/kyc",   kycOracleRouter());
app.use("/api/meter", meterOracleRouter());

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Unhandled error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║       CivicGrid Oracle Server            ║
║  Listening on http://localhost:${PORT}      ║
╚══════════════════════════════════════════╝

  Routes:
    GET  /healthz           → health check
    POST /api/kyc/mint      → issue CivicID credential
    POST /api/kyc/revoke    → revoke credential (admin)
    POST /api/meter/register → register a smart meter
    POST /api/meter/reading  → manual kWh reading (admin)
    GET  /api/meter/status   → list all meters

  Network:  ${process.env.NETWORK_PASSPHRASE ?? "Stellar Testnet"}
  CivicID:  ${process.env.CIVIC_ID_CONTRACT  ?? "(not set — see .env.example)"}
  GridTrade: ${process.env.GRID_TRADE_CONTRACT ?? "(not set — see .env.example)"}
`);

  // Start the background IoT simulation loop (every 30 s)
  const simInterval = parseInt(process.env.METER_INTERVAL_MS ?? "30000", 10);
  startMeterSimulation(simInterval).catch(console.error);
});

export default app;
