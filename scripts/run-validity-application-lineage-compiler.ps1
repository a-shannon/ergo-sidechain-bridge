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

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedSigmaStateCommit = 'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ReceiptSchema = 'e2s.validity-application-lineage-compiler-batch.v1'
$SpecRelativePath =
  'validity-proof/consumer-jvm/BridgeValidityApplicationLineageCompilerSpec.scala'
$LockRelativePath =
  'validity-proof/consumer-jvm/validity-application-lineage-compiler-lock-v1.json'
$SpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgeValidityApplicationLineageCompilerSpec.scala'

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

function Assert-JsonString {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (-not ($Value -is [string]) -or $Value.Length -eq 0) {
    throw "$Label must be a non-empty JSON string"
  }
}

function Assert-JsonInt32 {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (-not ($Value -is [int])) {
    throw "$Label must be a JSON int32"
  }
}

function Assert-FalseJsonBoolean {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (-not ($Value -is [bool]) -or $Value) {
    throw "$Label must be the JSON boolean false"
  }
}

function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
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
    -not $item.PSIsContainer -and
    (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0)
  ) {
    $bytes = [IO.File]::ReadAllBytes($item.FullName)
    if (
      $bytes.Length -eq 0 -or
      $bytes[0] -eq 0xef -or
      ($bytes | Where-Object { $_ -eq 13 -or $_ -gt 127 })
    ) {
      throw "$Label must be non-empty BOM-free LF-only ASCII"
    }
    return
  }
  throw "$Label must be a real file"
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

  if (
    -not ($Expected -is [string]) -or
    $Expected -cnotmatch '^[0-9a-f]{64}$'
  ) {
    throw "$Label expected SHA-256 must be 32 lowercase hex bytes"
  }
  if ((Get-Sha256Hex -Path $Path) -ne $Expected) {
    throw "$Label does not match the reviewed SHA-256"
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
$output = [IO.Path]::GetFullPath($OutputPath)
$outputParent = Resolve-RealDirectory `
  -Path (Split-Path -Parent $output) `
  -Label 'compiler receipt parent'
if (Test-Path -LiteralPath $output) {
  throw 'compiler receipt output must not already exist'
}
if ((Split-Path -Parent $output) -ne $outputParent) {
  throw 'compiler receipt output parent must resolve exactly'
}

$lockPath = Join-Path $bridge $LockRelativePath
$specPath = Join-Path $bridge $SpecRelativePath
Assert-ExactAsciiLfFile -Path $lockPath -Label 'compiler lock'
Assert-ExactAsciiLfFile -Path $specPath -Label 'compiler spec'
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
Assert-ExactKeys -Value $lock.templates -Expected @(
  'tracker',
  'causalVault',
  'duplicatePrevention',
  'sourceLock'
) -Label 'compiler template lock'
Assert-ExactKeys -Value $lock.boundaries -Expected @(
  'profileActivated',
  'nodeCheckPerformed',
  'signingAuthorityEstablished',
  'submissionAuthorityEstablished',
  'broadcastAuthorityEstablished',
  'fundsAuthorityEstablished',
  'gate5Closed'
) -Label 'compiler boundary lock'

if (
  -not ($lock.schema -is [string]) -or
  -not ($lock.version -is [int]) -or
  -not ($lock.sigmaStateCommit -is [string]) -or
  $lock.schema -ne 'e2s.validity-application-lineage-compiler-lock.v1' -or
  $lock.version -ne 1 -or
  $lock.sigmaStateCommit -ne $ExpectedSigmaStateCommit
) {
  throw 'compiler lock identity is invalid'
}
foreach ($field in @(
  'scalaVersion',
  'sbtVersion',
  'buildSbtSha256Hex',
  'buildPropertiesSha256Hex',
  'compilerSpecSha256Hex',
  'compilerReceiptSha256Hex'
)) {
  Assert-JsonString `
    -Value $lock.$field `
    -Label "compiler lock $field"
}
foreach ($field in $lock.java.PSObject.Properties.Name) {
  Assert-JsonString `
    -Value $lock.java.$field `
    -Label "compiler Java lock $field"
}
foreach ($field in $lock.sbtLauncher.PSObject.Properties.Name) {
  Assert-JsonString `
    -Value $lock.sbtLauncher.$field `
    -Label "compiler sbt launcher lock $field"
}
if (
  $lock.sbtLauncher.version -ne $lock.sbtVersion -or
  $lock.java.vendor -ne 'Microsoft' -or
  $lock.java.version -ne '17.0.19' -or
  $lock.java.runtimeVersion -ne '17.0.19+10-LTS'
) {
  throw 'compiler toolchain lock identity is invalid'
}
foreach ($boundary in $lock.boundaries.PSObject.Properties) {
  Assert-FalseJsonBoolean `
    -Value $boundary.Value `
    -Label "compiler lock $($boundary.Name)"
}

$head = (& git -C $sigma rev-parse 'HEAD^{commit}').Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSigmaStateCommit) {
  throw 'SigmaState checkout is not at the reviewed commit'
}
$status = @(& git -C $sigma status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) {
  throw 'SigmaState checkout must be clean before guarded compilation'
}
Assert-Hash `
  -Path (Join-Path $sigma 'build.sbt') `
  -Expected $lock.buildSbtSha256Hex `
  -Label 'SigmaState build.sbt'
Assert-Hash `
  -Path (Join-Path $sigma 'project/build.properties') `
  -Expected $lock.buildPropertiesSha256Hex `
  -Label 'SigmaState build.properties'
