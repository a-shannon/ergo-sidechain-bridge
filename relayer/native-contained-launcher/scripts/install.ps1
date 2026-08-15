[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $BrokerPath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string] $BrokerSha256,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string] $ProfileDigest,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string] $PolicyDigestSha256,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ $_ -gt 0 })]
    [UInt64] $MinimumPolicyEpoch,

    [switch] $UseV1CompatibilityProfile,

    [switch] $MigrateLegacyEpochOnlyRecord,

    [switch] $InspectOnly,

    [switch] $AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not [Environment]::Is64BitProcess) {
    throw 'The authoritative broker installer requires 64-bit PowerShell.'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'The authoritative broker installer must run elevated.'
}

if ($MigrateLegacyEpochOnlyRecord -and -not $UseV1CompatibilityProfile) {
    throw 'MigrateLegacyEpochOnlyRecord applies only to the explicit V1 compatibility profile.'
}

if ($InspectOnly -and $UseV1CompatibilityProfile) {
    throw 'InspectOnly applies only to the immutable V2 installation profile.'
}

if ($AsJson -and -not $InspectOnly) {
    throw 'AsJson applies only to InspectOnly.'
}

function ConvertFrom-LowerHex {
    param(
        [Parameter(Mandatory = $true)]
        [ValidatePattern('^[0-9a-f]+$')]
        [string] $Value
    )

    if (($Value.Length % 2) -ne 0) {
        throw 'Hex value must contain an even number of characters.'
    }

    [byte[]] $bytes = [byte[]]::new($Value.Length / 2)
    for ($index = 0; $index -lt $bytes.Length; $index++) {
        $bytes[$index] = [Convert]::ToByte($Value.Substring($index * 2, 2), 16)
    }
    return $bytes
}

function ConvertTo-LittleEndianBytes {
    param(
        [Parameter(Mandatory = $true)]
        [UInt64] $Value
    )

    [byte[]] $bytes = [BitConverter]::GetBytes($Value)
    if (-not [BitConverter]::IsLittleEndian) {
        [Array]::Reverse($bytes)
    }
    return $bytes
}

function Test-ByteArrayEqual {
    param(
        [Parameter(Mandatory = $true)]
        [byte[]] $Left,

        [Parameter(Mandatory = $true)]
        [byte[]] $Right
    )

    return [Convert]::ToBase64String($Left) -ceq [Convert]::ToBase64String($Right)
}

function Assert-NoReparsePoint {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Managed installation path must not be a reparse point: $Path"
    }
}

function Get-TrustedProgramFilesPath {
    if (-not [Environment]::Is64BitProcess) {
        throw 'The immutable V2 installer requires a 64-bit PowerShell host.'
    }
    $knownFolder = [Environment]::GetFolderPath(
        [Environment+SpecialFolder]::ProgramFiles
    )
    if ([string]::IsNullOrWhiteSpace($knownFolder)) {
        throw 'Unable to resolve the 64-bit Program Files known folder.'
    }
    $fullPath = [IO.Path]::GetFullPath($knownFolder).TrimEnd(
        [IO.Path]::DirectorySeparatorChar
    )
    if ($fullPath -notmatch '^[A-Za-z]:\\') {
        throw 'The 64-bit Program Files known folder must be on a local drive.'
    }
    Assert-NoReparsePoint -Path $fullPath
    return $fullPath
}

function New-ImmutableDirectorySecurity {
    $security = [Security.AccessControl.DirectorySecurity]::new()
    $security.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    foreach ($entry in @(
            @('S-1-5-18', [Security.AccessControl.FileSystemRights]::FullControl),
            @('S-1-5-32-544', [Security.AccessControl.FileSystemRights]::FullControl),
            @('S-1-5-32-545', [Security.AccessControl.FileSystemRights]'ReadAndExecute, Synchronize')
        )) {
        $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($entry[0]),
                $entry[1],
                $inheritance,
                [Security.AccessControl.PropagationFlags]::None,
                [Security.AccessControl.AccessControlType]::Allow
            ))
    }
    return $security
}

function New-ImmutableFileSecurity {
    $security = [Security.AccessControl.FileSecurity]::new()
    $security.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
    $security.SetAccessRuleProtection($true, $false)
    foreach ($entry in @(
            @('S-1-5-18', [Security.AccessControl.FileSystemRights]::FullControl),
            @('S-1-5-32-544', [Security.AccessControl.FileSystemRights]::FullControl),
            @('S-1-5-32-545', [Security.AccessControl.FileSystemRights]'ReadAndExecute, Synchronize')
        )) {
        $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($entry[0]),
                $entry[1],
                [Security.AccessControl.AccessControlType]::Allow
            ))
    }
    return $security
}

