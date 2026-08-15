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

$ExpectedSigmaStateCommit =
    'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ExpectedRequestSha256 =
    '2452f61fcda7fc8f25fbace6336a55b9c82d7cf9654515f3e61635ff820ec8ce'
$ExpectedCompilerBatchSha256 =
    '8a6fa2b2acba330f92718389fc401cc7f15f67602282d949958cc072406fa20e'
$ExpectedJavaSha256 =
    '69ae5108b20bb132442ebe756a41e67f9b33b65b7ae6dc2a87b3b04947bab19e'
$ExpectedSbtLauncherSha256 =
    'b4c0c55d68f11b1510d884641cb1b1456191dac40ddc958bf86c825adc344e16'
$ExpectedSigmaBuildSha256 =
    'e381716ac80820f5d27ace5bba1ad024276190f40748eefd31785d79ac193c10'
$ExpectedSigmaBuildPropertiesSha256 =
    '439d984e46d776c13354b1635863583166689ba6e9ebcc703b1d89005d9d37a8'
$ExpectedInputs = [ordered]@{
    'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es' =
        'a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f'
    'contracts/MainChainLockPooledReserveV6.es' =
        'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b'
    'contracts/MainChainPooledReserveValidityApplicationV6.es' =
        '44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5'
    'relayer/src/substrate-federated-settlement-family-v1.ts' =
        '3089e07bd643cd0c01ff8b72cd42f812c3be9e8ebc572f936d43e0f36fde49a5'
    'relayer/src/substrate-federated-settlement-family-v1-fixture.ts' =
        'c13086e29815ec357c39470eb75779775a6cf1fc6711903f68ecd9435c5fb7fa'
    'relayer/src/scripts/build-substrate-federated-settlement-family-v1-compiler-fixture.ts' =
        'cffded1c96a5ca96d524f075687b51238618a9284b0cc3852b9dd9b10704cc07'
    'relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-request.json' =
        $ExpectedRequestSha256
    'relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json' =
        $ExpectedCompilerBatchSha256
    'validity-proof/consumer-jvm/BridgeSubstrateFederatedSettlementFamilyV1CompilerSpec.scala' =
        '8b5f4d098006f1e939dd5557d82599378e15c45f3ea7e5e05b2401e2249c3555'
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
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.
        ToLowerInvariant()
    if ($actual -ne $Expected) {
        throw "$Label SHA-256 mismatch: $actual"
    }
}

function Assert-ExactAsciiLfFile([string] $Path, [string] $Label) {
    $resolved = Resolve-ExactFile $Path $Label
    $bytes = [IO.File]::ReadAllBytes($resolved)
    if ($bytes.Length -eq 0 -or
        $bytes[0] -eq 0xef -or
        ($bytes | Where-Object { $_ -eq 13 -or $_ -gt 127 })) {
        throw "$Label must be non-empty BOM-free LF-only ASCII"
    }
    return $resolved
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
        $tail = @($lines | Select-Object -Last 80) -join
            [Environment]::NewLine
        throw "$Label failed with exit code $exitCode`n$tail"
    }
    $lines | ForEach-Object { $_ }
}

$BridgeRoot =
    Resolve-ExactDirectory (Join-Path $PSScriptRoot '..\..') 'bridge root'
$SigmaStateRoot =
    Resolve-ExactDirectory $SigmaStateRoot 'SigmaState root'
$NodePath = Resolve-ExactFile $NodePath 'Node executable'
$JavaPath = Resolve-ExactFile $JavaPath 'Java executable'
$SbtLauncherPath =
    Resolve-ExactFile $SbtLauncherPath 'SBT launcher'

$nodeVersion = (& $NodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or
    $nodeVersion -notmatch '^v24\.[0-9]+\.[0-9]+$') {
    throw "Node 24 is required, found $nodeVersion"
}
Assert-Sha256 $JavaPath $ExpectedJavaSha256 'Java executable'
Assert-Sha256 $SbtLauncherPath $ExpectedSbtLauncherSha256 'SBT launcher'
Assert-Sha256 (Join-Path $SigmaStateRoot 'build.sbt') `
    $ExpectedSigmaBuildSha256 'SigmaState build.sbt'
Assert-Sha256 (Join-Path $SigmaStateRoot 'project\build.properties') `
    $ExpectedSigmaBuildPropertiesSha256 'SigmaState build.properties'

$sigmaHead = (& git -C $SigmaStateRoot rev-parse 'HEAD^{commit}').Trim()
if ($LASTEXITCODE -ne 0 -or $sigmaHead -ne $ExpectedSigmaStateCommit) {
    throw "SigmaState commit mismatch: $sigmaHead"
}
$initialSigmaStatus = @(& git -C $SigmaStateRoot status --short)
if ($LASTEXITCODE -ne 0 -or $initialSigmaStatus.Count -ne 0) {
    throw 'SigmaState checkout must be clean before federated family compilation'
}

foreach ($entry in $ExpectedInputs.GetEnumerator()) {
    $path = Join-Path $BridgeRoot $entry.Key
    Assert-ExactAsciiLfFile $path $entry.Key | Out-Null
    Assert-Sha256 $path $entry.Value $entry.Key
}

