import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../strict-json.js';
import {
  produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1,
  type ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input,
  type SubstrateFederatedIsolatedDevnetRelayerArtifactsV1Receipt,
} from '../substrate-federated-isolated-devnet-relayer-artifacts-v1.js';

const FLAGS = Object.freeze([
  ['--bridge-root', 'bridgeRoot'],
  ['--git', 'gitExecutable'],
  ['--wasm-pack', 'wasmPackExecutable'],
  ['--expected-head', 'expectedHeadCommitSha1Hex'],
  ['--out', 'destinationDirectory'],
] as const satisfies readonly (readonly [
  string,
  keyof ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input,
])[]);

export function parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1(
  argv: readonly string[],
): Readonly<ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input> {
  if (argv.length !== FLAGS.length * 2) {
    throw new Error('isolated relayer artifact production requires all five options');
  }
  const flagToProperty = new Map<string, keyof ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input>(
    FLAGS,
  );
  const values = new Map<keyof ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    const property = flag === undefined ? undefined : flagToProperty.get(flag);
    if (property === undefined) {
      throw new Error('isolated relayer artifact option is unsupported');
    }
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      throw new Error('isolated relayer artifact option requires one value');
    }
    if (values.has(property)) {
      throw new Error('isolated relayer artifact option must not repeat');
    }
    values.set(property, value);
  }
  const required = Object.fromEntries(FLAGS.map(([, property]) => {
    const value = values.get(property);
    if (value === undefined) {
      throw new Error('isolated relayer artifact option is required');
    }
    return [property, value] as const;
  })) as unknown as ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input;
  return Object.freeze(required);
}

export async function buildSubstrateFederatedIsolatedDevnetRelayerArtifactsFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactsV1Receipt>> {
  return produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1(
    parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1(argv),
  );
}

async function main(): Promise<void> {
  const receipt = await buildSubstrateFederatedIsolatedDevnetRelayerArtifactsFromArgumentsV1(
    process.argv.slice(2),
  );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated relayer artifact production failed\n');
    process.exitCode = 1;
  });
}
