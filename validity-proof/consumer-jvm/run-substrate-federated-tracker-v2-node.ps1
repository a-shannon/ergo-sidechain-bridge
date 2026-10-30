[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ErgoNodeRoot,
    [Parameter(Mandatory = $true)][string] $NodePath,
    [Parameter(Mandatory = $true)][string] $JavaPath,
    [Parameter(Mandatory = $true)][string] $SbtLauncherPath,
    [Parameter(Mandatory = $true)][string] $ContextFixturePath,
    [Parameter(Mandatory = $true)][string] $SignedFixturePath,
    [Parameter(Mandatory = $true)][string] $SignedFixtureSha256,
    [Parameter(Mandatory = $true)][string] $ScratchRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ExpectedNodeCommit = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1'
$ExpectedContextHash = '416300485667d83a62b13826cb6514f0969df0faad4ced9b2cdbadb58aee266b'
$ExpectedSpecHash = '8336dd6830a577e0db044d43b1148dfd76b7b4b16b009ecf24a3e617afe45c58'
$ExpectedExporterHash = 'b0df11c7eca4c80adbb80f1a3aec919a7aba995f79cf468d9f33b33e788d37ca'
$ExpectedTests = 14
$PatchFiles = [ordered]@{
    'src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala' =
        'be810fd825e234dc5f1519324f30c7200d1018fcb41bec99a3a0ee6f76710e6d'
    'src/test/scala/org/ergoplatform/mining/CandidateGeneratorSpec.scala' =
        '69647c3e60be568033a492073a7e1f23a0cb4abc81bbc05970a932c425e443fc'
}

function Resolve-RealPath([string] $Path, [bool] $Directory) {
    $item = Get-Item -LiteralPath (Resolve-Path -LiteralPath $Path).Path
    if ($item.PSIsContainer -ne $Directory -or
        ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        $item.FullName -match '["\r\n]') {
        throw 'Expected a real path without SBT command delimiters'
    }
    return $item.FullName
}

function Assert-Hash([string] $Path, [string] $Expected) {
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Expected -cnotmatch '^[0-9a-f]{64}$' -or $actual -cne $Expected) {
        throw "Input digest mismatch: $Path ($actual)"
    }
}

function Assert-NodeSource {
    $head = (& git -C $ErgoNodeRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -cne $ExpectedNodeCommit) {
        throw 'Ergo source commit mismatch'
    }
    $status = @(& git -C $ErgoNodeRoot status --short --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Ergo source status' }
    $expected = @($PatchFiles.Keys | ForEach-Object { " M $_" })
    if (@(Compare-Object $status $expected -CaseSensitive).Count -ne 0) {
        throw 'Ergo source must contain only the two pinned extension patch changes'
    }
    foreach ($entry in $PatchFiles.GetEnumerator()) {
        Assert-Hash (Join-Path $ErgoNodeRoot $entry.Key) $entry.Value
    }
}

function Invoke-Checked([string] $Label, [scriptblock] $Command) {
    $prior = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $lines = & $Command 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $prior }
    $lines | ForEach-Object { Write-Host $_ }
    if ($code -ne 0) { throw "$Label failed with exit code $code" }
    return $lines -join [Environment]::NewLine
}