function New-ImmutableRegistrySecurity {
    $security = [Security.AccessControl.RegistrySecurity]::new()
    $security.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit
    foreach ($entry in @(
            @('S-1-5-18', [Security.AccessControl.RegistryRights]::FullControl),
            @('S-1-5-32-544', [Security.AccessControl.RegistryRights]::FullControl),
            @('S-1-5-32-545', [Security.AccessControl.RegistryRights]::ReadKey)
        )) {
        $security.AddAccessRule([Security.AccessControl.RegistryAccessRule]::new(
                [Security.Principal.SecurityIdentifier]::new($entry[0]),
                $entry[1],
                $inheritance,
                [Security.AccessControl.PropagationFlags]::None,
                [Security.AccessControl.AccessControlType]::Allow
            ))
    }
    return $security
}

function Assert-ImmutableSecurity {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,

        [Parameter(Mandatory = $true)]
        [Security.AccessControl.FileSystemSecurity] $Expected,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Directory', 'File')]
        [string] $Kind
    )

    $sections = [Security.AccessControl.AccessControlSections]'Owner, Access'
    if ($Kind -ceq 'Directory') {
        $observed = [IO.Directory]::GetAccessControl($Path, $sections)
    }
    else {
        $observed = [IO.File]::GetAccessControl($Path, $sections)
    }
    $expectedSddl = $Expected.GetSecurityDescriptorSddlForm($sections)
    $observedSddl = $observed.GetSecurityDescriptorSddlForm($sections)
    if ($observedSddl -cne $expectedSddl) {
        throw "Managed $Kind security descriptor does not match the immutable V2 profile: $Path"
    }
}

