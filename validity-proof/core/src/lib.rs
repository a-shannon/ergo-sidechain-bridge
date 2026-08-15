//! Strict verification of native GRANDPA finality proofs used by bridge checkpoints.
//!
//! This crate implements the pinned Frontier/GRANDPA compatibility profile. Its sealed block and
//! header traits preserve the existing verifier API without presenting these bytes as a generic
//! validity-proof format. Callers must independently authenticate the authority set, set ID, and
//! every transition from a trusted starting point. A valid result here is not an Ergo anchor or a
//! complete Gate 5 proof.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

extern crate alloc;

use alloc::{
    collections::{BTreeMap, BTreeSet},
    string::{String, ToString},
    vec::Vec,
};
use blake2::{digest::consts::U32, Blake2b, Digest as BlakeDigest};
use core::marker::PhantomData;
use ed25519_zebra::{Signature, VerificationKey};
use finality_grandpa::{voter_set::VoterSet, BlockNumberOps};
use num_traits::{CheckedAdd, One, Zero};
use scale_codec::{Decode, DecodeAll, Encode};
use thiserror::Error;

mod sealed {
    pub trait Header {}
    pub trait Block {}
}

/// Exact 32-byte hash used by the current Frontier/GRANDPA compatibility profile.
#[derive(Clone, Copy, Debug, Default, Encode, Decode, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct FrontierHash(pub [u8; 32]);

impl FrontierHash {
    /// Return the all-zero hash.
    pub const fn zero() -> Self {
        Self([0; 32])
    }

    /// Return a hash filled with one repeated byte.
    pub const fn repeat_byte(byte: u8) -> Self {
        Self([byte; 32])
    }
}

impl AsRef<[u8]> for FrontierHash {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl From<[u8; 32]> for FrontierHash {
    fn from(value: [u8; 32]) -> Self {
        Self(value)
    }
}

impl From<FrontierHash> for [u8; 32] {
    fn from(value: FrontierHash) -> Self {
        value.0
    }
}

/// Substrate-compatible digest item used by the pinned Frontier header profile.
#[derive(Clone, Debug, Encode, Decode, PartialEq, Eq)]
pub enum FrontierDigestItem {
    /// Consensus-engine input emitted before runtime execution.
    #[codec(index = 6)]
    PreRuntime([u8; 4], Vec<u8>),
    /// Runtime-to-consensus-engine message.
    #[codec(index = 4)]
    Consensus([u8; 4], Vec<u8>),
    /// Consensus seal.
    #[codec(index = 5)]
    Seal([u8; 4], Vec<u8>),
    /// Opaque unsupported digest material.
    #[codec(index = 0)]
    Other(Vec<u8>),
    /// Runtime code or heap configuration changed.
    #[codec(index = 8)]
    RuntimeEnvironmentUpdated,
}

impl FrontierDigestItem {
    fn as_consensus(&self) -> Option<([u8; 4], &[u8])> {
        match self {
            Self::Consensus(engine, payload) => Some((*engine, payload)),
            _ => None,
        }
    }
}

/// Ordered digest carried by the current Frontier header profile.
#[derive(Clone, Debug, Default, Encode, Decode, PartialEq, Eq)]
pub struct FrontierDigest {
    /// Digest entries in canonical header order.
    pub logs: Vec<FrontierDigestItem>,
}

impl FrontierDigest {
    /// Return all digest entries.
    pub fn logs(&self) -> &[FrontierDigestItem] {
        &self.logs
    }
}

/// Sealed header abstraction for the current Frontier/GRANDPA compatibility profile.
pub trait HeaderT:
    sealed::Header + Clone + core::fmt::Debug + Decode + Encode + PartialEq + Eq
{
    /// Header hash type.
    type Hash: Copy + Clone + core::fmt::Debug + Decode + Encode + PartialEq + Eq + PartialOrd + Ord;
    /// Header number type.
    type Number: BlockNumberOps
        + CheckedAdd
        + One
        + Zero
        + Decode
        + Encode
        + Copy
        + core::fmt::Debug
        + PartialOrd
        + Ord;

    /// Return the block number.
    fn number(&self) -> &Self::Number;
    /// Return the parent hash.
    fn parent_hash(&self) -> &Self::Hash;
    /// Return the digest.
    fn digest(&self) -> &FrontierDigest;
    /// Return Blake2b-256 of the canonical SCALE header.
    fn hash(&self) -> Self::Hash;
}

/// Exact Substrate generic header profile used by the pinned Frontier runtime.
#[derive(Clone, Debug, Encode, Decode, PartialEq, Eq)]
pub struct FrontierHeader {
    /// Parent block hash.
    pub parent_hash: FrontierHash,
    /// Compact SCALE block number.
    #[codec(compact)]
    pub number: u32,
    /// State trie root.
    pub state_root: FrontierHash,
    /// Extrinsics trie root.
    pub extrinsics_root: FrontierHash,
    /// Consensus and runtime digest entries.
    pub digest: FrontierDigest,
}

impl FrontierHeader {
    /// Construct a header using Substrate's canonical argument order.
    pub fn new(
        number: u32,
        extrinsics_root: FrontierHash,
        state_root: FrontierHash,
        parent_hash: FrontierHash,
        digest: FrontierDigest,
    ) -> Self {
        Self {
            parent_hash,
            number,
            state_root,
            extrinsics_root,
            digest,
        }
    }

    /// Return Blake2b-256 of the canonical SCALE header.
    pub fn hash(&self) -> FrontierHash {
        type Blake2b256 = Blake2b<U32>;

        let digest = Blake2b256::digest(self.encode());
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&digest);
        FrontierHash(hash)
    }

    /// Return the state trie root.
    pub fn state_root(&self) -> &FrontierHash {
        &self.state_root
    }

    /// Return the extrinsics trie root.
    pub fn extrinsics_root(&self) -> &FrontierHash {
        &self.extrinsics_root
    }
}

impl sealed::Header for FrontierHeader {}

impl HeaderT for FrontierHeader {
    type Hash = FrontierHash;
    type Number = u32;

    fn number(&self) -> &Self::Number {
        &self.number
    }

    fn parent_hash(&self) -> &Self::Hash {
        &self.parent_hash
    }

    fn digest(&self) -> &FrontierDigest {
        &self.digest
    }

    fn hash(&self) -> Self::Hash {
        self.hash()
    }
}

/// Sealed block abstraction retained for compatibility with the existing verifier API.
pub trait BlockT: sealed::Block + Clone + core::fmt::Debug + PartialEq + Eq {
    /// Header type.
    type Header: HeaderT<Hash = Self::Hash>;
    /// Hash type.
    type Hash: Copy + Clone + core::fmt::Debug + Decode + Encode + PartialEq + Eq + PartialOrd + Ord;
}

/// Current Frontier/GRANDPA source profile.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FrontierGrandpaBlock;

impl sealed::Block for FrontierGrandpaBlock {}

impl BlockT for FrontierGrandpaBlock {
    type Header = FrontierHeader;
    type Hash = FrontierHash;
}

/// Block number associated with a sealed compatibility-profile block.
pub type NumberFor<Block> = <<Block as BlockT>::Header as HeaderT>::Number;

/// GRANDPA authority public key bytes.
pub type AuthorityId = [u8; 32];
/// GRANDPA Ed25519 signature bytes.
pub type AuthoritySignature = [u8; 64];
/// GRANDPA authority list and weights.
pub type AuthorityList = Vec<(AuthorityId, u64)>;
/// Monotonic GRANDPA authority-set identifier.
pub type SetId = u64;
/// GRANDPA consensus-engine digest identifier.
pub const GRANDPA_ENGINE_ID: [u8; 4] = *b"FRNK";

/// Scheduled GRANDPA authority-set transition.
#[derive(Clone, Debug, Decode, Encode, PartialEq, Eq)]
pub struct ScheduledChange<N> {
    /// Next authority list and weights.
    pub next_authorities: AuthorityList,
    /// Number of blocks before activation.
    pub delay: N,
}

/// GRANDPA consensus-log format used in Frontier header digests.
#[derive(Clone, Debug, Decode, Encode, PartialEq, Eq)]
pub enum ConsensusLog<N> {
    /// Standard scheduled authority change.
    #[codec(index = 1)]
    ScheduledChange(ScheduledChange<N>),
    /// Forced authority change with median and activation delay.
    #[codec(index = 2)]
    ForcedChange(N, ScheduledChange<N>),
    /// Disable one authority until the next change.
    #[codec(index = 3)]
    OnDisabled(u64),
    /// Pause voting after the delay.
    #[codec(index = 4)]
    Pause(N),
    /// Resume voting after the delay.
    #[codec(index = 5)]
    Resume(N),
}

/// GRANDPA message specialized to a sealed compatibility-profile block.
pub type GrandpaMessage<Block> =
    finality_grandpa::Message<<Block as BlockT>::Hash, NumberFor<Block>>;

/// Primitive canonical GRANDPA justification bytes.
#[derive(Clone, Decode, Encode, PartialEq, Eq)]
#[cfg_attr(feature = "std", derive(Debug))]
pub struct PrimitiveGrandpaJustification<Header: HeaderT> {
    /// GRANDPA round number.
    pub round: u64,
    /// Signed commit.
    pub commit:
        finality_grandpa::Commit<Header::Hash, Header::Number, AuthoritySignature, AuthorityId>,
    /// Headers proving ancestry from precommit targets to the commit base.
    pub votes_ancestries: Vec<Header>,
}

/// Canonical SCALE response returned by `grandpa_proveFinality`.
///
/// Field order is consensus-facing: finalized block hash, encoded justification, then the exact
/// descendant-header span from the requested block to the finalized target.
#[derive(Clone, Debug, Decode, Encode, PartialEq, Eq)]
pub struct FinalityProof<Header: HeaderT> {
    /// Finalized block hash authenticated by the embedded justification.
    pub block: Header::Hash,
    /// Canonical SCALE-encoded GRANDPA justification.
    pub justification: Vec<u8>,
    /// Headers in `(requested; finalized]` order.
    pub unknown_headers: Vec<Header>,
}

/// Canonical GRANDPA justification wrapper retaining the historical block-typed API.
///
/// The marker encodes to zero bytes, so this has exactly the same SCALE bytes as
/// `PrimitiveGrandpaJustification<Block::Header>`.
#[derive(Clone, Decode, Encode, PartialEq, Eq)]
#[cfg_attr(feature = "std", derive(Debug))]
pub struct GrandpaJustification<Block: BlockT> {
    /// Primitive GRANDPA justification with round, commit, and vote ancestry in canonical order.
    pub justification: PrimitiveGrandpaJustification<Block::Header>,
    _block: PhantomData<Block>,
}

impl<Block: BlockT> From<PrimitiveGrandpaJustification<Block::Header>>
    for GrandpaJustification<Block>
{
    fn from(justification: PrimitiveGrandpaJustification<Block::Header>) -> Self {
        Self {
            justification,
            _block: PhantomData,
        }
    }
}

