import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export type BridgeRepositoryMode = 'superproject' | 'standalone';

export interface BridgeRepositoryLayout {
  mode: BridgeRepositoryMode;
  repositoryRoot: string;
  bridgeRoot: string;
  gitmodulesPath: string;
  frontierGitlinkPath: string;
  frontierSubmoduleName: string;
}

export interface CanonicalBridgeRepositoryRoots {
  readonly bridgeRoot: string;
  readonly worktreeRoot: string;
}

const BRIDGE_DIRECTORY_NAME = 'ergo-sidechain-bridge';

export function resolveBridgeRepositoryLayout(input: {
  repositoryRoot: string;
  bridgeRoot: string;
}): BridgeRepositoryLayout {
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const bridgeRoot = path.resolve(input.bridgeRoot);

  if (samePath(repositoryRoot, bridgeRoot)) {
    return {
      mode: 'standalone',
      repositoryRoot,
      bridgeRoot,
      gitmodulesPath: path.join(bridgeRoot, '.gitmodules'),
      frontierGitlinkPath: 'substrate-node',
      frontierSubmoduleName: 'substrate-node',
    };
  }

  if (samePath(path.join(repositoryRoot, BRIDGE_DIRECTORY_NAME), bridgeRoot)) {
    return {
      mode: 'superproject',
      repositoryRoot,
      bridgeRoot,
      gitmodulesPath: path.join(repositoryRoot, '.gitmodules'),
      frontierGitlinkPath: `${BRIDGE_DIRECTORY_NAME}/substrate-node`,
      frontierSubmoduleName: `${BRIDGE_DIRECTORY_NAME}/substrate-node`,
    };
  }

  throw new Error(
    'bridge root must be either the Git repository root or its ergo-sidechain-bridge directory',
  );
}

export function discoverBridgeRepositoryRoot(
  bridgeRoot: string,
  gitExecutablePath = 'git',
): string {
  const output = execFileSync(
    gitExecutablePath,
    ['-C', path.resolve(bridgeRoot), 'rev-parse', '--show-toplevel'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  ).trim();

  if (output.length === 0) throw new Error('Git repository root is unavailable');
  const repositoryRoot = path.resolve(output);
  resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot });
  return repositoryRoot;
}

export function resolveCanonicalBridgeRepositoryRoots(
  bridgeRootInput: string,
): Readonly<CanonicalBridgeRepositoryRoots> {
  const bridgeRoot = realpathSync.native(path.resolve(bridgeRootInput));
  let repositoryRoot: string;
  try {
    repositoryRoot = discoverBridgeRepositoryRoot(bridgeRoot);
  } catch {
    throw new Error('bridge Git repository root is unavailable');
  }
  const worktreeRoot = realpathSync.native(repositoryRoot);
  resolveBridgeRepositoryLayout({ repositoryRoot: worktreeRoot, bridgeRoot });
  return Object.freeze({ bridgeRoot, worktreeRoot });
}

// This establishes path layout only. Funds-facing callers must separately
// validate the checkout through an exact pinned Git executable.
export function resolveBridgeRepositoryRootsFromCheckoutLayout(
  bridgeRootInput: string,
): Readonly<CanonicalBridgeRepositoryRoots> {
  const bridgeRoot = realpathSync.native(path.resolve(bridgeRootInput));
  const candidates = [bridgeRoot, path.dirname(bridgeRoot)];
  for (const candidate of candidates) {
    if (!isGitCheckoutMarker(path.join(candidate, '.git'))) continue;
    const worktreeRoot = realpathSync.native(candidate);
    try {
      resolveBridgeRepositoryLayout({ repositoryRoot: worktreeRoot, bridgeRoot });
      return Object.freeze({ bridgeRoot, worktreeRoot });
    } catch {
      continue;
    }
  }
  throw new Error('bridge checkout layout is unavailable');
}

function isGitCheckoutMarker(markerPath: string): boolean {
  try {
    const marker = lstatSync(markerPath);
    if (marker.isDirectory()) return true;
    if (!marker.isFile() || marker.size === 0 || marker.size > 4096) return false;
    return /^gitdir: [^\u0000\r\n]+(?:\r\n|\n)?$/u.test(
      readFileSync(markerPath, 'utf8'),
    );
  } catch {
    return false;
  }
}

function canonicalizeExistingPath(input: string): string {
  const resolved = path.resolve(input);
  try {
    return realpathSync.native(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolved;
    throw error;
  }
}

function samePath(left: string, right: string): boolean {
  const canonicalLeft = canonicalizeExistingPath(left);
  const canonicalRight = canonicalizeExistingPath(right);
  return process.platform === 'win32'
    ? canonicalLeft.toLowerCase() === canonicalRight.toLowerCase()
    : canonicalLeft === canonicalRight;
}
