param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$rootPath = [IO.Path]::GetFullPath($Root)
$records = New-Object 'System.Collections.Generic.List[string]'
$script:entryCount = 0
$script:hasGit = $false

function Assert-Direct([string]$Path, [bool]$Directory) {
    $attributes = [IO.File]::GetAttributes($Path)
    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'V4 physical source contains a reparse point'
    }
    $isDirectory = ($attributes -band [IO.FileAttributes]::Directory) -ne 0
    if ($isDirectory -ne $Directory) {
        throw 'V4 physical source entry kind differs'
    }
}

$cursor = $rootPath
while ($true) {
    Assert-Direct $cursor $true
    $parent = [IO.Directory]::GetParent($cursor)
    if ($null -eq $parent) { break }
    $cursor = $parent.FullName
}

function Scan-Directory([string]$Directory, [string]$Relative, [int]$Depth) {
    if ($Depth -gt 64) { throw 'V4 physical source depth exceeds limit' }
    Assert-Direct $Directory $true
    foreach ($entry in [IO.Directory]::GetFileSystemEntries($Directory)) {
        $script:entryCount++
        if ($script:entryCount -gt 2048) { throw 'V4 physical source entry count exceeds limit' }
        $name = [IO.Path]::GetFileName($entry)
        if ([string]::IsNullOrEmpty($name) -or $name -eq '.' -or $name -eq '..' -or
            $name -match '[\x00-\x1f\x7f]' -or $name.Contains('/')) {
            throw 'V4 physical source contains an unsafe name'
        }
        $attributes = [IO.File]::GetAttributes($entry)
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'V4 physical source contains a reparse point'
        }
        $isDirectory = ($attributes -band [IO.FileAttributes]::Directory) -ne 0
        if ($Relative -eq '' -and $name -eq '.git') {
            if (-not $isDirectory) { throw 'V4 Git metadata root is not a directory' }
            $script:hasGit = $true
        }
        $child = if ($Relative -eq '') { $name } else { $Relative + '/' + $name }
        if ($isDirectory) {
            $records.Add('D' + "`t" + $child)
            Scan-Directory $entry $child ($Depth + 1)
        } else {
            $records.Add('F' + "`t" + $child)
        }
    }
    Assert-Direct $Directory $true
}

Scan-Directory $rootPath '' 0
if (-not $script:hasGit) { throw 'V4 Git metadata root is absent' }
$records.Sort([StringComparer]::Ordinal)
$builder = New-Object System.Text.StringBuilder
foreach ($record in $records) { [void]$builder.Append($record).Append("`n") }
$bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($builder.ToString())
if ($bytes.Length -gt 1048576) { throw 'V4 physical source membership output exceeds limit' }
[Console]::Out.Write([Convert]::ToBase64String($bytes))
