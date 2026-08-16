import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  resolveBridgeRepositoryLayout,
  type BridgeRepositoryMode,
} from './bridge-repository-layout.js';

export const PUBLIC_AUDIT_ALPHA_MANIFEST_PATH = 'docs/public-audit-alpha-manifest.json';
export const PUBLIC_AUDIT_ALPHA_SCHEMA = 2;
export const PUBLIC_AUDIT_ALPHA_KIND = 'ergo-sidechain-bridge-public-audit-alpha-manifest';
export const PUBLIC_AUDIT_ALPHA_OPEN_GAPS_SHA256 =
  '40593f04f4cfc454059ff58d60b0d17c6059832166f7e3ccfaf1ec6f2d4c943b';
export const PUBLIC_AUDIT_ALPHA_OPENZEPPELIN_LICENSE_SHA256 =
  '20aebc68b11c063133aa2af0ef4bb29875477c6d16d715718f0daec563938b84';

const OPENZEPPELIN_LICENSE_PATH =
  'solidity/THIRD_PARTY_LICENSES/OpenZeppelin-Contracts-5.6.1.txt';

export const PUBLIC_AUDIT_ALPHA_VALIDATION_STEPS = [
  { id: 'preflight-entry', command: 'npm run audit:alpha:preflight' },
  { id: 'source-lock', command: 'npm run sources:verify:lock' },
  { id: 'standalone-consensus-workflow', command: 'npm run sources:verify:workflow' },
  { id: 'clean-checkout', command: 'npm run check:clean-checkout' },
  { id: 'release-structure', command: 'npm run audit:alpha:release-structure' },
  { id: 'signer-unavailable-drill', command: 'npm run operator:drill:signer-unavailable' },
  { id: 'peg-in-mint-no-transport', command: 'npm run operator:drill:peg-in-mint-transport' },
  { id: 'recovery-drill', command: 'npm run operator:drill:recovery' },
  { id: 'alert-delivery-drill', command: 'npm run operator:drill:alerts' },
  { id: 'preflight-final', command: 'npm run audit:alpha:preflight' },
] as const;

const REQUIRED_ARTIFACTS = [
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'solidity/LICENSE',
  OPENZEPPELIN_LICENSE_PATH,
  '.gitattributes',
  '.gitignore',
  '.gitmodules',
  '.github/workflows/relayer-checks.yml',
  'docs/public-audit-alpha.md',
  'docs/public-audit-alpha-manifest.json',
  'docs/layered-reference-architecture.md',
  'docs/aggregate-settlement-threat-model.md',
  'docs/consensus-source-baseline.md',
  'docs/operator-runbooks.md',
  'docs/tier1-gap-analysis.md',
  'phases/bridge-execution-plan.md',
  'relayer/package.json',
  'relayer/.npmignore',
  'relayer/src/public-audit-alpha-bundle.ts',
  'relayer/src/scripts/public-audit-alpha-bundle.ts',
  'relayer/src/validity-application-pooled-reserve-replay-cutover-v6.ts',
  'relayer/src/validity-application-pooled-reserve-provisioning-v6.ts',
  'relayer/src/validity-application-pooled-reserve-legacy-route-requirements-v6.ts',
  'relayer/src/validity-application-pooled-reserve-cutover-eligibility-v6.ts',
  'relayer/src/validity-application-pooled-reserve-target-check-request-v6.ts',
  'relayer/src/validity-application-pooled-reserve-funds-authority-switch-precondition-v6.ts',
  'sources/consensus-source-lock.json',
  'contracts/README.md',
] as const;

const REQUIRED_GAP_IDS = [
  'gate5-native-profile-activation',
  'historical-authority-cutover',
  'key-rotation-member-loss',
  'current-head-non-mainnet-recovery-evidence',
  'independent-security-review',
  'current-head-clean-checkout-evidence',
  'standalone-consensus-hosted-run-evidence',
  'external-alert-delivery-acknowledgement-and-live-recovery-evidence',
] as const;

const FORBIDDEN_TRACKED_PATHS = ['contracts/deployed_state.json'] as const;