/// A reason a decoded GRANDPA justification failed cryptographic or ancestry verification.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GrandpaJustificationError {
    /// The supplied authority list cannot form a GRANDPA voter set.
    #[error("invalid GRANDPA authority set")]
    InvalidAuthoritySet,
    /// The commit does not reach threshold or does not resolve to its declared target.
    #[error("invalid GRANDPA commit")]
    InvalidCommit,
    /// A precommit signature is invalid for its declared authority, round, and set ID.
    #[error("invalid GRANDPA precommit signature")]
    InvalidSignature,
    /// A precommit target cannot be connected to the commit base by the supplied headers.
    #[error("invalid GRANDPA precommit ancestry")]
    InvalidAncestry,
    /// The justification contains ancestry headers not consumed by a precommit route.
    #[error("GRANDPA justification contains unused ancestry headers")]
    UnusedAncestry,
}

struct AncestryChain<Block: BlockT> {
    by_hash: BTreeMap<Block::Hash, Block::Header>,
}

impl<Block: BlockT> AncestryChain<Block> {
    fn new(headers: &[Block::Header]) -> Self {
        Self {
            by_hash: headers
                .iter()
                .cloned()
                .map(|header| (header.hash(), header))
                .collect(),
        }
    }
}

impl<Block: BlockT> finality_grandpa::Chain<Block::Hash, NumberFor<Block>> for AncestryChain<Block>
where
    NumberFor<Block>: BlockNumberOps,
{
    fn ancestry(
        &self,
        base: Block::Hash,
        block: Block::Hash,
    ) -> Result<Vec<Block::Hash>, finality_grandpa::Error> {
        let mut route = Vec::new();
        let mut current = block;
        while current != base {
            if route.len() >= self.by_hash.len() {
                return Err(finality_grandpa::Error::NotDescendent);
            }
            let header = self
                .by_hash
                .get(&current)
                .ok_or(finality_grandpa::Error::NotDescendent)?;
            current = *header.parent_hash();
            route.push(current);
        }
        route.pop();
        Ok(route)
    }
}

impl<Block: BlockT> GrandpaJustification<Block>
where
    NumberFor<Block>: BlockNumberOps,
{
    /// Return the signed target as `(number, hash)`.
    pub fn target(&self) -> (NumberFor<Block>, Block::Hash) {
        (
            self.justification.commit.target_number,
            self.justification.commit.target_hash,
        )
    }

    /// Verify threshold, every precommit signature, ancestry, and exact ancestry consumption.
    pub fn verify(
        &self,
        set_id: SetId,
        authorities: &AuthorityList,
    ) -> Result<(), GrandpaJustificationError> {
        use finality_grandpa::Chain;

        let voters = VoterSet::new(authorities.iter().cloned())
            .ok_or(GrandpaJustificationError::InvalidAuthoritySet)?;
        let chain = AncestryChain::<Block>::new(&self.justification.votes_ancestries);
        let validation =
            finality_grandpa::validate_commit(&self.justification.commit, &voters, &chain)
                .map_err(|_| GrandpaJustificationError::InvalidCommit)?;
        if !validation.is_valid() {
            return Err(GrandpaJustificationError::InvalidCommit);
        }

        let base_hash = self
            .justification
            .commit
            .precommits
            .iter()
            .min_by_key(|signed| signed.precommit.target_number)
            .map(|signed| signed.precommit.target_hash)
            .ok_or(GrandpaJustificationError::InvalidCommit)?;
        let mut visited = BTreeSet::new();
        for signed in &self.justification.commit.precommits {
            let message: GrandpaMessage<Block> =
                finality_grandpa::Message::Precommit(signed.precommit.clone());
            let payload = (message, self.justification.round, set_id).encode();
            if !verify_zip215(&signed.id, &signed.signature, &payload) {
                return Err(GrandpaJustificationError::InvalidSignature);
            }

            if signed.precommit.target_hash != base_hash {
                visited.insert(signed.precommit.target_hash);
                for hash in chain
                    .ancestry(base_hash, signed.precommit.target_hash)
                    .map_err(|_| GrandpaJustificationError::InvalidAncestry)?
                {
                    visited.insert(hash);
                }
            }
        }

        let supplied: BTreeSet<_> = self
            .justification
            .votes_ancestries
            .iter()
            .map(HeaderT::hash)
            .collect();
        if supplied.len() != self.justification.votes_ancestries.len() || visited != supplied {
            return Err(GrandpaJustificationError::UnusedAncestry);
        }

        Ok(())
    }
}

fn verify_zip215(authority: &AuthorityId, signature: &AuthoritySignature, message: &[u8]) -> bool {
    let Ok(public) = VerificationKey::try_from(authority.as_slice()) else {
        return false;
    };
    let Ok(signature) = Signature::try_from(signature.as_slice()) else {
        return false;
    };
    public.verify(&signature, message).is_ok()
}

fn find_scheduled_change<Block: BlockT>(
    header: &Block::Header,
) -> Option<ScheduledChange<NumberFor<Block>>> {
    header.digest().logs().iter().find_map(|item| {
        let (engine, mut payload) = item.as_consensus()?;
        if engine != GRANDPA_ENGINE_ID {
            return None;
        }
        match ConsensusLog::<NumberFor<Block>>::decode(&mut payload).ok()? {
            ConsensusLog::ScheduledChange(change) => Some(change),
            _ => None,
        }
    })
}

fn find_forced_change<Block: BlockT>(
    header: &Block::Header,
) -> Option<(NumberFor<Block>, ScheduledChange<NumberFor<Block>>)> {
    header.digest().logs().iter().find_map(|item| {
        let (engine, mut payload) = item.as_consensus()?;
        if engine != GRANDPA_ENGINE_ID {
            return None;
        }
        match ConsensusLog::<NumberFor<Block>>::decode(&mut payload).ok()? {
            ConsensusLog::ForcedChange(median, change) => Some((median, change)),
            _ => None,
        }
    })
}

/// Maximum accepted encoded proof size.
pub const MAX_FINALITY_PROOF_BYTES: usize = 4 * 1024 * 1024;
/// Maximum accepted `(requested; finalized]` header span.
pub const MAX_UNKNOWN_HEADERS: usize = 4_096;
/// Maximum accepted encoded GRANDPA authority-transition proof size.
pub const MAX_AUTHORITY_TRANSITION_PROOF_BYTES: usize = 8 * 1024 * 1024;
/// Maximum accepted authority-transition fragments in one proof chunk.
pub const MAX_AUTHORITY_TRANSITION_FRAGMENTS: usize = 4_096;
/// Maximum contiguous headers accepted to bind one transition chunk to its trusted checkpoint.
pub const MAX_AUTHORITY_TRANSITION_ANCESTRY_HEADERS: usize = 4_096;
/// Maximum GRANDPA authorities supported by the pinned Frontier runtime.
pub const MAX_GRANDPA_AUTHORITIES: usize = 32;

/// A reason a GRANDPA finality proof was rejected.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum BridgeFinalityProofError {
    /// The untrusted proof exceeds the byte limit.
    #[error("GRANDPA finality proof exceeds the {max} byte limit: {actual}")]
    ProofTooLarge {
        /// Received proof size.
        actual: usize,
        /// Configured maximum size.
        max: usize,
    },
    /// The outer SCALE object is malformed or has trailing bytes.
    #[error("failed to decode the canonical GRANDPA finality proof")]
    ProofDecode,
    /// The untrusted proof includes too many headers.
    #[error("GRANDPA finality proof contains too many unknown headers: {actual} > {max}")]
    TooManyHeaders {
        /// Received header count.
        actual: usize,
        /// Configured maximum count.
        max: usize,
    },
    /// The supplied source-profile authority set is empty, duplicated, zero-weighted, oversized,
    /// or overflows total weight.
    #[error("expected GRANDPA authority set is invalid for the Frontier profile")]
    InvalidAuthoritySet,
    /// The embedded SCALE justification is malformed or has trailing bytes.
    #[error("failed to decode the embedded GRANDPA justification")]
    JustificationDecode,
    /// The outer proof block differs from the signed commit target.
    #[error("finality proof block does not match the justification target")]
    ProofTargetMismatch,
    /// The signed commit target is older than the requested block.
    #[error("justification target precedes the requested block")]
    TargetBeforeRequest,
    /// A supplied header does not increment the block number exactly once.
    #[error("unknown header {index} is not the next block number")]
    HeaderNumberMismatch {
        /// Zero-based position in the unknown-header list.
        index: usize,
    },
    /// A supplied header is not a child of the previous exact hash.
    #[error("unknown header {index} does not descend from the previous block")]
    HeaderParentMismatch {
        /// Zero-based position in the unknown-header list.
        index: usize,
    },
    /// The supplied header span is missing, extra, or ends on another fork.
    #[error("unknown headers do not end at the justification target")]
    HeaderChainTargetMismatch,
    /// Signatures, threshold, or vote ancestry are invalid for the expected authority set.
    #[error("GRANDPA justification verification failed: {0}")]
    InvalidJustification(String),
}

/// A decoded proof that passed all native GRANDPA and exact-header checks.
#[cfg_attr(feature = "std", derive(Debug))]
pub struct VerifiedGrandpaFinalityProof<Block: BlockT> {
    /// Canonical outer finality proof.
    pub proof: FinalityProof<Block::Header>,
    /// Canonical embedded and signature-checked justification.
    pub justification: GrandpaJustification<Block>,
    /// Signed finalized block hash.
    pub target_hash: Block::Hash,
    /// Signed finalized block number.
    pub target_number: NumberFor<Block>,
}

#[derive(Clone, Decode, Encode)]
struct GrandpaAuthorityTransitionFragment<Block: BlockT> {
    header: Block::Header,
    justification: GrandpaJustification<Block>,
}

#[derive(Clone, Decode, Encode)]
struct GrandpaAuthorityTransitionProof<Block: BlockT> {
    proofs: Vec<GrandpaAuthorityTransitionFragment<Block>>,
    is_finished: bool,
}

/// Bounded structural metadata recovered from one canonical GRANDPA warp proof.
///
/// This result is an acquisition hint only. It does not verify signatures, authority handoffs,
/// ancestry, finality, or any bridge claim.
#[derive(Debug)]
pub struct InspectedGrandpaAuthorityTransitionProof<Block: BlockT> {
    /// Whether the upstream provider marked this proof chunk complete.
    pub complete: bool,
    /// Number of encoded finalized fragments.
    pub fragment_count: usize,
    /// Last header embedded in the proof chunk.
    pub target_header: Block::Header,
}

