[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SigmaStateCheckout,

  [Parameter(Mandatory = $true)]
  [string]$BridgeRoot,

  [Parameter(Mandatory = $true)]
  [string]$JavaHome,

  [Parameter(Mandatory = $true)]
  [string]$SbtLaunchJar,

  [string]$NodeExecutable = 'node.exe'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedSigmaStateCommit =
  'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ExpectedCompilerSpecSha256 =
  'd2323b58b2349e7f9aa73f174ab2c11300942172ff90917aa96c5368b75f4897'
$ExpectedAcceptanceSpecSha256 =
  '1e5a03482f718cfc555e773e320f1f260406a9f22b597d003db91a8fc8f8af45'
$ExpectedContractSourceSha256 =
  'e7216bb2878d7d1f27369180ce5cbdb5e87a1be2cff290e13ea66d627aa6f0db'
$ExpectedStatementVectorSha256 =
  '30bc00b01df76985474190cf888e2702c857d896c94e87a3ed875d16d276ad10'
$ExpectedContractFixtureSha256 =
  'a95c221c08a4781fda97d58652520bc2f82d6c04fbcb30a8ea6f445cd6cbc217'
$ExpectedContextFixtureSha256 =
  '25287caf2c87827d5b3fbeff6a784746e54144ec6f343a14836efbb096e7241e'
$ExpectedTrackerBuilderSha256 =
  'fc30747afae153340f3273c86f7e0fd61d47e85448413d497b57e96601f39eb4'
$ExpectedFixtureBuilderSha256 =
  '3edca2b626978d746dd053f04bfd5473078a2e5146c94b9d32ba0b54d82c9329'
$ExpectedFixtureScriptSha256 =
  '675efa59c6dbe64c638a900438e1a18248a825a3d9175e5661f3f921b179bf30'

$CompilerSpecRelativePath =
  'validity-proof/consumer-jvm/BridgePooledReserveBurnTrackerV4ContractSpec.scala'
$AcceptanceSpecRelativePath =
  'validity-proof/consumer-jvm/BridgePooledReserveBurnTrackerV4AcceptanceSpec.scala'
$ContractSourceRelativePath =
  'contracts/SPVTrackerPooledReserveBurnV4.es'
$StatementVectorRelativePath =
  'relayer/test-vectors/pooled-reserve-burn-statement-v4.json'
$ContractFixtureRelativePath =
  'relayer/test-vectors/pooled-reserve-burn-tracker-contract-v4.json'
$ContextFixtureRelativePath =
  'relayer/test-vectors/pooled-reserve-burn-tracker-context-v4.json'
$TrackerBuilderRelativePath =
  'relayer/src/pooled-reserve-burn-tracker-v4.ts'
$FixtureBuilderRelativePath =
  'relayer/src/pooled-reserve-burn-tracker-v4-fixture.ts'
$FixtureScriptRelativePath =
  'relayer/src/scripts/build-pooled-reserve-burn-tracker-v4-jvm-fixture.ts'
$ToolchainLockRelativePath =
  'validity-proof/consumer-jvm/validity-application-pooled-reserve-compiler-lock-v1.json'
$CompilerSpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgePooledReserveBurnTrackerV4ContractSpec.scala'
$AcceptanceSpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgePooledReserveBurnTrackerV4AcceptanceSpec.scala'
$CompilerSpecClass =
  'sigma.bridge.BridgePooledReserveBurnTrackerV4ContractSpec'
$AcceptanceSpecClass =
  'sigma.bridge.BridgePooledReserveBurnTrackerV4AcceptanceSpec'

function Resolve-RealDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $item = Get-Item -LiteralPath $resolved
  if (
    -not $item.PSIsContainer -or
    (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
  ) {
    throw "$Label must be a real directory"
  }
  return $resolved
}

function Resolve-RealFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $item = Get-Item -LiteralPath $resolved
  if (
    $item.PSIsContainer -or
    (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
  ) {
    throw "$Label must be a real file"
  }
  return $resolved
}

function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Assert-Hash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Expected,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($Expected -cnotmatch '^[0-9a-f]{64}$') {
    throw "$Label expected SHA-256 must be 32 lowercase hex bytes"
  }
  if ((Get-Sha256Hex -Path $Path) -ne $Expected) {
    throw "$Label does not match the reviewed SHA-256"
  }
}

