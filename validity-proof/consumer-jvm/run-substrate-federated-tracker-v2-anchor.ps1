[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $SigmaStateRoot,

    [Parameter(Mandatory = $true)]
    [string] $NodePath,

    [Parameter(Mandatory = $true)]
    [string] $JavaPath,

    [Parameter(Mandatory = $true)]
    [string] $SbtLauncherPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedSigmaStateCommit = 'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ExpectedFixtureSha256 =
    '1eafd524364dc496030200ddd06ea3b8edc56509ef6568807cf923858ce92efe'
$ExpectedTests = 9
$ExpectedInputs = [ordered]@{
    'contracts/SPVTrackerSubstrateFederatedV1.es' =
        '8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852'
    'relayer/test-vectors/substrate-federated-v1-tracker-admission.json' =
        '87b1db594810e8e21f4132ed51ee929dde6a07cce9f690ec8bba2fc90c57f5be'
    'relayer/test-vectors/substrate-federated-v1-tracker-contract.json' =
        '65bdfbb30e6dfcba087689761415600b92fadf945a795f6046176110332ae5cd'
    'contracts/SPVTrackerSubstrateFederatedV2.es' =
        '110b1aa22d59e1202435bb139cadbb49f28a48c8b8a3056d0426e620ee828eec'
    'validity-proof/consumer-jvm/BridgeSubstrateFederatedTrackerV2AnchorSpec.scala' =
        '09c9f0848b6a2450fb0274ea7949f55432a62a0bab7bf4c8a4d061b9e795ea0b'
    'relayer/src/scripts/build-substrate-federated-tracker-v2-anchor-fixture.ts' =
        '7d27dc06dd40be78f765f6db8d5cf2857f664970d97a21eb8e3893eb227cf19f'
    'relayer/src/substrate-federated-tracker-compiler-v2.ts' =
        'b704576fe9ce776b29869e7f45fc565ce2ac2ee8f0340f6419625272223eba5d'
    'relayer/src/substrate-federated-tracker-jvm-compiler-v2.ts' =
        '55ce2c57707677a76d067eaf4ed1e60983acdb1f714522342ab3e0b0ac797943'
    'relayer/src/substrate-federated-tracker-v1.ts' =
        'ad3055e28f5535c41e42f3cab7c2574ef5af094606361f31748020e9f4ba12d8'
    'relayer/src/substrate-federated-tracker-v1-fixture.ts' =
        '54b100fd60ab2ce002299708b81d984ae57e4e1833d484ca64afc8543cf58965'
    'relayer/src/scripts/build-substrate-federated-tracker-v1-jvm-fixture.ts' =
        'a3f07a8569f0876b30f6d4f2b4dd18219d7e0603a6b8ab1244e396d4a9e6db69'
}

function Resolve-ExactFile([string] $Path, [string] $Label) {
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $item = Get-Item -LiteralPath $resolved
    if (-not $item.PSIsContainer -and
        -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        return $resolved
    }
    throw "$Label must be a real file"
}

function Resolve-ExactDirectory([string] $Path, [string] $Label) {
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $item = Get-Item -LiteralPath $resolved
    if ($item.PSIsContainer -and
        -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        return $resolved
    }
    throw "$Label must be a real directory"
}

function Assert-Sha256(
    [string] $Path,
    [string] $Expected,
    [string] $Label
) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actual -ne $Expected) {
        throw "$Label SHA-256 mismatch: $actual"
    }
}

function Invoke-NativeChecked(
    [string] $Label,
    [scriptblock] $Command
) {
    $priorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $lines = & $Command 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorPreference
    }
    if ($exitCode -ne 0) {
        $tail = @($lines | Select-Object -Last 80) -join [Environment]::NewLine
        throw "$Label failed with exit code $exitCode`n$tail"
    }
    $lines | ForEach-Object { $_ }
}

$BridgeRoot = Resolve-ExactDirectory (Join-Path $PSScriptRoot '..\..') 'bridge root'
$SigmaStateRoot = Resolve-ExactDirectory $SigmaStateRoot 'SigmaState root'
$NodePath = Resolve-ExactFile $NodePath 'Node executable'
$JavaPath = Resolve-ExactFile $JavaPath 'Java executable'
$SbtLauncherPath = Resolve-ExactFile $SbtLauncherPath 'SBT launcher'

$nodeVersion = (& $NodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.[0-9]+\.[0-9]+$') {
    throw "Node 24 is required, found $nodeVersion"
}

$sigmaHead = (& git -C $SigmaStateRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sigmaHead -ne $ExpectedSigmaStateCommit) {
    throw "SigmaState commit mismatch: $sigmaHead"
}
$initialSigmaStatus = @(& git -C $SigmaStateRoot status --short)
if ($LASTEXITCODE -ne 0 -or $initialSigmaStatus.Count -ne 0) {
    throw 'SigmaState checkout must be clean before federated tracker acceptance'
}

