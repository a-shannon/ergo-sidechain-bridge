[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Compile', 'Accept')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$SigmaStateCheckout,

  [Parameter(Mandatory = $true)]
  [string]$BridgeRoot,

  [Parameter(Mandatory = $true)]
  [string]$JavaHome,

  [Parameter(Mandatory = $true)]
  [string]$SbtLaunchJar,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [string]$CompilerReceiptPath,

  [string]$CompilerReceiptSha256,

  [string]$FixturePath,

  [string]$FixtureSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedSigmaStateCommit =
  'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ExpectedSpecSha256 =
  '81c4e0ec79f7fb861c2de9be4f71858866aab50779298e72f82ec192e17dedbb'
$ExpectedBuildSbtSha256 =
  'e381716ac80820f5d27ace5bba1ad024276190f40748eefd31785d79ac193c10'
$ExpectedBuildPropertiesSha256 =
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
$ExpectedSbtVersion = '1.12.11'
$ExpectedScalaVersion = '2.13.18'
$CompilerSchema =
  'e2s.authenticated-external-fee-settlement-jvm-compiler-receipt.v1'
$AcceptanceSchema =
  'e2s.authenticated-external-fee-settlement-jvm-receipt.v1'
$SpecRelativePath =
  'validity-proof/consumer-jvm/BridgeAuthenticatedExternalFeeSettlementAcceptanceV1Spec.scala'
$SpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgeAuthenticatedExternalFeeSettlementAcceptanceV1Spec.scala'
$SpecClass =
  'sigma.bridge.BridgeAuthenticatedExternalFeeSettlementAcceptanceV1Spec'
$UnlockTemplateRelativePath =
  'contracts/MainChainAggregateUnlockAuthenticatedExternalFeeV1.es'
$DupTemplateRelativePath =
  'contracts/DoubleUnlockPreventionAuthenticatedExternalFeeV1.es'
$OldDupTemplateRelativePath =
  'contracts/DoubleUnlockPreventionAuthenticated.es'
$ExpectedUnlockTemplateSha256 =
  '3e0807ad84dac5ed9dcacd78beeec82650367aa3c04614ea9a10b6d9c8f0947e'
$ExpectedDupTemplateSha256 =
  '9ffc36b1fde633cfd8ee60442bb4c363c593d98d95605f71a89505db8b5fcf3e'
$ExpectedOldDupTemplateSha256 =
  'c4947b034b40ebf8c6385d48da1e8c109a98958cb9c1d5431b9714853ad24a33'
$ExpectedNegativeCaseIds = @(
  'missing_fee_input',
  'reordered_fee_input',
  'fee_value_mismatch',
  'token_bearing_fee',
  'wrong_fee_tree',
  'dust_residual',
  'wrong_dup_successor_avl',
  'wrong_dup_successor_proposition',
  'wrong_dup_successor_value',
  'wrong_dup_insert_proof',
  'wrong_vault_successor_tree',
  'wrong_vault_successor_value',
  'wrong_vault_successor_registers',
  'wrong_payout_tree',
  'wrong_payout_value',
  'legacy_dup_profile_rejected'
)
$BoundaryNames = @(
  'nodeCheckPerformed',
  'signingAuthorityEstablished',
  'submissionAuthorityEstablished',
  'broadcastAuthorityEstablished',
  'fundsAuthorityEstablished',
  'gate5Closed',
  'trustlessStatusEstablished',
  'productionReadinessEstablished'
)

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

  return (
    Get-FileHash -Algorithm SHA256 -LiteralPath $Path
  ).Hash.ToLowerInvariant()
}

function Get-BytesSha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [byte[]]$Bytes
  )

  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    return (
      $hasher.ComputeHash($Bytes) |
      ForEach-Object { $_.ToString('x2') }
    ) -join ''
  } finally {
    $hasher.Dispose()
  }
}

function ConvertFrom-LowerHex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($Value -cnotmatch '^[0-9a-f]+$' -or ($Value.Length % 2) -ne 0) {
    throw "$Label must be lowercase whole-byte hex"
  }
  $bytes = [byte[]]::new($Value.Length / 2)
  for ($index = 0; $index -lt $bytes.Length; $index++) {
    $bytes[$index] = [Convert]::ToByte(
      $Value.Substring($index * 2, 2),
      16
    )
  }
  return $bytes
}

