[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ErgoCheckout,

  [Parameter(Mandatory = $true)]
  [string]$GitExecutable,

  [Parameter(Mandatory = $true)]
  [string]$JavaHome,

  [Parameter(Mandatory = $true)]
  [string]$SbtLaunchJar
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedErgoCommit = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1'
$ExpectedSbtVersion = '1.11.1'
$ExpectedGitLauncherSha256 =
  '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5'
$ExpectedGitRuntimeSha256 =
  'cab4c4eea1d869cf9f7be73868dc9a90ad2df1b1b673e5f8c8714a576c25ea96'
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
$ExpectedFixtureSha256 =
  '546a099f4344a206f4f194e8c1652ca7a943da5be3a29311518aea932e157bd4'
$ExpectedSpecSha256 =
  '8a1cc0608116921bc4a23f76e360001a868a909546e4b6753a660447d28e29c0'
$ResultPrefix = 'E2S_ERGO_AUTOLYKOS_V2_SPV_JVM_DIFFERENTIAL='

function Resolve-ExactFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
  if (-not [System.IO.File]::Exists($resolved)) {
    throw "$Label is not a regular file"
  }
  return $resolved
}

function Resolve-ExactDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
  if (-not [System.IO.Directory]::Exists($resolved)) {
    throw "$Label is not a directory"
  }
  return $resolved
}

function Assert-Sha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Expected,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected) {
    throw "$Label SHA-256 mismatch: expected $Expected, got $actual"
  }
}

function Assert-SafeTemporaryDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $temporaryRoot = [System.IO.Path]::GetFullPath(
    [System.IO.Path]::GetTempPath()
  ).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar
  $resolved = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolved.StartsWith(
    $temporaryRoot,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw 'temporary run directory escaped the system temporary root'
  }
}

function Remove-SafeTemporaryDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  Assert-SafeTemporaryDirectory -Path $Path
  foreach ($attempt in 1..3) {
    if (-not (Test-Path -LiteralPath $Path)) {
      return
    }
    try {
      Remove-Item `
        -LiteralPath $Path `
        -Recurse `
        -Force `
        -ErrorAction Stop
      return
    } catch {
      if (-not (Test-Path -LiteralPath $Path)) {
        return
      }
      if ($attempt -eq 3) {
        $extendedPath = '\\?\' + [System.IO.Path]::GetFullPath($Path)
        [System.IO.Directory]::Delete($extendedPath, $true)
        if (Test-Path -LiteralPath $Path) {
          throw
        }
        return
      }
      Start-Sleep -Milliseconds 250
    }
  }
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridgeRoot = Resolve-ExactDirectory -Path (Join-Path $scriptDirectory '..') -Label 'bridge root'
$fixture = Resolve-ExactFile -Path (Join-Path $bridgeRoot 'relayer/test-vectors/ergo-autolykos-v2-spv-jvm-differential-v1.json') -Label 'SPV differential fixture'
$spec = Resolve-ExactFile -Path (Join-Path $bridgeRoot 'validity-proof/consumer-jvm/ErgoAutolykosV2SpvDifferentialSpec.scala') -Label 'SPV differential JVM spec'
$sourceCheckout = Resolve-ExactDirectory -Path $ErgoCheckout -Label 'Ergo source checkout'
$git = Resolve-ExactFile -Path $GitExecutable -Label 'pinned Git launcher'
$gitRoot = Split-Path -Parent (Split-Path -Parent $git)
$gitRuntime = Resolve-ExactFile `
  -Path (Join-Path $gitRoot 'mingw64/bin/git.exe') `
  -Label 'pinned Git runtime'
$javaRoot = Resolve-ExactDirectory -Path $JavaHome -Label 'pinned Java home'
$java = Resolve-ExactFile `
  -Path (Join-Path $javaRoot 'bin/java.exe') `
  -Label 'pinned Java executable'
$javaRelease = Resolve-ExactFile `
  -Path (Join-Path $javaRoot 'release') `
  -Label 'pinned Java release file'
$javaModules = Resolve-ExactFile `
  -Path (Join-Path $javaRoot 'lib/modules') `
  -Label 'pinned Java module image'
$jvmDll = Resolve-ExactFile `
  -Path (Join-Path $javaRoot 'bin/server/jvm.dll') `
  -Label 'pinned JVM library'
$sbtLauncher = Resolve-ExactFile `
  -Path $SbtLaunchJar `
  -Label 'pinned sbt launcher'

