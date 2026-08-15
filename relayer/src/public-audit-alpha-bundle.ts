import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  resolveBridgeRepositoryLayout,
  type BridgeRepositoryMode,
} from './bridge-repository-layout.js';
import { createPublicAuditGitEnvironment } from './public-audit-alpha.js';

export const PUBLIC_AUDIT_ALPHA_BUNDLE_SCHEMA = 2;
export const PUBLIC_AUDIT_ALPHA_BUNDLE_KIND =
  'ergo-sidechain-bridge-public-audit-alpha-bundle';
export const PUBLIC_AUDIT_ALPHA_BUNDLE_REF = 'refs/heads/public-audit-alpha';

const PUBLIC_AUTHOR_NAME = 'A. Shannon';
const PUBLIC_AUTHOR_EMAIL = 'a.shannon@users.noreply.github.com';

export interface PublicAuditAlphaBundleReport {
  schemaVersion: 2;
  kind: 'ergo-sidechain-bridge-public-audit-alpha-bundle';
  classification: 'public-research-alpha';
  sourcePublicationPolicy: 'permitted-after-promotion';
  sourcePromotionStatus: 'unverified';
  supportedReleaseStatus: 'blocked';
  independentReviewStatus: 'open';
  source: {
    repositoryMode: BridgeRepositoryMode;
    headCommit: string;
    repositoryIndexInventorySha256: string;
    bridgeTree: string;
    frontierGitlinkCommit: string;
    commitUnixTime: number;
  };
  bundle: {
    fileName: string;
    reportFileName: string;
    ref: 'refs/heads/public-audit-alpha';
    standaloneCommit: string;
    standaloneTree: string;
    sha256: string;
    bytes: number;
  };
  authority: {
    scope: 'bundle-construction-only';
    trackedBridgeTreeOnly: true;
    untrackedFilesIncluded: false;
    chainRpcContacted: false;
    signingPerformed: false;
    submissionPerformed: false;
    broadcastPerformed: false;
    deploymentPerformed: false;
    liveFundsMoved: false;
  };
  claimBoundaries: readonly [
    'This bundle is an unverified review artifact; source publication requires separate exact-candidate promotion checks and does not create a supported release.',
    'Independent security review is open.',
    'Gate 5 is open.',
    'No trustless, production-ready, or mainnet-ready claim is supported.',
    'The bundle contains a separately invoked, loopback devnet-only reward consolidation utility; bundle construction and audit do not invoke it.',
    'Independent review and promotion checks remain separate.',
  ];
}

export interface CreatePublicAuditAlphaBundleInput {
  bridgeRoot: string;
  outputPath: string;
  expectedCandidate?: {
    headCommit: string;
    repositoryIndexInventorySha256: string;
  };
  gitExecutablePath?: string;
  beforePublish?: () => void;
}

interface DirectoryIdentity {
  realPath: string;
  device: bigint;
  inode: bigint;
}

