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
$ExpectedVectorSha256 =
  '75d250b999163fdbdc780665edec5d42a241c104d53ec66c6c25227ff651be52'
$ExpectedSpecSha256 =
  '56391961c5a2959ab1e27f9a2c5a6cbd3893a5dd1105d176df473bc39d1a6ea6'
$ExpectedScryptoSha256 =
  '79838cdcedc62936acb11583946cad635b9f42fa967d39bb103742b9b6302944'
$ExpectedScryptoName = 'scrypto_2.12-3.0.0.jar'
$ResultPrefix = 'E2S_ERGO_UTXO_STATE_PROOF_JVM_DIFFERENTIAL='

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

function Assert-LowerHex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $true)]
    [int]$Bytes,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($Value.Length -ne ($Bytes * 2) -or $Value -cnotmatch '^[0-9a-f]+$') {
    throw "$Label must be exactly $Bytes bytes of lowercase base16"
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
  foreach ($attempt in 1..10) {
    if (-not (Test-Path -LiteralPath $Path)) {
      return
    }
    Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { -not $_.PSIsContainer -and $_.IsReadOnly } |
      ForEach-Object { $_.IsReadOnly = $false }
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $Path)) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  $extendedPath = '\\?\' + [System.IO.Path]::GetFullPath($Path)
  [System.IO.Directory]::Delete($extendedPath, $true)
  if (Test-Path -LiteralPath $Path) {
    throw "failed to remove temporary run directory after 10 attempts: $Path"
  }
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridgeRoot = Resolve-ExactDirectory -Path (Join-Path $scriptDirectory '..') -Label 'bridge root'
$vectorPath = Resolve-ExactFile `
  -Path (Join-Path $bridgeRoot 'wasm-avl/test-vectors/ergo-utxo-state-lookup-v1.json') `
  -Label 'Ergo UTXO state-proof vector'
$specPath = Resolve-ExactFile `
  -Path (Join-Path $bridgeRoot 'validity-proof/consumer-jvm/BridgeUtxoStateProofDifferentialSpec.scala') `
  -Label 'Ergo UTXO state-proof JVM spec'
$sourceCheckout = Resolve-ExactDirectory -Path $ErgoCheckout -Label 'Ergo source checkout'
$git = Resolve-ExactFile -Path $GitExecutable -Label 'pinned Git launcher'
$gitRoot = Split-Path -Parent (Split-Path -Parent $git)
$gitRuntime = Resolve-ExactFile `
  -Path (Join-Path $gitRoot 'mingw64/bin/git.exe') `
  -Label 'pinned Git runtime'
$javaRoot = Resolve-ExactDirectory -Path $JavaHome -Label 'pinned Java home'
$java = Resolve-ExactFile -Path (Join-Path $javaRoot 'bin/java.exe') -Label 'pinned Java executable'
$javaRelease = Resolve-ExactFile -Path (Join-Path $javaRoot 'release') -Label 'pinned Java release file'
$javaModules = Resolve-ExactFile -Path (Join-Path $javaRoot 'lib/modules') -Label 'pinned Java module image'
$jvmDll = Resolve-ExactFile -Path (Join-Path $javaRoot 'bin/server/jvm.dll') -Label 'pinned JVM library'
$sbtLauncher = Resolve-ExactFile -Path $SbtLaunchJar -Label 'pinned sbt launcher'

Assert-Sha256 -Path $vectorPath -Expected $ExpectedVectorSha256 -Label 'UTXO state-proof vector'
Assert-Sha256 -Path $specPath -Expected $ExpectedSpecSha256 -Label 'UTXO state-proof JVM spec'
Assert-Sha256 -Path $git -Expected $ExpectedGitLauncherSha256 -Label 'pinned Git launcher'
Assert-Sha256 -Path $gitRuntime -Expected $ExpectedGitRuntimeSha256 -Label 'pinned Git runtime'
Assert-Sha256 -Path $java -Expected $ExpectedJavaExeSha256 -Label 'pinned Java executable'
Assert-Sha256 -Path $javaRelease -Expected $ExpectedJavaReleaseSha256 -Label 'pinned Java release file'
Assert-Sha256 -Path $javaModules -Expected $ExpectedJavaModulesSha256 -Label 'pinned Java module image'
Assert-Sha256 -Path $jvmDll -Expected $ExpectedJvmDllSha256 -Label 'pinned JVM library'
Assert-Sha256 -Path $sbtLauncher -Expected $ExpectedSbtLauncherSha256 -Label 'pinned sbt launcher'