/// Acquisition-only warp-proof prefix selected before one target finality horizon.
#[derive(Debug)]
pub struct SelectedGrandpaAuthorityTransitionPrefix<Block: BlockT> {
    /// Whether the source warp proof was marked complete by its provider.
    pub source_complete: bool,
    /// Number of fragments in the source warp proof.
    pub source_fragment_count: usize,
    /// Last header in the source warp proof.
    pub source_target_header: Block::Header,
    /// Whether the source proof contained a fragment at or after the requested horizon.
    pub stopped_before_horizon: bool,
    /// Number of fragments strictly before the requested horizon.
    pub selected_fragment_count: usize,
    /// Last selected transition header, absent when the reviewed anchor set covers the target.
    pub selected_target_header: Option<Block::Header>,
    /// Canonical partial warp proof containing only selected transition fragments.
    pub selected_encoded_proof: Option<Vec<u8>>,
}

/// A reason a GRANDPA authority-transition proof was rejected.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum BridgeAuthorityTransitionError {
    /// The untrusted proof exceeds the byte limit.
    #[error("GRANDPA authority-transition proof exceeds the {max} byte limit: {actual}")]
    ProofTooLarge {
        /// Received proof size.
        actual: usize,
        /// Configured maximum size.
        max: usize,
    },
    /// The SCALE object is malformed or has trailing bytes.
    #[error("failed to decode the canonical GRANDPA authority-transition proof")]
    ProofDecode,
    /// The proof contains no finalized fragment.
    #[error("GRANDPA authority-transition proof is empty")]
    EmptyProof,
    /// The proof contains too many fragments.
    #[error("GRANDPA authority-transition proof contains too many fragments: {actual} > {max}")]
    TooManyFragments {
        /// Received fragment count.
        actual: usize,
        /// Configured maximum count.
        max: usize,
    },
    /// No contiguous header chain was supplied for checkpoint binding.
    #[error("GRANDPA authority-transition ancestry is empty")]
    EmptyAncestry,
    /// The contiguous checkpoint-binding chain exceeds the bridge policy limit.
    #[error("GRANDPA authority-transition ancestry contains too many headers: {actual} > {max}")]
    TooManyAncestryHeaders {
        /// Received ancestry header count.
        actual: usize,
        /// Configured maximum header count.
        max: usize,
    },
    /// A supplied ancestry header does not increment the trusted block number exactly once.
    #[error("GRANDPA authority-transition ancestry header {header} is not the next block number")]
    AncestryNumberMismatch {
        /// Zero-based ancestry header position.
        header: usize,
    },
    /// A supplied ancestry header is not a child of the preceding authenticated hash.
    #[error("GRANDPA authority-transition ancestry header {header} is not hash-linked")]
    AncestryParentMismatch {
        /// Zero-based ancestry header position.
        header: usize,
    },
    /// A signed transition fragment does not occur on the supplied authenticated header chain.
    #[error(
        "GRANDPA authority-transition fragment {fragment} is not on the authenticated ancestry"
    )]
    FragmentNotInAncestry {
        /// Zero-based fragment position.
        fragment: usize,
    },
    /// A scheduled change appears on the authenticated chain without a signed transition fragment.
    #[error(
        "GRANDPA authority-transition ancestry header {header} has an unproven scheduled change"
    )]
    UnprovenScheduledChange {
        /// Zero-based ancestry header position.
        header: usize,
    },
    /// A forced change appears anywhere on the authenticated ancestry.
    #[error("GRANDPA authority-transition ancestry header {header} contains a forced change")]
    UnprovenForcedChange {
        /// Zero-based ancestry header position.
        header: usize,
    },
    /// The supplied ancestry does not end at the last signed transition fragment.
    #[error("GRANDPA authority-transition ancestry does not end at the proof target")]
    AncestryTargetMismatch,
    /// The configured root authority set is empty, duplicated, zero-weighted, or overflowing.
    #[error("trusted GRANDPA authority set is invalid")]
    InvalidTrustedAuthoritySet,
    /// Fragment heights are stale or not strictly increasing.
    #[error("GRANDPA authority-transition fragment {fragment} is not strictly newer")]
    FragmentOrder {
        /// Zero-based fragment position.
        fragment: usize,
    },
    /// The justification target differs from its fragment header.
    #[error("GRANDPA authority-transition fragment {fragment} target mismatch")]
    JustificationHeaderMismatch {
        /// Zero-based fragment position.
        fragment: usize,
    },
    /// Signatures, threshold, or vote ancestry are invalid for the current authenticated set.
    #[error("GRANDPA authority-transition fragment {fragment} failed verification: {reason}")]
    InvalidJustification {
        /// Zero-based fragment position.
        fragment: usize,
        /// Native verifier failure without remote RPC material.
        reason: String,
    },
    /// Forced changes break the authenticated handoff and require a new trust decision.
    #[error("GRANDPA authority-transition fragment {fragment} contains a forced change")]
    ForcedChange {
        /// Zero-based fragment position.
        fragment: usize,
    },
    /// The pinned official warp-proof format is unsafe for delayed scheduled changes.
    #[error("GRANDPA authority-transition fragment {fragment} has a nonzero scheduled delay")]
    NonzeroScheduledDelay {
        /// Zero-based fragment position.
        fragment: usize,
    },
    /// The next authority set is empty, duplicated, zero-weighted, or overflowing.
    #[error("GRANDPA authority-transition fragment {fragment} contains an invalid next set")]
    InvalidNextAuthoritySet {
        /// Zero-based fragment position.
        fragment: usize,
    },
    /// An incomplete or intermediate proof fragment did not authenticate a handoff.
    #[error("GRANDPA authority-transition fragment {fragment} lacks a required scheduled handoff")]
    IncompleteWithoutHandoff {
        /// Zero-based fragment position.
        fragment: usize,
    },
    /// The authenticated set identifier cannot be incremented.
    #[error("GRANDPA authority set identifier overflow")]
    SetIdOverflow,
}

/// Inspect the terminal header and completion flag of one canonical bounded warp proof.
///
/// The returned metadata remains untrusted until the same proof is checked with
/// [`verify_linked_grandpa_authority_transition_proof`].
pub fn inspect_grandpa_authority_transition_proof<Block>(
    encoded_proof: &[u8],
) -> Result<InspectedGrandpaAuthorityTransitionProof<Block>, BridgeAuthorityTransitionError>
where
    Block: BlockT,
{
    if encoded_proof.len() > MAX_AUTHORITY_TRANSITION_PROOF_BYTES {
        return Err(BridgeAuthorityTransitionError::ProofTooLarge {
            actual: encoded_proof.len(),
            max: MAX_AUTHORITY_TRANSITION_PROOF_BYTES,
        });
    }

    let proof = GrandpaAuthorityTransitionProof::<Block>::decode_all(&mut &*encoded_proof)
        .map_err(|_| BridgeAuthorityTransitionError::ProofDecode)?;
    if proof.encode() != encoded_proof {
        return Err(BridgeAuthorityTransitionError::ProofDecode);
    }
    if proof.proofs.is_empty() {
        return Err(BridgeAuthorityTransitionError::EmptyProof);
    }
    if proof.proofs.len() > MAX_AUTHORITY_TRANSITION_FRAGMENTS {
        return Err(BridgeAuthorityTransitionError::TooManyFragments {
            actual: proof.proofs.len(),
            max: MAX_AUTHORITY_TRANSITION_FRAGMENTS,
        });
    }

    let fragment_count = proof.proofs.len();
    let target_header = proof
        .proofs
        .last()
        .expect("non-empty proof checked above; qed")
        .header
        .clone();
    Ok(InspectedGrandpaAuthorityTransitionProof {
        complete: proof.is_finished,
        fragment_count,
        target_header,
    })
}

/// Select the canonical transition-proof prefix strictly before one finality horizon.
///
/// The selected proof is always encoded as incomplete, because it authenticates only the
/// handoffs entering the target's authority set. The target finality proof and an independent
/// contiguous ancestry must authenticate the remainder of that set. This function performs no
/// signature or authority verification.
pub fn select_grandpa_authority_transition_prefix<Block>(
    encoded_proof: &[u8],
    finality_horizon_number: NumberFor<Block>,
) -> Result<SelectedGrandpaAuthorityTransitionPrefix<Block>, BridgeAuthorityTransitionError>
where
    Block: BlockT,
{
    if encoded_proof.len() > MAX_AUTHORITY_TRANSITION_PROOF_BYTES {
        return Err(BridgeAuthorityTransitionError::ProofTooLarge {
            actual: encoded_proof.len(),
            max: MAX_AUTHORITY_TRANSITION_PROOF_BYTES,
        });
    }
    let proof = GrandpaAuthorityTransitionProof::<Block>::decode_all(&mut &*encoded_proof)
        .map_err(|_| BridgeAuthorityTransitionError::ProofDecode)?;
    if proof.encode() != encoded_proof {
        return Err(BridgeAuthorityTransitionError::ProofDecode);
    }
    if proof.proofs.is_empty() {
        return Err(BridgeAuthorityTransitionError::EmptyProof);
    }
    if proof.proofs.len() > MAX_AUTHORITY_TRANSITION_FRAGMENTS {
        return Err(BridgeAuthorityTransitionError::TooManyFragments {
            actual: proof.proofs.len(),
            max: MAX_AUTHORITY_TRANSITION_FRAGMENTS,
        });
    }

    let selected_fragment_count = proof
        .proofs
        .iter()
        .take_while(|fragment| *fragment.header.number() < finality_horizon_number)
        .count();
    let selected_target_header = selected_fragment_count
        .checked_sub(1)
        .map(|index| proof.proofs[index].header.clone());
    let selected_encoded_proof = if selected_fragment_count == 0 {
        None
    } else {
        Some(
            GrandpaAuthorityTransitionProof::<Block> {
                proofs: proof.proofs[..selected_fragment_count].to_vec(),
                is_finished: false,
            }
            .encode(),
        )
    };
    let source_target_header = proof
        .proofs
        .last()
        .expect("non-empty proof checked above; qed")
        .header
        .clone();

    Ok(SelectedGrandpaAuthorityTransitionPrefix {
        source_complete: proof.is_finished,
        source_fragment_count: proof.proofs.len(),
        source_target_header,
        stopped_before_horizon: selected_fragment_count < proof.proofs.len(),
        selected_fragment_count,
        selected_target_header,
        selected_encoded_proof,
    })
}

/// An authority-transition proof checked from one explicitly trusted GRANDPA set.
#[derive(Debug)]
pub struct VerifiedGrandpaAuthorityTransitionProof<Block: BlockT> {
    /// Whether the provider declared this proof chunk complete.
    pub complete: bool,
    /// Number of authenticated scheduled handoffs in this chunk.
    pub transition_count: usize,
    /// Authenticated set identifier after applying every accepted handoff.
    pub current_set_id: SetId,
    /// Authenticated authority list after applying every accepted handoff.
    pub current_authorities: AuthorityList,
    /// Last signature-checked header in this chunk.
    pub target_header: Block::Header,
    /// Hash of the last signature-checked header.
    pub target_hash: Block::Hash,
    /// Number of the last signature-checked header.
    pub target_number: NumberFor<Block>,
}