const REQUIRED_AUTHORITY = {
  scope: 'audit-command-only',
  liveChainRpcAllowed: false,
  operatorOrPersistentKeySigningAllowed: false,
  externalSubmissionAllowed: false,
  externalBroadcastAllowed: false,
  deploymentAllowed: false,
  liveFundsAllowed: false,
  ephemeralTestSigningExpected: true,
  mockTransportExpected: true,
  gate5Closed: false,
} as const;

const REQUIRED_CLAIM_BOUNDARIES = [
  'This source package may be published for public research and external review only after exact promotion checks pass; it is not a supported release.',
  'Independent security review is open.',
  'Gate 5 is open.',
  'No trustless bridge claim is supported.',
  'Production-ready and mainnet-readiness claims remain blocked.',
  'The audit command does not contact chain RPCs, use operator or persistent keys, submit or broadcast externally, deploy, or move funds.',
  'The tracked demo:devnet:consolidate-rewards utility is separately invoked, restricted to the patched loopback devnet, outside daemon composition, and never invoked by the audit command.',
  'The bounded test suite may use ephemeral test keys and in-memory or mock transports.',
] as const;

export interface PublicAuditAlphaPreflightReport {
  schemaVersion: 2;
  kind: 'ergo-sidechain-bridge-public-audit-alpha-preflight';
  status: 'PASS' | 'BLOCKED';
  classification: 'public-research-alpha';
  sourcePublicationPolicy: 'permitted-after-promotion';
  supportedReleaseStatus: 'blocked';
  independentReviewStatus: 'open';
  repositoryMode: BridgeRepositoryMode | null;
  errors: string[];
  checks: {
    manifestValid: boolean;
    requiredArtifactsTracked: boolean;
    pinnedLicenseArtifactsExact: boolean;
    runtimeStateUntracked: boolean;
    broadcastDisabled: boolean;
    worktreeMatchesIndex: boolean;
    untrackedSourceAbsent: boolean;
    recursiveFrontierCheckoutExact: boolean;
  };
  candidate: {
    headCommit: string | null;
    repositoryIndexInventorySha256: string | null;
  };
  authority: {
    scope: 'audit-command-only';
    chainRpcContacted: false;
    operatorOrPersistentKeySigningPerformed: false;
    externalSubmissionPerformed: false;
    externalBroadcastPerformed: false;
    deploymentPerformed: false;
    liveFundsMoved: false;
    testSuiteMayUseEphemeralKeys: true;
    testSuiteMayUseMockTransport: true;
  };
}

export function comparePublicAuditAlphaCandidateIdentity(
  entry: PublicAuditAlphaPreflightReport['candidate'],
  final: PublicAuditAlphaPreflightReport['candidate'],
): string[] {
  const errors: string[] = [];
  if (entry.headCommit === null || final.headCommit !== entry.headCommit) {
    errors.push('HEAD commit changed during the audit');
  }
  if (
    entry.repositoryIndexInventorySha256 === null
    || final.repositoryIndexInventorySha256 !== entry.repositoryIndexInventorySha256
  ) {
    errors.push('repository index inventory changed during the audit');
  }
  return errors;
}

export function validateOpenZeppelinLicenseArtifact(input: Uint8Array): string[] {
  const digest = createHash('sha256').update(input).digest('hex');
  return digest === PUBLIC_AUDIT_ALPHA_OPENZEPPELIN_LICENSE_SHA256
    ? []
    : ['OpenZeppelin Contracts 5.6.1 license artifact must match the pinned SHA-256'];
}

