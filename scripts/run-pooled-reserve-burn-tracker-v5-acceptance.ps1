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

$ExpectedSigmaStateCommit =
  'f78deadd668f801e7fae3bc884283f79c6f484fa'
$ExpectedBridgeSourceBaselineCommit =
  'dd88a33263a3f4fa4efdeaf0d3b9480bc1b84113'
$ExpectedToolchainLockSha256 =
  '462c91fcf342428df4d7f2ca147464b009da0b9cd2d6f6c99b2d08dcdb9eb164'
$ExpectedNodeVersion = 'v24.14.0'
$ExpectedNodeExeSha256 =
  '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088'
$ExpectedGitVersion = 'git version 2.54.0.windows.1'
$ExpectedGitLauncherSha256 =
  '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5'
$ExpectedGitRuntimeSha256 =
  'cab4c4eea1d869cf9f7be73868dc9a90ad2df1b1b673e5f8c8714a576c25ea96'
$ExpectedPackageJsonSha256 =
  '4f1e9379c499cd1349f9ba1ef7c3e68cb03d4e1be954fb50ab15e2b3dea182f8'
$ExpectedPackageLockSha256 =
  'ec537e51164c2ae33ffb3e3d4fca407a22ef4d8f58d6fdb00d8c9696e148e230'
$ExpectedTsxCliSha256 =
  '8729ecfb90d9d568939e4190e6f1d3317c946583b7d37a776e0c23a21c021cf8'
$ExpectedWasmAvlJsSha256 =
  '98dbefbf0150b477c7af22d5f9cdfaf925cfb464da08e787b284e17d1a1fd13c'
$ExpectedWasmAvlBinarySha256 =
  'e6fedc505a3904518ab2ff83a5ac6c4af72fb66fc163ff86768280d330a8d487'
$ExpectedWasmAvlPackageSha256 =
  '62601147f9bfe7576b9806b9d7696121cb6f48755468c6982e91d5cb8590acb6'
$ExpectedCompilerSpecSha256 =
  'a16f3c1380873b7efd52f4d3bf340ffcaf70f32325882c845ad7de93729c6d1a'
$ExpectedAcceptanceSpecSha256 =
  '5dab8470e9dc74883391f287dcb5851e1953b41c21e48c4404ea623c2221d066'
$ExpectedContractSourceSha256 =
  'db88ddcacaf01d92d13daa8ac96f234ab6720fceefbf0018e671f41eb26a1d16'
$ExpectedStatementVectorSha256 =
  '3e4773612be260eb6ba484b9a86bbed99cbe72d3077437f5b3802c56a2e58e02'
$ExpectedContractFixtureSha256 =
  'dde5bca1a00c87f0cfd4bbc5f03f3f159f7ae342a554911f37ebe7d2474c81d6'
$ExpectedContextFixtureSha256 =
  '5b18bedc2480a05cf56c6d7e18d34cad3bfb3252fb03b974074e82cab41c9f84'
$ExpectedTrackerBuilderSha256 =
  'dc70dcb372b68f2dab805997315b18a50f753cb60422b0adea381c1903b411b4'
$ExpectedFixtureBuilderSha256 =
  'b8e29a1c784c595dbfe50d9f417be913234ed6adafbe45cf22758e9f5d65ee88'
$ExpectedFixtureScriptSha256 =
  '90c4c832eb9a53f1f2540463e1d7a82a2b43a9eafda78a838f5aa236dce5c942'

$ExpectedRuntimeDirectoryDigests = [ordered]@{
  'relayer/node_modules/tsx' =
    '209dd4ea8e9ba63ecfca50dd9561c2bd085302b405b791158ca7089a84a5166c'
  'relayer/node_modules/esbuild' =
    '249f8de3bd13c6d7690efd9330ad7b05f76f89d661a0922db6c2f19781d72db9'
  'relayer/node_modules/get-tsconfig' =
    'b03d2eafa64dd623660fbc895119a1f0ad38ae38296ecf30a6d545ae7e9a3971'
  'relayer/node_modules/resolve-pkg-maps' =
    '8d08bde1d7e4a3b54a29db6ebad299ee6a338d498321699560687808ec96acff'
  'relayer/node_modules/@esbuild/win32-x64' =
    '80af1cc67e2a9f8c95c462f8bfebd9da3852b02d4c26e687bc211ac6b1763e2f'
  'relayer/node_modules/blakejs' =
    'c779e790ca56b67eca74f4e9ab3f91559f4fdd979a5a48e7e305087c4e4a7fd5'
  'relayer/node_modules/ergo-lib-wasm-nodejs' =
    'b9d73a7523b9eb4728c1b9612442e9727449b72c2b6f4aa8902646a88fb9371f'
}