function Assert-ExactAsciiLfFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $item = Get-Item -LiteralPath $Path
  $bytes = [IO.File]::ReadAllBytes($item.FullName)
  if (
    $item.PSIsContainer -or
    (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
    $bytes.Length -eq 0 -or
    $bytes[0] -eq 0xef -or
    ($bytes | Where-Object { $_ -eq 13 -or $_ -gt 127 })
  ) {
    throw "$Label must be a non-empty BOM-free LF-only ASCII file"
  }
}

function Invoke-PinnedSpec {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SpecClass,

    [Parameter(Mandatory = $true)]
    [string[]]$SystemProperties,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $arguments = @(
    '-Xms1024m',
    '-Xmx4096m',
    '-Xss4M',
    "-Dsbt.version=$($toolchain.sbtVersion)",
    '-Dsbt.log.noformat=true',
    '-Dsbt.supershell=false',
    '-Dsbt.server.autostart=false'
  ) + $SystemProperties + @(
    '-jar',
    $sbtLauncherPath,
    "scJVM/Test/testOnly $SpecClass"
  )

  $savedErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(
      & $javaExe @arguments 2>&1 |
        ForEach-Object { $_.ToString() }
    )
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $savedErrorActionPreference
  }

  $output | ForEach-Object { Write-Output $_ }
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode"
  }
  if (-not ($output -match 'All tests passed')) {
    throw "$Label did not report a passing focused suite"
  }
}

$bridge = Resolve-RealDirectory -Path $BridgeRoot -Label 'bridge root'
$scriptBridge = Resolve-RealDirectory `
  -Path (Split-Path -Parent $PSScriptRoot) `
  -Label 'script bridge root'
if ($bridge -ne $scriptBridge) {
  throw 'bridge root must be the checkout containing this guarded launcher'
}

$sigma = Resolve-RealDirectory `
  -Path $SigmaStateCheckout `
  -Label 'SigmaState checkout'
$javaRoot = Resolve-RealDirectory -Path $JavaHome -Label 'Java home'
$javaExe = Resolve-RealFile `
  -Path (Join-Path $javaRoot 'bin/java.exe') `
  -Label 'Java executable'
$javaRelease = Resolve-RealFile `
  -Path (Join-Path $javaRoot 'release') `
  -Label 'Java release file'
$javaModules = Resolve-RealFile `
  -Path (Join-Path $javaRoot 'lib/modules') `
  -Label 'Java module image'
$jvmDll = Resolve-RealFile `
  -Path (Join-Path $javaRoot 'bin/server/jvm.dll') `
  -Label 'Java VM library'
$sbtLauncherPath = Resolve-RealFile `
  -Path $SbtLaunchJar `
  -Label 'sbt launcher JAR'
