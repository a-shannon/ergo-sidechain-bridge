# EVM Developer Showcase - Sidechains Settled on Ergo

> Audience: Solidity, OP Stack, Polygon CDK, Arbitrum Orbit, Substrate/Frontier, and rollup infrastructure developers.

## Why This Exists

If you are an EVM developer, the goal is not to make you become an ErgoScript specialist before you can build a sidechain.

The goal is to show that you can keep the familiar application layer:

- Solidity contracts
- ERC-20 style wrapped assets
- MetaMask-compatible RPC
- Substrate/Frontier runtime modules
- normal EVM events and indexing

while using Ergo as a settlement layer for the parts where Ergo is unusually strong:

- explicit state boxes
- authenticated read-only state
- compact AVL proofs
- batch settlement
- parallel settlement lanes
- subblock-ready UX
- a committee-to-SPV trust roadmap

This repository should feel like a bridge kit, not a research puzzle.

## The Mental Model

| If you know this from EVM | The Ergo-side concept | Why you should care |
|---------------------------|-----------------------|---------------------|
| Contract storage slot | Box register | State is explicit, inspectable, and consumed only when intentionally updated |
| Contract address identity | Singleton NFT inside a box | State-machine identity is a token, not just an address |
| Calldata | Context extension vars | Proofs and per-claim data can be passed to a transaction without bloating persistent state |
| Read-only call | DataInput | A transaction can read authenticated state without consuming it |
| Mapping root / Merkle root | AVL digest | Large sets can be verified on-chain with compact proofs |
| Replay protection mapping | DUP AVL tree | Burn IDs can be marked spent without storing every ID in contract storage |
| Batch withdraw | Batch unlock transaction | Many exits can be settled in one Ergo transaction |
| Sharded contracts | Sharded boxes | Parallelism comes from independent boxes, not from one global mutable account |

## What Stays Familiar

On the sidechain side, developers can stay in their usual world:

- write Solidity
- deploy an ERC-20 representation of bridged ERG
- emit burn events
- index events
- use Substrate/Frontier for EVM compatibility
- integrate wallets and dApps using familiar JSON-RPC tooling

The Ergo-specific work is packaged into reusable open-source components:

- ErgoScript contracts in `contracts/`
- deployment scripts in `relayer/src/scripts/`
- TypeScript transaction builders in `relayer/src/`
- WASM AVL proof generation in `wasm-avl/`
- live spike scripts under `relayer/src/scripts/spikes/`
- phase walkthroughs under `phases/`

## What Ergo Adds

### 1. Settlement State That Is Easy To Audit

Ergo's eUTXO model makes every important bridge state cell visible:

- liquidity boxes
- sidechain state singleton
- double-unlock prevention singleton
- SPV tracker singleton
- batch unlock boxes

For an EVM team, the useful translation is:

> Instead of hidden mutable contract storage, the critical state is a set of typed boxes with explicit transition rules.

That makes demos, audits, and incident debugging much easier to explain.

### 2. Native Fit For Authenticated Sets

The bridge relies on AVL digests and proofs for:

- burn replay prevention
- SPV tracker entries
- batch insert proofs
- lookup and non-membership checks

The important point for an EVM developer:

> You can keep large state off-chain, commit the digest on Ergo, and prove individual facts only when a settlement transaction needs them.

That is exactly the kind of pattern bridge and rollup teams already understand from Merkle roots, but with Ergo-native verification patterns.

### 3. Batch Settlement Without Hiding The State Machine

The current prototype has:

- single-claim settlement as fallback
- batch aggregate settlement behind `AGGREGATE_BATCH_ENABLED`
- up to 10 payouts in one batch unlock transaction
- up to 20 burn IDs in one batched DUP update

The "wow" moment should be visible in a benchmark:

> One Ergo transaction can verify multiple sidechain exits, update replay protection once, and pay multiple users.

### 4. Parallelism Through Boxes

In an account-based contract, one contract's storage can become the natural bottleneck.

In Ergo, we can design for independent lanes:

- DUP shard 0, DUP shard 1, ...
- liquidity lane A, liquidity lane B, ...
- future tracker lanes if needed

The developer-facing message:

> Scaling does not require pretending one state object can be mutated by everyone at once. Split the state into independent boxes and settle lanes in parallel.

The prototype should eventually show two independent settlement lanes building and validating in the same test run.

### 5. Subblock-Ready UX

Ergo subblocks should make inclusion/failure feedback faster while ordering blocks remain the conservative finality layer.

For bridge UX, that means:

- fast "seen/included" signal
- conservative "economically final" signal
- clearer progress states for users
- faster operator response to conflicts or failed settlement attempts

The docs must not oversell this as instant finality. The accurate message is:

> Subblocks improve responsiveness; ordering blocks still govern final settlement confidence.

### 6. Trust Roadmap Instead Of Trust Theater

The prototype should be honest:

- Today: local signer / committee model for pragmatic testnet progress.
- Phase 010a/010b: on-chain `atLeast()` committee and governance.
- Phase 011: SPV relay / burn proofs using sidechain commitments.
- Later: stronger validator coordination and possibly FROST if it becomes worth the complexity.

The advantage is not "already trustless today".

The advantage is:

> The prototype has a clear path from pragmatic committee settlement toward proof-based settlement, and it is already structured around proof objects rather than opaque operator promises.

## The Demo Should Produce Three Reactions

### Reaction 1: "I can keep my EVM app."

Show a Solidity app or ERC-20 flow on Frontier. The sidechain developer should not feel that they are leaving their normal stack.

### Reaction 2: "The Ergo side is pre-packaged."

Show that the scary eUTXO parts are already wrapped:

- compile contracts
- deploy contracts
- build proof data
- assemble transactions
- sign locally
- run batch settlement
- inspect state

### Reaction 3: "This gives me a different scaling lever."

Show that settlement throughput can be improved by:

- batching claims
- splitting liquidity boxes
- sharding DUP state
- using subblock-aware monitoring

That is the part that should feel different from simply deploying another EVM bridge contract.

## Developer-Facing Deliverables

Phase 011b should produce:

1. A one-command local demo for EVM developers.
2. A walkthrough that never assumes prior ErgoScript knowledge.
3. A batch-vs-single benchmark table.
4. A sharded settlement design note.
5. A glossary mapping EVM concepts to Ergo/eUTXO concepts.
6. A diagram showing sidechain app layer, relayer/prover layer, and Ergo settlement layer.
7. A clear limitations section.

## Suggested Landing Page Copy

> Bring your Solidity app to a Substrate/Frontier sidechain. Settle on Ergo. Use Ergo's eUTXO model for explicit settlement state, AVL proofs for compact bridge verification, batched exits for cheaper L1 settlement, and subblock-ready monitoring for fast user feedback.
>
> You keep the EVM developer experience. The prototype gives you the Ergo settlement machinery.

## What We Should Avoid Saying

Do not claim:

- "Ergo is faster than Base" without a carefully scoped benchmark.
- "Trustless bridge" before Phase 011 proves the burn verification path.
- "No tradeoffs" compared to Ethereum/Base.
- "Production-ready" while the prototype still uses testnet assumptions.

Say instead:

- "Base-like application familiarity, different settlement layer."
- "Committee today, proof-oriented architecture for tomorrow."
- "Batching and eUTXO lanes demonstrate the scaling path."
- "Open-source reference implementation for sidechain teams."
