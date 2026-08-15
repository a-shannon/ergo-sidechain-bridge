param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionFields,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$MiningTarget,

  [string]$MiningMnemonicEnvironmentVariable = "",

  [ValidateSet("primary", "witness")]
  [string]$NodeRole = "primary",

  [ValidateSet("fast", "standard")]
  [string]$DevnetFeePolicy = "fast",

  [string]$ErgoSourcePath = "",
  [string]$DefaultConfigResource = "application.conf",
  [string]$BaseConfigResource = "devnet.conf",
  [string]$ConfigResource = "",
  [string]$ApiKeyHash = "324dcf027dd4a30a932c441f365a25e86b173defa4b8e58948253471b81b72cf",
  [string]$DataDir = "",
  [switch]$ResumeExistingDataDir,
  [switch]$NonMiningResume,
  [string]$SbtPath = ""
)

$ErrorActionPreference = "Stop"
$BridgeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Assert-NoReparsePointInPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $FullPath = [System.IO.Path]::GetFullPath($Path)
  $PathRoot = [System.IO.Path]::GetPathRoot($FullPath)
  $CurrentPath = $PathRoot
  $RelativePath = $FullPath.Substring($PathRoot.Length)
  $Segments = $RelativePath.Split(
    [char[]]@(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    ),
    [System.StringSplitOptions]::RemoveEmptyEntries
  )

  foreach ($Segment in $Segments) {
    $CurrentPath = Join-Path $CurrentPath $Segment
    $Item = Get-Item -LiteralPath $CurrentPath -Force -ErrorAction SilentlyContinue
    if ($null -eq $Item) {
      continue
    }
    if (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label must not contain a reparse point: $CurrentPath"
    }
    if (-not $Item.PSIsContainer -and $CurrentPath -ne $FullPath) {
      throw "$Label contains a non-directory path component: $CurrentPath"
    }
  }
}

function Assert-NoReparsePointInTree {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Assert-NoReparsePointInPath -Path $Path -Label $Label
  $RootItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (-not $RootItem.PSIsContainer) {
    throw "$Label must be a directory: $Path"
  }

  $Pending = [System.Collections.Generic.Stack[string]]::new()
  $Pending.Push($RootItem.FullName)
  while ($Pending.Count -gt 0) {
    $CurrentPath = $Pending.Pop()
    foreach ($Child in @(Get-ChildItem -LiteralPath $CurrentPath -Force -ErrorAction Stop)) {
      if (($Child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "$Label must not contain a reparse point: $($Child.FullName)"
      }
      if ($Child.PSIsContainer) {
        $Pending.Push($Child.FullName)
      }
    }
  }
}

function Assert-DataDirIsFresh {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $ExistingItem = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($null -ne $ExistingItem -or
      [System.IO.Directory]::Exists($Path) -or
      [System.IO.File]::Exists($Path)) {
    throw "DataDir must not already exist: $Path"
  }
  Assert-NoReparsePointInPath -Path $Path -Label "DataDir"
}

function Assert-DataDirIsResumable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $ExistingItem = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($null -eq $ExistingItem -or -not $ExistingItem.PSIsContainer) {
    throw "ResumeExistingDataDir requires an existing DataDir directory: $Path"
  }
  Assert-NoReparsePointInPath -Path $Path -Label "DataDir"
  Assert-NoReparsePointInTree -Path $Path -Label "DataDir"
}

if ($MiningTarget -notmatch '^(02|03)[0-9A-Fa-f]{64}$') {
  throw "MiningTarget must be an exact compressed secp256k1 public key (02 or 03 plus 64 hex characters)"
}

if ($NonMiningResume -and -not $ResumeExistingDataDir) {
  throw "NonMiningResume requires ResumeExistingDataDir"
}
if ($NonMiningResume -and
    -not [string]::IsNullOrWhiteSpace($MiningMnemonicEnvironmentVariable)) {
  throw "NonMiningResume forbids a mining mnemonic environment variable"
}

