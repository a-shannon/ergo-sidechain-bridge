# Bridge Readiness External Handoff

This report turns the current readiness prerequisite result into concrete work packets for local operators and external reviewers.
It is planning output only and does not close release evidence, authorize claims, deploy, sign, submit, or broadcast transactions.

## Summary

| Field | Value |
|---|---|
| Command | npm run readiness:handoff -- --runtime-prereqs-json ../evidence/readiness/runtime-prereqs-current-lanes-2026-07-03-3c037335.json --out <report.md> --json-out <report.json> |
| Handoff result | ACTION_REQUIRED |
| Source commit | 3c037335 |
| Runtime prerequisite result | READY |
| Runtime prerequisite source | ../evidence/readiness/runtime-prereqs-current-lanes-2026-07-03-3c037335.json |
| Total unresolved structural issues | 81 |
| Local-only issues | 0 |
| Node-backed/live-drill issues | 11 |
| Reviewer/external issues | 59 |
| Claim/publication-boundary issues | 11 |
| Manual triage issues | 0 |
| Local closure status | External Or Live Required |
| Node preflight | PASS |
| Anchor preflight | FAIL |
| Node endpoint | http://213.239.193.208:9052 |
| Local closure summary | No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers. |
| Local evidence requests | 0 |
| Live evidence requests | 11 |
| Reviewer/external requests | 59 |

## Work Packages

| Work package | Status | Issues | Action |
|---|---:|---:|---|
| Local evidence cleanup | complete | 0 | No local-only closure candidates remain in the current triage. |
| Non-mainnet or live drill evidence | action-required | 11 | Collect concrete node-backed or live-drill evidence for Benchmark and scaling evidence, Independent security review and Trustless burn verification. |
| Reviewer or external decisions | action-required | 59 | Prepare reviewer packets and external decision material after the runtime evidence is concrete. |
| Claim and publication boundary | blocked | 11 | Keep claim and publication fields blocked until runtime evidence and reviewer decisions resolve. |

## Local Evidence Requests

- No local evidence requests were carried into this handoff.

## Node-Backed And Live Evidence Requests

| Area | Required evidence |
|---|---|
| Independent security review | Required Evidence Package: Fresh local devnet rehearsal: status must be linked before security review evidence can pass |
| Independent security review | Required Evidence Package: Fresh testnet rehearsal: status must be linked before security review evidence can pass |
| Independent security review | Required Evidence Package: Failed broadcast / phantom AVL drill: status must be linked before security review evidence can pass |
| Independent security review | Required Evidence Package: Batch settlement check/submit/confirm rehearsal: status must be linked before security review evidence can pass |
| Trustless burn verification | Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass |
| Benchmark and scaling evidence | Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass |

## Reviewer/External Decision Requests

