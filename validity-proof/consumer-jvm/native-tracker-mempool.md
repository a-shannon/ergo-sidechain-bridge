# Native Tracker Mempool Consumer

This offline matrix passes a public signed tracker transaction through the
pinned Ergo node's transaction validation, persistent synthetic UTXO state,
mempool policy and candidate selection. Its twenty cases retain the context
window, fee, double-spend, blacklist and candidate-recovery assertions.

The fixed fixture is
`relayer/test-vectors/substrate-federated-native-tracker-mempool-v1.json`:
29,505 bytes, SHA-256
`a19a03efbeca8a7a515f75992a772c720499816a9b3c153caaef7969a292ebe1`.
It was exported by the genuine `second source deposit: valid` continuation
test. The fixture contains public signed transaction, box and header bytes;
the ephemeral signer seed is not exported. It has 4,173 signed bytes, a
ten-header context starting at height 1,029, anchor height 1,028 at index 1,
checkpoint expiry 1,060 and output creation heights 1,030. The producer chooses
a fresh random signer, so regeneration produces a different fixture. Copy the
fixed artifact to reproduce this matrix. The earlier `ff5b4efe…` fixture result
remains historical and is not replayed by this input.

Prepare the relayer dependencies and select the pinned Node 24.14.0, Git 2.54.0,
Java 17.0.19 and SBT launcher through `$NodePath`, `$GitPath`, `$JavaPath` and
`$SbtLauncherPath`. `$ErgoNodeRoot` must be a fresh LF checkout at
`2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1`. This consumer requires the earlier
two-file candidate patch, separate from the signed-continuation consumer's
eight-file overlay. From the bridge repository root:

```powershell
$work = Join-Path $env:TEMP ('native-tracker-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$patch = Join-Path $work 'candidate-two-file.patch'
$patchLines = & $GitPath show '35307563406afcdb93790b9e88250be61f791508:sources/ergo-node/0002-sidechain-extension-fields-candidate-recovery.patch'
if ($LASTEXITCODE -ne 0) { throw 'Public candidate patch export failed' }
[IO.File]::WriteAllText($patch, ($patchLines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
if ((Get-FileHash -LiteralPath $patch -Algorithm SHA256).Hash.ToLowerInvariant() -cne
    '72316d9d04704b7b44a854a719c470931e4485901944aa42b701609b8a15ec0c') {
    throw 'Public candidate patch digest mismatch'
}
& $GitPath -C $ErgoNodeRoot apply --unidiff-zero --check $patch
if ($LASTEXITCODE -ne 0) { throw 'Candidate patch precheck failed' }
& $GitPath -C $ErgoNodeRoot apply --unidiff-zero $patch
if ($LASTEXITCODE -ne 0) { throw 'Candidate patch application failed' }
$fixture = Join-Path $work 'tracker-mempool.json'
Copy-Item -LiteralPath ./relayer/test-vectors/substrate-federated-native-tracker-mempool-v1.json -Destination $fixture
$scratch = Join-Path $work 'synthetic-state'
New-Item -ItemType Directory -Path $scratch | Out-Null
& ./validity-proof/consumer-jvm/run-substrate-federated-native-tracker-mempool.ps1 `
    -ErgoNodeRoot $ErgoNodeRoot -GitPath $GitPath -NodePath $NodePath `
    -JavaPath $JavaPath -SbtLauncherPath $SbtLauncherPath `
    -FixturePath $fixture `
    -FixtureSha256 'a19a03efbeca8a7a515f75992a772c720499816a9b3c153caaef7969a292ebe1' `
    -ScratchRoot $scratch
```

The patch stays unstaged. The runner requires only the two exact candidate
source changes, the current Scala specs, wrapper and process implementation,
and pinned tools and npm lock. Fixture and scratch paths must remain outside
both source checkouts, with an empty scratch directory. It uses trusted local
Maven/SBT caches through a file-only offline configuration, a five-minute
process limit, fifteen-second termination grace and 4 MiB output bound. Every
case must pass with no failed, canceled, ignored or pending tests or aborted
suite. Inputs are rechecked after execution and owned synthetic state is closed.

The matrix establishes offline behavior for this exact public fixture and
synthetic state. Node-service observations, chain inclusion, independent
custody, complete packaged lifecycle and stopped-state recovery require their
own evidence. This is a federated consumer, separate from EIP-0045/STARK.