export function createPublicAuditAlphaBundle(
  input: CreatePublicAuditAlphaBundleInput,
): PublicAuditAlphaBundleReport {
  const gitExecutablePath = input.gitExecutablePath ?? 'git';
  const bridgeRoot = path.resolve(input.bridgeRoot);
  const sourceGitEnvironment = createPublicAuditGitEnvironment();
  const repositoryRoot = discoverSourceRepositoryRoot(
    bridgeRoot,
    gitExecutablePath,
    sourceGitEnvironment,
  );
  const layout = resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot });
  const requestedOutputPath = path.resolve(input.outputPath);

  if (path.extname(requestedOutputPath).toLowerCase() !== '.bundle') {
    throw new Error('public audit alpha bundle output must use the .bundle extension');
  }

  const outputDirectory = resolveProspectivePath(path.dirname(requestedOutputPath));
  mkdirSync(outputDirectory, { recursive: true });
  const outputDirectoryIdentity = captureDirectoryIdentity(outputDirectory, 'output directory');
  const canonicalOutputDirectory = outputDirectoryIdentity.realPath;
  const outputPath = path.join(canonicalOutputDirectory, path.basename(requestedOutputPath));
  const reportPath = `${outputPath}.json`;
  const canonicalRepositoryRoot = realpathSync.native(repositoryRoot);
  if (isWithin(canonicalRepositoryRoot, outputPath) || isWithin(canonicalRepositoryRoot, reportPath)) {
    throw new Error('public audit alpha bundle output must be outside the source repository');
  }

  assertStableOutputDirectory(outputDirectoryIdentity, canonicalRepositoryRoot);
  assertCommittedSourceCandidate(repositoryRoot, gitExecutablePath, sourceGitEnvironment);
  const entryCandidate = inspectSourceCandidate(
    repositoryRoot,
    gitExecutablePath,
    sourceGitEnvironment,
  );
  if (input.expectedCandidate) {
    assertExactCandidate(input.expectedCandidate, entryCandidate);
  }

  const bridgeTree = revParse(
    repositoryRoot,
    layout.mode === 'standalone'
      ? `${entryCandidate.headCommit}^{tree}`
      : `${entryCandidate.headCommit}:ergo-sidechain-bridge`,
    gitExecutablePath,
    sourceGitEnvironment,
  );
  const frontierGitlinkCommit = readGitlinkCommit({
    repositoryRoot,
    sourceCommit: entryCandidate.headCommit,
    gitlinkPath: layout.frontierGitlinkPath,
    gitExecutablePath,
    environment: sourceGitEnvironment,
  });
  const commitUnixTime = Number(runGit(
    repositoryRoot,
    ['show', '-s', '--format=%ct', entryCandidate.headCommit],
    gitExecutablePath,
    sourceGitEnvironment,
  ));
  if (!Number.isSafeInteger(commitUnixTime) || commitUnixTime <= 0) {
    throw new Error('source commit timestamp is invalid');
  }

  const scratchRoot = mkdtempSync(path.join(tmpdir(), 'bridge-public-audit-alpha-'));
  const scratchRootIdentity = captureDirectoryIdentity(scratchRoot, 'scratch directory');
  assertStableOutputDirectory(outputDirectoryIdentity, canonicalRepositoryRoot);
  const publishScratchRoot = mkdtempSync(path.join(
    canonicalOutputDirectory,
    '.bridge-public-audit-alpha-',
  ));
  const publishScratchIdentity = captureDirectoryIdentity(
    publishScratchRoot,
    'publish scratch directory',
  );
  const bareRepository = path.join(scratchRootIdentity.realPath, 'candidate.git');
  const scratchBundle = path.join(scratchRootIdentity.realPath, 'candidate.bundle');
  const stagedBundle = path.join(publishScratchIdentity.realPath, 'candidate.bundle');
  const stagedReport = path.join(publishScratchIdentity.realPath, 'candidate.bundle.json');
  const isolatedGlobalConfig = path.join(scratchRootIdentity.realPath, 'empty-global-gitconfig');
  try {
    assertPublishScratchLocation(
      publishScratchIdentity,
      outputDirectoryIdentity,
      canonicalRepositoryRoot,
    );
    writeFileSync(isolatedGlobalConfig, '');
    const scratchGitEnvironment = isolatedGitEnvironment(isolatedGlobalConfig);
    runGitRaw(
      ['init', '--bare', '--object-format=sha1', bareRepository],
      gitExecutablePath,
      scratchGitEnvironment,
    );
    runGitRaw([
      `--git-dir=${bareRepository}`,
      'fetch',
      '--depth=1',
      '--no-tags',
      repositoryRoot,
      entryCandidate.headCommit,
    ], gitExecutablePath, scratchGitEnvironment);

    const standaloneCommit = execFileSync(
      gitExecutablePath,
      [
        '-c',
        'i18n.commitEncoding=utf-8',
        '-c',
        'commit.gpgSign=false',
        `--git-dir=${bareRepository}`,
        'commit-tree',
        bridgeTree,
      ],
      {
        encoding: 'utf8',
        input: buildStandaloneCommitMessage(entryCandidate.headCommit, bridgeTree),
        env: deterministicCommitEnvironment(commitUnixTime, isolatedGlobalConfig),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    ).trim().toLowerCase();
    assertObjectId(standaloneCommit, 'standalone commit');

    runGitRaw([
      `--git-dir=${bareRepository}`,
      'update-ref',
      PUBLIC_AUDIT_ALPHA_BUNDLE_REF,
      standaloneCommit,
    ], gitExecutablePath, scratchGitEnvironment);
    runGitRaw([
      `--git-dir=${bareRepository}`,
      'bundle',
      'create',
      scratchBundle,
      PUBLIC_AUDIT_ALPHA_BUNDLE_REF,
    ], gitExecutablePath, scratchGitEnvironment);
    runGitRaw(
      [`--git-dir=${bareRepository}`, 'bundle', 'verify', scratchBundle],
      gitExecutablePath,
      scratchGitEnvironment,
    );

    const standaloneTree = runGitFromBare(
      bareRepository,
      ['rev-parse', `${standaloneCommit}^{tree}`],
      gitExecutablePath,
      scratchGitEnvironment,
    ).toLowerCase();
    assertObjectId(standaloneTree, 'standalone tree');
    if (standaloneTree !== bridgeTree) {
      throw new Error('standalone bundle tree differs from the source bridge tree');
    }

    const finalCandidate = inspectSourceCandidate(
      repositoryRoot,
      gitExecutablePath,
      sourceGitEnvironment,
    );
    assertExactCandidate(entryCandidate, finalCandidate);
    input.beforePublish?.();
    const publishCandidate = inspectSourceCandidate(
      repositoryRoot,
      gitExecutablePath,
      sourceGitEnvironment,
    );
    assertExactCandidate(entryCandidate, publishCandidate);

    const bundleBytes = readFileSync(scratchBundle);
    const report: PublicAuditAlphaBundleReport = {
      schemaVersion: PUBLIC_AUDIT_ALPHA_BUNDLE_SCHEMA,
      kind: PUBLIC_AUDIT_ALPHA_BUNDLE_KIND,
      classification: 'public-research-alpha',
      sourcePublicationPolicy: 'permitted-after-promotion',
      sourcePromotionStatus: 'unverified',
      supportedReleaseStatus: 'blocked',
      independentReviewStatus: 'open',
      source: {
        repositoryMode: layout.mode,
        headCommit: entryCandidate.headCommit,
        repositoryIndexInventorySha256: entryCandidate.repositoryIndexInventorySha256,
        bridgeTree,
        frontierGitlinkCommit,
        commitUnixTime,
      },
      bundle: {
        fileName: path.basename(outputPath),
        reportFileName: path.basename(reportPath),
        ref: PUBLIC_AUDIT_ALPHA_BUNDLE_REF,
        standaloneCommit,
        standaloneTree,
        sha256: createHash('sha256').update(bundleBytes).digest('hex'),
        bytes: bundleBytes.length,
      },
      authority: {
        scope: 'bundle-construction-only',
        trackedBridgeTreeOnly: true,
        untrackedFilesIncluded: false,
        chainRpcContacted: false,
        signingPerformed: false,
        submissionPerformed: false,
        broadcastPerformed: false,
        deploymentPerformed: false,
        liveFundsMoved: false,
      },
      claimBoundaries: [
        'This bundle is an unverified review artifact; source publication requires separate exact-candidate promotion checks and does not create a supported release.',
        'Independent security review is open.',
        'Gate 5 is open.',
        'No trustless, production-ready, or mainnet-ready claim is supported.',
        'The bundle contains a separately invoked, loopback devnet-only reward consolidation utility; bundle construction and audit do not invoke it.',
        'Independent review and promotion checks remain separate.',
      ],
    };

    assertStableOutputDirectory(outputDirectoryIdentity, canonicalRepositoryRoot);
    assertPublishScratchLocation(
      publishScratchIdentity,
      outputDirectoryIdentity,
      canonicalRepositoryRoot,
    );
    writeFileSync(stagedBundle, bundleBytes, { flag: 'wx' });
    writeFileSync(stagedReport, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    assertStableOutputDirectory(outputDirectoryIdentity, canonicalRepositoryRoot);
    assertPublishScratchLocation(
      publishScratchIdentity,
      outputDirectoryIdentity,
      canonicalRepositoryRoot,
    );
    assertCompatibleExistingFile(stagedBundle, outputPath, 'bundle');
    assertCompatibleExistingFile(stagedReport, reportPath, 'report');
    publishExactFile(stagedReport, reportPath, 'report');
    publishExactFile(stagedBundle, outputPath, 'bundle');
    return report;
  } finally {
    removeScratchDirectoryIfUnchanged(publishScratchIdentity);
    removeScratchDirectoryIfUnchanged(scratchRootIdentity);
  }
}

export function parsePublicAuditAlphaBundleArgs(argv: string[]): { outputPath: string } {
  let outputPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--out') throw new Error(`unknown argument: ${argument}`);
    if (outputPath !== undefined) throw new Error('--out may be supplied only once');
    outputPath = argv[index + 1];
    if (!outputPath || outputPath.startsWith('--')) {
      throw new Error('--out requires a bundle path');
    }
    index += 1;
  }
  if (!outputPath) throw new Error('--out is required');
  return { outputPath };
}

