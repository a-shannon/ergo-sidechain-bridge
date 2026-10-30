param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][int]$MaxEntries,
    [Parameter(Mandatory = $true)][int]$MaxMembershipBytes
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($MaxEntries -le 0 -or $MaxEntries -gt 20000 -or
    $MaxMembershipBytes -le 0 -or $MaxMembershipBytes -gt 4194304) {
    throw 'V4 build input inspector caps are invalid'
}
$rootPath = [IO.Path]::GetFullPath($Root)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$records = New-Object 'System.Collections.Generic.List[string]'
$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$script:entryCount = 0
$script:recordBytes = 0

function Assert-Direct([string]$Path, [bool]$Directory) {
    $attributes = [IO.File]::GetAttributes($Path)
    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        ((($attributes -band [IO.FileAttributes]::Directory) -ne 0) -ne $Directory)) {
        throw 'V4 build input entry is indirect or has the wrong kind'
    }
}

$cursor = $rootPath
while ($true) {
    Assert-Direct $cursor $true
    $parent = [IO.Directory]::GetParent($cursor)
    if ($null -eq $parent) { break }
    $cursor = $parent.FullName
}

function Add-Record([string]$Record, [string]$Relative) {
    $script:entryCount++
    if ($script:entryCount -gt $MaxEntries -or -not $seen.Add($Relative)) {
        throw 'V4 build input membership count or case identity differs'
    }
    $script:recordBytes += $utf8.GetByteCount($Record) + 1
    if ($script:recordBytes -gt $MaxMembershipBytes) {
        throw 'V4 build input membership byte cap exceeded'
    }
    $records.Add($Record)
}

function Scan-Directory([string]$Directory, [string]$Relative, [int]$Depth) {
    if ($Depth -gt 64) { throw 'V4 build input depth cap exceeded' }
    Assert-Direct $Directory $true
    foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($Directory)) {
        $name = [IO.Path]::GetFileName($entry)
        if ([string]::IsNullOrEmpty($name) -or $name -eq '.' -or $name -eq '..' -or
            $name -notmatch '^[\x21-\x7e]+$' -or $name -match '[<>:"|?*\\/]' -or
            $name.EndsWith('.') -or $name.EndsWith(' ') -or
            $name -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)') {
            throw 'V4 build input contains an unsafe name'
        }
        $child = if ($Relative -eq '') { $name } else { $Relative + '/' + $name }
        $attributes = [IO.File]::GetAttributes($entry)
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'V4 build input contains a reparse point'
        }
        if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
            Add-Record ('D' + "`t" + $child) $child
            Scan-Directory $entry $child ($Depth + 1)
        } else {
            Assert-Direct $entry $false
            Add-Record ('F' + "`t" + $child) $child
        }
    }
    Assert-Direct $Directory $true
}

Scan-Directory $rootPath '' 0
$records.Sort([StringComparer]::Ordinal)
$builder = New-Object System.Text.StringBuilder
foreach ($record in $records) { [void]$builder.Append($record).Append("`n") }
$bytes = $utf8.GetBytes($builder.ToString())
if ($bytes.Length -ne $script:recordBytes -or $bytes.Length -gt $MaxMembershipBytes) {
    throw 'V4 build input membership framing differs'
}
[Console]::Out.Write([Convert]::ToBase64String($bytes))
