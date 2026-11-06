[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$FixturePath,
  [Parameter(Mandatory = $true)][string]$ExpectedFixtureSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedProducerSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedVerifierSha256,
  [Parameter(Mandatory = $true)][string]$NodeExecutable,
  [Parameter(Mandatory = $true)][string]$JavaHome,
  [Parameter(Mandatory = $true)][string]$OutputRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$bridgeRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$lockPath = Join-Path $bridgeRoot 'sources/substrate-federated-tracker-compiler-lock-v1.json'
$producerPath = Join-Path $bridgeRoot 'relayer/src/substrate-federated-native-withdrawal-continuation-v1.test.ts'
$verifierPath = Join-Path $bridgeRoot 'relayer/tools/native-continuation-predicate-check/ExactNativeContinuationPredicateCheck.java'

function Assert-DirectPath([string]$Path, [bool]$Directory = $false) {
  $full = [IO.Path]::GetFullPath($Path)
  $entry = Get-Item -LiteralPath $full -Force
  if ($entry.PSIsContainer -ne $Directory) { throw 'Unexpected path type' }
  $cursor = if ($Directory) { [IO.DirectoryInfo]::new($full) } else { [IO.FileInfo]::new($full).Directory }
  if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Indirect path refused' }
  while ($null -ne $cursor) {
    if (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Indirect ancestry refused' }
    $cursor = $cursor.Parent
  }
  return $full
}

function Get-HexSha([string]$Path) {
  return (Get-FileHash -LiteralPath (Assert-DirectPath $Path) -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-Pin([string]$Path, [string]$Expected) {
  if ($Expected -cnotmatch '^[0-9a-f]{64}$' -or (Get-HexSha $Path) -cne $Expected) {
    throw 'Reviewed input SHA-256 mismatch'
  }
}

function Get-TextSha([string]$Value) {
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData(
    [Text.Encoding]::UTF8.GetBytes($Value))).ToLowerInvariant()
}

function Get-DirectorySha([string]$Root) {
  $rootFull = Assert-DirectPath $Root $true
  $pending = [Collections.Generic.Stack[string]]::new()
  $records = [Collections.Generic.List[string]]::new()
  $pending.Push($rootFull)
  while ($pending.Count -gt 0) {
    foreach ($entry in [IO.DirectoryInfo]::new($pending.Pop()).EnumerateFileSystemInfos()) {
      if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Indirect runtime entry refused' }
      if ($entry -is [IO.DirectoryInfo]) { $pending.Push($entry.FullName) }
      elseif ($entry -is [IO.FileInfo]) {
        $name = [IO.Path]::GetRelativePath($rootFull, $entry.FullName).Replace('\', '/')
        $records.Add($name + ':' + (Get-HexSha $entry.FullName))
      } else { throw 'Unsupported runtime entry' }
    }
  }
  if ($records.Count -eq 0) { throw 'Runtime directory has no files' }
  $records.Sort([StringComparer]::Ordinal)
  return Get-TextSha ([string]::Join("`n", $records))
}

Assert-Pin $lockPath '441c518aabefd19ddeee102a2cf403152b3c641fa0ea970f35a707d3f4d47583'
$lock = [IO.File]::ReadAllText($lockPath) | ConvertFrom-Json
$node = Assert-DirectPath $NodeExecutable
Assert-Pin $node $lock.nodeExecutableSha256
Assert-Pin $producerPath $ExpectedProducerSha256
Assert-Pin $verifierPath $ExpectedVerifierSha256
$fixture = Assert-DirectPath $FixturePath
if ((Get-Item -LiteralPath $fixture).Length -gt 1MB) { throw 'Fixture exceeds 1 MiB' }
Assert-Pin $fixture $ExpectedFixtureSha256
$javaRoot = Assert-DirectPath $JavaHome $true
$java = Join-Path $javaRoot 'bin/java.exe'
$javac = Join-Path $javaRoot 'bin/javac.exe'
Assert-Pin $java $lock.javaExecutableSha256
Assert-Pin $javac $lock.javacExecutableSha256
if ((Get-DirectorySha $javaRoot) -cne $lock.javaHomeSha256) { throw 'Java home differs from locked runtime' }

$classpath = [Collections.Generic.List[string]]::new()
$classpathRecords = [Collections.Generic.List[string]]::new()
$dependencyRoot = Assert-DirectPath (Join-Path $bridgeRoot $lock.dependencyRootPath) $true
for ($index = 0; $index -lt $lock.dependencyClasspath.Count; $index++) {
  $dependency = $lock.dependencyClasspath[$index]
  if ($dependency.name -cnotmatch '^[0-9]{3}-[A-Za-z0-9_.-]+\.jar$') { throw 'Unexpected dependency name' }
  $path = Join-Path $dependencyRoot $dependency.name
  Assert-Pin $path $dependency.sha256
  $classpath.Add($path)
  $classpathRecords.Add("$index`tfile`t$($dependency.name)`t$($dependency.sha256)")
}
if ((Get-TextSha ([string]::Join("`n", $classpathRecords))) -cne $lock.dependencyClasspathSha256) {
  throw 'Dependency classpath differs from locked runtime'
}
foreach ($name in (@($lock.forbiddenChildEnvironmentOverrides) + @($lock.forbiddenParentEnvironmentOverrides))) {
  if ($null -ne [Environment]::GetEnvironmentVariable($name)) { throw 'Java environment override refused' }
}

$output = [IO.Path]::GetFullPath($OutputRoot)
if ($output.Equals($bridgeRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $output.StartsWith($bridgeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Generated output must be outside the source checkout'
}
$parent = Assert-DirectPath ([IO.Path]::GetDirectoryName($output)) $true
if (Test-Path -LiteralPath $output) { throw 'Output root must be entirely fresh' }
if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($output)).AvailableFreeSpace -lt 10GB) { throw 'Insufficient free space' }
$classes = Join-Path $output 'classes'
$temp = $parent
$childWorkingDirectory = $parent
$snapshot = Join-Path $output 'ExactNativeContinuationPredicateCheck.java'

function Invoke-BoundedChild([string]$Executable, [string[]]$Arguments) {
  $start = [Diagnostics.ProcessStartInfo]::new($Executable)
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.WorkingDirectory = $childWorkingDirectory
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.Environment.Clear()
  $start.Environment['PATH'] = Join-Path $javaRoot 'bin'
  $start.Environment['JAVA_HOME'] = $javaRoot
  $start.Environment['SystemRoot'] = [Environment]::GetEnvironmentVariable('SystemRoot')
  $start.Environment['TEMP'] = $temp
  $start.Environment['TMP'] = $temp
  foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  try {
    if (-not $process.Start()) { throw 'Java child did not start' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(60000)) {
      $process.Kill($true)
      $process.WaitForExit()
      throw 'Local JVM check exceeded its 60-second child limit'
    }
    $text = $stdout.GetAwaiter().GetResult()
    $errorText = $stderr.GetAwaiter().GetResult()
    if ($text.Length + $errorText.Length -gt 32768) { throw 'Java child output exceeds limit' }
    if ($process.ExitCode -ne 0) { throw "Local predicate check failed: $errorText" }
    if ($text.Length -gt 0) { Write-Output $text.TrimEnd() }
  } finally { $process.Dispose() }
}

$dependencies = [string]::Join([IO.Path]::PathSeparator, $classpath)
$fixtureGate = @'
const fs = require('node:fs');
const crypto = require('node:crypto');
const file = process.argv[1], expected = process.argv[2];
const direct = fs.lstatSync(file, {bigint: true});
if (!direct.isFile() || direct.isSymbolicLink() || direct.nlink !== 1n || direct.size > 1048576n) throw Error('fixture:direct-file');
const fd = fs.openSync(file, 'r');
try {
  const before = fs.fstatSync(fd, {bigint: true});
  const bytes = fs.readFileSync(fd);
  const after = fs.fstatSync(fd, {bigint: true});
  for (const key of ['dev','ino','nlink','size','mtimeNs','ctimeNs']) {
    if (direct[key] !== before[key] || before[key] !== after[key]) throw Error('fixture:identity-drift');
  }
  if (bytes.length > 1048576 || crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('fixture:digest');
  console.log('PASS fixture-single-link-stable-digest');
} finally { fs.closeSync(fd); }
'@
Invoke-BoundedChild $node @('-e', $fixtureGate, $fixture, $ExpectedFixtureSha256)
if (Test-Path -LiteralPath $output) { throw 'Output root must be entirely fresh' }
[IO.Directory]::CreateDirectory($output) | Out-Null
$temp = Join-Path $output 'temp'
$childWorkingDirectory = $output
[IO.Directory]::CreateDirectory($classes) | Out-Null
[IO.Directory]::CreateDirectory($temp) | Out-Null
[IO.File]::Copy($verifierPath, $snapshot, $false)
Assert-Pin $snapshot $ExpectedVerifierSha256
Invoke-BoundedChild $javac (@($lock.javacArguments) + @('-classpath', $dependencies, '-d', $classes, $snapshot))
$runtimeClasspath = $classes + [IO.Path]::PathSeparator + $dependencies
Invoke-BoundedChild $java @('-cp', $runtimeClasspath, 'ExactNativeContinuationPredicateCheck', '--self-test', $fixture, $ExpectedFixtureSha256)
Invoke-BoundedChild $java @('-cp', $runtimeClasspath, 'ExactNativeContinuationPredicateCheck', $fixture, $ExpectedFixtureSha256)
Invoke-BoundedChild $node @('-e', $fixtureGate, $fixture, $ExpectedFixtureSha256)

Assert-Pin $fixture $ExpectedFixtureSha256
Assert-Pin $producerPath $ExpectedProducerSha256
Assert-Pin $verifierPath $ExpectedVerifierSha256
Assert-Pin $snapshot $ExpectedVerifierSha256
Assert-Pin $node $lock.nodeExecutableSha256
Assert-Pin $lockPath '441c518aabefd19ddeee102a2cf403152b3c641fa0ea970f35a707d3f4d47583'
if ((Get-DirectorySha $javaRoot) -cne $lock.javaHomeSha256) { throw 'Java runtime changed during verification' }
foreach ($dependency in $lock.dependencyClasspath) {
  Assert-Pin (Join-Path $dependencyRoot $dependency.name) $dependency.sha256
}
Write-Output ('PASS fresh-classes-sha256=' + (Get-DirectorySha $classes) + ' scope=offline-protected-predicates')
