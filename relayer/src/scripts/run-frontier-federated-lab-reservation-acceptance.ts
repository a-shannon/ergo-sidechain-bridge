import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_SCALE_V1_HEX,
} from '../substrate-federated-pooled-reserve-source-proof-profile-v1-fixture.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_IDENTITY_V4_HEX,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
} from '../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1-fixture.js';

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
  if (
    !/^0x[0-9a-f]{296}$/.test(
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_SCALE_V1_HEX,
    )
  ) {
    throw new Error('reference federated source-proof profile SCALE length changed');
  }
  if (
    !/^0x[0-9a-f]{64}$/.test(
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
    )
  ) {
    throw new Error('reference federated source-proof profile identity changed');
  }
  if (
    !/^0x[0-9a-f]{1206}$/.test(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
    )
  ) {
    throw new Error('reference federated mint-reservation statement changed');
  }
  for (const [label, value] of [
    [
      'statement identity',
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
    ],
    [
      'mint identity',
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_IDENTITY_V4_HEX,
    ],
  ] as const) {
    if (!/^0x[0-9a-f]{64}$/.test(value)) {
      throw new Error(`reference federated ${label} changed`);
    }
  }
  return {
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_SCALE_V1_HEX,
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
    BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
    BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_ID_V4_HEX:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
    BRIDGE_LAB_FEDERATED_MINT_IDENTITY_V4_HEX:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_IDENTITY_V4_HEX,
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
