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

  [string]$NodeExecutable = 'node.exe',

  [string]$GitExecutable = 'git.exe'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedSigmaStateCommit = 'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ExpectedSbtVersion = '1.12.11'
$ExpectedNodeVersion = 'v24.14.0'
$ExpectedFixtureSha256 =
  '6f80dfa25f88851a3e91a38a6a8a6a8b3e9a6961f775f9e18e4ff2133d0c13d3'
$ExpectedSigmaBuildSha256 =
  'e381716ac80820f5d27ace5bba1ad024276190f40748eefd31785d79ac193c10'
$ExpectedSigmaBuildPropertiesSha256 =
  '439d984e46d776c13354b1635863583166689ba6e9ebcc703b1d89005d9d37a8'
$ExpectedJavaExeSha256 =
  '69ae5108b20bb132442ebe756a41e67f9b33b65b7ae6dc2a87b3b04947bab19e'
$ExpectedJavaReleaseSha256 =
  'eff38e2902ff93a11a0ac9b1648d4731b50f221c6fb5c7671181b32b951ffac2'
$ExpectedJavaModulesSha256 =
  '0d7c008e7ac37ab7c5231cc96d7239abaa9538a8c94e64bba27fb36fcbacb090'
$ExpectedJvmDllSha256 =
  '960ba3065f0ce142840aa332338bce23e1d371dedafa957fd9b405f19f272b54'
$ExpectedSbtLauncherSha256 =
  'b4c0c55d68f11b1510d884641cb1b1456191dac40ddc958bf86c825adc344e16'
$ExpectedNodeExeSha256 =
  '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088'
$ExpectedTsxCliSha256 =
  '0ef1d6f8dee95174853c479fb4d9ffdcebf755125a0b477a1236bac331ccf9d5'
$SpecRelativePath =
  'validity-proof/consumer-jvm/BridgeSubstrateFederatedBurnSettlementV1AcceptanceSpec.scala'
$FixtureScriptRelativePath =
  'relayer/src/scripts/build-substrate-federated-burn-settlement-v1-jvm-fixture.ts'
$SpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgeSubstrateFederatedBurnSettlementV1AcceptanceSpec.scala'
$SpecClass =
  'sigma.bridge.BridgeSubstrateFederatedBurnSettlementV1AcceptanceSpec'
