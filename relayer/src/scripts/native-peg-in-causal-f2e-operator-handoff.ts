import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveProvisioningInputPath, resolveProvisioningOutputPath }
  from '../authenticated-v2-sanitized-io.js';
import {
  createNativePegInCausalF2eInputValidationV1,
  createNativePegInCausalF2eOperatorHandoffV1,
  validateNativePegInCausalF2eInputValidationV1,
  validateNativePegInCausalF2eOperatorHandoffV1,
  type NativePegInCausalF2eFileIdentityV1,
  type NativePegInCausalF2eHostObservationV1,
  type NativePegInCausalF2eInputValidationV1,
  type NativePegInCausalF2eOperatorHandoffV1,
} from '../native-peg-in-causal-f2e-operator-handoff-v1.js';
import {
  validateNativePegInCausalF2dInstallationDeclarationsV1,
  type NativePegInCausalF2dInstallationDeclarationsV1,
} from '../native-peg-in-causal-f2d-dual-origin-campaign-v1.js';
import {
  deriveCampaignInputManifestDigestHex,
  executeNativePegInCausalF2dCampaign,
  parseCampaignInputManifest,
  parseNativePegInCausalF2dDualOriginCampaignArgs,
} from './run-native-peg-in-causal-f2d-dual-origin-campaign.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RELAYER_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
const BRIDGE_ROOT = resolve(RELAYER_ROOT, '..');

interface Args {
  mode?: 'validate-input' | 'host-preflight';
  input?: string;
  out?: string;
  campaignOut?: string;
  brokerSource?: string;
  primaryRpcUrl?: string;
  witnessRpcUrl?: string;
  frontierSource?: string;
  cargo?: string;
  rustc?: string;
  git?: string;
  launcherPath?: string;
  launcherSha256Hex?: string;
  policyEpoch?: string;
  policyNotBeforeUnixMs?: string;
  policyExpiresAtUnixMs?: string;
  allowedSystemDlls: string[];
  help: boolean;
  errors: string[];
}

interface CliOptions {
  readonly cwd?: string;
  readonly bridgeRoot?: string;
  readonly now?: () => Date;
  readonly deriveDeclarations?: (
    args: ReturnType<typeof parseNativePegInCausalF2dDualOriginCampaignArgs>,
    cwd: string,
    generatedAt: Date,
  ) => Promise<NativePegInCausalF2dInstallationDeclarationsV1>;
  readonly observeHost?: () => NativePegInCausalF2eHostObservationV1;
  readonly observeFile?: (
    path: string,
    label: string,
  ) => NativePegInCausalF2eFileIdentityV1;
  readonly observeDirectory?: (path: string, label: string) => string;
  readonly observeInstaller?: (
    path: string,
    gitExecutablePath: string,
  ) => ReturnType<typeof observeTrackedInstaller>;
}

const VALUE_OPTIONS = new Set([
  '--mode',
  '--input',
  '--out',
  '--campaign-out',
  '--broker-source',
  '--primary-rpc-url',
  '--witness-rpc-url',
  '--frontier-source',
  '--cargo',
  '--rustc',
  '--git',
  '--launcher-path',
  '--launcher-sha256',
  '--policy-epoch',
  '--policy-not-before-unix-ms',
  '--policy-expires-at-unix-ms',
  '--allowed-system-dll',
]);

const usage = [
  'Usage (validate only): npm run peg-in:causal-f2e:handoff -- --mode validate-input --input <public-proof-input.json> --out .operator-campaign/<new-validation.json>',
  'Usage (protected-host preflight): npm run peg-in:causal-f2e:handoff -- --mode host-preflight --input <public-proof-input.json> --out .operator-campaign/<new-handoff.json> --campaign-out .operator-campaign/<new-dual-origin-report.json> --broker-source <reviewed-launcher.exe> --primary-rpc-url <origin> --witness-rpc-url <distinct-origin> --frontier-source <patched-source> --cargo <cargo.exe> --rustc <rustc.exe> --git <git.exe> --launcher-path <canonical-installed-v2-path> --launcher-sha256 <0x-digest> --policy-epoch <positive> --policy-not-before-unix-ms <ms> --policy-expires-at-unix-ms <ms> --allowed-system-dll <name> [--allowed-system-dll <name> ...]',
  'Both modes are non-authorizing and create a new local report only. Host preflight derives commands but never installs, inspects, executes a proof, reads or writes the registry, signs, submits, or broadcasts.',
];