export function validatePublicAuditAlphaManifest(input: unknown): string[] {
  const errors: string[] = [];
  const manifest = asRecord(input);
  if (!manifest) return ['public audit alpha manifest must be an object'];

  requireExact(errors, manifest.schemaVersion, PUBLIC_AUDIT_ALPHA_SCHEMA, 'schemaVersion');
  requireExact(errors, manifest.kind, PUBLIC_AUDIT_ALPHA_KIND, 'kind');
  requireExact(errors, manifest.classification, 'public-research-alpha', 'classification');
  requireExact(
    errors,
    manifest.sourcePublicationPolicy,
    'permitted-after-promotion',
    'sourcePublicationPolicy',
  );
  requireExact(errors, manifest.supportedReleaseStatus, 'blocked', 'supportedReleaseStatus');
  requireExact(errors, manifest.independentReviewStatus, 'open', 'independentReviewStatus');
  requireExact(errors, manifest.validationCommand, 'npm run audit:alpha', 'validationCommand');

  const authority = asRecord(manifest.authority);
  if (!authority) {
    errors.push('authority must be an object');
  } else if (JSON.stringify(authority) !== JSON.stringify(REQUIRED_AUTHORITY)) {
    errors.push('authority must match the fixed no-live-capability boundary');
  }

  requireExactStringArray(errors, manifest.implementedSlices, [
    'WP-08A',
    'WP-08B',
    'WP-08C',
    'WP-08D',
    'WP-08E',
    'WP-08F',
    'WP-08G',
    'WP-08H',
    'WP-08I',
    'WP-08J',
    'WP-08K',
    'WP-08L',
  ], 'implementedSlices');
  requireExactStringArray(errors, manifest.requiredArtifacts, [...REQUIRED_ARTIFACTS], 'requiredArtifacts');

  if (JSON.stringify(manifest.validationSteps) !== JSON.stringify(PUBLIC_AUDIT_ALPHA_VALIDATION_STEPS)) {
    errors.push('validationSteps must match the fixed non-broadcast audit sequence');
  }

  const gaps = Array.isArray(manifest.openGaps) ? manifest.openGaps.map(asRecord) : [];
  if (gaps.length !== REQUIRED_GAP_IDS.length || gaps.some(gap => !gap)) {
    errors.push('openGaps must contain the exact required gap set');
  } else {
    const ids = gaps.map(gap => gap!.id);
    if (JSON.stringify(ids) !== JSON.stringify(REQUIRED_GAP_IDS)) {
      errors.push('openGaps must preserve the canonical ordered gap IDs');
    }
    for (const gap of gaps) {
      if (!gap) continue;
      if (gap.severity !== 'critical' && gap.severity !== 'high') {
        errors.push(`${String(gap.id)} severity must be critical or high`);
      }
      if (gap.status !== 'open' && gap.status !== 'blocked') {
        errors.push(`${String(gap.id)} status must be open or blocked`);
      }
      for (const field of ['ownerRole', 'claimImpact', 'nextAction']) {
        if (typeof gap[field] !== 'string' || gap[field].trim().length < 12) {
          errors.push(`${String(gap.id)} ${field} must be concrete`);
        }
      }
    }
    const openGapsSha256 = createHash('sha256')
      .update(JSON.stringify(manifest.openGaps))
      .digest('hex');
    if (openGapsSha256 !== PUBLIC_AUDIT_ALPHA_OPEN_GAPS_SHA256) {
      errors.push('openGaps must match the reviewed owner, claim-impact, and next-action ledger');
    }
  }

  if (JSON.stringify(manifest.claimBoundaries) !== JSON.stringify(REQUIRED_CLAIM_BOUNDARIES)) {
    errors.push('claimBoundaries must match the fixed ordered non-claim set');
  }

  return errors;
}

