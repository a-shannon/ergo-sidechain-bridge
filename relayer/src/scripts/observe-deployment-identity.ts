import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createDeploymentIdentitySourcePair,
  loadTrackedDeploymentIdentityArtifactProfile,
  observeMatchingDeploymentIdentityCandidate,
  type DeploymentObservationNetworkScope,
} from '../read-only-deployment-identity-observer.js';

interface ParsedArguments {
  readonly primaryRpcUrl: string;
  readonly witnessRpcUrl: string;
  readonly bridgeAddress: string;
  readonly tokenAddress: string;
  readonly expectedChainId: bigint;
  readonly networkScope: DeploymentObservationNetworkScope;
}

const usage = [
  'Usage:',
  '  npm run sidechain:deployment-identity:observe -- --primary-rpc-url <origin> --witness-rpc-url <origin> --bridge-address <20-byte-hex> --token-address <20-byte-hex> --expected-chain-id <positive-decimal> --network-scope <local-devnet|public-testnet>',
  '',
  'Reads only eth_chainId, eth_blockNumber, eth_getBlockByNumber, eth_getCode, and eth_call.',
  'The two credential-free origins must agree on one stable tip, exact tracked runtime code, bridge token binding, and current owners. Network scope is an explicit operator declaration.',
  'Output is a non-authorizing candidate. It proves no history, finality, mint eligibility, settlement authority, signing permission, submission permission, Gate 5 closure, or readiness.',
].join('\n');

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = resolve(scriptDirectory, '..', '..', '..');
  const artifactProfile = loadTrackedDeploymentIdentityArtifactProfile(bridgeRoot);
  const sources = createDeploymentIdentitySourcePair({
    primaryRpcUrl: args.primaryRpcUrl,
    witnessRpcUrl: args.witnessRpcUrl,
  });
  const candidate = await observeMatchingDeploymentIdentityCandidate({
    sources,
    artifactProfile,
    networkScope: args.networkScope,
    expectedChainId: args.expectedChainId,
    bridgeAddress: args.bridgeAddress,
    tokenAddress: args.tokenAddress,
  });
  console.log(JSON.stringify(candidate, null, 2));
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--primary-rpc-url',
    '--witness-rpc-url',
    '--bridge-address',
    '--token-address',
    '--expected-chain-id',
    '--network-scope',
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !allowed.has(key)) throw new Error(`unknown deployment identity option: ${key ?? '<missing>'}`);
    if (!value || value.startsWith('--')) throw new Error(`${key} requires one value`);
    if (values.has(key)) throw new Error(`${key} must not be repeated`);
    values.set(key, value);
  }
  const primaryRpcUrl = required(values, '--primary-rpc-url');
  const witnessRpcUrl = required(values, '--witness-rpc-url');
  const bridgeAddress = required(values, '--bridge-address');
  const tokenAddress = required(values, '--token-address');
  const chainIdRaw = required(values, '--expected-chain-id');
  if (!/^[1-9][0-9]*$/.test(chainIdRaw)) {
    throw new Error('--expected-chain-id must be a positive decimal integer');
  }
  const networkScopeRaw = required(values, '--network-scope');
  if (networkScopeRaw !== 'local-devnet' && networkScopeRaw !== 'public-testnet') {
    throw new Error('--network-scope must be local-devnet or public-testnet');
  }
  return {
    primaryRpcUrl,
    witnessRpcUrl,
    bridgeAddress,
    tokenAddress,
    expectedChainId: BigInt(chainIdRaw),
    networkScope: networkScopeRaw,
  };
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
