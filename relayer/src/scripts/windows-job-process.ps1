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
$targetTimeoutText = ConvertFrom-BridgeBase64 $env:E2S_JOB_TIMEOUT_MS_B64 'job timeout'

try {
    $targetTimeoutMilliseconds = [long]::Parse(
        $targetTimeoutText,
        [Globalization.NumberStyles]::None,
        [Globalization.CultureInfo]::InvariantCulture)
}
catch {
    throw 'job timeout is invalid'
}
if ($targetTimeoutMilliseconds -le 0) {
    throw 'job timeout is invalid'
}

Remove-Item Env:E2S_JOB_EXECUTABLE_B64 -ErrorAction SilentlyContinue
Remove-Item Env:E2S_JOB_ARGUMENTS_B64 -ErrorAction SilentlyContinue
Remove-Item Env:E2S_JOB_CWD_B64 -ErrorAction SilentlyContinue
Remove-Item Env:E2S_JOB_TIMEOUT_MS_B64 -ErrorAction SilentlyContinue

$decodedArguments = ConvertFrom-Json -InputObject $argumentsJson
[string[]] $arguments = @($decodedArguments | ForEach-Object { [string] $_ })

$jobRunnerSource = @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class E2SWindowsJobProcess
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint STARTF_USESTDHANDLES = 0x00000100;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint WAIT_OBJECT_0 = 0x00000000;
    private const uint WAIT_TIMEOUT = 0x00000102;
    private const uint CANCELLATION_POLL_MS = 100;
    private const uint JOB_EMPTY_WAIT_MS = 10000;
    private const int CANCELLATION_EXIT_CODE = 197;
    private const int TARGET_FAILURE_EXIT_CODE = 198;
    private const int WRAPPER_FAILURE_CONTAINED_EXIT_CODE = 199;
    private const int TARGET_TIMEOUT_EXIT_CODE = 200;
    private const int JobObjectBasicAccountingInformation = 1;

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

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(
        IntPtr job,
        int informationClass,
        out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION information,
        uint informationLength,
        IntPtr returnLength);

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

    public static int Run(
        string application,
        string[] arguments,
        string workingDirectory,
        long targetTimeoutMilliseconds)
    {
        if (targetTimeoutMilliseconds <= 0)
            throw new ArgumentOutOfRangeException("targetTimeoutMilliseconds");
        IntPtr job = IntPtr.Zero;
        IntPtr limitInformation = IntPtr.Zero;
        PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();
        bool processCreated = false;
        bool assignedToJob = false;
        bool containmentVerified = false;
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
            assignedToJob = true;

            Task outputCopy = standardOutput.CopyToAsync(Console.OpenStandardOutput());
            Task errorCopy = standardError.CopyToAsync(Console.OpenStandardError());
            Task<int> cancellationRead = Task.Run(
                () => Console.OpenStandardInput().ReadByte());

            Stopwatch targetRuntime = Stopwatch.StartNew();
            if (ResumeThread(processInformation.hThread) == 0xffffffff)
                throw Win32Failure("ResumeThread");
            CloseHandle(processInformation.hThread);
            processInformation.hThread = IntPtr.Zero;

            bool cancellationRequested = false;
            bool targetTimedOut = false;
            while (true)
            {
                if (cancellationRead.IsCompleted)
                {
                    if (!TerminateJobObject(job, CANCELLATION_EXIT_CODE))
                        throw Win32Failure("TerminateJobObject cancellation");
                    cancellationRequested = true;
                    WaitForEmptyJob(job, "WaitForEmptyJob cancellation");
                    containmentVerified = true;
                    break;
                }
                uint waitResult = WaitForSingleObject(processInformation.hProcess, 0);
                if (waitResult == WAIT_OBJECT_0)
                    break;
                if (waitResult != WAIT_TIMEOUT)
                    throw Win32Failure("WaitForSingleObject");
                long remainingMilliseconds =
                    targetTimeoutMilliseconds - targetRuntime.ElapsedMilliseconds;
                if (remainingMilliseconds <= 0)
                {
                    if (!TerminateJobObject(job, TARGET_TIMEOUT_EXIT_CODE))
                        throw Win32Failure("TerminateJobObject target timeout");
                    targetTimedOut = true;
                    WaitForEmptyJob(job, "WaitForEmptyJob target timeout");
                    containmentVerified = true;
                    break;
                }
                uint waitMilliseconds = (uint) Math.Min(
                    (long) CANCELLATION_POLL_MS,
                    remainingMilliseconds);
                waitResult = WaitForSingleObject(
                    processInformation.hProcess,
                    waitMilliseconds);
                if (waitResult == WAIT_OBJECT_0)
                    break;
                if (waitResult != WAIT_TIMEOUT)
                    throw Win32Failure("WaitForSingleObject");
            }

            uint exitCode;
            if (!GetExitCodeProcess(processInformation.hProcess, out exitCode))
                throw Win32Failure("GetExitCodeProcess");

            if (!cancellationRequested && !targetTimedOut)
            {
                if (!TerminateJobObject(job, 1))
                    throw Win32Failure("TerminateJobObject completion");
                WaitForEmptyJob(job, "WaitForEmptyJob completion");
                containmentVerified = true;
            }
            CloseHandle(job);
            job = IntPtr.Zero;
            Task.WaitAll(new Task[] { outputCopy, errorCopy });
            Console.OpenStandardOutput().Flush();
            Console.OpenStandardError().Flush();
            if (cancellationRequested)
                return CANCELLATION_EXIT_CODE;
            if (targetTimedOut)
                return TARGET_TIMEOUT_EXIT_CODE;
            return exitCode == 0
                ? 0
                : TARGET_FAILURE_EXIT_CODE;
        }
        catch
        {
            if (containmentVerified || TryVerifyExceptionalContainment(
                processCreated,
                assignedToJob,
                job,
                processInformation.hProcess))
                return WRAPPER_FAILURE_CONTAINED_EXIT_CODE;
            throw;
        }
        finally
        {
            if (job != IntPtr.Zero)
            {
                TerminateJobObject(job, 1);
                CloseHandle(job);
            }
            if (
                processCreated
                && !assignedToJob
                && processInformation.hProcess != IntPtr.Zero)
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

    private static bool TryVerifyExceptionalContainment(
        bool processCreated,
        bool assignedToJob,
        IntPtr job,
        IntPtr process)
    {
        try
        {
            if (!processCreated)
                return true;
            if (assignedToJob)
            {
                if (job == IntPtr.Zero)
                    return false;
                TerminateJobObject(job, 1);
                WaitForEmptyJob(job, "WaitForEmptyJob exceptional cleanup");
                return true;
            }
            if (process == IntPtr.Zero)
                return false;
            uint waitResult = WaitForSingleObject(process, 0);
            if (waitResult == WAIT_OBJECT_0)
                return true;
            if (waitResult != WAIT_TIMEOUT)
                return false;
            TerminateProcess(process, 1);
            return WaitForSingleObject(process, JOB_EMPTY_WAIT_MS) == WAIT_OBJECT_0;
        }
        catch
        {
            return false;
        }
    }

    private static void WaitForEmptyJob(IntPtr job, string operation)
    {
        Stopwatch wait = Stopwatch.StartNew();
        while (true)
        {
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting;
            if (!QueryInformationJobObject(
                job,
                JobObjectBasicAccountingInformation,
                out accounting,
                (uint) Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)),
                IntPtr.Zero))
                throw Win32Failure(operation);
            if (accounting.ActiveProcesses == 0)
                return;
            if (wait.ElapsedMilliseconds >= JOB_EMPTY_WAIT_MS)
                throw new TimeoutException(operation + " timed out");
            Thread.Sleep((int) CANCELLATION_POLL_MS);
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
exit [E2SWindowsJobProcess]::Run(
    $application,
    $arguments,
    $workingDirectory,
    $targetTimeoutMilliseconds)
