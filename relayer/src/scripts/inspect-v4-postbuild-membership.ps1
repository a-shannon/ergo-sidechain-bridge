param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][int]$MaxEntries,
    [Parameter(Mandatory = $true)][int]$MaxMembershipBytes
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($MaxEntries -le 0 -or $MaxMembershipBytes -le 0) {
    throw 'V4 post-build inspection requires positive caller caps'
}
$rootPath = [IO.Path]::GetFullPath($Root)
if ($rootPath -cnotmatch '^[A-Za-z]:\\') {
    throw 'V4 inspection requires a local drive root'
}
$physicalRoot = '\\?\' + $rootPath
$utf8 = New-Object System.Text.UTF8Encoding($false)
$records = New-Object 'System.Collections.Generic.List[string]'
$script:entryCount = 0
$script:recordBytes = 0
$script:hasGit = $false

function Assert-Direct([string]$Path, [bool]$Directory) {
    $attributes = [IO.File]::GetAttributes($Path)
    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'V4 post-build tree contains a reparse point'
    }
    if ((($attributes -band [IO.FileAttributes]::Directory) -ne 0) -ne $Directory) {
        throw 'V4 post-build entry kind differs'
    }
}

$cursor = $rootPath
while ($true) {
    Assert-Direct $cursor $true
    $parent = [IO.Directory]::GetParent($cursor)
    if ($null -eq $parent) { break }
    $cursor = $parent.FullName
}

function Add-Record([string]$Record) {
    $script:entryCount++
    if ($script:entryCount -gt $MaxEntries) {
        throw 'V4 post-build entry count exceeds caller cap'
    }
    $script:recordBytes += $utf8.GetByteCount($Record) + 1
    if ($script:recordBytes -gt $MaxMembershipBytes) {
        throw 'V4 post-build membership exceeds caller cap'
    }
    $records.Add($Record)
}

function Scan-Directory([string]$Directory, [string]$Relative, [int]$Depth) {
    if ($Depth -gt 64) { throw 'V4 post-build depth exceeds limit' }
    Assert-Direct $Directory $true
    foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($Directory)) {
        $name = [IO.Path]::GetFileName($entry)
        if ([string]::IsNullOrEmpty($name) -or $name -eq '.' -or $name -eq '..' -or
            $name -match '[\x00-\x1f\x7f:]' -or $name.Contains('/') -or
            $name.Contains('\') -or $name.EndsWith('.') -or $name.EndsWith(' ')) {
            throw 'V4 post-build tree contains an unsafe name'
        }
        $attributes = [IO.File]::GetAttributes($entry)
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'V4 post-build tree contains a reparse point'
        }
        $isDirectory = ($attributes -band [IO.FileAttributes]::Directory) -ne 0
        $child = if ($Relative -eq '') { $name } else { $Relative + '/' + $name }
        if ($Relative -eq '' -and $name -eq '.git') {
            if (-not $isDirectory -or $script:hasGit) {
                throw 'V4 Git metadata root differs'
            }
            $script:hasGit = $true
            Add-Record ('D' + "`t" + $child)
            continue
        }
        if ($child -eq '.git' -or $child.StartsWith('.git/')) {
            throw 'V4 Git metadata path differs'
        }
        if ($isDirectory) {
            Add-Record ('D' + "`t" + $child)
            Scan-Directory $entry $child ($Depth + 1)
        } else {
            Add-Record ('F' + "`t" + $child)
        }
    }
    Assert-Direct $Directory $true
}

Scan-Directory $physicalRoot '' 0
if (-not $script:hasGit) { throw 'V4 Git metadata root is absent' }
$records.Sort([StringComparer]::Ordinal)
$builder = New-Object System.Text.StringBuilder
foreach ($record in $records) { [void]$builder.Append($record).Append("`n") }
$bytes = $utf8.GetBytes($builder.ToString())
if ($bytes.Length -ne $script:recordBytes -or $bytes.Length -gt $MaxMembershipBytes) {
    throw 'V4 post-build membership byte count differs'
}
[Console]::Out.Write([Convert]::ToBase64String($bytes))