$BaselineSourceRelativePaths = @(
  'relayer/src/bridge-checkpoint-commitment.ts',
  'relayer/src/bridge-finality-proof.ts',
  'relayer/src/bridge-validity-application-statement-v2.ts',
  'relayer/src/bridge-validity-finality-statement-v2.ts',
  'relayer/src/bridge-validity-tracker-header-context-v1.ts',
  'relayer/src/context-extension-guard.ts',
  'relayer/src/ergo-encoding.ts',
  'relayer/src/ergo-extension-membership.ts',
  'relayer/src/ergo-settlement-core/ergo-encoding.ts',
  'relayer/src/ergo-settlement-core/ergo-extension-membership.ts',
  'relayer/src/ergo-settlement-core/strict-json.ts',
  'relayer/src/peg-in-pooled-reserve-lineage-profile-v4.ts',
  'relayer/src/pooled-reserve-burn-profile-v4.ts',
  'relayer/src/pooled-reserve-burn-profile-v5.ts',
  'relayer/src/pooled-reserve-burn-statement-v4.ts',
  'relayer/src/pooled-reserve-burn-statement-v5.ts',
  'relayer/src/pooled-reserve-mint-reservation-runtime-profile-v4-codec.ts',
  'relayer/src/pooled-reserve-mint-reservation-runtime-profile-v4.ts',
  'relayer/src/profiles/substrate-grandpa-v1/aggregate-finality-proof-limits.ts',
  'relayer/src/profiles/substrate-grandpa-v1/asset-profile.ts',
  'relayer/src/profiles/substrate-grandpa-v1/bridge-checkpoint-commitment.ts',
  'relayer/src/profiles/substrate-grandpa-v1/bridge-finality-proof.ts',
  'relayer/src/profiles/substrate-grandpa-v1/ergo-settlement-policy.ts',
  'relayer/src/profiles/substrate-grandpa-v1/trustless-burn-proof.ts',
  'relayer/src/spv-tracker-validity-v2.ts',
  'relayer/src/strict-json.ts',
  'relayer/src/unsigned-ergo-transaction.ts',
  'relayer/src/validity-application-pooled-reserve-instance-v4.ts',
  'relayer/test-vectors/pooled-reserve-burn-statement-v5.json'
)

$CompilerSpecRelativePath =
  'validity-proof/consumer-jvm/BridgePooledReserveBurnTrackerV5ContractSpec.scala'
$AcceptanceSpecRelativePath =
  'validity-proof/consumer-jvm/BridgePooledReserveBurnTrackerV5AcceptanceSpec.scala'
$ContractSourceRelativePath =
  'contracts/SPVTrackerPooledReserveBurnV5.es'
$StatementVectorRelativePath =
  'relayer/test-vectors/pooled-reserve-burn-statement-v5.json'
$ContractFixtureRelativePath =
  'relayer/test-vectors/pooled-reserve-burn-tracker-contract-v5.json'
$ContextFixtureRelativePath =
  'relayer/test-vectors/pooled-reserve-burn-tracker-context-v5.json'
$TrackerBuilderRelativePath =
  'relayer/src/pooled-reserve-burn-tracker-v5.ts'
$FixtureBuilderRelativePath =
  'relayer/src/pooled-reserve-burn-tracker-v5-fixture.ts'
$FixtureScriptRelativePath =
  'relayer/src/scripts/build-pooled-reserve-burn-tracker-v5-jvm-fixture.ts'
$ToolchainLockRelativePath =
  'validity-proof/consumer-jvm/validity-application-pooled-reserve-compiler-lock-v1.json'
$CompilerSpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgePooledReserveBurnTrackerV5ContractSpec.scala'
$AcceptanceSpecDestination =
  'sc/shared/src/test/scala/sigma/bridge/BridgePooledReserveBurnTrackerV5AcceptanceSpec.scala'
$CompilerSpecClass =
  'sigma.bridge.BridgePooledReserveBurnTrackerV5ContractSpec'
$AcceptanceSpecClass =
  'sigma.bridge.BridgePooledReserveBurnTrackerV5AcceptanceSpec'

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

