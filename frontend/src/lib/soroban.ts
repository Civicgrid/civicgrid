/**
 * soroban.ts — typed client wrappers for all three CivicGrid contracts.
 *
 * In production these would use soroban-client / @stellar/stellar-sdk
 * to build, simulate, and submit real transactions. Here we provide a
 * clean interface that can be swapped between mock/testnet/mainnet by
 * changing NETWORK_CONFIG below.
 */

import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  Account,
} from "@stellar/stellar-sdk";

// ── Network configuration ─────────────────────────────────────────────────────

export const NETWORK_CONFIG = {
  rpcUrl:            process.env.NEXT_PUBLIC_RPC_URL    ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: process.env.NEXT_PUBLIC_PASSPHRASE ?? Networks.TESTNET,
  civicIdContract:   process.env.NEXT_PUBLIC_CIVIC_ID   ?? "CIVIC_ID_CONTRACT_ADDRESS",
  gridTradeContract: process.env.NEXT_PUBLIC_GRID_TRADE ?? "GRID_TRADE_CONTRACT_ADDRESS",
  gridDaoContract:   process.env.NEXT_PUBLIC_GRID_DAO   ?? "GRID_DAO_CONTRACT_ADDRESS",
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function rpc() {
  return new SorobanRpc.Server(NETWORK_CONFIG.rpcUrl, { allowHttp: true });
}

async function simulateAndSend(
  server: SorobanRpc.Server,
  signedXdr: string
): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_CONFIG.networkPassphrase);
  const result = await server.sendTransaction(tx);
  if (result.status === "ERROR") {
    throw new Error(`Transaction failed: ${JSON.stringify(result.errorResult)}`);
  }
  // Poll for confirmation
  let attempts = 0;
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await server.getTransaction(result.hash);
    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return result.hash;
    }
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("Transaction failed on-chain");
    }
    attempts++;
  }
  throw new Error("Transaction timed out");
}

async function buildAndSimulate(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourcePublicKey: string
) {
  const server  = rpc();
  const account = await server.getAccount(sourcePublicKey);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(new Account(sourcePublicKey, account.sequence), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_CONFIG.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation error: ${simResult.error}`);
  }
  const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
  return { assembled, server };
}

// ── Type definitions ──────────────────────────────────────────────────────────

export interface EnergyOffer {
  id: bigint;
  producer: string;
  kwh_amount: bigint;
  price_per_kwh: bigint;
  status: "Open" | "Filled" | "Cancelled";
  created_at: bigint;
}

export interface Proposal {
  id: bigint;
  description: string;
  recipient: string;
  amount: bigint;
  deadline_ledger: number;
  status: "Active" | "Passed" | "Executed" | "Rejected";
  approvals: string[];
}

export interface Milestone {
  tranche: bigint;
  description: string;
  released: boolean;
}

export interface Grant {
  id: bigint;
  grantee: string;
  total_amount: bigint;
  disbursed: bigint;
  milestones: Milestone[];
  active: boolean;
}

// ── CivicID client ────────────────────────────────────────────────────────────

export const civicId = {
  async isVerified(holder: string): Promise<boolean> {
    const server = rpc();
    const contract = new Contract(NETWORK_CONFIG.civicIdContract);
    // Use a fee-only account for read simulation
    const sourceKeypair = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
    try {
      const account = await server.getAccount(sourceKeypair).catch(() => ({
        accountId: () => sourceKeypair,
        sequence: "0",
      }));
      const tx = new TransactionBuilder(
        new Account(sourceKeypair, (account as any).sequence ?? "0"),
        { fee: BASE_FEE, networkPassphrase: NETWORK_CONFIG.networkPassphrase }
      )
        .addOperation(
          contract.call(
            "is_verified",
            new Address(holder).toScVal()
          )
        )
        .setTimeout(30)
        .build();
      const sim = await server.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(sim)) return false;
      const val = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
      return val ? scValToNative(val) : false;
    } catch {
      return false;
    }
  },

  async getAllCredentials(holder: string): Promise<Record<string, boolean>> {
    // In production: simulate get_all_credentials on-chain.
    // Here returns a stub to illustrate the API shape.
    return { KYC: false, PROPERTY: false, CIVIC: false };
  },
};

// ── GridTrade client ──────────────────────────────────────────────────────────

export const gridTrade = {
  async getOpenOffers(): Promise<EnergyOffer[]> {
    // Production: paginate through OFFER_SEQ and filter Open ones.
    // Stub for UI development:
    return [];
  },

  async listOffer(
    producerAddress: string,
    kwhAmount: bigint,
    pricePerKwh: bigint
  ): Promise<string> {
    const { assembled, server } = await buildAndSimulate(
      NETWORK_CONFIG.gridTradeContract,
      "list_offer",
      [
        new Address(producerAddress).toScVal(),
        nativeToScVal(kwhAmount, { type: "i128" }),
        nativeToScVal(pricePerKwh, { type: "i128" }),
      ],
      producerAddress
    );
    // Caller must sign via Freighter — return XDR for signing
    throw new Error(
      `SIGN_AND_SUBMIT:${assembled.toXDR("base64")}`
    );
  },

  async acceptOffer(
    buyerAddress: string,
    offerId: bigint
  ): Promise<string> {
    const { assembled } = await buildAndSimulate(
      NETWORK_CONFIG.gridTradeContract,
      "accept_offer",
      [
        new Address(buyerAddress).toScVal(),
        nativeToScVal(offerId, { type: "u64" }),
      ],
      buyerAddress
    );
    throw new Error(`SIGN_AND_SUBMIT:${assembled.toXDR("base64")}`);
  },
};

// ── GridDAO client ────────────────────────────────────────────────────────────

export const gridDao = {
  async treasuryBalance(): Promise<string> {
    // Simulate treasury_balance() read call.
    return "0";
  },

  async getProposals(): Promise<Proposal[]> {
    return [];
  },

  async getGrants(): Promise<Grant[]> {
    return [];
  },

  async createProposal(
    proposerAddress: string,
    description: string,
    recipientAddress: string,
    amount: bigint
  ): Promise<string> {
    const { assembled } = await buildAndSimulate(
      NETWORK_CONFIG.gridDaoContract,
      "create_proposal",
      [
        new Address(proposerAddress).toScVal(),
        nativeToScVal(description, { type: "string" }),
        new Address(recipientAddress).toScVal(),
        nativeToScVal(amount, { type: "i128" }),
        nativeToScVal(9_999_999, { type: "u32" }),
      ],
      proposerAddress
    );
    throw new Error(`SIGN_AND_SUBMIT:${assembled.toXDR("base64")}`);
  },

  async approveProposal(
    signerAddress: string,
    proposalId: bigint
  ): Promise<string> {
    const { assembled } = await buildAndSimulate(
      NETWORK_CONFIG.gridDaoContract,
      "approve_proposal",
      [
        new Address(signerAddress).toScVal(),
        nativeToScVal(proposalId, { type: "u64" }),
      ],
      signerAddress
    );
    throw new Error(`SIGN_AND_SUBMIT:${assembled.toXDR("base64")}`);
  },

  async executeProposal(
    executorAddress: string,
    proposalId: bigint
  ): Promise<string> {
    const { assembled } = await buildAndSimulate(
      NETWORK_CONFIG.gridDaoContract,
      "execute_proposal",
      [
        new Address(executorAddress).toScVal(),
        nativeToScVal(proposalId, { type: "u64" }),
      ],
      executorAddress
    );
    throw new Error(`SIGN_AND_SUBMIT:${assembled.toXDR("base64")}`);
  },
};
