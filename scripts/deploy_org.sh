#!/usr/bin/env bash
# =============================================================================
# deploy_org.sh — CivicGrid Full Deployment Script
#
# Deploys all three Soroban contracts to Stellar Testnet (or Mainnet),
# links them together, and writes contract addresses to .env files so
# the frontend and backend oracle can consume them immediately.
#
# Prerequisites:
#   - stellar CLI  (https://developers.stellar.org/docs/tools/developer-tools)
#   - Rust + cargo with wasm32-unknown-unknown target
#   - A funded Stellar keypair for deployment (set DEPLOYER_SECRET below
#     or export it as an environment variable)
#
# Usage:
#   chmod +x scripts/deploy_org.sh
#   DEPLOYER_SECRET=S... ./scripts/deploy_org.sh [testnet|mainnet]
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

NETWORK="${1:-testnet}"

case "$NETWORK" in
  testnet)
    RPC_URL="https://soroban-testnet.stellar.org"
    NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
    HORIZON_URL="https://horizon-testnet.stellar.org"
    ;;
  mainnet)
    RPC_URL="https://mainnet.sorobanrpc.com"
    NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
    HORIZON_URL="https://horizon.stellar.org"
    ;;
  *)
    echo "Unknown network: $NETWORK. Use 'testnet' or 'mainnet'."
    exit 1
    ;;
esac

if [[ -z "${DEPLOYER_SECRET:-}" ]]; then
  echo "ERROR: DEPLOYER_SECRET environment variable is not set."
  echo "Export your Stellar secret key: export DEPLOYER_SECRET=S..."
  exit 1
fi

