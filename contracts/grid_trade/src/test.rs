#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

// ---------------------------------------------------------------------------
// Minimal mock for CivicID — returns true for any registered holder
// ---------------------------------------------------------------------------
mod mock_civic_id {
    use soroban_sdk::{contract, contractimpl, Address, Env, Map, Symbol};

    #[contract]
    pub struct MockCivicId;

    #[contractimpl]
    impl MockCivicId {
        pub fn is_verified(env: Env, holder: Address) -> bool {
            env.storage()
                .persistent()
                .get::<Address, bool>(&holder)
                .unwrap_or(false)
        }

        pub fn set_verified(env: Env, holder: Address, status: bool) {
            env.storage().persistent().set(&holder, &status);
        }
    }
}

// ---------------------------------------------------------------------------
// Minimal mock for GridDAO deposit_fee
// ---------------------------------------------------------------------------
mod mock_grid_dao {
    use soroban_sdk::{contract, contractimpl, Address, Env, Symbol, symbol_short};

    #[contract]
    pub struct MockGridDao;

    #[contractimpl]
    impl MockGridDao {
        pub fn deposit_fee(_env: Env, _from: Address, _amount: i128) {
            // no-op in tests
        }
    }
}

use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::testutils::Ledger;

fn setup_env() -> (
    Env,
    Address, // admin
    Address, // civic_id
    Address, // dao
    Address, // pay_token
    Address, // kwh_token
    Address, // producer
    Address, // buyer
    GridTradeContractClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    // Register mock civic_id
    let civic_id = env.register_contract(None, mock_civic_id::MockCivicId);
    let civic_client = mock_civic_id::MockCivicIdClient::new(&env, &civic_id);

    // Register mock dao
    let dao = env.register_contract(None, mock_grid_dao::MockGridDao);

    // SAC tokens
    let admin = Address::generate(&env);
    let pay_token = env.register_stellar_asset_contract_v2(admin.clone());
    let kwh_token = env.register_stellar_asset_contract_v2(admin.clone());

    let pay_addr = pay_token.address();
    let kwh_addr = kwh_token.address();

    // Register GridTrade
    let contract_id = env.register_contract(None, GridTradeContract);
    let client = GridTradeContractClient::new(&env, &contract_id);
    client.initialize(&admin, &civic_id, &dao, &pay_addr, &kwh_addr);

    let producer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Mark both as KYC-verified
    civic_client.set_verified(&producer, &true);
    civic_client.set_verified(&buyer, &true);

    // Fund accounts
    StellarAssetClient::new(&env, &pay_addr).mint(&buyer, &1_000_000);
    StellarAssetClient::new(&env, &kwh_addr).mint(&contract_id, &1_000_000);

    (env, admin, civic_id, dao, pay_addr, kwh_addr, producer, buyer, client)
}

#[test]
fn test_initialize() {
    let (_, _, _, _, _, _, _, _, client) = setup_env();
    assert_eq!(client.get_fee_bps(), 50u32);
}

#[test]
fn test_list_and_get_offer() {
    let (env, _, _, _, _, kwh_addr, producer, _, client) = setup_env();
    // Give producer some kWh tokens
    StellarAssetClient::new(&env, &kwh_addr).mint(&producer, &500);
    let offer_id = client.list_offer(&producer, &100i128, &10i128);
    let offer = client.get_offer(&offer_id).unwrap();
    assert_eq!(offer.kwh_amount, 100);
    assert_eq!(offer.price_per_kwh, 10);
    assert_eq!(offer.status, OfferStatus::Open);
}

#[test]
fn test_cancel_offer_returns_kwh() {
    let (env, _, _, _, _, kwh_addr, producer, _, client) = setup_env();
    StellarAssetClient::new(&env, &kwh_addr).mint(&producer, &200);

    let contract_id = client.address.clone();
    let kwh = soroban_sdk::token::Client::new(&env, &kwh_addr);

    let offer_id = client.list_offer(&producer, &200i128, &5i128);
    assert_eq!(kwh.balance(&contract_id), 1_200_000); // minted 1M + 200

    client.cancel_offer(&producer, &offer_id);
    let offer = client.get_offer(&offer_id).unwrap();
    assert_eq!(offer.status, OfferStatus::Cancelled);
}

#[test]
fn test_accept_offer_atomic_swap() {
    let (env, _, _, _, pay_addr, kwh_addr, producer, buyer, client) = setup_env();
    StellarAssetClient::new(&env, &kwh_addr).mint(&producer, &100);

    let pay = soroban_sdk::token::Client::new(&env, &pay_addr);
    let kwh = soroban_sdk::token::Client::new(&env, &kwh_addr);

    let offer_id = client.list_offer(&producer, &100i128, &10i128);
    // total = 100 * 10 = 1000; fee = 5 (0.5%); producer gets 995
    client.accept_offer(&buyer, &offer_id);

    assert_eq!(kwh.balance(&buyer), 100);
    assert_eq!(pay.balance(&producer), 995);

    let offer = client.get_offer(&offer_id).unwrap();
    assert_eq!(offer.status, OfferStatus::Filled);
}

#[test]
#[should_panic(expected = "offer not open")]
fn test_double_accept_panics() {
    let (env, _, _, _, _, kwh_addr, producer, buyer, client) = setup_env();
    StellarAssetClient::new(&env, &kwh_addr).mint(&producer, &100);
    let offer_id = client.list_offer(&producer, &100i128, &10i128);
    client.accept_offer(&buyer, &offer_id);
    client.accept_offer(&buyer, &offer_id);
}

#[test]
#[should_panic(expected = "CivicID: KYC verification required")]
fn test_unverified_buyer_rejected() {
    let (env, _, civic_id, _, _, kwh_addr, producer, buyer, client) = setup_env();
    StellarAssetClient::new(&env, &kwh_addr).mint(&producer, &100);
    let offer_id = client.list_offer(&producer, &100i128, &10i128);
    // Remove buyer's verification
    mock_civic_id::MockCivicIdClient::new(&env, &civic_id).set_verified(&buyer, &false);
    client.accept_offer(&buyer, &offer_id);
}

#[test]
fn test_set_fee_bps() {
    let (_, admin, _, _, _, _, _, _, client) = setup_env();
    client.set_fee_bps(&100u32);
    assert_eq!(client.get_fee_bps(), 100u32);
}

#[test]
#[should_panic(expected = "fee too high")]
fn test_fee_bps_cap() {
    let (_, admin, _, _, _, _, _, _, client) = setup_env();
    client.set_fee_bps(&201u32);
}