fn valid_authority_list(authorities: &AuthorityList) -> bool {
    if authorities.is_empty()
        || authorities.len() > MAX_GRANDPA_AUTHORITIES
        || authorities.iter().any(|(_, weight)| *weight == 0)
    {
        return false;
    }

    let mut total_weight = 0u64;
    for (index, (authority, weight)) in authorities.iter().enumerate() {
        if authorities[..index]
            .iter()
            .any(|(seen, _)| seen == authority)
        {
            return false;
        }
        let Some(next_total) = total_weight.checked_add(*weight) else {
            return false;
        };
        total_weight = next_total;
    }
    true
}

/// Verify one canonical GRANDPA warp-proof chunk from an explicitly trusted authority set.
///
/// This applies a stricter bridge policy than the pinned generic warp verifier: forced changes,
/// mixed forced/scheduled logs, nonzero scheduled delays, invalid authority lists, set-ID
/// overflow, stale fragments, non-canonical SCALE, and unbounded proof material are rejected.
/// Partial chunks are accepted only when their last fragment authenticates a scheduled handoff,
/// allowing bounded continuation from the returned set and target hash. Every fragment must be
/// strictly newer than `last_accepted_target_number`.
///
/// This proves authority handoffs and fragment finality under the supplied trust root. The compact
/// warp format does not prove ancestry from a genesis/checkpoint hash and does not prove freshness,
/// runtime storage, Frontier execution mapping, an Ergo anchor, or Gate 5. Callers must bind the
/// configured starting set to the intended sidechain domain and separately verify the exact
/// checkpoint finality proof under the returned set.
pub fn verify_grandpa_authority_transition_proof<Block>(
    trusted_set_id: SetId,
    trusted_authorities: &AuthorityList,
    last_accepted_target_number: NumberFor<Block>,
    encoded_proof: &[u8],
) -> Result<VerifiedGrandpaAuthorityTransitionProof<Block>, BridgeAuthorityTransitionError>
where
    Block: BlockT,
    NumberFor<Block>: BlockNumberOps + Zero,
{
    if encoded_proof.len() > MAX_AUTHORITY_TRANSITION_PROOF_BYTES {
        return Err(BridgeAuthorityTransitionError::ProofTooLarge {
            actual: encoded_proof.len(),
            max: MAX_AUTHORITY_TRANSITION_PROOF_BYTES,
        });
    }
    if !valid_authority_list(trusted_authorities) {
        return Err(BridgeAuthorityTransitionError::InvalidTrustedAuthoritySet);
    }

    let proof = GrandpaAuthorityTransitionProof::<Block>::decode_all(&mut &*encoded_proof)
        .map_err(|_| BridgeAuthorityTransitionError::ProofDecode)?;
    if proof.encode() != encoded_proof {
        return Err(BridgeAuthorityTransitionError::ProofDecode);
    }
    if proof.proofs.is_empty() {
        return Err(BridgeAuthorityTransitionError::EmptyProof);
    }
    if proof.proofs.len() > MAX_AUTHORITY_TRANSITION_FRAGMENTS {
        return Err(BridgeAuthorityTransitionError::TooManyFragments {
            actual: proof.proofs.len(),
            max: MAX_AUTHORITY_TRANSITION_FRAGMENTS,
        });
    }

    let mut current_set_id = trusted_set_id;
    let mut current_authorities = trusted_authorities.clone();
    let mut previous_number = None;
    let mut transition_count = 0usize;

    for (fragment, item) in proof.proofs.iter().enumerate() {
        let number = *item.header.number();
        if number <= last_accepted_target_number
            || previous_number.is_some_and(|previous| number <= previous)
        {
            return Err(BridgeAuthorityTransitionError::FragmentOrder { fragment });
        }

        let hash = item.header.hash();
        if item.justification.target() != (number, hash) {
            return Err(BridgeAuthorityTransitionError::JustificationHeaderMismatch { fragment });
        }
        item.justification
            .verify(current_set_id, &current_authorities)
            .map_err(
                |error| BridgeAuthorityTransitionError::InvalidJustification {
                    fragment,
                    reason: error.to_string(),
                },
            )?;

        if find_forced_change::<Block>(&item.header).is_some() {
            return Err(BridgeAuthorityTransitionError::ForcedChange { fragment });
        }

        if let Some(change) = find_scheduled_change::<Block>(&item.header) {
            if !change.delay.is_zero() {
                return Err(BridgeAuthorityTransitionError::NonzeroScheduledDelay { fragment });
            }
            if !valid_authority_list(&change.next_authorities) {
                return Err(BridgeAuthorityTransitionError::InvalidNextAuthoritySet { fragment });
            }
            current_set_id = current_set_id
                .checked_add(1)
                .ok_or(BridgeAuthorityTransitionError::SetIdOverflow)?;
            current_authorities = change.next_authorities;
            transition_count += 1;
        } else if fragment != proof.proofs.len() - 1 || !proof.is_finished {
            return Err(BridgeAuthorityTransitionError::IncompleteWithoutHandoff { fragment });
        }

        previous_number = Some(number);
    }

    let target_header = proof
        .proofs
        .last()
        .expect("non-empty proof checked above; qed")
        .header
        .clone();
    let target_hash = target_header.hash();
    let target_number = *target_header.number();

    Ok(VerifiedGrandpaAuthorityTransitionProof {
        complete: proof.is_finished,
        transition_count,
        current_set_id,
        current_authorities,
        target_header,
        target_hash,
        target_number,
    })
}

/// Verify a GRANDPA transition chunk and bind every signed fragment to one contiguous chain
/// descending from an explicitly trusted checkpoint hash and number.
///
/// The compact upstream warp proof authenticates authority signatures and scheduled handoffs but
/// omits intervening headers. Callers must therefore supply the exact contiguous ancestry used for
/// checkpoint binding. Every scheduled or forced change on that chain is inspected, every signed
/// fragment must occur on it, and the chain must end at the last signed fragment.
pub fn verify_linked_grandpa_authority_transition_proof<Block>(
    trusted_set_id: SetId,
    trusted_authorities: &AuthorityList,
    trusted_target_hash: Block::Hash,
    trusted_target_number: NumberFor<Block>,
    ancestry_headers: &[Block::Header],
    encoded_proof: &[u8],
) -> Result<VerifiedGrandpaAuthorityTransitionProof<Block>, BridgeAuthorityTransitionError>
where
    Block: BlockT,
    NumberFor<Block>: BlockNumberOps + Zero + CheckedAdd + Copy,
{
    if ancestry_headers.is_empty() {
        return Err(BridgeAuthorityTransitionError::EmptyAncestry);
    }
    if ancestry_headers.len() > MAX_AUTHORITY_TRANSITION_ANCESTRY_HEADERS {
        return Err(BridgeAuthorityTransitionError::TooManyAncestryHeaders {
            actual: ancestry_headers.len(),
            max: MAX_AUTHORITY_TRANSITION_ANCESTRY_HEADERS,
        });
    }

    let verified = verify_grandpa_authority_transition_proof::<Block>(
        trusted_set_id,
        trusted_authorities,
        trusted_target_number,
        encoded_proof,
    )?;
    let proof = GrandpaAuthorityTransitionProof::<Block>::decode_all(&mut &*encoded_proof)
        .map_err(|_| BridgeAuthorityTransitionError::ProofDecode)?;
    if proof.encode() != encoded_proof {
        return Err(BridgeAuthorityTransitionError::ProofDecode);
    }

    let mut previous_hash = trusted_target_hash;
    let mut previous_number = trusted_target_number;
    let mut fragment = 0usize;
    for (header, item) in ancestry_headers.iter().enumerate() {
        let expected_number = previous_number
            .checked_add(&One::one())
            .ok_or(BridgeAuthorityTransitionError::AncestryNumberMismatch { header })?;
        if *item.number() != expected_number {
            return Err(BridgeAuthorityTransitionError::AncestryNumberMismatch { header });
        }
        if *item.parent_hash() != previous_hash {
            return Err(BridgeAuthorityTransitionError::AncestryParentMismatch { header });
        }

        let matches_fragment = proof.proofs.get(fragment).is_some_and(|candidate| {
            *candidate.header.number() == *item.number() && candidate.header.hash() == item.hash()
        });
        if proof.proofs.get(fragment).is_some_and(|candidate| {
            *candidate.header.number() <= *item.number() && !matches_fragment
        }) {
            return Err(BridgeAuthorityTransitionError::FragmentNotInAncestry { fragment });
        }
        if find_forced_change::<Block>(item).is_some() {
            return Err(BridgeAuthorityTransitionError::UnprovenForcedChange { header });
        }
        if find_scheduled_change::<Block>(item).is_some() && !matches_fragment {
            return Err(BridgeAuthorityTransitionError::UnprovenScheduledChange { header });
        }
        if matches_fragment {
            fragment += 1;
        }

        previous_hash = item.hash();
        previous_number = expected_number;
    }

    if fragment != proof.proofs.len() {
        return Err(BridgeAuthorityTransitionError::FragmentNotInAncestry { fragment });
    }
    if previous_hash != verified.target_hash || previous_number != verified.target_number {
        return Err(BridgeAuthorityTransitionError::AncestryTargetMismatch);
    }

    Ok(verified)
}