| Area | Required decision/evidence |
|---|---|
| Independent security review | Review Classification: Final decision must be approve before security review evidence can pass |
| Independent security review | Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass |
| Independent security review | Required Scope Coverage: ErgoScript contracts: status must be linked before security review evidence can pass |
| Independent security review | Required Scope Coverage: Relayer signing: coverage must be covered before Gate 4 evidence can pass |
| Independent security review | Required Scope Coverage: Relayer signing: status must be linked before security review evidence can pass |
| Independent security review | Required Scope Coverage: AVL proof generation: coverage must be covered before Gate 4 evidence can pass |
| Independent security review | Required Scope Coverage: AVL proof generation: status must be linked before security review evidence can pass |
| Independent security review | Required Scope Coverage: Settlement reconciliation: coverage must be covered before Gate 4 evidence can pass |
| Independent security review | Required Scope Coverage: Settlement reconciliation: status must be linked before security review evidence can pass |
| Independent security review | Required Scope Coverage: Sidechain finality and burn validity: coverage must be covered before Gate 4 evidence can pass |
| Independent security review | Required Scope Coverage: Sidechain finality and burn validity: status must be linked before security review evidence can pass |
| Independent security review | Required Scope Coverage: Operator recovery: coverage must be covered before Gate 4 evidence can pass |
| Independent security review | Required Scope Coverage: Operator recovery: status must be linked before security review evidence can pass |
| Independent security review | Required Scope Coverage: Dependency risk: coverage must be covered before Gate 4 evidence can pass |
| Independent security review | Required Scope Coverage: Dependency risk: status must be linked before security review evidence can pass |
| Independent security review | Finding Disposition: Critical findings: status must be linked before security review evidence can pass |
| Independent security review | Finding Disposition: High findings: status must be linked before security review evidence can pass |
| Independent security review | Finding Disposition: Medium findings: status must be linked before security review evidence can pass |
| Independent security review | Finding Disposition: Low findings: status must be linked before security review evidence can pass |
| Independent security review | Finding Disposition: Informational findings: status must be linked before security review evidence can pass |
| Independent security review | Finding Disposition: Accepted risks: status must be linked before security review evidence can pass |
| Independent security review | Finding Disposition: Publication blockers: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can a production path sign through the Ergo node wallet?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can default production/testnet mode sign an unsafe ContextExtension shape?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can a failed broadcast or reorg insert a phantom DUP key?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can a batch settlement accept a wrong-recipient, low-value, or reused payout?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can a same-recipient batch collision pay fewer outputs than expected?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can stale SPV tracker or DUP history build against the wrong singleton digest?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can trusted burn interpretation be mistaken for trustless verification?: status must be linked before security review evidence can pass |
| Independent security review | Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: status must be linked before security review evidence can pass |
| Independent security review | Reviewer Sign-Off: Lead reviewer: decision must be approve before security review evidence can pass |
| Independent security review | Reviewer Sign-Off: Security owner: decision must be approve before security review evidence can pass |
| Independent security review | Reviewer Sign-Off: Maintainer: decision must be approve before security review evidence can pass |
| Independent security review | Reviewer Sign-Off: Operator reviewer: decision must be approve before security review evidence can pass |
| Trustless burn verification | Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0 |
| Trustless burn verification | Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings |
| Trustless burn verification | Publication Decision: Reviewer decision summary must use exact Trustless burn verification implemented = yes |
| Trustless burn verification | Publication Decision: Reviewer decision summary must use exact Transitional trusted burn path disabled = yes |
| Trustless burn verification | Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0 |
| Trustless burn verification | Publication Decision: Reviewer decision summary must not leave critical/high findings open |
| Trustless burn verification | Publication Decision: Reviewer decision summary: transitional trusted burn path handling must be disabled, blocked, or not allowed |
| Trustless burn verification | Required Components: Independent review: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Reviewer Sign-Off: Protocol reviewer: decision must be approve before Gate 5 evidence can pass |
| Trustless burn verification | Reviewer Sign-Off: Security reviewer: decision must be approve before Gate 5 evidence can pass |
| Trustless burn verification | Reviewer Sign-Off: Security reviewer: notes must state a concrete trustless-burn outcome |
| Trustless burn verification | Reviewer Sign-Off: Operator reviewer: decision must be approve before Gate 5 evidence can pass |
| Trustless burn verification | Reviewer Sign-Off: Operator reviewer: notes must state a concrete trustless-burn outcome |
| Committee governance and key rotation | Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes |
| Committee governance and key rotation | Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0 |
| Committee governance and key rotation | Publication Rules: Reviewer decision summary: open governance blockers must be 0 |
| Committee governance and key rotation | Publication Rules: External review evidence must include a link, command, or artifact marker |
| Committee governance and key rotation | Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass |
| Committee governance and key rotation | Reviewer Sign-Off: Security reviewer: decision must be approve before committee governance evidence can pass |
| Committee governance and key rotation | Reviewer Sign-Off: Operator reviewer: decision must be approve before committee governance evidence can pass |
| Benchmark and scaling evidence | Publication Decision: Reviewer decision summary: open benchmark blockers must be 0 |
| Benchmark and scaling evidence | Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass |
| Benchmark and scaling evidence | Reviewer Sign-Off: Security reviewer: decision must be approve before benchmark evidence can pass |
| Benchmark and scaling evidence | Reviewer Sign-Off: Operator reviewer: decision must be approve before benchmark evidence can pass |

## Lane Packets