foreach ($entry in $ExpectedInputs.GetEnumerator()) {
    $path = Join-Path $BridgeRoot $entry.Key
    Assert-Sha256 $path $entry.Value $entry.Key
}

$destination = Join-Path $SigmaStateRoot 'sc\shared\src\test\scala\sigma\bridge'
$destination = Resolve-ExactDirectory $destination 'SigmaState bridge test directory'
$acceptanceSource = Join-Path $BridgeRoot 'validity-proof\consumer-jvm\BridgeSubstrateFederatedTrackerV2AnchorSpec.scala'
$acceptanceTarget = Join-Path $destination 'BridgeSubstrateFederatedTrackerV2AnchorSpec.scala'
if (Test-Path -LiteralPath $acceptanceTarget) {
    throw 'temporary federated tracker spec destination is already occupied'
}

$temporaryBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::Combine(
    $temporaryBase,
    'bridge-fed-anchor-v2-' + [Guid]::NewGuid().ToString('N')))
if (-not $temporaryRoot.StartsWith(
    $temporaryBase,
    [StringComparison]::OrdinalIgnoreCase)) {
    throw 'temporary fixture directory escaped the system temporary directory'
}
$fixturePath = Join-Path $temporaryRoot 'substrate-federated-tracker-v2-anchor-context.json'

try {
    [IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
    [IO.File]::Copy($acceptanceSource, $acceptanceTarget, $false)
    Assert-Sha256 $acceptanceTarget $ExpectedInputs['validity-proof/consumer-jvm/BridgeSubstrateFederatedTrackerV2AnchorSpec.scala'] 'copied acceptance spec'

    $tsx = Resolve-ExactFile (Join-Path $BridgeRoot 'relayer\node_modules\tsx\dist\cli.mjs') 'tsx runtime'
    $fixtureBuilder = Join-Path $BridgeRoot 'relayer\src\scripts\build-substrate-federated-tracker-v2-anchor-fixture.ts'
    $fixtureOutput = Invoke-NativeChecked 'federated tracker fixture builder' {
        & $NodePath $tsx $fixtureBuilder --output $fixturePath
    }
    if (-not (Test-Path -LiteralPath $fixturePath)) {
        throw 'federated tracker fixture builder produced no file'
    }
    Assert-Sha256 $fixturePath $ExpectedFixtureSha256 'federated tracker fixture'
    $fixtureText = $fixtureOutput -join [Environment]::NewLine
    if ($fixtureText -notmatch "fixture_sha256=$ExpectedFixtureSha256") {
        throw 'fixture builder did not report the exact expected fixture identity'
    }

    Push-Location $SigmaStateRoot
    try {
        $sbtOutput = Invoke-NativeChecked 'pinned JVM acceptance' {
            & $JavaPath -Xmx4G -jar $SbtLauncherPath "-Dbridge.substrate.federated.tracker.v2.root=$BridgeRoot" "-Dbridge.substrate.federated.tracker.v2.context.fixture=$fixturePath" 'scJVM/Test/testOnly sigma.bridge.BridgeSubstrateFederatedTrackerV2AnchorSpec'
        }
    } finally {
        Pop-Location
    }
    $sbtText = $sbtOutput -join [Environment]::NewLine
    $testCounts = [regex]::Matches(
        $sbtText,
        '(?m)^\[info\] Total number of tests run: ([0-9]+)\r?$')
    if ($ExpectedTests -lt 1 -or $testCounts.Count -ne 1 -or
        $testCounts[0].Groups[1].Value -cne [string]$ExpectedTests -or
        $sbtText -notmatch 'All tests passed') {
        throw 'pinned JVM did not report the exact successful acceptance set'
    }

    Write-Output 'substrate_federated_tracker_v2_anchor_prototype=PASS'
    Write-Output "tests=$ExpectedTests"
    Write-Output 'activated_vm_version=3'
    Write-Output 'synthetic_jvm_signing_performed=true'
    Write-Output 'submission_performed=false'
    Write-Output 'broadcast_performed=false'
    Write-Output 'target_node_accepted=false'
    Write-Output 'runtime_profile_activated=false'
    Write-Output 'funds_authority_established=false'
    Write-Output 'trustless_status_established=false'
} finally {
    if (Test-Path -LiteralPath $acceptanceTarget) {
        [IO.File]::Delete($acceptanceTarget)
    }
    if (Test-Path -LiteralPath $temporaryRoot) {
        $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
        if (-not $resolvedTemporaryRoot.StartsWith(
            $temporaryBase,
            [StringComparison]::OrdinalIgnoreCase)) {
            throw 'refusing to delete a temporary path outside the expected root'
        }
        [IO.Directory]::Delete($resolvedTemporaryRoot, $true)
    }
    $finalSigmaStatus = @(& git -C $SigmaStateRoot status --short)
    if ($LASTEXITCODE -ne 0 -or $finalSigmaStatus.Count -ne 0) {
        throw 'federated tracker acceptance left the SigmaState checkout dirty'
    }
}