export function inspectPublicAuditAlphaPreflight(input: {
  bridgeRoot: string;
  environment?: NodeJS.ProcessEnv;
  gitExecutablePath?: string;
}): PublicAuditAlphaPreflightReport {
  const bridgeRoot = path.resolve(input.bridgeRoot);
  const environment = input.environment ?? process.env;
  const gitEnvironment = createPublicAuditGitEnvironment(environment);
  const gitExecutablePath = input.gitExecutablePath ?? 'git';
  const errors: string[] = [];
  let repositoryMode: BridgeRepositoryMode | null = null;
  let headCommit: string | null = null;
  let repositoryIndexInventorySha256: string | null = null;
  let worktreeMatchesIndex = false;
  let untrackedSourceAbsent = false;
  let recursiveFrontierCheckoutExact = false;

  const manifestPath = path.join(bridgeRoot, PUBLIC_AUDIT_ALPHA_MANIFEST_PATH);
  let manifestErrors: string[] = [];
  if (!existsSync(manifestPath)) {
    manifestErrors = ['public audit alpha manifest is missing'];
  } else {
    try {
      manifestErrors = validatePublicAuditAlphaManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
    } catch {
      manifestErrors = ['public audit alpha manifest is not valid JSON'];
    }
  }
  errors.push(...manifestErrors);

  let trackedPaths = new Set<string>();
  try {
    const repositoryRoot = discoverPublicAuditRepositoryRoot(
      bridgeRoot,
      gitExecutablePath,
      gitEnvironment,
    );
    repositoryMode = resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot }).mode;
    trackedPaths = new Set(
      execFileSync(gitExecutablePath, ['-C', bridgeRoot, 'ls-files', '-z'], {
        encoding: 'utf8',
        env: gitEnvironment,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }).split('\0').filter(Boolean).map(toPosix),
    );

    const candidate = inspectAuditGitCandidate({
      repositoryRoot,
      bridgeRoot,
      environment: gitEnvironment,
      gitExecutablePath,
    });
    headCommit = candidate.headCommit;
    repositoryIndexInventorySha256 = candidate.repositoryIndexInventorySha256;
    worktreeMatchesIndex = candidate.worktreeMatchesIndex;
    untrackedSourceAbsent = candidate.untrackedSourceAbsent;
    if (!worktreeMatchesIndex) errors.push('audit source differs from the Git index');
    if (!untrackedSourceAbsent) errors.push('audit source contains untracked non-ignored files');

    recursiveFrontierCheckoutExact = inspectRecursiveFrontierCheckout({
      bridgeRoot,
      environment: gitEnvironment,
      gitExecutablePath,
    });
    if (!recursiveFrontierCheckoutExact) {
      errors.push('recursive Frontier checkout must be clean and match the indexed gitlink');
    }
  } catch {
    errors.push('tracked bridge source inventory is unavailable');
  }

  const missingArtifacts = REQUIRED_ARTIFACTS.filter(pathValue => !trackedPaths.has(pathValue));
  errors.push(...missingArtifacts.map(pathValue => `required audit artifact is not tracked: ${pathValue}`));

  const openZeppelinLicensePath = path.join(bridgeRoot, OPENZEPPELIN_LICENSE_PATH);
  const pinnedLicenseArtifactErrors = existsSync(openZeppelinLicensePath)
    ? validateOpenZeppelinLicenseArtifact(readFileSync(openZeppelinLicensePath))
    : ['OpenZeppelin Contracts 5.6.1 license artifact is missing'];
  errors.push(...pinnedLicenseArtifactErrors);

  const trackedRuntimeState = FORBIDDEN_TRACKED_PATHS.filter(pathValue => trackedPaths.has(pathValue));
  errors.push(...trackedRuntimeState.map(pathValue => `runtime state must not be tracked: ${pathValue}`));

  const broadcastDisabled = !isEnablingValue(environment.BRIDGE_BROADCAST_ENABLED);
  if (!broadcastDisabled) errors.push('audit preflight requires bridge broadcast to remain disabled');

  return {
    schemaVersion: 2,
    kind: 'ergo-sidechain-bridge-public-audit-alpha-preflight',
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    classification: 'public-research-alpha',
    sourcePublicationPolicy: 'permitted-after-promotion',
    supportedReleaseStatus: 'blocked',
    independentReviewStatus: 'open',
    repositoryMode,
    errors,
    checks: {
      manifestValid: manifestErrors.length === 0,
      requiredArtifactsTracked: missingArtifacts.length === 0,
      pinnedLicenseArtifactsExact: pinnedLicenseArtifactErrors.length === 0,
      runtimeStateUntracked: trackedRuntimeState.length === 0,
      broadcastDisabled,
      worktreeMatchesIndex,
      untrackedSourceAbsent,
      recursiveFrontierCheckoutExact,
    },
    candidate: {
      headCommit,
      repositoryIndexInventorySha256,
    },
    authority: {
      scope: 'audit-command-only',
      chainRpcContacted: false,
      operatorOrPersistentKeySigningPerformed: false,
      externalSubmissionPerformed: false,
      externalBroadcastPerformed: false,
      deploymentPerformed: false,
      liveFundsMoved: false,
      testSuiteMayUseEphemeralKeys: true,
      testSuiteMayUseMockTransport: true,
    },
  };
}