Assert-Sha256 -Path $fixture -Expected $ExpectedFixtureSha256 -Label 'SPV differential fixture'
Assert-Sha256 -Path $spec -Expected $ExpectedSpecSha256 -Label 'SPV differential JVM spec'
Assert-Sha256 -Path $git -Expected $ExpectedGitLauncherSha256 -Label 'pinned Git launcher'
Assert-Sha256 -Path $gitRuntime -Expected $ExpectedGitRuntimeSha256 -Label 'pinned Git runtime'
Assert-Sha256 -Path $java -Expected $ExpectedJavaExeSha256 -Label 'pinned Java executable'
Assert-Sha256 -Path $javaRelease -Expected $ExpectedJavaReleaseSha256 -Label 'pinned Java release file'
Assert-Sha256 -Path $javaModules -Expected $ExpectedJavaModulesSha256 -Label 'pinned Java module image'
Assert-Sha256 -Path $jvmDll -Expected $ExpectedJvmDllSha256 -Label 'pinned JVM library'
Assert-Sha256 -Path $sbtLauncher -Expected $ExpectedSbtLauncherSha256 -Label 'pinned sbt launcher'

foreach ($name in @(
  'JAVA_TOOL_OPTIONS',
  'JDK_JAVA_OPTIONS',
  '_JAVA_OPTIONS',
  'JAVA_OPTS',
  'SBT_OPTS',
  'COURSIER_REPOSITORIES'
)) {
  if (-not [string]::IsNullOrEmpty(
    [System.Environment]::GetEnvironmentVariable($name)
  )) {
    throw "JVM differential environment must not define $name"
  }
}
$gitConfigInjection = @(
  Get-ChildItem Env: | Where-Object {
    $_.Name -match '^GIT_CONFIG_(COUNT|KEY_[0-9]+|VALUE_[0-9]+)$'
  }
)
if ($gitConfigInjection.Count -ne 0) {
  throw 'JVM differential environment must not inject Git configuration'
}

$sourceCommit = (& $git -C $sourceCheckout rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -ne $ExpectedErgoCommit) {
  throw "Ergo checkout must resolve to exact commit $ExpectedErgoCommit"
}
& $git -C $sourceCheckout cat-file -e "$ExpectedErgoCommit^{commit}"
if ($LASTEXITCODE -ne 0) {
  throw 'Ergo checkout does not contain the pinned commit object'
}

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$javaVersion = (& $java -version 2>&1 | Out-String)
$javaExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($javaExitCode -ne 0 -or $javaVersion -notmatch 'version "17\.') {
  throw 'Ergo SPV JVM differential requires Java 17'
}

$runRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  'bridge-ergo-spv-jvm-' + [System.Guid]::NewGuid().ToString('N')
)
Assert-SafeTemporaryDirectory -Path $runRoot
New-Item -ItemType Directory -Path $runRoot -ErrorAction Stop | Out-Null
$clone = Join-Path $runRoot 'ergo'
$isolatedUserHome = Join-Path $runRoot 'home'
$isolatedSbtGlobalBase = Join-Path $runRoot 'sbt-global'
$isolatedSbtBoot = Join-Path $runRoot 'sbt-boot'
$isolatedSbtIvyHome = Join-Path $runRoot 'ivy'
$isolatedCoursierCache = Join-Path $runRoot 'coursier'
$isolatedGitConfig = Join-Path $runRoot 'gitconfig'

foreach ($directory in @(
  $isolatedUserHome,
  $isolatedSbtGlobalBase,
  $isolatedSbtBoot,
  $isolatedSbtIvyHome,
  $isolatedCoursierCache
)) {
  New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
}
New-Item -ItemType File -Path $isolatedGitConfig -ErrorAction Stop | Out-Null

$savedJavaHome = $env:JAVA_HOME
$savedPath = $env:PATH
$savedCoursierCache = $env:COURSIER_CACHE
$savedHome = $env:HOME
$savedUserProfile = $env:USERPROFILE
$savedGitConfigGlobal = $env:GIT_CONFIG_GLOBAL
$savedGitConfigNoSystem = $env:GIT_CONFIG_NOSYSTEM
$env:JAVA_HOME = $javaRoot
$env:PATH = @(
  (Join-Path $javaRoot 'bin'),
  (Split-Path -Parent $git),
  (Join-Path $env:SystemRoot 'System32'),
  $env:SystemRoot
) -join ';'
$env:COURSIER_CACHE = $isolatedCoursierCache
$env:HOME = $isolatedUserHome
$env:USERPROFILE = $isolatedUserHome
$env:GIT_CONFIG_GLOBAL = $isolatedGitConfig
$env:GIT_CONFIG_NOSYSTEM = '1'