| Lane | Requests | Template | Validator command | Release-gate flag |
|---|---:|---|---|---|
| Independent security review | 39 | ../docs/independent-security-review-evidence-template.md | npm run security:validate -- <completed-independent-security-review.md> | --security-review-evidence <completed-independent-security-review.md> |
| Trustless burn verification | 19 | ../docs/trustless-burn-verification-evidence-template.md | npm run trustless:validate -- <completed-trustless-burn-evidence.md> | --trustless-burn-evidence <completed-trustless-burn-evidence.md> |
| Benchmark and scaling evidence | 5 | ../docs/performance-benchmark-evidence-template.md | npm run benchmark:validate -- <completed-benchmark-evidence.md> | --benchmark-evidence <completed-benchmark-evidence.md> |
| Committee governance and key rotation | 7 | ../docs/committee-governance-evidence-template.md | npm run governance:validate -- <completed-committee-governance-evidence.md> | --governance-evidence <completed-committee-governance-evidence.md> |

## Lane Packet Details

### Independent security review

- Triage target: ../evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md
- Current prerequisite map: ../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-03-566916ce.md
- Next operator step: Collect the independent reviewer, scope, finding, negative-check, and publication-boundary artifacts, then run the security review validator on the completed evidence document.
- Closure boundary: Gate 4 remains blocked until a concrete independent review approves the scoped evidence and keeps production-ready, mainnet, publication, deployment, signing, submit, and broadcast boundaries closed.
- Operator evidence inputs:
  - External reviewer packet: concrete independent reviewer organization or affiliation, organization type, lead reviewer, review period, reviewed commit, release scope, and final decision fields.
  - Scope and evidence packet: area-specific scope coverage, command evidence, lifecycle, recovery, batch settlement, dependency, Gate 5, Gate 6, Gate 7, and release-note/checklist evidence as applicable.
  - Finding and negative-check packet: finding-class disposition, accepted-risk disposition, publication blocker closure, and question-specific negative security-review checks.
  - Boundary confirmation: no audit approval, accepted-risk closure, production-ready claim, publication, deployment, signing, submit, broadcast, runtime DB read, or private deployment-state read from this handoff.
- Requested evidence:
  - Required Evidence Package: Fresh local devnet rehearsal: status must be linked before security review evidence can pass
  - Required Evidence Package: Fresh testnet rehearsal: status must be linked before security review evidence can pass
  - Required Evidence Package: Failed broadcast / phantom AVL drill: status must be linked before security review evidence can pass
  - Required Evidence Package: Batch settlement check/submit/confirm rehearsal: status must be linked before security review evidence can pass
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

### Trustless burn verification

- Triage target: ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-5d075bd9.md
- Current prerequisite map: ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-03-21f42191.md
- Next operator step: Collect the requested non-mainnet proof-path artifacts, then run the trustless burn validator on the completed evidence document.
- Closure boundary: Candidate proof-vector or candidate settlement JSON alone does not close Gate 5; completed protocol evidence plus reviewer sign-off is still required.
- Operator evidence inputs:
  - Proof-path packet: sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path.
  - Anchor observation packet: sanitized public extension-observation JSON plus completed npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <sanitized-public-observations.json> --min-height <n> --max-height <n> --json-out <completed-report.json> report target, with the observed 0x0401 bridgeEventRoot bound to the proof-path packet.
  - SPV tracker observation packet: sanitized public observation JSON plus completed npm run trustless:spv-tracker-observe -- --observation-json <sanitized-public-observation.json> --json-out <completed-report.json> report target, with tracker key, value, and digest matched to the recomputed observation.
  - Observation reconciliation packet: completed npm run trustless:observation-reconcile -- --anchor-report-json <completed-anchor-observation-report.json> --spv-tracker-report-json <completed-spv-tracker-observation-report.json> --json-out <completed-reconciliation-report.json> target; current command-specific reconciliation at ../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-03-af70f9c8.md shows anchor observation BLOCKED because no matching 0x0401 bridgeEventRoot was observed in the scanned testnet window, SPV tracker linked-local prerequisite evidence, and matching bridgeEventRoot inputs, so the next packet must produce a LINKED anchor observation and bind one shared bridgeEventRoot and Ergo anchor height across anchor, SPV, proof-vector, and settlement-binding evidence.
  - Proof-vector validation packet: completed npm run trustless:proof-vector:validate JSON report target, embedded matching multi-leaf proof vector, and required fail-closed negative cases.
  - Acceptance-boundary packet: positive proof acceptance evidence plus reviewer notes confirming no Gate 5 closure, no settlement readiness, no broadcast authorization, and no production claim support from local proof-core evidence alone.