if (-not [string]::IsNullOrWhiteSpace($MiningMnemonicEnvironmentVariable)) {
  if ($MiningMnemonicEnvironmentVariable -notmatch '^[A-Z][A-Z0-9_]{0,63}$') {
    throw "MiningMnemonicEnvironmentVariable must be an uppercase environment-variable name"
  }
  if ([string]::IsNullOrWhiteSpace(
      [Environment]::GetEnvironmentVariable(
        $MiningMnemonicEnvironmentVariable,
        [EnvironmentVariableTarget]::Process
      )
    )) {
    throw "MiningMnemonicEnvironmentVariable must name a non-empty process environment variable"
  }
}

if ($ApiKeyHash -notmatch '^[0-9A-Fa-f]{64}$') {
  throw "ApiKeyHash must be exactly 64 hexadecimal characters"
}

if ([string]::IsNullOrWhiteSpace($ConfigResource)) {
  $ConfigResource = if ($DevnetFeePolicy -eq "standard") {
    "devnet.conf"
  } else {
    "node1/application.conf"
  }
}
if ($DevnetFeePolicy -eq "standard" -and
    ($DefaultConfigResource -ne "application.conf" -or
     $BaseConfigResource -ne "devnet.conf" -or
     $ConfigResource -ne "devnet.conf")) {
  throw "Standard devnet fee policy requires the canonical application.conf and devnet.conf resources"
}

foreach ($Resource in @($DefaultConfigResource, $BaseConfigResource, $ConfigResource)) {
  if ([string]::IsNullOrWhiteSpace($Resource) -or
      $Resource -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$' -or
      $Resource.EndsWith('/') -or
      $Resource -match '(^|/)\.\.?(?:/|$)') {
    throw "Config resources must be safe classpath-relative resource names"
  }
}

if ([string]::IsNullOrWhiteSpace($ErgoSourcePath)) {
  $ErgoSourcePath = [System.IO.Path]::GetFullPath(
    (Join-Path $BridgeRoot ".source-cache\ergo-node")
  )
}

if (!(Test-Path -LiteralPath $ErgoSourcePath)) {
  throw "Ergo source path not found: $ErgoSourcePath"
}

if ([string]::IsNullOrWhiteSpace($SbtPath)) {
  $SbtCommand = Get-Command sbt -ErrorAction SilentlyContinue
  if ($null -eq $SbtCommand) {
    throw "sbt not found on PATH"
  }
  $SbtPath = $SbtCommand.Source
} elseif (!(Test-Path -LiteralPath $SbtPath)) {
  throw "Configured sbt executable not found"
}

$RuntimeRoot = [System.IO.Path]::GetFullPath(
  (Join-Path ([System.IO.Path]::GetTempPath()) "ergo-sidechain-bridge")
)
Assert-NoReparsePointInPath -Path $RuntimeRoot -Label "Runtime root"
$RuntimeRootItem = Get-Item -LiteralPath $RuntimeRoot -Force -ErrorAction SilentlyContinue
if ($null -eq $RuntimeRootItem) {
  New-Item -ItemType Directory -Path $RuntimeRoot -ErrorAction Stop | Out-Null
} elseif (-not $RuntimeRootItem.PSIsContainer) {
  throw "Runtime root must be a directory: $RuntimeRoot"
}
Assert-NoReparsePointInPath -Path $RuntimeRoot -Label "Runtime root"

$SessionId = [Guid]::NewGuid().ToString("N")
if ($ResumeExistingDataDir -and [string]::IsNullOrWhiteSpace($DataDir)) {
  throw "ResumeExistingDataDir requires an explicit DataDir"
}
if ([string]::IsNullOrWhiteSpace($DataDir)) {
  $DataDir = Join-Path $RuntimeRoot "$(if ($NodeRole -eq 'primary') { 'node1' } else { 'node2' })-$SessionId"
} elseif (-not [System.IO.Path]::IsPathRooted($DataDir)) {
  $DataDir = Join-Path $RuntimeRoot $DataDir
}

