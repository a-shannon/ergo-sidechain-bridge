[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ErgoNodeRoot,
    [Parameter(Mandatory = $true)][string] $GitPath,
    [Parameter(Mandatory = $true)][string] $NodePath,
    [Parameter(Mandatory = $true)][string] $JavaPath,
    [Parameter(Mandatory = $true)][string] $SbtLauncherPath,
    [Parameter(Mandatory = $true)][string] $FixturePath,
    [Parameter(Mandatory = $true)][string] $FixtureSha256,
    [Parameter(Mandatory = $true)][string] $ScratchRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ExpectedNodeCommit = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1'
$ExpectedSpecHash = '6e9d7bda01680ca2214ba16d29c69b37da3fae1de763867b8fbe8f835545db84'
$ExpectedNodeHash = '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088'
$ExpectedJobRunnerHash = '47a08af66ef3134fefeee392e5578be9295e5171dca83c8861822d7e464ff627'
$ExpectedBoundedProcessLibraryHash = '09cc5b729365b8e41b276117b54888dd58d0f2dc89b08a21db1f64853cfa82af'
$ExpectedProcessOwnerHash = '21ba11605b4bb06b5d94eb8d8d013a675c7c6f7d2d15bed89ac626d7e7cdbc1e'
$ExpectedTsxCliHash = '0ef1d6f8dee95174853c479fb4d9ffdcebf755125a0b477a1236bac331ccf9d5'
$ExpectedTsxPackageHash = '4321447dcfb5bc39e683e6a49555bfb6dadc4543fc64baf5cc43020e9c1775a1'
$ExpectedPackageLockHash = 'a7563e82e39489befde85608276a5739f1b5d4d924e13b33c50829d28f9178b8'
$ExpectedTests = 13
$SbtTimeoutMilliseconds = 300000
$TerminationGraceMilliseconds = 15000
$MaxOutputBytes = 4MB
$MaxOwnerOutputBytes = $MaxOutputBytes + 64KB
$PatchFiles = [ordered]@{
    'src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala' =
        '43fa47c1b8cb50f76ddc25f3398dfe7e6a55da4557183780f8dc9ecefa22c3bc'
    'src/test/scala/org/ergoplatform/mining/CandidateGeneratorSpec.scala' =
        '67abc3d95c5f582a875e9bf8c14efef99ef5b67406770e359d47572e3aca0efb'
}

function Resolve-RealPath([string] $Path, [bool] $Directory) {
    if (-not [IO.Path]::IsPathRooted($Path) -or $Path -match '["\r\n]') {
        throw 'Expected an absolute path without SBT command delimiters'
    }
    $item = Get-Item -LiteralPath (Resolve-Path -LiteralPath $Path).Path
    if ($item.PSIsContainer -ne $Directory) { throw 'Unexpected path kind' }
    $current = $item
    while ($null -ne $current) {
        if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Reparse points are not permitted in fixture paths'
        }
        $current = if ($current -is [IO.DirectoryInfo]) { $current.Parent } else { $current.Directory }
    }
    return $item.FullName
}

