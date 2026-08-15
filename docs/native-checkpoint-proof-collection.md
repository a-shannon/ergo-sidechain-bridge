# Native Checkpoint Proof Collection

This workflow constructs and verifies one finalized bridge checkpoint package
from a patched Frontier endpoint. It is read-only: it has no signing,
transaction construction, submission, wallet, deployment, or broadcast path.

## Inputs

The command accepts one strict JSON object on standard input using schema
`e2s.native-finalized-checkpoint-collection-input.v2`. Three reviewed values
must be supplied separately as command-line trust inputs:

| Option | Requirement |
|---|---|
| `--trusted-anchor-digest` | Approved digest of the public deployment trust anchor. |
| `--codec-sha256` | Approved SHA-256 of the exact `bridge-rpc-proof-codec` binary. |
| `--verifier-sha256` | Approved SHA-256 of the exact `bridge-checkpoint-verifier` binary. |

The stdin object contains:

| Field | Requirement |
|---|---|
| `rpcUrl` | Absolute HTTP(S) endpoint without URL credentials. |
| `targetNativeBlockHashHex` | Exact burn-bearing native block hash. |
| `trustAnchor` | Reviewed sidechain ID, non-transition finalized checkpoint hash/height, GRANDPA set ID, and canonical authority-list SCALE bytes. |
| `codecExecutablePath` | Absolute path to the built `bridge-rpc-proof-codec` binary. |
| `verifierExecutablePath` | Absolute path to the built `bridge-checkpoint-verifier` binary. |
| `rpcTimeoutMs` | Positive per-request timeout, at most 60 seconds. |
| `nativeTimeoutMs` | Positive native-process timeout, at most five minutes. |
| `collectionDeadlineMs` | Positive full-attempt deadline, at most ten minutes. |
| `rpcConcurrency` | Header acquisition concurrency from 1 through 32. |
| `maxAttempts` | Full reconstruction attempts from 1 through 3. |

The approved trust-anchor digest and binary hashes are operator-controlled
public configuration. They must not be copied from, derived by, or accepted
from the proof-serving node or stdin candidate at runtime. The collector
recomputes the anchor digest through the verifier and fails if the reviewed
value and request fields disagree.

The reviewed checkpoint must not itself contain a scheduled or forced GRANDPA
change. Its configured authority set is the set that signs that checkpoint and
its descendants until the first handoff carried by the proof package. Selecting
and reviewing that root remains an explicit deployment ceremony; proof-serving
RPC data cannot self-approve it.

## Collection

Run from `relayer` after applying the locked Frontier patch and building the
native package:

```bash
cargo build --locked --manifest-path ../substrate-node/Cargo.toml -p bridge-checkpoint-verifier --bins
npm run checkpoint:finalized:native:collect -- \
  --trusted-anchor-digest 0x<reviewed-digest> \
  --codec-sha256 0x<reviewed-sha256> \
  --verifier-sha256 0x<reviewed-sha256> \
  < reviewed-checkpoint-input.json > verified-checkpoint-output.json
```

The collector calls only:

- `chain_getBlockHash`
- `chain_getFinalizedHead`
- `chain_getHeader`
- `bridge_grandpaWarpProof`
- `grandpa_proveFinality`
- `state_getStorage`
- `state_getReadProof`

It reconstructs every omitted header between the reviewed checkpoint and each
warp-proof terminal. The native codec checks exact header hashes and canonical
SCALE, but deliberately reports `cryptographicallyVerified = false`. Only the
separate checkpoint verifier authenticates GRANDPA signatures, scheduled
authority transitions, hash-linked ancestry, the target finality envelope, and
the exact runtime trie proof.

Each attempt is discarded in full if the target hash, ancestry, terminal
header, or finality horizon changes during acquisition. A proof chunk is limited
to 4,096 ancestry headers, the authority path to 16 chunks, and the complete
request to 32 MiB. Crossing those limits requires review of a newer trust
checkpoint; the tool never raises them automatically.

The target finality proof is inspected before authority-proof acquisition. The
codec selects only warp fragments strictly below that proof's signed horizon.
The collector then reconstructs one canonical chain from the reviewed anchor
through all selected handoffs and the requested target to the horizon. This
allows a historical burn-bearing target to remain provable after a later
authority rotation. A zero-delay change at the horizon is still finalized by
the outgoing set and is not applied before that finality check.

The native verifier, not the codec, determines authority. It verifies every
selected fragment, rejects any scheduled change omitted from the reconstructed
chain, requires the exact requested header on that chain, and requires the
suffix after the target to equal the finality proof's `unknown_headers`
byte-for-byte. Each native invocation binds the executable hash and exact argv,
and each binary is rehashed before and after every process. The output records
the executable and invocation digests used. The trust anchor and executable
pins remain operator-controlled public configuration reviewed separately from
the proof-serving RPC. This detects ordinary path replacement but does not make
a hostile local operating system part of the trusted computing base safe.

## Output Boundary

A successful output has status
`NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT`. It proves
sidechain finality and runtime commitment inclusion relative to the separately
reviewed GRANDPA trust anchor and pinned native binaries. It produces a V1
checkpoint and `0x0401` candidate only.

It does not prove that the candidate was admitted under Ergo extension prefix
`0x04`, accepted by ErgoScript, bound to a payout and DUP update, or protected
against stale/reorged Ergo anchors. It therefore does not close Gate 5 and does
not support a globally trustless or production-ready claim.
