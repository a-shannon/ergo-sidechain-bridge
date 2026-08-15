# Native Checkpoint Settlement Admission V1

This boundary connects the native Substrate finality verifier to authenticated
V2 settlement candidate production. A Frontier receipt reconstruction is not
enough by itself: the reconstructed burn root must be the runtime commitment
proved at the same natively finalized Substrate block and already committed by
the selected authenticated tracker entry.

## Producer To Consumer Flow

1. The read-only Substrate RPC boundary resolves the native block hash at the
   persisted peg-out height.
2. The production source requires one source-refreshed execution authority and
   constructs both the codec and verifier from that exact authority.
3. The authority reloads source-owned attestor roots and the signed execution
   policy before and after broker execution; the broker enforces the reviewed
   epoch floor, PE/import shape, and observed loader-module boundary.
4. The authority-bound verifier validates the bounded GRANDPA, header, and
   runtime state-proof package relative to the reviewed trust anchor and
   constructs a process-provenance-branded checkpoint.
5. The Frontier proof source reconstructs all successful bridge burns from the
   exact execution block receipts and selects the persisted event coordinates.
6. Settlement admission binds the native checkpoint, Frontier proof, persisted
   peg-out, and authenticated tracker value before unsigned transaction
   preparation.
7. The settlement service returns one deeply frozen, process-provenance-branded
   transaction built by the canonical authenticated V2 transaction builder.
8. Candidate admission requires that producer provenance and rechecks the exact claim, proof path, selected boxes,
   input ordering, tracker data input, payout recipient/value/asset, unsigned
   output mirror, and ContextExtension guard before journaling.
9. The state journal accepts only the exact process-provenance-branded candidate
   produced by that coordinator; raw builder output and cloned candidates fail.

The candidate ID commits the complete tracker value, target burn leaf, proof
path digest, payout binding, and exact native admission identity. The tracker value contains the checkpoint
commitment, which commits the native consensus hash, execution hash, sidechain
height and ID, event root, burn count, finality set, and finality proof hash.
The additional admission binding records the request, trust-anchor, and
finality-horizon values, canonical finality-statement digest, semantic program
ID, proof-system ID, verifier profile, payload digest, and complete envelope
digest in the ID preimage. The native adapter recomputes the
statement from its provenance-branded verification result, and admission checks
that its checkpoint, trust anchor, and horizon still match that result. This is
a durable identity binding, not durable verification provenance or Ergo-side
proof acceptance.

## Runtime Profile

The daemon enables this path only when
`NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_JSON` contains one exact
`e2s.native-checkpoint-settlement-profile.v2` object **and** the SHA-256 digest
of its normalized complete contents appears in the source-controlled
`REVIEWED_NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SHA256_HEXES` registry. The
profile contains:

| Section | Required fields |
|---|---|
| RPC | Uncredentialed HTTP(S) endpoint |
| Execution authority | Profile ID, attestation ID, policy ID, exact execution-policy SHA-256, minimum policy epoch, and canonical Program Files broker path |
| Trust anchor | Sidechain ID, checkpoint hash and height, GRANDPA set ID, canonical authority-list SCALE bytes, independently reviewed anchor digest |
| Native codec | Absolute executable path, executable SHA-256, and separate invocation SHA-256 pins for header encoding, warp inspection, and finality inspection |
| Native verifier | Absolute executable path, executable SHA-256, and invocation SHA-256 pin |

The exact object shape is:

```jsonc
{
  "schema": "e2s.native-checkpoint-settlement-profile.v2",
  "rpcUrl": "https://<reviewed-uncredentialed-rpc>",
  "authority": {
    "profileId": "<reviewed-attestor-profile-id>",
    "attestationId": "<reviewed-build-attestation-id>",
    "policyId": "<reviewed-execution-policy-id>",
    "executionPolicySha256": "<32-byte-lowercase-sha256>",
    "minimumPolicyEpoch": 1,
    "launcherPath": "<system-drive>:\\Program Files\\E2SBridge\\NativeExecution\\v1\\bridge-contained-launcher.exe"
  },
  "trustAnchor": {
    "sidechainIdHex": "0x<32-byte-genesis-hash>",
    "checkpointHashHex": "0x<32-byte-native-block-hash>",
    "checkpointNumber": "<canonical-decimal-height>",
    "grandpaSetId": "<canonical-decimal-set-id>",
    "authorityListScaleHex": "0x<canonical-scale-bytes>",
    "trustedAnchorDigestHex": "0x<32-byte-reviewed-digest>"
  },
  "codec": {
    "executablePath": "<absolute-reviewed-codec-path>",
    "executableSha256Hex": "0x<32-byte-sha256>",
    "executableInvocationSha256Hex": {
      "encodeHeaders": "0x<32-byte-sha256>",
      "inspectWarpProof": "0x<32-byte-sha256>",
      "inspectFinalityProof": "0x<32-byte-sha256>"
    }
  },
  "verifier": {
    "executablePath": "<absolute-reviewed-verifier-path>",
    "executableSha256Hex": "0x<32-byte-sha256>",
    "executableInvocationSha256Hex": "0x<32-byte-sha256>"
  }
}
```

Unknown fields, partial profiles, credential-bearing URLs, relative executable
paths, non-canonical integers, malformed hashes, and invocation drift are
rejected. Legacy v1 profiles are rejected rather than reinterpreted under the
new authority contract. If the profile is absent, authenticated V2 candidate
production waits fail-closed. Runtime JSON cannot approve the trust anchor,
authority identity/policy/epoch, or binary pins that it supplies itself. An
institution must add the normalized whole-profile digest through reviewed
source control. The registry contains one inert conformance
profile bound to localhost's discard port and nonexistent executables so the
approved branch has a deterministic positive fixture. No live deployment
profile is approved. The profile carries public verification policy and binary
pins; it must not carry wallet or signing material.

Only `createAuthorityBoundNativeCheckpointSettlementSource()` can mint
reviewed-profile checkpoint provenance, and it requires a branded authority
whose declaration matches every v2 authority and executable pin. The legacy
`createNativeCheckpointSettlementSource()` path now fails closed instead of
falling back to direct processes. The dependency-injected test factory is
runtime-gated to tests and deliberately cannot mint reviewed provenance;
settlement admission rejects its output.

## Closeout Matrix

