#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::StellarAssetClient,
    Address, Env, String, Vec,
};

fn make_milestone(env: &Env, tranche: i128, desc: &str) -> Milestone {
    Milestone {
        tranche,
        description: String::from_str(env, desc),
        released: false,
    }
}

fn setup() -> (
    Env,
    Address,        // admin
    Address,        // signer1
    Address,        // signer2
    Address,        // token address
    Address,        // fee_collector (mock GridTrade)
    GridDaoContractClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin    = Address::generate(&env);
    let signer1  = Address::generate(&env);
    let signer2  = Address::generate(&env);
    let collector = Address::generate(&env);

    // Deploy a SAC token for the treasury
    let tok = env.register_stellar_asset_contract_v2(admin.clone());
    let tok_addr = tok.address();

    let contract_id = env.register_contract(None, GridDaoContract);
    let client = GridDaoContractClient::new(&env, &contract_id);

    let mut signers: Vec<Address> = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());

    client.initialize(&admin, &tok_addr, &signers, &2u32, &collector);

    // Fund the treasury contract with tokens
    StellarAssetClient::new(&env, &tok_addr).mint(&contract_id, &1_000_000i128);

    (env, admin, signer1, signer2, tok_addr, collector, client)
}

// ── Treasury ──────────────────────────────────────────────────────────────────

#[test]
fn test_treasury_balance() {
    let (_, _, _, _, _, _, client) = setup();
    assert_eq!(client.treasury_balance(), 1_000_000i128);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_init_panics() {
    let (env, admin, signer1, signer2, tok_addr, collector, client) = setup();
    let mut signers = Vec::new(&env);
    signers.push_back(signer1);
    client.initialize(&admin, &tok_addr, &signers, &1u32, &collector);
}

#[test]
#[should_panic(expected = "invalid threshold")]
fn test_threshold_exceeds_signers() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tok = env.register_stellar_asset_contract_v2(admin.clone());
    let contract_id = env.register_contract(None, GridDaoContract);
    let client = GridDaoContractClient::new(&env, &contract_id);
    let mut signers = Vec::new(&env);
    signers.push_back(Address::generate(&env));
    client.initialize(
        &admin,
        &tok.address(),
        &signers,
        &5u32, // threshold > len
        &Address::generate(&env),
    );
}

// ── Proposals ─────────────────────────────────────────────────────────────────

#[test]
fn test_proposal_lifecycle() {
    let (env, _, signer1, signer2, tok_addr, _, client) = setup();
    let recipient = Address::generate(&env);
    let tok = soroban_sdk::token::Client::new(&env, &tok_addr);

    // Create proposal
    let pid = client.create_proposal(
        &signer1,
        &String::from_str(&env, "Fund solar panel for school"),
        &recipient,
        &50_000i128,
        &9_999_999u32,
    );
    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Active);

    // First approval (threshold = 2, not yet passed)
    client.approve_proposal(&signer1, &pid);
    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Active);

    // Second approval — should auto-pass
    client.approve_proposal(&signer2, &pid);
    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Passed);

    // Execute
    client.execute_proposal(&signer1, &pid);
    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Executed);

    assert_eq!(tok.balance(&recipient), 50_000i128);
}

#[test]
#[should_panic(expected = "already approved")]
fn test_double_approval_panics() {
    let (env, _, signer1, _, _, _, client) = setup();
    let recipient = Address::generate(&env);
    let pid = client.create_proposal(
        &signer1,
        &String::from_str(&env, "Test"),
        &recipient,
        &100i128,
        &9_999_999u32,
    );
    client.approve_proposal(&signer1, &pid);
    client.approve_proposal(&signer1, &pid);
}

#[test]
#[should_panic(expected = "proposal not passed")]
fn test_execute_active_proposal_panics() {
    let (env, _, signer1, _, _, _, client) = setup();
    let recipient = Address::generate(&env);
    let pid = client.create_proposal(
        &signer1,
        &String::from_str(&env, "Test"),
        &recipient,
        &100i128,
        &9_999_999u32,
    );
    client.execute_proposal(&signer1, &pid);
}

// ── Grants ────────────────────────────────────────────────────────────────────

#[test]
fn test_streaming_grant_milestones() {
    let (env, admin, signer1, signer2, tok_addr, _, client) = setup();
    let grantee = Address::generate(&env);
    let tok = soroban_sdk::token::Client::new(&env, &tok_addr);

    let mut milestones: Vec<Milestone> = Vec::new(&env);
    milestones.push_back(make_milestone(&env, 100_000, "Milestone 1: Design"));
    milestones.push_back(make_milestone(&env, 200_000, "Milestone 2: Build"));
    milestones.push_back(make_milestone(&env, 300_000, "Milestone 3: Deploy"));

    let grant_id = client.create_grant(&admin, &grantee, &milestones);

    let g = client.get_grant(&grant_id).unwrap();
    assert_eq!(g.total_amount, 600_000i128);
    assert!(g.active);
    assert_eq!(g.disbursed, 0);

    // Release milestone 0
    client.release_milestone(&signer1, &grant_id, &0u32);
    assert_eq!(tok.balance(&grantee), 100_000i128);

    let g = client.get_grant(&grant_id).unwrap();
    assert_eq!(g.disbursed, 100_000i128);
    assert!(g.active); // still active

    // Release milestones 1 and 2
    client.release_milestone(&signer1, &grant_id, &1u32);
    client.release_milestone(&signer2, &grant_id, &2u32);

    let g = client.get_grant(&grant_id).unwrap();
    assert!(!g.active); // all milestones done
    assert_eq!(g.disbursed, 600_000i128);
    assert_eq!(tok.balance(&grantee), 600_000i128);
}

#[test]
#[should_panic(expected = "already released")]
fn test_double_release_panics() {
    let (env, admin, signer1, _, _, _, client) = setup();
    let grantee = Address::generate(&env);
    let mut milestones: Vec<Milestone> = Vec::new(&env);
    milestones.push_back(make_milestone(&env, 50_000, "M1"));
    let grant_id = client.create_grant(&admin, &grantee, &milestones);
    client.release_milestone(&signer1, &grant_id, &0u32);
    client.release_milestone(&signer1, &grant_id, &0u32);
}

#[test]
#[should_panic(expected = "not a DAO signer")]
fn test_non_signer_cannot_approve() {
    let (env, _, signer1, _, _, _, client) = setup();
    let stranger = Address::generate(&env);
    let recipient = Address::generate(&env);
    let pid = client.create_proposal(
        &signer1,
        &String::from_str(&env, "Test"),
        &recipient,
        &100i128,
        &9_999_999u32,
    );
    client.approve_proposal(&stranger, &pid);
}