- Requested evidence:
  - Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass
  - Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass
  - Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass
  - Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass
  - Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass
  - Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass
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

### Benchmark and scaling evidence

- Triage target: ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-03-37d1f8f7.md
- Current prerequisite map: ../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-03-37d1f8f7.md
- Next operator step: Collect the requested live batch settlement benchmark artifact, then run the benchmark validator on the completed evidence document.
- Closure boundary: Benchmark data can support bounded scaling claims only after completed command-specific outputs, reviewer sign-off, and claim-boundary rows pass validation.
- Operator evidence inputs:
  - Live batch settlement packet: Expected transaction ID, submitted transaction ID, confirmation and reconciliation evidence, live batch transaction identity, sample count at least 3, and concrete 32-byte transaction or reconciliation digest.
  - Live-readiness packet: user explicit live broadcast approval bound to the Expected transaction ID, scoped BRIDGE_BROADCAST_ENABLED=true evidence, demo:readiness PASS, broadcast policy PASS, live settlement signing PASS, and network reconfirmation.
  - Metric-boundary packet: positive measurements with units for throughput, latency, build time, proof size, transaction size, inputs, outputs, context-extension Vars, and batch size; no production throughput or mainnet-grade claim approval.
- Requested evidence:
  - Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass
  - Publication Decision: Reviewer decision summary: open benchmark blockers must be 0
  - Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass
  - Reviewer Sign-Off: Security reviewer: decision must be approve before benchmark evidence can pass
  - Reviewer Sign-Off: Operator reviewer: decision must be approve before benchmark evidence can pass

### Committee governance and key rotation

- Triage target: ../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-03-7f516dcc.md
- Current prerequisite map: ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-03-924e3205.md
- Next operator step: Collect the requested key-rotation and network-scope artifacts, then run the governance validator on the completed evidence document.
- Closure boundary: Do not flip governance-ready or claim/publication fields until completed governance evidence and external review bindings pass validation.
- Operator evidence inputs:
  - Sanitized deployment-state reconciliation packet: network name or chain id, sidechain id, SCS NFT id, singleton box ids or hashes, governance contract hashes, old and new committee public key or hash identifiers, and npm run governance:reconcile:validate command output with exit code 0.
  - Wrong-network negative evidence: sanitized rejected or blocked result that names the deployment-state target, expected network, observed mismatched network, stop condition, and npm run governance:reconcile:validate command output with exit code 0 without exposing private deployment-state content.
  - Boundary confirmation: no .env values, secrets, mnemonics, private DB rows, private deployment-state file dumps, signing, key rotation, state mutation, deploy, submit, or broadcast.
- Requested evidence:
  - Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes
  - Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0
  - Publication Rules: Reviewer decision summary: open governance blockers must be 0
  - Publication Rules: External review evidence must include a link, command, or artifact marker
  - Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass
  - Reviewer Sign-Off: Security reviewer: decision must be approve before committee governance evidence can pass
  - Reviewer Sign-Off: Operator reviewer: decision must be approve before committee governance evidence can pass

## Next Actions

- Collect node-backed or live-drill evidence for Benchmark and scaling evidence, Independent security review and Trustless burn verification.
- Route reviewer and external blockers into human review packets with concrete evidence targets.
- Keep claim and publication fields blocked until runtime evidence plus reviewer or external decisions are resolved.

## Boundary

| Boundary | Value |
|---|---|
| Planning output only | yes |
| Runtime prerequisites JSON reused | yes |
| Readiness triage JSON reused | yes |
| Node preflight JSON reused | yes |
| Anchor preflight JSON reused | yes |
| Live node probe executed by handoff command | no |
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