function Assert-ImmutableRegistrySecurity {
    param(
        [Parameter(Mandatory = $true)]
        [Microsoft.Win32.RegistryKey] $Key,

        [Parameter(Mandatory = $true)]
        [Security.AccessControl.RegistrySecurity] $Expected,

        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    $sections = [Security.AccessControl.AccessControlSections]'Owner, Access'
    $expectedSddl = $Expected.GetSecurityDescriptorSddlForm($sections)
    $observedSddl = $Key.GetAccessControl($sections).GetSecurityDescriptorSddlForm($sections)
    if ($observedSddl -cne $expectedSddl) {
        throw "Managed registry security descriptor does not match the immutable V2 profile: $Path"
    }
}

function Initialize-NativeFileIdentityApi {
    if ('E2SBridge.NativeExecution.FileIdentityApi' -as [type]) {
        return
    }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace E2SBridge.NativeExecution
{
    [StructLayout(LayoutKind.Sequential)]
    public struct FILE_STANDARD_INFO
    {
        public long AllocationSize;
        public long EndOfFile;
        public uint NumberOfLinks;
        public byte DeletePending;
        public byte Directory;
        public ushort Padding;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct FILE_ID_128
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public byte[] Identifier;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct FILE_ID_INFO
    {
        public ulong VolumeSerialNumber;
        public FILE_ID_128 FileId;
    }

    public static class FileIdentityApi
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetFileInformationByHandleEx(
            IntPtr hFile,
            int FileInformationClass,
            IntPtr lpFileInformation,
            uint dwBufferSize);
    }
}
'@
}

function Get-NativeFileIdentity {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    Initialize-NativeFileIdentityApi
    $stream = [IO.File]::Open(
        $Path,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::Read
    )
    try {
        $handle = $stream.SafeFileHandle.DangerousGetHandle()
        $standardType = [E2SBridge.NativeExecution.FILE_STANDARD_INFO]
        $standardSize = [Runtime.InteropServices.Marshal]::SizeOf($standardType)
        $standardPointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($standardSize)
        try {
            if (-not [E2SBridge.NativeExecution.FileIdentityApi]::GetFileInformationByHandleEx(
                    $handle,
                    1,
                    $standardPointer,
                    [UInt32] $standardSize
                )) {
                throw "GetFileInformationByHandleEx(FileStandardInfo) failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
            }
            $standard = [Runtime.InteropServices.Marshal]::PtrToStructure($standardPointer, $standardType)
        }
        finally {
            [Runtime.InteropServices.Marshal]::FreeHGlobal($standardPointer)
        }

        $identityType = [E2SBridge.NativeExecution.FILE_ID_INFO]
        $identitySize = [Runtime.InteropServices.Marshal]::SizeOf($identityType)
        $identityPointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($identitySize)
        try {
            if (-not [E2SBridge.NativeExecution.FileIdentityApi]::GetFileInformationByHandleEx(
                    $handle,
                    18,
                    $identityPointer,
                    [UInt32] $identitySize
                )) {
                throw "GetFileInformationByHandleEx(FileIdInfo) failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
            }
            $identity = [Runtime.InteropServices.Marshal]::PtrToStructure($identityPointer, $identityType)
        }
        finally {
            [Runtime.InteropServices.Marshal]::FreeHGlobal($identityPointer)
        }

        if ($standard.Directory -ne 0) {
            throw 'Expected the installed launcher to be a regular file.'
        }
        if ($standard.NumberOfLinks -ne 1) {
            throw "Installed launcher must have exactly one hard link; observed $($standard.NumberOfLinks)."
        }
        if ($standard.DeletePending -ne 0) {
            throw 'Installed launcher must not be delete-pending.'
        }
        if ($null -eq $identity.FileId.Identifier -or $identity.FileId.Identifier.Length -ne 16) {
            throw 'Installed launcher returned a malformed 128-bit file identity.'
        }

        return [PSCustomObject]@{
            Size = [UInt64] $stream.Length
            VolumeSerial = [UInt64] $identity.VolumeSerialNumber
            FileId = [byte[]] $identity.FileId.Identifier.Clone()
            NumberOfLinks = [UInt32] $standard.NumberOfLinks
            DeletePending = [bool] ($standard.DeletePending -ne 0)
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Assert-ImmutableV2Image {
    param(
        [Parameter(Mandatory = $true)]
        [string] $ImageDirectory,

        [Parameter(Mandatory = $true)]
        [string] $ImagePath,

        [Parameter(Mandatory = $true)]
        [string] $ExpectedSha256,

        [Parameter(Mandatory = $true)]
        [UInt64] $ExpectedSize
    )

    Assert-NoReparsePoint -Path $ImageDirectory
    Assert-NoReparsePoint -Path $ImagePath
    Assert-ImmutableSecurity -Path $ImageDirectory -Expected (New-ImmutableDirectorySecurity) -Kind Directory
    Assert-ImmutableSecurity -Path $ImagePath -Expected (New-ImmutableFileSecurity) -Kind File
    $observedHash = (Get-FileHash -LiteralPath $ImagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($observedHash -cne $ExpectedSha256) {
        throw 'Existing immutable V2 launcher hash does not match its content-addressed path.'
    }
    $identity = Get-NativeFileIdentity -Path $ImagePath
    if ($identity.Size -ne $ExpectedSize) {
        throw 'Existing immutable V2 launcher size does not match the reviewed source.'
    }
    return $identity
}

function Inspect-ImmutableV2Profile {
    $mutex = New-Object -TypeName Threading.Mutex -ArgumentList @(
        $false,
        'Global\E2SBridge-NativeExecution-v2-Installer'
    )
    $mutexHeld = $false
    try {
        try {
            $mutexHeld = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
        }
        catch [Threading.AbandonedMutexException] {
            $mutexHeld = $true
            try {
                $mutex.ReleaseMutex()
                $mutexHeld = $false
            }
            catch {
                throw 'The immutable V2 inspector acquired an abandoned mutex but could not release it.'
            }
            throw 'The immutable V2 installer mutex was abandoned; inspection cannot establish a stable installation.'
        }
        if (-not $mutexHeld) {
            throw 'Timed out waiting for the immutable V2 installer lock during inspection.'
        }

        $source = (Resolve-Path -LiteralPath $BrokerPath).Path
        if ([IO.Path]::GetExtension($source) -cne '.exe') {
            throw 'BrokerPath must name an .exe file.'
        }
        Assert-NoReparsePoint -Path $source
        $observedBrokerSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($observedBrokerSha256 -cne $BrokerSha256) {
            throw 'BrokerPath SHA-256 does not match the reviewed inspector pin.'
        }
        $sourceSize = [UInt64] (Get-Item -LiteralPath $source -Force).Length

        $programFiles = Get-TrustedProgramFilesPath
        $e2sRoot = Join-Path $programFiles 'E2SBridge'
        $nativeExecutionRoot = Join-Path $e2sRoot 'NativeExecution'
        $v2Root = Join-Path $nativeExecutionRoot 'v2'
        $imagesRoot = Join-Path $v2Root 'Images'
        foreach ($path in @($e2sRoot, $nativeExecutionRoot, $v2Root, $imagesRoot)) {
            if (-not (Test-Path -LiteralPath $path -PathType Container)) {
                throw "Immutable V2 managed directory is missing: $path"
            }
            Assert-NoReparsePoint -Path $path
            Assert-ImmutableSecurity `
                -Path $path `
                -Expected (New-ImmutableDirectorySecurity) `
                -Kind Directory
        }

        $imageDirectory = Join-Path $imagesRoot $BrokerSha256
        $installedBroker = Join-Path $imageDirectory 'bridge-contained-launcher.exe'
        if (-not (Test-Path -LiteralPath $imageDirectory -PathType Container)) {
            throw 'The immutable V2 launcher digest directory is missing.'
        }
        if (-not (Test-Path -LiteralPath $installedBroker -PathType Leaf)) {
            throw 'The immutable V2 launcher image is missing.'
        }
        $imageIdentity = Assert-ImmutableV2Image `
            -ImageDirectory $imageDirectory `
            -ImagePath $installedBroker `
            -ExpectedSha256 $BrokerSha256 `
            -ExpectedSize $sourceSize

        [byte[]] $expectedAuthorityRecord = `
            [Text.Encoding]::ASCII.GetBytes('E2SAUTH2') + `
            (ConvertFrom-LowerHex $ProfileDigest) + `
            (ConvertFrom-LowerHex $PolicyDigestSha256) + `
            (ConvertFrom-LowerHex $BrokerSha256) + `
            (ConvertTo-LittleEndianBytes $imageIdentity.Size) + `
            (ConvertTo-LittleEndianBytes $imageIdentity.VolumeSerial) + `
            $imageIdentity.FileId + `
            (ConvertTo-LittleEndianBytes $MinimumPolicyEpoch)
        if ($expectedAuthorityRecord.Length -ne 144) {
            throw 'Unable to construct the fixed 144-byte AuthorityRecordV2 for inspection.'
        }

        $baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
            [Microsoft.Win32.RegistryHive]::LocalMachine,
            [Microsoft.Win32.RegistryView]::Registry64
        )
        try {
            $profileKey = $null
            try {
                $registryPaths = @(
                    'SOFTWARE\E2SBridge\NativeExecution\v2',
                    'SOFTWARE\E2SBridge\NativeExecution\v2\Profiles',
                    "SOFTWARE\E2SBridge\NativeExecution\v2\Profiles\$ProfileDigest"
                )
                foreach ($registryPath in $registryPaths) {
                    $key = $null
                    try {
                        $key = $baseKey.OpenSubKey($registryPath, $false)
                        if ($null -eq $key) {
                            throw "Immutable V2 registry key is missing: $registryPath"
                        }
                        Assert-ImmutableRegistrySecurity `
                            -Key $key `
                            -Expected (New-ImmutableRegistrySecurity) `
                            -Path $registryPath
                        if ($registryPath -ceq $registryPaths[-1]) {
                            $profileKey = $key
                            $key = $null
                        }
                    }
                    finally {
                        if ($null -ne $key) {
                            $key.Dispose()
                        }
                    }
                }
                if ($null -eq $profileKey) {
                    throw 'Unable to open the immutable V2 authoritative profile registry key.'
                }
                $existingNames = $profileKey.GetValueNames()
                if ($existingNames.Count -ne 1 -or -not ($existingNames -contains 'AuthorityRecordV2')) {
                    throw 'Immutable V2 profile record contains missing or ambiguous values.'
                }
                if ($profileKey.GetValueKind('AuthorityRecordV2') -ne [Microsoft.Win32.RegistryValueKind]::Binary) {
                    throw 'AuthorityRecordV2 is malformed.'
                }
                [byte[]] $observedAuthorityRecord = $profileKey.GetValue(
                    'AuthorityRecordV2',
                    $null,
                    [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
                )
                if ($observedAuthorityRecord.Length -ne 144 -or `
                    [Text.Encoding]::ASCII.GetString($observedAuthorityRecord, 0, 8) -cne 'E2SAUTH2') {
                    throw 'AuthorityRecordV2 is malformed.'
                }
                if (-not (Test-ByteArrayEqual $observedAuthorityRecord $expectedAuthorityRecord)) {
                    throw 'AuthorityRecordV2 does not match the reviewed profile, policy, launcher, file identity, and epoch.'
                }
            }
            finally {
                if ($null -ne $profileKey) {
                    $profileKey.Dispose()
                }
            }
        }
        finally {
            $baseKey.Dispose()
        }

        return [PSCustomObject]@{
            InspectionProfile = 'V2ImmutableReadOnly'
            Broker = $installedBroker
            BrokerSha256 = $BrokerSha256
            BrokerSize = $imageIdentity.Size
            VolumeSerial = $imageIdentity.VolumeSerial
            FileId = (([BitConverter]::ToString($imageIdentity.FileId) -replace '-', '').ToLowerInvariant())
            ProfileDigest = $ProfileDigest
            PolicyDigestSha256 = $PolicyDigestSha256
            MinimumPolicyEpoch = $MinimumPolicyEpoch
            AuthorityRecordBytes = 144
            FileSystemAclMatched = $true
            RegistryAclMatched = $true
            NoReparsePoints = $true
            SingleHardLink = $true
            DeletePending = $false
            AuthorityRecordMatched = $true
            InstalledBrokerImageBoundToAuthorityRecordV2 = $true
            LauncherInstallationActivationCampaignCompleted = $false
            BrokerExecutionObserved = $false
            TargetExecutionObserved = $false
            PersistentMutationPerformed = $false
            ProofAuthorityGranted = $false
            FundsAuthorityGranted = $false
            Gate5Closed = $false
            ProductionReady = $false
        }
    }
    finally {
        try {
            if ($mutexHeld) {
                $mutex.ReleaseMutex()
            }
        }
        finally {
            $mutex.Dispose()
        }
    }
}

function Install-ImmutableV2Profile {
    $mutex = New-Object -TypeName Threading.Mutex -ArgumentList @(
        $false,
        'Global\E2SBridge-NativeExecution-v2-Installer'
    )
    $mutexHeld = $false
    try {
        try {
            $mutexHeld = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
        }
        catch [Threading.AbandonedMutexException] {
            $mutexHeld = $true
            try {
                $mutex.ReleaseMutex()
                $mutexHeld = $false
            }
            catch {
                throw 'The immutable V2 installer acquired an abandoned mutex but could not release it.'
            }
            throw 'The immutable V2 installer mutex was abandoned; inspect the installation state before retrying.'
        }
        if (-not $mutexHeld) {
            throw 'Timed out waiting for the immutable V2 installer lock.'
        }

        $source = (Resolve-Path -LiteralPath $BrokerPath).Path
        if ([IO.Path]::GetExtension($source) -cne '.exe') {
            throw 'BrokerPath must name an .exe file.'
        }
        Assert-NoReparsePoint -Path $source
        $observedV2BrokerSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($observedV2BrokerSha256 -cne $BrokerSha256) {
            throw 'BrokerPath SHA-256 does not match the reviewed installer pin.'
        }
        $sourceSize = [UInt64] (Get-Item -LiteralPath $source -Force).Length

        $programFiles = Get-TrustedProgramFilesPath
        $e2sRoot = Join-Path $programFiles 'E2SBridge'
        $nativeExecutionRoot = Join-Path $e2sRoot 'NativeExecution'
        $v2Root = Join-Path $nativeExecutionRoot 'v2'
        $imagesRoot = Join-Path $v2Root 'Images'
        foreach ($path in @($e2sRoot, $nativeExecutionRoot, $v2Root, $imagesRoot)) {
            [IO.Directory]::CreateDirectory($path) | Out-Null
            Assert-NoReparsePoint -Path $path
            [IO.Directory]::SetAccessControl($path, (New-ImmutableDirectorySecurity))
            Assert-ImmutableSecurity -Path $path -Expected (New-ImmutableDirectorySecurity) -Kind Directory
        }

        $imageDirectory = Join-Path $imagesRoot $BrokerSha256
        $installedBroker = Join-Path $imageDirectory 'bridge-contained-launcher.exe'
        $stagingDirectory = $null
        if (-not (Test-Path -LiteralPath $imageDirectory)) {
            $stagingDirectory = Join-Path $imagesRoot ('.stage-{0}' -f [Guid]::NewGuid().ToString('N'))
            [IO.Directory]::CreateDirectory($stagingDirectory) | Out-Null
            try {
                [IO.Directory]::SetAccessControl($stagingDirectory, (New-ImmutableDirectorySecurity))
                Assert-NoReparsePoint -Path $stagingDirectory
                $stagedBroker = Join-Path $stagingDirectory 'bridge-contained-launcher.exe'
                [IO.FileInfo]::new($source).CopyTo($stagedBroker, $false) | Out-Null
                [IO.File]::SetAccessControl($stagedBroker, (New-ImmutableFileSecurity))
                Assert-NoReparsePoint -Path $stagedBroker

                $copiedHash = (Get-FileHash -LiteralPath $stagedBroker -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($copiedHash -cne $BrokerSha256) {
                    throw 'Copied immutable V2 launcher SHA-256 does not match the reviewed installer pin.'
                }
                $flushStream = [IO.File]::Open(
                    $stagedBroker,
                    [IO.FileMode]::Open,
                    [IO.FileAccess]::ReadWrite,
                    [IO.FileShare]::Read
                )
                try {
                    $flushStream.Flush($true)
                }
                finally {
                    $flushStream.Dispose()
                }
                Assert-ImmutableV2Image `
                    -ImageDirectory $stagingDirectory `
                    -ImagePath $stagedBroker `
                    -ExpectedSha256 $BrokerSha256 `
                    -ExpectedSize $sourceSize | Out-Null

                try {
                    [IO.Directory]::Move($stagingDirectory, $imageDirectory)
                    $stagingDirectory = $null
                }
                catch [IO.IOException] {
                    if (-not (Test-Path -LiteralPath $imageDirectory -PathType Container)) {
                        throw
                    }
                }
            }
            finally {
                if ($null -ne $stagingDirectory -and (Test-Path -LiteralPath $stagingDirectory)) {
                    Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
                }
            }
        }
        elseif (-not (Test-Path -LiteralPath $imageDirectory -PathType Container)) {
            throw 'The immutable V2 launcher digest path exists but is not a directory.'
        }

        # Existing content-addressed images are verified exactly and are never
        # overwritten, repaired, or assigned replacement security descriptors.
        $imageIdentity = Assert-ImmutableV2Image `
            -ImageDirectory $imageDirectory `
            -ImagePath $installedBroker `
            -ExpectedSha256 $BrokerSha256 `
            -ExpectedSize $sourceSize

        [byte[]] $authorityRecord = `
            [Text.Encoding]::ASCII.GetBytes('E2SAUTH2') + `
            (ConvertFrom-LowerHex $ProfileDigest) + `
            (ConvertFrom-LowerHex $PolicyDigestSha256) + `
            (ConvertFrom-LowerHex $BrokerSha256) + `
            (ConvertTo-LittleEndianBytes $imageIdentity.Size) + `
            (ConvertTo-LittleEndianBytes $imageIdentity.VolumeSerial) + `
            $imageIdentity.FileId + `
            (ConvertTo-LittleEndianBytes $MinimumPolicyEpoch)
        if ($authorityRecord.Length -ne 144) {
            throw 'Unable to construct the fixed 144-byte AuthorityRecordV2.'
        }

        $baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
            [Microsoft.Win32.RegistryHive]::LocalMachine,
            [Microsoft.Win32.RegistryView]::Registry64
        )
        try {
            $profileKey = $null
            $registryPaths = @(
                'SOFTWARE\E2SBridge\NativeExecution\v2',
                'SOFTWARE\E2SBridge\NativeExecution\v2\Profiles',
                "SOFTWARE\E2SBridge\NativeExecution\v2\Profiles\$ProfileDigest"
            )
            foreach ($registryPath in $registryPaths) {
                $registrySecurity = New-ImmutableRegistrySecurity
                $key = $baseKey.CreateSubKey(
                    $registryPath,
                    [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree,
                    [Microsoft.Win32.RegistryOptions]::None,
                    $registrySecurity
                )
                if ($null -eq $key) {
                    throw "Unable to open immutable V2 registry key: $registryPath"
                }
                $key.SetAccessControl($registrySecurity)
                Assert-ImmutableRegistrySecurity `
                    -Key $key `
                    -Expected $registrySecurity `
                    -Path $registryPath
                if ($registryPath -ceq $registryPaths[-1]) {
                    $profileKey = $key
                }
                else {
                    $key.Dispose()
                }
            }
            if ($null -eq $profileKey) {
                throw 'Unable to open the immutable V2 authoritative profile registry key.'
            }
            try {
                $existingNames = $profileKey.GetValueNames()
                if ($existingNames.Count -gt 0) {
                    if ($existingNames.Count -ne 1 -or -not ($existingNames -contains 'AuthorityRecordV2')) {
                        throw 'Existing immutable V2 profile record contains ambiguous values.'
                    }
                    if ($profileKey.GetValueKind('AuthorityRecordV2') -ne [Microsoft.Win32.RegistryValueKind]::Binary) {
                        throw 'Existing AuthorityRecordV2 is malformed.'
                    }
                    [byte[]] $existingRecord = $profileKey.GetValue(
                        'AuthorityRecordV2',
                        $null,
                        [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
                    )
                    if ($existingRecord.Length -ne 144 -or [Text.Encoding]::ASCII.GetString($existingRecord, 0, 8) -cne 'E2SAUTH2') {
                        throw 'Existing AuthorityRecordV2 is malformed.'
                    }
                    if (-not (Test-ByteArrayEqual $existingRecord[8..39] (ConvertFrom-LowerHex $ProfileDigest))) {
                        throw 'Existing AuthorityRecordV2 profile digest does not match its registry path.'
                    }
                    $existingEpoch = [BitConverter]::ToUInt64($existingRecord, 136)
                    if ($existingEpoch -eq 0) {
                        throw 'Existing AuthorityRecordV2 is malformed.'
                    }
                    if ($MinimumPolicyEpoch -lt $existingEpoch) {
                        throw "Refusing V2 policy epoch decrease from $existingEpoch to $MinimumPolicyEpoch."
                    }
                    $sameEpochPolicyChanged = $MinimumPolicyEpoch -eq $existingEpoch -and `
                        -not (Test-ByteArrayEqual $existingRecord[40..71] $authorityRecord[40..71])
                    $existingLauncherMatches = Test-ByteArrayEqual `
                        -Left $existingRecord[72..103] `
                        -Right $authorityRecord[72..103]
                    $sameEpochLauncherChanged = $MinimumPolicyEpoch -eq $existingEpoch -and `
                        -not $existingLauncherMatches
                    if ($sameEpochPolicyChanged) {
                        throw 'Refusing a V2 policy digest change without an epoch increase.'
                    }
                    if ($sameEpochLauncherChanged) {
                        throw 'Refusing a V2 launcher digest change without an epoch increase.'
                    }
                    if ($existingLauncherMatches -and `
                        -not (Test-ByteArrayEqual -Left $existingRecord[104..135] -Right $authorityRecord[104..135])) {
                        throw 'Existing AuthorityRecordV2 launcher content or file identity no longer matches the immutable image.'
                    }
                }

                # AuthorityRecordV2 is the final persistent mutation. Any
                # interruption before this point leaves only an inert image.
                $profileKey.SetValue(
                    'AuthorityRecordV2',
                    $authorityRecord,
                    [Microsoft.Win32.RegistryValueKind]::Binary
                )
                $profileKey.Flush()
            }
            finally {
                $profileKey.Dispose()
            }
        }
        finally {
            $baseKey.Dispose()
        }

        return [PSCustomObject]@{
            InstallProfile = 'V2Immutable'
            Broker = $installedBroker
            BrokerSha256 = $BrokerSha256
            BrokerSize = $imageIdentity.Size
            VolumeSerial = $imageIdentity.VolumeSerial
            FileId = (([BitConverter]::ToString($imageIdentity.FileId) -replace '-', '').ToLowerInvariant())
            ProfileDigest = $ProfileDigest
            PolicyDigestSha256 = $PolicyDigestSha256
            MinimumPolicyEpoch = $MinimumPolicyEpoch
            AuthorityRecordBytes = 144
            ActivationCampaignCompleted = $false
        }
    }
    finally {
        if ($mutexHeld) {
            $mutex.ReleaseMutex()
        }
        $mutex.Dispose()
    }
}

if ($InspectOnly) {
    $inspection = Inspect-ImmutableV2Profile
    if ($AsJson) {
        $inspection | ConvertTo-Json -Depth 4 -Compress
    }
    else {
        $inspection
    }
    return
}

if (-not $UseV1CompatibilityProfile) {
    Install-ImmutableV2Profile
    return
}

$mutex = [Threading.Mutex]::new($false, 'Global\E2SBridge-NativeExecution-v1-Installer')
$mutexHeld = $false
try {
    try {
        $mutexHeld = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    }
    catch [Threading.AbandonedMutexException] {
        $mutexHeld = $true
        try {
            $mutex.ReleaseMutex()
            $mutexHeld = $false
        }
        catch {
            throw 'The authoritative broker installer acquired an abandoned mutex but could not release it.'
        }
        throw 'The authoritative broker update mutex was abandoned; inspect and repair the installation state before retrying.'
    }
    if (-not $mutexHeld) {
        throw 'Timed out waiting for the authoritative broker installer lock.'
    }

    $source = (Resolve-Path -LiteralPath $BrokerPath).Path
    if ([IO.Path]::GetExtension($source) -cne '.exe') {
        throw 'BrokerPath must name an .exe file.'
    }
    $observedBrokerSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($observedBrokerSha256 -cne $BrokerSha256) {
        throw 'BrokerPath SHA-256 does not match the reviewed installer pin.'
    }

$installDirectory = Join-Path $env:ProgramFiles 'E2SBridge\NativeExecution\v1'
$installedBroker = Join-Path $installDirectory 'bridge-contained-launcher.exe'
[IO.Directory]::CreateDirectory($installDirectory) | Out-Null

$directorySecurity = [Security.AccessControl.DirectorySecurity]::new()
$directorySecurity.SetAccessRuleProtection($true, $false)
$inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$propagation = [Security.AccessControl.PropagationFlags]::None
foreach ($entry in @(
        @('S-1-5-18', [Security.AccessControl.FileSystemRights]::FullControl),
        @('S-1-5-32-544', [Security.AccessControl.FileSystemRights]::FullControl),
        @('S-1-5-32-545', [Security.AccessControl.FileSystemRights]'ReadAndExecute, Synchronize')
    )) {
    $sid = [Security.Principal.SecurityIdentifier]::new($entry[0])
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $sid,
        $entry[1],
        $inheritance,
        $propagation,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $directorySecurity.AddAccessRule($rule)
}
[IO.Directory]::SetAccessControl($installDirectory, $directorySecurity)

$registryPath = "SOFTWARE\E2SBridge\NativeExecution\v1\Profiles\$ProfileDigest"
$baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::LocalMachine,
    [Microsoft.Win32.RegistryView]::Registry64
)
try {
    $profileKey = $baseKey.CreateSubKey(
        $registryPath,
        [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree
    )
    if ($null -eq $profileKey) {
        throw 'Unable to open the fixed authoritative profile registry key.'
    }
    try {
        $existingNames = $profileKey.GetValueNames()
        $legacyRecordMigrated = $false
        [byte[]] $authorityTag = [Text.Encoding]::ASCII.GetBytes('E2SAUTH1')
        [byte[]] $profileDigestBytes = 0..31 | ForEach-Object {
            [Convert]::ToByte($ProfileDigest.Substring($_ * 2, 2), 16)
        }
        [byte[]] $policyDigestBytes = 0..31 | ForEach-Object {
            [Convert]::ToByte($PolicyDigestSha256.Substring($_ * 2, 2), 16)
        }
        [byte[]] $epochBytes = [BitConverter]::GetBytes($MinimumPolicyEpoch)
        if (-not [BitConverter]::IsLittleEndian) {
            [Array]::Reverse($epochBytes)
        }
        [byte[]] $authorityRecord = $authorityTag + $profileDigestBytes + $policyDigestBytes + $epochBytes
        if ($authorityRecord.Length -ne 80) {
            throw 'Unable to construct the fixed authoritative profile record.'
        }

        $hasAuthorityRecord = $existingNames -contains 'AuthorityRecordV1'
        $hasLegacyEpoch = $existingNames -contains 'MinimumPolicyEpoch'
        if ($hasAuthorityRecord) {
            if ($existingNames.Count -ne 1) {
                throw 'Existing authoritative profile record contains ambiguous values.'
            }
            if ($profileKey.GetValueKind('AuthorityRecordV1') -ne [Microsoft.Win32.RegistryValueKind]::Binary) {
                throw 'Existing AuthorityRecordV1 is malformed.'
            }
            [byte[]] $existingRecord = $profileKey.GetValue(
                'AuthorityRecordV1',
                $null,
                [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
            )
            $existingRecordMalformed = $existingRecord.Length -ne 80 -or [Text.Encoding]::ASCII.GetString($existingRecord, 0, 8) -cne 'E2SAUTH1'
            if ($existingRecordMalformed) {
                throw 'Existing AuthorityRecordV1 is malformed.'
            }
            [byte[]] $existingProfileDigest = $existingRecord[8..39]
            [byte[]] $existingPolicyDigest = $existingRecord[40..71]
            $existingEpoch = [BitConverter]::ToUInt64($existingRecord, 72)
            $existingProfileMatches = [Convert]::ToBase64String($existingProfileDigest) -ceq [Convert]::ToBase64String($profileDigestBytes)
            if (-not $existingProfileMatches) {
                throw 'Existing AuthorityRecordV1 profile digest does not match its registry path.'
            }
            if ($existingEpoch -eq 0) {
                throw 'Existing AuthorityRecordV1 is malformed.'
            }
            if ($MinimumPolicyEpoch -lt $existingEpoch) {
                throw "Refusing policy epoch decrease from $existingEpoch to $MinimumPolicyEpoch."
            }
            $sameEpochPolicyChanged = $MinimumPolicyEpoch -eq $existingEpoch -and [Convert]::ToBase64String($existingPolicyDigest) -cne [Convert]::ToBase64String($policyDigestBytes)
            if ($sameEpochPolicyChanged) {
                throw 'Refusing a policy digest change without an epoch increase.'
            }
        }
        elseif ($existingNames.Count -gt 0) {
            $legacyMigrationInvalid = -not $MigrateLegacyEpochOnlyRecord -or $existingNames.Count -ne 1 -or -not $hasLegacyEpoch
            if ($legacyMigrationInvalid) {
                throw 'Legacy or unknown authority values require an explicit epoch-only migration.'
            }
            if ($profileKey.GetValueKind('MinimumPolicyEpoch') -ne [Microsoft.Win32.RegistryValueKind]::QWord) {
                throw 'Legacy MinimumPolicyEpoch is malformed.'
            }
            $legacyRaw = [Int64] $profileKey.GetValue(
                'MinimumPolicyEpoch',
                $null,
                [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
            )
            $legacyEpoch = [BitConverter]::ToUInt64([BitConverter]::GetBytes($legacyRaw), 0)
            if ($legacyEpoch -eq 0) {
                throw 'Legacy MinimumPolicyEpoch is malformed.'
            }
            if ($MinimumPolicyEpoch -lt $legacyEpoch) {
                throw "Refusing policy epoch decrease from $legacyEpoch to $MinimumPolicyEpoch."
            }

            # Remove the value consumed by legacy broker builds first. A
            # migration interrupted before broker replacement then fails
            # closed instead of leaving the old broker authorized.
            $profileKey.DeleteValue('MinimumPolicyEpoch', $false)
            $profileKey.Flush()
            $legacyRecordMigrated = $true
        }

        # Bind profile, exact reviewed policy, and rollback floor in one
        # fixed-size value before replacing the broker.
        $profileKey.SetValue(
            'AuthorityRecordV1',
            $authorityRecord,
            [Microsoft.Win32.RegistryValueKind]::Binary
        )
        $profileKey.Flush()

        $temporary = Join-Path $installDirectory (".install-{0}.tmp" -f [Guid]::NewGuid().ToString('N'))
        try {
            [IO.File]::Copy($source, $temporary, $false)
            $copiedBrokerSha256 = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($copiedBrokerSha256 -cne $BrokerSha256) {
                throw 'Copied broker SHA-256 does not match the reviewed installer pin.'
            }
            Move-Item -LiteralPath $temporary -Destination $installedBroker -Force
        }
        finally {
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        }

    }
    finally {
        $profileKey.Dispose()
    }
}
finally {
    $baseKey.Dispose()
}

[PSCustomObject]@{
        Broker = $installedBroker
        BrokerSha256 = $BrokerSha256
        ProfileDigest = $ProfileDigest
        PolicyDigestSha256 = $PolicyDigestSha256
        MinimumPolicyEpoch = $MinimumPolicyEpoch
        MigratedLegacyEpochOnlyRecord = $legacyRecordMigrated
    }
}
finally {
    if ($mutexHeld) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
