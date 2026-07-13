#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Map, String, Symbol,
};

const ADMIN: Symbol = symbol_short!("ADMIN");

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CredentialType {
    Kyc,
    Property,
    Civic,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Credential {
    pub cred_type: CredentialType,
    pub metadata_uri: String,
    pub expires_at: u64,
    pub revoked: bool,
    pub issued_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CredentialKey {
    pub holder: Address,
    pub cred_type: CredentialType,
}

#[contract]
pub struct CivicIdContract;

#[contractimpl]
impl CivicIdContract {
    /// Initialise the registry. Must be called once after deployment.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }
        env.storage().instance().set(&ADMIN, &admin);
        env.storage()
            .instance()
            .extend_ttl(17_280 * 365, 17_280 * 365);
    }

    /// Transfer admin rights (e.g. to the KYC oracle contract).
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &new_admin);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&ADMIN).unwrap()
    }

    /// Mint (issue) a soulbound credential to `holder`.
    /// Only the admin (KYC oracle) may call this.
    pub fn mint_credential(
        env: Env,
        holder: Address,
        cred_type: CredentialType,
        metadata_uri: String,
        expires_at: u64,
    ) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();

        let key = CredentialKey {
            holder: holder.clone(),
            cred_type: cred_type.clone(),
        };
        let credential = Credential {
            cred_type: cred_type.clone(),
            metadata_uri,
            expires_at,
            revoked: false,
            issued_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &credential);
        env.storage()
            .persistent()
            .extend_ttl(&key, 17_280 * 365, 17_280 * 365);

        env.events().publish(
            (symbol_short!("MINT"), holder),
            (cred_type, env.ledger().timestamp()),
        );
    }

    /// Revoke a credential. Record is preserved but flagged revoked.
    pub fn revoke_credential(env: Env, holder: Address, cred_type: CredentialType) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();

        let key = CredentialKey {
            holder: holder.clone(),
            cred_type: cred_type.clone(),
        };
        let mut cred: Credential = env
            .storage()
            .persistent()
            .get(&key)
            .expect("credential not found");

        cred.revoked = true;
        env.storage().persistent().set(&key, &cred);

        env.events().publish(
            (symbol_short!("REVOKE"), holder),
            (cred_type, env.ledger().timestamp()),
        );
    }

    /// Fetch the full credential record for (holder, cred_type).
    pub fn get_credential(
        env: Env,
        holder: Address,
        cred_type: CredentialType,
    ) -> Option<Credential> {
        let key = CredentialKey { holder, cred_type };
        env.storage().persistent().get(&key)
    }

    /// Primary gating function used by GridTrade.
    /// Returns true iff the holder has a valid, non-expired, non-revoked KYC credential.
    pub fn is_verified(env: Env, holder: Address) -> bool {
        let key = CredentialKey {
            holder,
            cred_type: CredentialType::Kyc,
        };
        match env
            .storage()
            .persistent()
            .get::<CredentialKey, Credential>(&key)
        {
            None => false,
            Some(cred) => {
                if cred.revoked {
                    return false;
                }
                if cred.expires_at != 0 && env.ledger().timestamp() > cred.expires_at {
                    return false;
                }
                true
            }
        }
    }

    /// Returns a map of credential type -> active status for the given holder.
    pub fn get_all_credentials(env: Env, holder: Address) -> Map<Symbol, bool> {
        let mut result: Map<Symbol, bool> = Map::new(&env);
        let checks: [(&Symbol, CredentialType); 3] = [
            (&symbol_short!("KYC"),      CredentialType::Kyc),
            (&symbol_short!("PROPERTY"), CredentialType::Property),
            (&symbol_short!("CIVIC"),    CredentialType::Civic),
        ];
        for (label, cred_type) in checks.into_iter() {
            let key = CredentialKey {
                holder: holder.clone(),
                cred_type: cred_type.clone(),
            };
            let active = match env
                .storage()
                .persistent()
                .get::<CredentialKey, Credential>(&key)
            {
                None => false,
                Some(c) => {
                    !c.revoked
                        && (c.expires_at == 0 || env.ledger().timestamp() <= c.expires_at)
                }
            };
            result.set(label.clone(), active);
        }
        result
    }
}

#[cfg(test)]
mod test;
