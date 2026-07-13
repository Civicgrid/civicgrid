/**
 * soroban.ts — backend helper for building and submitting Soroban transactions.
 *
 * The oracle keypair (ORACLE_SECRET_KEY in .env) is the admin of both the
 * civic_id and grid_trade contracts on Testnet/Mainnet.
 */

import {
  Keypair,
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  Address,
  nativeToScVal,
  Account,
  Transaction,
} from "@stellar/stellar-sdk";

// ── Config ────────────────────────────────────────────────────────────────────

export const config = {
  rpcUrl:            process.env.RPC_URL            ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
  civicIdContract:   process.env.CIVIC_ID_CONTRACT  ?? "",
  gridTradeContract: process.env.GRID_TRADE_CONTRACT ?? "",
  oracleSecret:      process.env.ORACLE_SECRET_KEY  ?? "",
};

export function oracleKeypair(): Keypair {
  if (!config.oracleSecret) throw new Error("ORACLE_SECRET_KEY not set in .env");
  return Keypair.fromSecret(config.oracleSecret);
}

export function rpcServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(config.rpcUrl, { allowHttp: true });
}

// ── Core: build → simulate → sign → submit ───────────────────────────────────

export async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerKeypair: Keypair
): Promise<string> {
  const server  = rpcServer();
  const source  = signerKeypair.publicKey();
  const account = await server.getAccount(source);

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(
    new Account(source, account.sequence),
    { fee: BASE_FEE, networkPassphrase: config.networkPassphrase }
  )
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  // Simulate
  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  // Assemble (adds footprint & resource limits)
  const assembled = SorobanRpc.assembleTransaction(
    tx as Transaction,
    sim
  ).build();

  // Sign
  assembled.sign(signerKeypair);

  // Submit
  const result = await server.sendTransaction(assembled);
  if (result.status === "ERROR") {
    throw new Error(`Submit error: ${JSON.stringify(result.errorResult)}`);
  }

  // Poll until finalized
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const status = await server.getTransaction(result.hash);
    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return result.hash;
    }
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${result.hash}`);
    }
  }
  throw new Error(`Timed out waiting for tx: ${result.hash}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