$DataDir = [System.IO.Path]::GetFullPath($DataDir)
if ($DataDir -match '[\r\n"]' -or
    [System.Management.Automation.WildcardPattern]::ContainsWildcardCharacters($DataDir)) {
  throw "DataDir must not contain quotes, newlines, or wildcard characters"
}
$RuntimeRootPrefix = $RuntimeRoot.TrimEnd(
  [char[]]@(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
) + [System.IO.Path]::DirectorySeparatorChar
if (-not $DataDir.StartsWith(
    $RuntimeRootPrefix,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
  throw "DataDir must be a strict descendant of the dedicated runtime root: $RuntimeRoot"
}
if ($ResumeExistingDataDir) {
  Assert-DataDirIsResumable -Path $DataDir
} else {
  Assert-DataDirIsFresh -Path $DataDir
}
$DataDirForConfig = $DataDir.Replace("\", "/")

$RelayerPath = Join-Path $BridgeRoot "relayer"
Push-Location $RelayerPath
try {
  & npm.cmd run sources:verify -- --ergo-only --ergo-source $ErgoSourcePath
  if ($LASTEXITCODE -ne 0) {
    throw "Consensus source baseline verification failed"
  }
} finally {
  Pop-Location
}

if ($ResumeExistingDataDir) {
  Assert-DataDirIsResumable -Path $DataDir
} else {
  Assert-DataDirIsFresh -Path $DataDir
  New-Item -ItemType Directory -Path $DataDir -ErrorAction Stop | Out-Null
}
Assert-NoReparsePointInPath -Path $DataDir -Label "DataDir"
Assert-NoReparsePointInTree -Path $DataDir -Label "DataDir"
$LogDir = Join-Path $DataDir "log"
$LogDirItem = Get-Item -LiteralPath $LogDir -Force -ErrorAction SilentlyContinue
if ($null -eq $LogDirItem) {
  New-Item -ItemType Directory -Path $LogDir -ErrorAction Stop | Out-Null
} elseif (-not $LogDirItem.PSIsContainer) {
  throw "Log directory path must be a directory: $LogDir"
}
Assert-NoReparsePointInPath -Path $LogDir -Label "Log directory"
$LogbackConfigPath = Join-Path $DataDir "logback.xml"
Assert-NoReparsePointInPath -Path $LogbackConfigPath -Label "Logback config"
$LogDirForConfig = [System.Security.SecurityElement]::Escape(
  $LogDir.Replace("\", "/")
)
$logbackLines = @(
  '<?xml version="1.0" encoding="UTF-8"?>'
  '<configuration>'
  '  <contextListener class="ch.qos.logback.classic.jul.LevelChangePropagator"/>'
  '  <property name="default.pattern" value="%d{HH:mm:ss.SSS} %-5level [%.25thread] %logger{26} - %msg%n"/>'
  '  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">'
  '    <encoder><pattern>${default.pattern}</pattern></encoder>'
  '  </appender>'
  '  <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">'
  "    <file>$LogDirForConfig/ergo.log</file>"
  '    <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">'
  "      <fileNamePattern>$LogDirForConfig/ergo-%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>"
  '      <maxHistory>7</maxHistory>'
  '      <maxFileSize>500MB</maxFileSize>'
  '      <totalSizeCap>1GB</totalSizeCap>'
  '    </rollingPolicy>'
  '    <encoder><pattern>${default.pattern}</pattern></encoder>'
  '  </appender>'
  '  <root level="INFO">'
  '    <appender-ref ref="STDOUT"/>'
  '    <appender-ref ref="FILE"/>'
  '  </root>'
  '</configuration>'
)
$logbackLines -join "`n" | Set-Content -LiteralPath $LogbackConfigPath -Encoding ASCII

# Build merged config with overrides injected by the runner.
# This avoids editing ergo-source/src/main/resources/ directly.
$MergedConfigPath = Join-Path $RuntimeRoot "ergo-patched-$NodeRole-$SessionId.conf"
$configLines = @(
  "include classpath(""$DefaultConfigResource"")"
  "include classpath(""$BaseConfigResource"")"
  "include classpath(""$ConfigResource"")"
)

$configLines += "ergo.node.miningPubKeyHex = ""$MiningTarget"""
if (-not [string]::IsNullOrWhiteSpace($MiningMnemonicEnvironmentVariable)) {
  # The generated config contains only an environment reference. The synthetic
  # devnet mnemonic remains outside command arguments, files, and console output.
  $configLines += 'ergo.wallet.testMnemonic = ${?' +
    $MiningMnemonicEnvironmentVariable + '}'
  $configLines += "ergo.wallet.testKeysQty = 1"
}

# Keep all configurable includes and values before these mandatory final
# overrides so classpath content cannot relax runtime or network isolation.
$configLines += @(
  "scorex.restApi.apiKeyHash = ""$ApiKeyHash"""
)
if ($NodeRole -eq "primary") {
  $configLines += @(
    "scorex.restApi.bindAddress = ""127.0.0.1:9051"""
    "scorex.network.bindAddress = ""127.0.0.1:9021"""
    "scorex.network.knownPeers = []"
    "ergo.node.mining = $(if ($NonMiningResume) { 'false' } else { 'true' })"
    "ergo.node.offlineGeneration = $(if ($NonMiningResume) { 'false' } else { 'true' })"
  )
} else {
  $configLines += @(
    "scorex.restApi.bindAddress = ""127.0.0.1:9052"""
    "scorex.network.bindAddress = ""127.0.0.1:9022"""
    "scorex.network.knownPeers = [""127.0.0.1:9021""]"
    "ergo.node.mining = false"
    "ergo.node.offlineGeneration = false"
  )
}
$configLines += @(
  "scorex.network.upnpEnabled = false"
  "ergo.directory = ""$DataDirForConfig"""
  "ergo.node.extraIndex = true"
  "ergo.node.useExternalMiner = false"
)
if ($DevnetFeePolicy -eq "standard") {
  # Exercise the standard 720-block fee proposition and minimum fee while
  # retaining the protocol-current, fully isolated devnet runtime.
  $configLines += @(
    "ergo.chain.monetary.minerRewardDelay = 720"
    "ergo.node.minimalFeeAmount = 1000000"
  )
} else {
  # node1/application.conf uses minerRewardDelay=1. Its fee proposition is
  # intentionally incompatible with the standard 720-block fee output.
  $configLines += "ergo.node.minimalFeeAmount = 0"
}

$configLines -join "`n" | Set-Content -LiteralPath $MergedConfigPath -Encoding ASCII

$env:ERGO_SIDECHAIN_EXTENSION_FIELDS = $ExtensionFields

Write-Host "Starting patched Ergo node"
Write-Host "  source: $ErgoSourcePath"
Write-Host "  node role: $NodeRole"
Write-Host "  devnet fee policy: $DevnetFeePolicy"
Write-Host "  default config: $DefaultConfigResource"
Write-Host "  base config: $BaseConfigResource"
Write-Host "  node config: $ConfigResource"
Write-Host "  merged config: $MergedConfigPath"
Write-Host "  data dir: $DataDir"
Write-Host "  data mode: $(if ($ResumeExistingDataDir) { 'explicit resume' } else { 'fresh session' })"
Write-Host "  execution mode: $(if ($NonMiningResume) { 'non-mining resume' } else { 'normal role policy' })"
if ($NonMiningResume) {
  Write-Host "  resume role binding: caller-selected; verify chain identity through the observer"
}
Write-Host "  network isolation: loopback REST/P2P, no known peers, UPnP disabled"
Write-Host "  api key hash: $ApiKeyHash"
Write-Host "  extension fields: $ExtensionFields"
Write-Host "  mining target: $MiningTarget"

# Recheck the complete tree after creating runtime files and immediately before
# transferring control to sbt. Existing session state must remain contained.
Assert-NoReparsePointInTree -Path $DataDir -Label "DataDir"

Push-Location $ErgoSourcePath
try {
  # sbt.bat's Windows argument parser is sensitive to nested quotes. Passing
  # through cmd.exe with doubled quotes keeps the Scala string literal intact.
  $ConfigFileForJvm = $MergedConfigPath.Replace("\", "/")
  $LogbackConfigForJvm = $LogbackConfigPath.Replace("\", "/")
  $ConfigJvmOption = "-Dconfig.file=$ConfigFileForJvm"
  $LogbackJvmOption = "-Dlogback.configurationFile=$LogbackConfigForJvm"
  $sbtCommand = "`"$SbtPath`" `"set run / javaOptions := `"`"$ConfigJvmOption`"`" :: `"`"$LogbackJvmOption`"`" :: Nil`" `"runMain org.ergoplatform.ErgoApp`""
  & cmd.exe /d /s /c $sbtCommand
} finally {
  Pop-Location
  Remove-Item -LiteralPath $MergedConfigPath -Force -ErrorAction SilentlyContinue
}
