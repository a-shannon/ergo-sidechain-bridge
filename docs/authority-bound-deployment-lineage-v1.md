# Authority-Bound Deployment Lineage V1

## Purpose

Authority-Bound Deployment Lineage V1 reconstructs the complete observable
`SERG` and `ErgoBridge` history from the token pre-deployment parent through one
terminal execution block. The terminal execution identity must be the exact tip
of a same-process Deployment Identity Observation V1 candidate and must also be
bound by a native finalized checkpoint produced through the exact
source-refreshed, contained execution authority relative to a reviewed GRANDPA
trust root. A direct-process verifier result is insufficient.

The output is a non-authorizing assessment. It can reject incomplete or
contradictory deployment history, but RPC agreement does not prove historical
receipt or state completeness. No mint, settlement, signing, submission, or
broadcast capability follows from this assessment.

## Interval

The interval is inclusive and ordered:

1. token pre-deployment parent;
2. token deployment;
3. bridge deployment;
4. token ownership transfer to the bridge;
5. every intervening execution block;
6. the finalized terminal execution block.

Starting at bridge deployment is insufficient. `SERG` exists first and is
initially controlled by its deployer, so a mint before bridge deployment or
before ownership transfer would otherwise be omitted.

The interval is bounded. A longer history must be split into explicitly linked
windows rather than weakening completeness or allowing unbounded RPC work.

## Reviewed Profile

The source-owned profile binds, at minimum:

- an explicit non-mainnet scope;
- the EVM chain ID;
- the Substrate genesis identity;
- the reviewed native checkpoint hash and height;
- the GRANDPA trust-root digest and authority-set identity;
- token and bridge addresses;
- token pre-deployment parent identity;
- token and bridge deployment heights, block hashes, and transaction hashes;
- the maximum accepted interval size.

Unknown profile versions or profile digests fail closed. The repository may
carry an inert conformance profile, but no live deployment becomes reviewed by
runtime configuration or operator input.

## Observed History

Two distinct credential-free HTTP(S) origins are queried through a fixed,
read-only JSON-RPC surface. Every state read uses an exact canonical block-hash
selector. Each block binds a canonical normalized observation digest covering
the validator-consumed transaction fields, one normalized receipt identity and
status per transaction, every receipt log, indexed relevant logs, runtime code,
and exact encoded state-call results. Fields outside that normalized deciding
schema are neither compared nor claimed. Both bounded views must agree before a
lineage candidate can be emitted. The chain head may advance while the bounded
interval is read, but it must continue to cover the reviewed terminal height
and the exact terminal block hash is fetched again before acceptance. A rollback
below that height or a replacement of that block fails closed.

The collector also enforces fixed per-response and per-source cumulative byte
limits, bounded byte fields, per-block and total transaction/log limits, a
request-count ceiling, receipt concurrency, and one operation-wide deadline.
One source pair permits only one active observation. A failure cancels its peer
and stops new receipt work before the pair can be reused. These controls bound
the observer's exposure to a malformed or hostile RPC origin; they do not make
that origin authoritative.

The reconstruction covers:

- contiguous block number, hash, and parent-hash identity;
- successful token and bridge creation receipts;
- exact tracked creation and runtime bytecode;
- empty code before each deployment and continuous exact code afterwards;
- bridge token binding;
- token and bridge owner state;
- all `OwnershipTransferred` events and owner-state continuity;
- all token `Transfer` mint and burn events;
- all bridge `PegIn` events;
- successful top-level calls to the direct token mint entrypoint;
- `processedPegIns` state for every observed peg-in;
- token `totalSupply` and exact per-block supply deltas.

Each token mint must pair one-to-one with a bridge `PegIn` in the same
transaction and bind the same recipient and amount. Each per-block supply
change must equal the sum of token mints minus token burns recorded in that
block. A successful top-level direct `SERG.mint` call is rejected.

## Producer-To-Consumer Matrix

| Producer | Exact fields | Consumer | Deciding authority | Failure if relaxed |
|---|---|---|---|---|
| Source-owned lineage profile | Scope, EVM chain ID, Substrate genesis, GRANDPA checkpoint and trust digest, addresses, deployment coordinates, interval bound | History collector and finality join | Reviewed profile registry | Runtime input could approve its own chain, trust root, or deployment. |
| Deployment Identity Observation V1 | Candidate digest, source IDs, terminal height/hash, addresses, runtime digests, bridge token binding, current owners | Terminal lineage binding | Same-process provenance plus exact equality | Serialized or point-in-time data could be substituted as historical authority. |
| Tracked Solidity build closure | Manifest digest, creation/runtime bytes and decoded hashes | Deployment and continuous-code checks | Validated repository build closure | Familiar addresses could run unrelated or changed bytecode. |
| Native finalized checkpoint | Sidechain ID, trust-anchor digest, native target, execution hash and height, authority declaration digest | Terminal finality binding | Exact source-refreshed execution-authority provenance | A caller-selected direct process, depth, or RPC agreement could be mislabeled as GRANDPA finality. |
| Execution block lineage | Height, hash, parent hash, validator-consumed transaction fields, one normalized receipt identity/status per transaction, and every receipt log | Per-block reconstruction | Bounded two-source observation agreement | Omitted or replaced blocks could hide a code, owner, or supply transition. |
| Contract logs and block-hash state reads | Ownership, PegIn, Transfer, processed flags, owners, token binding, supply | Mint and conservation reconciliation | Deterministic lineage validator | Direct mint, missing event, transient owner drift, or supply inflation could be hidden. |
| Two-source agreement | Per-block normalized observation digests, semantic assessments, totals, and opaque source IDs | Non-authorizing lineage candidate | Equality only | One source could hide a contradictory transaction, receipt, log, code, or state response. |

## Fail-Closed Cases

The observer rejects at least:

- unknown or forged profile, deployment candidate, artifact, checkpoint, or
  execution-authority provenance;
- a direct-process checkpoint without source-refreshed contained execution;
- wrong chain, genesis, trust root, terminal height, or execution hash;
- aliased sources, source disagreement, rollback below the terminal height, or
  terminal-block replacement;
- missing, duplicated, non-contiguous, or wrongly parented blocks;
- wrong deployment block, transaction, receipt, address, or creation bytes;
- code present before deployment, absent after deployment, changed, or reverted;
- ownership events that do not form one continuous state transition;
- owner state that disagrees with the final event in a block;
- bridge token binding drift;
- successful direct token mint calls;
- unpaired or mismatched mint and peg-in events;
- peg-ins without processed replay state;
- per-block or terminal supply disagreement;
- malformed, missing, duplicated, or cross-block receipts and logs;
- oversized RPC responses or byte fields, excessive block/transaction/log
  counts, cumulative response bytes, request-budget exhaustion, concurrent pair
  reuse, or operation deadline expiry.

## Claim Boundary

The finalized terminal execution hash proves only the terminal commitment
accepted by the native finality verifier. Standard Frontier RPC responses do
not, by themselves, prove historical receipt-trie membership, state-trie
membership, or completeness against every intermediate execution root.

Therefore this slice keeps the following false:

- historical receipt/state proof completeness;
- independently authenticated historical absence;
- Ergo `0x04` anchor acceptance;
- committed-vault and cutover eligibility;
- mint and reconciliation-hold-release authority;
- settlement, signing, submission, and broadcast authority;
- Gate 5 closure and production readiness.

The next authority-bearing join must authenticate the deciding historical
receipts and state against execution roots committed by the finalized native
chain, then bind the result to committed-vault eligibility and the existing
mint admission path. It must not replace proof verification with SQLite state,
confirmation depth, or two-source agreement.
