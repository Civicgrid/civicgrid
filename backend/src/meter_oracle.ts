/**
 * meter_oracle.ts — IoT Smart Meter Oracle
 *
 * Simulates a fleet of solar smart meters. Each meter periodically reports
 * its energy production and the oracle calls mint_kwh on the GridTrade
 * contract to credit the producer's on-chain balance.
 *
 * In production this service would:
 *   - Subscribe to an MQTT/WebSocket feed from physical smart meters.
 *   - Validate cryptographic signatures from certified meter hardware.
 *   - Aggregate readings over a configurable window before minting
 *     (to avoid one tx per watt).
 *   - Implement idempotency (meter reading IDs) to prevent double-minting.
 *
 * Here we simulate the meter fleet with a configurable interval and
 * random production values to demonstrate the full on-chain flow.
 */

import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { invokeContract, config, oracleKeypair, sleep } from "./soroban";

// ── Meter registry ────────────────────────────────────────────────────────────

interface MeterRecord {
  meterId:         string;
  ownerAddress:    string;
  /** Panel capacity in Watts */
  capacityW:       number;
  /** Whether the meter is currently active */
  active:          boolean;
  lastReadingAt:   number;
  totalKwhMinted:  number;
}

// In production: persisted in a database.
const meterRegistry = new Map<string, MeterRecord>();

// ── Simulation loop ───────────────────────────────────────────────────────────

let simulationRunning = false;

/**
 * Start the background simulation loop.
 * Reads all active meters every `intervalMs` milliseconds and mints kWh.
 */
export async function startMeterSimulation(intervalMs = 30_000): Promise<void> {
  if (simulationRunning) return;
  simulationRunning = true;
  console.log(
    `[Meter Oracle] Simulation started. Interval: ${intervalMs / 1000}s`
  );

  while (simulationRunning) {
    await runMeterCycle();
    await sleep(intervalMs);
  }
}

export function stopMeterSimulation(): void {
  simulationRunning = false;
  console.log("[Meter Oracle] Simulation stopped.");
}

async function runMeterCycle(): Promise<void> {
  const active = [...meterRegistry.values()].filter((m) => m.active);
  if (active.length === 0) {
    console.log("[Meter Oracle] No active meters registered.");
    return;
  }

  console.log(`[Meter Oracle] Processing ${active.length} meter(s)…`);

  for (const meter of active) {
    try {
      const kwh = simulateReading(meter);
      if (kwh <= 0) continue;

      const kp = oracleKeypair();
      const txHash = await invokeContract(
        config.gridTradeContract,
        "mint_kwh",
        [
          new Address(meter.ownerAddress).toScVal(),
          nativeToScVal(BigInt(kwh), { type: "i128" }),
        ],
        kp
      );

      meter.lastReadingAt  = Date.now();
      meter.totalKwhMinted += kwh;
      meterRegistry.set(meter.meterId, meter);

      console.log(
        `[Meter Oracle] Meter ${meter.meterId} → minted ${kwh} kWh ` +
        `for ${meter.ownerAddress} → tx ${txHash}`
      );
    } catch (e: any) {
      console.error(
        `[Meter Oracle] Failed to process meter ${meter.meterId}:`,
        e.message
      );
    }
  }
}

/**
 * Simulate a solar panel reading.
 *
 * Uses a simple model: production is proportional to panel capacity with
 * a sinusoidal daylight factor and ±20 % random variance.
 * Returns whole kWh units (minimum 0).
 */
function simulateReading(meter: MeterRecord): number {
  const hour         = new Date().getUTCHours();
  // Daylight factor: 0 at night, peaks at solar noon (12:00 UTC)
  const daylightFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const baseKwh        = (meter.capacityW / 1000) * daylightFactor;
  const variance       = 0.8 + Math.random() * 0.4; // 0.8–1.2
  return Math.max(0, Math.round(baseKwh * variance));
}

// ── HTTP routes ───────────────────────────────────────────────────────────────

const RegisterMeterSchema = z.object({
  meterId:      z.string().min(1).max(64),
  ownerAddress: z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address"),
  capacityW:    z.number().int().positive().max(100_000),
});

const ManualReadingSchema = z.object({
  meterId:   z.string().min(1),
  kwhAmount: z.number().int().positive(),
});

export function meterOracleRouter(): Router {
  const router = Router();

  /**
   * POST /api/meter/register
   * Register a new smart meter and associate it with a producer's wallet.
   */
  router.post("/register", async (req: Request, res: Response) => {
    const parsed = RegisterMeterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
    }

    const { meterId, ownerAddress, capacityW } = parsed.data;

    if (meterRegistry.has(meterId)) {
      return res.status(409).json({ error: "Meter already registered" });
    }

    const record: MeterRecord = {
      meterId,
      ownerAddress,
      capacityW,
      active:         true,
      lastReadingAt:  0,
      totalKwhMinted: 0,
    };
    meterRegistry.set(meterId, record);

    console.log(
      `[Meter Oracle] Registered meter ${meterId} for ${ownerAddress} ` +
      `(${capacityW} W)`
    );
    return res.status(201).json({ meterId, ownerAddress, capacityW });
  });

  /**
   * POST /api/meter/reading
   * Manually trigger a kWh mint for a specific meter (useful for testing
   * or processing a real reading pushed from hardware).
   */
  router.post("/reading", async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.ORACLE_ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = ManualReadingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const { meterId, kwhAmount } = parsed.data;
    const meter = meterRegistry.get(meterId);

    if (!meter) {
      return res.status(404).json({ error: "Meter not found" });
    }
    if (!meter.active) {
      return res.status(409).json({ error: "Meter is inactive" });
    }

    try {
      const kp = oracleKeypair();
      const txHash = await invokeContract(
        config.gridTradeContract,
        "mint_kwh",
        [
          new Address(meter.ownerAddress).toScVal(),
          nativeToScVal(BigInt(kwhAmount), { type: "i128" }),
        ],
        kp
      );

      meter.lastReadingAt  = Date.now();
      meter.totalKwhMinted += kwhAmount;
      meterRegistry.set(meterId, meter);

      console.log(
        `[Meter Oracle] Manual reading: ${kwhAmount} kWh → ${meter.ownerAddress} → tx ${txHash}`
      );
      return res.json({ txHash, meterId, kwhAmount });
    } catch (e: any) {
      console.error("[Meter Oracle] Manual reading failed:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /api/meter/status
   * Returns current state of all registered meters.
   */
  router.get("/status", (_req: Request, res: Response) => {
    const meters = [...meterRegistry.values()].map(
      ({ meterId, ownerAddress, capacityW, active, lastReadingAt, totalKwhMinted }) => ({
        meterId,
        ownerAddress,
        capacityW,
        active,
        lastReadingAt: lastReadingAt
          ? new Date(lastReadingAt).toISOString()
          : null,
        totalKwhMinted,
      })
    );
    return res.json({ meters, simulationRunning });
  });

  /**
   * POST /api/meter/deactivate
   * Deactivate a meter (stops it from being included in simulation cycles).
   */
  router.post("/deactivate", async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.ORACLE_ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { meterId } = req.body as { meterId?: string };
    if (!meterId) return res.status(400).json({ error: "meterId required" });

    const meter = meterRegistry.get(meterId);
    if (!meter) return res.status(404).json({ error: "Meter not found" });

    meter.active = false;
    meterRegistry.set(meterId, meter);
    return res.json({ meterId, active: false });
  });

  return router;
}
