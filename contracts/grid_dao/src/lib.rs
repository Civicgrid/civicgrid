#![no_std]

// GridDAO: Multi-Sig Treasury & Milestone-Based Streaming Grants
//
// Receives 0.5 % protocol fees from GridTrade and governs their disbursement
// via on-chain proposals (multi-sig approval) and streaming grants.
//
// Architecture:
// - Treasury holds a SAC token (native XLM or USDC).
// - Proposals require `threshold` of `signers` to approve before execution.
// - Grants stream funds milestone-by-milestone; each tranche needs DAO sign-off.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Symbol, Vec, token,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

const ADMIN: Symbol     = symbol_short!("ADMIN");
const CONFIG: Symbol    = symbol_short!("CONFIG");
const PROP_SEQ: Symbol  = symbol_short!("PROP_SEQ");
const GRANT_SEQ: Symbol = symbol_short!("GRANT_SEQ");

// ── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct DaoConfig {
    pub treasury_token: Address,
    pub signers: Vec<Address>,
    pub threshold: u32,
    /// GridTrade contract allowed to call deposit_fee.
    pub fee_collector: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Executed,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub id: u64,
    pub description: String,
    pub recipient: Address,
    pub amount: i128,
    pub deadline_ledger: u32,
    pub status: ProposalStatus,
    pub approvals: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Milestone {
    pub tranche: i128,
    pub description: String,
    pub released: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Grant {
    pub id: u64,
    pub grantee: Address,
    pub total_amount: i128,
    pub disbursed: i128,
    pub milestones: Vec<Milestone>,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct ProposalKey(pub u64);

#[contracttype]
#[derive(Clone)]
pub struct GrantKey(pub u64);

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct GridDaoContract;

#[contractimpl]
impl GridDaoContract {
    // ── Init ──────────────────────────────────────────────────────────────────

    pub fn initialize(
        env: Env,
        admin: Address,
        treasury_token: Address,
        signers: Vec<Address>,
        threshold: u32,
        fee_collector: Address,
    ) {
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }
        if threshold == 0 || threshold > signers.len() as u32 {
            panic!("invalid threshold");
        }
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(
            &CONFIG,
            &DaoConfig { treasury_token, signers, threshold, fee_collector },
        );
        env.storage().instance().set(&PROP_SEQ,  &0u64);
        env.storage().instance().set(&GRANT_SEQ, &0u64);
        env.storage()
            .instance()
            .extend_ttl(17_280 * 365, 17_280 * 365);
    }

    /// Admin may update which contract is allowed to deposit fees.
    pub fn set_fee_collector(env: Env, new_collector: Address) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        let mut cfg: DaoConfig = env.storage().instance().get(&CONFIG).unwrap();
        cfg.fee_collector = new_collector;
        env.storage().instance().set(&CONFIG, &cfg);
    }

    // ── Treasury ──────────────────────────────────────────────────────────────

    /// Called by GridTrade to forward the 0.5 % protocol fee.
    pub fn deposit_fee(env: Env, from: Address, amount: i128) {
        let cfg: DaoConfig = env.storage().instance().get(&CONFIG).unwrap();
        cfg.fee_collector.require_auth();
        let tok = token::Client::new(&env, &cfg.treasury_token);
        tok.transfer(&from, &env.current_contract_address(), &amount);
        env.events().publish(
            (symbol_short!("FEE_DEP"), from),
            (amount, env.ledger().timestamp()),
        );
    }

    pub fn treasury_balance(env: Env) -> i128 {
        let cfg: DaoConfig = env.storage().instance().get(&CONFIG).unwrap();
        token::Client::new(&env, &cfg.treasury_token)
            .balance(&env.current_contract_address())
    }

    // ── Proposals ─────────────────────────────────────────────────────────────

    /// Any signer may create a fund-transfer proposal.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        description: String,
        recipient: Address,
        amount: i128,
        deadline_ledger: u32,
    ) -> u64 {
        proposer.require_auth();
        Self::require_signer(&env, &proposer);

        let id: u64 = env.storage().instance().get(&PROP_SEQ).unwrap();
        let new_id = id + 1;
        env.storage().instance().set(&PROP_SEQ, &new_id);

        let proposal = Proposal {
            id: new_id,
            description,
            recipient,
            amount,
            deadline_ledger,
            status: ProposalStatus::Active,
            approvals: Vec::new(&env),
        };
        env.storage().persistent().set(&ProposalKey(new_id), &proposal);
        env.storage()
            .persistent()
            .extend_ttl(&ProposalKey(new_id), 17_280 * 365, 17_280 * 365);

        env.events()
            .publish((symbol_short!("NEW_PROP"), proposer), (new_id, amount));
        new_id
    }

    /// A signer casts an approval; auto-transitions to Passed at threshold.
    pub fn approve_proposal(env: Env, signer: Address, proposal_id: u64) {
        signer.require_auth();
        Self::require_signer(&env, &signer);

        let mut p: Proposal = env
            .storage()
            .persistent()
            .get(&ProposalKey(proposal_id))
            .expect("proposal not found");

        if p.status != ProposalStatus::Active {
            panic!("proposal not active");
        }
        if env.ledger().sequence() > p.deadline_ledger {
            p.status = ProposalStatus::Rejected;
            env.storage().persistent().set(&ProposalKey(proposal_id), &p);
            panic!("deadline passed");
        }
        for existing in p.approvals.iter() {
            if existing == signer {
                panic!("already approved");
            }
        }
        p.approvals.push_back(signer.clone());

        let cfg: DaoConfig = env.storage().instance().get(&CONFIG).unwrap();
        if p.approvals.len() as u32 >= cfg.threshold {
            p.status = ProposalStatus::Passed;
        }
        env.storage().persistent().set(&ProposalKey(proposal_id), &p);
        env.events()
            .publish((symbol_short!("APPROVED"), signer), proposal_id);
    }

    /// Execute a passed proposal, sending funds to recipient.
    pub fn execute_proposal(env: Env, executor: Address, proposal_id: u64) {
        executor.require_auth();
        Self::require_signer(&env, &executor);

        let mut p: Proposal = env
            .storage()
            .persistent()
            .get(&ProposalKey(proposal_id))
            .expect("proposal not found");

        if p.status != ProposalStatus::Passed {
            panic!("proposal not passed");
        }
        let cfg: DaoConfig = env.storage().instance().get(&CONFIG).unwrap();
        token::Client::new(&env, &cfg.treasury_token)
            .transfer(&env.current_contract_address(), &p.recipient, &p.amount);

        p.status = ProposalStatus::Executed;
        env.storage().persistent().set(&ProposalKey(proposal_id), &p);

        env.events().publish(
            (symbol_short!("EXEC"), executor),
            (proposal_id, p.amount, p.recipient),
        );
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Option<Proposal> {
        env.storage().persistent().get(&ProposalKey(proposal_id))
    }

    // ── Streaming Grants ──────────────────────────────────────────────────────

    /// Admin or any signer may create a streaming grant.
    pub fn create_grant(
        env: Env,
        creator: Address,
        grantee: Address,
        milestones: Vec<Milestone>,
    ) -> u64 {
        creator.require_auth();
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if creator != admin {
            Self::require_signer(&env, &creator);
        }

        let total: i128 = milestones.iter().map(|m| m.tranche).sum();
        let id: u64 = env.storage().instance().get(&GRANT_SEQ).unwrap();
        let new_id = id + 1;
        env.storage().instance().set(&GRANT_SEQ, &new_id);

        let grant = Grant {
            id: new_id,
            grantee: grantee.clone(),
            total_amount: total,
            disbursed: 0,
            milestones,
            active: true,
        };
        env.storage().persistent().set(&GrantKey(new_id), &grant);
        env.storage()
            .persistent()
            .extend_ttl(&GrantKey(new_id), 17_280 * 365, 17_280 * 365);

        env.events()
            .publish((symbol_short!("GRANT"), grantee), (new_id, total));
        new_id
    }

    /// Signer approves and releases a specific milestone tranche.
    pub fn release_milestone(
        env: Env,
        approver: Address,
        grant_id: u64,
        milestone_index: u32,
    ) {
        approver.require_auth();
        Self::require_signer(&env, &approver);

        let mut grant: Grant = env
            .storage()
            .persistent()
            .get(&GrantKey(grant_id))
            .expect("grant not found");

        if !grant.active {
            panic!("grant inactive");
        }

        let mut ms = grant
            .milestones
            .get(milestone_index)
            .expect("invalid milestone index");

        if ms.released {
            panic!("already released");
        }

        ms.released = true;
        let tranche = ms.tranche;
        grant.milestones.set(milestone_index, ms);
        grant.disbursed += tranche;

        let cfg: DaoConfig = env.storage().instance().get(&CONFIG).unwrap();
        token::Client::new(&env, &cfg.treasury_token)
            .transfer(&env.current_contract_address(), &grant.grantee, &tranche);

        if grant.milestones.iter().all(|m| m.released) {
            grant.active = false;
        }
        env.storage().persistent().set(&GrantKey(grant_id), &grant);

        env.events().publish(
            (symbol_short!("MILESTONE"), approver),
            (grant_id, milestone_index, tranche),
        );
    }

    pub fn get_grant(env: Env, grant_id: u64) -> Option<Grant> {
        env.storage().persistent().get(&GrantKey(grant_id))
    }

    pub fn get_config(env: Env) -> DaoConfig {
        env.storage().instance().get(&CONFIG).unwrap()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn require_signer(env: &Env, address: &Address) {
        let cfg: DaoConfig = env.storage().instance().get(&CONFIG).unwrap();
        for s in cfg.signers.iter() {
            if s == *address {
                return;
            }
        }
        panic!("not a DAO signer");
    }
}

#[cfg(test)]
mod test;