$ExpectedInputs = [ordered]@{
  $SpecRelativePath =
    '24c176760baa4e7411d7f01d2996153d0d4afb09b721d870738405ed7c416a84'
  'relayer/src/substrate-federated-burn-settlement-v1-acceptance-fixture.ts' =
    '42f4fa2220fc5d339ce2883c72b56651c802dc8b639284a8eabdebdc29f6aa02'
  $FixtureScriptRelativePath =
    'deef3879fa8ede4cf8b18fe8c223417fd35e007abbc0be980ada7e43a21097dc'
  'relayer/src/substrate-federated-burn-settlement-v1.ts' =
    '7e8b4b47632fa6892b2d26d889a09d453236fc4c78ced23b3a7543151d905e7c'
  'relayer/src/substrate-federated-burn-settlement-v1-fixture.ts' =
    'd0675da9b0d40c2408f305681b0820887185e2eccf10405d22bf503b37cc9a1c'
  'relayer/src/substrate-federated-settlement-family-v1.ts' =
    '3089e07bd643cd0c01ff8b72cd42f812c3be9e8ebc572f936d43e0f36fde49a5'
  'relayer/src/substrate-federated-settlement-family-v1-fixture.ts' =
    'c13086e29815ec357c39470eb75779775a6cf1fc6711903f68ecd9435c5fb7fa'
  'relayer/src/substrate-federated-tracker-v1.ts' =
    '30fd6131773da0ea36f3e738673f6deaa26962fd4396a66b01236ccced56f02b'
  'relayer/src/profiles/substrate-federated-v1/checkpoint-statement.ts' =
    '71f7194f2a49452453d163b94af0235e7732f0ed02c3d9d44c020f6a4d88de91'
  'relayer/src/profiles/substrate-federated-v1/tracker-admission.ts' =
    'c5cf6a106f15ebd05ac976e22b6e5b41191f0b3f8ca34b0a69e64d35f9211af8'
  'relayer/src/trustless-burn-proof.ts' =
    '5c45ae76be1003cada09816200c938621fdbf40eda824dda5f928a0188cfece2'
  'relayer/src/unsigned-ergo-transaction.ts' =
    'dc0c7c6705ad17096ab0d822f1a0277bbeb961c6167c9f1f186706d18ec9ec09'
  'relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json' =
    '8a6fa2b2acba330f92718389fc401cc7f15f67602282d949958cc072406fa20e'
}

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
  if (
    $item.PSIsContainer -or
    (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
  ) {
    throw "$Label must be a real file"
  }
  $bytes = [IO.File]::ReadAllBytes($item.FullName)
  if (
    $bytes.Length -eq 0 -or
    $bytes[0] -eq 0xef -or
    ($bytes | Where-Object { $_ -eq 13 -or $_ -gt 127 })
  ) {
    throw "$Label must be non-empty BOM-free LF-only ASCII"
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
$sbtLauncher = Resolve-RealFile `
  -Path $SbtLaunchJar `
  -Label 'sbt launcher JAR'
$nodeCommand = @(Get-Command `
  $NodeExecutable `
  -CommandType Application `
  -ErrorAction Stop)[0]
$nodeExe = Resolve-RealFile -Path $nodeCommand.Source -Label 'Node executable'
$gitCommand = @(Get-Command `
  $GitExecutable `
  -CommandType Application `
  -ErrorAction Stop)[0]
$gitExe = Resolve-RealFile -Path $gitCommand.Source -Label 'Git executable'

$resolvedInputs = @{}
foreach ($entry in $ExpectedInputs.GetEnumerator()) {
  $path = Resolve-RealFile `
    -Path (Join-Path $bridge $entry.Key) `
    -Label $entry.Key
  Assert-ExactAsciiLfFile -Path $path -Label $entry.Key
  Assert-Hash -Path $path -Expected $entry.Value -Label $entry.Key
  $resolvedInputs[$entry.Key] = $path
}
$specPath = $resolvedInputs[$SpecRelativePath]
$fixtureScriptPath = $resolvedInputs[$FixtureScriptRelativePath]
$tsxCli = Resolve-RealFile `
  -Path (Join-Path $bridge 'relayer/node_modules/tsx/dist/cli.mjs') `
  -Label 'tsx CLI'
Assert-Hash -Path $nodeExe -Expected $ExpectedNodeExeSha256 `
  -Label 'Node executable'
Assert-Hash -Path $tsxCli -Expected $ExpectedTsxCliSha256 `
  -Label 'tsx CLI'
Assert-Hash -Path (Join-Path $sigma 'build.sbt') `
  -Expected $ExpectedSigmaBuildSha256 -Label 'SigmaState build.sbt'
Assert-Hash -Path (Join-Path $sigma 'project/build.properties') `
  -Expected $ExpectedSigmaBuildPropertiesSha256 `
  -Label 'SigmaState build.properties'
Assert-Hash -Path $javaExe -Expected $ExpectedJavaExeSha256 `
  -Label 'Java executable'
Assert-Hash -Path $javaRelease -Expected $ExpectedJavaReleaseSha256 `
  -Label 'Java release file'
Assert-Hash -Path $javaModules -Expected $ExpectedJavaModulesSha256 `
  -Label 'Java module image'
Assert-Hash -Path $jvmDll -Expected $ExpectedJvmDllSha256 `
  -Label 'Java VM library'
Assert-Hash -Path $sbtLauncher -Expected $ExpectedSbtLauncherSha256 `
  -Label 'sbt launcher JAR'

$head = (& $gitExe -C $sigma rev-parse 'HEAD^{commit}').Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSigmaStateCommit) {
  throw 'SigmaState checkout is not at the reviewed commit'
}
$status = @(& $gitExe -C $sigma status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) {
  throw 'SigmaState checkout must be clean before focused acceptance'
}

$nodeVersion = (& $nodeExe --version).Trim()
if (
  $LASTEXITCODE -ne 0 -or
  $nodeVersion -cne $ExpectedNodeVersion
) {
  throw 'Node executable does not report the reviewed exact version'
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
  'COURSIER_CACHE',
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
  ("bridge-substrate-federated-burn-v1-acceptance-" +
    [Guid]::NewGuid().ToString('N'))
$fixturePath = Join-Path $runRoot 'fixture.json'
$temporaryWorktree = Join-Path $runRoot 'sigmastate'
$isolatedUserHome = Join-Path $runRoot 'home'
$isolatedSbtGlobalBase = Join-Path $runRoot 'sbt-global'
$isolatedSbtBoot = Join-Path $runRoot 'sbt-boot'
$isolatedSbtIvyHome = Join-Path $runRoot 'ivy'
$isolatedCoursierCache = Join-Path $runRoot 'coursier-cache'
$worktreeAdded = $false

try {
  New-Item -ItemType Directory -Path $runRoot | Out-Null
  foreach ($directory in @(
    $isolatedUserHome,
    $isolatedSbtGlobalBase,
    $isolatedSbtBoot,
    $isolatedSbtIvyHome,
    $isolatedCoursierCache
  )) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }
  Push-Location (Join-Path $bridge 'relayer')
  try {
    $fixtureOutput = @(
      & $nodeExe $tsxCli $fixtureScriptPath --output $fixturePath 2>&1 |
      ForEach-Object { $_.ToString() }
    )
    $fixtureExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $fixtureOutput | ForEach-Object { Write-Output $_ }
  if ($fixtureExitCode -ne 0) {
    throw "fixture generation failed with exit code $fixtureExitCode"
  }
  $fixturePath = Resolve-RealFile `
    -Path $fixturePath `
    -Label 'generated burn settlement fixture'
  Assert-ExactAsciiLfFile `
    -Path $fixturePath `
    -Label 'generated burn settlement fixture'
  $reportedFixtureHash = @(
    $fixtureOutput |
    Where-Object { $_ -cmatch '^fixture_sha256=[0-9a-f]{64}$' } |
    ForEach-Object { $_.Substring('fixture_sha256='.Length) }
  )
  if (
    $reportedFixtureHash.Count -ne 1 -or
    (Get-Sha256Hex -Path $fixturePath) -ne $reportedFixtureHash[0] -or
    $reportedFixtureHash[0] -ne $ExpectedFixtureSha256
  ) {
    throw 'generated fixture SHA-256 differs from the reviewed fixture'
  }

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
    throw "failed to create acceptance worktree: $($worktreeOutput -join [Environment]::NewLine)"
  }
  $worktreeAdded = $true

  $destination = Join-Path $temporaryWorktree $SpecDestination
  New-Item `
    -ItemType Directory `
    -Path (Split-Path -Parent $destination) `
    -Force | Out-Null
  Copy-Item -LiteralPath $specPath -Destination $destination
  if (
    (Get-Sha256Hex -Path $destination) -ne
      $ExpectedInputs[$SpecRelativePath]
  ) {
    throw 'copied acceptance spec differs from the reviewed file'
  }

  $savedJavaHome = $env:JAVA_HOME
  $savedPath = $env:PATH
  $savedCoursierCache = $env:COURSIER_CACHE
  $env:JAVA_HOME = $javaRoot
  $env:PATH = (Join-Path $javaRoot 'bin') + ';' + $savedPath
  $env:COURSIER_CACHE = $isolatedCoursierCache
  Push-Location $temporaryWorktree
  try {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $acceptanceOutput = @(
        & $javaExe `
          '-Xms1024m' `
          '-Xmx4096m' `
          '-Xss4M' `
          "-Duser.home=$isolatedUserHome" `
          "-Dsbt.global.base=$isolatedSbtGlobalBase" `
          "-Dsbt.boot.directory=$isolatedSbtBoot" `
          "-Dsbt.ivy.home=$isolatedSbtIvyHome" `
          "-Dcoursier.cache=$isolatedCoursierCache" `
          "-Dsbt.version=$ExpectedSbtVersion" `
          '-Dsbt.log.noformat=true' `
          '-Dsbt.supershell=false' `
          '-Dsbt.server.autostart=false' `
          "-Dbridge.substrate.federated.burn.v1.fixture=$fixturePath" `
          "-Dbridge.substrate.federated.burn.v1.fixture.sha256=$ExpectedFixtureSha256" `
          '-jar' `
          $sbtLauncher `
          "scJVM/Test/testOnly $SpecClass" `
          2>&1 |
          ForEach-Object { $_.ToString() }
      )
      $acceptanceExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $savedErrorActionPreference
    }
  } finally {
    Pop-Location
    $env:JAVA_HOME = $savedJavaHome
    $env:PATH = $savedPath
    $env:COURSIER_CACHE = $savedCoursierCache
  }

  $acceptanceOutput | ForEach-Object { Write-Output $_ }
  if ($acceptanceExitCode -ne 0) {
    throw "pinned burn settlement acceptance failed with exit code $acceptanceExitCode"
  }
  if (-not ($acceptanceOutput -match "welcome to sbt $ExpectedSbtVersion")) {
    throw 'pinned acceptance did not report the reviewed sbt version'
  }
  if (-not ($acceptanceOutput -match 'All tests passed')) {
    throw 'pinned acceptance did not report a passing focused suite'
  }

  Write-Output "acceptance_spec_sha256=$($ExpectedInputs[$SpecRelativePath])"
  Write-Output "acceptance_fixture_sha256=$ExpectedFixtureSha256"
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
    $resolvedRunRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)
  ) {
    try {
      $extendedRunRoot = '\\?\' + $resolvedRunRoot
      if ([IO.Directory]::Exists($extendedRunRoot)) {
        [IO.Directory]::Delete($extendedRunRoot, $true)
      }
    } catch [IO.DirectoryNotFoundException] {
      # The worktree cleanup may already have removed the last child.
    } catch {
      Write-Warning "failed to remove acceptance run directory $resolvedRunRoot"
    }
  }
  if ($worktreeAdded -and $removeExitCode -ne 0) {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & $gitExe -C $sigma worktree remove `
        --force `
        --force `
        $temporaryWorktree `
        2>&1 | Out-Null
      $removeExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $savedErrorActionPreference
    }
  }
  if ($worktreeAdded -and $removeExitCode -ne 0) {
    $registeredWorktrees = @(
      & $gitExe -C $sigma worktree list --porcelain 2>&1 |
      ForEach-Object { $_.ToString() }
    )
    $listExitCode = $LASTEXITCODE
    $targetWorktreeLine =
      'worktree ' + $temporaryWorktree.Replace('\', '/')
    if (
      $listExitCode -eq 0 -and
      -not ($registeredWorktrees -ccontains $targetWorktreeLine)
    ) {
      $removeExitCode = 0
    }
  }
  if (
    $worktreeAdded -and
    $removeExitCode -ne 0
  ) {
    Write-Warning "failed to remove acceptance worktree $temporaryWorktree"
  }
}
