import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  deriveFederatedPooledReserveSourceProofProfileIdForInputV1Hex,
  encodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
} from '../substrate-federated-pooled-reserve-source-proof-v1.js';

type Arguments = Readonly<{
  frontierSource: string;
  cargoTargetDirectory?: string;
  offline: boolean;
}>;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultFrontierSource = path.resolve(scriptDirectory, '..', '..', '..', 'substrate-node');

function parseArguments(argv: readonly string[]): Arguments {
  let frontierSource = defaultFrontierSource;
  let cargoTargetDirectory: string | undefined;
  let offline = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--frontier-source') {
      frontierSource = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--cargo-target-dir') {
      cargoTargetDirectory = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--offline') {
      offline = true;
      continue;
    }
    throw new Error(`unknown federated LAB acceptance argument: ${argument}`);
  }

  return {
    frontierSource: requireDirectory(frontierSource, 'patched Frontier source'),
    ...(cargoTargetDirectory === undefined
      ? {}
      : { cargoTargetDirectory: path.resolve(cargoTargetDirectory) }),
    offline,
  };
}

function requiredValue(argv: readonly string[], index: number, argument: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${argument} requires one value`);
  }
  return value;
}

function requireDirectory(value: string, label: string): string {
  const resolved = path.resolve(value);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`${label} must be an existing directory`);
  }
  return resolved;
}

function referenceProfileEnvironment(): Readonly<Record<string, string>> {
  const input = {
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    threshold: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
    signerPublicKeysHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
    maxValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    verifierProfileIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  } as const;
  const profileScaleHex =
    encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(input);
  const profileIdHex =
    deriveFederatedPooledReserveSourceProofProfileIdForInputV1Hex(input);
  if (profileIdHex !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX) {
    throw new Error('reference federated source-proof profile identity changed');
  }
  if ((profileScaleHex.length - 2) / 2 !== 148) {
    throw new Error('reference federated source-proof profile SCALE length changed');
  }
  return {
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX: profileScaleHex,
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX: profileIdHex,
  };
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const cargoArguments = [
    'test',
    '-p',
    'frontier-template-node',
    '--no-default-features',
    '--features',
    'bridge-federated-v4-lab-node',
    ...(args.offline ? ['--offline'] : []),
    '--locked',
    'federated_lab_reservation',
    '--',
    '--nocapture',
  ];
  const result = spawnSync(
    process.platform === 'win32' ? 'cargo.exe' : 'cargo',
    cargoArguments,
    {
      cwd: args.frontierSource,
      env: {
        ...process.env,
        ...referenceProfileEnvironment(),
        WASM_BUILD_WORKSPACE_HINT: args.frontierSource,
        ...(args.cargoTargetDirectory === undefined
          ? {}
          : { CARGO_TARGET_DIR: args.cargoTargetDirectory }),
      },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`federated LAB reservation acceptance exited ${String(result.status)}`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'federated LAB reservation acceptance failed'}\n`,
  );
  process.exitCode = 1;
}