function Assert-NormalizedAsciiLfHash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Expected,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $bytes = [IO.File]::ReadAllBytes($Path)
  if (
    $bytes.Length -eq 0 -or
    $bytes[0] -eq 0xef -or
    ($bytes | Where-Object { $_ -gt 127 })
  ) {
    throw "$Label must be non-empty BOM-free ASCII"
  }
  $normalized = [Text.Encoding]::ASCII.GetString($bytes).Replace("`r`n", "`n")
  if ($normalized.Contains("`r")) {
    throw "$Label contains a noncanonical carriage return"
  }
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha256.ComputeHash([Text.Encoding]::ASCII.GetBytes($normalized))
  } finally {
    $sha256.Dispose()
  }
  $actual = ($digest | ForEach-Object { $_.ToString('x2') }) -join ''
  if ($actual -ne $Expected) {
    throw "$Label does not match the reviewed normalized LF SHA-256"
  }
}

function Get-DirectoryManifestSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $root = Resolve-RealDirectory -Path $Path -Label $Label
  $files = @(
    Get-ChildItem -LiteralPath $root -Recurse -Force -File |
      ForEach-Object {
        if (
          ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
        ) {
          throw "$Label must not contain reparse-point files"
        }
        [pscustomobject]@{
          RelativePath = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
          Sha256 = Get-Sha256Hex -Path $_.FullName
        }
      } |
      Sort-Object RelativePath
  )
  if ($files.Count -eq 0) {
    throw "$Label must contain at least one regular file"
  }
  $manifest = ($files | ForEach-Object {
    $_.RelativePath + "`0" + $_.Sha256 + "`n"
  }) -join ''
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($manifest))
  } finally {
    $sha256.Dispose()
  }
  return ($digest | ForEach-Object { $_.ToString('x2') }) -join ''
}

function Assert-DirectoryManifestHash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Expected,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($Expected -cnotmatch '^[0-9a-f]{64}$') {
    throw "$Label expected manifest SHA-256 must be 32 lowercase hex bytes"
  }
  if (
    (Get-DirectoryManifestSha256 -Path $Path -Label $Label) -ne $Expected
  ) {
    throw "$Label does not match the reviewed directory manifest SHA-256"
  }
}

function Assert-BaselineSourceClosure {
  param(
    [Parameter(Mandatory = $true)]
    [string]$GitExecutable,

    [Parameter(Mandatory = $true)]
    [string]$BridgeRoot
  )

  $baselineType = (& $GitExecutable -C $BridgeRoot cat-file -t `
    $ExpectedBridgeSourceBaselineCommit 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or $baselineType -ne 'commit') {
    throw 'reviewed bridge source baseline commit is unavailable'
  }
  $prefix = (& $GitExecutable -C $BridgeRoot rev-parse --show-prefix).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($prefix)) {
    throw 'bridge root must be a tracked subdirectory of the reviewed repository'
  }
  $prefix = $prefix.Replace('\', '/')
  foreach ($relativePath in $BaselineSourceRelativePaths) {
    $null = Resolve-RealFile `
      -Path (Join-Path $BridgeRoot $relativePath) `
      -Label "baseline source $relativePath"
    $pathspec = ":(top)$prefix$relativePath"
    & $GitExecutable -C $BridgeRoot diff --quiet `
      $ExpectedBridgeSourceBaselineCommit -- $pathspec
    if ($LASTEXITCODE -ne 0) {
      throw "baseline source $relativePath differs from the reviewed commit"
    }
  }
}

