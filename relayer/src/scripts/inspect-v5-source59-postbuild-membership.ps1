$ErrorActionPreference = 'Stop'
$script:failureCode = 'OTHER'
function Refuse([string]$Code) {
    if (@('INPUT','REPARSE','KIND','ENTRY_CAP','MEMBERSHIP_CAP',
          'DEPTH','NAME','GIT') -ccontains $Code) {
        $script:failureCode = $Code
    } else {
        $script:failureCode = 'OTHER'
    }
    throw 'fixed inspection refusal'
}

try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    if ($args.Count -ne 6 -or $args[0] -cne '-Root' -or
        $args[2] -cne '-MaxEntries' -or
        $args[4] -cne '-MaxMembershipBytes') { Refuse 'INPUT' }
    $Root = [string]$args[1]
    $MaxEntries = [string]$args[3]
    $MaxMembershipBytes = [string]$args[5]
    [int]$entryLimit = 0
    [int]$membershipLimit = 0
    if ([string]::IsNullOrWhiteSpace($Root) -or
        -not [int]::TryParse($MaxEntries,[ref]$entryLimit) -or
        -not [int]::TryParse($MaxMembershipBytes,[ref]$membershipLimit) -or
        $entryLimit -le 0 -or $membershipLimit -le 0) {
        Refuse 'INPUT'
    }
    if ($Root -cnotmatch '^[A-Za-z]:\\') { Refuse 'INPUT' }
    $rootPath = [IO.Path]::GetFullPath($Root)
    if ($rootPath -cnotmatch '^[A-Za-z]:\\') { Refuse 'INPUT' }
    $physicalRoot = '\\?\' + $rootPath
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $records = New-Object 'System.Collections.Generic.List[string]'
    $script:entryCount = 0
    $script:recordBytes = 0
    $script:hasGit = $false

    function Assert-Direct([string]$Path, [bool]$Directory) {
        $attributes = [IO.File]::GetAttributes($Path)
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            Refuse 'REPARSE'
        }
        if ((($attributes -band [IO.FileAttributes]::Directory) -ne 0) -ne $Directory) {
            Refuse 'KIND'
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
        if ($script:entryCount -gt $entryLimit) { Refuse 'ENTRY_CAP' }
        $script:recordBytes += $utf8.GetByteCount($Record) + 1
        if ($script:recordBytes -gt $membershipLimit) {
            Refuse 'MEMBERSHIP_CAP'
        }
        $records.Add($Record)
    }

    function Scan-Directory([string]$Directory, [string]$Relative, [int]$Depth) {
        if ($Depth -gt 64) { Refuse 'DEPTH' }
        Assert-Direct $Directory $true
        foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($Directory)) {
            $name = [IO.Path]::GetFileName($entry)
            if ([string]::IsNullOrEmpty($name) -or $name -eq '.' -or $name -eq '..' -or
                $name -match '[\x00-\x1f\x7f:]' -or $name.Contains('/') -or
                $name.Contains('\') -or $name.EndsWith('.') -or $name.EndsWith(' ')) {
                Refuse 'NAME'
            }
            $attributes = [IO.File]::GetAttributes($entry)
            if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                Refuse 'REPARSE'
            }
            $isDirectory = ($attributes -band [IO.FileAttributes]::Directory) -ne 0
            $child = if ($Relative -eq '') { $name } else { $Relative + '/' + $name }
            if ($Relative -eq '' -and $name -eq '.git') {
                if (-not $isDirectory -or $script:hasGit) { Refuse 'GIT' }
                $script:hasGit = $true
                Add-Record ('D' + "`t" + $child)
                continue
            }
            if ($child -eq '.git' -or $child.StartsWith('.git/')) {
                Refuse 'GIT'
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
    if (-not $script:hasGit) { Refuse 'GIT' }
    $records.Sort([StringComparer]::Ordinal)
    $builder = New-Object System.Text.StringBuilder
    foreach ($record in $records) { [void]$builder.Append($record).Append("`n") }
    $bytes = $utf8.GetBytes($builder.ToString())
    if ($bytes.Length -ne $script:recordBytes -or
        $bytes.Length -gt $membershipLimit) { Refuse 'MEMBERSHIP_CAP' }
    [Console]::Out.Write([Convert]::ToBase64String($bytes))
    exit 0
} catch {
    try {
        [Console]::Error.Write('V5_SOURCE59_POSTBUILD_' + $script:failureCode + [char]10)
    } catch {
        # Missing fixed stderr is still a refusal to the bounded caller.
    }
    exit 73
}