Assert-Hash `
  -Path $specPath `
  -Expected $lock.compilerSpecSha256Hex `
  -Label 'bridge compiler spec'

foreach ($role in $lock.templates.PSObject.Properties) {
  Assert-ExactKeys -Value $role.Value -Expected @(
    'path',
    'sha256Hex'
  ) -Label "$($role.Name) template lock"
  Assert-JsonString `
    -Value $role.Value.path `
    -Label "$($role.Name) template lock path"
  Assert-JsonString `
    -Value $role.Value.sha256Hex `
    -Label "$($role.Name) template lock SHA-256"
  $templatePath = Join-Path $bridge $role.Value.path
  Assert-ExactAsciiLfFile `
    -Path $templatePath `
    -Label "$($role.Name) template"
  Assert-Hash `
    -Path $templatePath `
    -Expected $role.Value.sha256Hex `
    -Label "$($role.Name) template"
}

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
    throw "compiler environment must not define $name"
  }
}

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $javaSettings = @(
    & $javaExe -XshowSettings:properties -version 2>&1 |
      ForEach-Object { $_.ToString() }
  )
  $javaSettingsExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $savedErrorActionPreference
}
if ($javaSettingsExitCode -ne 0) {
  throw 'reviewed Java executable did not report its properties'
}
$javaSettingsText = $javaSettings -join "`n"
$expectedJavaSettings = [ordered]@{
  'java.home' = $javaRoot
  'java.vendor' = $lock.java.vendor
  'java.version' = $lock.java.version
  'java.runtime.version' = $lock.java.runtimeVersion
}
foreach ($setting in $expectedJavaSettings.GetEnumerator()) {
  $pattern = '(?m)^\s*' +
    [regex]::Escape($setting.Key) +
    '\s*=\s*' +
    [regex]::Escape($setting.Value) +
    '\s*$'
  if ($javaSettingsText -cnotmatch $pattern) {
    throw "reviewed Java property $($setting.Key) is invalid"
  }
}

