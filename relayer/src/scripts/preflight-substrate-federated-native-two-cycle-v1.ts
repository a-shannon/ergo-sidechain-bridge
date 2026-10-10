import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1,
} from '../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import {
  loadSubstrateFederatedNativeTwoCycleInvocationV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1,
} from '../substrate-federated-native-two-cycle-invocation-v1.js';

export const SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREFLIGHT_V1_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-preflight.v1' as const;

export type SubstrateFederatedNativeTwoCyclePreflightV1Phase =
  | 'arguments'
  | 'invocation config'
  | 'environment'
  | 'Ergo node build output';

export interface SubstrateFederatedNativeTwoCyclePreflightV1Report {
  readonly schema: typeof SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREFLIGHT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local-preflight-passed';
  readonly bridgeCommit: string;
  readonly bridgeTree: string;
  readonly toolIdentityDigestHex: string;
  readonly executionAuthorized: false;
  readonly campaignStarted: false;
  readonly wasmBuildStarted: false;
  readonly attemptDirectoryCreated: false;
  readonly nodeStarted: false;
  readonly custodyEstablished: false;
  readonly signingAuthorized: false;
  readonly transportStarted: false;
  readonly fullErgoBaselineEstablished: false;
  readonly emptyFrontierOutputEstablished: false;
  readonly processPortsValidated: false;
  readonly custodyAndFeesReady: false;
  readonly finalShellReady: false;
  readonly admissionReviewed: false;
}

export interface SubstrateFederatedNativeTwoCyclePreflightV1Dependencies {
  readonly loadInvocation: typeof loadSubstrateFederatedNativeTwoCycleInvocationV1;
  readonly validateEnvironment:
    typeof validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1;
  readonly assertBuildOutputReady:
    typeof assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1;
}

const DEFAULT_DEPENDENCIES: SubstrateFederatedNativeTwoCyclePreflightV1Dependencies =
  Object.freeze({
    loadInvocation: loadSubstrateFederatedNativeTwoCycleInvocationV1,
    validateEnvironment:
      validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1,
    assertBuildOutputReady:
      assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1,
  });

export async function preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(
  argv: readonly string[],
  dependencies: SubstrateFederatedNativeTwoCyclePreflightV1Dependencies =
    DEFAULT_DEPENDENCIES,
  observePhase?: (phase: SubstrateFederatedNativeTwoCyclePreflightV1Phase) => void,
): Promise<Readonly<SubstrateFederatedNativeTwoCyclePreflightV1Report>> {
  observePhase?.('arguments');
  const configPath = parseArguments(argv);

  observePhase?.('invocation config');
  const invocation = dependencies.loadInvocation(configPath);

  observePhase?.('environment');
  const environment = await dependencies.validateEnvironment(invocation);

  observePhase?.('Ergo node build output');
  dependencies.assertBuildOutputReady(
    invocation.config.bridgeRoot,
    invocation.config.ergoSourcePath,
  );

  return Object.freeze({
    schema: SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREFLIGHT_V1_SCHEMA,
    version: 1,
    status: 'local-preflight-passed',
    bridgeCommit: environment.repository.commit,
    bridgeTree: environment.repository.tree,
    toolIdentityDigestHex: environment.toolIdentityDigestHex,
    executionAuthorized: false,
    campaignStarted: false,
    wasmBuildStarted: false,
    attemptDirectoryCreated: false,
    nodeStarted: false,
    custodyEstablished: false,
    signingAuthorized: false,
    transportStarted: false,
    fullErgoBaselineEstablished: false,
    emptyFrontierOutputEstablished: false,
    processPortsValidated: false,
    custodyAndFeesReady: false,
    finalShellReady: false,
    admissionReviewed: false,
  });
}

function parseArguments(argv: readonly string[]): string {
  if (
    argv.length !== 2
    || argv[0] !== '--config'
    || argv[1].length === 0
    || argv[1].startsWith('--')
  ) {
    throw new Error('expected exactly --config <path>');
  }
  return argv[1];
}

async function main(): Promise<void> {
  let phase: SubstrateFederatedNativeTwoCyclePreflightV1Phase = 'arguments';
  try {
    const report = await preflightSubstrateFederatedNativeTwoCycleFromArgumentsV1(
      process.argv.slice(2),
      DEFAULT_DEPENDENCIES,
      currentPhase => {
        phase = currentPhase;
      },
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch {
    process.stderr.write(`native two-cycle preflight failed during ${phase}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  void main();
}