$sourceHead = (& $git -C $sourceCheckout rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceHead -ne $ExpectedErgoCommit) {
  throw "Ergo source checkout must be at $ExpectedErgoCommit"
}

$vector = Get-Content -LiteralPath $vectorPath -Raw | ConvertFrom-Json
if ($vector.schema -ne 'ergo-utxo-state-lookup-vector-v1') {
  throw 'unexpected Ergo UTXO state-proof vector schema'
}
if ($vector.lookups.Count -ne 2) {
  throw 'Ergo UTXO state-proof vector must contain exactly two lookups'
}
$vault = $vector.lookups[0]
$source = $vector.lookups[1]
if ($vault.kind -ne 'membership' -or $source.kind -ne 'non-membership') {
  throw 'Ergo UTXO state-proof vector lookup order changed'
}
Assert-LowerHex -Value $vector.preTransitionRootHex -Bytes 33 -Label 'pre-transition root'
Assert-LowerHex -Value $vector.postTransitionRootHex -Bytes 33 -Label 'post-transition root'
Assert-LowerHex -Value $vault.keyHex -Bytes 32 -Label 'vault key'
Assert-LowerHex -Value $source.keyHex -Bytes 32 -Label 'source key'
Assert-LowerHex -Value $vault.expectedValueHex -Bytes 175 -Label 'vault bytes'
Assert-LowerHex -Value $source.historicalValueHex -Bytes 176 -Label 'historical source bytes'
if ($vector.proofHex -cnotmatch '^[0-9a-f]+$' -or ($vector.proofHex.Length % 2) -ne 0) {
  throw 'Ergo UTXO state-proof bytes must be lowercase base16'
}

foreach ($name in @(
  'JAVA_TOOL_OPTIONS',
  'JDK_JAVA_OPTIONS',
  '_JAVA_OPTIONS',
  'JAVA_OPTS',
  'SBT_OPTS'
)) {
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "$name must be unset for the pinned JVM differential"
  }
}

$runDirectory = Join-Path `
  ([System.IO.Path]::GetTempPath()) `
  ('e2s-utxo-' + [System.Guid]::NewGuid().ToString('N'))
Assert-SafeTemporaryDirectory -Path $runDirectory
$clone = Join-Path $runDirectory 'ergo'
$isolatedUserHome = Join-Path $runDirectory 'home'
$isolatedSbtGlobalBase = Join-Path $runDirectory 'sbt-global'
$isolatedSbtBoot = Join-Path $runDirectory 'sbt-boot'
$isolatedSbtIvyHome = Join-Path $runDirectory 'ivy'
$isolatedCoursierCache = Join-Path $runDirectory 'coursier'
$isolatedGitConfig = Join-Path $runDirectory 'gitconfig'
New-Item -ItemType Directory -Path $runDirectory,$isolatedUserHome | Out-Null
Set-Content -LiteralPath $isolatedGitConfig -Value '' -NoNewline