function Assert-Hash([string] $Path, [string] $Expected) {
    if ($Expected -cnotmatch '^[0-9a-f]{64}$' -or
        (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Expected) {
        throw "Input digest mismatch: $Path"
    }
}

function Assert-NodeSource {
    $head = (& $GitPath -C $ErgoNodeRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -cne $ExpectedNodeCommit) { throw 'Ergo source commit mismatch' }
    $status = @(& $GitPath -C $ErgoNodeRoot status --short --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Ergo source status' }
    $expected = @($PatchFiles.Keys | ForEach-Object { " M $_" })
    if (@(Compare-Object $status $expected -CaseSensitive).Count -ne 0) {
        throw 'Ergo source must contain only the two pinned extension changes'
    }
    foreach ($entry in $PatchFiles.GetEnumerator()) {
        Assert-Hash (Join-Path $ErgoNodeRoot $entry.Key) $entry.Value
    }
}

function ConvertTo-BridgeBase64([string] $Value) {
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
}

function Remove-OwnedScratchChildren([string] $Parent) {
    $prefix = $Parent.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    foreach ($child in @(Get-ChildItem -LiteralPath $Parent -Force)) {
        $childPath = [IO.Path]::GetFullPath($child.FullName)
        if (-not $child.PSIsContainer -or
            $child.Name -cnotmatch '^native-tracker-mempool-[A-Za-z0-9-]+$' -or
            -not $childPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
            -not $child.Parent.FullName.Equals($Parent, [StringComparison]::OrdinalIgnoreCase) -or
            ($child.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Scratch cleanup found an unowned or unsafe direct child'
        }
        $pending = New-Object 'Collections.Generic.Stack[IO.DirectoryInfo]'
        $pending.Push($child)
        while ($pending.Count -gt 0) {
            $directory = $pending.Pop()
            foreach ($entry in @(Get-ChildItem -LiteralPath $directory.FullName -Force)) {
                $entryPath = [IO.Path]::GetFullPath($entry.FullName)
                if (-not $entryPath.StartsWith(
                    $childPath + [IO.Path]::DirectorySeparatorChar,
                    [StringComparison]::OrdinalIgnoreCase) -or
                    ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                    throw 'Scratch cleanup found an unsafe descendant'
                }
                if ($entry.PSIsContainer) { $pending.Push($entry) }
            }
        }
        $confirmed = Get-Item -LiteralPath $childPath -Force
        if ($confirmed.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Scratch cleanup child changed after verification'
        }
        Remove-Item -LiteralPath $childPath -Recurse -Force
    }
    if (@(Get-ChildItem -LiteralPath $Parent -Force).Count -ne 0) {
        throw 'Synthetic state cleanup left scratch contents'
    }
}

function Invoke-BoundedJob(
    [string] $NodeExecutable,
    [string] $TsxCli,
    [string] $ProcessOwner,
    [string] $Application,
    [string[]] $Arguments,
    [string] $WorkingDirectory,
    [ref] $OwnerReturned
) {
    $request = [ordered]@{
        executablePath = $Application
        args = @($Arguments)
        cwd = $WorkingDirectory
        timeoutMs = $SbtTimeoutMilliseconds
        maxOutputBytes = $MaxOutputBytes
        terminationGraceMs = $TerminationGraceMilliseconds
    }
    $requestEnvironmentKey = 'E2S_NATIVE_TRACKER_MEMPOOL_PROCESS_REQUEST_B64'
    $priorValue = [Environment]::GetEnvironmentVariable($requestEnvironmentKey, 'Process')
    try {
        $requestJson = ConvertTo-Json -Compress -Depth 4 -InputObject $request
        [Environment]::SetEnvironmentVariable(
            $requestEnvironmentKey,
            (ConvertTo-BridgeBase64 $requestJson),
            'Process')
        try {
            $priorErrorActionPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                $records = @(& $NodeExecutable $TsxCli $ProcessOwner 2>&1)
                $exitCode = $LASTEXITCODE
                $OwnerReturned.Value = $true
            } finally {
                $ErrorActionPreference = $priorErrorActionPreference
            }
        } finally {
            [Environment]::SetEnvironmentVariable($requestEnvironmentKey, $priorValue, 'Process')
        }
        $output = @($records | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        if ([Text.Encoding]::UTF8.GetByteCount($output) -gt $MaxOwnerOutputBytes) {
            throw 'Bounded process owner output exceeded its envelope'
        }
        if ($output.Length -gt 0) { Write-Host $output.TrimEnd() }
        if ($exitCode -ne 0) {
            throw "Pinned native tracker mempool validation failed with exit code $exitCode"
        }
        return $output
    } finally {
        [Environment]::SetEnvironmentVariable($requestEnvironmentKey, $priorValue, 'Process')
    }
}

$BridgeRoot = Resolve-RealPath ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) $true
$RelayerRoot = Resolve-RealPath (Join-Path $BridgeRoot 'relayer') $true
$JobRunnerPath = Resolve-RealPath (Join-Path $BridgeRoot 'relayer/src/scripts/windows-job-process.ps1') $false
$BoundedProcessLibraryPath = Resolve-RealPath (Join-Path $RelayerRoot 'src/pinned-local-native-verifier-build.ts') $false
$ProcessOwnerPath = Resolve-RealPath (Join-Path $RelayerRoot 'src/scripts/run-substrate-federated-native-tracker-mempool-process.ts') $false
$TsxCliPath = Resolve-RealPath (Join-Path $RelayerRoot 'node_modules/tsx/dist/cli.mjs') $false
$TsxPackagePath = Resolve-RealPath (Join-Path $RelayerRoot 'node_modules/tsx/package.json') $false
$PackageLockPath = Resolve-RealPath (Join-Path $RelayerRoot 'package-lock.json') $false
$ErgoNodeRoot = Resolve-RealPath $ErgoNodeRoot $true
$GitPath = Resolve-RealPath $GitPath $false
$NodePath = Resolve-RealPath $NodePath $false
$JavaPath = Resolve-RealPath $JavaPath $false
$SbtLauncherPath = Resolve-RealPath $SbtLauncherPath $false
$FixturePath = Resolve-RealPath $FixturePath $false
$ScratchRoot = Resolve-RealPath $ScratchRoot $true
foreach ($sourceRoot in @($BridgeRoot, $ErgoNodeRoot)) {
    foreach ($output in @($FixturePath, $ScratchRoot)) {
        if ($output.Equals($sourceRoot, [StringComparison]::OrdinalIgnoreCase) -or
            $output.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Synthetic fixture and state must be outside both source checkouts'
        }
    }
}
if (@(Get-ChildItem -LiteralPath $ScratchRoot -Force).Count -ne 0) { throw 'Scratch parent must be empty' }
if ((Get-Item -LiteralPath $FixturePath).Length -gt 1MB) { throw 'Fixture exceeds its size bound' }
foreach ($name in @('JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'SBT_OPTS')) {
    if ([Environment]::GetEnvironmentVariable($name)) { throw "Unreviewed JVM option variable: $name" }
}
foreach ($name in @('NODE_OPTIONS', 'NODE_PATH', 'TSX_TSCONFIG_PATH')) {
    if ([Environment]::GetEnvironmentVariable($name)) { throw "Unreviewed Node or tsx option variable: $name" }
}
if ($env:SIGMASTATE_VERSION -and $env:SIGMASTATE_VERSION -cne '6.0.2') {
    throw 'Pinned node requires SigmaState 6.0.2'
}
Assert-Hash $GitPath '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5'
Assert-Hash $NodePath $ExpectedNodeHash
Assert-Hash $JavaPath '69ae5108b20bb132442ebe756a41e67f9b33b65b7ae6dc2a87b3b04947bab19e'
Assert-Hash $SbtLauncherPath 'b4c0c55d68f11b1510d884641cb1b1456191dac40ddc958bf86c825adc344e16'
Assert-Hash $JobRunnerPath $ExpectedJobRunnerHash
Assert-Hash $BoundedProcessLibraryPath $ExpectedBoundedProcessLibraryHash
Assert-Hash $ProcessOwnerPath $ExpectedProcessOwnerHash
Assert-Hash $TsxCliPath $ExpectedTsxCliHash
Assert-Hash $TsxPackagePath $ExpectedTsxPackageHash
Assert-Hash $PackageLockPath $ExpectedPackageLockHash
$spec = Resolve-RealPath (Join-Path $PSScriptRoot 'BridgeSubstrateFederatedNativeTrackerMempoolSpec.scala') $false
Assert-NodeSource
Assert-Hash $spec $ExpectedSpecHash
Assert-Hash $FixturePath $FixtureSha256
$prefix = 'bridge.substrate.federated.native.tracker.mempool.'
$arguments = @(
    '-Xmx4G', '-Dsbt.supershell=false', '-Dsbt.log.noformat=true', '-Dsbt.offline=true',
    "-D${prefix}root=$ErgoNodeRoot", "-D${prefix}fixture=$FixturePath",
    "-D${prefix}fixture.sha256=$FixtureSha256", "-D${prefix}scratch=$ScratchRoot",
    '-jar', $SbtLauncherPath,
    'set offline := true', 'set logLevel := Level.Info',
    'set Test / fork := false', 'set Test / parallelExecution := false',
    ('set Test / unmanagedSources := Seq(file("' + $spec.Replace('\', '/') + '"))'),
    'Test / testOnly org.ergoplatform.bridge.BridgeSubstrateFederatedNativeTrackerMempoolSpec'
)
$result = $null
$primaryError = $null
$ownerReturned = $false
try {
    $result = Invoke-BoundedJob $NodePath $TsxCliPath $ProcessOwnerPath $JavaPath $arguments $ErgoNodeRoot ([ref]$ownerReturned)
    $counts = [regex]::Matches($result, '(?m)^\[info\] Total number of tests run: ([0-9]+)\r?$')
    if ($ExpectedTests -lt 1 -or $counts.Count -ne 1 -or
        $counts[0].Groups[1].Value -cne [string]$ExpectedTests -or $result -notmatch 'All tests passed') {
        throw 'Pinned node did not report the complete expected test set'
    }
} catch {
    $primaryError = $_.Exception
} finally {
    $closeoutErrors = New-Object 'Collections.Generic.List[Exception]'
    try { Assert-NodeSource } catch { $closeoutErrors.Add($_.Exception) }
    try { Assert-Hash $spec $ExpectedSpecHash } catch { $closeoutErrors.Add($_.Exception) }
    try { Assert-Hash $FixturePath $FixtureSha256 } catch { $closeoutErrors.Add($_.Exception) }
    if ($ownerReturned) {
        try { Remove-OwnedScratchChildren $ScratchRoot } catch { $closeoutErrors.Add($_.Exception) }
    } elseif (@(Get-ChildItem -LiteralPath $ScratchRoot -Force).Count -ne 0) {
        $closeoutErrors.Add([InvalidOperationException]::new(
            'Scratch cleanup withheld because process containment was not confirmed'))
    }
    if ($null -ne $primaryError) { $closeoutErrors.Insert(0, $primaryError) }
    if ($closeoutErrors.Count -eq 1) { throw $closeoutErrors[0] }
    if ($closeoutErrors.Count -gt 1) {
        throw [AggregateException]::new('Native tracker mempool validation and closeout failed', $closeoutErrors.ToArray())
    }
}
Write-Output 'native_tracker_synthetic_mempool=PASS'
Write-Output "tests=$ExpectedTests"
Write-Output 'chain_resident_acceptance=false'
Write-Output 'node_services_started=false'
Write-Output 'campaign_failure_cause_established=false'
