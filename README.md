# CivicGrid

> **Identity, Energy, and Governance for the Decentralized Web.**

CivicGrid is a full-stack decentralized civic platform built on [Stellar](https://stellar.org) and [Soroban](https://soroban.stellar.org). It weaves three high-impact ecosystem concepts into a single cohesive monorepo — a blueprint for next-generation digital civic infrastructure.

---

## Screenshot 
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/853e01e3-0c92-49e2-b47a-7f5f80951cd5" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/bd04786d-c299-4bdb-9d4e-0f74ea1b0d7d" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/bf2be748-d669-4b09-829d-aea21320a8be" />

live demo : https://claude.ai/public/artifacts/6234291c-a20e-45e7-baed-32cf0807e0c9

## The Three Pillars

### 🪪 CivicID — Identity & Credentials
A registry of **Soulbound Tokens (SBTs)** that represent KYC status, civic credentials, and property ownership. Credentials are non-transferable, on-chain, and revocable by the issuing oracle.

- **Credential Types:** `KYC`, `Property`, `Civic`
- **Gating:** `is_verified()` is the single on-chain truth read by GridTrade before any swap
- **Issuer:** KYC Oracle (Node.js backend) calls `mint_credential` after verifying identity off-chain

### ⚡ GridTrade — P2P Energy Marketplace
Solar producers tokenize surplus kWh and sell them via atomic swaps. Participation is **gated by CivicID KYC status** — unverified wallets cannot list or buy energy.

- **Flow:** Meter Oracle mints kWh → Producer lists offer → Verified buyer accepts → Atomic swap settles
- **Protocol Fee:** 0.5 % of every swap is automatically forwarded to GridDAO treasury
- **Settlement:** kWh tokens + payment tokens swap atomically in a single Soroban transaction

### 🗳 GridDAO — Treasury & Governance
A multi-sig treasury funded entirely by GridTrade protocol fees. The DAO governs fund disbursement through on-chain proposals and milestone-based streaming grants.

- **Multi-sig:** configurable `threshold` of `signers` required to pass a proposal
- **Streaming Grants:** funds released incrementally per approved milestone
- **Self-sustaining:** no external funding needed — the energy marketplace continuously fills the treasury

---

## Monorepo Structure

```
civicgrid/
├── contracts/                    # Soroban smart contracts (Rust)
│   ├── Cargo.toml                # Workspace definition
│   ├── civic_id/
│   │   └── src/
│   │       ├── lib.rs            # SBT registry
│   │       └── test.rs           # Unit tests
│   ├── grid_trade/
│   │   └── src/
│   │       ├── lib.rs            # P2P energy marketplace
│   │       └── test.rs
│   └── grid_dao/
│       └── src/
│           ├── lib.rs            # Treasury + streaming grants
│           └── test.rs
├── frontend/                     # Next.js 15 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Landing page
│   │   │   ├── identity/page.tsx # CivicID credential dashboard
│   │   │   ├── energy/page.tsx   # GridTrade marketplace
│   │   │   └── dao/page.tsx      # Proposals, treasury, grants
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── WalletButton.tsx
│   │   │   ├── CredentialBadge.tsx
│   │   │   ├── OfferCard.tsx
│   │   │   ├── ProposalCard.tsx
│   │   │   └── GrantCard.tsx
│   │   └── lib/
│   │       ├── soroban.ts        # Typed contract clients
│   │       └── useFreighter.ts   # Freighter wallet hook
│   └── package.json
├── backend/                      # Node.js Oracle Services
│   ├── src/
│   │   ├── index.ts              # Express server entry point
│   │   ├── soroban.ts            # Shared Soroban tx helper
│   │   ├── kyc_oracle.ts         # KYC verification + credential issuance
│   │   └── meter_oracle.ts       # IoT meter simulation + kWh minting
│   ├── .env.example
│   └── package.json
├── scripts/
│   └── deploy_org.sh             # Deploys all 3 contracts + writes .env files
└── README.md
```

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | ≥ 1.79 | [rustup.rs](https://rustup.rs) |
| `wasm32` target | — | `rustup target add wasm32-unknown-unknown` |
| stellar CLI | latest | [docs](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli) |
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |

---

### 1. Clone & Install

```bash
git clone https://github.com/your-org/civicgrid
cd civicgrid

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend  && npm install && cd ..
```

### 2. Run Tests

```bash
cd contracts
cargo test
```

Expected output:
```
running 9 tests (civic_id)
running 8 tests (grid_trade)
running 8 tests (grid_dao)
test result: ok. 25 passed; 0 failed
```

### 3. Deploy to Testnet

```bash
export DEPLOYER_SECRET=S...   # Your funded testnet secret key
./scripts/deploy_org.sh testnet
```

The script will:
1. Build all three WASMs in release mode
2. Fund the deployer via Friendbot (testnet only)
3. Deploy and initialize each contract in dependency order
4. Link the contracts together (GridTrade ↔ CivicID, GridTrade → GridDAO)
5. Write `frontend/.env.local` and `backend/.env` with contract addresses

### 4. Configure the Oracle

Edit `backend/.env` and add your oracle keypair:

```bash
ORACLE_SECRET_KEY=S...   # Must be the admin of civic_id + grid_trade contracts
ORACLE_ADMIN_TOKEN=...   # Choose a strong random token for admin endpoints
```

### 5. Run the Services

```bash
# Terminal 1 — Frontend
cd frontend && npm run dev
# → http://localhost:3000

# Terminal 2 — Oracle backend
cd backend && npm run dev
# → http://localhost:4000
```

---

## Contract Reference

### civic_id

| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin)` | — | One-time setup |
| `mint_credential(holder, cred_type, metadata_uri, expires_at)` | admin | Issue an SBT |
| `revoke_credential(holder, cred_type)` | admin | Revoke an SBT |
| `is_verified(holder) → bool` | — | KYC gate used by GridTrade |
| `get_credential(holder, cred_type) → Option<Credential>` | — | Full credential record |
| `get_all_credentials(holder) → Map<Symbol, bool>` | — | All credential statuses |
| `set_admin(new_admin)` | admin | Transfer admin rights |

### grid_trade

| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin, civic_id, dao, pay_token, kwh_token)` | — | One-time setup |
| `mint_kwh(producer, amount)` | admin | Oracle credits kWh to producer |
| `list_offer(producer, kwh_amount, price_per_kwh) → u64` | producer (KYC) | Escrow kWh, create listing |
| `cancel_offer(producer, offer_id)` | producer | Return escrowed kWh |
| `accept_offer(buyer, offer_id)` | buyer (KYC) | Atomic swap, forwards fee to DAO |
| `get_offer(offer_id) → Option<EnergyOffer>` | — | Read an offer |
| `set_fee_bps(bps)` | admin | Adjust fee (max 2 %) |

### grid_dao

| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin, treasury_token, signers, threshold, fee_collector)` | — | One-time setup |
| `deposit_fee(from, amount)` | fee_collector | GridTrade deposits fees |
| `treasury_balance() → i128` | — | Current treasury balance |
| `create_proposal(proposer, description, recipient, amount, deadline) → u64` | signer | Create fund-transfer proposal |
| `approve_proposal(signer, proposal_id)` | signer | Cast approval vote |
| `execute_proposal(executor, proposal_id)` | signer | Disburse funds once passed |
| `create_grant(creator, grantee, milestones) → u64` | admin/signer | Create streaming grant |
| `release_milestone(approver, grant_id, index)` | signer | Release one milestone tranche |

---

## Oracle API Reference

### KYC Oracle — `POST /api/kyc/mint`

**Request:**
```json
{
  "address":        "G...",
  "credentialType": "Kyc",
  "proofToken":     "provider-jwt-or-any-string",
  "metadataUri":    "ipfs://Qm..."
}
```

**Response:**
```json
{ "txHash": "abc123...", "expiresAt": 1789000000 }
```

### KYC Oracle — `POST /api/kyc/revoke` _(admin)_

**Headers:** `Authorization: Bearer <ORACLE_ADMIN_TOKEN>`

**Request:** `{ "address": "G...", "credentialType": "Kyc" }`

### Meter Oracle — `POST /api/meter/register`

```json
{ "meterId": "SOLAR-001", "ownerAddress": "G...", "capacityW": 5000 }
```

### Meter Oracle — `GET /api/meter/status`

Returns all registered meters, their active state, and total kWh minted.

---

## Architecture Diagram

```
                         ┌────────────────────────────────────┐
                         │          Stellar/Soroban            │
                         │                                    │
  User Browser ──────────┤  civic_id    grid_trade  grid_dao  │
  (Freighter)            │     SBT ─────── gate ──── fee→     │
                         │              atomic swap            │
                         └────────────────────────────────────┘
                                  ▲              ▲
                          KYC Oracle        Meter Oracle
                          (mint_credential)  (mint_kwh)
                                  │              │
                         ┌────────────────────────────────────┐
                         │        Node.js Oracle Server        │
                         │  POST /api/kyc/mint                │
                         │  POST /api/meter/reading           │
                         │  GET  /api/meter/status            │
                         └────────────────────────────────────┘
                                  ▲
                         Next.js 15 Frontend
                         /identity  /energy  /dao
```

---

## Security Notes

- **Oracle key rotation:** The `ORACLE_SECRET_KEY` can be rotated by calling `civic_id::set_admin(new_admin)` from the current admin.
- **Fee cap:** GridTrade enforces a hard cap of 200 bps (2 %) via `set_fee_bps`.
- **Multi-sig:** GridDAO proposals require `threshold` approvals before execution; no single key can drain the treasury.
- **SBT revocation:** Credentials can be revoked on-chain without deleting the record, preserving audit history.
- **Expiry:** KYC credentials issued by the oracle carry a 1-year expiry; `is_verified` enforces this automatically.

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built with ♥ on Stellar · Powered by Soroban · CivicGrid — the decentralized civic layer.*
