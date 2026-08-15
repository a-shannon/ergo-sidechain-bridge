# Bridge Readiness Operator Request Bundle

This bundle converts the current readiness handoff into a compact request list for operators and reviewers.
It is planning output only and does not close evidence rows, authorize claims, deploy, sign, submit, rotate keys, or broadcast transactions.

## Summary

| Field | Value |
| --- | --- |
| Result | REQUESTS_READY |
| Source commit | cc9b0417 |
| Handoff source | ../evidence/readiness/readiness-handoff-current-lanes-2026-07-09-cc9b0417.json |
| Local evidence requests | 0 |
| Node-backed or live evidence requests | 10 |
| Reviewer or external requests | 59 |
| Lane request packets | 4 |
| Operator input checklists | 19 |

## Immediate Actions

- Independent security review: Collect the independent reviewer, scope, finding, negative-check, and publication-boundary artifacts, then run the security review validator on the completed evidence document.
- Trustless burn verification: Use the compact unsigned candidate PASS validation as the source-boundary handoff, then collect the requested non-mainnet proof-acceptance artifacts and run the trustless burn validator on the completed evidence document.
- Benchmark and scaling evidence: Collect the requested live batch settlement benchmark artifact, then run the benchmark validator on the completed evidence document.
- Committee governance and key rotation: Collect the requested key-rotation and network-scope artifacts, then run the governance validator on the completed evidence document.

## Request Summary By Lane

| Lane | Local | Live/node-backed | Reviewer/external | First action |
| --- | --- | --- | --- | --- |
| Independent security review | 0 | 4 | 35 | Collect the independent reviewer, scope, finding, negative-check, and publication-boundary artifacts, then run the security review validator on the completed evidence document. |
| Trustless burn verification | 0 | 5 | 13 | Use the compact unsigned candidate PASS validation as the source-boundary handoff, then collect the requested non-mainnet proof-acceptance artifacts and run the trustless burn validator on the completed evidence document. |
| Benchmark and scaling evidence | 0 | 1 | 4 | Collect the requested live batch settlement benchmark artifact, then run the benchmark validator on the completed evidence document. |
| Committee governance and key rotation | 0 | 0 | 7 | Collect the requested key-rotation and network-scope artifacts, then run the governance validator on the completed evidence document. |

## Independent security review

| Field | Value |
| --- | --- |
| Evidence template | ../docs/independent-security-review-evidence-template.md |
| Validator command | npm run security:validate -- <completed-independent-security-review.md> |
| Release-gate flag | --security-review-evidence <completed-independent-security-review.md> |
| Triage target | ../evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md |
| Current prerequisite map | ../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md |
| Supporting packets | ../evidence/security/gate4-independent-security-external-review-packet-2026-07-09-c6fea203.md<br>../evidence/security/gate4-independent-security-review-input-manifest-2026-07-09-cc9b0417.md |
| Closure boundary | Gate 4 remains blocked until a concrete independent review approves the scoped evidence and keeps production-ready, mainnet, publication, deployment, signing, submit, and broadcast boundaries closed. |

Operator inputs:

- External reviewer packet: concrete independent reviewer organization or affiliation, organization type, lead reviewer, review period, reviewed commit, release scope, and final decision fields.
- Scope and evidence packet: area-specific scope coverage, command evidence, lifecycle, recovery, batch settlement, dependency, Gate 5, Gate 6, Gate 7, and release-note/checklist evidence as applicable.
- Finding and negative-check packet: finding-class disposition, accepted-risk disposition, publication blocker closure, and question-specific negative security-review checks.
- Boundary confirmation: no audit approval, accepted-risk closure, production-ready claim, publication, deployment, signing, submit, broadcast, runtime DB read, or private deployment-state read from this handoff.

Live or node-backed evidence still needed:

- Required Evidence Package: Fresh local devnet rehearsal: status must be linked before security review evidence can pass
- Required Evidence Package: Fresh testnet rehearsal: status must be linked before security review evidence can pass
- Required Evidence Package: Failed broadcast / phantom AVL drill: status must be linked before security review evidence can pass
- Required Evidence Package: Batch settlement check/submit/confirm rehearsal: status must be linked before security review evidence can pass

Reviewer or external decisions still needed:

- Review Classification: Final decision must be approve before security review evidence can pass
- Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass
- Required Scope Coverage: ErgoScript contracts: status must be linked before security review evidence can pass
- Required Scope Coverage: Relayer signing: coverage must be covered before Gate 4 evidence can pass
- Required Scope Coverage: Relayer signing: status must be linked before security review evidence can pass
- Required Scope Coverage: AVL proof generation: coverage must be covered before Gate 4 evidence can pass
- Required Scope Coverage: AVL proof generation: status must be linked before security review evidence can pass
- Required Scope Coverage: Settlement reconciliation: coverage must be covered before Gate 4 evidence can pass
- Required Scope Coverage: Settlement reconciliation: status must be linked before security review evidence can pass
- Required Scope Coverage: Sidechain finality and burn validity: coverage must be covered before Gate 4 evidence can pass
- Required Scope Coverage: Sidechain finality and burn validity: status must be linked before security review evidence can pass
- Required Scope Coverage: Operator recovery: coverage must be covered before Gate 4 evidence can pass
- Required Scope Coverage: Operator recovery: status must be linked before security review evidence can pass
- Required Scope Coverage: Dependency risk: coverage must be covered before Gate 4 evidence can pass
- Required Scope Coverage: Dependency risk: status must be linked before security review evidence can pass
- Finding Disposition: Critical findings: status must be linked before security review evidence can pass
- Finding Disposition: High findings: status must be linked before security review evidence can pass
- Finding Disposition: Medium findings: status must be linked before security review evidence can pass
- Finding Disposition: Low findings: status must be linked before security review evidence can pass
- Finding Disposition: Informational findings: status must be linked before security review evidence can pass
- Finding Disposition: Accepted risks: status must be linked before security review evidence can pass
- Finding Disposition: Publication blockers: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can a production path sign through the Ergo node wallet?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can default production/testnet mode sign an unsafe ContextExtension shape?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can a failed broadcast or reorg insert a phantom DUP key?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can a batch settlement accept a wrong-recipient, low-value, or reused payout?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can a same-recipient batch collision pay fewer outputs than expected?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can stale SPV tracker or DUP history build against the wrong singleton digest?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can trusted burn interpretation be mistaken for trustless verification?: status must be linked before security review evidence can pass
- Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: status must be linked before security review evidence can pass
- Reviewer Sign-Off: Lead reviewer: decision must be approve before security review evidence can pass
- Reviewer Sign-Off: Security owner: decision must be approve before security review evidence can pass
- Reviewer Sign-Off: Maintainer: decision must be approve before security review evidence can pass
- Reviewer Sign-Off: Operator reviewer: decision must be approve before security review evidence can pass

Local evidence still needed:

- None.

## Trustless burn verification

| Field | Value |
| --- | --- |
| Evidence template | ../docs/trustless-burn-verification-evidence-template.md |
| Validator command | npm run trustless:validate -- <completed-trustless-burn-evidence.md> |
| Release-gate flag | --trustless-burn-evidence <completed-trustless-burn-evidence.md> |
| Triage target | ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-07-03-1a24c7ae.md |
| Current prerequisite map | ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md |
| Supporting packets | ../evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-07-2401733f.md<br>../evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md<br>../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md<br>../evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-faf05c0b.md<br>../evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-faf05c0b.md |
| Closure boundary | Candidate proof-vector or candidate settlement JSON alone does not close Gate 5; completed protocol evidence plus reviewer sign-off is still required. |

Operator inputs:

- Proof-path packet: sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path.
- Compact unsigned candidate packet: completed npm run trustless:unsigned-tx JSON at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-07-faf05c0b.json plus validation report at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md showing contextExtensionGuard = pass, transactionCheck = no, expectedTxId = no, signing = no, and submit = no before any signed node-backed /transactions/check packet. Executing that check requires explicit non-mainnet local-signing/check approval.
- Aggregate prebroadcast packet: after explicit non-mainnet local-signing/check approval, run npm run settle:aggregate -- check-with-ingest <sidechainTxHash> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight> --state-db <operator-read-only-state-db.sqlite> --deployed-state-json <sanitized-deployed-state.json> --evidence-json <completed-aggregate-prebroadcast-evidence.json>; the JSON must include sourceBindings.state targetClass = operator-provided-state-db, sourceBindings.deployedState targetClass = operator-provided-deployed-state-json, runtimePathSerialized = false, defaultFallbackUsed = false, defaultLoaderUsed = false, /transactions/check PASS, Expected transaction ID, claim rows, and settlement shape. Do not attach raw DB rows or private deployed-state dumps; this is not submit, reconciliation, deployment, or broadcast approval.
- Anchor observation packet: sanitized public extension-observation JSON plus completed npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <sanitized-public-observations.json> --min-height <n> --max-height <n> --json-out <completed-report.json> report target, with the observed 0x0401 bridgeEventRoot bound to the proof-path packet.
- SPV tracker observation packet: sanitized public observation JSON plus completed npm run trustless:spv-tracker-observe -- --observation-json <sanitized-public-observation.json> --json-out <completed-report.json> report target, with tracker key, value, and digest matched to the recomputed observation.
- Observation reconciliation packet: completed npm run trustless:observation-reconcile -- --anchor-report-json <completed-anchor-observation-report.json> --spv-tracker-report-json <completed-spv-tracker-observation-report.json> --json-out <completed-reconciliation-report.json> target; current command-specific reconciliation at ../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-09-a21efc0b.md shows the refreshed testnet anchor observation remains BLOCKED after 720 successful extension reads at heights 434811..435530 because no matching 0x0401 bridgeEventRoot was observed, while SPV tracker linked-local prerequisite evidence still matches the bridgeEventRoot without a linked testnet anchor height, so the next packet must produce a LINKED anchor observation and bind one shared bridgeEventRoot and Ergo anchor height across anchor, SPV, proof-vector, and settlement-binding evidence.
- Proof-vector validation packet: current local proof-vector report at ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json and validation report at ../evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md, plus current SPV-linked candidate at ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md and compact unsigned transaction validation at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md. Treat them as source-boundary local proof-core evidence only; they do not close Gate 5, prove anchoring or finality, authorize /transactions/check, settlement readiness, signing, submit, or broadcast.
- Execution request packet: current non-mainnet execution request at ../evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md plus JSON at ../evidence/trustless-burn/artifacts/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.json, bound to the 2401733f prerequisite map, 2401733f operator packet, and the refreshed faf05c0b SPV-linked candidate, compact unsigned transaction, instance binding, and instance refresh chain. Treat it as an operator request only; it does not authorize signing, /transactions/check, submit, broadcast, Gate 5 closure, or production claims.
- Acceptance-boundary packet: positive proof acceptance evidence plus reviewer notes confirming no Gate 5 closure, no settlement readiness, no broadcast authorization, and no production claim support from local proof-core evidence alone.

Live or node-backed evidence still needed:

- Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass
- Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass
- Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass
- Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass
- Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass

Reviewer or external decisions still needed:

- Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0
- Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings
- Publication Decision: Reviewer decision summary must use exact Trustless burn verification implemented = yes
- Publication Decision: Reviewer decision summary must use exact Transitional trusted burn path disabled = yes
- Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0
- Publication Decision: Reviewer decision summary must not leave critical/high findings open
- Publication Decision: Reviewer decision summary: transitional trusted burn path handling must be disabled, blocked, or not allowed
- Required Components: Independent review: status must be linked before Gate 5 evidence can pass
- Reviewer Sign-Off: Protocol reviewer: decision must be approve before Gate 5 evidence can pass
- Reviewer Sign-Off: Security reviewer: decision must be approve before Gate 5 evidence can pass
- Reviewer Sign-Off: Security reviewer: notes must state a concrete trustless-burn outcome
- Reviewer Sign-Off: Operator reviewer: decision must be approve before Gate 5 evidence can pass
- Reviewer Sign-Off: Operator reviewer: notes must state a concrete trustless-burn outcome

Local evidence still needed:

- None.

## Benchmark and scaling evidence

| Field | Value |
| --- | --- |
| Evidence template | ../docs/performance-benchmark-evidence-template.md |
| Validator command | npm run benchmark:validate -- <completed-benchmark-evidence.md> |
| Release-gate flag | --benchmark-evidence <completed-benchmark-evidence.md> |
| Triage target | ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-05f25f0e.md |
| Current prerequisite map | ../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md |
| Supporting packets | ../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md<br>../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-cc9b0417.md<br>../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-cc9b0417.md |
| Closure boundary | Benchmark data can support bounded scaling claims only after completed command-specific outputs, reviewer sign-off, and claim-boundary rows pass validation. |