/// Verify a canonical `grandpa_proveFinality` response for one exact requested block.
///
/// The caller must supply an independently authenticated authority set and set ID. This
/// function verifies signatures, threshold, vote ancestry, and the exact header chain. It does
/// not authenticate authority transitions, runtime state, Frontier execution mapping, or an Ergo
/// commitment.
pub fn verify_grandpa_finality_proof<Block>(
    requested_hash: Block::Hash,
    requested_number: NumberFor<Block>,
    expected_set_id: SetId,
    expected_authorities: &AuthorityList,
    encoded_proof: &[u8],
) -> Result<VerifiedGrandpaFinalityProof<Block>, BridgeFinalityProofError>
where
    Block: BlockT,
    NumberFor<Block>: BlockNumberOps + CheckedAdd,
{
    if encoded_proof.len() > MAX_FINALITY_PROOF_BYTES {
        return Err(BridgeFinalityProofError::ProofTooLarge {
            actual: encoded_proof.len(),
            max: MAX_FINALITY_PROOF_BYTES,
        });
    }
    if !valid_authority_list(expected_authorities) {
        return Err(BridgeFinalityProofError::InvalidAuthoritySet);
    }

    let proof = FinalityProof::<Block::Header>::decode_all(&mut &*encoded_proof)
        .map_err(|_| BridgeFinalityProofError::ProofDecode)?;
    if proof.encode() != encoded_proof {
        return Err(BridgeFinalityProofError::ProofDecode);
    }
    if proof.unknown_headers.len() > MAX_UNKNOWN_HEADERS {
        return Err(BridgeFinalityProofError::TooManyHeaders {
            actual: proof.unknown_headers.len(),
            max: MAX_UNKNOWN_HEADERS,
        });
    }

    let justification = GrandpaJustification::<Block>::decode_all(&mut &*proof.justification)
        .map_err(|_| BridgeFinalityProofError::JustificationDecode)?;
    if justification.encode() != proof.justification {
        return Err(BridgeFinalityProofError::JustificationDecode);
    }
    let (target_number, target_hash) = justification.target();

    if proof.block != target_hash {
        return Err(BridgeFinalityProofError::ProofTargetMismatch);
    }
    if target_number < requested_number {
        return Err(BridgeFinalityProofError::TargetBeforeRequest);
    }

    let mut current_hash = requested_hash;
    let mut current_number = requested_number;
    for (index, header) in proof.unknown_headers.iter().enumerate() {
        let next_number = current_number
            .checked_add(&One::one())
            .ok_or(BridgeFinalityProofError::HeaderNumberMismatch { index })?;
        if *header.number() != next_number {
            return Err(BridgeFinalityProofError::HeaderNumberMismatch { index });
        }
        if *header.parent_hash() != current_hash {
            return Err(BridgeFinalityProofError::HeaderParentMismatch { index });
        }
        current_hash = header.hash();
        current_number = next_number;
    }

    if current_hash != target_hash || current_number != target_number {
        return Err(BridgeFinalityProofError::HeaderChainTargetMismatch);
    }

    justification
        .verify(expected_set_id, expected_authorities)
        .map_err(|error| BridgeFinalityProofError::InvalidJustification(error.to_string()))?;

    Ok(VerifiedGrandpaFinalityProof {
        proof,
        justification,
        target_hash,
        target_number,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use scale_codec::{Compact, Encode};
    use sp_core::{ed25519, Pair};
    use sp_runtime::traits::Header as SubstrateHeaderT;

    type H256 = FrontierHash;
    type Digest = FrontierDigest;
    type DigestItem = FrontierDigestItem;
    type TestHeader = FrontierHeader;
    type TestBlock = FrontierGrandpaBlock;
    type SubstrateHeader = sp_runtime::generic::Header<u32, sp_runtime::traits::BlakeTwo256>;

    fn substrate_hash(hash: FrontierHash) -> sp_core::H256 {
        sp_core::H256::from(hash.0)
    }

    fn substrate_verify_zip215(
        public: AuthorityId,
        signature: AuthoritySignature,
        message: &[u8],
    ) -> bool {
        ed25519::Pair::verify(
            &ed25519::Signature::from_raw(signature),
            message,
            &ed25519::Public::from_raw(public),
        )
    }

    fn substrate_digest(digest: &FrontierDigest) -> sp_runtime::Digest {
        sp_runtime::Digest {
            logs: digest
                .logs
                .iter()
                .map(|item| match item {
                    FrontierDigestItem::PreRuntime(engine, payload) => {
                        sp_runtime::DigestItem::PreRuntime(*engine, payload.clone())
                    }
                    FrontierDigestItem::Consensus(engine, payload) => {
                        sp_runtime::DigestItem::Consensus(*engine, payload.clone())
                    }
                    FrontierDigestItem::Seal(engine, payload) => {
                        sp_runtime::DigestItem::Seal(*engine, payload.clone())
                    }
                    FrontierDigestItem::Other(payload) => {
                        sp_runtime::DigestItem::Other(payload.clone())
                    }
                    FrontierDigestItem::RuntimeEnvironmentUpdated => {
                        sp_runtime::DigestItem::RuntimeEnvironmentUpdated
                    }
                })
                .collect(),
        }
    }

    fn substrate_header(header: &FrontierHeader) -> SubstrateHeader {
        SubstrateHeader::new(
            header.number,
            substrate_hash(header.extrinsics_root),
            substrate_hash(header.state_root),
            substrate_hash(header.parent_hash),
            substrate_digest(&header.digest),
        )
    }

    fn substrate_justification(
        justification: &PrimitiveGrandpaJustification<FrontierHeader>,
    ) -> sp_consensus_grandpa::GrandpaJustification<SubstrateHeader> {
        let precommits = justification
            .commit
            .precommits
            .iter()
            .map(|signed| finality_grandpa::SignedPrecommit {
                precommit: finality_grandpa::Precommit {
                    target_hash: substrate_hash(signed.precommit.target_hash),
                    target_number: signed.precommit.target_number,
                },
                signature: ed25519::Signature::from_raw(signed.signature).into(),
                id: ed25519::Public::from_raw(signed.id).into(),
            })
            .collect();
        sp_consensus_grandpa::GrandpaJustification {
            round: justification.round,
            commit: finality_grandpa::Commit {
                target_hash: substrate_hash(justification.commit.target_hash),
                target_number: justification.commit.target_number,
                precommits,
            },
            votes_ancestries: justification
                .votes_ancestries
                .iter()
                .map(substrate_header)
                .collect(),
        }
    }

    const SET_ID: SetId = 7;
    const ROUND: u64 = 11;

    #[derive(Clone, Encode)]
    struct TestWarpSyncFragment {
        header: TestHeader,
        justification: GrandpaJustification<TestBlock>,
    }

    #[derive(Clone, Encode)]
    struct TestWarpSyncProof {
        proofs: Vec<TestWarpSyncFragment>,
        is_finished: bool,
    }

    #[derive(Encode)]
    struct SubstrateWarpSyncFragment {
        header: SubstrateHeader,
        justification: sp_consensus_grandpa::GrandpaJustification<SubstrateHeader>,
    }

    #[derive(Encode)]
    struct SubstrateWarpSyncProof {
        proofs: Vec<SubstrateWarpSyncFragment>,
        is_finished: bool,
    }

    fn substrate_warp_proof(proof: &TestWarpSyncProof) -> SubstrateWarpSyncProof {
        SubstrateWarpSyncProof {
            proofs: proof
                .proofs
                .iter()
                .map(|fragment| SubstrateWarpSyncFragment {
                    header: substrate_header(&fragment.header),
                    justification: substrate_justification(&fragment.justification.justification),
                })
                .collect(),
            is_finished: proof.is_finished,
        }
    }

    struct Fixture {
        headers: Vec<TestHeader>,
        pairs: Vec<ed25519::Pair>,
        authorities: AuthorityList,
    }

    impl Fixture {
        fn new() -> Self {
            let mut headers = Vec::new();
            let mut parent_hash = H256::zero();
            for number in 1u32..=4 {
                let header = TestHeader::new(
                    number,
                    H256::repeat_byte(number as u8),
                    H256::repeat_byte((number + 16) as u8),
                    parent_hash,
                    Digest::default(),
                );
                parent_hash = header.hash();
                headers.push(header);
            }

            let pairs = (1u8..=3)
                .map(|seed| ed25519::Pair::from_seed(&[seed; 32]))
                .collect::<Vec<_>>();
            let authorities = pairs
                .iter()
                .map(|pair| (pair.public().into(), 1u64))
                .collect();

            Self {
                headers,
                pairs,
                authorities,
            }
        }

        fn header(&self, number: u32) -> TestHeader {
            self.headers[(number - 1) as usize].clone()
        }

        fn proof(
            &self,
            signer_count: usize,
            signing_set_id: SetId,
            unknown_headers: Vec<TestHeader>,
        ) -> FinalityProof<TestHeader> {
            let target = self.header(3);
            let precommit = finality_grandpa::Precommit {
                target_hash: target.hash(),
                target_number: *target.number(),
            };
            let message: GrandpaMessage<TestBlock> =
                finality_grandpa::Message::Precommit(precommit.clone());
            let payload = (message, ROUND, signing_set_id).encode();
            let precommits = self
                .pairs
                .iter()
                .take(signer_count)
                .map(|pair| finality_grandpa::SignedPrecommit {
                    precommit: precommit.clone(),
                    signature: pair.sign(&payload).into(),
                    id: pair.public().into(),
                })
                .collect();
            let commit = finality_grandpa::Commit {
                target_hash: target.hash(),
                target_number: *target.number(),
                precommits,
            };
            let justification: GrandpaJustification<TestBlock> =
                PrimitiveGrandpaJustification::<TestHeader> {
                    round: ROUND,
                    commit,
                    votes_ancestries: Vec::new(),
                }
                .into();

            FinalityProof {
                block: target.hash(),
                justification: justification.encode(),
                unknown_headers,
            }
        }

        fn proof_with_vote_ancestry(
            &self,
            votes_ancestries: Vec<TestHeader>,
        ) -> FinalityProof<TestHeader> {
            let commit_target = self.header(3);
            let descendant_target = self.header(4);
            let precommits = self
                .pairs
                .iter()
                .enumerate()
                .map(|(index, pair)| {
                    let target = if index == 0 {
                        &commit_target
                    } else {
                        &descendant_target
                    };
                    let precommit = finality_grandpa::Precommit {
                        target_hash: target.hash(),
                        target_number: *target.number(),
                    };
                    let message: GrandpaMessage<TestBlock> =
                        finality_grandpa::Message::Precommit(precommit.clone());
                    let payload = (message, ROUND, SET_ID).encode();
                    finality_grandpa::SignedPrecommit {
                        precommit,
                        signature: pair.sign(&payload).into(),
                        id: pair.public().into(),
                    }
                })
                .collect();
            let justification: GrandpaJustification<TestBlock> =
                PrimitiveGrandpaJustification::<TestHeader> {
                    round: ROUND,
                    commit: finality_grandpa::Commit {
                        target_hash: commit_target.hash(),
                        target_number: *commit_target.number(),
                        precommits,
                    },
                    votes_ancestries,
                }
                .into();

            FinalityProof {
                block: commit_target.hash(),
                justification: justification.encode(),
                unknown_headers: Vec::new(),
            }
        }

        fn verify(
            &self,
            requested_number: u32,
            proof: &FinalityProof<TestHeader>,
        ) -> Result<VerifiedGrandpaFinalityProof<TestBlock>, BridgeFinalityProofError> {
            verify_grandpa_finality_proof::<TestBlock>(
                self.header(requested_number).hash(),
                requested_number,
                SET_ID,
                &self.authorities,
                &proof.encode(),
            )
        }
    }

    fn authority_pairs(first_seed: u8) -> (Vec<ed25519::Pair>, AuthorityList) {
        let pairs = (first_seed..first_seed + 3)
            .map(|seed| ed25519::Pair::from_seed(&[seed; 32]))
            .collect::<Vec<_>>();
        let authorities = pairs
            .iter()
            .map(|pair| (pair.public().into(), 1u64))
            .collect();
        (pairs, authorities)
    }

    fn signed_justification(
        header: &TestHeader,
        pairs: &[ed25519::Pair],
        set_id: SetId,
    ) -> GrandpaJustification<TestBlock> {
        let precommit = finality_grandpa::Precommit {
            target_hash: header.hash(),
            target_number: *header.number(),
        };
        let message: GrandpaMessage<TestBlock> =
            finality_grandpa::Message::Precommit(precommit.clone());
        let payload = (message, ROUND, set_id).encode();
        let precommits = pairs
            .iter()
            .map(|pair| finality_grandpa::SignedPrecommit {
                precommit: precommit.clone(),
                signature: pair.sign(&payload).into(),
                id: pair.public().into(),
            })
            .collect();
        PrimitiveGrandpaJustification::<TestHeader> {
            round: ROUND,
            commit: finality_grandpa::Commit {
                target_hash: header.hash(),
                target_number: *header.number(),
                precommits,
            },
            votes_ancestries: Vec::new(),
        }
        .into()
    }

    fn transition_header(
        number: u32,
        parent_hash: H256,
        next_authorities: AuthorityList,
        delay: u32,
        forced: bool,
    ) -> TestHeader {
        let change = ScheduledChange {
            delay,
            next_authorities,
        };
        let log = if forced {
            ConsensusLog::ForcedChange(0, change)
        } else {
            ConsensusLog::ScheduledChange(change)
        };
        TestHeader::new(
            number,
            H256::repeat_byte(number as u8),
            H256::repeat_byte((number + 16) as u8),
            parent_hash,
            Digest {
                logs: vec![DigestItem::Consensus(GRANDPA_ENGINE_ID, log.encode())],
            },
        )
    }

    fn warp_fixture(
        delay: u32,
        forced: bool,
    ) -> (
        TestWarpSyncProof,
        AuthorityList,
        AuthorityList,
        TestHeader,
        TestHeader,
    ) {
        let (pairs_a, authorities_a) = authority_pairs(21);
        let (pairs_b, authorities_b) = authority_pairs(31);
        let transition = transition_header(
            2,
            H256::repeat_byte(1),
            authorities_b.clone(),
            delay,
            forced,
        );
        let terminal = TestHeader::new(
            3,
            H256::repeat_byte(3),
            H256::repeat_byte(19),
            transition.hash(),
            Digest::default(),
        );
        let proof = TestWarpSyncProof {
            proofs: vec![
                TestWarpSyncFragment {
                    header: transition.clone(),
                    justification: signed_justification(&transition, &pairs_a, SET_ID),
                },
                TestWarpSyncFragment {
                    header: terminal.clone(),
                    justification: signed_justification(&terminal, &pairs_b, SET_ID + 1),
                },
            ],
            is_finished: true,
        };
        (proof, authorities_a, authorities_b, transition, terminal)
    }

    #[test]
    fn inspects_only_bounded_canonical_warp_metadata() {
        let (proof, _, _, transition, terminal) = warp_fixture(0, false);
        let inspected =
            inspect_grandpa_authority_transition_proof::<TestBlock>(&proof.encode()).unwrap();

        assert!(inspected.complete);
        assert_eq!(inspected.fragment_count, 2);
        assert_eq!(inspected.target_header, terminal);

        let selected =
            select_grandpa_authority_transition_prefix::<TestBlock>(&proof.encode(), 3).unwrap();
        assert!(selected.source_complete);
        assert!(selected.stopped_before_horizon);
        assert_eq!(selected.selected_fragment_count, 1);
        assert_eq!(selected.selected_target_header, Some(transition));
        assert!(selected.selected_encoded_proof.is_some());

        let empty = TestWarpSyncProof {
            proofs: Vec::new(),
            is_finished: true,
        };
        assert_eq!(
            inspect_grandpa_authority_transition_proof::<TestBlock>(&empty.encode()).unwrap_err(),
            BridgeAuthorityTransitionError::EmptyProof,
        );
    }

    #[test]
    fn verifies_zero_delay_authority_handoff_and_terminal_finality() {
        let (proof, authorities_a, authorities_b, _, terminal) = warp_fixture(0, false);
        let verified = verify_grandpa_authority_transition_proof::<TestBlock>(
            SET_ID,
            &authorities_a,
            1,
            &proof.encode(),
        )
        .unwrap();

        assert!(verified.complete);
        assert_eq!(verified.transition_count, 1);
        assert_eq!(verified.current_set_id, SET_ID + 1);
        assert_eq!(verified.current_authorities, authorities_b);
        assert_eq!(verified.target_hash, terminal.hash());
        assert_eq!(verified.target_number, 3);
    }

    #[test]
    fn verifies_transition_fragments_on_contiguous_trusted_ancestry() {
        let (proof, authorities_a, authorities_b, transition, terminal) = warp_fixture(0, false);
        let verified = verify_linked_grandpa_authority_transition_proof::<TestBlock>(
            SET_ID,
            &authorities_a,
            H256::repeat_byte(1),
            1,
            &[transition, terminal.clone()],
            &proof.encode(),
        )
        .unwrap();

        assert!(verified.complete);
        assert_eq!(verified.current_authorities, authorities_b);
        assert_eq!(verified.target_hash, terminal.hash());
    }

    #[test]
    fn rejects_scheduled_change_omitted_from_signed_fragments() {
        let (pairs_a, authorities_a) = authority_pairs(21);
        let (pairs_b, authorities_b) = authority_pairs(31);
        let (_, hidden_authorities) = authority_pairs(41);
        let hidden = transition_header(2, H256::repeat_byte(1), hidden_authorities, 0, false);
        let visible = transition_header(3, hidden.hash(), authorities_b, 0, false);
        let terminal = TestHeader::new(
            4,
            H256::repeat_byte(4),
            H256::repeat_byte(20),
            visible.hash(),
            Digest::default(),
        );
        let proof = TestWarpSyncProof {
            proofs: vec![
                TestWarpSyncFragment {
                    header: visible.clone(),
                    justification: signed_justification(&visible, &pairs_a, SET_ID),
                },
                TestWarpSyncFragment {
                    header: terminal.clone(),
                    justification: signed_justification(&terminal, &pairs_b, SET_ID + 1),
                },
            ],
            is_finished: true,
        };

        assert_eq!(
            verify_linked_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities_a,
                H256::repeat_byte(1),
                1,
                &[hidden, visible, terminal],
                &proof.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::UnprovenScheduledChange { header: 0 },
        );
    }

    #[test]
    fn verifies_partial_handoff_for_bounded_continuation() {
        let (mut proof, authorities_a, authorities_b, transition, _) = warp_fixture(0, false);
        proof.proofs.truncate(1);
        proof.is_finished = false;

        let verified = verify_grandpa_authority_transition_proof::<TestBlock>(
            SET_ID,
            &authorities_a,
            1,
            &proof.encode(),
        )
        .unwrap();

        assert!(!verified.complete);
        assert_eq!(verified.current_set_id, SET_ID + 1);
        assert_eq!(verified.current_authorities, authorities_b);
        assert_eq!(verified.target_hash, transition.hash());
    }

    #[test]
    fn rejects_fork_spliced_transition_after_trusted_checkpoint() {
        let (mut proof, authorities, _, transition, terminal) = warp_fixture(0, false);
        let (pairs_a, _) = authority_pairs(21);
        let (pairs_b, _) = authority_pairs(31);
        let forked_transition = transition_header(
            2,
            H256::repeat_byte(0x99),
            find_scheduled_change::<TestBlock>(&transition)
                .expect("fixture transition contains a scheduled change")
                .next_authorities,
            0,
            false,
        );
        let forked_terminal = TestHeader::new(
            3,
            *terminal.extrinsics_root(),
            *terminal.state_root(),
            forked_transition.hash(),
            Digest::default(),
        );
        proof.proofs = vec![
            TestWarpSyncFragment {
                header: forked_transition.clone(),
                justification: signed_justification(&forked_transition, &pairs_a, SET_ID),
            },
            TestWarpSyncFragment {
                header: forked_terminal.clone(),
                justification: signed_justification(&forked_terminal, &pairs_b, SET_ID + 1),
            },
        ];

        assert!(
            verify_linked_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                H256::repeat_byte(1),
                1,
                &[forked_transition, forked_terminal],
                &proof.encode(),
            )
            .is_err(),
            "a transition proof on another fork must not authenticate from the trusted checkpoint",
        );
    }

    #[test]
    fn rejects_forced_mixed_and_delayed_authority_changes() {
        let (forced, authorities, _, _, _) = warp_fixture(0, true);
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &forced.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::ForcedChange { fragment: 0 },
        );

        let (delayed, authorities, _, _, _) = warp_fixture(1, false);
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &delayed.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::NonzeroScheduledDelay { fragment: 0 },
        );

        let (mut mixed, authorities, next, transition, terminal) = warp_fixture(0, false);
        let forced_log = ConsensusLog::ForcedChange(
            0,
            ScheduledChange {
                delay: 0,
                next_authorities: next,
            },
        );
        let mut logs = transition.digest().logs.clone();
        logs.push(DigestItem::Consensus(
            GRANDPA_ENGINE_ID,
            forced_log.encode(),
        ));
        let mixed_header = TestHeader::new(
            2,
            *transition.extrinsics_root(),
            *transition.state_root(),
            *transition.parent_hash(),
            Digest { logs },
        );
        let (pairs_a, _) = authority_pairs(21);
        mixed.proofs[0] = TestWarpSyncFragment {
            header: mixed_header.clone(),
            justification: signed_justification(&mixed_header, &pairs_a, SET_ID),
        };
        mixed.proofs[1].header = TestHeader::new(
            3,
            *terminal.extrinsics_root(),
            *terminal.state_root(),
            mixed_header.hash(),
            Digest::default(),
        );
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &mixed.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::ForcedChange { fragment: 0 },
        );
    }

    #[test]
    fn rejects_invalid_authority_sets_set_id_overflow_and_bad_fragment_order() {
        let (mut proof, authorities, _, _, _) = warp_fixture(0, false);
        let (pairs_a, _) = authority_pairs(21);
        let invalid_transition = transition_header(2, H256::repeat_byte(1), Vec::new(), 0, false);
        proof.proofs[0] = TestWarpSyncFragment {
            header: invalid_transition.clone(),
            justification: signed_justification(&invalid_transition, &pairs_a, SET_ID),
        };
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &proof.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::InvalidNextAuthoritySet { fragment: 0 },
        );

        let (mut proof, authorities, _, transition, _) = warp_fixture(0, false);
        proof.proofs[0].justification = signed_justification(&transition, &pairs_a, SetId::MAX);
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SetId::MAX,
                &authorities,
                1,
                &proof.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::SetIdOverflow,
        );

        let (mut proof, authorities, _, transition, _) = warp_fixture(0, false);
        let (pairs_b, _) = authority_pairs(31);
        let backwards = TestHeader::new(
            1,
            H256::repeat_byte(1),
            H256::repeat_byte(17),
            transition.hash(),
            Digest::default(),
        );
        proof.proofs[1] = TestWarpSyncFragment {
            header: backwards.clone(),
            justification: signed_justification(&backwards, &pairs_b, SET_ID + 1),
        };
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &proof.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::FragmentOrder { fragment: 1 },
        );

        let (proof, authorities, _, _, _) = warp_fixture(0, false);
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                2,
                &proof.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::FragmentOrder { fragment: 0 },
        );
    }

    #[test]
    fn rejects_invalid_trusted_and_next_authority_weight_shapes() {
        let (proof, authorities, _, transition, _) = warp_fixture(0, false);
        let outsider = ed25519::Pair::from_seed(&[99; 32]);
        let invalid_trusted_sets = [
            Vec::new(),
            vec![(outsider.public().into(), 0)],
            vec![(outsider.public().into(), 1), (outsider.public().into(), 1)],
            vec![
                (outsider.public().into(), u64::MAX),
                (ed25519::Pair::from_seed(&[98; 32]).public().into(), 1),
            ],
        ];
        for invalid in invalid_trusted_sets {
            assert_eq!(
                verify_grandpa_authority_transition_proof::<TestBlock>(
                    SET_ID,
                    &invalid,
                    1,
                    &proof.encode(),
                )
                .unwrap_err(),
                BridgeAuthorityTransitionError::InvalidTrustedAuthoritySet,
            );
        }
        let oversized_trusted = (0..=MAX_GRANDPA_AUTHORITIES)
            .map(|index| {
                let seed = 100 + index as u8;
                (ed25519::Pair::from_seed(&[seed; 32]).public().into(), 1)
            })
            .collect();
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &oversized_trusted,
                1,
                &proof.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::InvalidTrustedAuthoritySet,
        );

        let (pairs_a, _) = authority_pairs(21);
        let next_one = ed25519::Pair::from_seed(&[61; 32]);
        let next_two = ed25519::Pair::from_seed(&[62; 32]);
        let invalid_next_sets = [
            vec![(next_one.public().into(), 0)],
            vec![(next_one.public().into(), 1), (next_one.public().into(), 1)],
            vec![
                (next_one.public().into(), u64::MAX),
                (next_two.public().into(), 1),
            ],
        ];
        for invalid_next in invalid_next_sets {
            let mut invalid = proof.clone();
            let header = transition_header(2, *transition.parent_hash(), invalid_next, 0, false);
            invalid.proofs[0] = TestWarpSyncFragment {
                header: header.clone(),
                justification: signed_justification(&header, &pairs_a, SET_ID),
            };
            assert_eq!(
                verify_grandpa_authority_transition_proof::<TestBlock>(
                    SET_ID,
                    &authorities,
                    1,
                    &invalid.encode(),
                )
                .unwrap_err(),
                BridgeAuthorityTransitionError::InvalidNextAuthoritySet { fragment: 0 },
            );
        }

        let oversized_next = (0..=MAX_GRANDPA_AUTHORITIES)
            .map(|index| {
                let seed = 140 + index as u8;
                (ed25519::Pair::from_seed(&[seed; 32]).public().into(), 1)
            })
            .collect();
        let header = transition_header(2, *transition.parent_hash(), oversized_next, 0, false);
        let mut invalid = proof.clone();
        invalid.proofs[0] = TestWarpSyncFragment {
            header: header.clone(),
            justification: signed_justification(&header, &pairs_a, SET_ID),
        };
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &invalid.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::InvalidNextAuthoritySet { fragment: 0 },
        );
    }

    #[test]
    fn rejects_warp_fragment_target_and_signature_drift() {
        let (mut proof, authorities, _, transition, _) = warp_fixture(0, false);
        proof.proofs[0].header = TestHeader::new(
            2,
            *transition.extrinsics_root(),
            *transition.state_root(),
            H256::repeat_byte(90),
            transition.digest().clone(),
        );
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &proof.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::JustificationHeaderMismatch { fragment: 0 },
        );

        let (mut proof, authorities, _, transition, _) = warp_fixture(0, false);
        let outsider = ed25519::Pair::from_seed(&[99; 32]);
        proof.proofs[0].justification = signed_justification(&transition, &[outsider], SET_ID);
        assert!(matches!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &proof.encode(),
            ),
            Err(BridgeAuthorityTransitionError::InvalidJustification { fragment: 0, .. })
        ));
    }

    #[test]
    fn rejects_empty_noncanonical_unbounded_and_invalid_partial_warp_proofs() {
        let (_, authorities) = authority_pairs(21);
        let empty = TestWarpSyncProof {
            proofs: Vec::new(),
            is_finished: true,
        };
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &empty.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::EmptyProof,
        );

        let (proof, authorities, _, _, _) = warp_fixture(0, false);
        let mut noncanonical = proof.encode();
        let fragment_count = proof.proofs.len() as u16;
        assert_eq!(
            noncanonical[0],
            Compact(u32::from(fragment_count)).encode()[0]
        );
        let noncanonical_count = ((fragment_count << 2) | 1).to_le_bytes();
        noncanonical.splice(0..1, noncanonical_count);
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &noncanonical,
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::ProofDecode,
        );

        let (proof, authorities, _, _, _) = warp_fixture(0, false);
        let mut noncanonical = proof.encode();
        noncanonical.push(0);
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &noncanonical,
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::ProofDecode,
        );

        let oversized = vec![0u8; MAX_AUTHORITY_TRANSITION_PROOF_BYTES + 1];
        assert!(matches!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &oversized,
            ),
            Err(BridgeAuthorityTransitionError::ProofTooLarge { actual, max })
                if actual == MAX_AUTHORITY_TRANSITION_PROOF_BYTES + 1 && max == MAX_AUTHORITY_TRANSITION_PROOF_BYTES
        ));

        let (proof, authorities, _, _, _) = warp_fixture(0, false);
        let too_many = TestWarpSyncProof {
            proofs: vec![proof.proofs[0].clone(); MAX_AUTHORITY_TRANSITION_FRAGMENTS + 1],
            is_finished: false,
        };
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &too_many.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::TooManyFragments {
                actual: MAX_AUTHORITY_TRANSITION_FRAGMENTS + 1,
                max: MAX_AUTHORITY_TRANSITION_FRAGMENTS,
            },
        );

        let (mut incomplete, authorities, _, _, _) = warp_fixture(0, false);
        incomplete.proofs.remove(0);
        incomplete.is_finished = false;
        let (pairs_a, _) = authority_pairs(21);
        incomplete.proofs[0].justification =
            signed_justification(&incomplete.proofs[0].header, &pairs_a, SET_ID);
        assert_eq!(
            verify_grandpa_authority_transition_proof::<TestBlock>(
                SET_ID,
                &authorities,
                1,
                &incomplete.encode(),
            )
            .unwrap_err(),
            BridgeAuthorityTransitionError::IncompleteWithoutHandoff { fragment: 0 },
        );
    }

    #[test]
    fn verifies_signed_finality_and_exact_descendant_headers() {
        let fixture = Fixture::new();
        let proof = fixture.proof(3, SET_ID, vec![fixture.header(2), fixture.header(3)]);
        let verified = fixture.verify(1, &proof).unwrap();

        assert_eq!(verified.target_hash, fixture.header(3).hash());
        assert_eq!(verified.target_number, 3);
        assert_eq!(verified.proof, proof);
        assert_eq!(
            verified.justification.target(),
            (3, fixture.header(3).hash())
        );
    }

    #[test]
    fn matches_pinned_substrate_header_justification_and_message_bytes() {
        let fixture = Fixture::new();
        let proof = fixture.proof(3, SET_ID, vec![fixture.header(2), fixture.header(3)]);
        let primitive =
            PrimitiveGrandpaJustification::<TestHeader>::decode_all(&mut &*proof.justification)
                .unwrap();
        let wrapped: GrandpaJustification<TestBlock> = primitive.clone().into();
        let substrate_primitive = substrate_justification(&primitive);
        let local_header = fixture.header(3);
        let substrate_header = substrate_header(&local_header);
        let signed = &primitive.commit.precommits[0];
        let local_message: GrandpaMessage<TestBlock> =
            finality_grandpa::Message::Precommit(signed.precommit.clone());
        let substrate_message = sp_consensus_grandpa::Message::<SubstrateHeader>::Precommit(
            finality_grandpa::Precommit {
                target_hash: substrate_hash(signed.precommit.target_hash),
                target_number: signed.precommit.target_number,
            },
        );

        assert_eq!(wrapped.encode(), primitive.encode());
        assert_eq!(primitive.encode(), substrate_primitive.encode());
        assert_eq!(local_header.encode(), substrate_header.encode());
        assert_eq!(local_header.hash().0, substrate_header.hash().0);
        assert_eq!(
            (local_message, primitive.round, SET_ID).encode(),
            sp_consensus_grandpa::localized_payload(primitive.round, SET_ID, &substrate_message)
        );
        assert_eq!(
            proof.encode(),
            (
                proof.block,
                proof.justification.clone(),
                proof.unknown_headers.clone(),
            )
                .encode()
        );

        let (warp_proof, _, _, _, _) = warp_fixture(0, false);
        assert_eq!(
            warp_proof.encode(),
            substrate_warp_proof(&warp_proof).encode()
        );
    }

    #[test]
    fn matches_pinned_substrate_digest_and_authority_change_bytes() {
        let (_, authorities) = authority_pairs(21);
        let local_scheduled = ConsensusLog::ScheduledChange(ScheduledChange {
            next_authorities: authorities.clone(),
            delay: 3u32,
        });
        let substrate_scheduled = sp_consensus_grandpa::ConsensusLog::ScheduledChange(
            sp_consensus_grandpa::ScheduledChange {
                next_authorities: authorities
                    .iter()
                    .map(|(id, weight)| (ed25519::Public::from_raw(*id).into(), *weight))
                    .collect(),
                delay: 3u32,
            },
        );
        let local_forced = ConsensusLog::ForcedChange(
            8u32,
            ScheduledChange {
                next_authorities: authorities.clone(),
                delay: 5u32,
            },
        );
        let substrate_forced = sp_consensus_grandpa::ConsensusLog::ForcedChange(
            8u32,
            sp_consensus_grandpa::ScheduledChange {
                next_authorities: authorities
                    .iter()
                    .map(|(id, weight)| (ed25519::Public::from_raw(*id).into(), *weight))
                    .collect(),
                delay: 5u32,
            },
        );

        assert_eq!(local_scheduled.encode(), substrate_scheduled.encode());
        assert_eq!(local_forced.encode(), substrate_forced.encode());

        let local_digest = FrontierDigest {
            logs: vec![
                FrontierDigestItem::Other(vec![1, 2]),
                FrontierDigestItem::Consensus(GRANDPA_ENGINE_ID, local_scheduled.encode()),
                FrontierDigestItem::Seal(*b"TEST", vec![3, 4]),
                FrontierDigestItem::PreRuntime(*b"BABE", vec![5, 6]),
                FrontierDigestItem::RuntimeEnvironmentUpdated,
            ],
        };
        assert_eq!(
            local_digest.encode(),
            substrate_digest(&local_digest).encode()
        );

        let transition = transition_header(9, H256::repeat_byte(8), authorities, 0, false);
        let substrate_transition = substrate_header(&transition);
        assert_eq!(transition.encode(), substrate_transition.encode());
        assert_eq!(transition.hash().0, substrate_transition.hash().0);
    }

    #[test]
    fn zip215_verification_matches_pinned_sp_core() {
        let message = b"Frontier GRANDPA ZIP-215 differential";
        let pair = ed25519::Pair::from_seed(&[77; 32]);
        let canonical_public: AuthorityId = pair.public().into();
        let canonical_signature: AuthoritySignature = pair.sign(message).into();

        assert!(verify_zip215(
            &canonical_public,
            &canonical_signature,
            message
        ));
        assert_eq!(
            verify_zip215(&canonical_public, &canonical_signature, message),
            substrate_verify_zip215(canonical_public, canonical_signature, message)
        );

        let mut tampered_signature = canonical_signature;
        tampered_signature[0] ^= 1;
        assert!(!verify_zip215(
            &canonical_public,
            &tampered_signature,
            message
        ));
        assert_eq!(
            verify_zip215(&canonical_public, &tampered_signature, message),
            substrate_verify_zip215(canonical_public, tampered_signature, message)
        );

        let mut identity = [0u8; 32];
        identity[0] = 1;
        let mut identity_signature = [0u8; 64];
        identity_signature[..32].copy_from_slice(&identity);
        assert!(verify_zip215(&identity, &identity_signature, message));
        assert_eq!(
            verify_zip215(&identity, &identity_signature, message),
            substrate_verify_zip215(identity, identity_signature, message)
        );

        let mut noncanonical_identity = identity;
        noncanonical_identity[31] = 0x80;
        let mut noncanonical_identity_signature = [0u8; 64];
        noncanonical_identity_signature[..32].copy_from_slice(&noncanonical_identity);
        assert!(verify_zip215(
            &noncanonical_identity,
            &noncanonical_identity_signature,
            message
        ));
        assert_eq!(
            verify_zip215(
                &noncanonical_identity,
                &noncanonical_identity_signature,
                message
            ),
            substrate_verify_zip215(
                noncanonical_identity,
                noncanonical_identity_signature,
                message
            )
        );

        let mut noncanonical_scalar_signature = identity_signature;
        noncanonical_scalar_signature[32..].fill(0xff);
        assert!(!verify_zip215(
            &identity,
            &noncanonical_scalar_signature,
            message
        ));
        assert_eq!(
            verify_zip215(&identity, &noncanonical_scalar_signature, message),
            substrate_verify_zip215(identity, noncanonical_scalar_signature, message)
        );
    }

    #[test]
    fn verifies_direct_target_without_unknown_headers() {
        let fixture = Fixture::new();
        let proof = fixture.proof(3, SET_ID, Vec::new());

        fixture.verify(3, &proof).unwrap();
    }

    #[test]
    fn verifies_required_vote_ancestry_and_rejects_missing_forked_or_unused_headers() {
        let fixture = Fixture::new();
        let valid = fixture.proof_with_vote_ancestry(vec![fixture.header(4)]);
        fixture.verify(3, &valid).unwrap();

        let missing = fixture.proof_with_vote_ancestry(Vec::new());
        assert!(matches!(
            fixture.verify(3, &missing),
            Err(BridgeFinalityProofError::InvalidJustification(_))
        ));

        let fork_header = TestHeader::new(
            4,
            H256::repeat_byte(61),
            H256::repeat_byte(62),
            H256::repeat_byte(63),
            Digest::default(),
        );
        let forked = fixture.proof_with_vote_ancestry(vec![fork_header]);
        assert!(matches!(
            fixture.verify(3, &forked),
            Err(BridgeFinalityProofError::InvalidJustification(_))
        ));

        let unused = fixture.proof_with_vote_ancestry(vec![fixture.header(4), fixture.header(2)]);
        assert!(matches!(
            fixture.verify(3, &unused),
            Err(BridgeFinalityProofError::InvalidJustification(_))
        ));

        let duplicate =
            fixture.proof_with_vote_ancestry(vec![fixture.header(4), fixture.header(4)]);
        assert!(matches!(
            fixture.verify(3, &duplicate),
            Err(BridgeFinalityProofError::InvalidJustification(_))
        ));
    }

    #[test]
    fn rejects_outer_and_embedded_trailing_bytes() {
        let fixture = Fixture::new();
        let proof = fixture.proof(3, SET_ID, Vec::new());
        let canonical_length = Compact(proof.justification.len() as u32).encode();
        let noncanonical_length = (((proof.justification.len() as u32) << 2) | 2).to_le_bytes();
        let mut noncanonical = proof.encode();
        noncanonical.splice(32..32 + canonical_length.len(), noncanonical_length);
        assert!(matches!(
            verify_grandpa_finality_proof::<TestBlock>(
                fixture.header(3).hash(),
                3,
                SET_ID,
                &fixture.authorities,
                &noncanonical,
            ),
            Err(BridgeFinalityProofError::ProofDecode)
        ));

        let mut encoded = fixture.proof(3, SET_ID, Vec::new()).encode();
        encoded.push(0);
        assert!(matches!(
            verify_grandpa_finality_proof::<TestBlock>(
                fixture.header(3).hash(),
                3,
                SET_ID,
                &fixture.authorities,
                &encoded,
            ),
            Err(BridgeFinalityProofError::ProofDecode)
        ));

        let mut proof = fixture.proof(3, SET_ID, Vec::new());
        proof.justification.push(0);
        assert!(matches!(
            fixture.verify(3, &proof),
            Err(BridgeFinalityProofError::JustificationDecode)
        ));
    }

    #[test]
    fn rejects_wrong_set_authorities_and_insufficient_threshold() {
        let fixture = Fixture::new();
        let proof = fixture.proof(3, SET_ID + 1, Vec::new());
        assert!(matches!(
            fixture.verify(3, &proof),
            Err(BridgeFinalityProofError::InvalidJustification(_))
        ));

        let proof = fixture.proof(3, SET_ID, Vec::new());
        let mut wrong_authorities = fixture.authorities.clone();
        let outsider = ed25519::Pair::from_seed(&[99; 32]);
        wrong_authorities[0].0 = outsider.public().into();
        assert!(matches!(
            verify_grandpa_finality_proof::<TestBlock>(
                fixture.header(3).hash(),
                3,
                SET_ID,
                &wrong_authorities,
                &proof.encode(),
            ),
            Err(BridgeFinalityProofError::InvalidJustification(_))
        ));

        let proof = fixture.proof(2, SET_ID, Vec::new());
        assert!(matches!(
            fixture.verify(3, &proof),
            Err(BridgeFinalityProofError::InvalidJustification(_))
        ));
    }

    #[test]
    fn rejects_invalid_direct_finality_authority_sets() {
        let fixture = Fixture::new();
        let encoded = fixture.proof(3, SET_ID, Vec::new()).encode();
        let mut duplicate = fixture.authorities.clone();
        duplicate.push(duplicate[0]);
        let mut zero_weight = fixture.authorities.clone();
        zero_weight[0].1 = 0;
        let oversized = (0..=MAX_GRANDPA_AUTHORITIES)
            .map(|index| {
                let pair = ed25519::Pair::from_seed(&[(index + 1) as u8; 32]);
                (pair.public().into(), 1)
            })
            .collect::<AuthorityList>();
        let overflowing = vec![
            (fixture.authorities[0].0, u64::MAX),
            (fixture.authorities[1].0, 1),
        ];

        for authorities in [
            AuthorityList::new(),
            duplicate,
            zero_weight,
            oversized,
            overflowing,
        ] {
            assert_eq!(
                verify_grandpa_finality_proof::<TestBlock>(
                    fixture.header(3).hash(),
                    3,
                    SET_ID,
                    &authorities,
                    &encoded,
                )
                .unwrap_err(),
                BridgeFinalityProofError::InvalidAuthoritySet,
            );
        }
    }

    #[test]
    fn rejects_outer_target_drift_and_target_before_request() {
        let fixture = Fixture::new();
        let mut proof = fixture.proof(3, SET_ID, Vec::new());
        proof.block = fixture.header(2).hash();
        assert!(matches!(
            fixture.verify(3, &proof),
            Err(BridgeFinalityProofError::ProofTargetMismatch)
        ));

        let proof = fixture.proof(3, SET_ID, Vec::new());
        assert_eq!(
            fixture.verify(4, &proof).unwrap_err(),
            BridgeFinalityProofError::TargetBeforeRequest,
        );
    }

    #[test]
    fn rejects_missing_extra_reordered_and_fork_headers() {
        let fixture = Fixture::new();

        let missing = fixture.proof(3, SET_ID, vec![fixture.header(2)]);
        assert!(matches!(
            fixture.verify(1, &missing),
            Err(BridgeFinalityProofError::HeaderChainTargetMismatch)
        ));

        let extra = fixture.proof(
            3,
            SET_ID,
            vec![fixture.header(2), fixture.header(3), fixture.header(4)],
        );
        assert!(matches!(
            fixture.verify(1, &extra),
            Err(BridgeFinalityProofError::HeaderChainTargetMismatch)
        ));

        let reordered = fixture.proof(3, SET_ID, vec![fixture.header(3), fixture.header(2)]);
        assert_eq!(
            fixture.verify(1, &reordered).unwrap_err(),
            BridgeFinalityProofError::HeaderNumberMismatch { index: 0 },
        );

        let fork_header = TestHeader::new(
            2,
            H256::repeat_byte(44),
            H256::repeat_byte(45),
            H256::repeat_byte(46),
            Digest::default(),
        );
        let fork = fixture.proof(3, SET_ID, vec![fork_header, fixture.header(3)]);
        assert_eq!(
            fixture.verify(1, &fork).unwrap_err(),
            BridgeFinalityProofError::HeaderParentMismatch { index: 0 },
        );
    }

    #[test]
    fn rejects_nonempty_span_for_direct_target() {
        let fixture = Fixture::new();
        let proof = fixture.proof(3, SET_ID, vec![fixture.header(4)]);
        assert!(matches!(
            fixture.verify(3, &proof),
            Err(BridgeFinalityProofError::HeaderChainTargetMismatch)
        ));
    }

    #[test]
    fn rejects_unbounded_proof_bytes_and_header_count() {
        let fixture = Fixture::new();
        let oversized = vec![0u8; MAX_FINALITY_PROOF_BYTES + 1];
        assert!(matches!(
            verify_grandpa_finality_proof::<TestBlock>(
                fixture.header(3).hash(),
                3,
                SET_ID,
                &fixture.authorities,
                &oversized,
            ),
            Err(BridgeFinalityProofError::ProofTooLarge { actual, max })
                if actual == MAX_FINALITY_PROOF_BYTES + 1 && max == MAX_FINALITY_PROOF_BYTES
        ));

        let proof = fixture.proof(3, SET_ID, vec![fixture.header(2); MAX_UNKNOWN_HEADERS + 1]);
        assert_eq!(
            fixture.verify(1, &proof).unwrap_err(),
            BridgeFinalityProofError::TooManyHeaders {
                actual: MAX_UNKNOWN_HEADERS + 1,
                max: MAX_UNKNOWN_HEADERS,
            },
        );
    }
}
