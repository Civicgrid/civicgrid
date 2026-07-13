#![no_std]

// GridTrade: P2P Energy Marketplace
//
// Solar producers list kWh offers. Verified buyers (gated by CivicID) accept
// them in atomic swaps. A 0.5 % protocol fee is forwarded to GridDAO treasury.
//
// Flow:
//   1. Meter oracle calls `register_producer` + `mint_kwh` to credit a producer.
//   2. Producer calls `list_offer` specifying amount + price_per_kwh in tokens.
//   3. KYC-verified buyer calls `accept_offer` — atomic swap executes:
//        - kWh tokens move from escrow to buyer
//        - payment tokens move from buyer to producer (minus fee)
//        - fee forwarded to GridDAO via `deposit_fee`

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Symbol, token,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

const ADMIN: Symbol        = symbol_short!("ADMIN");
const CIVIC_ID: Symbol     = symbol_short!("CIVIC_ID");
const DAO_ADDR: Symbol     = symbol_short!("DAO_ADDR");
const PAY_TOKEN: Symbol    = symbol_short!("PAY_TOKEN");
const KWH_TOKEN: Symbol    = symbol_short!("KWH_TOKEN");
const OFFER_SEQ: Symbol    = symbol_short!("OFFER_SEQ");
// Fee numerator; denominator is 10_000. Default 50 = 0.5 %.
const FEE_BPS: Symbol      = symbol_short!("FEE_BPS");

// ── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OfferStatus {
    Open,
    Filled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EnergyOffer {
    pub id: u64,
    pub producer: Address,
    /// Amount of kWh tokens (in base units) being sold.
    pub kwh_amount: i128,
    /// Price per kWh in payment-token base units.
    pub price_per_kwh: i128,
    pub status: OfferStatus,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct OfferKey(pub u64);

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct GridTradeContract;

#[contractimpl]
impl GridTradeContract {
    // ── Init ──────────────────────────────────────────────────────────────────

    /// Deploy and wire up the three contract dependencies.
    pub fn initialize(
        env: Env,
        admin: Address,
        civic_id_contract: Address,
        dao_contract: Address,
        payment_token: Address,
        kwh_token: Address,
    ) {
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }
        env.storage().instance().set(&ADMIN,      &admin);
        env.storage().instance().set(&CIVIC_ID,   &civic_id_contract);
        env.storage().instance().set(&DAO_ADDR,   &dao_contract);
        env.storage().instance().set(&PAY_TOKEN,  &payment_token);
        env.storage().instance().set(&KWH_TOKEN,  &kwh_token);
        env.storage().instance().set(&FEE_BPS,    &50u32);
        env.storage().instance().set(&OFFER_SEQ,  &0u64);
        env.storage()
            .instance()
            .extend_ttl(17_280 * 365, 17_280 * 365);
    }

    /// Update fee basis points (admin only, max 200 = 2 %).
    pub fn set_fee_bps(env: Env, bps: u32) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        if bps > 200 {
            panic!("fee too high");
        }
        env.storage().instance().set(&FEE_BPS, &bps);
    }

    // ── kWh Token Management ──────────────────────────────────────────────────

    /// Meter oracle mints kWh tokens to a verified producer.
    /// In production the kwh_token is a SAC administered by the oracle.
    pub fn mint_kwh(env: Env, producer: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        Self::assert_verified(&env, &producer);

        let kwh_token: Address = env.storage().instance().get(&KWH_TOKEN).unwrap();
        let tok = token::Client::new(&env, &kwh_token);
        // The GridTrade contract must be the token admin/minter
        tok.transfer(&env.current_contract_address(), &producer, &amount);

        env.events()
            .publish((symbol_short!("MINT_KWH"), producer), amount);
    }

    // ── Marketplace ───────────────────────────────────────────────────────────

    /// Producer lists kWh tokens for sale.
    /// Tokens move into escrow (this contract) immediately.
    pub fn list_offer(
        env: Env,
        producer: Address,
        kwh_amount: i128,
        price_per_kwh: i128,
    ) -> u64 {
        producer.require_auth();
        Self::assert_verified(&env, &producer);

        if kwh_amount <= 0 || price_per_kwh <= 0 {
            panic!("invalid offer params");
        }

        // Move kWh into escrow
        let kwh_token: Address = env.storage().instance().get(&KWH_TOKEN).unwrap();
        let kwh = token::Client::new(&env, &kwh_token);
        kwh.transfer(&producer, &env.current_contract_address(), &kwh_amount);

        let id: u64 = env.storage().instance().get(&OFFER_SEQ).unwrap();
        let new_id = id + 1;
        env.storage().instance().set(&OFFER_SEQ, &new_id);

        let offer = EnergyOffer {
            id: new_id,
            producer: producer.clone(),
            kwh_amount,
            price_per_kwh,
            status: OfferStatus::Open,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&OfferKey(new_id), &offer);
        env.storage()
            .persistent()
            .extend_ttl(&OfferKey(new_id), 17_280 * 365, 17_280 * 365);

        env.events()
            .publish((symbol_short!("LIST"), producer), (new_id, kwh_amount, price_per_kwh));
        new_id
    }

    /// Cancel an open offer and return escrowed kWh to the producer.
    pub fn cancel_offer(env: Env, producer: Address, offer_id: u64) {
        producer.require_auth();

        let mut offer: EnergyOffer = env
            .storage()
            .persistent()
            .get(&OfferKey(offer_id))
            .expect("offer not found");

        if offer.producer != producer {
            panic!("not your offer");
        }
        if offer.status != OfferStatus::Open {
            panic!("offer not open");
        }

        // Return kWh from escrow
        let kwh_token: Address = env.storage().instance().get(&KWH_TOKEN).unwrap();
        let kwh = token::Client::new(&env, &kwh_token);
        kwh.transfer(&env.current_contract_address(), &producer, &offer.kwh_amount);

        offer.status = OfferStatus::Cancelled;
        env.storage().persistent().set(&OfferKey(offer_id), &offer);

        env.events()
            .publish((symbol_short!("CANCEL"), producer), offer_id);
    }

    /// KYC-verified buyer accepts an open offer — atomic swap.
    ///
    /// Steps:
    ///   1. Verify buyer's CivicID KYC status.
    ///   2. Calculate total cost and protocol fee.
    ///   3. Transfer payment from buyer → producer (net) and fee → DAO.
    ///   4. Transfer kWh from escrow → buyer.
    pub fn accept_offer(env: Env, buyer: Address, offer_id: u64) {
        buyer.require_auth();
        Self::assert_verified(&env, &buyer);

        let mut offer: EnergyOffer = env
            .storage()
            .persistent()
            .get(&OfferKey(offer_id))
            .expect("offer not found");

        if offer.status != OfferStatus::Open {
            panic!("offer not open");
        }
        if offer.producer == buyer {
            panic!("cannot buy your own offer");
        }

        let fee_bps: u32 = env.storage().instance().get(&FEE_BPS).unwrap();
        let total_cost: i128 = offer.kwh_amount * offer.price_per_kwh;
        let fee: i128 = (total_cost * fee_bps as i128) / 10_000;
        let producer_proceeds: i128 = total_cost - fee;

        let pay_token: Address = env.storage().instance().get(&PAY_TOKEN).unwrap();
        let pay = token::Client::new(&env, &pay_token);

        // Payment: buyer → producer (net of fee)
        pay.transfer(&buyer, &offer.producer, &producer_proceeds);

        // Fee: buyer → GridDAO treasury via deposit_fee
        if fee > 0 {
            let dao_addr: Address = env.storage().instance().get(&DAO_ADDR).unwrap();
            pay.transfer(&buyer, &env.current_contract_address(), &fee);

            // Forward fee to DAO — call deposit_fee on GridDAO contract
            let dao_client = grid_dao_interface::Client::new(&env, &dao_addr);
            dao_client.deposit_fee(&buyer, &fee);
        }

        // kWh: escrow → buyer
        let kwh_token: Address = env.storage().instance().get(&KWH_TOKEN).unwrap();
        let kwh = token::Client::new(&env, &kwh_token);
        kwh.transfer(&env.current_contract_address(), &buyer, &offer.kwh_amount);

        offer.status = OfferStatus::Filled;
        env.storage().persistent().set(&OfferKey(offer_id), &offer);

        env.events().publish(
            (symbol_short!("SWAP"), buyer),
            (offer_id, offer.kwh_amount, total_cost, fee),
        );
    }

    /// Fetch an offer by ID.
    pub fn get_offer(env: Env, offer_id: u64) -> Option<EnergyOffer> {
        env.storage().persistent().get(&OfferKey(offer_id))
    }

    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&FEE_BPS).unwrap()
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn assert_verified(env: &Env, address: &Address) {
        let civic_id: Address = env.storage().instance().get(&CIVIC_ID).unwrap();
        let civic = civic_id_interface::Client::new(env, &civic_id);
        if !civic.is_verified(address) {
            panic!("CivicID: KYC verification required");
        }
    }
}

// Thin cross-contract interface stubs (generated by soroban-sdk in prod via
// contractimport! macro; hand-written here for clarity).
mod civic_id_interface {
    use soroban_sdk::{contractclient, Address, Env};
    #[contractclient(name = "Client")]
    pub trait CivicIdTrait {
        fn is_verified(env: Env, holder: Address) -> bool;
    }
}

mod grid_dao_interface {
    use soroban_sdk::{contractclient, Address, Env};
    #[contractclient(name = "Client")]
    pub trait GridDaoTrait {
        fn deposit_fee(env: Env, from: Address, amount: i128);
    }
}

#[cfg(test)]
mod test;