function discoverSourceRepositoryRoot(
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

function inspectSourceCandidate(
  repositoryRoot: string,
  gitExecutablePath: string,
  environment: NodeJS.ProcessEnv,
): { headCommit: string; repositoryIndexInventorySha256: string } {
  const headCommit = revParse(repositoryRoot, 'HEAD', gitExecutablePath, environment);
  const indexInventory = execFileSync(
    gitExecutablePath,
    ['-C', repositoryRoot, 'ls-files', '--stage', '-z'],
    { encoding: 'buffer', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  return {
    headCommit,
    repositoryIndexInventorySha256: createHash('sha256').update(indexInventory).digest('hex'),
  };
}

function assertCommittedSourceCandidate(
  repositoryRoot: string,
  gitExecutablePath: string,
  environment: NodeJS.ProcessEnv,
): void {
  try {
    execFileSync(
      gitExecutablePath,
      ['-C', repositoryRoot, 'diff', '--quiet', '--ignore-submodules=all'],
      { env: environment, stdio: 'ignore', windowsHide: true },
    );
  } catch {
    throw new Error('tracked worktree must match the Git index before bundle construction');
  }
  try {
    execFileSync(
      gitExecutablePath,
      ['-C', repositoryRoot, 'diff', '--cached', '--quiet', '--ignore-submodules=all'],
      { env: environment, stdio: 'ignore', windowsHide: true },
    );
  } catch {
    throw new Error('Git index must match HEAD before bundle construction');
  }
}

function assertExactCandidate(
  expected: { headCommit: string; repositoryIndexInventorySha256: string },
  actual: { headCommit: string; repositoryIndexInventorySha256: string },
): void {
  if (expected.headCommit.toLowerCase() !== actual.headCommit) {
    throw new Error('HEAD commit changed during bundle construction');
  }
  if (
    expected.repositoryIndexInventorySha256.toLowerCase()
      !== actual.repositoryIndexInventorySha256
  ) {
    throw new Error('repository index inventory changed during bundle construction');
  }
}

function readGitlinkCommit(input: {
  repositoryRoot: string;
  sourceCommit: string;
  gitlinkPath: string;
  gitExecutablePath: string;
  environment: NodeJS.ProcessEnv;
}): string {
  const entry = runGit(
    input.repositoryRoot,
    ['ls-tree', input.sourceCommit, '--', input.gitlinkPath],
    input.gitExecutablePath,
    input.environment,
  );
  const match = /^160000 commit ([0-9a-f]{40})\t.+$/i.exec(entry);
  if (!match) throw new Error('Frontier gitlink is absent from the source bridge tree');
  return match[1].toLowerCase();
}

function buildStandaloneCommitMessage(sourceCommit: string, bridgeTree: string): string {
  return [
    'Public research alpha',
    '',
    `Source commit: ${sourceCommit}`,
    `Bridge tree: ${bridgeTree}`,
    'Classification: public-research-alpha',
    'Source publication policy: permitted-after-promotion',
    'Source promotion status: unverified',
    'Supported release status: blocked',
    'Independent review status: open',
    '',
  ].join('\n');
}

function deterministicCommitEnvironment(
  commitUnixTime: number,
  isolatedGlobalConfig: string,
): NodeJS.ProcessEnv {
  const gitDate = `@${String(commitUnixTime)} +0000`;
  return {
    ...isolatedGitEnvironment(isolatedGlobalConfig),
    GIT_AUTHOR_NAME: PUBLIC_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: PUBLIC_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: PUBLIC_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: PUBLIC_AUTHOR_EMAIL,
    GIT_AUTHOR_DATE: gitDate,
    GIT_COMMITTER_DATE: gitDate,
  };
}

function revParse(
  repositoryRoot: string,
  revision: string,
  gitExecutablePath: string,
  environment: NodeJS.ProcessEnv,
): string {
  const objectId = runGit(
    repositoryRoot,
    ['rev-parse', revision],
    gitExecutablePath,
    environment,
  ).toLowerCase();
  assertObjectId(objectId, revision);
  return objectId;
}

function assertObjectId(value: string, label: string): void {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`${label} is not a Git object ID`);
}

function runGit(
  repositoryRoot: string,
  args: string[],
  gitExecutablePath: string,
  environment: NodeJS.ProcessEnv,
): string {
  return execFileSync(
    gitExecutablePath,
    ['-C', repositoryRoot, ...args],
    { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  ).trim();
}

function runGitFromBare(
  gitDirectory: string,
  args: string[],
  gitExecutablePath: string,
  env?: NodeJS.ProcessEnv,
): string {
  return execFileSync(
    gitExecutablePath,
    [`--git-dir=${gitDirectory}`, ...args],
    { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  ).trim();
}

function runGitRaw(
  args: string[],
  gitExecutablePath: string,
  env?: NodeJS.ProcessEnv,
): void {
  execFileSync(gitExecutablePath, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveProspectivePath(value: string): string {
  let existingAncestor = path.resolve(value);
  const missingSegments: string[] = [];
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new Error(`cannot resolve output path ancestor: ${value}`);
    }
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  return path.resolve(realpathSync.native(existingAncestor), ...missingSegments);
}

function isolatedGitEnvironment(globalConfigPath: string): NodeJS.ProcessEnv {
  const env = createPublicAuditGitEnvironment();
  env.GIT_CONFIG_GLOBAL = globalConfigPath;
  return env;
}

function publishExactFile(stagedPath: string, finalPath: string, label: string): boolean {
  try {
    linkSync(stagedPath, finalPath);
    return true;
  } catch (error) {
    if (!isAlreadyExistsError(error) || !existsSync(finalPath)) throw error;
    assertCompatibleExistingFile(stagedPath, finalPath, label);
    return false;
  }
}

function assertCompatibleExistingFile(stagedPath: string, finalPath: string, label: string): void {
  if (!existsSync(finalPath)) return;
  const finalStatus = lstatSync(finalPath);
  if (!finalStatus.isFile() || finalStatus.isSymbolicLink()) {
    throw new Error(`public audit alpha ${label} must not already exist as a non-regular file`);
  }
  const staged = readFileSync(stagedPath);
  const existing = readFileSync(finalPath);
  if (!staged.equals(existing)) {
    throw new Error(`public audit alpha ${label} must not already exist with different bytes`);
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function captureDirectoryIdentity(directory: string, label: string): DirectoryIdentity {
  const realPath = realpathSync.native(directory);
  const status = statSync(realPath, { bigint: true });
  if (!status.isDirectory()) throw new Error(`${label} is not a directory`);
  return { realPath, device: status.dev, inode: status.ino };
}

function assertDirectoryIdentity(identity: DirectoryIdentity, label: string): void {
  let currentRealPath: string;
  try {
    currentRealPath = realpathSync.native(identity.realPath);
  } catch {
    throw new Error(`${label} changed during bundle construction`);
  }
  if (!samePath(currentRealPath, identity.realPath)) {
    throw new Error(`${label} changed during bundle construction`);
  }
  const status = statSync(currentRealPath, { bigint: true });
  if (!status.isDirectory() || status.dev !== identity.device || status.ino !== identity.inode) {
    throw new Error(`${label} changed during bundle construction`);
  }
}

function assertStableOutputDirectory(
  outputDirectory: DirectoryIdentity,
  repositoryRoot: string,
): void {
  assertDirectoryIdentity(outputDirectory, 'output directory');
  if (isWithin(repositoryRoot, outputDirectory.realPath)) {
    throw new Error('public audit alpha bundle output must be outside the source repository');
  }
}

function assertPublishScratchLocation(
  publishScratch: DirectoryIdentity,
  outputDirectory: DirectoryIdentity,
  repositoryRoot: string,
): void {
  assertStableOutputDirectory(outputDirectory, repositoryRoot);
  assertDirectoryIdentity(publishScratch, 'publish scratch directory');
  if (
    !isWithin(outputDirectory.realPath, publishScratch.realPath)
    || isWithin(repositoryRoot, publishScratch.realPath)
    || !path.basename(publishScratch.realPath).startsWith('.bridge-public-audit-alpha-')
  ) {
    throw new Error('publish scratch directory escaped the validated output directory');
  }
}

function removeScratchDirectoryIfUnchanged(identity: DirectoryIdentity): void {
  try {
    assertDirectoryIdentity(identity, 'scratch directory');
    rmSync(identity.realPath, { recursive: true, force: true });
  } catch {
    // A moved or replaced directory is not safe to remove by path.
  }
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