$nodeCommand = Get-Command `
  $NodeExecutable `
  -CommandType Application `
  -ErrorAction Stop
$nodeExe = Resolve-RealFile `
  -Path $nodeCommand.Source `
  -Label 'Node executable'
$gitCommand = @(
  Get-Command git.exe -CommandType Application -ErrorAction Stop
)[0]
$gitExe = Resolve-RealFile -Path $gitCommand.Source -Label 'Git executable'

$compilerSpecPath = Resolve-RealFile `
  -Path (Join-Path $bridge $CompilerSpecRelativePath) `
  -Label 'V4 tracker compiler spec'
$acceptanceSpecPath = Resolve-RealFile `
  -Path (Join-Path $bridge $AcceptanceSpecRelativePath) `
  -Label 'V4 tracker acceptance spec'
$contractSourcePath = Resolve-RealFile `
  -Path (Join-Path $bridge $ContractSourceRelativePath) `
  -Label 'V4 tracker source'
$statementVectorPath = Resolve-RealFile `
  -Path (Join-Path $bridge $StatementVectorRelativePath) `
  -Label 'V4 burn statement vector'
$contractFixturePath = Resolve-RealFile `
  -Path (Join-Path $bridge $ContractFixtureRelativePath) `
  -Label 'V4 tracker contract fixture'
$contextFixturePath = Resolve-RealFile `
  -Path (Join-Path $bridge $ContextFixtureRelativePath) `
  -Label 'V4 tracker context fixture'
$trackerBuilderPath = Resolve-RealFile `
  -Path (Join-Path $bridge $TrackerBuilderRelativePath) `
  -Label 'V4 tracker context builder'
$fixtureBuilderPath = Resolve-RealFile `
  -Path (Join-Path $bridge $FixtureBuilderRelativePath) `
  -Label 'V4 tracker fixture builder'
$fixtureScriptPath = Resolve-RealFile `
  -Path (Join-Path $bridge $FixtureScriptRelativePath) `
  -Label 'V4 tracker fixture script'
$toolchainLockPath = Resolve-RealFile `
  -Path (Join-Path $bridge $ToolchainLockRelativePath) `
  -Label 'pooled-reserve compiler toolchain lock'
$tsxCli = Resolve-RealFile `
  -Path (Join-Path $bridge 'relayer/node_modules/tsx/dist/cli.mjs') `
  -Label 'tsx CLI'

$reviewedFiles = @(
  @($compilerSpecPath, $ExpectedCompilerSpecSha256, 'compiler spec'),
  @($acceptanceSpecPath, $ExpectedAcceptanceSpecSha256, 'acceptance spec'),
  @($contractSourcePath, $ExpectedContractSourceSha256, 'contract source'),
  @($statementVectorPath, $ExpectedStatementVectorSha256, 'statement vector'),
  @($contractFixturePath, $ExpectedContractFixtureSha256, 'contract fixture'),
  @($contextFixturePath, $ExpectedContextFixtureSha256, 'context fixture'),
  @($trackerBuilderPath, $ExpectedTrackerBuilderSha256, 'tracker builder'),
  @($fixtureBuilderPath, $ExpectedFixtureBuilderSha256, 'fixture builder'),
  @($fixtureScriptPath, $ExpectedFixtureScriptSha256, 'fixture script')
)
foreach ($entry in $reviewedFiles) {
  Assert-ExactAsciiLfFile -Path $entry[0] -Label $entry[2]
  Assert-Hash -Path $entry[0] -Expected $entry[1] -Label $entry[2]
}

$toolchain = Get-Content -Raw -LiteralPath $toolchainLockPath |
  ConvertFrom-Json
if (
  $toolchain.schema -ne
    'e2s.validity-application-pooled-reserve-compiler-lock.v1' -or
  $toolchain.version -ne 1 -or
  $toolchain.sigmaStateCommit -ne $ExpectedSigmaStateCommit -or
  $toolchain.scalaVersion -ne '2.13.18' -or
  $toolchain.sbtVersion -ne '1.12.11' -or
  $toolchain.java.vendor -ne 'Microsoft' -or
  $toolchain.java.version -ne '17.0.19' -or
  $toolchain.java.runtimeVersion -ne '17.0.19+10-LTS'
) {
  throw 'pooled-reserve compiler toolchain lock identity is invalid'
}
Assert-Hash -Path (Join-Path $sigma 'build.sbt') `
  -Expected $toolchain.buildSbtSha256Hex `
  -Label 'SigmaState build.sbt'
Assert-Hash -Path (Join-Path $sigma 'project/build.properties') `
  -Expected $toolchain.buildPropertiesSha256Hex `
  -Label 'SigmaState build.properties'
Assert-Hash -Path $javaExe `
  -Expected $toolchain.java.javaExeSha256Hex `
  -Label 'Java executable'
Assert-Hash -Path $javaRelease `
  -Expected $toolchain.java.releaseSha256Hex `
  -Label 'Java release file'
Assert-Hash -Path $javaModules `
  -Expected $toolchain.java.modulesSha256Hex `
  -Label 'Java module image'
Assert-Hash -Path $jvmDll `
  -Expected $toolchain.java.jvmDllSha256Hex `
  -Label 'Java VM library'
Assert-Hash -Path $sbtLauncherPath `
  -Expected $toolchain.sbtLauncher.jarSha256Hex `
  -Label 'sbt launcher JAR'

$sigmaHead = (& $gitExe -C $sigma rev-parse 'HEAD^{commit}').Trim()
if ($LASTEXITCODE -ne 0 -or $sigmaHead -ne $ExpectedSigmaStateCommit) {
  throw 'SigmaState checkout is not at the reviewed commit'
}
$trackedSigmaStatus = @(
  & $gitExe -C $sigma status --porcelain=v1 --untracked-files=no
)
if ($LASTEXITCODE -ne 0 -or $trackedSigmaStatus.Count -ne 0) {
  throw 'SigmaState checkout has tracked changes'
}
$nodeVersion = (& $nodeExe --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(22|23|24)\.') {
  throw 'Node 22.x-24.x is required for acceptance fixture generation'
}

foreach ($name in @(
  'JAVA_TOOL_OPTIONS',
  'JDK_JAVA_OPTIONS',
  '_JAVA_OPTIONS',
  'SBT_OPTS',
  'SBT_CREDENTIALS',
  'SBT_GLOBAL_BASE',
  'SBT_BOOT',
  'SBT_IVY_HOME',
  'COURSIER_REPOSITORIES',
  'IVY_HOME',
  'CLASSPATH'
)) {
  if (-not [string]::IsNullOrEmpty(
    [Environment]::GetEnvironmentVariable($name)
  )) {
    throw "acceptance environment must not define $name"
  }
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$runRoot = Join-Path `
  $tempRoot `
  ('bridge-pooled-reserve-burn-tracker-v4-' +
    [Guid]::NewGuid().ToString('N'))
$temporaryWorktree = Join-Path $runRoot 'sigmastate'
$generatedContractFixture = Join-Path $runRoot 'contract.json'
$generatedContextFixture = Join-Path $runRoot 'context.json'
$worktreeAdded = $false
$removeExitCode = 0

try {
  New-Item -ItemType Directory -Path $runRoot | Out-Null

  $savedErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $worktreeOutput = @(
      & $gitExe -C $sigma worktree add `
        --detach `
        $temporaryWorktree `
        $ExpectedSigmaStateCommit 2>&1 |
        ForEach-Object { $_.ToString() }
    )
    $worktreeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $savedErrorActionPreference
  }
  if ($worktreeExitCode -ne 0) {
    throw "failed to create SigmaState worktree: $($worktreeOutput -join [Environment]::NewLine)"
  }
  $worktreeAdded = $true

  $compilerDestination = Join-Path `
    $temporaryWorktree `
    $CompilerSpecDestination
  $acceptanceDestination = Join-Path `
    $temporaryWorktree `
    $AcceptanceSpecDestination
  New-Item `
    -ItemType Directory `
    -Path (Split-Path -Parent $compilerDestination) `
    -Force | Out-Null
  Copy-Item -LiteralPath $compilerSpecPath -Destination $compilerDestination
  Copy-Item -LiteralPath $acceptanceSpecPath -Destination $acceptanceDestination
  Assert-Hash -Path $compilerDestination `
    -Expected $ExpectedCompilerSpecSha256 `
    -Label 'copied compiler spec'
  Assert-Hash -Path $acceptanceDestination `
    -Expected $ExpectedAcceptanceSpecSha256 `
    -Label 'copied acceptance spec'

  $savedJavaHome = $env:JAVA_HOME
  $savedPath = $env:PATH
  $env:JAVA_HOME = $javaRoot
  $env:PATH = (Join-Path $javaRoot 'bin') + ';' + $savedPath
  Push-Location $temporaryWorktree
  try {
    Invoke-PinnedSpec `
      -SpecClass $CompilerSpecClass `
      -SystemProperties @(
        "-Dbridge.eip0045.pooled.reserve.burn.tracker.root=$bridge",
        "-Dbridge.eip0045.pooled.reserve.burn.tracker.identity.out=$generatedContractFixture"
      ) `
      -Label 'pinned V4 tracker compiler'

    $generatedContractFixture = Resolve-RealFile `
      -Path $generatedContractFixture `
      -Label 'generated V4 tracker contract fixture'
    Assert-ExactAsciiLfFile `
      -Path $generatedContractFixture `
      -Label 'generated V4 tracker contract fixture'
    Assert-Hash `
      -Path $generatedContractFixture `
      -Expected $ExpectedContractFixtureSha256 `
      -Label 'generated V4 tracker contract fixture'

    Push-Location (Join-Path $bridge 'relayer')
    try {
      $savedErrorActionPreference = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      try {
        $fixtureOutput = @(
          & $nodeExe `
            $tsxCli `
            $fixtureScriptPath `
            --output `
            $generatedContextFixture 2>&1 |
            ForEach-Object { $_.ToString() }
        )
        $fixtureExitCode = $LASTEXITCODE
      } finally {
        $ErrorActionPreference = $savedErrorActionPreference
      }
    } finally {
      Pop-Location
    }
    $fixtureOutput | ForEach-Object { Write-Output $_ }
    if ($fixtureExitCode -ne 0) {
      throw "V4 tracker context generation failed with exit code $fixtureExitCode"
    }
    $generatedContextFixture = Resolve-RealFile `
      -Path $generatedContextFixture `
      -Label 'generated V4 tracker context fixture'
    Assert-ExactAsciiLfFile `
      -Path $generatedContextFixture `
      -Label 'generated V4 tracker context fixture'
    Assert-Hash `
      -Path $generatedContextFixture `
      -Expected $ExpectedContextFixtureSha256 `
      -Label 'generated V4 tracker context fixture'

    Invoke-PinnedSpec `
      -SpecClass $AcceptanceSpecClass `
      -SystemProperties @(
        "-Dbridge.eip0045.pooled.reserve.burn.tracker.fixture=$generatedContextFixture"
      ) `
      -Label 'pinned V4 tracker acceptance'
  } finally {
    Pop-Location
    $env:JAVA_HOME = $savedJavaHome
    $env:PATH = $savedPath
  }

  Write-Output "contract_fixture_sha256=$ExpectedContractFixtureSha256"
  Write-Output "context_fixture_sha256=$ExpectedContextFixtureSha256"
  Write-Output 'profile_activated=false'
  Write-Output 'node_check_performed=false'
  Write-Output 'funds_authority_established=false'
  Write-Output 'gate5_closed=false'
} finally {
  if ($worktreeAdded) {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & $gitExe -C $sigma worktree remove --force $temporaryWorktree `
        2>&1 | Out-Null
      $removeExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $savedErrorActionPreference
    }
  }
  $resolvedRunRoot = [IO.Path]::GetFullPath($runRoot)
  if (
    $resolvedRunRoot.StartsWith(
      $tempRoot,
      [StringComparison]::OrdinalIgnoreCase)
  ) {
    try {
      $extendedRunRoot = '\\?\' + $resolvedRunRoot
      if ([IO.Directory]::Exists($extendedRunRoot)) {
        [IO.Directory]::Delete($extendedRunRoot, $true)
      }
    } catch [IO.DirectoryNotFoundException] {
      # Worktree cleanup may already have removed the last child.
    } catch {
      Write-Warning "failed to remove acceptance run directory $runRoot"
    }
  }
  & $gitExe -C $sigma worktree prune 2>&1 | Out-Null
  if (
    $worktreeAdded -and
    $removeExitCode -ne 0 -and
    [IO.Directory]::Exists($resolvedRunRoot)
  ) {
    Write-Warning "failed to remove acceptance worktree $temporaryWorktree"
  }
}