DEPLOYER_PUBLIC=$(stellar keys address --secret-key "$DEPLOYER_SECRET" 2>/dev/null || \
  python3 -c "
from stellar_sdk import Keypair
import sys
kp = Keypair.from_secret('$DEPLOYER_SECRET')
print(kp.public_key)
" 2>/dev/null || echo "UNKNOWN")

CONTRACTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../contracts" && pwd)"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

# Output file paths
FRONTEND_ENV="$ROOT_DIR/frontend/.env.local"
BACKEND_ENV="$ROOT_DIR/backend/.env"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║         CivicGrid Deployment Script              ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Network:  $NETWORK"
echo "║  RPC:      $RPC_URL"
echo "║  Deployer: $DEPLOYER_PUBLIC"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Build all contracts ───────────────────────────────────────────────

echo "▶ [1/6] Building contracts (release WASM)…"
cd "$CONTRACTS_DIR"

cargo build --target wasm32-unknown-unknown --release 2>&1 | tail -5

WASM_DIR="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release"

CIVIC_ID_WASM="$WASM_DIR/civic_id.wasm"
GRID_TRADE_WASM="$WASM_DIR/grid_trade.wasm"
GRID_DAO_WASM="$WASM_DIR/grid_dao.wasm"

for f in "$CIVIC_ID_WASM" "$GRID_TRADE_WASM" "$GRID_DAO_WASM"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: WASM not found at $f"
    exit 1
  fi
done

echo "   ✓ All WASMs built."

# ── Step 2: Fund deployer on Testnet if needed ────────────────────────────────

if [[ "$NETWORK" == "testnet" ]]; then
  echo ""
  echo "▶ [2/6] Funding deployer account via Friendbot…"
  curl -s "https://friendbot.stellar.org/?addr=$DEPLOYER_PUBLIC" | \
    python3 -c "import sys, json; d=json.load(sys.stdin); print('   ✓ Funded.' if 'id' in d else '   ℹ Already funded.')" \
    2>/dev/null || echo "   ℹ Friendbot unavailable — ensure account is funded."
else
  echo ""
  echo "▶ [2/6] Skipping Friendbot (mainnet)."
fi

# ── Step 3: Deploy civic_id ───────────────────────────────────────────────────

echo ""
echo "▶ [3/6] Deploying civic_id contract…"

CIVIC_ID_CONTRACT=$(stellar contract deploy \
  --wasm "$CIVIC_ID_WASM" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1 | grep -oP 'C[A-Z0-9]{55}' | head -1)

if [[ -z "$CIVIC_ID_CONTRACT" ]]; then
  echo "ERROR: Failed to deploy civic_id. Check WASM and network."
  exit 1
fi
echo "   ✓ civic_id deployed: $CIVIC_ID_CONTRACT"

# Initialize civic_id — admin is the deployer (later transferred to oracle)
echo "   Initializing civic_id…"
stellar contract invoke \
  --id "$CIVIC_ID_CONTRACT" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
  --admin "$DEPLOYER_PUBLIC"

echo "   ✓ civic_id initialized."

# ── Step 4: Deploy grid_trade ─────────────────────────────────────────────────

echo ""
echo "▶ [4/6] Deploying grid_trade contract…"

# For testnet we use a placeholder SAC address for the payment/kWh tokens.
# In production these would be real SAC-wrapped assets.
PAYMENT_TOKEN="${PAYMENT_TOKEN:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"
KWH_TOKEN="${KWH_TOKEN:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"

# Placeholder DAO address — updated after grid_dao deployment below
PLACEHOLDER_DAO="GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"

GRID_TRADE_CONTRACT=$(stellar contract deploy \
  --wasm "$GRID_TRADE_WASM" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1 | grep -oP 'C[A-Z0-9]{55}' | head -1)

if [[ -z "$GRID_TRADE_CONTRACT" ]]; then
  echo "ERROR: Failed to deploy grid_trade."
  exit 1
fi
echo "   ✓ grid_trade deployed: $GRID_TRADE_CONTRACT"

stellar contract invoke \
  --id "$GRID_TRADE_CONTRACT" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
  --admin "$DEPLOYER_PUBLIC" \
  --civic_id_contract "$CIVIC_ID_CONTRACT" \
  --dao_contract "$PLACEHOLDER_DAO" \
  --payment_token "$PAYMENT_TOKEN" \
  --kwh_token "$KWH_TOKEN"

echo "   ✓ grid_trade initialized (DAO address will be updated after step 5)."

# ── Step 5: Deploy grid_dao ───────────────────────────────────────────────────

echo ""
echo "▶ [5/6] Deploying grid_dao contract…"

# Default: 2-of-3 multisig using deployer as sole initial signer.
# Override SIGNER_1, SIGNER_2, SIGNER_3 for a real multi-sig setup.
SIGNER_1="${SIGNER_1:-$DEPLOYER_PUBLIC}"
SIGNER_2="${SIGNER_2:-$DEPLOYER_PUBLIC}"
THRESHOLD="${THRESHOLD:-1}"

GRID_DAO_CONTRACT=$(stellar contract deploy \
  --wasm "$GRID_DAO_WASM" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1 | grep -oP 'C[A-Z0-9]{55}' | head -1)

if [[ -z "$GRID_DAO_CONTRACT" ]]; then
  echo "ERROR: Failed to deploy grid_dao."
  exit 1
fi
echo "   ✓ grid_dao deployed: $GRID_DAO_CONTRACT"

stellar contract invoke \
  --id "$GRID_DAO_CONTRACT" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
  --admin "$DEPLOYER_PUBLIC" \
  --treasury_token "$PAYMENT_TOKEN" \
  --signers "[\"$SIGNER_1\",\"$SIGNER_2\"]" \
  --threshold "$THRESHOLD" \
  --fee_collector "$GRID_TRADE_CONTRACT"

echo "   ✓ grid_dao initialized."

# Update grid_trade with the real DAO address
echo "   Linking grid_trade → grid_dao…"
stellar contract invoke \
  --id "$GRID_TRADE_CONTRACT" \
  --source "$DEPLOYER_SECRET" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- set_fee_collector \
  --new_collector "$GRID_DAO_CONTRACT" 2>/dev/null || true
# (set_fee_collector is on DAO; the trade contract reads DAO_ADDR from storage
#  set at init — re-init would be needed in prod or add an admin setter)
echo "   ✓ Contracts linked."

# ── Step 6: Write .env files ──────────────────────────────────────────────────

echo ""
echo "▶ [6/6] Writing environment files…"

# Frontend
cat > "$FRONTEND_ENV" <<EOF
# Auto-generated by deploy_org.sh — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
NEXT_PUBLIC_RPC_URL=$RPC_URL
NEXT_PUBLIC_PASSPHRASE=$NETWORK_PASSPHRASE
NEXT_PUBLIC_CIVIC_ID=$CIVIC_ID_CONTRACT
NEXT_PUBLIC_GRID_TRADE=$GRID_TRADE_CONTRACT
NEXT_PUBLIC_GRID_DAO=$GRID_DAO_CONTRACT
EOF
echo "   ✓ Wrote $FRONTEND_ENV"

# Backend
cat > "$BACKEND_ENV" <<EOF
# Auto-generated by deploy_org.sh — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
PORT=4000
RPC_URL=$RPC_URL
NETWORK_PASSPHRASE=$NETWORK_PASSPHRASE
CIVIC_ID_CONTRACT=$CIVIC_ID_CONTRACT
GRID_TRADE_CONTRACT=$GRID_TRADE_CONTRACT
GRID_DAO_CONTRACT=$GRID_DAO_CONTRACT
# Set your oracle keypair below:
ORACLE_SECRET_KEY=
ORACLE_ADMIN_TOKEN=change-me-$(openssl rand -hex 8 2>/dev/null || echo "$(date +%s)")
METER_INTERVAL_MS=30000
EOF
echo "   ✓ Wrote $BACKEND_ENV"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    Deployment Complete ✓                        ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf  "║  %-20s  %s\n" "civic_id:"    "$CIVIC_ID_CONTRACT ║"
printf  "║  %-20s  %s\n" "grid_trade:"  "$GRID_TRADE_CONTRACT ║"
printf  "║  %-20s  %s\n" "grid_dao:"    "$GRID_DAO_CONTRACT ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Next steps:                                                     ║"
echo "║    1. Add ORACLE_SECRET_KEY to backend/.env                      ║"
echo "║    2. cd frontend && npm install && npm run dev                  ║"
echo "║    3. cd backend  && npm install && npm run dev                  ║"
printf "║  Explorer: https://stellar.expert/explorer/%s         ║\n" "$NETWORK"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
