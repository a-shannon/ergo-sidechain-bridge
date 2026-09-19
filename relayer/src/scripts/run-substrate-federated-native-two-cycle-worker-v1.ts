import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  runSubstrateFederatedGenesisTargetRootV1,
} from '../apps/bridge-daemon/substrate-federated-genesis-target-root-v1.js';
import { readBoundedRegularFile, writeNewFile } from '../create-only-out-of-repository-artifact.js';
import { assertNoDuplicateJsonKeys, canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  loadSubstrateFederatedNativeTwoCycleInvocationV1,
  projectSubstrateFederatedNativeTwoCycleResultV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1,
} from '../substrate-federated-native-two-cycle-invocation-v1.js';

const WORKER_TRANSPORT_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-transport.v1';

export async function runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
  argv: readonly string[],
): Promise<void> {
  const args = parseArguments(argv);
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('native two-cycle worker requires Windows x64');
  }
  const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
    args.configPath,
    args.attemptPath,
  );
  if (invocation.configSha256Hex !== args.expectedConfigSha256Hex) {
    throw new Error('native two-cycle worker config digest differs');
  }
  if (['result.json', 'failure.json'].some(name => existsSync(join(invocation.attemptPath, name)))) {
    throw new Error('native two-cycle attempt already has a terminal artifact');
  }
  const startBytes = readBoundedRegularFile(join(invocation.attemptPath, 'start.json'),
    'native two-cycle parent start', 16 * 1024).bytes;
  const startText = new TextDecoder('utf-8', { fatal: true }).decode(startBytes);
  assertNoDuplicateJsonKeys(startText);
  const start = JSON.parse(startText) as unknown;
  if (start === null || typeof start !== 'object' || Array.isArray(start)) {
    throw new Error('native two-cycle parent start must be an object');
  }
  const parent = start as Record<string, unknown>;
  if (parent.schema !== 'e2s.substrate-federated-native-two-cycle-start.v1'
    || parent.version !== 1 || parent.status !== 'two_cycle_invocation_started'
    || parent.configSha256Hex !== invocation.configSha256Hex
    || parent.expectedBridgeCommit !== invocation.config.expectedBridgeCommit
    || parent.pathIdentityDigestHex !== invocation.pathIdentityDigestHex) {
    throw new Error('native two-cycle parent start differs from the captured invocation');
  }
  // Claim the attempt before entering signing custody. Even a failed root call
  // permanently consumes this worker entry; a retained attempt cannot replay it.
  writeNewFile(
    join(invocation.attemptPath, 'worker-start.json'),
    Buffer.from(`${canonicalJson({ configSha256Hex: invocation.configSha256Hex })}\n`, 'utf8'),
    'native two-cycle worker claim',
  );
  const before =
    await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(
      invocation,
    );
  if (before.repository.tree !== parent.expectedBridgeTree
    || before.toolIdentityDigestHex !== parent.toolIdentityDigestHex) {
    throw new Error('native two-cycle worker environment differs from parent start');
  }
  const rootResult = await runSubstrateFederatedGenesisTargetRootV1(
    invocation.rootInput,
  );
  const result = projectSubstrateFederatedNativeTwoCycleResultV1(rootResult);
  const after =
    await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(
      invocation,
    );
  if (
    before.repository.commit !== after.repository.commit
    || before.repository.tree !== after.repository.tree
    || before.toolIdentityDigestHex !== after.toolIdentityDigestHex
    || before.runtime.nodeExecutableSha256
      !== after.runtime.nodeExecutableSha256
    || before.runtime.relayerPackageLockSha256
      !== after.runtime.relayerPackageLockSha256
    || before.runtime.gitExecutableSha256
      !== after.runtime.gitExecutableSha256
  ) throw new Error('native two-cycle worker identities changed during execution');
  const transport = Object.freeze({
    schema: WORKER_TRANSPORT_SCHEMA,
    version: 1 as const,
    status: 'root_completed_and_cleaned' as const,
    configSha256Hex: invocation.configSha256Hex,
    bridgeCommit: after.repository.commit,
    bridgeTree: after.repository.tree,
    pathIdentityDigestHex: invocation.pathIdentityDigestHex,
    toolIdentityDigestHex: after.toolIdentityDigestHex,
    result,
  });
  writeNewFile(
    join(invocation.attemptPath, 'worker-result.json'),
    Buffer.from(`${canonicalJson(transport)}\n`, 'utf8'),
    'native two-cycle worker transport',
  );
}

function parseArguments(argv: readonly string[]): Readonly<{
  configPath: string;
  expectedConfigSha256Hex: string;
  attemptPath: string;
}> {
  if (
    argv.length !== 6
    || argv[0] !== '--config'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
    || argv[2] !== '--expected-config-sha256'
    || argv[3] === undefined
    || !/^[0-9a-f]{64}$/u.test(argv[3])
    || argv[4] !== '--attempt'
    || argv[5] === undefined
    || argv[5].length === 0
    || argv[5].startsWith('--')
  ) throw new Error('native two-cycle worker arguments are invalid');
  return Object.freeze({
    configPath: argv[1],
    expectedConfigSha256Hex: argv[3],
    attemptPath: argv[5],
  });
}

async function main(): Promise<void> {
  await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
    process.argv.slice(2),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('native two-cycle worker failed\n');
    process.exitCode = 1;
  });
}
