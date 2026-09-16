use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use thiserror::Error;

pub const INTENT_TYPE: &str = "Intent(address account,uint256 chainId,address target,uint256 value,bytes32 dataHash,uint256 nonce,uint48 validAfter,uint48 validUntil,bytes32 priorStateRoot,bytes32 nextStateRoot,bytes32 nextMemoryRoot,bytes32 policyHash,bytes32 evidenceHash,uint32 verifierId)";
pub const POLICY_DOMAIN: &[u8] = b"ANIMA_RESEARCH_POLICY_V2";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Intent {
    pub account: String,
    pub chain_id: u64,
    pub target: String,
    pub value: String,
    pub data_hash: String,
    pub nonce: String,
    pub valid_after: u64,
    pub valid_until: u64,
    pub prior_state_root: String,
    pub next_state_root: String,
    pub next_memory_root: String,
    pub policy_hash: String,
    pub evidence_hash: String,
    pub verifier_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyWitness {
    pub now: u64,
    pub current_state_root: String,
    pub constitution_hash: String,
    pub max_value_per_action: String,
    pub last_action_at: u64,
    pub min_action_delay: u32,
    #[serde(default)]
    pub allowed_targets: Vec<String>,
    #[serde(default)]
    pub forbidden_targets: Vec<String>,
    #[serde(default)]
    pub allowed_selectors: Vec<String>,
    pub selector: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofInput {
    pub intent: Intent,
    pub witness: PolicyWitness,
    /// Actual action bytes; their hash and selector must match the committed intent.
    pub calldata: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProofJournal {
    pub accepted: bool,
    pub statement: String,
    pub decision_root: String,
    pub policy_hash: String,
    pub evidence_hash: String,
    pub nonce: String,
    pub verifier_id: u32,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PolicyError {
    #[error("malformed {0}")]
    Malformed(&'static str),
    #[error("intent is outside its validity window")]
    InvalidWindow,
    #[error("intent prior state does not match current state")]
    StateMismatch,
    #[error("intent policy hash does not match constitution")]
    PolicyMismatch,
    #[error("calldata or its selector does not match the committed action")]
    CalldataMismatch,
    #[error("value exceeds constitutional maximum")]
    ValueExceeded,
    #[error("constitutional cooldown is active")]
    Cooldown,
    #[error("target is not allowed")]
    TargetDenied,
    #[error("selector is not allowed")]
    SelectorDenied,
    #[error("required commitment is zero")]
    ZeroCommitment,
    #[error("verifier id cannot be zero")]
    ZeroVerifier,
}

pub fn evaluate(input: &ProofInput) -> Result<ProofJournal, PolicyError> {
    let intent = &input.intent;
    let witness = &input.witness;

    let account = parse_fixed::<20>(&intent.account, "account")?;
    let target = parse_fixed::<20>(&intent.target, "target")?;
    let data_hash = parse_fixed::<32>(&intent.data_hash, "dataHash")?;
    let prior_state = parse_fixed::<32>(&intent.prior_state_root, "priorStateRoot")?;
    let next_state = parse_fixed::<32>(&intent.next_state_root, "nextStateRoot")?;
    let next_memory = parse_fixed::<32>(&intent.next_memory_root, "nextMemoryRoot")?;
    let policy_hash = parse_fixed::<32>(&intent.policy_hash, "policyHash")?;
    let evidence_hash = parse_fixed::<32>(&intent.evidence_hash, "evidenceHash")?;
    let current_state = parse_fixed::<32>(&witness.current_state_root, "currentStateRoot")?;
    let constitution = parse_fixed::<32>(&witness.constitution_hash, "constitutionHash")?;
    let selector = parse_fixed::<4>(&witness.selector, "selector")?;
    let calldata = parse_bytes(&input.calldata, "calldata")?;
    let value = parse_u128(&intent.value, "value")?;
    let max_value = parse_u128(&witness.max_value_per_action, "maxValuePerAction")?;
    let nonce = parse_u128(&intent.nonce, "nonce")?;

    if intent.valid_after >= (1u64 << 48) || intent.valid_until >= (1u64 << 48) {
        return Err(PolicyError::Malformed("uint48 validity window"));
    }
    if intent.valid_until <= intent.valid_after
        || witness.now < intent.valid_after
        || witness.now > intent.valid_until
    {
        return Err(PolicyError::InvalidWindow);
    }
    if prior_state != current_state {
        return Err(PolicyError::StateMismatch);
    }
    if policy_hash != constitution || policy_commitment(witness)? != constitution {
        return Err(PolicyError::PolicyMismatch);
    }
    // Matches Solidity's selector convention for calls shorter than four bytes.
    let actual_selector = if calldata.len() < 4 { [0u8; 4] } else {
        calldata[..4].try_into().expect("four-byte slice")
    };
    if keccak(&calldata) != data_hash || selector != actual_selector {
        return Err(PolicyError::CalldataMismatch);
    }
    if value > max_value {
        return Err(PolicyError::ValueExceeded);
    }
    if witness.min_action_delay != 0
        && witness.last_action_at != 0
        && witness.now < witness.last_action_at.saturating_add(witness.min_action_delay as u64)
    {
        return Err(PolicyError::Cooldown);
    }
    if intent.verifier_id == 0 {
        return Err(PolicyError::ZeroVerifier);
    }
    if is_zero(&data_hash) || is_zero(&next_state) || is_zero(&next_memory) || is_zero(&evidence_hash) {
        return Err(PolicyError::ZeroCommitment);
    }

    let normalized_target = hex::encode(target);
    if witness
        .forbidden_targets
        .iter()
        .map(|value| normalize_hex(value))
        .any(|value| value == normalized_target)
    {
        return Err(PolicyError::TargetDenied);
    }
    if !witness.allowed_targets.is_empty()
        && !witness
            .allowed_targets
            .iter()
            .map(|value| normalize_hex(value))
            .any(|value| value == normalized_target)
    {
        return Err(PolicyError::TargetDenied);
    }
    let normalized_selector = hex::encode(selector);
    if !witness.allowed_selectors.is_empty()
        && !witness
            .allowed_selectors
            .iter()
            .map(|value| normalize_hex(value))
            .any(|value| value == normalized_selector)
    {
        return Err(PolicyError::SelectorDenied);
    }

    let statement = intent_statement(intent)?;
    let decision_root = keccak(&[
        b"IDONTFUCKINGBELIEVEIT_POLICY_DECISION_V1".as_slice(),
        statement.as_slice(),
        policy_hash.as_slice(),
        evidence_hash.as_slice(),
        account.as_slice(),
        target.as_slice(),
        selector.as_slice(),
    ]
    .concat());

    Ok(ProofJournal {
        accepted: true,
        statement: prefixed_hex(statement),
        decision_root: prefixed_hex(decision_root),
        policy_hash: prefixed_hex(policy_hash),
        evidence_hash: prefixed_hex(evidence_hash),
        nonce: nonce.to_string(),
        verifier_id: intent.verifier_id,
    })
}

/// Static ABI statement encoding for the explicitly supported numeric subset.
/// Value/nonce are u128 and chain ID u64; larger EVM values fail input parsing.
pub fn intent_statement(intent: &Intent) -> Result<[u8; 32], PolicyError> {
    if intent.valid_after >= (1u64 << 48) || intent.valid_until >= (1u64 << 48) {
        return Err(PolicyError::Malformed("uint48 validity window"));
    }
    let mut encoded = Vec::with_capacity(15 * 32);
    push_word(&mut encoded, keccak(INTENT_TYPE.as_bytes()));
    push_address(&mut encoded, parse_fixed::<20>(&intent.account, "account")?);
    push_u128(&mut encoded, intent.chain_id as u128);
    push_address(&mut encoded, parse_fixed::<20>(&intent.target, "target")?);
    push_u128(&mut encoded, parse_u128(&intent.value, "value")?);
    push_word(&mut encoded, parse_fixed::<32>(&intent.data_hash, "dataHash")?);
    push_u128(&mut encoded, parse_u128(&intent.nonce, "nonce")?);
    push_u128(&mut encoded, intent.valid_after as u128);
    push_u128(&mut encoded, intent.valid_until as u128);
    push_word(&mut encoded, parse_fixed::<32>(&intent.prior_state_root, "priorStateRoot")?);
    push_word(&mut encoded, parse_fixed::<32>(&intent.next_state_root, "nextStateRoot")?);
    push_word(&mut encoded, parse_fixed::<32>(&intent.next_memory_root, "nextMemoryRoot")?);
    push_word(&mut encoded, parse_fixed::<32>(&intent.policy_hash, "policyHash")?);
    push_word(&mut encoded, parse_fixed::<32>(&intent.evidence_hash, "evidenceHash")?);
    push_u128(&mut encoded, intent.verifier_id as u128);
    Ok(keccak(&encoded))
}

/// Versioned canonical policy commitment. Dynamic time/state facts are NOT policy.
/// Domain bytes, 32-byte big-endian value cap, 32-byte delay, then allowed targets,
/// forbidden targets and selectors; each list is sorted/deduplicated and encoded
/// as a 32-byte item count followed by fixed-width raw (20/20/4-byte) items.
pub fn policy_commitment(witness: &PolicyWitness) -> Result<[u8; 32], PolicyError> {
    let mut encoded = POLICY_DOMAIN.to_vec();
    push_u128(&mut encoded, parse_u128(&witness.max_value_per_action, "maxValuePerAction")?);
    push_u128(&mut encoded, witness.min_action_delay as u128);
    push_policy_list::<20>(&mut encoded, &witness.allowed_targets, "allowedTargets")?;
    push_policy_list::<20>(&mut encoded, &witness.forbidden_targets, "forbiddenTargets")?;
    push_policy_list::<4>(&mut encoded, &witness.allowed_selectors, "allowedSelectors")?;
    Ok(keccak(&encoded))
}

fn push_policy_list<const N: usize>(encoded: &mut Vec<u8>, values: &[String], field: &'static str) -> Result<(), PolicyError> {
    let mut items: Vec<[u8; N]> = values.iter().map(|value| parse_fixed::<N>(value, field)).collect::<Result<_, _>>()?;
    items.sort();
    items.dedup();
    push_u128(encoded, items.len() as u128);
    for item in items { encoded.extend_from_slice(&item); }
    Ok(())
}

fn parse_bytes(value: &str, field: &'static str) -> Result<Vec<u8>, PolicyError> {
    let normalized = value.strip_prefix("0x").or_else(|| value.strip_prefix("0X")).unwrap_or(value);
    hex::decode(normalized).map_err(|_| PolicyError::Malformed(field))
}

fn push_word(buffer: &mut Vec<u8>, word: [u8; 32]) {
    buffer.extend_from_slice(&word);
}

fn push_address(buffer: &mut Vec<u8>, address: [u8; 20]) {
    buffer.extend_from_slice(&[0u8; 12]);
    buffer.extend_from_slice(&address);
}

fn push_u128(buffer: &mut Vec<u8>, value: u128) {
    buffer.extend_from_slice(&[0u8; 16]);
    buffer.extend_from_slice(&value.to_be_bytes());
}

fn parse_u128(value: &str, field: &'static str) -> Result<u128, PolicyError> {
    if let Some(hex) = value.strip_prefix("0x").or_else(|| value.strip_prefix("0X")) {
        u128::from_str_radix(hex, 16).map_err(|_| PolicyError::Malformed(field))
    } else {
        value.parse::<u128>().map_err(|_| PolicyError::Malformed(field))
    }
}

fn parse_fixed<const N: usize>(value: &str, field: &'static str) -> Result<[u8; N], PolicyError> {
    let normalized = value.strip_prefix("0x").or_else(|| value.strip_prefix("0X")).unwrap_or(value);
    let decoded = hex::decode(normalized).map_err(|_| PolicyError::Malformed(field))?;
    decoded.try_into().map_err(|_| PolicyError::Malformed(field))
}

fn normalize_hex(value: &str) -> String {
    value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
        .unwrap_or(value)
        .to_ascii_lowercase()
}

fn is_zero<const N: usize>(value: &[u8; N]) -> bool {
    value.iter().all(|byte| *byte == 0)
}

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak256::new();
    hasher.update(data);
    hasher.finalize().into()
}

fn prefixed_hex<const N: usize>(value: [u8; N]) -> String {
    format!("0x{}", hex::encode(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> ProofInput {
        let mut input = ProofInput {
            calldata: "0x12345678".into(),
            intent: Intent {
                account: "0x1111111111111111111111111111111111111111".into(),
                chain_id: 1337,
                target: "0x2222222222222222222222222222222222222222".into(),
                value: "0".into(),
                data_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
                nonce: "9".into(),
                valid_after: 1_899_999_999,
                valid_until: 1_900_000_600,
                prior_state_root: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
                next_state_root: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc".into(),
                next_memory_root: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd".into(),
                policy_hash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".into(),
                evidence_hash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".into(),
                verifier_id: 1,
            },
            witness: PolicyWitness {
                now: 1_900_000_000,
                current_state_root: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
                constitution_hash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".into(),
                max_value_per_action: "0".into(),
                last_action_at: 1_899_999_000,
                min_action_delay: 30,
                allowed_targets: vec!["0x2222222222222222222222222222222222222222".into()],
                forbidden_targets: vec![],
                allowed_selectors: vec!["0x12345678".into()],
                selector: "0x12345678".into(),
            },
        };
        input.intent.data_hash = prefixed_hex(keccak(&parse_bytes(&input.calldata, "calldata").unwrap()));
        input.witness.constitution_hash = prefixed_hex(policy_commitment(&input.witness).unwrap());
        input.intent.policy_hash = input.witness.constitution_hash.clone();
        input
    }

    #[test]
    fn accepts_a_valid_policy_witness() {
        let journal = evaluate(&fixture()).expect("valid fixture");
        assert!(journal.accepted);
        assert!(journal.statement.starts_with("0x"));
        assert_ne!(journal.statement, journal.decision_root);
    }

    #[test]
    fn rejects_policy_substitution() {
        let mut input = fixture();
        input.witness.constitution_hash = "0x0101010101010101010101010101010101010101010101010101010101010101".into();
        assert_eq!(evaluate(&input), Err(PolicyError::PolicyMismatch));
    }

    #[test]
    fn rejects_replayed_or_stale_windows() {
        let mut input = fixture();
        input.witness.now = input.intent.valid_until + 1;
        assert_eq!(evaluate(&input), Err(PolicyError::InvalidWindow));
    }

    #[test]
    fn exact_statement_matches_cross_language_vector() {
        let expected = include_str!("../fixtures/statement.txt").trim();
        // Preserve the original independent JS ABI vector, separate from evaluator inputs.
        let mut input = fixture();
        input.intent.data_hash = format!("0x{}", "aa".repeat(32));
        input.intent.policy_hash = format!("0x{}", "ee".repeat(32));
        let actual = prefixed_hex(intent_statement(&input.intent).expect("hash"));
        assert_eq!(actual, expected);
    }

    #[test]
    fn rejects_permissive_policy_substitution_without_recommitting() {
        let mut input = fixture();
        input.witness.allowed_targets.clear();
        assert_eq!(evaluate(&input), Err(PolicyError::PolicyMismatch));
        let mut input = fixture();
        input.witness.max_value_per_action = "1000000000000000000".into();
        assert_eq!(evaluate(&input), Err(PolicyError::PolicyMismatch));
        let mut input = fixture();
        input.witness.min_action_delay = 0;
        assert_eq!(evaluate(&input), Err(PolicyError::PolicyMismatch));
    }

    #[test]
    fn rejects_action_preimage_and_selector_substitution() {
        let mut input = fixture();
        input.calldata = "0x87654321".into();
        assert_eq!(evaluate(&input), Err(PolicyError::CalldataMismatch));
        input.intent.data_hash = prefixed_hex(keccak(&parse_bytes(&input.calldata, "calldata").unwrap()));
        assert_eq!(evaluate(&input), Err(PolicyError::CalldataMismatch));
    }

    #[test]
    fn rejects_malformed_policy_entries_and_evm_width_overflow() {
        let mut input = fixture();
        input.witness.allowed_targets.push("garbage".into());
        assert_eq!(evaluate(&input), Err(PolicyError::Malformed("allowedTargets")));
        let mut input = fixture();
        input.intent.valid_until = 1u64 << 48;
        assert_eq!(evaluate(&input), Err(PolicyError::Malformed("uint48 validity window")));
        assert_eq!(intent_statement(&input.intent), Err(PolicyError::Malformed("uint48 validity window")));
    }

    #[test]
    fn policy_commitment_normalizes_order_duplicates_and_hex_case() {
        let mut input = fixture();
        input.witness.allowed_targets.push("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".into());
        let original = policy_commitment(&input.witness).unwrap();
        input.witness.allowed_targets.reverse();
        input.witness.allowed_targets.push("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into());
        assert_eq!(policy_commitment(&input.witness).unwrap(), original);
    }

    #[test]
    fn policy_commitment_matches_independent_javascript_vector() {
        let expected = include_str!("../fixtures/policy-v2.txt").trim();
        assert_eq!(prefixed_hex(policy_commitment(&fixture().witness).unwrap()), expected);
    }
}
