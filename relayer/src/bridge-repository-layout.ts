import { execFileSync } from 'node:child_process';
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

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