export async function runNativePegInCausalF2eOperatorHandoffCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));
  const cwd = resolve(options.cwd ?? process.cwd());
  const inputPath = resolveProvisioningInputPath(required(args.input, '--input'), {
    cwd,
    bridgeRoot: options.bridgeRoot,
  });
  const outputPath = resolveOperatorCampaignOutputPath(
    required(args.out, '--out'),
    cwd,
    options.bridgeRoot,
  );
  const manifestBytes = readFileSync(inputPath);
  const manifest = parseCampaignInputManifest(manifestBytes);
  const manifestDigestHex = deriveCampaignInputManifestDigestHex(manifest);
  const generatedAt = (options.now ?? (() => new Date()))();
  let report: NativePegInCausalF2eInputValidationV1
    | NativePegInCausalF2eOperatorHandoffV1;

  if (args.mode === 'validate-input') {
    report = createNativePegInCausalF2eInputValidationV1({
      validatedAt: generatedAt,
      manifestBytes,
    });
    validateNativePegInCausalF2eInputValidationV1(report);
  } else {
    const campaignArgs = parseNativePegInCausalF2dDualOriginCampaignArgs([
      '--mode', 'describe',
      '--out', '<derived-by-handoff>',
      '--frontier-source', required(args.frontierSource, '--frontier-source'),
      '--cargo', required(args.cargo, '--cargo'),
      '--rustc', required(args.rustc, '--rustc'),
      '--git', required(args.git, '--git'),
      '--launcher-path', required(args.launcherPath, '--launcher-path'),
      '--launcher-sha256', required(args.launcherSha256Hex, '--launcher-sha256'),
      '--policy-epoch', required(args.policyEpoch, '--policy-epoch'),
      '--policy-not-before-unix-ms', required(
        args.policyNotBeforeUnixMs,
        '--policy-not-before-unix-ms',
      ),
      '--policy-expires-at-unix-ms', required(
        args.policyExpiresAtUnixMs,
        '--policy-expires-at-unix-ms',
      ),
      ...args.allowedSystemDlls.flatMap(dll => ['--allowed-system-dll', dll]),
    ]);
    if (campaignArgs.errors.length > 0) throw new Error(campaignArgs.errors.join('\n'));
    const brokerSourcePath = resolve(cwd, required(args.brokerSource, '--broker-source'));
    const installerScriptPath = resolve(
      RELAYER_ROOT,
      'native-contained-launcher',
      'scripts',
      'install.ps1',
    );
    const observeDirectoryDependency = options.observeDirectory ?? observeDirectory;
    const frontierSourcePath = observeDirectoryDependency(
      resolve(cwd, required(args.frontierSource, '--frontier-source')),
      'Frontier source',
    );
    const campaignOutputPath = resolveOperatorCampaignOutputPath(
      required(args.campaignOut, '--campaign-out'),
      cwd,
      options.bridgeRoot,
    );
    if (campaignOutputPath === outputPath || existsSync(campaignOutputPath)) {
      throw new Error('F2e campaign output must be a distinct new file');
    }
    const host = (options.observeHost ?? observeWindowsHost)();
    const observeFile = options.observeFile ?? observeRegularFile;
    const brokerSource = observeFile(brokerSourcePath, 'broker source');
    const cargo = observeFile(resolve(cwd, required(args.cargo, '--cargo')), 'cargo');
    const rustc = observeFile(resolve(cwd, required(args.rustc, '--rustc')), 'rustc');
    const git = observeFile(resolve(cwd, required(args.git, '--git')), 'git');
    const observeInstaller = options.observeInstaller ?? observeTrackedInstaller;
    const installerScript = observeInstaller(installerScriptPath, git.path);
    if (brokerSource.sha256Hex !== required(args.launcherSha256Hex, '--launcher-sha256')) {
      throw new Error('F2e broker source digest differs from --launcher-sha256');
    }
    const deriveDeclarations = options.deriveDeclarations ?? defaultDeriveDeclarations;
    const declarations = await deriveDeclarations(campaignArgs, cwd, generatedAt);
    validateNativePegInCausalF2dInstallationDeclarationsV1(declarations);
    const finalManifest = parseCampaignInputManifest(readFileSync(inputPath));
    if (deriveCampaignInputManifestDigestHex(finalManifest) !== manifestDigestHex) {
      throw new Error('F2e campaign input changed during host preflight');
    }
    report = createNativePegInCausalF2eOperatorHandoffV1({
      generatedAt,
      campaignInputPath: inputPath,
      campaignOutputPath,
      campaignInputDigestHex: manifestDigestHex,
      declarations,
      host,
      brokerSource,
      installerScript,
      frontierSourcePath,
      cargo,
      rustc,
      git,
      primaryRpcOrigin: required(args.primaryRpcUrl, '--primary-rpc-url'),
      witnessRpcOrigin: required(args.witnessRpcUrl, '--witness-rpc-url'),
      policyEpoch: canonicalInteger(required(args.policyEpoch, '--policy-epoch')),
      policyNotBeforeUnixMs: canonicalInteger(required(
        args.policyNotBeforeUnixMs,
        '--policy-not-before-unix-ms',
      )),
      policyExpiresAtUnixMs: canonicalInteger(required(
        args.policyExpiresAtUnixMs,
        '--policy-expires-at-unix-ms',
      )),
      allowedSystemDlls: args.allowedSystemDlls,
    });
    validateNativePegInCausalF2eOperatorHandoffV1(report);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`F2e ${args.mode} report written: ${relative(cwd, outputPath)}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log('Boundary: no installation, registry mutation, proof execution, mint, signing, submission, broadcast, Gate 5, trustless, or readiness authority.');
}

export function parseNativePegInCausalF2eOperatorHandoffArgs(argv: string[]): Args {
  return parseArgs(argv);
}

async function defaultDeriveDeclarations(
  args: ReturnType<typeof parseNativePegInCausalF2dDualOriginCampaignArgs>,
  cwd: string,
  generatedAt: Date,
): Promise<NativePegInCausalF2dInstallationDeclarationsV1> {
  const result = await executeNativePegInCausalF2dCampaign({
    args,
    cwd,
    capturedAt: generatedAt,
  });
  validateNativePegInCausalF2dInstallationDeclarationsV1(result);
  return result;
}

function parseArgs(argv: string[]): Args {
  const result: Args = {
    allowedSystemDlls: [],
    help: false,
    errors: [],
  };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') {
      result.help = true;
      continue;
    }
    if (!VALUE_OPTIONS.has(option)) {
      result.errors.push(`unknown option: ${option}`);
      continue;
    }
    const repeatable = option === '--allowed-system-dll';
    if (!repeatable && seen.has(option)) {
      result.errors.push(`${option} may be provided only once`);
      index += 1;
      continue;
    }
    seen.add(option);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      result.errors.push(`${option} requires a value`);
      continue;
    }
    index += 1;
    if (option === '--mode') {
      if (value === 'validate-input' || value === 'host-preflight') result.mode = value;
      else result.errors.push('--mode must be validate-input or host-preflight');
    } else if (option === '--input') result.input = value;
    else if (option === '--out') result.out = value;
    else if (option === '--campaign-out') result.campaignOut = value;
    else if (option === '--broker-source') result.brokerSource = value;
    else if (option === '--primary-rpc-url') result.primaryRpcUrl = value;
    else if (option === '--witness-rpc-url') result.witnessRpcUrl = value;
    else if (option === '--frontier-source') result.frontierSource = value;
    else if (option === '--cargo') result.cargo = value;
    else if (option === '--rustc') result.rustc = value;
    else if (option === '--git') result.git = value;
    else if (option === '--launcher-path') result.launcherPath = value;
    else if (option === '--launcher-sha256') result.launcherSha256Hex = value;
    else if (option === '--policy-epoch') result.policyEpoch = value;
    else if (option === '--policy-not-before-unix-ms') result.policyNotBeforeUnixMs = value;
    else if (option === '--policy-expires-at-unix-ms') result.policyExpiresAtUnixMs = value;
    else result.allowedSystemDlls.push(value);
  }
  if (!result.help) {
    requireParsed(result, 'mode', '--mode');
    requireParsed(result, 'input', '--input');
    requireParsed(result, 'out', '--out');
    if (result.mode === 'host-preflight' || result.mode === undefined) {
      for (const [field, option] of [
        ['brokerSource', '--broker-source'],
        ['campaignOut', '--campaign-out'],
        ['primaryRpcUrl', '--primary-rpc-url'],
        ['witnessRpcUrl', '--witness-rpc-url'],
        ['frontierSource', '--frontier-source'],
        ['cargo', '--cargo'],
        ['rustc', '--rustc'],
        ['git', '--git'],
        ['launcherPath', '--launcher-path'],
        ['launcherSha256Hex', '--launcher-sha256'],
        ['policyEpoch', '--policy-epoch'],
        ['policyNotBeforeUnixMs', '--policy-not-before-unix-ms'],
        ['policyExpiresAtUnixMs', '--policy-expires-at-unix-ms'],
      ] as const) requireParsed(result, field, option);
      if (result.allowedSystemDlls.length === 0) {
        result.errors.push('--allowed-system-dll is required at least once');
      }
    } else {
      for (const [field, option] of [
        ['brokerSource', '--broker-source'],
        ['campaignOut', '--campaign-out'],
        ['primaryRpcUrl', '--primary-rpc-url'],
        ['witnessRpcUrl', '--witness-rpc-url'],
        ['frontierSource', '--frontier-source'],
        ['cargo', '--cargo'],
        ['rustc', '--rustc'],
        ['git', '--git'],
        ['launcherPath', '--launcher-path'],
        ['launcherSha256Hex', '--launcher-sha256'],
        ['policyEpoch', '--policy-epoch'],
        ['policyNotBeforeUnixMs', '--policy-not-before-unix-ms'],
        ['policyExpiresAtUnixMs', '--policy-expires-at-unix-ms'],
      ] as const) {
        if (result[field]) result.errors.push(`${option} applies only to host-preflight mode`);
      }
      if (result.allowedSystemDlls.length > 0) {
        result.errors.push('--allowed-system-dll applies only to host-preflight mode');
      }
    }
  }
  return result;
}

interface WindowsHostObservationDependencies {
  readonly platform?: NodeJS.Platform;
  readonly architecture?: string;
  readonly queryProgramFiles?: () => string;
}

export function observeWindowsHost(
  dependencies: WindowsHostObservationDependencies = {},
): NativePegInCausalF2eHostObservationV1 {
  const platform = dependencies.platform ?? process.platform;
  const architecture = dependencies.architecture ?? process.arch;
  if (platform !== 'win32' || architecture !== 'x64') {
    throw new Error('F2e host preflight requires a 64-bit Windows x64 Node process');
  }
  const output = (dependencies.queryProgramFiles ?? (() => execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)',
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 4_096,
    },
  )))();
  const lines = output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (lines.length !== 1) throw new Error('64-bit Program Files known-folder query failed');
  return {
    platform: 'win32',
    architecture: 'x64',
    process64Bit: true,
    programFilesX64Path: resolve(lines[0]),
    knownFolderSource: 'dotnet-special-folder-program-files',
  };
}

interface TrackedInstallerBindingInput {
  readonly file: NativePegInCausalF2eFileIdentityV1;
  readonly repositoryRoot: string;
  readonly expectedRepositoryRoot: string;
  readonly repositoryCommitHex: string;
  readonly trackedBytes: Buffer;
}

export function bindTrackedInstallerObservation(input: TrackedInstallerBindingInput) {
  if (resolve(input.repositoryRoot) !== resolve(input.expectedRepositoryRoot)) {
    throw new Error('F2e installer source is not in the expected bridge worktree');
  }
  if (!/^[0-9a-f]{40}$/.test(input.repositoryCommitHex)) {
    throw new Error('F2e installer repository commit must be a full lowercase Git commit ID');
  }
  const trackedBlobSha256Hex = `0x${createHash('sha256')
    .update(input.trackedBytes)
    .digest('hex')}`;
  if (input.file.sha256Hex !== trackedBlobSha256Hex) {
    throw new Error('F2e installer worktree bytes differ from the tracked HEAD bytes');
  }
  return {
    ...input.file,
    repositoryCommitHex: input.repositoryCommitHex,
    trackedBlobSha256Hex,
  };
}

function observeRegularFile(path: string, label: string): NativePegInCausalF2eFileIdentityV1 {
  const link = lstatSync(path);
  if (link.isSymbolicLink() || !link.isFile()) {
    throw new Error(`${label} must be a regular non-symbolic-link file`);
  }
  const before = statSync(path);
  const bytes = readFileSync(path);
  const after = statSync(path);
  if (
    before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
    || before.size !== bytes.length
  ) throw new Error(`${label} changed while it was inspected`);
  return {
    path,
    sizeBytes: bytes.length,
    sha256Hex: `0x${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function observeTrackedInstaller(path: string, gitExecutablePath: string) {
  const file = observeRegularFile(path, 'installer script');
  const repositoryRoot = execFileSync(gitExecutablePath, [
    '-C',
    BRIDGE_ROOT,
    'rev-parse',
    '--show-toplevel',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 4_096,
  }).trim();
  const expectedRepositoryRoot = resolve(BRIDGE_ROOT, '..');
  const repositoryCommitHex = execFileSync(gitExecutablePath, [
    '-C',
    repositoryRoot,
    'rev-parse',
    'HEAD',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 4_096,
  }).trim();
  const trackedBytes = execFileSync(gitExecutablePath, [
    '-C',
    repositoryRoot,
    'show',
    `${repositoryCommitHex}:ergo-sidechain-bridge/relayer/native-contained-launcher/scripts/install.ps1`,
  ], {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  return bindTrackedInstallerObservation({
    file,
    repositoryRoot,
    expectedRepositoryRoot,
    repositoryCommitHex,
    trackedBytes,
  });
}

function observeDirectory(path: string, label: string): string {
  const link = lstatSync(path);
  if (link.isSymbolicLink() || !link.isDirectory()) {
    throw new Error(`${label} must be a non-symbolic-link directory`);
  }
  return path;
}

function resolveOperatorCampaignOutputPath(
  target: string,
  cwd: string,
  bridgeRoot?: string,
): string {
  const root = resolve(bridgeRoot ?? BRIDGE_ROOT);
  const outputPath = resolveProvisioningOutputPath(target, { cwd, bridgeRoot: root });
  const localRoot = resolve(root, '.operator-campaign');
  const relativePath = relative(localRoot, outputPath);
  if (
    relativePath === ''
    || relativePath.startsWith('..')
    || resolve(localRoot, relativePath) !== outputPath
  ) throw new Error('--out and --campaign-out must resolve under .operator-campaign');
  return outputPath;
}

function canonicalInteger(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('F2e numeric arguments must use canonical non-negative integers');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('F2e numeric argument exceeds safe range');
  return parsed;
}

function requireParsed(result: Args, field: keyof Args, option: string): void {
  if (!result[field]) result.errors.push(`${option} is required`);
}

function required(value: string | undefined, option: string): string {
  if (!value) throw new Error(`${option} is required`);
  return value;
}

if (process.argv[1] && SCRIPT_PATH === process.argv[1]) {
  runNativePegInCausalF2eOperatorHandoffCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