try {
  & $git clone --quiet --no-checkout --local `
    -c core.autocrlf=false `
    -c core.eol=lf `
    $sourceCheckout `
    $clone
  if ($LASTEXITCODE -ne 0) {
    throw 'failed to create the isolated Ergo source clone'
  }
  & $git -C $clone checkout --quiet --detach $ExpectedErgoCommit
  if ($LASTEXITCODE -ne 0) {
    throw 'failed to check out the pinned Ergo source commit'
  }
  $cloneCommit = (& $git -C $clone rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $cloneCommit -ne $ExpectedErgoCommit) {
    throw 'isolated Ergo source clone changed the pinned commit'
  }
  $buildProperties = Get-Content -LiteralPath (
    Join-Path $clone 'project/build.properties'
  ) -Raw
  if ($buildProperties.Trim() -ne "sbt.version=$ExpectedSbtVersion") {
    throw "pinned Ergo source must select sbt $ExpectedSbtVersion"
  }

  $destination = Join-Path $clone 'ergo-core/src/test/scala/org/ergoplatform/mining/bridge'
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  $copiedSpec = Join-Path $destination 'ErgoAutolykosV2SpvDifferentialSpec.scala'
  Copy-Item -LiteralPath $spec -Destination $copiedSpec -ErrorAction Stop
  Assert-Sha256 -Path $copiedSpec -Expected $ExpectedSpecSha256 -Label 'copied SPV differential JVM spec'

  $javaArguments = @(
    '-Xms1024m',
    '-Xmx4096m',
    '-Xss4M',
    "-Duser.home=$isolatedUserHome",
    "-Dsbt.global.base=$isolatedSbtGlobalBase",
    "-Dsbt.boot.directory=$isolatedSbtBoot",
    "-Dsbt.ivy.home=$isolatedSbtIvyHome",
    "-Dcoursier.cache=$isolatedCoursierCache",
    "-Dsbt.version=$ExpectedSbtVersion",
    '-Dsbt.log.noformat=true',
    '-Dsbt.supershell=false',
    '-Dsbt.server.autostart=false',
    "-Dbridge.ergo.spv.jvm.fixture=$fixture",
    "-Dbridge.ergo.spv.jvm.fixture.sha256=$ExpectedFixtureSha256",
    "-Dbridge.ergo.spv.jvm.ergo.commit=$ExpectedErgoCommit",
    '-jar',
    $sbtLauncher,
    'ergoCore/Test/testOnly org.ergoplatform.mining.bridge.ErgoAutolykosV2SpvDifferentialSpec'
  )

  Push-Location $clone
  try {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $output = & $java @javaArguments 2>&1
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $savedErrorActionPreference
    }
  } finally {
    Pop-Location
  }
  $rendered = $output | Out-String
  Write-Output $rendered.TrimEnd()
  if ($exitCode -ne 0) {
    throw "pinned Ergo SPV JVM differential failed with exit code $exitCode"
  }
  if ($rendered -notmatch [regex]::Escape($ResultPrefix)) {
    throw 'pinned Ergo SPV JVM differential did not emit its exact result'
  }
  if ($rendered -notmatch "welcome to sbt $ExpectedSbtVersion") {
    throw "pinned Ergo SPV JVM differential did not use sbt $ExpectedSbtVersion"
  }
  if ($rendered -notmatch 'All tests passed') {
    throw 'pinned Ergo SPV JVM differential did not report a passing suite'
  }
} finally {
  $env:JAVA_HOME = $savedJavaHome
  $env:PATH = $savedPath
  $env:COURSIER_CACHE = $savedCoursierCache
  $env:HOME = $savedHome
  $env:USERPROFILE = $savedUserProfile
  $env:GIT_CONFIG_GLOBAL = $savedGitConfigGlobal
  $env:GIT_CONFIG_NOSYSTEM = $savedGitConfigNoSystem
  if (Test-Path -LiteralPath $runRoot) {
    Remove-SafeTemporaryDirectory -Path $runRoot
  }
}