Operator inputs:

- Live batch settlement packet: Expected transaction ID, submitted transaction ID, confirmation and reconciliation evidence, live batch transaction identity, sample count at least 3, and concrete 32-byte transaction or reconciliation digest.
- Live-readiness packet: current capture manifest at ../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-cc9b0417.md and execution request at ../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-cc9b0417.md plus JSON at ../evidence/benchmarks/artifacts/gate7-live-benchmark-execution-request-2026-07-09-cc9b0417.json, followed only after user explicit live broadcast approval bound to the Expected transaction ID, scoped BRIDGE_BROADCAST_ENABLED=true evidence, demo:readiness PASS, broadcast policy PASS, live settlement signing PASS, and network reconfirmation.
- Metric-boundary packet: positive measurements with units for throughput, latency, build time, proof size, transaction size, inputs, outputs, context-extension Vars, and batch size; no production throughput or mainnet-grade claim approval.

Live or node-backed evidence still needed:

- Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass

Reviewer or external decisions still needed:

- Publication Decision: Reviewer decision summary: open benchmark blockers must be 0
- Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass
- Reviewer Sign-Off: Security reviewer: decision must be approve before benchmark evidence can pass
- Reviewer Sign-Off: Operator reviewer: decision must be approve before benchmark evidence can pass

Local evidence still needed:

- None.

## Committee governance and key rotation

| Field | Value |
| --- | --- |
| Evidence template | ../docs/committee-governance-evidence-template.md |
| Validator command | npm run governance:validate -- <completed-committee-governance-evidence.md> |
| Release-gate flag | --governance-evidence <completed-committee-governance-evidence.md> |
| Triage target | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-03-7f516dcc.md |
| Current prerequisite map | ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-09-57a50625.md |
| Supporting packets | ../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-09-57a50625.md |
| Closure boundary | Do not flip governance-ready or claim/publication fields until completed governance evidence and external review bindings pass validation. |

Operator inputs:

- Sanitized deployment-state reconciliation packet: network name or chain id, sidechain id, SCS NFT id, singleton box ids or hashes, governance contract hashes, old and new committee public key or hash identifiers, and npm run governance:reconcile:validate command output with exit code 0.
- Wrong-network negative evidence: sanitized rejected or blocked result that names the deployment-state target, expected network, observed mismatched network, stop condition, and npm run governance:reconcile:validate command output with exit code 0 without exposing private deployment-state content.
- Boundary confirmation: no .env values, secrets, mnemonics, private DB rows, private deployment-state file dumps, signing, key rotation, state mutation, deploy, submit, or broadcast.

Live or node-backed evidence still needed:

- None.

Reviewer or external decisions still needed:

- Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes
- Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0
- Publication Rules: Reviewer decision summary: open governance blockers must be 0
- Publication Rules: External review evidence must include a link, command, or artifact marker
- Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass
- Reviewer Sign-Off: Security reviewer: decision must be approve before committee governance evidence can pass
- Reviewer Sign-Off: Operator reviewer: decision must be approve before committee governance evidence can pass

Local evidence still needed:

- None.

## Do Not Provide

- Do not send .env values, API keys, mnemonics, private keys, wallet material, or seed phrases.
- Do not send raw runtime databases, private bridge-state SQLite files, or private deployment-state file dumps.
- Do not approve signing, key rotation, transaction submit, broadcast, deployment, publication, PR, or mainnet activity through this bundle.
- Do not use this bundle as evidence-row closure, release-gate PASS evidence, governance-ready support, production-ready support, or mainnet readiness support.

## Boundary

| Boundary | Value |
| --- | --- |
| Planning output only | yes |
| Readiness handoff JSON reused | yes |
| Live node probe executed by operator-request command | no |
| ERGO_API_KEY read | no |
| Auth header sent | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Private key material serialized | no |
| Evidence row closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Claim/publication fields unlocked | no |
| Transaction broadcast, submit, deploy, key rotation, or state mutation performed | no |