$BridgeRoot = Resolve-RealPath (Join-Path $PSScriptRoot '../..') $true
$ErgoNodeRoot = Resolve-RealPath $ErgoNodeRoot $true
$NodePath = Resolve-RealPath $NodePath $false
$JavaPath = Resolve-RealPath $JavaPath $false
$SbtLauncherPath = Resolve-RealPath $SbtLauncherPath $false
$ContextFixturePath = Resolve-RealPath $ContextFixturePath $false
$SignedFixturePath = Resolve-RealPath $SignedFixturePath $false
$ScratchRoot = Resolve-RealPath $ScratchRoot $true
foreach ($sourceRoot in @($BridgeRoot, $ErgoNodeRoot)) {
    if ($ScratchRoot -eq $sourceRoot -or $ScratchRoot.StartsWith(
        $sourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Scratch output must be outside both source checkouts'
    }
}
$nodeVersion = (& $NodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw 'Node 24 is required' }
$javaVersion = Invoke-Checked 'Java version' { & $JavaPath -version }
if ($javaVersion -notmatch 'version "17\.') { throw 'Java 17 is required' }
if ($env:SIGMASTATE_VERSION -and $env:SIGMASTATE_VERSION -cne '6.0.2') {
    throw 'The pinned node requires its declared SigmaState 6.0.2 dependency'
}
$spec = Resolve-RealPath (Join-Path $PSScriptRoot 'BridgeSubstrateFederatedTrackerV2NodeSpec.scala') $false
$exporter = Resolve-RealPath (Join-Path $BridgeRoot 'relayer/src/scripts/export-substrate-federated-tracker-v2-node-fixture.ts') $false
$tsx = Resolve-RealPath (Join-Path $BridgeRoot 'relayer/node_modules/tsx/dist/cli.mjs') $false
Assert-NodeSource
Assert-Hash $spec $ExpectedSpecHash
Assert-Hash $exporter $ExpectedExporterHash
Assert-Hash $ContextFixturePath $ExpectedContextHash
Assert-Hash $SignedFixturePath $SignedFixtureSha256
$wire = Join-Path $ScratchRoot ('bridge-v2-node-wire-' + [Guid]::NewGuid().ToString('N') + '.json')
$wireHash = $null
try {
    $export = Invoke-Checked 'WASM node JSON export' {
        & $NodePath $tsx $exporter $ContextFixturePath $SignedFixturePath $SignedFixtureSha256 $wire
    }
    $wireHash = (Get-FileHash -LiteralPath $wire -Algorithm SHA256).Hash.ToLowerInvariant()
    $reported = [regex]::Matches($export, '(?m)^wire_fixture_sha256=([0-9a-f]{64})\r?$')
    if ($reported.Count -ne 1 -or $reported[0].Groups[1].Value -cne $wireHash) {
        throw 'WASM exporter did not report the exact wire fixture'
    }
    $prefix = 'bridge.substrate.federated.tracker.v2.node.'
    $arguments = @(
        '-Xmx4G', '-Dsbt.supershell=false', '-Dsbt.log.noformat=true',
        "-D${prefix}root=$ErgoNodeRoot",
        "-D${prefix}context.fixture=$ContextFixturePath",
        "-D${prefix}signed.fixture=$SignedFixturePath",
        "-D${prefix}signed.fixture.sha256=$SignedFixtureSha256",
        "-D${prefix}wire.fixture=$wire", "-D${prefix}wire.fixture.sha256=$wireHash",
        '-jar', $SbtLauncherPath,
        'set offline := true', 'set logLevel := Level.Info',
        'set Test / fork := false', 'set Test / parallelExecution := false',
        ('set Test / unmanagedSources := Seq(file("' + $spec.Replace('\', '/') + '"))'),
        'Test / testOnly org.ergoplatform.bridge.BridgeSubstrateFederatedTrackerV2NodeSpec'
    )
    Push-Location $ErgoNodeRoot
    try {
        $result = Invoke-Checked 'Pinned node synthetic-state validation' { & $JavaPath @arguments }
    } finally { Pop-Location }
    $counts = [regex]::Matches($result, '(?m)^\[info\] Total number of tests run: ([0-9]+)\r?$')
    if ($ExpectedTests -lt 1 -or $counts.Count -ne 1 -or
        $counts[0].Groups[1].Value -cne [string]$ExpectedTests -or
        $result -notmatch 'All tests passed') {
        throw 'Pinned node did not report the complete expected test set'
    }
    Assert-Hash $spec $ExpectedSpecHash
    Assert-Hash $exporter $ExpectedExporterHash
    Assert-Hash $ContextFixturePath $ExpectedContextHash
    Assert-Hash $SignedFixturePath $SignedFixtureSha256
    Assert-Hash $wire $wireHash
    Write-Output 'substrate_federated_tracker_v2_node_code=PASS'
    Write-Output "tests=$ExpectedTests"
    Write-Output 'synthetic_state_only=true'
    Write-Output 'chain_resident_acceptance=false'
    Write-Output 'signing_performed=false'
    Write-Output 'submission_performed=false'
    Write-Output 'broadcast_performed=false'
    Write-Output 'runtime_profile_activated=false'
    Write-Output 'funds_authority_established=false'
} finally {
    Assert-NodeSource
    if ($wireHash -and (Test-Path -LiteralPath $wire)) {
        Assert-Hash $wire $wireHash
        Remove-Item -LiteralPath $wire
    }
}
