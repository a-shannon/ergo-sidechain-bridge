$ErrorActionPreference = 'Stop'

function ConvertFrom-BridgeBase64([string] $Value, [string] $Label) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "$Label is missing"
    }
    try {
        return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
    }
    catch {
        throw "$Label is invalid"
    }
}

$application = ConvertFrom-BridgeBase64 $env:E2S_JOB_EXECUTABLE_B64 'job executable'
$argumentsJson = ConvertFrom-BridgeBase64 $env:E2S_JOB_ARGUMENTS_B64 'job arguments'
$workingDirectory = ConvertFrom-BridgeBase64 $env:E2S_JOB_CWD_B64 'job working directory'

Remove-Item Env:E2S_JOB_EXECUTABLE_B64 -ErrorAction SilentlyContinue
Remove-Item Env:E2S_JOB_ARGUMENTS_B64 -ErrorAction SilentlyContinue
Remove-Item Env:E2S_JOB_CWD_B64 -ErrorAction SilentlyContinue

$decodedArguments = ConvertFrom-Json -InputObject $argumentsJson
[string[]] $arguments = @($decodedArguments | ForEach-Object { [string] $_ })

$jobRunnerSource = @'
using System;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;

public static class E2SWindowsJobProcess
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint STARTF_USESTDHANDLES = 0x00000100;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint INFINITE = 0xffffffff;
    private const uint WAIT_OBJECT_0 = 0x00000000;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    public static int Run(string application, string[] arguments, string workingDirectory)
    {
        IntPtr job = IntPtr.Zero;
        IntPtr limitInformation = IntPtr.Zero;
        PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();
        bool processCreated = false;
        AnonymousPipeServerStream standardInput = null;
        AnonymousPipeServerStream standardOutput = null;
        AnonymousPipeServerStream standardError = null;

        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero)
                throw Win32Failure("CreateJobObject");

            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits =
                new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            // Do not enable either BREAKAWAY flag. Every target descendant stays in this job.
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int limitSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            limitInformation = Marshal.AllocHGlobal(limitSize);
            Marshal.StructureToPtr(limits, limitInformation, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                limitInformation,
                (uint) limitSize))
                throw Win32Failure("SetInformationJobObject");

            standardInput = new AnonymousPipeServerStream(
                PipeDirection.Out,
                HandleInheritability.Inheritable);
            standardOutput = new AnonymousPipeServerStream(
                PipeDirection.In,
                HandleInheritability.Inheritable);
            standardError = new AnonymousPipeServerStream(
                PipeDirection.In,
                HandleInheritability.Inheritable);

            STARTUPINFO startupInfo = new STARTUPINFO();
            startupInfo.cb = (uint) Marshal.SizeOf(typeof(STARTUPINFO));
            startupInfo.dwFlags = STARTF_USESTDHANDLES;
            startupInfo.hStdInput = ParseHandle(standardInput.GetClientHandleAsString());
            startupInfo.hStdOutput = ParseHandle(standardOutput.GetClientHandleAsString());
            startupInfo.hStdError = ParseHandle(standardError.GetClientHandleAsString());

            StringBuilder commandLine = new StringBuilder(BuildCommandLine(application, arguments));
            if (!CreateProcess(
                application,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                true,
                CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
                IntPtr.Zero,
                workingDirectory,
                ref startupInfo,
                out processInformation))
                throw Win32Failure("CreateProcess");
            processCreated = true;

            standardInput.DisposeLocalCopyOfClientHandle();
            standardOutput.DisposeLocalCopyOfClientHandle();
            standardError.DisposeLocalCopyOfClientHandle();
            standardInput.Dispose();
            standardInput = null;

            if (!AssignProcessToJobObject(job, processInformation.hProcess))
                throw Win32Failure("AssignProcessToJobObject");

            Task outputCopy = standardOutput.CopyToAsync(Console.OpenStandardOutput());
            Task errorCopy = standardError.CopyToAsync(Console.OpenStandardError());

            if (ResumeThread(processInformation.hThread) == 0xffffffff)
                throw Win32Failure("ResumeThread");
            CloseHandle(processInformation.hThread);
            processInformation.hThread = IntPtr.Zero;

            if (WaitForSingleObject(processInformation.hProcess, INFINITE) != WAIT_OBJECT_0)
                throw Win32Failure("WaitForSingleObject");

            uint exitCode;
            if (!GetExitCodeProcess(processInformation.hProcess, out exitCode))
                throw Win32Failure("GetExitCodeProcess");

            CloseHandle(job);
            job = IntPtr.Zero;
            Task.WaitAll(new Task[] { outputCopy, errorCopy });
            Console.OpenStandardOutput().Flush();
            Console.OpenStandardError().Flush();
            return unchecked((int) exitCode);
        }
        finally
        {
            if (job != IntPtr.Zero)
            {
                TerminateJobObject(job, 1);
                CloseHandle(job);
            }
            else if (processCreated && processInformation.hProcess != IntPtr.Zero)
            {
                TerminateProcess(processInformation.hProcess, 1);
            }
            if (processInformation.hThread != IntPtr.Zero)
                CloseHandle(processInformation.hThread);
            if (processInformation.hProcess != IntPtr.Zero)
                CloseHandle(processInformation.hProcess);
            if (limitInformation != IntPtr.Zero)
                Marshal.FreeHGlobal(limitInformation);
            if (standardInput != null)
                standardInput.Dispose();
            if (standardOutput != null)
                standardOutput.Dispose();
            if (standardError != null)
                standardError.Dispose();
        }
    }

    private static IntPtr ParseHandle(string value)
    {
        return new IntPtr(long.Parse(value, CultureInfo.InvariantCulture));
    }

    private static string BuildCommandLine(string application, string[] arguments)
    {
        StringBuilder commandLine = new StringBuilder(QuoteArgument(application));
        foreach (string argument in arguments ?? new string[0])
        {
            commandLine.Append(' ');
            commandLine.Append(QuoteArgument(argument));
        }
        return commandLine.ToString();
    }

    private static string QuoteArgument(string argument)
    {
        if (argument.Length > 0 && argument.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0)
            return argument;

        StringBuilder quoted = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char character in argument)
        {
            if (character == '\\')
            {
                backslashes += 1;
            }
            else if (character == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
                backslashes = 0;
            }
            else
            {
                quoted.Append('\\', backslashes);
                quoted.Append(character);
                backslashes = 0;
            }
        }
        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static Win32Exception Win32Failure(string operation)
    {
        return new Win32Exception(Marshal.GetLastWin32Error(), operation + " failed");
    }
}
'@

Add-Type -TypeDefinition $jobRunnerSource -Language CSharp
exit [E2SWindowsJobProcess]::Run($application, $arguments, $workingDirectory)