$temporaryWorktree = Join-Path `
  ([IO.Path]::GetTempPath()) `
  ("bridge-lineage-compiler-" + [Guid]::NewGuid().ToString('N'))
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
    throw "failed to create compiler worktree: $($worktreeOutput -join [Environment]::NewLine)"
  }
  $worktreeAdded = $true

  $destination = Join-Path $temporaryWorktree $SpecDestination
  New-Item `
    -ItemType Directory `
    -Path (Split-Path -Parent $destination) `
    -Force | Out-Null
  Copy-Item -LiteralPath $specPath -Destination $destination
  Assert-Hash `
    -Path $destination `
    -Expected $lock.compilerSpecSha256Hex `
    -Label 'copied compiler spec'

  $savedJavaHome = $env:JAVA_HOME
  $savedPath = $env:PATH
  $env:JAVA_HOME = $javaRoot
  $env:PATH = (Join-Path $javaRoot 'bin') + ';' + $savedPath
  Push-Location $temporaryWorktree
  try {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $compilerOutput = @(
        & $javaExe `
          '-Xms1024m' `
          '-Xmx4096m' `
          '-Xss4M' `
          "-Dsbt.version=$($lock.sbtVersion)" `
          '-Dsbt.log.noformat=true' `
          '-Dsbt.supershell=false' `
          "-Dbridge.validity.application.lineage.root=$bridge" `
          "-Dbridge.eip0045.validity.application.lineage.identity.out=$output" `
          '-jar' `
          $sbtLauncher `
          'scJVM/Test/testOnly sigma.bridge.BridgeValidityApplicationLineageCompilerSpec' `
          2>&1 |
          ForEach-Object { $_.ToString() }
      )
      $compilerExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $savedErrorActionPreference
    }
  } finally {
    Pop-Location
    $env:JAVA_HOME = $savedJavaHome
    $env:PATH = $savedPath
  }
  $compilerOutput | ForEach-Object { Write-Output $_ }
  if ($compilerExitCode -ne 0) {
    throw "pinned compiler failed with exit code $compilerExitCode"
  }
  if (-not ($compilerOutput -match "welcome to sbt $($lock.sbtVersion)")) {
    throw 'pinned compiler did not report the reviewed sbt version'
  }
  if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
    throw 'pinned compiler did not create its receipt'
  }

  Assert-ExactAsciiLfFile -Path $output -Label 'compiler receipt'
  Assert-Hash `
    -Path $output `
    -Expected $lock.compilerReceiptSha256Hex `
    -Label 'compiler receipt'
  $receipt = Get-Content -Raw -LiteralPath $output | ConvertFrom-Json
  Assert-ExactKeys -Value $receipt -Expected @(
    'schema',
    'version',
    'sigmaStateCommit',
    'scalaVersion',
    'sbtVersion',
    'contracts',
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed'
  ) -Label 'compiler receipt'
  if (
    -not ($receipt.schema -is [string]) -or
    -not ($receipt.version -is [int]) -or
    -not ($receipt.sigmaStateCommit -is [string]) -or
    -not ($receipt.scalaVersion -is [string]) -or
    -not ($receipt.sbtVersion -is [string]) -or
    -not ($receipt.contracts -is [array]) -or
    $receipt.schema -ne $ReceiptSchema -or
    $receipt.version -ne 1 -or
    $receipt.sigmaStateCommit -ne $ExpectedSigmaStateCommit -or
    $receipt.scalaVersion -ne $lock.scalaVersion -or
    $receipt.sbtVersion -ne $lock.sbtVersion
  ) {
    throw 'compiler receipt identity is invalid'
  }
  foreach ($boundary in $lock.boundaries.PSObject.Properties.Name) {
    Assert-FalseJsonBoolean `
      -Value $receipt.$boundary `
      -Label "compiler receipt $boundary"
  }

  $expectedRoles = @(
    'tracker',
    'causalVault',
    'duplicatePrevention',
    'sourceLock'
  )
  $contractFields = @(
    'schema',
    'version',
    'role',
    'sigmaStateCommit',
    'scalaVersion',
    'sbtVersion',
    'scriptVersion',
    'treeVersion',
    'resolvedSourceSha256Hex',
    'propositionBytes',
    'propositionSha256Hex',
    'propositionHex',
    'contractIdHex',
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed'
  )
  if ($receipt.contracts.Count -ne $expectedRoles.Count) {
    throw 'compiler receipt contract count is invalid'
  }
  for ($index = 0; $index -lt $expectedRoles.Count; $index++) {
    $contract = $receipt.contracts[$index]
    $expectedRole = $expectedRoles[$index]
    $expectedTreeVersion = if ($expectedRole -eq 'tracker') { 4 } else { 0 }
    Assert-ExactKeys `
      -Value $contract `
      -Expected $contractFields `
      -Label "$expectedRole compiler contract receipt"
    foreach ($field in @(
      'schema',
      'role',
      'sigmaStateCommit',
      'scalaVersion',
      'sbtVersion',
      'resolvedSourceSha256Hex',
      'propositionSha256Hex',
      'propositionHex',
      'contractIdHex'
    )) {
      Assert-JsonString `
        -Value $contract.$field `
        -Label "$expectedRole compiler receipt $field"
    }
    foreach ($field in @(
      'version',
      'scriptVersion',
      'treeVersion',
      'propositionBytes'
    )) {
      Assert-JsonInt32 `
        -Value $contract.$field `
        -Label "$expectedRole compiler receipt $field"
    }
    if (
      $contract.schema -ne
        'e2s.validity-application-lineage-compiler-receipt.v1' -or
      $contract.version -ne 1 -or
      $contract.role -ne $expectedRole -or
      $contract.sigmaStateCommit -ne $ExpectedSigmaStateCommit -or
      $contract.scalaVersion -ne $lock.scalaVersion -or
      $contract.sbtVersion -ne $lock.sbtVersion -or
      $contract.scriptVersion -ne 3 -or
      $contract.treeVersion -ne $expectedTreeVersion -or
      $contract.propositionBytes -le 0 -or
      $contract.propositionHex -cnotmatch '^[0-9a-f]+$' -or
      ($contract.propositionHex.Length % 2) -ne 0 -or
      ($contract.propositionHex.Length / 2) -ne $contract.propositionBytes
    ) {
      throw "$expectedRole compiler receipt identity is invalid"
    }
    foreach ($field in @(
      'resolvedSourceSha256Hex',
      'propositionSha256Hex',
      'contractIdHex'
    )) {
      if ($contract.$field -cnotmatch '^[0-9a-f]{64}$') {
        throw "$expectedRole compiler receipt $field is invalid"
      }
    }
    foreach ($boundary in $lock.boundaries.PSObject.Properties.Name) {
      Assert-FalseJsonBoolean `
        -Value $contract.$boundary `
        -Label "$expectedRole compiler receipt $boundary"
    }
  }

  Write-Output "compiler_receipt_sha256=$($lock.compilerReceiptSha256Hex)"
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
      Write-Warning "failed to remove compiler worktree $temporaryWorktree"
    }
  }
}
