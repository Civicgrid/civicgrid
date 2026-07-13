#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, Address, CivicIdContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CivicIdContract);
    let client = CivicIdContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, admin, client)
}

#[test]
fn test_initialize_and_admin() {
    let (_, admin, client) = setup();
    assert_eq!(client.get_admin(), admin);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
}

#[test]
fn test_mint_and_get_credential() {
    let (env, _admin, client) = setup();
    let holder = Address::generate(&env);
    let uri = String::from_str(&env, "ipfs://QmTest");

    client.mint_credential(&holder, &CredentialType::Kyc, &uri, &0u64);

    let cred = client
        .get_credential(&holder, &CredentialType::Kyc)
        .unwrap();
    assert_eq!(cred.cred_type, CredentialType::Kyc);
    assert!(!cred.revoked);
    assert_eq!(cred.expires_at, 0);
}

#[test]
fn test_is_verified_true() {
    let (env, _admin, client) = setup();
    let holder = Address::generate(&env);
    let uri = String::from_str(&env, "ipfs://QmKyc");
    client.mint_credential(&holder, &CredentialType::Kyc, &uri, &0u64);
    assert!(client.is_verified(&holder));
}

#[test]
fn test_is_verified_false_no_credential() {
    let (env, _, client) = setup();
    let stranger = Address::generate(&env);
    assert!(!client.is_verified(&stranger));
}

#[test]
fn test_revoke_invalidates_verification() {
    let (env, _admin, client) = setup();
    let holder = Address::generate(&env);
    let uri = String::from_str(&env, "ipfs://QmKyc");
    client.mint_credential(&holder, &CredentialType::Kyc, &uri, &0u64);
    assert!(client.is_verified(&holder));

    client.revoke_credential(&holder, &CredentialType::Kyc);
    assert!(!client.is_verified(&holder));
}

#[test]
fn test_expired_credential_not_verified() {
    let (env, _admin, client) = setup();
    let holder = Address::generate(&env);
    let uri = String::from_str(&env, "ipfs://QmKyc");
    // expires_at = 1 (already past ledger time 0)
    client.mint_credential(&holder, &CredentialType::Kyc, &uri, &1u64);
    // Advance ledger time past expiry
    env.ledger().with_mut(|li| li.timestamp = 100);
    assert!(!client.is_verified(&holder));
}

#[test]
fn test_multiple_credential_types() {
    let (env, _admin, client) = setup();
    let holder = Address::generate(&env);
    client.mint_credential(
        &holder,
        &CredentialType::Kyc,
        &String::from_str(&env, "ipfs://kyc"),
        &0u64,
    );
    client.mint_credential(
        &holder,
        &CredentialType::Property,
        &String::from_str(&env, "ipfs://prop"),
        &0u64,
    );

    let all = client.get_all_credentials(&holder);
    assert_eq!(all.get(symbol_short!("KYC")), Some(true));
    assert_eq!(all.get(symbol_short!("PROPERTY")), Some(true));
    assert_eq!(all.get(symbol_short!("CIVIC")), Some(false));
}

#[test]
fn test_set_admin() {
    let (env, _old_admin, client) = setup();
    let new_admin = Address::generate(&env);
    client.set_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin);
}
