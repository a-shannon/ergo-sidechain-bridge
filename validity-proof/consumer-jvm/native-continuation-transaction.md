# Signed Native Continuation Transaction

This offline consumer validates the complete signed second reserve continuation
produced by the genuine federated withdrawal fixture. It calls the pinned Ergo
node's `statelessValidity` and `statefulValidity` with all three ordered input
boxes, no data inputs and ten contiguous headers. It starts no node service.

## Reproduce

The runner uses Windows PowerShell. Use the dependency installation and compiler preparation required by the native
continuation tests. Select the pinned Node 24.14.0, Git 2.54.0, Java 17.0.19 and
SBT launcher through `$NodePath`, `$GitPath`, `$JavaPath` and `$SbtLauncherPath`.
`$ErgoNodeRoot` must be the source-lock base with the declared plain, unstaged
eight-file Ergo patch. The runner rejects other source, tool or fixture bytes.

From the repository root, create an external directory with at least 10 GiB free:

```powershell
$work = Join-Path $env:TEMP ('native-continuation-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$fixture = Join-Path $work 'signed-continuation.json'
$output = Join-Path $work 'offline-output'
New-Item -ItemType Directory -Path $output | Out-Null
$env:BRIDGE_NATIVE_CONTINUATION_TRANSACTION_FIXTURE = $fixture
$env:BRIDGE_NATIVE_CONTINUATION_HEIGHT_EDGE_FIXTURE = '1'
Push-Location relayer
try {
    & $NodePath node_modules/vitest/vitest.mjs run `
        src/substrate-federated-native-withdrawal-continuation-v1.test.ts `
        -t 'continuation valid$' --reporter dot
    if ($LASTEXITCODE -ne 0) { throw 'Signed fixture generation failed' }
} finally {
    Pop-Location
    Remove-Item Env:BRIDGE_NATIVE_CONTINUATION_TRANSACTION_FIXTURE
    Remove-Item Env:BRIDGE_NATIVE_CONTINUATION_HEIGHT_EDGE_FIXTURE
}
$fixtureHash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
& ./validity-proof/consumer-jvm/run-substrate-federated-native-continuation-transaction.ps1 `
    -ErgoNodeRoot $ErgoNodeRoot -GitPath $GitPath -NodePath $NodePath `
    -JavaPath $JavaPath -SbtLauncherPath $SbtLauncherPath `
    -FixturePath $fixture -FixtureSha256 $fixtureHash -OutputRoot $output
```

The fixture is written once and read back. The runner uses the existing local
trusted Maven and SBT caches with a file-only, offline configuration and a fresh
isolated home. Its process limit is five minutes, termination grace 15 seconds,
output limit 4 MiB and JVM heap limit 4 GiB. It retains its output directory.

The height-edge opt-in adds serialized, parent-linked synthetic descendants to
the original fixture. The current 48-case consumer requires this field. Omitting
the flag preserves the original six-field export for its earlier scope; that
export does not satisfy the expanded matrix. Other flag values are rejected.

## Validation Scope

The signed transaction must pass in both explicit preheader contexts: the node's
empty votes and the SDK carrier's three zero vote bytes. Both JVM evaluations
use the pinned native DevNet parameters and cost limits. The fixture records
SDK 0.28.0 defaults separately: block version 1 and no maximum block-cost entry,
as defined by its [pinned parameter source](https://github.com/ergoplatform/sigma-rust/blob/635bbaca55a27d6dd6b2c0ee2479b6ed60117780/ergo-lib/src/chain/parameters.rs#L108-L119).
The absent entry is represented as `null`; it is not a queried cost ceiling.

The matrix removes only the fee proof and requires input 2 to fail while inputs
0 and 1 remain valid. Separate negatives cover an outputless transaction,
creation of one extra nanoERG, input order, header ancestry, each preheader and
parameter field, previous state digest, raw header projection and trailing
transaction bytes. The runner requires every case to pass, with no ignored,
canceled or pending test and no aborted suite. It rechecks inputs after execution.

The same signed transaction, proofs and ordered boxes also pass at evaluation
height `reserveSuccessor.creationHeight + 100` and fail only at input 0 at `+101`.
Both explicit preheader contexts use ten contiguous headers derived from the
same original fixture tip; the source refund remains unexpired. Separate
transport negatives reject changed identities, bytes, heights, parents, ordering,
cardinality, anchor, terminal height and field shape. Synthetic descendants
establish offline evaluation contexts, not mined proof of work or chain inclusion.

Supplied input boxes establish offline transaction validity in these contexts.
UTXO membership, HTTP or mempool admission, chain inclusion, independent custody
and the packaged two-cycle lifecycle require their own evidence. This federated
consumer is separate from EIP-0045/STARK and does not diagnose a historical run.