| Invariant | Producer / enforcement | State fields | Downstream consumer | Failure if relaxed | Branches | Positive fixture | Single-fault negative | Authority / status |
|---|---|---|---|---|---|---|---|---|
| Checkpoint provenance | Native verifier adapter output WeakSet; source and admission assertions | Checkpoint object identity | Candidate coordinator | Deserialized or hand-built JSON could impersonate native verification | Source return; admission entry | Verifier-built frozen checkpoint | Structurally identical cloned checkpoint | Native adapter; implemented and focused green |
| Profile authority | Source-controlled whole-profile digest registry plus branded execution authority | Profile, attestation, and policy IDs; exact policy digest; minimum epoch; canonical Program Files broker path; RPC, trust root, executable and invocation pins | Authority-bound source, daemon loader, settlement admission | Another genuine authority, lower rollback floor, or writable broker location could mint reviewed provenance | Profile absent; legacy v1; unregistered v2; each authority field drifted; inert registered fixture | Registered v2 conformance profile plus exact branded authority | One mutation for each authority identity, policy digest, minimum epoch, broker path, verifier pin, and codec pin | Registry and transitive admission provenance implemented; no live profile approved |
| Authority freshness | Source-owned attestor lock and signed policy validation before and after broker execution | Reviewed profile provenance, policy digest, validity interval, runtime manifests | Authority result provenance, codec, verifier, settlement source | Revoked roots or expired/drifted policy could brand output produced during the validation window | Construction; pre-execution; post-execution | Same reviewed profile and policy at all three validations | Source revocation during broker execution and policy/boundary drift | Process-local authority; focused green, real external packet absent |
| Authority output immutability | Private stdout snapshot plus SHA-256 stored with WeakMap provenance; public getter returns a copy | Exact broker stdout bytes and digest | Codec and verifier parsers | Caller mutation after branding could change parsed proof bytes without invalidating provenance | Read; caller mutation; provenance assertion | Fresh output copy equals the private snapshot | Mutate one returned Buffer and re-read/assert provenance | Process-local authority; focused green |
| Authority-record update serialization | Shared global installer mutex held across final complete-record checks and `ResumeThread` | Profile digest, exact policy digest, policy epoch, validity window, current fixed-size `AuthorityRecordV1` | Broker target execution | An installer policy/floor change or policy expiry between the final checks and resume could permit one revoked launch | Invalid/inaccessible mutex; abandoned mutex; timeout; complete-record checks; resume; release | Broker acquires the shared mutex, validates the embedded profile, exact policy digest, floor, and time, resumes, and releases | Wrong profile or policy digest, malformed record, cross-thread contention/timeout, abandoned-owner rejection, invalid name, wrong-thread release, expired window, and floor above policy epoch | Win32 broker; local target-runtime tests only |
| Installer crash ordering | Elevated installer mutex plus one fixed-size authority-record write/flush before broker replacement | Existing/new profile, exact policy digest and epoch; reviewed broker digest; staged broker bytes | Future broker launches | New broker bytes or policy could become active under a mixed or older authority record after interruption | Decrease; same-epoch policy change; explicit legacy migration; write/flush failure; copy/hash failure; replace | Complete record is durable before verified replacement; legacy epoch-only authority is removed and flushed before migration proceeds | Record-format/parser negatives, lexical write-order regression, same-epoch digest mutation, and copy/hash mismatch | Installer implemented but not run on this machine |
| Rejected loader module | Debug-event module policy terminates the private job before continuing a rejected event | Canonical System32 path, case-normalized DLL basename, runtime allowlist, pending debug event | Authority target process | Rejected DLL initialization could run before broker teardown | Rejected `LOAD_DLL` is target-runtime tested; path allowlisting is unit-tested; full allowlisted sequence, `RIP_EVENT`, and injected inspection/termination failures remain open | Case-normalized System32 path predicate only; no real authority positive run | `not-loaded.dll` policy terminates before the fixture can write its first marker | Rejected-load target-runtime evidence only; complete loader branch matrix pending |
| Descendant exclusion | Authority job sets `JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 1`; polling remains defense in depth | Active-process limit, job membership, cumulative and active process counts | Authority target and any direct child creation | A short-lived child could perform side effects before polling detected it | Root only; attempted child; service-mediated out-of-job process remains excluded from claim | Root process executes inside the one-process job | Fixture child creation fails in the kernel and its delayed marker never appears | Win32 broker; local target-runtime test |
| Reviewed chain | Profile trust anchor, native verifier, source request check | Sidechain ID | Collector, tracker lookup, leaf verifier | A valid proof for another sidechain could authorize payout | Configured; requested; returned | One ID across all producers | Configured, requested, tracker, or leaf ID mutation | External trust-root review plus native adapter; local only |
| Exact height | Native block lookup, runtime proof, tracker identity, persisted peg-out | Native height; tracker height; burn height | Commitment and burn selection | A finalized checkpoint at another height could be substituted | Request; returned; tracker; peg-out | One exact burn-bearing height | Tracker, peg-out, or returned height mutation | Native adapter and daemon; implemented and focused green |
| Native block identity | Native block lookup and GRANDPA verifier | Native consensus hash | Checkpoint commitment and candidate ID | A different native fork could be paired with the execution proof | Resolved target; verified target | Resolved hash equals verified target | Resolved native hash mutation | Native verifier relative to reviewed anchor; local only |
| Execution block identity | Runtime proof, tracker key, persisted peg-out, proof leaf | Execution hash | Frontier burn set and settlement leaf | Receipts from another execution block could be paid | Tracker; peg-out; proof | One execution hash across layers | Tracker, peg-out, or proof hash mutation | Runtime proof plus daemon binding; implemented and focused green |
| Event root | Runtime proof, full Frontier receipt reconstruction, tracker value | Event root | Burn inclusion verifier and payout plan | An operator-selected or partial receipt root could be paid | Proof; tracker; prepared claim | Reconstructed root equals proved root | Proof, tracker, or prepared root mutation | Native runtime proof plus receipt reconstruction; local only |
| Burn cardinality | Runtime commitment and proof envelope | Burn count; leaf index | Root interpretation and candidate ID | Omitted sibling burns could be hidden behind ambiguous cardinality | Single leaf; odd/even multi-leaf envelopes | Checkpoint count equals envelope count | `leafCount` mutation | Native runtime proof plus canonical envelope; implemented and focused green |
| Target burn identity | Canonical leaf and exact event coordinates | Tx hash; global log index; burn ID; recipient; amount; asset | Payout and DUP key | A valid root could pay another event or value | Every target field; ERG asset lane | Exact persisted event and canonical leaf | One mutation per target field | Frontier source plus admission; implemented and focused green |
| Proof-path identity | Canonical path digest over leaf index, leaf count, directions and sibling hashes | Leaf index/count; ordered proof path | Prepared claim and candidate ID | A proof for another leaf or tree shape could be paired with the admitted root | Empty and non-empty paths | Admission path equals prepared settlement identity | Single sibling/path mutation | Admission and candidate coordinator; implemented and focused green |
| Tracker commitment | Checkpoint digest and decoded 264-byte tracker value | Event root; checkpoint commitment; proof system; statement/program/verifier/payload/proof identity | Tracker data-input plan and candidate ID | A real anchor or R9 admission for different finality metadata could be substituted | Missing; duplicate; root drift; commitment drift; each finality identity field drift | One derived tracker key and value | Missing/duplicate entry or any independent identity mutation | Authenticated proof identity; Ergo payload verification still pending |
| Canonical finality proof package | `BridgeFinalityStatementV1` codec plus checkpoint-bound native proof provenance | Checkpoint/commitment; trust anchor; horizon; program ID; statement digest; proof system; verifier profile; payload and envelope digests | Settlement candidate/revalidation identity and future proof-system consumer | A valid burn root could be paired with another trust root, verifier, payload, or finality semantics | Each statement and envelope field; exact checkpoint/proof object pairing | Native source derives one frozen package and carries every identity field to the journal | Wrong request, checkpoint/proof pair, commitment, anchor, horizon, program/profile ID, payload/envelope digest, reserved mode, and malformed length | Canonical local interface; Ergo-verifiable consumption pending |
| Proof envelope | Canonical leaf bytes/hash, index/count, depth/directions, root verification | Encoded leaf; leaf hash; path | ErgoScript proof bundle | Malformed metadata could pass a looser off-chain path | Single-node; multi-node; odd width | Canonical envelope resolves to root | Encoded-leaf-only mutation plus existing envelope vectors | Shared TypeScript/Rust proof rules; focused green |
| Prepared transaction semantics | Canonical authenticated V2 builder output WeakSet plus candidate coordinator | Frozen complete transaction; one claim; selected input/data-input IDs and order; exact payout; output mirror; guard | Candidate journal | A hand-built object could journal arbitrary extensions, successor/change/fee outputs, or a payout different from the admitted burn | Raw/clone; claim cardinality; payout; proof; input/data-input; output mirror; guard | Builder-produced exact authenticated V2 unsigned transaction | Raw clone plus one mutation per admitted semantic field | Settlement service and coordinator; implemented and focused green |
| Journal provenance | Coordinator output WeakSet and first-line state sink assertion | Candidate object identity | SQLite candidate journal | Raw builder output or a deserialized clone could bypass native admission | Raw; clone; exact coordinator object | Exact coordinator object accepted | Raw builder and clone rejected | Process-local boundary; implemented and focused green |

## Claim Boundary

This boundary verifies sidechain finality relative to the reviewed GRANDPA
trust root and proves exact correspondence with the tracker commitment and
canonical finality statement used by the candidate. The aggregate native
envelope remains off-chain evidence. It does not by itself prove that the
tracker update was accepted
on Ergo, that the signed transaction passes JVM `/transactions/check`, or that
an on-chain spend occurred. Gate 5 remains open.

WeakSet provenance is intentionally process-local. The daemon now recollects
and natively reverifies the checkpoint after restart, reruns settlement
admission, refetches the selected boxes, and compares the exact rebuilt
transaction before retaining process-local check eligibility. A journal row is
never a substitute for that verification. The daemon still has no authenticated
V2 signing or broadcast route; the separate explicit check-only command is
described in `authenticated-settlement-jvm-check-v1.md`.
