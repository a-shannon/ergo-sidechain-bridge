# Bridge Execution Plan

This is the canonical continuation plan for the Ergo sidechain bridge. It turns
the roadmap into outcome-based work packages that can span multiple commits and
multiple Codex continuations without losing the critical path.

The target is an auditable, reproducible open-source reference stack that an
institution can use as the engineering base for its own Ergo-settled sidechain.
It is not a production-ready or mainnet-readiness claim.

## Execution State

| Field | Current value |
|---|---|
| Active work package | **WP-06-FED - EIP-independent federated reference profile.** Deliver a complete, funds-safe bridge path under an explicit, versioned federation trust model. Reuse the reviewed commitment, application-binding, conservation, replay, cutover, and lifecycle invariants, but create new federated statement/profile domains wherever authority semantics differ. Do not restore unrestricted owner minting, the historical fee-from-backing payout, overlapping source-lock branches, timeout payout after burn disappearance, single-attestor legacy R9 admission, or route-local replay cutover. This track may become a usable institutional reference profile, but it is never labelled trustless. |
| Active internal slice | **FED-6-LAB - federated peg-out campaign.** The peg-in campaign is closed through commit `da2f99d9`. The current peg-out checkpoint adds a source-locked Rust TestClient producer that deploys the reviewed SERG/bridge application, consumes one reservation into mint, executes the real `approve` and `pegOut`, decodes the emitted ABI log, and verifies the runtime burn leaf/root plus supply and fee conservation. A pure TypeScript consumer independently rebuilds the proof-relevant transcript against exact patch bytes. The immediate next boundary is one same-process runner that applies/builds/executes that producer and consumes its stdout without accepting caller-supplied provenance. Global replay insertion, Ergo payout, confirmation and recovery remain later joins. The disclosed source finality remains a dual-RPC depth policy and does not authenticate Ergo proof of work. This lane is self-operated research evidence only: it does not establish complete receipt topology, independent custody, external review, Gate 5, trustless status, deployment readiness or support for public funds. |
| Public coordination | Public `main` is protected by both required CI jobs, one approving review from someone other than the last pusher, stale-review dismissal, conversation resolution, linear history and disabled force-push/deletion. [Issue #1](https://github.com/a-shannon/ergo-sidechain-bridge/issues/1) owns independent review of exact commit `ee0686b84483e6f0af85c764e93b8a43383cc54a`; [issue #2](https://github.com/a-shannon/ergo-sidechain-bridge/issues/2) owns external target and custody evidence for a later independently operated FED-6 campaign. Private vulnerability reporting is enabled. The public issues remain parallel assurance lanes and do not authorize or describe FED-6-LAB. |
| Frozen upgrade track | **WP-06-STARK - Ergo-verifiable finality / EIP-0045 STARK upgrade.** The V4/V5/V6 proof and cutover artifacts through commit `d7420756` remain frozen. Resume only when an activated compatible target can execute the exact verifier profile and no-submit acceptance route. The absence of an activated EIP-0045 verifier or equivalent reviewed Ergo-verifiable consumer blocks the trustless upgrade, not WP-06-FED or the bridge reference implementation as a whole. |
| WP-08F state | The original WP-08F exact-envelope lifecycle contained the relayer owner-mint capability but still left an executable owner-mint signing operation and transport. P1-LR1 supersedes that containment by removing the owner-mint envelope/signing methods, submitter, adapter, application root, executor, daemon composition, and journal APIs that could create a new owner-mint attempt. The supported `deploy:sidechain` command and script are removed, `SidechainClient` is observation-only, the Frontier extraction spike is synthetic-only, and active readiness preflights reject historical owner-mint deployments even when their code is present. Peg-in stops after exact committed-vault verification and waits for an authenticated V4 pending reservation and atomic runtime consumption; only historical transaction confirmation/reconciliation remains. The historical Solidity owner entrypoint, historical deployments, and protocol funds authority are not removed by this change and remain outside its claim boundary |
| WP-08G state | **Hosted closure complete for the promoted research-alpha bytes.** The auditor package has a tracked `public-research-alpha` manifest, exact critical/high gap ownership, one offline `audit:alpha` command, auditor-first documentation, dual-layout source-lock verification, standalone-compatible recursive CI and explicit runtime-state exclusion. Public `main` commit `ee0686b84483e6f0af85c764e93b8a43383cc54a`, tree `da384d215ddbd87a23595fd871dd7d5c917502bd`, passed exact hosted run `32009155091`: both the recursive consensus-source rebuild and complete audit gate succeeded. WP-08J adds the local alert drill and inert reviewed runbook references; WP-08K adds a separately invoked bounded HTTPS worker and authenticated acknowledgement audit path. WP-08L packages the Apache-2.0 repository license and explicit third-party boundaries. The legacy cutover inventory derives every state-mutating `ErgoBridge` function from the tracked compiled ABI and explicitly includes the permissionless `pegOut(uint256,bytes)` surface, so an omitted or newly added mutable bridge entrypoint fails closed. Every later promoted milestone must preserve the claim boundary and obtain its own applicable exact-input promotion evidence. Supported release status remains blocked. The package does not provide evidence of delivery to a reviewed external target, a real operator acknowledgement, current-HEAD non-mainnet recovery, complete independent review, Gate 5 closure or any live funds capability |
| WP-08H state | One config-free recovery command executes an exact seven-case matrix through existing application roots and ports. It covers durable SQLite reopen, deletion of a lifecycle-bearing database, an already recovery-required copied state against a strictly later snapshot, deterministic RPC disagreement, exact out-of-order source/mint/candidate/confirmation rejection, post-mint source restoration, peg-out burn reorg, aggregate pre-finality rollback and an injected incident-persistence port failure followed by reopen and retry. Every case uses real ephemeral SQLite close/reopen or deletion boundaries. Four funds/release/reservation methods are trapped and remain at zero; network, private-runtime-state, environment, deployment-state, checker, signer, authorization, submission, broadcast and hold-clearing capabilities are not wired by the drill composition and are checked separately at its root and incident-only module boundary. Clean-copy location binding remains in the StateTracker negative matrix. Chain observations are deterministic fixtures; the drill is not child-process or live recovery evidence, source consensus, a hold-clearing procedure, Gate 5 closure, trustless status or readiness |
| WP-08I state | The bridge-local recursive workflow carries exact `audit-alpha` and `consensus-sources` jobs. It restores the existing gitlink, verifies the canonical source lock and Solidity identities, applies only the two locked patches, runs the Frontier commitment/finality/state/checkpoint matrices and node build, runs the Ergo extension test and assembly, then rechecks both source trees. The audit job disables pre-verification npm caching, copies the locked Node 24.18.1 executable and npm package into an isolated runner-temporary directory, removes only the exact known `prefix=${APPDATA}\npm` hosted-toolcache overlay after checking its type and bytes, and verifies the complete copied Node/npm closure before first invoking that copy. The Linux job builds the checkpoint verifier and RPC codec from the already locked patched Frontier checkout and runs the cross-language vector in a supplied-executable conformance mode that cannot be confused with the Windows pinned-local build profile. `sources:verify:workflow` binds both exact ordered job graphs, including the audit runtime-isolation digest and executable paths, and rejects moving or foreign inputs, injected environment or step keys, superproject paths, secrets, and live-capability commands. The supplied executable paths are canonicalized and hashed before and after use, but this is not atomic file-descriptor attestation; the hosted runner is treated as a fresh, non-adversarial execution environment. Exact hosted run `32009155091` is retained as separate reproducibility evidence for the promoted commit. No profile activation, deployment identity, Gate 5 or readiness claim follows |
| WP-08J state | One versioned static alert profile derives a stable condition digest plus a distinct occurrence identity bound to the reconstructible-cache generation and occurrence-open time. One outstanding event is retained until terminal delivery, so a failed incident cannot be replaced by a later update or recovery; lease expiry uses explicit at-least-once semantics. A reconstructible SQLite cache stores only ordered delivery metadata and the immutable event payload. The daemon supports its bounded local structured-log sink and now only enqueues immutable events for the separate WP-08K worker; it never performs external transport. The static action catalogue returns inert reviewed runbook references and exposes no callback or capability to clear holds, rewrite lifecycle, check, sign, reserve, submit, broadcast, or authorize funds. `operator:drill:alerts` covers creation, deduplication, injected failure, retry, restart, and stale/recovered transitions locally. Real external delivery, real operator acknowledgement, live recovery, Gate 5, publication and readiness remain unproven |
| WP-08K state | A separate one-shot worker claims the oldest non-delivered immutable alert from a reconstructible SQLite outbox with lease-expiry recovery, compare-and-swap transitions, ordered at-least-once retry and a stable alert-ID idempotency key, then sends only to a credential-free HTTPS endpoint with bounded timeout and response size. The daemon attempts outbox enqueue before its local sink; an outbox failure remains retryable but does not suppress local alert visibility, and the daemon never imports HTTP, acknowledgement or worker modules. Complete outbox loss can reconstruct the retained current alert only; it cannot restore historical delivery or acknowledgement records and never reconstructs lifecycle or funds authority. A static Ed25519 registry verifies versioned acknowledgement bytes against the exact delivered alert, event digest, endpoint-bound local delivery-receipt digest, key ID, nonce and time bounds before storing append-only audit metadata. Optional authorization is accepted only when configured for that exact endpoint identity. Acknowledgement cannot clear holds, mark recovery complete, mutate incidents, select lifecycle, check, sign, reserve, submit, broadcast or authorize funds. Local tests establish implementation behavior only; reviewed target custody, credential/key operations, actual external delivery, a real authenticated operator acknowledgement and current-HEAD non-mainnet recovery evidence remain blocked |
| WP-01C state | The committed-vault mint path and V4 dual-source observer now serialize the claimed Ergo header with the pinned v6.0.2 consensus format, recompute its Blake2b-256 ID, recompute the complete Scorex transaction root from canonical transaction IDs and signed witness bytes, bind the header and transaction-section versions and identities, and require the target signed transaction exactly once before persistence or mint progression. Exact per-source verification receipts survive observation, fresh revalidation and mint-candidate digesting. RPC inability or inconsistency holds the lifecycle without terminal mutation; strict observer candidates reject any header, root, version, witness, duplicate, or non-target transaction drift. This authenticates the header and transaction bytes only: it does not independently establish PoW validity, canonical consensus, source independence, activation, mint authority, Gate 5 closure, trustless status, or readiness. |
| WP-01D semantic-join state | The process-owned compatibility statement, reconstructible packet, `E2SARW01` relay witness, `E2STXW01` signed-transaction witness and V2 runtime-derived statement remain byte-for-byte frozen and non-authorizing. A distinct `E2UTXW01` envelope binds one 33-byte UTXO root, exact vault/source keys, the complete 175-byte vault value and one bounded batch proof; TypeScript and source-locked `no_std` Rust independently enforce bounded panic-free framing and replay exact vault membership followed by refundable-source non-membership. A separate 588-byte V3 statement binds the verified UTXO result to the selected relay header, exact transaction-derived vault/source identities and the recomposed V2 statement ID. A dedicated static adapter keeps its HTTP client closure-private, exposes only fixed best-header GET and two-key proof POST methods, and brands only captures made through that port. Relayer-core separately verifies the supplied before/proof/after tuple and resulting `E2UTXW01` while recording node-adapter authority as false. A canonical retained-packet schema now stores and digest-binds the exact target header, transaction parser profile, transaction witness and UTXO witness; JSON round-trip replay reproduces the same capture digest but intentionally does not persist process-local node provenance. A separate supplied-branch composition reparses a later `E2SARW01`, requires the retained target at policy depth on its selected greatest-work branch among all supplied branches, and rebuilds the exact V3 statement. Normal and V4 runtimes remain statically rejecting, and no dispatchable, storage transition, reservation, EVM call, daemon, mint or funds route consumes either result. External checkpoint authentication, proof that the configured source set supplied the required branch view, global canonical consensus, transaction execution, deployment lineage, target acceptance, mint authority, Gate 5, trustless status and readiness remain open. |
| WP-07 containment state | Commits `992be302` and `92915d27` bind canonical peg-in receipts and post-mint continuity incidents to restart-safe state, then place every active local daemon and settlement-CLI value-release route behind one exclusive execution epoch and exact funds-release state digest. Database copying, loss, rollback, RPC disagreement, post-mint source restoration, partial incident writes, and dangling hold-path entries fail closed. This checkpoint is local process/filesystem containment only: it is not an on-chain or global pause, does not retire a historical runtime or the Solidity owner entrypoint, does not disable Root/Sudo or legacy committee/R9 authorities, and exposes no supported recovery or hold-clearing command. The separate locked Frontier source now blocks owner-key-only mint for its exact inherited bridge address |
| WP-07A-DN1 state | Complete as a local non-authorizing recovery campaign. The exact process-provenant Frontier read agreement projects through one shared application boundary into the complete reconstructible burn inventory consumed by both normal processing and database-loss recovery. A recovery preflight rejects a chain spec unless `manualSeal.enable=true` at genesis; the source-locked wrapper derives a distinctly named/protocol-bound drill spec from the accepted target spec, revalidates it through the same exact binary, and never relabels it as the accepted Aura target. The owned lifecycle captures initial, lag-recovered, restarted and replacement snapshots; requires an empty pool before every seal; proves each recovery block has no execution transaction; preserves the finalized anchor; and rejects one deterministic dual-source disagreement. The campaign then physically deletes and recreates one ephemeral database, proves its sentinel is absent, reconstructs the exact inventory under the continuity hold, and reopens the replacement database. Campaign digest `8064efe244a4a1702c019e55763bcd688f3a00cd272783f7ecc1288205a992b08` binds the source-locked acceptance, accepted-target and recovery-drill identities, exact process provenance, complete lifecycle, timeline, inventory and database lifecycle. All checker, signing, submission, transport, broadcast, mint, payout and funds-authority boundaries remain false. |
| Independent funds-safety audit | The relayer can no longer create, sign, reserve, submit, or broadcast a new owner-mint transaction; its legacy mint state is retained only for exact historical confirmation/reconciliation. The supported owner-mint deployment command and script are also removed. The direct `redeploy-mcl.ts` utility that loaded environment configuration, compiled the historical MCL against a node and rewrote deployment state is physically absent together with its ignored `dist` artifacts; all five paths are pinned into the compatibility source-closure rejection set. The three historical aggregate VM spikes that derived a local signer and posted setup transactions directly to `/transactions` are also physically absent with their twelve ignored `dist` artifacts; all fifteen paths are pinned into the compatibility source-closure rejection set. The three earlier AVL tracker, DUP batch and SPV tracker VM spikes with the same direct signer/setup-broadcast capability are likewise absent with their twelve ignored `dist` artifacts and fifteen guarded paths. The historical Phase C ContextExtension evaluator and its four ignored `dist` artifacts are also absent and guarded because it derived a mnemonic-backed signer and posted a setup transaction directly; its recorded `getVar[Coll[Byte]]` result remains historical evidence while current safety is owned by the fail-closed ContextExtension guard and authenticated VM/JVM conformance paths. The standalone `test-dup-e2e.ts` utility and its four ignored `dist` artifacts are absent and guarded because it read local deployment state and signer material, then spent the configured DUP singleton with a synthetic burn ID through the generic broadcast facade. It had no package command or test consumer. No executable broadcast-capable spike or orphan DUP mutation utility remains at those paths. The supported reward consolidator is now confined to one explicit credential-free loopback patched-stack origin on port `9051`, network `devnet`, and a caller-pinned height-1 session header. It accepts only the exact signer-derived delay-1 reward proposition, builds one deterministic same-owner pure-ERG zero-fee sweep, requires exact node check acceptance, revalidates every selected source after checking and immediately before a digest-bound authorization, and durably reserves the exact transaction before transport. The journal binds the normalized node origin, network, height-1 anchor, signer/reward identity and destination under one canonical session digest. Accepted and ambiguous outcomes remain restart-blocking until that exact session observes the exact transaction at ten canonical confirmations. Every later run rechecks all confirmed history before planning, and no reward box recorded by any prior attempt may be selected again, so a rolled-back shallow or deep transaction cannot silently authorize an automatic replacement. This remains a local-devnet funding utility; the session header and ten-block policy are operator-supplied local identity and depth assumptions rather than authenticated consensus, and neither the journal nor any local status grants bridge funds authority, Gate 5 evidence, or a readiness claim. These removals close local provisioning and devnet-broadcast capabilities only; they do not retire an already deployed MCL, tracker, DUP or aggregate settlement route, establish global replay migration, or resolve the upstream ContextExtension serialization blocker. Separately, the owner-key-only mint bypass is closed in the locked local runtime source for an exact inherited bridge address, and exact V4 activation now requires that address to match the reviewed profile before atomically removing Sudo and installing sticky enforcement. The inactive V4 runtime additionally requires one exact direct-parent reservation. The Solidity owner entrypoint and any historical deployments still exist as audit concerns, and deployment lineage must prove that the inherited address, bridge code, token address and mint authority cover every historical liability-bearing minter and that no historical runtime retaining the old policy can authorize funds. Preactivation or historical Root/Sudo raw-storage and runtime-upgrade authority remains a blocker until the deciding state proof authenticates its absence and the deployment lineage proves the reviewed transition ran. The fee-from-backing predicate remains present in the legacy V1 bytes, so the programmatic execution module, daemon submission composition, CLI submit commands, signer/authorization adapters, and transport entrypoints for new V1 aggregate payouts are physically absent. Non-broadcast diagnostics and confirmation/reconciliation of historical attempts remain available. The separately versioned external-fee profile closes local construction and predicate acceptance only and remains inactive. The P2 commit/refund overlap and P3 refund residual are closed only in the separate V4 source-lock family; the historical MCL remains unchanged and unsafe for new activation. P1 follow-ups are canonical Ergo consensus for mint admission, application-bound sidechain finality, authenticated Sudo absence, one global DUP lineage across profile cutover, and permanent retirement of every legacy funds route. These findings prevent any trustless or production-readiness claim |
| P0/P1 authority-switch blockers | The default owner-mint deployment surface is quarantined: the `deploy:sidechain` command and script are absent, `SidechainClient` has no signer or write method, the Frontier extraction spike is synthetic-only, active preflights reject historical owner-mint metadata and code, and historical runbooks no longer present the route as executable. This does not remove `ErgoBridge.mintSERG` from historical Solidity or prove any historical deployment retired. The distinct V4 proof core proves the exact runtime profile, enforcement state, `BridgeAddress`, runtime `:code` and bridge commitment under one GRANDPA-finalized state root, but only relative to its supplied reviewed trust anchor and frozen local semantics. The locked source now makes exact V4 activation contingent on `BridgeAddress == profile.bridge_address`, performs every fallible check before mutation, removes the Sudo key, then installs the exact profile and sticky-enforcement state. Runtime negatives prove that absent/mismatched addresses preserve profile, enforcement and Sudo; the runtime positive rejects the former Sudo holder's retarget/raw-storage/runtime-upgrade calls, while the node positive observes Sudo absent after real nested activation. The current V4 state proof does not yet authenticate Sudo-key absence, and no deployed transition, other Root-origin inventory, historical retirement or target acceptance has been observed. No real receipt is consumed by an activated tracker, Ergo runtime, daemon, or funds route. None of these findings proves a live deployment is exposed because deployment state was not inspected. They block funds authority, Gate 5, trustless status and readiness |
| P1 V4 burn statement state | Rust and TypeScript now share one exact golden vector for the new 485-byte application binding, 980-byte public-input payload and 1,139-byte EIP-0045 statement. The binding commits to the canonical V4 mint-reservation runtime profile bytes and ID, source runtime-code hash/size, tracker singleton and settlement contract while fixing preactivation, authorization and reserved bytes to zero. The payload retains unchanged `BridgeCheckpointV1` bytes and binds its commitment, finalized native state root, reviewed trust anchor, finality horizon and exact `bridgeEventRoot || checkpointCommitment` value under extension key `0x0401`. Strict decoders reject V2/V4 cross-decoding, frozen V2 guest-program aliasing, checkpoints before the V4 profile activation height, profile/checkpoint/outer-identity drift, zero or more than 256 burns and stale horizons. They intentionally reuse exact verifier-predicate profile `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`; application semantics remain bound by the distinct V4 program, statement domains and explicit consumer identity. This freezes public inputs only: it does not verify GRANDPA, runtime storage, application execution, bridge/token code, source canonicality or funds authority, and it does not activate proof-system ID `2` |
| P1 V4 proof-core state | A V4-only state verifier authenticates the 109-byte bridge commitment, exact 349-byte profile, canonical sticky-enforcement byte, independent commitment-producing bridge address and raw native runtime code from one bounded trie proof under the statement's finalized state root. A distinct composition ABI verifies the existing reviewed GRANDPA semantics directly, binds the target header's exact state root to the public statement, and excludes the V2 compatibility JSON envelope. Missing, noncanonical, substituted, cross-root and V1/V2 witness cases reject. The V4 guest accepts a bounded private witness and commits the exact 1,139-byte statement. Two independent pinned Linux builds from exact source commit `f90205c1a0c7f414bcaeee7077c60b3e97f01010` and tree `431df2c8dc097de2fcf4c1c0b355b7887d0d8782`, each with a separate fresh target volume, reproduced the same 805,528-byte binary, SHA-256 `f521d2df0d53b5d7be9146ccfe2548295b97069385fb7eef3b4ba3adafd75e77`, and image ID `ad8ad97a4a060059e70e793fc10a311d1e16fbe05b7cdcbeb58aa597a60b3fe4`. The checked-in manifest, binary and generated method must match exactly. The profile-level host requires that program, exact reusable EIP-0045 profile `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`, exact succinct seal shape, exact journal and one explicit consumer identity. A separate self-bound Ergo consumer compiles, passes a local preactivation JVM matrix, and has a real non-dev succinct receipt bound to its exact standalone contract ID. The complete V4 family derives and reproduces integrated tracker ID `bfba2ed2dabca6a843b3acf996029cb3ed5578eda512043cb5e1a7217624e594`, then binds it into the DUP, source-lock and reserve identities and the full settlement transaction. A fresh non-dev receipt now binds that integrated ID under the same exact program/profile and canonical seal grammar; its 1,139-byte statement has Blake2b-256 `dea00c2ed8f7ac669d86999293de1d088a83ef0725897977cde5b94d3275bee0`. The host rejects isolated image, journal, contract and seal mutations before create-last transient export. This remains local proof-core, reproducible-build, host-binding and predicate conformance only: no activated Ergo verifier, activated `0x0401` consumer, target-node acceptance, broadcast or funds authority exists |
| P1 V5 proof-core state | A separately versioned V5 statement, state verifier and composition ABI retain the exact V4 runtime profile but add canonical non-membership of `pallet_sudo::Key` to the same finalized state proof database. Missing or malformed Sudo absence, a proof that omits the required non-membership path in a neighboring-key trie, cross-root substitution and V1/V2/V4 downgrade cases reject. Rust and TypeScript share exact V5 statement bytes, and the verification-only host enforces program ID `bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31`, reusable verifier profile `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`, exact journal, caller-selected expected consumer and canonical succinct-seal grammar. The standalone tracker remains frozen at contract ID `008a6dfb...b7a0`. The separate dependent V5 family preserves exact source runtime lineage/profile `f0cd15e3...522f9` / `881b1501...9b394` while deriving target settlement lineage `ffba97e5...74dd2`; a V5 runtime profile substituted into the source binding rejects. The pinned compiler emits integrated tracker `c9f54f6e...cff08` (2,984 bytes), DUP `dea71586...a778c` (3,099 bytes), source lock `79f6b7d0...10b4a` (1,317 bytes) and reserve `00e45fb1...abac6` (2,981 bytes). The tracker embeds the target settlement lineage, and its self-bound application binding hashes an exact 4,096-byte synthetic source-runtime payload rather than an unbacked placeholder digest. The exact deterministic settlement planner binds those identities into a three-spent-input, one-data-input transaction; TypeScript negatives cover application/profile drift and tracker/root/burn/payout/replay/reserve/fee/height faults. The pinned JVM evaluates the complete conjunction and required-variable failures; because ErgoScript cannot enumerate ContextExtension keys, a separate exact producer-shape guard excludes extras and the matrix demonstrates that boundary explicitly. A real local non-dev receipt binds the exact integrated consumer under the frozen program/profile: its 7,125-byte witness used 11,534,336 cycles, its 1,140-byte statement has Blake2b-256 `c7ea7fd0...e1e3`, and its canonical seal partitions as `65,535 / 65,535 / 65,535 / 26,063`. The host accepts the exact receipt and rejects isolated image, journal, consumer, coordinated-journal and seal mutations before create-last export. This remains synthetic local preactivation proof-engine and predicate evidence: real predecessor/runtime provenance, activated verifier, target-node acceptance, broadcast and funds authority remain absent |
| P1 V6 settlement-family state | A new target settlement lineage `b689cdd0...8a18e1` retains the exact V4 source-runtime profile and V5 proof/public-input semantics without reinterpreting their bytes. The guarded pinned compiler emits integrated tracker `c9c8315f...93d7bb` (2,984 bytes), DUP `5062c938...2e50c2` (3,099 bytes), source lock `d151c4dd...30afa1` (1,317 bytes) and reserve `6aa92a05...2e1bfc` (1,962 bytes). Only the exact DUP consumes the tracker key/proof, burn leaf and proof bundle; it binds inclusion, payout, reserve transition and absent-to-present replay insertion. The reserve authenticates that DUP proposition/NFT/profile and independently enforces the matching reserve/liability decrement, payout shape and external fee, but consumes no burn proof variables. The exact compiler request, receipt, spec, runtime pins and four template hashes are fail-closed. The pure V6 planner now constructs a deterministic 6,600-byte proofless EIP-12 transaction, ID `e9511548...00a83`, with ordered reserve/DUP/fee inputs, one tracker data input, reserve/DUP/payout/fee outputs, empty reserve and fee extensions, and Vars `0..3` only on DUP. TypeScript negatives isolate application, tracker, burn, payout, replay, reserve, fee, height and process-ownership faults. This closes deterministic construction only: the complete pinned-JVM conjunction is still pending, the profile is inactive, and target-node acceptance, sidechain finality, funds authority, Gate 5, trustless status and readiness remain false |
| P0 V4 mint-authority state | The pinned Frontier V4 profile binds exact bridge/token addresses plus deployed runtime-code SHA-256 and byte lengths. Before EVM execution, the runtime snapshots the exact direct-parent profile, pending reservation, replay state, bridge/token configuration and ownership, total supply, recipient balance, and native parent identity. After execution, only matching successful `PegIn` events with preceding single-use token mint effects and exact replay/supply/balance deltas may consume reservations. Arbitrary owner mint, duplicate or legacy identity, expiration, code/profile/configuration drift, partial effects, and unmatched or reused token effects reject. The combined import-level replay proves that a rejecting V4 callback leaves no EVM, native, Frontier, header, or body residue and that the corrected sibling consumes the exact reservation once. The normal runtime separately quarantines the inherited legacy address across inactive, causal and V4 modes: direct top-level mint calls are rejected before EVM execution across all Ethereum envelopes and PreLog, native `pallet_evm` dispatch is disabled, public disable/retarget is blocked, absent state cannot bootstrap legacy mode, and a real unrelated same-selector/same-topic EVM contract remains importable. Exact V4 activation requires the same stored bridge address as the reviewed profile, completes validation before mutation, removes Sudo and only then installs the exact profile and sticky enforcement. Internal/proxy calls and the exact active stronger-profile address remain callback-only and can still poison an authoring attempt, but the import-level witness proves complete rollback. The exact-delta rule still conservatively rejects unrelated same-block token supply changes and net balance changes involving a mint recipient; activation must enforce that scheduling restriction or version broader accounting. The 603-byte statement and V1/V2/V3 formats remain unchanged. This is local source-locked conformance: authenticated Sudo absence, deployment lineage, real-profile approval, activated mint authority, Gate 5, trustless status, and readiness remain open |
| P0 settlement-conservation state | Commits `e3de07c3`, `a1323021`, `27347a1b`, and `dc71da1f` add distinct external-fee vault and DUP predicates, deterministic reserve/DUP/payout/fee construction, a process-owned immutable candidate, and a pinned SigmaState JVM matrix. Both protected inputs accept the exact transaction; two positive branches and sixteen isolated negatives bind payout, reserve delta, replay insertion, external fee, topology, vault/DUP successors, and legacy-profile exclusion. The still-deficient V1 submission capability is physically absent from the programmatic module, daemon composition, CLI commands, signing/authorization adapters, and transport entrypoints; only diagnostics and historical reconciliation remain. This is local containment and preactivation evidence only: no target node checked the corrected profile, no signer or submitter consumed it, and no funds authority, Gate 5 closure, trustless status, or readiness follows |
| Gate 3 activation authority guard | Gate 3 lifecycle closure now requires a separately validated local-devnet or testnet activation report bound to the exact `authenticated-external-fee-v1`, `ACTIVATED`, `gate3-lifecycle-closure` tuple, activation target, recomputed activation ID, environment, exact Ergo and sidechain network identities, and a passing clean-checkout candidate at the same Git commit. The CLI reads four distinct role-specific authority-evidence JSON outputs and binds concrete target-node transaction/response identities, authority-transition transaction and contract identities, legacy-route retirement registries, and cross-profile replay roots. It validates their exact authority facts, recomputes each evidence ID, requires one replacement contract-profile digest across all roles, and rejects circular or reused local/testnet targets. Local-devnet evidence must positively identify non-mainnet networks. `legacy-aggregate-v1` remains parseable only as quarantined historical diagnostics. Window-prep, prep-bundle, offline-gate, and other V1 artifacts cannot substitute for these producer outputs. This guard prevents evidence relabelling; it does not activate the profile or close Gate 3 by itself |
| P2/P3 V4 source-lock state | The existing 1,317-byte `MainChainLockPooledReserveV4` proposition remains byte-identical and separate from every historical source lock. It accepts reserve commitment only before `creationHeight + 10,000`, accepts depositor refund only at or after that height, returns the full source value to the exact depositor, and requires a distinct token-free fee input whose complete value becomes the bounded miner-fee output. Source-lock construction reserves the complete 10,000-block timeout below signed-Int overflow. A new process-branded, network-free builder reconstructs that exact two-input/two-output refund from the compiled V4 instance and canonical source box. The pinned JVM suite accepts commit at `timeout - 1`, refund at `timeout` and `timeout + 1`, and requires semantic `false` rather than an interpreter exception for twenty-nine isolated refund mutations covering every fixed source-intent field, value, recipient, tokens, fee bounds/topology, cardinality, ordering, and data inputs. This closes local construction and predicate acceptance only. The profile is inactive; current MCL bytes remain unchanged; no UTXO observation, node acceptance, signature, submission, broadcast, cutover, funds authority, Gate 5, trustless status, or readiness follows |
| P1 V4 cutover-candidate state | The exact V4 runtime-profile codec is shared by the source-state verifier and cutover candidate. Nine versioned historical DUP descriptors preserve each family's declared transaction-hash or event-ID intent, ContextExtension shape, topology, counter/profile, AVL, token, value, height and R6 rules. The dual-source observation reconstructs each profiled singleton lineage and joins it to the exact inventory under one stable snapshot without treating raw keys as canonical events. A global replay-genesis composer requires exactly one contribution per observed lineage, accepts explicit empty lineages, accepts the process-provenant authenticated-V2 importer only for its exact route, rejects unsupported nonempty routes, rejects omissions and cross-route duplicate burn IDs, and recomputes one sorted insert-only AVL genesis. Provisioning consumes only that global packet; the cutover candidate binds the same packet, its observation digest and every compiled contract/source-admission identity. The old route-specific provisioning shortcut is rejected. The sanitized testnet review-profile assembler now binds all nine cutover components, all static routes, exact route inventory digests, deployment code/lineage, activation-parent terminal identity and exact source runtime-code hash/size, and per-lineage mapping/admission state into one independently parseable manifest without source-origin identifiers or raw observation objects. The relayer owner-mint and legacy aggregate payout initiation routes are physically absent and classified candidate-only; read-only diagnostics plus their exact historical confirmation/reconciliation readers remain. Root configuration authority and selected-bridge commitment production remain distinct, and every activation/funds/readiness boundary remains false. A reviewed live profile, real capture, inventory exhaustiveness, source independence, canonical Ergo consensus, authenticated route retirement and activation parent, target-node acceptance, Gate 5, trustless status and readiness remain open |
| Package state | WP-06A-T1 implements the local authenticated anchor, proof reconstruction, JVM-check boundary, native conformance, execution-authority separation, canonical finality proof interface, proof-bound tracker admission, and the retained source-to-settlement conformance chain described below. The current 264-byte tracker and linked settlement trees pass both deterministic offline sigma-rust matrices and replay against the node-compatible `simplifiedUpcoming` preheader `H+1` plus ten isolated-devnet mined headers `H..H-9`: tracker admission plus 13 bounded fail-closed rejects, and full settlement plus 16 rejects. Their generic exact signed positive transactions also pass pinned-JVM proof, serialization, bytes-to-sign, context-identity, and mode-specific contract-tree conformance. WP-06T1 carries the third burn from the public three-burn Frontier vector, whose recipient bytes parse as an executable ErgoTree, through tracker admission; WP-06T2 consumes that exact signed tracker successor and binds its proved payout preimage to the DUP insertion. WP-06T3 closes the source-bound positive pinned-JVM replay for both stages using one JVM-canonical 15-header synthetic vector, the same anchor object at T1 index 4 and T2 index 9, and the wallet's exact signed bytes. WP-06T4 reruns the complete source-to-settlement path in two fresh child processes, requires each process to recollect the pinned source inputs, executes the source-, tracker-, and settlement-owned adversarial matrices, and compares deterministic semantic identity plus the raw verifier and codec executable digests after restart. WP-06T5 reconstructs the authenticated tracker cache from the chain-visible singleton NFT lineage and atomically replaces stale local history while invalidating affected candidates. WP-06T6 now replays each exact observed AVL insert proof from a rolling digest, compares the verifier-produced successor against complete R5, and requires two bounded read-only Ergo observations to reproduce the same complete deciding-lineage digest and stable snapshot. Only the dual-source wrapper creates cache-accepted provenance. WP-06T7 runs 17 real prover-derived one-step transitions through both the pinned WASM verifier policy and the pinned JVM `BatchAVLVerifier`, retaining the exact successor digest as the deciding comparison. It pins one reviewed semantic difference: a falsified starting-height byte is rejected by the stricter WASM preflight but accepted by the JVM operation with a different successor digest. WP-06T8 adds a standalone, config-free command that can exercise the same exact reconstruction against two explicit non-mainnet node origins and emit a digest-bound, non-authorizing report; distinct origins do not prove independent operation or canonical consensus. WP-06T9 adds a second config-free observation command that binds that exact reconstructed tracker tip to one explicit DUP singleton, one explicit settlement-vault UTXO, and one explicit burn payout plus miner fee. Both bounded origins must expose identical JSON and canonical Sigma bytes for all three current inputs under a stable snapshot; the command checks the same singleton, register, authority-separation, and derived-liquidity prerequisites consumed by the authenticated settlement builder. WP-06T10 adds a config-free offline command that combines one validated T9 report with one strict burn-inclusion/DUP-history companion and deterministically emits the exact authenticated V2 unsigned EIP-12 transaction, unsigned transaction ID, canonical input bytes, and explicit non-authorizing boundaries. The clean-checkout benchmark rebuilds the pinned WASM artifact and covers 1,024 synthetic transitions without rebuilding historical prefixes in the timed reconstruction. The daemon gates authenticated candidate preparation and restart reconciliation on this reconstruction and fails closed when witness configuration, either bounded observation, or exact agreement is unavailable. WP-07A requires a process-provenance check admission binding the JVM result to stable Ergo and sidechain views before `check_passed` can be journaled; the journal stores the exact view and admission digests, while the daemon holds only a frozen unsigned-preparation facade. It now also binds aggregate recovery to a versioned ten-confirmation Ergo policy, stable transaction/inclusion/tip observations, lifecycle compare-and-set, atomic local reducers, matching dual-source observations for destructive rollback, append-only absence history with a two-observation canonical-descendant window before explicit abandonment, and a local quarantine marker when a previously confirmed attempt later disappears from two bounded Ergo observations. After complete database loss, the recovery boundary validates the versioned unsigned package, binds it to an exact same-process prepared transaction and process-provenance native admission, requires matching stable burn views from one opaque pair of distinct RPC origins, and atomically restores only the burn observation plus an unchecked `prepared` candidate. RPC disagreement, deep burn reorg, and caller-supplied tip drift reject before persistence. It cannot restore JVM-check, signer, submission, confirmation, or broadcast authority. The independently reviewed check-only boundary now atomically reserves the exact checked candidate, complete candidate-authority digest, amount, canonical recipient, burn, DUP input, vault input, expected transaction, and complete provenance-digest chain; restart retains only a non-authorizing lock, while unsafe candidate or peg-out drift revokes it. The active check result and every downstream admission now also bind the versioned local-WASM signer profile, exact public key and ErgoTree, network prefix, signing-context tip, checker/source-adapter profile, canonical node origin, endpoint, method, and transport policy. The legacy aggregate execution module and every new daemon/CLI/programmatic submission route are now absent. Its former approval and check formats remain historical evidence inputs only, and existing pending/submitted attempts retain exact confirmation, recovery, abandonment, and deep-reorg reconciliation. WP-02 now also has a separate manifest-bound, synchronized-index, fully paginated read-only observation assessment: a caller-supplied expected digest binds the explicit historical V1 address/ErgoTree set; two distinct origins must agree on the network, bounded-age checkpoint, stable tip, and zero-UTXO observation. The report does not authenticate manifest review or source independence and cannot authorize cutover. No reviewed manifest, authenticated decision, or live observation is asserted yet. Stateful node acceptance and a concrete dual-node run remain open, and the synthetic headers are neither mined nor PoW evidence. None of these milestones makes Ergo verify the proof payload or GRANDPA semantics. The tracked attestor registry still has no active external profile, independent custody is unverified, and R9 remains a disclosed federated finality authority until an Ergo-verifiable finality proof replaces or constrains it. Gate 5 and Phase 011 remain the critical path, and no setup, deployment, broadcast, trustless, or production-readiness claim follows. |
| WP-06T13 state | The bounded V2 candidate route now requires a content-addressed launcher image under the actual 64-bit Program Files known folder and an exact 144-byte `AuthorityRecordV2` binding profile, policy, launcher digest/size, volume/file identity, and epoch. The broker opens and retains its own image, compares its final handle path with `FOLDERID_ProgramFilesX64`, rejects path, link-count, delete-pending, record, or rotation drift, and holds the V2 installer mutex through cleanup plus the complete buffered-output write and flush. Abandoned ownership is released before fail-closed rejection. V1 remains an explicit compatibility profile with unchanged record bytes and installer ordering. This is local implementation only: the elevated crash/race/ACL campaign is not complete, child output remains quarantined, both canonical attestor registries remain empty, target runtime execution identity remains false, no reconciliation hold is released, and Gate 5 remains open. |
| WP-06T14 state | The V2 collector can now pair an exact execution-state membership request with an exact direct-parent non-membership request under one trust anchor and deposit identity. Fully parsed canonical SCALE headers bind native ancestry and consecutive heights. The runtime record separately carries the Frontier/EVM execution-block hash, the matching numeric height, profile generation, sidechain, and deposit; it is no longer compared with the native Substrate block hash. The parent request supplies the expected producer runtime rather than the execution block's post-state request. Both child outputs remain quarantined and provenance-bound, and the candidate explicitly records that the native-to-EVM block mapping is not yet authenticated. This establishes only an immediate parent/execution expectation candidate: complete finalized runtime-upgrade history, change-and-revert coverage, historical mint absence, cutover policy, committed-vault eligibility, mint authority, and Gate 5 remain false. |
| WP-06T15 state | A bounded collector and pure composer now require one V2 candidate for every consecutive native state from the exact reviewed checkpoint through the peg-in execution height. Canonical SCALE headers bind direct ancestry and expose `RuntimeEnvironmentUpdated`; every expected runtime-code change must carry that marker, and the output records runtime-change block identity, next block-entry activation, and change-and-revert expectations. The interval carries separate terminal native Substrate and Frontier/EVM execution hashes. Every pre-execution state requires record non-membership and the final state requires exact record membership, but the mapping between those two terminal identities remains explicitly unproved. Outputs retain only expected identities and quarantined child digests. This is complete structural coverage of an explicit candidate interval, not accepted finality, state proof, runtime history, or historical mint absence. Stable-snapshot acceptance, reviewed per-runtime invariants, cutover, committed-vault eligibility, mint authority, and Gate 5 remain false. |
| WP-06T16 state | A separately versioned signed review packet now binds one exact runtime/build identity to its Frontier patch bytes/source manifest, Solidity source/ABI/bytecode hashes, native replay-key semantics, EVM replay-write ordering, direct `SERG.mint` route, and ownership-changing entrypoints. The T15 composition layer requires exactly one validated packet for every distinct runtime, preserves contiguous and `A -> B -> A` ranges, and rejects missing, extra, duplicated, mixed-policy, or build-drifted profiles. Supplied-policy candidates and canonical source-owned reviews use distinct constructors, types, and provenance; the canonical clock is not caller-controlled. The native `ProcessedPegIns` record is explicitly post-execution evidence, not the EVM write-before-mint guard. The source-owned reviewer registry remains empty and fail-closed. Deployed bridge/token code, current and historical token ownership, whole-block callback rollback, reproducible Solidity build closure, accepted finality/state proofs, historical absence, cutover, vault eligibility, mint authority, and Gate 5 remain false. |
| WP-06T17 state | The pinned Frontier patch now carries a client-level whole-block conformance test using the exact checked-in `SERG` and `ErgoBridge` creation bytecode. Three setup blocks deploy the contracts and transfer token ownership through `FrontierBlockImport` with `StateAction::Execute`. A fourth candidate overlay proves the exact bridge token binding, Solidity replay write, supply increase, and recipient balance increase before same-block profile activation makes the post-block callback reject. Both authoring and import fail, the candidate header/body remain absent, the accepted head is unchanged, and parent-state queries prove unchanged sender nonce, token supply, recipient balance, Solidity replay bit, native profile/address/record, FRAME events, and Frontier block/receipt/status state. A second valid sibling provides a mixed-header control whose Wasm backtrace diverges before the candidate's direct callback witness; the original valid sibling imports after every rollback assertion. The source verifier binds both fixture blobs to the checked-in artifact bytes. This proves behavior of the pinned local source and bytecode fixtures only. Reproducible Solidity build closure, deployed code/token/owner/history, accepted finality/state proofs, historical absence, cutover, vault eligibility, mint authority, Gate 5, and readiness remain false. |
| WP-06T18 state | The Solidity bridge/token now has a package-local reproducible build closure: exact `solc 0.8.35`, OpenZeppelin `5.6.1`, npm lock including the audited `tmp 0.2.7` override, explicit `osaka`/optimizer/metadata/IR settings, LF-normalized source/import digests, ABI, creation/runtime bytecode, metadata, and storage layouts. A non-writing compiler check reproduces all tracked outputs; source lock v3 binds the manifest and mechanically joins the unchanged creation bytes to the WP-06T17 Frontier fixtures. The relayer's minimal ABI surface is isolated and checked against the compiled ABIs, correcting the stale `decimals()` mutability. This proves local source-to-artifact identity only. Deployed address/runtime code, bridge-to-token binding, owner and mint/supply history, accepted finality/state proofs, historical absence, cutover, vault eligibility, mint authority, Gate 5, and readiness remain false. |
| WP-06T19 state | A config-free read-only observer now accepts two explicit credential-free RPC origins under an operator-declared non-mainnet scope, plus explicit bridge/token addresses and expected chain ID. Each source binds one stable tip, compares both deployed runtime byte strings with the validated WP-06T18 manifest profile, reads the bridge token binding and current bridge/token owners at that exact block, and revalidates the chain and tip before the views can agree. The token must be owned by the exact bridge address. Output is a provenance-bound non-authorizing candidate; no deployment file, runtime database, signer, submitter, history inference, hold release, or mutation path is reachable. The declared scope is not independently authenticated, current two-source agreement is not finality, and historical owner/mint/supply absence, accepted finality/state proofs, cutover, vault eligibility, mint authority, Gate 5, and readiness remain false. |
| WP-06T20A state | A bounded read-only lineage collector now joins the exact same-process T19 deployment candidate, tracked Solidity artifacts, one source-owned reviewed lineage profile, and a native finalized checkpoint produced by the exact source-refreshed contained execution authority. From the token pre-deployment parent through the exact terminal execution block, two distinct fixed-surface RPC origins must agree on validator-consumed transaction fields, one normalized receipt identity/status per transaction, every receipt log, indexed relevant logs, block-hash state responses, deployment coordinates, continuous runtime bytecode, owner transitions, bridge/token binding, token supply deltas, mint/PegIn pairing, and replay mappings. A direct-process checkpoint rejects. Per-response and per-source cumulative bytes, byte fields, requests, duration, transaction counts, receipt logs, and concurrency are bounded; a source pair cannot be reused concurrently. The chain head may advance, but rollback below the terminal height or replacement of the exact terminal block rejects. The only registered profile is inert and conformance-only. Standard RPC responses are not authenticated historical receipt/state proofs, so historical completeness, independent absence, cutover, committed-vault eligibility, mint authority, reconciliation-hold release, settlement, signing, submission, broadcast, Gate 5, and readiness remain false. |
| WP-06T20B finalized event and deciding contract-state proof core | T14/T15 lineage, history, and invariant-review candidates preserve native Substrate block hashes separately from Frontier/EVM execution-block hashes. One bounded Rust composition now authenticates exactly twelve reads under one finalized native state root: raw runtime code, the Frontier block, receipts, statuses, one native processed-record, both deployed EVM runtime-code values, bridge owner/configuration/replay storage, and token supply/owner storage. It recomputes the execution and receipt identities, requires the exact successful `PegIn(address,uint256,bytes32)`, proves the post-state replay marker, token binding and token ownership, and joins the exact event-block code/owners/supply to genuine same-process T19 artifact/deployment and T20A reviewed-lineage candidates. Authenticated storage non-membership is interpreted as Solidity zero only for the bridge-owner and token-supply `ValueQuery` fields; bridge configuration, replay, and token owner remain membership-required. The deterministic Rust vector uses the reproducibly compiled `ErgoBridge` and `SERG` runtime artifacts, is consumed by TypeScript, and is regenerated by the pinned isolated build. Caller-supplied reports remain execution-unauthenticated and non-authorizing. One post-state does not prove pre-event replay absence, an exact mint supply/balance delta, historical code continuity, committed-vault eligibility, or mint admission. No daemon, reconciliation, signing, submission, or broadcast path consumes the result; Gate 5 and readiness remain false. |
| WP-06T20C finalized direct-parent mint-transition proof core | One bounded Rust composition now proves the exact direct native parent of the T20B event block and authenticates ten parent-state keys plus the thirteen-key event-state proof. Native and Solidity replay state move from absent/false to present/true; native runtime code, deployed bridge/token code, bridge configuration, pause state, and owners remain exact; token supply and the exact recipient balance each increase by precisely the successful `PegIn` amount; and exactly one relevant nonzero token effect exists across the authenticated successful receipts, the same-transaction `Transfer(0, recipient, amount)` paired with that event. Read-only collection derives the exact keys, rechecks the direct-parent and event hashes after both proofs, and retains separate parent/event identities. A V3 pinned local build reconstructs five runtime binaries and three fixture generators, then byte-matches all three tracked vectors; the T20C vector is bound by its canonical digest. TypeScript decodes the exact parent and event headers, quarantines caller-supplied verifier output, revalidates exact request/report semantics, and joins only process-branded T19/T20A/T20B candidates with matching lineage identities. T20A remains corroboration, not cryptographic historical completeness. No daemon or funds path consumes the candidate, and verifier execution, committed-vault eligibility, idempotent mint admission, hold release, Gate 5, trustless status, and readiness remain false. |
| WP-06T20D committed-vault mint correlation | One deterministic candidate now joins a process-branded, stable dual-source Ergo route reconstruction to a separately versioned process-branded T20C projection that preserves the complete V1 candidate digest unchanged. It requires exactly one observed committed deposit, the exact confirmed consumption transaction, extinction of the refundable source at the snapshot, one exact current vault successor, ERG/raw-amount/recipient equality, the destination bridge/token/sidechain profile, the existing V1 runtime-record identity, and independently derived native/EVM replay storage keys. A real-brand integration fixture and isolated cross-lineage negatives cover provenance, refund survival, confirmation, vault-currentness, amount, recipient, destination, replay, and identity drift. This is correlation evidence only: dual-source RPC is not Ergo consensus, the V1 deposit does not encode sidechain ID, and the mint event/record does not prove that consumption preceded mint. No daemon or funds path consumes the candidate; mint admission, hold release, Gate 5, trustless status, and readiness remain false. |
| WP-06T20E-A causal admission format and transition contract | The V2 family freezes a 313-byte admission profile, 229-byte Ergo source intent and 381-byte causal admission statement with Blake2b-256 domain-separated identities and big-endian proof-neutral integers. Its original 249-byte consumed record remains byte-reproducible but is permanently unactivated because embedding the mint child's native hash in that child's own state creates a circular header/state-root dependency. A separately versioned 249-byte consumed V3 instead binds the direct-parent native hash and mint height; T20E-D authenticates the actual child hash through the child header containing that state root. The profile binds the exact source-lock and vault ErgoTree hashes; the source intent binds the Ergo network, sidechain, bridge, token, settlement/admission profiles, ERG asset, raw amount, and recipient. The statement binds that intent and the unchanged V1 replay identity to the source box, creation and commitment transactions, exact vault successor, inclusion/checkpoint identities, and finality policy. A pure transition checker requires the exact pending admission in the direct parent, V1/V3 replay absence there, consecutive native ancestry, supplied token and mint fields, atomic pending deletion, unchanged-format V1 record creation, and exact V3 consumed record creation. Deterministic vectors and isolated mutations cover every format field plus absent/replayed/same-block/retained admission and state/event/profile drift. The checker remains non-authorizing until the runtime composes it with the exact authenticated T20C bridge/token/mint transition. Current MCL/vault V3 ErgoTrees, the Frontier runtime producer, proof admission, trie membership, finality, daemon authority, and funds paths are unchanged; Gate 5 remains open. |
| WP-06T20E-B causal source lock and committed vault | Three distinct, non-deployed ErgoTrees now implement the refundable-to-non-refundable source transition without changing V1. `MainChainLockCausalV2` authenticates the 229-byte intent, exact source network, native ERG amount, depositor tree, full-value vault output and consumed source-box identity; a 2-of-N transitional guard authorizes commitment only before timeout, while a separate-input-funded timeout refund returns the full unspent value to the depositor and binds its output to the exact source box ID. `MainChainCausalVaultV2` has no refund branch, preserves the intent and source-box ID on partial payout, and retains the current authenticated tracker/burn settlement while requiring source intent, tracker and burn to bind the same sidechain. `DoubleUnlockPreventionCausalV2` is a distinct singleton profile bound to the causal-vault hash, so the existing hash-bound DUP is not silently reused. Check-only compilation derives both dependent contracts from one same-run vault tree and non-check compilation refuses these non-deployed candidates. Pure planners reject source-tree, profile, network, register, token, value, fee and timing drift. A loopback-compile plus synthetic sigma-rust matrix covers three positive branches, eighteen isolated rejections, and the 4,096-byte box bound. The active admission profile, source inclusion/canonicality, finality-proof execution, runtime pending/consumed state, mint authority, daemon authority, node transaction acceptance, deployment, Gate 5 and readiness remain false. |
| WP-06T20E-C parent-bound runtime consumption | The pinned Rust patch reproduces the exact V2 admission and parent-bound V3 consumed formats, rejects consumed V2, and limits every active ERG peg-in, burn-leaf and payout amount path to Ergo's positive signed-`Long` range without changing its `u64` wire field. It adds a one-way root-activated exact causal runtime profile plus bounded pending-V2 and consumed-V3 state. Activation validates every keyed pending object against the exact profile and live bridge/token state, then atomically removes the current runtime's `sudo` key; the profile cannot be disabled or replaced. A new pre-EVM hook snapshots the direct-parent profile, pending admission, V1/V3 replay absence, reviewed bridge/token runtime code, configuration, owners, replay word, supply, and recipient balance before execution. The post-EVM callback accepts a causal mint only when exactly one successful `PegIn` has one exact preceding token `Transfer(0, recipient, amount)`, the Solidity replay word becomes canonical true, code/configuration/owners remain exact, and supply plus recipient balance each increase by precisely the admitted amount. All fallible validation precedes native mutation; pending deletion, unchanged V1 insertion, V3 insertion, events, and pending-key update occur in one block transition. Same-block cutover/mint, profile/runtime drift, replay, malformed pending state, raw post-cutover V1/`:code` mutation attempts, and admission-free mint reject. Node tests preload pending state through privileged test-only `System::set_storage` before cutover; no runtime admission producer, proof adapter, daemon consumer, deployment, or funds authority exists. T20E-D now authenticates the parent/child roots and actual child-header identity and supplies the bounded stale/reorg/restart projection. Callback weight remains a prototype reservation without target-hardware benchmarks, so activation remains blocked; Gate 5 and readiness remain open. |
| WP-06T20E-D authenticated causal transition and fail-closed lifecycle | One bounded Rust composition now reuses the exact T20C parent/child headers, GRANDPA path and trie proofs while authenticating the causal profile, enforcement marker, bounded ordered pending-key list, every pending entry named by that authenticated list, absent parent V1/V3 replay state, exact child deletion, unchanged-format V1 creation and exact parent-bound V3 creation. Every indexed non-target pending entry must remain byte-identical. The collector reads the bounded SCALE pending-key list at each exact block only to discover the proof-key surface, then includes that list and every derived map key in `state_getReadProof`; the Rust verifier independently decodes the list from the authenticated trie, so raw RPC discovery is not authority. This proof does not establish the absence of unindexed raw map entries; T20E-E must make the reviewed runtime writer and migration rules preserve the list as the sole admission index. The child state root is bound to the actual finalized child header whose hash and consecutive parent identity are checked. A strict TypeScript wrapper binds exact request bytes and independently supplied trust-root digest while retaining all execution and funds claims as false until contained executable provenance is composed. A separate immutable lifecycle projection keeps RPC, SQLite and reconstruction observations deny-only: unique initialization records an authenticated reproof hold, each append revokes the prior head, serialized journals reject, and the explicit restart projection returns only `pending` with reproof required. Its source-owned registry has zero active proof profiles, so no T20E-D proof event can advance lifecycle state; T20E-E owns the first statically registered profile and process-provenance proof constructor. The pinned V4 isolated build reconstructs six verifier binaries and four generators and byte-matches all four vectors. No source-proof admission producer, runtime pending-write extrinsic, daemon consumer, deployment, mint authority, hold release, signing, submission or broadcast path exists; callback benchmarks, Gate 5, trustless status and readiness remain open. |
| WP-06T20E-E federated source-proof admission and receipt-authenticated consumption | The first source-owned static compatibility profile is explicit 2-of-3 Ed25519 federation with ten source confirmations and a maximum 64-native-block admission window. TypeScript and the pinned Rust runtime reproduce the same request, result, attestation, signature-set, proof, 498-byte SCALE envelope and fixed profile identities. A signed runtime call validates the unchanged V2 profile, intent and statement plus the exact federated envelope before atomically inserting the pending admission, its ordered sole-index entry and a 241-byte provenance receipt; duplicate, stale, weak-policy, malformed and mismatched requests reject before any write. Threshold invalidation removes the map value, receipt and index together and writes a permanent same-record tombstone; deterministic pre-EVM expiry validates and removes only the live surfaces at the exact native bound before mint snapshotting, without blocking that block or its successor. The checked-in public fixture keys cannot become executable authority: an immutable compile-time gate is enforced by public activation and every profile consumer, and a node-level negative proves raw privileged injection of the exact profile/enforcement pair rejects the block without changing the accepted head or causal storage. Only a private `cfg(test)` helper can exercise the same fully validated profile. The mint callback requires the exact direct-parent receipt to remain unchanged and the invalidation tombstone to remain absent, then consumes the pending admission and receipt atomically with the unchanged V1 record and parent-bound V3 record. A new native V3 proof authenticates receipt membership in the parent, receipt absence in the child, target tombstone non-membership in both states and exact preservation of every other indexed pending admission and receipt. The lifecycle registry accepts only a same-process reference derived from the static source-proof result at a fresh native height; it may clear only the initial `restart_reproof_required` hold, while stale, reorg and RPC-conflict holds remain deny-only. The source proof is federated compatibility evidence: its attestors, rather than an Ergo-verifiable proof system, decide source canonicality. The TypeScript result still marks executable authentication, source canonicality, runtime admission, mint, daemon, signing, submission, broadcast, Gate 5, trustless status and readiness false. The pinned V5 build now reconstructs seven verifier/runtime binaries and five generators and byte-matches all five native vectors. No runtime profile activation, daemon consumer or funds authority exists, and callback benchmarks remain open. |
| WP-06T20E-F1 source-refreshed causal V3 candidate boundary | The pinned local V5 build now rechecks the canonical source locks, exact Frontier checkout, pinned Cargo/Rust/Git tools, V3 verifier bytes and the current canonical digest of the tracked V3 vector before each requested execution. A separately versioned fixed-operation policy requests only `verify-peg-in-causal-mint-transition-v3` through the digest-addressed contained launcher and AuthorityRecordV2 policy, with source, toolchain, executable, launcher and policy checks around execution. The Node parent does not independently observe loader atomicity, but a successful V2 authority-mode broker run binds the retained broker self-image to the exact AuthorityRecordV2 within the declared Windows administrator/kernel TCB. The elevated activation campaign remains incomplete, so the evaluator validates only the reported result shape, discards all reported proof fields and returns a quarantined stdout digest/size candidate with finality, causal-transition, receipt, lifecycle and every funds authority false. The collector snapshots its evaluator, trust anchor and statements before its first await, retries only snapshot drift and records the exact codec, invocation, policy and source pins. No proof, lifecycle, committed-vault, mint, daemon, signing, submission, broadcast, Gate 5, trustless or production authority follows. |
| WP-06T20E-F2a V2 installation inspection and bootstrap semantics | The existing V2 protected installation is the selected broker root of trust; no additional wrapper process is planned. A read-only inspector now reuses the exact V2 known-folder, ACL, reparse, digest, size, file-identity, hard-link, delete-pending, registry and AuthorityRecordV2 checks under the installer mutex without persistent mutation. Successful V2 execution reports `brokerSelfImageBoundToAuthorityRecordV2=true` separately from `launcherInstallationActivationCampaignCompleted=false`; the retained compatibility field `launcherAtomicBootstrapProven=false` means only that the Node parent did not independently observe the Windows loader binding. Native proof, source canonicality, lifecycle, mint, settlement, signing, submission, broadcast, Gate 5 and production authority remain false until their separate requirements close. |
| WP-06T20E-F2b contained source-proof result producer candidate | A separately versioned Rust producer accepts one strict causal source-proof request, binds the existing static 2-of-3 compatibility profile and deterministically derives the six canonical-object digests and bounded result fields. It does not verify source canonicality, execute a trustless proof, produce signatures or admit runtime state. The pinned local V6 build now reconstructs eight runtime binaries and six generators, byte-matches six tracked vectors and refreshes the exact source lock, Frontier patch, Rust 1.82 toolchain, producer executable and generated-vector identities around each requested execution. A fixed-operation TypeScript authority requests that producer only through the V2 digest-addressed launcher and AuthorityRecordV2 policy, validates the exact five-field child envelope against the Rust-generated vector and local pure derivation, then discards the fields and exposes only a quarantined stdout digest/size candidate. The V2 activation campaign remains incomplete and the installation is absent on this host, so source-proof execution authentication, source canonicality, lifecycle, mint, settlement, signing, submission, broadcast, Gate 5, trustless status and readiness remain false. |
| WP-06T20E-F2c exact causal identity composition | One process-branded TypeScript candidate joins genuine F1 and F2b evaluator outputs to the exact signed federated source-proof result, normalized V3 runtime record, reported 241-byte receipt identity and current admission-only lifecycle head. F1 retains receipt bytes and child stdout privately and exports only a same-process checked identity projection; F2b retains result fields privately and exports only an assertion over the exact derived result ID. The composer binds sidechain, bridge, token, source box, recipient, raw amount, profile revision/activation, V1 record key, admission/profile/intent IDs, proof request/result/digest, verifier identities, receipt expiry, V3 parent/child identities and the exact lifecycle proof reference. A new effect-free preflight validates every non-lifecycle binding before a journal may be created; finalization accepts only that same-process preflight and one current process-provenant lifecycle head. Raw child outputs remain digest-only. Clones, cross-process reconstruction, every runtime or receipt/proof substitution, receipt admission before signed proof issuance, admitted-to-stale/reorg/conflict/RPC holds, expiry, pre-transition height, foreign or serialized journal and the explicit no-journal restart projection reject or remain under `restart_reproof_required`; fresh envelope revalidation after historical receipt admission remains valid. This is local correlation evidence only: reported receipt authentication, native proof execution, source canonicality/finality, runtime admission authority, committed-vault authority, daemon admission, mint, signing, submission, broadcast, Gate 5 and readiness remain false. |
| WP-06T20E-F2d fresh-process causal reacquisition | A source-owned TypeScript orchestrator now snapshots one raw signed source request/envelope and the complete V3 collection configuration before its first await, invokes the exact read-only V3 collector so the F1 evaluator runs against newly collected parent/child evidence, validates the signed envelope at the recollected finalized native head, reruns the F2b producer, and completes the F2c non-lifecycle preflight. Only then does it create the unique `restart_reproof_required` journal, append the exact admission proof reference and finalize a new process-provenant F2c candidate. The input surface cannot accept old candidates, source-result objects, journals, SQLite state or additive V3 collection fields. RPC disagreement/failure, stale evidence, runtime/source binding drift and caller mutation during collection produce no journal; a serialized or cloned preflight cannot finalize. Raw request/envelope transport is not source canonicality authority: the compatibility signatures and current-height validation are the only admission evidence in this profile. The path has no daemon consumer and retains every proof, finality, committed-vault, mint, signing, submission, broadcast, Gate 5 and readiness field as false. Target execution remains `not_run` because the V2 protected launcher installation and elevated disposable-host campaign are unavailable on this host. |
| WP-06T20E-F2e dual-origin protected-host campaign entrypoint | The F1 and F2b evaluators now expose immutable, non-authorizing V2 installation declarations derived from their actual process-provenant authority profiles rather than a duplicate hash formula. `peg-in:causal-f2d:campaign -- --mode describe` performs the pinned source build and binds the installed launcher path plus role-distinct broker/profile/policy digests and minimum epoch without invoking the installer or activating either profile. Its V1 `BrokerPath` projection is the installed execution path, not the source path required by a fresh install; F2f below supplies that missing operator distinction. Execute mode accepts one strict nested public proof-input manifest and two distinct credential-free HTTP(S) origins without path/query/fragment. Before its first await it snapshots both complete worker requests. The default runner passes each request through a create-only bounded file to a sequential fresh Node worker, privately copies the regular-file Cargo cache, builds offline, reruns F1/F2b/F2d once, and supervises timeout and independent stdout/stderr limits through the shared process-tree runner. Timeout or overflow returns cleanup authority only after verified tree termination; unverifiable termination fail-stops the host and emits no artifact. Each report is bound to the digest of its complete canonical request plus the exact origin and launcher; the dual report is retained only when the complete serialized F2c candidate payloads match. Stored reports explicitly do not prove process execution. The direct codec process remains acquisition-only, and two-origin agreement is not source independence, consensus or finality proof. Output is create-only and contains no raw child stdout, signatures, proof envelope or local database state. No installation, inspection, activation, runtime write, daemon admission, mint, signing, submission, broadcast, Gate 5 or readiness authority follows. The real host run and the separate elevated ACL/crash/race/abandoned-mutex activation campaign remain `not_run`. |
| WP-06T20E-F2f protected-host operator handoff | `peg-in:causal-f2e:handoff` now validates the strict public proof manifest independently of execution and can derive one host-local, digest-bound preflight on 64-bit Windows. The preflight reruns the source-bound F1/F2b declaration build, checks regular launcher/tool prerequisites, requires the canonical installer to match its tracked HEAD bytes, requires the reviewed source launcher digest to equal the two declared V2 profiles, binds the expected digest-addressed Program Files observation, and emits separate non-executable install parameters using the source executable, inspect parameters using the managed installed executable, and exact digest-bound dual-origin execute arguments. It invokes none of them, reads or writes no registry state, writes reports only below ignored `.operator-campaign/`, and cannot promote local paths, manifest syntax, two-origin agreement or declarations into proof/finality/funds authority. The installer revalidates the known folder at execution and both installer and source image require immediate rehash before any separately approved elevation. No public manifest or real host report is checked in; installation, inspection, the elevated activation campaign and dual-origin execution remain `not_run`. |
| WP-06 validity preactivation guest | The separately versioned 654-byte `BridgeValidityFinalityPayloadV2` and portable Rust compatibility proof cores are composed under one bounded private witness. The guest and host now pin the exact RISC Zero source selected by the EIP-0045 profile candidate (`8eb06ab020a92dc5b63ba6dd0836d432aba6d890`; zkVM 3.0.5, zkp 3.0.4, recursion 4.0.4) and exact profile ID `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`. One real non-dev Poseidon2 succinct proof verifies against method image ID `5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934`, the exact 9,057-byte witness and 813-byte statement, terminal `join`, and the canonical 222,668-byte raw seal partition `65,535 / 65,535 / 65,535 / 26,063`; the run used 21 segments and 22,020,096 total cycles. SigmaState draft `f78deadd668f801e7fae3bc884283f79c6f484fa` accepts those exact chunks through its authenticated profile loader, claim builder and public JVM raw-seal verifier. Isolated seal, partition, program, chain-domain, contract, payload and profile mutations reject. This is preactivation producer/consumer interoperability only: proof-system ID `2` remains fail-closed, EIP-0045 B4-B8 remain open, and no activated Ergo consumer, transaction acceptance, daemon authority, funds path, Gate 5 closure, trustless claim or readiness claim follows. |
| WP-06W proof transport and consumer ABI | A separate strict TypeScript object now freezes the preactivation four-child EIP-0045 ABI without inventing another binary proof encoding: four raw-seal chunks, the exact 654-byte application payload, guest program and profile. The exact chain domain and contract proposition bytes remain external consumer context and reconstruct the full 813-byte statement; an external raw-seal digest binds transport identity. The profile, program, chunk sizes, statement and all derived fields are fixed or recomputed, unknown fields fail closed, and output is deeply immutable. Same-shape proof bytes are not declared valid: proof validity, source finality, profile activation, on-chain acceptance and funds authority remain false. The object has no `proofSystemId`; aggregate ID `2` remains rejected and V1 proof/commitment bytes remain unchanged. This is a funds-neutral ABI/fixture boundary only, not an Ergo expression, transaction acceptance result, tracker/payout integration, Gate 5 closure, trustless claim or readiness claim. |
| WP-06X executable EIP-0045 consumer conformance | SigmaState draft `f78deadd668f801e7fae3bc884283f79c6f484fa` emits and reparses one exact 85-byte version-4 constant-segregated `VerifyStark` proposition with Blake2b-256 contract ID `9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc`. The real Rust proof statement is bound to that `SELF`, exported only after all host assertions, and protected by a create-last manifest covering every transient file. The relayer ingests the complete candidate through WP-06W, and the pinned JVM accepts the exact deserialized proposition in a one-input funds-neutral transaction. Proof, chunk order/length, payload, program, chain domain, `SELF`, profile lifecycle, context shape and tree-version negatives fail closed without collapsing interpreter errors into proof rejection. This is preactivation input-script conformance only: direct JVM `ContextExtension` construction does not close the WASM/JVM serialization blocker, target-node transaction acceptance and EIP-0045 activation remain external, proof-system ID `2` remains rejected, and no tracker, payout, signing, submission, broadcast, Gate 5, trustless or readiness authority follows. |
| WP-06Y exact two-variable ContextExtension conformance | The complete Rust candidate now enters the real `ergo-lib-wasm-nodejs` 0.28.0 EIP-12 parser with context variable `0 = Coll[Coll[Byte]]` and variable `1 = Coll[Byte]`. The extracted 223,342-byte Sigma `ContextExtension` has Blake2b-256 digest `62909ee396c68bb80ef85b3edab3d39556ebe944bc61be0e5b95f5e57fd742c4`; the same EIP-12 object has unsigned transaction ID `89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e`. The pinned JVM consumes all bytes, recovers exactly keys `0` and `1`, exact types, four proof chunks in order, and the 654-byte application payload, then emits byte-identical serialization. Missing, extra, wrong-typed, reordered, mutated, truncated and trailing variants reject. This closes serialization uncertainty only for this exact two-variable preactivation shape. It does not establish canonical ordering for larger maps, relax the four-Var guard, sign or check a transaction, activate EIP-0045, close Gate 5, or authorize funds. |
| WP-06Z proofless whole-transaction conformance | The same complete Rust candidate now enters one exact one-input, zero-data-input, one-output proofless transaction. Sigma-rust emits 223,421 bytes-to-sign whose Blake2b-256 digest and transaction ID are both `89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e`. The pinned JVM independently constructs the typed transaction, byte-matches the producer, strictly parses and byte-identically reserializes the complete transaction, and preserves the input, exact WP-06Y extension, value-preserving output and output ID. Isolated input, STARK-proof chunk, payload, spending-proof, output, asset, register, data-input, cardinality, truncation and trailing-byte changes reject or change identity as appropriate. This closes the exact preactivation whole-transaction serialization question only; no signature, node check, submission, broadcast, EIP-0045 activation, Gate 5 closure or funds authority follows. |
| WP-06AA validity-authenticated tracker preactivation | `SPVTrackerValidityV1.es` is a new tracker profile with no committee predicate. R9 is instead an immutable 32-byte approved GRANDPA trust-anchor digest, and the exact 1,784-byte proposition is bound into a freshly generated real RISC Zero proof. Its four-variable EIP-12 input carries the exact proof chunks, 654-byte payload, `0x0401` membership plus AVL insert proof, and canonical header selector. Sigma-rust derives ten parent-linked canonical synthetic header IDs and a complete 225,698-byte proofless transaction; the pinned JVM byte-matches every header, parses the exact extension, activates only the local draft capability, and accepts the full conjunction of real STARK proof, approved trust root, selected Ergo-header extension root, tracker NFT, checkpoint fields, AVL transition, and successor registers. Independent negatives cover proof, unapproved/drifting trust root, membership, source identity, anchor selector, monotonic height, tree/counter/stamp, successor proposition/registers, NFT/token cardinality/value, and unavailable-profile boundaries. WP-06AB is now its only separately versioned local settlement consumer. This remains local preactivation VM evidence: the headers are not mined, the proposed 262,144-byte ingress limit is not active on a node, proof-system ID `2` remains rejected, and no signing, node check, submission, broadcast, Gate 5, trustless, or funds authority follows. |
| WP-06AB validity-settlement conjunction preactivation | `MainChainCausalVaultValidityV1.es` and `DoubleUnlockPreventionValidityV1.es` are separately versioned, committee-free, non-deployed ErgoTrees. The exact WP-06AA tracker successor is the sole data input and is pinned by NFT, proposition, sidechain, profile and approved R9 trust-root digest. A 205-byte burn leaf and Merkle path bind the tracker event root to burn ID, source transaction, event index, recipient, amount and zero native-ERG asset ID; the vault binds the same sidechain/profile to its 229-byte source intent and either preserves a partial successor or terminates exactly. The hash-bound DUP input proves absence and its successor proves insertion under the same burn ID. Both protected state successors preserve a nondecreasing, non-future creation height within 100 blocks of VM `HEIGHT`, preventing materially aged continuation boxes without exact-height mempool brittleness. The complete three-input/one-data-input, four-output 4,929-byte proofless transaction includes the DUP, vault and separate fee-funding inputs and round-trips through sigma-rust. Its builder strictly parses and SHA-256 binds the exact raw tracker context, contract-identity receipt and Frontier vector; the JVM pins those source bindings, the SigmaState commit and both contracts' template, resolved-source and proposition identities. The pinned JVM byte-matches all three inputs and accepts both protected predicates on partial and terminal branches while rejecting isolated tracker, proof, payout, source, replay, successor, provenance, fee and ordering mutations. The fee input's synthetic true proposition is not fee-funding authorization. More importantly, the V1 compatibility proof does not establish that `bridgeEventRoot` is a member of finalized Frontier application state; this profile therefore remains a conformance harness and cannot become funds authority. The generated JSON retains false self-asserted reduction, finalized-state-membership and authority boundaries; the pinned JVM suite is the deciding reduction authority for the two protected predicates only. Setup boxes are synthetic and do not establish singleton lineage. This is local preactivation conformance only: no profile activation, target-node check, signing, submission, broadcast, Gate 5, trustless or funds authority follows. |
| WP-06AC application-bound tracker format | TypeScript now byte-matches the frozen Rust 240-byte causal application binding, 973-byte payload and 1,132-byte standard statement, including the Rust golden digests and strict source-network, sidechain, settlement-profile, causal-profile, runtime-code and outer-identity checks. A distinct tracker family derives its key under `E2S_SPV_VALIDITY_APPLICATION_KEY_V2` and stores an exact 370-byte `E2S_SPV_VALIDITY_APPLICATION_VALUE_V2` value. The value binds the event root, checkpoint, supplied Ergo-anchor tuple, sidechain consensus block, burn count, application-binding digest, settlement and causal profiles, a domain-separated digest of the complete 973-byte payload, the V2 guest program and verifier profile. The WASM AVL crate exposes schema-specific 370-byte empty/insert/get/replay operations; its 264-byte V1 functions and digests remain unchanged, and complete proof/digest/value/history cross-schema matrices reject. The pure admission planner checks the exact preactivation profile/program, expected future contract ID, tracker NFT, caller-supplied expected source/application identities, `0x0401` membership under the supplied extension root, chronology and AVL successor. It deliberately does not authenticate the supplied ID/height/root as one Ergo header or turn caller expectations into an allowlist. Proof transport, ErgoTree, JVM acceptance, activation and funds authority all remain false. |
| WP-06AD application-bound tracker preactivation | `SPVTrackerValidityApplicationV2.es` is a separately versioned, committee-free, non-deployed tracker proposition. Its exact 2,424-byte proposition has contract ID `adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b`. One real succinct RISC Zero receipt binds that exact contract through the 973-byte application payload. The four-variable EIP-12 context carries the exact seal chunks, payload, canonical `0x0401` membership plus 370-byte AVL insertion proof, and one header index. The contract obtains ID, height and extension root from that same selected `CONTEXT.headers` object, pins every synthetic application/profile field, recomputes the V2 key/value, verifies `VerifyStark`, preserves the tracker NFT and exact R4-R9 successor, constrains the real successor creation height to be nondecreasing, nonfuture and within 100 blocks of `HEIGHT`, and accepts a nonfuture monotonically advancing R8 application stamp without exact-tip brittleness. Sigma-rust emits and round-trips the proofless transaction; the pinned JVM accepts the integrated positive and rejects proof, transport, membership, header, V1-family, application-field, profile, register, token, proposition, creation-height and capability mutations. A second real receipt remains valid under the pinned RISC Zero runtime after exactly one authenticated bridge-runtime hash byte changes, while the frozen proposition rejects that alternate application profile. A diagnostic proposition that changes only that frozen constant accepts the same alternate transaction, isolating the profile boundary. Duplicate V2 insertion and a V1 insert proof under the unchanged V2 membership prefix reject without interpreter failure. This is a local strict conformance target, not target-node activation, signing, submission, broadcast, Gate 5, trustless or funds authority. |
| WP-06AE application-bound settlement preactivation | A distinct application Frontier vector freezes sidechain/execution identity, three canonical burns and root `d5f26f1ddc319a969c8c3aea47fedd7d8e615c0746fdae84ac9984202aefe3b7`. A separately generated real RISC Zero receipt binds that execution block, root and burn count into the WP-06AD application statement without changing the frozen compatibility fixture. `MainChainCausalVaultValidityApplicationV2.es` and `DoubleUnlockPreventionValidityApplicationV2.es` are separate, committee-free, non-deployed consumers with exact contract IDs `a77327ce3bd279b725ea4dddbbbd78046ab744f3cb75ccf46d5147046fe77064` and `58d1e5b169a86e7906d4d87fe2a4214bd5327ff4053370c6a0fbe3b8e79939b9`. The 6,134-byte proofless transaction consumes one causal vault and one DUP singleton, reads the exact V2 tracker successor, pays one proved burn, preserves remaining vault value, inserts the burn ID and funds the exact fee externally. The DUP counter rejects negative or wrapping transitions, and proof lengths are bounded against remaining bytes before conversion to `Int`. The strict builder SHA-256 binds the tracker context and contract receipt plus the normalized-LF application vector; exact protocol sources are LF-pinned for reproducible Windows checkouts. The pinned JVM accepts partial and terminal branches plus the integrated three-leaf path, while an isolated synthetic tracker state covers the settlement predicate's one-leaf branch without claiming a one-leaf application receipt/admission chain. It rejects isolated V1, tracker, checkpoint, burn, payout, replay, proof-length, negative/wrapping counter, source, successor, fee, ordering, duplicate-fixture-key, provenance and required-context mutations. Extra ContextExtension exclusion remains an exact serializer guard because ErgoScript cannot enumerate keys. This is local preactivation conformance only: setup lineage, activated target-node acceptance, signing, submission, broadcast, Gate 5, trustless and funds authority remain false. |
| WP-06AF exact application instance | The V3 lineage candidate drives a strict four-role compiler boundary. Exact LF-pinned templates resolve in dependency order as tracker -> causal vault -> DUP -> source lock. A guarded launcher verifies an exact Java runtime image and sbt launcher JAR, a clean SigmaState checkout at `f78deadd..84fa`, its locked build inputs, the compiler spec and all four templates before compiling in a disposable worktree; inherited tool-option overrides reject. The generated batch must match the reviewed SHA-256. Independent runs emitted byte-identical 19,352-byte create-only receipts for a 2,424-byte STARK-version tracker, 3,562-byte vault, 701-byte DUP and 867-byte standard-version source lock. TypeScript re-derives the profile from both complete EIP-12 genesis boxes, accepts only the exact receipt bytes, and rejects template, committee, finality-policy, runtime, compiler, proposition and authority drift. The source lock binds the exact six-field intent identity and `Blake2b-256(vault.propositionBytes)`; frozen V2 artifacts remain unchanged. Focused checks, the complete 300-file relayer regression, 23 WASM tests and independent security rereview pass. This is deterministic local compilation only, not setup, lineage, node acceptance or funds authority. |
| WP-06AF deterministic unsigned lineage | A same-process compiled V3 instance materializes four byte-deterministic unsigned transactions: separate tracker and DUP singleton issuance, source-lock creation, and an unsigned source-lock-to-causal-vault commitment. The packet remains useful construction evidence, but its R4/R5 source reference is copyable metadata and does not establish descendant-only vault authority. A follow-on experiment that required `vault.tokens(0).id == vault.R5` was independently falsified: an unrelated first input can issue a self-consistent token and construct the same vault shape without spending the reviewed source-lock proposition. That experiment was discarded before commit. The committed AF-3 packet still performs no node check, signing, submission or broadcast and explicitly establishes no singleton lineage, source consumption, activated profile, funds authority, Gate 5 closure, trustless status or production readiness. |
| WP-06AF-4 security decision | Descendant-only funds authority must be rooted in one reviewed genesis-derived settlement-vault NFT, not in per-deposit self-consistency or process branding. The next family is a new version: one canonical pooled reserve singleton, one append-only deposit-commitment state, externally funded fees, and the existing separate tracker and DUP responsibilities. Deposit commitment must atomically consume the exact refundable source lock and current reserve singleton; burn settlement must atomically consume the same reserve lineage and DUP singleton. V1/V2/V3 bytes, domains and fixtures remain compatibility material and are not reinterpreted. |
| WP-06AF-4A pooled-reserve profile | The separate 601-byte V4 profile derives tracker, DUP and settlement-vault NFT identities from three complete, pure-ERG, register-free and pairwise-distinct EIP-12 genesis boxes. Its exact-key codec binds the explicit zero native-ERG asset identity, separate sidechain and Ergo-deposit finality policies, and role-distinct template/proof/state policies under a new domain without modifying V3. Same-process provenance rejects clones, caller-built candidates and accessor-backed substitution. All setup, lineage, mint, burn, activation, node, signing, submission, broadcast, funds, Gate 5, trustless and readiness boundaries remain false. |
| WP-06AF-4A-2 exact instance and unsigned setup | The V4 profile now resolves and compiles a distinct tracker -> DUP -> source-lock -> pooled-reserve family through one exact create-only compiler batch. Three separate deterministic unsigned transactions issue the exact genesis-derived singleton NFTs with contract-compatible registers: tracker R4-R9 bind profile/tree/sidechain/height/stamp/trust anchor, DUP R4-R5 bind profile and insert-only replay state, and reserve R4-R6 bind profile, a dedicated insert-only 32-byte-value deposit tree root and zero liability. The reserve root is schema-distinct from the one-byte DUP root and its exact empty digest replays the first 32-byte commitment insertion. The setup packet is same-process, deep-frozen and non-authorizing. It establishes no on-chain lineage; the deposit and burn branches are compiled candidates only until their AF-4B/4C JVM acceptance matrices pass. |
| WP-06AF-4B-1 local deposit acceptance | The deterministic builder now creates the refundable V4 source lock and atomically consumes it with the exact pooled-reserve predecessor and external fee input. It supports the empty reserve and later append-only deposits by reconstructing the 32/32 AVL history, preserves the genesis free-reserve seed, and advances value and liability by the exact source amount. A pinned JVM matrix accepts two chained deposits and the exact timeout refund while rejecting topology, NFT, proposition, profile, proof, replay, conservation, fee and ContextExtension faults across both protected scripts. A separate two-port observation candidate proves that the original deposit commitment remains in the current reserve descendant, but deliberately leaves transaction-to-block inclusion, authenticated source registration, immediate revalidation, mint eligibility and every funds boundary false. |
| WP-06AF-4B-2 concrete Ergo observation | One statically registered, credential-free adapter now binds two explicitly configured non-mainnet node origins and distinct node/administration identity digests to the AF-4B-1 view. Each source recomputes the signed transition ID, observes the exact transaction in its claimed full-block response, checks that block header against direct canonical ancestry under one stable full-index snapshot, reconstructs the complete deposit-only reserve-NFT lineage from the current canonical UTXO back to issuance, replays every exact 32/32 deposit insertion, checks liability/free-seed conservation and value-neutral external fees, requires the source and predecessor spent, and generates the retained deposit-membership proof. A fresh complete dual-source rerun primitive rejects changed inclusion/target, backward tip, restored collateral, lineage loss, source disagreement or use of a different source-pair object. It is not an atomic mint handoff and must never be accepted later as caller-supplied authority; AF-4C invokes it internally while constructing mint admission. WP-01C later added canonical header-ID and complete signed-transaction-root verification with exact per-source receipts. Historical finality independent of the current UTXO lineage, PoW and canonical-consensus authentication, independent node control, mint authorization, signing, submission, broadcast, funds authority, Gate 5, trustless status and readiness remain false. |
| WP-06AF-4C-1 deterministic V4 burn settlement | A pure builder now snapshots and validates the exact V4 tracker, pooled-reserve and DUP predecessors, canonical V1 burn leaf and V2 settlement bundle, then creates one deterministic unsigned transaction. It authenticates the burn under the versioned V4 tracker value and AVL history, enforces the Ergo anchor-depth policy, pays the exact recipient and native-ERG amount, decrements reserve value and liability together, inserts the burn ID once, and funds the miner fee from a separate pure input. Exact topology, context variables, successor registers and all-false authority boundaries are frozen. Local construction and negative vectors do not establish JVM, node or on-chain acceptance. |
| WP-06AF-4C-2 pinned-JVM burn acceptance | One exact proofless AF-4C-1 transaction is materialized through the pinned WASM serializer and evaluated against both compiled V4 protected inputs in SigmaState `f78deadd..84fa`. The canonical conjunction accepts. Ten JVM tests reject isolated topology, tracker identity/profile/proposition/AVL policy, burn leaf/root/path/count, payout, reserve NFT/profile/value/liability, DUP replay/proofs/successor, fee and ContextExtension faults; extra-variable exclusion is a serializer-harness rule because ErgoScript cannot enumerate ContextExtension keys. The reserve predicate decides payout, reserve conservation and fee constraints; the DUP predicate decides full burn inclusion, anchor depth and replay insertion. A fault delegated to one predicate still rejects the transaction because both inputs must accept. Fixture, spec, compiler lock/receipt, Java image, sbt launcher and SigmaState identities are fail-closed and hash-pinned; freshly resolved transitive JARs remain repository/TLS-dependent rather than individually content-attested. This is local JVM predicate acceptance only: no node check, signing, submission, broadcast, target activation, sidechain-finality proof, Gate 5 closure, trustless status or readiness follows. |
| WP-06AF-4C-3 fresh mint-admission join | One async, process-branded constructor accepts only the compiled V4 instance, exact deposit transition and statically registered dual-source Ergo pair. It invokes the complete AF-4B-2 observation and fresh rerun internally, then binds the canonical source intent and ID, consumed source box, reserve transition and retained commitment, raw native-ERG amount, recipient, sidechain/contracts, V4 profile and existing domain-separated mint identity. Unknown caller fields, supplied observation/revalidation objects, accessors, cloned candidates and collateral restored before the rerun reject. Repeated unchanged reads produce the same semantic identity. WP-01C now carries canonical header-ID and complete signed-transaction-root receipts through that observation, rerun and candidate identity. This remains a point-in-time local non-authorizing condition: PoW and canonical-consensus authentication, independent node control, historical mint absence, authoritative duplicate-state absence, atomic handoff, target execution, signing, submission, broadcast, funds authority, Gate 5, trustless status and readiness remain false. |
| WP-07B-T1 canonical V4 reservation statement | The authenticated replay-state inventory proves that `PendingCausalPegInsV2` and its V1 `sidechainId + sourceBoxId` replay key cannot safely accept the pooled-reserve candidate: AF-4C-3 uses the separate `E2S_PEG_IN_MINT_ID_V4` identity and a different source-observation boundary. A new 603-byte V4 statement now binds the exact V2 source-intent bytes and ID, V4 lineage and mint identity, consumed source box, reserve-transition transaction, deposit commitment, successor reserve box, complete 33-byte AVL digest and liability, plus the exact Ergo inclusion/finality target. Its domain-separated statement ID and golden vector are stable. Only a same-process AF-4C-3 candidate can produce the process-branded request; caller proof fields, clones and persistence substitutes reject. The request contains no proof, runtime call or transport capability and leaves every state, execution and funds boundary false. |
| WP-07B-T2 Frontier V4 reservation state | The pinned Frontier patch reproduces the exact 603-byte statement, V4 mint identity and statement ID in Rust. A separately versioned runtime profile selects one statically compiled source-proof verifier and owns disjoint pending, consumed and invalidated V4 namespaces. V4 activation is sticky and mutually exclusive with the legacy causal mode; after activation, legacy admission, profile mutation and `PegIn` collection reject before writes. The reference runtime keeps public activation compile-time disabled; its only accepting proof fixture exists under `cfg(test)` and uses an explicitly rejected runtime profile identity. The proof binds the exact runtime-profile ID, statement ID and bytes digest, proof-system/profile IDs, issuance and expiry, and cannot predate profile activation. The signed reservation call rechecks every returned binding plus the strictly ordered, unique, map-complete pending index before its first write. It then stores one pending reservation atomically and never calls EVM, consumes a reservation, signs, submits or broadcasts. Exact-vector, fail-closed activation, both legacy/V4 activation orders, duplicate, terminal-state, legacy replay, identity-substitution, proof/profile/activation-window drift, corrupt-index, expiry, capacity and unchanged V1/V2/V3 matrices pass against the regenerated source-locked patch. This is local runtime conformance only: no real source-proof profile is registered, no accepted finalized storage proof is collected, no mint is executed, and Gate 5 remains open. |
| WP-07B-T3A authenticated V4 reservation-state collection | A static collector accepts only a fresh same-process AF-4C-3 reservation request and an authority-bound contained native verifier before making any RPC call. The authority declaration immutably exposes the one operation selected by its separately signed exact execution policy; V1 and V4 wrappers reject each other's authorities before provenance is issued. A generic direct GRANDPA finality envelope authenticates the target header without consulting bridge-event or burn-commitment storage. One bounded trie proof reads exactly `:code`, the active V4 profile, sticky enforcement, the complete pending index, and the target pending, consumed and invalidated entries. The source-locked Rust verifier reproduces the exact 603-byte statement and V4 mint identity, validates runtime code plus profile identity, and classifies `absent`, `pending`, `consumed` and `invalidated` as mutually exclusive states. The result is frozen, process-provenance-bound and non-authorizing; `absent` is not reservation authority. No journal, SQLite row, cache, mint, signer, submitter, broadcast, Gate 5, trustless or readiness authority follows. |
| WP-07B-T3B terminal expiry and reconstructible recovery | Expired V4 pending state is now terminal rather than retryable. A signed, permissionless runtime call at index `7` revalidates the complete pending record and ordered index, removes only the expired target, and atomically writes a domain-separated invalidation tombstone; existing error/event discriminants remain stable. The relayer accepts only a fresh same-process T3A result, runs collateral and reserve-lineage continuity ports before persistence, and stores an append-only SQLite observation journal plus a monotonic hold projection. `absent` remains non-authorizing; expired pending remains held until fresh authenticated runtime state reports `invalidated`; `consumed` and `invalidated` cannot roll back. A later finality horizon requires the process-branded T3C cross-observation ancestry described below. Restart, atomic persistence failure, complete database loss, duplicate/out-of-order/conflicting observations, trust-anchor drift, terminal replay, divergent collection, collateral restoration, reserve rollback and authority-table non-mutation are covered. This remains local lifecycle evidence only: no mint executes and no Gate 5 or readiness claim follows. |
| WP-07B-T3C source-owned recovery composition | One public composition accepts only the compiled V4 instance, exact deposit transition, static dual-Ergo source pair, static Substrate proof dependencies and non-authorizing persistence. It internally builds AF-4C-3, selects the current finalized native target, collects a fresh T3A result, then rebuilds AF-4C-3 through a complete AF-4B-2 rerun before persistence. The canonical 603-byte statement, statement ID and reservation key must remain exact; the point-in-time admission digest may change as the Ergo tip advances and remains observation provenance rather than stable reservation identity. A later finality horizon is accepted only through process-branded evidence reconstructing every canonical SCALE header from the held horizon to the newly authenticated T3A horizon. Caller-supplied targets, observations, child reports and ancestry objects are not accepted. Restart and complete database loss rebuild only non-authorizing holds from fresh sources. No mint, signer, submitter, broadcast, Gate 5, trustless or readiness authority follows. |
| WP-08A-T1 settlement-core boundary | Source-neutral Sigma/Ergo serialization helpers, Ergo extension membership verification and deterministic ERG change/fee conservation planning now live behind `relayer/src/ergo-settlement-core`. Existing import paths are behavior-preserving compatibility re-exports. Current DUP digest, miner-fee constants and proveDlog key validation remain outside the source-neutral core because they are compatibility/profile, policy or broad-crypto-capability surfaces. A TypeScript-AST import checker enforces the allowed one-way graph for every physically extracted runtime layer, rejects imports back into unclassified legacy modules, restricts settlement-core dependencies to reviewed pure packages, rejects dynamic and alternate TypeScript import bypasses, blocks direct and statically recognized indirect access to unbound environment/network/crypto/dynamic-code capabilities, and detects layered module cycles. The canonical bounded check runs it automatically. This is the first physical boundary, not completion of WP-08A. |
| WP-08A-T2 Substrate/GRANDPA V1 profile | The pure V1 burn leaf/Merkle family, 216-byte checkpoint and `0x0401` binding, 356-byte finality statement, aggregate proof envelope, and 496-byte proof-identity commitment now live under `relayer/src/profiles/substrate-grandpa-v1`. Legacy module paths re-export the exact profile bindings. Golden-vector tests retain the existing bytes, domains, versions, IDs and digests; proof-system ID `2` remains reserved and fail-closed. The profile has no collection, native execution, RPC, persistence, signing, submission, or broadcast capability. The shared native-request limit remains infrastructure-owned, while the frozen V1 envelope ceiling is parity-checked against it. The executable import rule now restricts profile dependencies and ambient capabilities as well as settlement-core dependencies. This completes one concrete compatibility family, not the full V1 profile, Gate 5, or WP-08A. |
| WP-08A-T3 relayer-core recovery boundary | Aggregate-settlement recovery now runs in `relayer/src/relayer-core` behind an observation port and an exact journal/CAS port. The existing compatibility entry point preserves the daemon call and result shape and now delegates concrete composition to T4. Direct port tests preserve the all-observations-before-recoverable-mutation barrier, legacy-policy defer, ordered-burn CAS, pre-finality rollback, confirmed-reorg quarantine, already-quarantined replay, confirmed-listing order and empty-journal no-op after database loss. The core exposes no RPC, SQLite, generic persistence, checker, signer, submitter or broadcast capability. The import checker now applies an empty external-dependency allowlist and ambient-capability restrictions to relayer-core. This is the first lifecycle boundary, not complete WP-07 replay, Gate 5, trustless status, readiness or publication authority. |
| WP-08A-T4 recovery adapters and composition root | The stable/matching Ergo observation, finality record and endpoint alignment implementations now live under `relayer/src/adapters`, with exact runtime-identity compatibility re-exports at their prior paths. A recovery-specific adapter binds one primary Ergo client and optional provenance-bound witness pair; a separate journal adapter exposes only four exact `StateTracker` operations, copies ordered burns at the mutation boundary and rejects impossible list statuses. `relayer/src/apps/bridge-daemon/aggregate-settlement-recovery.ts` statically assembles both adapters with the T3 core, while the existing daemon/CLI facade and result shape remain unchanged. The complete recovery runtime closure is scanned to exclude checker, signer, approval, submitter, transport and broadcast capabilities. This is the first concrete adapter/application slice, not complete WP-07 replay, Gate 5, trustless status, readiness or publication authority. |
| WP-08A-T5 authenticated candidate profile boundary | The complete current authenticated unsigned-candidate vertical now lives under `relayer/src/profiles/substrate-grandpa-v1`: tracker history/value and exact 264-byte semantics, single-key DUP reconstruction, the ten-confirmation anchor policy, burn/root/payout/replay plan, contract/NFT/register checks, ERG conservation and deterministic unsigned transaction construction. Source-neutral box and unsigned-transaction types live in `ergo-settlement-core`. Legacy tracker, AVL, policy, limit, builder and transaction paths retain their runtime bindings. The service still owns observation, EIP-12 materialization, ContextExtension reporting and the process-local live provenance brand; profile and offline results remain non-authorizing. Exact file-and-symbol-scoped import exceptions permit only the reviewed AVL operations and secp256k1 public-key validation binding. Frozen positive/negative transaction-shape, proof, replay, anchor-depth and provenance matrices remain green. This is a candidate-construction boundary, not JVM acceptance, source finality, signing, submission, broadcast, Gate 5, trustless status, readiness or publication authority. |
| WP-08A-T6 committed-vault and mint-identity profile boundary | The exact current V1 commitment planner, committed-vault transaction/box bindings, EVM `processedPegIns` identity, native runtime-record codec and sidechain-domain-separated native replay identity now live under `profiles/substrate-grandpa-v1`. Legacy commitment and runtime-state paths are exact compatibility re-exports. The profile accepts canonical typed transaction/box fields only; `peg-in-transition.ts` owns raw RPC/SDK alias normalization and rejects contradictory transaction, inclusion-block or inclusion-height aliases before profile evaluation. At the T6 checkpoint it also retained canonicality, confirmation depth, source/vault UTXO observation, persistence, EVM dedup/mint calls and every submission boundary. Later retirement removed the mint and committed-vault submission APIs; current transition behavior is observation/reconciliation only. The profile result is a normalized binding, not eligibility or mint authority. Existing commitment, transition, runtime golden-vector, route and non-authorizing candidate matrices remain the deciding coverage. No source-neutral H160 or replay concept was added to `ergo-settlement-core`. This is a compatibility-profile boundary, not authenticated consensus, mint authority, signing, submission, broadcast, Gate 5, trustless status, readiness or publication authority. |
| WP-08A-T7 static native-ERG asset profile | The exact public V1 meaning is now one statically selected off-wire profile under `profiles/substrate-grandpa-v1`: burn-leaf version `1`, domain `E2S_TRUSTLESS_BURN_LEAF_V1`, all-zero 32-byte native-ERG asset ID, and positive Ergo-Long nanoERG amounts. It records each current encoding separately: burn-leaf u64 big-endian, peg-in runtime u64 little-endian, and committed-vault box value plus Ergo Long R6. Peg-in commitment, committed-vault and verified-PegOut leaf/proof production require its exact identifier; unknown, case-drifted or token-profile identifiers reject before funds or leaf construction are evaluated. Frontier root production, native checkpoint admission, candidate binding, unsigned-package validation, contract-acceptance mirroring and committed-vault mint-eligibility consume the same descriptor. The raw leaf codec still accepts nonzero asset bytes solely so isolated negative vectors can exercise rejection, but runtime proof producers cannot select them; this does not define token semantics. Existing leaf, root, candidate, package and contract bytes remain unchanged. A token lane still requires a new reviewed profile and, unless public semantics are separately specified without ambiguity, a new leaf version and domain. This is semantic selection, not a token lane, mint or payout authority, Gate 5, trustless status, readiness or publication authority. |
| WP-08A-T8A authenticated candidate reconciliation lifecycle | Restart reconciliation now runs through a second network-free `relayer-core` lifecycle plus exact journal and Ergo-observation adapters assembled by a static `apps/bridge-daemon` root. It prunes stale process-local cache entries, invalidates missing peg-outs, applies the existing atomic burn-reverted/candidate-invalidated transition, defers unknown or unavailable source views, rejects a replaced anchor or spent tracker/DUP/vault input, retains an exact current revalidation, and recollects only a non-authorizing process-local revalidation. The concrete proof recollection and profile prerequisites remain in the daemon callback. Empty-journal, restart-cache, burn-reorg, RPC-outage and stale-input matrices pass; the complete layered closure excludes legacy state/RPC imports and checker, signer, approval, submitter, transport and broadcast capabilities. Database-loss package recovery and out-of-order cache-snapshot handling were deferred to T8B; remaining out-of-order check-to-execution replay remains T8C. No candidate check, signature, submission, broadcast, Gate 5, trustless, readiness or publication authority follows. |
| WP-08A-T8B authenticated V2 package-recovery lifecycle | Database-loss prepared-candidate recovery now runs through a third network-free `relayer-core` lifecycle, three exact adapters and one statically imported `apps/bridge-daemon` composition module. The core orders package/candidate reconstruction, matching sidechain observation, deterministic recovery binding and one journal mutation; rejects fresh-tip or candidate/burn/payout binding drift before persistence; brands only the live admission; and requires status exactly `prepared` with every checker/finality authority field null. The Substrate/GRANDPA V1 compatibility facade retains concrete unsigned-package validation, native candidate provenance and dual Frontier RPC observation. The exact adapter owns SHA-256 binding. `StateTracker` independently reasserts cache, candidate and source provenance, recomputes that canonical digest, and retains the immediate transaction that rechecks current tracker/DUP/vault caches, rejects replay and atomically writes the peg-out plus prepared candidate without authority-bearing fields. Cache replacement and candidate recovery remain separately atomic and are not presented as one transaction. Complete DB loss/restart, identical duplicate recovery, out-of-order cache snapshots, package/cache drift, valid-provenance mix-and-match, arbitrary binding digest, divergent RPC, deep reorg, tip drift, SQLite locking and rollback remain covered. Full out-of-order replay across later lifecycle capabilities remains T8C. No checker, signer, approval, submitter, transport, broadcast, Gate 5, trustless, readiness or publication authority follows. |
| WP-08A-T8C1 authenticated check-to-reservation lifecycle | One fourth network-free `relayer-core` lifecycle now orders exact revalidation, unsigned-package binding, local signing, JVM checking, stable Ergo and sidechain observations, check admission and journal mutation, execution authorization, and durable execution reservation. Eleven frozen single-operation adapters and one static `apps/bridge-daemon` root expose only that check-to-reservation capability set. The Substrate/GRANDPA V1 compatibility facade binds a versioned native-ERG payout digest, the exact package/revalidation chain, one process-local opaque signed handle, checker result, stable views and split-check-only branded admissions into the core; the existing explicit non-mainnet CLI now consumes this root. Signed bytes remain in a private signer/checker material registry and are absent from the handle, compatibility result and reserved handoff. Signing and checking are separate capabilities bound to that handle and one canonical node origin. The legacy combined check helper remains compatibility-only and its acceptance is rejected by execution check admission. The handoff explicitly has no submitter, transport reservation, broadcast authorization, confirmation or funds authority. A separate full-core matrix establishes the intended later ordering, requires a durable attempt identity before transport, preserves ambiguous outcomes for reconciliation, and journals stale/reorg observations as quarantine, but no concrete transport or confirmation adapter consumes that continuation yet. No submission, broadcast, Gate 5, trustless, readiness or publication authority follows. |
| WP-08A closeout C2 historical operational capability separation | At C2, the daemon's committed-vault, SCS-update, and DUP-heartbeat routes entered three fixed compatibility facades backed by one network-free `relayer-core` lifecycle and six single-capability adapters. Subsequent slices retired all three concrete submission facades. New committed-vault deposits remain refundable because the daemon does not select a fee box, reserve a transaction, or submit their transition while authenticated V4 mint authority is unavailable. Already-recorded committed-vault, SCS, and DUP attempts retain exact observation and fail-closed reconciliation but cannot create a new submission; the daemon observes the configured finalized sidechain head only for operator health. Historical operation profiles remain for identity decoding, reconciliation, and generic journal-schema compatibility. The source-closure digest consumed by the V4 review profile and V5 eligibility candidate binds the absent fixed facade, the daemon markers, and the whole-runtime AST retirement guard, and requires legacy deploy/redeploy entrypoints to remain absent. This is local source-capability removal only: it does not retire an already deployed `MainChainLock`, `SideChainState`, or DUP route, repair historical contract predicates, authenticate source consensus, establish deterministic finality, close Gate 5, or authorize mint, payout, signing, submission, broadcast or readiness. |
| Last completed package | P1 V5 integrated proof-engine and complete settlement predicate closure |
| Active package | **WP-06-FED - EIP-independent federated reference profile.** FED-1 through FED-4 are frozen local, non-activating checkpoints. The FED-5A/FED-5B migration path owns target-specific compilation, global replay import, legacy-retirement requirement freeze, unsigned materialization and a non-executable setup-check request. The separate FED-5G1/G2 greenfield path now owns a threshold-authenticated launch baseline, empty replay derivation, distinct unsigned provisioning generation and config-free fresh-process replay; no concrete target packet has passed it. FED-6 owns exact signed JVM and `/transactions/check` setup acceptance, separately authorized setup submission and canonical confirmation, and only then peg-in/peg-out acceptance and execution under separate exact-candidate approvals. The separate WP-06-STARK lane and proof-system ID `2` remain dormant. |
| Latest completed slice | **FED-6-LAB Frontier application-burn proof checkpoint.** One source-locked Rust TestClient test now deploys the reviewed application, consumes the exact federated reservation into mint, executes the real burn call, decodes the emitted PegOut fields, reconstructs the runtime leaf/root, and checks the net supply delta plus fee escrow. Overlay SHA-256 `f0c31b1cf5f4da548438eab7a2467b8e6ef6e5eb023053ad07cdd6735fca93dc` reproduces the exact tested Rust source. A pure TypeScript transcript consumer binds those fields and rejects application, ABI, key, topology, burn, root and conservation drift while stating that complete receipts and same-process provenance are absent. This closes the local application producer/transcript join only; finality, tracker admission, replay insertion, payout, confirmation, Gate 5, trustless status and readiness remain open. |
| FED-6 local validation map | **Invariant:** retained bridge code may model and journal the exact setup lifecycle, but no local result, journal row or injected port may expose a concrete signer or transport capability after the authorized run. Reward delay 1 or 720 remains digest-bound to the exact signer-owned reward proposition. The exact FED-6 reobservation invocation must use `NonMiningResume`, which requires `ResumeExistingDataDir`, rejects a runner-supplied mining-mnemonic reference and forces both primary and witness processes to non-mining mode; discovery and the separate observer use bounded GET-only requests and verify chain identity. This leaves the documented Phase 011b mining-enabled resume workflow unchanged and outside FED-6 evidence. **Owned paths:** the existing patched-devnet runner and no-submit conformance/check modules; the signer-first session, reward-input discovery and canonical history producers; the bounded read-only node client; `relayer-core/substrate-federated-local-devnet-genesis-execution-v1{.test,}.ts`; the generic operational lifecycle; and the StateTracker operational profile. **Current checks:** exact delay and reciprocal-mismatch matrices; deterministic signer-bound three-input selection with dual-source disagreement, ambiguity, immaturity and signer-drift negatives; canonical header/transaction/UTXO construction and mutation negatives; pinned JVM conformance; pure lifecycle ordering and provenance negatives; unresolved-attempt/restart journal constraints; runner source guards; Node 24 typecheck; layer imports; broadcast-surface isolation; the live exact-three local execution; the exact dual-origin non-mining reobservation; source-lock and committed-vault execution receipts; the fresh real-component peg-in campaign; and the sanitized receipt reparse above. The tracked setup CLI, sole static execution root, process-owned local transport and live port registration are closed for the exact LAB setup family. The value-path root now reaches exact source consumption, non-refundable reserve lineage, source-owned evidence, packet-bound threshold attestation, and local source-locked Frontier TestClient reservation/mint consumption while returning no signed bytes or capabilities. This is not operational mint authority. Official target approval, authenticated route-retirement evidence, source-consensus authentication, global replay import, peg-out, recovery and activation remain unvalidated. |
| Following boundary | **FED-6-LAB same-process burn evidence runner.** Apply the exact overlay to the exact Frontier source, build and execute only the named application-burn test under the pinned tool/source closure, consume its stdout in the same owned process tree, and emit a process-proven non-authorizing receipt. Then join that canonical burn to the exact federated checkpoint/source proof, tracker admission, global replay insertion, externally funded Ergo payout and confirmation on one fresh process-owned loopback campaign, stopping before recovery. |
| Next implementation action | **Inventory and compose the existing burn-to-payout producers before adding code.** Reuse the frozen burn leaf, federated statement/profile, V4 reserve/DUP conservation predicates, checker/signer/authorization/reservation/transport stages, and lifecycle ports where their exact authority semantics already match. Add only the missing producer-to-consumer joins needed for one fresh campaign. Reject wrong bridge/token/code identity, unfinalized or stale checkpoint, root/proof drift, payout or amount drift, replay across every retained profile lineage, fee-from-backing, burn disappearance before transport, and every local-status or timeout payout path. Do not redesign peg-in or repeat its campaign while its exact inputs remain unchanged. Recovery remains the following slice; every public-network, real-funds, Gate-5, trustless and readiness boundary remains false. Keep issues #1 and #2 open for external review and independently operated evidence. |
| Public delivery cadence | **Push coherent green bridge milestones, not intermediate WIP.** Keep edit-loop work and broken candidates local. Before each public promotion, review the exact diff, run the validation closure whose transitive inputs changed, run the publication guard, and preserve the superproject-source to standalone-tree mapping. Use review branches or PRs for protocol, contract, proof, authority, signing, settlement, or other security-sensitive changes; direct updates are reserved for bounded CI/docs/package corrections with explicit authorization. A push never authorizes a release, deployment, signing operation, submission, broadcast, live funds, or stronger readiness claim. |
| Parallel blocker lane | EIP-0045 B4-B8 activation, an exact target-node ingress/schedule identity, and non-broadcast stateful acceptance remain external. The current EIP work has closed B1-B3 but still has B4-B8 open; the producer matrix is 218/254 and no activation generation, height, node version, or testnet schedule exists. No compatible activated node currently exists, and the 226,795-byte proofless candidate exceeds the official 98,304-byte default ingress limit; the proposed 262,144-byte ceiling is not deployed. Track upstream activation and build the acceptance packet only when an exact compatible node exists. Do not create another local surrogate, enable proof-system ID `2`, or substitute local JVM acceptance, legacy R9 attestation, or two-node agreement for an activated Ergo value-release path. |
| WP-07A peg-in recovery state | Ergo route reconstruction and the dual-source Frontier event/receipt/mapping view are joined and persisted atomically as a non-authorizing cache. Restart, database-loss rebuild, route invalidation, mixed-generation reads, tamper rejection, read-only inspection, and lifecycle-authority preservation are covered. A bounded daemon pass now binds explicit route/profile configuration to the active deployment, recollects distinct Ergo and Frontier views, and applies exact lifecycle/cache CAS holds before the first lifecycle selection. The pinned Frontier patch defines Peg-In Runtime State V1: a versioned active profile and persistent successful-`PegIn` record keyed independently of profile rotation. The V1 native finalized-state proof profile authenticates historical membership directly and current non-membership against the exact active profile; its separately versioned signed execution policy authorizes only `verify-peg-in-state`. The separate V2 proof-core defines raw `:code` verification under the same finalized state root and a read-only collector requests exactly `[:code, record]` or `[:code, active profile, record]` in one bounded proof. Rust vectors, TypeScript bindings, policy tests, and collector negatives keep V1 and V2 schemas and boundaries distinct. WP-06T12 adds separate runtime-Wasm and native-V2-verifier attestation families, a policy signed through the native attestation, contained dual-registry execution authority, and a provenance-bound candidate-output path. WP-06T13 binds that route to the exact content-addressed launcher image and V2 authority record while retaining the image handle and rotation mutex. WP-06T14 pairs an execution membership candidate with its exact direct-parent non-membership candidate and selects the expected producer code from the parent request, while retaining both child outputs as quarantined digests. The elevated installation campaign, accepted state proofs, complete runtime history, external attestor custody, and target execution identity are still absent, so sidechain finality, historical mint absence, cutover, and mint authority remain false. No daemon or reconciliation consumer imports the lineage candidate, and no reconciliation hold is released. Missing configuration, source disagreement, recollection failure, proof drift, registry loss, policy drift, ancestry drift, or CAS drift fails closed. Full runtime history, cutover semantics, committed-vault binding, hold release, and a concrete approved dual-node exercise remain open; current runtime reports always deny lifecycle selection. |
| WP-07A T15 boundary | The checkpoint-to-execution history composer and collector have no daemon or reconciliation consumer. They create a process-local, digest-bound expectation candidate only. Database state, lifecycle selection, reconciliation holds, signing, submission, and broadcast remain unchanged. An accepted stable snapshot, accepted child proofs, reviewed runtime invariants, cutover semantics, and committed-vault binding are still required before any WP-07A authority can change. |
| WP-07A T16 boundary | Runtime invariant review reports and their T15 join have no daemon or reconciliation consumer. Validation relative to a supplied reviewer policy does not establish source-owned custody; the canonical registry intentionally has no active profile. An event from the configured bridge does not prove deployed code identity, token ownership, or a supply delta. No lifecycle selection, hold release, transaction mutation, signing, submission, or broadcast authority follows. |
| Evidence generation | Frozen until an implementation artifact changes |
| Release claim | Prototype/research only; no trustless or production-ready claim |

Update this table in the same commit that completes or changes a work package.
Do not advance the active package because a test, document, or evidence packet
exists; advance it only when the package Definition of Done is satisfied.

WP-01 and WP-02 source controls and manifest-bound observation tools are
implemented. Neither tool authenticates manifest review, activates a
deployment, closes live evidence or Gate 5, or proves operational independence
of its two origins. WP-03 now makes both consensus-source bases and their
bridge-owned patches reconstructible. The Frontier patch implements the
runtime-local commitment producer; sidechain finality and authenticated root
admission are still open.

In the release-gate and historical evidence sections below, `publication` and
`public release` mean a supported release publication unless a sentence
explicitly says `source publication`. Public source distribution for research
review is governed separately by WP-08G and never upgrades a readiness claim.

## What `Continue` Means

When the user says `continue`, the main agent must:

1. Read this file and inspect Git status and the latest local commits.
2. Resume the active work package. If a coherent prior slice is already complete,
   verify and commit it before continuing.
3. Execute one medium batch that closes an independently testable
   producer-to-consumer join or fail-closed boundary, not a test-only or
   evidence-only micro-slice.
4. Use focused tests during development and continue through the mechanical
   steps inside that boundary. Stop at a commit when the boundary is coherent;
   do not absorb unrelated proof, cutover, operations, or release work.
5. Use subagents only for meaningful parallel work with disjoint file ownership.
6. Run the batch-level affected closure before its commit and the broader
   package-level matrix once before declaring the work package done.
7. Commit locally after each coherent passing batch and update Execution State.
8. Move directly to the next package without asking for routine staging or commit
   approval.

No agent may push, publish, deploy, broadcast a transaction, use live funds, or
mutate public GitHub state without explicit approval. Runtime databases,
deployment state, local logs, secrets, mnemonics, and `.env` material remain out
of scope.

### Critical-Path Throughput Contract

Execution is organized around named security or authority work packages, each
delivered through medium batches. A batch closes one producer-to-consumer join
or fail-closed boundary and normally owns one to four runtime/source files plus
direct tests. Tests, codecs, adapters, documentation and evidence are not
standalone delivery unless they close that boundary or remove a concrete
blocker. Do not stretch a batch across unrelated proof, cutover, operations and
release surfaces, and do not split one boundary into test-only micro-commits.

At most two subagents may run concurrently. Give one a disjoint implementation
or deciding research surface and reserve the second for an independent review
or another disjoint blocker analysis. Shared state schemas, contracts,
`relayer-daemon.ts`, `state-tracker.ts`, the active plan and final integration
remain main-agent owned. Close idle agents and never duplicate exploration,
implementation or validation between lanes.

The checkpoint record in this plan or the active handoff is the validation
dependency map. It identifies task-owned paths, the invariant closed, checks
that became due, still-green results reused without replay, invalidated results,
residual blockers and the next executable milestone. Focused affected checks
run at each stable batch boundary. Broad suites run once at work-package
closeout, and independent review runs at the smallest stable strict/critical
boundary that can be reviewed without later invalidation. External blockers
are rechecked only when their pinned source, activation state, node capability,
schedule or target environment changes.

For the current critical path:

| Lane | Assignment | Completion boundary |
|---|---|---|
| Main implementation | FED-6-LAB value paths and recovery | The exact isolated setup lineage is closed at `620a075e`; source-lock and committed-vault execution are closed through `49218bcd`; and commit `da2f99d9` plus receipt `5b3f70cf70b8f8d1810a1ebb3ae791e580d6dbfcd25e42f367b3a545be6d009b` close the fresh real-component committed-reserve-to-federated-TestClient-mint join without restoring owner-key authority. Add the independently authorized burn-to-proof-to-global-replay-to-payout path next, followed by restart, rollback, RPC-disagreement and database-loss recovery. Preserve all V1 bytes and `no-submit` semantics. |
| Blocked migration execution | WP-06-FED-6M approved-target acceptance and canonical setup lineages | After an approved exact non-mainnet migration target and authenticated retirement evidence for all 53 legacy routes exist, rebuild the same-process target generation, sign and check the exact three setup transactions, then submit and confirm them only under separate explicit authorization. Keep the active static registry `null` until every deciding receipt and lineage joins atomically. |
| Parallel external assurance | Public issues #1 and #2 | Collect independent review and independently operated target/custody evidence without making local progress depend on volunteer response. External evidence may later strengthen the institutional package, but it cannot be manufactured by the self-operated LAB campaign. |
| External blocker watch | Dormant WP-06-STARK EIP-0045 B4-B8 and compatible-node acceptance lane | Wake only on a changed upstream pin, activation schedule, ingress policy or reproducible target endpoint |

Stop release-polish, generic validator hardening, lane expansion and new proof
wrappers that do not advance one of these completion boundaries.

## Delivery Principles

### Outcome Over Activity

- A red test is an implementation tool, not a deliverable by itself.
- A validator change is justified only when real new implementation is blocked
  by an incorrect validator.
- A dated evidence refresh is forbidden when the underlying implementation and
  observed chain state have not changed.
- Test-count growth, regex hardening, and claim-language variants do not count as
  bridge progress.
- Each package should normally deliver code, focused adversarial tests,
  integration wiring, and the smallest necessary documentation together.

### Trust Is End-to-End

- Mint must never occur while its source MCL deposit remains refundable.
- Elapsed Ergo time and monotonic SCS height do not prove a burn is canonical.
- A local database status cannot constrain an Ergo box spend.
- Trustlessness is the conjunction of every transaction input script, not a
  property conferred by one contract name.
- Ergo confirmation depth proves anchor age on Ergo, not sidechain finality.
- Committee authorization may remain as disclosed transitional liveness control,
  but it must not be able to fabricate roots, burns, payouts, or replay state in
  the target architecture.

### Reproducibility Is Part of the Protocol Deliverable

The Substrate node is now a reachable pinned Frontier submodule, and the Ergo
`0x04` producer is an exact upstream base plus a hashed tracked patch. Both were
built from the locked source identities. The active-root CI definition repeats
that reconstruction from public inputs. A controlled private hosted run may
proceed without publishing the branch; the first public hosted run remains
deferred until WP-08A permits the first public source release.

## Architecture Direction And Known Blockers

| Area | Current reality | Required direction |
|---|---|---|
| Substrate/Frontier | Pinned stable2412 plus a tracked patch derives the V1 root from successful canonical `PegOut` receipts and stores format/execution hash/root/count/leaf hashes in runtime state | Maintain the patch as an upstreamable source delta and capture the V2 proof package on a reviewed devnet deployment |
| Burn root | Rust and TypeScript reproduce the same odd-width root; the V2 native package verifies exact runtime inclusion and historical-target GRANDPA finality relative to a reviewed anchor. WP-06AE separately binds the application vector's execution block, three-burn root and count through one real application proof into payout conformance | Authenticate the application checkpoint under Ergo `0x0401`, close deterministic tracker/DUP/vault lineage, and obtain activated target-node settlement acceptance |
| Ergo `0x0401` anchor | Pinned Ergo v6.0.2 plus a hashed patch reproducibly injects operator-provided bytes; derivation remains unauthenticated | Integrate the WP-05 canonical producer and verify extension membership from authenticated headers |
| Peg-in block transaction commitment | WP-01C recomputes the canonical header ID and exact Scorex root from all canonical transaction IDs and post-V1 witness IDs, rejects target/non-target byte drift, and retains exact dual-source receipts through fresh revalidation and candidate identity before state progression | Authenticate header PoW, canonical consensus, source independence, and finality through the reviewed source profile; a valid header ID and locally consistent root are not independent consensus evidence |
| SPVTracker | The V2 tracker authenticates exact `0x0401` membership and stores a 264-byte entry binding the checkpoint, Ergo anchor, finality statement, semantic program, verifier profile, payload digest, and aggregate proof digest. R9 is proposition-distinct from DUP R6 but still authorizes the proof identity and sidechain-finality semantics | Replace or constrain R9 with an activated Ergo-verifiable consumer of the bound finality statement/proof semantics that rejects an anchored, R9-authorized invented checkpoint before any trustless claim; proof identity is not proof validity, and key inequality is not independent custody |
| Validity tracker candidate | WP-06AA adds a separate `SPVTrackerValidityV1` proposition with no R9 `SigmaProp` or committee predicate. WP-06AB consumes that exact V1 successor in a separately versioned payout/DUP conjunction. WP-06AC freezes a non-cross-compatible application-bound V2 key and 370-byte value plus schema-specific WASM AVL operations. WP-06AD adds the separate committee-free V2 ErgoTree, real proof transport and integrated pinned-JVM acceptance using one selected Ergo header for ID, height and extension root. WP-06AE now consumes that exact V2 successor in separately versioned vault/DUP predicates and a complete JVM-accepted payout transaction; V1-family replay rejects before payout. The profile remains synthetic and preactivation | Keep V1 as an unchanged compatibility harness. Close exact tracker/DUP/vault genesis and descendant lineage in WP-06AF, then produce an activated non-broadcast target-node stateful acceptance packet before enabling proof-system ID `2` or any funds route |
| V2 unlock | The authenticated builder, settlement vault, and replay singleton assemble one complete two-input transaction using the V2 tracker as a data input. The current linked trees pass a pinned-compiler deterministic sigma-rust matrix and current-tree replay against genuinely mined isolated-devnet headers: one valid full settlement and sixteen coherent rejects covering payout, authority separation, tracker identity, replay, proof, ordering, anchor depth, script binding, chain, block, and asset mutations. The exact signed positive transaction also passes pinned-JVM proof, serialization, and bytes-to-sign conformance. A read-only Frontier proof source reconstructs the runtime-compatible root and target inclusion path from all block receipts, including multiple `PegOut` logs in one EVM transaction. Event-keyed persistence and candidate journaling bind the derived `burnId`, transaction hash, global log index, tracker checkpoint and finality-proof identity, selected boxes, explicit output creation height, and canonical EIP-12 digest. After restart the daemon recollects native/Frontier proofs and rebuilds the exact candidate before retaining process-local check eligibility. The check-only command records exact unsigned-package, signed-transaction, JVM-response, revalidation, finality-proof, stable-Ergo-view, stable-sidechain-view, and check-admission digests. Sidechain stability binds both tip height and tip hash, so same-height replacement rejects. Only a process-provenance admission derived from the JVM result and both stable views can create `check_passed`; the later scalar authorization rebinds those journaled digests to the exact burn amount/recipient and current input boxes. The daemon receives a frozen preparation-only facade rather than the full settlement service. No object in this path exposes signing, submission, or broadcast. | Provision and observe the required setup/admission UTXOs on a non-mainnet node for stateful `/transactions/check`, recollect native/Frontier proof provenance, and remain guarded and non-broadcast; do not relabel the current in-memory result globally trustless |
| Aggregate DUP | The authenticated V2 replay singleton no longer requires a payout committee signature, is hash-bound to the exact settlement-vault script, and retains bridge-committee metadata in R6; the unlock rejects equality between DUP R6 and tracker R9 | Preserve atomic full-`AvlTree` equality and reconstructibility; do not interpret proposition inequality as organizational independence or sidechain finality |
| Finality | The offline V2 package verifies the target and runtime state from a reviewed GRANDPA anchor, including later authority rotations. WP-06R freezes the statement/envelope and WP-06S makes the tracker authenticate their exact identity. Ergo still does not verify the native payload or GRANDPA semantics | Implement the activated consumer of the bound finality semantics, either by verifying the relevant GRANDPA evidence directly or by verifying a separately activated validity/STARK proof whose public inputs bind the same checkpoint, statement, trust/profile identities, and required proof commitments; keep proof-system ID `2` rejected until that verifier exists |
| ContextExtension | The bounded four-Var tracker shape continues to pass its existing signed sigma-rust/JVM conformance. WP-06Y/Z close the exact two-variable proof consumer shape, WP-06AA closes the exact four-variable validity-tracker shape, and WP-06AB plus WP-06AE close exact proofless settlement shapes with three variables on DUP, four on the vault and one exact tracker data input. The pinned JVM agrees with the complete WP-06AE transaction and both input predicates. Required-key failures reject in VM; exclusion of unused extra keys is explicitly an exact serializer guard because ErgoScript cannot enumerate supplied keys. | Preserve the four-Var guard and exact serializers through later activated target-node stateful acceptance; do not generalize these exact profiles to larger maps, bypass serialization checks, claim on-chain extra-key rejection, or use node-wallet signing as a workaround |
| Evidence | Large validator surface and repeated synthetic/date-refresh packets dominate recent work | Freeze refreshes; generate new evidence only from changed implementation or attainable observed chain state |
| Scaling | AVL batch/lanes are useful demo and fallback machinery | Do not expand lanes beyond bounded evidence while a STARK aggregate path remains plausible |

Substrate/Frontier is not the final trust layer. The Ergo settlement path must
authenticate the commitment and finality used for payout. Raw EVM receipt
RLP/MPT/Keccak verification is not the preferred ErgoScript architecture.

Current synthetic Gate 5 instances and TypeScript contract-equivalent reports
remain development fixtures. They cannot close Gate 5 and should not be refreshed
as if they were live anchor or VM acceptance evidence.

The accepted reusable architecture direction is specified in
[`docs/layered-reference-architecture.md`](../docs/layered-reference-architecture.md).
It defines three logical layers plus one composition root:

- `ergo-settlement-core` owns source-neutral Ergo/eUTXO settlement identities
  and profile ports, Ergo-side conservation and payout rules, deterministic
  transaction plans, source-neutral codecs, contract primitives, ErgoTree
  identities, vectors, and VM matrices;
- `relayer-core` owns source-independent lifecycle orchestration for Ergo
  settlement, including candidates, retry, restart, reorg handling, circuit
  breakers, and abstract capability ports;
- `adapters` own Frontier/Substrate observations, GRANDPA proof collection and
  execution, Ergo RPC, JVM checking, signing, submission, broadcast transport,
  SQLite, configuration, and source-specific decoding;
- `profiles/substrate-grandpa-v1` is a statically selected vertical binding,
  not a fourth authority layer: it owns the exact V1 peg-in target/mint and
  committed-vault bindings, leaf/root, checkpoint, finality
  statement/proof/commitment, source-finality/reorg, ERG lane, candidate,
  tracker, and profile-specific ErgoTree meanings;
- a composition root such as `apps/bridge-daemon` statically assembles the
  selected profiles, cores, and adapters.

`relayer-core` and concrete profiles may depend on `ergo-settlement-core`;
adapters may depend on the public ports/types of either core and, when required,
the selected profile's public types/codecs; the composition root may depend on
all of them. A core must not import an adapter,
`ergo-settlement-core` must not import `relayer-core` or a concrete profile, a
profile must not import `relayer-core` or an adapter, dependencies must remain
acyclic, and no adapter may bypass a security port.

All source and settlement behavior is selected through explicit versioned
profiles. The current `BridgeFinalityStatementV1`,
`AggregateFinalityProofV1`, `AggregateFinalityCommitmentV1`, and authenticated
tracker are a Substrate/GRANDPA compatibility profile, not generic proof
formats. Their bytes, domains, IDs, digests, vectors, candidate identities,
ErgoTrees, and semantics remain frozen. A `proofSystemId` selects a proof
format; it never changes statement semantics. Any future validity/STARK path
requires a new reviewed statement family or version and keeps reserved proof
system ID `2` fail-closed until activation.

### Dual Delivery Tracks

The bridge must remain implementable both before and after EIP-0045. The two
tracks share source event identities, application bindings, deterministic
transaction plans, conservation, replay, cutover, recovery, and operational
ports. They differ at the deciding finality authority and therefore use
separately versioned statement and tracker profiles.

| Track | Deciding authority | Deliverable claim | Current state |
|---|---|---|---|
| **WP-06-FED - federated reference** | One statically registered profile binds two explicit cryptographic roles: the source-attestation Ed25519 key set and the Ergo-admission SigmaProp key set, each with its own digest and threshold under one federation epoch. Their respective authority over mint and payout is disclosed; neither role is implied to be the other. | Functional institutional reference profile under a federated trust model; never trustless. | **Migration execution remains at the FED-6 external boundary; FED-6-LAB now closes one fresh real-component peg-in campaign through the atomic reserved mint in a source-locked TestClient.** FED-1 through migration-only FED-5B plus the distinct greenfield baseline/generation/provisioning and fresh-process replay joins remain non-authorizing checkpoints. The self-operated campaign at `da2f99d9` signed, checked, submitted and confirmed setup, source lock and committed reserve on owned loopback Ergo nodes, then derived the V2 packet proof from that confirmed state and consumed the exact direct-parent reservation/mint in Frontier. This establishes local compatibility and composition, not operational mint authority. Peg-out, recovery, static registration, independent custody and the externally approved migration campaign remain open. |
| **WP-06-STARK - Ergo-verifiable upgrade** | An activated Ergo-verifiable finality consumer, preferably the EIP-0045/STARK profile, validates separately versioned public inputs before tracker admission. | Trustless only after the complete Gate 5 proof-to-release chain and target acceptance close. | **Externally blocked and frozen at `d7420756`.** Proof-system ID `2` stays rejected. |

WP-06-FED must not impersonate WP-06-STARK by reusing a STARK or GRANDPA statement
under different authority semantics. It may reuse the versioned burn leaf and
`bridge_event_root` algorithm only when their field meanings are unchanged and
the new profile binds them without ambiguity. WP-06-STARK should later replace the
federated admission authority, not redesign collateral, payout, replay, or
daemon lifecycle.

### Migration And Greenfield Launch Modes

WP-06-FED supports two separately versioned launch modes. They converge only
after the candidate has established the exact tracker, DUP, reserve, runtime,
application and federation identities consumed by FED-6:

| Launch mode | Required historical proof | Replay genesis | Legacy-route rule |
|---|---|---|---|
| **Migration** | Authenticated inventory and retirement evidence for every historical source, Ergo and relayer authority from the selected deployment generation | Import every canonical paid-burn identity from all predecessor DUP lineages | The existing FED-5B cutover generation remains the migration profile; all 53 declared routes must be retired, frozen after replay import, drained, disabled or otherwise closed by their exact required disposition |
| **Greenfield** | A source-attestation quorum authenticates the exact source genesis-to-activation history, Ergo settlement genesis-to-setup history and shipped relayer artifact closure, including its statement that no predecessor bridge authority or liability-bearing lineage was ever instantiated | Deterministically derive the empty replay root from that quorum-authenticated non-instantiation statement, never from a caller assertion or current empty UTXO view | Every one of the same 53 route requirements must be accounted for as not instantiated in the signed launch generation; a greenfield profile cannot relabel a migration target or ignore an unknown historical interval |

Greenfield is a different evidence family, not a shortcut around migration.
Two agreeing RPC URLs, a fresh local database, an empty current UTXO set, source
code without a local submitter, or a newly started devnet do not prove a target
has no prior authority. The source-chain proof must bind the exact genesis,
runtime/deployment history and application identities through activation. The
Ergo proof must bind the exact genesis and complete indexed history for every
contract tree, singleton, funding and spend surface through setup. The relayer
proof must bind the exact shipped artifact and runtime entrypoint closure. All
three closures must share one activation-generation identity. The configured
source-attestation quorum authenticates their completeness and the exact
non-instantiation statement; the bridge then derives the empty global replay
root deterministically before a generation candidate can be built.

**FED-5G1 - authenticated launch baseline** is complete locally. It produces
one process-owned target descriptor, source history, Ergo history, relayer
closure, threshold-authenticated launch statement, empty replay root, distinct
greenfield generation and exact unsigned three-issuance provisioning plan. The
source-attestation quorum is the disclosed authority for the completeness and
non-instantiation claims; the implementation does not claim independent source
or Ergo consensus authentication. Migration FED-5A/B schemas, domains and
semantics remain unchanged, and no greenfield target is approved by local
fixtures.

**FED-5G2 - portable authenticated replay** is complete locally. The
`federated:greenfield:replay` command consumes one canonical 15-file layout,
separate expected target/key-set digest pins and one external
statement/signature packet, reruns
the pinned JVM compiler chain, rebuilds the complete FED-5G1 object graph,
reparses the exact historical genesis boxes and reproduces all three unsigned
provisioning transaction/output identities in a fresh process. Deserialized
process provenance, a fresh database, current UTXO absence, a caller flag or a
report digest alone cannot cross this boundary. The packet cannot choose its
own trust root, but caller pins also do not establish target approval. The
command reads its explicit bundle and pinned compiler runtime metadata through
stable non-symlink file identities, but no operator configuration or network.
It adds no signer, submitter, broadcaster, profile registration, target
acceptance or funds authority.

**FED-6G legacy compatibility target preflight** is complete locally. A pure
generator takes an explicit Frontier development chain spec, preserves its
numeric JSON lexemes exactly, verifies the tracked Solidity build and storage
layouts, and embeds the historical bridge/token code plus initial application
bindings at genesis. The generated spec was accepted by the exact Frontier
binary and observed through two connected RPC origins. The historical bridge
code still exposes owner-authorized `mintSERG`; current application identity
does not establish runtime quarantine of that authority. The report therefore
declares the owner-mint authority present and the target ineligible for FED-6G
launch evidence. This artifact remains useful only for isolated compatibility
and observer testing. A new authority-safe source genesis must bind immutable
mint quarantine/enforcement and remove every retained Root/Sudo bypass before
history collection starts. The existing V1 family remains fixed to
`ergo-testnet` and `public-testnet`; its bytes and semantics stay unchanged.

## Work Package Queue

| Package | Outcome | Dependency | Parallelism | Status |
|---|---|---|---|---|
| **WP-01** | Safe peg-in committed-vault transition | Current PoC | Canonical header/transaction authentication, Autolykos/EIP-37 branch replay, exact `E2SARW01` and `E2STXW01` witnesses, the JVM/Rust UTXO differential, source-locked `E2UTXW01` proof replay, byte-identical V3 semantic composition, stable exact-current-tip proof capture, canonical retained-packet replay and later supplied-branch depth composition are complete locally. Production consumers remain disabled; external checkpoint authentication, bounded source-set/branch admission, transaction execution, deployment lineage, target acceptance and mint authority remain open | **Retained UTXO/branch composition complete; externally authenticated Ergo-consensus authority open** |
| **WP-02** | Legacy reorg-payout containment (no active v1 creation or spend) | WP-01 conventions | Source and manifest-bound observation tooling complete; reviewed manifest, authenticated approval/provenance, and real network observations remain | **Source/tooling complete; cutover decision open** |
| **WP-03** | Reproducible consensus-source baseline | Repository dependency decision | Independent source/dependency ownership | **Complete locally; controlled private CI may run, first public hosted run waits for the WP-08A publication gate** |
| **WP-04** | Full-transaction ErgoScript VM closure | WP-01/02 contracts stable | Can run beside WP-05 format/vector freeze | **Complete locally** |
| **WP-05** | Versioned runtime commitment and finality producer | WP-03 | Freeze one canonical format/vector first; then use disjoint runtime, Ergo, and verifier owners | **Implementation complete relative to reviewed trust root; live capture and Ergo-verifiable finality bridge open** |
| **WP-06-FED** | EIP-independent federated peg-in and peg-out profile | WP-01/04/05 foundations plus reviewed V4/V6 conservation and WP-07 lifecycle | Federated statement/tracker, peg-in admission, settlement family, daemon integration, and cutover are sequential authority joins; disjoint target/retirement evidence work may run in parallel only when real inputs exist | **Migration targets remain at the FED-6 external boundary. FED-6-LAB has composed its three peg-in joins in one fresh real-component campaign: exact committed-reserve confirmation, source-owned evidence/packet production, and source-locked direct-parent Frontier TestClient reservation/mint consumption. FED-1 through FED-4, FED-5A/B migration generation, and the distinct greenfield baseline/generation/provisioning/portable-replay joins remain frozen. Peg-out, recovery, static registration, independent custody and externally approved target evidence remain open.** |
| **WP-06-STARK** | Ergo-verifiable finality and STARK upgrade | WP-06-FED shared invariants plus an activated compatible verifier target | Dormant external-blocker lane; no repeated local wrappers or evidence refresh | **Local V4/V5/V6 proof chain frozen; EIP-0045 activation and target acceptance remain external blockers.** |
| **WP-07** | Reconstructible lifecycle and adversarial recovery | WP-06-FED local candidate boundaries for integration; activated profile authority for completion | Chain-derived recovery integrates with WP-06-FED while WP-06-STARK remains dormant; independent attack review follows the complete federated matrix | **Local reorg lifecycle and process/filesystem funds-release containment are complete through commits `992be302` and `92915d27`; no supported recovery command or on-chain/global pause is claimed, and the new federated authority has not yet been connected.** |
| **WP-08A** | Reusable layer extraction | Recorded WP-07 behavior baseline and frozen Gate 5 interfaces | Disjoint core, profile, adapter, dependency-rule, and conformance owners after inventory freeze | **Complete locally at C2; static profile dispatch, fixture-domain isolation, cross-boundary behavior replay, active operational capability separation, exact clean-checkout validation, and independent review are complete; this closes only the WP-08A prerequisite, while every other WP-08 dependency and all publication or funds authority remain separate** |
| **WP-08** | Institutional operations and public-audit alpha | WP-01 through WP-07 plus WP-08A | Packaging/docs/CI may parallelize after interfaces freeze | **In progress; WP-08B through WP-08L are complete as bounded non-authorizing local slices and policy permits source publication for public research only after the exact candidate passes promotion checks. Real external delivery/acknowledgement, external evidence and review remain prerequisites for supported release claims.** |
| **WP-09** | External assurance and reference-release hardening | WP-08 | Independent review and noncritical release gates | Deferred |

## WP-01 — Safe Peg-In Committed-Vault Transition

**Security invariant:** sERG cannot be minted while the source Ergo deposit can
still take the depositor refund path.

**Current source status:** MCL v3, the commitment builder, transition
coordinator, daemon boundary, and state tracker enforce the progression below.
A strict route manifest and bounded two-origin observer now bind the exact MCL
source/profile, classify complete active MCL and settlement-vault history, and
accept only exact confirmed MCL-to-vault transitions. WP-01C recomputes the
canonical header ID from the pinned consensus serialization and the complete
Scorex transaction root from every canonical signed transaction in the claimed
block, including post-V1 witness IDs. It binds the exact header,
transaction-section identity and version before any confirmation or mint state
can advance, and carries the exact dual-source receipts through immediate
pre-mint revalidation. Tracked helpers can no longer mint directly from a
refundable MCL or create malformed MCL funding boxes. These checks authenticate
header and transaction bytes, not PoW validity or canonical consensus;
independent source control, manifest review, authenticated activation, and real
network observations remain open. WP-01D additionally reparses the exact
historical refundable source box, requires its recomputed ID exactly once in
the authenticated signed transaction, validates output zero against the exact
configured V1 vault, and requires fresh ordered reads to retain source absence
plus stable exact-vault presence. That join is non-authorizing point-in-time
evidence from one configured source. Signed-input membership does not validate
transaction execution or the source state transition, and the join does not
establish historical ordering, checkpoint trust, route activation, mint
authority, or canonical consensus.

**Deliverable:** replace observe-then-mint with a durable state machine:

`refundable deposit -> submitted consume -> confirmed committed vault -> mint -> reconciled`

The committed output must be a dedicated non-refundable settlement-vault state,
not an untracked transfer to a hot wallet. It must preserve enough identity to
bind the original deposit box, amount, recipient, and mint deduplication key.
The containing consume transaction ID is observed after confirmation and stored
as transition provenance; the output must not attempt to commit its own
transaction ID.

Expected persisted progression:

`detected -> consume_submitted -> consume_confirmed -> minting -> minted`

The first implementation shape uses a separate fee input so the committed vault
receives the full MCL `SELF.value`. Its registers bind the original `SELF.id`,
target H160, and actual mint amount. Direct mint from a refundable deposit,
mempool-only consume, partial-value vault output, or wrong destination must fail.

The canonical destination is the same versioned liquidity-contract family used
as input 2 and change by the V2 proof-bound settlement path:
`MainChainAggregateUnlockTrustless.es` or its reviewed successor. WP-01 must not
create a separate permanent vault silo. If a temporary migration script is
needed, it may move value only into that canonical ErgoTree while preserving full
value and deposit provenance; it may not expose an unrestricted hot-wallet path.

MCL v3 uses `OUTPUTS(0)` for the canonical V2 vault and preserves full source
value with a separate fee input. Vault `R4` is source box ID, `R5` H160, `R6`
amount, and `R7` depositor tree. Before mint, the coordinator verifies the
canonical commit transaction and block, canonical header ID, complete
signed-transaction root, exact vault output, absent source, and unspent vault.
The verifier is injected through an explicit port at the daemon composition
root; the lifecycle does not import its concrete RPC/SDK adapter. Malformed or
inconsistent block responses hold as retryable uncertainty and cannot
terminally invalidate a non-refundable vault. Legacy refundable boxes remain
classification-only; a minted legacy refundable source is an incident. A deep
post-mint commit reorg opens the circuit. The proof-independent commit txId is
persisted before submission, an uncertain mint plus commit loss is always an
incident, and a SQLite cursor pages reconciliation across every minted row
without restart starvation.

WP-01 freezes `PEG_IN_COMMIT_CONFIRMATIONS` with an initial default and minimum
of 10 Ergo blocks. Counting includes the consume transaction's inclusion block:
`currentHeight - inclusionHeight + 1 >= requiredConfirmations`. Before mint, the
relayer must re-read the canonical transaction/block, verify the exact vault
output and its box ID are still canonical and unspent, recompute and match the
canonical header ID and complete signed-transaction root, and verify the
original MCL box is absent from the canonical UTXO set. The V4 dual-source
candidate additionally carries and compares the exact receipts across its
fresh pre-mint rerun. A reorg or uncertainty before mint returns the transition
to a non-mintable state. A detected deep reorg after mint triggers a circuit
breaker and solvency incident; it is never silently treated as reconciled.

**Implementation scope:**

- specify the committed-vault box contract/register and token invariants;
- add the consume transaction builder using local signing and no node-wallet
  workaround;
- persist submitted and confirmed transition states without treating SQLite as
  authority;
- mint only after confirmed-chain observation of the exact committed output;
- retry mint idempotently from confirmed committed state;
- handle consume failure and pre-finality Ergo reorg without mint;
- reconcile minted records against both the EVM mint and committed Ergo output;
- stop new deposits from being routed to the unsafe contract version and provide
  a non-broadcast migration/classification path for pre-existing MCL boxes;
- bind the exact active and historical route set to a reviewed manifest and
  classify complete MCL/vault history through bounded read-only node ports;
- invalidate governance/evidence assumptions that require the unsafe MCL timeout
  to remain unchanged.

**Initial implementation map:**

| Responsibility | Primary files |
|---|---|
| Vault and MCL transition invariants | `contracts/MainChainLock.es`, `contracts/MainChainAggregateUnlockTrustless.es`, `relayer/src/contract-invariants.test.ts` |
| Consume transaction assembly | New peg-in commitment builder and focused test; reuse `tx-balance.ts` and the existing local signer boundary |
| Durable transition state | `relayer/src/state-tracker.ts`, `relayer/src/state-tracker.test.ts` |
| Chain observation | `relayer/src/ergo-client.ts` and focused read-only client tests |
| Sequencing, retry, restart, reconciliation | `relayer/src/relayer-daemon.ts` plus a new peg-in coordinator test surface where practical |

`relayer-daemon.ts` and `state-tracker.ts` remain main-agent integration files.
A worker may own a new builder/test pair after the interface is fixed, and a
high-reasoning reviewer may audit the contract/state-machine invariant in
parallel. Do not give concurrent agents write access to the shared files.

**Definition of Done:**

- contract and builder enforce value, identity, vault destination, fee, and
  successor invariants;
- daemon cannot call `mintSERG()` from `detected` or `consume_submitted` state;
- confirmation counting, minimum depth, canonical transaction/block lookup,
  canonical header serialization and ID, exact header/transaction-section
  identity and version, full signed-transaction root, target uniqueness, exact
  per-source receipt retention, vault-output identity, vault unspent status,
  and original-MCL absence are tested as one mint precondition;
- positive test completes consume-confirm-mint-reconcile;
- negative tests cover refund-after-mint, wrong vault output, wrong amount,
  consume reorg, duplicate mint, transient mint failure, and restart recovery;
- legacy MCL boxes are explicitly classified as unminted/refundable,
  minted/requires-migration, or already consumed; no existing UTXO is assumed to
  inherit the new script automatically;
- the exact manifest-bound observer rejects incomplete history, unresolved
  spends, route/source mismatch, source disagreement, and any current legacy MCL
  UTXO without granting mint, activation, cutover, signing, or broadcast
  authority;
- contract compilation and local VM evaluation pass;
- no broadcast path is enabled and no live state is required;
- full relayer check and WASM tests pass at package completion.

### WP-01D - Source-Locked Ergo Autolykos V2 SPV Reference

**Security invariant:** a claimed Ergo header cannot advance source consensus
because its own `nBits` makes its PoW easy. The expected difficulty must be
derived from exact authenticated relay history, and one submitted branch must
not be confused with globally canonical Ergo consensus.

**Implemented local boundary:** the pure `ergo-settlement-core` reference now:

- exposes the pinned v6.0.2 canonical header bytes without PoW;
- validates compressed secp256k1 points and exact Autolykos V2 PoW;
- reproduces the JVM compact-difficulty, table-size, message, hit, and target
  vectors;
- ports EIP-37 context selection, predictive and Bitcoin calculations,
  half/three-halves caps, interpolation, and compact normalization;
- binds source network, checkpoint header, checkpoint cumulative work, exact
  difficulty-context digest, header version, difficulty policy, branch bound,
  future-time bound, and required confirmation depth into one versioned profile
  ID;
- verifies a bounded contiguous branch, accumulates required work, retains the
  current branch on equal work, and switches only to strictly greater work;
- reports target inclusion and policy depth without calling that result
  deterministic finality.

An isolated negative changes only the header difficulty to an easy value. Its
claimed PoW succeeds, while admission rejects because the claimed value does
not match the EIP-37-derived expectation. Separate negatives cover invalid PoW,
point encoding, parent, height, time, context, checkpoint, network, profile,
branch tie, absent target, and shallow target depth.

**Non-authority boundary:** this reference has no network adapter, persistence,
daemon, mint, signer, submitter, broadcast, or funds consumer. Its checkpoint
and context are profile inputs, not self-authenticating facts. A verified
submitted branch is not proof that every competing branch was observed.
Policy depth is not deterministic finality. No Gate 5, trustless, readiness,
or deployment claim follows.

**Implemented composition boundary:** one versioned, process-owned candidate
now joins the exact target header in the greatest-work branch among the
explicitly supplied local set to a process-owned static WP-01C verification of
the complete signed-transaction commitment. The builder snapshots exact data
properties before validation and rejects accessors, sparse arrays, forged
branches, forged verifier results, target/header drift and insufficient policy
depth. It deliberately excludes serialized receipt source and vault IDs: those
are lifecycle claims that require fresh semantic verification of the exact
source input and exact non-refundable successor output. Static adapter
provenance is not freshness, canonical-chain membership or consensus.

**Implemented JVM differential boundary:** the versioned fixture at
`relayer/test-vectors/ergo-autolykos-v2-spv-jvm-differential-v1.json` pins one
real historical post-EIP-37 context ending at height `926976` and the contiguous
suffix `926977..926986`. The TypeScript reference and the pinned v6.0.2 JVM
primitives independently derive boundary difficulty `3947173729271808`, exact
canonical pre-PoW bytes, Autolykos V2 hit/target and relative cumulative work.
Both reject an isolated easier-difficulty mutant and an isolated ancestry
mutant. The fixture SHA-256 is
`546a099f4344a206f4f194e8c1652ca7a943da5be3a29311518aea932e157bd4`.
The source- and toolchain-pinned runner copies the exact spec into a fresh clone
at Ergo node commit `2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1`, gives sbt fresh global,
boot, Ivy, Coursier and user-home state, and executes only that three-test JVM
suite through the hash-bound Microsoft OpenJDK and sbt launcher. This is
historical differential evidence: it does not
authenticate the checkpoint, prove current canonicality, establish complete
branch knowledge, or grant mint, settlement, Gate 5 or readiness authority.

**Implemented source/vault semantic boundary:** one further versioned,
process-owned candidate reparses the exact signed commitment transaction and a
complete historical refundable source box. It recomputes the source box ID from
canonical EIP-12 contents, requires that ID exactly once as a spending input and
never as a data input, then validates output zero against the configured V1
committed-vault profile. Native-ERG amount, H160 recipient, depositor tree,
source-lock tree, vault tree and asset profile are derived and cross-checked
from those exact bytes. A static current-state adapter performs ordered
source/vault/source/vault reads and rejects source restoration, missing or
replaced vaults, non-exact register sets, and any byte drift before returning a
branded observation.
Forged adapters or candidates, accessors, ambiguous inputs, altered signed or
source bytes, and asset/amount/recipient/route drift reject.

This join does not accept a SQLite row, persisted receipt field or caller
boolean as authority. It remains a point-in-time view from one configured
source. The route profile is binding input rather than independently reviewed
or activated deployment evidence; the V1 deposit registers do not encode a
sidechain ID; and current source absence plus vault presence does not establish
that the transition preceded a mint. Signed-input membership also does not
validate transaction execution or the source state transition. Checkpoint
authentication, complete competing-branch knowledge, global canonicality,
deterministic finality, daemon admission, mint, Gate 5 and funds authority all
remain false.

**Implemented static Frontier boundary:** a separate
`ErgoAutolykosCommittedVaultSourceProofV1` family ports every reviewed WP-01D
public input into one fixed 1,065-byte statement. TypeScript and Rust reproduce
the same exact IDs, statement bytes, SHA-256 and statement ID. Its normal and
V4-test runtime registrations use only a production consumer that validates the
fixed shape and then rejects; an accepting non-authorizing receipt exists only
under `cfg(test)`. Compile-time activation is false, and no dispatchable,
storage transition, reservation, EVM execution, daemon, mint or funds route can
consume it. The current statement commits to witness identities and dimensions;
it does not yet carry or verify the variable-size branch, transaction,
source-box or vault witness bytes.

**Implemented reconstructible recovery boundary:** one bounded TypeScript
witness packet carries the exact profile/checkpoint and raw branch suffixes,
claimed block and signed transaction, refundable source box, route, and four
ordered source/vault reads. An append-only SQLite lineage stores only canonical
packet JSON and its generation/digest chain. Every restart validates every
historical packet and semantic transition before rerunning branch work,
transaction commitment and source/vault semantics and rebuilding the fixed
Frontier statement. Profile, checkpoint, route, commitment transaction and
refundable source remain immutable across generations. Selected work cannot
regress and an equal-work tip replacement rejects; only a strictly heavier
supplied branch can replace the selected tip. Special JSON keys are preserved
injectively, packet and generation limits are checked before parsing or
insertion, and restored source, replaced vault, skipped generation, read-order
drift and historical or latest stored-byte corruption reject. Complete database
loss returns `missing` and
cannot recreate a verification result or authority. A copied older database can
replay an older valid generation and cannot prove that a later generation once
existed; an external monotonic anchor is therefore mandatory before any future
authority use. No daemon or funds route imports this boundary.

**Implemented binary relay-witness boundary:** a distinct `E2SARW01` envelope
now freezes the runtime-facing bytes for the relay portion of WP-01D. The
header contains format, zero flags, exact total length, a domain-separated
format-family ID and an ordered four-section directory. The sections encode
the exact SPV profile ID and profile, checkpoint and exact EIP-37 context,
current plus supplied competing branches, and target header. The decoder
requires that SPV profile ID to equal a statically supplied expected profile;
the family ID alone cannot select policy. Header payloads use the canonical
Ergo wire bytes;
the decoder rejects unsupported versions, non-empty early unparsed bytes,
non-canonical VLQ, truncation, trailing bytes and re-encoding drift before
rerunning the full TypeScript relay verifier with checked `UInt256` cumulative
work. It also rejects duplicate or non-deterministically ordered competing
tips, a supplied greater-work branch, and a target absent or below policy depth
in the current branch. The historical differential fixture freezes a
3,135-byte positive and isolated negative mutations for the envelope,
directory, profile, branch role/count/order and PoW. The envelope is neither
the durable JSON packet nor the fixed 1,065-byte public statement.

This first binary boundary does not carry the target block transaction,
refundable source box, committed-vault candidate or ordered state reads. The
source-locked normal and V4 Frontier runtimes now parse and verify the exact
`E2SARW01` bytes and join them to the V1 statement before the production
consumer rejects. That completed relay boundary still provides no daemon,
mint, funds or Gate 5 authority.

**Implemented transaction-witness boundary:** preserve `E2SARW01` and V1
byte-for-byte. The distinct TypeScript and source-locked Rust `E2STXW01`
codecs reconstruct the exact bounded two-input, zero-data, token-free,
two-output Scorex transaction and bytes-to-sign, verify both transaction-root
leaves, parse the complete refundable source and exact output-zero vault, and
reproduce one 826-byte golden envelope plus isolated malformed framing, VLQ,
proof, inclusion, source and vault negatives. This proves an exact signed-input
reference and output-zero candidate, not transaction execution or current UTXO
membership.

**Implemented runtime-derived statement boundary:** the distinct TypeScript and
source-locked Rust V2 builders reparse exact `E2SARW01` and `E2STXW01` bytes,
require their target transactions root and block version to agree, and
reproduce a fixed 978-byte statement. It binds separate format, profile,
branch-policy and verifier IDs; the supplied branch section, checkpoint,
selected work and policy depth; target header and transaction identities; and
exact source, vault, amount, recipient and depositor fields. A separately named
static relay entry point admits only the V2 SPV profile while the V1 entry point
continues to reject it. Both Frontier runtime variants register only an
unconditionally rejecting production consumer under compile-time activation
false; an accepting receipt exists only in tests and keeps all authority flags
false. V1 process-owned JSON/RPC digests, static-profile substitution,
cross-envelope root/version drift, deciding-field rebinding, nonzero authority
bits and cross-version decoding reject.

**Implemented UTXO state-proof differential boundary:** the pinned v6.0.2 JVM
prover and `ergo_avltree_rust` 0.1.1 verifier now share one deterministic
33-byte root and 280-byte proof for ordered exact-vault membership followed by
refundable-source non-membership. The Rust verifier binds the complete
175-byte vault value to its box ID, limits proof/value sizes and operation
count, preserves the requested source key and complete supplied root, and
rejects root-label/proof mismatch, role, value, proof-kind and proof-byte
faults. The trailing AVL-height byte is not recomputed from the partial proof,
and one proof can cover another absent key. The implemented V3 statement
therefore binds all 33 root bytes and both keys to the exact target header and
transaction witness. A stale but internally consistent root/proof pair remains
outside the lookup primitive and rejects when it is joined to a different
target header; checkpoint trust and complete branch authority remain separate.
This local differential authenticates neither the supplied root nor its
checkpoint and grants no mint or funds authority.

**Implemented source-locked UTXO statement boundary:** V1, `E2SARW01`,
`E2STXW01`, and V2 remain byte-for-byte unchanged. The distinct 652-byte
`E2UTXW01` envelope carries the static verifier profile, complete 33-byte state
root, exact vault/source keys, complete 175-byte vault value and 280-byte proof.
TypeScript validates the envelope framing and lookup semantics independently.
Source-locked `no_std` Rust validates the same framing before replay through
`ergo_avltree_rust`. Both require exact vault membership followed by refundable-
source non-membership and reject unused proof directions, malformed node stacks,
invalid balance tags, root/value/key drift, truncation and trailing bytes
without relying on panic catching.

The separate 588-byte V3 statement reparses all three witnesses, recomposes the
V2 statement ID, requires the UTXO root to equal the exact `E2SARW01` target
header state root, and requires both lookup keys plus complete vault bytes to
equal the `E2STXW01` transition. TypeScript, the normal runtime and the V4 test
runtime reproduce one golden statement and domain-separated ID. Both production
registrations validate and then reject under a dedicated compile-time false
activation flag. Test-only consumption records only supplied-root lookup
verification; globally canonical consensus, current UTXO authority, runtime
mutation, mint and funds authority remain false.

**Implemented stable current-tip capture boundary:** one dedicated static
adapter keeps its Axios instance closure-private and exposes only a fixed best-
header GET plus an exact `[vault box ID, refundable source box ID]` POST to
`/utxo/getBoxesBinaryProof`. The adapter snapshots the request inputs, derives
the ordered keys from `E2STXW01`, obtains exact canonical best-header bytes
before and after the proof, and rejects any port not created by that static
factory. Relayer-core independently rederives the keys and complete expected
vault value, requires both supplied tips to equal the exact V3 target header,
and constructs and verifies `E2UTXW01` against that header's state root. Tip
drift, header-ID drift, transaction-root/version drift, malformed or oversized
proof responses, role changes and forged port/capture provenance reject. The
transport has no caller-selected method or path and exposes no client,
node-wallet, signer, submitter, broadcast or persistence capability.

This closes tuple consistency for one supplied current tip, not an atomic node
snapshot or a consensus decision. Core-composition provenance and static node-
adapter provenance are distinct process-local brands; neither authenticates the
node or upgrades an authority flag. The capture must be retained while policy
depth accrues, then recomposed with independently authenticated checkpoint and
admitted branch-view evidence. Its explicit authority flags remain false,
including current UTXO membership, globally canonical consensus, mint and funds
authority.

**Implemented retained-capture and supplied-branch boundary:** the canonical
retained packet stores and domain-separates the exact target header,
transaction parser profile, `E2STXW01`, `E2UTXW01`, source-capture digest and
explicitly false authority map. Its strict normalizer recomputes every derived
identity and replays both witnesses. A JSON round trip can therefore reproduce
the exact cryptographic capture after restart, but it does not persist or forge
the static adapter's process-local node provenance and no journal row is an
authority.

A separate composition reparses a later `E2SARW01`, verifies its profile,
checkpoint, PoW, EIP-37 transitions, every supplied branch and deterministic
greatest-work selection among those branches, requires the retained target at
policy depth, and rebuilds the exact V3 statement from retained bytes. The
composition explicitly records that its checkpoint is profile-supplied and
not externally authenticated, and that greatest-work selection over supplied
branches is not complete knowledge of the Ergo network. It has no daemon,
persistence, runtime, mint, signer, submitter, broadcaster or funds consumer.

**Implemented inert checkpoint/source-set candidate:** one source-reviewed
static policy now binds the exact source network, checkpoint header, difficulty
context, SPV profile, cumulative work, source metadata and observation-age
policy. It admits only an exact bounded set of caller-supplied observations,
requires their `E2SARW01` bytes to converge, then replays the retained-packet
composition. Missing, duplicate, declared same-origin/same-administration,
stale/future, divergent, wrong-network and wrong-checkpoint inputs reject. The
only registered profile uses `.invalid` origins and disables runtime and funds
authority. Caller-supplied source labels do not establish collection
provenance, and source-reviewed static policy does not externally authenticate
the checkpoint.

**Next authority boundary:** WP-01D-B needs an independently authenticated
checkpoint/profile plus statically registered observation-collection
provenance. Freeze this lane until that authority exists; do not add another
local digest, process brand or RPC-agreement wrapper as a substitute. A finite
RPC set cannot prove global branch completeness or deterministic finality.
Mint remains disabled until
checkpoint trust, complete branch policy, authenticated current-state proof,
runtime proof acceptance, deployment lineage, global replay cutover,
authenticated activation, permanent legacy-route retirement and target
acceptance close together.

## WP-02 — Legacy Reorg-Payout Containment

**Bounded security invariant:** active software cannot create or spend a legacy
MCU, and the replacement source cannot release ERG permissionlessly through
stale SCS height or an Ergo timeout. This does not prove sidechain finality: a
committee-authorized transitional payout remains trusted until Gate 5.

**Current source status:** the active daemon and compatibility builder cannot
create or spend a legacy MCU. The replacement source requires committee
`atLeast()` authorization and has no timeout branch. Immutable v1 boxes retain
their old script. A dedicated manifest-bound assessment now enforces exact
network/checkpoint/address/raw-ErgoTree identity, synchronized address indexes,
two distinct stable observations, complete pagination, exact source agreement,
and zero-UTXO conditions. The checkpoint must remain inside its reviewed
minimum-depth and maximum-age window. The reviewed manifest and real
observations remain open. Origin agreement does not prove independent operation
or consensus, and the report cannot authorize cutover. Its R4 burn hash
is metadata rather than an on-chain proof, and no active v2 builder exists;
exact receipt-to-MCU integration remains blocked before activation. Gate 6
authority cannot make a stale or unproven burn canonical.

**Deliverable:** remove every active permissionless legacy MCU creation and
spend path. The transitional source may require committee authorization after
fresh exact burn revalidation, but this is containment rather than trustless
acceptance. Timeout recovery must not pay the beneficiary or an unrestricted hot
wallet. Gate 5 owns the later proof that a canonical finalized burn authorizes
the payout.

**Definition of Done:**

- no new-source beneficiary payout is authorized solely by SCS height or Ergo
  age; a committee quorum is an explicit transitional trust assumption;
- `burn_reverted`, missing receipt, and RPC uncertainty cannot trigger an
  automated legacy spend; stale-anchor, deep-reorg, and finality guarantees
  remain Gate 5 acceptance criteria;
- aggregate submission and confirmation require an injected exact burn verifier,
  E2E submission cannot bypass it, and a null outcome cannot erase terminal
  `burn_reverted` state or fall back from batch to single settlement;
- the transitional v2 source remains inactive until a reviewed builder binds
  its exact R4/recipient/amount/height fields to a freshly verified receipt;
- legacy contract/builder/daemon tests prove the attack trace is rejected;
- creation of new legacy MCU boxes is disabled after the replacement activates,
  and existing immutable MCU boxes have an explicit non-broadcast inventory and
  migration/quarantine procedure;
- current governance and release-evidence assumptions are updated only because
  the underlying authorization surface changed;
- contract compilation, focused VM evaluation, full relayer check, and WASM
  tests pass.

**Observation prerequisite:** first produce and independently review the public manifest
defined in [Legacy MCU Cutover Manifest V1](../docs/legacy-mcu-cutover-manifest.md),
bound to the expected network and complete historical V1 address/ErgoTree set.
Pin its expected content digest, then run
`npm run cutover:legacy-mcu-assess -- --manifest <manifest.json>
--expected-manifest-sha256 <digest> --primary-node-url <origin>
--witness-node-url <distinct-origin> --json-out <report>`.
The prior `inventory:legacy-mcu -- --address ...` command remains diagnostic
only. The observation command is read-only, uses complete bounded pagination, and
never loads deployment state or SQLite. A manifest/digest mismatch, duplicate
source, source disagreement, incoherent network tuple, checkpoint depth/age
failure, lagging index, unstable tip, query failure, malformed or wrong-script
box, duplicate box ID, or any remaining V1 UTXO blocks the inventory condition.
A successful observation is scoped to the explicit manifest and does not prove its human
completeness, independent source operation, canonical consensus, or deployment
activation. It is a non-authorizing observation prerequisite, not a cutover
decision. An authenticated approval must separately bind manifest review and
source provenance. The old script forces beneficiary payout, so a reverted or
unverifiable box cannot be migrated to the V2 vault by policy or daemon logic;
it is an unresolved solvency incident.

## WP-03 — Reproducible Consensus-Source Baseline

**Security invariant:** every consensus/runtime binary and `0x04` producer is
reproducible from immutable source identity in a fresh recursive checkout.

**Deliverable:**

- replace the unresolved `substrate-node` gitlink with a proper reachable pinned
  submodule or reviewed vendored-source strategy;
- pin the Ergo-node upstream base and track an upstreamable patch series plus
  hashes for the extension producer instead of relying on a sibling local tree;
- add clean-checkout build instructions and CI coverage for both dependencies;
- make dependency ownership explicit before runtime implementation begins.

**Definition of Done:** a fresh recursive clone can build the exact sidechain and
Ergo-node sources needed by the bridge without private directories, mutable
branches, or undocumented patches.

**Current result:** the public Frontier gitlink and exact Ergo base-plus-patch
were reconstructed, identity-checked, tested, and built locally. Devnet startup
now fails closed on source drift. The active-root CI workflow performs the same
recursive reconstruction. A controlled private hosted run may proceed; its
first public hosted run remains deferred until WP-08A permits source
publication. No hosted run may be reported as passed until that exact run
executes.

## WP-04 — Full-Transaction ErgoScript VM Closure

**Security invariant:** the complete transaction, not only the unlock predicate,
accepts exactly one proof-bound burn relative to a supplied tracker root and
rejects every mismatched binding. WP-04 does not authenticate that root or claim
sidechain finality; those properties belong to WP-05 and WP-06.

**Deliverable:** an `ergo-lib-wasm-nodejs` evaluation harness with real non-empty
SPVTracker lookup proofs and DUP lookup/insert proofs. It must evaluate all input
scripts together and verify successor boxes and payout outputs.

**Definition of Done:** valid full-transaction acceptance against a supplied
committee-accepted tracker root, plus rejection of wrong supplied tracker value,
recipient, amount, asset, sidechain ID, block identity, event index, burn ID,
DUP key, duplicate, malformed/non-empty AVL proof, and input/successor ordering
drift. Output must call this path `proof-bound`, not authenticated or trustless.
The harness must not use node-wallet signing or broadcast.

**Current result:** `npm.cmd run trustless:contract-vm` compiles the three
production scripts on the locked local Ergo source and evaluates the production
V2 transaction builder with ephemeral in-memory keys and boxes. The passing
fixture uses a non-empty burn Merkle proof, a 171-byte tracker membership proof,
a 136-byte DUP non-membership proof, and a 136-byte DUP insert proof. The VM
accepts the valid transaction and rejects all 14 required mutations. Input-order
drift reaches a fail-closed AVL verifier trap rather than reducing cleanly to
`false`; this is retained as an explicit regression case. Semantic leaf
mutations are evaluated against a recomputed Merkle root and matching tracker
AVL proof, and the wrong-DUP-key case uses valid proofs for that wrong key, so
those failures isolate contract bindings rather than malformed proof bytes. The
harness contains no transaction-submission route and reads no wallet,
deployment, relayer database, or secret state; it reads only loopback node info,
headers, and compiler routes. This completes WP-04 locally but does not
authenticate the tracker root, prove sidechain finality, close Gate 5, or
support a trustless claim.

## WP-05 — Versioned Runtime Commitment And Finality Producer

**Security invariant:** `bridge_event_root` is a deterministic consensus/runtime
output derived from successful canonical bridge burns, not an operator-selected
environment value.

**Deliverable:**

- first freeze one versioned commitment specification and one canonical golden
  vector source covering domain tags, field widths/order, leaf hash, node hash,
  root construction, checkpoint identity, finality fields, and `0x0401` value;
- add a minimal runtime/pallet commitment producer for versioned fixed-width burn
  leaves and a Blake2b/STARK-ready `bridge_event_root`;
- produce and freeze cross-language Rust/TypeScript/ErgoScript golden vectors;
  their public release follows the WP-08A first-public-source gate;
- bind block/checkpoint identity and reject failed/reverted EVM events;
- add the sidechain consensus/checkpoint finality rule used by the bridge;
- integrate the versioned `0x0401` candidate field from reproducible Ergo source;
- keep raw RLP/MPT/Keccak receipt verification outside the ErgoScript path.

**Definition of Done:** runtime tests reproduce the same roots as TypeScript and
ErgoScript vectors; finality tests independently prove sidechain checkpoint
validity and Ergo anchor depth rather than substituting one for the other. Rust,
Ergo-node, and TypeScript owners may work in parallel only after the canonical
specification and vector source are reviewed and frozen for the package.

**Current implementation result:** `docs/bridge-checkpoint-commitment-v1.md`,
`relayer/src/bridge-checkpoint-commitment.ts`, and
`relayer/test-vectors/bridge-checkpoint-commitment-v1.json` define the reviewed
TypeScript reference and first cross-language vector. `0x0401` V1 is
`bridge_event_root(32) || checkpoint_commitment(32)`; the checkpoint digest
binds separate native Substrate consensus and Frontier execution block hashes,
burn count, GRANDPA rule/set identity, and the domain-separated authority-set
and justification hashes. The sidechain ID is the raw Substrate genesis block
hash. The legacy raw 32-byte root is rejected by V1 parsing. The reproducible
Frontier patch adds post-assembly receipt handling and a bounded runtime pallet;
it accepts only successful canonical `PegOut` logs from the configured bridge,
fails closed on malformed matching logs or overflow, stores the format plus
execution hash/root/count/leaf hashes, and reproduces both the frozen proof-core
root and `relayer/test-vectors/frontier-bridge-event-root-v1.json`.

The patched node now serves upstream `grandpa_proveFinality` data using the same
authority-set link and voter state as the running GRANDPA service. The reusable
`bridge-finality-proof` Rust crate rejects non-canonical SCALE, invalid
signatures or threshold, broken vote ancestry, missing/extra/forked headers,
and oversized proof material. The relayer's read-only RPC boundary can collect
the bounded proof for one exact height.

The node also exposes the same official GRANDPA warp provider through the
read-only `bridge_grandpaWarpProof` method. The bridge verifier now augments each
compact proof with every omitted contiguous header and hash-links that ancestry
to a reviewed deployment checkpoint. It rejects a fragment on another fork,
an omitted scheduled change, every forced change, nonzero delay, invalid set,
set-ID overflow, stale ordering, non-canonical SCALE, and unbounded input. The
linked ancestries plus a bounded checkpoint tail form one chain from that
reviewed checkpoint through the exact requested header to the signed finality
horizon. The suffix after the target must equal the finality proof's
`unknown_headers` byte-for-byte. Handoffs strictly before the horizon determine
the signing set; a zero-delay handoff exactly at the horizon is still verified
by the outgoing set. A versioned trust-anchor digest, supplied separately from
the proof-serving JSON, binds sidechain ID, checkpoint hash and height, GRANDPA
set ID, and canonical authority-list hash.

The native `bridge-state-proof` crate composes that authenticated authority path
with the full requested header, exact GRANDPA finality proof, and bounded
`CurrentCommitment` trie proof against the header's state root. The offline
`bridge-checkpoint-verifier` CLI accepts one strict bounded JSON package,
requires the external digest through `--trusted-anchor-digest`, and returns
`NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT` only after all
bindings pass. A deterministic V2 fixture places the burn-bearing target before
a real scheduled authority handoff and descendant finality horizon, exercising
historical-target verification with real signatures and a Substrate trie proof.
The TypeScript adapter executes the SHA-256-pinned binary without a shell, binds
the exact argv by a separate invocation digest, rehashes the binary before and
after execution, binds exact request bytes by digest, checks the proof-serving anchor fields against
the independently supplied trust root, recomputes the authority-set digest, and
derives the V1 checkpoint plus `0x0401` candidate from the extracted canonical
justification.

This completes the WP-05 native verification implementation for a reviewed
GRANDPA trust anchor, not live Ergo admission. A bounded read-only collector now
reconstructs the same package from exact Substrate RPC responses. A separate
native codec encodes JSON headers and inspects warp/finality envelopes without
claiming verification; both native executables and their exact argv must match
externally reviewed pins, and every collected package must still pass the independent
checkpoint verifier with an externally reviewed trust digest. The deterministic
fixture covers RPC collection through final verification with real signatures
and a real trie proof. Capturing this package from a running devnet, reviewing
the deployment anchor and binary pins, authenticating `0x0401` on Ergo, and
proving ErgoScript acceptance remain open. WP-05 therefore remains active and
Gate 5 remains open.

## WP-06-FED - EIP-Independent Federated Reference Profile

**Security invariant:** the federation may decide source finality only through
one statically registered, versioned threshold profile over the exact
application-bound checkpoint. It must not bypass committed-vault mint
eligibility, settlement conservation, burn inclusion, replay insertion,
cutover lineage, or immediate pre-release revalidation.

**Trust model:** WP-06-FED is explicitly federated. Its selected threshold
proposition is a funds authority, and a threshold of dishonest or compromised
members can authorize a false checkpoint. The reference implementation must
make that authority inspectable and replaceable by profile version, but must
not call the result trustless. The initial compatibility vector uses the
existing 2-of-3 Ed25519 source-proof policy; an institutional deployment must
compile and review its own statically registered key set and activation
profile. Runtime-supplied keys, dynamic plugins, a local `verified` flag, RPC
agreement, and SQLite state are not authority.

The source-attestation Ed25519 keys and the Ergo-admission SigmaProp keys are
role-specific cryptographic identities, not an interchangeable key set. The
federated profile binds both ordered key-set digests, both thresholds, their
role labels, and one common federation epoch. Peg-in and peg-out documentation
must identify which role can authorize funds and whether the same institutions
control both roles. A rotation creates a new profile identity and cannot change
only one role under an existing profile.

FED-1 binds only the source-attestation role needed for mint admission. FED-2
completes the common federated profile by binding the distinct Ergo-admission
role before any payout route can be activated.

**Shared invariant set:** WP-06-FED reuses the exact source event identities,
versioned burn leaf and `bridge_event_root` algorithm where their semantics are
unchanged, V4 disjoint source-lock and external-fee rules, V6 sole-DUP burn
proof and payout attribution, global replay-cutover requirements, WP-07
restart/reorg containment, and separated check/sign/submit/broadcast ports.
It does not reuse V1 GRANDPA or V5/V6 STARK statement bytes under federated
semantics. Every changed authority meaning receives a new domain, profile ID,
statement family, tracker family, and compiled ErgoTree identity.

### WP-06-FED Delivery Sequence

| Milestone | Outcome | Concrete completion boundary |
|---|---|---|
| **FED-1 - pooled-reserve mint admission** | A new federated pooled-reserve proof and invalidation profile is bound to the V4 source-lock-to-reserve reservation identity and exact direct-parent mint callback, while public activation remains false. Only the generic threshold-signature validation mechanics may be reused from T20E-E/F2; its committed-vault statement, envelope, domains, and profile identity are not reinterpreted. | The new signed statement and envelope bind the exact reserve transition, recipient, raw amount, mint identity, profile, ordered source-attestation key-set digest, source threshold, federation epoch, issue/expiry window, and proof digest under dedicated proof and invalidation domains. Insufficient, duplicate, unordered, unknown, stale, wrong-profile, altered-statement, replayed, and conflicting attestations reject; conflict/reorg invalidation is terminal; direct or unreserved owner mint remains unusable. |
| **FED-2 - federated checkpoint admission** | One dedicated `substrate-federated-v1` statement and tracker family binds the source chain, native and execution block identities, `bridge_event_root`, burn count, bridge/token/code identities, runtime/profile identity, both role-specific key-set digests and thresholds, common federation epoch, issue/expiry horizon, `0x0401` anchor, and exact tracker successor. The Ergo-admission SigmaProp is a distinct disclosed payout authority and cannot be substituted for the source-attestation Ed25519 role. | Cross-language statement/vector agreement, statically registered dual-role profile, full tracker transaction acceptance in the pinned JVM, and isolated rejects for every binding, role/key-set digest, signature, threshold, epoch, expiry, anchor, root, application, and successor field. No EIP-0045 opcode or proof-system ID `2` is consumed. |
| **FED-3 - conserved federated settlement** | A separately compiled federated settlement family points to the FED-2 tracker while retaining V6's sole-DUP burn proof, exact payout binding, external miner-fee funding, reserve/liability conservation, and atomic absent-to-present replay insertion. | One full unsigned transaction is accepted by the pinned JVM; coherent one-field negatives cover tracker substitution, burn attribution, payout, fee, reserve, DUP, successor, ordering, and ContextExtension shape. |
| **FED-4 - daemon and recovery integration** | The daemon observes, reconstructs, prepares and reconciles FED-1 through FED-3 candidates, then replays their exact tracker and settlement bindings through a network-free pre-release root without allowing an adapter or journal to become funds authority. | Restart, database loss, out-of-order events, divergent RPC, source reorg, stale federation statement, incident-persistence failure and combined hold-port failure exercise the complete non-authorizing lifecycle. Burn disappearance or conflicting source views fail closed around tracker replay, local packet checking and unconditional submission denial. No tracker transaction or target-node check occurs; signing, submission and broadcast remain disabled until later cutover and acceptance boundaries. |
| **FED-5M - migration cutover candidate freeze** | The existing FED-5A/FED-5B path uses one approved non-mainnet migration-target observation to drive target-specific compilation and unsigned tracker/DUP/reserve materialization, imports the complete global replay set, freezes the exact legacy-retirement requirements and produces one non-executable three-issuance setup-check request. | Every target byte, predicted lineage and all 53 historical funds-route dispositions are bound, but the active static registry remains `null`; no signing, node check, target acceptance, activation or funds authority is claimed. Existing artifacts and code names retain `FED-5`/`FED-5B`; this roadmap label does not rename or reinterpret their bytes. |
| **FED-5G - greenfield launch candidate freeze** | A separately versioned authenticated launch baseline binds source and settlement histories from their declared genesis, the shipped relayer artifact closure and all 53 predecessor authorities under one activation generation. The source-attestation quorum authenticates the completeness/non-instantiation statement; the bridge deterministically derives the empty replay root and drives target-specific tracker/DUP/reserve provisioning. | **FED-5G1 and FED-5G2 are complete locally:** exact raw history bytes are committed, the signed Ergo genesis/setup anchor matches the provisioning observation, migration artifacts cannot cross the schema boundary, and a config-free fresh process rebuilds the compiler closure, authenticated object graph, historical genesis inputs and all three unsigned provisioning identities. Independent source/Ergo consensus, a concrete target packet, node acceptance, setup lineages, activation and funds authority remain false. |
| **FED-6 - authorized non-mainnet acceptance and execution closure** | After explicit target-specific signing/check approval, the three exact FED-5M or FED-5G setup candidates receive signed JVM and `/transactions/check` no-submit acceptance. A separate submission/broadcast approval is then required to establish and canonically confirm those lineages. Only after that state exists may exact peg-in and peg-out candidates be constructed; signing and checking each exact frozen value candidate requires its own target-specific approval. Another separate approval is required before either value lifecycle is submitted. | Every signed setup, peg-in and peg-out byte and transaction identity matches its frozen candidate and accepted check receipt. The launch-mode evidence and setup confirmation precede stateful value-path checking. Any approved submission targets only the approved non-mainnet chain, reaches the declared policy depth and reconciles without bypassing pre-release revalidation. Without the relevant signed no-submit checks, the artifact remains an unchecked unsigned candidate; without the separately approved execution closures, it remains a checked non-broadcast reference candidate rather than a functional bridge profile. |
| **FED-7 - institutional reference package** | The federated profile is documented, reproducible from a clean checkout, independently reviewed, and packaged with its trust assumptions and operator/key-rotation procedure. | Only after FED-6 may WP-06-FED be described as a functional federated reference profile. Gate 5 and every trustless/mainnet/production claim remain open for WP-06-STARK and later external assurance. |

### FED-6-LAB - Isolated Local Execution Campaign

FED-6-LAB is a `critical` local execution lane, not a reinterpretation of any
prior `no-submit` approval. Its authority is limited to freshly created,
task-owned node processes listening only on loopback, fresh synthetic role
keys, and simulated local funds. It excludes public testnet and mainnet targets,
existing wallet material, live funds, remote endpoints, deployment, and public
readiness claims.

The existing V1 target, history, provisioning, unsigned candidates, conformance
reports and `no-submit` receipts remain byte-for-byte frozen. Their disposable
keys cannot be reused, and none of their reports can satisfy the new execution
authorization type. FED-6-LAB must introduce a distinct version/domain for its
authorization, attempt, submission and confirmation records while consuming the
frozen producers through their existing public interfaces.

The campaign executes in this order:

1. **Target and role freeze:** start one fresh exact local target plus its
   read-only witness, bind their process, binary, chain, genesis, RPC and P2P
   identities, and generate fresh separated source-attestation and
   Ergo-admission roles. Reject every non-loopback origin, pre-owned listener,
   process replacement, target drift, role collision and stale packet.
2. **Setup acceptance:** reconstruct the exact three setup candidates, sign
   them with the project WASM signer, run the pinned JVM check and same-target
   `/transactions/check`, and prove signed-object and transaction-ID equality.
   No submission capability is present in this stage.
3. **Setup execution:** create one durable, create-only authorization per exact
   checked transaction; reserve its attempt before transport; call only the
   exact target `/transactions` endpoint; classify accepted, rejected and
   ambiguous transport separately; and reconcile mempool state, canonical
   inclusion, declared depth and rollback before advancing to the next setup
   dependency.
4. **Value paths:** only after all three setup lineages are canonically
   confirmed, construct and separately authorize one simulated-funds
   deposit-to-committed-vault-to-mint path and one
   burn-to-proof-to-replay-insertion-to-payout path. Immediate pre-submit
   revalidation, conservation, exact application binding and global replay
   lineage remain mandatory. A local status or SQLite row never authorizes
   either value release.
5. **Recovery:** against the same target, exercise restart, unresolved and
   ambiguous attempts, RPC disagreement, confirmation rollback/reorg and total
   reconstructible-database loss. Recovery may reconstruct observations and
   holds; it cannot recreate authorization, signatures, accepted proof identity
   or funds authority from local cache state.

Construction, checking, signing, authorization, reservation, submission,
broadcast, observation, confirmation and reconciliation remain separate typed
capabilities. The submission adapter must be statically registered only by the
FED-6-LAB composition root, accept only the exact process-owned target identity,
and remain absent from normal daemon, fixture, replay and V1 `no-submit`
registries. Every authorized byte sequence is single-use; mutation, expiry,
target change or unresolved predecessor invalidates progression and requires a
fresh authorization rather than silent rebuilding.

FED-6-LAB is complete only when the three setup transactions, both value paths
and the recovery matrix pass against one exact fresh local campaign, their
producer-to-consumer joins and isolated negatives close, Node 24 and pinned JVM
checks pass, an independent raw-diff review has no unresolved P0-P2 finding,
and the exact promoted source passes the publication guard. Completion proves a
self-operated federated research profile on that isolated target. It does not
prove independent custody, public-network operation, external review, source
consensus beyond the declared federated model, Gate 5, trustless status,
production readiness or safety for real funds.

**Setup execution checkpoint:** commits `b2fa14cb` through `620a075ef` close
steps 1 through 3 for one exact fresh isolated campaign. The tracked command
bound request SHA-256
`f8f3a6a73a337b21b34fbd0824f388e7d980bda2acd5dcd43b6524ecd6488c10`
to command receipt
`4047dd3355dc75fb0e00faefd9d3208b5d6a11c5864e67f508527ad0cbac3779`;
its validated execution receipt
`1555d4910a68796018c02464bdd81bf5f9722b1ca1246850c535b11c6eca35d7`
records `three_local_setup_transactions_canonically_confirmed`. Every owned
process and monitored listener was absent after completion. The receipt remains
self-operated setup evidence only, and its ephemeral target state cannot be
reused as authority.

**Source-lock check checkpoint:** commit `5fa7e847` adds the disposable tracked
command. A fresh campaign independently reproduced base spec
`b989150a08de688f32883064f80d66fc346da7552a08ac158f395e7ab11baf7a`,
runtime Wasm
`53c6b7b125c2a495380a0cd029b018d698bb5f746dd468b3275f713a4450f137`
and native genesis
`0xa7bd9e5b49142c012390ef826d0545548cb40dcec26fb728c2ea0110e70ae515`
before request
`ea4306a37fbbda90c7ad0fdd9f2e47e6e5c05c5f1099572f8b6dd79ae6d0047d`
produced command receipt
`68adf6726e321f148aa956fea7d16b04485a0c195cd7f1a06ebbe8339d51ccff`
and execution receipt
`0890f146b4935dee43ba47b320e20646dbe417d326f20930eae578f9d1abb5ad`.
The native executable digest remains an in-run identity, not a reproducibility
claim. The source-lock was signed and accepted by the pinned JVM and same node,
then every signer continuation was revoked and every monitored listener was
absent. Signed bytes were neither returned nor persisted. No source-lock
submission, broadcast, source consumption, committed reserve lineage, mint,
funds authority, Gate 5, trustless status or readiness follows. Step 4 now
continues with a new operation-specific authorization and durable local
execution of that source-lock transition, stopping before mint. Peg-out and
recovery remain later boundaries.

**Source-lock creation execution checkpoint:** commits `721e3f99`,
`e6fd148c` and `3ace2682` add the create-only execution worker and command,
then preserve the single process-local setup credential and signer-provenance
authority across the setup-to-node handoff without widening registration or
dynamic-import authority. A fresh exact campaign bound request SHA-256
`14f42fe80aabdababb2aaada9b15c2cba5487579b7da9e1e0bd31f5e8fb192a5`
to command receipt
`8c6387204e674112ef2afcc3ce35bb517baf7fe7fa2c15000ced89a91a24313f`
and worker receipt
`b6df822e0c4b29e36b00a08502195f4248bf4b3394999ed4025478e9725e5238`.
The exact locally signed and checked transaction
`866978ffe743e519f8d4fbacf1f4bb284e715348a61607d4ab2176cd9866b58f`
was durably reserved, accepted by the owned loopback node and canonically
confirmed at local height `804` under header
`179700c5d931b7c8c61298a8d227e7157e7ffa9f6799e40700dfb03e3234bbc7`.
The observed source-lock box is
`ef3bd5cb92e7d4aea129a6aa8f428414e01e2b3caa45ab56bf6b3842e8080580`.
Every owned process and monitored listener was absent after completion, and
neither signed bytes nor runtime capabilities were returned or persisted.
This checkpoint proves only refundable source-lock creation and confirmation
on one self-operated isolated campaign. The source was not consumed; committed
vault/reserve lineage, mint authority, funds authority, Gate 5, trustless
status and readiness remain false. Step 4 now continues with a fresh
same-lifetime campaign that performs and confirms the exact source-lock-to-
committed-vault transition, stopping before mint.

**Committed-vault transition execution checkpoint:** commits `207bc95c`
through `49218bcd` stabilize the exact committed-reserve output observation,
owned mining cadence, fresh node-build output admission and bounded dual-node
reward snapshot convergence without changing the value predicate. A fresh
same-lifetime campaign under compiler-locked Node `24.14.0` bound request
SHA-256
`4df51885b4a8942c9eed650fe903fe3604d8ba9a93fce023997e949c22679a5c`
to canonical worker receipt
`4b4cff7cf01414cc9beeeda0ab6d89cd47f4d60d8c51666f44c427b3cc3a032f`
and execution-root receipt
`2e54ee917f13ed6a346e95a176d6e2cc961579f0269bcd15d147b883b8d28f4d`.
The exact checked and locally signed transaction
`a4ed1f39baff01f8b628771a2c93356da803e7768dd6d93663479049771921d9`
was durably reserved, accepted by the owned loopback node and canonically
confirmed at local height `127`. Both process-owned nodes agreed that source
lock `444df7dcf572895ccbd1d5475c7a046cd3cc79b0892a506dcde8c05ffeb7c3aa`
was consumed and that reserve successor
`1d4d8c7c2ecc5d8efdc73bebb333130e9fd5ad50fbb9832fdc753c53a6100b19`
was present under the refreshed confirmation. Every owned process and monitored
listener was absent after completion, and neither signed bytes nor runtime
capabilities were returned or persisted. This checkpoint establishes the
non-refundable local deposit-commitment state only. Mint authority, funds
authority, profile activation, independent consensus/custody, Gate 5,
trustless status and readiness remain false. Step 4 now continues with a new
fresh campaign that joins this state to the statically reviewed federated mint
reservation and atomic runtime consumer without restoring owner-key minting.

**Fresh real-component peg-in checkpoint:** commit `da2f99d9` fixes the exact
campaign-receipt join by requiring the mandatory Frontier consumer `boundary`
and isolating its absence after both embedded digests are recomputed. A fresh
campaign against bridge HEAD `da2f99d999a543528cffc9c15788fd659e79b019`
bound request SHA-256
`0bd776a23d32585061dd0074a1178d1aa9bdd6874109767e22ce95051f166372`
to command receipt
`5b3f70cf70b8f8d1810a1ebb3ae791e580d6dbfcd25e42f367b3a545be6d009b`,
worker receipt
`454e4a344b8bae84dda4b92b52a50b22cba6cf30b07034db98538987b7d24835`
and execution-root receipt
`d2b11658d8731fbe9071f44a475e5a210853c8d0447c976d3857f4ad36f43982`.
It rebuilt the exact patched Ergo node and reviewed Frontier source, launched
two synchronized loopback Ergo observers, executed and confirmed setup plus the
source-lock-to-reserve value transition, derived the source evidence from that
same process-proven reserve state, produced the V2 threshold packet proof, and
consumed the exact reservation/mint in the source-locked Frontier TestClient.
The canonical command receipt reparses, both receipt digests recompute, every
declared check is true, and all owned listeners and child processes are absent
after completion. This closes only the self-operated local peg-in composition:
the Frontier consumer is a TestClient, source finality is federated depth rather
than authenticated Ergo PoW, and external target acceptance, profile
activation, operational mint authority, funds authority, Gate 5, trustless
status and readiness remain false. Step 4 now continues with the separately
authorized burn-to-proof-to-global-replay-insertion-to-payout lifecycle on a
fresh isolated campaign.

**Frontier application-burn proof checkpoint:** a second bounded overlay on the
exact canonical Frontier patch adds one named Rust TestClient test. It deploys
the reviewed SERG and bridge bytecode, consumes the canonical federated mint
reservation, executes the real approval and `pegOut`, selects the actual
successful receipt/log, decodes its indexed sender, amount and 33-byte valid
secp256k1 recipient, and derives the runtime burn ID, leaf and
`bridge_event_root` from those emitted bytes. It also proves that the minted
15,000,000 nanoERG supply falls by the 10,000,000 nanoERG net burn while the
5,000,000 nanoERG bridge fee remains in escrow. Overlay SHA-256
`f0c31b1cf5f4da548438eab7a2467b8e6ef6e5eb023053ad07cdd6735fca93dc`
reproduces the exact passing Rust source. A pure TypeScript consumer binds the
exact canonical and overlay patch bytes, parses the exported proof-relevant
fields, independently rebuilds the burn identity/leaf/root, validates the
compressed public key, and rejects isolated ABI, topology, identity, root and
conservation drift. It intentionally does not fabricate or claim a complete
receipt array, and caller-supplied stdout has no execution provenance. The
next slice is therefore a same-process source-apply/build/test/stdout consumer,
not tracker or payout work. No source finality, Ergo anchor, tracker admission,
replay insertion, payout, signing, submission, broadcast, funds authority,
Gate 5, trustless status or readiness follows from this checkpoint.

### WP-06-FED Checkpoint And Immediate Slice

FED-1 is complete as a local, non-activating checkpoint. The dedicated
federated pooled-reserve proof binds the exact source-lock-to-reserve statement,
mint identity, source-attestation key-set digest and threshold, federation
epoch, validity window, result, evidence, and proof digest. Threshold-signed
source-reorg, stale-checkpoint, and conflicting-view invalidations are exact-
pending-bound and terminal. The exact direct-parent callback rejects
unreserved, expired, invalidated, mismatched, and same-block-invalidated mints
atomically. Historical SCALE discriminants remain stable and the new error is
appended at index 28.

The locked Frontier patch has SHA-256
`47fdb34df23ebd5aad7d64885d030f67b3ae1aa25d1990bccc010903039a8813`.
The original FED-1 semantic source changes remain limited to
`template/runtime/src/peg_in_causal_source_proof.rs`,
`template/runtime/src/peg_in_pooled_reserve_reservation.rs`,
`template/runtime/src/lib.rs`, `template/runtime-v4-test/src/lib.rs`,
`template/runtime/src/bridge_commitment.rs`, and
`template/node/src/bridge_atomicity_tests.rs`. FED-6G1a additionally changes
the typed genesis and chain-spec boundary in
`template/runtime/src/bridge_commitment.rs`, `template/node/src/chain_spec.rs`,
and `template/node/src/bridge_atomicity_tests.rs`. FED-6-LAB reservation
acceptance additionally introduces
`template/node/src/bridge_federated_lab_reservation_tests.rs`, registers it in
`template/node/src/main.rs`, and seeds the deterministic deployed bridge address
only as the chain-spec genesis legacy-mint quarantine identity. This permits V4
profile activation without re-enabling the disabled legacy mutation call. The
real TestClient/block-import harness deploys the pinned bridge and token bytes,
activates the exact federated profile and consumes the same canonical 603-byte
reference statement produced by TypeScript. That reference uses an explicit
sidechain identity independent of build-path-sensitive native TestClient genesis
bytes; a fresh target campaign must instead derive the deployed sidechain identity
from its reviewed target packet. The reservation block contains no Ethereum
transaction status and preserves both contracts' code, nonce and balance. The V2
packet consumer now decodes the selected profile and proof envelope, passes the
exact dynamic envelope into this source-locked Rust matrix, and the Rust
consumer derives both validity-window bounds from that activated profile rather
than a fixture constant. It requires one exact test result plus one proof-byte
digest marker, and revalidates source and tool identities before and after
Cargo. A candidate block containing the reserved mint
plus an unreserved sibling rejects
without changing best block, reservation, token supply, balances or replay state;
the corrected block then consumes the direct-parent reservation into the exact
mint and binds its consumed record to the imported execution block and transaction.
Replay, missing activation, stale proof, wrong proof profile, wrong application
and rebound deposit/reserve identities remain isolated negatives. The complete
113-file map remains
machine-bound in `sources/consensus-source-lock.json`. The current patch applies
cleanly and its source-lock and independent static review pass. The exact Rust
TestClient execution and one fresh end-to-end local campaign now pass for this
patch digest through commit `da2f99d9` and command receipt
`5b3f70cf70b8f8d1810a1ebb3ae791e580d6dbfcd25e42f367b3a545be6d009b`.
Main-runtime profile activation remains false. FED-1 does not provide a
payout path, a complete dual-role federation profile, target-node funds
authority, Gate 5 closure, or a trustless/readiness claim.

FED-6-LAB packet-bound proof consumption has this validation dependency map:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Process-proven V2 packet proof, selected-profile SCALE bytes, V4 statement and outer/inner proof envelope | TypeScript re-decodes every binding and the exact Rust TestClient consumes the same proof bytes while admitting and consuming only the direct-parent reservation | Re-run when the packet schema, profile/statement/proof codecs, mint identity, runtime profile, or Rust proof consumer changes |
| Exact consensus source lock, patched Frontier checkout, tracked Solidity closure, Cargo/Rust/Git tool lock, `Cargo.lock`, `rust-toolchain.toml`, configuration-isolated offline Cargo environment and exact named test | Executable hashes match before their first invocation and tools/source match again after execution; the consumer owns a fresh Cargo target and config-free Cargo home; Cargo runs inside the bounded process-tree owner and cleanup follows confirmed tree closure; one exact test passes and one dynamic proof SHA-256 marker matches the packet bytes. The complete build-tool closure and shared dependency-cache content remain explicitly unattested. Hash checks are not an atomic source/tool snapshot and assume exclusive execution by a non-adversarial local OS user | Re-run when any source/patch/tool pin, build declaration, environment policy, process-containment boundary, test identity, or dynamic marker changes |
| Process-proven committed-reserve observation, retained packet bytes, V4 draft, and Node/collector-module files observed before and after collection | The collector derives all seven proof-evidence fields; V2 source-attestation and packet production accept only its same-process one-shot receipt. Fresh command receipt `5b3f70cf70b8f8d1810a1ebb3ae791e580d6dbfcd25e42f367b3a545be6d009b` now proves that exact receipt reached the Frontier consumer in one real-component campaign. File hashes are not an atomic loaded-image snapshot and assume exclusive non-adversarial same-user execution. The disclosed finality object is a dual-RPC depth policy, so source canonicality, Ergo PoW, external target acceptance, funds authority, Gate 5, trustless status and readiness remain false | Re-run only when the observation, packet, draft, evidence codec, collector identity, V2 request, packet binding, Frontier patch/toolchain, or campaign command changes |
| Exact canonical Frontier patch, application-burn overlay, named Rust TestClient producer and pure transcript consumer | The Rust test executes the reviewed mint-to-burn application path, decodes the actual PegOut log, checks the runtime leaf/root and supply/fee conservation; the pure consumer independently rebuilds the proof-relevant result and rejects isolated drift. Complete receipt topology and process provenance remain false until the runner owns patch application, build, execution and stdout consumption in one process tree | Re-run when either patch, deployed application identity, reservation statement, named Rust test, marker schema, ABI decoder, burn format, conservation constants or consumer changes |

FED-2 is complete as three bounded local producer-to-consumer checkpoints. It
did not change V1, V5, or V6 bytes:

1. **FED-2A - statement and profile freeze (complete local, non-authorizing
   checkpoint):** the new `substrate-federated-v1` domains, variable-length
   dual-role profile and fixed 512-byte statement are frozen in pure TypeScript
   and Rust behind an opt-in feature. One shared golden vector binds the source,
   native and execution identities, application root and burn count,
   bridge/token/runtime identities, both role digests and thresholds, common
   epoch, and an inclusive/exclusive admission horizon expressed explicitly in
   Ergo heights. Attestation and extension helpers re-decode canonical bytes;
   the admission API atomically composes profile identity, maximum horizon and
   current-height checks. This establishes neither signatures, anchor membership,
   tracker succession, activation, funds authority, Gate 5 nor trustless status.
2. **FED-2B - Ergo tracker admission (checkpoint complete):** a distinct VM-v3 tracker family consumes the FED-2A bytes,
   authenticates the exact `0x0401` anchor, enforces the static 2-of-3
   Ergo-admission proposition and preserves the exact tracker successor. Its
   2,713-byte proposition has contract ID
   `4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c`.
   The guarded pinned-JVM runner reproduces one 3,940-byte proofless
   transaction with exactly three ContextExtension variables, accepts the
   complete predicate reduction and rejects structural statement, proof,
   anchor-selector and successor mutations. Successor creation height is
   monotonic, cannot exceed evaluation height and may lag it by at most 100
   blocks; admission height remains monotonic and cannot exceed evaluation
   height. Empty spending proof remains
   non-authorizing. No EIP-0045 opcode, node, signature, submission or
   broadcast capability is involved. Focused checks and independent review
   pass. The check-only compiler includes this contract, resolves its pinned
   template/vector/identity locally, rejects any source or identity drift and
   cannot deploy it. Repository-wide `contracts:check` also passes against a
   fresh isolated compile API from the pinned public Ergo node JAR without
   using private runtime state.
3. **FED-2C - complete rejection matrix (complete local checkpoint):** the
   pinned-JVM runner now executes nine acceptance tests plus the contract
   property, ten tests total, against AcceptanceSpec SHA-256
   `12826b8577cc16b81255ac9eeda1b87300ba73c43d3b0fcfd04ad9ef8c49ed32`.
   Single-field and coordinated negatives cover all four discriminator bytes,
   source/native/execution identities, root, burn count, application and role
   bindings, the two thresholds independently, epoch, horizon, input NFT and
   insert-only AVL policy, proof framing and canonical padding, anchor,
   tracker authority and complete successor lineage. Coordinated statement
   negatives rebuild every downstream statement ID, extension root, anchor,
   tracker key/value, AVL proof and successor so stale commitments cannot hide
   missing semantic guards. The current FED-2B proposition, positive
   transaction and contract identity are the 2,713-byte checkpoint recorded
   above. Exact final-diff independent review remains a promotion gate. This is
   local JVM predicate closure only, not source-signature
   verification, activation, node acceptance, funds authority, Gate 5 or
   trustless status.

FED-3 is complete as three local, non-activating checkpoints:

1. **FED-3A - contract-family freeze (complete local checkpoint):** family ID
   `fc4ef41f900e0801c56183999056ef739c4cce29dab9a7c7129ecaf49c76e6e8`
   binds a dedicated federated DUP contract plus byte-for-byte reuse of the V6
   source-lock and pooled-reserve templates under new constants. The resulting
   contract IDs are, respectively,
   `3a3c8f40d4901b8ae30a5b6a43c001127bcf8d4cb6a3e89bc1b075620b7683e4`,
   `76c16560b4232d3d992febfd3a9939b67203424087b5b54a1845e13b39464402`,
   and `16ac723b2c5e899240173abbb5632aa4a1730c0688ada499898a63b05389421c`.
   The DUP predicate consumes the exact FED-2 tracker key/value/application and
   authority tuple while preserving V6 sole-DUP inclusion, payout, external-fee,
   reserve/liability and successor conjunctions. TypeScript, the pinned JVM
   compiler and the check-only node compiler reproduce the exact identities.
   V6 bytes remain unchanged. Global replay migration and retirement of every
   legacy payout route remain P1 cutover blockers; this checkpoint performs no
   transaction acceptance, activation, signing, submission, broadcast or funds
   movement and does not close Gate 5 or establish trustless status.
2. **FED-3B - deterministic settlement construction (complete local checkpoint):**
   one separately named pure builder consumes the process-owned FED-3A family,
   exact FED-2 tracker state, reserve/DUP predecessors, external fee input and
   application-bound burn claim. It proves the exact tracker entry, binds the
   authority/profile tuple, burn inclusion, payout, reserve/liability delta and
   absent-to-present replay insertion, then materializes the exact ordered
   reserve/DUP/fee transaction with Vars `0..3` only on DUP. The direct matrix
   covers tracker singleton/history drift, every disclosed tracker authority
   field, root/depth/horizon, payout/block/amount/asset, reserve, replay,
   fee token/register/value, heights, process provenance and packet immutability.
   The packet explicitly reports predecessor chain-state provenance, source
   finality, tracker admission, activation, target acceptance and funds
   authority as false. No V6 byte changed.
3. **FED-3C - JVM conjunction and rejection closure (complete local checkpoint):**
   a process-owned fixture deterministically materializes the exact FED-3B
   transaction under VM version 3, independent of EIP-0045 activation. The
   pinned JVM accepts the complete reserve/DUP conjunction and reruns the
   disjoint source-lock commit/refund windows. Isolated negatives cover input
   and output topology; tracker proposition, singleton cardinality and quantity,
   source-chain, profile, admission key set, key/value/application and authority
   fields, root, anchor depth and horizon; burn inclusion and count; payout;
   reserve and DUP predecessors and successors; external fee funding; and the
   exact ContextExtension. The fixture freezes transaction ID
   `27436055d83147364f240d5f5b194c8ed66cdbc10125655a033f1372d1b26a6e`
   and fixture SHA-256
   `6f80dfa25f88851a3e91a38a6a8a6a8b3e9a6961f775f9e18e4ff2133d0c13d3`.
   It explicitly leaves source provenance and finality, activation,
   target-node acceptance, signing, submission, broadcast, funds authority,
   Gate 5 and trustless status false.

FED-3's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Federated tracker codec/key, family profile decoder, deterministic builder and direct matrix | Four focused Vitest files, 23/23 tests passed under Node 24 | Re-run only if these TypeScript inputs or their WASM AVL API change |
| Deterministic acceptance fixture and generator | Focused Vitest 1/1 passed; the fixture and transaction identities reproduce exactly | Re-run only if the fixture schema, generator, builder or frozen contract identities change |
| Complete TypeScript source graph | `tsc --noEmit` passed | Re-run when the FED-3 TypeScript closure changes |
| Layer dependency graph | 114 layered runtime modules across 764 TypeScript source files passed | Re-run only for import/module-boundary changes |
| Exact process-owned JVM fixture, VM-v3 spec and pinned runtime/toolchain inputs | Guarded runner passed 12/12 with acceptance-spec SHA-256 `24c176760baa4e7411d7f01d2996153d0d4afb09b721d870738405ed7c416a84` | Re-run only if a pinned input, transaction shape, contract, spec or runtime pin changes |
| Exact stable FED-3 package | Fresh independent strict review is required before commit; any P0-P3 finding reopens the package | Invalidated by later security-semantic changes, not by unrelated documentation |
| WASM AVL implementation and frozen FED-3A/V6 contract bytes | Unchanged by FED-3 | Existing focused results remain reusable |

FED-4A1 is complete as a local, non-activating checkpoint. One compatibility
producer cross-binds the frozen FED-1 mint reservation, dual-role settlement
family, FED-2 checkpoint/tracker and exact FED-3 settlement packet without
claiming that a pooled-reserve deposit and burn are causally paired. The exact
deep-frozen candidate set is registered in a static classified provenance
adapter and consumed by a classified daemon application root. That root rejects
a structured clone before observation, requires a fresh exact mint
`pending_hold`, and reconciles only the exact burn candidate through the shared
ports. Neither the adapter, mint observation, journal nor revalidation cache is
funds authority. Restart reconstruction is intentionally not implemented from
serialized candidate state: FED-4A2a now reruns fresh preparation instead.

FED-4A1's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Candidate producer, static provenance adapter, application root and shared reconciliation wording | Focused matrix passed 26/26 under Node 24; structured-clone, mint-observation and source-profile drift reject before later work | Re-run only if these runtime paths, their direct port contracts or frozen FED-1/FED-2/FED-3 input shapes change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 109 layered runtime modules across 699 TypeScript files passed | Re-run when this TypeScript closure or a classified import changes |
| Exact FED-4A1 diff | Independent strict review reports no P0-P3 finding | Invalidated by changes to provenance, profile/family bindings, observation ordering, reconciliation semantics or authority claims |

FED-4A2a is complete as a local, non-activating daemon checkpoint. The scheduler
accepts only one frozen exact-key profile and owns fresh producer collection,
same-process candidate reconstruction, FED-4A1 integration, and a run-local
revalidation cache. It records only candidate/family/transaction identities,
the current complete observation cycle, and false authority boundaries through
a write-only callback. The real daemon calls this boundary only after a complete
peg-out scan. The tracked active profile is `null`; no environment value,
database row, fixture, or copied observation can register or restore it.
Clean-pass, restart-rebuild, copied-observation, unknown-burn, stale-input,
transaction-drift, extra-capability, daemon-ordering, architecture, and broadcast
surface checks pass. Runtime-backed FED-1/FED-2/FED-3 collectors remain the
explicit FED-4A2b blocker.

FED-4A2b1 is complete as a local, non-activating FED-1 producer checkpoint. A
bounded compatibility-layer collector reads the exact runtime code, active V4
reservation profile, enforcement flag, pending-key index, pending record and
both terminal-record keys from two distinct credential-free RPC transports with
endpoint-bound origins at one reported-finalized Substrate block. It requires
both sources to agree on the
same header, state root, storage values and captured read-proof bytes; decodes
the exact statement and proof identity; and rejects an absent, terminal,
substituted or stale reservation. The captured read proof is not executed, and
two-origin agreement is not source consensus or cryptographic finality. The
collector returns the statement and matching `pending_hold` in one frozen
same-process object. The scheduler consumes that object exactly once, requires
its exact native source block hash and height to equal the scheduling cycle,
and rejects a copy or replay before candidate reconstruction. The static runtime profile remains
`null`; no persistence, mint, check, signature, submission, broadcast or funds
authority was added.

FED-4A2b1's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| FED-1 runtime storage collector, pending-record decoder and scheduler join | Focused matrix passed 28/28 under Node 24; shared transport, same endpoint under different paths, malformed transport origin, source provenance, runtime/profile/statement/index substitution, each pending-horizon inequality, both terminal states, proof/header disagreement, moving finalized head, copied producer state, cross-cycle height drift, same-height block-hash drift and genuine-result replay reject before scheduling | Re-run only if these producer bytes, storage keys, provenance rules or scheduler input contract change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 109 layered runtime modules across 701 TypeScript source files passed | Re-run when this TypeScript closure or a classified import changes |
| Captured Substrate read proof and two-origin agreement | Explicitly retained as unverified drift evidence; `stateProofVerified`, cryptographic source finality and mint authority remain false | Reopen only when an authenticated proof consumer or deciding source-finality rule is introduced |

FED-4A2b2 is complete as a local, non-activating FED-2 producer checkpoint. A
bounded collector observes the exact runtime bridge commitment at the frozen
statement target, the target's canonical hash at its height and one
reported-finalized head through two distinct credential-free Substrate
transports with endpoint-bound origins. It requires exact agreement on the
application-bound `bridge_event_root`, burn count, execution block, sidechain
identity, target hash/height/state root, reported-finalized head hash/height and
captured read proof. It does not compare or recompute complete Substrate header
bytes. The read proof is retained but not executed. Runtime code and profile
storage are not independently observed
in this slice; the frozen FED-2 statement, settlement-family identity and
tracker profile bind those application semantics.

The same collector observes one canonical unspent tracker singleton through
two distinct endpoint-bound Ergo sources. It binds the exact tracker contract,
NFT, profile, sidechain, admission key set, supplied complete AVL history,
target entry, latest source height, anchor header identity, statement horizon,
bounded selected-parent ancestry, required anchor depth and stable current Ergo
tip. The scheduler consumes the
same-process result exactly once, requires its reported-finalized source head
and Ergo tip to equal the current cycle, and requires its tracker box, digest,
key and value to equal the deterministic FED-3 settlement packet. A copied or
replayed result fails before candidate reconstruction. Two-origin agreement
does not prove backend or operator independence, Substrate finality, Ergo
consensus, state-proof validity or tracker-admission authority. The static
runtime profile remains `null`; no persistence, check, signature, submission,
broadcast, payout or funds authority was added.

FED-4A2b2's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| FED-2 checkpoint/tracker collector and scheduler join | Focused producer and scheduler matrix passed 35/35 under Node 24 and the five-file affected closure passed 122/122; copied provenance, reused results, every runtime-commitment field, application profile, finalized-head field, Ergo-tip field and settlement tracker field are mutated independently; RPC disagreement, moving source views, absent, duplicate or oversized tracker history, singleton-digest drift, noncanonical, shallow, orphaned, missing-parent, parent-ID, parent-height, over-depth or witness-divergent ancestry, and unknown cycle fields reject before scheduling | Re-run only if these producer fields, source ports, provenance rules, tracker bindings or scheduler input contract change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 109 layered runtime modules across 702 TypeScript source files passed | Re-run when this TypeScript closure or a classified import changes |
| Captured Substrate proof, tracker history and two-origin observations | Explicitly non-authoritative; state-proof verification, source attestations, cryptographic source finality, Ergo consensus and tracker-admission authority remain false | Reopen only when a deciding authenticated consumer or source-owned consensus rule is introduced |

FED-4A2b3 is complete as a local, non-activating FED-3 producer checkpoint. A
bounded Ergo-only collector acquires the exact canonical unspent pooled-reserve
singleton, duplicate-prevention singleton and pure-ERG external-fee UTXO already
frozen in the deterministic settlement packet. It validates the exact contract,
NFT, family/register and fee shape; requires one unspent indexed singleton per
NFT; checks each selected box against the current UTXO set; binds complete box
identities, lineage counts, one stable synchronized tip and the exact settlement
transaction under two distinct endpoint-bound origins. The scheduler consumes
the first same-process result once and requires its tip and canonical packet
binding to equal the current cycle and FED-3 packet. After asynchronous burn
reconciliation it recollects and consumes a second result through the same
process-owned source set, rejects any last-use reserve/DUP/fee drift, and binds
that final state digest to the burn-revalidation digest. Missing, duplicate,
spent, noncanonical, malformed, stale, divergent, copied or cross-packet inputs
reject before a scheduling observation is recorded. Source ports are read-shaped,
but implementation side effects are not attested. Two-origin agreement is not
Ergo consensus or proof of independent operation. The static runtime profile
remains `null`; no persistence, checker, signature, submission, broadcast,
payout or funds authority was added.

FED-4A2b3's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| FED-3 reserve/DUP/external-fee collector and scheduler join | Direct producer plus scheduler matrix passed 37/37 under Node 24 and the five-file affected closure passed 75/75. The exact packet-binding recipe covers family, transaction and all three complete box identities. Copied source/result/packet provenance, shared objects/origins, duplicate IDs, missing/duplicate/oversized or spent singleton lineages, spending proofs, future heights, absent UTXOs, wrong contracts/NFTs/AVL/register/liability/fee shape, exact reserve/DUP/fee identity drift, moving tips, source disagreement, cross-cycle tip drift, genuine packet substitution and post-reconciliation fee disappearance reject before recording. Independent review findings on last-use TOCTOU, aggregate packet negatives and source-port labels are closed in this checkpoint | Re-run only if these producer fields, source ports, packet bindings, singleton rules, last-use recollection or scheduler input contract change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 109 layered runtime modules across 703 TypeScript source files passed | Re-run when this TypeScript closure or a classified import changes |
| Two-origin current-UTXO observation | Explicitly non-authoritative; backend independence, Ergo consensus, historical lineage finality, checking and funds authority remain false | Reopen only when a deciding authenticated consumer or source-owned consensus rule is introduced |

FED-4B1a is complete as a network-free, non-activating lifecycle checkpoint.
The daemon's finalized-cycle collection and scheduler now emit typed stage
failures without changing successful observation bytes. A separate composition
root catches those failures, latches the daemon's process hold before calling
the existing durable operator-review hold port, and returns only a
non-authorizing held result after persistence succeeds. If that persistence
call fails, a typed digest-only error escapes while the process latch remains
open. The root accepts a write-only scheduling-record port and no local read or
snapshot-restore port. Restart after discarding that record therefore reruns
the complete FED-1/FED-2/FED-3 producer closure instead of restoring a candidate
or observation. This checkpoint does not claim complete database-loss recovery:
the burn reconciliation state in its direct matrix is freshly instantiated but
pre-populated. Actual deletion of a lifecycle-bearing database and source-backed
reconstruction remain FED-4B1b. Out-of-order and divergent producer inputs fail
before the scheduling record. The static profile remains `null`; no checker,
signature, submission, transport, broadcast, payout or funds authority was
added.

FED-4B1a's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Staged cycle/scheduler failures, lifecycle hold composition and daemon join | The direct FED scheduler/lifecycle matrix passed 29/29 under Node 24; the daemon hold boundary passed 31/31. Finalized-cycle acquisition is inside the lifecycle root. Restart without the prior write-only record recollects all three producer results, while out-of-order producer state, divergent collection and injected durable-hold failure stop before any scheduling record | Re-run only if cycle collection, scheduling stages, producer input contracts, lifecycle incident ports, process-hold ordering or daemon composition change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 109 layered runtime modules across 704 TypeScript source files passed | Re-run when this TypeScript closure or a classified import changes |
| Local observation and hold state | Explicitly non-authoritative; a local record cannot be read back by the lifecycle root, and a hold can only deny work | Reopen only if persistence can reconstruct a candidate or a later capability can bypass the hold |

FED-4B1b is complete as a network-free, non-activating database-loss
checkpoint. Its composition accepts a fresh replacement `StateTracker` only
while the continuity-recovery and funds-release holds remain open. It binds a
complete burn inventory to the exact finalized scheduling-cycle height and
block hash, validates the whole inventory before one atomic SQLite batch, and
validates the batch result inside that transaction before commit. It verifies
every persisted chain, transaction, block, event, amount, recipient and
observer field, then reads all eight lifecycle and execution-authority tables
in one SQLite snapshot and requires every count to remain zero before the
existing lifecycle can rerun all three fresh producer closures. The positive
matrix creates lifecycle-bearing SQLite state, closes
it, deletes its complete runtime directory, opens a fresh database and retains
the reconstructed burn only as `detected`. The real daemon passes its complete
inventory to this callback whenever the durable state requires continuity
recovery. Source disagreement and an out-of-order cycle pin fail before writes;
a second-row persistence failure rolls back the complete batch; and amount or
recipient drift between reconstructed state and the fresh scheduler candidate,
any nonempty authority table, and a malformed batch result all latch or roll
back before recording. No
local row, reconstructed inventory or scheduling observation authorizes funds.

FED-4B1b's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Complete SQLite deletion, atomic cycle-bound burn inventory and lifecycle scheduler join | The direct FED matrix passed 44/44 under Node 24 and the daemon hold boundary passed 31/31. A fresh replacement reconstructs the complete inventory under the still-open continuity hold and reruns all three fresh producers. Source disagreement and out-of-order pinning stop before writes; each of the eight authority tables rejects independently; malformed batch results and injected second-row failures roll back every write; and same-ID amount or recipient drift is rejected by the scheduler's candidate-to-burn join before recording | Re-run only if database-loss inventory shape, batch persistence, authority-table inventory, cycle pinning, candidate-to-burn semantics, lifecycle hold ordering, daemon composition or scheduler input contracts change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 110 layered runtime modules across 705 TypeScript source files passed | Re-run when this TypeScript closure or a classified import changes |
| Reconstructed local state | Explicitly non-authoritative; one snapshot requires zero peg-in lifecycle, mint transport, aggregate attempt, candidate, execution reservation, submission attempt, Ergo operational attempt and pending DUP heartbeat rows while the local hold remains open | Reopen if reconstruction gains another persisted or authority-bearing surface, or a later capability can consume reconstructed state as authority |

FED-4B2 is complete as a network-free, non-activating last-use source-generation
checkpoint. The FED-1 mint-reservation and FED-2 checkpoint/tracker producers
retain their exact original process-owned read ports as opaque recollection
provenance, matching the existing FED-3 predecessor producer boundary. After
an initial burn reconciliation and immediately before any write-only scheduling
record, the scheduler recollects and consumes all three producer results,
reasserts the exact cycle and settlement-packet joins, and compares one
domain-separated generation digest across the initial and last-use
observations. It then repeats the burn and settlement-transaction reconciliation
after those source reads and binds that final result into the scheduling
observation. The digest
binds the reservation statement and state, source checkpoint and agreement,
Ergo tracker state and agreement, and reserve/DUP/external-fee predecessor
state and agreement. An expired reservation, replaced canonical checkpoint
target, burn disappearance or settlement transaction drift therefore reaches
the integrated lifecycle hold path before recording. Recollection grants no
authority to copied values because only genuine same-process producer results
carry the private source-port binding. Parallel read collection does not
authorize a mixed generation: every result must match the same frozen cycle and
the complete generation digest before it can be observed. The static profile
remains `null`; no checker, signature, submission, transport, broadcast, payout
or funds authority was added.

FED-4B2's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| FED-1/FED-2/FED-3 original-port recollection, generation comparison and integrated lifecycle hold | The two direct producer matrices plus the scheduler/lifecycle matrix passed 78/78 under Node 24. A genuine result can recollect through its original ports while a copied result cannot. The integrated negatives replace an initially valid mint reservation or canonical checkpoint target after first collection, remove the burn or drift the settlement transaction during initial reconciliation, and separately make each fault occur while last-use producer reads are in progress. Each failure latches the process hold before the durable operator-review hold and records nothing. Independent strict review identified the intervening-read TOCTOU; the second reconciliation and both interleaving negatives close it, and remediation review reports no remaining P0-P3 finding | Re-run only if producer provenance or recollection, source/cycle/packet fields, generation digest, either burn reconciliation, lifecycle hold ordering or the scheduling-record boundary changes |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 110 layered runtime modules across 705 TypeScript source files passed | Re-run when this TypeScript closure or a classified runtime import changes |
| Source-generation observation | Explicitly non-authoritative; read-proof validity, backend independence, Ergo or sidechain consensus, tracker admission, checking and funds authority remain false | Reopen only when an authenticated proof consumer or later capability consumes this observation |

FED-4C is complete as a network-free, non-activating pre-release containment
checkpoint. The real daemon calls one composition root after the existing
scheduler has reconstructed and recorded only non-authorizing work. That root
recollects the exact original FED-1/FED-2/FED-3 process-owned ports four times:
before and after a concrete FED-2 tracker-admission replay, after a concrete
FED-3 settlement-packet provenance check, and after an unconditional submission
denial. The replay binds the exact checkpoint profile/statement and tracker
key/value/input digest. The packet check binds the exact unsigned settlement
transaction ID and digest, but explicitly does not perform a target-node check.
No callback can hide a checker, signer, submitter, transport or broadcaster,
and no authority journal transition is available.

The interleaving matrix makes burn disappearance and source-generation conflict
occur at each of the four source boundaries through the original observation
ports. Every fault latches the process hold and attempts durable operator-review
persistence before returning a non-authorizing result. Async process-latch
rejection, `throw null` from either hold port, and simultaneous `throw null`
failures remain typed and digest-bound; durable persistence is attempted even
when the process latch fails. The static scheduler profile remains `null`.
This checkpoint performs no tracker transaction construction, target-node
acceptance, signing, submission, transport, broadcast, payout or funds movement
and does not close Gate 5 or establish trustless or production-ready status.

FED-4C's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Original-port source revalidation, concrete tracker/packet replay, unconditional submission denial, hold composition and real daemon join | Focused scheduler/lifecycle matrix passed 63/63 under Node 24. Eight isolated source interleavings cover burn disappearance and source-generation conflict at every boundary; copied observations, async/null/combined hold failures and daemon ordering fail closed without a later capability or authority journal | Re-run only if producer recollection, tracker/packet bindings, boundary ordering, lifecycle hold ports or daemon composition changes |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; 110 layered runtime modules across 706 TypeScript source files passed | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-4C diff | Independent strict review found and closed the async/null hold failures, then reported no remaining P0-P3 finding | Reopen for changes to source provenance, stage ordering, hold semantics, concrete bindings or authority claims |
| Target and authority surfaces | Target-node check, tracker transaction, checker, signer, submitter, transport, broadcast, authority journal, Gate 5 and readiness remain false or absent | Reopen only in FED-5/FED-6 under their separate acceptance and authorization criteria |

FED-4 is complete in three medium checkpoints:

1. **FED-4A - non-authorizing daemon candidate integration:** carry the frozen
   FED-1 through FED-3 identities through the existing observation,
   reconstruction, preparation and reconciliation ports. FED-4A1 closes the
   exact non-authorizing candidate/application join. FED-4A2a wires it to the
   real daemon and proves restart reruns the producer boundary instead of
   restoring a local observation. FED-4A2b1 closes the exact read-only FED-1
   reservation/hold producer, FED-4A2b2 closes the exact read-only FED-2
   checkpoint/tracker producer, and FED-4A2b3 closes the exact read-shaped FED-3
   reserve/DUP/external-fee producer. The profile remains statically inactive.
   Adapters and local journal state may schedule or block work but cannot
   authorize mint or payout.
2. **FED-4B - lifecycle and recovery closure:** FED-4B1a closes fresh restart
   without restoring the prior write-only scheduling record, finalized-cycle
   collection failure, out-of-order producer observations, source disagreement
   and incident-persistence failure at the integrated scheduler root. FED-4B1b
   closes actual deletion of a lifecycle-bearing database and reconstructs only
   the exact cycle-bound burn inventory before rerunning fresh, non-authorizing
   producer state. FED-4B2 closes last-use recollection and source-generation
   replacement through the real producer ports before any scheduling record.
3. **FED-4C - final pre-release containment:** prove burn disappearance and
   conflicting source views fail closed before tracker admission, after tracker
   admission, after checking and through the explicit submission-authorization
   boundary.

FED-5A is complete as a pure, blocked cutover-generation checkpoint. The
versioned manifest replays the process-owned federated family compiler identity,
the exact pinned tracker contract, the process-owned V4 cutover review and the
process-owned global historical replay packet. It binds the source/runtime and
federation identities, every imported replay contribution and the exact static
set of 53 legacy route requirements. The four integrated-V5 routes remain
explicitly pending authenticated inventory; no missing evidence is converted
into a retirement claim.

The target predecessor state is now part of the generation identity rather than
left to the later materializer. Three canonical payloads bind exact value,
ErgoTree, singleton NFT and complete registers. Tracker genesis binds the empty
370-byte-value AVL, federation profile, sidechain, zero source/admission heights
and Ergo-admission key-set digest. DUP genesis replaces the old V4 lineage ID in
`R4` with the exact federated family ID while preserving the imported global
replay AVL in `R5`. Reserve genesis binds the same family ID, an empty deposit
AVL and zero liability. The V4 source replay registers remain separately named
and cannot substitute for the target DUP payload.

FED-5A intentionally does not bind target creation heights or output IDs and
does not prove those payloads exist on chain. Inventory exhaustiveness,
authenticated retirement, lineage establishment, activation, target checking,
funds authority, Gate 5, trustless status and production readiness all remain
false. Those are FED-5B or later boundaries, not implied by a deterministic
manifest.

The retained FED-5A golden generation is compiler and predicate evidence, not a
materializable target generation. Its tracker, DUP and reserve singleton IDs
are the synthetic `0d`, `0e` and `0f` fixture values. An NFT ID is the exact
first input box ID of its issuance transaction, so no materializer may accept a
different chain box while preserving those compiled identities. FED-5B must
observe three real, pairwise-distinct, pure-ERG genesis boxes on the approved
non-mainnet target and recompile the tracker and dependent settlement family
for their exact IDs before constructing issuance transactions.

FED-5A's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact federated family/tracker identities, real V4 replay and review producers, target genesis payloads, global replay and 53-route join | The focused manifest and real-producer integration matrix passed 13/13 under Node 24. It rejects copied producer outputs, substituted family/tracker/runtime identity, replay drift, omitted or duplicated routes, funded/unresolved instances, caller retirement claims, target-contract overlap, manifest mutation and isolated tracker/DUP/reserve register drift | Re-run only if one of those producer identities, payload bytes, replay semantics, route requirements, manifest fields or validation rules changes |
| Exact pinned tracker identity | The existing tracker identity/context matrix passed 4/4; its canonical metadata digest and proposition bytes are consumed unchanged | Re-run only if the tracker artifact, identity assertion or consumed tracker fields change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passed; Node 24 guard passed; 110 layered runtime modules across 707 TypeScript source files passed | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5A diff | Independent strict review found the missing target predecessor payload binding and mocked producer join. The corrected diff binds all three payloads, separates source and target replay registers, adds the real replay-to-review producer join and the isolated negatives; independent remediation review reports no remaining P0-P3 finding | Reopen for any change to target payload semantics, source/target replay separation, provenance, legacy-route coverage or authority claims |
| Target and authority surfaces | Creation heights, output IDs, target existence, route retirement, checking, static registration, signing, submission, transport, broadcast, funds authority, Gate 5 and readiness remain false or absent | Reopen only in FED-5B/FED-6 under their separate acceptance and authorization criteria |

The existing migration-only FED-5 path has one completed checkpoint and four
ordered FED-5B joins. These artifacts are FED-5M inputs under the launch-mode
split above; their schemas, domains and bytes are unchanged:

1. **FED-5A - cutover generation freeze (complete local, non-activating):**
   produce one pure, versioned
   non-mainnet generation manifest and fail-closed validator that bind the exact
   federated profile, tracker/DUP/reserve predecessors, source/runtime identities,
   imported global replay lineage and retirement of every legacy owner,
   committee and single-R9 funds route. The generation remains non-activating
   and records retirement blockers rather than claiming retirement.
2. **FED-5B1 - target tracker compilation (local producer complete):** bind one observed tracker
   genesis input box ID, the exact application profile and the versioned
   federation profile into a same-process compiler request. Independently
   replay the exact resolved source and compiled proposition before it may feed
   the target settlement-family request. The parameterized request, source
   resolver, pinned-fixture compatibility validator and process-owned JVM
   producer are implemented locally. The producer compiles from the exact
   original request and source under directly pinned executable dependencies,
   returns the complete proposition identity and grants no target or funds
   authority. Selecting an approved real target box and authenticating its
   network identity remain open for materialization and acceptance.
3. **FED-5B2 - dependent settlement-family compilation (complete local):** consume the
   exact original tracker request plus its same-process JVM receipt, derive the
   tracker binding internally, compile DUP and source lock first, then bind
   their computed contract IDs into the reserve source before compiling it.
   The retained fixture compiler's hard-coded batch digest, caller-reconstructed
   tracker objects and fixture contract IDs cannot authorize a target family.
   The process-owned producer and assertion now bind the complete expected
   family request; the frozen family and a distinct family replay exactly, and
   sibling-family substitution rejects. This remains local compiler provenance
   and does not establish target identity, materialization or acceptance.
4. **FED-5B3 - target observation, materialization and setup-check request freeze
   (complete local, non-activating):** B3a provides the bounded dual-origin read-only producer for
   an exact height-1 genesis header, stable tip and three pairwise-distinct
   pure-ERG register-free boxes. Its caller-built profile is deliberately not a
   source-controlled approval and its report grants no materialization or target
   authority. B3b now joins that process-owned observation to fresh exact B1/B2
   compiler receipts and the FED-5A manifest, constructs exact unsigned tracker,
   DUP and reserve issuance transactions from the chain-derived boxes, and binds
   their creation heights plus predicted transaction/output IDs. B3c freezes one
   non-executable ordered three-transaction setup-check request for the same
   target candidate without importing signer, checker or transport capabilities.
   Signed JVM setup acceptance
   and `/transactions/check` no-submit acceptance require explicit approval and
   move to FED-6. Each exact frozen peg-in and peg-out candidate may be signed
   and checked only after the setup outputs are canonically confirmed and under
   its own target-specific approval.
5. **FED-5B4 - retirement join and inactive registration candidate (complete
   local, blocked):** consume the exact process-owned B3c request and FED-5A
   manifest, bind the distinct target and semantic-baseline identities, all
   three predicted singleton lineages, the imported replay packet and the
   exact 53-route V6 requirement set. Every route remains explicitly
   unretired, all blockers are preserved and the candidate is absent from all
   production-source consumers. Exact digest reuse is rejected; semantic
   evidence independence, inventory exhaustiveness and retirement
   authentication are not established. The active registry remains `null`
   until FED-6 supplies approved signed bytes, target receipts, authenticated
   retirement evidence and canonical lineages.

FED-5B1a's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Parameterized tracker request, source resolver, pinned-fixture validator and check-only compiler join | The focused compiler/safety matrix passes 14/14 under Node 24. Isolated negatives cover every application and federation coordinate, copied or relabelled fixture proposition, both signed-Long bounds and every caller authority field | Re-run only if the tracker template, request/source binding, fixture identity, profile/application normalization or check-only consumer changes |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passes; Node 24 guard passes; 110 layered runtime modules across 708 TypeScript source files pass | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5B1a diff | Independent strict review found and closed caller-controlled compiler provenance, the unbounded signed-Long value and missing isolated negatives; remediation review reports no remaining P0-P3 finding | Reopen for any change to compiler provenance, proposition identity, request coordinates, numeric bounds or authority claims |
| Target and authority surfaces | At the FED-5B1a checkpoint, target genesis observation, target network authentication, JVM compilation, node check, target acceptance, signing, submission, broadcast, funds authority and Gate 5 remained false or absent | Reopen only when a later slice changes one of these surfaces |

FED-5B1b's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact same-process FED-5B1a request and source, Java tool source, Java 17 home, 30 directly pinned SigmaState/runtime JARs, compiler classes and complete JVM output | The focused tracker compiler closure passes 13/13. It exactly replays the frozen fixture, compiles one distinct parameterized tracker and binds source, request, proposition length/bytes/SHA-256/Blake2b-256 ID, Java/SigmaState/runtime and compiled-tool identities | Re-run when the request/source seam, Java tool, executable dependency list or hashes, output grammar, proposition identity or receipt binding changes |
| Output, process and host-boundary negatives | Copied requests and caller-created receipts lack process provenance; every metadata and contract field, truncation, extra records, missing LF, CR, NUL, malformed UTF-8, oversized output and parent environment override reject. The report is read through one stable descriptor; the receipt explicitly requires a trusted exclusive host and excludes concurrent same-user tampering | Re-run when process ownership, filesystem handling, environment policy, parser grammar or authority boundaries change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passes; Node 24 guard and the layer-import closure pass for the affected graph | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5B1b diff | Independent strict review identified host/TOCTOU limitations, incomplete independent output negatives and unnecessary whole-bundle coupling. The corrected producer rejects redirected work directories, reads output stably, exposes the host limitation, covers the complete output grammar and pins only the 30 executed JARs | Reopen for any change to runtime provenance, direct dependency pins, filesystem isolation, parser coverage or boundary claims |
| Target and authority surfaces | A real target genesis box, target-network authentication, dependent-family compilation, node check, target acceptance, signing, submission, broadcast, funds authority, Gate 5 and trustless status remain false or absent | Reopen only when FED-5B2 or later introduces one of these producers |

FED-5B2's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact original same-process FED-5B1a request and FED-5B1b receipt, parameterized settlement templates, both family genesis IDs, Java tool source, Java 17 home, 30 directly pinned SigmaState/runtime JARs, compiler classes and complete JVM output | The focused tracker/family closure passes 22/22. It exactly replays the frozen tracker and three-contract family, compiles one distinct tracker-dependent family, derives DUP and source-lock IDs from proposition bytes before reserve compilation, and rejects a genuine sibling family under the wrong expected input | Re-run when the tracker receipt seam, family request/profile, template source, either genesis ID, Java tool/dependencies, dependency order, proposition identity or expected-family assertion changes |
| Output, provenance and authority negatives | Copied tracker request/receipt or family receipt, caller tracker/family identity fields, predecessor or reserve dependency drift, record order/cardinality, missing LF, CR, NUL, malformed UTF-8, oversized output, request/role drift and leading-zero/plus/exponent length aliases reject. Every target, checking, signing, submission, broadcast, funds, Gate 5, trustless and readiness boundary remains false | Re-run when process ownership, parser grammar, source/contract-ID binding or boundary claims change |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passes; the supported Node 24 guard passes; the layer-import closure passes for 110 runtime modules across 710 TypeScript source files | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5B2 diff | Independent strict review found one sibling-family substitution gap and noncanonical decimal-length aliases in both parsers. Exact expected-family derivation, bidirectional sibling rejects and canonical decimal parsing close both findings; remediation review reports no remaining P0-P3 finding | Reopen for any change to expected-family derivation, receipt assertion, output numeric grammar or authority claims |
| Target and authority surfaces | No real target box, target-network authentication, issuance materialization, node check, target acceptance, signing, submission, broadcast, funds authority, Gate 5 or trustless status is established | Reopen only when FED-5B3 or later introduces one of these producers |

FED-5B3a's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Canonical target-profile candidate, module-owned bounded read-only clients, two exact node origins, expected non-mainnet network and height-1 genesis, plus three requested EIP-12/Sigma boxes | The focused loopback matrix passes 7/7 under Node 24. It accepts only one stable matching target snapshot and three pairwise-distinct pure-ERG register-free current UTXOs whose JSON and canonical Sigma bytes recompute the same IDs | Re-run when target-profile fields, source-client ownership, network/genesis/tip parsing, box normalization, Sigma framing or observation provenance changes |
| Isolated profile, source and box negatives | Credentials, paths, queries, fragments, duplicate origins/declared identities/box IDs, caller-cloned provenance, mainnet or network drift, missing or ambiguous genesis, info/header or tip drift, missing/future/token-bearing/registered boxes, JSON/Sigma mismatch and malformed/trailing/oversized Sigma bytes reject. Both source observations finish and release their bounded reconstruction budgets before a failure returns | Re-run when source concurrency, cleanup, target-profile normalization, box eligibility or failure ordering changes |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passes; the supported Node 24 guard passes; the layer-import closure passes for 110 runtime modules across 711 TypeScript source files | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5B3a diff | Independent strict review found caller-injected source provenance and fail-fast peer cleanup. Module-owned origin-bound sources plus `Promise.allSettled` and the delayed-witness lifecycle negative close both P2 findings; remediation review reports no remaining P0-P3 finding | Reopen for any source-factory seam, provenance claim, concurrent observation or cleanup change |
| Target and authority surfaces | The report explicitly authenticates neither source-controlled target-profile approval nor declared node/operator custody, global consensus, tip/UTXO atomicity, materialization, node check, target acceptance, signing, submission, broadcast, activation, funds authority, Gate 5, trustless status or readiness. No real target profile or box is checked in or observed | Reopen only when an approved static target profile or a later B3/FED-6 consumer changes one of these surfaces |

FED-5B3b's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Same-process B3a observation, exact B1 request/JVM receipt, exact B2 family JVM receipt and FED-5A generation manifest | The focused loopback/JVM/WASM matrix passes 7/7. It materializes three deterministic unsigned singleton issuances, binds exact transaction/output lineages and rejects copied or accessor-backed inputs, observed-role substitution, a genuine sibling federation, underfunding and dust change | Re-run when any consumed producer/provenance contract, family semantics, register payload, fee/value rule, transaction materializer or predicted-lineage binding changes |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passes; 110 layered runtime modules across 712 TypeScript source files pass | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5B3b diff | Initial strict review found accessor-backed input TOCTOU, synthetic-baseline/target generation identity conflation, an overbroad manifest-semantics claim and an incidental role-drift negative. Data-property snapshots, a separate target-generation candidate ID, explicitly stable payload projections and the exact family-receipt join close those findings. Fresh remediation review found only the stale 5/5 count corrected in this row and reports no remaining P0-P3 finding | Reopen for any later change to source joins, target-candidate identity, stable payload projection, transaction shape, conservation, lineage or authority claims |
| Target and authority surfaces | The plan explicitly leaves source-controlled target approval, declared custody, target consensus, tip/UTXO atomicity, setup-check request freeze, node acceptance, checking, signing, submission, broadcast, canonical lineage establishment, activation, funds authority, Gate 5, trustless status and readiness false. Only loopback fixture boxes are exercised | Reopen only when B3c, an approved target freeze or FED-6 changes one of these surfaces |

FED-5B3c's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact same-process B3b plan, ordered three-issuance descriptor, transaction-body/materialized digests and predicted lineages | The combined B3b/B3c focused matrix passes 12/12 under Node 24; five B3c cases establish exact order and bindings, deterministic replay, structural-versus-process provenance, isolated identity/lineage/authority drift and hostile object-shape rejection. Independent SHA-256/domain recomputation covers every transaction and the outer request | Re-run when the B3b plan, request schema/domain, order, digest preimage, lineage binding, validator or provenance contract changes |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passes; 110 layered runtime modules across 713 TypeScript source files pass | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5B3c diff | Initial strict review found own `__proto__` loss, Proxy/inherited authority acceptance and self-referential digest testing. Null-prototype data snapshots, explicit Proxy/plain-object checks, independent digest oracles and coordinated mutations close all three P2 findings; fresh remediation review reports no remaining P0-P3 finding | Reopen for any change to data snapshotting, digest/domain framing, structural validation, provenance or authority claims |
| Target and authority surfaces | The request freezes only non-executable unsigned identities. It contains no signer, checker, node origin/transport, signed bytes, submitter or broadcaster and establishes no target approval/acceptance, canonical lineage, confirmation, activation, funds authority, Gate 5, trustless status or readiness | Reopen only when B4 or FED-6 introduces a consumer or changes one of these boundaries |

FED-5B4's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact same-process B3c request, FED-5A manifest, V6 static requirements, imported replay packet and three predicted singleton lineages | The combined B3b/B3c/B4 focused matrix passes 17/17 under Node 24. Five B4 cases establish exact 53-route cardinality and identity, deterministic structural replay without provenance transfer, coordinated retirement/replay/lineage/authority rejection, hostile-object rejection and complete production-source isolation | Re-run when the B3c provenance seam, generation manifest, V6 requirement set, replay projection, predicted lineage, B4 schema/domain or production-source consumer graph changes |
| Evidence and retirement claim boundary | The candidate rejects a retirement digest equal to either inventory digest and rejects every positive route-retirement flag. It explicitly leaves semantic evidence independence, inventory exhaustiveness, evidence authentication and all route retirement false | Re-run when retirement evidence gains an authenticated producer or any consumer attempts to interpret a digest inequality as independent evidence |
| Complete TypeScript graph and physical layer imports | `tsc --noEmit` passes; Node 24.14.0 and 110 layered runtime modules across 715 TypeScript source files pass | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5B4 diff | Independent strict review found one evidence-separation overclaim and one single-file registry test. Removing the positive semantic claim, making the negative boundary exact and scanning every production TypeScript source closes both findings; final remediation review reports no remaining P0-P3 finding | Reopen for any change to evidence semantics, registration identity, runtime-consumer isolation, object snapshotting or authority claims |
| Target and authority surfaces | The candidate is inactive and blocked. The active registry has no consumer, and target approval/acceptance, signed setup acceptance, canonical lineages, replay import, retirement, registration, activation, signing, submission, broadcast, funds authority, Gate 5, trustless status and readiness remain false | Reopen only under an explicitly approved FED-6 target-specific acceptance action |

FED-5G1/G2's stable validation dependency map is:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact same-process tracker/family JVM compiler closure, source genesis-to-activation bytes, Ergo genesis-to-setup bytes, shipped relayer bytes, activation generation, source-attestation key set and complete V6 route requirements | The 8-case greenfield matrix binds all 53 routes, verifies the exact sorted threshold, derives the empty DUP root from the quorum-authenticated non-instantiation statement, propagates the signed Ergo genesis/setup anchor into generation, matches it to the provisioning observation and produces the distinct unsigned three-issuance plan | Re-run when any compiler receipt/request, raw history byte, key set/threshold, route requirement, statement/domain, signed Ergo coordinate, replay derivation or greenfield provisioning join changes |
| Migration provisioning schema, source-binding/check field set and historical digest domains | The unchanged 17-case migration matrix plus independent domain oracles reproduce the exact migration candidate and plan identities for each target-specific observation; greenfield fields do not enter the migration object and both dispatch directions reject the opposite schema | Re-run when shared provisioning construction, migration schema/domain, source bindings, checks, replay semantics or dispatch changes |
| Exact FED-5G1 negative closure | Genesis ID, setup-anchor ID and setup-anchor height splices; source, Ergo and relayer raw-byte drift under the old signatures; compiler/target substitution; unknown, duplicate, insufficient and noncanonical signer sets; copied provenance; migration/greenfield schema crossing and authority-field promotion reject | Re-run when any covered input normalizer, signature verifier, process-provenance boundary, history/observation join or authority cap changes |
| Exact FED-5G2 portable producer-to-consumer join | One canonical explicit request selects 15 pairwise-distinct canonical files, while separate expected target-descriptor and source-key-set pins bind the trust root outside the packet. Two fresh CLI processes independently rerun the pinned tracker/family JVM compilers, rebuild the signed FED-5G1 graph, reparse the three historical EIP-12 genesis boxes and reproduce the same three transaction/output identities as the same-process greenfield provisioner | Re-run when the request/packet schema, pin set, compiler closure, history builders, launch baseline/generation, historical-box parser, unsigned issuance materializer or report binding changes |
| Exact FED-5G2 negative and capability closure | A valid packet under either wrong pin, raw artifact drift under the old packet, a quorum-signed inconsistent box body, unknown authority fields, duplicate JSON keys, noncanonical/traversing/sensitive paths and a canonical artifact symlink reject. Descriptor-backed reads compare stable file identity before, during and after read. Static source checks exclude network, operator-config, database, signer, submitter, broadcaster and registry ports; the CLI emits a canonical path-free report or one stable path-free failure | Re-run only when a covered parser, trust pin, path/file boundary, signature/history join, CLI output, capability import or authority claim changes |
| Complete TypeScript and physical layer imports | `tsc --noEmit` passes; Node 24.14.0 and 111 layered runtime modules across 722 TypeScript sources pass | Re-run when this TypeScript closure or a classified runtime import changes |
| Exact FED-5G2 diff | Independent strict review found one self-authenticating-target P1 and one path-race/sensitive-selection P2. Separate caller pins, exact canonical paths, stable descriptor-backed reads, explicit non-approval, mismatch and symlink negatives close both; independent remediation review reports no remaining P0-P3 finding | Reopen when the trust-root input, file-open protocol, canonical layout, CLI diagnostics or corresponding authority claims change |
| Exact FED-5G1 diff | Independent review found one chain-splice P1, two semantic-field/claim P2 findings and a P3 negative-matrix gap. The corrected generation carries all four signed Ergo coordinates, provisioning requires their exact observed match, greenfield omits migration-only fields, empty replay wording names quorum authority, and the expanded matrix closes the missing negatives. Independent remediation review reports no remaining P0-P3 finding | Reopen for any change to history authority, signed Ergo coordinates, migration compatibility, empty replay semantics, signature/route coverage or authority claims |
| Target and authority surfaces | The baseline and unsigned provisioning are now reproducible from an exact authenticated portable bundle, but the bundle is historical evidence rather than a current target observation. Source and Ergo consensus are not independently authenticated; no concrete target packet has passed; node acceptance, signing, submission, broadcast, canonical setup lineage, registration, activation, funds authority, Gate 5, trustless status and readiness remain false | Reopen only under the authorized target-specific FED-6G intake and no-submit acceptance action |

The isolated legacy compatibility target has its own validation dependency
map. It is not a FED-6G launch precursor and does not extend or reinterpret the
FED-5G V1 history/profile bytes:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Explicit Frontier development chain spec, tracked Solidity build manifest and bridge/token storage layouts, caller-pinned chain ID and canonical application addresses | One deterministic create-only out-of-repository compatibility spec preserves every base numeric lexeme, embeds the exact historical runtime code, initializes bridge owner, bridge-to-token and token-to-bridge bindings, and refuses chain ID `1`, unsafe scope, bootnodes, telemetry and occupied/colliding identities | Re-run when the base spec, build closure, storage layout, address/chain pins, parser/serializer or genesis mutation changes |
| Exact generated spec plus producing primary and connected witness | The Frontier binary accepts the spec and the existing dual-origin observer reproduces chain ID `42`, exact bridge/token runtime lengths and hashes, addresses and ownership bindings from both origins | Re-run when the generated bytes, Frontier binary, node arguments, observed application closure or observer changes |
| Generator capability and authority closure | No network, operator configuration, signer, checker, submitter, broadcaster, runtime database or deployment-state capability enters the generator. Its report explicitly sets `legacyOwnerMintAuthorityPresent=true`, `federatedLaunchEligible=false` and `federatedMintAuthorityEstablished=false` | Re-run when generator imports, CLI inputs/outputs or authority claims change |
| Launch and version boundary | The historical owner-mint code lacks target-proven immutable runtime quarantine, while frozen V1 requires `ergo-testnet` plus `public-testnet`; this target cannot enter either V1 or FED-6G replay | Reopen only for compatibility observation. Build a separately versioned authority-safe isolated-devnet genesis/history family while preserving all V1 bytes and semantics |

The authority-safe FED-6G1b generator has a separate validation dependency map.
It composes the application bytes from the compatibility generator but never
inherits that generator's schema, report status or launch disposition:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact Frontier development spec bytes; separately supplied base-spec digest, Frontier commit/patch, runtime-code, removed-Sudo, chain and application-address pins; tracked Solidity build/storage closure | One deterministic create-only authority-safe candidate preserves all numeric lexemes and exact application bindings, removes the one Sudo key and writes only `legacyMintQuarantineAddress` under the typed pallet genesis field; validation regenerates the complete legacy embedding byte-for-byte from the pinned base | Re-run when any base bytes, source/runtime/target pin, application artifact, parser/serializer or genesis transform changes |
| Schema and authority negatives | Retained bridge profile, missing/malformed Sudo, source/runtime pin drift, authority-safe-output reuse, chain ID `1`, occupied addresses, unsafe path, overwrite and capability widening reject | Re-run when either generator schema, report, shared create-only I/O or CLI surface changes |
| Candidate report | `authoritySafeTargetIdentityObserved=false`, `legacyOwnerMintRuntimeRejectionObserved=false`, `independentSourceOriginsEstablished=false`, `federatedLaunchEligible=false` and every transaction, activation, Gate 5, trustless and readiness boundary remain false | Replace only with the separate FED-6G1c live report after exact binary acceptance and two-origin observation; never infer it from generation |
| Live boundary | The generator does not prove that the pinned runtime was built from the pinned source, accepted by Frontier, observed by two nodes, or free of a new future Root producer | Reopen in FED-6G1c with exact source-locked build, runtime hash, chain-spec acceptance, source review and primary/witness observation before collecting history |

FED-6G1c exact-target acceptance has its own validation dependency map. It
promotes only the accepted target identity and permission to begin target-owned
history intake:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact patched Frontier checkout, source lock, tracked Solidity build closure, repository-pinned Cargo 1.82.0, Rustc 1.82.0 and Git 2.54.0, deterministic Wasm path remapping, plus a fresh guarded Cargo target | Source and toolchain are revalidated after build/tests and after observation. The fresh binary must reproduce the exact 3,941,816-byte base spec and runtime before target launch. Its 96,144,384-byte in-run identity `f01e921a547028893adabe407642c78e835009b00f6b779fe45376ef1535db39` is frozen inside the run, launched for both nodes and rechecked after observation; no caller-supplied output digest chooses the executable | Re-run when the source lock, tracked application closure, toolchain lock, build environment, Wasm remapping or acceptance implementation changes. The report explicitly denies native-executable reproducibility, complete build-tool, dependency-cache and independent-build attestation |
| Exact generated authority-safe spec and exact built Frontier binary | Frontier accepts and emits a spec with the same recursively key-order-independent JSON semantics while every numeric lexeme remains exact. Only Frontier's single timestamped `Building chain spec` status line is allowed on stderr; any other stderr or field mutation rejects | Re-run when the generator/parser, numeric preservation, spec pin, binary, allowed status syntax or chain-spec command changes |
| Two fixed source tests plus one producing primary and connected witness on fresh archive-mode state | The Rust tests establish direct pre-dispatch/block rejection and forwarded/internal block rejection. The current Windows-only process owner observes only the two exact reciprocal P2P identities immediately before and after the callback; it does not claim continuous peer-set monitoring. The nodes separately reproduce exact genesis, runtime, application code/storage, typed quarantine, absent Sudo/profile state and direct dry-run rejection. Archive mode is required because the live report compares application state at genesis and tip | Re-run when either test, runtime policy, node launch or P2P mode, platform/process inspection, RPC observer, genesis/application pin, quarantine/profile state or owner-mint probe changes |
| Path, process and authority negatives | Source/index or post-build drift, toolchain-lock drift, freshly built base-spec/runtime mismatch, Rust-flag paths containing ASCII or Unicode whitespace, control characters or equals signs, generated-spec mutation, unexpected stderr, observation/application mismatch, built-binary drift, non-loopback origins/listeners, reused ports, pre-owned listeners, PID/listener mismatch, reciprocal-peer mismatch, unexpected peers, in-action chain-spec mutation, process exit and cleanup failure reject. Concurrent action and cleanup failures are both retained. A build from the unpatched checkout cannot be paired with the patched authority-safe genesis. The command launches both nodes from the exact in-run binary, and the path-free report sets only `exactAuthoritySafeTargetIdentityObserved=true` and `targetHistoryIntakeEligible=true`; history, attestation, source finality, launch, mint, settlement, signing, submission, broadcast, activation, Gate 5, trustless status and readiness remain false | Reopen for any producer/consumer, path/process, report schema, capability surface or authority-claim change |
| Exact isolated acceptance run | Source checkout digest `dab8fb0b9664b3a23da2020073728b48215efedd42bc51ee69f5525e91b4bbb2`, base spec SHA-256 `6f325a3818a3efb90d886e2acdae4197ecbcf4137f2102fcbfaa527c04561d3a`, generated spec SHA-256 `2d2ecdfd1802e3f6db892fcfb1977140c1e7fcc46b328f094819c762dacf0d02`, native genesis `0xdba2167d6bc8f7ee2c1bd46f13cc3cea71dcba587742997ce50578eea203b83f`, two-node observation digest `fb18c9856d58f64d73105767390dcdcf8f87c345cc1d9f08e2789d7d64c13bd5`, process binding digest `a3c749b315ba6c5713eb00d007dc3f0c977e1eb50d9bccbf22d059aa741b49fc` and acceptance digest `72bc5273382cc45a94085ea6b7ac4726704a7a96d429d0a941eeb8ecd89a63ed` join without submission or broadcast; all loopback listeners are absent after completion | Consume only from the process-owned FED-6G1dA acceptance-to-history join; a copied digest or deserialized report has no provenance and cannot authorize history intake |

FED-6G1dA process-owned history collection has a separate validation dependency
map. It is deliberately not the frozen FED-5G V1 target/launch family:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| One fresh G1c acceptance and its exact source-built primary/witness process lifetime | The history action receives only allowlisted read-only block, header, storage and code requests. It receives no raw endpoint URL and cannot request transaction submission. The accepted source, binary, generated spec, process binding, genesis, tip, runtime and application identities enter one digest-bound receipt | Re-run when acceptance/action types, process ownership, allowed RPC methods, target identities or history receipt schema changes |
| Two archive-mode owned origins from genesis through the accepted observation tip | Both origins return the same complete native/execution/runtime/application row at every height; both parent chains are contiguous; archive genesis state exists; the accepted tip is an ancestor of each RPC-reported finalized head through a bounded explicit parent path; a second complete read rejects any drift | Re-run when RPC producers, interval bounds, finality-path semantics, row fields, runtime/application bindings or stability policy changes |
| Canonical acceptance and history bytes | One acceptance report, reported-finalized-block manifest, runtime-history manifest and application-history manifest are individually digest-bound by the receipt. The CLI requires an absent destination outside the whole Git worktree, builds under a fresh sibling directory, writes the receipt last and publishes the complete directory by one rename | Re-run when canonicalization, artifact fields, output boundary, create-only behavior, write ordering or publication mechanics change |
| Focused implementation closure | Acceptance, history and CLI positives plus isolated negatives cover provenance, method restriction, source disagreement, parent/finality fork, missing archive state, genesis/tip/code/stability drift, origin reuse, interval bound, artifact mutation, output boundary, mode selection and incomplete publication. TypeScript, supported Node and architecture checks remain required at checkpoint | Re-run only when their transitive source/test/config inputs change |
| Authority boundary | The receipt sets only `targetHistoryCollected=true`. Target authentication, independent source administration, source consensus/finality authentication, Ergo/relayer history, descriptor/launch statement, replay, setup identities, check/sign/submit/broadcast, activation, funds authority, Gate 5, trustless status and readiness remain false | Promote only through separately versioned G1dB consumers; never infer authority from two matching owned RPC origins, a local receipt or persisted bytes |
| Exact live G1dA capture | Complete against the fresh accepted G1c source/spec/toolchain closure. The three-row interval spans genesis through accepted height `2`, generated spec `2d2ecdfd1802e3f6db892fcfb1977140c1e7fcc46b328f094819c762dacf0d02`, genesis `0xdba2167d6bc8f7ee2c1bd46f13cc3cea71dcba587742997ce50578eea203b83f`, binary `c92c070f868d5cc1112361322c6e1ebf80b0396c03c39d2760f3dbca1525b511`, process binding `8383ca57f9f1d93570f2b58157a20aa35f7ed11a60aa18f35eeaf236bdbecf80`, acceptance `fec51d1dc132fc99dfc7373b7dbde8110810ec78242bc7070b29c5b38ec1167b` and history `de7ed985260f146ffb096cc39cbc055864965915bd6dc18195d7dec7feb86ae7`. Bundle file hashes are acceptance `e39c1f0fa5660cff73f20189003e30bb9be16ce9a05e175ff673ee0687122d56`, finalized blocks `920f85fddad0935ab26a1e3b083d223a0832fa8cbb4e7ffef09bda7324ce1ce2`, runtime history `0527258745226b448817140d000f05a68df5b1252d38ab999f25230b7c4c3723`, application history `8cbbdc6748e3c775a02b7363a989f1d851fadef7fa43c8e9b7654c9e75730f04` and receipt `729193cf479f8bc80411ae138f1ddf8ba6a61206f5fe09ea2e75a72842e74835`. The acceptance report records successful bounded listener release; the bundle itself makes no broader process-cleanup attestation | Freeze these exact local bytes as G1dB input. Re-run only if the G1c source/spec/toolchain closure, G1dA implementation or captured target identity changes; passage of time alone does not upgrade or invalidate the authority boundary |

FED-6G1dB isolated generation and direct provisioning have their own validation
dependency map and do not reinterpret or feed the frozen FED-5G V1 generation:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Exact process-owned isolated launch baseline, tracker compiler request/receipt, dependent family templates/receipt, five-file G1dA bundle and independent trust pins | One separately versioned producer reconstructs the target descriptor through the same compiler/history assertions and requires byte-for-byte canonical equality with the quorum-signed launch target before deriving any payload | Re-run when the isolated launch schema, compiler assertions, G1dA parser, trust pins, target descriptor or generation input/provenance rules change |
| Exact target lineages, disclosed federation profile and internally derived empty tracker/deposit/replay digests | Distinct isolated domains bind the tracker, DUP and reserve ErgoTrees, singleton IDs, values and dense genesis registers. All 53 predecessor routes remain quorum-attested as non-instantiated; caller-supplied non-instantiation claims and frozen greenfield generation authority are rejected | Re-run when any payload domain, ErgoTree/token lineage, register ABI, AVL policy/key length, replay derivation, route set or authority wording changes |
| Exact historical input bodies and unsigned identities | The direct consumer requires a same-process generation, reparses three exact canonical EIP-12 boxes, verifies each content-derived box ID against the signed target, requires pairwise-distinct pure-ERG/register-free inputs no newer than the signed setup anchor, derives the creation height from that anchor and materializes all three complete transactions plus their transaction/body/materialized/output identity digests under isolated domains | Re-run when EIP-12 normalization, issuance materialization, miner-fee policy, isolated payloads, setup-anchor semantics, transaction identity domains or input/provenance rules change |
| Generation authority and lifecycle boundary | The manifest and provisioning plan authenticate only the disclosed federated launch baseline, payload construction and deterministic unsigned predictions. Current UTXO presence, canonical lineages, node check, signing, submission, broadcast, confirmation, activation, funds authority, Gate 5, trustless status and readiness remain false | Promote only through the separate config-free fresh-process replay that parses the exact G1dA bundle and independently reproduces all three unsigned transaction and output identities |
| Focused implementation closure | The isolated launch/generation/provisioning matrix, supported Node 24 guard, TypeScript no-emit check and layer-import check cover distinct domains, independent digest oracles, exact payload roles/lineages/register sets, canonical input-body binding, all three derived identities, copied provenance, accessor substitution, compiler-closure drift and V1 schema crossing | Re-run only when these producers, their direct test, or one of their transitive compiler/history/ABI/materialization imports changes |
| Independent strict review | The first pass found missing propagation of two source-authority nonclaims, incomplete register-value assertions and an untested generation-level V1 crossing. The corrected manifest carries both false boundaries; the matrix asserts all three empty AVL roots and every encoded register, rejects serialized provenance transfer and rejects a genuine frozen greenfield baseline. Remediation review reports no remaining P0-P3 finding | Reopen when authority caps, payload/register semantics, process provenance, schema separation or the generation consumer boundary changes |
| Direct provisioning independent review | The first pass found a P1 time-of-check/time-of-use gap because the async builder reread the caller-owned generation after authenticating it. The corrected builder captures exact own data-property descriptor values once before any await and exclusively uses those locals. Deterministic mutable replacement and Proxy `get` substitution tests now prove the authenticated generation cannot be exchanged during materialization. Remediation review reports no remaining P0-P3 finding | Reopen when root input capture, async normalization, process provenance, transaction materialization or provisioning metadata binding changes |
| Exact portable byte closure | One explicit 17-artifact map supplies four canonical ErgoScript templates, five G1dA artifacts, three Ergo-history manifests, four relayer-closure artifacts and one signed attestation packet. Before either compiler runs, the core recomputes the complete serialized target-descriptor digest, reconstructs the federation profile and both key-set digests from the declared keys and thresholds, and matches the two separately supplied target and source-key-set pins. Every non-shared byte view is copied before the first compiler await | Re-run when artifact membership, canonical JSON/schema parsing, snapshot timing, shared-memory policy, trust-pin semantics, federation normalization or target reconstruction changes |
| In-memory replay result | The core reruns the tracker and dependent-family compiler calls, G1dA parser, Ergo/relayer history builders, exact statement comparison, threshold verification, generation provenance and all three unsigned provisioning transactions. The report carries no paths and explicitly denies file selection, fresh-process proof, current UTXO observation, node check, signing, submission, broadcast, setup lineage, funds authority, Gate 5, trustless status and readiness | Promote only through the separate safe-loader and clean child-process wrapper; never relabel this same-process orchestration test as fresh-process evidence |
| Portable-core negatives | Either independent pin mismatch, a target body with copied digest fields, shared backing memory, accessor substitution or frozen-greenfield attestation schema crossing rejects before compilation. Signed raw source-history drift rejects. All 17 caller-owned byte arrays plus root artifact/pin replacement after invocation cannot alter the captured replay. Existing generation/provisioning negatives continue to own copied provenance, inconsistent EIP-12 bodies, generation schema crossing and transaction-identity drift | Re-run only when the replay core, isolated producers or their transitive compiler/history/materialization closure changes |
| Safe canonical file boundary | One strict canonical-LF request fixes all 17 relative artifact names under one selected real directory. The loader rejects unknown request/pin fields, duplicate JSON keys, explicit UNC/device namespaces, traversal, absolute/sensitive/alternate paths, symbolic links, junctions, every multi-link file, unavailable stable device/inode identities, unexpected file types, files over 16 MiB and any identity, size, nanosecond modification-time or change-time drift from resolution through a fixed-size read plus EOF probe. It exposes no request path, configuration, database, signer, submitter or broadcaster capability to the replay core and imports no explicit network client. Path syntax cannot prove that a Windows drive letter is not operator-mapped, so filesystem locality remains an operational precondition rather than replay authority | Re-run when the request schema, canonical paths, path containment, namespace/link policy, file identity, size/stability bound, trust-pin input or loader-to-core join changes |
| Safe-loader independent strict review | The first pass found explicit UNC/SMB reachability, incomplete `.env.*` filtering, external hard-link acceptance, an unbounded read after the size check and zero device/inode ambiguity. Remediation rejects those surfaces, uses exact bigint identities and timestamps, and performs a fixed-size read with EOF probe. Follow-up review required executable TOCTOU and path-free parser-error evidence; deterministic faults now cover partial read, premature EOF, growth, pre-open drift, post-open drift, post-read replacement and unavailable identity, while attacker-controlled strict-JSON details are masked. The fault matrix exposed and closed a missing descriptor-to-current-path metadata comparison. Final review reports no remaining P0-P3 finding. Hostile live-filesystem races remain modeled, and mapped-drive locality remains an explicit operational precondition | Reopen when filesystem calls, path/error handling, identity/metadata joins, fault injection, capability wording or the loader consumer changes |
| Clean child-process replay | One six-argument CLI accepts only an explicit request and the two independent digest pins, composes the safe loader with the replay core and emits canonical JSON or one stable failure line. Two processes receive only an allowlisted OS/runtime environment and execute under the existing bounded Windows Job Object/process-tree runner, rerun both real pinned JVM compilers and reproduce byte-identical path-free reports plus the exact three unsigned provisioning identities. Missing, extra, reordered, duplicated and unknown arguments reject through the same runner. The report still declines to self-assert fresh-process provenance, current UTXO state, target check, setup lineage, activation or funds authority; those conclusions belong to the external test boundary, not copied report bytes | Re-run when CLI arguments/output, child environment/process-tree boundary, loader/core composition, compiler invocation, report schema or provisioning identity changes. Exact persisted-bundle execution remains open |
| Child-process independent strict review | The first pass found that a raw parent timeout did not guarantee JVM-descendant cleanup, the plan retained one obsolete loader/CLI next action and malformed argument grammars lacked executable negatives. Remediation routes positive, wrong-pin and all five malformed-argument variants through the reviewed bounded Job Object runner, advances the plan to bundle assembly and pins the generic failure output. Final review reports no remaining P0-P3 finding. A hard host crash around the reused runner is not newly fault-injected by this slice | Reopen when process execution/termination, CLI grammar/error output, child environment, plan boundary or test composition changes |
| Portable-core independent strict review | The first pass found a P1 common-mode test gap because both compiler outputs were synthetic, plus P2 pre-compiler trust-pin wording, transitive capability overclaims and incomplete mutation coverage. The corrected fixture compiles and validates canonical sources with both real pinned JVM compilers, and the positive replay invokes those compilers again through the core. The core authenticates descriptor/federation bytes before compilation, narrows capability claims, rejects shared memory and covers every artifact/root replacement behind the asynchronous barrier. Remediation review reports no remaining P0-P3 finding | Reopen when compiler invocation/validation, target preflight, capability wording, snapshot policy, portable schemas or the direct consumer changes. Clean child-process and exact real-bundle execution remain the next separate boundaries |

The isolated local-devnet FED-6 prerequisite has a separate validation
dependency map and is deliberately not an extension of the FED-5B registration
candidate:

| Input closure | Deciding result | Reuse boundary |
|---|---|---|
| Two credential-free loopback patched-devnet origins, exact height-1 genesis header, three pairwise-distinct current pure-ERG reward boxes, target-specific compiler requests and pinned JVM receipts | One source-owned command materializes three empty-history issuance candidates, independently derives each unsigned ID, root-signs the complete batch in memory and receives the same ID from `/transactions/check` for each exact signed candidate | Re-run when node source/configuration, genesis or box identity, target profile, compiler request/receipt, transaction materializer, signer derivation, signed-object serialization or checker semantics changes |
| Opaque signer/checker capability and exact report fields | The signed transaction objects remain in a process-local private registry; the report binds only public signer identity, checker identity, unsigned/signed/node transaction IDs, canonical signed-object JSON SHA-256 and canonicalized response digest. The synthetic mnemonic is removed from the process environment before any JVM compiler is spawned | Re-run when secret custody, process boundaries, opaque-handle provenance, digest canonicalization, checker origin or report schema changes |
| Pre-sign and post-check dual-origin observation | All three exact genesis inputs are unspent before signing and remain unspent after all three node checks; the post-check tip cannot regress | Re-run when observation sources, retry bounds, box equality, tip policy or node-check endpoint behavior changes |
| Complete affected TypeScript and architecture closure | Focused signer/conformance negatives, `tsc --noEmit`, the supported Node guard and layer-import closure pass under pinned Node 24 | Re-run when any listed source/test, package command, TypeScript dependency or classified import changes |
| Exact conformance diff | Independent strict review initially found injectable signer/checker evidence, missing signed-object binding, raw signed-object callback exposure and unchecked receipt fields. Source-owned capabilities, opaque signed handles, canonical signed-object digests, normalized receipt identities and post-check observation close those findings | Reopen for any change to dependency injection, signer/checker capability provenance, signed material handling, receipt validation or authority claims |
| Authority surfaces | The result is isolated-loopback compatibility evidence only. It is not the approved FED-5B target packet, cannot enter registration, establishes no singleton lineage, retirement, target consensus, activation, funds authority, Gate 5, trustless status or readiness, and authorizes no submission or broadcast | Reopen only under a separately approved target-specific FED-6 action |

No signing, submission, transport or broadcast belongs to FED-5. A local
fixture compiler result, an unsigned transaction, a journal row or a target
request cannot establish activation, funds authority or Gate 5 closure.

FED-5 must not add signer, submitter, transport, broadcast, live-funds,
frozen-V6 or EIP-0045 changes. Those capabilities and the trustless upgrade
remain separate later milestones.

## WP-06-STARK - Ergo-Verifiable Finality Admission And V6 Cutover Upgrade

The historical WP-06 milestones below remain exact evidence for the common
application, proof, settlement, and cutover foundations and for the frozen
STARK upgrade. They do not make WP-06-FED depend on EIP-0045, and they must not be
relabelled as federated acceptance.

**Security invariant:** SPVTracker cannot admit an invented root, and an old Ergo
anchor cannot substitute for proof that the referenced sidechain block is final.

**Deliverable:** authenticated extension membership and proof-driven V4 tracker
admission tied to the WP-05 sidechain finality rule. Bind the tracker, source
lock, pooled reserve, payout, and DUP transition to the same exact application
profile, root, burn set, and replay lineage, then wire that path into the service
and daemon through deterministic non-broadcast transaction checking. V1/V2
remain compatibility and migration evidence; they are not the target funds
authority. The end-state target is a liveness-only committee role. That is not
the current property while no activated Ergo runtime verifies the exact bound
GRANDPA/STARK semantics.

STARK compatibility is preserved in public inputs and commitment formats.
EIP-0045 specifically is not mandatory if an equivalent reviewed
Ergo-verifiable finality consumer is activated, but some such Ergo runtime or
direct-GRANDPA verification capability is an external dependency for removing
R9 as finality authority and completing the trustless portion of this package.

Reusable-layer extraction is not a dependency for WP-06 or Gate 5. During this
package, introduce a modular seam only when the Gate 5 implementation already
requires it, the change preserves behavior and all frozen bytes, and it does
not delay the proof-to-release critical path. Full semantic extraction remains
WP-08A.

**V4 pooled-reserve burn proof-core milestone:** the V4 statement is now
consumed by a separate proof path rather than reinterpreted through the V2
application envelope. One bounded trie proof must authenticate the exact bridge
commitment, V4 runtime profile, sticky enforcement byte, independent
commitment-producing `BridgeAddress`, and native runtime `:code` under the exact
state root carried by the GRANDPA-finalized target header. The runtime-code
length and SHA-256, profile bytes and ID, address equality, checkpoint fields,
trust anchor, authority transitions, finality horizon and public state root are
checked before the guest commits the exact 1,139-byte statement. V1 and V2
witness families remain distinct and fail closed at the V4 decoder.

The corrected guest now has a reproducibly frozen V4 program identity and a
profile-level host that binds that program, the reusable verifier-predicate
profile, and an explicit consumer identity. The exact preactivation Ergo
consumer `SPVTrackerPooledReserveBurnV4.es` is separately versioned rather than
silently reinterpreting the transitional V2 tracker. Under SigmaState commit
`f78deadd668f801e7fae3bc884283f79c6f484fa`, it compiles to 2,942 proposition
bytes, proposition SHA-256
`f2c4274cb56cd6da77f7d79c0b327ca3e0e0b1f8c13ada1996f1d5021af98a2d`,
and contract ID
`dff42d1bb808fc30e87011c493b5eef0bb257acc9c35940b112b14bf455e92cd`.
The TypeScript builder validates the complete frozen contract-identity receipt
and reproduces its self-bound 1,139-byte statement, exact
four-variable ContextExtension, synthetic `0x0401` membership path, 370-byte
tracker value, append-only AVL successor, serialized predecessor box, and
proofless transaction. The pinned JVM matrix requires the transaction input to
match that exact predecessor, parses and evaluates the serialized transaction, accepts the
complete conjunction, and covers rejection across proof
transport, payload, binding prefix, self-contract ID, control bytes, binding
digest, payload family, extension proof, selected header, singleton, immutable
registers, AVL policy, successor shape, missing or mistyped extension variables,
transaction-carried ContextExtension, and unavailable verifier capability. One
guarded command regenerates both fixtures, independently recompiles the contract,
and replays the matrix.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pooled-reserve-burn-tracker-v4-acceptance.ps1 -SigmaStateCheckout <sigmastate-checkout> -BridgeRoot <bridge-root> -JavaHome <jdk-17-home> -SbtLaunchJar <sbt-launch.jar> -NodeExecutable <node-22-to-24>
```

The standalone consumer now also has a real non-dev succinct V4 receipt under
the frozen RISC Zero runtime. The host verifies the exact method, reusable
profile, 1,139-byte journal, standalone contract ID, succinct seal grammar and
canonical four-chunk transport, then rejects isolated image, journal, contract
and seal mutations before a create-last transient export. The 2026-08-02
reference run completed in 1,075.93 seconds and produced the canonical
`65,535 / 65,535 / 65,535 / 26,063` chunk partition. This closes the local
proof-engine path for the standalone consumer only.

The complete V4 instance derives integrated tracker ID
`bfba2ed2dabca6a843b3acf996029cb3ed5578eda512043cb5e1a7217624e594` and
binds it into the dependent contracts and complete settlement transaction. A
separate fresh non-dev receipt now binds that exact integrated consumer under
the same frozen program, reusable profile and terminal control. Its 2026-08-02
run completed in 1,401.13 seconds, produced statement Blake2b-256
`dea00c2ed8f7ac669d86999293de1d088a83ef0725897977cde5b94d3275bee0`
and reproduced the canonical `65,535 / 65,535 / 65,535 / 26,063` chunk
partition. The host rejected isolated image, journal, expected consumer and
seal mutations before writing the create-last manifest. The earlier standalone
receipt remains bound to its distinct contract ID and cannot be reused or
relabelled as integrated evidence.

The separately versioned V5 Sudo-absence family now has a complete local
settlement predicate fixture. A process-owned adapter accepts only the exact
pinned compiler request and receipt, preserves the V4 source runtime profile,
and exposes the distinct V5 target settlement lineage. From exact compiler
identities, the planner constructs one deterministic 8,632-byte proofless
transaction with reserve, DUP and external-fee spent inputs, the integrated
tracker as its sole data input, and reserve successor, DUP successor, payout
and miner-fee outputs. The reserve value and liability decrease by the same
proved burn amount; the external input funds the fee; and the burn ID is
inserted once under the same tracker root, application binding and target
settlement profile. Focused TypeScript tests reject isolated identity, burn,
Merkle, replay, reserve, fee, height and packet mutations. The pinned JVM
accepts the complete positive conjunction and rejects missing or mistyped
required ContextExtension variables. Because ErgoScript cannot enumerate
extension keys, the matrix also demonstrates that extra variables remain
outside predicate semantics and are excluded by the exact producer-side
serialization guard instead.

The original V5 compiler fixture bound an all-`dd` source-runtime digest and
8,192-byte size without retaining bytes that could satisfy that identity. The
exact V5 state verifier therefore made the compiler-derived consumer
unprovable. The corrected fixture hashes 4,096 actual `0x61` bytes, then
rederives tracker `c9f54f6e...cff08`, DUP `dea71586...a778c`, reserve
`00e45fb1...abac6`, compiler receipt `b56eb130...6db1` and deterministic
transaction `54055d4f...a07a` from that exact identity. Those bytes are a
synthetic conformance fixture, not observed runtime provenance.

The exact integrated consumer now has one real local non-dev succinct receipt.
The 2026-08-02 pinned-container run completed in 1,029.19 seconds, encoded a
7,125-byte private witness, used 11,534,336 total cycles and emitted a
1,140-byte statement with Blake2b-256 `c7ea7fd0...e1e3`. The raw 222,668-byte
seal retains the canonical `65,535 / 65,535 / 65,535 / 26,063` partition.
The portable host accepted the exact program, profile, statement, consumer and
seal, then rejected isolated image, journal, consumer, coordinated-journal and
seal mutations before create-last transient export.

The V5 predecessor boxes and runtime payload remain synthetic constructions.
They do not establish tracker admission, reserve lineage, source-runtime
deployment, sidechain finality, activated verifier, target-node acceptance or
funds authority. The local V5 proof-engine milestone is complete; deployment
and replay-lineage evidence are now the critical boundary.

No activated node has accepted any of these exact transactions, and no daemon
or chain-resident complete tracker/DUP/reserve/source-lock instance uses these
consumers as funds authority. Proof-system ID `2` remains reserved and
fail-closed outside these isolated preactivation paths. The proved snapshots
remain relative to supplied trust anchors and cannot establish legitimate
activation provenance, independent source operation, permanent Root/Sudo
containment, future runtime immutability, canonical Ergo consensus,
target-node acceptance, or funds authority. Cutover still requires
authenticated activation plus retirement of every legacy mint, payout, and
replay lineage.

**WP-06A implemented source milestone:** the production extension-membership
module now reproduces the Scorex leaf/tree/proof rules with canonical bounded
proofs. `SPVTrackerAuthenticated.es` requires all four admission variables,
recomputes the frozen checkpoint commitment, authenticates exact `0x0401`
membership against `CONTEXT.headers`, derives the V2 key itself, and inserts a
264-byte value containing the event root, checkpoint commitment, Ergo header
ID, anchor height, and finality proof identity. Its AVL schema is append-only.
The pure builder produces the
four context variables and both register states without signing or broadcast.
Rust/WASM now has an explicit fixed-width V2 tracker API, and the contract
compiles under the pinned local Sigma compiler.

The pre-WP-06S `npm run trustless:spv-tracker-vm` matrix passed against a
genuinely mined header from an isolated patched devnet. It rebuilt the ordered Scorex extension
proof from the block's complete extension, checks the result against the header
root, executes the production tracker contract with the guarded four-Var shape,
and exercises five fail-closed negative cases. The tracker box and signing key
are ephemeral in-memory fixtures. This proves sigma-rust VM reduction against a
real header; it was not a JVM `/transactions/check` result or an on-chain spend.
The current WP-06S tree now passes both the deterministic offline matrix and a
fresh replay against a genuinely mined isolated-devnet header containing the
exact 64-byte `0x0401` checkpoint field. Both runs derive the tree through the
three-pass pinned JVM compiler. The positive admission consumes the 264-byte
tracker value and bounded four-Var extension; thirteen bounded fail-closed
mutations reject committee-only and unrelated signatures, the embedded
checkpoint, each of the six finality-identity fields, header index, extension
proof, required commitment, and successor AVL drift. Coupled mutations establish
fail-closed rejection rather than independent fault localization for every
binding. The exact positive signed transaction now also passes pinned-JVM input
proof, serialization, and bytes-to-sign conformance. This remains in-memory VM
acceptance, not node stateful acceptance or an on-chain spend.

**WP-06B implemented local-VM milestone:**
`MainChainAggregateUnlockAuthenticated.es` consumes the V2 tracker as a
read-only data input and binds its 264-byte value to the versioned burn leaf,
recipient, amount, ERG asset lane, anchor depth, and exact DUP transition.
`DoubleUnlockPreventionAuthenticated.es` advances the complete replay
`AvlTree`, is hash-bound to that exact settlement-vault script, and does not
require a separate payout committee signature. The pure builder assembles the
two spent inputs, one tracker data input, DUP successor, payout, optional vault
successor, and fee without signing or broadcast.

The pre-WP-06S `npm run trustless:authenticated-settlement-vm -- --node
<loopback-devnet>` matrix compiled the authenticated V2 candidate contracts and
evaluated the complete transaction under sigma-rust. Its positive path passed
with a non-empty burn proof, V2 tracker proof, and DUP lookup/insert proofs.
Sixteen coherent negative cases rejected
wrong payout fields, tracker root/NFT, duplicate or wrong DUP key, malformed
proofs, positional drift, insufficient Ergo anchor depth, wrong contract
binding, sidechain identity, block identity, asset, and same-proposition
authority reuse. The same positive path and sixteen negatives now pass under
sigma-rust on the current linked trees produced from the pinned JVM compiler,
using both a deterministic context and a fresh node-compatible `H+1` / `H..H-9`
context from the isolated patched devnet. The tracker replay
separately authenticates the exact `0x0401` field in that mined context. The
exact signed positive transactions also pass pinned-JVM proof, serialization,
and bytes-to-sign conformance. Boxes and keys remain ephemeral. This is
current-tree in-memory VM acceptance, but it is not node stateful acceptance,
deployment, or proof of sidechain finality on Ergo.

**WP-06C implemented service-preparation milestone:**
`StateTracker` now keeps authenticated 264-byte tracker entries in a table that
is separate from legacy 36-byte history. Each row stores and validates the
sidechain ID, derived V2 key, execution block, commitment fields, and anchor
identity. Same-height entries are isolated per sidechain; conflicting rows fail
closed rather than being silently ignored.

`AggregateSettlementService.prepareAuthenticatedSettlementUnsignedTx()` uses
that reconstructed history, requires a fresh sidechain-burn verifier result,
matches the selected tracker and DUP singleton state, enforces the Ergo anchor
depth, and prepares the exact two-input transaction. Its context-extension
report keeps signing and broadcast disabled. No submit method or daemon route
is enabled by this milestone.

The candidate coordinator derives a deterministic binding over the canonical
burn coordinates, V2 tracker entry, anchor identity, selected tracker/DUP/vault
boxes, observed tips, exact unsigned transaction, and process-verified native
checkpoint admission identity. `StateTracker` persists
that binding with `prepared -> check_passed -> invalidated` CAS transitions,
allows only one active candidate for the shared DUP/vault inputs, and atomically
invalidates it when the burn becomes `burn_reverted`. Check-result provenance is
retained after invalidation.

The read-only Frontier proof source requests all receipts for the target block,
checks the canonical block before and after collection, enforces exact receipt
block identity and frozen transaction/log ordering, reconstructs the event root,
and derives the target inclusion path. The daemon gives this V2 route priority
when the authenticated deployments and exact tracker entry exist. It prepares
and journals one unsigned candidate and exposes no authenticated sign, submit,
or broadcast route.

The daemon now loads one strict public native-checkpoint profile, resolves the
native Substrate block at the persisted burn height, runs the pinned read-only
collector and native verifier, and binds that process-provenance-branded result
to the Frontier proof and selected tracker entry before transaction preparation.
The binding covers sidechain ID, native height/hash, execution hash, event root,
burn count, target leaf fields, and tracker checkpoint commitment. Missing or
invalid configuration, a cloned checkpoint object, or any cross-layer mismatch
leaves the burn retryable without creating a candidate. The full
producer-consumer and negative-fixture matrix is recorded in
`docs/native-checkpoint-settlement-admission-v1.md`.

The peg-out table now persists each indexed event by normalized transaction
hash plus global log index and, when the sidechain identity is known, by the
derived V1 `burnId`. The migration preserves older hash-only rows without
inventing missing event coordinates. Such a row blocks indexed siblings until
an explicit detected-row repair assigns its reviewed canonical log index;
already progressed legacy rows require manual reconciliation. Hash-only
selection throws when multiple events share a transaction, while V2 proof
collection, candidate binding, restart reconciliation, and reorg invalidation
use the exact `burnId`. The transitional aggregate journal still records legacy
transaction-hash DUP keys. Both the daemon and settlement service require
exactly one persisted event per transaction hash before journaling or invoking
the signer, so this path fails closed rather than submitting and then discovering
an ambiguous row. Event insertion and legacy journal creation are serialized by
SQLite immediate transactions, and a burn cannot appear in two active aggregate
journals with different expected transaction IDs.

The daemon also verifies the target receipt against the canonical sidechain
block and configured confirmation depth. A confirmed disappearance, block
replacement, or event-coordinate mismatch is terminal; RPC uncertainty and
insufficient confirmations remain retryable. Sidechain rollback preserves the
prior high-water height and suppresses peg-out processing until recovery.
**WP-06D implemented check-boundary source milestone:** active candidates are
rechecked after restart against the burn, canonical Ergo anchor, tracker data
input, DUP input, and settlement vault input. The daemon then recollects the
native checkpoint and complete Frontier burn proof, reruns admission, and
rebuilds the exact transaction through the canonical service. Output
`creationHeight` is an explicit journal field; candidates predating that field
are invalidated rather than reconstructed from an incidental observed tip.

The canonical EIP-12 transaction now carries the complete tracker data-input
box, including its positive creation height, instead of an ID-only data input
that the WASM signer cannot consume. The proof-independent unsigned ID is
derived before any check. `signAndCheck()` rejects a signed-ID mismatch before
contacting the node and rejects a JVM response that is not the same transaction
ID.

`npm run settle:authenticated:check` is an explicit non-mainnet command with
mandatory state/deployment inputs, the exact WP-06T10 package and separately
supplied expected package digest, reviewed native-profile provenance, a
dedicated local-signing/check enable flag, userinfo-free loopback Ergo base
URLs for both observation and signed checking, a loopback sidechain endpoint,
live Ergo `/info` network agreement, and broadcast policy
disabled. The signed check, signer header lookup, and read-only Ergo client
disable HTTP(S) proxies and redirects. After proof reconstruction it rederives the complete native-bound
candidate identity, binds the package to the freshly prepared transaction, and
rechecks the exact canonical Ergo anchor immediately before signing. It has no submit branch and never skips revalidation or JVM
checking because a journal row was previously checked. A successful result can
enter the journal only through a process-provenance acceptance that binds the
revalidation, native request, trust anchor, finality horizon, and JVM response
digests. See
`docs/authenticated-settlement-jvm-check-v1.md`.

**WP-06E implemented staged-provisioning milestone:**
`npm run settle:authenticated:provision-plan` reads one explicit sanitized,
versioned JSON input and injects the three checked-in authenticated contract
templates under code-pinned SHA-256 identities. It validates complete funding
boxes, ERG/token conservation, first-input NFT minting, distinct inputs/data
inputs, positive creation heights, and the four-Var ContextExtension guard
before deriving any transaction or output ID.

The output is intentionally staged. It contains two unsigned setup candidates,
a tracker-admission preview valid only at one exact state-context height, and a
predicted settlement descendant. The admission builder now requires
`currentErgoHeight - anchorHeader.height == contextIndex + 1`; one new tip therefore
forces reconstruction. The package marks source-to-tree compilation
`unverified`, forbids execution/sign/check/submit/deploy/broadcast, and requires
admission plus settlement to be rebuilt from confirmed, refetched boxes. See
`docs/authenticated-v2-staged-provisioning-v1.md`.

This is a concrete provisioning topology and offline transaction-integrity
milestone, not provisioned devnet state. Exact source-to-tree and in-memory JVM
proof conformance exist separately, but no setup output was mined, no stateful
`/transactions/check` occurred, and no Gate 5 claim changes.

**WP-06F implemented confirmed-state rebuild source milestone:**
`npm run settle:authenticated:stage-plan` separates admission and first
settlement into independently digested unsigned plans. Admission requires the
exact tracker and fee outputs from the WP-06E setup transaction, explicit
unspent observations against one non-mainnet snapshot, one preheader derived
at `H+1` from that snapshot tip, and exactly ten unique, contiguous,
parent-linked mined headers `H..H-9`. It locates the original anchor by ID, rechecks height and extension
root, and derives the ContextExtension index rather than trusting a
caller-supplied index.

Settlement deterministically reconstructs the supplied admission stage before
using its populated tracker. It then requires that tracker, the initial DUP
singleton, and the settlement vault to equal their prior-stage outputs
byte-for-byte against one new snapshot. Every parent must be observed canonical
at its inclusion height and unspent; inclusion IDs still inside the supplied
parent-linked mined context must match the exact context header. Older
setup parents therefore do not create a one-block settlement window. Because
an anchor at settlement depth 10 is outside the ten mined headers obtained
from `lastHeaders/10`, settlement
separately requires an operator observation that the same anchor ID/root remains canonical
at its exact height.
It computes depth from the observed tip and rebuilds the complete EIP-12
transaction with output creation height fixed to that tip.

These are executable-shape source builders, not chain evidence. The observation
envelopes remain operator supplied, every authorization bit is false, and the
native checkpoint/Frontier proof plus all unspent boxes must still be recollected
immediately before any guarded JVM check. No real setup/admission output was
observed, signed, checked, submitted, deployed, or broadcast in this milestone.

**WP-06G implemented pinned source-to-tree verifier milestone:**
`npm run contracts:authenticated-v2:conformance` rebuilds one exact sanitized
provisioning package, resolves the same three code-pinned contract templates,
and compares complete compiled ErgoTree bytes rather than accepting a
caller-paired tree and hash. Sbt 1.11.1 and Scala 2.12.20 construct one
content-addressed bundle containing the compiled tool and complete numbered
runtime classpath; sbt and mutable dependency caches are not part of the
authoritative run. The verifier locks the reviewed Ergo v6.0.2 base,
`sigma-state` 6.0.2 artifact, bundle and ordered classpath, complete Microsoft
OpenJDK 17.0.19+10-LTS distribution, script version 3, and tree version 0.

The command binds the consensus lock/patch/blob identities and reconstructs
checkout state from raw `HEAD`, index, untracked-path, and working-byte data so
Git clean filters cannot conceal drift. It then copies the locked runtime bundle
and full JDK into a private directory, invokes Java directly, and re-hashes both
source and private copies after execution. The original compiler project file
set and bytes are also checked before and after the run. Private HOME,
application-data, temporary, PATH, and JAVA_HOME values exclude dependency,
JVM, sbt, and unrelated secret-bearing environment overrides from the child
process.

The authoritative parent is also bounded to Windows x64, Node 24.14.0, Git
2.54.0, the relayer package-lock, and the exact tsx/esbuild loader package
trees. Node loader overrides are rejected, Git runs by pinned executable with a
fresh environment, and private bundle/JDK files are read-only during Java
execution. This is a trusted-host verifier: same-user concurrent hostile
processes remain outside its authority and must be excluded by CI or operator
session isolation.

The source resolver is shared with provisioning, so tracker/DUP identities and
the DUP binding to the Blake2b-256 hash of the exact unlock ErgoTree cannot
drift between planning and conformance. The local pinned compiler successfully
compiled all three production templates. The initial-binding command now takes
only two explicit non-mainnet funding-box IDs, performs three compiler passes,
and requires tracker, unlock, DUP, resolved-source, and compiler identities to
reach one byte-for-byte fixed point. Its output is directly shaped for the
`contracts` field of the provisioning input. This verifies the compiler and
binding path, not a real instance: the ID-only report does not prove that either
box exists, is canonical, or remains unspent, and no retained conformance report
is `PASS` until it is bound to an exact real provisioning package digest. The
next integration step is therefore a sanitized package built from two freshly
revalidated non-mainnet funding boxes, followed by package-bound conformance.

The Windows consensus-source CI job is configured to provision the reviewed
MinGit archive, clean-build `runtimeBundle` with the locked Microsoft JDK, and
run the three-pass compiler self-check against golden production-template tree
hashes. Clean-checkout source-to-bytecode derivation remains pending until this
unpublished workflow records a passing CI run; it does not create or authorize
a real provisioning instance.

The conformance report keeps setup/sign/check/submit/deploy/broadcast,
Ergo-verifiable sidechain finality, Gate 5, and production readiness false. It
does not replace the subsequent guarded JVM full-transaction check. Retained
JSON is not an execution attestation and cannot authorize setup; consumers must
rerun the verifier.

This milestone prevents an admission signer from admitting bytes absent from
the referenced Ergo header. It does not prove that genuinely anchored checkpoint
bytes describe a finalized sidechain block. The R9 admission authority therefore
remains a fund-security/finality authority, not merely a liveness mechanism. The live
node still needs the locked Frontier patch, required read-only RPC surface, and
reviewed deployment trust-root/binary pins. The daemon now restores verifier
provenance after restart, but ErgoScript cannot yet enforce the same finality
proof. No live/non-inert profile or provisioned V2 UTXO set is approved, so the
JVM command has not been executed and JVM acceptance is not claimed. Gate 5
remains open.

**WP-06H implemented guarded funding-observation source milestone:**
`npm run contracts:authenticated-v2:observe-funding -- --environment
<non-mainnet> --node-url <origin> --tracker-funding-box-id <64hex>
--dup-vault-funding-box-id <64hex> --out <new-report.json>` uses only
`GET /info`, `GET /blocks/lastHeaders/1`, `GET /utxo/byId/<id>`, and
`GET /utxo/byIdBinary/<id>`. It requires one unchanged visible tip around the reads, an
Ergo non-mainnet network, distinct IDs, recomputed EIP-12 box IDs, agreement
between canonical Sigma bytes and JSON, and pure-ERG boxes.

The report emits `initialBindingInput` and `provisioningFundingBoxes`.
`contracts:authenticated-v2:derive-initial-binding` now accepts this report and
binds its digest and observed tip into the compiler result. The required
follow-on is: perform the real observation with an explicit endpoint and box
IDs; derive initial binding from that report; hydrate and build the exact
provisioning package while retaining both reports as reviewed sidecars; run
package-bound conformance; run the exact-package WP-06J funding revalidation;
then complete the separate signer-control review before any approved setup
procedure.

This observes one node at one point in time. Header and UTXO routes do not expose
one atomic snapshot, so matching tips detect visible drift but do not prove the
UTXO response belongs to the exact reported header state; the report keeps
`tipUtxoAtomicityProved = false`. It is not a global proof and does not prove
funding sufficiency, signer control, or continued canonical/unspent state. It
performs no transaction construction, signing, check, submit, deploy, or
broadcast, and revalidation before setup is mandatory. Only fixtures and local
tests have passed; no target-runtime observation is claimed because the explicit
endpoint and boxes have not yet been supplied. Gate 5 remains open.

**WP-06I implemented provenance-bound provisioning source milestone:** the
provisioning input and package are versioned to V2. The input embeds the complete
funding-observation and bound initial-binding reports and no longer accepts
independent environment, funding-box, or contract fragments. Hydration verifies
both outer digests, recomputes the initial input and compiler-identity digests,
cross-binds funding IDs, boxes, templates, resolved source hashes, trees,
fixed-point status, and all-false authorization, then derives the internal
provisioning values. The package digest covers the funding report/snapshot and
initial report/input digests. Source-to-tree conformance and stage rebuilds
rehydrate that same V2 input.

These hashes are deterministic evidence bindings, not signatures or
attestations. The one-node observation remains non-atomic and must be repeated
before setup. Target-runtime observation, funding sufficiency, signer control,
package-bound compiler conformance, native proof recollection, and stateful node
non-broadcast acceptance remain open. No execution authority is added and Gate 5
remains open.

**WP-06J implemented exact-package pre-setup funding-revalidation source
milestone:** `npm run settle:authenticated:pre-setup-revalidate` consumes the
complete provisioning v5 input, requires an explicit expected package digest
before network access, derives the two funding IDs from that package, and uses
only the bounded read-only funding-observer routes. It requires the prior and
fresh observations to agree on non-mainnet network, complete normalized boxes,
canonical Sigma bytes, and Sigma-byte digests. The fresh boxes must rebuild the
same package.

Funding sufficiency now has one shared implementation used by both setup
construction and revalidation. Tracker funding covers the tracker singleton,
setup fee, admission fee, and minimum change. DUP/vault funding covers the DUP
singleton, vault, setup fee, and minimum change. Both exact boundaries pass and
one nanoERG below either boundary fails closed.

The report binds both complete observations, all four package-provenance
digests, exact funding components, and all-false authority. It does not remove
TOCTOU: node header/UTXO readers are not atomic and either box can be spent
after the last GET. Atomicity, global canonicality, continued unspentness,
signer control, Ergo-verifiable finality, setup, and Gate 5 closure remain
false. A real target-runtime run still needs the explicit endpoint and funding
boxes, and execution must revalidate the same inputs again. Signer control is a
separate key/signing boundary and is not part of WP-06J.

The generator prints the fresh-observation digest for separate retention. The
offline `settle:authenticated:pre-setup-validate` command requires that
external digest plus the expected package digest, so coordinated edits to the
nested observation and outer report cannot validate against the original
capture. These unkeyed hashes remain content bindings rather than attestations.

**WP-06K implemented authenticated V2 setup JVM-check source milestone:**
`npm run settle:authenticated:setup-check` requires one exact expected package
digest, reruns fresh pinned source-to-ErgoTree conformance, prefetches a distinct
contiguous parent-linked `lastHeaders/10` as `CONTEXT.headers`, derives the
node-compatible `simplifiedUpcoming` preheader at `H+1`, and performs final fresh funding
revalidation for both exact inputs on the same tip. The in-memory signer must
control both exact P2PK funding inputs and the single bootstrap committee key;
both setup candidates require empty `ContextExtensions` and independently
derived unsigned IDs.

Both candidates are signed before either fixed `POST /transactions/check`.
Each package, independently derived unsigned, signed, and node-returned ID must
be equal. Tracker setup and DUP/vault setup remain two independent transactions,
not one atomic setup; DUP and vault are atomic only within the second
transaction. The command itself opens signer material only from non-interactive
stdin; it opens no signer file and reads no signer material from environment,
configuration, deployment, or runtime state. Shell-pipe provenance cannot be
detected, so approved in-memory delivery and the prohibition on file redirection
remain operator-enforced. Signed bytes are valid and broadcastable if captured,
remain in memory, and are neither persisted nor printed. The command therefore
permits only a trusted loopback non-mainnet low-value node and emits only a
sanitized report.

WP-06K is local implementation/source and test coverage, not a real node run.
Target-runtime execution remains pending an actual approved sanitized package,
pinned source checkout, node, funding inputs, and signer. A PASS does not perform
or authorize setup, submit, deploy, or broadcast and does not close Gate 5,
establish threshold governance, prove sidechain finality on Ergo, support a
target-runtime claim, or establish production readiness. Gate 5 and Phase 011
remain the critical path.

**WP-06L implemented source-bound native-to-Frontier proof-join milestone:** the native
real-crypto fixture now commits the exact sidechain ID, execution block, odd-width
three-burn root, and burn count reconstructed from
`frontier-bridge-event-root-v1.json`. The native verifier command therefore
composes real GRANDPA signatures, one authority rotation, the runtime trie proof,
canonical Frontier receipt extraction, one target burn inclusion proof, and the
derived 64-byte `0x0401` candidate in one cross-language run.

`joinPinnedLocalNativeCheckpointToFrontierBurns()` accepts only a checkpoint
bound to a process-local pinned build capability. That capability pins the canonical
source-lock digest and Frontier identity, verifies exact platform Cargo, rustc,
and Git identities, creates a new empty Cargo target, rebuilds both native
binaries with Cargo 1.82.0 and `--locked`, validates the checkout again, and
binds the exact verifier digest. An arbitrary self-pinned executable or stale
target output can produce only a non-admissible conformance candidate. The join
then checks all four shared commitment fields before constructing the burn proof.

This capability is deliberately local-conformance-only. The inherited linker
and other build helpers are not completely closed, junctioned Cargo registry/Git
caches are mutable and not content-attested, and no independent actor reproduces
or signs the outputs. The join therefore records all three limitations and
remains admission-ineligible; it must not be described as hermetic, reproducible,
or independently attested.

The authenticated V2 provisioning and confirmed stage-rebuild builders still
accept raw preview fields and do not consume this join. The next prerequisite at
this milestone was
an institution-supplied or independently reproduced verifier-binary profile
binding source, dependency inputs, complete build tools, output digests,
reviewer identity, and verified OS-level process containment such as a Windows
kill-on-close Job Object. Routing both builders through fresh provenance from that
profile was the following implementation slice; no tracker-admission provenance
claim followed yet. This remains a process boundary, not an Ergo consensus proof. A direct actor
holding tracker R9 can bypass the source-bound process and authorize a genuinely
anchored invented checkpoint. WP-06Q later provisions R9 as a proposition-distinct
finality attestor and proves that a bridge-committee-only signature fails the
tracker input, but the result remains federated/attestor-trusted. Direct trustless
finality still requires an Ergo-verifiable proof such as an activated EIP-0045
path. No JVM admission,
setup, submission, deployment, broadcast, Gate 5 closure, or production claim
follows from WP-06L.

**WP-06M implemented independently attested binary-profile validator:** a portable
canonical statement now binds the exact consensus source baseline, vendored
dependency closure, complete build-tool closure, reviewed Cargo invocation,
fresh-target/source checks, kill-on-close process containment, both native
artifact byte identities, the two conformance vectors, and one output manifest.
The statement requires separate Ed25519 builder and independent-reviewer
signatures whose keys and declared organizations match the source-owned
attestor lock. Runtime profile JSON cannot add trust roots, reuse a forbidden
authority key, weaken any closure/containment assertion, or set an admission,
Gate 5, trustless, or production boundary true.

`checkpoint:finalized:native:attestation:verify -- --describe-reviewed-lock`
validates the tracked registry without loading any runtime trust root. That
registry deliberately contains zero active profiles until real external keys
are reviewed. The exact-binary validation route therefore remains unavailable
rather than accepting fixture or locally generated keys. Even after a valid
packet exists, validation produces a report only: it does not expose either
executable path or mint an execution capability. Organizational independence
remains a reviewed policy assertion, not a cryptographic theorem, and the report
remains admission-ineligible. WP-06O versions this statement and binds one
unified semantic execution-policy digest in place of opaque per-artifact
invocation hashes.

The next concrete action is to obtain or institutionally provision distinct
builder/reviewer public keys and an independently reproduced packet satisfying
this format, with the referenced dependency, tool, containment, execution-policy,
and conformance manifests retained for review. WP-06N below supplies the local
target-byte and process-tree primitive, and WP-06O binds its codec route to the
signed semantic policy with launch-time policy freshness. Loaded-module closure,
source-owned attestor refresh, verifier routing, and an installer-owned policy
epoch floor remain prerequisites before authenticated V2 provisioning and confirmed
admission/settlement rebuilds can be routed through fresh reviewed provenance.
At this milestone, R9 separation and committee-only rejection were still open;
WP-06Q later closes those exact source predicates. Direct Ergo finality-proof
verification, setup, signing, submission, deployment, broadcast, Gate 5, and
production readiness remain open.

**WP-06N implemented contained native target execution primitive:** the new
dependency-free `relayer/native-contained-launcher` Rust/Win32 broker hashes a
retained source handle with CNG SHA-256 and creates the random stage/file
relative to retained handles. It launches through final volume-GUID paths,
retains every namespace ancestor without delete sharing, applies protected
owner/SYSTEM/Administrators DACLs, and rechecks staged path identity, size, and
digest before process creation. It creates only three inheritable pipe ends,
uses an explicit process handle list, creates the target suspended, assigns it
to an unnamed kill-on-close Job Object before resume, and fails closed on
timeout, separate stdout/stderr limits, child rejection, surviving descendants,
failed inspection, or unverifiable cleanup. The broker buffers stdout until
containment and cleanup succeed and never reflects child stderr. Rust 1.82 tests
cover exact stdin/stdout, digest mismatch, source replacement, final reparse
points where available, canonical namespace/ancestor retention, protected ACLs,
argument quoting, handle allowlisting, timeout/overflow, descendants, and
staging cleanup.

`relayer/src/native-contained-process.ts` supplies the matching bounded Node
adapter and preserves explicit no-admission/Gate-5/production boundaries. This
does not make ordinary Node hashing an atomic bootstrap for the broker itself.
The broker must be installed as part of the reviewed relayer TCB. PE import and
delayed DLL closure, source-owned broker identity, source-owned attestor-policy
refresh, real external keys, checkpoint-verifier routing, and settlement caller
integration remain open. Therefore WP-06N is local
process-containment implementation, not an independently attested execution
capability or an Ergo finality proof.
It is also not a malicious-code sandbox: the reviewed target keeps the broker's
user token, same-token compromise remains inside the TCB, and service-mediated
process creation is outside direct Job Object ancestry. Institutional use
therefore still requires reviewed target source, imports, installation policy,
and host isolation.

**WP-06O implemented semantic native execution-policy and contained codec
milestone:** the attestation statement is versioned to v2 and binds one
domain-separated execution-policy digest. The policy first binds a separate
digest of the attestation core with the policy field omitted, avoiding a hash
cycle; the final signed statement then binds the policy digest. The policy also
binds the build-dependency identity, broker identity, validity interval and positive
epoch, target bytes, operation argv, request/result schemas, fixed I/O limits,
environment, and separate verifier/codec runtime-dependency manifests. Unknown
fields, artifact drift, operation reordering, schema drift, limit drift, expired
policies, and malformed dependency declarations fail closed.

The three acquisition-only codec operations now have a policy-bound factory
that requires a process-provenance attestation report and validates the policy
and manifests on every call before using the WP-06N broker. The broker enforces
the same exclusive validity window against local system time before staging and
again immediately before process resume. It permits only `--encode-headers`,
`--inspect-warp-proof`, and `--inspect-finality-proof`; all results preserve
`cryptographicallyVerified: false`. The ordinary direct-process codec remains
available for bounded local fixture/build paths, exposes a distinct typed
execution boundary, and is not promoted to a settlement authority.

At the WP-06O checkpoint this remained a policy-relative conformance path, not
execution admission. Loaded-module closure and dynamic-load exclusion were not
enforced; the broker did not inspect PE imports or loaded DLLs, the factory did
not reload source-owned roots, and no installer epoch floor prevented rollback.
The verifier and settlement consumers still used the direct path. WP-06P below
addresses those implementation gaps while preserving the non-admission
boundary. No Gate 5, trustless, deployment, broadcast, or production conclusion
follows from WP-06O.

**WP-06P implemented source-refreshed native execution authority and settlement
route closure:** broker authority mode now accepts one profile digest, policy
digest, positive epoch, and bounded sorted runtime DLL allowlist. It requires
one installer-owned fixed-size `AuthorityRecordV1` under the corresponding
64-bit HKLM profile key, validates the embedded profile, exact policy digest,
and minimum epoch before staging, then holds the installer's global mutex
across the final complete-record and policy-window checks plus `ResumeThread`;
abandonment rejects the launch.
It validates the retained target as PE32+ AMD64, requires every case-normalized
direct import to be allowlisted, rejects non-empty delay-import descriptor sets,
and observes normal root-process loader events
through the initial breakpoint and exit, terminates the job before continuing a
rejected module event, and enforces a kernel active-process limit of one.
Authority failures use one generic exit and expose no child detail. The elevated
installer verifies a reviewed broker digest, refuses epoch decreases, and
flushes the new floor before broker replacement; it was not run as part of this
local work.

The TypeScript authority package contains packet, policy, manifests, and local
artifact paths but no caller-supplied trust root, clock, runner, registry path,
or epoch setter. Every codec or verifier launch reloads
`sources/native-verifier-attestor-lock.json`, verifies the signed packet and
artifact bytes, revalidates policy freshness and manifest bindings, and invokes
broker authority mode. It repeats source-lock and policy validation after the
broker exits before branding a private digest-bound stdout snapshot. The
collector accepts the resulting authority-bound verifier. The reviewed
settlement source requires the exact same authority for codec and verifier. Its
v2 profile binds profile, attestation, and policy IDs, the exact policy digest,
a minimum epoch, the canonical Program Files broker path, all
executable/invocation pins, and checkpoint provenance before issuing its own
process-local provenance. The old reviewed direct-process factory now
fails closed; daemon and check-only routes must load both public configuration
packages.

This is implemented fail-closed infrastructure, not an operational authority
run. The tracked attestor lock intentionally contains no active external keys,
the inert reviewed settlement profile names no real executables, and no HKLM
floor or Program Files installation was changed. Loader observation trusts the
serviced System32 boundary and does not cryptographically exclude manual
mapping, executable-memory injection, administrator/kernel compromise, API-set
forwarding failure, or system-time rollback. Policy and result boundaries remain
non-admission and non-settlement-authority. A real independently
reproduced/signed packet plus reviewed runtime module list, installer-floor
provisioning, and a no-broadcast authority execution packet remain operational
prerequisites. WP-06Q closes exact R9/R6 proposition separation in source; an
independently controlled attestor and Ergo on-chain finality-proof acceptance
still remain before Gate 5 closure.

**WP-06Q implemented tracker finality-attestor role separation:** provisioning
schema v3 requires a dedicated compressed DLog key for tracker R9 and rejects
equality with the bridge-committee key retained in DUP R6. Tracker setup and
admission preserve the attestor proposition, while DUP setup preserves the
committee proposition. The authenticated settlement builder and unlock contract
both reject equal tracker-R9 and DUP-R6 Sigma propositions. The builder first
fully consumes canonical proveDlog constants and validates their secp256k1
points, so alternate trailing or malformed register bytes cannot defer the
failure to VM evaluation. A legacy
same-proposition deployment cannot release value through the V2 path.

The tracker VM matrix signs the positive admission with the finality-attestor
fixture and rejects a bridge-committee-only signature as well as an unrelated
signature. The full settlement VM matrix adds an isolated same-proposition
negative. Setup checking proves only that the bootstrap signer controls the two
funding inputs and bridge-committee key; it explicitly does not claim control of
the finality-attestor key or independent custody.

This removes one direct committee-bypass shape but does not turn R9 into a
cryptographic finality proof. The same organization may control two distinct
keys, the operational attestor registry remains empty, and no mapping from the
binary-profile Ed25519 reviewers to the Ergo DLog attestor is approved. R9 can
still authorize a genuinely anchored but invented checkpoint. Gate 5 therefore
remains open until Ergo verifies the sidechain-finality rule, directly or
through an activated and reviewed aggregate-proof path. No setup, signing,
submission, deployment, broadcast, trustless, or production claim follows.

**WP-06R implemented canonical finality statement and aggregate proof
interface:** `BridgeFinalityStatementV1` freezes a 356-byte public statement
binding the exact canonical checkpoint, recomputed checkpoint commitment,
reviewed trust-anchor digest, verified finality horizon, and semantic GRANDPA
state/finality program ID. `AggregateFinalityProofV1` adds a fixed 464-byte
prefix plus bounded payload. Native mode `1` carries the exact verifier request
and binds the exact verifier executable SHA-256; reserved STARK mode `2` fails
closed in builders and decoders.

The native checkpoint adapter can issue this envelope only for a
process-provenance-branded checkpoint and the exact request whose digest and
trust anchor match the verified result. Settlement admission carries the
statement digest and program ID with the existing checkpoint identity. The
proof-system ID, exact verifier profile, native payload digest, and full
envelope digest are also bound through candidate identity, fresh revalidation,
and persisted check metadata. WP-06R itself did not yet change the tracker;
WP-06S below supplies that on-chain identity consumer without storing the
variable proof payload.

This milestone freezes a portable verifier/prover interface; it does not make
the native verifier result Ergo-verifiable. R9 can still authorize a genuinely
anchored invented checkpoint, so Gate 5 remains open. The next proof
implementation milestone is an independently reviewed consumer for this exact
statement, directly in an available Ergo verifier or through a separately
activated EIP-0045/STARK path. Until then proof-system ID `2` remains rejected,
and no trustless or production claim is allowed.

**WP-06S implemented proof-bound tracker admission:**
`AggregateFinalityCommitmentV1` freezes a 496-byte object consisting of the
canonical proof's fixed 464-byte prefix plus the complete aggregate-proof
digest. Tracker ContextExtension Var(0) now carries this commitment rather than
bare checkpoint bytes. `SPVTrackerAuthenticated.es` validates the envelope and
statement discriminators, payload-length bound, embedded checkpoint,
checkpoint commitment, statement digest, and fixed semantic program ID. Its
append-only AVL value is now 264 bytes and persists the proof-system ID,
statement digest, program ID, verifier profile ID, payload digest, and aggregate
proof digest alongside the existing event root and anchor identity.

The pinned JVM compiler accepts the updated sources and derives stable linked
tracker, unlock, and DUP trees. Focused codec, builder, contract-boundary,
candidate, persistence, and native-admission tests pass. The current tracker
tree passes one positive sigma-rust admission plus thirteen bounded fail-closed
rejects, and the current linked settlement trees pass one positive full
transaction plus sixteen rejects. Both matrices pass with deterministic
synthetic headers and with a fresh node-compatible `H+1` preheader plus ten
mined headers `H..H-9` from the isolated patched devnet, where the tracker authenticates the exact
64-byte `0x0401` field. The exact signed positive transactions also pass
pinned-JVM input-proof, serialization, bytes-to-sign, context-identity, and
mode-specific contract-tree conformance. This is
in-memory VM evidence, not node stateful acceptance or an on-chain spend;
`/transactions/check` additionally requires chain-resident setup/admission UTXOs.

Native settlement admission reconstructs the same commitment from a
provenance-checked full proof and rejects any tracker identity-field mismatch.
Candidate schema V2 and provisioning/stage schemas V5/V3 prevent older prepared
packages from inheriting the new meaning. The Rust/WASM tracker uses the same
264-byte fixed value length, and the pinned JVM compiler derives stable linked
tracker, unlock, and DUP trees from the updated sources.

This closes the gap where a reviewed off-chain proof could motivate an R9
admission while the on-chain tracker preserved only its checkpoint. It does not
close the finality gap: the payload is absent from the commitment, Ergo does not
recompute its digest or the complete proof digest, and no GRANDPA/STARK verifier
runs. R9 can still authorize a structurally valid but semantically false proof
identity. The required trustless negative remains rejection of an anchored,
R9-authorized invented checkpoint by an activated cryptographic verifier.

**WP-06T1 implemented source-to-tracker conformance milestone:**
`npm run trustless:wp06-source-to-tracker-vm` rebuilds the native GRANDPA and
runtime-state verifier from the exact pinned Frontier checkout and locked local
tool identities. It replays the checked-in synthetic read-only Substrate RPC
responses and canonical Frontier receipt vector, requires their exact published
request/result identities, derives the target burn inclusion proof and canonical
aggregate-finality commitment, constructs the exact `0x0401` membership proof,
and injects that same object into the current tracker sigma-rust VM. An
immutable source-specific handoff retains the canonical burn, exact payout
preimage, burn proof, `0x0401` membership, tracker AVL transition/history, and
admitted signed tracker successor, and binds them back to the exact checkpoint
commitment, bridge event root, aggregate-proof digest, and source provenance.
The positive admission and all thirteen tracker negatives pass.

This removes the previous separation between native-source, receipt, anchor,
and tracker fixtures for the offline positive path. It does not make the
synthetic RPC responses live evidence, prevent Cargo from fetching missing
locked dependencies, attest the complete build dependency closure, execute
`/transactions/check`, or make GRANDPA semantics verifiable by Ergo. The VM
uses generated in-memory signing but no external wallet state. R9 remains the
finality authority, so admission eligibility, committee bypass prevention,
Gate 5 closure, trustless operation, and production readiness remain false.

**WP-06T2 implemented source-to-settlement conformance milestone:**
`npm run trustless:wp06-source-to-settlement-vm` retains the WP-06T1 result as
one process-local, deeply frozen capability and passes the exact signed tracker
successor into the linked authenticated settlement VM. The consumer does not
accept separately supplied tracker history, tracker box, peg-out, settlement
identity, recipient, or DUP key. It verifies the successor box ID, ErgoTree,
value, creation height, singleton NFT, complete R4-R9 register set, and AVL
history digest, reconstructs the settlement identity from the proved burn leaf,
then derives the payout and DUP insertion from that single handoff. The handoff
retains the exact T1 ten-header context; T2 preserves its tip-to-anchor prefix,
appends five parent-linked synthetic descendants, and places the same raw anchor,
ID, height, and extension root at index 9 and the first contract-valid height.
The positive source-to-settlement transaction and the linked sixteen-case payout,
tracker, replay, proof, ordering, anchor, contract, chain, block, and asset
negative matrix pass in sigma-rust. Consumer-level falsifiers separately isolate
box ID, tree, value, creation height, history key/digest, register, NFT, retained
anchor, and a deeply frozen copy that lacks process-local provenance.

The provenance capability is deliberately process-local: serialization or
restart does not preserve settlement authority, and a restarted process must
recollect and revalidate the pinned source chain. DUP state, liquidity vault,
Ergo context, and evaluation key remain synthetic and ephemeral. WP-06T3 now
executes the source-bound positive in the pinned JVM. Chain-resident
`/transactions/check`, setup/admission UTXOs, Ergo-verifiable GRANDPA semantics,
R9 replacement, Gate 5 closure, and trustless or production-ready claims remain
open.

**WP-06T3 implemented source-bound pinned-JVM conformance milestone:** one
checked-in JVM-canonical synthetic header vector spans `H99990..H100004`. The
T1 tracker window uses `H99999..H99990`, preheader `H100000`, and the `H99995`
anchor object at index 4. The T2 settlement window uses `H100004..H99995`,
preheader `H100005`, and reuses that exact anchor object at index 9. The loader
pins the vector digest, expected header IDs, JVM JSON digests, parent links,
heights, extension roots, both windows, and the source-derived `0x0401` root;
the pinned JVM independently recomputes each header ID.

The root of the checked-in public three-burn Frontier vector drives tracker
admission; its third burn has an executable recipient ErgoTree, is retained in
the handoff, and drives the linked
settlement. T1 passes the source-bound tracker positive in sigma-rust and pinned
JVM plus thirteen isolated rejects. T2 consumes the exact signed successor and
passes the linked two-input settlement positive in sigma-rust and pinned JVM
plus sixteen isolated rejects. Each JVM fixture uses the wallet's exact signed
bytes and binds the transaction ID, bytes-to-sign, boxes, roles, trees,
preheader, headers, and context. T2 also
requires its compiler identity, source baseline, and tracker/unlock/DUP tree
hashes to equal T1. The existing pinned Scala verifier and compiler lock are
unchanged. The concise producer-consumer/failure/falsifier matrix is recorded in
`docs/trustless-burn-verification-plan.md`.

These headers were not mined and prove neither PoW nor canonicality. The
checked-in vector is revalidated at runtime, and each secret-free JVM fixture is
written to an isolated per-run directory and deleted after execution. Cargo may
fetch missing locked dependencies. There is no chain RPC, external wallet, runtime database,
chain-resident setup/admission UTXO, stateful `/transactions/check`, setup,
submit, deployment, or broadcast path. R9 remains the finality authority, Ergo
does not verify GRANDPA semantics, and Gate 5 and production readiness remain
open.

**WP-06T4 implemented fixture-backed restart and adversarial lifecycle
milestone:** `npm run trustless:wp06-fixture-lifecycle` launches two fresh Node
processes. Each process rebuilds and recollects the pinned native and Frontier
inputs, executes the complete WP-06T1-to-T3 path, and returns a bounded summary
of source, burn, anchor, tracker, payout, DUP, compiler, tree, JVM, and raw
verifier/codec executable identities.
The parent requires distinct process IDs and exact equality of that semantic
summary. It never rehydrates the process-local tracker capability and excludes
ephemeral transaction and box IDs from the restart comparison.

The isolated Cargo invocation builds only `bridge-checkpoint-verifier` and
`bridge-rpc-proof-codec`. It uses Cargo's `dev` profile under the local
`isolated-no-debuginfo` reproducibility mode: lockfile, fresh target, disabled
incremental compilation, one codegen unit, source/target path remapping, and
MSVC `/Brepro` when applicable. T4 requires
the complete raw executable SHA-256 values for both binaries to match across the
two fresh builds. This is same-machine local conformance evidence, not complete
reproducible-build attestation: the linker, native C compiler, SDK libraries,
dependency-cache contents, and independent build environment remain outside the
authenticated toolchain closure.

Each child has a 15-minute wall-clock deadline and a shared 32 MiB stdout/stderr
limit. On Windows the target starts suspended inside a kill-on-close Job Object
with breakaway disabled before execution resumes, so an orphaned grandchild
cannot escape when its intermediary exits. Timeout or overflow closes that
containment boundary, retained output never exceeds the cap, and success is
returned only after the job has closed.

The command also requires the production source checks and the existing tracker
and settlement VM matrices to execute in each child. These cover source-root
drift, same-height source replacement, absent burn, wrong extension key,
an unfinalized target, an above-head finality horizon, tracker proof and identity mutations, duplicate and
stale settlement, payout drift, wrong chain/block/asset fields, and contract or
ordering substitutions. The lifecycle report keeps the anchored,
R9-authorized invented-checkpoint case explicitly unresolved. It also records
`nodeStatefulAcceptanceVerified = false`, `r9FinalityAuthority = true`, and
`gate5Closed = false`.

WP-06T4 closes the fixture-backed restart/recollection portion of integration;
it does not create chain-resident setup or admission UTXOs and therefore cannot
exercise stateful node `/transactions/check`. It also does not reconstruct one
exact chain candidate across restart, because ephemeral box and transaction
identities are deliberately not authority. The node-stateful and
Ergo-verifiable finality-consumer requirements below remain open.

**WP-06T5 implemented chain-derived authenticated tracker reconstruction:** the
read-only Ergo adapter retrieves the complete paginated history of the tracker
singleton NFT. The reconstructor orders boxes by their spending-transaction
links instead of API order, requires exactly one root and one unspent tip,
checks the configured tracker NFT and ErgoTree, and walks the spending
transaction's parent headers to the exact `CONTEXT.headers` anchor. For each
transition it decodes the canonical R4/R7 Longs, R8/Var(3) Ints, R6 bytes, R9
proveDlog key, finality commitment, tracker value, extension proof, and AVL
proof bundle. It then replays the V2 admission from the preceding history and
requires the input and successor register sets, checkpoint identity, extension
membership, sidechain identity, and successor digest to match.

The observation requires `indexedHeight == fullHeight == bestHeader.height`,
the same full-block/index snapshot before and after pagination and replay, and
the indexed tip's exact presence through canonical `/utxo/byId`. After unsigned
transaction preparation, the daemon repeats the synchronized snapshot and UTXO
check immediately before candidate journaling. A process-local provenance capability is the only
input accepted by the atomic SQLite replacement method. A changed lineage
replaces that sidechain's cache and invalidates its active authenticated
candidates in one transaction; an identical reconstruction is idempotent. The
daemon performs a full replay on startup and whenever the unspent tracker tip
changes, uses a synchronized exact-tip fast path between changes, and skips both authenticated
candidate reconciliation and preparation while reconstruction is unavailable.

The executable WP-06T5 matrix covers out-of-order boxes, missing successors, duplicate
boxes, disconnected cycles, multiple tips, context-value mutation, broken
header ancestry, tracker-digest drift, lagging extra indexes, best/full-height
mismatch, missing canonical tips, and observation snapshot drift,
fresh database population, idempotent replay, rollback to an earlier lineage,
candidate invalidation, and rejection of callers without reconstruction
provenance. WP-06T5 was a chain-derived cache and restart milestone, not
complete WP-07: it inherited the historical AVL proof's acceptance from one
node and rebuilt every history prefix.

**WP-06T6 implemented exact rolling proof replay and dual-observation
admission:** `tracker_v2_verify_insert` safely preflights the observed serialized
AVL proof, admits only canonical prover balance bytes before entering unchecked
WASM parser paths, invokes the pinned verifier with exactly one insert and zero
deletes, and returns its successor digest. This is an explicit stricter
fail-closed local proof policy; WP-06T7 below now pins the JVM differential
boundary without widening that policy.
The reconstructor starts from the exact V2
empty digest, derives the unchanged authenticated V2 key/value semantics from each checkpoint,
replays the observed proof, requires complete input and successor register
equality plus all four ContextExtension variables, and advances the digest once.
Trailing-direction consumption remains aligned with the pinned verifier. A
changed value may produce a different valid digest, so the exact successor R5
comparison remains load-bearing. Var(2), decoded proof bundles, per-response
HTTP bytes, indexed pages, and total lineage size are bounded before authority
can reach cache replacement.

The daemon now constructs two dedicated read-only clients only when
`ERGO_AUTHENTICATED_TRACKER_WITNESS_NODE_URL` names a canonical origin distinct
from `ERGO_NODE_URL`. Both clients must independently reproduce every deciding
box/transaction identity, inclusion height, register set, spending context,
derived entry, digest, UTXO tip, and stable best/full/index snapshot. A
single-source replay has no cache-accepted provenance. Missing witness
configuration or disagreement leaves authenticated settlement fail-closed and
invalidates active candidates. This detects RPC disagreement; it does not prove
that either node view is canonical or independently mined.

The clean-checkout executable benchmark first rebuilds the pinned WASM and then
reconstructs 1,024 synthetic transitions carrying 645,881 bytes of historical
AVL proofs in 228.176 ms on the recorded Node v24.14.0/win32/x64 run, with exact
final-tip equality. Its 6,188.963 ms fixture generation is reported separately
because it still uses the stateless history-based proof generator. The run
records WASM SHA-256
`32be27f7819b6d353c41e46bd77e9ed48d6474ca7bc351764b049b196a7846ef`.
The benchmark covers the production reconstructor without network, database,
signer, submitter, or broadcast capability and defines no production SLO.

WP-06T6 still requires a concrete two-node non-mainnet run, stateful node
`/transactions/check`, and an activated Ergo-verifiable GRANDPA/STARK consumer.
It does not reject the
R9-authorized invented-checkpoint case and does not close Gate 5.

**WP-06T7 implemented pinned JVM AVL differential milestone:**
`npm run trustless:tracker-avl-jvm-differential` first rebuilds the WASM package,
then validates the exact Rust sources, generated JavaScript glue, and WASM bytes
against a reviewed lock before loading any generated code. It derives 17
one-step fixtures from real `tracker_v2_insert` output, then executes each case
through the SHA-256-pinned `scrypto` `BatchAVLVerifier` in the resolver-free JVM
runtime.
The corpus covers empty and non-empty inserts, four rotations, wrong digest,
wrong height, wrong and existing keys, wrong value, truncation, trailing
direction bytes and bits, and non-canonical balance bytes. JVM failures retain
bounded constructor, operation, and digest-stage outcome classes instead of a
single undifferentiated rejection. Accepted cases retain their complete WASM
and JVM successor digests for exact cross-runtime comparison.

The canonical cases and trailing-direction variants produce the same successor
in WASM and JVM. Wrong value is accepted by both and produces the same alternate
33-byte successor in both runtimes.
The JVM additionally accepts the falsified starting-height case but derives a
different successor, while the stricter WASM preflight rejects it. The runtime
therefore confirms that operation acceptance alone is not authority: the exact
33-byte successor-R5 comparison is load-bearing and the WASM canonical-shape
preflight must not be relaxed to mirror the broader JVM parser surface.

The reviewed run used canonical source/runtime lock SHA-256
`a1c52eef82974e8ca102b37ca84fe526ee464a623fb7583cf05cbd06a347f060`,
generated JavaScript glue SHA-256
`98dbefbf0150b477c7af22d5f9cdfaf925cfb464da08e787b284e17d1a1fd13c`,
WASM SHA-256
`e6fedc505a3904518ab2ff83a5ac6c4af72fb66fc163ff86768280d330a8d487`,
JVM verifier artifact SHA-256
`79838cdcedc62936acb11583946cad635b9f42fa967d39bb103742b9b6302944`,
and ordered runtime classpath SHA-256
`d156d66793cc88b78816c45f82429ed1052c67220133fba0783e38928396131a`.
That reviewed identity remains frozen in the versioned V1 WASM lock. Current
clean checkouts use a separate V3 lock bound to Rust 1.97.1 through the tracked
`rust-toolchain.toml`, the current crate sources, the exact wasm-pack 0.14.0
probe and deterministic Cargo-home/workspace path-remapping recipe, unchanged JavaScript glue
SHA-256
`98dbefbf0150b477c7af22d5f9cdfaf925cfb464da08e787b284e17d1a1fd13c`,
and current WASM SHA-256
`be1134ff4052496eac6903dbc9a40bb6d164786de09e8c98488a81eedc151867`.
The real historical JVM differential runs only under its exact pinned Windows,
Node and relayer-package-lock closure. Other current hosts validate the V3
source/runtime identity without claiming a new JVM execution or superseding
the V1 evidence.
This is direct verifier conformance only: no node state, transaction check,
signing, submission, broadcast, finality verification, or Gate 5 closure is
claimed.

**WP-06T8 implemented explicit dual-origin observation command:**
`npm run trustless:wp06-dual-observe` accepts only explicit non-mainnet
environment, primary and witness root origins, tracker NFT, tracker ErgoTree,
the exact provisioned tracker genesis box ID, sidechain ID, and a new
repository-local JSON output. It imports no bridge
configuration and creates two credential-free GET-only clients with fixed
timeouts, redirects disabled, direct routing, per-response limits, fixed
pagination, exact page schemas and cardinalities, total lineage count/raw
response-body pagination-byte limits, a bounded page count, and an aggregate pagination
deadline. A second session budget spans every lineage, transaction, header, and
UTXO response in the complete reconstruction with exact raw response-body byte,
request-count, and wall-clock elapsed-time limits; transaction and header caches live only for that
session. The same client factory now
backs daemon tracker reconstruction so the operational command and service use
the same bounded observation surface. The daemon also rechecks that both nodes
report the deployed non-mainnet Ergo network before and after either fast-tip
revalidation or complete reconstruction. A one-source failure is returned only
after both bounded reconstruction sessions have closed.

Both origins must be canonical and distinct, report the same explicit
non-mainnet network before and after reconstruction, match the request's exact
environment/network mapping, start at the requested provisioned genesis box,
and reproduce the complete
WP-06T6 deciding lineage, rolling AVL replay, unspent singleton tip, and stable
snapshot. The genesis binding fixes the initial tracker registers and R9
proposition instead of trusting an arbitrary empty lineage. Provisioning now
records this root separately as `trackerGenesisBoxId`, and the daemon requires
the corresponding immutable `spvTrackerAuthenticated.genesisBoxId`; the
populated/current tracker `boxId` is not a valid replacement. The output retains
each complete encoded V1 checkpoint and recomputes its commitment and entry
identity, alongside decoded V2 values and finality identities plus genesis, R9,
tracker, tree, tip, observation, source-origin, and report digests. It is a
read-only diagnostic record: its entries must reproduce the tracker tip digest,
its unkeyed report digest provides self-consistency rather than source
authentication, and its source-produced observation digest cannot be
recomputed from the compact report alone. Every build/check/sign/submit/broadcast/deploy
authorization is false, R9 remains authoritative, and neither Gate 5 nor
production readiness changes.

Different origins detect disagreement but do not prove independent operators,
independent upstreams, or globally canonical Ergo consensus. WP-06T8 has not
yet run against a chain-resident V2 tracker because no pre-provisioned target
UTXO set and two matching non-mainnet origins are available in this worktree.
No synthetic report substitutes for that run. The repository/runtime also has
no activated Ergo verifier for the bound GRANDPA semantics; proof-system ID `2`
therefore remains fail-closed instead of being reinterpreted as a placeholder
STARK path.

**WP-06T9 implemented stateful-check prerequisite observation:**
`npm run trustless:wp06-stateful-readiness` accepts two explicit distinct
non-mainnet node origins plus the public tracker profile, exact current DUP and
vault box identities, and the exact burn ID, payout, and current authenticated
V2 builder miner fee. It first replays the complete authenticated tracker
lineage through the WP-06T8 bounded dual-source path. It then requires both
sources, under one unchanged indexed/full-height and best-header snapshot, to
return identical deciding JSON and canonical Sigma-serialized bytes for the
exact current tracker, DUP singleton, and settlement-vault UTXOs.

The observer validates the same input-shape prerequisites consumed by the
authenticated settlement builder: exact contract trees, singleton identity and
amount, canonical counters and AVL metadata, tracker-R9/DUP-R6 proposition
separation, pure-ERG vault shape, deposit/payout provenance registers, and
minimum liquidity derived from the explicit payout plus the exact builder fee. It writes a digest-bound report through
a create-only repository-local output path. The command imports no bridge
configuration and has no runtime-database, deployment-state, transaction-build,
check, signing, submission, deployment, or broadcast capability.

A passing WP-06T9 report means only that two configured origins exposed the
same exact currently unspent inputs and sufficient vault value for the stated
burn payout and miner fee. It does not prove independent node control,
canonical consensus, burn or settlement-candidate validity,
`/transactions/check` acceptance, GRANDPA/STARK validity, or trustless
settlement. No concrete target run exists in this worktree, R9 remains the
finality authority, and Gate 5 remains open.

**WP-06T10 implemented deterministic unsigned settlement-package milestone:**
`npm run trustless:wp06-unsigned-package` consumes one repository-local T9
report and one repository-local companion containing the target burn event,
canonical inclusion proof, recipient ErgoTree, settlement creation height, and
complete DUP key history in insertion order. Both inputs are strict,
digest-bound schemas. The builder independently validates T9, requires the
settlement height to equal its stable full/header height, binds the burn to
exactly one authenticated tracker entry, verifies the burn root, event-derived
burn ID, amount, recipient, ERG lane, and DUP R5 digest, and preserves the exact
T9 box IDs and canonical Sigma bytes.

The output is create-only and contains the deterministic authenticated V2
unsigned EIP-12 transaction, its unsigned transaction ID, contract identities,
canonical inputs, tracker and DUP histories, and the effective
ContextExtension guard result. DUP insertion order is preserved because it is
part of the AVL digest; history is explicitly bounded for offline resource
control. The pure preparation path is shared with the existing settlement
service, so the offline artifact and daemon construction use the same plan and
transaction builder. The offline result does not receive the process-local
runtime preparation provenance capability; only the service path may add that
capability after fresh burn verification, fail-closed planning, and current-box
selection.

This command imports no bridge configuration and reads no environment
credential, runtime database, deployment state, node, signer, or wallet. It
does not perform `/transactions/check`, sign, submit, broadcast, deploy, or
create setup state. Its unkeyed digests provide deterministic content binding,
not source authentication. A concrete T9 run and stateful non-broadcast node
acceptance remain open; R9 remains the finality authority, Gate 5 remains open,
and no trustless or production-ready claim follows.

**WP-06T11 implemented package-bound JVM-check orchestration:** the existing
authenticated settlement check command now requires the exact WP-06T10 package
and an operator-supplied expected package digest. Before proof collection or
signing, a previously checked candidate must carry that exact canonical digest
in the journal. After fresh native-checkpoint, burn, candidate, and current-box
revalidation, the command validates the package again and binds it to the
service-prepared transaction through a process-local capability. It then
rechecks the canonical Ergo anchor immediately before signing. The binding
requires the independently derived unsigned transaction ID plus the exact
claim, burn proof, tracker key/value,
DUP digest, payout, asset, recipient, contract singleton, and selected-box
identities. EIP-12 numeric amounts are compared in one canonical decimal form
so node JSON number/string representation differences cannot create a false
mismatch; the independently derived transaction ID remains the signable
identity. The capability also retains a semantic transaction digest and
rejects mutation of the prepared EIP-12 object after binding.

Only this package-bound capability reaches the production JVM-check entrypoint.
The check acceptance carries the package digest, and the local journal retains
that digest with the checked candidate; a legacy checked row without the
explicit package binding, or with a malformed/non-canonical digest, is
invalidated fail-closed on migration. The package
and journal remain non-authoritative: neither can replace fresh proof, burn,
UTXO, anchor, signer-context, or node checks, and the unkeyed package digest
does not authenticate its sources.

No signer, node, runtime database, or deployment-state artifact was used to
exercise a real check while implementing WP-06T11. A concrete T9 observation,
T10 package, and explicitly authorized in-memory signature against a current
non-mainnet `/transactions/check` endpoint remain required. No submit or
broadcast route was added, R9 remains the finality authority, Gate 5 remains
open, and no trustless or production-ready claim follows.

**WP-06T12 implemented target-state runtime candidate boundary:** the
portable Frontier runtime Wasm and the separate native V2 verifier now use
different signed attestation statements and trust registries. The runtime
statement binds the exact compact Wasm, source and runtime manifests, vendored
dependency closure, complete tool closure, locked/offline/frozen build command,
and V2 conformance vector. The native statement binds a distinct
`bridge-peg-in-runtime-identity-v2-verifier` binary, its own source/build
closure, the same conformance vector, and one exact execution-policy digest.
Neither statement reinterprets the V1 verifier profile.

The V2 policy joins both attestations with their distinct policy digests,
attestor keys and organizations, one complete runtime dependency manifest,
exact contained-launcher identity, validity window, policy epoch,
request/result schemas, fixed resource limits, and the sole
`--trusted-anchor-digest` invocation. Runtime and native attestor families must
remain disjoint. The dependency manifest accepts only a sorted unique lowercase
system-DLL list and rejects delay-loaded DLLs, non-system dependencies, and
sidecars. Both attestations reject use before their review becomes effective;
the native verifier artifact is size-bounded before it is read. The contained
authority reloads and revalidates both source-owned registries before and after
every execution. The native broker also requires one installer-owned
`AuthorityRecordV1` whose embedded profile digest, exact policy digest, and
minimum epoch match the invocation. Legacy epoch-only authority requires an
explicit migration that disables the old broker before the new record is
written. Parser and lexical crash-order tests are local only; an elevated
disposable-host interruption campaign remains mandatory before any authority
profile activation.
The T12 read-only collector assembled finalized `:code` request material,
reviewed runtime bytes, and reviewed native-verifier policy into a
provenance-bound candidate path. Its parent-only launcher hash/spawn/hash check
did not bind the started image. T13 superseded that weak bootstrap with the V2
protected installation, retained broker self-image and exact
`AuthorityRecordV2` check under the declared Windows administrator/kernel TCB.
Child output remains quarantined because the activation campaign and separate
proof authorities are still incomplete, not because another wrapper process is
required. The retained compatibility field
`launcherAtomicBootstrapProven=false` records that Node did not independently
observe the loader binding; it does not negate the broker's successful V2
self-image check. The result also states
`sidechainFinalityVerified=false`, `statementRuntimeStateVerified=false`,
`runtimeCodeStateProofVerified=false`,
`targetRuntimeBuildEvidenceMatched=false`, and
`targetRuntimeBuildIdentityVerified=false`. Runtime and native attestation
validation remain separately visible because they occur before launch. Even
after atomic launch is solved, target post-state `:code` will not prove which
runtime executed a historical record. This distinction is load-bearing when a
block changes `:code`: the block executes under the parent-state runtime and
exposes the next runtime in its post-state.

The source-owned runtime and native attestor registries intentionally contain
no active external profile, so the real source-owned composition fails closed
before execution until independent keys and custody are reviewed. Synthetic
fixtures exercise positive policy composition only; a production-shaped
positive integration is deliberately unavailable. No daemon or reconciliation
path imports the T12 result. A separate non-authorizing lineage/cutover model now
requires claim-present markers for producer-parent ancestry, every runtime
transition including change-and-revert coverage, replay-key monotonicity and
non-deletion, native post-execution record semantics, EVM replay-write-before-
token-mint atomicity, a complete mint and ownership-control entrypoint
inventory, and a reviewed cutover bound to an explicit Ergo
deposit-height range. Its shape-only normalizer is private; the public report
does not convert caller claims into positive verified fields. It keeps
the committed-vault identity separate and cannot mark runtime history,
historical mint absence, vault transition, admission, mint authority, Gate 5,
or production readiness as verified.

The WP-06T12 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | State fields | Downstream consumer | Failure if relaxed | Branches | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|---|
| Exact reviewed runtime Wasm | Runtime-build statement, dual signatures, exact artifact read, source/dependency/tool/build closure | Runtime profile/attestation, source identities, artifact SHA-256/size, V2 vector | Joint V2 policy and contained authority | An unreviewed or non-reproducible runtime could satisfy the target-state code hash | Reviewed supplied policy; canonical empty source registry | Synthetic signed runtime packet | Artifact/source/vector/build/tool/dependency drift, invalid/reused/revoked actors, unknown fields | Build-relative only; no history or mint authority |
| Separate exact native V2 verifier | Native V2 statement and exact executable read under the existing source-owned attestor registry | Native profile/attestation, core digest, artifact, policy digest, V2 vector | Joint V2 policy and broker target | Runtime attestation could silently authorize a different verifier, or V1 bytes could be reinterpreted | Supplied profile; canonical empty source registry | Synthetic signed V2 verifier packet | Artifact/source/vector/policy/build drift, signature and role failures, authority flips | Proof execution only; V1 unchanged |
| Exact two-attestation execution policy | Strict policy normalizer and native-attested policy digest | Both profile/attestation identities, both attestor policy digests, disjoint actor keys and organizations, runtime packet/artifact, native core/artifact, launcher, manifest, schemas, argv, limits, epoch/window | Dual-registry execution authority | Either attestation family, executable, launcher, dependency closure, or invocation could be substituted | Valid, not-yet-reviewed, and expired policy windows | Joint fixture re-signed after policy construction | Cross-family actor reuse, runtime/native binding drift, unsorted or extra dependencies, manifest/argv/schema/limit/validity/unknown-field changes | Validation emits no execution or funds authority |
| Trust roots and native policy record refreshed around execution | Source-owned registry loaders plus policy validation before and after contained launch; broker reads the complete installer-owned `AuthorityRecordV1` before staging and under the installer mutex before resume | Both reviewed reports, joint profile digest, exact policy digest, minimum epoch | Authority result provenance | Runtime package input, a stale registry, or a broker invocation outside the installed policy could add trust roots or change during execution | Pre-launch and post-launch; clean install, explicit legacy migration, policy rotation | Mocked reviewed dual-registry contained run plus native record parser/ordering tests | Either registry loss, mid-run change, malformed operation/digest/record, profile or policy mismatch, epoch rollback, weakened broker boundary | Contained proof execution; direct process forbidden |
| Quarantined target-state candidate | One collected request over `:code` and peg-in state, joined to reviewed pre-launch attestations; raw child output is reduced to digest and size | Target header/state-root request, code hash/size, build ID/packet digest, request digest, child-output digest/size, launcher atomicity boundary | Read-only diagnostic candidate; explicitly no daemon/reconciliation consumer | A caller could treat unauthenticated child output as finality, state proof, build matching, or execution identity | Membership and current-profile non-membership candidates | Rust vectors plus authority-bound TypeScript candidate evaluator | Code/build ID/packet drift, declaration drift, forged provenance, nested positive child claims, launcher/proof/identity promotion | Attestations verified pre-launch; child content is not exposed and all child-derived proof, matching, history, mint, Gate 5, and readiness fields are false |
| Producer runtime remains distinct | Lineage model fixes runtime-at-block-entry to parent-state code and separately records post-state `:code` | Execution block/parent, parent/post/producer code, upgrade-in-block flag and proof digest | Future authenticated lineage producer; no current lifecycle consumer | A set-code block could be attributed to the next runtime and create a false historical-absence conclusion | Upgrade in target block; no upgrade in target block | Three-runtime and no-target-upgrade models | Producer/post-state conflation, false flag, wrong block, missing exact transition | Structural non-authorizing model only |
| Complete lineage and cutover obligations | Bounded ordered transition model, per-runtime invariant profiles, finalized ancestry, reviewed cutover range | Every code transition/build, change-and-revert coverage, native replay record, EVM replay write before token mint, mint and ownership-control inventory, cutover decision | Future reconciliation hold release, only after independent provenance is implemented | Omitted runtime, direct token mint, or ownership route could make non-membership appear historically authoritative | Multiple transitions; cutover on set-code block and following block | Structurally complete fail-closed model | Gap/order/coverage/finality/profile/cutover drift and every premature claim | History, cutover, admission, Gate 5 and production remain false |
| Committed vault is separate evidence | Lineage model requires a distinct vault identity and refuses to verify it locally | Deposit/vault IDs, tree, asset, amount, recipient, identity digest | Future mint eligibility join | Runtime history alone could mint while the refundable deposit remains spendable | ERG V1 identity shape | Separate required-vault fixture | Vault-local verification flip and all mint/admission flips | Committed-vault transition and mint authority remain false |

WP-06T12 is local implementation and adversarial conformance only. It does not
activate external attestors, authenticate a complete live runtime lineage,
prove a committed-vault transition, release a reconciliation hold, execute a
stateful node check, sign, submit, broadcast, deploy, or close Gate 5.
Before any authenticated target-runtime claim, the implemented V2 binding must
pass its elevated disposable-host activation campaign and independent review,
and the separate proof authority must accept the child semantics.

**WP-06T13 implemented immutable launcher-installation binding:** the elevated
installer's default V2 profile resolves the 64-bit Program Files known folder,
protects every managed directory and V2 registry key with SYSTEM ownership and
explicit SYSTEM/Administrators/Users access, rejects reparse points, and copies
the reviewed launcher into a random sibling staging directory. It hashes and
flushes the staged file, publishes the digest-addressed directory with a
no-replace rename, then reopens and verifies the final image. The final
launcher must have the reviewed SHA-256 and size, one hard link, no
delete-pending state, and one exact volume serial plus 128-bit file ID.

Only after that verification does the installer write and flush the distinct
144-byte `AuthorityRecordV2`. The record binds `E2SAUTH2`, profile digest,
policy digest, launcher SHA-256 and size, volume serial, file ID, and monotone
minimum policy epoch. Existing images are verified rather than repaired or
overwritten. Existing records reject ambiguous values, epoch rollback,
same-epoch policy or launcher changes, and retained-launcher identity drift.
`AuthorityRecordV1`, its 80 bytes, explicit migration switch, fixed path, and
record-before-replacement installer ordering remain the compatibility profile.

The broker's V2 mode independently resolves `FOLDERID_ProgramFilesX64`,
requires the exact canonical
`<known-folder>\E2SBridge\NativeExecution\v2\Images\<launcherSha256>` final
path from its retained executable handle, verifies digest, size, link count,
delete-pending state, volume serial, and file ID against the V2 record, and
rechecks the complete record under the distinct V2 installer mutex. That mutex
and retained image survive target execution, stage cleanup, and the complete
buffered stdout write and flush. Abandoned mutex ownership is released before
the inconsistent predecessor state is rejected. The bounded TypeScript V2
caller requires a canonical digest-addressed V2 suffix and explicitly selects
record version `v2`; only the broker decides the exact known-folder root.

This closes the previously identified mutable-launcher substitution seam at the
local source/test level only. The implementation has not been exercised by the
required elevated disposable-host interruption, replacement, hard-link, ACL,
coexistence, rotation, race, and abandoned-mutex campaign. The candidate
therefore retains
`immutableLauncherInstallationRequired=true`,
`authorityRecordV2Required=true`,
`brokerSelfImageBoundToAuthorityRecordV2=true`,
`launcherInstallationActivationCampaignCompleted=false`, and
`launcherAtomicBootstrapProven=false`. The last field is the parent observer's
legacy non-claim, while the first positive binding is enforced by the retained
V2 broker image. Child output remains digest/size-only;
all child-derived proof, finality, runtime-build matching, execution identity,
mint, admission, Gate 5, and readiness fields remain false.

The WP-06T13 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Content-addressed immutable image | Elevated V2 installer, protected filesystem ACLs, stage/hash/flush/no-replace publish, final handle inspection | Actual 64-bit Program Files known-folder root, final retained-handle path, flat launcher SHA-256, size, volume serial, file ID, link count, delete-pending and reparse state | `AuthorityRecordV2` producer and broker self-image verifier | A mutable, relocated, or aliased path could execute bytes different from the reviewed launcher | Static installer-order matrix plus relocated-known-folder canonical-path unit fixture | Wrong known-folder root, digest directory, V1 path, replacement/repair path, missing hard-link or delete-pending checks | Local source/tests; elevated host campaign pending |
| Exact V2 authority record | Installer writes one fixed 144-byte binary value after final image verification and flushes it under protected 64-bit HKLM keys | Version tag, profile, policy, launcher digest/size, volume/file ID, epoch | Broker V2 record parser and current-image comparison | Policy rotation or a different executable identity could inherit reviewed authority | Exact V2 parser/identity fixture | Tag/length, profile/policy/digest/size/file ID and zero-size/epoch mutations; rollback and same-epoch script guards | Local parser and ordering evidence only |
| Rotation cannot race accepted output | Shared V2 global mutex, two complete record reads, retained executable handle, explicit stdout flush before release | V2 profile key/value, policy window, current image handle, complete buffered output | Contained target lifecycle, cleanup, parent-visible stdout publication | A policy/image rotation could occur between final validation and result publication | Rust mutex, one-megabyte no-newline blocking-flush fixture, and contained broker matrices | Contention, abandoned ownership and retry, record drift, release failure, flush failure, and child failure reject | Fail-closed local process boundary; denial of service remains possible |
| V2 requirement cannot promote the candidate | Strict TypeScript package parser and result-boundary assertions | Exact launcher path/digest, `recordVersion=v2`, campaign and all child-derived booleans | Read-only WP-06 runtime candidate collector | A caller could treat local installation checks as authenticated runtime proof or mint authority | Four focused TypeScript suites | V1/arbitrary/wrong-digest path and every premature boundary flip reject | Quarantined non-authorizing candidate |
| V1 compatibility is not reinterpreted | Explicit installer switch and broker default record version | V1 path, `E2SAUTH1`, 80-byte record, v1 key/mutex and migration order | Existing bounded V1 callers | V2 fields or ordering could silently change V1 identity/rollback semantics | V1 parser and installer-order regression | Unknown V2 selector and malformed/rollback V1 records reject | Compatibility only; no V1 activation claim |

WP-06T13 does not activate an external authority profile, authenticate target
runtime lineage, expose child proof contents, establish committed-vault
eligibility, release a reconciliation hold, execute a stateful node check,
sign, submit, broadcast, deploy, or close Gate 5. The next code slice is the
authenticated parent-state runtime-lineage producer; the elevated installation
campaign remains a separate operational gate.

**WP-06T14 implemented immediate parent-state expectation pairing:** the
read-only collector first obtains the execution-block V2 candidate for an exact
peg-in record-membership expectation, derives that SCALE header's parent hash,
and then obtains a second V2 candidate for a record-non-membership expectation
at the exact direct parent. The pair must share one trust anchor and Ergo
deposit, use consecutive heights and direct ancestry, and bind the expected
execution record to the exact execution block hash, height, sidechain, deposit,
and profile generation.

The parent request's `:code` supplies the expected producer runtime.
The execution request's post-state `:code` expectation is retained separately
so a declared code change in the execution block is visible without attributing
that block to the new runtime. Neither expected identity is accepted as proved
state while child proof claims remain quarantined. Both child outputs are
retained as digest and size only. Process-local evaluator, candidate, collected
wrapper, and lineage provenance plus exact request digests reject caller-built
clones.

The WP-06T14 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Direct parent/execution binding | Canonical SCALE-header parser plus paired V2 requests | Parent and execution hashes, parent hash in execution header, consecutive heights, state roots, request digests | Quarantined lineage candidate only | A post-state runtime from another block could be attributed to the record producer | Upgrade and no-upgrade parent/execution pairs | Wrong parent, non-consecutive height, header/request hash drift | Immediate pair only; no complete history |
| Exact record generation and execution identity | V1 record/profile decoders and generation matcher | Sidechain ID, Ergo box ID, profile revision/activation, execution hash/height, transaction hash, event index | Quarantined lineage candidate only | A record from another deposit, profile generation, or execution block could be accepted | Parent non-membership plus execution membership | Parent membership, execution non-membership, deposit/anchor/profile/hash/height drift | Structural binding only |
| Expected producer code comes from the parent request | Distinct parent and execution runtime-code expectations | Runtime digest, size, build attestation ID/digest, expected-code-change flag | Future complete-history producer after proof acceptance | A set-code block could be assigned to the new post-state runtime, or a request expectation could be mislabeled as proved state | Changed-code and unchanged-code expectation pairs | Conflicting size for one digest, crossed evaluator/candidate provenance | Both state-proof fields remain false |
| Candidate cannot authorize funds | Process-local evaluator, candidate, collected-wrapper, and lineage provenance plus fixed fail-closed boundary | Child-output digests/sizes and every proof, history, cutover, vault, mint, Gate 5, and readiness field | No daemon or reconciliation consumer | A locally paired diagnostic could release a mint hold | Frozen branded pair | Cloned candidate, crossed evaluator, forged collected wrapper, forged lineage clone, premature authority fields unavailable | Non-authorizing and quarantined |

WP-06T14 does not enumerate earlier finalized `:code` transitions, detect an
omitted change-and-revert interval, prove that every producer runtime preserves
the native replay key and EVM write-before-token-mint invariant, prove
historical mint absence,
approve a cutover, authenticate committed-vault consumption, or release any
funds path. It also does not complete the elevated launcher campaign or
external attestor custody. WP-06T15 extends this immediate pair into a bounded
complete-interval expectation candidate; accepted history, reviewed per-runtime
invariants, committed-vault eligibility, and cutover remain separate required
evidence.

**WP-06T15 implemented bounded complete-interval runtime expectations:** the
collector snapshots an explicit `inclusive-post-state` interval and its complete
state plan before the first asynchronous read. The interval starts at the exact
reviewed checkpoint post-state and ends at the exact peg-in execution block.
Each plan entry declares its expected height, target hash, V2 statement, and
provenance-bound evaluator. The composer then requires one directly linked
header and one V2 candidate for every height. Omissions, duplicates, reordered
heights, forked ancestry, endpoint drift, deposit drift, and trust-anchor drift
fail closed.

Every state before execution requires record non-membership; the final state
requires exact membership bound to the execution hash, height, sidechain,
deposit, and parent profile generation. The parser retains
`RuntimeEnvironmentUpdated` as a consistency signal. A changed expected
`:code` digest without that marker is rejected. A marker with unchanged
`:code` remains an explicit non-transition because the marker can cover runtime
environment changes other than code. A marker on the first checkpoint
post-state is rejected because its transition cannot be classified without the
checkpoint parent. A changed post-state at block `h` is recorded as active from
block entry `h + 1`, preserving the parent-state producer rule. Reappearance
of any earlier runtime digest is classified explicitly as a reversion.

Collection is bounded to at most 257 states, 64 MiB of aggregate serialized
collection material, a ten-minute default aggregate acceptance deadline, and a
thirty-minute maximum. Each child receives no more than the aggregate time
remaining, a late child result is rejected before entering the history, and the
completed wrapper is checked again before provenance and return. Because the
current RPC interfaces do not provide cancellation, this is a cooperative
acceptance deadline rather than a claim that an in-flight transport call is
forcibly terminated. The returned wrapper discards full
collections and retains only per-state request/output digests, heights, hashes,
and byte counts. One runtime-code digest must map to one exact artifact size and
build-attestation identity across the interval.

The WP-06T15 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Explicit complete interval | Snapshotted interval and state plan plus canonical SCALE-header parser | Inclusive semantics, checkpoint/execution hashes and heights, expected height per entry, parent hash, state root | Quarantined history candidate only | A runtime change or reversion could be omitted between sampled states | No-change and `A -> B -> A` intervals | Missing, duplicate, reordered, forked, inverted, oversized, or endpoint-drifted intervals | Structural candidate completeness only |
| Runtime transition semantics | Per-height expected `:code` identity plus header digest classification | Runtime-change block hash/height, next block-entry activation, previous/next code identity, update marker, reversion flag | Future invariant-profile join | An execution block could be assigned to post-state code, or a change/revert could disappear | Changed, reverted, and same-code-marker cases | Unmarked code change, unclassifiable start marker, conflicting size/build identity | Expected transitions only; state proofs remain unaccepted |
| Historical record shape | V2 non-membership statements followed by exact final membership and T14 parent/execution join | Deposit, sidechain, profile generation, execution hash/height, transaction hash, event index | No daemon or reconciliation consumer | Earlier membership, a wrong deposit, or a record from another execution could enter the interval | Checkpoint-to-execution non-membership/membership sequence | Early membership, missing final membership, profile drift, record hash/height drift | Historical mint absence remains false |
| Aggregate resource and mutation boundary | Pre-RPC snapshot, state/byte/time caps, process-local provenance, digest-only returned summaries | Plan snapshot, 257-state cap, 64 MiB cap, aggregate deadline, request/output digests | Local collection caller only | Mutable caller state or unbounded proof material could change or exhaust the campaign | Ordered bounded collector | Mid-collection caller mutation, byte/time exhaustion, cloned/crossed capabilities | No proof, mint, Gate 5, or readiness authority |

WP-06T15 establishes complete candidate coverage only for the explicit bounded
interval. It does not accept GRANDPA finality or any child state proof, prove a
stable collection snapshot, authenticate external attestor custody, complete
the elevated launcher campaign, verify that the checkpoint predates deposit
eligibility, verify the runtime history, or prove historical mint absence. The
T16 slice below binds every distinct runtime identity to a versioned,
source-bound review of the replay key, EVM write-before-token-mint,
failed-mint rollback, and complete mint/ownership-control inventory. Cutover,
committed-vault eligibility, hold release, signing, submission, broadcast, and
Gate 5 remain separate and false.

**WP-06T16 implemented exact per-runtime semantic review bindings:** the
versioned invariant statement binds one raw-Wasm runtime and build-attestation
identity to an exact Frontier source lock/patch/runtime manifest and exact
`ErgoBridge`/`SERG` source, ABI, and compiled-bytecode hashes. The signed review
separates two different replay surfaces:

- native `ProcessedPegIns` is a monotonic post-execution record keyed by
  `Blake2b256("E2S_PEG_IN_RECORD_KEY_V1" || sidechainId || ergoBoxId)` and
  stored through `Blake2_128Concat`; it is not the write-before-mint guard;
- `ErgoBridge.processedPegIns[ergoBoxId]` is written before the external
  `SERG.mint` call in one EVM transaction, so a token-mint revert rolls back the
  Solidity replay write and prevents the later `PegIn` event.

The entrypoint manifest includes both `ErgoBridge.mintSERG` and direct
`SERG.mint`, plus all inherited ownership-changing calls on both contracts.
Therefore an observed `PegIn` event is not sufficient evidence of the expected
mint: exact deployed bridge/token code, bridge-to-token binding, current token
owner, ownership history, and supply/mint history remain separate deciding
evidence. The profile also refuses to claim that the current ambient Solidity
compiler/dependency path is reproducible.

The T16 composition layer consumes only process-provenanced T15 histories and
process-provenanced review reports. It requires exact coverage of every
distinct runtime/build identity, one reviewer-policy digest, unique review
packets, and an explicit binding for the execution producer runtime.
Contiguous post-state ranges and runtime re-entry are retained, so
`A -> B -> A` needs one exact profile for A and one for B without losing the two
A intervals. Supplied-policy candidates and canonical source-owned reviews use
separate constructors, branded types, and provenance sets. The canonical
review API evaluates policy validity against its internal current clock rather
than caller time. The canonical reviewer registry intentionally remains empty;
supplied-policy positives are test fixtures and cannot establish or obtain
canonical reviewer custody.

The WP-06T16 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Runtime/source review identity | Signed V1 review packet plus source-owned reviewer policy | Runtime digest/size, build ID/digest, source-binding digest, reviewer key/org, packet and policy digests | Quarantined supplied-policy candidate or separately provenanced canonical review | A review for different code or source could cover a historical interval, or a self-issued policy could be promoted as canonical | Current repository source and patch-byte binding under synthetic policy | Source, patch bytes/lock digest, ABI selector/topic, runtime size/build, signature, actor, validity, unknown-field drift, supplied-policy promotion, and getter/proxy reference swap | Canonical registry empty; no accepted review custody |
| Split replay semantics | Exact Frontier and Solidity source hashes plus fixed semantic statement | Native domain/key/hash/storage/post-execution timing; EVM mapping write, token call, event order, transaction rollback | Review packet and T16 digest only | The native record could be mistaken for the pre-mint guard, or a failed mint could retain EVM replay state | Exact V1 semantics | Domain/order/hasher/prefix/timing/rollback mutation | Source review only; no state proof or mint authority |
| Complete mint-control inventory | Exact bridge/token source, ABI, bytecode hashes and statement manifest | `mintSERG`, direct `SERG.mint`, both contracts' ownership transfer/renounce routes, required deployed code/token/owner bindings | Future deployed-state and historical-absence join | A direct token mint or ownership change could bypass bridge replay identity | Two mint routes and four ownership routes | Missing route, alternate mint count, proxy/delegate/fallback count, ownership prerequisite removal | Deployed state and ownership remain unverified |
| Distinct-runtime interval coverage | Provenanced T15 history plus one validated review per runtime | Every runtime/build identity, contiguous ranges, re-entry count, producer runtime, one policy digest | No daemon or reconciliation consumer | Missing or mixed reviews could hide a vulnerable runtime or reversion | No-change, contiguous A/B, and `A -> B -> A` | Missing/extra/duplicate profile, mixed policy, reused review, build drift, producer outside interval, cloned provenance | History and reviews not accepted for mint |
| Explicit unresolved atomic/build evidence | Fail-closed report boundaries | Whole-block callback rollback, reproducible Solidity compiler/dependency/storage-layout closure, deployed code/owner/history | Next WP-06 source-conformance slices | A source-ordering review could be promoted into a false deployed or rollback claim | All fields fixed false | Every authority/readiness flip rejected | Gate 5 and all funds authority false |

WP-06T16 does not prove that a callback failure after successful EVM execution
rolls back every EVM/native/block effect. It also does not pin a reproducible
Solidity compiler and dependency closure, authenticate a deployed bridge/token
pair, prove current or historical token ownership, accept T15 child proofs,
establish historical mint absence, approve cutover, or bind the committed
vault. The next source-level slice is the whole-block rollback conformance
case, followed by reproducible Solidity build closure. All lifecycle and funds
authority remains unchanged.

**WP-06T17 implemented pinned whole-block rollback conformance:** the Frontier
template-node test builds and imports three valid setup blocks using the exact
checked-in `SERG` and `ErgoBridge` creation bytecode, transfers `SERG`
ownership to the bridge, and verifies both deployed code and that ownership
through runtime API calls. Its fourth candidate applies a real `mintSERG`
transaction followed by root profile activation in the same block. Direct
runtime API reads from that pre-finalization overlay prove the exact bridge
token address, Solidity replay write, token supply increase, and recipient
balance increase. Finalization rejects because an active profile cannot admit a
`PegIn` from its own activation height.

The test then sends the same body through the actual `FrontierBlockImport`
wrapper with `StateAction::Execute`. The Wasm runtime trap rejects import. The
client retains the exact parent head and has no candidate header or body.
Queries at that accepted parent prove that the EVM sender nonce, token total
supply, recipient balance, `processedPegIns` mapping, bridge profile/address,
native `ProcessedPegIns` record, FRAME events, and Frontier current
block/receipts/statuses are unchanged. The rejected candidate uses the
runtime-produced state root and Frontier digest of a valid sibling built from
the same parent. A second valid sibling is paired with the first sibling's root
and digest as a mixed-header negative control. Parsed deterministic Wasm frames
show the candidate import sharing the direct callback witness path while the
mixed-header rejection diverges earlier. The first sibling then imports after
every rollback assertion. This distinguishes the callback path from an
unrelated header mismatch and proves importer usability, without claiming that
the rejected candidate has a valid header.

The WP-06T17 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative / control | Authority / status |
|---|---|---|---|---|---|---|---|
| Exact EVM setup | Pinned template node, exact fixture creation bytecode, signed legacy transactions | Chain ID, sender/nonces, token and bridge addresses/code, bridge-to-token constructor binding, token owner | Candidate authoring and import conformance only | A placeholder contract or failed ownership transfer could make the rollback test vacuous | Three accepted setup blocks plus runtime API code/owner checks | Any failed setup extrinsic, code query, owner query, or import fails the test | Local pinned-source conformance only |
| Callback is the rejecting boundary | Direct candidate overlay, same-height profile negative, and import-time Wasm witness | Timestamp, bridge token address, successful mint/replay/supply/balance changes, signed root profile activation, activation height, deterministic trap frames | Finalize and import paths | A reverted EVM call, different invalid extrinsic, or generic header mismatch could masquerade as callback rejection | Exact overlay deltas exist before finalization; candidate import shares the callback witness path | If mint/replay/balance/supply does not change, the callback accepts same-height `PegIn`, or the mixed-header control does not diverge earlier, the test fails | Pinned local runtime cause witness only; no finality or state-proof acceptance |
| Imported-state atomicity | `FrontierBlockImport` with `StateAction::Execute` | Parent/candidate hashes, sibling-derived root/digest, nonce, supply, balance, Solidity replay bit, native profile/address/record, events, current block/receipts/statuses | Pinned client backend | A callback error could retain EVM/native writes or an accepted candidate | Rejected import with exact parent snapshots unchanged | Any state delta, candidate header/body, or best-head movement fails; mixed-header rejection is separately observed; valid sibling import proves the importer remains usable | No mint, lifecycle, settlement, or funds authority |
| Fixture provenance boundary | Source lock plus outer-artifact SHA-256 and Git-blob equality | Artifact path, fixture path, SHA-256, fixture patched blob | Source verifier and future reproducible-build join | Fixture drift could invalidate the tested bytecode while appearing source-locked | Exact current artifact bytes pinned in the Frontier patch | Outer artifact hash drift or fixture blob drift fails source verification; reproduction remains open | Reproducible build and deployed identity false |

WP-06T17 evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for the exact pinned local callback rollback boundary |
| Independent review | `complete`; the corrective raw-diff review found no unresolved blocking finding |
| CI | `not_run`; local targeted and full repository suites passed |
| Target runtime | `verified` against the pinned local Frontier test client only; no deployed runtime was exercised |
| Readiness | `local_only` |

WP-06T17 addresses the pinned whole-block rollback conformance item. By itself
it does not show how the Solidity artifacts were reproducibly produced,
identify any deployed bridge/token pair, prove ownership or supply history,
accept T15 child proofs or sidechain finality, establish historical mint
absence, approve cutover, bind the committed vault, or authorize mint. WP-06T18
below closes only the local build-reproduction item. All lifecycle and funds
authority remains unchanged.

**WP-06T18 implemented reproducible Solidity build closure:** the package-local
compiler driver rejects ambient imports and requires exact `solc 0.8.35`,
OpenZeppelin `5.6.1`, npm lockfile v3, the reviewed `osaka` settings, and the
complete normalized source closure. The lock overrides the vulnerable legacy
`tmp` dependency requested by solc with audited `tmp 0.2.7`; `npm audit`
reports no known vulnerability in the installed closure. Build and check modes
share one in-memory compilation path. `build` writes only after successful
compilation; `check` writes nothing and rejects missing, unexpected, or
byte-drifted artifacts.

The generated manifest binds the build driver, package manifest and lock,
settings, every compiler input source, ABI, creation bytecode, deployed runtime
bytecode, compiler metadata, and storage layout. Bytecode identities include
both exact file hashes and hashes of decoded EVM bytes. Source lock v3 binds
that manifest, validates every local artifact and non-claim boundary, and
retains the existing Frontier fixture hashes. Both creation files are
byte-identical to WP-06T17. The relayer ABI fragments now live in a config-free
module and are compared structurally with the generated ABIs; this found and
corrected a stale `view` declaration for the contract's pure `decimals()`
method.

The WP-06T18 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Compiler and dependency closure | Package manifest/lock plus strict compiler driver | solc package and long version, OpenZeppelin version/integrity, full npm lock, `tmp` override, Node/npm engines | In-memory build/check | Ambient or drifting dependencies could produce unreviewed code under familiar source names | Clean `npm ci` plus compiler check | Wrong version, lock integrity, unsupported import, diagnostic, or unexpected output fails | Local build only |
| Exact compiler inputs | Settings file and normalized source collector | EVM target, optimizer, metadata, IR, libraries/remappings, LF source/import hashes, input-closure digest | solc standard JSON input and manifest | Platform EOL or implicit default drift could change metadata or executable bytes | Exact current source/import closure | Any settings, source, import, or driver drift changes the manifest/check result | No deployed identity |
| Complete artifact identity | Generated manifest and source-lock v3 validator | ABI, creation/runtime bytes and hashes, metadata, storage layout, file paths/lengths | Frontier fixture verifier, relayer ABI consumers, future deployment observer | Creation fixtures could differ from reviewed source, or a deployment could be compared only by ABI | Both current contracts reproduce exactly | Manifest digest, artifact file, runtime payload, path, length, scope, or fixture drift fails | Gate 5 and funds authority false |
| Relayer ABI compatibility | Config-free ABI fragment module and compiled-ABI conformance test | Function selector, mutability, inputs/outputs; event topic, types, and indexing | Sidechain client | A handwritten fragment could silently misstate the deployed interface | Current bridge/token consumer surfaces | Missing signature, selector/topic, mutability, type, output, or indexing drift fails | Encoding compatibility only |

WP-06T18 alone proves no deployed address or runtime code, bridge-to-token
ownership, current or historical owner, mint or supply history, accepted
finality/state proof, historical absence, cutover, committed-vault eligibility,
or mint authority. WP-06T19 below adds only current deployment observation from
explicit stable RPC views under a declared non-mainnet scope and remains
non-authorizing. Gate 5 and readiness remain open.

**WP-06T19 implemented deployment identity observation:** the config-free
observer loads the tracked WP-06T18 build closure, derives an opaque artifact
profile from the exact runtime bytes, and accepts only explicit credential-free
RPC origins, explicit bridge/token addresses, an expected chain ID, and an
explicit non-mainnet scope. Its JSON-RPC client exposes only `eth_chainId`,
`eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`, and `eth_call`.

Each origin binds the same block number and block hash before and after all
reads. At that exact block, both runtime byte strings must equal the tracked
artifacts, `ErgoBridge.sergToken()` must equal the explicit token address, and
`SERG.owner()` must equal the explicit bridge address. The bridge owner is
recorded rather than interpreted. Two distinct canonical origins must produce
the same complete view digest before a provenance-bound candidate is emitted.

The WP-06T19 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Tracked deployment code | Validated Solidity closure plus exact runtime files | Manifest/profile digests, runtime bytes, lengths, decoded SHA-256 digests | Stable per-source view | An address could run code outside the reviewed source/build closure | Exact bridge and token runtime bytes | Bridge and token code drift reject independently | Point-in-time identity only |
| Stable source snapshot | Fixed-method RPC client | Chain ID, tip height/hash before and after, EIP-1898 canonical block-hash selectors for code and calls | Source view digest | Reads from different same-height canonical views could be combined | Unchanged height/hash and canonical hash-bound reads | Height movement, same-height replacement, chain drift, malformed envelopes, or unsupported canonical selectors reject | No finality claim |
| Bridge/token binding | Exact block-tagged calls | Explicit bridge/token addresses, `sergToken()`, bridge owner, token owner | Deployment candidate and future history join | Wrong token or mint owner could bypass the reviewed bridge | Token bound to and owned by exact bridge | Wrong token binding and wrong token owner reject independently | Current state only |
| Two-source agreement | Opaque source pair with distinct canonical origins | Complete view digest and two source IDs | Non-authorizing candidate | One source could hide code, owner, or tip disagreement | Exact matching stable views | Same origin and any complete-view disagreement reject | Origins do not prove independent operation or consensus |
| Authority separation | Candidate schema and provenance | Every history, finality, mint, settlement, hold-release, signer, submitter, broadcast, Gate 5, and readiness field is false | Future WP-06T20 history join | Current state could be mistaken for historical absence or funds authority | Candidate carries explicit false boundaries | Forged profile/pair provenance rejects | Non-authorizing candidate |

WP-06T19 does not prove the deployment block, historical code continuity,
ownership history, direct-mint absence, supply conservation, accepted
finality/state proofs, cutover, committed-vault eligibility, or mint authority.
Two stable agreeing RPC origins are not an Ergo-verifiable finality consumer.
WP-06T20 must join this exact candidate to authority-bound finalized history
without releasing any lifecycle or reconciliation hold. Gate 5 and readiness
remain open.

**WP-06T20A implemented authority-bound observable deployment lineage:** a
source-owned profile binds the explicit non-mainnet scope, EVM chain ID, raw
Substrate genesis/sidechain identity, GRANDPA trust root, token and bridge
deployment coordinates, exact token pre-deployment parent, terminal execution
block, and bounded interval. The only registered profile is inert and intended
for conformance tests; operator configuration cannot register a deployment.

The fixed read-only collector requires same-process provenance from T19 and the
exact source-refreshed contained execution authority that produced the native
finalized checkpoint; direct-process verification is rejected. It scans every
block and one normalized receipt identity/status for every transaction in the
interval from two distinct origins. Each observation digest binds the
validator-consumed transaction fields, all receipt logs, indexed relevant logs,
code, and exact encoded state responses,
verifies exact creation and continuous runtime bytes,
reconstructs ownership, reconciles every mint and burn with per-block supply,
pairs each bridge `PegIn` with its token mint and replay mapping, and rejects a
successful direct top-level `SERG.mint`. The source head may advance during the
scan, but it must continue to cover the interval and the exact terminal block
hash is revalidated before output.

Per-response and per-source cumulative bytes, individual byte fields, requests,
total duration, per-block and total transactions, receipt logs, and receipt
concurrency are bounded. One source pair permits only one active observation;
failure cancels the peer and stops new receipt work before reuse. Deployment
receipts come from the scanned receipt set rather than a second independently
refetched snapshot.

The WP-06T20A producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Reviewed deployment and consensus identity | Source-owned profile registry plus canonical native GRANDPA digest helpers | Scope, EVM chain ID, genesis/sidechain ID, checkpoint, set/list/digest, deployment coordinates, start/terminal blocks, interval bound | Lineage collector and native-checkpoint join | Runtime input could approve its own chain, deployment, or trust root | Inert registered conformance profile | Unknown profile, genesis, authority-set, trust digest, checkpoint, start, or interval mutation rejects | Profile selection only; no live profile |
| Exact finalized terminal join | Same-process T19 candidate, source-refreshed execution authority, and its native checkpoint | Candidate/source/profile/authority digests, terminal height and execution hash, finality statement | Bounded history reconstruction | A caller-selected process, point-in-time code, or depth could be mislabeled as finalized history | Exact T19 terminal is bound by an authority-produced checkpoint | Direct-process or forged authority provenance, wrong trust/height/hash, chain drift, terminal replacement, or rollback below terminal rejects | Native terminal finality only |
| Complete validator-observed interval | Two bounded fixed-surface RPC sources | Every block/parent, validator-consumed transaction fields, one normalized receipt identity/status per transaction, every receipt log, indexed relevant log, exact block-hash code and encoded state result | Per-block observation digests and lineage assessments | An omitted or altered deciding transaction field, receipt, event, response, or code transition could hide mint or ownership history | Multi-block deploy, ownership, mint, and burn lineage agrees | Gap, duplicate, missing receipt/log, failed relevant receipt, calldata drift, code drift, source disagreement, malformed event, concurrent reuse, or resource-limit breach rejects | RPC observation; no trie-proof completeness |
| Mint and supply reconciliation | Token/bridge events plus exact post-block state | Owners, token binding, Transfer/PegIn fields, processed mapping, total supply | Non-authorizing candidate | Direct mint, replay drift, or inflation could be hidden | One bridge mint and later burn reconcile exactly | Direct mint, unpaired mint, replay false/duplicate, owner drift, or supply drift rejects | No committed-vault or mint authority |
| Authority separation | Candidate schema and provenance | Historical proof, anchor, lifecycle, settlement, signer, submitter, broadcast, Gate 5, and readiness fields remain false | Future T20B proof join | Observable agreement could release funds without authenticated historical state | Frozen non-authorizing candidate | Forged profile/candidate/checkpoint provenance rejects | Gate 5 remains open |

WP-06T20A does not prove native state-trie completeness or authenticate the
Frontier execution-block and receipt mapping against finalized native state
roots, independently prove historical absence, activate
an Ergo `0x04` finality consumer, approve cutover, establish committed-vault
eligibility, or authorize mint. WP-06T20B must authenticate the deciding
historical receipts and contract state through bounded native Substrate proofs,
including the exact `Ethereum::CurrentBlock` mapping, under state roots committed
by the finalized native chain while preserving these exact identities. Raw
Ethereum MPT/EIP-1186 proof machinery is not a substitute because this runtime's
committed state root is the Substrate state root. No lifecycle or reconciliation
hold may be released by T20B alone.

**WP-06T20B identity prerequisite implemented:** the T14 parent/execution
lineage, T15 complete history, and T16 invariant-review candidates now use V2
schemas and digest domains that keep the native Substrate terminal block hash
separate from the Frontier/EVM execution-block hash stored in the peg-in record.
The native identity selects the finalized state root; the execution identity is
the EVM block identity that a future proof must recover from
`Ethereum::CurrentBlock`. The candidates bind the shared numeric height but set
`executionBlockHashMappedToNativeState=false`. Distinct-hash positive fixtures,
wrong expected EVM identity, wrong native endpoint, ancestry, and height
negatives prevent the previous cross-domain equality from returning. No proof,
historical-absence, cutover, vault, mint, lifecycle, Gate 5, or readiness
authority follows from this correction.

**WP-06T20B execution and event proof cores implemented:** the pinned Frontier
source now contains bounded offline verifiers for one exact finalized native
header and one five-key Substrate trie proof over raw `:code`,
`Ethereum::CurrentBlock`, `Ethereum::CurrentReceipts`,
`Ethereum::CurrentTransactionStatuses`, and the derived `ProcessedPegIns`
record. The nested execution verifier requires the record height and decoded
Frontier block number to equal the native height, recomputes the canonical
transaction trie root and ommer-list hash, recomputes the Frontier header hash,
matches it to the execution hash stored in the record, and requires the record
transaction hash at exactly one block-body position. Native and execution block
hashes remain separate identities.

The outer event verifier authenticates the receipt and status SCALE bytes under
the same native state root, requires canonical transaction positions and hashes,
requires exact receipt/status log and bloom equality, recomputes the ordered
receipt root, and requires the target receipt to carry EIP-658 success status
one. The runtime-defined global event index must select the same transaction as
the processed record and an exact successful
`PegIn(address,uint256,bytes32)` log. Its emitter, recipient, raw nanoERG amount,
and source Ergo box identity must match the record, and another successful event
for the same source box in the authenticated block rejects.

The read-only TypeScript provider requests those exact ordered keys in one
`state_getReadProof` call. Its result normalizer binds the independently
supplied GRANDPA trust-root digest, exact native SCALE header, exact request bytes, proof bounds, record,
block, receipt, status, and event shape, but exposes the reported Rust result
only as an execution-unauthenticated candidate. Every reported cryptographic
success is projected back to `false`; only a future contained execution
authority may promote those claims. The outer report embeds a status-free
projection of the unchanged V1 execution-identity payload, so the legacy V1
`reviewed trust root` status is neither reinterpreted nor exported by this
caller-supplied-digest profile. A deterministic Rust-generated vector is
consumed by TypeScript, so the exact compact request bytes and report shape are
cross-language checked without treating caller-supplied output as proof
execution. The pinned local build now includes the separate event and
contract-state verifier binaries plus both deterministic fixture generators.
Each fresh pinned build runs both generators and requires each UTF-8 JSON
result to match its tracked vector after only CRLF-to-LF normalization and
removal of one optional final newline; each tracked vector is reread after
generation to reject concurrent drift before comparison, and the build report
retains both canonical vector digests. The source lock pins every new Rust file
and exact patched blob.

The completed T20B composition additionally authenticates both deployed EVM
runtime-code values and the deciding bridge/token storage under the same native
state root as that event. It proves the exact bridge owner, packed token/pause
configuration, post-event replay marker, token supply, and token owner. The
token must be owned by the exact bridge, and the configured token must match the
proved token address. Authenticated non-membership maps to the Solidity zero
default only for the bridge-owner and token-supply `ValueQuery` fields; the
configured token, replay marker, and token owner must have exact membership
values. The deterministic proof vector uses the exact reproducibly compiled
`ErgoBridge` and `SERG` runtime bytes rather than synthetic code. Exact code
hashes and lengths are joined to the tracked Solidity artifact profile and a
genuine same-process T19 deployment identity; exact event-block owners, supply,
event, and paired mint are joined to the genuine same-process T20A lineage
candidate. T19 must match the reviewed T20A terminal height and hash exactly
across their different prefix conventions; a later tip is rejected until
authenticated ancestry can prove that it descends from the reviewed terminal.
T20A remains bounded RPC corroboration rather than historical trie-proof
completeness.

This is still one authenticated post-state relative to an independently
supplied trust-root digest. It does not establish review or custody of that
trust root, authenticate execution of the caller-supplied verifier report,
prove the replay marker was false before the event, prove exact supply or
recipient-balance deltas, prove historical code continuity, prove the Ergo
committed-vault transition, or authorize mint admission. No daemon or
reconciliation path consumes it, and it does not close Gate 5 or establish
production readiness.

The WP-06T20B receipt/event producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Relative native finality and shared state root | Native GRANDPA verifier plus one independently supplied trust-root digest | Trust anchor, authority-set lineage, target native header/hash/height/state root, five proof keys and nodes | Execution-identity verifier, then receipt/event verifier | A valid proof from another chain, authority lineage, height, or state root could be relabelled as the target | Deterministic hash-linked checkpoint and five-key state proof | Wrong trust digest, chain, target header, ancestry, state root, key, node, or mixed proof rejects | Cryptographic only relative to the supplied trust root; no active runtime profile or custody claim |
| Native-to-EVM execution mapping | Authenticated `Ethereum::CurrentBlock` plus exact `ProcessedPegIns` value | Native height, execution height/hash, transaction and ommer roots, record transaction hash and unique position | Receipt/status verifier and future T19/T20A join | A receipt or event from another execution block could be attached to the finalized native state | Distinct native and EVM hashes in the generated vector | Height, execution hash, transaction root, ommer hash, missing transaction, or duplicate transaction rejects | Rust verifier result only; TypeScript keeps execution authority false |
| Canonical receipt and status state | Authenticated `Ethereum::CurrentReceipts` and `Ethereum::CurrentTransactionStatuses` under the same root | Exact key membership, bounded canonical SCALE vectors, typed receipt envelope, ordered receipt root, count, transaction index/hash, receipt/status logs and blooms, block bloom, EIP-658 status | Exact global event selector | An absent, malformed, oversized, cross-root, reordered, reverted, type-confused, bloom-divergent, or log-divergent transaction could be presented as the processed deposit | Legacy, EIP-2930, and EIP-1559 target receipts all reproduce their typed roots | Missing and empty values, malformed/trailing SCALE, wrong vector length, oversized value, proof from another state root, envelope mismatch, invalid status domain, receipt/status/header bloom drift, receipt root, status index/hash, reverted status, and receipt/status log drift each reject | One-block receipt semantics only; no historical completeness |
| Exact processed `PegIn` event | Global log selector plus the authenticated processed record | Transaction and log positions, emitter, signature topic, ABI recipient and padding, raw nanoERG amount/domain, source Ergo box ID | Future deployment, committed-vault, and idempotent-mint admission join; no current funds consumer | A different deposit, recipient, amount, contract, malformed ABI value, or duplicate source box could be admitted | Exact `PegIn(address,uint256,bytes32)` vector | Missing or cross-transaction global index, emitter, topic count/signature, recipient padding/zero/value, data length, zero/oversized/wrong amount, zero/wrong source box, and duplicate successful source-box event each reject | Event semantics verified only inside Rust; mint authority remains false |
| Build and candidate authority separation | Source lock, pinned verifier/codec/event/contract-state binaries plus both deterministic vector generators, exact request digest, and TypeScript candidate projector | Source/patch/toolchain digests, verifier and generator executable digests, both canonical generated-vector digests, request/trust-root digests, status-free nested V1 projection, outer supplied-digest status, reported claim shape, all candidate boundary flags | Future contained execution authority only | Caller-supplied JSON, a coordinated mutable-vector edit, a stale pre-generation vector read, inherited reviewed-root wording, or a different executable could launder proof success into lifecycle or mint authority | Both fresh generator outputs match post-generation rereads of their tracked vectors under the explicit EOL policy and are projected with all cryptographic claims false | Source/patch/vector bytes, vector drift during generation, nested V1 status injection, request bytes, trust-root, report fields, or a promoted boundary flag reject | Only the outer report status names the supplied trust-root digest; no review/custody, daemon/reconciliation consumer, hold release, Gate 5, trustless, or readiness claim |

The WP-06T20B deciding contract-state closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| One exact shared proof | TypeScript provider plus Rust `read_proof_check` | The prior five keys plus both `EVM::AccountCodes` keys and five exact `EVM::AccountStorages` keys, one target native hash/root, bounded unique trie nodes; the default HTTP cap covers the maximum aggregate proof after hex encoding plus bounded JSON overhead | Contract-state verifier | Code or storage from another root, block, address, or slot could be attached to the event, or a parser-accepted proof could be rejected by the default transport before verification | Deterministic twelve-key proof, exact frozen key literals, and maximum declared transport-bound acceptance | Wrong key, another-root proof, missing node, duplicate node, proof-node/byte overflow, changed target, or response-bound overflow rejects | Read-only collection and supplied-root-relative verification only |
| Exact deployed code identity | Canonical SCALE `Vec<u8>` decode plus SHA-256 and byte-length statement | Bridge/token addresses, account-code keys, decoded runtime bytes, hashes, lengths | T19 artifact/deployment join | Empty, malformed, oversized, or substituted code could inherit reviewed source semantics | The deterministic Rust vector embeds the exact reproducibly compiled `ErgoBridge` and `SERG` runtime artifacts and matches their tracked statement identities | Missing, empty, malformed/trailing SCALE, oversized code, wrong hash, wrong length, zero/colliding address rejects | Exact event-block code; no historical continuity or verifier-execution claim |
| Deciding post-state semantics | Canonical H256 storage decode, authenticated non-membership, and Solidity layout/default rules | Bridge owner slot 0, packed token/pause slot 3, replay mapping slot 4, token supply slot 2, token owner slot 5 | Event-block T20A join and future pre/post transition proof | Wrong token, owner, replay state, padding, or supply could be presented as a valid mint post-state | Configured token matches, token owner is bridge, replay is exactly one, and supply is exact uint256; authenticated non-membership yields zero only for owner and supply `ValueQuery` fields | Malformed words, address/config padding, noncanonical bool, wrong configured token, wrong token owner, replay not exactly one, or non-membership for configuration/replay/token owner rejects | One post-state only; no pre-state or exact delta proof |
| Exact deployment and lineage join | Genuine same-process T19/T20A/artifact/profile provenance plus exact event-block selection | Artifact/build digests, addresses/code, reviewed profile/trust, exact T19/T20A terminal identity, execution height/hash, event-block owners/supply, exact `PegIn` and zero-address token `Transfer` pair | Future mint-transition composition only | Terminal state could be confused with event state, a same-height fork or unauthenticated later tip could be accepted, or unrelated RPC history could decorate authenticated bytes | One dual-RPC integration test constructs genuine T19 and T20A candidates plus a strict T20B candidate; the event block precedes the exact shared T19/T20A terminal while exact event-state supply still joins | Earlier or later T19 tip, terminal hash drift, terminal/event identity mix, code/address/owner/supply drift, missing/duplicate event or mint, trust/profile/provenance drift rejects | T20A history is corroboration, not authenticated historical completeness |
| Funds-authority separation | Rust boundary, strict TypeScript report parser, WeakSet candidate provenance, no daemon import | Verifier execution, daemon admission, history, vault, mint, settlement, hold release, signing, submission, broadcast, Gate 5, and readiness remain false | No current funds consumer | A structurally valid report or local join could become mint authority | Generated Rust report is quarantined into a frozen non-authorizing candidate | Unknown report field, request/trust/root/code/storage drift, promoted boundary, cloned candidate, or forged join provenance rejects | Gate 5 remains open; no trustless or production-ready claim |

**WP-06T20C implemented direct-parent mint-transition proof core:** the pinned
Frontier source composes the unchanged T20B event-block verifier with one exact
direct-parent header and parent-state proof. The event header must name that
parent, heights must be consecutive, and both states remain bound to the same
independently supplied trust-root digest. The parent proof authenticates exactly
ten derived keys: raw native runtime code, native `ProcessedPegIns`, both EVM
runtime-code values, bridge owner and packed token/pause configuration, Solidity
`processedPegIns`, token supply and owner, and the exact recipient balance.
The post proof is the T20B twelve-key surface plus that recipient-balance key.

The transition requires native record non-membership and Solidity replay zero in
the direct parent, while the unchanged T20B post-state requires the exact native
record and Solidity replay value one. Native runtime code, deployed bridge/token
code, configured token, pause state, bridge owner, and token owner cannot change;
the bridge must remain unpaused and the token must remain bridge-owned. Checked
uint256 subtraction requires both total supply and recipient balance to increase
by exactly the successful `PegIn` amount. Across every authenticated successful
receipt, exactly one nonzero token `Transfer` that affects supply or the peg-in
recipient may exist, and it must be the same-transaction
`Transfer(0, recipient, amount)` preceding the `PegIn` log. This bounded V1
single-effect rule fails closed for blocks containing an additional mint, burn,
or transfer touching the recipient; a future batching profile requires a new
reviewed version rather than weakening V1.

The read-only collector derives all 13 post keys and 10 parent keys rather than
accepting caller-selected storage surfaces. It fetches the canonical direct
parent header, requests one bounded proof per state, then rechecks both parent
and event hashes after collection. The exact outer request retains the unchanged
T20B request as its post-state member. Caller-supplied Rust output is strictly
parsed and revalidated into a provenance-bound candidate, but all actual proof,
daemon, vault, mint, lifecycle, settlement, signing, submission, broadcast,
Gate 5, and readiness authorities are projected to false.

The deployment-lineage join accepts only process-branded T20C and T20B
candidates. It binds the nested request digest, trust root, separate
native and Frontier identities, exact tracked code/configuration/owners, replay
transition, supply and recipient deltas, and the exact PegIn/mint pair. T19 and
T20A remain the reviewed deployment and bounded history corroboration inputs;
they do not replace authenticated state proofs or prove historical completeness.
The pinned local build schema is now V3: five runtime binaries and three fixture
generators are built from a fresh isolated target, and the event, contract-state,
and mint-transition vectors must all regenerate byte-for-byte under their exact
source and toolchain locks.

The WP-06T20C producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Direct finalized parent | Canonical SCALE header decode, event parent hash, consecutive height, shared trust-root digest | Parent/event native hashes, heights, headers, state roots, trust-root digest | Parent/post transition verifier | An unrelated pre-state or same-height fork could manufacture a delta | Deterministic distinct parent and event headers | Rust isolates parent hash, height, and state-root drift; TypeScript isolates supplied trust-root and reported header drift; collector tests replace parent or event after proof collection | Relative to supplied trust root; verifier execution remains unauthenticated in TypeScript |
| Replay transition | Parent and post Substrate trie proofs over both replay domains | Native processed-record key/value and Solidity mapping slot/value | Future committed-vault and mint-policy join | An already processed deposit could be reminted, or a post-state record could be inferred without proving absence | Native absent and Solidity zero become exact native record and Solidity one | Parent native membership, parent Solidity nonzero, post absence, wrong post record, or noncanonical word rejects | Cryptographic proof core only; no mint authority |
| Stable contract identity | Exact runtime-code bytes and storage words in both states | Native runtime code, bridge/token runtime code, bridge owner, token configuration/pause, token owner | Deployment-lineage join | Code, ownership, token binding, or pause drift could change the meaning of the transition | Exact tracked artifacts, unpaused bridge, bridge-owned token in both states | Runtime/code/address/configuration/pause/owner drift rejects | Reviewed source/deployment linkage only; no historical-completeness claim |
| Exact single-effect mint | Authenticated receipts plus checked parent/post state arithmetic | PegIn transaction/log, token Transfer log, recipient, amount, supply, recipient balance | Future idempotent mint-admission policy | Aggregate deltas or an unrelated transfer could be attributed to this deposit | One same-transaction mint precedes PegIn; both deltas equal amount | Missing/wrong/duplicate mint, extra mint/burn/recipient transfer, underflow, supply delta, balance delta, recipient, amount, or ordering drift rejects | V1 single-effect profile; batching requires a new version |
| Fixed collection surface | Derived key helpers, bounded `state_getReadProof`, post-collection hash rechecks | Ordered 13-key post tuple, ordered 10-key parent tuple, proof node/byte bounds, exact targets | Rust request and quarantined TypeScript candidate | A provider could omit, substitute, or recollect state across a reorg | Exact RPC method/key/target fixtures and generated cross-language vector | Empty/duplicate/unknown key, wrong target, response overflow, parent/event replacement, request or report drift rejects | Read-only collection; RPC does not decide funds authority |
| Pinned build and provenance | Source/patch/toolchain locks, V3 isolated build, three regenerated vectors, WeakSet joins | Eight executable digests, three canonical vector digests, T20B/T20C request digests, T19/T20A lineage identities | Future contained execution and committed-vault join only | Mutable fixtures, stale binaries, or caller-created candidates could be promoted | Fresh build reproduces all vectors; join unit fixtures exercise exact binding after mocked child-provenance assertions, while child suites test their own candidate brands | Lock/blob/vector drift, unknown report field, boundary flip, clone, forged child provenance, or exact lineage-field mismatch rejects | Local conformance only; admission-ineligible and non-authorizing |

WP-06T20C proves the exact sidechain mint transition but not why that mint was
economically eligible on Ergo. In particular, it does not prove that the
refundable deposit box was consumed into the exact non-refundable vault before
mint, does not establish the active trust-root review/custody or contained
verifier execution authority, and is not imported by the daemon. WP-06T20D must
therefore bind this transition to a confirmed deposit-to-vault successor and one
idempotent mint identity before any later lifecycle authority can be considered.
Gate 5 remains open, and no trustless or production-ready claim follows.

**WP-06T20D implemented committed-vault mint correlation:** one explicit
versioned profile now joins the existing process-branded Ergo route
reconstruction to the process-branded T20C mint-transition lineage. The join
requires exactly one observed source deposit classified `committed`, exact
spending-transaction identity, recomputed confirmation count, absence of the
refundable source from the current snapshot, and exactly one matching vault box
in both historical and current vault observations. The underlying route
reconstruction already validates output zero as the exact configured vault
ErgoTree, full source value, no token substitution, and the source box,
recipient, amount, and depositor-tree registers.

The candidate binds native ERG in raw nanoERG, the H160 recipient, destination
bridge and token, sidechain profile, T20C supply and recipient-balance deltas,
and the exact replay transition. A new V2 T20C projection references the
complete V1 candidate digest and leaves the V1 schema, digest domain, fields,
and candidate identity unchanged. It deliberately reuses the existing
`E2S_PEG_IN_RECORD_KEY_V1` identity rather than creating a competing mint ID.
The native `ProcessedPegIns` storage key is independently rederived and must
match T20C. The exact Substrate `EVM::AccountStorages` key for the Solidity
processed-deposit mapping is also independently derived from bridge address,
source box, and slot before it is retained. The candidate is frozen, digest-bound, marked by
same-process provenance, and has no daemon or funds consumer.

The integration fixture creates genuine outer route, T20C V1, T20C V2, and
T20D brands. Its T20C parent-provenance assertions remain fixture-isolated;
the T20B/T20C producer suites independently exercise those proof semantics and
the integration test exercises only the outer cross-lineage composition.

The WP-06T20D producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Exact Ergo route provenance | Reviewed manifest parser, two stable bounded route observations, and process-local reconstruction provenance | Manifest digest/profile, network, source revision, snapshot and anchor identities, MCL and vault addresses/ErgoTrees | T20D correlation only | A caller-created route or another deployment could be attached to the mint | Integration fixture creates a genuine branded reconstruction from two distinct source objects | Cloned route, manifest/profile/network mismatch, source disagreement, unstable snapshot, wrong script/value/asset/register, or route blocker rejects in the route and T20D suites | Dual-source observation detects disagreement but is not an Ergo consensus or inclusion proof |
| Refund extinction and exact current vault | Route transaction/output validation plus T20D current-set checks | Deposit box and creation identity, spending transaction, inclusion block/height, recomputed confirmations, vault box/output zero, source-current absence, vault history/current membership | T20D correlation only | A refundable, unconfirmed, replaced, spent, or ambiguous backing box could decorate a mint | Confirmed source consumption with absent source and one current vault successor | Missing/duplicate source, refundable/pending/refunded/unresolved state, wrong/null transaction, confirmation drift, live source, or missing/duplicate current vault rejects | Snapshot-relative observation only; no historical causal-order proof |
| Exact economic and destination binding | Route register/value checks plus T20C event and transition checks | ERG zero asset ID, raw nanoERG amount, recipient H160, source box, sidechain, bridge, token, supply delta, recipient-balance delta | T20D correlation only | Another asset, amount, recipient, source deposit, or destination could be attributed to the mint | Exact route and T20C values join | Amount, declared amount, recipient, source box, sidechain, bridge, token, replay state, supply delta, or balance delta rejects | The V1 source box has no sidechain field; profile equality does not prove depositor intent |
| Stable replay identity | Existing runtime-state V1 derivation, canonical Frontier storage-key derivation, and separately versioned T20C projection | Preserved V1 candidate digest, `E2S_PEG_IN_RECORD_KEY_V1`, sidechain ID, source box, native processed-record storage key, Solidity processed key, exact Substrate EVM mapping storage key | Future versioned admission protocol; no current runtime/daemon consumer | Silent V1 reinterpretation, a second identity formula, or unrelated storage slot could hide replay or split idempotency domains | V2 references the unchanged V1 digest; existing V1 identity and both derived storage keys match | Runtime-record drift, native/EVM storage-key derivation drift, replay transition, or cloned T20C candidate rejects | Deterministic identity only; it grants no mint authority |
| Authority and causal separation | Closed candidate type, explicit limitations, all-false authority map, and no daemon import | Consensus, inclusion, source-side sidechain intent, consumption-before-mint, verifier execution, finality, mint, lifecycle, signing, submission, broadcast, Gate 5, and readiness fields | No current funds consumer | Retrospective field equality could be mislabeled as proof that backing existed before mint | Positive candidate retains every authority field false | Any forged source candidate fails provenance; static assertions and review reject promoted claims | Correlation evidence only; Gate 5 remains open |

T20D closes the deterministic cross-lineage correlation needed to expose the
remaining protocol gap; it does not close that gap. The current V1 MCL registers
do not encode sidechain ID, and the current V1 sidechain mint event and runtime
record do not commit the Ergo consumption transaction, its inclusion identity,
or the exact vault successor. A matching vault transition can therefore be
observed after a mint and still correlate. WP-06T20E must introduce a new
versioned causal admission object and reviewed source/runtime profile rather
than reinterpret V1 or grant authority to local timing, SQLite, or RPC
agreement. Until that object is consumed before mint and authenticated in the
sidechain transition, `sourceDepositSidechainBindingProved` and
`crossChainConsumptionBeforeMintProved` remain false.

**WP-06T20E-A implemented the causal admission format and pure transition
contract:** the canonical V2 family is defined in
`docs/peg-in-causal-admission-v2.md` and implemented by the relayer's pure
codecs and transition checker. It separates four fixed-width objects:

- a 313-byte active admission profile binding source/destination identities,
  bridge/token addresses, settlement policy, exact source-lock and vault
  ErgoTree hashes, finality policy, proof system and exact verifier profile,
  revision, and activation height;
- a 229-byte source intent binding that profile to the ERG asset, raw nanoERG
  amount, and recipient before the source deposit box exists;
- a 381-byte causal statement binding the source-intent ID and unchanged V1
  replay identity to the exact deposit box, creation transaction, confirmed
  commitment transaction, vault successor, Ergo inclusion/checkpoint, and
  finality policy;
- an unactivated 249-byte consumed V2 record retained only for byte-level
  compatibility detection, plus a runtime-producible 249-byte consumed V3
  record binding the admission and source intent to the exact native parent,
  mint height, execution block, transaction and indexes, plus the digest of the
  unchanged 205-byte V1 processed record.

All V2 integers are unsigned big-endian in the proof-neutral wire format. This
does not alter the existing little-endian SCALE V1 profile or record. The V2
profile, source intent, and admission IDs use distinct Blake2b-256 ASCII
domains. The admission statement must carry the exact existing
`E2S_PEG_IN_RECORD_KEY_V1` identity; profile rotation therefore cannot create a
second mint identity for one source box.

The pure transition checker requires one exact pending admission in the direct
native parent, absent V1 processed and V3 consumed state in that parent, and an
admission height after profile activation but no later than the parent. It
binds the unchanged `PegIn` fields and supplied token address to the V2 source
intent, requires direct parent/child native identity, checks the active V1
runtime profile, and requires
the post state to delete the pending object while creating the exact V1 and V3
records under the same replay key. Separate checked-in vectors preserve the
unchanged V2 bytes and freeze every V3 byte. Every profile, intent, statement,
parent, mint, and transaction field changes its relevant bytes or identity.
Isolated negatives cover invalid or inconsistently bound objects plus
missing, replayed, same-block, retained, mis-keyed, wrong-token/event,
wrong-profile, wrong-proof, wrong-V1-record, and wrong-consumed-record cases.

The WP-06T20E-A producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Versioned source intent | V2 profile/intent codecs and profile-to-intent binding | Source network, sidechain, bridge, token, settlement/admission profiles, zero ERG asset ID, raw amount, recipient | Future V2 MCL and vault ErgoTrees | A deposit could be redirected to another sidechain, contract, asset, amount, recipient, or policy | Exact 229-byte vector and source-intent ID | Every field, version, zero recipient, zero/overflow amount, and nonzero asset mutation rejects or changes identity | Canonical format only; current MCL/vault V3 do not implement it |
| Causal deposit commitment | V2 profile/statement codecs and binding checker | Source-intent ID, V1 replay identity, source box/creation, commitment transaction, exact source-lock/vault trees and vault box, inclusion/checkpoint, finality policy/depth | Future proof adapter and pending-admission runtime state | A later, script-substituted, or unrelated vault could be correlated to an earlier mint | Exact 313-byte profile, 381-byte statement, and admission ID | Every field changes identity; insufficient depth, identity alias, wrong intent/profile/tree/finality, or V1-key drift rejects; coordinated tree rotation requires a new active profile | Structural statement only; no Ergo inclusion, canonicality, or active-profile proof |
| Stable replay domain | Existing V1 key derivation plus V2 admission binding | `E2S_PEG_IN_RECORD_KEY_V1`, sidechain ID, source box ID | Pending, V1 processed, and V3 consumed maps | Profile rotation or a second admission key could remint one deposit | All three state roles use the exact V1 identity | Wrong key in any parent/post role rejects; profile rotation changes V2 admission IDs but not V1 replay identity | Deterministic identity only |
| Parent-before-mint state relation | Pure T20E transition checker | Direct native parent/hash/height, pending admission and admission height, absent parent V1/V3 state | Future runtime callback and direct-parent proof verifier | Same-block or post-mint admission could manufacture causality | Parent contains the exact admission before the mint child | Missing, already processed/consumed, same-block, pre-activation, wrong-parent, or retained pending state rejects | Supplied-state conformance only; no trie proof |
| Atomic consumption and mint record | Pure T20E transition checker plus unchanged V1 codec | PegIn box/token/recipient/amount, native-parent/execution identities, mint height, transaction/indexes, exact V1 record and V3 consumed record | Future whole-block runtime producer composed with authenticated T20C state | Mint could survive without consuming the admission, target another token, or consumption could describe another mint | Pending disappears while exact V1/V3 records appear under one key | Token/event, profile, proof identity, V1 bytes, V3 bytes, or post key mutation rejects | Supplied relation only; no T20C composition, runtime producer, whole-block rollback, child-header proof, or mint authority yet |

**WP-06T20E-B implements the source-side state transition without activating
it:** `MainChainLockCausalV2`, `MainChainCausalVaultV2` and
`DoubleUnlockPreventionCausalV2` are new, distinct ErgoTrees; no V1 script,
vector, deployed identity, or funds path is changed.
The source lock requires an exact 229-byte intent under the compiled Ergo
network, native ERG amount equal to the complete box value, a nonempty depositor
tree, and no tokens. Before timeout, a 2-of-N transitional committee guard can
consume that box only into output zero under the exact linked causal-vault ErgoTree, copying
the intent and recording `SELF.id`. The timeout branch instead returns the
complete value to the exact depositor after 10,000 blocks. Both branches require
a separate fee input, so source collateral never funds their miner fee.
The refund output also records the exact source box ID in R4, so two source
locks cannot share one equal-value refund output.

At timeout, commitment closes and the refund branch becomes available, so the
committee cannot race a late commitment against an eligible refund.

The causal vault has no timeout or depositor branch. Its current bounded payout
path composes the existing authenticated tracker lookup, canonical V1 burn
leaf, recipient/amount/ERG binding, and atomic DUP insertion. It additionally
requires the source intent, tracker R6 and burn leaf to identify the same
sidechain. A partial payout recreates the exact vault script and preserves the
intent and source-box ID byte-for-byte. This is source-state exclusivity, not a
new finality result: tracker R9 remains the disclosed finality authority and
Ergo anchor depth remains only anchor age.

The causal path uses a distinct DUP singleton contract whose predicate binds
input one to the exact causal-vault ErgoTree hash. The existing authenticated
DUP remains bound to its existing unlock hash and is not reused or relabelled.

The pure commitment and refund planners derive R4/R5 from the source box rather
than caller-supplied replacements, bind the exact active source-lock ErgoTree,
configured network and admission profile, require pure ERG source and fee
inputs, and preserve exact value. The
wire amount is `u64`, while this concrete Ergo profile is explicitly bounded to
the positive signed-`Long` range. Monetary planning stays in `bigint` and emits
exact decimal strings rather than rounding through JavaScript `number`. The
separate causal settlement builder retains only R4/R5 as successor provenance
and rejects source network, admission profile, sidechain, source identity,
asset, amount, tracker, DUP, deployment, or transaction-shape drift before
proving.

The T20E-B producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Canonical refundable source state | Source-intent codec, source planner and source-lock predicate | Exact active source-lock ErgoTree; R4 exact 229 bytes; R5 depositor tree; version, compiled network, zero asset, positive amount equal to `SELF.value`, no tokens | Commitment/refund branches and future admission proof | An arbitrary-script, malformed, cross-network, token-bearing, amount-substituted or unrecoverable source could enter the profile | Planner fixture plus compiled source-lock commitment/refund VM cases | Wrong source tree on commitment and refund, wrong network/profile/value/token, and missing R4/R5 planner cases reject; noncanonical contract fields reject | Local format and ErgoTree enforcement only; no source inclusion proof |
| Exclusive committed collateral | `MainChainLockCausalV2` normal branch | Pre-timeout height, exact linked vault proposition, full value, empty token vector, unchanged R4, R5=`SELF.id`, output zero, 2-of-N guard | Causal vault and future T20E-C pending admission | Minted backing could remain refundable, lose value, change script, lose causal source identity, or race an eligible refund | Synthetic full-value source-to-vault transaction signs in sigma-rust | One-of-three quorum, late commitment, wrong tree, reduced value and wrong R5 reject independently | Synthetic VM verified; committee is transitional activation guard, not mint authority |
| Exact timeout refund | Source-lock timeout branch and refund planner | `HEIGHT >= creationHeight + 10000`, depositor proposition, full source value, no tokens, refund R4=`SELF.id` | Depositor recovery before commitment | A third party could redirect or skim the source, refund before the declared window, or make multiple source inputs share one refund output | Mature exact-value source-bound refund signs | Wrong recipient, wrong source ID, shared refund output and premature refund reject independently | Applies only while the source UTXO remains unspent |
| Non-refundable committed vault | Absence of refund branch plus authenticated settlement predicate | No depositor register semantics or timeout branch; only proof-bound payout shape | Burn claimant, DUP successor and optional vault successor | A committed deposit could be reclaimed after mint | Authenticated causal-vault payout signs | Static branch assertions plus malformed payout/input-order VM cases reject | Local contract property; existing R9 finality trust remains |
| Vault provenance continuity | Causal vault and settlement builder | R4 exact source intent; R5 exact nonzero source box ID; exact successor script/value | Later payouts, inventory and future causal proof consumers | Partial settlement could detach remaining collateral from its source intent or box | Partial payout preserves only R4/R5 | R4 and R5 successor mutations reject independently; zero R5 input rejects | Local successor invariant |
| Causal replay singleton | `DoubleUnlockPreventionCausalV2`, causal builder and vault NFT constant | Distinct singleton ID, exact same-run causal-vault ErgoTree hash, tracker NFT, AVL digest/proofs, counter and metadata | Causal vault payout and later replay checks | Reusing the old hash-bound DUP or compiling dependent trees from inconsistent identities would strand the vault or let deployment labels hide a different predicate | Causal DUP and vault reduce together | A DUP compiled for another vault hash and input-order drift reject independently; check-only compiler derives dependencies from one in-memory vault result; unit fixture uses a distinct causal NFT/tree identity | New check-only, non-deployed profile; no current singleton or migration claim |
| Same-sidechain settlement | Causal vault and settlement builder | Source-intent sidechain, authenticated tracker R6 and burn-leaf sidechain | Tracker-key lookup and value release | Collateral committed for one sidechain could satisfy another sidechain's burn | Matching source/tracker/burn fixture signs | Source-intent sidechain and tracker-R6 mutations reject independently | Does not establish bridge/token producer identity or sidechain finality |
| ERG conservation, numeric exactness and size bound | Source/vault predicates, pure planners and VM measurement | Source and payout asset zero, exact source value in positive Ergo `Long` range, decimal-string outputs, effective fee within the on-chain range, serialized boxes below 4,096 bytes | Ergo consensus and future operator tooling | Asset substitution, fee skimming, JavaScript rounding, dust absorption above the contract fee cap, overflow or an unspendable oversized box could be constructed | Positive source, refund and payout fixtures; values above `Number.MAX_SAFE_INTEGER`; per-run size measurement | Non-ERG intent, source token, fee token, reduced vault, inexact numeric input, out-of-range amount, over-cap effective fee and invalid payout values reject | Current ERG lane only; `u64` wire values above signed `Long` are outside this contract profile; no token-lane claim |

The loopback node is used only to compile the exact linked sources. Full
synthetic transactions are reduced and proved through `ergo-lib-wasm-nodejs`;
the matrix has three positive branches and eighteen isolated rejections. It
does not call node transaction check, an operator wallet, submit, or broadcast.
The exact profile hash rule is Blake2b-256 over the compiled ErgoTree bytes, not
source text or an address, and the VM derives the profile after compiling both
linked trees.

WP-06T20E-B evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for the exact check-only causal source transition and authenticated settlement conjunction |
| Independent review | `complete`; the fresh current-diff review found no remaining finding within the stated non-deployed scope |
| CI | `not_run`; focused and full repository checks are local evidence only |
| Target runtime | `not_run`; loopback compilation and synthetic sigma-rust VM execution do not establish node transaction or deployed-runtime acceptance |
| Readiness | `local_only` |

T20E-B alone does not implement the Frontier runtime transition, proof
admission, or authenticated source inclusion/canonicality. T20E-C below now
implements the parent-bound runtime consumption relation without adding a
pending-admission producer or proof authority. T20E-D below now authenticates
parent presence/absence and post consumption under consecutive state roots and
adds a bounded fail-closed lifecycle projection. It still does not prove the
Ergo source transition, write a pending admission on-chain, or grant funds
authority. Until that source-proof producer and the complete proof-authority
composition are implemented and independently reviewed, both causal authority
fields remain false and Gate 5 remains open.

**WP-06T20E-C implements parent-bound runtime consumption without activating
mint authority:** the pinned Frontier patch reproduces the exact T20E-A V2
profile, source-intent and statement bytes plus the parent-bound V3 consumed
record. Rust and TypeScript both reject source amounts above Ergo's positive
signed-`Long` range, the Frontier peg-in event verifier and peg-out commitment
producers enforce the same bound, and the runtime rejects the unactivated
consumed V2 format. The existing `u64` wire encodings remain unchanged.

One root-only, one-way configuration call may activate an exact causal profile
only when its canonical profile ID, existing V1 sidechain/bridge profile,
activation height, current bridge/token runtime-code hashes and lengths, and
every bounded keyed pending object agree. The same dispatch stores the
immutable profile and sticky marker, then permanently removes the current
runtime's `sudo` key. This is configuration, not deposit admission. The runtime
exposes no call or adapter that can create `PendingCausalPegInsV2`; the client-
level fixture preloads one exact pending object through privileged test-only
`System::set_storage` before cutover and therefore supplies no proof or funds
authority.

Pallet Ethereum invokes a new fallible hook at the start of block processing,
before EVM execution. The hook validates a bounded, duplicate-free pending-key
set and snapshots the exact direct-parent causal/V1 profiles, pending object,
V1/V3 replay absence, native parent hash/height, reviewed bridge/token code,
bridge configuration and owner, token owner, Solidity replay word, token supply,
and recipient balance. The post-execution callback then requires exactly one
causal mint in the block, an exact successful `PegIn`, one preceding
`Transfer(0, recipient, amount)` and no other nonzero supply/recipient token
effect. The bridge/token code, binding, pause state and owners must remain
unchanged; the Solidity replay word must become canonical true; total supply and
the exact recipient balance must each increase by precisely the admitted
amount.

All fallible profile, receipt, log, code, storage and arithmetic checks complete
before native storage or events change. Acceptance deletes the exact pending
object, inserts the unchanged V1 record and exact V3 consumed record under the
same replay key, updates the bounded key list, and emits the corresponding
events in the same block transition. Same-block admission plus mint rejects
because the pre-EVM snapshot cannot see the injected state. Once activated, the
causal profile cannot be disabled or replaced. The V1 bridge profile is
permanently frozen and runtime upgrades remain forbidden; any future migration
needs a separately versioned, explicitly reviewed transition before cutover.
The node Wasm matrix additionally proves that signed post-cutover
`sudo(System::set_storage)` attempts against the V1 profile and `:code` leave
both values unchanged. V1 profile change/removal, runtime upgrade,
code/configuration/owner drift, replay appearance, malformed or duplicate
pending state, wrong mint ordering, wrong supply/balance delta, and admission-
free mint all reject before a block is accepted.

The WP-06T20E-C producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Cross-language format and amount parity | TypeScript codecs plus pinned Rust causal, event-proof and runtime modules | Exact V2 profile/intent/statement bytes and IDs; exact V3 bytes; unchanged `u64` wire fields constrained to a positive amount no greater than signed `Long` | Runtime profile, pending state, peg-in evidence, burn-root producer and consumed-state proof path | An admission or burn could decode differently across stacks or describe value the Ergo contracts cannot represent | Checked-in vectors reproduce byte-for-byte in both stacks | Unsupported/consumed V2, field mutations and amount `2^63` reject on peg-in and peg-out paths | Deterministic format evidence only |
| Exact active runtime profile | Root configuration and pre-block validation | Profile bytes/ID, activation height, V1 sidechain/bridge, bridge/token addresses, code SHA-256 and lengths, exact keyed pending values | Parent snapshot and post-EVM causal verifier | A rotated contract, token, incompatible profile or malformed preloaded admission could inherit authority | Exact real compiled bridge/token profile and bounded pending object activate once | Wrong ID, height, address, code, profile, duplicate key, missing value, invalid admission or reactivation rejects | Root configuration is not proof admission |
| Direct-parent admission snapshot | Pre-EVM `on_block_started` hook | Parent hash/height, exact pending bytes/digest, key list, V1/V3 absence, profiles, code/configuration/owners/replay/supply/balance | Post-EVM callback | Same-block or modified admission and post-only state could be presented as causal | Pending parent imports before its mint child | Missing value, duplicate key, replay state, wrong profile, same-block injection or stale snapshot rejects | Runtime execution; parent trie proof remains T20E-D |
| Exact reviewed mint transition | Post-EVM callback composed with real bridge/token state | PegIn fields, transaction/status/log indexes, one preceding token mint, code, token binding, pause, owners, replay word, supply and recipient delta | Native V1/V3 record producer | An event-only, direct-token, wrong-order, wrong-code or wrong-delta mint could consume backing | Real pinned contracts mint once from one admitted parent | Event/token/order, code, owner, configuration, replay, supply and balance mutations reject independently | Local pinned runtime evidence; no deployment claim |
| Atomic pending consumption and replay state | Post-EVM callback after all fallible checks | Pending deletion, unchanged V1 record, exact V3 record, replay key, events, remaining key list | T20E-D child-state proof and future reconciliation | Mint or replay state could survive a failed native check, or consumption could name another parent | Imported child contains exact V1/V3 and no pending object | Callback failures preserve parent native and EVM state; replay/retained/mis-keyed state rejects | Whole-block local import evidence |
| One-way causal migration | Activation-time pending validation, immutable causal/V1 profiles, sticky marker and atomic removal of the current runtime's `sudo` key | Keyed pending values, current causal/V1 profiles, mint-address set and runtime code identity | Every later PegIn block and runtime upgrade boundary | Raw privileged storage/code mutation, profile disable, V1 change or upgrade could restore an admission-free mint route | Preloaded pending validates at cutover and the causal mint succeeds in the child | Same-block cutover/mint, causal disable/replacement, V1 rotation, runtime upgrade, raw V1/`:code` replacement and admission-free mint reject without state leak | Migration safety only; future migration requires a new reviewed transition before cutover |
| Callback ordering and bounded work | Pallet Ethereum pre/post hook contract, bounded key/mint counts and ordered-set duplicate checks | Start-hook order, maximum pending keys, exactly one causal mint, reserved callback weight | FRAME block execution and block importer | Snapshotting after EVM execution, quadratic duplicate scans, or unbounded work would break causality or block accounting | Hook-order unit test plus runtime/node suites | Start-hook failure, duplicate keys and multi-mint path reject | Obvious O(n^2) duplicate scans are removed; reservation is not benchmark-backed and runtime activation is blocked |

WP-06T20E-C evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for exact parent-bound causal consumption in the pinned local Frontier patch |
| Independent review | `complete`; a fresh independent review of the exact V4 patch and current repository diff found no remaining blocker |
| CI | `not_run`; focused Rust/TypeScript and local repository checks are separate evidence |
| Target runtime | `not_run`; local native/Wasm block import is not a deployed network or target-hardware benchmark |
| Readiness | `local_only` |

T20E-C does not create or verify a pending admission, authenticate either state
root to a finalized sidechain history, bind the post root to the actual child
header, invalidate stale/reorged source admissions, reconstruct authority after
restart, benchmark the callback, deploy the candidate ErgoTrees, or grant daemon
mint authority. T20E-D owns consecutive authenticated parent/post roots, actual
child-header identity, stale/reorg invalidation and restart behavior. Gate 5,
trustless status and production readiness remain false.

**WP-06T20E-D implements authenticated causal consumption and a bounded
fail-closed lifecycle without creating mint authority:** the pinned Frontier
source now composes the unchanged T20C mint-transition verifier with the causal
runtime state in the same direct-parent and child trie proofs. The child header
is the finalized T20C event header; its state root contains the post-state and
its hash, height and parent hash bind the parent-bound V3 record to the actual
child rather than a caller-selected identity.

The causal verifier authenticates the exact V1 and causal profiles, the sticky
enforcement marker, the bounded ordered pending-key list and every pending map
value named by that authenticated list in both states. The target admission is present only in the
parent, V1 and V3 replay state are absent there, the child removes exactly that
one ordered key, every non-target pending value remains byte-identical, and the
child creates the exact unchanged V1 record plus exact V3 consumed record. The
proof therefore cannot hide a changed or omitted indexed pending admission. It
does not prove that no unindexed raw map entry exists; the T20E-E runtime writer
and migration policy must preserve the list as the only admission index.

Read-only acquisition first calls `state_getStorage` at each exact block to
decode the bounded pending-key list and derive the indexed map-key surface. It
then requests one bounded `state_getReadProof` containing the list, all derived
pending entries and the fixed T20C/causal keys. This discovery call is not
trusted: the Rust verifier decodes the pending list again from the authenticated
trie and requires every listed value. Parent and child canonical hashes are
rechecked after collection. The collected package remains a read-only candidate
and cannot decide admission or funds movement.

The strict TypeScript projector binds the exact request-byte digest, an
independently supplied trust-anchor digest, the nested T20C candidate shape,
the actual parent/child headers and the complete V1/V3 successor. Caller
`verified` fields are quarantined; until the exact binary is executed through a
contained registered authority, the projected cryptographic and funds claims
remain false. The V4 pinned build reconstructs six verifier binaries and four
fixture generators and requires all four tracked vectors to regenerate
byte-for-byte.

A separate pure lifecycle projection defines `pending`, `admitted`,
`invalidated` and `consumed` proof states, but its immutable source-owned
registry intentionally has zero active proof profiles in T20E-D. RPC, SQLite
and reconstruction events cannot advance that state, and caller-constructed
proof references or registries reject. Initial journal creation is unique per
candidate and records a hashed `restart_reproof_required` observation; repeated
initialization rejects, and a new process therefore starts held. Each append supersedes the previous
same-process head, so a retained ancestor or competing successor rejects before
projection. Stale anchors, source reorgs, checkpoint
conflicts and RPC disagreement impose a deny-only hold. A missing, cloned,
serialized, truncated or reordered journal reconstructs only `pending` with
reproof required; same-process event IDs are idempotent only when their full
contents match. T20E-E must add the first static profile and exact
process-provenance proof constructor. This projection has no network,
persistence, daemon, mint, signing, submission or broadcast capability.

The WP-06T20E-D producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Actual consecutive parent/child identity | T20C finalized header composition plus causal wrapper | Parent/child native hashes, heights, state roots and exact parent link | Causal trie-transition verifier and V3 binding | A valid state transition could be attached to another child or a non-consecutive fork | Generated vector binds the actual finalized child header and direct parent | Parent hash, height, state root, child root and header mutations reject | Verified relative to the supplied trust-root digest inside Rust; TypeScript candidate remains execution-unauthenticated |
| Indexed causal pre/post state | Bounded Substrate trie proofs and canonical SCALE decoders | V1/causal profiles, enforcement flag, ordered pending keys, every value named by the list, target pending/V1/V3 keys and values | Causal transition report | An indexed pending entry, replay state or successor could be omitted or substituted | Exact target deletion plus V1/V3 creation and indexed non-target preservation verify | Missing/retained target, replay presence, key-list change, missing/changed indexed non-target value, malformed SCALE and wrong successor reject independently | Cryptographic proof-core result only; absence of unindexed raw entries remains a writer/migration invariant for T20E-E |
| Bounded indexed proof acquisition | Read-only provider and collector | Exact block hashes, bounded pending list, all list-derived storage keys, proof nodes/bytes, post-collection hash rechecks | Native verifier request | RPC discovery could silently truncate the authenticated indexed surface or mix states | One target plus an additional indexed pending entry yields the parent and child key sets | Null, malformed, noncanonical, duplicate, zero, oversized or drifting discovery rejects before admission | RPC discovers bytes only; authenticated trie decoding decides semantics |
| Exact executable/vector closure | Source and toolchain locks plus isolated V4 build | 72-file Frontier patch identity, six verifier binaries, four generators and four canonical vector digests | Future contained execution authority | Mutable source, stale executable or fixture drift could be promoted | Fresh isolated build regenerates and byte-matches every vector | Patch, lock, executable, generator or vector drift rejects | Local reproducibility evidence only |
| Fail-closed lifecycle and restart | Process-branded immutable journal projection plus a source-owned registry with zero active profiles | Candidate/event IDs, authenticated initial reproof hold, observation source/reason, contiguous sequence, genesis/head/event digests, latest-head capability | Future T20E-E proof admission and reconciliation composition | Reinitialization, a retained pre-hold ancestor, competing successor, SQLite/RPC agreement, partial persistence or DB loss could recreate or release authority | Unique creation records the reproof hold; same-process append supersedes its prior head and preserves the current hash chain; exact duplicate is idempotent | Duplicate initialization, superseded ancestor, second fork, caller proof/registry, clone, truncation, reorder, mutation, candidate mismatch, invalid observation and lost journal reject or return pending with reproof required | Deny-only local lifecycle; no proof transition or funds authority is active |

WP-06T20E-D evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for exact causal parent/child trie transition, authenticated indexed pending preservation, bounded acquisition and deny-only lifecycle projection |
| Independent review | `complete`; iterative current-diff review closed forged-proof, journal-loss, stale-head, reinitialization, indexed-state wording and height-overflow findings with no remaining blocker inside the non-authorizing T20E-D scope |
| CI | `not_run`; focused Rust/TypeScript, source-lock and isolated-build checks are local evidence |
| Target runtime | `not_run`; generated native/Wasm fixtures do not establish a deployed network or callback budget on target hardware |
| Readiness | `local_only` |

T20E-D does not prove the Ergo committed-vault transition, implement a reviewed
source-proof adapter, create an on-chain pending admission, authenticate the
local verifier process by itself, benchmark or activate the runtime callback,
deploy the candidate ErgoTrees, import the result into the daemon, or authorize
mint, hold release, signing, submission or broadcast. WP-06T20E-E must produce
and admit the exact source proof before the mint child while preserving these
boundaries. Gate 5, trustless status and production readiness remain false.

**WP-06T20E-E adds the first compatibility source-proof admission path without
promoting it to trustless or daemon authority:** one source-owned static profile
uses an exact 2-of-3 Ed25519 threshold, ten-confirmation source policy and
64-native-block maximum validity window. The TypeScript producer and pinned
Rust runtime share the exact V2 statement, request, result, attestation,
signature-set and proof domains. Their golden vector fixes the 498-byte SCALE
envelope and every derived identity. Unknown profiles, runtime registration and
silent reuse by a future validity/STARK family remain fail-closed.

The checked-in runtime deliberately compiles execution of its deterministic
fixture-key profile as false. The immutable gate is enforced by the public
activation call and again by admission, invalidation, internal activation,
block-start validation and post-EVM consumption. A node-level negative injects
the exact profile and enforcement marker through privileged raw storage; the
block rejects and neither the accepted head nor causal storage changes. A
private `cfg(test)` marker exercises the same internal profile validator. Any
downstream runtime must replace the fixture keys and explicitly enable the
reviewed profile in its build; neither a public runtime call nor raw privileged
storage can activate the checked-in fixture.

The runtime admission call validates the active causal profile, exact source
intent and statement, proof result, threshold signatures, native-height window
and absence of V1/V3 replay state. Only after all fallible checks pass does it
atomically insert the pending object, its ordered sole-index key and a 241-byte
receipt binding the source-proof request, result, proof, executable, verifier
profile, admission height and expiry. Duplicate admission, a terminal same-
record tombstone, stale proof, weak confirmation policy, bad signature, request
drift or index inconsistency leaves all live surfaces unchanged. A threshold-
authenticated invalidation removes the pending value, receipt and index
together and writes a permanent V1 tombstone binding the exact profile,
admission, source-proof result, reason, invalidation/proof digests and native
height. The original proof cannot recreate that record in the same or a later
block; recovery requires a new canonical source deposit and candidate identity.
At the exact native expiry, the pre-EVM hook first validates the complete
indexed object, then removes all three live surfaces without a tombstone before
constructing the active parent snapshot. The public expiry call applies the
same immutable fixture-execution gate and revalidates the active profile,
pending and receipt before cleanup. The real Frontier `on_initialize` path
succeeds at expiry minus one, expiry and expiry plus one, so an unminted
admission cannot deadlock block production when its proof ages out. A still-
valid source deposit can be reconsidered after objective expiry only through a
new proof with a fresh validity window.

The pre-EVM snapshot and post-EVM callback now require the exact receipt to
exist in the direct parent, remain unchanged throughout the mint block, and
retain target invalidation-tombstone absence until native commit. The
successful child atomically removes the pending object and receipt while
creating the unchanged V1 replay record and parent-bound V3 consumption record.
Same-block admission and mint still reject. The native V3 verifier extends the
T20E-D proof with authenticated receipt membership in the parent, absence in
the child, exact target tombstone non-membership in both states, and byte-exact
preservation of every non-target indexed pending object and receipt. Read-only
RPC discovery still selects bytes only; the Rust trie verifier decides their
authenticated meaning relative to the supplied trust root.

The lifecycle registry now recognizes exactly one admission action from a
same-process, source-owned proof-result constructor. Projection requires an
explicit current native height and rejects before validation or at expiry. A
fresh admission may clear only the initial `restart_reproof_required` hold.
`stale_anchor`, `source_reorg`, `checkpoint_conflict` and `rpc_disagreement`
remain deny-only, and no invalidation or consumption proof profile is active in
the TypeScript lifecycle. Restart or database loss therefore still returns
only pending with fresh reproof required.

The WP-06T20E-E producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Static compatibility source-proof identity | Source-owned TypeScript registry and Rust runtime provider | Proof system/profile/verifier/finality IDs, ordered 2-of-3 keys, threshold, ten confirmations and 64-block validity | Admission validation and lifecycle reference | Runtime configuration, raw storage, public fixture keys or a future proof family could silently reinterpret the V2 statement | Cross-language vector reproduces every ID, signature and 498-byte envelope through the private fixture harness | Public runtime activation, raw profile/enforcement injection, unknown profile, wrong request/result/signature, weak policy, duplicate signer and stale window reject | Explicitly federated compatibility authority; checked-in fixture cannot execute in the reference runtime and is not trustless finality |
| Atomic pending admission and provenance | Runtime admission call after complete proof validation | Exact V2 profile, intent, statement, admission/replay key, pending bytes, ordered index, 241-byte receipt and tombstone absence | Direct-parent snapshot, mint callback and V3 proof | An observed deposit, local status, invalidated proof or unindexed write could become mint eligibility | One accepted envelope writes exactly one pending object, receipt and ordered key | Duplicate/replayed admission, terminal tombstone, malformed input, stale proof, bad signature, changed policy or inconsistent index rejects without state mutation | On-chain runtime transition; not daemon or Ergo-verifiable source authority |
| Terminal threshold invalidation | Static threshold validation followed by one atomic state transition | Admission/result IDs, reason/evidence/checkpoint, issue/expiry heights, signatures, pending/receipt/index and exact V1 tombstone | Admission replay rejection and parent mint snapshot | A reorged or conflicting source proof could be replayed while its original envelope remains fresh | Valid invalidation removes all live surfaces and writes the exact terminal tombstone | Repeated invalidation and original-envelope replay in the same and later heights reject; wrong proof/result/reason/signature or partial state cannot mutate the record | Runtime deny path only; same-record recovery is intentionally impossible and TypeScript invalidation authority remains inactive |
| Objective expiry | Immutable execution gate plus active profile and pending/receipt validation at deterministic native height | Profile, pending/receipt/index, parent identity and expiry height; no tombstone | Mint exclusion and possible later fresh proof | Raw fixture state could emit accepted cleanup, malformed state could be deleted, or expiry could halt block production | Valid public expiry and the real Frontier hook remove only the live surfaces at the exact bound | Guard-disabled and malformed-profile/receipt calls preserve state; expiry minus one, expiry and expiry plus one remain live | Runtime cleanup without source authority; re-admission requires a newly valid proof |
| Receipt-bound mint consumption | Pre/post callback and parent snapshot | Receipt bytes/digest, pending admission, V1/V3 and tombstone absence, EVM mint transition and direct-parent identity | Atomic pending/receipt deletion plus V1/V3 creation | A pending admission could be substituted or invalidated after snapshot, or minted without authenticated provenance | Exact parent receipt and tombstone absence survive snapshot; the receipt is removed only with the mint successor | Missing/changed receipt, tombstone after snapshot, same-block admission, replay, wrong mint or partial successor rejects | Local runtime conformance; callback is not activated or benchmark-approved |
| Authenticated V3 receipt transition | Native GRANDPA/header/trie composition and strict TypeScript projector | Parent receipt membership, child absence, target tombstone non-membership in both states, every indexed pending/receipt pair, child header and trust digest | Future contained execution join | RPC could omit a receipt, hide an invalidation or second authority object, or attach the transition to another child | Rust-generated V3 vector verifies and TypeScript reproduces exact request/report semantics | Parent/child tombstone, receipt/key/list/header/root/count/profile and boundary mutations reject independently | Proof-core result relative to supplied trust root; TypeScript execution claims remain false |
| Fresh restart reproof | Same-process proof-result reference and immutable lifecycle journal | Candidate, proof/result/request/executable IDs, validation/expiry heights and current native height | Lifecycle projection | SQLite, RPC agreement, stale proof or a cloned reference could clear a hold | Fresh exact admission clears only the initial restart hold | Reorg/conflict/stale holds, missing height, pre-validation, expiry, clone, restart and profile/result substitutions reject or remain held | Non-authorizing local lifecycle only |

WP-06T20E-E evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for static federated proof validation, immutable fixture execution exclusion at every consumer, node/Wasm raw-storage rollback, atomic pending/receipt/index admission, terminal invalidation tombstones and replay rejection, fully validated public and pre-EVM expiry, receipt-bound mint consumption with post-snapshot tombstone rejection, authenticated V3 parent/child tombstone non-membership and bounded restart reproof |
| Independent review | `complete`; a fresh security review of the exact 20-file pre-closeout manifest `88e63c84c79d1b5668256fe153b2d5fae71c019f0c4dd840ed5cac41639c3444` closed the invalidation-tombstone proof finding and found no remaining actionable issue within the stated non-authorizing scope |
| CI | `not_run`; focused Rust/TypeScript, source-lock, isolated-build and repository checks are local evidence |
| Target runtime | `not_run`; fixture-native execution does not establish an activated network or callback budget on target hardware |
| Readiness | `local_only` |

T20E-E does not make the federated attestation prove Ergo canonicality, execute
or attest the claimed source verifier inside TypeScript, authenticate its own
trust root, activate the runtime callback, benchmark worst-case weight, deploy
the causal ErgoTrees, import authority into the daemon, or authorize mint,
signing, submission or broadcast. WP-06T20E-F must contain and bind the exact
source-proof and V3 verifier executions before any later authority integration.
Gate 5, trustless status and production readiness remain false.

**WP-06T20E-F1 establishes a source-refreshed causal V3 candidate boundary and
records the remaining launcher-bootstrap blocker:** the pinned local V5 build
retains the executable and source paths needed to refresh one exact V3 execution
identity. Each refresh revalidates the canonical source-lock files, the exact
Frontier commit and patch, the pinned Cargo/Rust/Git observations, the V3
verifier digest and a newly read canonical digest of the tracked V3 vector.
This is same-host local-conformance identity only; it denies independent build
attestation, complete build-tool closure, dependency-cache attestation and
admission eligibility.

A separately versioned fixed-operation policy binds
`verify-peg-in-causal-mint-transition-v3`, the refreshed source identity,
verifier and vector digests, digest-addressed contained launcher,
AuthorityRecordV2 policy, validity window, ordered system-DLL allowlist and
bounded request/output limits. It snapshots the exact request and rechecks the
source, toolchain, verifier, launcher and policy around execution. The parent
hash/spawn/hash sequence does not independently identify the loaded image, so
the compatibility field remains `launcherAtomicBootstrapProven = false`.
Authority-mode success nevertheless means the V2 broker opened and retained
its own image and matched it to the exact `AuthorityRecordV2` within the
declared Windows administrator/kernel TCB, recorded separately as
`brokerSelfImageBoundToAuthorityRecordV2 = true`. The elevated activation
campaign has not run, so
`launcherInstallationActivationCampaignCompleted = false` and
`nativeVerifierExecutionAuthenticated = false` remain load-bearing.

The candidate evaluator independently derives the GRANDPA trust-anchor digest
from the normalized request, accepts only one strict single-line JSON object and
then runs the complete V3 result-shape validator. It discards every reported
proof field and exposes only the exact request identity plus quarantined stdout
digest and size. The raw execution capability, result bytes and stdout parser remain
module-private; the candidate evaluator is the only exported execution entry
point. Shape validation cannot establish finality, direct parenthood, causal
state transition, exact successor, source-proof receipt authenticity, source
canonicality or any funds authority; all such claims remain false.

The read-only collector snapshots the evaluator, independently supplied trust
anchor and all statement inputs before its first await. It retries only bounded
collection-snapshot drift and records the codec executable plus invocations,
candidate evaluator executable plus invocation, execution-policy digest and
source-execution identity. Concurrent caller substitution cannot replace the
evaluator or its pins, and an evaluator rejection remains terminal.

The WP-06T20E-F1 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Refreshed local source/build identity | Pinned local V5 build and per-launch refresh | Canonical source-lock digest, Frontier commit/patch, Cargo/Rust/Git versions and executable digests, V3 verifier digest and freshly read tracked-vector digest | Candidate execution policy | A stale, replaced or differently built verifier/vector could inherit a previous local identity | Exact refreshed identity remains stable around one requested launch | Aggregate source/toolchain, executable target and tracked-vector identity drift reject | Same-host conformance only; independent build and dependency closure remain unverified |
| Fixed contained request policy | Candidate execution policy plus contained broker | Operation, request bytes/SHA-256, trust-anchor digest, verifier and launcher pins, profile/policy digests, epoch/window, DLL allowlist and byte/time limits | Candidate evaluator | Another operation, request, launcher or expired policy could produce attributed bytes | Exact contained request returns a digest-bound stdout snapshot with V2 self-image binding | Unsupported operation, malformed trust root, weakened broker boundary, expiry, clone, launcher path and DLL-order drift reject | Broker self-image is bound within the declared TCB; activation campaign and proof claims remain incomplete |
| Quarantined V3 result shape | Module-private raw executor plus exported candidate evaluator | Normalized request, independently derived trust-root digest, one strict single-line JSON object, exact request/result digests | Read-only candidate collector | A caller could parse raw child fields or carry them into a later proof or funds decision | Structurally valid tracked result yields only a quarantined digest/size candidate, and the module namespace exposes no raw executor | Wrong trust root, malformed stdout, weakened result boundary, clone and cross-evaluator provenance reject | Raw stdout never crosses the public API; reported shape is validated and every semantic proof claim remains false |
| Stable read-only collection | V3 candidate collector and bounded retry loop | Immutable input snapshot, exact collected request, codec pins/invocations, evaluator pin/invocation, execution policy and source identity | Future authenticated T20E-F composition | RPC drift or caller mutation could bind output to a replaced request/evaluator, or evaluator rejection could be retried as observation noise | Stable request evaluates once and exports the original pins | One injected snapshot drift recollects; evaluator rejection does not retry; mid-collection evaluator/trust-root substitution is ignored | No proof, lifecycle, vault, mint, daemon or funds authority |

WP-06T20E-F1 evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered`; 56 focused tests cover the vector-digest refresh invariant, fixed contained request policy, exact request/result/trust-root binding, raw-output quarantine, evaluator/candidate provenance and stable-snapshot collection. The production refresh rereads source, toolchain, executable and vector state; authority tests inject that dependency, so an end-to-end real-build refresh remains outside this focused suite. Collector orchestration tests isolate the join with mocked provenance guards, while the genuine evaluator/candidate provenance and rejection matrix are exercised separately. |
| Independent review | `complete`; successive read-only reviews found and drove correction of the launcher TOCTOU overclaim, mutable collector input and build capability, stale vector-digest reuse, public raw-output capability and overstated test evidence. The final recheck reported no remaining finding or regression. |
| CI | `not_run`; the local full relayer check passes all 272 Vitest files after the Node guard, WASM build and TypeScript build, and the explicit WASM crate run passes 22 tests |
| Release gate | `blocked_as_expected`; 9 of 14 evidence rows remain pending and the gate reports zero structural issues |
| Target runtime | `not_run`; the elevated launcher installation campaign and an activated sidechain runtime are not exercised |
| Readiness | `local_only`; F1 is not complete WP-06T20E-F |

T20E-F1 does not carry a completed launcher activation campaign, execute the
federated source-proof producer, authenticate the origin of its trust root,
establish source canonicality, accept the reported V3 proof semantics, join a
genuine source proof to the V3 receipt transition, or exercise
restart/database-loss reconstruction of both authorities. Those are remaining
T20E-F obligations. The existing V2 installation is the selected broker root;
adding another parent wrapper would only move the root-of-trust question.
No runtime profile activation, daemon consumer, causal-ErgoTree deployment,
mint, signing, submission or broadcast path is added. Gate 5, trustless status
and production readiness remain false.

**WP-06T20E-F2a makes the V2 bootstrap semantics explicit and adds read-only
installation inspection:** the V2 installer script can now run in an elevated
`InspectOnly` mode. Under the same V2 installer mutex it validates the reviewed
source digest, 64-bit Program Files known-folder hierarchy, protected
filesystem and registry ACLs, absence of reparse points, exact
content-addressed launcher digest and size, one-link/non-delete-pending file
identity, and the complete 144-byte `AuthorityRecordV2`. It opens existing
filesystem and registry objects only; it does not create, repair, replace or
write persistent state. Optional compact JSON output records the exact
inspection result and keeps campaign, proof, funds, Gate 5 and readiness fields
false.

The contained-process result and every strict consumer now distinguish a
successful V2 broker self-image binding from campaign completion. F1 propagates
that distinction through the quarantined candidate and collector. Existing
signed policy fields, V1/V2 records, verifier requests, vectors and protocol
bytes are unchanged. The compatibility field
`launcherAtomicBootstrapProven=false` continues to describe only the Node
parent's lack of an independent loader observation.

The WP-06T20E-F2a producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Read-only exact installation inspection | V2 installer functions under the shared installer mutex | Known-folder hierarchy, ACLs, reparse state, launcher digest/size/volume/file ID/link/delete state, profile/policy/epoch and 144 record bytes | Disposable-host activation campaign operator | A repaired, aliased, drifted or mismatched installation could be mistaken for the reviewed root | Static Rust matrix verifies reuse of exact checks and excludes direct persistent-mutation calls from the inspection body | Missing inspection mode or a direct create/write/repair call in the inspection body fails the static matrix; helper behavior remains subject to its own tests and the disposable-host campaign | Local source/test evidence only; no campaign execution |
| Broker binding is distinct from activation | Successful V2 broker result plus strict TypeScript boundary assertions | `brokerSelfImageBoundToAuthorityRecordV2=true`, campaign false, parent-observation compatibility false | V3 candidate evaluator, RPC codec and existing contained authorities | One local broker check could be promoted to operational acceptance or proof authority | Seven focused TypeScript suites preserve the exact split | Missing self-binding, completed-campaign flip and existing authority flips reject | Broker binding within declared TCB; F2a independent review complete; campaign pending |
| Proof and funds remain separate | F1 candidate and collector fail-closed boundaries | Proof/finality/source/lifecycle/mint/settlement/sign/submit/broadcast/Gate 5/readiness booleans | Future T20E-F composition only | Installation evidence could authorize cross-chain value | Quarantined candidate retains only stdout digest and size | Existing premature-authority mutations reject | No proof or funds authority |

WP-06T20E-F2a evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for the read-only V2 installation inspection, broker-binding/campaign split, strict-consumer rejection, and F1 quarantine boundary |
| Independent review | `complete`; the fresh read-only diff review identified static-coverage overstatement, missing isolated consumer negatives, and exceptional-path handle cleanup, and the corrective recheck found no remaining finding or regression |
| CI | `not_run`; PowerShell parsing, native launcher checks, 55 focused TypeScript tests, TypeScript no-emit checking, and the full 272-file relayer check passed locally |
| Target runtime | `not_run`; the elevated inspector and disposable-host launcher activation campaign were not executed |
| Readiness | `local_only`; no proof, funds, Gate 5, trustless, deployment, or production authority follows |

WP-06T20E-F2a does not run the elevated campaign, authenticate child proof
semantics, activate an external source-proof profile, or change any funds path.

**WP-06T20E-F2b adds the separately versioned, source-refreshed contained
source-proof result producer boundary:** the Rust producer accepts exactly one
bounded JSON request carrying the canonical V2 profile, intent and statement,
six opaque canonical source objects, the claimed verifier executable digest and
the native validity window. It rederives the admission identity, requires the
fixed federated compatibility profile, enforces ten source confirmations and a
maximum 64-block native validity window, and emits exactly `schema`, `status`,
`requestDigestHex`, `result` and `boundary`. The result contains only
domain-bound canonical-object digests and bounded metadata. Every source-proof,
source-canonicality, signing, runtime, lifecycle, funds, Gate 5 and readiness
field remains false.

The pinned local build is separately identified as V6 because its public build
payload now contains eight runtime binaries, six generators and six tracked
vectors. The added producer execution identity reloads the source locks,
revalidates the exact Frontier checkout, reobserves Cargo 1.82, Rust 1.82 and
Git, and rehashes the producer and its Rust-generated vector before and after
each requested execution. A fixed-operation TypeScript authority can request
only `produce-peg-in-causal-source-proof-result-v1` through the existing V2
digest-addressed launcher and AuthorityRecordV2 policy. It strictly compares
the child result to the same pure TypeScript derivation and tracked Rust vector,
then drops the result fields and returns only a same-process quarantined
candidate containing stdout digest, size and exact execution identities.

The WP-06T20E-F2b producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Strict deterministic producer format | Rust V1 producer and fixture generator | Canonical profile, intent, statement, six bounded objects, executable digest, issue/expiry heights, exact five-field output envelope | TypeScript candidate evaluator | Extra or substituted child fields could acquire meaning outside the reviewed format | Rust-generated request/output byte-match the tracked compact vector | Unknown fields, malformed canonical hex, oversized objects, candidate/profile/intent/statement drift and invalid windows reject | Local deterministic derivation only |
| Refreshed build and vector identity | Pinned local V6 build and producer-specific refresh | Source-lock digest, Frontier commit/patch, Cargo/Rust/Git observations, producer and tracked-vector digests | Fixed producer execution policy | A stale or replaced binary/vector could inherit an earlier local identity | Isolated Rust 1.82 build regenerates and matches all six vectors | Source, toolchain, executable and vector drift reject before a candidate returns | Same-host conformance; independent build and cache closure remain unverified |
| Contained fixed-operation request | V2 launcher policy and private execution authority | AuthorityRecordV2, policy epoch/window, launcher and producer digests, empty argv, exact request bytes and bounded output | Candidate evaluator only | A caller could select another executable, operation or policy and reuse the result | One canonical request reaches the contained-process port | Wrong launcher suffix/digest, expired policy, changed target or weakened broker boundary reject | Campaign incomplete; no authenticated source-proof execution claim |
| Cross-language result parity and quarantine | Rust-generated vector, pure TypeScript derivation and strict output parser | Request digest, six result digests, verifier/profile identities, validity window and all false boundaries | Future F2c composition | Hand-built mocks or raw stdout could hide Rust/TypeScript drift or leak proof-shaped fields | The TypeScript test consumes the exact Rust-generated request and expected output | Extra/missing fields, digest drift, promoted boundary, clone and cross-evaluator provenance reject | Only stdout digest and size leave the evaluator |
| Proof and funds remain separate | Public candidate API and fail-closed boundary | Source proof/canonicality, lifecycle, receipt join, mint, hold release, sign, submit, broadcast, Gate 5 and readiness flags | Future F2c composition only | Deterministic hashing could be mistaken for source finality or funds authority | Candidate exposes all authority fields as false | Any promoted result or broker boundary rejects | No proof, lifecycle or funds authority |

WP-06T20E-F2b evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered`; 42 Rust unit tests plus 18 integration tests pass for the checkpoint-verifier package, including four producer CLI cases, and 45 affected TypeScript tests pass. The producer test consumes the exact Rust-generated request/result vector rather than a hand-built output. |
| Independent review | `complete`; successive fresh read-only reviews identified and drove correction of the canonical-object bounds mismatch and isolated nested-envelope mutation coverage, and the final recheck reported no remaining finding or regression within the stated non-authorizing scope |
| CI | `not_run`; local source-lock verification, TypeScript no-emit checking, isolated pinned Rust 1.82 build, full 273-file relayer check and explicit 22-test WASM crate run pass |
| Target runtime | `not_run`; the V2 protected launcher installation is absent on this host and the elevated disposable-host activation campaign remains pending |
| Readiness | `local_only`; deterministic result derivation is not source canonicality, source-proof execution authentication, runtime admission, Gate 5 closure, trustless settlement or production readiness |

**WP-06T20E-F2c adds the exact same-process causal identity composition without
creating proof or funds authority:** F1 now retains a private normalized view of
the reported V3 admission receipt and exposes only a process-bound projection
after every expected receipt identity matches. F2b similarly retains the exact
deterministic result identity checked by its evaluator and exposes only a
process-bound assertion. Neither boundary exposes child stdout, receipt bytes,
proof nodes, signatures or execution capabilities.

The F2c composer snapshots caller-held requests before evaluation, requires
genuine F1/F2b candidates and a genuine signed federated source-proof result,
then binds the exact source request to the normalized runtime record and V3
receipt. It independently projects the current lifecycle journal through the
static admission-only registry and accepts only an unheld `admitted` head whose
proof reference exactly matches the same source result. The output contains
only identities, execution-policy digests, receipt/child-output digests and an
all-false authority boundary.

The WP-06T20E-F2c producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| F1 receipt identity stays behind provenance | F1 evaluator WeakMap and reported-receipt projector | V3 request, record/profile/intent/admission IDs, proof IDs, verifier identities, receipt key, signed issue/expiry heights, receipt-byte digest and parent/child identities | F2c composer only | Caller JSON, a receipt from another admission or a receipt predating the signed result could inherit F1 provenance | Genuine evaluator candidate projects one matching receipt identity digest; fresh revalidation may occur after historical admission | Clone, additive expectation, identity substitution and receipt admission before signed proof issuance reject | Reported child identity only; receipt authentication remains false |
| F2b result window is exact | F2b evaluator WeakMap and result-ID assertion | Request digest plus deterministic result ID including six object digests, executable/profile and issue/expiry heights | F2c composer only | The same request with a different result window could be joined | Genuine producer candidate matches the signed result fields | Result-ID/window drift, clone and cross-evaluator substitution reject | Deterministic local derivation only |
| Source request matches the runtime mint record | F2c request snapshot and V3 request normalizer | Sidechain, bridge, token, source box, recipient, raw ERG amount, profile revision/activation and V1 record key | F2c identity candidate | An unrelated deposit or destination could be correlated to the mint | One aligned signed-source/V3 fixture composes | Every listed binding is mutated independently | Correlation only; committed-vault and mint authority remain false |
| Receipt matches the exact signed source result | Source-result process provenance plus F1 private receipt assertion | Admission/profile/intent, proof system/profile, request/result/proof, verifier executable/profile and expiry | F2c identity candidate | A different federation result or receipt could clear the restart hold | Exact signed result, F2b identity and V3 receipt agree | Profile, intent, admission, request, result, proof, executable and expiry substitutions reject | Federated compatibility result; source canonicality/finality remain false |
| Lifecycle remains deny-only | Static admission-only registry and process-provenant latest journal | Candidate, proof/result/request/executable IDs, current height, journal head/count, hold and invalidation state | F2c identity candidate | SQLite/RPC or a serialized old head could recreate admission after restart/reorg | Fresh exact proof clears only the initial restart hold | Four post-admission security holds, expiry, clone, serialized journal, explicit no-journal restart projection and pre-transition height reject or remain pending | Lifecycle is explicitly not funds authority |
| Composition cannot escape quarantine | Process-branded frozen F2c candidate and all-false boundary | Both execution/source identities, both child-output digests, receipt digest and lifecycle head | Tests/evidence only | A local join could be mislabeled as proof acceptance or mint permission | Exact composition is deterministic and provenance-checkable | Candidate clone and every promoted authority field are rejected by type/review tests | No daemon consumer; no proof, mint, signing, submission, broadcast, Gate 5 or readiness authority |

WP-06T20E-F2c evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered`; 30 focused F2c tests plus the F1/F2b owner suites cover the effect-free preflight, one-time lifecycle finalization, exact joins, every runtime binding, receipt identities, signed issue/result validity, fresh revalidation after historical admission, post-admission lifecycle holds, expiry, serialized-state replay denial and the explicit no-journal restart projection |
| Independent review | `complete`; the initial strict review corrected post-admission hold sequencing and receipt-field isolation; a later fresh-process design review found the `validatedAt` chronology defect, and the final raw-diff recheck reported no actionable finding after the signed-issue-height correction |
| CI | `green`; 63 focused F1/F2b/F2c tests and no-emit checking pass, `npm run check` completes all 274 bounded Vitest files, `npm run wasm:test` passes 22 tests, and the release-gate baseline remains correctly blocked at 9/14 pending rows with 0 structural issues |
| Target runtime | `not_run`; the protected V2 launcher installation is absent on this host and the elevated disposable-host activation campaign remains pending |
| Readiness | `local_only`; composition is not receipt authentication, source canonicality/finality, runtime admission authority, Gate 5 closure, trustless settlement or production readiness |

Restart and complete database loss intentionally destroy all F1, F2b, signed
result, proof-reference, journal and F2c process provenance. WP-06T20E-F2d now
implements the local fresh-process reconstruction: the new process receives raw
request/envelope data, recollects the V3 parent/child evidence, reruns both
native evaluators, validates the signed envelope at the newly observed
finalized head, completes every non-lifecycle binding and only then creates and
advances a new journal. Raw evidence transport, SQLite and serialized prior
objects remain non-authoritative. Accepted target execution remains blocked by
the unavailable V2 protected-launcher campaign.

The WP-06T20E-F2d producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Restart recollects instead of rehydrating | Fixed F2d input schema plus source-owned V3 collector | Raw source request/envelope and complete V3 collector configuration; no candidate, result, journal or SQLite fields | F1/F2b evaluators and F2c preflight | Serialized local state could recreate process provenance after restart | One fresh call reruns both contained evaluator operations | Additive outer lifecycle/result and nested V3 candidate fields reject before collection | Raw data only; no restored authority |
| Current source admission is revalidated | Signed-envelope validator at the recollected finalized head | Request digest, signatures, issue/expiry heights and finalized-head height | F2b producer and F2c preflight | Expired or differently signed evidence could be joined to current runtime state | Valid envelope is revalidated and yields the exact result ID | Expiry at the finalized head rejects before F2b and journal creation | Federated compatibility evidence only |
| Runtime evidence is freshly acquired | Exact V3 collector and genuine F1 evaluator | Target/parent headers, authenticated state-proof request, reported receipt identity, evaluator and trust-anchor bindings | F2c preflight | A saved runtime result or changed RPC view could inherit old provenance | Newly collected request and genuine F1 candidate join | RPC disagreement/failure and source/runtime binding drift produce no journal | Finality and receipt authentication remain false |
| Journal creation follows all causal checks | Effect-free F2c preflight, then static lifecycle registry | Admission/profile/intent, request/result/proof, receipt, parent/child, runtime record, current height and proof reference | F2c finalizer | A late mismatch could consume the unique journal and leave misleading admitted state | Exact preflight creates and advances one fresh journal | Binding mismatch leaves the candidate eligible for first journal initialization; cloned and reused preflights reject | Lifecycle remains deny-only and non-funds-authoritative |
| Caller mutation cannot alter in-flight evidence | Synchronous deep snapshots before the first await | Source request/envelope and value-shaped V3 collection statements | Complete F2d orchestration | Caller-owned buffers or fields could change after collection starts | Mutation of the original envelope while collection is paused does not alter the derived result | Mutated signed evidence supplied before invocation fails normal validation | RPC/codec capabilities remain explicit external ports |
| Reacquired output cannot escape quarantine | Frozen process-branded F2c candidate | Lifecycle head plus F1/F2b execution identities and quarantined child-output digests | Tests/evidence only | Restart handling could be mistaken for mint or settlement authority | Exact fresh-process candidate retains every authority flag as false | Old/clone inputs and all fail-closed paths produce no candidate | No daemon, mint, sign, submit, broadcast, Gate 5 or readiness authority |

WP-06T20E-F2d evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered`; five fresh-process tests cover exact re-execution, pre-await snapshotting, additive old-state rejection, RPC failure, source/runtime binding drift and expiry without premature journal creation; the 30-test F2c matrix covers effect-free preflight and one-time finalization |
| Independent review | `complete`; the strict review found that signed-result freshness was still enforced after the preflight boundary, so preflight now requires `validatedAt <= current < expiry`; expiry and future-validation negatives prove the unique journal remains uninitialized, and the final re-review reported no actionable finding |
| CI | `green`; 70 focused F1/F2b/F2c/F2d owner tests and no-emit checking pass, `npm run check` completes all 274 bounded Vitest files, `npm run wasm:test` passes 22 tests, and the release-gate baseline remains correctly blocked at 9/14 pending rows with 0 structural issues |
| Target runtime | `not_run`; the protected V2 launcher installation is absent on this host and the elevated disposable-host activation campaign remains pending |
| Readiness | `local_only`; fresh-process reconstruction is not source canonicality/finality, receipt authentication, committed-vault authority, Gate 5 closure, trustless settlement or production readiness |

**WP-06T20E-F2e adds the executable protected-host campaign boundary without
activating it on this machine.** F1 and F2b export the exact V2 installer
declarations already calculated by their authority constructors. Describe mode
can therefore hand those role-distinct declarations to the unchanged installer
without copying a security-critical digest formula into operator glue.

Execute mode deliberately does not run the two observations in one JavaScript
process. The parent validates one explicit proof-input manifest, creates one
minimal request per canonical RPC origin before its first await, and the default
runner starts two workers sequentially.
Each worker performs its own pinned build and exactly one F2d recollection, then
serializes a digest-bound all-false candidate report. Process provenance does
not survive serialization: the parent records only the candidate payload,
requires each report to match the digest of its complete canonical request plus
its requested origin and launcher, and requires the two complete payloads to be
byte-equivalent under canonical JSON. The stored report explicitly does not
prove that its worker process executed. This is operator campaign evidence, not
proof of RPC independence, consensus, source canonicality or finality.

The WP-06T20E-F2e producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Installer declarations use the authority implementation | F1/F2b evaluator constructors and process-provenance assertions | Role, V2 record version, authority-profile digest, execution-policy digest, installed launcher path/digest, minimum epoch, legacy installer projection and all-false activation/funds flags | F2f operator handoff | Operator glue could install a profile or policy that the evaluator never requested | Two exact role-distinct declarations share one installed launcher and epoch; F2f separately supplies the reviewed source path for installation | Same role/profile/policy, changed declaration or promoted activation/funds state rejects | Declaration only; its V1 `BrokerPath` projection is not used as the source-image install argument |
| Each observation starts from explicit public inputs | Strict create-only CLI input and existing strict nested codecs | Proof manifest, one true credential-free RPC origin, source/tool/launcher paths and hashes, policy interval/epoch and DLL allowlist | One worker request | Undeclared bridge configuration, stale process objects or a second hidden origin could enter the run | Both complete requests parse, are deeply frozen and are created before the first await | Missing/additive outer or nested fields, URL path/query/fragment, duplicate DLL or invalid interval rejects | No DB, signer, wallet, deployment state or broadcast surface; build tools receive the documented host allowlist |
| Offline native build cannot mutate or fetch through the shared cache | Private regular-file Cargo cache copy plus `cargo --offline` | Host `registry`/`git` cache bytes copied below the isolated build root | One worker build | A worker could observe mutable shared-cache changes or fetch undeclared dependencies | Private copy remains independent when its corresponding host fixture changes | Missing dependency, symbolic link/junction or non-file cache entry fails closed | Build reproducibility boundary only; the host cache is not supply-chain authority, and Cargo offline mode is not an OS network sandbox for build scripts |
| One supervised process owns one default-runner F2d attempt | Parent worker launcher, create-only request file and shared bounded process runner | One bounded request file, bounded stdout/stderr, execution timeout, termination grace and process-tree identity | Dual-origin parent | A timed-out or overflowing worker tree could survive cleanup and mutate later observations | Default runner starts workers sequentially; a forced one-millisecond termination grace still returns the original timeout only after verified descendant termination | Nonzero exit or malformed report fails the campaign; unverified process-tree termination fail-stops the host, retains request/build directories and emits no artifact | Live execution property only; serialized reports do not attest process execution, and operator quarantine is intentionally unbounded when OS termination cannot be verified |
| Worker output is bound to its complete request | Parent-side single-run validator | Canonical full-request digest, requested/reported RPC origin, launcher digest, report digest and complete candidate payload | Dual-origin report constructor | A valid report matching only one origin or launcher could be relabelled across another manifest, time or policy | Both exact request/report pairs match | Origin, launcher, manifest target, capture time, report or candidate drift rejects | No child output or process provenance is promoted |
| Two-origin agreement is exact but non-authorizing | Dual-origin report constructor | Distinct origins, both single-run report digests, exact complete candidate payload and candidate identity | Tests and future campaign evidence only | Partial-field comparison could hide runtime, proof, receipt or lifecycle disagreement | Complete payload equality yields one create-only report | Same origin or any candidate mutation rejects | Not source independence, consensus, finality, Gate 5 or funds authority |

WP-06T20E-F2e evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `implemented_with_focused_falsifiers`; nine F2e-focused cases cover exact installer declarations, dual-origin agreement, candidate disagreement, cloned provenance, create-only CLI output, pre-await request snapshots, strict nested worker schema, bounded worker input, complete request/report binding and incomplete operational arguments; the shared process runner separately covers timeout, stdout/stderr overflow and verified descendant termination |
| Independent review | `complete`; the strict review required full-request report binding, strict nested manifests, true origin semantics, direct installer arguments, private offline Cargo cache handling and verified process-tree shutdown. The final HIGH was closed by fail-stopping instead of returning cleanup authority when termination cannot be verified; re-review reported no remaining actionable finding |
| CI | `green`; the 44-case F2c/F2d/F2e owner file, 23-case process/build lifecycle file and affected codec/authority suites pass with no-emit TypeScript checking; `npm run check` passes all 274 bounded Vitest files plus TypeScript and WASM builds, `npm run wasm:test` passes 22 tests, and the release-gate baseline remains correctly blocked at 9/14 pending rows with 0 structural issues |
| Target runtime | `not_run`; neither the real protected-host dual-origin run nor the separate elevated V2 activation campaign has executed on this host |
| Readiness | `local_only`; the command cannot install, activate, mutate runtime state, authorize mint, sign, submit, broadcast, close Gate 5 or establish trustless/production readiness |

**WP-06T20E-F2f closes the local operator-handoff gap without simulating the
protected-host campaign.** The standalone `peg-in:causal-f2e:handoff` command
has a validation-only mode that parses the strict public manifest and records
only its canonical digest and reviewed target identities. Its host-preflight
mode reruns the process-bound F1/F2b declaration derivation, observes the exact
regular launcher source, installer and tool executables, and requires a 64-bit
Windows x64 host whose declared installed launcher resolves to the expected
digest-addressed Program Files location.

The V1 declaration's `BrokerPath` field is retained for compatibility but is
not used as a fresh-install source path. F2f emits separate parameter objects:
installation points `BrokerPath` at the reviewed source executable; inspection
points it at the managed installed executable. The handoff also carries the
exact policy window, DLL allowlist, public manifest, distinct RPC origins and
source/tool paths into one execute argument vector. Both the F2d parser and its
exported executor require and revalidate the expected canonical manifest digest
before either worker can run. The handoff invokes none of those arrays and
records no registry, proof-execution or funds authority.

The WP-06T20E-F2f producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Public input can be reviewed before native execution | Strict F2d manifest parser, domain-separated canonical digest and executor-side expected-digest check | Input schema, target native block, trust-anchor digest and complete canonical manifest digest | Operator review and later host preflight | A malformed or substituted manifest could reach the expensive protected-host run without a stable review identity | Create-only validation report reproduces the manifest digest and the exact digest reaches the execute request | Input/report drift or a wrong expected digest rejects before either worker is called | Syntax/shape evidence only; signatures, canonicality and finality remain unproved |
| Installation source and installed execution path cannot be conflated | F2f file observation, tracked-HEAD installer binding, V2 declaration and Program Files binding | Source launcher path/size/SHA-256, installer repository/commit/blob identity, declared installed path, 64-bit known-folder path and shared launcher digest | Existing V2 installer then inspector | A nonexistent managed path could be supplied to a fresh install, an unreviewed source image could be copied, or drifted installer bytes could be elevated | Install arguments use the reviewed source while inspect arguments use the exact managed image; the installer matches tracked HEAD in the expected worktree | Source digest, installer root/blob, installed path, host architecture, known-folder output or profile drift rejects | Host-local preflight only; installer and registry are never invoked |
| Operator parameters preserve the authority profile inputs | Source-derived declarations plus structured parameter construction | Both role/profile/policy digests, epoch, policy interval, DLL allowlist, source/tool paths, manifest digest and distinct RPC origins | Human-controlled elevated install/inspect and later F2e execute campaign | Manual transcription could mix roles, windows, launcher identities or source paths | Both role-distinct parameter objects and one digest-bound execute vector validate under one report digest | Same origin, unsorted DLLs, policy inversion, file/path/digest or report mutation rejects | No shell execution, proof execution, mint, signing, submission or broadcast authority |

WP-06T20E-F2f evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `implemented_local_handoff`; the 52-case owner suite covers strict input validation, expected-digest enforcement before worker execution, known-folder parsing, exact tracked-installer binding, source/managed path separation, input replacement, output confinement and create-only host-preflight orchestration |
| Independent review | `complete`; the first review identified executable installer ambiguity, missing manifest-digest enforcement, mutable known-folder authority, constructor-owned validation and local-output leakage. Corrections closed those findings, then parser/core digest enforcement and isolated host-control coverage closed the two re-review findings; the final raw-diff pass reported no remaining actionable issue |
| CI | `green`; TypeScript build and 52 focused tests pass, `npm run check` completes all 274 bounded Vitest files after the Node guard, WASM build and TypeScript build, and `npm run wasm:test` passes 22 tests |
| Release gate | `blocked_as_expected`; 9 of 14 evidence rows remain pending and the gate reports zero structural issues |
| Target runtime | `not_run`; the public manifest, reviewed source launcher, protected installation, elevated inspection, activation campaign and dual-origin execution remain external prerequisites |
| Readiness | `local_only`; absolute host paths stay in the local handoff report, and no validation or preflight field grants proof, finality, funds or release authority |

**WP-06V implements EIP-0045 profile-aligned proof interoperability without
activating settlement.** The bridge zkVM workspace now pins the exact RISC Zero
source commit selected by the EIP-0045 profile candidate rather than the newer
incompatible crate release. The host requests a non-dev Poseidon2 succinct
proof, verifies the exact method and statement, requires the frozen profile,
outer `po2 = 18` and terminal `join`, and derives the canonical four raw-seal
chunks. The proof still executes the complete existing Substrate/GRANDPA
compatibility witness and does not reinterpret any V1 identity.

The 2026-07-25 reference run produced one 222,668-byte seal from 21 execution
segments. The authenticated profile package and public direct raw-seal verifier
at SigmaState draft commit `f78deadd668f801e7fae3bc884283f79c6f484fa`
accepted those exact bytes under the claim reconstructed from the 813-byte
statement. Single-fault changes to seal bytes, chunk partition, program, chain
domain, contract, application payload and profile all rejected. This closes
the previous producer/JVM format uncertainty only.

The WP-06V producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Evidence / status |
|---|---|---|---|---|
| Exact proof implementation profile | Git-pinned RISC Zero source, digest-pinned host/guest toolchain and locked dependencies | Bridge guest, host and future profile activation package | A proof from a semantically different recursion stack could be mislabeled with the EIP profile | Exact source `8eb06ab020a92dc5b63ba6dd0836d432aba6d890`, profile `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`; wrong profile rejects |
| Exact public computation | Bounded guest witness, generated method image and strict 813-byte statement codec | RISC Zero receipt claim and future Ergo host binding | Valid execution for another chain, program, contract or payload could authorize this bridge | Exact method `5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934`; program, chain-domain, contract and payload mutations reject |
| Canonical direct proof transport | Succinct host profile checks and raw-seal chunker | EIP-0045 four-child ABI and JVM raw-seal decoder | A host wrapper, composite receipt, alternate partition or terminal program could be accepted as the frozen profile | Poseidon2, outer `po2 = 18`, terminal `join`, 222,668 bytes and `65,535 / 65,535 / 65,535 / 26,063` chunks; seal and partition mutations reject |
| Independent implementation consumption | SigmaState authenticated profile loader, claim builder and `Risc0RawSealVerifier` at the pinned draft commit | Future activated Ergo verifier path | Producer-side receipt verification could hide a claim, byte-order or verifier mismatch | Exact exported bytes accepted by the JVM verifier; no bincode receipt or bridge host verifier participates |
| Activation and value release stay external | Reserved proof-system ID remains rejected and no funds consumer imports the proof | Tracker, DUP, payout and complete Ergo transaction | Local interoperability could be promoted into trustless settlement without consensus activation or full input-script acceptance | EIP-0045 B4-B8, activated profile/program, whole-transaction VM/node acceptance and Gate 5 remain open |

**WP-06W freezes the preactivation proof transport and funds-neutral consumer
ABI without activating it.** The structured envelope mirrors only the four EIP
children: proof chunks, application payload, program and profile. Chain domain
and exact contract proposition bytes are external context used to reconstruct
the complete statement. No fifth child, bincode receipt, host wrapper, aggregate
V1 reinterpretation or proof-system dispatch was introduced.

The fixed profile/program pair and chunk partition match WP-06V. A strict
parser requires an external expected raw-seal digest and rejects schema,
version, field, chunk, canonical-hex, chain, contract, payload, profile,
program, derived identity and authority-claim drift. A seal mutation of the
same shape remains a structurally valid candidate with a different digest;
cryptographic acceptance is deliberately left to the exact verifier. The
envelope records proof validity, source finality, profile activation, on-chain
acceptance and funds authority as false. Aggregate proof-system ID `2` remains
rejected, and no contract or settlement path imports this object.

**WP-06X binds the real proof to an executable, funds-neutral preactivation
consumer.** The pinned SigmaState generator emits one exact 85-byte version-4,
constant-segregated proposition whose only expression is the four-child
`VerifyStark` call. Its program and profile are constants, while context
variables `0` and `1` carry the proof chunks and 654-byte application payload.
Blake2b-256 of those exact proposition bytes is
`9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc`.
The native witness now uses that identity instead of the former synthetic
contract placeholder.

The real candidate statement has digest
`e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c`.
It is distinct from the deterministic TypeScript-only envelope fixture because
the real native application payload replaces the synthetic payload fields.
The exporter writes the candidate only after all receipt mutation assertions
pass and writes a Blake2b-256 manifest last. Both the relayer integration test
and the JVM fixture require that complete manifest and recheck every file.

The JVM deserializes the frozen proposition bytes, checks byte-exact
reserialization and AST identity, and executes that parsed tree as the sole
input script of a value-preserving transaction. Cryptographic mutations must
complete as a clean `false`; unexpected interpreter failures cannot count as
rejection evidence. Missing/wrong context variables, unavailable or
quarantined profiles, and legacy tree versions must raise their specific
fail-closed errors.

The WP-06X producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Evidence / status |
|---|---|---|---|---|
| Exact executable proposition | Pinned SigmaState v4 serializer with constant segregation | Rust statement fixture, TypeScript envelope and JVM `SELF` | A proof could be bound to a synthetic ID or execute under another tree | Exact 85 bytes, independent Blake2b-256 derivation and isolated proposition mutations |
| Complete real candidate | RISC Zero host after all positive and negative receipt assertions | TypeScript and JVM candidate loaders | Partial or failed prover output could look complete | Create-only files plus create-last manifest binding exact order, lengths and Blake2b-256 digests |
| Exact statement and transport | Rust candidate statement plus WP-06W parser | JVM `VerifyStark` expression | A valid proof for another native payload, chain, program, profile or `SELF` could cross the boundary | Real 813-byte statement and four chunks ingest through the relayer; exact real statement digest is frozen |
| Parsed-tree input-script acceptance | SigmaState deserializer and ordinary input verification | Future activated full transaction | Serializer output could differ from the actual tree evaluated, or errors could masquerade as rejection | Parsed-tree positive succeeds; proof, order/length, payload, program, chain, `SELF`, profile, context and version negatives are isolated |
| Activation and funds authority remain external | False claim fields, rejected proof-system ID and no settlement imports | Tracker, DUP, payout and broadcast authorization | Preactivation conformance could be promoted into value release | WASM/JVM context serialization, target-node acceptance, EIP-0045 activation, full settlement predicate and Gate 5 remain open |

The WP-06X fixture constructs `ContextExtension` values directly in the JVM, so
it does not itself establish cross-runtime serialization.

**WP-06Y closes the exact two-variable preactivation serialization question
without relaxing the general guard.** A bridge-owned TypeScript fixture starts
from the complete WP-06W envelope, creates variable `0` with
`Constant.from_coll_coll_byte`, creates variable `1` with
`Constant.from_byte_array`, places both values in the exact EIP-12 unsigned
transaction object, and reparses that object through
`ergo-lib-wasm-nodejs` 0.28.0. The extension extracted from the parsed input is
the only byte source supplied to the JVM.

For the complete Rust candidate, the serialized extension is 223,342 bytes with
Blake2b-256 digest
`62909ee396c68bb80ef85b3edab3d39556ebe944bc61be0e5b95f5e57fd742c4`.
The EIP-12 object has unsigned transaction ID
`89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e`.
The pinned JVM parser consumes every byte, recovers exactly variables `0` and
`1` with types `Coll[Coll[Byte]]` and `Coll[Byte]`, verifies all four chunk
bytes in order plus the 654-byte payload, and reserializes byte-identically.

The WP-06Y producer-to-consumer closeout is:

| Invariant | Producer / enforcement | State fields / bytes | Downstream consumers | Failure if relaxed | Branches | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|---|
| Exact EIP-12 producer path | WP-06W envelope, sigma-rust constants, `UnsignedTransaction.from_json`, then extension extraction from the parsed input | Complete EIP-12 object, keys `0/1`, constant hex, unsigned transaction ID | Pinned JVM `ContextExtension.serializer`; future complete transaction serializer | An isolated hand-built extension could pass while the live EIP-12 path emits different bytes | Build, EIP-12 parse, input extraction, EIP-12 round-trip | Complete manifested Rust candidate through the parsed EIP-12 object | External raw-seal identity mismatch rejects before fixture creation | Implemented and focused green; no funds authority |
| Exact key and type schema | WASM variables `0 = Coll[Coll[Byte]]`, `1 = Coll[Byte]`; existing four-Var guard runs before parsing | Key count/order and both Sigma type descriptors | WP-06X `GetVar(0)` and `GetVar(1)` consumers | Missing, additional or type-confused values could alter the proof ABI | Both required keys, unexpected key, both type positions | Exact two-key/type JVM parse | Missing `0`, missing `1`, extra `2`, swapped types | Matrix covered for the exact two-variable profile |
| Exact proof chunks | Complete manifested Rust candidate and WP-06W chunk constraints | Four chunk lengths, bytes, order and Blake2b-256 digests | WP-06X proof child | A reordered, changed or differently partitioned proof could cross the runtime boundary | Cardinality, each position, bytes, partition | Four exact chunks recovered from variable `0` | Reordered chunks and one changed proof byte; WP-06W covers every length boundary | Matrix covered; proof validity remains external |
| Exact application payload | Complete statement and WP-06W statement reconstruction | Variable `1`, 654-byte length and Blake2b-256 digest | WP-06X payload child and statement binding | A proof could be evaluated against another bridge statement payload | Type, length, bytes | Exact real payload recovered from variable `1` | One changed payload byte; missing and wrong-typed variable covered separately | Matrix covered; source finality remains external |
| Cross-runtime serialization identity | WASM `ContextExtension.sigma_serialize_bytes` extracted from the parsed input | 223,342 serialized bytes and digest | JVM strict parser and serializer; future bytes-to-check boundary | Map iteration or parser-boundary differences could change transaction identity | Complete parse, trailing input, incomplete input, reserialization | JVM consumes all bytes and reproduces the exact digest | Truncated bytes and one trailing byte reject | Exact-shape conformance only; larger-map risk remains open |
| Authority remains external | Fixture boundary flags, no signer or transport capability, rejected proof-system ID | Seven false/non-authorizing boundary fields | Target node, tracker, DUP, payout and broadcast authorization | Serialization evidence could be promoted into value-release authority | Serialization success versus every downstream authority | Boundary vector records serialization-only status | JVM checks all authority fields remain false | Signing, node check, submission, broadcast, activation, Gate 5 and funds authority remain false |

WP-06Y is deliberately narrow. It does not prove canonical ordering for
arbitrary or larger `ContextExtension` maps and does not justify changing the
default four-Var guard. A JVM-order workaround, manual var packing, node-wallet
signing workaround or guard bypass still requires a separate reviewed
compatibility decision and is not part of the bridge path.

**WP-06Z closes the exact proofless whole-transaction serialization question
without activating the consumer.** The bridge-owned fixture reuses the complete
WP-06Y EIP-12 object, parses it with `ergo-lib-wasm-nodejs` 0.28.0, and converts
that exact unsigned transaction into a transaction with one empty spending
proof. The exported bytes come only from `Transaction.sigma_serialize_bytes`;
their Blake2b-256 digest must equal both the unsigned and proofless transaction
IDs before the fixture can be emitted.

For the complete Rust candidate, the bytes-to-sign length is 223,421 and the
digest and transaction ID are both
`89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e`.
The pinned JVM does not parse the EIP-12 JSON because its public JSON codec does
not accept the same numeric representation. Instead it independently builds
the typed transaction from the exact fixture projection, requires byte equality
with the producer, then strictly parses and byte-identically reserializes the
producer bytes.

The WP-06Z producer-to-consumer closeout is:

| Invariant | Producer / enforcement | State fields / bytes | Downstream consumers | Failure if relaxed | Branches | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|---|
| Exact whole-transaction identity | WP-06Y EIP-12 object, sigma-rust `UnsignedTransaction`, empty-proof conversion and transaction serializer | One input, no data inputs, one output, 223,421 bytes-to-sign, unsigned ID and transaction ID | Pinned JVM typed projection, strict transaction parser and serializer; future activated target-node check | A serializer or projection mismatch could make the checked transaction differ from the proof-bearing candidate | Unsigned parse, empty-proof conversion, serialization, digest/ID equality | Complete manifested Rust candidate produces the frozen transaction identity | Changed input ID, extra input/output, data input, truncation and trailing byte | Exact preactivation serialization only |
| Exact proof-bearing input | WP-06Y serialized extension and empty spending proof | Input box ID, zero spending-proof bytes, context keys `0/1`, 223,342 extension bytes and digest | EIP-0045 input script and future full transaction check | A STARK-proof chunk, payload, spending proof or context serialization could change without changing the declared candidate | Exact extension equality, spending-proof emptiness, strict JVM parse | All four STARK-proof chunks and the 654-byte payload survive the complete transaction | One changed STARK-proof byte and one changed payload byte change transaction identity; a non-empty spending proof preserves bytes-to-sign identity but fails the proofless shape | Proof validity remains the WP-06X preactivation result |
| Exact funds-neutral output | Fixed value-preserving output projection | Value `1000000`, exact proposition, zero assets/registers, creation height `100`, output index and box ID | Future activated target-node check only | A different value, script, asset, register or height could be mistaken for the conformance transaction | Output shape, field equality, derived output identity | Sigma-rust and JVM preserve every output field and output ID | Value, tree and height changes alter identity; token/register/extra-output shapes reject | No settlement or payout authority |
| Cross-runtime transaction serialization | Sigma-rust complete bytes-to-sign | Exact bytes, Blake2b-256 and transaction ID | JVM independent construction plus strict parse and byte-identical reserialization | Matching context bytes could hide a disagreement in input/output or transaction framing | Producer byte emission, JVM projection, strict parse, reader exhaustion, reserialization | Both runtimes derive the same 223,421 bytes and ID | Truncated and trailing bytes reject; every tested semantic mutation changes identity or fails shape | Exact one-transaction conformance only |
| Authority remains external | Fixture boundary flags and absence of signer, node or transport capabilities | Seven false/non-authorizing boundary fields | Activated target runtime, node check, signer, submitter and broadcast authorization | Serialization evidence could be promoted into executable or value-release authority | Serialization success versus every downstream authority | Boundary vector records whole-transaction serialization only | JVM checks all authority fields remain false | Signing, node check, submission, broadcast, activation, Gate 5 and funds authority remain false |

WP-06Z does not establish EIP-0045 activation, target-node script reduction,
stateful transaction acceptance, source finality, settlement composition or
value release. WP-06AA advances the local predicate and complete input-script
acceptance without pretending an activated node exists. A separately
authorized, non-broadcast stateful check against the exact future activated
runtime remains required; until that runtime exists and its activation identity
is verified, the bridge remains fail-closed.

**WP-06AA implements the first complete validity-authenticated tracker
transition without a committee predicate.** `SPVTrackerValidityV1.es` is a new
profile rather than a reinterpretation of the existing GRANDPA V1/V2 tracker.
The exact proposition, program, verifier profile, application payload,
approved GRANDPA trust-anchor digest, and contract ID are bound into a newly
generated non-dev RISC Zero receipt. The tracker then verifies that receipt,
requires the payload trust root to equal its lineage-preserved R9 bytes, and verifies
the exact `0x0401` extension membership, checkpoint allowlist and monotonic
height, tracker NFT, AVL insert, and complete successor state in one input
script.

The bridge-owned producer builds the exact four-variable EIP-12 extension,
passes the existing guard, constructs ten deterministic parent-linked Ergo
headers whose IDs are independently reproduced by sigma-rust and the JVM, and
emits the complete proofless transaction. The pinned JVM uses the selected
header's real decoded `extensionRoot`, the tip's AVL state root, and a preheader
that extends that tip. It accepts the complete positive input and rejects
isolated proof, trust-root, extension, source, selector, monotonicity,
successor-register/proposition, NFT/token, value, and capability mutations.

The WP-06AA producer-to-consumer closeout is:

| Invariant | Producer / enforcement | State fields / bytes | Downstream consumers | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Exact validity consumer identity | Pinned draft compiler, frozen proposition bytes, TypeScript/Rust contract-ID derivation, candidate manifest | 1,784-byte proposition, source/proposition digests, contract ID, statement digest | RISC Zero claim reconstruction and JVM `SELF` | A proof for the funds-neutral 85-byte consumer or another tracker could be admitted | Fresh real proof targets the exact validity tracker | Legacy consumer, proposition, statement, manifest, and contract-ID drift reject | Preactivation identity only |
| Exact proof and checkpoint payload | Source-pinned guest/host, strict complete-candidate loader, four-chunk envelope | Four raw-seal chunks, 654-byte payload, fixed program/profile, sidechain/checkpoint/root identities | `verifyStark` and tracker field checks | A valid proof could be replayed across a program, profile, tracker, sidechain, or checkpoint | JVM accepts the real non-dev proof inside the tracker predicate | Proof byte, source sidechain, profile availability, payload/statement bindings reject | Proof-system ID `2` remains inactive |
| Approved source trust root | Explicit fixture input plus tracker R9 `Coll[Byte]` allowlist | Exact 32-byte GRANDPA trust-anchor digest in payload, SELF R9 and successor R9 | Tracker admission and future validity-settlement data-input check | A prover could choose its own internally coherent GRANDPA authority history for the approved sidechain ID | Real proof payload matches the explicit approved digest and R9 remains unchanged | Valid proof under an unapproved digest and successor R9 drift reject | Profile trust root, not a committee signature or automatic custody claim |
| Ergo extension authentication | Canonical `0x0401` leaf/proof builder and ten-header context producer | Extension key/value, 1..14 fixed-width proof levels, selected header index/root/ID/height | Tracker extension fold and 264-byte AVL value | A valid source proof could be attached to an Ergo header that never committed its root | Selected canonical synthetic header contains the exact extension root | Membership byte, valid-wrong selector, out-of-range selector, root/value drift reject | Canonical header IDs are established; mined/canonical-chain evidence is not |
| Append-only tracker transition | Pure planner, WASM AVL prover, tracker input script | NFT, R4 counter, R5 full AVL tree, R6 sidechain, R7 height, R8 stamp, R9 trust root, output value/script | Future validity-settlement data input | A proof could overwrite state, regress height, swap the singleton, change its script/tokens/trust root, or emit an unrelated successor | Exact insert proof and full successor accept | Counter/tree/sidechain/height/stamp/trust-root/proposition/NFT/token-cardinality/value mutations reject | No current payout consumer |
| Cross-runtime four-variable ABI | `ergo-lib-wasm-nodejs` EIP-12 parser and serializer; JVM strict `ContextExtension` parser | Variables `0..3`, serialized extension, proofless transaction, ten serialized headers | JVM whole input-script verification; future activated node | Context ordering, type, header-ID, state-root, or transaction framing drift could hide behind isolated proof success | 223,720-byte extension and 225,698-byte proofless transaction round-trip for the real candidate | Missing/type/order/byte/header/proof/successor mutations reject | Exact-shape evidence only; proposed 262,144-byte ingress is not active |
| Funds authority remains absent | Explicit boundary object, no signer/transport capability, no settlement import | Activation, mined header, node check, sign, submit, broadcast, Gate 5, funds booleans remain false | Future activated tracker and validity-settlement profile | Local draft success could be mislabeled as deployed trustless settlement | JVM asserts every non-authority boundary | Any promoted boundary rejects in producer/consumer tests | Gate 5 and readiness remain open |

The inherited extension membership ABI accepts both `0x02` and `0x03` labels
for a unary EmptyNode because the protocol hash omits the absent child. The
canonical builder emits `0x02`; changing the label does not change the computed
root or membership meaning. This representation ambiguity does not authorize a
different checkpoint, but a future proof-format version should choose one
canonical unary tag if unique transaction encoding is required. WP-06AA keeps
the compatibility bytes unchanged.

**WP-06AB supplies the local preactivation value-release conjunction without
promoting it into funds authority.** `MainChainCausalVaultValidityV1.es` reads
the exact WP-06AA tracker as its only data input. It pins the tracker NFT,
proposition, sidechain, settlement profile and approved R9 trust-root digest;
derives the `E2S_SPV_VALIDITY_V1` key; verifies membership of the exact
264-byte tracker value; verifies the versioned burn leaf and Merkle path; and
binds recipient, amount, asset, source intent, anchor age and partial/terminal
vault value. `DoubleUnlockPreventionValidityV1.es` is a distinct committee-free
singleton profile hash-bound to that vault tree and requires the matching
absence proof, insertion proof and successor digest.

The WP-06AB producer-to-consumer closeout is:

| Invariant | Producer / enforcement | State fields / bytes | Downstream consumers | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Versioned settlement identity | Pure profile codec, pinned JVM compiler and frozen contract spec | Source network, sidechain, tracker/DUP NFTs, tracker/vault contract IDs, trust root, semantic program, verifier profile, admission profile and profile ID | Both spending predicates and fixture parser | An internally valid proof or replay state could cross a chain, profile or contract family | Exact profile compiles to the pinned 2,558-byte vault and 672-byte DUP propositions | Zero/unknown profile fields, contract/profile/source mismatches and placeholder drift reject | Preactivation identity only |
| Exact fixture provenance | Strict raw-ASCII JSON parser, contract compiler receipt and pinned JVM source-binding checks | SHA-256 of exact tracker-context, contract-identity and Frontier-vector bytes; SigmaState commit; template, resolved-source and proposition identities | Fixture builder and independent JVM acceptance suite | Lossy decoding, duplicate keys, ignored receipt fields or source substitution could make the evidence describe bytes other than those consumed | Fresh receipt and fixture reproduce all pinned digests before reduction | Non-ASCII, duplicate/unknown fields, unsupported compiler commit, promoted receipt boundary and source-byte substitutions reject | Evidence provenance only; these hashes are not settlement authority |
| Authenticated tracker data input | WP-06AA successor plus WP-06AB parser and vault predicate | Exact box ID, singleton NFT, proposition, R5 tree, R6 sidechain, R7 height, immutable R9 trust root and 264-byte value | Burn-root lookup, anchor-age check and payout predicate | An unauthenticated or committee-selected register set could authorize payout | Sole data input matches the exact WP-06AA output and derived tracker key/value | Missing/extra input, NFT, proposition, sidechain, key/value, digest, anchor and R9 mutations reject | Synthetic anchored header; no activated-node evidence and no finalized Frontier application-state membership for the V1 event root |
| Burn inclusion and payout binding | Frontier V1 root extractor, versioned 205-byte leaf codec and vault predicate | Sidechain/block, burn ID, source tx, event index, recipient tree/hash, raw amount, zero native-ERG asset and Merkle path | Payout output and DUP key derivation | A valid root could release the wrong asset, amount, recipient or event | Target burn index 5 reproduces the tracker event root and exact payout | Leaf, sibling hash, recipient, amount, asset, burn, event and root mutations reject | Local inclusion under the V1-carried root only; root membership in finalized application state is not established |
| Causal vault conservation | V2 source-intent codec, vault input and branch-specific successor equations | 229-byte intent, consumed source-box ID, vault ERG, fee, payout, bounded monotonic creation-height stamp and optional successor | Current payout plus any later vault spend | Refundable or unrelated collateral, token substitution, value leakage, artificial box aging or malformed continuation could fund release | Partial branch preserves exact remaining ERG and registers with a nonfuture height no more than 100 blocks old; terminal branch emits no vault successor | Source network/sidechain/profile/asset/amount/recipient, source-box, token, output tree/value/register/creation-height, fee and ordering mutations reject | Synthetic committed vault; mint/collateral admission remains separate |
| Atomic replay transition | Pure DUP planner, WASM AVL proof and hash-bound DUP predicate | DUP NFT, profile ID, input/output full AVL trees, counter, burn key, bounded monotonic creation-height stamp and absence/insert proofs | Current payout and every later replay check | The same burn could pay twice, the replay singleton could advance under another vault or its successor could be artificially aged | Absence and insertion produce the exact successor digest with a nonfuture height no more than 100 blocks old in the same transaction | Prior membership, proof bytes, digest, counter, NFT, profile, value, tree, creation-height and successor mutations reject | Synthetic singleton setup; genesis lineage remains open |
| Complete transaction and protected-predicate conjunction | EIP-12 builder, `ergo-lib-wasm-nodejs` round-trip and pinned JVM whole-transaction parser | Three ordered inputs (DUP, vault, fee), one ordered data input, four outputs, exact box bytes, 3/4/0-variable extensions, 4,929 proofless bytes and transaction ID | Both protected input-script reductions; future activated node check | Isolated contract success, an omitted fee input or cross-stack transaction drift could hide a failing protected predicate | Pinned JVM retains all three inputs and accepts both protected inputs for partial and terminal branches | Spending/data-input/output order, box identity, extension and every owning-predicate mutation reject the complete protected conjunction | JVM target-runtime evidence for the pinned preactivation draft only; the fee input is retained but its authorization and full three-input reduction remain unestablished |
| Authority remains external | Explicit fixture boundaries and absence of signer/node/transport capability | Self-asserted reduction, setup lineage, activation, check, sign, submit, broadcast, Gate 5 and funds fields remain false | Future setup ceremony, activated node and release gate | Local VM evidence could be promoted into a live-funds claim | JVM independently performs reduction while the fixture retains non-authorizing flags | Any promoted authority flag rejects fixture conformance | Gate 5 and readiness remain open |

The generated JSON does not self-authorize by asserting that it reduced; the
pinned JVM suite is the deciding reduction authority. The fixture's setup
transaction is synthetic and does not establish the DUP NFT or vault lineage.

**WP-06AC freezes the application-bound tracker format without claiming an
on-chain consumer.** The existing Rust application statement is reproduced in
TypeScript byte-for-byte. The tracker key has a new domain and the value has a
new domain, discriminators and fixed 370-byte schema; the 264-byte V1 family is
not reinterpreted. The value retains the source application's binding digest,
settlement and causal profiles, complete payload digest, program and verifier
profile alongside the checkpoint and Ergo anchor.

The WP-06AC producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact bytes or fields | Consumer | Failure if relaxed | Status |
|---|---|---|---|---|---|
| Frozen application statement | Rust statement codec and matching TypeScript codec | 240-byte binding, 973-byte payload, 1,132-byte statement and their pinned digests | V2 guest journal and future tracker contract | A finality proof could be reused for another bridge runtime, token, settlement profile or source network | Codec parity only |
| Distinct tracker identity | V2 key/value codecs | `E2S_SPV_VALIDITY_APPLICATION_KEY_V2`, `E2S_SPV_VALIDITY_APPLICATION_VALUE_V2`, `[2,1,1,0]`, 32-byte key and 370-byte value | V2 AVL tree and future settlement consumer | V1 compatibility entries could cross-authorize a V2 payout | TypeScript and WASM positive/negative fixtures pass |
| Exact semantic retention | V2 value encoder/decoder | Event root, checkpoint, anchor, consensus block, burn count, application binding, settlement/causal profiles, complete payload digest, program and verifier profile | Future tracker and payout predicates | A valid proof could be detached from the application or settlement semantics it proved | Pure format is frozen; ErgoTree consumption remains open |
| Supplied-root membership and append-only transition | V2 planner, extension proof verifier and schema-specific WASM AVL operations | Exact `0x0401` key/value membership under a supplied extension root, retained ID/height/depth tuple, monotonic sidechain height, input/successor digests and registers | Future V2 tracker input predicate | A duplicate key, stale depth or wrong tree schema could enter the local plan | Local construction only; the planner does not authenticate ID, height and root as one Ergo header |
| Authority cap | Explicit planner boundary object | Header-tuple authentication, authority for expected identities, proof transport, proof validity, activation, on-chain acceptance, funds authority and Gate 5 are all false | WP-06AD contract/JVM matrix, daemon and future release evidence | Caller-supplied expectations or a locally constructed transition could be promoted into settlement authority | Enforced by API and coordinated-substitution tests |

**WP-06AD defines the application-bound V2 tracker's local strict conformance
closeout without claiming activation or funds authority.**
`SPVTrackerValidityApplicationV2.es` consumes the exact
application-bound payload and a real succinct receipt under a distinct
committee-free proposition. The exact four-variable context carries the proof,
payload, combined extension/AVL proofs and one selected-header index. The
contract reads that one header's ID, height and extension root, verifies
`0x0401`, recomputes the complete 370-byte tracker value, verifies the AVL
insertion and constrains the exact successor.

The WP-06AD producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact bytes or fields | Consumer | Failure if relaxed | Status |
|---|---|---|---|---|---|
| Exact proposition identity | Pinned SigmaState compiler spec and TypeScript identity module | 2,424 proposition bytes, SHA-256 `992f8431d12630c76d9f8414c6f9984ac0bcaf76bee991fddcea4fefa766fb0d`, contract ID `adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b` | Rust statement producer, candidate loader and JVM evaluator | A proof could be replayed under a different settlement predicate | Exact source/proposition/ID checks pass locally |
| Exact proof transport | Rust host, create-last manifest and strict TypeScript envelope | Four raw-seal chunks, 973-byte payload, 1,132-byte statement, exact program/profile/terminal IDs and complete file digests | Context builder and JVM `VerifyStark` path | A partial, reordered, substituted or stale proof packet could reach the predicate | One real proof passes; seal, order, length, manifest and identity negatives reject |
| Application profile binding | Guest composition and hard-coded V2 proposition profile | Source network, sidechain, bridge/token addresses, runtime hashes/sizes, settlement and causal profiles | Tracker value and future V2 settlement consumer | A valid proof for another application could enter this tracker | A second real receipt with exactly one authenticated bridge-runtime hash byte changed verifies under the pinned proof runtime, then the frozen proposition rejects it |
| One-header anchor tuple | `CONTEXT.headers(Var(3))` and exact equality checks | Selected header ID, height, extension root and `0x0401` membership value | Anchor fields in the V2 tracker value | Caller-selected fields from different headers could be combined | Integrated positive plus index/ID/height/root/membership negatives pass locally |
| V2 replay schema | V2 key/value codecs, canonical extension proof and schema-specific WASM AVL insert | V2 domains/discriminators, 32-byte key, 370-byte value, input/output digest and insert proof | R5 successor and future V2 payout lookup | A 264-byte V1 entry, duplicate event or cross-schema proof could enter V2 state | V1 payload, proof and proposition reject; a populated-tree duplicate-key insertion rejects with its exact proof and transition bundle |
| Stateful successor | Tracker input predicate | Singleton NFT, value, proposition, R4-R9, exact AVL successor, nonfuture monotonic application stamp, and nondecreasing/nonfuture creation height within 100 blocks of `HEIGHT` | Every later V2 tracker transition | A parallel lineage, rollback, stale script, materially aged continuation or forged successor could persist | Integrated JVM token/register/value/proposition/stamp and isolated creation-height negatives pass; canonical setup lineage plus a measured rent reserve and monitored refresh/retirement path remain open |
| Context and capability boundary | Four-variable transport guard, WASM round trip and pinned JVM capability | Exact variables 0-3 and activated local draft verifier profile | Future checker/signing boundary | Missing, mistyped or unavailable proof inputs could be interpreted inconsistently | Missing/wrong-type and unavailable-capability negatives reject; no signer or node check exists |
| Authority cap | Explicit fixtures and documentation | Activation, target-node acceptance, signing, submission, broadcast, Gate 5 and funds authority remain false | Future WP-06AE, node packet and release evidence | Local VM conformance could be promoted into a live-funds claim | Enforced; no authority-bearing route was added |

**WP-06AE closes the application-bound settlement conjunction locally without
claiming lineage, activation or funds authority.**
The application-specific Frontier vector is domain-distinct from the historical
V1 vector. Its execution block, three-burn count and event root enter a separate
real RISC Zero proof, the exact WP-06AD tracker, and finally the complete
payout/DUP transaction.

The WP-06AE producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact bytes or fields | Consumer | Failure if relaxed | Status |
|---|---|---|---|---|---|
| Application commitment | Frontier extractor plus explicit Rust application fixture | Sidechain `22..22`, execution block `22..22`, burn count `3`, root `d5f26f1ddc319a969c8c3aea47fedd7d8e615c0746fdae84ac9984202aefe3b7` | RISC Zero statement, WP-06AD tracker value and payout planner | A valid proof for a different block, root or burn set could authorize the selected payout | One real receipt passes; isolated block/root/count mutations change the statement; V1 fixture bytes remain frozen |
| Exact tracker input | WP-06AD proposition, application AVL value and strict context parser | Tracker NFT `a1..a1`, exact proposition, R5 digest, R6 sidechain, R9 trust root, V2 key and 370-byte value | Both WP-06AE spending predicates | A local status, V1 value or unauthenticated root could replace the proof-authenticated tracker | Exact data input passes; V1 proposition/value/proof and isolated identity/register/value mutations reject |
| Versioned settlement predicates | Pinned SigmaState compiler and create-only identity receipt | 3,562-byte vault ID `a77327ce..fe77064`; 701-byte DUP ID `58d1e5b1..e79939b9`; exact profile/application/trust identities | TypeScript transaction builder and pinned JVM evaluator | Source drift or a cross-profile predicate could be treated as the reviewed consumer | Template, resolved-source, proposition, contract-ID and receipt SHA-256 bindings pass; exact protocol source files are LF-pinned |
| Burn payout and conservation | Canonical 205-byte leaf, bounded Merkle bundle and causal source intent | Burn ID, source transaction, event index, recipient, raw nanoERG amount, zero ERG asset ID, source network, application and profile | Vault predicate over exact payout and optional successor | Another event, recipient, amount, asset or refundable/unrelated vault could release ERG | Partial and terminal branches pass; isolated leaf/path/payout/source/vault/value mutations reject |
| Replay transition | DUP lookup/insert proofs and committee-free singleton predicate | Burn ID, input/output AVL digests, NFT, profile, counter, bounded proof lengths and exact successor | DUP and vault predicates in the same transaction | One burn could be paid twice, replay state could fork/wrap, or an oversized length could overflow before proof slicing | Prior membership, proof/digest/NFT/profile/proposition/successor, negative/`Long`-overflow counter, zero/above-`Int` lookup length and insertion-proof exhaustion mutations reject |
| Complete transaction and provenance | Duplicate-key-rejecting ASCII JSON parser, WASM EIP-12 round trip and pinned JVM | Three spending inputs, one tracker data input, exact output order, required ContextExtension variables, source SHA-256 bindings and 6,134 proofless bytes | JVM positive/negative matrix | Individually valid facts or stale/ambiguous transient artifacts could be assembled into a different transaction | Transaction ID `02674e4776bccc992175b85a663c20e7b42a5fa87cd2b751626b37303e3d1b96`; JVM accepts the integrated three-leaf path, isolates the synthetic one-leaf predicate branch, and rejects depth/node/root plus duplicate-key mutations |
| Authority cap | Explicit fixture boundaries and no capability-bearing adapter | Setup lineage, finalized deployed source observation, activated node check, signature, submission, broadcast, funds authority and Gate 5 remain false | WP-06AF, future node packet and release evidence | Local synthetic proof/JVM conformance could be promoted into a live route | Enforced; JSON does not self-assert JVM reduction and no authority route was added |

The WP-06AE closeout evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` for the exact application-bound three-burn producer chain and the separately scoped settlement-predicate branches |
| Independent review | `complete`; the exact pre-commit diff was re-reviewed after proof-length, LF-provenance, single-leaf-scope, counter, empty-proof and duplicate-key findings were corrected, with no remaining finding |
| CI | `not_run`; local TypeScript, Rust, WASM and pinned-JVM checks are green but do not constitute external CI |
| Target runtime | `not_run`; pinned local JVM reduction and a real local RISC Zero receipt do not establish activated target-node acceptance |
| Readiness claim | `local_only`; no setup lineage, profile activation, signing, submission, broadcast, funds authority, Gate 5, trustless or production-readiness claim follows |

WP-06AE's exact local closeout is complete. WP-06AF-1 through WP-06AF-3
constructed a deterministic V3 profile, compiled application instance and
unsigned setup graph. AF-3 then exposed a missing funds-authority invariant:
the graph did not create a non-forgeable reserve lineage. A configured ID,
copied register, process-owned packet, local database row or synthetic fixture
is not lineage authority. WP-06AF-4 therefore introduces a separate V4 family
rooted in one reviewed genesis-derived pooled-reserve NFT. Activated target-node
stateful acceptance remains the following external boundary and is not a reason
to reintroduce an R9 `SigmaProp`.

WP-06AF starts from two concrete incompatibilities discovered at the lineage
boundary:

- the frozen WP-06AD/AE tracker and DUP NFT IDs (`a1..a1` and `a2..a2`) are
  conformance identities, while their synthetic setup fixtures spend first
  inputs with different box IDs. They therefore cannot satisfy Ergo's
  first-input singleton minting rule and must remain byte-identical
  compatibility fixtures rather than deployment inputs;
- `PegInCausalAdmissionProfileV2` includes the compiled source-lock and vault
  ErgoTree hashes in the profile ID even though those contracts embed that
  profile ID. A concrete instance cannot be derived by requiring a
  cryptographic fixed point;
- the V3 commitment output carries a source-lock box ID in R5, but that field is
  copyable metadata. Requiring a token whose ID equals R5 is also insufficient:
  an unrelated first input can issue a token, copy its own ID into R5 and build
  the expected output without consuming the reviewed refundable source lock.
  That design was independently falsified and discarded before commit.

WP-06AF is therefore executed in three completed compatibility stages and three
new V4 stages:

1. **WP-06AF-1 — non-circular lineage profile.** The versioned V3 profile binds
   source/application semantics, the two exact validated genesis input box IDs,
   source-lock/tracker/vault/DUP template SHA-256 identities, finality and proof
   policies, revision and activation height. The singleton NFT IDs are derived
   only from the complete EIP-12 genesis inputs. Compiled proposition IDs and
   local persistence are excluded. The profile candidate constructs no setup
   transaction and carries no activation, signing, submission, broadcast,
   funds, Gate 5, trustless or readiness authority. The frozen V2 profile and
   WP-06AD/AE bytes are not reinterpreted. Each template identity means
   SHA-256 over the exact UTF-8 repository template bytes before any placeholder
   substitution; WP-06AF-2 LF-pins those files, recomputes these identities
   and binds the exact resolved source plus compiler identity in create-only
   receipts. Any consumer that relies on genesis provenance must accept the
   same-process derived candidate, not an arbitrary encoded or decoded profile;
   a serialized candidate must be re-derived from both complete EIP-12 boxes.
2. **WP-06AF-2 — exact application instance compilation.** A new instance is
   compiled from the V3 profile ID and derived singleton IDs. It binds the exact
   application statement, tracker, causal vault, DUP and source-lock
   propositions through create-only compiler receipts. Reject any substitution
   of profile, genesis input, template, proof policy or proposition identity.
3. **WP-06AF-3 — deterministic unsigned lineage packet.** Make the two explicit
   genesis boxes the first inputs of separate singleton issuance transactions;
   bind exact singleton outputs, registers, values, fees and change. Construct
   the refundable source-lock transaction and consume its exact output into the
   non-refundable causal vault. No signer, node wallet, submitter or broadcaster
   is reachable.
4. **WP-06AF-4A - canonical pooled-reserve topology and V4 profile.** Derive a
   separate profile from three pairwise-distinct validated genesis inputs:
   tracker, DUP and settlement vault. Each role's exact singleton NFT ID is its
   genesis input box ID. Freeze one ERG settlement lane, the pooled-reserve
   registers, the append-only deposit commitment policy, exact input/output
   roles and externally funded fees. V1/V2/V3 bytes, domains, IDs and fixtures
   remain unchanged. A per-deposit token whose ID merely agrees with a copied
   register is a blocking rejected design.
5. **WP-06AF-4B - source-lock-to-reserve acceptance.** The deposit transaction
   must atomically consume the exact refundable source-lock box and current
   canonical reserve singleton. Its unique successor preserves the exact
   reserve NFT and proposition, increases reserve value by exactly the protected
   amount, inserts the canonical deposit commitment once and preserves every
   conservation field. A transition confirmed under the exact V4
   Ergo-deposit finality policy is required before the domain-separated
   sidechain mint identity can become eligible. Observation, a journal row or a
   self-consistent token is never mint authority.
6. **WP-06AF-4C - burn settlement and mint-admission binding.**
   - **WP-06AF-4C-1 - deterministic burn-settlement packet.** Construct the
     exact unsigned reserve-plus-DUP transition from a versioned V4 tracker
     value, canonical burn inclusion proof and canonical settlement bundle.
     This local construction milestone is complete, including exact topology,
     payout, reserve conservation, replay insertion, external fee funding,
     anchor-depth checks and isolated negative vectors. It does not establish
     JVM, node or on-chain acceptance.
   - **WP-06AF-4C-2 - protected-script acceptance.** This local milestone is
     complete. One hash-pinned proofless AF-4C-1 transaction accepts against
     both V4 spending predicates in the pinned SigmaState JVM. Ten tests isolate
     topology, tracker, burn, payout, reserve, DUP, fee, anchor-depth and
     ContextExtension faults. The reserve predicate deliberately delegates
     full burn inclusion, anchor depth and replay insertion to the authenticated
     DUP predicate; the complete transaction accepts only when both predicates
     accept. Target-node activation and acceptance remain separate.
   - **WP-06AF-4C-3 - fresh mint-admission join.** This local milestone is
     complete. One process-branded async constructor accepts only the compiled
     V4 instance, deposit transition and static dual-source pair. It invokes the
     AF-4B-2 observation and complete rerun internally, then binds the canonical
     source intent and ID, exact consumed source, retained reserve commitment,
     amount, recipient, sidechain/contracts, V4 profile and existing
     domain-separated mint identity. Caller-supplied evidence and binding
     overrides, accessors, clones and collateral restored before the rerun
     reject. Repeated unchanged observations preserve the semantic digest. The
     result is point-in-time and non-authorizing: it neither proves historical
     mint absence nor writes authoritative duplicate state or hands off
     atomically to a mint. WP-07B owns that restart/reorg-safe lifecycle
     boundary; a journal or SQLite row can never substitute for sidechain
     pending/processed state.

The WP-06AF-1 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Versioned non-circular identity | Exact-key V3 codec and domain-separated Blake2b-256 ID | Version, source/application identities, settlement profile, two genesis IDs, four pre-substitution template SHA-256 identities, four proof/policy identities, revision and activation height | WP-06AF-2 instance compiler only | A compiled proposition could be hidden in its own profile preimage, or one profile could be reinterpreted under another field set | Canonical 473-byte profile round-trips to golden ID `2c3c6df8..98f016` | Unknown/zero/aliased fields, wrong version, noncanonical uint64/wire bytes and every one-field identity mutation reject or change the ID | Local profile identity only |
| Genesis-derived singleton IDs | `normalizeEip12Box` plus pure-ERG/register-free and distinct-input checks | Complete tracker and DUP EIP-12 boxes; each singleton ID equals its normalized box ID | WP-06AF-2 compiler candidate and WP-06AF-3 first-input issuance builder | A configured ID or synthetic fixture could masquerade as mint lineage | Canonical funding split yields tracker `00e4ed6a..45a7e9` and DUP `66738203..eb538` | Substituted box ID, reused input and valid token-bearing input reject independently | Candidate identity only; issuance transaction and lineage remain false |
| Exact template meaning | V3 field roles plus the canonical plan definition | SHA-256 of exact LF-pinned UTF-8 repository bytes before placeholder substitution | WP-06AF-2 resolver and create-only compiler receipts | An arbitrary digest could be described as the reviewed template or the fixed-point cycle could be reintroduced | Four role-distinct template fields enter the golden profile | Every role mutation changes the profile ID | Template contents are not resolved until WP-06AF-2 |
| Non-forgeable local provenance boundary | Process-owned candidate registry after complete box normalization | Complete candidate object, profile bytes/ID and normalized boxes | WP-06AF-2 entrypoint | A decoded profile or local persistence row could bypass genesis validation | Same-process derived candidate passes | Structured clone and caller-built objects reject | Serialized candidates must be re-derived; database state is not authority |
| Authority cap | Explicit all-false candidate boundary | Setup, source consumption, singleton lineage, template/compiler, activation, target node, signing, submission, broadcast, funds, Gate 5, trustless and readiness fields | Future setup/activation packets | Profile construction could be promoted into a live-funds or readiness claim | All fourteen fields remain false | Any future consumer must establish its own later-stage authority rather than mutate this candidate | Gate 5 and readiness remain open |

The WP-06AF-1 evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` for the exact profile codec, genesis derivation and non-authorizing provenance boundary |
| Independent review | `complete`; an isolated review found four issues in the initial diff, all were corrected, and the exact corrected diff had no remaining finding |
| CI | `not_run`; the focused suite, TypeScript compiler and complete local relayer check are green |
| Target runtime | `not_run`; no proposition was compiled and no node accepted a transaction |
| Readiness claim | `local_only`; no setup, lineage, activation, signing, submission, broadcast, funds, Gate 5, trustless or production-readiness claim follows |

WP-06AF-1 is implemented locally by
`relayer/src/peg-in-causal-lineage-profile-v3.ts`. No setup, activation,
target-node, funds or Gate 5 claim follows from the profile derivation.

The WP-06AF-2 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Exact process-derived instance | V3 lineage provenance assertion plus exact template resolver | Profile bytes/ID `ab7b2ad7..c4b246`, both complete genesis boxes, four LF template SHA-256 identities, runtime binding, proof/finality policy and committee policy | WP-06AF-3 unsigned lineage builder | A decoded profile, configured NFT ID or arbitrary policy could select a funds-facing proposition | The canonical genesis split resolves one application instance | Structured clone, template drift, synthetic V2 NFTs, unknown proof fields, proof/policy/runtime mutation and reordered committee reject | Local compiler candidate only |
| Dependency-ordered proposition identity | Exact-SHA TypeScript receipt loader plus guarded SigmaState `f78deadd..84fa` compiler | Tracker `e0770da9..d4da42`, vault `402eed06..c78831`, DUP `8e616c52..2894fb`, source lock `d32271c7..3ef675`; exact source/proposition SHA-256 and proposition bytes; 19,352-byte batch SHA-256 `280081d8..cf3132` | WP-06AF-3 V3 setup outputs only | An arbitrary callback or self-asserted compiler metadata could bind a stale or unrelated parent contract while retaining plausible local metadata | A clean exact-commit checkout compiles tracker -> vault -> DUP -> source lock in disposable worktrees twice byte-identically | Arbitrary compiler callback, any receipt-byte drift, role, source hash, compiler commit/version, tree version, proposition hash/length/ID and authority-bit mutation reject | Proposition identity established; no box lineage and no V4 authority |
| Size-safe source-lock binding | `MainChainLockCausalLineageV3.es` | Exact source network, sidechain, bridge, token, settlement profile and causal profile plus `Blake2b-256(vault.propositionBytes)` and committee policy | Refundable source-lock output and its future vault transition | Embedding the full 3,562-byte vault tree exceeds Sigma's 4,096-byte reader boundary; omitting any intent field can commit collateral into a mismatched or permanently unspendable vault; omitting the contract hash permits an unrelated vault | Standard-version 867-byte source lock compiles, deserializes and round-trips | Any intent, vault contract ID, template or committee policy drift changes the resolved-source/proposition identity and rejects the frozen receipt | Frozen V2 source remains unchanged; VM transition acceptance is WP-06AF-3 |
| Reproducible compiler provenance | Guarded PowerShell launcher plus reviewed lock | Exact Java executable/release/module/JVM identities, exact sbt launcher JAR, clean Git commit, `build.sbt`, `project/build.properties`, Scala/sbt versions, compiler spec, four LF templates, create-only output path and canonical receipt SHA-256 | JVM compiler receipt and exact-SHA TypeScript loader | A substituted launcher/runtime, inherited tool options, dirty checkout, substituted build/spec/template or self-declared version could mint a plausible receipt for different proposition bytes | Two fresh detached worktrees produce byte-identical receipts and contract IDs | Toolchain hash/property drift, inherited Java/sbt/coursier options, wrong/dirty checkout, build/spec/template hash drift, output reuse, receipt SHA drift and non-false receipt authority boundary reject | Local compilation provenance only; not a hermetic supply-chain attestation |
| Version separation | New V3 tracker/source-lock templates; unchanged V2 vault/DUP templates resolved under a new causal profile | Tracker tree version `4`; vault/DUP/source-lock tree version `0`; V2 fixture IDs `a1..a1`/`a2..a2` excluded | Pinned JVM compiler and future unsigned setup packet | Existing conformance bytes could be silently reinterpreted as live singleton lineage | Exact four-role receipt is domain/profile distinct from WP-06AD/AE | Mixed V2 identities and wrong role/tree version reject | Compatibility artifacts preserved |
| Authority cap | Exact receipt schema and candidate boundaries | Setup/source consumption/lineage/node check/activation/signing/submission/broadcast/funds/Gate 5/trustless/readiness remain false | WP-06AF-3 and later activated target-node packet | Local compilation could be promoted into a deployment or value-release claim | All receipt and candidate authority fields are false | Any true authority field rejects receipt consumption | Gate 5 remains open |

The WP-06AF-2 evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `compiler_covered` for exact template resolution, six-field source-intent binding, policy binding, guarded dependency-ordered compilation and exact-SHA create-only receipt replay; source-lock VM transition coverage belongs to WP-06AF-3 |
| Independent compiler | `complete`; two disposable worktrees from the clean pinned EIP-0045 checkout emitted the same 19,352 receipt bytes and four proposition identities |
| Independent review | `complete`; an independent security rereview found no remaining P1/P2 blocker and retained the explicit non-hermetic, local-only boundary |
| CI | `not_run`; 9 focused TypeScript tests, typecheck, guarded pinned-JVM reproduction, the complete 300-file relayer check and 23 WASM tests are green locally |
| Target runtime | `not_run`; no target node checked or accepted any transaction |
| Readiness claim | `local_only`; no setup transaction, singleton lineage, source consumption, activation, signing, submission, broadcast, funds authority, Gate 5, trustless or production-readiness claim follows |

WP-06AF-2 is implemented and locally closed by
`relayer/src/validity-application-lineage-instance-v3.ts`, the V3 tracker and
source-lock templates, the guarded create-only JVM compiler spec and its frozen
receipt.

The WP-06AF-3 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Single-fault negatives | Authority / status |
|---|---|---|---|---|---|---|---|
| Separate singleton construction | Same-process compiled-instance assertion, complete EIP-12 normalization and singleton issuance builder | Exact tracker and DUP genesis box IDs as first inputs; exact V3 compiled propositions and registers; one genesis-derived NFT with amount `1`; value, external fee, change and miner-fee order | V3 compatibility evidence and V4 topology falsification | A configured ID, reused input, parallel issuance or synthetic compatibility NFT could be mistaken for settlement authority | Golden tracker transaction `e8cb7256..12f6e3` creates box `20e56d29..92c156`; golden DUP transaction `b17d9c9a..e3a142` creates box `a832bd44..524997` | Decoded compiler candidate, input reuse, genesis substitution, synthetic box ID, token-bearing input, underfunding, dust, fractional numeric value and unknown field reject | Deterministic unsigned construction only; V4 must issue a separate exact reserve NFT |
| Unsigned refundable-to-committed transition plan | Exact V3 source-intent validation plus unsigned materialization and causal commitment builder | Canonical 229-byte intent; executable depositor ErgoTree; source amount; source-lock proposition; separate commitment-fee output; exact two-input references; vault proposition, intent and source box ID | V3 compatibility evidence and the AF-4 rejected-design matrix | An observation, caller-selected vault, refundable box, fee alias or unrelated output could become mint or payout authority | Golden creation transaction `ddd581bd..cefc` creates source-lock output `626ff14c..c2c6f`; golden commitment `471c0436..546d6` references it and creates planned vault output `0de39409..e6857d` with the full protected value | Every intent identity field, non-ERG asset, low amount, zero recipient, malformed depositor tree, wrong height, timeout, fee/value and descendant drift reject | Unsigned graph only; source consumption and vault lineage are explicitly false, and copied R5 metadata is not V4 authority |
| Source-lock VM transition | Exact compiler receipt consumed by a test copied into a disposable clean SigmaState worktree at `f78deadd..84fa` | 867-byte source-lock proposition; exact six-field intent identity; 3,562-byte vault proposition hash; source amount/tokens; timeout boundary; committee policy; P2PK refund proposition and source lineage | Source-lock input predicate in the future checked transaction | TypeScript construction alone could be mistaken for contract acceptance, or the refund and commit branches could overlap | Pinned JVM reduces the canonical pre-timeout commit to the exact 2-of-3 committee and accepts the permissionless refund at and after timeout | Isolated version/length/identity/asset/amount/recipient/register/vault/proposition/lineage/value/token/height/output-order mutations reject; empty and foreign committee proofs reject the commit branch | 13/13 local JVM cases pass; only the source-lock input is reduced, so full transaction and node acceptance remain open |
| Non-forgeable packet provenance | Process-owned packet registry plus recursive freeze | Compiled candidate, four materialized unsigned transactions, exact output references, six unsigned construction invariants and twelve explicit false authority fields | V3 compatibility consumers only | A decoded packet, mutable post-validation object or local database row could substitute construction facts | Two builds are byte-identical and expose the exact golden transaction IDs | Structured clone, caller-built object and mutation reject; a later accessor substitution is neutralized by the single snapshot read | Serialized packets must be rebuilt from authoritative inputs, but process provenance is not funds lineage |
| Authority cap | Explicit all-false packet boundary and no capability-bearing dependency | Singleton lineage, source consumption, profile activation, target-node acceptance, node check, signing, submission, broadcast, funds, Gate 5, trustless and production-readiness fields | V4 design boundary and later target-node packet | A local unsigned/JVM artifact could be promoted into a live-funds or readiness claim | All twelve fields remain false | No current API can flip them | Gate 5 remains open |

The WP-06AF-3 evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` for four exact unsigned transactions, separate singleton issuance plans, the unsigned refundable-to-committed graph, executable depositor-tree parsing and non-authorizing packet provenance |
| Independent review | `complete`; independent review found branded-input accessor substitution, permissive EIP-12 runtime aliases, unsigned-lineage overstatement and a ContextExtension guard TOCTOU. All were corrected, exploit replay was neutralized, and the final exact diff has no remaining P1/P2 finding |
| CI | `not_run`; 48 focused TypeScript tests, TypeScript compilation, the complete 301-file local relayer check, 23 WASM tests and the 13-case pinned-JVM source-lock matrix are green locally |
| Target runtime | `not_run`; no target node checked or accepted any transaction |
| Readiness claim | `local_only`; singleton boxes and source consumption are unconfirmed, the complete multi-input settlement transaction is not yet lineage-bound, and no activation, signing, submission, broadcast, funds authority, Gate 5, trustless or production-readiness claim follows |

WP-06AF-3 is implemented locally by
`relayer/src/validity-application-lineage-provisioning-v3.ts`, shared strict
ErgoTree normalization, and the pinned-JVM source-lock acceptance matrix. The
V3 remains reproducible compatibility evidence, but it is not promoted into a
funds-authority profile. The next concrete slice is WP-06AF-4A.

The WP-06AF-4A topology is frozen before any V4 contract compilation:

- the first profile supports one native-ERG lane only. Its 601-byte wire format
  carries the exact 32-byte zero ERG asset identity, separate sidechain and
  Ergo-deposit finality policy IDs, and raw nanoERG semantics. A nonzero asset
  ID rejects. Token lanes require a separately versioned and audited settlement
  profile;
- tracker, DUP and pooled-reserve roles each derive one exact NFT ID from one of
  three pairwise-distinct, pure-ERG, register-free genesis inputs. The reserve
  contract and every consumer embed the exact reserve NFT ID. A token issued
  from any other first input is not an alias for that lineage;
- V4 compilation must remain acyclic. Tracker, DUP and source-lock propositions
  can be compiled from the V4 profile and exact NFT IDs before the reserve
  proposition. The source lock authenticates the reserve profile/NFT and exact
  predecessor-to-successor relation without embedding the future reserve
  proposition. The reserve proposition then embeds the exact compiled
  source-lock identity. No compiled proposition may enter its own profile or
  resolved-source preimage;
- the reserve singleton carries R4 = exact V4 profile ID, R5 = append-only
  deposit `AvlTree` and R6 = current outstanding nanoERG liability. R6 is a
  nonnegative `Long` bounded by the current box value. The invariant
  `box.value - R6 = genesis seed` must hold at genesis and every successor.
  No lifetime counter is retained: repeated deposit/withdrawal turnover cannot
  permanently stop the lane through cumulative `Long` exhaustion;
- a deposit-state key is the exact 32-byte refundable source-lock box ID. Its
  32-byte value is
  `Blake2b256("E2S_PEG_IN_DEPOSIT_COMMITMENT_V4" || profileId || sourceBoxId || sourceIntentV2)`.
  The idempotent sidechain mint ID is
  `Blake2b256("E2S_PEG_IN_MINT_ID_V4" || profileId || sourceBoxId || depositCommitment)`.
  Neither identity can be created from an observation or local status alone;
- the canonical deposit transaction uses reserve predecessor at input 0,
  exact source lock at input 1 and external fee funding after the protected
  inputs. Output 0 is the unique reserve successor. It preserves the exact NFT,
  proposition and profile; inserts the deposit key once; increases both box
  value and current liability by exactly the source-lock amount; and takes no
  fee from protected value. Mint eligibility additionally requires confirmation
  under the exact profile-bound Ergo-deposit finality policy;
- the canonical burn transaction uses reserve predecessor at input 0, exact DUP
  predecessor at input 1, external fee funding after the protected inputs and
  the authenticated tracker as data input 0. Outputs 0, 1 and 2 are respectively
  the reserve successor, DUP successor and exact payout. It decrements box value
  and current liability by the exact payout amount, preserves the exact reserve
  NFT/proposition/profile and invariant seed, and takes no fee from protected
  value;
- one canonical reserve lane is intentional. Sharding remains deferred until a
  measured throughput requirement justifies additional independently reviewed
  lineages. A future STARK aggregate path may batch deposits or withdrawals
  without silently changing this V4 profile.

The planned WP-06AF-4 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Required falsifier | Current status |
|---|---|---|---|---|---|---|
| Genesis authority | Three complete validated EIP-12 genesis boxes plus exact-key V4 profile derivation | Tracker, DUP and reserve input box IDs; pure ERG; no registers; exact zero asset; separate sidechain/Ergo finality policies; exact domain, version and remaining policy fields | V4 compiler and setup builder | A configured, cloned or independently issued token, alternate asset or ambiguous finality rule could become funds authority | Substitute each box ID, alias every input pair, add any token/register, use a nonzero asset, mutate either finality policy, clone or decode the candidate | Profile, exact compiler instance and unsigned separate issuance implemented; no confirmed box lineage |
| Refundable deposit identity | Canonical source-intent codec and reviewed V4 source-lock proposition | Source network, sidechain, bridge, asset, raw amount, recipient, profile, source box ID and timeout branch | Deposit transition | A different or still-refundable deposit could support mint eligibility | Mutate every intent field, leave source unconsumed, use a foreign proposition or cross the timeout branch | AF-4B constructs, JVM-checks and independently observes exact source consumption; mint admission remains AF-4C |
| Deposit state transition | Source-lock and reserve predicates in one transaction | Exact reserve NFT/proposition/R4-R6; source input; one absent-to-present AVL insertion; exact value/liability delta | Ergo-finality observer and mint admission | Deposit observation, copied R5 metadata or a parallel reserve could authorize minting | Independently issue a token matching copied metadata, clone reserve shape, omit source input, alter insertion/value/liability/successor | AF-4B constructs and JVM-checks the transition, then reconstructs the complete canonical reserve lineage and retained membership from two read-only sources |
| Ergo deposit finality | Versioned V4 policy plus stable canonical transaction/inclusion/tip observations | Exact commitment transaction, consumed source, reserve successor, profile-bound confirmation depth and reorg rule | Mint eligibility and reconciliation | Relayers could mint under different depths, or an Ergo reorg could restore the refundable source after mint | Insufficient depth, stale/noncanonical inclusion, divergent RPC, successor replacement and post-confirmation reorg | AF-4B-2 observes the exact transaction in both claimed full-block responses and checks the returned header against canonical required-depth ancestry; WP-01C recomputes each canonical header ID and complete signed-transaction root and retains exact receipts through the fresh rerun. PoW/canonical-consensus authentication and persistent post-mint reorg integration remain open |
| Mint identity and idempotence | Domain-separated mint-ID derivation from finality-confirmed deposit commitment | V4 profile, source box ID and exact deposit commitment | Sidechain mint call and reconciliation | Retry or alternate observations could mint twice or to another recipient | Replay the same source, mutate commitment/recipient/amount/profile/finality, rebuild from journal-only state | AF-4C-3 and WP-07B bind the non-authorizing candidate, reservation and recovery lifecycle; atomic Frontier reservation consumption remains the active P0 |
| Sidechain checkpoint and finality | V4 tracker admission under the exact application proof profile | Sidechain/checkpoint identity, `0x0401` commitment, proof system/profile and sidechain-finality policy | Burn inclusion consumer | An old, conflicting or committee-only checkpoint could release reserve funds | Wrong chain/root/profile, stale/reorged checkpoint, absent extension commitment and reserved proof-system ID | Existing preactivation proof core only; activated authority remains open |
| Burn payout | Canonical burn leaf and inclusion proof | Burn ID, source transaction/event index, raw amount, recipient, asset, sidechain and committed root | Reserve and payout predicates | A different burn, recipient, asset or amount could release ERG | Mutate every leaf field/path/root/payout and remove finalized inclusion | AF-4C-1 constructs the exact local payout packet and rejects one-field drift; AF-4C-2 establishes pinned-JVM protected-script acceptance |
| Reserve conservation | Pooled-reserve predicate | Exact NFT, proposition, value/current-liability delta, immutable `box.value - R6` genesis seed and externally funded fee | Every deposit and burn successor | Fees, overpayment, under-collateralization or an unrelated box could consume protected funds | Wrong value/liability delta, fee-from-reserve, negative/oversized liability, seed drift, successor omission, extra protected output | Deposit branch is JVM-accepted and chain-reconstructed in AF-4B; AF-4C-1 constructs the burn branch and AF-4C-2 establishes local protected-script acceptance |
| Burn replay protection | DUP predicate in the same burn transaction | Exact DUP NFT/profile, absent-to-present burn ID and exact successor | Burn settlement | One finalized burn could be paid more than once or under a parallel DUP lineage | Prior membership, duplicate insert, wrong NFT/profile/proposition/counter and stale successor | AF-4C-1 constructs and verifies the exact V4 absent-to-present insertion packet locally; AF-4C-2 establishes pinned-JVM protected-script acceptance |
| Journal non-authority | Relayer lifecycle and reconciliation ports | Confirmed transaction/inclusion/tip, exact profile and candidate identities | Retry, restart and reorg policy | SQLite state or process provenance could authorize mint/payout after chain evidence disappears | DB loss, forged status, restart, divergent RPC and reorg after local confirmation | WP-07B covers non-authorizing reservation recovery, restart, DB loss, source disagreement and reorg; actual mint execution remains absent |

WP-06AF-4A-1 is implemented locally by
`relayer/src/peg-in-pooled-reserve-lineage-profile-v4.ts`. Its closeout vector
is:

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` for the exact 601-byte codec, explicit ERG lane, separate non-aliasing sidechain/Ergo finality policies, three genesis-derived singleton identities and non-authorizing same-process provenance |
| Independent review | `complete`; the first review found unbound Ergo finality, lifetime-counter exhaustion and an implicit asset lane. All three were corrected, and a fresh exact-diff review found no remaining P1/P2 issue |
| CI | `not_run`; 11 focused V4 tests, the frozen V3 assertion, TypeScript compilation, the complete 302-file bounded relayer check and 23 WASM tests pass locally |
| Target runtime | `not_run`; no proposition was compiled and no node checked or accepted an issuance or state transition |
| Readiness claim | `local_only`; setup, singleton lineage, source consumption, deposit state, mint eligibility, burn settlement, activation, signing, submission, broadcast, funds authority, Gate 5, trustless status and production readiness remain false |

The following WP-06AF-4A-2 closeout is the retained historical record for the
initial pre-integration compiler family. Its profile, contract IDs, receipt and
evidence status are superseded by the integrated V4 family recorded in the
current execution-state table and WP-06 proof-core state above; they must not be
used as current artifact identities or current acceptance evidence.

WP-06AF-4A-2 was implemented locally by the four V4 contract templates,
`relayer/src/validity-application-pooled-reserve-instance-v4.ts`,
`relayer/src/validity-application-pooled-reserve-provisioning-v4.ts`, the
pinned compiler launcher/spec/lock and the exact compiler receipt. Its
historical producer-to-consumer closeout was:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Required falsifier | Status at historical checkpoint |
|---|---|---|---|---|---|---|
| Dependency-ordered V4 instance | Same-process V4 profile plus exact template resolver and pinned compiler | Profile ID `188e2e16..9abdb4`; three genesis-derived NFT IDs; dedicated application-validity proof-system/profile IDs `115d7970..6dc0d7` / `63b707f5..08d2c4`; four policy IDs; runtime binding; tracker -> DUP -> source-lock -> reserve resolved-source identities | AF-4A-2 setup builder and AF-4B transaction builder | An arbitrary compiler, decoded profile, federated compatibility proof identity, stale template or circular proposition identity could select a different funds-facing contract family | Clone the profile; substitute the federated peg-in IDs; mutate every template/policy/runtime field; reorder or mutate the receipt; substitute any proposition, role or authority bit | Exact local preactivation compiler instance only |
| Reproducible proposition identity | Guarded SigmaState compiler at `f78deadd..84fa` plus reviewed runtime/build/spec/template lock | Tracker `7b3391ff..8d868`, DUP `65eebe22..33cdf`, source lock `60c88283..a903f`, reserve `f31b06fe..7e6df`; 24,331-byte batch SHA-256 `e20bb399..78db5` | Exact-SHA TypeScript receipt loader | Different source bytes, compiler inputs or proposition bytes could be presented as the reviewed V4 family | Run from independent disposable worktrees; mutate toolchain/build/spec/template/output/receipt identity or any non-authority boundary | Three byte-identical local compiler runs; not a target-node or supply-chain attestation |
| Contract-compatible singleton setup | Three independent unsigned issuance builders plus schema-specific WASM empty roots | Designated genesis box is input 0 and NFT ID; exact proposition; tracker R4-R9; DUP R4-R5; reserve R4-R6; insert-only AVL flags; reserve key/value lengths 32/32; reserve root distinct from the 32/1 DUP root; zero initial liability; exact fee and change | Future confirmed tracker, DUP and reserve lineages | A setup could be deterministic while its own script immediately rejects its registers, or the first deposit insertion could be impossible from a wrong-width genesis root | Restore legacy tracker `R4 = Long(0)`; alias or replace a genesis box; add token/register state; mutate NFT/proposition/register/value/fee/change/height; substitute the DUP root for the reserve root; replay the first 32-byte commitment insertion from the exact reserve genesis | Deterministic unsigned setup packet and primitive first-insert replay only; no output is confirmed or authoritative |
| Policy separation | Exact profile-bound policy encoders | Sidechain finality, Ergo-deposit finality, source topology/refund/fee roles and deposit key/value/flags/source/hash/domain | AF-4B deposit acceptance, finality observation and later mint admission | Sidechain proof acceptance could be confused with Ergo confirmation, or local observation/state could become mint authority | Mutate every field independently, weaken ancestry/RPC/reorg handling, change source topology, AVL schema or commitment domain | IDs and compiler bindings established; execution remains fail-closed |
| Authority cap | Exact receipt, instance and packet boundary objects | Setup constructed is the only true packet boundary; lineage/source consumption/deposit state/mint/burn/activation/node/signing/submission/broadcast/funds/Gate 5/trustless/readiness remain false | AF-4B/4C and later activation work | Local compilation or unsigned transaction construction could be promoted into a funds or readiness claim | Clone objects, add unknown authority fields or set any receipt authority bit | Local-only construction evidence |

The historical WP-06AF-4A-2 evidence vector was:

| Dimension | Status |
|---|---|
| Implementation | `focused_covered` for exact four-role compilation, every profile/policy/runtime identity field, contract-compatible registers, schema-distinct DUP/reserve empty roots, first reserve commitment insert replay and three separate unsigned singleton issuance transactions; AF-4B/4C still own the value-transition acceptance matrices |
| Independent review | `complete`; two read-only P1/P2 rounds found and closed the proof-identity/matrix-claim gaps and the reserve AVL value-width mismatch, then found no remaining P1/P2 in the complete diff and reviewed provenance rotation |
| CI | `local_pass`; all 304 relayer test files passed in isolated Node 24 processes, all eight release-gate shards passed, TypeScript `tsc --noEmit` passed, all 24 WASM AVL tests passed, two WASM builds were byte-identical, the pinned JVM/WASM differential passed 3/3, and the release gate remained blocked with 9/14 pending and 0 structural issues |
| Target runtime | `not_run`; no target node checked or accepted an issuance or V4 state transition |
| Readiness claim | `local_only`; at that historical checkpoint the compiled deposit/burn predicates had no acceptance matrix, no setup output was confirmed, and no lineage, source consumption, mint, burn, activation, signing, submission, broadcast, funds authority, Gate 5, trustless or production-readiness claim followed |

WP-06AF-4B-1 is implemented locally by
`relayer/src/validity-application-pooled-reserve-deposit-transition-v4.ts`,
`relayer/src/validity-application-pooled-reserve-deposit-finality-v4.ts`, the
pooled-reserve WASM insert/replay exports, and the pinned JVM deposit-acceptance
launcher/spec. Its producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Required falsifier | Current status |
|---|---|---|---|---|---|---|
| Refundable source becomes committed reserve collateral | V4 source-lock and reserve predicates evaluated in the same transaction | Inputs reserve/source/external fee at 0/1/2; no data inputs; reserve/fee outputs at 0/1; source intent, proposition, amount and pre-timeout height | Ergo finality observation | A deposit could remain refundable after mint or unrelated collateral could enter the reserve | Omit/reorder/replace the source; use a foreign proposition; commit at timeout; add data/input/output state | Both protected inputs accept the canonical transaction and reject isolated faults in the pinned JVM |
| Append-only deposit state | 32-byte-key/32-byte-value WASM prover plus reserve `R5` predicate | Source-lock box ID, domain-separated deposit commitment, predecessor digest, insert proof and exact successor digest | Later deposit construction and reserve predicate | A repeated, malformed or history-inconsistent deposit could be counted as backing | Replay a key; use empty/stale history on a populated reserve; mutate key/value/proof/root | Empty and non-empty insertion/replay implemented; exact successor digest remains mandatory |
| Pooled reserve conservation | Both V4 predicates plus deterministic builder | Exact reserve NFT/proposition/profile, value and `R6` liability deltas, invariant `value - liability` seed, value-neutral fee | Mint admission and later burn settlement | Fees, over-credit or an alternate reserve could create unbacked liability | Wrong NFT/tree/profile, +/- value or liability, coordinated seed drift, fee leakage, stale successor | First and second deposits pass; isolated JVM and TypeScript negatives reject |
| Fail-closed Ergo observation candidate | Same-process candidate over two snapshotted read-only ports plus pooled-reserve AVL membership replay | Exact transition bytes, claimed inclusion header, direct inclusion-to-tip header segment, independently observed canonical target at policy depth, stable current tip, spent source/predecessor, current singleton reserve descendant and original deposit membership | AF-4B-2 concrete observation and fresh rerun primitive | A later valid reserve deposit could invalidate earlier collateral, or a stale/disputed transition could be mistaken for mint evidence | Insufficient/broken ancestry, target fork disconnected from the current tip, unstable source, distinct-source disagreement, restored input, missing/mutated reserve, wrong membership proof | AF-4B-2 supplies the static concrete adapter, dual-RPC full-block observation, current-UTXO-rooted lineage reconstruction and fresh rerun; WP-01C authenticates the canonical header ID and complete signed-transaction commitment. Atomic mint execution, consensus authentication and lifecycle authority remain false/open |
| Stable mint identity without mint authority | Domain-separated Blake2b-256 derivation | Exact `E2S_PEG_IN_MINT_ID_V4` domain, V4 profile, source box ID and deposit commitment | AF-4C mint-admission join | Retries or profile/source/commitment substitution could derive multiple identities from one deposit | Clone dependencies; mutate profile/commitment/source; inject a version byte, finality-policy ID or unknown authority field | Deterministic same-process candidate only; mint eligibility, mint authorization and every funds boundary remain false |

The WP-06AF-4B-1 evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `local_complete` for deterministic first and later deposit construction, exact 32/32 AVL insertion/history replay and two-script JVM acceptance; the abstract two-source observation candidate remains deliberately non-authorizing |
| Focused verification | `local_pass`; TypeScript transition/finality suites cover first and descendant reserve states, the pinned JVM acceptance matrix passes 10/10, and the JVM/WASM differential remains required after every reviewed WASM provenance rotation |
| JVM identity | SigmaState `f78deadd..84fa`; acceptance spec SHA-256 `f878ac5a..16d2f8`; exact V4 compiler receipt remains `e20bb399..78db5` |
| Target runtime | `not_run`; no live or devnet node checked, signed, submitted, broadcast or confirmed either transition |
| Remaining boundary | AF-4B-2 adds the static concrete adapter, dual-RPC full-block observation, canonical target/tip evidence and a fresh non-authorizing rerun primitive. AF-4C invokes that primitive internally, and WP-01C authenticates the canonical header ID plus complete signed-transaction commitment without treating malformed RPC evidence as terminal. PoW/canonical-consensus authentication, WP-07 persistent post-mint reorg integration and non-broadcast target-node acceptance remain open. |
| Readiness claim | `local_only`; no confirmed reserve lineage, Ergo finality, mint eligibility, mint authority, funds authority, Gate 5 closure, trustless status or production readiness follows |

WP-06AF-4B-2 is implemented locally by
`relayer/src/validity-application-pooled-reserve-deposit-ergo-observation-v4.ts`
and the bounded read-only node clients. Its producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Required falsifier | Current status |
|---|---|---|---|---|---|---|
| Static read-only source profile | Source-owned registry and same-process source-pair constructor | Adapter ID, explicit non-mainnet environment, two distinct root origins, configured node identity digests and configured administration identity digests | Concrete deposit observer | A caller-provided factory, mutable capability or local status could fabricate the deciding view or gain a write path | Reuse an origin, node identity or administration identity; clone the pair; inject a factory or write capability | Implemented without checker, wallet, signer, submitter, broadcaster, persistence or runtime configuration dependencies; independent operation remains explicitly unproved |
| Dual-RPC transaction/block observation | Each bounded source parses the signed transaction, recomputes its ID and Sigma-byte digest, finds the exact bytes once in the claimed full-block response, and compares that response header with direct canonical ancestry | Transition ID, inputs and context extensions, data inputs, outputs, inclusion block ID/height/header/parent | Required-depth ancestry and AF-4B-1 exact-transition comparison | Indexed transaction metadata alone could claim inclusion in a block response that does not contain the transition or identifies another parent | Remove or duplicate the transaction; alter signed bytes, claimed block, height, header parent, input, extension or output | Implemented and fixture-backed; no cryptographic verification of the header's transaction-section commitment is claimed |
| Canonical Ergo observation view | One stable full-index snapshot per complete read plus direct parent traversal | Network, indexed/full heights, best tip, inclusion-to-tip header IDs/heights/parents and exact policy-depth target | Abstract dual-source finality candidate | A stale fork, short chain or changing index could be treated as final collateral commitment | Break ancestry, disconnect inclusion, reduce depth, move the snapshot, disagree across sources or exceed the bounded history | Implemented as matching full-node observation; configured two-source agreement is not canonical-consensus or independent-control proof |
| Reserve lineage and retained deposit | Current canonical reserve UTXO plus complete indexed singleton lineage, exact deposit-transaction replay and 32/32 AVL verifier | Genesis-issued reserve NFT; exact tree/profile/R4-R6; source intent; predecessor/source/fee roles; insert proof; reserve value/liability/free seed; current UTXO; queried commitment membership | AF-4B-2 observation candidate and later AF-4C mint-admission join | A parallel reserve, copied root, restored refundable source, fee leakage or lost deposit could appear to back minting | Replace NFT/tree/profile, disconnect lineage, alter source intent/proof/root/value/liability, restore source/predecessor, remove tip/history/membership or make fee funding non-neutral | Implemented for the deposit-only V4 lineage; historical transaction finality independent of the current canonical UTXO is not claimed, and an unsupported future burn edge rejects until AF-4C |
| Fresh pre-mint observation primitive | Complete concrete observation rerun with the exact same source-pair, compiled instance and transition object | Mint identity, transition/source/commitment, inclusion and target identity, nondecreasing canonical tip, current reserve lineage and membership | Future AF-4C mint-admission constructor | A caller-supplied old candidate could survive a reorg, restored refund path, reserve replacement or policy/source substitution | Pass an old or different-pair result into mint admission; restore either spent input; replace target/tip/reserve; lose membership or change transition identity | Implemented as non-authorizing evidence only; AF-4C must call the function internally and must reject caller-supplied revalidation objects |
| Authority cap | Branded observation and revalidation candidates | Read-only evidence booleans true; mint eligibility/authorization, independent node control, persistence, checker, signer, submission, broadcast, funds, Gate 5, trustless and readiness fields false | AF-4C and WP-07 | Evidence collection could silently become mint or funds authority | Clone either candidate, add unknown authority, set any funds boundary or build from a journal row | Enforced; no live node, target check, signature, submission or broadcast occurred |

The WP-06AF-4B-2 evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `local_complete` for the static credential-free adapter, dual-RPC full-block observation, returned-header/canonical-ancestry binding, stable required-depth target, current-UTXO-rooted deposit-only reserve reconstruction, retained AVL membership and fresh non-authorizing rerun primitive |
| Focused verification | `local_pass`; 46 tests across the concrete observer, abstract finality, deposit transition and both bounded node clients pass, TypeScript compilation passes, and the stable milestone closes under Node 24 with `npm run check` (WASM build, TypeScript build and 307 Vitest files / 9,121 passing tests) plus the unchanged standalone WASM closure (26 passing tests) |
| Independent review | `complete`; the first review identified a replayable revalidation claim, unverified block transaction commitment and overbroad historical-lineage wording. At AF-4B-2 closeout, a fresh independent rereview reported zero P1/P2 findings: the rerun was explicitly non-authorizing and reserved for internal AF-4C invocation, the returned block header was compared with canonical ancestry, and both additional verification items were outside that slice. WP-01C later closed the transaction-commitment item locally through canonical header-ID and complete signed-transaction-root verification; independent historical finality remains open |
| CI | `not_run`; the passing milestone closure is local and no external CI result is claimed |
| Target runtime | `not_run`; the concrete adapter is covered by real HTTP clients against bounded local fixture servers only, with no live/devnet node, check, signing, submission or broadcast |
| Remaining boundary | AF-4C now implements the protected burn settlement and invokes fresh observation internally in a non-broadcast mint-admission join; WP-01C authenticates the canonical header ID and complete signed-transaction commitment. WP-07 must still integrate persistent post-observation and post-mint reorg handling, and the source profile must authenticate PoW/canonical consensus before any finality or funds-authority claim |
| Readiness claim | `local_only`; configured source identities do not prove independent control, and no mint eligibility, mint authorization, funds authority, Gate 5 closure, trustless status or production readiness follows |

WP-06AF-4C-1 is implemented locally by
`relayer/src/validity-application-pooled-reserve-burn-settlement-v4.ts`.
Its producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Verification | Authority / status |
|---|---|---|---|---|---|---|
| Versioned tracker authentication | Exact V4 key/value codecs plus application-history reconstruction | Domain-separated key; 370-byte value; application/profile/program/verifier identities; sidechain/checkpoint/root/count/anchor fields; tracker digest and lookup proof | Reserve and DUP ContextExtension variables | A V1 value, another application, unauthenticated root or stale anchor could be presented as the accepted burn commitment | Golden key/value vector, every discriminator/profile mutation, wrong root, malformed proof, shallow anchor and future anchor reject | Local packet input only; tracker admission, sidechain finality and proof-system activation remain false |
| Exact burn payout | Canonical 205-byte V1 leaf and V2 settlement bundle | Burn ID, source transaction/event index, block, recipient ErgoTree hash, raw nanoERG amount, zero native-ERG asset, sidechain, root, leaf count and path | V4 reserve predicate and payout output | A valid commitment could pay a different recipient, amount or asset | Inclusion succeeds for the canonical leaf; sidechain/block/recipient/amount/asset, path/root and post-inclusion payout substitution reject independently | Local construction only; no protected-script or on-chain acceptance claim |
| Reserve conservation | Exact V4 reserve predecessor and deterministic successor | Singleton NFT, proposition, V4 profile, 32/32 deposit-state digest, value, liability, immutable free seed, payout amount and externally funded fee | V4 pooled-reserve predicate | Fees, overpayment, liability drift or a parallel reserve could release unbacked ERG | Profile/tree/liability/value/fee/successor-height and minimum-box-value faults reject | AF-4C-1 establishes local construction; AF-4C-2 below establishes pinned-JVM predicate acceptance |
| Burn replay insertion | Exact V4 DUP predecessor plus absent-to-present WASM AVL transition | Singleton NFT, proposition, V4 profile, predecessor digest, burn ID, lookup proof, insert proof and exact successor digest | V4 DUP predicate in the same transaction | One burn could be paid twice or recorded under a parallel replay lineage | Existing key, divergent history digest, malformed proof and successor drift reject | AF-4C-1 establishes local construction; AF-4C-2 below establishes pinned-JVM predicate acceptance |
| Deterministic capability boundary | Exact-key input parser, pre-await snapshot, process-owned packet registry and recursive freeze | Inputs `[reserve, DUP, external fee]`; data input `[tracker]`; outputs `[reserve successor, DUP successor, payout, fee]`; exact extensions `0..3`; all authority fields | AF-4C-2 JVM matrix only | Mutable input, unknown authority data or a forged packet could be mistaken for an accepted settlement | Async mutation, unknown field and forged-packet negatives reject; exact packet is stable and deep-frozen | Checker, signer, submitter, broadcaster, funds authority, Gate 5, trustless status and readiness remain false |

The WP-06AF-4C-1 evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `local_complete` for the exact V4 tracker codec/history, deterministic unsigned reserve-plus-DUP burn packet, native-ERG payout binding, reserve conservation, replay insertion, external fee funding and non-authorizing boundary |
| Focused verification | `local_pass`; 79 tests across six affected proof/profile/settlement suites pass, including 18 direct AF-4C-1 tests; TypeScript compilation passes; the standalone WASM AVL closure remains green with 26 tests |
| Independent review | `complete`; the first review found two P2 boundary/test defects and a P3 coverage gap. The optional fee and native-ERG asset fields, post-inclusion recipient substitution, discriminator/profile negatives and async snapshot coverage were corrected. Independent rereview found no remaining P1/P2 issue; isolated box-singleton and AVL-policy negatives remain bounded AF-4C-2 matrix work. |
| CI | `not_run`; the passing closure is local and no external CI result is claimed |
| Target runtime | At the AF-4C-1 boundary neither protected script had been evaluated. AF-4C-2 below now establishes pinned-JVM predicate acceptance only; no node checked, signed, submitted, broadcast or confirmed this packet. |
| Remaining boundary | AF-4C-2, AF-4C-3 and WP-07B-T1 through T4 now close local predicate acceptance, fresh non-broadcast mint admission, reconstructible reservation lifecycle and source-locked atomic V4 mint consumption. Reviewed profile-to-compiled-instance activation, the relayer admission handoff, tracker/finality authority, target-node acceptance and legacy-route cutover remain open. |
| Readiness claim | `local_only`; the packet is not evidence of on-chain acceptance, sidechain finality, funds authority, Gate 5 closure, trustless status or production readiness |

WP-06AF-4C-2 is implemented locally by the deterministic acceptance-fixture
builder, guarded launcher and pinned SigmaState JVM specification. Its
producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Verification | Authority / status |
|---|---|---|---|---|---|---|
| Exact AF-4C-1 transaction identity | AF-4C-1 builder, pinned WASM EIP-12 round-trip and proofless serializer | Three input boxes, one tracker data input, four outputs, both protected extensions `0..3`, proofless bytes and transaction ID `4507b1cd..4b7d` | SigmaState parser and both protected-input contexts | A compatibility box, reordered role, serializer drift or a different transaction could be evaluated instead of the reviewed packet | Fixture SHA-256 `90388601..1f06`, exact box/input matching, byte round-trip and ID recomputation | Deterministic local fixture only |
| Two-predicate acceptance | Pooled-reserve and DUP compiled ErgoTrees evaluated independently in the same transaction context | Exact propositions, singleton NFTs, V4 profile, tracker data input, reserve/DUP predecessors and successors, payout and fee | Complete reserve-plus-DUP transaction conjunction | A strong inner check could hide that another spending predicate remains permissive or rejects the exact fixture transaction | Exact fixture transaction returns `Right(true)` for protected inputs `0` and `1` | Pinned-JVM predicate acceptance; no node or activation claim |
| Burn, finality-age and replay delegation | DUP predicate consumes its tracker-included burn leaf, settlement bundle and absent-to-present AVL transition; reserve authenticates the exact DUP role but separately parses an unbound duplicate leaf | DUP-side bridge-event root, leaf count/path, anchor height, burn ID, lookup/insert proofs and successor digest; independent reserve-side leaf copy | DUP input, then the full input conjunction | Root/path/replay or shallow-anchor drift could release value if the reserve input were treated as the sole authority; a second valid-looking reserve copy makes attribution ambiguous | Root, path, count, shallow/future anchor, existing burn, lookup/insert proof and successor mutations reject input `1`; the split-attribution vector proves both predicates can still accept different leaves | Local JVM semantics only; tracker admission, source canonicality and sidechain finality remain false |
| Payout and reserve conservation | Reserve predicate plus its independent burn-leaf copy and exact payout output; DUP independently binds the tracker-included leaf to that payout and reserve transition | Recipient proposition hash, raw native-ERG amount, reserve NFT/profile/tree, predecessor/successor value and liability, external fee source/output | Reserve input and complete transaction | Recipient substitution, overpayment, liability drift, fee leakage or a parallel reserve could release unbacked ERG | Recipient, amount, reserve NFT/proposition/profile/value/liability, tokenized fee, fee value and fee proposition faults reject | Local JVM semantics only; funds authority remains false |
| Runtime and provenance closure | Guarded PowerShell launcher and Scala fixture preflight | SigmaState `f78deadd..84fa`, spec SHA-256 `c21b2a93..3bb2`, fixture-builder SHA-256 `244fe258..aaa3`, fixture SHA-256 `90388601..1f06`, compiler lock/receipt, Microsoft JDK 17 image, sbt `1.12.11`, Node `22..24`, LF-only sources and clean disposable worktree | Focused JVM suite | Mutable tool/runtime/source inputs, user-global sbt code or generated-fixture drift could be reported as the reviewed acceptance | Every pinned identity is checked before execution; generated fixture must match the reviewed hash; user home, sbt global/boot, Ivy and Coursier state are isolated under the disposable run root; the temporary worktree and caches are removed | Guarded local acceptance; freshly resolved transitive JARs remain repository/TLS-dependent rather than individually content-attested |
| Authority cap | Fixture schema and Scala boundary assertions | Target-node acceptance/check, signing, submission, broadcast, funds authority, Gate 5, trustless status and production readiness all false | AF-4C-3 and later activation/evidence work | A local VM result could be promoted into an on-chain or readiness claim | Canonical positive asserts every authority field remains false | No node wallet, signature, submission, broadcast or live funds |

The frozen V4/V5-compatible burn shape has one additional composition limit.
The reserve and DUP predicates read separate copies of Vars `0..3`, and no
on-chain equality relation joins those copies. A focused JVM falsifier changes
the reserve-side source transaction and recomputes its burn ID while retaining
the tracker-included DUP-side burn with the same amount and recipient; both
predicates accept. DUP remains the deciding inclusion and replay authority, so
the vector does not demonstrate a second payout, but burn attribution is not
single-valued. V5 cutover eligibility therefore carries blocker
`v5-protected-input-burn-attribution-is-not-single-valued`. The correction must
use a new settlement-profile version in which the reserve burn extension is
empty and the exact DUP predicate alone consumes the proof object; V4 and V5
bytes, domains, vectors and identities remain compatibility evidence.

The WP-06AF-4C-2 evidence vector is:

| Dimension | Status |
|---|---|
| Implementation | `local_complete` for deterministic exact-fixture generation and evaluation of the same AF-4C-1 transaction against both V4 protected predicates |
| Focused verification | `local_pass`; 72 tests across seven affected proof/profile/settlement/fixture suites pass, TypeScript compilation passes, and the guarded fresh-cache pinned-JVM suite passes 11 tests. Ten retain the positive/negative predicate matrix; the eleventh characterizes the split burn-attribution compatibility limit. The exact fixture/spec hashes and transaction ID match the reviewed constants. The unchanged AF-4C-1 standalone WASM closure remains reusable because its sources, artifact and deciding consumer inputs did not change. |
| Independent review | `complete` for the original AF-4C-2 matrix; the first independent pass found two P2 evidence defects: delegated mutations did not require the other predicate to remain accepted, and ambient user-global sbt code was not excluded. The corrected matrix asserts the exact two-predicate result vector, and the launcher isolates user home plus sbt global/boot, Ivy and Coursier state. A later focused composition review found and reproduced the split burn-attribution limit described above. It blocks V5 cutover and requires a new settlement-profile version; it does not invalidate the frozen compatibility result or establish a direct replay/funds bypass. |
| CI | `not_run`; the passing acceptance is local and no external CI result is claimed |
| Target runtime | `jvm_only`; SigmaState accepts the exact proofless transaction predicates, but no configured node performed `/transactions/check` and no target activation is established |
| Remaining boundary | AF-4C-3 and WP-07B-T1 through T4 now join fresh AF-4B-2 evidence to a non-broadcast reservation, reconstructible recovery lifecycle and source-locked atomic V4 mint consumption. Before activation work, a new settlement-profile version must remove the reserve-side burn proof copy and establish single-valued DUP-owned burn attribution. Reviewed profile-to-compiled-instance activation, the relayer admission handoff, tracker/finality authority, target-node acceptance and legacy-route cutover remain open. |
| Readiness claim | `local_only`; local predicate acceptance does not establish sidechain finality, on-chain activation, mint or funds authority, Gate 5 closure, trustless status or production readiness |

Reproduce the focused AF-4C-2 JVM matrix without a node wallet, signing or
broadcast:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-validity-application-pooled-reserve-burn-settlement-acceptance.ps1 `
  -SigmaStateCheckout <clean-pinned-sigmastate-checkout> `
  -BridgeRoot <bridge-root> `
  -JavaHome <pinned-microsoft-jdk-17> `
  -SbtLaunchJar <pinned-sbt-launch.jar> `
  -NodeExecutable <node-22-to-24>
```

#### V6 single-authority contract family

The first V6 correction batch is locally complete at the contract/compiler
identity boundary. It preserves the exact V4 source-runtime profile and V5
proof statement, program, verifier and tracker-value semantics while deriving
new target settlement lineage `b689cdd0...8a18e1`. The pinned compiler emits:

| Role | Contract ID | Bytes | Burn authority |
|---|---|---:|---|
| Tracker | `c9c8315f...93d7bb` | 2,984 | Verifies the retained V5 proof/application statement |
| DUP | `5062c938...2e50c2` | 3,099 | Sole consumer of tracker inclusion, burn leaf, payout binding and replay insertion |
| Source lock | `d151c4dd...30afa1` | 1,317 | Retains the disjoint deposit commit/refund policy |
| Reserve | `6aa92a05...2e1bfc` | 1,962 | Authenticates the exact DUP and enforces reserve/liability conservation; consumes no burn proof variables |

The reserve-to-DUP dependency is one-way. The DUP authenticates the unique
reserve NFT and V6 profile rather than embedding the reserve contract ID,
avoiding a cyclic proposition-hash dependency. Security remains the
conjunction of the exact reserve and DUP predicates. Producer code must emit an
empty reserve ContextExtension on the burn branch; this is an exact transaction
shape requirement because ErgoScript cannot enumerate unused extension keys.

The deterministic producer freezes one 6,600-byte proofless V6 transaction,
ID `e9511548...00a83`. It uses an empty reserve extension, Vars `0..3` only on
DUP, and an empty fee extension. The guarded pinned-JVM suite evaluates the
reserve and DUP predicates over those exact bytes and passes 10/10. Isolated
predicate negatives cover DUP contract/profile/NFT, payout,
reserve/liability, replay, tracker/root, fee, anchor and transaction topology
drift. Separate shape negatives distinguish duplication, which is
predicate-inert and rejected only by canonical producer shape, from relocation,
which leaves reserve acceptance unchanged but fails the DUP predicate because
Vars `0..3` are absent and also fails canonical producer shape. The
acceptance-spec and exact-fixture SHA-256 values are pinned by the guarded
runner.

This replaces blocker
`v5-protected-input-burn-attribution-is-not-single-valued` with a V6-local
single-authority closure. V5 remains frozen and ineligible. No activation,
source finality, target-node acceptance, established lineage or funds authority
follows from local JVM reduction.

The V6 cutover integration now includes a separately versioned, process-local
replay-cutover packet. It consumes the exact historical V4 replay-genesis packet,
recomputes and preserves its canonical burn set and AVL digest, and constructs
only the unsigned V6 DUP singleton issuance. The source V4 lineage, V6 target
lineage, exact DUP contract and singleton are bound under a new V6 domain; all
inventory, retirement, lineage, activation, node, signing, submission,
broadcast, funds, Gate 5, trustless and readiness boundaries remain false. The
next local batch versions the non-authorizing provisioning and cutover-
eligibility join to consume this exact packet; real cutover observation and
every external authority remain separate blockers.

**Definition of Done:** positive anchor/finality acceptance and negative tests
for fabricated root absent from `0x0401`, wrong extension key, stale anchor,
wrong chain, unfinalized block, conflicting checkpoint, and reorg. An anchored,
legacy-R9-SigmaProp-authorized invented checkpoint must be rejected by an activated
Ergo-verifiable consumer of the bound finality statement/proof semantics before
the committee can be classified as liveness-only. That consumer may verify the
relevant GRANDPA evidence directly or verify a separately activated
validity/STARK proof whose public inputs bind the same checkpoint, statement,
trust/profile identities, and required proof commitments.

**Integration Definition of Done:** a deterministic local-devnet or
fixture-backed lifecycle demonstrates burn -> runtime root -> `0x0401` anchor ->
proof-driven tracker -> full Ergo transaction check, with duplicate, stale,
reorg, wrong-field, restart, and committee-signed invented-root negatives. This
is still not a mainnet or production-ready claim. WP-06T4 satisfies the
fixture-backed restart, recollection, and currently enforceable adversarial
portion. WP-06T5 additionally reconstructs the tracker cache from chain-visible
singleton history and invalidates stale candidates, but neither milestone
satisfies stateful node transaction acceptance or the invented-checkpoint
rejection that requires an activated Ergo-verifiable finality consumer.

### P0 Settlement Conservation Correction

The current authenticated compatibility payout burns the net sidechain amount
`A` while removing `A + M` from Ergo backing, where `M` is the Ergo miner fee.
Starting from sidechain supply `S` and Ergo backing `C`, the current transition
therefore produces `S' = S - A` and `C' = C - A - M`; even when `C = S`, the
post-settlement deficit is exactly `M`.

The separately versioned authenticated external-fee settlement family now
implements this local invariant:

```text
S' = S - A
C' = C - A
feeInput = feeOutput = M
C' - S' = C - S
```

The exact fee box identity, value, proposition, token-free shape, and successor
fee output are bound through distinct contract identities, deterministic
transaction construction, immutable candidate identity, and the pinned JVM
matrix. A residual reserve below minimum box value rejects rather than being
absorbed into the fee. Commits `e3de07c3`, `a1323021`, `27347a1b`, and
`dc71da1f` preserve the existing V1 burn leaf, tracker statement, Solidity
ABI/bytecode, proof-system ID, ErgoTrees, and candidate bytes.

This closes the local construction and predicate-acceptance portion of
cross-ledger payout conservation only. Execution reservation, restart recovery,
immediate pre-transport revalidation, target-node acceptance, and activation
remain part of the later authority/cutover package. The old fee-from-backing
route remains unsafe for activation and cannot be accepted as the new profile.
All new legacy V1 submissions now reject at the daemon startup gate, at CLI
dispatch before state or execution-authority acquisition, and again at the
shared programmatic execution facade before preflight or signer access.
Non-broadcast preparation/checking and confirmation/reconciliation of already
submitted historical transactions remain available; neither surface grants new
funds authority.

The V4 candidate closes the unrestricted-owner-mint defect inside its
source-locked, compile-time-disabled runtime profile. The profile binds the
exact bridge and token addresses plus each deployed runtime-code SHA-256 and
byte length. The pre-EVM hook snapshots every active direct-parent reservation
together with its exact profile, pending bytes, legacy and V4 replay state,
bridge configuration and owner, token owner, total supply, recipient balance,
native parent hash and height. The post-EVM callback accepts only one matching
successful `PegIn` with one exact preceding token mint effect, canonical
Solidity replay, exact supply and recipient-balance deltas, unchanged
application/profile state, and an unexpired reservation. Only after every
fallible check passes does it remove the pending key and write the terminal
consumed record. An unmatched owner mint, extra token mint, duplicate or legacy
identity, partial state change, changed profile/code/configuration/owner, replay
or invalidation rejects the complete candidate block.

The normal runtime now adds a separate address-scoped quarantine. Its
compile-time legacy policy is false in native tests and WASM alike; explicit
test-only storage marks the compatibility fixtures. At block start, the runtime
snapshots the exact inherited bridge address and joins it with parent/current
V1 profile addresses. A shared Ethereum transaction filter rejects direct
top-level `mintSERG(address,uint256,bytes32)` calls to that set during pool,
in-block, and PreLog processing before EVM execution. Legacy, EIP-2930, and
EIP-1559 envelopes share the same rule. Direct-parent snapshots prevent
same-block retarget or profile activation from exempting an inherited address.
The filter reserves eight storage reads plus a reproducible 4,908-byte
MaxEncodedLen proof estimate in declared and actual dispatch weight. Native
`pallet_evm` call/create/create2 extrinsics are disabled. Public disable or
retarget calls remain blocked, and absent inherited state cannot bootstrap a
legacy profile.

Real block-builder and `FrontierBlockImport` regressions prove that direct
rejection leaves an otherwise valid prefix finalizable and importable without
state residue. A forwarding contract separately proves that an internal owner
mint reaches EVM execution but is rejected atomically by the post-block
callback; a mixed-header control distinguishes that callback witness from a
generic import failure. Another EVM contract using the exact selector and
emitting the exact `PegIn` topic from an unrelated address imports successfully.
The policy is therefore address- and application-bound rather than a global
selector or event-ABI reservation.

This is not an activated authority switch. The checked V4 profile is not yet
joined to one reviewed compiled V4 instance in an activation packet; no
deployment-lineage retirement, relayer admission handoff, compatible target
runtime, signing, submission, broadcast, or funds authority exists. Root/Sudo
can still mutate raw storage or replace the runtime, and no evidence proves
that one inherited address covers every historical minter. Internal/proxy calls
and direct calls to the exact address governed by an active stronger profile
remain callback-only and can still waste an authoring attempt; finalization
deterministically rejects unauthorized effects and imports no mint state.
Historical runtimes and the Solidity owner entrypoint are not changed by the
new source default. The source lock remains unactivated; any upgrade of a
running chain must pair the reviewed migration with a `spec_version` increment.
Gate 5 remains open.

The separately versioned V4 source-lock family now closes the local P2 timeout
overlap and P3 residual-output shape without changing any historical
ErgoTree. Its exact compiled predicate accepts reserve commitment only before
the timeout and depositor refund only at or after it. The canonical offline
refund builder returns the full source value, uses a distinct pure-ERG input
for the complete miner fee, and emits no residual output. Pinned JVM reduction
accepts both legal boundary branches and rejects isolated identity, value,
token, fee, ordering, cardinality, and data-input mutations.

This is local candidate construction and predicate acceptance, not activation.
The historical MCL remains unchanged and ineligible for a new deployment. The
next package is one reviewed cutover that binds the compiled V4 application
instance, imports or freezes the legacy DUP lineage, and makes every old mint,
vault, tracker, DUP, committee, and R9 value-release route ineligible before
the new route can acquire funds authority.

## WP-07 — Reconstructible Lifecycle And Adversarial Recovery

**Security invariant:** SQLite and local AVL history are recoverable caches, not
settlement authority.

**Deliverable:** chain-derived reconstruction plus system-level attacks and
recovery tests for both bridge directions, including deposit/refund races, mint
reorg, burn reorg, anchor reorg, proof corruption, duplicate settlement, process
crash boundaries, signer unavailability, RPC disagreement, and database loss.

Reconstruction, restart, complete database loss, divergent RPC responses,
out-of-order events, and both-chain reorgs must be exercised against the current
authoritative observation, proof, persistence, checker, signer, submitter, and
confirmation seams. WP-07 records their producer-to-consumer inputs, outputs,
and fail-closed behavior as the extraction baseline; it does not depend on the
future public package ports that WP-08A has not yet implemented. The local
journal remains a replaceable cache and cannot authorize mint, tracker
admission, payout, replay state, signing, or broadcast.

WP-06T5 supplies the first executable baseline for this package: authenticated
tracker history can be rebuilt into an empty database and replaced after a
rollback without using SQLite as authority. After WP-06T11, bounded WP-07A
reconstruction work may proceed in parallel because it neither replaces the
Gate 5 proof path nor grants execution authority. WP-07 authority integration
and package completion remain gated on WP-06. The remaining matrix must still
bind the sidechain mint leg of the peg-in direction, run a concrete dual-node
runtime exercise, and integrate final authority after the Gate 5 consumer
exists.

**WP-07 local funds-release containment checkpoint:** commit `992be302`
persists exact digest-bound peg-in verification receipts, detects pre- and
post-mint continuity loss, and makes database-loss reconstruction
non-authorizing. Commit `92915d27` adds one process-owned execution epoch,
exclusive lease, immutable database identity, external continuity witness, and
exact state digest. Every active daemon mint, payout, settlement, DUP, sweep,
and settlement-CLI route must retain and revalidate that authority at its last
synchronous transport boundary. Any durable incident, stale database restore,
copied database without its witness, database loss, witness drift, partial
incident persistence, or dangling hold-path entry keeps local value release
held across restart.

This checkpoint is intentionally non-authorizing and has no public
hold-clearing or recovery API. It does not pause contracts, revoke a signed or
already transported transaction, remove the EVM owner-mint entrypoint, or
disable committee/R9 value-release paths outside the guarded process. Loss of
all local durable media and platform-dependent directory-entry durability
remain explicit residuals. A reviewed recovery runbook and authority design are
required before any recovery command may be introduced.

**WP-07 cross-ledger terminal-liability checkpoint:** the backing alarm retains
every current `detected` and `confirmed` burn as an additional liability. A
local `phase2_unlocked` row may be excluded only after two bounded Ergo sources
reconstruct the exact authenticated-V2 DUP transition and historical payout,
bind the legacy transaction-hash key to exactly one sidechain event, match the
persisted settlement transaction, payout amount and canonical P2PK recipient,
independently agree that the same inclusion block has reached the versioned
ten-confirmation settlement policy, and join that payout to the exact burn that
is still present in the current genesis-to-pin sidechain inventory. That
inventory, its stable pin and the same-pin supply are one process-branded
snapshot, and each burn ID is recomputed from chain, transaction and event
index before absence can be inferred. A reverted
burn is excluded only when that same process-branded inventory proves absence
at a pin covering its original height. Exact semantic re-inclusion remains
counted at its current block coordinates while the terminal SQLite row remains
unchanged. Changed amount, recipient, chain, transaction or event identity
rejects. Missing capabilities, inventory provenance, scan completeness, source
agreement, finality or exact bindings opens the durable local funds-release
hold before later value-release work. SQLite status remains non-authoritative,
and configured-node agreement does not authenticate source consensus or
establish a solvency, trustless or readiness claim.

The canonical vault side of that alarm now consumes a separate process-branded
dual-reader snapshot rather than the daemon's primary Ergo client. Each reader
must reproduce the complete paginated address inventory twice under count and
cumulative canonical-byte bounds, remain on the exact admitted tip before,
between and after those reads, and agree on the same canonical box set. Snapshot
provenance and the active quorum lease are checked after collection and again
immediately before the backing decision. This closes primary-only false-clear,
single-page undercount, mixed repeated-read and stale-decision paths; two
configured readers can still collude or share an upstream, so this is
operational fail-closed evidence rather than authenticated Ergo consensus or a
solvency certificate.

This WP-07 checkpoint closes the in-flight liability rule. A
`phase1_created` row is retained only after the complete pinned inventory
rebinds its exact current burn. `aggregate_submitted` and `batch_submitted`
also require one matching durable submitted journal whose expected and returned
transaction IDs equal the row identity. Journal modes and cardinality must
match, active journals cannot overlap, and every batch member must map to one
unambiguous persisted event and one exact current inventory entry. The
reconstructor converts these rows only into pending alarm liabilities; it does
not restore any settlement capability or treat the journal as funds authority.
Every recoverable pending or submitted journal is reconciled across all of its
members before any terminal or reverted row can be excluded, so a local status
transition cannot hide unresolved transport.
Absence, semantic drift, stale pins, partial batches, duplicate journals and
overlap leave the backing alarm unavailable and open the shared hold at the
daemon boundary.

The same checkpoint closes the only safe rule for historical `failed` rows.
The source inventory found no active runtime writer and no persisted failure
class, reason, lifecycle version or deciding transport evidence. Existing rows
therefore map only to `legacy_failed_unclassified_v1`. An exact current burn is
retained as a pending liability; absence or semantic replacement remains
unavailable until external settlement reconstruction distinguishes definite
no-transport from ambiguous, submitted or confirmed payout. The generic state
API cannot create another unclassified failure or transition out of one, and
the operator retry command cannot reclassify failed peg-outs. Active aggregate
journals are reconciled before this rule. Active authenticated candidates are
joined by exact candidate, burn and expected-transaction identity, while the
recoverable transport reader rejects orphaned authority. A local failure
status therefore cannot hide either settlement path.

**WP-07B V4 mint-admission lifecycle boundary:** the inventory is complete.
The pinned runtime already has atomic causal admission and consumption, but its
`PendingCausalPegInsV2`, `ProcessedPegIns` and `ConsumedCausalPegInsV3` state is
keyed by the legacy V1 identity and validates the federated compatibility
profile. AF-4C-3 instead binds the V4 pooled-reserve lineage, deposit
commitment and `E2S_PEG_IN_MINT_ID_V4` identity. These identities and profiles
are not aliases and must never share storage or silently reinterpret existing
bytes.

WP-07B-T1 freezes a separate 603-byte big-endian reservation statement. It
contains the exact V2 source intent and ID, V4 lineage and mint identity,
source-lock box, reserve-transition transaction, deposit commitment,
successor-reserve box, complete 33-byte AVL digest and liability, Ergo deposit
finality policy, inclusion header/height, target header/height and required
successor depth. The reservation key is the V4 mint identity; a separately
domain-separated digest identifies the complete statement. Only the
same-process AF-4C-3 candidate projects into this request. The request has no
proof field, no persistence or transport capability and no authority.

WP-07B-T2 reproduces those exact bytes and identity in a new Frontier runtime
profile with V4-only pending, consumed and invalidated namespaces. V4 and the
legacy causal path are sticky, mutually exclusive runtime modes: either
activation order rejects, and V4 blocks later legacy admission, bridge-profile
mutation and `PegIn` collection before writes. The proof result echoes and the
pallet rechecks the exact runtime-profile ID, statement ID and canonical-bytes
digest, proof-system/profile IDs, issuance and admission-time expiry; issuance
before profile activation rejects. The sole bounded pending-key index must be
strictly ordered, unique and exactly equal to the complete pending map. Every
profile, statement, static proof, admission-time expiry, replay, index and
capacity check completes before the first write. T3B selects terminal
invalidation rather than retryable retirement for an accepted reservation
after expiry. The reference runtime's public activation remains compile-time
disabled. Its only accepting proof fixture is
`cfg(test)`-only and uses explicitly rejected runtime proof identities. One
successful call writes the pending map and ordered index without EVM execution;
existing V1/V2/V3 state remains unchanged. The exact regenerated patch and
source lock pass the runtime and cross-language vectors. This is local
implementation evidence, not an activated source-proof profile, accepted
finality proof or mint authority.

The WP-07B-T2 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Cross-stack statement identity | TypeScript V4 codec plus pinned Rust parser | Exact 603 bytes, statement ID, V4 mint ID and every source/reserve/finality field | Runtime reservation and T3 authenticated collector | Either stack could reserve a different deposit, reserve successor or finality target under an apparently matching request | The checked-in TypeScript vector reproduces byte-for-byte and by ID in Rust | Every field substitution changes identity or rejects; source/successor and inclusion/target aliases reject in both stacks | Deterministic format evidence |
| Sticky mode exclusivity | V4 and causal activation paths, legacy admission guard, bridge-profile guard and post-EVM hook | V4 enforcement/profile, causal enforcement/profile/pending state and all active legacy `PegIn` addresses | Every later legacy or V4 peg-in transition | A V4 reservation could coexist with a legacy mint route and defeat replay exclusion | V4 activates under the test-only profile and accepts one reservation with legacy state unchanged | Legacy then V4, V4 then causal activation/admission/profile mutation, and a post-V4 legacy event all reject before writes | Local runtime transition only |
| Exact proof request/result binding | Static verifier plus independent pallet rechecks | Runtime-profile ID, statement ID, canonical statement digest, proof-system/profile IDs, issued/expiry heights, request/result/proof digests | Pending V4 record and future T3 provenance | A proof for another profile, statement or pre-activation window could reserve the same key | Exact fixture proof reserves once and persists all returned bindings | Statement/profile/proof mutation, proof issuance before activation, admission-time expiry and oversized window reject | Fixture verifier is explicitly unavailable to production |
| Sole pending index and replay state | Strict ordered-index validator plus disjoint pending/consumed/invalidated maps and legacy replay checks | Complete map/index equality, unique ordered V4 keys, keyed pending values, V4 and legacy identities | T3 state-key derivation, reconstruction and later consumption | Hidden, orphaned, duplicate or unordered state could be omitted from authenticated collection or admitted twice | One exact V4 key and value are written together | Unsorted, duplicate, index-without-map, target or unrelated map-without-index state; V4 terminal state and legacy replay all reject | Bounded local storage invariant |
| Atomic reserve without mint | Reservation call completes all fallible checks before its two storage writes | Exact pending record and ordered index; no EVM call or consumed state | Future authenticated collection only | Partial state or EVM execution could turn a proof check into mint authority | Canonical call stores one pending record and index entry | Every proof, profile, replay, index and capacity failure preserves V4 and V1/V2/V3 state | No mint, signer, submission, broadcast or funds authority |

WP-07B-T2 evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for the exact source-locked local Frontier transition |
| Independent review | `complete` for patch `b9a68a10...b3bb9`; a read-only counterexample review closed mode/replay exclusion, proof rebinding, complete map/index equality, atomicity and public fail-closed activation, while retaining post-reservation expiry and authenticated collection as T3 work |
| CI | `not_run`; focused local Rust and TypeScript closure is separate evidence |
| Target runtime | `not_run`; exact local runtime tests are not a deployed network observation |
| Readiness | `local_only` |

WP-07B-T3 owns authenticated V4 reservation-state collection and the recovery
matrix. A successful local journal write, adapter flag or SQLite row is never
the deciding result. Restart and complete database loss may reconstruct cache
and holds only from fresh authenticated state.

WP-07B-T3A implements the static read-only collector. It accepts only a fresh
same-process AF-4C-3 request and the exact contained-verifier execution
authority for
`verify-pooled-reserve-mint-reservation-state-v4`; both are established before
the first RPC call. V4 has a separate signed exact execution-policy capability:
the policy pins that operation, its CLI literal and its request/result schemas,
and the immutable authority declaration exposes the same operation. The V1
peg-in-state wrapper and V4 reservation-state wrapper reject an authority for
the other operation before wrapper provenance is issued or contained execution
can begin. Historical V1 policy fields, domains, canonicalization, schemas and
CLI semantics remain unchanged. Its finality component is now a generic direct GRANDPA
envelope over an explicit trust anchor, authority transitions, ancestry and the
target header. It does not read or depend on bridge-event, burn-root or burn
commitment storage.

The collector derives seven deterministic keys and requests them in one
`state_getReadProof`: `:code`, the active V4 profile, sticky enforcement, the
complete pending-key index, and the target pending, consumed and invalidated
entries. The source-locked Rust verifier authenticates all seven reads under
the final target state root. It reproduces the exact 603-byte statement,
statement ID and V4 mint identity; binds the target native header and height,
runtime code SHA-256 and byte length, active profile and profile ID; validates
the complete ordered pending index; and classifies `absent`, `pending`,
`consumed` and `invalidated` as mutually exclusive target states. The raw
runtime code may make a valid proof materially larger than an ordinary storage
proof, so both implementations permit at most 512 nodes, 8 MiB aggregate proof
bytes, 4 MiB per node and 4 MiB of authenticated runtime code. Duplicate nodes,
oversized requests and mismatched proof accounting reject.

The final result is frozen and process-provenance-bound. It records accepted
native finality and authenticated reservation state, but it explicitly denies
independent runtime-build provenance, source-collateral canonicality, mint
authorization, runtime mutation, signing, submission, broadcast, Gate 5,
trustless status and production readiness. `absent` is an authenticated
classification only; it never authorizes a reservation, mint or destructive
local transition. T3A does not consult or write the journal, cache or SQLite.

The WP-07B-T3A producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Finality is direct and storage-agnostic | Generic finality collector plus native GRANDPA verifier | Trust anchor, linked authority transitions, canonical SCALE ancestry, target header/hash/height and final state root | V4 seven-key state verifier | Reservation state could be accepted under a non-final root, or collection could inherit unrelated burn-commitment semantics | Canonical target verifies without a bridge-event commitment | Wrong trust root, target, transition, ancestry or finality proof rejects | Native finality evidence only |
| Exactly one complete seven-key proof | Deterministic key derivation plus one `state_getReadProof` | `:code`, active profile, enforcement, complete pending index, target pending, consumed and invalidated keys | Native state verifier and lifecycle classifier | A caller could omit runtime/profile/index state or splice lifecycle values from different roots | One proof authenticates all seven reads under the target root | Wrong key, wrong root, duplicate node, missing required value and proof mutation reject | Read-only state evidence |
| Cross-stack V4 identity remains exact | TypeScript request normalizer plus source-locked Rust parser | 603 statement bytes, statement ID, V4 mint identity, runtime profile, source/sidechain/contracts, settlement and source-proof identities | Authenticated V4 state result | A proof for another deposit, chain, runtime profile or reservation could be relabelled | Exact T1/T2 fixture identity verifies | Statement, mint, profile, runtime hash/size and storage-key substitutions reject | Deterministic identity evidence |
| Lifecycle states are mutually exclusive | Native pending-index and map validation | Complete ordered pending keys plus target pending, consumed and invalidated records | T3B cache/hold projection | Local recovery could treat an orphan, duplicate or terminal reservation as pending authority | Absent, pending, consumed and invalidated classify independently | Index/map disagreement, multiple target records, malformed SCALE and record-binding drift reject | Classification only; absent is non-authorizing |
| RPC cannot precede process authority | Same-process AF-4C-3 request projection, operation-specific signed execution policy, immutable authority declaration and contained execution-authority assertion | Source request provenance, exact operation, CLI and schemas, verifier profile/policy and request digest | V4 wrapper, RPC collection and native execution | Caller-supplied bytes, clones, a V1-only authority or an uncontained executable could drive V4 proof collection | Genuine source candidate and exact V4 authority reach the RPC once | Supplied/cloned request, unknown operation, V1/V4 cross-use and wrong or missing authority reject before RPC or contained execution | No funds or persistence authority |
| Runtime-sized proofs remain bounded | TypeScript normalization and Rust trie-proof bounds | 512 nodes, 8 MiB aggregate, 4 MiB node, 4 MiB authenticated `:code`, duplicate exclusion and 32 MiB request envelope | Native verifier process | A realistic runtime proof could be rejected by an accidental tiny cap, or unbounded input could exhaust the verifier | A proof node above the old 256 KiB cap normalizes and exact fixtures verify | Oversized runtime declaration, node, aggregate proof, request and duplicate node reject | Resource bound only |

WP-07B-T3A evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for authenticated direct finality, exact seven-key V4 state proof and four-state classification |
| Independent review | `complete`; the first exact-diff review found that a V1-only authority could receive V4 wrapper provenance before later execution rejection. The immutable authority declaration now binds the separately signed policy operation, both wrappers reject cross-operation authorities before provenance, and a fresh final review found no remaining P1/P2 issue. Historical V1 golden-policy bytes, additional TypeScript terminal-state positives and a tighter V4-specific RPC ingress envelope remain non-authorizing follow-up coverage. |
| CI | `not_run`; focused local Rust and TypeScript closure is separate evidence |
| Target runtime | `not_run`; no runtime profile is activated and no network state is asserted |
| Readiness | `local_only` |

WP-07B-T3B selects a terminal expiry policy. The signed, permissionless
`expire_pooled_reserve_mint_reservation_v4` call at index `7` first revalidates
the active profile, complete pending record, mutually exclusive lifecycle
state and exact ordered index. At or after the stored expiry it removes only
the target pending entry and index key, then atomically writes a permanent
domain-separated invalidation tombstone. It preserves every unrelated pending
reservation. The historical error discriminants `21`, `22` and `23` remain
unchanged; new state, missing and not-expired errors append at `24`, `25` and
`26`, and the new invalidation event appends after the existing V4 stored
event. Early expiry, corrupt bindings or index state, and consumed/invalidated
conflicts reject without partial writes.

The T3B relayer boundary accepts only a fresh same-process T3A result. It runs
explicit collateral-continuity and pooled-reserve-lineage ports before any
persistence call, then writes one append-only observation journal and one
monotonic current-hold projection in a single SQLite transaction. The cache
binds statement, reservation/mint identity, per-observation admission
provenance, runtime
profile and code, trust anchor, target block/state root, finality horizon and
the exact lifecycle bytes. `absent` remains a non-authorizing hold. Pending
state at or after expiry remains held as
`expired_pending_runtime_retirement_required` until a fresh authenticated
runtime proof reports the permanent `invalidated` tombstone. `consumed` and
`invalidated` are terminal. A duplicate of the current semantic observation
is idempotent; replay of an older journal observation after the hold advances
rejects rather than emitting a stale successful recovery report.
Out-of-order height, same-height drift, pending-to-absent rollback, lifecycle
byte conflict, identity/trust-anchor drift and terminal rollback reject.
The admission-candidate digest is deliberately not part of stable reservation
identity because a complete fresh AF-4B-2 observation can advance the Ergo tip
without changing the canonical statement. The finality horizon cannot regress
or change hash at the same height. A higher horizon requires process-branded
T3C evidence authenticating every descendant header from the horizon already
bound to the hold; height monotonicity alone is not continuity proof.
Persistence snapshots the existing peg-in and settlement-authority tables
inside the transaction and rejects any mutation.

T3B covers atomic journal/hold rollback, restart, complete database loss,
duplicate identity, out-of-order and conflicting observations, authenticated
expired-pending retention, terminal replay, divergent collection, restored
collateral and reserve-lineage rollback at the port boundary. WP-07B-T3C binds
those ports to one source-owned composition and prevents caller-supplied child
reports from satisfying the join.

The WP-07B-T3B producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Expiry is terminal and atomic | Frontier call index `7` plus permanent invalidation domain | Complete pending record, ordered key index, expiry height, reason code and invalidation ID | T3A classification and T3B hold | A crashed or expired mint identity could become retryable and later execute twice | Exact-expiry call removes only the target and writes one tombstone while preserving another pending entry | Early expiry, every corrupt pending binding, corrupt index and lifecycle conflicts reject without writes | Local runtime transition only |
| Authenticated state precedes local recovery | T3A process provenance plus one-use recovery input guard | Statement/mint identity, profile/code, trust anchor, target root, finality horizon and exact lifecycle bytes | Continuity ports and SQLite transaction | Caller-built or replayed local state could recreate reservation authority | Fresh T3A pending and invalidated results produce bounded recovery observations | Clone, reused result, divergent collector and provenance loss reject before persistence | Non-authorizing observation only |
| SQLite remains reconstructible and fail-closed | Append-only journal, monotonic hold and transactional persistence | Semantic digest, full recovery identity, lifecycle classification and observation time | Restart and operator inspection | Database loss or local edits could clear a hold or mutate funds authority | Restart retains the hold; database loss rebuilds it only from a new T3A result | Forced hold-write failure rolls back the journal; update/delete triggers, out-of-order state and authority-table drift reject | Cache/hold only |
| Expired pending cannot become absent locally | Pure classifier plus transition reducer | Target height, pending expiry, exact record bytes and later tombstone | T3C recovery orchestration | Local time or a missing row could erase a reserved mint identity after a crash | Pending crosses expiry into a retained retirement-required hold, then advances only to authenticated invalidated | Pending-to-absent, changed pending bytes and terminal rollback reject | No retry or mint authority |
| Cross-observation finality cannot be inferred from height | Monotonic hold reducer plus process-branded T3C ancestry evidence | Held horizon hash/height, later horizon hash/height and every authenticated canonical SCALE descendant header | T3C recovery orchestration | A higher but unrelated fork could replace the source history while appearing newer | The exact held horizon advances through the complete authenticated path to the new T3A horizon | Regressed, same-height conflicting, forked, incomplete, cloned and higher unproved horizons reject | Non-authorizing continuity evidence only |
| Source continuity is source-owned | T3B ports behind the T3C composition | Same compiled instance, transition, source pair, canonical statement, source box, reserve transition and successor reserve | T3C journal transaction | A valid sidechain reservation could survive restored refundable collateral or a replaced Ergo reserve descendant | The post-T3A AF-4C-3 rebuild completes before one journal transaction | Caller child/target injection, statement drift or either concrete AF-4B-2 failure leaves persistence unchanged | Concrete local binding; no funds authority |

WP-07B-T3B evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for terminal runtime expiry, reconstructible journal/hold persistence and local recovery transitions |
| Independent review | `complete`; the exact-diff review found that a higher finality-horizon height was not bound to ancestry from the held horizon. T3B rejects unproved advances fail-closed; T3C now supplies the concrete cross-observation ancestry proof and source-owned port binding. |
| CI | `not_run`; focused local Rust and TypeScript closure is separate evidence |
| Target runtime | `not_run`; no runtime profile is activated and no network state is asserted |
| Readiness | `local_only`; T3C adds no mint, signing, submission, broadcast or Gate 5 authority |

WP-07B-T3C exposes one source-owned recovery composition. Its public input has
no caller-selected target block and no observation, revalidation, T3A result,
continuity report or authorization callback. It builds the first AF-4C-3
candidate from the concrete static AF-4B-2 source pair, projects the exact V4
reservation request, reads the current local hold only for fail-closed
continuity, and selects the current finalized Substrate head internally. It
then collects and verifies one fresh T3A result.

After T3A completes, the composition rebuilds AF-4C-3 from the same compiled
instance, transition and source pair. That rebuild performs the complete
dual-source collateral and reserve-lineage observation plus immediate
revalidation again. The initial and post-collection requests must have the
same complete 603-byte statement, statement ID and reservation key. The
admission-candidate digest may differ because it includes point-in-time Ergo
observation provenance; each T3A result still binds the exact admission digest
that produced its own request.

When the journal already holds an earlier finality horizon, T3C derives
continuity only from the newly authenticated T3A request. It flattens the
collector's bounded checkpoint-to-horizon header path, recomputes every
Blake2b-256 Substrate header hash, checks canonical compact block numbers and
requires a complete parent-linked descendant chain. The process-branded
evidence binds the stable reservation identity, trust anchor, new request
digest and exact prior/new horizons. The `StateTracker` validates that binding
inside the journal transaction; a clone, fork, missing height, regression,
same-height conflict or evidence attached without an advance rejects.

The WP-07B-T3C producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Source reads surround T3A | Source-owned composition plus two internal AF-4C-3 builds | Compiled instance, deposit transition, static source pair and complete V4 statement | T3B continuity ports and journal transaction | Sidechain state could remain held after collateral becomes refundable or the reserve descendant changes | Initial admission, fresh T3A and complete post-T3A admission rebuild preserve one statement | Caller target/child injection and post-collection statement drift reject before persistence; AF-4B-2 independently covers restored source, predecessor and reserve/source disagreement | Point-in-time dual-source Ergo observation; not Ergo consensus |
| Finalized target is not caller selected | Static Substrate finality provider plus T3A collector | Current `chain_getFinalizedHead` result, exact reservation request and trust anchor | Native finality and seven-key state verification | A caller could repeatedly reconstruct from a chosen old finalized state | The current finalized head is selected immediately before T3A collection | A `targetNativeBlockHashHex` or supplied T3A result is an unsupported input | Read-only collection only |
| Stable reservation identity excludes volatile observation provenance | Canonical V4 request projection plus exact post-collection comparison | 603 statement bytes, statement ID and reservation key; separate initial and revalidated admission digests | T3A request, journal and restart recovery | Freezing the tip-dependent admission digest would make honest restart fail, while ignoring statement drift could relabel another deposit | A fresh admission digest may change while statement identity remains exact | Any statement, statement ID or reservation-key drift rejects | Provenance distinction only |
| Later horizons prove ancestry | T3A request provenance, canonical SCALE parser and transactional binding | Trust checkpoint, every descendant header, parent/hash/height, held horizon, new horizon and request digest | Monotonic recovery hold | A higher unrelated fork could replace a held source state | One complete authenticated descendant path advances the hold | Clone, wrong parent, missing height, wrong endpoint, regression and same-height conflict reject | Non-authorizing finality continuity |
| Recovery remains reconstructible | Fresh composition run plus append-only journal/hold | Current source reads, fresh T3A result and exact recovery semantic | Restart and complete DB-loss rebuild | SQLite could become funds authority or locally clear a reservation | Restart appends a fresh observation; DB loss creates one new hold only after fresh sources | Failed persistence remains atomic; no authority table changes | Cache/hold only |

WP-07B-T3C evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for source-owned composition, internal finalized-target selection, post-T3A AF-4B-2 rerun, cross-horizon ancestry and reconstructible persistence |
| Independent review | `complete`; the first exact-diff review found that replaying historical journal observation A after hold B advanced could still emit a branded stale-success report. Persistence now requires the replayed observation to remain the exact current hold, the recovery report requires exact hold/observation identity, and the final rereview found no remaining P1/P2 issue. |
| CI | `not_run`; one grouped local affected-surface closeout is green |
| Target runtime | `not_run`; no V4 profile is activated and no network state is asserted |
| Readiness | `local_only`; no mint, signer, submission, broadcast, Gate 5, trustless or production-readiness claim follows |

WP-07B-T4 closes the local V4 runtime mint-consumption boundary. The active V4
profile now includes exact bridge and token runtime-code SHA-256 identities and
byte lengths in addition to the existing chain, application, settlement,
source-proof and finality fields. Before EVM execution, the runtime validates
that profile against deployed code and snapshots every non-expired pending
reservation from the direct parent together with bridge/token configuration,
owners, replay state, supply and recipient balance. After execution, it
requires each successful V4 `PegIn` to match one snapshot and one preceding
token mint effect, then proves exact aggregate supply and per-recipient balance
deltas. This conservative exact-delta model currently makes a V4 mint block
incompatible with an unrelated sERG burn or with a net transfer that changes a
mint recipient's balance. Before activation, the profile must either define and
enforce that versioned scheduling restriction or account explicitly for every
permitted same-block token effect.

All validation completes before native lifecycle mutation. A successful block
removes only the consumed pending entries, updates the ordered index, writes
one terminal consumed record per mint identity and emits the matching native
events. Any unmatched owner mint, extra or reused token mint, changed pending record,
profile or code drift, changed ownership/configuration, replay, invalidation,
expiration, wrong amount/recipient or partial token effect rejects the V4
callback before native lifecycle mutation. The combined V4 import replay now
exercises that callback after real EVM effects through both block authoring and
`FrontierBlockImport`, proves complete rejected-candidate rollback, and imports
a corrected sibling that consumes the reservation exactly once. The
cross-language state verifier decodes the
expanded 349-byte runtime profile and binds its complete bytes to the
authenticated profile ID; reviewed compiled-instance matching remains
activation work. The existing 603-byte reservation statement remains unchanged.

The WP-07B-T4 producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Positive fixture | Isolated negative | Authority / status |
|---|---|---|---|---|---|---|---|
| Direct-parent application snapshot | Pre-EVM V4 hook | Profile ID and bytes, bridge/token addresses and runtime-code identities, native parent hash/height, configuration, owners, replay state, supply and recipient balance | Post-EVM V4 validator | An owner call could mint under changed code, authority or non-parent reservation state | Exact active profile and pending reservation snapshot before mint | Activation-block mint, profile/code/configuration/owner drift and missing parent snapshot reject | Local runtime state only |
| Reservation-to-mint identity | V4 statement parser, pending validator and successful receipt/event parser | 603-byte statement, statement ID, V4 mint identity, recipient, amount, bridge/token addresses, transaction and event indexes | Pending-to-consumed transition | An arbitrary deposit ID, legacy replay key, recipient or amount could be relabelled as the reserved mint | One direct-parent pending reservation matches one `PegIn` and preceding `Transfer(0, recipient, amount)` | Unmatched owner mint, duplicate/legacy identity, wrong recipient/amount, expiry, replay and invalidation reject | Application-bound candidate only |
| Exact token effect accounting | Receipt scan plus parent/post EVM storage comparison | Every successful nonzero token mint effect, its single-use transaction/log index, total supply and each affected recipient balance | Block acceptance | One token effect could satisfy multiple reservations, or extra/partial mint effects could create supply outside the admitted reservations | Distinct reservations with the same recipient and amount consume distinct preceding token effects; supply and recipient balances increase by exactly the admitted amounts | Reused or extra mint, missing transfer, wrong ordering, wrong supply delta and wrong balance delta reject; an unrelated same-block burn or mint-recipient balance change also rejects under the current conservative rule | No external funds authority; versioned scheduling or broader effect accounting remains an activation decision |
| Atomic lifecycle transition | Complete V4 validation plus real block builder and `FrontierBlockImport` execution | Pending map/index, consumed map, statement/profile/mint identities, EVM replay/supply/balance, Frontier receipts/statuses, execution transaction/block/event identity and candidate header/body | Authenticated state collector and later cutover | EVM mint could survive while reservation consumption failed or only part of EVM/native/import state rolled back | A candidate containing one reserved and one unreserved mint rejects after both EVM effects exist; every accepted-parent snapshot and the pending reservation remain exact; the corrected sibling consumes the reservation once | Any candidate residue, pending/profile drift, consumed tombstone, nonce advance, best-head movement, retained body/header, or failure of the corrected sibling rejects the test | Source-locked local combined import conformance in a separate non-publishable test runtime; no activated authority |
| Atomic V4 activation containment | V4 activation dispatch in the locked Frontier runtime | Exact profile, independent `BridgeAddress`, sticky-enforcement key, Sudo key and activation event | Future authenticated state proof and cutover decision | A reviewed profile could be installed against another commitment producer, or retained Sudo could rewrite storage/runtime after activation | Every fallible validation precedes mutation; exact address match removes Sudo before profile/enforcement installation | Absent or mismatched address preserves deciding state and emits no V4 activation event; the outer Sudo dispatch may still record its failed result. Exact activation removes former-Sudo bridge-retarget, raw-storage and runtime-upgrade authority | Locked local source and synthetic node only; Sudo absence is not yet authenticated by the finalized state proof and no chain activation is claimed |
| Version and authority cap | Separate V4 profile plus compile-time activation gate | Expanded 349-byte V4 runtime profile; unchanged 603-byte statement and V1/V2/V3 formats | Future reviewed activation packet | Existing bytes could be silently reinterpreted or local fixtures promoted into authority | V1/V2/V3 matrices remain unchanged and V4 tests pass | Public activation remains unavailable; unknown/zero code identities reject | No target runtime, mint authority, Gate 5, trustless or readiness claim |

WP-07B-T4 evidence vector:

| Dimension | Result |
|---|---|
| Implementation | `matrix_covered` for exact direct-parent reservation consumption, application-code binding, owner-mint rejection, single-use aggregate token accounting, callback-local validation, combined rejected-candidate import rollback, and corrected-sibling recovery; the conservative same-block scheduling restriction remains explicit |
| Independent review | `complete`; the first final-diff pass found no P0-P2 and closed the earlier token-effect reuse, import-evidence wording and profile-negative findings, then identified the conservative same-block token scheduling restriction now retained as an unresolved activation decision. A fresh wording rereview found no remaining P0-P3 documentation defect |
| CI | `not_run`; focused Rust, TypeScript, source-lock and architecture checks are the applicable local closure |
| Target runtime | `not_run`; public V4 activation remains compile-time disabled and no network state is asserted |
| Readiness | `local_only`; profile-to-compiled-instance activation binding, relayer admission, target acceptance, finality authority and cutover remain open |

**WP-07B-T5 implemented combined V4 import-level rollback conformance.** The
normal non-test runtime build permanently selects the rejected source-proof
verifier and disables V4 profile activation. A separate
`frontier-template-v4-test-runtime` package is marked `publish = false`,
excluded from the workspace default members, and available to the node only
through the non-default `bridge-atomicity-v4-test-runtime` feature. Its
`frontier-template-v4-test` specification and implementation names differ from
the normal runtime identity. Normal chain specifications and the default node
dependency graph remain bound to the fail-closed runtime. Normal-source fixture
helpers remain `cfg(test)`-only. The integration client alone replaces its
synthetic genesis `:code` with the test runtime WASM, activates the fixture
profile, stores one exact direct-parent reservation, and builds a candidate
with one reserved and one unreserved real `mintSERG` transaction. Both
transactions succeed in the
candidate overlay before the V4 callback rejects the second mint. Block
authoring and `FrontierBlockImport` reject on that callback path. The accepted
head, exact profile and pending reservation, sender nonce, replay mappings,
token supply and balances, native terminal maps, events, Frontier
block/receipts/statuses, and candidate header/body remain unchanged. A separate
valid sibling body paired with the corrected root/digest rejects on a distinct
malformed-header backtrace, preventing generic import failure from being
mislabelled as callback rollback. A sibling containing only the reserved
transaction then imports and writes the exact terminal consumed record once.
The default rollback test and 63-test runtime
bridge matrix also remain green. This closes the local combined rollback item,
not fixture-profile promotion, deployment identity, source-profile approval,
activation, finality authority, target-node acceptance, mint authority, Gate 5,
trustless status, or readiness.

**P1 now contains the exact V4 activation transition in locked source.** The
activation call first validates the candidate profile, current activation
state, compile-time verifier selection, and independently stored
`BridgeAddress == profile.bridge_address`. Only after every fallible validation
passes does it remove the `pallet_sudo` key and then install the exact profile
plus sticky-enforcement state. Runtime negatives establish that an absent or
mismatched address leaves the prior address, profile, enforcement and Sudo key
unchanged and emits no V4 activation event; a real outer Sudo dispatch may
still record its failed result. The runtime positive rejects the former Sudo
holder's bridge-retarget, raw-storage and runtime-upgrade calls. The synthetic node
positive executes the real nested Sudo-to-Root activation, observes the Sudo
key absent, and admits the subsequent direct signed reservation. The normal
runtime still keeps V4 activation compile-time disabled, formats and proof
identities remain unchanged, and no deployed state is asserted. The
frozen authenticated V4 state proof does not read the Sudo key, so it is not
activation provenance or permanent governance containment. The separately
versioned V5 proof family now requires exact Sudo-key absence under the same
finalized state root as every other deciding application field. Its frozen
local method identity still needs an exact host, tracker and Ergo consumer
before it can become a target-node acceptance candidate; no activation or
funds authority follows from the source transition or local proof alone.

**P1 now has a non-authorizing structural V4 cutover candidate.** The exact
349-byte runtime-profile codec is shared with the authenticated V4 state
verifier and can only be derived from a same-process compiled application
instance. Authenticated-V2 DUP reconstruction is joined with exact native
checkpoint admissions. Only a historical key that already equals the exact
event-level canonical V4 burn ID is imported. A raw transaction-level key
rejects even when an admission from that transaction exists, because the
transaction may contain multiple burn events and the old key does not identify
which event the historical payout consumed. A separate event-level mapper now
resolves this seam only when two distinct Frontier source instances agree on
the same stable returned receipt-derived burn view, two distinct Ergo source
instances bind the exact historical signed settlement transaction and output-1
payout to the reconstructed transition, and the old key is the exact sidechain
transaction hash. One burn must uniquely match the payout amount and ErgoTree,
and a process-provenant native checkpoint admission under a purpose-approved
reviewed source profile must bind the same execution block, root, leaf count
and event. The production purpose-specific profile allowlist is currently
empty. Equal payout duplicates, source disagreement, cloned or mixed
provenance, duplicate mappings, unused admissions and any unmapped raw key
reject. Existing event-level packets retain their exact digest. Receipt-array
completeness, source independence, Ergo PoW and canonical chain membership
remain unproved. This mechanism has no reviewed live observation packet yet and
does not retire a route or authorize funds. The
accepted canonical burn IDs are sorted, deduplicated, replayed into one
deterministic insert-only AVL genesis, and consumed as the actual V4
provisioning R5 digest.

The cutover no longer accepts that route-specific import directly. A separate
global replay-genesis composer consumes the exact same-process cutover
observation and requires one explicit contribution for every observed
historical DUP lineage. Empty lineages contribute an exact empty set. The
authenticated-V2 packet is accepted only as the adapter for its matching route;
any other nonempty lineage remains blocked until a reviewed route-specific
mapping and source-admission adapter exists. Omitted, duplicated, unknown or
identity-drifted lineages and cross-route duplicate canonical burn IDs reject.
The composer globally sorts the resulting IDs and recomputes the insert-only
AVL digest plus exact R4/R5 registers. Provisioning consumes only this global
packet, and the cutover candidate binds the same packet and originating
observation digest. This closes the local replay-genesis composition mechanism,
not the operational replay migration: a real reviewed profile, capture and all
required nonempty-route evidence are still mandatory.

The cutover candidate then joins that provisioning packet with the exact
compiled V4 contract identities, source-admission policy, immediate
activation-parent declaration, and one complete declaration set for every
statically known legacy funds route. A regression compares the registry with
the reviewed historical Ergo contract source inventory, including the
committee-controlled `SideChainState` consumed by the historical direct unlock
route. The candidate rejects omission, duplication, unknown routes, active
declarations, disposition drift, source-inventory drift, mixed
application/profile identity, stale or parentless activation, and replay-genesis
substitution.
Historical authorities remain distinguished: refundable source locks combine
committee and depositor-timeout branches; authenticated routes retain their
R9/anchor-miner classification; and preactivation validity families remain
reserved proof routes rather than being relabelled as committee routes.

The read-only inventory layer exists without authenticating any retirement
declaration. One exact Ergo route profile covers all 26 statically
registered historical contract surfaces and binds each declared generation to
its P2S address, ErgoTree, network and optional singleton/genesis pair. The
chain-derived inventory compares complete indexed history, current UTXOs,
canonical EIP-12 fields and current box bytes across two bounded origins under
one stable snapshot. Each exact instance is classified as funded, drained,
never funded or unresolved. Query failure, malformed data, binary mismatch and
source disagreement remain unresolved rather than being converted into
retirement evidence.

The current authenticated-V2 tracker, DUP and vault can be reconstructed as one
read-only same-process bundle without reading or writing SQLite. The inventory
selects their exact token, genesis, tree and address identities while retaining
older profiled generations, and it binds a replay import only when that import
matches the reconstructed canonical DUP history. A missing reconstruction,
unresolved vault-root provenance or missing replay import remains an explicit
route blocker.

All eight statically registered historical DUP families now have frozen,
versioned descriptors for their historically declared transaction-hash or
event-ID intent. Every observed 32-byte key remains opaque until separately
mapped and admitted. The descriptors preserve required single or batch
ContextExtension variables while ignored variables remain in provenance, plus
successor index, input/data-input topology, R4 counter, R5 AVL update strength,
R6 codec, singleton, value and creation-height rules. A bounded dual-source
producer requires complete singleton-token history to equal the exact address
lineage, proves the issuance root by binding the singleton NFT to input zero of
the setup transaction, walks each exact profile-bound singleton from its
declared empty-tree genesis to its current tip, replays every lookup and
insertion proof, checks the spending transaction and block identities, and
binds current EIP-12 JSON to canonical Sigma bytes. The serialized lineage
validator recomputes every field supported by retained material. Transition
`contextExtensionDigestHex` and `spendingBlockIdHex` remain explicitly
producer-attested and packet-digest-bound because the bounded packet does not
retain the raw context maps or complete block headers needed to recompute them.
The Ergo inventory accepts those process-provenant packets only under the same
profile, network, stable snapshot, source pair, route, instance, NFT, genesis,
complete box set, registers and current tip. Raw reconstruction remains
separate from canonical burn-event mapping and source admission. A
transaction-hash lineage cannot enter a V4 replay genesis until every paid
transaction is mapped to its unique admitted event; a nonempty event-ID lineage
still needs the corresponding source-admission evidence. The packet explicitly
keeps source independence, Ergo consensus, transaction inclusion, global replay
genesis, route retirement and funds authority false.

A separate Frontier/relayer inventory derives its exact seventeen routes from the
same cutover registry rather than maintaining another list. It binds current
tracked source and ABI capabilities to same-process deployment identity,
bounded lineage and V4 runtime-profile candidates. The four Ownable mutations,
state update, emergency pause, unpause, permissionless peg-out, token bridge-burn, Root bridge-address
mutation, selected-bridge V1 commitment producer, owner mint, token mint, fee
withdrawal and three local runtime entrypoints remain separate. A disabled local
configuration has no retirement effect.

These producers and the event-level mapper are still non-authorizing local
implementation. No reviewed live instance profile or real lineage, inventory
or mapping packet exists, operational independence is unauthenticated, profile
completeness is unproved, raw historical keys outside the existing
authenticated-V2 admitted path are not canonical replay imports, and no route
is retired. The
current compiled fixture inherits activation height `0`, so it cannot supply a
valid activation parent or become a real cutover packet. The combined V4
import-level rollback replay is now closed as local test-only conformance while
the purpose-specific native profile registry remains empty. The config-free
`p1:ergo-cutover:observe` command now accepts one repository-local strict-JSON
nonmainnet route-profile input, its explicit expected digest and two read-only
Ergo origins. It rebuilds the profile in process, rejects mainnet and digest
drift before observation, applies one aggregate pair of request/byte/deadline
budget hooks, reconstructs every profiled DUP lineage sequentially, and then
builds the complete inventory from the same process-provenant packets and
source pair. The inventory join requires one exact snapshot across every
producer. The single create-only report retains the complete canonical route
profile, lineage packets and inventory packet. Deserialized validation rebuilds
the route profile and its digest, rebinds every inventory and lineage identity,
reruns cross-route box assignment, and derives coverage states plus mandatory
blockers from the retained facts. The orchestrator does not load configuration,
credentials, deployment state or a runtime database, but the generic source port does not
authenticate an adapter's implementation, provenance or budget enforcement.
Source-identity digests are pseudonymous and may be dictionary-recoverable, so
the raw report stays local/private and requires a separately reviewed redacted
export before publication. Every
review, consensus, mapping, admission, retirement, activation, funds and
readiness boundary remains false. No test profile is registered or promoted by
the command. A real report remains blocked until the profile and deployment
lineage are independently reviewed. Required event mappings and
source-admission packets follow from the observed nonempty lineages.
Route-specific retirement evidence follows only after those exact packets
exist. A reviewed nonzero activation profile is created only when an exact
target activation parent exists.

The testnet cutover review-profile assembler now joins all nine cutover
components under same-process provenance and accepts only a reviewed,
non-inert public-testnet deployment lineage. It binds every one of the 49
static legacy-route inventory digests, the exact activation-parent terminal
observation, and each observed replay lineage's mapping and admission state.
The sanitized output excludes source-origin identifiers, raw boxes, raw replay
keys, and canonical burn IDs. Its serialized validator can independently
recheck the profile digest, the static route set, the internal DUP
lineage-to-instance join, sanitized field policy, and the all-false authority
boundary. It explicitly reports that the omitted components' same-process
provenance and source-component membership were not replayed. This closes only
the local composition and review
format. Real capture, independent review, authenticated retirement,
activation-parent authenticity, target-node acceptance, and funds authority
remain open.

The P1 structural cutover producer-to-consumer closeout is:

| Invariant | Producer / enforcement | Exact fields | Downstream consumer | Failure if relaxed | Verification | Authority / status |
|---|---|---|---|---|---|---|
| Exact runtime/application identity | Same-process compiled V4 instance plus canonical SCALE/LE runtime-profile codec | 349 profile bytes and ID; lineage/application bindings; four compiled contract IDs; bridge/token addresses and code identities; source/finality/settlement profiles; activation height | V4 authenticated state verifier and cutover candidate | A runtime profile could select another contract instance, code image or source proof while retaining a plausible local label | Canonical round-trip, profile ID, compiled binding, every fixed field and structured-clone provenance negatives | Local candidate only; profile activation and target acceptance remain false |
| Authenticated-V2 replay import | Authenticated DUP reconstruction, dual-source returned Frontier burn-view agreement, dual-source canonical historical Ergo payout evidence, event-level mapping and native checkpoint admission under a purpose-approved reviewed source profile | Exact canonical event-level burn ID or exact transaction-level key plus unique mapped event; signed settlement transaction and claimed block commitment; payout box/value/ErgoTree; block, root, leaf count, recipient, amount, admission/mapping/profile digests and lineage identities | V4 DUP genesis consumed by provisioning | A transaction-level key could be assigned to the wrong same-transaction event, omitted receipt evidence could be treated as complete, an unreviewed source profile could inherit authority, or provisioning could omit paid history | Existing direct packet digest remains exact; mapped conformance path passes under the test-only profile; altered historical transaction, missing payout evidence, equal-payout ambiguity, root/event drift, omission, extra/unused admission, duplicate mapping, unapproved or mixed profile, wrong chain/asset and cloned provenance reject | Production profile allowlist is empty; receipt completeness and all real mapping/cutover authority remain open |
| Global historical replay genesis | Same-process cutover observation plus one exact contribution per observed historical DUP lineage | Route, instance, lineage packet, profile, snapshot and source-pair identities; explicit empty sets; route-specific replay-import digests; globally sorted unique canonical burn IDs | V4 provisioning and structural cutover candidate | One omitted generation, unsupported nonempty route or duplicate burn across routes could leave a historical payout replayable after cutover | Missing, duplicate, unknown and drifted lineages; unsupported nonempty routes; malformed authenticated-V2 imports; reordered inputs; and cross-route duplicate burn IDs reject | Local composition mechanism complete; real profile/capture and every required mapping/admission remain open |
| Deterministic DUP genesis | Global historical replay packet, pinned WASM AVL transition, canonical register encoders and provisioning recomputation | Sorted unique 32-byte burn IDs, insert-only policy, 1-byte values, exact digest, R4 lineage profile and R5 AVL register | Actual V4 DUP singleton genesis output and cutover candidate | A route-specific import, report-only set or caller-selected digest could leave paid burns replayable after cutover | Provisioning rejects the former authenticated-V2-only shortcut and recomputes the complete global set and digest; unsorted, duplicate, packet, register and digest drift reject | Local unsigned provisioning only; no setup, activation or funds authority |
| Versioned V5 replay cutover | Process-owned global V4 replay packet plus exact compiled V5 settlement instance | Exact retained V4 source-runtime lineage; sorted canonical burn IDs; independently recomputed 33-byte AVL digest; V5 target lineage, genesis input, NFT and DUP contract | V5 DUP singleton issuance and the local V5 settlement constructor | The distinct V5 target could start from an empty or caller-selected replay set, allowing a historically paid burn to be claimed again | Source-lineage, ordering, duplicate, digest, register, provenance and genesis drift reject; the local constructor accepts a new burn, rejects an imported burn and rejects omitted imported history through the predecessor digest | Local unsigned transaction only; inventory exhaustiveness, retirement, chain establishment, activation, node acceptance and funds authority remain false |
| Blocked V5 cutover eligibility | Same-process sanitized V4 cutover review plus the exact process-provenant V5 provisioning plan as the sole V5 input | All 49 static route requirements and per-route inventory bindings; every DUP instance and replay lineage; retained V4 runtime/application/finality/replay identities; distinct V5 lineage; complete four-contract artifacts; selected testnet/genesis; three genesis inputs/NFTs; replay singleton; all unsigned transaction and predicted output identities | V5 target-check request and future authenticated cutover decision | A plausible review or independently supplied V5 object could omit one authority, accept funded or unresolved boxes, leave a nonempty lineage unmapped, drift from the global replay packet, substitute a network/contract/transaction/output identity or widen a caller retirement claim | Exact route/instance and provisioning-plan joins; real producer-to-consumer provenance; funded, unresolved, omitted, duplicate, unmapped, cross-packet, network, lineage, contract, singleton, transaction/output and authority mutations reject | Structural precondition only and always blocked; inventory exhaustiveness, authenticated retirement, singleton/reserve lineage, activation, node acceptance, funds authority, Gate 5, trustless status and readiness remain false |
| Non-executable V5 target-check request | Exact same-process blocked cutover eligibility plus its process-provenant provisioning plan | Eligibility and plan digests; target network/genesis; retained/target/finality profile; complete contract-family digest; ordered tracker, DUP and reserve EIP-12 payloads; unsigned transaction IDs/digests and predicted box IDs; exact check-only receipt policy | Future statically registered checker/receipt producer and atomic V5 funds-authority switch | Three checks could target different nodes, activation generations or state contexts; PASS text could replace exact JVM and node receipts; or altered signed bytes could hide behind a stable unsigned ID | Exact candidate/plan cross-binding, ordered three-role set, body digests, distinct identities, clone/provenance, network/profile/transaction and authority-drift negatives | Request only. No target is selected, no signer/checker/receipt producer exists, and target acceptance, on-chain lineage, activation, funds authority, Gate 5, trustless status and readiness remain false |
| Non-executable V6 target-check request | Exact same-process blocked V6 cutover eligibility plus its process-provenant V6 provisioning plan | Eligibility and plan digests; exact prior local predicate-closure identity; target network/genesis; retained/target/finality profile; complete V6 contract-family digest; ordered tracker, DUP and reserve EIP-12 payloads; unsigned transaction IDs/digests and predicted box IDs; exact V6 check-only receipt policy | Future statically registered checker/receipt producer and atomic V6 funds-authority switch precondition | A V5 request could be relabelled, the local predicate closure could drift, three checks could target different nodes, activation generations or state contexts, PASS text could replace exact JVM/node receipts, or altered signed bytes could hide behind a stable unsigned ID | Exact V6 schema/domain/version; candidate/plan/closure cross-binding; ordered three-role set; body digests; distinct identities; clone/provenance, plan/closure/transaction and authority-drift negatives | Request only. No target is selected, no JVM matrix is replayed, no signer/checker/receipt producer exists, and target acceptance, on-chain lineage, activation, funds authority, Gate 5, trustless status and readiness remain false |
| Blocked atomic V6 funds-authority switch precondition | Exact own-data-property snapshots of the same-process V6 cutover eligibility and target-check request | One V6-only switch-intent digest and activation-context policy; exact prior local predicate-closure digest; target network/profile/contract family; ordered tracker, DUP and reserve transaction/output/NFT identities; global replay packet, lineage-set digest, burn count and AVL digest; 49 observed V4 route bindings plus four exact integrated V5 contract retirement requirements; four future evidence schemas | Future statically registered V6 target-check, canonical-lineage, replay-import and legacy-retirement evidence producers | A V5 object could be relabelled, an integrated V5 reserve or DUP route could be omitted, a getter or clone could substitute an input, a cross-target request could be joined, or one local flag or partial evidence family could authorize funds before every route and replay lineage is closed | V6-only schemas/domains; same-process provenance; exact 53-route requirement set and V5 contract IDs; exact request/eligibility/closure/target join; accessor, clone, cross-target and caller-widening rejection; one atomic four-evidence rule; every authority boundary fixed false | Requirement contract only. The four integrated V5 routes remain pending authenticated inventory and retirement evidence. No evidence is accepted, no switch is evaluated, and target acceptance, canonical lineages, replay import, authenticated retirement, activation, funds authority, Gate 5, trustless status and readiness remain false |
| Blocked atomic V5 funds-authority switch precondition | Exact own-data-property snapshots of same-process V5 cutover eligibility plus its exact target-check request | One common switch-intent digest and activation-context policy; target network/profile/contract family; ordered tracker, DUP and reserve transaction/output/NFT identities; global replay packet, lineage-set digest, burn count and AVL digest; all 49 route inventory and retirement bindings; four future evidence schemas under one authenticated activation generation | Future statically registered target-check, canonical-lineage, replay-import and legacy-retirement evidence producers | A getter substitution, local flag, copied process object, partial receipt set, cross-generation evidence, independently confirmed singleton, omitted replay history or retired-looking subset could activate V5 while another funds route remains valid | Accessor, clone, cross-target and cross-context rejection; exact target/transaction/contract join; full static route set; common evidence digests; one atomic four-evidence rule; all authority boundaries fixed false and no evidence consumer exported | Requirement contract only. No evidence is accepted, no switch is evaluated, and target acceptance, canonical lineages, replay import, authenticated retirement, activation, funds authority, Gate 5, trustless status and readiness remain false |
| Complete structural route declaration | One static versioned registry, reviewed-contract inventory regression and exact-key candidate parser | Owner/token mint, permissionless `ErgoBridge.pegOut`, ownership and Root mutations, fee withdrawal, selected-bridge V1 commitment producer, source locks, `SideChainState`, vaults, trackers, DUP families and relayer entrypoints; historical authority and required disposition | Both inventory producers and future authenticated cutover evidence packet | Duplicated registries could drift, or one forgotten authority or singleton could mint or pay outside the V4 replay lineage | Both inventory producers consume the same registry; exact requirement count/digest; omission, duplicate, unknown, wrong-disposition and active-route negatives | Declarations are unauthenticated and routes are not retired |
| Exact Ergo instance inventory | Reviewed-source profile parser plus two bounded read-only chain sources | Route ID, source surface, disposition, instance ID, P2S address/tree/hash, singleton/genesis pair when needed, complete indexed boxes, current boxes and canonical current bytes | Future route-specific retirement decisions and authenticated-V2 cutover binding | An unprofiled generation, ambiguous repeated script, missing singleton identity, incomplete history or source disagreement could be mislabeled drained or never funded | Global 256-instance bound; cross-route identity uniqueness; same-script generations require unique singleton/genesis identities; singleton-bearing deciding routes with observed boxes require exact token identity; stable snapshot; indexed/current set equality; malformed, binary-drift, missing-generation, source-disagreement and clone-provenance negatives | Producer exists; profile review, exhaustiveness and retirement authority remain false |
| Historical DUP raw-lineage reconstruction | Nine frozen native-family descriptors plus two bounded read-only sources and deterministic AVL replay | Profile/requirements/network; route/surface/instance; address/tree/NFT/genesis and input-zero issuance root; stable snapshot and source pair; complete token and address lineage; setup and spending transaction/block identities; required ContextExtension keys/proofs plus provenance-bound ignored variables; older R4 counters/R5/R6 semantics; pooled-reserve V4 exact topology, R4 profile, insert-only R5, derived tracker key, nonempty unverified tracker proof and absent R6; current canonical bytes | Exact Ergo inventory join, then event mapping and source-admission composition | An opaque key could be relabelled as a canonical burn, a valid historical successor could be omitted, a sibling singleton or incomplete token history could replace the declared generation, a funded V4 profile/AVL family could be decoded as an older counter family, an off-contract topology or tracker key could be accepted, or digest-only and full-tree families could be conflated | Positive reconstruction across all nine descriptors, including a two-successor funded V4 lineage; exact V4 tracker-key derivation and leaf/bundle DUP proof replay; real funded-V4 producer-to-inventory composition; transaction count versus key count; ignored-variable provenance; issuance-root and complete-token-lineage negatives; insert-only policy, output count, tracker key, digest-only versus full-tree semantics, route/profile/source/snapshot/NFT/genesis/topology/context/proof/register/successor/current-tip and cloned-provenance negatives | Raw process-local reconstruction only. A nonempty tracker proof is retained but not authenticated by this producer. Funded pooled-reserve V4 lineages remain ineligible for replay genesis until one-to-one application-bound event mapping, tracker membership and source admission exist; no canonical source finality, route retirement or funds authority follows |
| Unified Ergo cutover observation | Config-free `p1:ergo-cutover:observe` composition over the exact route-profile builder, two read-only vault-source ports, all historical-DUP producers and the inventory producer | Complete canonical route profile and digest; explicit expected digest; nonmainnet network; one applied aggregate pair of budget hooks; complete lineage packets; exact inventory packet; one source-pair digest and stable snapshot; derived coverage, blockers and nonempty-lineage mapping/admission requirements | Independently reviewed private capture, separately reviewed redacted export, and route-specific follow-up packets | Separate producer runs could observe different tips, reset bounds into an effectively unbounded campaign, expose pseudonymous source identities, overstate generic-adapter enforcement, rewrite route identities behind an old profile digest, suppress blockers, or let a serialized/test profile acquire implied authority | Mainnet, digest drift, absent budget hooks, cross-producer snapshot drift, duplicate JSON keys, output overwrite, origin leakage, canonical profile reconstruction, route/instance rebind, cross-route box assignment, derived coverage/blocker checks, coordinated child/outer digest rewrites, authority-capability imports and cloned/tampered report negatives | Implemented as one create-only non-authorizing local report. Historical context-extension and spending-block identities are explicitly producer-attested and packet-digest-bound because their raw inputs are not retained. Generic-adapter provenance and budget enforcement, profile review, deployment lineage, source independence, Ergo consensus, event mapping, source admission, replay genesis, retirement, activation and every funds/readiness authority remain false |
| Current authenticated-V2 generation and replay binding | Read-only tracker/DUP/vault reconstruction plus exact identity selection, separate historical signed-payout evidence, event-level mapping and canonical replay-import provenance | Two reconstruction source IDs and two historical-payout source IDs; stable tip; tracker and DUP singleton/genesis identities; vault address/tree/current boxes; signed settlement transaction/block commitment; payout box/value/ErgoTree; canonical direct or mapped replay imports | Ergo route inventory and future V4 DUP cutover | A historical generation could replace the current singleton, or paid burns could be omitted or assigned to the wrong same-transaction event from caller-supplied payout fields | Multiple-generation profile retains history while selecting the exact current instance; altered or unavailable historical transaction, missing reconstruction, unresolved root provenance, absent/ambiguous mapping, missing/mismatched replay import and provenance clones reject or remain blocked | Authenticated V2 implementation only; no purpose-approved production profile or real mapped observation packet exists, and other lineages remain open |
| Frontier/relayer compatibility inventory | Same canonical registry plus tracked source/ABI closure and same-process deployment, lineage and runtime-profile candidates | Seventeen exact route definitions, every state-mutating `ErgoBridge` ABI function, source hashes/sizes, declared source absence, deployment/code/owner bindings, activation height and local capability observations | Future route-specific disablement, freeze, application binding or removal evidence | State update, pause control, token bridge-burn, permissionless peg-out or Root mutation could be confused with event production; a mutable ABI surface could be omitted; a local disabled flag or absent local source could be treated as deployed retirement; or a removed signer/submission source could return unnoticed | Exact state-mutating ABI equality; four Ownable mutation routes; separate state-update, pause/unpause, peg-out and bridge-burn routes; distinct Root/producer routes; exact updater-source absence and active-ABI closure; omitted/extra/fallback ABI, source-return, cloned-provenance, claim-bearing configuration and missing-route negatives | Local updater capability is physically absent and remains a candidate-only historical route. No activated target, historical receipt completeness or authenticated retirement authority |
| Sanitized testnet cutover review profile | Nine same-process cutover components: compiled instance, runtime profile, Ergo observation, replay genesis, provisioning, cutover candidate, deployment identity, deployment lineage and Frontier/relayer inventory | Exact component digests; public-testnet deployment/application identity; activation-parent terminal observation; all 49 route inventory and retirement-evidence digests; every replay lineage's mapping/admission state; blockers; all authority fields false | Independent architecture review and, only after real capture, an exact activation decision | Mixed deployments, an omitted route, reused inventory as retirement evidence, hidden replay mapping, source-origin leakage or coordinated authority widening could be represented as one plausible packet | Deterministic ordering; same-process provenance; exact component, route, activation and replay joins; sanitized route commitments; internal serialized replay-to-DUP-instance join; isolated and coordinated negative mutations | Local review format complete. Serialized validation cannot replay component provenance or source-component membership; real capture, review, retirement, activation, target acceptance and funds authority remain open |
| Activation-parent boundary | Runtime activation height plus strict parent declaration | Exact `H-1` native height/hash/state root, execution hash, runtime code identity, source-admission policy and observation digest | Future reviewed activation packet | A stale, unrelated or parentless state could be represented as the cutover boundary | Stale height, policy drift and activation height `0` reject | Parent authenticity, nonzero target activation and funds authority remain false |

WP-07B's local lifecycle implementation now covers restart, complete database
loss, divergent RPC views, duplicate identity, pre-admission and
post-reservation failure, source reorg, stale historical replay and
cross-horizon fork rejection through the source-owned seams and their exact
producer/consumer matrices. Reconstruction may restore cache and holds but
cannot recreate authority without fresh authenticated sidechain state and
fresh source observations. T4 adds source-locked V4 mint execution only inside
the disabled reference profile. Relayer admission, signer, submission,
broadcast, target activation and any Gate 5 or readiness claim remain outside
this boundary.

**WP-07A implemented Ergo-side peg-in route recovery baseline:** the complete
manifest-bound active and historical MainChainLock route can now be rebuilt
from two stable, synchronized, read-only node views. Every spent deposit is
classified from its exact spending transaction, the unique canonical header at
its inclusion height, inclusive confirmation count, output-zero vault
transition or timeout refund,
and the complete indexed vault history. Exact but shallow vault transitions are
retained as `commit_pending` and remain blocked rather than being confused with
malformed spends. Source disagreement, same-height drift, a non-canonical spend
block, incomplete history, and unresolved transitions fail closed.

One atomic SQLite replacement stores only this route inventory. It proves that
the existing `peg_in_events` lifecycle rows are byte-for-byte unchanged, and
database-loss tests show that no `detected`, `consume_confirmed`, `minting`, or
`minted` row is reconstructed. Restart, idempotent replay, committed-to-
refundable rollback, complete database loss, source disagreement, out-of-order
snapshots, a multi-header fork candidate set, concurrent cache replacement,
stale persisted digests, and forged reconstruction provenance are covered.
Multi-table reads use one SQLite snapshot and recompute the complete normalized
semantic digest before exposing a restart cache. This milestone is
non-authorizing and Ergo-only; it cannot authorize minting.

**WP-07A implemented Frontier peg-in history reconstruction and exact Ergo
join:** two distinct credential-free RPC origins must reproduce the same stable
EVM chain ID, tip height/hash, canonical `PegIn` logs, successful receipts, and
block-hash-pinned `processedPegIns` state using an EIP-1898
`{ blockHash, requireCanonical: true }` selector. The pinned Frontier resolves
that hash only through its canonical native-block mapping.
Event blocks, receipts, mapping values, and the tip are rechecked before a view
is retained. The exact indexed event ABI is decoded and
bound to the provenance-marked Ergo route by source box ID, target H160, actual
nanoERG value, and route classification. A mapping-only mint, event-only mint,
wrong recipient or amount, duplicate/unknown event, mint before a confirmed
committed vault, noncanonical block, reverted or mismatched receipt, source
disagreement, and same-observation tip change fail closed. Legacy mint history
without reconstructible recipient and amount bindings remains blocked. The
Ergo route is reconstructed again after Frontier observation and must retain
the same digest; both Frontier tips are then rechecked to bracket the joined
cross-chain observation window.

The result is schema- and digest-bound and has no lifecycle, mint, checker,
signer, submitter, or broadcast capability. `confirmed_by_depth` describes only
the configured EVM block depth; it is not GRANDPA finality. Distinct origins
detect disagreement but do not prove source independence or consensus.

**WP-07A implemented joined peg-in restart and database-loss cache:** one
immediate SQLite transaction persists the exact route generation plus the
Frontier profile, sources, tip, entries, events, issues, decision, boundaries,
and reconstruction digest. The Frontier object must bind the exact route
digest written in that transaction. A separate route replacement invalidates
the joined cache. Restart reads all joined tables and the route in one snapshot,
reruns structural validation, recomputes the digest, and deliberately does not
restore live-observation provenance.

The mutation proves that peg-in lifecycle rows, aggregate settlement attempts,
authenticated candidates, and execution reservations remain unchanged. It
restores no `detected`, committed, minting, or minted lifecycle after complete
database loss. Idempotent restart, route invalidation, forced late-write
rollback, concurrent mixed-generation reads, tampered semantics, cloned
provenance, read-only inspection, and preservation of an existing minted row
are covered.

**WP-07A implemented bounded peg-in reconciliation journal and hold:** an
existing lifecycle row and the current joined cache are each bound by an exact
caller-supplied digest and rechecked in one immediate transaction. The derived
V1 observation can only be `deferred` or `quarantined`. It is appended to an
immutable digest-bound journal, while a separate monotone pointer selects the
current hold. Recursive SQLite triggers also reject conflict-replacement
attempts against either surface. Exact replay is idempotent. Held rows are absent from the mint
queue, and SQL rejects non-terminal status or binding changes even through a
direct lifecycle call; an attempted trigger-side authority mutation rolls back
the journal and hold. Incident, invalid, or failed terminalization remains
available, but no API clears a hold. Missing rows, stale lifecycle digests,
stale joined generations, unexpected Frontier mints, absent local mints,
identity mismatch, lifecycle/source/route incompatibility, and inconsistent
joined history fail closed through an isolated negative matrix.

**WP-07A implemented fail-closed runtime recollection:** after each bounded
Ergo deposit scan and before the first lifecycle selection, the daemon invokes
a statically wired reconciliation pass. Runtime wiring is absent unless an
exact enable switch plus the reviewed route manifest/digest, both contract
sources, two distinct Ergo origins, two distinct Frontier origins, and the
complete versioned sidechain profile are present. The route manifest and
sidechain profile must exactly match the active MCL/vault, operational
sidechain ID, primary Frontier RPC origin, deployment-recorded EVM chain ID,
deployed bridge H160 and deployment block, and both configured confirmation policies.
The pass rebuilds the complete joined view, then selects one deterministic
bounded page of rows that have no hold for that exact generation. It reports
whether more rows remain, so later ticks drain the backlog without allowing
selection. A changed joined generation makes held rows eligible for a newer
append-only observation; no hold is removed.

Missing wiring, deployment/profile mismatch, source disagreement, recollection
failure, a changed lifecycle, cache-generation drift, or any authority-bearing mutation
fails closed before transition selection. A successful pass still returns
`lifecycleSelectionAuthorized = false`: the daemon therefore performs no
commit submission, promotion, retry, mint, or hold release in this milestone.
This also closes the inter-process insertion race at the current boundary,
because no newly inserted unheld row can fall through to the retained legacy
selection code. Native Substrate/GRANDPA finality admission, an independently
reviewed hold-release policy, and a concrete approved dual-node exercise remain
open.

**WP-07A implemented versioned peg-in runtime-state producer:** the pinned
Frontier runtime patch now persists every successful canonical
`PegIn(address,uint256,bytes32)` log from the configured bridge contract in
native authenticated state. A recorded event is not a mint decision or proof
that minting occurred. One separately versioned profile binds the
sidechain genesis hash, bridge address, configuration revision, and activation
height. Each fixed-size record binds that profile generation plus Ergo box ID,
recipient, raw nanoERG amount, native height, execution block, transaction, and
global event index. The replay key binds only its versioned domain, sidechain
genesis hash, and canonical Ergo box ID; it intentionally excludes both profile
revision and bridge address, so profile rotation or contract migration cannot
reset the same deposit identity. Reverted transactions, wrong addresses, malformed ABI,
duplicate identities, invalid profile state, and configured bound overflow
fail closed. The callback completes peg-in and burn validation before any
storage mutation or event emission, so a malformed mixed block cannot retain a
partial record or erase prior commitment state. Peg-in records are produced even when the block has no burn, while
the existing burn commitment V1 bytes and semantics remain unchanged. Pallet
Ethereum reserves the callback's configured maximum weight before dispatch,
and exact tests preserve the historical event discriminants. The reservation
is still a conservative prototype value pending target-hardware benchmarks.

`docs/peg-in-runtime-state-v1.md` and the cross-language vector freeze the SCALE
values, replay key, profile storage key, and `Blake2_128Concat` record key. This
is an authenticated-state producer, not a finality proof or a mint authority.
Positive record membership persists across profile rotation. Current
non-membership requires a profile active by the finalized native target, but it
cannot compare native activation height with the Ergo deposit height or prove
that no legacy mint occurred before activation. A later cutover policy must
bind the reviewed profile activation checkpoint to an eligible Ergo deposit
range. The replay map is intentionally permanent, so the per-block
bound does not solve lifetime state growth. Activation remains blocked on an
approved state-growth/economic policy and benchmark-backed callback weight.

**WP-07A implemented separate native finalized-state proof profile:** the
Frontier verifier now has a distinct request, statement, result, and explicit
`verify-peg-in-state` CLI mode. It derives the exact
`Blake2_128Concat` record key internally and authenticates it directly for
membership, including after profile disable or rotation. Current non-membership
also derives and authenticates the fixed profile key in the same bounded trie
proof under the target state root. Both branches reuse the reviewed GRANDPA trust-anchor,
transition, ancestry, and finality checks without extending or reinterpreting
the burn-only checkpoint V2 profile. Real Rust-generated membership and
non-membership vectors are consumed by strict TypeScript bindings. Historical
membership remains valid across profile disable or rotation; non-membership proves only
current absence under one exact active profile at one finalized target. The result explicitly denies runtime
code identity, historical mint absence, committed-vault verification, mint
authority, transaction mutation, and Gate 5 closure.

**WP-07A implemented proof-only execution and branch-specific collection
milestone:** `verify-peg-in-state` now has a separately versioned static policy
whose signed digest authorizes only that exact CLI mode, request/result schemas,
limits, environment, artifact, and runtime dependency manifest. Its contained
authority reloads the source-owned attestor lock and revalidates the exact
policy before and after every launch. The existing GRANDPA codec remains under
the unchanged burn-policy V1 authority; no peg-in policy broadens that profile.

The collector shares the existing bounded GRANDPA envelope without changing its
burn request bytes. It then performs exactly one `state_getReadProof`: the
derived record key alone for membership, or the fixed current-profile key
followed by the derived record key for non-membership. It rejects wrong
statement identity before RPC, target drift, malformed/duplicate/unbounded trie
material, source-lock revocation, policy drift, forged authority provenance,
and any attempt to substitute another operation. The collected and verified
results remain proof-only and explicitly deny historical mint absence, runtime
code identity, committed-vault verification, mint authority, transaction
mutation, and Gate 5 closure.

The milestone closeout is:

| Producer | Exact output or field | Deciding consumer and required check | Failure if relaxed | Isolated negative coverage |
|---|---|---|---|---|
| V1 peg-in statement normalizer | Sidechain ID from the reviewed trust anchor; exact Ergo box ID; membership record bytes or current non-membership profile bytes | Read-proof provider derives the record key; native verifier independently derives the same keys and decodes the expected bytes | A proof for another sidechain, deposit, profile generation, amount, or recipient could be collected or accepted | Mismatched statement identity rejects before RPC; existing vectors reject wrong record/profile fields |
| Read-only Substrate provider | One target-bound `state_getReadProof`; `[record]` for membership or `[profile, record]` for non-membership; bounded unique trie nodes | Native finalized-state verifier checks the proof against the finalized target header state root | Storage-value observation, target drift, duplicate nodes, or unbounded proof material could masquerade as authenticated state or exhaust collection | Target drift, duplicate/empty/unknown proof responses, branch key order, and absence of `state_getStorage` are tested |
| Signed peg-in execution policy | Exact artifact, manifest, environment, limits, schemas, and `--verify-peg-in-state --trusted-anchor-digest <digest>` argv | Contained peg-in authority reloads reviewed roots and validates the policy before and after each launch | Another operation, binary, dependency closure, argument order, or weakened authority boundary could execute under the peg-in profile | Operation, argv, schema, limit, artifact, manifest, expiry, unknown-field, runtime-code, mint, and Gate 5 mutations reject |
| Contained peg-in authority | Immutable stdout snapshot bound to authority object, policy digest, operation, and per-launch source-lock validation | Authority-bound verifier validates exact request/result bindings and records process-local provenance | Revoked roots, a forged result, changed policy, direct execution, or output mutation could acquire false proof provenance | Revocation before/during launch, malformed operation/digest, weakened broker boundary, mutation, and forged authority/result tests reject |
| Authority-bound verifier | Branded verification bound to the exact verifier object, request digest, executable, invocation, and policy digest | Proof-only collector accepts only matching process-local provenance | A copied result or caller-shaped boolean could be treated as native verification | Cloned verification and forged verifier/result objects reject |
| Proof-only collector | Finalized statement-relative evidence plus executable pins; all mint/vault/runtime-code/Gate 5 boundaries remain false | No lifecycle or settlement consumer is authorized in this milestone | Local proof success could prematurely release a reconciliation hold or authorize funds | Result boundary assertions require every authority field to remain false; reconciliation is deliberately unchanged |

**WP-07A implemented V2 runtime-code proof-core and exact-collection
milestone:** a new request, statement, result, fixture, and separate native CLI
family authenticates the raw Substrate `:code` value under the same target
state root as the inherited V1 peg-in predicate. V1 schemas, bytes, CLI, proof
bounds, and statement semantics remain unchanged. V2 membership requests
exactly `[:code, record]`; V2 current non-membership requests exactly
`[:code, active profile, record]`. Each branch performs one bounded
`state_getReadProof` and one native `read_proof_check`.

The statement binds the exact `:code` key, raw-Wasm SHA-256, raw byte length,
portable runtime-build attestation ID, and attestation SHA-256. The native
result proves the code key, digest, and size only. It deliberately reports
runtime-code state proof as verified while runtime-build attestation and
runtime-code identity remain unverified. The TypeScript payload boundary hashes
the exact target SCALE header, decodes its canonical compact height and state
root, and requires the reported hash, height, and state-root tuple to match
before preserving the proof-core result. The raw Wasm stays inside trie proof
nodes and is not duplicated in the result. A measurement using the current
compact source-locked runtime produced 5 membership-proof nodes, 1,831,782
aggregate proof bytes, and a 1,831,356-byte maximum node. The distinct V2 limits
are 512 nodes, 4 MiB per node and runtime artifact, and 8 MiB aggregate proof
bytes.

The generated cross-language vector covers membership and non-membership.
Native negatives reject V1/V2 schema crossing, absent `:code`, wrong
code digest or size, malformed attestation identity, branch drift, mixed state
roots, duplicate or unbounded proof material, and all inherited profile/record
identity mismatches. The read-only provider rejects target drift and requests
no separate storage value. The finalized read-only collector packages the
normalized statement, shared finality material, and exact proof nodes into the
V2 request while recording proof-node and byte counts. It keeps finality,
runtime-state, runtime-code, attestation, mint, mutation, and Gate 5 authority
false. This milestone adds no V2 execution policy, contained execution
authority, reviewed runtime-build attestation registry, or reconciliation
consumer.

The V2 producer-to-consumer closeout is:

| Producer | Exact output or field | Deciding consumer and required check | Failure if relaxed | Isolated negative coverage |
|---|---|---|---|---|
| V2 statement normalizer | Exact `:code` key, nonzero raw-Wasm SHA-256, canonical positive byte length, bounded attestation ID/digest, and inherited V1 branch | Read-proof provider uses only the branch and identities; native verifier reparses every field | Another runtime, deposit, profile, or record could be proved under a caller-shaped statement | Unknown/missing fields, V1/V2 crossing, key/hash/size/attestation drift, and inherited identity mismatches reject |
| Read-only Substrate provider | One target-bound proof with exactly `[code, record]` or `[code, profile, record]`; unique bounded nodes | Native V2 verifier performs one read-proof check under the finalized header state root | Independent observations or mixed roots could make code and peg-in state appear jointly authenticated | Ordered keys, one RPC, target drift, empty/duplicate/oversized nodes, and aggregate overflow are tested |
| Finalized V2 collector | Canonical finality envelope, normalized V2 statement, exact target-bound proof nodes, requested key order, node count, and proof byte count | Future contained V2 authority may execute only this request after separate policy and attestation activation | A storage-value observation, second proof, caller-shaped statement, or authority-bearing wrapper could be mistaken for one authenticated proof package | Both branches assert one proof call and no storage read; identity and code-key drift reject before RPC; every authority boundary remains false |
| Native V2 state verifier | Raw code SHA-256/size plus exact record membership or profile-relative non-membership from one proof | Finalized deployment wrapper binds the target header, authority set, ancestry, finality horizon, and trust root; the TypeScript boundary independently derives the exact header hash, height, and state root from the request bytes | An unfinalized state, absent runtime, wrong runtime, unrelated peg-in predicate, or caller-shaped target tuple could be accepted | Absent/empty code, digest/size drift, state-root mixing, target hash/height/root drift, branch absence/mismatch/malformed values, duplicate nodes, and V1 proof substitution reject |
| Runtime-build attestation reference | ID and digest only | Future activated attestation policy must authenticate exact bytes and bind them to the proved raw-Wasm digest before identity can become true | A caller could label arbitrary proved Wasm as a reviewed build | Current boundary requires attestation and runtime identity false; policy/registry negatives remain next-slice work |
| V2 native result | Code key/hash/size, proof counts, inherited decoded state, and explicit false authority fields | Payload validator may preserve proof-core evidence only; no reconciliation consumer exists yet | Proof-core success could release a hold or acquire mint authority prematurely | Every attestation, runtime-identity, historical-absence, vault, mint, mutation, and Gate 5 boundary is fixed false |

The next slice must define and independently review the runtime-build
attestation family, then add a separately signed V2 execution policy and
contained authority that can prove the expected digest came from an activated
attestation. Proving target `:code` does not establish historical absence across
runtime upgrades. Until the attestation, upgrade/cutover semantics, committed
vault transition, and mint identity are all joined and reviewed, every peg-in
hold remains and no Gate 5, trustless, deployment, or production-readiness
claim changes.

**WP-07A implemented authenticated DUP reconstruction baseline:** a bounded
reconstructor now derives the complete authenticated V2 replay history from the
chain-visible DUP singleton NFT lineage. It validates the canonical setup,
orders every successor through its spending transaction, replays each exact
lookup/insert ContextExtension proof from the rolling digest, binds every burn
ID and successor counter, checks each spending transaction against its observed
block header, and requires the current tip's indexed JSON, canonical UTXO
observation, and Sigma binary to agree under a stable indexed snapshot. Two
bounded source instances with distinct configured observation identities must
reproduce the complete observation before process-local provenance permits an
atomic cache replacement. Distinct origins detect disagreement; they do not
prove independent operation or globally canonical consensus. The authenticated
cache persists the configured DUP NFT, ErgoTree, and exact observed header
identity, is separate from legacy
`avl_tree_history`, survives database reopen, supports rollback to a shorter
canonical lineage, and invalidates active candidates bound to a different DUP
tip or digest. It does not reconstruct a candidate, JVM-check result, signature,
submission, confirmation, or broadcast authorization, and therefore cannot
authorize settlement or close Gate 5.

**WP-07A implemented settlement-vault reconstruction baseline:** a separate
bounded read adapter now reconstructs the complete indexed box history for the
configured authenticated settlement-vault address and cross-checks its current
unspent subset against the canonical UTXO endpoint. It treats vault state as a
forest, not a singleton: independent committed deposits and provisioning boxes
remain separate roots, partial settlements create one exact same-profile
successor, and exact settlements terminate one branch. Every historical spend
must bind one authenticated DUP transition and its exact transaction topology,
payout, miner fee, residual-value equation, and optional successor. Both node
origins must reproduce every normalized payload and locally derived canonical
Sigma binary; each current box must additionally match the node's UTXO binary
under the same exact Ergo header snapshot as the authenticated DUP history.

The complete forest, transition set, current UTXO membership, DUP observation
identity, and exact Ergo header are replaceable in SQLite atomically. A forest
change invalidates only active candidates whose selected vault is no longer
current; a forward snapshot with identical forest semantics refreshes metadata
without granting authority or causing gratuitous invalidation. Root creation
provenance remains explicit and unresolved by this address scan alone, and
distinct configured origins do not prove independent operation. The cache is
not candidate, proof, JVM-check, signing, submission, confirmation, or
broadcast provenance. Every later authorized action must still re-observe its
exact current vault and pass the normal proof, check, signing, and broadcast
gates.

**WP-07A implemented ordered database-loss and restart recovery:** one
non-authorizing orchestrator now reconstructs tracker, DUP, and vault from the
same two bounded read-only sources in strict dependency order. Tracker and DUP
must identify the same exact Ergo header; vault must bind that DUP observation,
tip box, indexed height, full height, and header. Only after all three
chain-derived observations pass does one outer immediate SQLite transaction
replace all caches. Nested replacements use savepoints, so a third-stage vault
failure rolls back tracker and DUP writes and their candidate invalidations.

The executable exercise deletes a temporary database that contains an active
candidate and aggregate attempt, rebuilds only the three chain-derived caches,
reopens the database, and proves that neither authority row returns. Separate
negatives reject source disagreement, cross-stage out-of-order snapshots, and
third-stage replacement failure before partial cache state can survive. A
shorter canonical view replaces tracker, DUP, and vault together. Existing
candidate and attempt rows may only be retained or invalidated; recovery cannot
create them and has no JVM-check, signer, submission, confirmation, or
broadcast capability. This remains local recovery behavior, not Gate 5
authority, trustlessness, or production readiness.

**WP-07A implemented submission/restart attack baseline:** the active aggregate
submission path now rechecks every source burn at the last boundary after
transaction preparation and before journal, signer, or submitter access. A burn
that becomes reverted or unknown during preparation cannot create a journal or
reach the signer. The submitter-returned transaction ID must equal the exact
operator/JVM-checked expected ID; mismatch, exception, or a null/ambiguous result
leaves the pre-submit journal `pending` with its durable transport reservation
and grants no submitted or confirmation status. Such a result is uncertain,
not a definite rejection: the reservation remains exclusive until chain
reconciliation finds the exact transaction or the explicit abandonment path
proves a two-source canonical-descendant absence window.

Restart recovery no longer treats a persisted `submitted` flag as transaction
authority. A persisted submitted ID must equal the checked expected ID, and
recovery then observes that exact transaction before restoring submitted
peg-out state. An absent transaction remains quarantined, a lost submit response
can be recovered from mempool, and the exact confirmed response ID must match
the journal. Confirmation still requires exact submitted-ID binding,
transaction-output checks, and a fresh source-burn verification. Batch burn
checks observe every claim before applying any reverted-burn mutation.

**WP-07A implemented stable Ergo finality and atomic recovery baseline:** new
aggregate attempts bind recovery policy V1, which requires at least ten
inclusive Ergo confirmations. Each observation binds the exact transaction ID
and canonical transaction bytes, inclusion height and header, tip height and
header, confirmation count, policy, and a canonical digest. The observer reads
one unchanged tip around repeated transaction or mempool reads and rejects
same-height header replacement, non-canonical inclusion, transaction drift,
and presence changes. Only process-provenance observation objects can reach the
state reducer. When a settlement carries tracker ingest, the confirmed tracker
successor R5 must equal the digest rebuilt inside the immediate reducer from
persisted history plus the exact entry; a conflicting persisted key or metadata
field aborts the whole reducer and rolls back every local effect.

The recovery reducer now performs one immediate SQLite transaction with an
exact journal lifecycle compare-and-set. Restoration, pre-finality rollback,
single or batch confirmation, DUP-history insertion, tracker-history insertion,
and peg-out status changes either commit together or roll back together. A
pre-finality disappearance and explicit abandonment require byte-identical
stable absence observations from two configured clients created together by
one opaque source-pair factory with distinct canonical node origins, distinct
pinned node identity digests, and distinct pinned administration identity
digests. Individually
branded sources and sources mixed across pairs cannot authorize destructive
recovery. Confirmation binds the lifecycle version read before remote
observation and burn revalidation; any concurrent lifecycle change rejects in
the reducer. Existing rows migrate as `legacy_unbound` and cannot acquire or
regain recovery authority automatically. The daemon and recovery CLI use
dedicated read-only direct clients and bind an explicitly configured witness
origin plus all four identity pins. These declared and reviewed pins prevent
URL aliases from satisfying the two-source policy; they do not cryptographically
prove independent operation or canonical consensus.

Explicit abandonment now records each matching two-source absence in an
append-only recovery-observation table before any burn reset or pending
transport-reservation retirement can occur. The first absence only records
local evidence and leaves the submitted attempt, pending reservation, and burn
statuses intact. A later absence can reach the destructive abandonment reducer
only when it is at least the versioned confirmation window after a previous
absence and both configured nodes still report the previous absence tip header
as canonical at its height. For an ambiguous pending transport, that second
observation atomically marks the journal abandoned and clears the reservation
without relabeling its unsubmitted burns. The terminal abandonment reason and
absence authority remain durable, so a retry after a crash or lost command
response returns `already_retired` without another RPC observation. If the
prior tip is no longer canonical, the abandonment path rejects before mutation.

The implemented WP-07A boundary has the following closeout map. Each negative
fixture changes only the named authority link before the local reducer runs.

| Invariant | Producer and exact binding | Consumer | Failure if relaxed | Isolated negative |
|---|---|---|---|---|
| Canonical settlement identity | sigma-rust parses node JSON, recomputes the transaction ID, and hashes canonical transaction bytes | stable Ergo observer, confirmation service, recovery journal | a response can retain the journal ID while changing outputs or transaction bytes | changed canonical transaction under the same claimed ID |
| Canonical inclusion and depth | direct node reads bind inclusion height/header, unchanged tip height/header, and policy V1 confirmation count | confirmation service and recovery reducer | a stale fork or shallow transaction can acquire final status | inclusion-header replacement, tip replacement, and nine-confirmation fixtures |
| Destructive source agreement | one opaque factory creates both process-bound sources from distinct clients, canonical origins, distinct pinned node identities, and distinct pinned administration identities under one versioned authority profile; the observer accepts only that exact pair | pre-finality rollback and operator abandonment | one endpoint or one administration can be relabelled through URL aliases as two-source agreement, or mixed with another authority set | reused client, duplicate origin, duplicate pinned node identity, duplicate administration identity, malformed pin, cross-pair mixing, and disagreeing-source fixtures |
| Abandonment absence history | the first matching v2-authority absence is append-only local evidence; destructive abandonment or pending transport-reservation retirement additionally requires a later matching absence whose tip is separated by the versioned confirmation window and whose nodes still see the earlier tip header as canonical; a durable terminal reason exposes a committed retirement after response loss | explicit operator abandonment and crash retry | a transient RPC absence or fork-local disappearance can reset burns, while a commit-before-response crash can permanently hide a safe retirement and block replacement | submitted and reserved-pending first-absence deferral, second descendant-window success, submitted and pending-transport restart replay without network access, unrelated-abandonment classification, unreserved-pending rejection, and stale-ancestor rejection fixtures |
| Confirmed deep-reorg quarantine | a previously confirmed local attempt remains confirmed but gains a structured quarantine only when two bounded Ergo observations agree that the submitted transaction is absent | confirmed-attempt reconciliation | a deep reorg can leave local finality authority silently trusted after the transaction disappeared | two-source confirmed-disappearance quarantine, primary-only deferral, stale lifecycle rejection, and no local rollback fixtures |
| Burn freshness at confirmation | the sidechain adapter rechecks every burn before and after the stable Ergo observation | single and batch atomic confirmation reducers | a burn reorg during the Ergo read window can still release local authority | confirmation-to-reorg fixtures for single and batch settlement |
| Journal lifecycle identity | the service captures lifecycle version before RPC work and the SQLite reducer binds it with mode, ordered burn set, submitted transaction ID, and status in one immediate transaction | recovery, confirmation, rollback, and abandonment mutations | stale or partial local work can mutate a different attempt after concurrent reconciliation | stale single and batch lifecycle, reordered set, subset, and partial-status fixtures |
| Confirmed replay monotonicity | the persisted final observation fixes transaction bytes and inclusion while allowing only a non-regressive canonical tip | confirmed-attempt replay | re-inclusion or changed transaction evidence can be accepted as idempotent replay | changed inclusion, transaction digest, and same-height tip fixtures |
| Same-transaction tracker ingest | inside the immediate reducer, the confirmed tracker successor R5 must equal the digest rebuilt from current local history plus the canonical entry, and SQLite accepts an existing key only when every stored field matches | initial confirmation, confirmed replay, and tracker cache | concurrent history drift or conflicting metadata can be committed beside DUP/final status | mismatched successor R5, concurrent history drift, single and batch metadata conflict rollback, changed replay value, and missing-ingest fixtures |
| Atomic local effects | one immediate SQLite transaction covers journal, peg-out status, DUP history, and optional tracker history | restart and retry paths | a crash or late failure can leave only part of settlement authority committed | forced later-write failure and multi-burn atomicity fixtures |
| Database-loss candidate recovery | the versioned unsigned package is digest-validated and rebound to a same-process prepared transaction and process-provenance native admission; persisted tracker tip identity and snapshot, DUP tip, vault set, replay state, and exact Ergo tip are rechecked under the same immediate SQLite write lock, while one opaque pair of distinct sidechain RPC origins must reproduce the exact stable burn view and the candidate's observed tip before persistence | empty-database recovery may atomically restore only the burn observation and an unchecked `prepared` candidate | package bytes, an advanced tracker with retained history, stale cache reads, one stale or disagreeing sidechain RPC, a deep-reorged burn, caller-supplied tip drift, or SQLite rows could recreate stale candidate or checker authority without current chain evidence | package-digest drift, missing report vault, post-report tracker and vault drift, competing-connection write, DUP replay, cloned provenance, source-pair and origin rejection, disagreeing views, deep-reorged block, candidate-tip mismatch, forced candidate-write rollback, restart, and idempotent replay fixtures |

This milestone now requires two durable absences separated by canonical
descendant blocks before explicit destructive abandonment and records
two-source disappearance of a locally confirmed settlement as a local quarantine
instead of silently trusting or rolling back that state. Database-loss recovery
now rebinds the exact unsigned package to the chain-derived cache snapshot and
restores only an unchecked `prepared` candidate. It does not restore a
checked journal, signer, submitter, confirmation, or broadcast authority. RPC
disagreement and deep-reorg replay now reject the database-loss package before
persistence. A concrete dual-node runtime exercise and the later authority
boundaries remain open and prevent WP-07 completion.

**WP-07A historical submission checkpoint (superseded by P1-LR2):**
WP-07A previously separated signing, transaction-bound authorization,
submission, reservation, and finalization for the legacy aggregate route. That
checkpoint established useful lifecycle and crash-recovery invariants, but it
still retained an executable fee-from-backing payout capability.

P1-LR2 removes that capability instead of treating guarded execution as an
acceptable steady state. The programmatic execution module, aggregate-service
admission/revalidation/reservation/finalization APIs, daemon approval and
submission composition, CLI submit commands, batch fallback, and direct
transport entrypoints are absent. New burns are durably observed and then held
unless the authenticated candidate-only path can prepare a non-signing
candidate.

The V1 approval and non-broadcast check formats remain available only for
historical evidence validation. Exact confirmation, recovery, abandonment, and
deep-reorg reconciliation remain for attempts that already existed before
retirement; SQLite rows and old approval files cannot recreate signing,
authorization, submission, broadcast, or funds authority.

This is source-local capability retirement, not on-chain route retirement. The
legacy contracts and historical UTXOs remain part of the cutover inventory, and
deployment lineage, source consensus/finality, target activation, global replay
migration, Gate 5, trustless status, and readiness remain open.
**WP-07A implemented authenticated checked-candidate attack boundary:** the
check-only path now persists exact unsigned-package, signed-transaction,
JVM-response, revalidation, finality-proof, stable-Ergo-view,
stable-sidechain-view, and check-admission digests. It creates `check_passed`
only from a process-provenance admission derived after a post-check Ergo
observation re-reads one unchanged tip, the exact anchor, and byte-equivalent
tracker, DUP, and vault boxes, followed by a sidechain observation that re-reads
one unchanged tip height and hash, receipt, canonical execution block,
confirmation depth, burn coordinates, amount, and recipient. Same-height tip
replacement rejects. The resulting scalar execution authorization rebinds the
journaled admission and view digests, requires fresh process provenance from
every stage, and carries no prepared transaction or external capability.

Restart cannot recreate that provenance from SQLite. Package drift, signed
payload drift, JVM-response drift, changed payout semantics, cloned provenance,
missing or changed Ergo inputs, moving tips, stale anchors, and sidechain burn
reversion all reject before any later capability could be reached. The daemon
also deletes its process-local revalidation whenever burn status is unknown,
Ergo reconciliation fails, profile prerequisites disappear, or revalidation
throws. Its authenticated service is a frozen runtime facade exposing only
unsigned preparation; the full settlement service is not stored in that field.
No authenticated signer, submitter, or broadcast route was added, and this
check-only boundary is not Gate 5 closure.

**WP-07A implemented authenticated package recovery after database loss:** the
recovery API accepts the versioned WP-06T10 unsigned package only with its
explicit expected digest, revalidates and binds its exact EIP-12 transaction to
a same-process prepared transaction, and derives the candidate again from a
process-provenance native checkpoint admission. A process-provenance cache
recovery report binds the exact recovered Ergo tip, tracker input, DUP input,
and current vault set. The tracker reconstruction persists its current tip box,
tip digest, observation digest, and Ergo snapshot independently from retained
history. One immediate SQLite transaction rechecks those identities against the
reconstructed caches, rejects an advanced tracker even when the old entry
remains in history, rejects an already consumed burn, blocks concurrent cache
replacement, and atomically
persists the burn observation and candidate. Identical replay is idempotent and
survives restart; any later write failure rolls back the burn observation.

The package explicitly remains non-authorizing because its digest does not
authenticate its sources. Recovery therefore performs a new sidechain read
inside the recovery boundary: one opaque process-bound pair created from
distinct canonical RPC origins must return byte-identical stable burn views,
including the execution block, burn identity, amount, recipient, confirmation
depth, and exact tip height/hash. The observed tip must equal the tip committed
into the reconstructed candidate. RPC disagreement, a missing or replaced burn
block, same-height tip replacement, and caller-supplied tip drift reject before
SQLite mutation.

This matching view detects disagreement at one recovery point; it does not prove
independent operation, globally canonical consensus, sidechain finality on Ergo,
or continued freshness after the read. Recovery restores only `prepared`; it
never restores `check_passed`, JVM response, signer, submitter, confirmation, or
broadcast authority. The execution boundary now atomically reserves the
candidate and associated peg-out through one compare-and-set lifecycle
transition; competing legacy submission, burn reversion, invalidation, or
lifecycle change rejects or revokes that reservation. A future submit path
must additionally bind an explicit checker identity/context, consume only a
fresh branded admission plus the exact active reservation, and rerun both-chain
validity immediately before separated signer, submitter, and
broadcast-authorization capabilities. Test-only checker and injected-view
constructors must remain isolated from production authority branding, while
production admissions bind the exact checker and source-adapter identities.
One non-null transaction lookup is not Ergo finality and one matching absence
snapshot is not an authority fact.

**WP-07A implemented identity-bound execution reservation:** the check-only
command now converts the fresh process-provenance execution authorization into
a separately branded reservation admission. One immediate SQLite transaction
rechecks the exact `check_passed` candidate and live `detected` or `confirmed`
peg-out, then reserves the candidate, complete candidate-authority digest, burn
ID, burn transaction, raw amount, canonical recipient, DUP input, vault input,
expected transaction ID, unsigned transaction and package, signed transaction,
JVM response, revalidation, stable Ergo and sidechain views, finality proof,
check admission, and authorization digest. Exact replay is idempotent. Active
legacy aggregate attempts and authenticated reservations reject overlapping
burns or transaction IDs in both directions.

The durable row is only a non-authorizing lock. Restart can read it but cannot
recreate its process provenance. Candidate invalidation, candidate binding
drift, unsafe peg-out lifecycle or coordinate drift, deletion, and burn
reversion revoke it through database triggers installed after legacy schema
migrations. The safe `detected` to `confirmed` transition retains the lock.
The reservation module has no checker, signer, submitter, transport, or
broadcast capability, and the command still ends after `/transactions/check`.
This closes a local execution race only; it does not activate an Ergo-verifiable
finality consumer, create a payout route, close Gate 5, or support a trustless
or production-readiness claim.

**WP-07A implemented signer/checker identity binding:** the active authenticated
check path now derives one versioned signer-context digest from the exact public
key, matching P2PK ErgoTree, network prefix, and ten-header signing-context tip.
A separate versioned checker-identity digest binds the static Ergo-node source
adapter, canonical node origin, `/transactions/check` endpoint, HTTP method, and
no-redirect/no-proxy transport policy. Both digests enter the check admission,
candidate authority digest, execution authorization, and version-2 durable
reservation. A valid alternate signer or checker cannot be mixed with an
already journaled check; malformed profiles, inconsistent signer identities,
and non-canonical checker origins reject before admission. Migration invalidates
old `check_passed` candidates and revokes active version-1 reservations rather
than inventing the missing identity authority. Restart still cannot recreate
process provenance, and no submitter or broadcast capability was added.

Legacy aggregate prebroadcast evidence now uses schema version 2 and records
the exact checker profile, source-adapter profile, canonical node origin,
`/transactions/check` path, `POST` method, and no-redirect/no-proxy transport
policy. A validated-file approval may mint submission provenance only when that
identity is complete and its canonical origin equals the approval file's
`ergoNodeUrl`. Schema-version-1 evidence and evidence with missing, altered, or
cross-node checker identity remain historical check artifacts only and must be
regenerated before they can support a submission approval. This proves which
bounded node accepted the transaction shape; it does not prove Ergo consensus,
source finality, or settlement eligibility by itself.

WP-07A signer/checker closeout matrix:

| Invariant | Producer / enforcement | Journaled state | Downstream consumers | Failure if relaxed | Positive and isolated negative evidence | Authority / status |
|---|---|---|---|---|---|---|
| Signer profile is the exact versioned local-WASM check profile | `signTransactionForCheck()` / signer-context normalization | Signer-context digest | Check admission, candidate authority, execution authorization, reservation | An unrelated signer implementation could inherit prior check authority | Valid check identity; unsupported-profile mutation | Process-bound check evidence only |
| Public key is exactly 33 bytes and matches the 36-byte P2PK ErgoTree | Signer key derivation / signer-context normalization | Signer-context digest | Same downstream chain | A signature identity could be journaled against a different payout proposition | Valid key/tree pair; malformed key, malformed tree, and mismatched pair mutations | Process-bound check evidence only |
| Network prefix is one unsigned byte | Signer key derivation / signer-context normalization | Signer-context digest | Same downstream chain | Network identity could drift without changing the checked transaction digest | Valid prefix; out-of-range prefix mutation | Process-bound check evidence only |
| Signing-context tip height and ID are exact and well formed | Exact ten-header state-context construction / signer-context normalization | Signer-context digest | Same downstream chain | A later reservation could lose which Ergo context signed the transaction | Valid positive tip; non-positive height and malformed ID mutations | Context identity, not canonical-chain proof |
| Checker profile, source adapter, path, method, and transport policy match the static check-only route | `checkSignedTransaction()` / checker-identity normalization | Checker-identity digest | Same downstream chain | A different endpoint or transport could be substituted behind a prior acceptance | Valid check-only tuple; one isolated mutation for every tuple field | Node response evidence, not settlement authority |
| Canonical checker origin is both journaled and used for header and check transport | Origin normalization before network access; direct helpers receive that origin | Checker-identity digest | Context collection, `/transactions/check`, every later admission | The recorded endpoint could differ from the endpoint Axios actually contacted | Trailing-slash normalization plus exact GET/POST URL assertions; non-canonical-origin rejection | Node response evidence, not consensus proof |
| Missing legacy signer/checker bindings never gain authority | Schema migration plus exact digest comparisons | Nullable historical columns; version-2 active reservation columns | Restart, recovery, reservation matching | Old rows could be upgraded by invented identity rather than fresh evidence | Legacy `check_passed` invalidation, version-1 reservation revocation, restart non-authority | Fail-closed migration |

WP-08A-T8C1 check-to-reservation closeout matrix:

| Invariant | Producer / enforcement | State fields | Downstream consumers | Failure if relaxed | Positive and isolated negative evidence | Authority / status |
|---|---|---|---|---|---|---|
| Native-ERG payout identity is exact | Compatibility facade derives the versioned payout digest from candidate, burn coordinates, source chain, asset profile, amount, recipient and vault | Payout digest plus tracker and DUP identities carried by every core stage | Revalidation, authorization, reservation and later confirmation | A valid proof/check chain could be reused for another amount, recipient, asset lane, event or vault | Real V2 composition positive; candidate/burn/chain/vault/amount/recipient digest mutations, source-coordinate mismatches and Ergo-Long bounds | Binding evidence only; no payout authority |
| Package and revalidation identities cannot be mixed | Package provenance plus a versioned digest over candidate, expected transaction, unsigned transaction, revalidation, package, readiness, companion and EIP-12 digests | Package-binding digest and exact object parents | Signer, checker and every later admission | A reviewed package or check could decorate another freshly rebuilt transaction | Real package positive; isolated mutation of every digest field and exact-parent substitutions | Process-bound binding only |
| Signing and checking consume one opaque handle and node origin | Separate signer/checker capabilities, private signed-material registry, process provenance and signed-byte digest | Opaque handle plus signed transaction and signer/checker context digests; no signed bytes in the handoff | JVM acceptance, check admission, authorization and reservation | A caller could extract or mutate bearer bytes, or reuse the same ID with changed proof bytes, another signer context or another checker origin | Exact opaque-handle positive; serialized handle/handoff contain no signed bytes; injected bearer field, cloned provenance, changed digest, origin drift and signing failure reject; legacy combined acceptance cannot enter check admission | Check-only node evidence |
| Both stable observations precede journal authority | Relayer core order plus separate stable Ergo and sidechain observation ports | Stable-view digests enter the check admission before `check_passed` | Check journal, execution authorization and reservation | A candidate could become check-passed while one chain view is missing, stale or divergent | Application-order positive; observation failure proves no check journal or reservation mutation | Local admission only |
| Durable execution reservation is the terminal capability of T8C1 | Static application dependency type and eleven single-operation adapters | Exact reservation row and non-authorizing branded handoff | T8C2 immediate revalidation only | A check-only command could reach a submitter, transport or confirmation route | Minimal frozen-adapter matrix, static closure scan and handoff boundary assertions | Non-authorizing lock; no transport |
| A transport attempt must be durable before network access | T8C2A transport admission plus `StateTracker` reservation requires transport-reservation and durable-attempt digests before the T8C2B fixed callback | Current immutable durable attempt identity | Submission finalization and restart-reconciliation adapters | A crash after node acceptance could cause an untracked retry and duplicate transport | Core crash-after-transport matrix plus concrete reserve/restart/duplicate matrices reconcile without a second submit; async freshness rejection proves no callback | Inactive composition complete; no concrete node transport |
| Stale or reorged confirmation cannot become an in-memory-only terminal state | T8C2A observation reducer plus T8C2B bounded observation/restart composition atomically writes or retains terminal `quarantined` state | Current durable observation and quarantine row | Restart, operator recovery and any later value-state reducer | A stale/reorg observation could disappear on restart while local code reports fail-closed | Higher-, equal- and lower-tip re-inclusion, disappearance, reservation revocation, concurrent quarantine and restart matrices require terminal quarantine | Inactive observer composition complete |

WP-08A-T8C2A durable submission-journal closeout matrix:

| Invariant | Producer / enforcement | State fields | Downstream consumers | Failure if relaxed | Positive and isolated negative evidence | Authority / status |
|---|---|---|---|---|---|---|
| Raw transport fields cannot create a durable attempt | The core brands one exact transport-reservation request only after immediate revalidation and explicit broadcast authorization; the profile adapter revalidates current candidate, reservation and peg-out authority before branding an admission | Candidate, reservation, transaction/package/payout, tracker, DUP, signed, revalidation and broadcast-authorization digests | Durable attempt journal only | A caller or stale worker could self-issue submission authority from copied scalars | Real core brand positive; raw request, cloned brand, changed reservation and changed current authority reject | Process-local admission only; no adapter or route |
| The durable linearization point precedes any future transport | `StateTracker.reserveAuthenticatedSettlementTransportAttempt` persists one immutable attempt and rejects every competing candidate, burn, DUP, vault, reservation or expected transaction | Versioned reservation and durable-attempt identities plus `submission_attempted = 1`; no signed bytes | Future fixed submitter and restart reconciliation | A crash after transport could permit an untracked second submit | Reserve/restart positive, duplicate reserve, crash-order core matrix and every durable-field mutation | Non-authorizing journal; transport remains absent |
| Restart cannot recover from local identity alone | Mapper rederives both durable identities; recovery rechecks the current active reservation, checked candidate, unsettled peg-out, payout and complete check-authority chain | Exact persisted attempt joined by revalidated current authority | Future observation/reconciliation adapter only | SQLite mutation or stale authority could revive a superseded payout | Individual immutable-field mutation, coordinated identity recomputation with missing reservation, candidate/peg-out drift and payout mismatch reject | Reconciliation input only; never resubmission authority |
| Confirmation contradiction is terminal and durable | Matching bounded Ergo observations update the same attempt transaction; confirmed disappearance, changed inclusion and reservation revocation atomically quarantine before monotonic-tip rejection | Observation/finality policy, transaction and inclusion identity, source count/consensus digest, quarantine reason | Restart, explicit operator recovery and later reducers | A reorg could leave a locally confirmed row or a later observation could revive it | Higher-, equal- and lower-tip re-inclusion, same-height disappearance, revocation and attempted post-quarantine revival reject or quarantine | Fail-closed local terminal state |
| `confirmed` cannot be synthesized without observation authority | SQLite checks and row mapping require one `confirmed_final` observation, complete inclusion fields, at least two bounded sources, consensus digest and `confirmed_at` | Complete final observation and accepted expected transaction identity | Read-only confirmation/reconciliation consumers | Coordinated DB edits could skip observation authority and disappear from restart work | SQL constraint, ignored-constraint mapper bypass and incomplete-source mutation reject | Local confirmation evidence only; not Gate 5 or funds authority |

Authority integration and package completion remain blocked until WP-06
supplies the live Gate 5 authority path.

Package completion requires an independent architecture/code review packet with
all critical/high findings either fixed or explicitly blocking the next package.

**Definition of Done:** reconstruction from chain-visible state succeeds from an
empty local database; failed submit, restart, Ergo reorg, sidechain reorg, stale
singleton, duplicate burn, RPC disagreement, and database loss leave no phantom
mint, payout, tracker, or DUP state; circuit breakers remain fail-closed.

## WP-08A - Reusable Layer Extraction

**Security invariant:** reusable packaging preserves the complete settlement
authority chain. Moving files must not turn observations, proof-adapter results,
local state, JVM acceptance, signatures, or transport results into funds
authority.

**Deliverable:** implement the logical `ergo-settlement-core`, `relayer-core`,
`adapters`, concrete source-profile, and composition-root boundaries specified
in the
[layered reference architecture](../docs/layered-reference-architecture.md)
before the first public release of bridge source code or public repository
publication, including any public branch, tag, source snapshot, release archive,
or public-audit package. This is semantic extraction, not a source-tree
rearrangement exercise.

**Definition of Done:**

- automated import rules enforce the allowed acyclic dependency graph;
- separation is semantic and capability-based, not only file movement;
- the current Substrate/GRANDPA V1 profile is implemented outside the
  source-neutral core as a concrete statically selected profile module while
  its bytes, domains, IDs, digests, candidate identities, vectors, ErgoTrees,
  and behavior remain unchanged;
- unknown statement, proof, settlement-profile, and asset-profile identifiers
  are rejected fail-closed;
- the Frontier/GRANDPA path preserves its complete positive and negative
  conformance matrices;
- fixture adapters are absent from publishable runtime registries and artifacts,
  or are confined to an explicit test-only domain that runtime registries reject;
- network-free orchestration replays the recorded WP-07 behavior baseline
  through the extracted public ports;
- restart, rollback, RPC disagreement, out-of-order observation, and complete
  database loss replay the same matrix through those ports without changing
  security-relevant outcomes;
- JVM checker, signer, submitter, and broadcast authorization are separate
  capabilities with no bypass route;
- a documented command validates the result from a clean recursive checkout;
- an independent architecture and security review is complete before any
  completion claim.

**Current result:** WP-08A-T1 creates
`relayer/src/ergo-settlement-core` and moves the existing network-free,
source-neutral Sigma/Ergo serialization helpers, extension membership verifier,
and deterministic change/fee conservation planner behind that boundary. The old module paths
remain compatibility re-exports, so current Frontier/GRANDPA consumers keep
their exact behavior. The profile-bound empty DUP digest, current miner-fee
constants, and proveDlog key validation deliberately remain outside the
source-neutral core.

`npm run architecture:check` parses runtime imports with the TypeScript AST,
enforces the allowed one-way dependencies for every physically extracted
layer, rejects imports from a new layer back into unclassified legacy modules,
restricts settlement-core, relayer-core and concrete-profile external
dependencies, rejects direct and statically recognized indirect access to
their unbound environment, network, crypto, dynamic-code and runtime-loader
capabilities, and detects cycles among layered runtime modules. The initial
relayer-core external-dependency allowlist is empty. `npm run check` invokes
this rule automatically.

WP-08A-T2 additionally creates
`relayer/src/profiles/substrate-grandpa-v1` for the current pure burn,
checkpoint, finality-statement/proof and proof-identity commitment family.
Legacy entry points re-export the same runtime bindings, and the frozen vectors
retain their exact bytes, domains, IDs and digests. Collection, native
execution, RPC, persistence and all funds capabilities remain outside the
profile. The reserved STARK proof-system ID remains rejected.

WP-08A-T3 creates the first physical `relayer-core` lifecycle. Aggregate
settlement recovery now depends only on a typed observation port and an exact
journal/CAS port. The direct port matrix covers restart ordering, complete
recoverable reads before mutation, source disagreement, legacy policy, stale
and ordered-burn CAS, pre-finality rollback, confirmed reorg quarantine,
already-quarantined replay, and empty-journal behavior after database loss. An
empty journal does not reconstruct or authorize a candidate.

WP-08A-T4 moves the exact stable/matching Ergo observation, finality-record and
endpoint-alignment implementations under `relayer/src/adapters`, retaining
runtime-identical re-exports at their prior paths. A recovery-specific adapter
binds the primary client and optional witness pair; a separate static journal
adapter exposes only the four recovery operations and rejects impossible list
statuses. `relayer/src/apps/bridge-daemon/aggregate-settlement-recovery.ts`
assembles those adapters with the T3 core. The compatibility entry point,
daemon and CLI call sites, result shape and recovery policy remain unchanged.
The capability-denial matrix scans the complete runtime closure and excludes
checker, signer, approval, submitter, transport and broadcast routes.

WP-08A-T5 moves the complete current authenticated unsigned-candidate vertical
under `relayer/src/profiles/substrate-grandpa-v1`: tracker history/value
semantics, single-key DUP reconstruction, fixed anchor-depth policy,
burn/root/payout/replay planning, exact tracker/contract/register checks, ERG
conservation and deterministic unsigned transaction construction. Source-
neutral box and unsigned-transaction types move to `ergo-settlement-core`.
Legacy tracker, AVL, policy, limit, builder and transaction paths retain their
runtime bindings.

`aggregate-settlement-service.ts` retains box observation, EIP-12
materialization, ContextExtension reporting and the process-local provenance
brand. Profile and offline results remain unbranded and cannot satisfy live
candidate, JVM-check, journal or broadcast admissions. Exact file-and-symbol-
scoped allowlists constrain the profile to the reviewed AVL operations and
secp256k1 public-key validation binding. The frozen proof, transaction-shape, replay,
anchor-depth and provenance matrices remain unchanged.

WP-08A-T6 moves the current V1 peg-in commitment planner, exact committed-vault
bindings, EVM replay identity, native runtime-record codec and
sidechain-domain-separated native replay identity into the concrete profile.
The commitment and runtime-state legacy paths are exact re-export shims. Raw
RPC/SDK normalization remains in `peg-in-transition.ts`, where contradictory
aliases reject before the profile sees canonical typed fields. Canonical-chain
membership, confirmation depth, refundable-source absence, current vault UTXO,
persistence, EVM execution and submission remain outside the profile. The
profile binding alone cannot authorize mint.

WP-08A-T7 adds one static off-wire asset-profile selector to the concrete
Substrate/GRANDPA V1 profile. Its only registered identity binds burn-leaf
version `1`, domain `E2S_TRUSTLESS_BURN_LEAF_V1`, the all-zero native-ERG
asset ID and positive Ergo-Long nanoERG amounts. It distinguishes burn-leaf
u64 big-endian, peg-in-runtime u64 little-endian and committed-vault
box-value/R6 encodings.
Peg-in commitment and vault evaluation reject unknown profile identifiers
before funds checks; Frontier root production, native checkpoint admission and
authenticated settlement consume the same exact profile. The codec continues
to encode nonzero asset bytes for isolated negative fixtures, but
verified-PegOut proof production and current settlement selectors cannot select
them as a token lane. Candidate binding, unsigned-package validation,
contract-acceptance mirroring and committed-vault mint eligibility consume the
same profile descriptor. No leaf, root, checkpoint, candidate, package,
contract or runtime byte changes.

WP-08A-T8A extracts authenticated candidate restart reconciliation into a
second network-free `relayer-core` lifecycle. Exact adapters expose only active
candidate/peg-out journal operations, burn status, the anchor header and
tracker/DUP/vault presence, and proof recollection. A static
`apps/bridge-daemon` root assembles them; the daemon retains concrete native
proof recollection and profile prerequisites. Unknown/reverted burns, source
outage, replaced anchors and missing inputs discard process-local revalidation
and either defer or invalidate through the existing exact journal transition.
An empty journal performs no external observation and creates no candidate.
The complete new layered closure has no checker, signer, approval, submitter,
transport or broadcast route.

WP-08A-T8B extracts authenticated V2 prepared-candidate package recovery into a
third network-free `relayer-core` lifecycle. Exact reconstruction,
source-observation, recovery-binding and journal ports are assembled by a
statically imported `apps/bridge-daemon` composition module invoked by the
Substrate/GRANDPA V1 compatibility facade. That facade retains concrete package
validation, native candidate provenance, dual Frontier RPC collection and
SHA-256 cache binding, while the exact adapter owns the recovery-admission
SHA-256 binding. The core rejects source-tip and exact candidate/burn/payout
binding drift before journal access and accepts only a process-branded admission
whose persisted result is exactly `prepared` with every checker/finality
authority field null. `StateTracker` independently reasserts the core admission,
cache, native-candidate and matching-source provenance, recomputes the canonical
admission digest, and retains its immediate current-cache rechecks and atomic
peg-out/candidate write with no authority-bearing fields. Cache replacement is
a separate atomic operation; no cross-operation transaction is claimed. The
remaining out-of-order check-to-execution replay is assigned to T8C rather than
hidden under this completed package-recovery slice.

WP-08A-T8C1 extracts the authenticated check-to-reservation sequence into a
fourth network-free `relayer-core` lifecycle. Eleven frozen single-operation
adapters and one static `apps/bridge-daemon` root order exact revalidation,
unsigned-package binding, local signing, JVM checking, stable Ergo and
sidechain observations, check admission and journal mutation, execution
authorization, and durable execution reservation. The current
Substrate/GRANDPA V1 compatibility facade derives an exact native-ERG payout
binding and package-binding digest, retains the existing process-provenant
objects, and rejects substitutions before the next mutation. The explicit
non-mainnet check command now consumes this composition root.

The signer and checker are separate capabilities. Signed transaction bytes are
deep-snapshotted behind a private process-local material registry. The signer
returns only an opaque handle and public identity digests; the checker accepts
only that handle and the canonical node origin, while the reserved handoff and
compatibility result expose no bearer transaction. The legacy combined check
helper remains available for compatibility diagnostics, but its acceptance is
rejected by execution check admission and must stay outside T8C2 composition.
The resulting handoff contains no submitter, transport reservation, broadcast
authorization, confirmation or funds authority. The pure core also
defines and tests the intended later continuation: immediate revalidation,
explicit broadcast authorization, a durable attempt identity committed before
transport, exact submission finalization, confirmation quarantine, and restart
reconciliation without a second submit after an uncertain process stop. Those
ports had no concrete adapter or active runtime route at the T8C1 boundary.
T8C2A below implements their durable journal boundary while leaving concrete
transport and observation composition as T8C2 work.

WP-08A-T8C2A implements the durable half of that continuation without
activating transport. The core now issues a non-forgeable transport-reservation
request only after immediate revalidation and explicit broadcast authorization.
The concrete Substrate/GRANDPA V1 admission recomputes the native-ERG payout
binding and rechecks the current checked candidate, active execution
reservation and unsettled peg-out before one immutable attempt is journaled.
The journal stores digests and lifecycle state but never signed transaction
bytes.

Restart rederives both attempt identities and current settlement authority
before exposing pending reconciliation work. Accepted, rejected and ambiguous
results finalize distinctly. Matching bounded Ergo observations can advance the
exact expected transaction; confirmed disappearance, changed inclusion or
reservation revocation becomes terminal quarantine, including equal-height and
lower-tip contradictions. SQLite and mapper invariants reject a synthesized
`confirmed` row without a complete `confirmed_final` observation and its
multi-source consensus binding. The exact payout digest implementation now
lives under the concrete profile and uses a source-neutral canonical
JSON/SHA-256 helper in `ergo-settlement-core`; the old helper path is a
behavior-preserving re-export and the pinned digest is unchanged.

WP-08A-T8C2B adds nine frozen single-operation adapters and a non-default
`apps/bridge-daemon` composition root for immediate revalidation, broadcast
authorization, durable transport reservation, fixed submission, exact
finalization, confirmation observation/journaling and restart
observation/journaling. The concrete compatibility facade accepts only a
frozen, process-registered dependency root and a process-branded fixed
submitter. The submitter snapshots its exact transport callback, binds one
opaque authorization to that submitter and consumes it once. The approval
freshness callback receives the authorization digest, not the bearer
authorization object.

The execution order is durable journal, awaited approval-freshness check,
immediate current-authority recheck and only then the fixed callback. Accepted,
rejected, explicit ambiguous and thrown transport outcomes retain distinct
durable states; a returned transaction ID outside the exact authorization is
rejected. Confirmation uses the existing matching bounded Ergo source pair.
Restart remains observation-only, includes `pending`, `submitted` and
`confirmed` attempts, isolates each attempt failure, never receives a
submitter, and converts stale, reorged or concurrently quarantined attempts to
structured `fail_closed`. The complete production-source and npm-script scan
allows the generic application root only through this compatibility facade.

The facade remains inactive. No existing CLI, daemon or npm route imports it,
no concrete node transport is registered, and the opaque signed handle exposes
no signed transaction or proof bytes. No signing, submission, broadcast,
Gate 5, trustless, readiness or publication authority follows.

WP-08A-T8C2B late-stage composition closeout matrix:

| Invariant | Producer / enforcement | State fields | Downstream consumers | Failure if relaxed | Positive and isolated negative evidence | Authority / status |
|---|---|---|---|---|---|---|
| Only the controlled facade may consume the generic late-stage application root | Statically imported adapter/application modules plus complete runtime-source and npm-route scan | Exact imported module and exported capability names | Any future runtime activation | Another runtime module could inject arbitrary late-stage callbacks around a live handoff | Compatibility-only consumer positive; every other production consumer and npm route absent | Inactive architecture boundary |
| A fixed submitter cannot be cloned, retargeted or reused | Process branding, frozen root, snapshotted callback, submitter-specific authorization binding and one-shot consumption | Submitter profile, exact authorization object and all bound digests | Fixed transport callback | Mutable or copied capabilities could inherit an approval or change endpoint behavior after review | Exact registered positive; cloned root, cloned submitter, callback replacement and authorization replay reject | Process provenance only; no network transport |
| Durable state precedes every possible transport call | Core ordering plus compatibility facade | Transport reservation and durable-attempt digests | Approval freshness, current authority and fixed submitter | A crash after node acceptance could leave no durable attempt and permit duplicate submission | Exact order positive; async approval rejection and immediate revalidation failure prove no transport | Durable local linearization point |
| Submission outcomes remain exact and non-conflated | Fixed outcome normalizer plus submission journal | Disposition, submitted transaction ID, response digest and terminal timestamp | Confirmation or restart reconciliation | A wrong transaction, certain rejection or unknown response could be reported as accepted | Accepted, rejected, explicit ambiguous, null and thrown transport cases; wrong returned transaction ID rejects | Local submission evidence only |
| Post-confirmation contradictions remain observable and terminal | Observable-attempt query, matching bounded Ergo observations and atomic quarantine journal | Prior/current inclusion, tip, source consensus and quarantine reason | Restart monitor and later operator recovery | A previously confirmed transaction could disappear or move while local state remains confirmed | Confirmed monitoring, disappearance, re-inclusion, reservation revocation and concurrent-quarantine races | Structured fail-closed local state |
| Restart never resubmits and one failure does not block later attempts | Restart-only application root and per-attempt reconciliation boundary | Durable attempt identity and observation result | Restart worker | One uncertain attempt could be resubmitted or prevent later attempts from being reconciled | Crash-record observation positive; no submit capability; first-attempt failure followed by later success | Observation/reconciliation only |

An independent read-only architecture/code review found and closed the async
freshness, fixed-submitter, post-confirmation monitoring, direct application
root, concurrent-quarantine and journal-evidence gaps. Its final pass reported
no remaining critical, high or medium finding in this slice.

WP-08A closeout C1 adds one static off-wire source-profile registry for the
current Substrate/Frontier + GRANDPA + native-ERG settlement family. The
check-to-reservation compatibility root now requires the exact registered
source, statement, proof-system, settlement, and asset profile identifiers
before it derives lifecycle input or invokes any journal, observation, signer,
checker, or reservation capability. Unknown identifiers and the reserved STARK
proof-system ID reject fail-closed. The selection object does not enter or
reinterpret any V1 statement, proof, checkpoint, candidate, leaf, transaction,
ErgoTree, domain, digest, or golden vector.

The two WP-06 fixture-backed source modules now live under the explicit
`relayer/src/test-fixtures` domain. A complete static dependency-graph scan
permits only the exact closed set of reviewed WP-06 evidence planners and spike
runners to reach them, including indirect imports. It rejects transitive
reachability from the daemon, operational entrypoints, application roots,
adapters, profiles, or either core. They remain test evidence, not a dynamic
profile, runtime registry, or funds-authorizing adapter.

One cross-boundary behavioral matrix now drives the public application and
compatibility roots with deterministic in-memory port implementations. It
replays aggregate pre-finality rollback and confirmed-reorg quarantine,
candidate burn reversion/source outage/stale-input invalidation, out-of-order
package recovery before its first journal write, and late-stage restart source
disagreement without transport or restored submission authority. The matrix
tests orchestration through ports; it does not impersonate concrete RPC or
SQLite integration already covered by their narrower adapter suites.

WP-08A closeout C2 removed the daemon's three then-active imports of the generic
coupled `signAndSubmit` helper. At that checkpoint, committed-vault, SCS-update,
and DUP-heartbeat transactions each entered a fixed operation facade composing
separate
signer, checker, immediate revalidator, broadcast authorizer, durable journal,
fixed submitter, and finalizer ports through one network-free `relayer-core`
lifecycle. The unsigned transaction ID and complete operation binding are
derived before transport; signed material and one-shot authorization stay
process-local, while SQLite retains only exact identity and evidence digests.
Restart reconciliation has no signer, authorization, submitter, or transport
capability.

The later local-capability retirement removes the now-unconsumed generic
sign-and-submit wrappers entirely, removes generic submission from
`ErgoClient`, and physically removes the unexposed historical
`trigger-peg-in.ts` deposit broadcaster plus its ignored build outputs. It then
removes the final fixed committed-vault submission facade from daemon
composition and removes the coordinator's injectable submission entrypoint.
Sign-only/check-only signer capabilities remain for check and bounded devnet
contexts, but a newly observed deposit cannot cause signer loading, fee
selection, durable reservation, or transport. Pure commitment construction and
historical observation/reconciliation remain. This prevents
the relayer source tree from originating a new historical V3 deposit or
consuming a refundable deposit into an unmintable vault; it does not retire a
deployed `MainChainLock`, repair its overlapping commit/refund predicates,
reverse an already-submitted transition, or authenticate V4 mint authority.

At C2, the SCS route bound both the configured finalized native height and its
exact block hash before durable reservation and transport. The current
route-retirement slice removes that builder, signer use and submit facade. The
same bounded RPC view is now read only: it updates operator-health observations
but cannot create a transaction or authorize funds. This configured observation
does not prove independent source operation, GRANDPA semantics on Ergo,
deterministic sidechain finality, or Gate 5.

At that checkpoint, new SCS and DUP submissions entered the local operational
projection only after the explicit ten-confirmation Ergo policy and an exact
inclusion height/header identity. WP-08E superseded the active DUP portion, and
the current route-retirement slice supersedes the active SCS portion. Historical
SCS and DUP attempts retain observation and fail-closed reconciliation without
any capability to create a new submission. Startup and detected-reorg reconciliation retain
the exact historical identity, keep a missing transaction response
non-destructive while the same header remains selected by the configured node,
and reopen rather than terminally quarantine a transaction whose recorded block
was replaced while exact transaction visibility is unavailable. A transaction
re-included in another canonical block must re-establish the full policy depth:
below ten confirmations its journal is reopened and its DUP mirror key is
removed atomically; at accepted depth the exact new height/header identity is
rebound without discarding the same transaction's DUP effect. Confirmed rows
require complete height/header identity in the schema, mapper, and transition
API.
Failure to verify the prior tick's header preserves that prior baseline and
holds the whole cycle; failure to capture the current tip header also holds the
cycle before any watcher mutation. Startup does not launch watchers without an
exact height/header baseline, so a null baseline cannot silently advance past a
possible reorg.

An abandoned exact DUP transaction remains observable so delayed inclusion can
still confirm it. That confirmation, its exact heartbeat-key insertion, and
abandonment of any active replacement occur in one database transaction;
reconciliation reloads each snapshot before acting so the losing replacement
cannot be falsely quarantined. Every absent-attempt pass re-queries the exact
transaction immediately before inspecting mempool or source-box state. An
unresolved source spend remains an active fail-closed hold rather than a
terminal verdict from one configured node. Quarantine and shallow-depth
reopening also remove a confirmed DUP key in the same transaction as the status
change. Quarantined history, any heartbeat awaiting final reconciliation, and
every historical `pending_dup_heartbeats` row block peg-out processing. Those
legacy rows lack exact block identity and remain an explicit operator migration
hold: the daemon neither inserts their key nor clears them automatically, and
they do not acquire the new journal's authority or evidence semantics.

Committed-vault confirmation now records the exact inclusion block identity in
the operational journal. When a linked operational row exists, peg-in
confirmation, reset, invalidation, and incident transitions update both SQLite
projections in one transaction; a failed or inapplicable peg-in compare-and-set
cannot leave only the journal changed. These are local crash-consistency and
fail-closed scheduling controls. They do not make SQLite mint authority and do
not replace the existing chain and committed-vault revalidation immediately
before mint.

WP-08A closeout status:

| Requirement | Current result | Remaining action |
|---|---|---|
| Tested dependency graph | Layer import check covers every layered runtime module and rejects reverse imports, cycles, unreviewed capabilities, and unclassified legacy imports; the current focused gate passes the 105-module/664-source graph | None for WP-08A |
| Frozen V1 compatibility | Existing profile/vector matrices remain byte- and digest-identical; the new selector is off-wire and the complete bounded suite passes in the final clean gate | None for WP-08A |
| Unknown profile rejection | Exact source, statement, proof-system, settlement, and asset identifiers reject before lifecycle capability access; reserved STARK ID remains disabled | None in this profile family |
| Fixture/runtime separation | WP-06 source fixtures are confined to `src/test-fixtures`; only one exact evidence-only transitive closure may reach them, while runtime authority roots and operational entrypoints reject any reachability; the final graph assertion passes | None for WP-08A |
| WP-07 behavior through ports | Rollback, reorg, outage, stale input, out-of-order recovery, restart disagreement, and database-loss no-authority behavior cross public roots and pass the final bounded matrix | Activated target authority remains a WP-06 external blocker, not WP-08A work |
| Capability separation | Extracted authenticated and aggregate settlement paths plus the original three operational daemon routes separate sign, check, immediate revalidation, authorization, durable attempt, fixed submission, finalization, and confirmation/reorg reconciliation at the historical WP-08A checkpoint. Subsequent slices retired owner mint, legacy payout initiation, DUP heartbeat transport, active SCS mutation, and finally committed-vault submission while mint authority is unavailable. No fixed operational submission facade remains in daemon composition; historical attempts use observation/reconciliation only | Keep the source-closure guard aligned and require a new reviewed authority profile before any route returns |
| Clean-checkout validation | `PASS` on `c47b0ea21306edce57f46d6cae565f73d6b28224`: exact Solidity dev closure, isolated JVM bundle `7b44b4e318e379716134bc15b125573d4ed111fe40376445669f0f74f183484c`, architecture/build, all 346 bounded Vitest files, and the standalone WASM test closure | External CI remains separate evidence |
| Independent review | Complete for the exact final candidate diff with no remaining P0-P2 finding; the final gate output and unchanged candidate inputs were reviewed before this status update | None for WP-08A |

From a clean bridge checkout, the final candidate gate is:

```powershell
git submodule update --init --recursive -- substrate-node
Set-Location relayer
npm.cmd ci
npm.cmd run check:clean-checkout
```

The submodule command deliberately scopes the bridge-owned pinned source
dependency. The dedicated clean-checkout command restores the exact
lockfile-bound Solidity development dependency closure with lifecycle scripts
disabled, then reconstructs and verifies the ignored locked JVM compiler bundle
before the existing relayer and WASM gates. The ordinary `npm.cmd run check`
edit loop remains unchanged. The sequence passed on the exact final candidate
above, and that candidate received independent review.

These results establish a source-neutral settlement boundary, one concrete
proof-profile family, three recovery/reconciliation lifecycle boundaries, one
check-to-reservation lifecycle boundary, one durable late-stage lifecycle, their
concrete adapters and statically imported application composition, plus the exact current authenticated
candidate, tracker, peg-in, replay-identity and native-ERG asset profile. The
composition function and arbitrary port implementations are not funds
authority. The active daemon's legacy coupled submission routes are separated,
and WP-08A is locally complete after independent review and exact
clean-checkout validation. No mint, payout, broadcast, Gate 5, trustless,
readiness, or publication authority follows.

## WP-08 — Institutional Operations And Public-Audit Alpha

An early architecture-only review and controlled private CI may start before
this package. No bridge source tree, repository, public branch, tag, source
snapshot, or release archive may be publicly released under any label until
WP-08A satisfies its Definition of Done. After that boundary, this is the first
recommended `public-audit alpha` packaging point.

**Deliverable:** a clean-checkout, version-pinned reference alpha containing the
sidechain runtime, commitment producer, Ergo contracts, relayer, VM harness,
threat model, architecture specification, operator runbooks, safe configuration
examples, monitoring/stop controls, governance boundaries, measured bottlenecks,
and one documented validation command.

Completion of this package requires threshold key rotation and member
replacement for every committee surface still present, redundant read
RPC/failover policy, circuit breakers, signer-unavailability behavior,
storage-rent maintenance, and explicit broadcast approvals. The rotation and
member-loss requirement remains blocked until an exact activation profile is
reviewed; the implemented local slices do not imply that result. The package
measures single/batch bottlenecks without expanding AVL lanes beyond the bounded
fallback demonstration. FIFO/MEV enforcement and production-scale lane
expansion remain explicitly deferred beyond the reference alpha unless a target
deployment makes them requirements.

Public positioning must be `research alpha` or `testnet reference prototype`.
It must state remaining federation, liveness, audit, and deployment assumptions.
No trustless bridge, production readiness, or mainnet deployment readiness wording is allowed.

**Definition of Done:** a clean recursive checkout runs the documented gate;
key rotation/member-loss and rollback drills pass; RPC failover and circuit
breakers are executable; monitoring exposes solvency, commitment, finality,
reorg, and stalled-settlement conditions; all deferred gaps are listed with
owners and claim impact; no critical/high finding is unowned.

### WP-08B — Fail-Closed Ergo Read-Quorum Supervision

The daemon's value-cycle failover policy is now explicit: it never falls back
to one Ergo reader. The process starts with the read breaker open and may enter
one cycle only after two statically configured sources reproduce the same
stable height and header ID. Each source is read as
`height -> header -> height -> header`; a changing local view, unequal source
views, malformed result, unavailable source, bounded-probe timeout, stale
result, superseded generation, or clock rollback holds the complete cycle.
A fresh matching probe closes the process-local breaker again.

The source adapter accepts only credential-free HTTP(S) origins and distinct
declared node and administration identity digests. Those declarations make
accidental aliasing and known shared configuration visible; they do not
authenticate an operator, prove independent administration, verify Ergo PoW,
or establish canonical consensus. The public pair and health snapshot expose
only opaque source IDs and the agreed tip identity, never origins,
credentials, API keys, or raw errors.

The static `apps/bridge-daemon` composition runs before sidechain
initialization and is refreshed before the startup reorg baseline is installed.
The daemon no longer loads an Ergo signer. The agreed tip becomes the cycle
baseline. Its opaque
generation/freshness decision is revalidated at every value-relevant recovery,
mint, settlement, oracle, maintenance, reconciliation, or sync-state entry.
No fixed committed-vault, EVM mint, aggregate settlement, SCS, or DUP mutation
path now acquires signing or transport capability from the daemon. New deposits
remain refundable, while already-recorded attempts retain only observation,
confirmation, recovery, or fail-closed historical reconciliation. Gate
execution is single-flight; overlap invalidates the active generation and
permits no lifecycle callback. No local boolean, snapshot, or decision authorizes funds:
the gate only withholds a cycle, and every route-specific proof, check,
approval and broadcast boundary remains required.

Configuration is explicit through
`ERGO_READ_QUORUM_WITNESS_NODE_URL`,
`ERGO_READ_QUORUM_PRIMARY_IDENTITY_DIGEST`,
`ERGO_READ_QUORUM_PRIMARY_ADMINISTRATION_DIGEST`,
`ERGO_READ_QUORUM_WITNESS_IDENTITY_DIGEST`,
`ERGO_READ_QUORUM_WITNESS_ADMINISTRATION_DIGEST`, and the bounded
`ERGO_READ_QUORUM_MAX_AGE_MS`. Existing aggregate-settlement source bindings
may supply the same values as a compatibility fallback. An absent witness
keeps the daemon alive for diagnosis but holds every cycle; an incomplete or
ambiguous configured pair rejects startup. The adapter aborts both source
operations at the outer deadline, and the two dedicated read-only clients also
bind their HTTP request timeout to the same probe bound.

**Current result:** locally implemented and focused-test complete. This closes
the first executable WP-08 redundant-reader/circuit-breaker slice only. It does
not dual-observe every downstream Ergo query, prevent two endpoints from
sharing a backend or operator, replace route-specific stable observations,
authenticate consensus, close the monitoring Definition of Done, close Gate 5,
or support a trustless, production-ready, or mainnet deployment claim.

### WP-08C — Read-Only Operator Health Projection

The daemon now composes one versioned, network-free health projection after
clearing its process-local cycle decision. The pure `relayer-core` projector
accepts only sanitized state: breaker state and observation age; process and
durable funds-release holds; conservative backing-alarm state; authenticated
commitment and sidechain-finality observation ages/heights; reorg
reconciliation state; and count-only persistence aggregates for durable
quarantines and active settlement age.

The persistence adapter reads those aggregates in one SQLite transaction.
Active settlement work is deduplicated by logical aggregate transaction or
burn identity across aggregate attempts, authenticated prepared/check-passed
candidates, active execution reservations, pending/submitted transport,
and peg-out lifecycle states. Each logical attempt is aged from its latest
persisted progress, while confirmed, rejected, invalidated, revoked,
quarantined, reverted, failed or unlocked terminal state suppresses older
active artifacts for the same identity. A prepared candidate or reservation
therefore cannot disappear merely because no submission row exists, and a
confirmed settlement cannot remain active forever.
It exposes no event row, address, box, transaction, burn, source, endpoint,
proof, digest, error or local path. Malformed timestamps, invalid counts or any
storage failure become an `unavailable` input. The public projection similarly
contains no mutable port and declares every checking, signing, authorization,
submission, broadcast and funds-authority capability false.

Freshness policy is explicit and versioned. Read-quorum freshness retains its
configured maximum age. Commitment and finality use the greater of two
read-quorum windows or four polling cycles. Commitment progress is measured
from the exact height agreed by the two tracker/index sources, not from an
unrelated daemon read tip, and degrades beyond two blocks of lag. Sidechain
finality degrades when the finalized head trails the observed execution head
beyond the configured confirmation-depth bound even if RPC reads remain fresh.
The conservative solvency alarm, which runs less frequently, uses the greater
of two read-quorum windows or sixty polling cycles. An active settlement is
reported stalled after the greater of fifteen minutes or 120 polling cycles.
Clock rollback never creates a negative age and instead makes the projection
fail closed, including when the affected signal is otherwise unavailable.

The projection emits immediately when its bounded classification changes and
periodically every ten cycles while unchanged. Continuously changing ages and
heights are excluded from the deduplication fingerprint, so healthy progress
does not produce one redundant log per cycle. Monitoring obtains the
read-quorum state through a non-expiring snapshot; the pure projector reports
staleness without mutating the supervisor, while the existing control path
retains sole responsibility for expiring read authority. The projection is
also available while startup waits for read quorum. Monitoring failure emits
only a bounded `operator_health_unavailable` condition and does not break the
daemon loop. This is operator visibility over existing controls, not a new
control plane: it cannot clear a hold, reconcile an incident, authenticate
consensus, prove sidechain finality or authorize value movement.

**Current result:** locally implemented and closeout-verified with focused core,
persistence, composition and daemon-boundary coverage, TypeScript and
architecture checks, pinned JVM/native harness replay, and independent review.
The broad relayer sweep passed 9,810 tests, skipped six, and exposed three
concurrency/environment or stale-boundary failures; each failed closure replayed
green in isolation after restoring the exact pinned MinGit executable and
updating the boundary assertion. This closes the monitoring projection portion
of WP-08 only. Alert transport, operator authentication, reviewed recovery
actions, Gate 5 and release readiness remain open. The historical signer-loss
containment model is recorded separately by WP-08D below; the current daemon
does not assemble that capability.

### WP-08D — Historical Ergo Signer-Unavailability Containment Model

At the WP-08D checkpoint, the daemon's local Ergo/WASM signer was supervised as
a terminal process capability. Startup signer loading and committed-vault
submission used the same composition-root boundary: the supervisor started
unavailable, became available only after a non-null load, and could not recover
after a load or signing failure. The current daemon has since retired
committed-vault submission, SideChainState mutation, legacy aggregate payout
initiation, owner-mint initiation, and DUP-heartbeat transport. It no longer
imports the signer boundary or `fleet-signer`, loads a key, or exposes a signer
failure control path. Historical reconciliation and confirmation readers do
not acquire a signer. No future route may substitute node-wallet signing,
Fleet Prover signing, another signer implementation or a local status flag.

The retained config-free drill proves the historical boundary behavior without
configuration, key material, network, database, signing or transaction access.
A thrown or null synthetic result transitions the model to terminal
unavailability, invokes containment once and prevents any later loader retry.
This model has no daemon consumer and grants no runtime capability.

Operator health uses `e2s.operator-health-projection.v3`. It distinguishes
`not_configured` from a configured signer becoming `unavailable`: the current
observation-only daemon reports the former with a `not_applicable` signal status
but no `signer_unavailable` incident reason. The latter remains held and maps
to the reviewed diagnostic route. Neither state exposes a key, address, origin,
path, raw signer error or callable capability. The config-free
`npm run operator:drill:signer-unavailable` command injects one synthetic
preparation failure and proves one loader attempt, one containment transition,
no later loader retry, no fallback, no node-wallet signing and no retained
checking, signing, authorization, submission, broadcast or funds capability.
The drill reads no configuration or key material and performs no network,
database, signing or transaction operation.

WP-08D closeout map:

| Producer | Exact output | Consumer / deciding boundary | Failure if relaxed | Isolated negative |
|---|---|---|---|---|
| Static local signer loader | Process-local `available` transition only after a non-null load | Config-free historical containment drill only | A failed or absent signer could be treated as initialized if the model is reused | Thrown/null load becomes terminal; a later load never reaches the loader |
| Daemon signer capability | Exact literal `not_configured` health input; signer-free candidate revalidation and unsigned-ID derivation; no signer import, static transitive dependency, property, load, address log or signer-specific catch | Operator-health V3 projection only | A dormant key requirement could silently return to startup or be reported as healthy signer authority | Static daemon boundary rejects every former symbol, walks the complete static runtime import closure and requires the explicit observation-only status |
| Daemon broadcast posture | `BRIDGE_BROADCAST_ENABLED=false` or unset before any sidechain initialization | Observation-only daemon startup only | A global broadcast opt-in could be required by or misrepresented as authority for a process with no submission route | Policy negatives reject enabled startup; whole-runtime broadcast-surface tests keep daemon submission routes absent while explicit utilities retain their own authorization |
| Bounded devnet reward signer | Separate sign/check/journal/authorization/transport lifecycle | Explicit patched-devnet reward command only | Removing the daemon signer could accidentally remove or merge the one retained operational utility | Static boundary proves the utility remains outside `BridgeRelayerDaemon` and retains each lifecycle stage |
| Signer health state | `not_configured`, `available`, or `unavailable` | Operator-health V3 projector | Intentional capability absence could produce a false incident, while real configured-signer loss could be hidden | `not_configured` is `not_applicable` and emits no failure reason; `unavailable` remains held; unknown enum rejects |
| Config-free operator drill | Frozen no-capability PASS report | Human/operator rehearsal only | A synthetic report could be mistaken for runtime authority | Source scan excludes configuration, key, network, persistence and node-wallet surfaces |

**Current result:** the current daemon signer capability is absent. The retained
supervisor and containment boundary are exercised only by the config-free drill,
and the patched-devnet reward signer remains a separate command. Operator-health
V3 reports that topology without a false signer-loss incident. This slice does
not define a recovery, approval or hold-clearing workflow. It does not cover the sidechain
EVM signer, standalone signing/deployment/diagnostic CLIs, claim in-memory key
erasure, revoke a transaction after transport, add alert delivery, provide a
recovery or hold-clearing command, authenticate source consensus/finality,
close Gate 5 or support trustless, production-ready or mainnet-readiness
wording.

### WP-08E — Bounded Storage-Rent Maintenance

Every tracked ErgoScript contract is now present exactly once in a static
storage-rent surface inventory. The inventory distinguishes a neutral successor
from transitions that necessarily change replay, proof, source-deposit,
liability or payout state. Only the legacy `SPVTracker.es` no-ingest branch is
classified as neutral ordinary maintenance: it preserves the exact script,
singleton NFT, value, AVL state, committee proposition and latest sidechain
height while advancing the operation counter and Ergo height stamp. SCS and
every DUP profile require a semantic state transition. Source locks, vaults and
reserves require a value transition. They cannot be routed through a generic
touch or consolidation operation.

The active daemon monitor no longer estimates rent from age alone. Both
configured Ergo readers must reproduce the exact admitted tip header before
and after exposing the same positive `storageFeeFactor` and parameter
activation height. The derived parameter observation binds the admitted height,
header ID, read-quorum observation digest, activation height and fee factor.
The monitor measures each observed box from its canonical serialized bytes and
projects the inclusive `1,051,200`-block boundary, fee coverage and warning
state. It observes every singleton role expressible by the current deployment
schema: SCS, legacy, aggregate, batch and authenticated DUP, and legacy and
authenticated SPV trackers when configured. MainChainLock monitoring requests
one server-sorted ascending page of at most 129 boxes, inspects the oldest 128,
and reports whether more boxes exist. It never fetches or sorts an unbounded
address inventory.

Monitoring is deliberately non-authorizing. It does not build a transaction,
load a signer, persist an approval, reserve transport, submit or broadcast. The
old automatic DUP heartbeat has been removed because inserting a sentinel key
is a replay-state mutation rather than neutral rent maintenance. The old
MainChainLock consolidation scaffold has also been removed because those boxes
can be consumed only by their contract-defined commit or refund branches. The
daemon retains read-only fragmentation reporting and fail-closed reconciliation
for historical heartbeat attempts that may already exist in local operational
history.

The config-free `npm run operator:drill:storage-rent-maintenance` command
compiles the exact source-hash-bound `SPVTracker.es` with the pinned JVM
compiler, verifies its reviewed ErgoTree digest, derives the canonical
serialized tracker size through sigma-rust, and builds a synthetic transaction
inside the drill only. It runs one positive no-ingest transition plus nine
script-level negatives. The negatives cover AVL digest, R7, counter,
current/future R8, singleton NFT under valid first-input token-emission
semantics, script, R6 and tracker value drift. The rejection harness accepts
only prover/script-false failures, not a generic transaction-validation error.
This proves local branch feasibility, not a reusable candidate, runtime
authorization or target-node acceptance.

WP-08E closeout map:

| Producer | Exact output | Consumer / deciding boundary | Failure if relaxed | Isolated negative |
|---|---|---|---|---|
| Two configured Ergo readers | Provenance-issued observation object bound to the exact admitted cycle decision, admitted height, exact header ID before and after `/info`, observation digest, native-JSON-integer parameter height and positive storage-fee factor, and opaque pair identity | Read-only daemon projection | A caller-fabricated digest, coercible malformed value, same-height reorg or stale/divergent source could understate or misattribute the projected charge | Cloned observations and decisions; strings, booleans and null numeric fields; header replacement; factor disagreement; stale tip; missing capability; and malformed values reject |
| Canonical box binary endpoint | Exact serialized byte length | Pure rent projection | Field counting or a fixed typical-box size could underfund a larger state box | Malformed and odd-length bytes reject; the VM drill derives the exact synthetic box size from sigma-rust bytes |
| Static contract inventory | One classification for every tracked `.es` source | Maintenance eligibility policy | A new singleton or vault could silently inherit an unsafe generic touch path | Exact contract-directory equality and duplicate rejection |
| Exact legacy-tracker source and compiled tree | Reviewed source and ErgoTree digests plus one synthetic no-ingest transaction | Config-free VM drill only | An arbitrary tree or generic transaction failure could be misreported as neutral profile evidence | Exact digest checks plus nine script-level rejects |
| Daemon monitor | Sanitized risk, all configured singleton roles, exact observed/configured ErgoTree equality, reviewed legacy-tracker tree digest and one bounded oldest-MCL page through a dedicated read-only client with an 8 MiB response ceiling | Operator logs only | Monitoring could label a migrated tree as neutral, omit a deployable singleton, interpret a malformed page as empty, allocate an unbounded response, or regain the removed heartbeat/sweeper transport | Executable adapter negatives cover tree mismatch, wrong surface, malformed trees, size-bit normalization and legacy digest drift; the exact compiled legacy tree passes in the VM drill; malformed envelopes reject; requests are capped at 129 items and 8 MiB; candidate building, signer loading, submit and broadcast calls remain excluded |

**Current result:** closeout-verified as a source-level inventory,
provenance-bound exact-tip parameter quorum, configured-tree-bound read-only
daemon monitor and synthetic exact-contract VM matrix. The complete bounded
test closure, architecture boundary, TypeScript build and WASM build are green.
Box JSON and binary observations after parameter agreement still come from the
configured primary origin through a separate read-only, response-bounded client
and therefore remain monitoring input, never maintenance or funds authority.
MainChainLock sampling is intentionally incomplete for large inventories, and
its bounded per-box reads do not establish an aggregate wall-clock deadline for
the whole monitoring pass. No deployment lineage was inspected; no live box is
asserted to match the legacy profile; and no target node accepted a maintenance
transaction. WP-08E exposes no reusable transaction candidate and does not add
scheduled maintenance, a checker, signer, submitter, broadcast approval, funds
authority, Gate 5 closure, trustless status or readiness.

### WP-08F - Exact Active Broadcast Authorization

The active-daemon broadcast inventory distinguishes routes by deciding
capability rather than by configuration flags:

| Active-daemon surface | Current deciding path | WP-08F result |
|---|---|---|
| Committed-vault Ergo transition | No active deciding path. Detected deposits remain refundable; exact historical attempts remain observable and reconcilable | Fixed facade, coordinator submission API, signer use, fee selection, reservation, and transport removed; pure transaction construction remains non-authorizing |
| SideChainState Ergo update | No active deciding path. Exact historical attempts remain reconcilable and finalized sidechain state remains read-only operator-health input | Builder, signer use, fixed submit facade and daemon submit call removed; no claim about deployed on-chain route retirement |
| Legacy aggregate Ergo settlement | No active deciding path. New admission, signing, authorization, submission, and broadcast entrypoints are absent | Read-only diagnostics and exact historical confirmation/recovery only; legacy on-chain committee/federation authority still requires cutover and is not Gate 5 |
| EVM peg-in mint | No active deciding path. Exact committed-vault verification ends in a fail-closed hold pending authenticated V4 reservation and runtime consumption | Executable owner signer, submitter, transport adapter, application root, executor, daemon composition, and new-attempt journal writers removed; historical confirmation retained |
| DUP heartbeat | No active transport; WP-08E retired candidate creation and submission | Observation and historical reconciliation only |
| Storage-rent monitor | Read-only bounded observation | No candidate, signer, submitter or broadcast capability |
| `SidechainClient` | Read-only historical confirmation, receipt, event, supply, and code observation | No signer, private-key read, contract write, submission, or broadcast capability |
| Legacy SCS/DUP deployment tools | No package-exposed path | Generic deploy, direct SCS redeploy and direct DUP redeploy files are absent and guarded against reintroduction; a future V5 provisioner must be profile-specific and preserve capability separation |

The original WP-08F lifecycle made owner-mint transport exact and restart-safe,
but it still retained an owner signer and one executable transport. P1-LR1
removes that capability instead of treating containment as the target state:

1. `peg-in-transition.ts` still requires the exact canonical deposit,
   confirmed source consumption, non-refundable vault, recipient, amount, and
   WP-01C receipt, then stops in an explicit V4-pending hold.
2. The active relayer composition contains no owner-mint signing method,
   envelope builder, submitter,
   transport adapter, transport application root, lifecycle executor, daemon
   composition, or journal method that can create a new mint attempt.
3. The historical attempt schema and read path remain only so an exact
   already-submitted transaction can be confirmed, reconciled, quarantined, or
   abandoned after fresh canonical observations. SQLite never creates mint
   authority.
4. The config-free `npm run operator:drill:peg-in-mint-transport` command now
   proves the old files and executable symbols remain absent while the bounded
   confirmation observer remains present. It also reports the still-existing
   Solidity owner entrypoint as an open authority boundary.

**Current result:** the active daemon composition cannot initiate owner-key
minting. This
is source-level capability retirement, not an on-chain mint proof or complete
cutover. The Solidity `onlyOwner` entrypoint, Root/Sudo governance, historical
deployment lineage, source consensus authentication, application-bound
sidechain finality, reviewed profile activation, and atomic V4 reservation
consumption remain separate requirements. No transport was enabled or exercised
against a node; no deployment, Gate 5 closure, trustless status, production
readiness, or mainnet readiness follows.

The first replacement provisioning boundary is now source-only and V5-specific.
`validity-application-pooled-reserve-provisioning-v5.ts` accepts only the exact
same-process reviewed V5 compiler instance, the process-provenant global replay
cutover, three designated pure-ERG genesis inputs and one explicit,
caller-supplied Ergo-testnet chain binding. It produces deterministic unsigned
tracker, DUP and zero-liability reserve issuance plans. The plan digest also binds the source
network, sidechain, settlement profile, exact resolved contract family and all
singleton/replay identities. Construction is distinct from JVM check, signing,
submission, broadcast authorization and confirmation; all later capabilities
remain absent. The target-network identity and replay-inventory exhaustiveness
are not authenticated by this source-only plan. Predicted outputs are not
established lineages, and this package does not activate a profile, alter
cutover eligibility, read deployment state, or authorize any funds movement.

The blocked V5 cutover-eligibility boundary now consumes that exact
process-provenant plan as its only V5 input. It carries the selected
network/profile/contract lineage plus all three unsigned transaction and
predicted singleton-box identities into the eligibility digest, and rejects
isolated replay, singleton, transaction/output or authority drift. The separate
V4 cutover review remains the source for legacy-route inventory and retirement
analysis. This join does not authenticate the supplied network identity, prove
inventory exhaustiveness or route retirement, perform a JVM/node check,
establish an on-chain lineage, activate the profile, or authorize signing,
submission, broadcast, confirmation or funds movement.

The separately versioned V6 provisioning boundary preserves the retained V5
tracker value and proof semantics while targeting the V6 settlement lineage.
It consumes the exact same-process V6 compiler instance and V6 global replay
packet, then derives three deterministic unsigned issuance transactions for
the tracker, DUP and zero-liability reserve. Their transaction IDs, predicted
box IDs, contract identities, network/genesis binding, source V4 runtime
profile, target V6 lineage and complete historical replay set are all bound by
one plan digest. The target network and replay inventory remain supplied rather
than authenticated, predicted boxes are not established on-chain lineages, and
checking, signing, submission, broadcast authorization, confirmation,
activation and funds authority all remain false.

The blocked V6 cutover-eligibility boundary consumes that exact process-owned
provisioning plan and the retained process-built V4 cutover review. It
independently checks the 49 observed V4 routes and adds the four exact integrated
V5 contracts as pending authenticated inventory and retirement requirements. It
does not claim that those four routes were never funded. It also checks all nine
historical DUP lineages, exact global
replay count/digest, disjoint target contracts, each unsigned transaction and
predicted singleton identity, and every false authority boundary. It also
carries the exact SigmaState, acceptance-spec, acceptance-fixture and proofless
transaction identities of the previously completed two-input, ten-negative
local predicate matrix. The former V5 protected-input attribution blocker is
absent only for that exact closure identity. Eligibility neither replays the
JVM matrix nor establishes target-node acceptance. This removal does not
authenticate finality, deployment, route retirement, target-node acceptance
or funds authority; the candidate remains
`blocked_non_authorizing_precondition`.

The historical V5 target-check boundary freezes one exact request without
executing it. The request carries all three canonical EIP-12 payloads, their unsigned
transaction and predicted output identities, the selected network/genesis and
the complete retained/target profile binding. Its future receipt policy requires
one ordered three-receipt set from the same node origin, node version, activation
generation, checker identity and state context; each role must independently
rederive the unsigned ID, bind the signed-byte and response digests, and pass
both local JVM reduction and `/transactions/check`. No receipt producer or
consumer exists in this slice. The request is not executable, does not select or
authenticate a node, and grants no signing, submission, broadcast, confirmation,
activation or funds authority.

The separately versioned V6 target-check boundary now freezes the exact V6
eligibility and provisioning digests, prior local predicate-closure identity,
target network/profile/contract family, ordered EIP-12 payloads, transaction
and predicted-output identities, and future three-receipt policy. It performs
no JVM replay or node operation, selects no target and creates no receipt,
signer, submitter, broadcaster, activation decision or funds-authority switch.

The V6 atomic funds-authority switch precondition now binds the exact V6
eligibility and target-check request to four future evidence families under one
V6-only switch intent and activation-context policy. It also binds the exact
local predicate-closure digest. It accepts no evidence, evaluates no switch and
creates no checker, signer, submission, broadcast, activation or funds
capability.

This closes the local V6 structural requirement chain. Do not add another local
V6 envelope, receipt simulator or switch evaluator. Resume this cutover only
when a real nonmainnet `p1:ergo-cutover:observe` input set and compatible
activated target can supply provenance-authenticated evidence for the exact
four families. Until then, V6 remains preactivation and non-authorizing.

### WP-08G - Auditor Bootstrap And Packaging Safety

WP-08G turns the implemented local stack into one reviewable, fail-closed
source package that may be published for public research only after the exact
candidate passes the complete promotion checks. A standalone bundle remains an
unverified review artifact until that separate audit succeeds. The package has
these fixed entry surfaces:

- `docs/public-audit-alpha-manifest.json` is the machine-readable authority for
  classification, validation order, critical/high gaps, owner roles, next
  actions and claim limits;
- `docs/public-audit-alpha.md` and the repository README start with the offline
  audit path rather than deployment or broadcast-capable examples;
- `npm run audit:alpha` runs one config-free source-lock, clean build/test and
  no-transport drill sequence;
- `.gitmodules`, `.gitattributes` and source-lock discovery support both the
  current superproject and a future standalone bridge repository without
  changing locked commits, patches, formats, vectors or contract bytes;
- the bridge-local workflow checks out recursively and runs the same audit gate
  in standalone-relative paths, while the current superproject workflow runs
  it from the nested path;
- `npm run audit:alpha:bundle -- --out <outside-repository>.bundle` creates a
  deterministic standalone root commit from the exact committed bridge tree,
  preserves the Frontier gitlink, excludes every untracked filesystem object,
  and writes a sidecar binding both Git identities and the bundle SHA-256;
- the relayer npm package is private and its ignore policy excludes local
  configuration, runtime databases, logs and generated caches. `npm pack` is
  not the audit-transfer format;
- `contracts/deployed_state.json` is retained only as ignored local runtime
  state and is no longer a tracked source artifact. The preflight checks the
  Git inventory without opening that file.

The audit preflight rejects a missing required artifact, tracked deployment
state, manifest drift, an unowned critical/high gap or an enabled broadcast
environment before the expensive gate starts. It performs no chain RPC,
signing, submission, broadcast, deployment or funds movement. WP-08I now ports
the complete pinned-source rebuild into a bridge-local standalone job and adds
parser-backed local command-graph validation. A hosted execution result for the
exact candidate commit remains separate promotion evidence rather than an
implied result of the local workflow check.

WP-08 Definition-of-Done gaps remain explicit:

| Gap | State | Next concrete action |
|---|---|---|
| Gate 5 native-profile activation | Blocked externally | Run exact target-node acceptance only after a reviewed non-inert profile and compatible activated node exist; then produce the environment-specific profile-activation report consumed by Gate 3 |
| Historical authority/replay cutover | Global replay-genesis composition implemented locally; relayer owner-mint and legacy aggregate payout initiation removed; operational cutover open | Capture the reviewed testnet profile, supply every required nonempty-route mapping/admission, bind complete deployment lineage, prove the exact activated parent, and retire every remaining on-chain legacy funds route |
| Key rotation/member loss | Blocked on exact activation profile | Rehearse every retained authority surface against the reviewed profile; this is operator readiness, not the Gate 5 fix |
| Current-HEAD recovery rehearsal | Locally complete; WP-08H | Retain the deterministic synthetic matrix in `audit:alpha`; any live recovery claim still requires current-HEAD non-mainnet evidence and independent review |
| Independent security review | Open; public intake issue #1 | Review exact public commit `ee0686b84483e6f0af85c764e93b8a43383cc54a` and retain every unresolved critical/high finding as a blocker |
| Current-HEAD clean recursive checkout evidence | Complete for public commit `ee0686b84483e6f0af85c764e93b8a43383cc54a`; hosted run `32009155091` passed | Re-run only when the candidate tree, audit workflow/runtime lock or another transitive gate input changes |
| Standalone consensus-source build CI | Complete for public commit `ee0686b84483e6f0af85c764e93b8a43383cc54a`; hosted run `32009155091` rebuilt both pinned source trees successfully | Re-run when the source locks, patches, build graph, supplied-executable conformance path or another transitive source-job input changes |
| Open-source license | Locally complete; WP-08L | Preserve the Apache-2.0 root scope and the exact component-specific third-party terms in every review bundle and future publication |
| External alert delivery, acknowledgement, and live recovery evidence | Local mechanism complete; external evidence blocked under issue #2 | Exercise the WP-08K worker against the reviewed FED-6 target with reviewed credential custody, retain one real Ed25519 acknowledgement bound to the exact delivered alert and receipt, and run the current-HEAD recovery procedure on that exact non-mainnet deployment. Local worker/verifier tests, synthetic transport and acknowledgement fixtures do not satisfy this evidence |

**Current result:** the package is a structured `public-research-alpha` whose
policy permits source publication only after exact candidate-promotion checks;
public commit `ee0686b84483e6f0af85c764e93b8a43383cc54a` passed exact hosted run
`32009155091`. Supported release status remains blocked. The green hosted result
proves only its declared reproducibility, implementation and containment checks.
It does not satisfy independent security review, external activation, Gate 5,
trustless status, production readiness, mainnet readiness or release authority.

### WP-08H - Current-HEAD Recovery Rehearsal

WP-08H is the completed local recovery-rehearsal package. It composes existing
public relayer-core ports, adapters and application roots into one config-free
recovery drill rather than add another parallel lifecycle. The drill must use
ephemeral state and exercise, in one deterministic case matrix:

1. normal durable-state reopen with an exact retained lifecycle and journal,
   followed by a fresh two-source route reconstruction;
2. complete database loss, proving that inventory may reconstruct while check,
   signer, submission and broadcast authority do not;
3. stale, already recovery-required copied database state against a strictly
   later chain-derived snapshot; clean-copy location binding remains a separate
   StateTracker negative;
4. deterministic divergent RPC observations;
5. out-of-order source, burn, candidate and confirmation observations;
6. post-mint source restoration and peg-out burn reorg containment;
7. an injected incident-persistence port failure followed by reopen and retry.

Every case must expose reached-stage counters. The four directly instrumented
funds-authority, funds-release, transport-start and aggregate-submission-
reservation methods must remain at zero. Capabilities not wired by the drill
composition are listed separately and checked at the root and incident-only
module boundary rather than reported as measured calls. Durable incidents and holds are outputs to inspect,
not permissions to clear. The package must not add an operator command that
releases a hold, rewrites history, accepts one RPC as consensus or creates
funds authority.

**Definition of Done:** one documented `operator:drill:recovery` command runs
the complete matrix without network configuration; its structured report binds
the case set and exact expected outcomes; focused tests prove each failure
branch and rollback boundary; architecture checks prove the drill reaches only
the existing ports; and the final candidate passes one grouped TypeScript and
affected-test closeout. A live recovery claim still requires current-HEAD
non-mainnet evidence and independent review.

**Completed local boundary:** the command and its exact seven-case report are
part of the blocked auditor manifest. SQLite close/reopen retains one exact
minted lifecycle, then a newly reconstructed process-provenant report confirms
the committed route without restoring authority. Complete database loss deletes
a lifecycle-bearing ephemeral runtime and reconstructs route inventory only in
its fresh replacement under an open continuity hold. A database copied while
already recovery-required remains held before a strictly later two-source route
snapshot persists a source-restoration incident. Clean-copy location-bound
witness rejection remains covered by the StateTracker negative matrix. RPC disagreement writes no
snapshot; reordered lifecycle events reject for their exact expected reasons;
reverted burns remain terminal; and one real aggregate journal performs
pre-finality rollback. An injected incident-persistence port failure leaves the
persisted lifecycle unchanged under the existing continuity hold; after reopen,
a fresh route report permits an idempotent incident retry. The post-mint root
loads the authoritative lifecycle by exact source box ID, consumes only route
snapshot and incident-persistence ports, and invokes the composition-provided
process provenance assertion before evaluating the report. Transaction
construction, mint transport, submission and funds authority are absent from
its dependency surface. This is deterministic local close/reopen rehearsal
evidence, not child-process restart or live recovery evidence.

### WP-08I - Standalone Consensus-Source Build CI

WP-08I removes the remaining superproject-only build assumption from the
candidate auditor package. It must port the exact current hosted reconstruction
of pinned Frontier and patched Ergo sources into the bridge repository's
standalone recursive workflow. The job must preserve the existing gitlink,
source URLs, commit pins, patch digests, generated Solidity identities and
source-lock verifier rather than invent a second source manifest or fetch a
moving branch.

**Definition of Done:** a clean standalone checkout can run one documented
hosted job that resolves every pinned source, applies only tracked locked
patches, rebuilds both consensus sources, verifies the source lock and retains
the existing no-deployment/no-broadcast boundary. Local validation proves the
workflow syntax and command graph; current hosted execution evidence remains a
separate promotion artifact. No build result activates a proof profile, proves
runtime deployment identity, closes Gate 5 or authorizes publication.

**Completed local boundary:** `.github/workflows/relayer-checks.yml` now has one
Linux `consensus-sources` job with standalone-relative paths. It recursively
checks out the exact Frontier gitlink, installs the existing build prerequisites,
revalidates the Solidity closure and canonical source lock, applies only the
two tracked patch paths, executes the existing Frontier producer/finality/state/
checkpoint tests and node build, executes the Ergo extension test and assembly,
and revalidates both source trees after the builds. The job neither consumes
secrets nor exposes deployment, signing, submission or broadcast commands.

`npm run sources:verify:workflow` parses the YAML with duplicate-key rejection
and validates the exact ordered step graph. Source repositories, commits, tag,
patch paths and build commands are checked against
`sources/consensus-source-lock.json`; no second source manifest exists. Its
negative matrix rejects malformed YAML, non-recursive checkout, nested
superproject paths, a moving Ergo ref, a foreign patch, reordered final source
validation and a deployment command. The parser result explicitly records that
hosted execution, profile activation, runtime deployment identity, Gate 5 and
publication authority remain false. Mutable hosted actions, runner images,
package registries and dependency caches mean even a future green hosted run is
reproducibility evidence, not a hermetic build attestation.

The first public hosted run exposed two environment assumptions before either
job could complete. The Windows runner adds an npm-local `npmrc` overlay that is
not part of the locked upstream package bytes. The audit job disables the
pre-verification npm cache, creates a runner-temporary Node/npm closure,
verifies that any overlay is exactly the
known regular-file form, removes it only from that copy, and uses the isolated
runtime for both dependency installation and `audit:alpha`. The Linux job had
invoked a command intentionally restricted to the pinned Windows local-build
profile. It now builds the verifier and RPC codec from the same already locked
and patched Frontier checkout, supplies their exact absolute same-job paths,
and exercises the cross-language vector under a separate supplied-executable
conformance mode. That mode emits only a generic non-authorizing join candidate;
it cannot claim source-build or pinned-local provenance, complete tool closure,
independent attestation, activation, admission or Gate 5. Source-build
provenance comes only from the exact workflow graph that requires the build
step and passes those paths. The executables are canonicalized and hashed
before and after use; this narrows accidental drift but is not atomic
file-descriptor attestation, so the fresh hosted runner remains a non-adversarial
execution assumption. The command-graph validator and negative tests bind both
jobs, the audit isolation command and both executable paths. Hosted run
`32009155091` passed both jobs for exact public commit
`ee0686b84483e6f0af85c764e93b8a43383cc54a`; that is bounded reproducibility
evidence for those bytes, not a hermetic attestation or a funds-authority claim.

### WP-08J - Alert Delivery And Reviewed Recovery Actions

WP-08J closes the remaining locally implementable operator-response gap without
creating a control plane for funds. It must consume the existing read-only
health projection through a narrow alert-delivery port, derive a stable
condition digest from the exact incident/hold/profile state, derive a separate
occurrence identity from that digest, transition lineage, reconstructible-cache
generation, and occurrence-open time, and persist only immutable event and
delivery lifecycle metadata. An
undelivered occurrence must reach terminal delivery before a later update or
recovery can replace it. A static recovery-action catalogue may
link each alert class to reviewed diagnostic or operator procedures, but no
action may clear a hold, rewrite lifecycle history, mutate a chain, invoke a
checker or signer, reserve transport, submit or broadcast.

**Definition of Done:** one config-free drill exercises alert creation,
deduplication, delivery failure, retry, restart and stale/recovered health
transitions through the public ports; SQLite remains reconstructible delivery
cache rather than incident or funds authority; unknown alert/action/profile
identities fail closed; crash-after-delivery and expired-lease retries use the
same occurrence identity while complete cache loss opens a new occurrence;
architecture tests keep the pure persistence codec separate from action lookup
and keep checker, signer, reservation, submission, broadcast, hold-clearing,
and funds modules from importing the action/delivery surface; and the
public-audit manifest reports the bounded operator-response surface without
claiming external delivery or live recovery. The daemon composition accepts
the local structured-log sink and an enqueue-only outbox port. Real
webhook/email/pager transport runs only through the separate WP-08K worker and
remains separate evidence with target and credential custody, operator
acknowledgement, and live non-mainnet recovery.

**Completed local boundary:** one versioned static profile derives a stable
condition digest and a distinct cache-generation- and time-bound occurrence
identity from operator-health, hold, incident, and profile state. One outstanding occurrence
is retained through retry and lease recovery until terminal delivery; a later
health update or recovery is emitted only afterward. The narrow delivery port
persists only the immutable event payload plus pending, delivering, retry, and
delivered metadata in a reconstructible SQLite cache. Cache loss creates a new
generation and occurrence and never restores incident or funds authority. A static catalogue covers
every current `OperatorHealthReason` with inert references to reviewed operator
runbooks; unknown reason, action, and profile identities reject. The config-free
`npm run operator:drill:alerts` command covers creation, deduplication, injected
delivery failure, retry, SQLite close/reopen, and stale/recovered transitions
without network, environment, private runtime state, checker, signer,
submission, broadcast, hold clearing, or funds authority. The daemon invokes
the local structured-log sink and enqueue-only outbox port; it never imports or
invokes the WP-08K HTTP transport or acknowledgement path. This is bounded
local operator-response evidence only. It does not establish external delivery,
operator acknowledgement, execution of a live recovery procedure, Gate 5,
trustless status, publication, or readiness.

### WP-08K - External Alert Outbox And Authenticated Acknowledgement

WP-08K implements the external notification boundary without putting network
transport or operator responses inside the daemon value cycle. The daemon
attempts to persist an immutable canonical alert before its local structured
log. An outbox failure leaves delivery retryable but does not suppress the local
alert or reconciliation of a newer health transition. A separately invoked
worker may claim the oldest non-delivered outbox row, send that exact event to
one credential-free HTTPS endpoint, and record a sanitized local delivery
receipt. An older in-flight or retry-wait alert blocks every later dependent
event. Lease expiry and compare-and-swap transitions provide bounded
at-least-once retry under the same alert-ID idempotency key. The outbox remains
a reconstructible notification cache: losing it may re-enqueue the retained
current alert but cannot recreate historical notification records, lifecycle
facts, incidents, holds, settlement state, or funds authority.

Acknowledgement is a distinct audit-only operation. A statically reviewed
Ed25519 key registry verifies versioned canonical bytes bound to the exact
delivered alert ID, event digest, local receipt digest, key ID, nonce and time
bounds. The local receipt binds a digest of the exact endpoint identity, and an
optional authorization header is accepted only with that same configured
endpoint digest. The resulting acknowledgement record is append-only audit
metadata. Neither delivery nor acknowledgement may clear a hold, mark recovery
complete, rewrite an incident, select lifecycle, invoke a checker or signer,
reserve or submit a transaction, broadcast, or authorize funds.

**Definition of Done:** focused crash/retry/replay tests cover enqueue-before-log,
local visibility during outbox failure, ordered retry, lease recovery, stable
idempotency, immutable-event CAS, endpoint-bound authorization and receipt,
transport timeout and response bounds, event/digest drift, acknowledgement
signature and binding failures, nonce replay, restart and isolated outbox loss.
Architecture checks prove the daemon does not import HTTP, acknowledgement or
worker modules and that every alert root remains transitively outside funds
capabilities. TypeScript and the affected closure pass as one grouped
checkpoint. The auditor documents the commands and keeps real target delivery,
credential/key custody, real operator acknowledgement and current-HEAD
non-mainnet recovery as external evidence.

**Completed local boundary:** `operator:alerts:worker` performs one bounded
delivery attempt from the immutable SQLite outbox; `operator:alerts:acknowledge`
verifies and stores one exact signed acknowledgement. The HTTPS adapter accepts
no credentials in its endpoint, requires an exact endpoint digest before using
optional authorization, limits timeout and response bytes, independently
revalidates event identity, binds the endpoint identity into the local receipt,
and returns no endpoint, secret or response body. The static registry and
process-provenance guard prevent an arbitrary verifier or key map from becoming
acknowledgement authority. The daemon only enqueues and logs. Tests cover retry,
restart, strict ordering, deduplication, immutable-event mutation, event drift,
local log and outbox failures, outbox recreation, signature/binding/time
failures and cross-alert nonce replay. No reviewed external target, operator
credential custody, real acknowledgement, live recovery, Gate 5 closure,
trustless status, publication or readiness is claimed.

### WP-08L - Open-Source License And Third-Party Boundaries

WP-08L packages the Apache License 2.0 for repository-owned content and records
the component boundaries that must retain different terms. The Solidity build
package and contracts remain MIT. The pinned Frontier gitlink remains governed by its
per-file and per-package Apache-2.0, GPL-3.0-or-later WITH
Classpath-exception-2.0, Unlicense and ISC terms. The Frontier and Ergo node
patches preserve applicable upstream licensing and provenance; dependency
lockfiles and generated artifacts never relicense their inputs.

**Definition of Done:** the root and Solidity licenses, third-party notice and
exact pinned OpenZeppelin notice are tracked, included in the standalone
reviewer bundle, required by the audit manifest, and reflected in package
metadata owned by this repository. The license gap is removed from the
canonical open-gap ledger without changing publication status or any Gate 5,
trustless, production-readiness, deployment or funds claim.

**Completed local boundary:** `LICENSE`, `solidity/LICENSE`,
`THIRD_PARTY_NOTICES.md` and the pinned OpenZeppelin 5.6.1 notice define the
scope, the relayer and bridge-owned Rust packages declare Apache-2.0, and the
audit preflight rejects a candidate that omits any required license artifact.
Policy permits source publication for research review only after exact
candidate-promotion checks pass. Supported release, security-completion and
readiness claims remain blocked by their respective critical/high gaps.

## WP-09 — External Assurance And Reference-Release Hardening

Only after WP-08 may the project spend sustained effort on completed Gate 5
evidence, independent protocol/contract review closure, SBOM/dependency review,
live non-mainnet rehearsals, governance drills, benchmarks, and the technical
addendum. Gate 6 and Gate 7 can run in parallel when they correspond to real
implemented surfaces.

Gate 5 closes only when root production, anchor authentication, sidechain
finality, inclusion, payout binding, DUP replay rejection, full-transaction VM
acceptance, reorg rejection, and independent review are all linked.

**Definition of Done:** independent protocol and ErgoScript review is complete;
all critical/high findings are fixed or release-blocking; SBOM/dependency review,
clean-checkout CI, live non-mainnet lifecycle, recovery, governance, and honest
benchmark artifacts are reproducible; applicable release gates pass; public
classification remains institutional reference/testnet only and does not claim
mainnet production readiness.

## Parallel Agent Policy

The main agent owns the active package, architecture decisions, shared hot files,
final diff review, verification, staging, and commits.

| Task profile | Agent capability | Typical assignment |
|---|---|---|
| Security-critical protocol, contracts, finality, signing | Strongest available coding model, high or extra-high reasoning | Threat review, invariant review, bounded implementation with explicit files |
| Bounded implementation with clear interfaces | Balanced coding model, high reasoning | Builder, state module, runtime pallet, or VM harness with disjoint ownership |
| File mapping, test inventory, docs consistency | Fast model, medium reasoning | Read-only exploration and acceptance scans |

Rules:

- Prefer one or two meaningful agents over many small agents, and never exceed
  the two-subagent limit above.
- Delegate implementation, not ceremony, when ownership can be disjoint.
- Never give two agents concurrent write ownership of `relayer-daemon.ts`, a
  shared contract, state schema, or the same plan file.
- Security-critical work receives an independent high-reasoning review after
  implementation; the reviewer does not replace main-agent verification.
- Subagents cannot stage, commit, publish, deploy, or broadcast.

## Verification And Commit Cadence

Validation is selected by risk and work phase, not by edit count. Every
material slice declares its risk profile (`light`, `standard`, `strict`, or
`critical`), phase (`iteration`, `checkpoint`, `closeout`, or `promotion`),
task-owned paths, and the transitive input closure of each deciding check.

| Work phase | Validation boundary |
|---|---|
| Iteration | Run only the nearest focused test, parser, compiler, or isolated negative needed to continue. |
| Checkpoint | Run the affected producer, consumer, and cross-language checks once for the coherent package. |
| Closeout | Run the complete applicable transitive closure once on the stable package; strict/critical protocol work also receives independent review. |
| Promotion | Recheck exact promoted bytes, hashes, configuration, current external state, and publication boundaries; reuse unchanged closeout results. |

A green result remains reusable while its source inputs, generated bytes,
configuration, authority pins, and deciding external state are unchanged.
Changing a file outside that closure does not invalidate the result. Advancing
the phase does not itself require a rerun. The checkpoint report records which
results were reused and why their closure remained unchanged.

The full relayer suite is due only when one of these closed reasons applies:

- the user explicitly requests it;
- a coherent fan-out root or shared repository contract changed;
- a focused failure exposes wider impact;
- the package supports a terminal readiness or compatibility claim;
- the package is being promoted or prepared for publication.

`wasm:test` is due when WASM/AVL sources, generated artifacts, locks, or their
deciding consumers changed. A pinned JVM matrix is due when its contracts,
spec, transaction shape, runtime pins, or provenance inputs changed. The
release gate is due when gate logic, evidence, checklist bindings, or release
claims changed. Documentation-only edits do not invalidate these results
unless they change the claim or documented command.

At a commit boundary, review the exact diff and status, run the checks due for
the current phase, run `git diff --check`, stage only the coherent package, run
`git diff --cached --check` and the staged publication guard, then commit
locally. A work package should normally use several medium commits, each
independently coherent and green. Do not create broken checkpoint commits,
test-only micro-commits, or mega-commits spanning unrelated authority surfaces.

## Definition Of Institutional Quality

The reference stack is ready for serious external adoption work only when:

- a clean checkout contains every required source or pinned dependency;
- no external local patch is required to reproduce consensus commitments;
- both bridge directions are fail-closed under reorg and timeout uncertainty;
- the trust model is enforced by code and described without euphemism;
- protocol formats are versioned and covered by cross-language vectors;
- automated tests enforce the allowed dependency boundaries and reject cycles
  or core-to-adapter imports;
- no adapter, local status, or persistence row can bypass mint eligibility,
  settlement predicates, replay protection, or explicit broadcast authority;
- full-transaction VM and system-level adversarial tests are reproducible;
- operator actions are explicit, observable, recoverable, and safe by default;
- no critical/high security finding remains unowned;
- independent reviewers can reproduce the stack without private machine state;
- public claims remain bounded to the evidence actually achieved.

Institutional quality does not require every deployment profile to be
trustless. It requires each profile's deciding authority and failure model to
be enforced and reviewable. A completed WP-06-FED can support an explicitly
federated reference release after its own target acceptance, cutover,
operations, and independent-review closure. Only WP-06-STARK plus complete Gate 5
evidence can support a trustless claim. Neither profile supports a mainnet or
production-readiness claim without the later external assurance gates.
