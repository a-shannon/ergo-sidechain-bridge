[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SigmaStateCheckout,

  [Parameter(Mandatory = $true)]
  [string]$BridgeRoot,

  [Parameter(Mandatory = $true)]
  [string]$JavaHome,

  [Parameter(Mandatory = $true)]
  [string]$SbtLaunchJar
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedSigmaStateCommit = 'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ExpectedSpecSha256 =
  'bda4ab5c8c44c213c2775393fab39b61d2a8a0d49801e3e7aad0bba7a69433af'
$LockSchema =
  'e2s.validity-application-pooled-reserve-compiler-lock.v1'
$SpecRelativePath =
  'validity-proof/consumer-jvm/BridgeValidityApplicationPooledReserveDepositAcceptanceSpec.scala'
$LockRelativePath =
  'validity-proof/consumer-jvm/validity-application-pooled-reserve-compiler-lock-v1.json'
$ReceiptRelativePath =
  'relayer/test-vectors/validity-application-pooled-reserve-compiler-v4.json'
$SpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgeValidityApplicationPooledReserveDepositAcceptanceSpec.scala'
$SpecClass =
  'sigma.bridge.BridgeValidityApplicationPooledReserveDepositAcceptanceSpec'

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

function Assert-ExactKeys {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [string[]]$Expected,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($null -eq $Value) {
    throw "$Label must be an object"
  }
  $actual = @($Value.PSObject.Properties.Name | Sort-Object)
  $expectedSorted = @($Expected | Sort-Object)
  if (
    $actual.Count -ne $expectedSorted.Count -or
    (Compare-Object $actual $expectedSorted)
  ) {
    throw "$Label has an unexpected field set"
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

$specPath = Resolve-RealFile `
  -Path (Join-Path $bridge $SpecRelativePath) `
  -Label 'pooled-reserve deposit acceptance spec'
$lockPath = Resolve-RealFile `
  -Path (Join-Path $bridge $LockRelativePath) `
  -Label 'pooled-reserve compiler lock'
$receiptPath = Resolve-RealFile `
  -Path (Join-Path $bridge $ReceiptRelativePath) `
  -Label 'pooled-reserve compiler receipt'
Assert-ExactAsciiLfFile -Path $specPath -Label 'acceptance spec'
Assert-ExactAsciiLfFile -Path $lockPath -Label 'compiler lock'
Assert-ExactAsciiLfFile -Path $receiptPath -Label 'compiler receipt'
Assert-Hash `
  -Path $specPath `
  -Expected $ExpectedSpecSha256 `
  -Label 'pooled-reserve deposit acceptance spec'

$lock = Get-Content -Raw -LiteralPath $lockPath | ConvertFrom-Json
Assert-ExactKeys -Value $lock -Expected @(
  'schema',
  'version',
  'sigmaStateCommit',
  'scalaVersion',
  'sbtVersion',
  'buildSbtSha256Hex',
  'buildPropertiesSha256Hex',
  'compilerSpecSha256Hex',
  'compilerReceiptSha256Hex',
  'java',
  'sbtLauncher',
  'templates',
  'boundaries'
) -Label 'compiler lock'
Assert-ExactKeys -Value $lock.java -Expected @(
  'vendor',
  'version',
  'runtimeVersion',
  'javaExeSha256Hex',
  'releaseSha256Hex',
  'modulesSha256Hex',
  'jvmDllSha256Hex'
) -Label 'compiler Java lock'
Assert-ExactKeys -Value $lock.sbtLauncher -Expected @(
  'version',
  'jarSha256Hex'
) -Label 'compiler sbt launcher lock'
if (
  $lock.schema -ne $LockSchema -or
  $lock.version -ne 1 -or
  $lock.sigmaStateCommit -ne $ExpectedSigmaStateCommit -or
  $lock.scalaVersion -ne '2.13.18' -or
  $lock.sbtVersion -ne '1.12.11' -or
  $lock.sbtLauncher.version -ne $lock.sbtVersion -or
  $lock.java.vendor -ne 'Microsoft' -or
  $lock.java.version -ne '17.0.19' -or
  $lock.java.runtimeVersion -ne '17.0.19+10-LTS'
) {
  throw 'pooled-reserve compiler lock identity is invalid'
}

Assert-Hash `
  -Path $receiptPath `
  -Expected $lock.compilerReceiptSha256Hex `
  -Label 'pooled-reserve compiler receipt'
Assert-Hash `
  -Path (Join-Path $sigma 'build.sbt') `
  -Expected $lock.buildSbtSha256Hex `
  -Label 'SigmaState build.sbt'
Assert-Hash `
  -Path (Join-Path $sigma 'project/build.properties') `
  -Expected $lock.buildPropertiesSha256Hex `
  -Label 'SigmaState build.properties'
Assert-Hash `
  -Path $javaExe `
  -Expected $lock.java.javaExeSha256Hex `
  -Label 'Java executable'
Assert-Hash `
  -Path $javaRelease `
  -Expected $lock.java.releaseSha256Hex `
  -Label 'Java release file'
Assert-Hash `
  -Path $javaModules `
  -Expected $lock.java.modulesSha256Hex `
  -Label 'Java module image'
Assert-Hash `
  -Path $jvmDll `
  -Expected $lock.java.jvmDllSha256Hex `
  -Label 'Java VM library'
Assert-Hash `
  -Path $sbtLauncher `
  -Expected $lock.sbtLauncher.jarSha256Hex `
  -Label 'sbt launcher JAR'

$head = (& git -C $sigma rev-parse 'HEAD^{commit}').Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSigmaStateCommit) {
  throw 'SigmaState checkout is not at the reviewed commit'
}
$status = @(& git -C $sigma status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) {
  throw 'SigmaState checkout must be clean before focused acceptance'
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

$temporaryWorktree = Join-Path `
  ([IO.Path]::GetTempPath()) `
  ("bridge-pooled-reserve-deposit-acceptance-" +
    [Guid]::NewGuid().ToString('N'))
$worktreeAdded = $false

try {
  $savedErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $worktreeOutput = @(
      & git -C $sigma worktree add `
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
  if ((Get-Sha256Hex -Path $destination) -ne (Get-Sha256Hex -Path $specPath)) {
    throw 'copied acceptance spec differs from the reviewed checkout file'
  }

  $savedJavaHome = $env:JAVA_HOME
  $savedPath = $env:PATH
  $env:JAVA_HOME = $javaRoot
  $env:PATH = (Join-Path $javaRoot 'bin') + ';' + $savedPath
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
          "-Dsbt.version=$($lock.sbtVersion)" `
          '-Dsbt.log.noformat=true' `
          '-Dsbt.supershell=false' `
          "-Dbridge.validity.application.pooled.reserve.deposit.root=$bridge" `
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
  }

  $acceptanceOutput | ForEach-Object { Write-Output $_ }
  if ($acceptanceExitCode -ne 0) {
    throw "pinned deposit acceptance failed with exit code $acceptanceExitCode"
  }
  if (-not ($acceptanceOutput -match "welcome to sbt $($lock.sbtVersion)")) {
    throw 'pinned deposit acceptance did not report the reviewed sbt version'
  }
  if (-not ($acceptanceOutput -match 'All tests passed')) {
    throw 'pinned deposit acceptance did not report a passing focused suite'
  }

  Write-Output "acceptance_spec_sha256=$(Get-Sha256Hex -Path $specPath)"
} finally {
  if ($worktreeAdded) {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & git -C $sigma worktree remove --force $temporaryWorktree `
        2>&1 | Out-Null
      $removeExitCode = $LASTEXITCODE
      & git -C $sigma worktree prune 2>&1 | Out-Null
    } finally {
      $ErrorActionPreference = $savedErrorActionPreference
    }
    if ($removeExitCode -ne 0) {
      Write-Warning "failed to remove acceptance worktree $temporaryWorktree"
    }
  }
}