function Assert-ExactDigest {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (-not ($Value -is [string]) -or $Value -cnotmatch '^[0-9a-f]{64}$') {
    throw "$Label must be 32 lowercase hex bytes"
  }
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

  Assert-ExactDigest -Value $Expected -Label "$Label expected SHA-256"
  if ((Get-Sha256Hex -Path $Path) -ne $Expected) {
    throw "$Label does not match the reviewed SHA-256"
  }
}

function Assert-ExactAsciiLfFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [int]$MaxBytes = 1048576
  )

  $item = Get-Item -LiteralPath $Path
  if (
    $item.PSIsContainer -or
    (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
    $item.Length -gt $MaxBytes
  ) {
    throw "$Label must be a bounded real file"
  }
  $bytes = [IO.File]::ReadAllBytes($item.FullName)
  if (
    $bytes.Length -eq 0 -or
    $bytes.Length -gt $MaxBytes -or
    ($bytes | Where-Object { $_ -eq 13 -or $_ -gt 127 }) -or
    (
      $bytes.Length -ge 3 -and
      $bytes[0] -eq 0xef -and
      $bytes[1] -eq 0xbb -and
      $bytes[2] -eq 0xbf
    )
  ) {
    throw "$Label must be bounded non-empty BOM-free LF-only ASCII"
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

function Assert-FalseBoundaries {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value
  )

  Assert-ExactKeys `
    -Value $Value `
    -Expected $BoundaryNames `
    -Label 'receipt boundaries'
  foreach ($name in $BoundaryNames) {
    if (-not ($Value.$name -is [bool]) -or $Value.$name) {
      throw "receipt boundary $name must be the JSON boolean false"
    }
  }
}

function Assert-ContractRecord {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedPath,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedTemplateSha256,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Assert-ExactKeys -Value $Value -Expected @(
    'templatePath',
    'templateSha256Hex',
    'resolvedSourceSha256Hex',
    'propositionHex',
    'propositionBytes',
    'propositionSha256Hex',
    'propositionBlake2b256Hex'
  ) -Label "$Label contract"
  if (
    $Value.templatePath -ne $ExpectedPath -or
    $Value.templateSha256Hex -ne $ExpectedTemplateSha256
  ) {
    throw "$Label contract template identity is invalid"
  }
  Assert-ExactDigest `
    -Value $Value.resolvedSourceSha256Hex `
    -Label "$Label resolved source SHA-256"
  Assert-ExactDigest `
    -Value $Value.propositionSha256Hex `
    -Label "$Label proposition SHA-256"
  Assert-ExactDigest `
    -Value $Value.propositionBlake2b256Hex `
    -Label "$Label proposition Blake2b-256"
  if (
    -not ($Value.propositionHex -is [string]) -or
    -not ($Value.propositionBytes -is [int]) -or
    $Value.propositionBytes -le 0
  ) {
    throw "$Label proposition identity has invalid types"
  }
  $propositionBytes = ConvertFrom-LowerHex `
    -Value $Value.propositionHex `
    -Label "$Label proposition"
  if (
    $propositionBytes.Length -ne $Value.propositionBytes -or
    (Get-BytesSha256Hex -Bytes $propositionBytes) -ne
      $Value.propositionSha256Hex
  ) {
    throw "$Label proposition byte identity is invalid"
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
  -Label 'external-fee JVM spec'
$unlockTemplatePath = Resolve-RealFile `
  -Path (Join-Path $bridge $UnlockTemplateRelativePath) `
  -Label 'external-fee unlock template'
$dupTemplatePath = Resolve-RealFile `
  -Path (Join-Path $bridge $DupTemplateRelativePath) `
  -Label 'external-fee DUP template'
$oldDupTemplatePath = Resolve-RealFile `
  -Path (Join-Path $bridge $OldDupTemplateRelativePath) `
  -Label 'old authenticated DUP negative template'

foreach ($entry in @(
  @($specPath, 'external-fee JVM spec'),
  @($unlockTemplatePath, 'external-fee unlock template'),
  @($dupTemplatePath, 'external-fee DUP template'),
  @($oldDupTemplatePath, 'old authenticated DUP negative template')
)) {
  Assert-ExactAsciiLfFile -Path $entry[0] -Label $entry[1]
}
Assert-Hash `
  -Path $specPath `
  -Expected $ExpectedSpecSha256 `
  -Label 'external-fee JVM spec'
Assert-Hash `
  -Path $unlockTemplatePath `
  -Expected $ExpectedUnlockTemplateSha256 `
  -Label 'external-fee unlock template'
Assert-Hash `
  -Path $dupTemplatePath `
  -Expected $ExpectedDupTemplateSha256 `
  -Label 'external-fee DUP template'
Assert-Hash `
  -Path $oldDupTemplatePath `
  -Expected $ExpectedOldDupTemplateSha256 `
  -Label 'old authenticated DUP negative template'

Assert-Hash `
  -Path (Join-Path $sigma 'build.sbt') `
  -Expected $ExpectedBuildSbtSha256 `
  -Label 'SigmaState build.sbt'
Assert-Hash `
  -Path (Join-Path $sigma 'project/build.properties') `
  -Expected $ExpectedBuildPropertiesSha256 `
  -Label 'SigmaState build.properties'
Assert-Hash `
  -Path $javaExe `
  -Expected $ExpectedJavaExeSha256 `
  -Label 'Microsoft OpenJDK 17 executable'
Assert-Hash `
  -Path $javaRelease `
  -Expected $ExpectedJavaReleaseSha256 `
  -Label 'Microsoft OpenJDK 17 release file'
Assert-Hash `
  -Path $javaModules `
  -Expected $ExpectedJavaModulesSha256 `
  -Label 'Microsoft OpenJDK 17 module image'
Assert-Hash `
  -Path $jvmDll `
  -Expected $ExpectedJvmDllSha256 `
  -Label 'Microsoft OpenJDK 17 VM library'
Assert-Hash `
  -Path $sbtLauncher `
  -Expected $ExpectedSbtLauncherSha256 `
  -Label 'sbt 1.12.11 launcher'

$head = (& git -C $sigma rev-parse 'HEAD^{commit}').Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSigmaStateCommit) {
  throw 'SigmaState checkout is not at the reviewed commit'
}
$sigmaStatus = @(
  & git -C $sigma status --porcelain=v1 --untracked-files=all
)
if ($LASTEXITCODE -ne 0 -or $sigmaStatus.Count -ne 0) {
  throw 'SigmaState checkout must be clean before focused JVM acceptance'
}

$output = [IO.Path]::GetFullPath($OutputPath)
$outputParent = Resolve-RealDirectory `
  -Path (Split-Path -Parent $output) `
  -Label 'receipt output parent'
if (Test-Path -LiteralPath $output) {
  throw 'receipt output must be create-only'
}
if ((Split-Path -Parent $output) -ne $outputParent) {
  throw 'receipt output parent must resolve exactly'
}

$compilerReceipt = $null
$compilerReceiptHash = $null
$fixture = $null
$fixtureHash = $null
if ($Mode -eq 'Accept') {
  if (
    [string]::IsNullOrWhiteSpace($CompilerReceiptPath) -or
    [string]::IsNullOrWhiteSpace($CompilerReceiptSha256) -or
    [string]::IsNullOrWhiteSpace($FixturePath) -or
    [string]::IsNullOrWhiteSpace($FixtureSha256)
  ) {
    throw 'Accept mode requires exact compiler receipt and fixture paths/hashes'
  }
  Assert-ExactDigest `
    -Value $CompilerReceiptSha256 `
    -Label 'compiler receipt SHA-256'
  Assert-ExactDigest -Value $FixtureSha256 -Label 'fixture SHA-256'
  $compilerReceipt = Resolve-RealFile `
    -Path $CompilerReceiptPath `
    -Label 'compiler receipt'
  $fixture = Resolve-RealFile -Path $FixturePath -Label 'proofless fixture'
  Assert-ExactAsciiLfFile `
    -Path $compilerReceipt `
    -Label 'compiler receipt' `
    -MaxBytes 65536
  Assert-ExactAsciiLfFile `
    -Path $fixture `
    -Label 'proofless fixture' `
    -MaxBytes 1048576
  Assert-Hash `
    -Path $compilerReceipt `
    -Expected $CompilerReceiptSha256 `
    -Label 'compiler receipt'
  Assert-Hash `
    -Path $fixture `
    -Expected $FixtureSha256 `
    -Label 'proofless fixture'
  $compilerReceiptHash = $CompilerReceiptSha256
  $fixtureHash = $FixtureSha256
} elseif (
  -not [string]::IsNullOrEmpty($CompilerReceiptPath) -or
  -not [string]::IsNullOrEmpty($CompilerReceiptSha256) -or
  -not [string]::IsNullOrEmpty($FixturePath) -or
  -not [string]::IsNullOrEmpty($FixtureSha256)
) {
  throw 'Compile mode must not receive acceptance-only inputs'
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
    throw "JVM acceptance environment must not define $name"
  }
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$runRoot = Join-Path `
  $tempRoot `
  ('bridge-authenticated-external-fee-jvm-v1-' +
    [Guid]::NewGuid().ToString('N'))
$temporaryWorktree = Join-Path $runRoot 'sigmastate'
$isolatedUserHome = Join-Path $runRoot 'home'
$isolatedSbtGlobalBase = Join-Path $runRoot 'sbt-global'
$isolatedSbtBoot = Join-Path $runRoot 'sbt-boot'
$isolatedSbtIvyHome = Join-Path $runRoot 'ivy'
$isolatedCoursierCache = Join-Path $runRoot 'coursier-cache'
$worktreeAdded = $false
$removeExitCode = 0

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
    throw "failed to create pinned SigmaState worktree: $(
      $worktreeOutput -join [Environment]::NewLine
    )"
  }
  $worktreeAdded = $true

  $destination = Join-Path $temporaryWorktree $SpecDestination
  New-Item `
    -ItemType Directory `
    -Path (Split-Path -Parent $destination) `
    -Force | Out-Null
  Copy-Item -LiteralPath $specPath -Destination $destination
  if ((Get-Sha256Hex -Path $destination) -ne $ExpectedSpecSha256) {
    throw 'copied JVM spec differs from the reviewed file'
  }

  $savedJavaHome = $env:JAVA_HOME
  $savedPath = $env:PATH
  $savedCoursierCache = $env:COURSIER_CACHE
  $savedHome = $env:HOME
  $savedUserProfile = $env:USERPROFILE
  $env:JAVA_HOME = $javaRoot
  $env:PATH = (Join-Path $javaRoot 'bin') + ';' + $savedPath
  $env:COURSIER_CACHE = $isolatedCoursierCache
  $env:HOME = $isolatedUserHome
  $env:USERPROFILE = $isolatedUserHome

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
    "-Dbridge.authenticated.external.fee.jvm.mode=$($Mode.ToLowerInvariant())",
    "-Dbridge.authenticated.external.fee.jvm.root=$bridge",
    "-Dbridge.authenticated.external.fee.jvm.receipt.out=$output",
    "-Dbridge.authenticated.external.fee.jvm.spec.sha256=$ExpectedSpecSha256"
  )
  if ($Mode -eq 'Accept') {
    $javaArguments += @(
      "-Dbridge.authenticated.external.fee.jvm.compiler.receipt=$compilerReceipt",
      "-Dbridge.authenticated.external.fee.jvm.compiler.receipt.sha256=$compilerReceiptHash",
      "-Dbridge.authenticated.external.fee.jvm.fixture=$fixture",
      "-Dbridge.authenticated.external.fee.jvm.fixture.sha256=$fixtureHash"
    )
  }
  $javaArguments += @(
    '-jar',
    $sbtLauncher,
    "scJVM/Test/testOnly $SpecClass"
  )

  Push-Location $temporaryWorktree
  try {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $acceptanceOutput = @(
        & $javaExe @javaArguments 2>&1 |
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
    $env:HOME = $savedHome
    $env:USERPROFILE = $savedUserProfile
  }

  $acceptanceOutput | ForEach-Object { Write-Output $_ }
  if ($acceptanceExitCode -ne 0) {
    throw "pinned external-fee JVM run failed with exit code $acceptanceExitCode"
  }
  if (-not ($acceptanceOutput -match "welcome to sbt $ExpectedSbtVersion")) {
    throw 'pinned JVM run did not report sbt 1.12.11'
  }
  if (-not ($acceptanceOutput -match "Scala version: $ExpectedScalaVersion")) {
    # The spec asserts the Scala version even when sbt does not print it.
    Write-Verbose 'Scala version is enforced inside the pinned spec'
  }
  if (-not ($acceptanceOutput -match 'All tests passed')) {
    throw 'pinned JVM run did not report a passing focused suite'
  }
  if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
    throw 'pinned JVM run did not create its receipt'
  }

  Assert-ExactAsciiLfFile -Path $output -Label 'JVM receipt'
  $receipt = Get-Content -Raw -LiteralPath $output | ConvertFrom-Json
  $expectedSchema = if ($Mode -eq 'Compile') {
    $CompilerSchema
  } else {
    $AcceptanceSchema
  }
  if (
    $receipt.schema -ne $expectedSchema -or
    $receipt.version -ne 1 -or
    $receipt.sigmaStateCommit -ne $ExpectedSigmaStateCommit -or
    $receipt.specSha256Hex -ne $ExpectedSpecSha256
  ) {
    throw 'JVM receipt identity is invalid'
  }

  Assert-ExactKeys -Value $receipt.bindings -Expected @(
    'trackerNftIdHex',
    'duplicatePreventionNftIdHex'
  ) -Label 'receipt bindings'
  if (
    $receipt.bindings.trackerNftIdHex -ne ('aa' * 32) -or
    $receipt.bindings.duplicatePreventionNftIdHex -ne ('bb' * 32)
  ) {
    throw 'JVM receipt contract bindings are invalid'
  }
  Assert-ExactKeys -Value $receipt.contracts -Expected @(
    'mainChainAggregateUnlockAuthenticatedExternalFee',
    'doubleUnlockPreventionAuthenticatedExternalFee'
  ) -Label 'receipt contracts'
  Assert-ContractRecord `
    -Value $receipt.contracts.mainChainAggregateUnlockAuthenticatedExternalFee `
    -ExpectedPath $UnlockTemplateRelativePath `
    -ExpectedTemplateSha256 $ExpectedUnlockTemplateSha256 `
    -Label 'external-fee unlock'
  Assert-ContractRecord `
    -Value $receipt.contracts.doubleUnlockPreventionAuthenticatedExternalFee `
    -ExpectedPath $DupTemplateRelativePath `
    -ExpectedTemplateSha256 $ExpectedDupTemplateSha256 `
    -Label 'external-fee DUP'
  $unlockRecord =
    $receipt.contracts.mainChainAggregateUnlockAuthenticatedExternalFee
  $dupRecord =
    $receipt.contracts.doubleUnlockPreventionAuthenticatedExternalFee
  $unlockBlake2b = $unlockRecord.propositionBlake2b256Hex
  $dupBlake2b = $dupRecord.propositionBlake2b256Hex
  if ($unlockBlake2b -eq $dupBlake2b) {
    throw 'JVM receipt contract identities must be distinct'
  }
  Assert-FalseBoundaries -Value $receipt.boundaries

  if ($Mode -eq 'Compile') {
    Assert-ExactKeys -Value $receipt -Expected @(
      'schema',
      'version',
      'sigmaStateCommit',
      'specSha256Hex',
      'bindings',
      'contracts',
      'negativeDependencies',
      'boundaries'
    ) -Label 'compiler receipt'
    Assert-ExactKeys -Value $receipt.negativeDependencies -Expected @(
      'oldAuthenticatedDuplicatePreventionTemplateSha256Hex',
      'oldAuthenticatedDuplicatePreventionPropositionBlake2b256Hex'
    ) -Label 'compiler receipt negative dependencies'
    $negativeDependencies = $receipt.negativeDependencies
    $oldDupTemplateHash =
      $negativeDependencies.oldAuthenticatedDuplicatePreventionTemplateSha256Hex
    if ($oldDupTemplateHash -ne $ExpectedOldDupTemplateSha256) {
      throw 'compiler receipt old-profile template identity is invalid'
    }
    $oldDupPropositionHash =
      $negativeDependencies.oldAuthenticatedDuplicatePreventionPropositionBlake2b256Hex
    Assert-ExactDigest `
      -Value $oldDupPropositionHash `
      -Label 'compiler receipt old-profile proposition Blake2b-256'
  } else {
    Assert-ExactKeys -Value $receipt -Expected @(
      'schema',
      'version',
      'sigmaStateCommit',
      'specSha256Hex',
      'compilerReceiptSha256Hex',
      'fixtureSha256Hex',
      'bindings',
      'contracts',
      'positiveCaseCount',
      'positives',
      'negativeCaseCount',
      'negativeCaseIds',
      'boundaries'
    ) -Label 'acceptance receipt'
    if (
      $receipt.compilerReceiptSha256Hex -ne $compilerReceiptHash -or
      $receipt.fixtureSha256Hex -ne $fixtureHash -or
      $receipt.positiveCaseCount -ne 2 -or
      $receipt.positives.Count -ne 2 -or
      $receipt.negativeCaseCount -ne $ExpectedNegativeCaseIds.Count -or
      $receipt.negativeCaseIds.Count -ne $ExpectedNegativeCaseIds.Count
    ) {
      throw 'acceptance receipt case identity is invalid'
    }
    $expectedPositiveIds = @('partialVault', 'terminalVault')
    for ($index = 0; $index -lt $expectedPositiveIds.Count; $index++) {
      $positive = $receipt.positives[$index]
      Assert-ExactKeys -Value $positive -Expected @(
        'caseId',
        'transactionIdHex',
        'prooflessTransactionBytes',
        'prooflessTransactionSha256Hex',
        'duplicatePreventionInputAccepted',
        'vaultInputAccepted'
      ) -Label "acceptance positive $index"
      if (
        $positive.caseId -ne $expectedPositiveIds[$index] -or
        -not ($positive.prooflessTransactionBytes -is [int]) -or
        $positive.prooflessTransactionBytes -le 0 -or
        -not ($positive.duplicatePreventionInputAccepted -is [bool]) -or
        -not $positive.duplicatePreventionInputAccepted -or
        -not ($positive.vaultInputAccepted -is [bool]) -or
        -not $positive.vaultInputAccepted
      ) {
        throw "acceptance positive $index is invalid"
      }
      Assert-ExactDigest `
        -Value $positive.transactionIdHex `
        -Label "acceptance positive $index transaction ID"
      Assert-ExactDigest `
        -Value $positive.prooflessTransactionSha256Hex `
        -Label "acceptance positive $index proofless SHA-256"
    }
    for ($index = 0; $index -lt $ExpectedNegativeCaseIds.Count; $index++) {
      if (
        $receipt.negativeCaseIds[$index] -ne
          $ExpectedNegativeCaseIds[$index]
      ) {
        throw "acceptance negative case $index is not canonical"
      }
    }
  }

  $receiptSha256 = Get-Sha256Hex -Path $output
  Write-Output "jvm_mode=$($Mode.ToLowerInvariant())"
  Write-Output "jvm_spec_sha256=$ExpectedSpecSha256"
  Write-Output "jvm_receipt_sha256=$receiptSha256"
} finally {
  if ($worktreeAdded) {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & git -C $sigma worktree remove --force $temporaryWorktree `
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
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    try {
      $extendedRunRoot = '\\?\' + $resolvedRunRoot
      if ([IO.Directory]::Exists($extendedRunRoot)) {
        [IO.Directory]::Delete($extendedRunRoot, $true)
      }
    } catch [IO.DirectoryNotFoundException] {
      # Worktree cleanup may already have removed the last child.
    } catch {
      Write-Warning "failed to remove JVM run directory $resolvedRunRoot"
    }
  }
  & git -C $sigma worktree prune 2>&1 | Out-Null
  if (
    $worktreeAdded -and
    $removeExitCode -ne 0 -and
    [IO.Directory]::Exists($resolvedRunRoot)
  ) {
    Write-Warning "failed to remove JVM worktree $temporaryWorktree"
  }
}