$environmentNames = @(
  'JAVA_HOME',
  'PATH',
  'COURSIER_CACHE',
  'HOME',
  'USERPROFILE',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'BRIDGE_ERGO_UTXO_ERGO_COMMIT',
  'BRIDGE_ERGO_UTXO_PRE_ROOT',
  'BRIDGE_ERGO_UTXO_POST_ROOT',
  'BRIDGE_ERGO_UTXO_PROOF',
  'BRIDGE_ERGO_UTXO_VAULT_ID',
  'BRIDGE_ERGO_UTXO_VAULT_BYTES',
  'BRIDGE_ERGO_UTXO_SOURCE_ID',
  'BRIDGE_ERGO_UTXO_SOURCE_HISTORICAL_BYTES'
)
$savedEnvironment = @{}
foreach ($name in $environmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$env:JAVA_HOME = $javaRoot
$env:PATH = (Split-Path -Parent $java) + [System.IO.Path]::PathSeparator + (Split-Path -Parent $git)
$env:COURSIER_CACHE = $isolatedCoursierCache
$env:HOME = $isolatedUserHome
$env:USERPROFILE = $isolatedUserHome
$env:GIT_CONFIG_GLOBAL = $isolatedGitConfig
$env:GIT_CONFIG_NOSYSTEM = '1'
$env:BRIDGE_ERGO_UTXO_ERGO_COMMIT = $ExpectedErgoCommit
$env:BRIDGE_ERGO_UTXO_PRE_ROOT = $vector.preTransitionRootHex
$env:BRIDGE_ERGO_UTXO_POST_ROOT = $vector.postTransitionRootHex
$env:BRIDGE_ERGO_UTXO_PROOF = $vector.proofHex
$env:BRIDGE_ERGO_UTXO_VAULT_ID = $vault.keyHex
$env:BRIDGE_ERGO_UTXO_VAULT_BYTES = $vault.expectedValueHex
$env:BRIDGE_ERGO_UTXO_SOURCE_ID = $source.keyHex
$env:BRIDGE_ERGO_UTXO_SOURCE_HISTORICAL_BYTES = $source.historicalValueHex

try {
  & $git clone --quiet --no-checkout --no-hardlinks `
    -c core.autocrlf=false `
    -c core.eol=lf `
    $sourceCheckout `
    $clone
  if ($LASTEXITCODE -ne 0) {
    throw 'failed to create isolated Ergo source clone'
  }
  & $git -C $clone checkout --quiet --detach $ExpectedErgoCommit
  if ($LASTEXITCODE -ne 0) {
    throw 'failed to check out pinned Ergo source commit'
  }
  $cloneHead = (& $git -C $clone rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $cloneHead -ne $ExpectedErgoCommit) {
    throw 'isolated Ergo source clone changed the pinned commit'
  }
  $buildProperties = Get-Content -LiteralPath (Join-Path $clone 'project/build.properties') -Raw
  if ($buildProperties.Trim() -ne "sbt.version=$ExpectedSbtVersion") {
    throw "pinned Ergo source must select sbt $ExpectedSbtVersion"
  }

  $destination = Join-Path $clone 'src/test/scala/org/ergoplatform/nodeView/state/bridge'
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  $copiedSpec = Join-Path $destination 'BridgeUtxoStateProofDifferentialSpec.scala'
  Copy-Item -LiteralPath $specPath -Destination $copiedSpec
  Assert-Sha256 -Path $copiedSpec -Expected $ExpectedSpecSha256 -Label 'copied UTXO state-proof JVM spec'

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
    '-jar',
    $sbtLauncher,
    'testOnly org.ergoplatform.nodeView.state.bridge.BridgeUtxoStateProofDifferentialSpec'
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
  if ($exitCode -ne 0) {
    Write-Output $rendered.TrimEnd()
    throw "pinned Ergo UTXO state-proof JVM differential failed with exit code $exitCode"
  }
  $expectedResult = "$ResultPrefix$($vector.postTransitionRootHex)"
  if ($rendered -notmatch [regex]::Escape($expectedResult)) {
    throw 'pinned Ergo UTXO state-proof JVM differential did not emit its exact result'
  }
  if ($rendered -notmatch "welcome to sbt $ExpectedSbtVersion") {
    throw "pinned Ergo UTXO state-proof JVM differential did not use sbt $ExpectedSbtVersion"
  }
  if ($rendered -notmatch 'All tests passed') {
    throw 'pinned Ergo UTXO state-proof JVM differential did not report a passing suite'
  }

  $scryptoJars = @(
    Get-ChildItem `
      -LiteralPath $isolatedCoursierCache `
      -Recurse `
      -File `
      -Filter $ExpectedScryptoName
  )
  if ($scryptoJars.Count -ne 1) {
    throw "expected exactly one resolved $ExpectedScryptoName, got $($scryptoJars.Count)"
  }
  Assert-Sha256 `
    -Path $scryptoJars[0].FullName `
    -Expected $ExpectedScryptoSha256 `
    -Label 'resolved scrypto JVM artifact'

  [ordered]@{
    schema = 'ergo-utxo-state-proof-jvm-differential-result-v1'
    status = 'NON_AUTHORIZING_JVM_DIFFERENTIAL_REPRODUCED'
    ergoCommit = $ExpectedErgoCommit
    stateRootHex = $vector.postTransitionRootHex
    proofBytes = $vector.proofHex.Length / 2
    scryptoSha256 = $ExpectedScryptoSha256
  } | ConvertTo-Json -Compress
} finally {
  foreach ($name in $environmentNames) {
    $value = $savedEnvironment[$name]
    if ($null -eq $value) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
  Remove-SafeTemporaryDirectory -Path $runDirectory
}
