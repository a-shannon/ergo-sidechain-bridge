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
$ExpectedLockHash = '1573a69aa3c5cafa302621efcc65032b653e9cf1548a32c69e2dd5011ca8b56d'
$ExpectedPatchHash = 'cd282677b05e1fca21d9c94e6338566ce4448ce503f7055de8667aaa86378fdf'
$ExpectedBoundedProcessLibraryHash = @(
    '391aa32f06203512517ca32a9b062247f224cfae29d542b01fb355633849c75a',
    'eec0c0e7a61f5489f957c3ea0d93041cd518cc2a09157122d8648476f67e870c',
    'ea07ff1c95e54e60cfd4e621dce04de6074c46e9744dace674c1dbef4190276a')
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
        'aa69b780cebceb3e07b7f3682ca4af52aa8de7a2ecfb345939173c8d73ea26aa',
        'fd3593161754ce29bd93b4ec6d28ce2ce50bcc508b718787af716be60e70a17c')
    'src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala' = @(' M',
        'cac4a5280fcd45b85a2007b86d44cbb7a4316e312246f69599f2ce140b06b632',
        '31eef3c1990b22ca7fa667503a73079e6d2d615ef688524bdbdca221b241405b')
    'src/main/scala/org/ergoplatform/mining/ErgoMiner.scala' = @(' M',
        'b12b5909f05dae3618efaec2e1ae4a123e4decbba029822c238359f56acf062e',
        '5f84314936680588497778b534be3f98724a51eee517f815980022452c4ca3e6')
    'src/main/scala/org/ergoplatform/mining/OwnedMiningSubmissionV1.scala' = @('??',
        '0079375a40231ac7f690d153ea37a112a7ba06d7af5b4ab3dd0a472a723168ae',
        '06021e33ecf612a194d9ddfa89b22eaeace5eb0d1ae7c6176af46170573a59e4')
    'src/test/scala/org/ergoplatform/http/routes/MiningApiRouteSpec.scala' = @(' M',
        'fedcae828c82a19778ec4301781f449c12d5d1845b6c56c55c843fc3b9c9d05f',
        'fc4b02b85cb98bce78ec7aacfce4781b84fced8792d33cab5e9f17c7d82ca8b4')
    'src/test/scala/org/ergoplatform/mining/CandidateGeneratorSpec.scala' = @(' M',
        'fe66e8a313befaa198d4fea966b19b91067d5b756eaad98afaba151f8d0bb463',
        'dbfd445a0655f8b9892962717aae674bcbbdfd09a1e2c299401ba965c350a4d8')
    'src/test/scala/org/ergoplatform/mining/OwnedMiningSubmissionActorSpec.scala' = @('??',
        '84b11846820c67f05435525bad4992ebcea512c257f6efc9eb5e43c645a4dde4',
        'a97593d3918a752b59a1b6b7296324325da8706639ce024cb88fd5e7d6d38f8a')
    'src/test/scala/org/ergoplatform/mining/OwnedMiningSubmissionV1Spec.scala' = @('??',
        '808b58e4ed52aed4d826c49c043cfa814c4005a2f4f83c778a4de0de0c5bb7ec',
        'a9898bf22ab5cbc059614dddd99450d20c3ef8e56d7da04f03c976432ea18a70')
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