export function inspectAuditGitCandidate(input: {
  repositoryRoot: string;
  bridgeRoot: string;
  environment?: NodeJS.ProcessEnv;
  gitExecutablePath?: string;
}): {
  headCommit: string;
  repositoryIndexInventorySha256: string;
  worktreeMatchesIndex: boolean;
  untrackedSourceAbsent: boolean;
} {
  const gitExecutablePath = input.gitExecutablePath ?? 'git';
  const environment = createPublicAuditGitEnvironment(input.environment ?? process.env);
  const headCommit = execFileSync(
    gitExecutablePath,
    ['-C', input.repositoryRoot, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  ).trim().toLowerCase();
  const indexInventory = execFileSync(
    gitExecutablePath,
    ['-C', input.repositoryRoot, 'ls-files', '--stage', '-z'],
    { encoding: 'buffer', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );

  let worktreeMatchesIndex = false;
  try {
    execFileSync(gitExecutablePath, ['-C', input.repositoryRoot, 'diff', '--quiet'], {
      env: environment,
      stdio: 'ignore',
      windowsHide: true,
    });
    worktreeMatchesIndex = true;
  } catch {
    worktreeMatchesIndex = false;
  }

  const untrackedSource = execFileSync(
    gitExecutablePath,
    ['-C', input.bridgeRoot, 'ls-files', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  ).split('\0').filter(Boolean);

  return {
    headCommit,
    repositoryIndexInventorySha256: createHash('sha256').update(indexInventory).digest('hex'),
    worktreeMatchesIndex,
    untrackedSourceAbsent: untrackedSource.length === 0,
  };
}

export function inspectRecursiveFrontierCheckout(input: {
  bridgeRoot: string;
  environment?: NodeJS.ProcessEnv;
  gitExecutablePath?: string;
}): boolean {
  const gitExecutablePath = input.gitExecutablePath ?? 'git';
  const environment = createPublicAuditGitEnvironment(input.environment ?? process.env);
  try {
    const gitlink = execFileSync(
      gitExecutablePath,
      ['-C', input.bridgeRoot, 'ls-files', '--stage', '--', 'substrate-node'],
      { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    ).trim();
    const match = /^160000\s+([0-9a-f]{40})\s+0\tsubstrate-node$/i.exec(gitlink);
    if (!match) return false;

    const checkoutRoot = path.join(input.bridgeRoot, 'substrate-node');
    if (!existsSync(path.join(checkoutRoot, '.git'))) return false;
    const resolvedRoot = execFileSync(
      gitExecutablePath,
      ['-C', checkoutRoot, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    ).trim();
    if (!samePath(resolvedRoot, checkoutRoot)) return false;

    const checkoutHead = execFileSync(
      gitExecutablePath,
      ['-C', checkoutRoot, 'rev-parse', 'HEAD'],
      { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    ).trim();
    if (checkoutHead.toLowerCase() !== match[1].toLowerCase()) return false;

    const status = execFileSync(
      gitExecutablePath,
      ['-C', checkoutRoot, 'status', '--porcelain', '--untracked-files=all'],
      { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    ).trim();
    return status.length === 0;
  } catch {
    return false;
  }
}

export function createPublicAuditGitEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase().startsWith('GIT_')) delete environment[key];
  }
  environment.GIT_CONFIG_COUNT = '1';
  environment.GIT_CONFIG_KEY_0 = 'core.autocrlf';
  environment.GIT_CONFIG_VALUE_0 = process.platform === 'win32' ? 'true' : 'false';
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_TERMINAL_PROMPT = '0';
  return environment;
}

function discoverPublicAuditRepositoryRoot(
  bridgeRoot: string,
  gitExecutablePath: string,
  environment: NodeJS.ProcessEnv,
): string {
  const output = execFileSync(
    gitExecutablePath,
    ['-C', bridgeRoot, 'rev-parse', '--show-toplevel'],
    {
      encoding: 'utf8',
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  ).trim();
  if (output.length === 0) throw new Error('Git repository root is unavailable');
  const repositoryRoot = path.resolve(output);
  resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot });
  return repositoryRoot;
}

function isEnablingValue(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false;
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireExact(
  errors: string[],
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) errors.push(`${label} must be ${String(expected)}`);
}

function requireExactStringArray(
  errors: string[],
  actual: unknown,
  expected: string[],
  label: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label} must preserve the exact ordered values`);
  }
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
