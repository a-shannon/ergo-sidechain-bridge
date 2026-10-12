[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ErgoNodeRoot,
    [Parameter(Mandatory = $true)][string] $GitPath,
    [Parameter(Mandatory = $true)][string] $NodePath,
    [Parameter(Mandatory = $true)][string] $JavaPath,
    [Parameter(Mandatory = $true)][string] $SbtLauncherPath,
    [Parameter(Mandatory = $true)][string] $FixturePath,
    [Parameter(Mandatory = $true)][string] $FixtureSha256,
    [Parameter(Mandatory = $true)][string] $OutputRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ExpectedNodeCommit = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1'
$ExpectedSpecHash = @(
    'bb254fc9ca85dee6c46401d87cd0d1c01f95a78a3f0d07bfd0e7f49a2fc7b49f',
    '21ad223ae443505dc04c7b55f5a9baf9a687c482e7e7e6fb7235dca2fb7d70a4')
$ExpectedLockHash = '82e96dca999244f145a67381e0037770dfd93ad61ecb29d3063a6e5ea426a8b6'
$ExpectedPatchHash = '08fb00b4c94f7db54228b6312bea58af430f13825e2b231821da3ef26e4796c3'
$ExpectedBoundedProcessLibraryHash = @(
    '13ba7a4c3fa11b62d7353af5babaee01979362984740a660026dc3da087a4911',
    '1f7d0b56931de10d69deb533c92a165a103a00aa376478eab6d7f28721b2ed47',
    '34a0186efed2a8f4f1766b4d8d73a1a8defa34b95f8897373d38dd6832e9f577')
$ExpectedBoundedProcessImplementationHash = @(
    '6a3153c6a69c290ced5f7fd7eaebbb975d69aa1010e9c6bd98ca31e71041c208',
    'b84c68bb7ddd9526832c92a76c149f10d024be477e73127399439ad46d85da02',
    '2dadbfc063fc51f7f7c6ed85ac95380378957447110ebf8daee13723eb797ab3')
$ExpectedTests = 48
$SbtTimeoutMilliseconds = 300000
$TerminationGraceMilliseconds = 15000
$MaxOutputBytes = 4MB
$MaxOwnerOutputBytes = $MaxOutputBytes + 64KB
# Exact byte alternatives: reviewed source-work bytes and their separately
# verified LF reconstruction. No normalization is performed during admission.
$PatchFiles = [ordered]@{
    'src/main/scala/org/ergoplatform/http/api/MiningApiRoute.scala' = @(' M',
        '3174bd8ab627c71130bf08c3d7b240c124a7aa75b63238d3a0b91b9cae5eff01',
        '58c20d56e196efabc2252659996dad8c0037cbab6ad1523b64c601610ef73e75')
    'src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala' = @(' M',
        '254af1743ea8d580e052f156b3c3c6c45788256dbac3215f8d7f50a90ca0a3f0',
        'cbe5dadb6456274bdf707a472d8cf8f863f40cac1dee177c2089c16765362eda')
    'src/main/scala/org/ergoplatform/mining/ErgoMiner.scala' = @(' M',
        '4d4f822ab1afef897a8810537f5ccb4e7d78c684e15926dd61d21ec7630ce94c',
        'dac558df8c32681403ed8a3443c4dd3919da0a92b7ac3e6ee63106c2a0d28161')
    'src/main/scala/org/ergoplatform/mining/OwnedMiningSubmissionV1.scala' = @('??',
        '6532b75cc47c0c4e518d5e4a19bf710b0ef0de70d1fcc2b14f256f432fd48a95',
        '9bc046c607d5084c216bc27fe446ed157ed0cf2eff0a4a033181c07888c571ba')
    'src/test/scala/org/ergoplatform/http/routes/MiningApiRouteSpec.scala' = @(' M',
        '8729a4e0419a5ca203a19532357e3c3d3f08948ea498e7be60f998e52944773e',
        'c9e20bbf1e3e85cb6121b4d14201ae7211de9425f6021dd174ffb0401f430ef7')
    'src/test/scala/org/ergoplatform/mining/CandidateGeneratorSpec.scala' = @(' M',
        '2cf2358e398a18c909d7b537ec68f4b3277b649ca0ff59ea252eb1b4b563b3dd',
        '059cc455d778b1f3ecf4a641a9e723d405deace67f4e7c72e3c66a1323ed4184')
    'src/test/scala/org/ergoplatform/mining/OwnedMiningSubmissionActorSpec.scala' = @('??',
        '661b60135bc1587d583c41a9028b25f9527ae9f77fd0d59e37eac29e2be560b9',
        '94d85146b4f1c4984106c71315835d071b0aa0f41514c22c2f5ede9d153119d9')
    'src/test/scala/org/ergoplatform/mining/OwnedMiningSubmissionV1Spec.scala' = @('??',
        'e7218a6510f407cb3ffbb161072e7d400ea98dd28113314b3f913225902b2640',
        '145b4112c79c53ae8ea6e0d5160264e6acfd11b32631ee9992996fba4c4d299a')
}

function Resolve-RealPath([string] $Path, [bool] $Directory) {
    if (-not [IO.Path]::IsPathRooted($Path) -or $Path -match '["\r\n\x00]') {
        throw 'Expected an absolute path without command delimiters'
    }
    $item = Get-Item -LiteralPath (Resolve-Path -LiteralPath $Path).Path -Force
    if ($item.PSIsContainer -ne $Directory) { throw 'Unexpected path kind' }
    $current = $item
    while ($null -ne $current) {
        if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not permitted' }
        $link = $current.PSObject.Properties['LinkType']
        if ($null -ne $link -and $link.Value -eq 'HardLink') { throw 'Hard-linked inputs are not permitted' }
        $current = if ($current -is [IO.DirectoryInfo]) { $current.Parent } else { $current.Directory }
    }
    return $item.FullName
}
function Assert-Hash([string] $Path, [object] $Expected) {
    $pins = @($Expected)
    if ($pins.Count -eq 0) { throw 'Expected digest set is empty' }
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($pin in $pins) {
        if ($pin -isnot [string] -or $pin -cnotmatch '^[0-9a-f]{64}$' -or -not $seen.Add($pin)) {
            throw 'Expected digest set is malformed or duplicated'
        }
    }
    $resolved = Resolve-RealPath $Path $false
    if ($pins -cnotcontains (Get-FileHash -LiteralPath $resolved -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()) {
        throw "Input digest mismatch: $Path"
    }
}
function Invoke-SourceGit([string[]] $Arguments) {
    $value = @(& $GitPath --no-optional-locks -c core.fsmonitor=false -c core.ignorestat=false -C $ErgoNodeRoot @Arguments)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect pinned Ergo source' }
    return $value
}
function Assert-NodeSource {
    Assert-Hash $LockPath $ExpectedLockHash
    Assert-Hash $PatchPath $ExpectedPatchHash
    $head = @(Invoke-SourceGit @('rev-parse', 'HEAD'))
    if ($head.Count -ne 1 -or $head[0] -cne $ExpectedNodeCommit) { throw 'Ergo source commit mismatch' }
    $index = @(Invoke-SourceGit @('diff', '--cached', '--name-only', '--no-ext-diff'))
    if ($index.Count -ne 0) { throw 'Ergo index must remain empty' }
    $flags = @(Invoke-SourceGit @('ls-files', '-v'))
    if ($flags.Count -eq 0 -or @($flags | Where-Object { $_ -cnotmatch '^H ' }).Count -ne 0) {
        throw 'Ergo tracked files must not hide changes with index flags'
    }
    $status = @(Invoke-SourceGit @('status', '--short', '--untracked-files=all'))
    $expected = @($PatchFiles.GetEnumerator() | ForEach-Object { $_.Value[0] + ' ' + $_.Key })
    if (@(Compare-Object $status $expected -CaseSensitive).Count -ne 0) {
        throw 'Ergo source must contain exactly five modified and three added pinned files'
    }
    $lock = Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json
    if ($lock.ergoNode.baseCommit -cne $ExpectedNodeCommit -or @($lock.ergoNode.files).Count -ne 8) {
        throw 'Pinned Ergo declaration mismatch'
    }
    foreach ($declaration in $lock.ergoNode.files) {
        if (-not $PatchFiles.Contains($declaration.path)) { throw 'Unexpected declared Ergo path' }
        $pin = $PatchFiles[$declaration.path]
        $wantedStatus = if ($pin[0] -ceq '??') { 'added' } else { 'modified' }
        if ($declaration.status -cne $wantedStatus) { throw 'Declared Ergo status mismatch' }
        $path = Resolve-RealPath (Join-Path $ErgoNodeRoot $declaration.path) $false
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -cne $pin[1] -and $actual -cne $pin[2]) { throw 'Patched Ergo bytes are outside the exact alternatives' }
        if ($wantedStatus -ceq 'modified') {
            $base = @(Invoke-SourceGit @('rev-parse', ($ExpectedNodeCommit + ':' + $declaration.path)))
            if ($base.Count -ne 1 -or $base[0] -cne $declaration.baseBlob) { throw 'Ergo modified-file base mismatch' }
        } else {
            $tracked = @(Invoke-SourceGit @('ls-files', '--stage', '--', $declaration.path))
            if ($tracked.Count -ne 0) { throw 'Added Ergo file must remain untracked' }
        }
    }
}
function Assert-AllInputs {
    foreach ($entry in $InputPins.GetEnumerator()) { Assert-Hash $entry.Key $entry.Value }
    Assert-Hash $FixturePath $FixtureSha256
    $length = (Get-Item -LiteralPath $FixturePath).Length
    if ($length -le 0 -or $length -gt 1MB) { throw 'Fixture is outside its size bound' }
    Assert-NodeSource
}
function Assert-SuccessOutput([string] $Output, [int] $ExitCode) {
    # Fixed to the exact pinned spec, not a caller-selected expected count.
    $ExpectedTests = 48
    if ($ExitCode -ne 0) { throw 'Offline continuation validation exited nonzero' }
    $counts = [regex]::Matches($Output, '(?m)^\[info\] Total number of tests run:[^\r\n]*\r?$')
    $suites = [regex]::Matches($Output, '(?m)^\[info\] Suites:[^\r\n]*\r?$')
    $success = [regex]::Matches($Output, '(?m)^\[info\] Tests:[^\r\n]*\r?$')
    $passed = [regex]::Matches($Output, '(?m)^\[info\] All tests passed[^\r\n]*\r?$')
    if ($counts.Count -ne 1 -or
        $counts[0].Value -cnotmatch ('^\[info\] Total number of tests run: ' + $ExpectedTests + '\r?$') -or
        $suites.Count -ne 1 -or $suites[0].Value -cnotmatch '^\[info\] Suites: completed 1, aborted 0\r?$' -or
        $success.Count -ne 1 -or
        $success[0].Value -cnotmatch ('^\[info\] Tests: succeeded ' + $ExpectedTests + ', failed 0, canceled 0, ignored 0, pending 0\r?$') -or
        $passed.Count -ne 1 -or $passed[0].Value -cnotmatch '^\[info\] All tests passed\.\r?$') {
        throw 'Pinned validator did not report all 48 tests with no aborted or skipped cases'
    }
}
function Invoke-BoundedJob([string[]] $Arguments) {
    $request = [ordered]@{
        executablePath = $JavaPath; args = @($Arguments); cwd = $ErgoNodeRoot
        timeoutMs = $SbtTimeoutMilliseconds; maxOutputBytes = $MaxOutputBytes
        terminationGraceMs = $TerminationGraceMilliseconds
    }
    # Reuse the existing bounded owner and its exact request contract.
    $key = 'E2S_NATIVE_TRACKER_MEMPOOL_PROCESS_REQUEST_B64'
    $prior = [Environment]::GetEnvironmentVariable($key, 'Process')
    try {
        $requestJson = ConvertTo-Json -Compress -Depth 4 -InputObject $request
        [Environment]::SetEnvironmentVariable($key,
            [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($requestJson)), 'Process')
        $priorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $records = @(& $NodePath $TsxCliPath $ProcessOwnerPath 2>&1)
            $exitCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $priorPreference }
        $output = @($records | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        if ([Text.Encoding]::UTF8.GetByteCount($output) -gt $MaxOwnerOutputBytes) { throw 'Owner output exceeded its envelope' }
        if ($output.Length -gt 0) { Write-Host $output.TrimEnd() }
        Assert-SuccessOutput $output $exitCode
        return $output
    } finally { [Environment]::SetEnvironmentVariable($key, $prior, 'Process') }
}

$BridgeRoot = Resolve-RealPath ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) $true
$RelayerRoot = Resolve-RealPath (Join-Path $BridgeRoot 'relayer') $true
$ErgoNodeRoot = Resolve-RealPath $ErgoNodeRoot $true
$GitPath = Resolve-RealPath $GitPath $false
$NodePath = Resolve-RealPath $NodePath $false
$JavaPath = Resolve-RealPath $JavaPath $false
$SbtLauncherPath = Resolve-RealPath $SbtLauncherPath $false
$FixturePath = Resolve-RealPath $FixturePath $false
$OutputRoot = Resolve-RealPath $OutputRoot $true
$SpecPath = Resolve-RealPath (Join-Path $PSScriptRoot 'BridgeSubstrateFederatedNativeContinuationTransactionSpec.scala') $false
$LockPath = Resolve-RealPath (Join-Path $BridgeRoot 'sources/consensus-source-lock.json') $false
$PatchPath = Resolve-RealPath (Join-Path $BridgeRoot 'sources/ergo-node/0002-sidechain-extension-fields-candidate-recovery.patch') $false
$JobRunnerPath = Resolve-RealPath (Join-Path $RelayerRoot 'src/scripts/windows-job-process.ps1') $false
$BoundedProcessLibraryPath = Resolve-RealPath (Join-Path $RelayerRoot 'src/pinned-local-native-verifier-build.ts') $false
$BoundedProcessImplementationPath = Resolve-RealPath (Join-Path $RelayerRoot 'src/bounded-process-runner.ts') $false
$ProcessOwnerPath = Resolve-RealPath (Join-Path $RelayerRoot 'src/scripts/run-substrate-federated-native-tracker-mempool-process.ts') $false
$TsxCliPath = Resolve-RealPath (Join-Path $RelayerRoot 'node_modules/tsx/dist/cli.mjs') $false
$TsxPackagePath = Resolve-RealPath (Join-Path $RelayerRoot 'node_modules/tsx/package.json') $false
$PackageLockPath = Resolve-RealPath (Join-Path $RelayerRoot 'package-lock.json') $false
$InputPins = [ordered]@{}
$InputPins[$GitPath] = '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5'
$InputPins[$NodePath] = '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088'
$InputPins[$JavaPath] = '69ae5108b20bb132442ebe756a41e67f9b33b65b7ae6dc2a87b3b04947bab19e'
$InputPins[$SbtLauncherPath] = 'b4c0c55d68f11b1510d884641cb1b1456191dac40ddc958bf86c825adc344e16'
$InputPins[$JobRunnerPath] = '47a08af66ef3134fefeee392e5578be9295e5171dca83c8861822d7e464ff627'
$InputPins[$BoundedProcessLibraryPath] = $ExpectedBoundedProcessLibraryHash
$InputPins[$BoundedProcessImplementationPath] = $ExpectedBoundedProcessImplementationHash
$InputPins[$ProcessOwnerPath] = '21ba11605b4bb06b5d94eb8d8d013a675c7c6f7d2d15bed89ac626d7e7cdbc1e'
$InputPins[$TsxCliPath] = '0ef1d6f8dee95174853c479fb4d9ffdcebf755125a0b477a1236bac331ccf9d5'
$InputPins[$TsxPackagePath] = '4321447dcfb5bc39e683e6a49555bfb6dadc4543fc64baf5cc43020e9c1775a1'
$InputPins[$PackageLockPath] = 'ac35cf3f84afbe1ffd089f6f5b89864182045db05ad21c2c8a059f1d120aa5ad'
$InputPins[$SpecPath] = $ExpectedSpecHash
foreach ($root in @($BridgeRoot, $ErgoNodeRoot)) {
    foreach ($path in @($FixturePath, $OutputRoot)) {
        if ($path.Equals($root, [StringComparison]::OrdinalIgnoreCase) -or
            $path.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Fixture and offline output must be outside source checkouts'
        }
    }
}
if (@(Get-ChildItem -LiteralPath $OutputRoot -Force).Count -ne 0) { throw 'Offline output parent must be empty' }
foreach ($path in @($OutputRoot, $ErgoNodeRoot)) {
    if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($path)).AvailableFreeSpace -lt 10GB) { throw 'Insufficient local build headroom' }
}
foreach ($name in @('JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'SBT_OPTS',
    'NODE_OPTIONS', 'NODE_PATH', 'TSX_TSCONFIG_PATH')) {
    if ([Environment]::GetEnvironmentVariable($name)) { throw "Unreviewed option variable: $name" }
}
if ($env:SIGMASTATE_VERSION -and $env:SIGMASTATE_VERSION -cne '6.0.2') { throw 'Pinned node requires SigmaState 6.0.2' }
Assert-AllInputs
$cache = Resolve-RealPath (Join-Path $env:LOCALAPPDATA 'Coursier/cache/v1/https/repo1.maven.org/maven2') $true
$coursierCache = Resolve-RealPath (Join-Path $env:LOCALAPPDATA 'Coursier/cache/v1') $true
$boot = Resolve-RealPath (Join-Path $env:USERPROFILE '.sbt/boot') $true
$systemRoot = Resolve-RealPath $env:SystemRoot $true
$offlineRoot = Join-Path $OutputRoot ('native-continuation-offline-' + [Guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $offlineRoot) { throw 'Offline output must be fresh' }
[IO.Directory]::CreateDirectory($offlineRoot) | Out-Null
$offlineRoot = Resolve-RealPath $offlineRoot $true
foreach ($directory in @('home', 'appdata', 'localappdata', 'coursier-config', 'global', 'global-cache', 'ivy', 'temp', 'powershell-cache', 'empty')) {
    [IO.Directory]::CreateDirectory((Join-Path $offlineRoot $directory)) | Out-Null
}
$empty = Resolve-RealPath (Join-Path $offlineRoot 'empty') $true
$cacheUri = ([Uri]($cache.TrimEnd('\') + '\')).AbsoluteUri
$emptyUri = ([Uri]($empty.TrimEnd('\') + '\')).AbsoluteUri
$repoBytes = [Text.Encoding]::UTF8.GetBytes("[repositories]`n  bridge-maven-central-cache: $cacheUri`n  bridge-empty-offline: $emptyUri, bootOnly`n")
$repositories = Join-Path $offlineRoot 'repositories'
$stream = [IO.File]::Open($repositories, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $stream.Write($repoBytes, 0, $repoBytes.Length) } finally { $stream.Dispose() }
$repositories = Resolve-RealPath $repositories $false
$repositoriesHash = (Get-FileHash -LiteralPath $repositories -Algorithm SHA256).Hash.ToLowerInvariant()
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($repositories)) -cne [Convert]::ToBase64String($repoBytes)) {
    throw 'File-only repository configuration mismatch'
}
$prefix = 'bridge.substrate.federated.native.continuation.transaction.'
$arguments = @(
    '-Xmx4G', '-Dsbt.supershell=false', '-Dsbt.log.noformat=true', '-Dsbt.offline=true',
    '-Dsbt.server.autostart=false', '-Dsbt.override.build.repos=false', '-Djava.net.useSystemProxies=false',
    "-Dsbt.repository.config=$repositories", "-Dsbt.boot.directory=$boot",
    "-Dsbt.global.base=$offlineRoot/global", "-Dsbt.ivy.home=$offlineRoot/ivy",
    "-Dsbt.global.localcache=$offlineRoot/global-cache", "-Duser.home=$offlineRoot/home",
    "-Djava.io.tmpdir=$offlineRoot/temp", "-D${prefix}root=$ErgoNodeRoot",
    "-D${prefix}fixture=$FixturePath", "-D${prefix}fixture.sha256=$FixtureSha256",
    '-jar', $SbtLauncherPath,
    'set offline := true', 'set logLevel := Level.Info',
    'set Test / fork := false', 'set Test / parallelExecution := false',
    ('set Test / unmanagedSources := Seq(file("' + $SpecPath.Replace('\', '/') + '"))'),
    'Test / testOnly org.ergoplatform.bridge.BridgeSubstrateFederatedNativeContinuationTransactionSpec'
)
$childEnvironment = @{
    APPDATA = "$offlineRoot/appdata"; CI = 'true'; COURSIER_CACHE = $coursierCache
    COURSIER_CONFIG_DIR = "$offlineRoot/coursier-config"; COURSIER_MODE = 'offline'
    HOME = "$offlineRoot/home"; USERPROFILE = "$offlineRoot/home"
    JAVA_HOME = (Split-Path -Parent (Split-Path -Parent $JavaPath))
    LOCALAPPDATA = "$offlineRoot/localappdata"; NO_COLOR = '1'; PATH = (Split-Path -Parent $JavaPath)
    PSModuleAnalysisCachePath = "$offlineRoot/powershell-cache/ModuleAnalysisCache"
    SCALA_CLI_CONFIG = "$offlineRoot/scala-cli-config.json"
    SystemRoot = $systemRoot; WINDIR = $systemRoot; TEMP = "$offlineRoot/temp"; TMP = "$offlineRoot/temp"
}
$savedEnvironment = [Environment]::GetEnvironmentVariables('Process')
$primaryError = $null
try {
    Assert-AllInputs
    Assert-Hash $repositories $repositoriesHash
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable([string]$name, $null, 'Process') }
    foreach ($name in $childEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $childEnvironment[$name], 'Process') }
    $result = Invoke-BoundedJob $arguments
} catch { $primaryError = $_.Exception }
finally {
    foreach ($name in [Environment]::GetEnvironmentVariables('Process').Keys) { [Environment]::SetEnvironmentVariable([string]$name, $null, 'Process') }
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable([string]$name, [string]$savedEnvironment[$name], 'Process') }
    $errors = New-Object 'Collections.Generic.List[Exception]'
    try { Assert-AllInputs } catch { $errors.Add($_.Exception) }
    try { Assert-Hash $repositories $repositoriesHash } catch { $errors.Add($_.Exception) }
    if ($null -ne $primaryError) { $errors.Insert(0, $primaryError) }
    if ($errors.Count -eq 1) { throw $errors[0] }
    if ($errors.Count -gt 1) { throw [AggregateException]::new('Offline continuation validation and input recheck failed', $errors.ToArray()) }
}
Write-Output 'native_continuation_offline_transaction_validation=PASS'
Write-Output "tests=$ExpectedTests"
Write-Output 'offline_output_retained=true'
Write-Output 'chain_resident_acceptance=false'
Write-Output 'node_services_started=false'
Write-Output 'campaign_failure_cause_established=false'
