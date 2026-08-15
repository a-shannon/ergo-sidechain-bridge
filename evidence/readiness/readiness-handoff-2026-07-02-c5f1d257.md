# Bridge Readiness External Handoff

This report turns the current readiness prerequisite result into concrete work packets for local operators and external reviewers.
It is planning output only and does not close release evidence, authorize claims, deploy, sign, submit, or broadcast transactions.

## Summary

| Field | Value |
|---|---|
| Command | npm run readiness:handoff -- --runtime-prereqs-json ../evidence/readiness/runtime-prereqs-2026-07-02-c5f1d257.json --out <report.md> --json-out <report.json> |
| Handoff result | ACTION_REQUIRED |
| Runtime prerequisite result | READY |
| Runtime prerequisite source | ../evidence/readiness/runtime-prereqs-2026-07-02-c5f1d257.json |
| Total unresolved structural issues | 40 |
| Local-only issues | 0 |
| Node-backed/live-drill issues | 9 |
| Reviewer/external issues | 24 |
| Claim/publication-boundary issues | 7 |
| Manual triage issues | 0 |
| Local closure status | External Or Live Required |
| Node preflight | PASS |
| Anchor preflight | FAIL |
| Node endpoint | http://213.239.193.208:9052 |
| Local closure summary | No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers. |

## Work Packages

| Work package | Status | Issues | Action |
|---|---:|---:|---|
| Local evidence cleanup | complete | 0 | No local-only closure candidates remain in the current triage. |
| Non-mainnet or live drill evidence | action-required | 9 | Collect concrete node-backed or live-drill evidence for Benchmark and scaling evidence, Committee governance and key rotation and Trustless burn verification. |
| Reviewer or external decisions | action-required | 24 | Prepare reviewer packets and external decision material after the runtime evidence is concrete. |
| Claim and publication boundary | blocked | 7 | Keep claim and publication fields blocked until runtime evidence and reviewer decisions resolve. |

## Node-Backed And Live Evidence Requests

| Area | Required evidence |
|---|---|
| Trustless burn verification | Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass |
| Trustless burn verification | Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass |
| Committee governance and key rotation | Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass |
| Committee governance and key rotation | Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass |
| Benchmark and scaling evidence | Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass |

## Lane Packets

| Lane | Requests | Template | Validator command | Release-gate flag |
|---|---:|---|---|---|
| Trustless burn verification | 6 | ../docs/trustless-burn-verification-evidence-template.md | npm run trustless:validate -- <completed-trustless-burn-evidence.md> | --trustless-burn-evidence <completed-trustless-burn-evidence.md> |
| Committee governance and key rotation | 2 | ../docs/committee-governance-evidence-template.md | npm run governance:validate -- <completed-committee-governance-evidence.md> | --governance-evidence <completed-committee-governance-evidence.md> |
| Benchmark and scaling evidence | 1 | ../docs/performance-benchmark-evidence-template.md | npm run benchmark:validate -- <completed-benchmark-evidence.md> | --benchmark-evidence <completed-benchmark-evidence.md> |

## Lane Packet Details

### Trustless burn verification

- Triage target: ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-5d075bd9.md
- Current prerequisite map: ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-02-197c4459.md
- Next operator step: Collect the requested non-mainnet proof-path artifacts, then run the trustless burn validator on the completed evidence document.
- Closure boundary: Candidate proof-vector or candidate settlement JSON alone does not close Gate 5; completed protocol evidence plus reviewer sign-off is still required.
- Operator evidence inputs:
  - Proof-path packet: sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path.
  - Anchor observation packet: sanitized public extension-observation JSON plus completed npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <sanitized-public-observations.json> --min-height <n> --max-height <n> --json-out <completed-report.json> report target, with the observed 0x0401 bridgeEventRoot bound to the proof-path packet.
  - SPV tracker observation packet: sanitized public observation JSON plus completed npm run trustless:spv-tracker-observe -- --observation-json <sanitized-public-observation.json> --json-out <completed-report.json> report target, with tracker key, value, and digest matched to the recomputed observation.
  - Proof-vector validation packet: completed npm run trustless:proof-vector:validate JSON report target, embedded matching multi-leaf proof vector, and required fail-closed negative cases.
  - Acceptance-boundary packet: positive proof acceptance evidence plus reviewer notes confirming no Gate 5 closure, no settlement readiness, no broadcast authorization, and no production claim support from local proof-core evidence alone.
- Requested evidence:
  - Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass
  - Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass
  - Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass
  - Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass
  - Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass
  - Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass

### Committee governance and key rotation

- Triage target: ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-29-f341ad8c.md
- Current prerequisite map: ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-fb143710.md
- Next operator step: Collect the requested key-rotation and network-scope artifacts, then run the governance validator on the completed evidence document.
- Closure boundary: Do not flip governance-ready or claim/publication fields until completed governance evidence and external review bindings pass validation.
- Operator evidence inputs:
  - Sanitized deployment-state reconciliation packet: network name or chain id, sidechain id, SCS NFT id, singleton box ids or hashes, governance contract hashes, old and new committee public key or hash identifiers, and npm run governance:reconcile:validate command output with exit code 0.
  - Wrong-network negative evidence: sanitized rejected or blocked result that names the deployment-state target, expected network, observed mismatched network, stop condition, and npm run governance:reconcile:validate command output with exit code 0 without exposing private deployment-state content.
  - Boundary confirmation: no .env values, secrets, mnemonics, private DB rows, private deployment-state file dumps, signing, key rotation, state mutation, deploy, submit, or broadcast.
- Requested evidence:
  - Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass
  - Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass

### Benchmark and scaling evidence

- Triage target: ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-01-5d37c906.md
- Current prerequisite map: ../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-02-860dce7f.md
- Next operator step: Collect the requested live batch settlement benchmark artifact, then run the benchmark validator on the completed evidence document.
- Closure boundary: Benchmark data can support bounded scaling claims only after completed command-specific outputs, reviewer sign-off, and claim-boundary rows pass validation.
- Operator evidence inputs:
  - Live batch settlement packet: Expected transaction ID, submitted transaction ID, confirmation and reconciliation evidence, live batch transaction identity, sample count at least 3, and concrete 32-byte transaction or reconciliation digest.
  - Live-readiness packet: user explicit live broadcast approval bound to the Expected transaction ID, scoped BRIDGE_BROADCAST_ENABLED=true evidence, demo:readiness PASS, broadcast policy PASS, live settlement signing PASS, and network reconfirmation.
  - Metric-boundary packet: positive measurements with units for throughput, latency, build time, proof size, transaction size, inputs, outputs, context-extension Vars, and batch size; no production throughput or mainnet-grade claim approval.
- Requested evidence:
  - Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass

## Next Actions

- Collect node-backed or live-drill evidence for Benchmark and scaling evidence, Committee governance and key rotation and Trustless burn verification.
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