function Assert-ExactAsciiFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [bool]$AllowCarriageReturn = $false
  )

  $item = Get-Item -LiteralPath $Path
  $bytes = [IO.File]::ReadAllBytes($item.FullName)
  if (
    $item.PSIsContainer -or
    (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
    $bytes.Length -eq 0 -or
    $bytes[0] -eq 0xef -or
    ($bytes | Where-Object {
      $_ -gt 127 -or (-not $AllowCarriageReturn -and $_ -eq 13)
    })
  ) {
    throw "$Label does not match the required ASCII line-ending policy"
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
    "-Duser.home=$isolatedUserHome",
    "-Dsbt.global.base=$isolatedSbtGlobalBase",
    "-Dsbt.boot.directory=$isolatedSbtBoot",
    "-Dsbt.ivy.home=$isolatedSbtIvyHome",
    "-Dcoursier.cache=$isolatedCoursierCache",
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
  Get-Command $GitExecutable -CommandType Application -ErrorAction Stop
)[0]
$gitExe = Resolve-RealFile -Path $gitCommand.Source -Label 'Git executable'
$gitInstallRoot = Split-Path -Parent (Split-Path -Parent $gitExe)
$gitRuntimeExe = Resolve-RealFile `
  -Path (Join-Path $gitInstallRoot 'mingw64/bin/git.exe') `
  -Label 'Git runtime executable'

$compilerSpecPath = Resolve-RealFile `
  -Path (Join-Path $bridge $CompilerSpecRelativePath) `
  -Label 'V5 tracker compiler spec'
$acceptanceSpecPath = Resolve-RealFile `
  -Path (Join-Path $bridge $AcceptanceSpecRelativePath) `
  -Label 'V5 tracker acceptance spec'
$contractSourcePath = Resolve-RealFile `
  -Path (Join-Path $bridge $ContractSourceRelativePath) `
  -Label 'V5 tracker source'
$statementVectorPath = Resolve-RealFile `
  -Path (Join-Path $bridge $StatementVectorRelativePath) `
  -Label 'V5 burn statement vector'
$contractFixturePath = Resolve-RealFile `
  -Path (Join-Path $bridge $ContractFixtureRelativePath) `
  -Label 'V5 tracker contract fixture'
$contextFixturePath = Resolve-RealFile `
  -Path (Join-Path $bridge $ContextFixtureRelativePath) `
  -Label 'V5 tracker context fixture'
$trackerBuilderPath = Resolve-RealFile `
  -Path (Join-Path $bridge $TrackerBuilderRelativePath) `
  -Label 'V5 tracker context builder'
$fixtureBuilderPath = Resolve-RealFile `
  -Path (Join-Path $bridge $FixtureBuilderRelativePath) `
  -Label 'V5 tracker fixture builder'
$fixtureScriptPath = Resolve-RealFile `
  -Path (Join-Path $bridge $FixtureScriptRelativePath) `
  -Label 'V5 tracker fixture script'
$toolchainLockPath = Resolve-RealFile `
  -Path (Join-Path $bridge $ToolchainLockRelativePath) `
  -Label 'pooled-reserve compiler toolchain lock'
$tsxCli = Resolve-RealFile `
  -Path (Join-Path $bridge 'relayer/node_modules/tsx/dist/cli.mjs') `
  -Label 'tsx CLI'
$packageJsonPath = Resolve-RealFile `
  -Path (Join-Path $bridge 'relayer/package.json') `
  -Label 'relayer package manifest'
$packageLockPath = Resolve-RealFile `
  -Path (Join-Path $bridge 'relayer/package-lock.json') `
  -Label 'relayer package lock'
$wasmAvlJsPath = Resolve-RealFile `
  -Path (Join-Path $bridge 'wasm-avl/pkg/bridge_avl.js') `
  -Label 'WASM AVL JavaScript runtime'
$wasmAvlBinaryPath = Resolve-RealFile `
  -Path (Join-Path $bridge 'wasm-avl/pkg/bridge_avl_bg.wasm') `
  -Label 'WASM AVL binary'
$wasmAvlPackagePath = Resolve-RealFile `
  -Path (Join-Path $bridge 'wasm-avl/pkg/package.json') `
  -Label 'WASM AVL package manifest'

$reviewedFiles = @(
  @($compilerSpecPath, $ExpectedCompilerSpecSha256, 'compiler spec', $false),
  @($acceptanceSpecPath, $ExpectedAcceptanceSpecSha256, 'acceptance spec', $false),
  @($contractSourcePath, $ExpectedContractSourceSha256, 'contract source', $false),
  @($statementVectorPath, $ExpectedStatementVectorSha256, 'statement vector', $false),
  @($contractFixturePath, $ExpectedContractFixtureSha256, 'contract fixture', $false),
  @($contextFixturePath, $ExpectedContextFixtureSha256, 'context fixture', $false),
  @($trackerBuilderPath, $ExpectedTrackerBuilderSha256, 'tracker builder', $false),
  @($fixtureBuilderPath, $ExpectedFixtureBuilderSha256, 'fixture builder', $false),
  @($fixtureScriptPath, $ExpectedFixtureScriptSha256, 'fixture script', $false)
)
foreach ($entry in $reviewedFiles) {
  Assert-ExactAsciiFile `
    -Path $entry[0] `
    -Label $entry[2] `
    -AllowCarriageReturn $entry[3]
  Assert-Hash -Path $entry[0] -Expected $entry[1] -Label $entry[2]
}

foreach ($entry in @(
  @($toolchainLockPath, 'compiler toolchain lock'),
  @($packageLockPath, 'relayer package lock'),
  @($wasmAvlPackagePath, 'WASM AVL package manifest')
)) {
  Assert-ExactAsciiFile -Path $entry[0] -Label $entry[1]
}
Assert-Hash -Path $toolchainLockPath `
  -Expected $ExpectedToolchainLockSha256 `
  -Label 'compiler toolchain lock'
Assert-Hash -Path $nodeExe `
  -Expected $ExpectedNodeExeSha256 `
  -Label 'Node executable'
Assert-Hash -Path $gitExe `
  -Expected $ExpectedGitLauncherSha256 `
  -Label 'Git launcher executable'
Assert-Hash -Path $gitRuntimeExe `
  -Expected $ExpectedGitRuntimeSha256 `
  -Label 'Git runtime executable'
Assert-NormalizedAsciiLfHash -Path $packageJsonPath `
  -Expected $ExpectedPackageJsonSha256 `
  -Label 'relayer package manifest'
Assert-Hash -Path $packageLockPath `
  -Expected $ExpectedPackageLockSha256 `
  -Label 'relayer package lock'
Assert-Hash -Path $tsxCli `
  -Expected $ExpectedTsxCliSha256 `
  -Label 'tsx CLI'
Assert-Hash -Path $wasmAvlJsPath `
  -Expected $ExpectedWasmAvlJsSha256 `
  -Label 'WASM AVL JavaScript runtime'
Assert-Hash -Path $wasmAvlBinaryPath `
  -Expected $ExpectedWasmAvlBinarySha256 `
  -Label 'WASM AVL binary'
Assert-Hash -Path $wasmAvlPackagePath `
  -Expected $ExpectedWasmAvlPackageSha256 `
  -Label 'WASM AVL package manifest'
foreach ($entry in $ExpectedRuntimeDirectoryDigests.GetEnumerator()) {
  Assert-DirectoryManifestHash `
    -Path (Join-Path $bridge $entry.Key) `
    -Expected $entry.Value `
    -Label $entry.Key
}

$gitVersion = (& $gitExe --version).Trim()
if ($LASTEXITCODE -ne 0 -or $gitVersion -ne $ExpectedGitVersion) {
  throw 'Git executable version differs from the reviewed runtime'
}
Assert-BaselineSourceClosure `
  -GitExecutable $gitExe `
  -BridgeRoot $bridge

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
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $ExpectedNodeVersion) {
  throw 'Node executable version differs from the reviewed runtime'
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
  'CLASSPATH',
  'NODE_OPTIONS',
  'NODE_PATH',
  'ESBUILD_BINARY_PATH',
  'TSX_TSCONFIG_PATH',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM'
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
  ('bridge-pooled-reserve-burn-tracker-v5-' +
    [Guid]::NewGuid().ToString('N'))
$temporaryWorktree = Join-Path $runRoot 'sigmastate'
$generatedContractFixture = Join-Path $runRoot 'contract.json'
$generatedContextFixture = Join-Path $runRoot 'context.json'
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
  $savedCoursierCache = $env:COURSIER_CACHE
  $env:JAVA_HOME = $javaRoot
  $env:PATH = (Join-Path $javaRoot 'bin') + ';' + $savedPath
  $env:COURSIER_CACHE = $isolatedCoursierCache
  Push-Location $temporaryWorktree
  try {
    Invoke-PinnedSpec `
      -SpecClass $CompilerSpecClass `
      -SystemProperties @(
        "-Dbridge.eip0045.pooled.reserve.burn.tracker.root=$bridge",
        "-Dbridge.eip0045.pooled.reserve.burn.tracker.identity.out=$generatedContractFixture"
      ) `
      -Label 'pinned V5 tracker compiler'

    $generatedContractFixture = Resolve-RealFile `
      -Path $generatedContractFixture `
      -Label 'generated V5 tracker contract fixture'
    Assert-ExactAsciiFile `
      -Path $generatedContractFixture `
      -Label 'generated V5 tracker contract fixture'
    Assert-Hash `
      -Path $generatedContractFixture `
      -Expected $ExpectedContractFixtureSha256 `
      -Label 'generated V5 tracker contract fixture'

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
      throw "V5 tracker context generation failed with exit code $fixtureExitCode"
    }
    $generatedContextFixture = Resolve-RealFile `
      -Path $generatedContextFixture `
      -Label 'generated V5 tracker context fixture'
    Assert-ExactAsciiFile `
      -Path $generatedContextFixture `
      -Label 'generated V5 tracker context fixture'
    Assert-Hash `
      -Path $generatedContextFixture `
      -Expected $ExpectedContextFixtureSha256 `
      -Label 'generated V5 tracker context fixture'

    Invoke-PinnedSpec `
      -SpecClass $AcceptanceSpecClass `
      -SystemProperties @(
        "-Dbridge.eip0045.pooled.reserve.burn.tracker.fixture=$generatedContextFixture"
      ) `
      -Label 'pinned V5 tracker acceptance'
  } finally {
    Pop-Location
    $env:JAVA_HOME = $savedJavaHome
    $env:PATH = $savedPath
    $env:COURSIER_CACHE = $savedCoursierCache
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