$destination =
    Join-Path $SigmaStateRoot 'sc\shared\src\test\scala\sigma'
$destination =
    Resolve-ExactDirectory $destination 'SigmaState test package directory'
$specSource = Join-Path $BridgeRoot `
    'validity-proof\consumer-jvm\BridgeSubstrateFederatedSettlementFamilyV1CompilerSpec.scala'
$specTarget = Join-Path $destination `
    'BridgeSubstrateFederatedSettlementFamilyV1CompilerSpec.scala'
if (Test-Path -LiteralPath $specTarget) {
    throw 'temporary federated settlement compiler spec destination is occupied'
}

$temporaryBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::Combine(
    $temporaryBase,
    'bridge-fed3a-' + [Guid]::NewGuid().ToString('N')))
if (-not $temporaryRoot.StartsWith(
    $temporaryBase,
    [StringComparison]::OrdinalIgnoreCase)) {
    throw 'temporary compiler directory escaped the system temporary directory'
}
$requestPath = Join-Path $temporaryRoot 'compiler-request.json'
$compilerBatchPath = Join-Path $temporaryRoot 'compiler-batch.json'

try {
    [IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
    [IO.File]::Copy($specSource, $specTarget, $false)
    Assert-Sha256 $specTarget `
        $ExpectedInputs[
            'validity-proof/consumer-jvm/BridgeSubstrateFederatedSettlementFamilyV1CompilerSpec.scala'
        ] `
        'copied federated settlement compiler spec'

    $tsx = Resolve-ExactFile `
        (Join-Path $BridgeRoot 'relayer\node_modules\tsx\dist\cli.mjs') `
        'tsx runtime'
    $requestBuilder = Join-Path $BridgeRoot `
        'relayer\src\scripts\build-substrate-federated-settlement-family-v1-compiler-fixture.ts'
    $requestOutput = Invoke-NativeChecked `
        'federated settlement compiler request builder' {
        & $NodePath $tsx $requestBuilder --output $requestPath
    }
    Assert-ExactAsciiLfFile $requestPath `
        'generated federated settlement compiler request' | Out-Null
    Assert-Sha256 $requestPath $ExpectedRequestSha256 `
        'generated federated settlement compiler request'
    $requestText = $requestOutput -join [Environment]::NewLine
    if ($requestText -notmatch "fixture_sha256=$ExpectedRequestSha256") {
        throw 'request builder did not report the expected request identity'
    }

    Push-Location $SigmaStateRoot
    try {
        $sbtOutput = Invoke-NativeChecked 'pinned JVM compiler' {
            & $JavaPath `
                -Xms1024m `
                -Xmx4096m `
                -Xss4M `
                '-Dsbt.version=1.12.11' `
                '-Dsbt.log.noformat=true' `
                '-Dsbt.supershell=false' `
                "-Dbridge.substrate.federated.settlement.v1.root=$BridgeRoot" `
                "-Dbridge.substrate.federated.settlement.v1.identity.out=$compilerBatchPath" `
                -jar `
                $SbtLauncherPath `
                'scJVM/Test/testOnly sigma.bridge.BridgeSubstrateFederatedSettlementFamilyV1CompilerSpec'
        }
    } finally {
        Pop-Location
    }
    $sbtText = $sbtOutput -join [Environment]::NewLine
    if ($sbtText -notmatch 'welcome to sbt 1\.12\.11' -or
        $sbtText -notmatch 'Total number of tests run: 1' -or
        $sbtText -notmatch 'All tests passed') {
        throw 'pinned JVM did not report the exact successful compiler set'
    }
    foreach ($contractId in @(
        '3a3c8f40d4901b8ae30a5b6a43c001127bcf8d4cb6a3e89bc1b075620b7683e4',
        '76c16560b4232d3d992febfd3a9939b67203424087b5b54a1845e13b39464402',
        '16ac723b2c5e899240173abbb5632aa4a1730c0688ada499898a63b05389421c'
    )) {
        if ($sbtText -notmatch [regex]::Escape($contractId)) {
            throw "pinned JVM did not report contract ID $contractId"
        }
    }

    Assert-ExactAsciiLfFile $compilerBatchPath `
        'generated federated settlement compiler batch' | Out-Null
    Assert-Sha256 $compilerBatchPath $ExpectedCompilerBatchSha256 `
        'generated federated settlement compiler batch'

    Write-Output 'substrate_federated_settlement_family_v1_compiler=PASS'
    Write-Output 'tests=1'
    Write-Output "compiler_request_sha256=$ExpectedRequestSha256"
    Write-Output "compiler_batch_sha256=$ExpectedCompilerBatchSha256"
    Write-Output 'profile_activated=false'
    Write-Output 'node_check_performed=false'
    Write-Output 'signing_performed=false'
    Write-Output 'submission_performed=false'
    Write-Output 'broadcast_performed=false'
    Write-Output 'funds_authority_established=false'
    Write-Output 'gate5_closed=false'
    Write-Output 'trustless_status_established=false'
} finally {
    if (Test-Path -LiteralPath $specTarget) {
        [IO.File]::Delete($specTarget)
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
        throw 'federated settlement compiler left the SigmaState checkout dirty'
    }
}
