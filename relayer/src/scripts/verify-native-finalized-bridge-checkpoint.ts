import { deepStrictEqual, strictEqual } from 'assert';
import { createHash } from 'crypto';
import { createReadStream, lstatSync, readFileSync, realpathSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerificationPayload,
} from '../native-finalized-bridge-checkpoint.js';
import type { FrontierBridgeEventRootInput } from '../frontier-bridge-event-root.js';
import {
  buildNativeFrontierCheckpointJoinCandidate,
  joinPinnedLocalNativeCheckpointToFrontierBurns,
} from '../native-frontier-checkpoint-join.js';
import { collectAndVerifyNativeFinalizedCheckpoint } from '../native-checkpoint-proof-collector.js';
import { createNativeSubstrateRpcProofCodec } from '../native-substrate-rpc-proof-codec.js';
import { deriveExecutableInvocationSha256Hex } from '../native-executable-pin.js';
import {
  bindNativeCheckpointToPinnedLocalBuild,
  disposePinnedLocalNativeVerifierBuild,
  getPinnedLocalNativeVerifierExecution,
  preparePinnedLocalNativeVerifierBuild,
  type PinnedLocalNativeVerifierBuild,
} from '../pinned-local-native-verifier-build.js';
import {
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcTransport,
} from '../substrate-finality-provider.js';

interface RpcFixtureResponse {
  method: string;
  params: unknown[];
  result: unknown;
}

interface NativeCheckpointRpcFixture {
  synthetic: true;
  responses: RpcFixtureResponse[];
}

interface NativeCheckpointVector {
  schema: 'e2s.native-finalized-bridge-checkpoint.vector.v2';
  trustedAnchorDigestHex: string;
  request: NativeFinalizedBridgeCheckpointRequest;
  expected: NativeFinalizedBridgeCheckpointVerificationPayload;
  rpcFixture: NativeCheckpointRpcFixture;
}

interface FrontierBridgeEventRootVector {
  schema: 'e2s.frontier-bridge-event-root.vector.v1';
  input: FrontierBridgeEventRootInput;
  expected: {
    burnCount: number;
    burnIdHexes: string[];
    bridgeEventRootHex: string;
  };
}

type ParsedArguments = {
  mode: 'pinned-local';
  frontierSourcePath?: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
} | {
  mode: 'supplied-executables';
  verifierExecutablePath: string;
  codecExecutablePath: string;
};

interface NativeVerifierExecutionSelection {
  mode: ParsedArguments['mode'];
  verifierPath: string;
  codecPath: string;
  verifierSha256Hex: string;
  codecSha256Hex: string;
  pinnedLocalBuild?: PinnedLocalNativeVerifierBuild;
}

class FixtureRpcTransport implements SubstrateRpcTransport {
  private readonly remaining: Array<RpcFixtureResponse & { used: boolean }>;

  constructor(responses: RpcFixtureResponse[]) {
    if (!Array.isArray(responses) || responses.length === 0) {
      throw new Error('synthetic RPC fixture must contain responses');
    }
    this.remaining = responses.map(response => ({
      ...structuredClone(response),
      used: false,
    }));
  }

  async request<T = unknown>(method: string, params: readonly unknown[]): Promise<T> {
    const expectedParams = JSON.stringify(params);
    const match = this.remaining.find(response =>
      !response.used &&
      response.method === method &&
      JSON.stringify(response.params) === expectedParams);
    if (!match) {
      throw new Error(`synthetic RPC fixture has no unused response for ${method}`);
    }
    match.used = true;
    return structuredClone(match.result) as T;
  }

  assertConsumed(): void {
    const unused = this.remaining.filter(response => !response.used);
    if (unused.length > 0) {
      throw new Error(`synthetic RPC fixture left ${unused.length} response(s) unused`);
    }
  }
}

const arguments_ = parseArguments(process.argv.slice(2));

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorPath = resolve(
  __dirname,
  '../../test-vectors/native-finalized-bridge-checkpoint-v2.json',
);
const frontierVectorPath = resolve(
  __dirname,
  '../../test-vectors/frontier-bridge-event-root-v1.json',
);
const bridgeRoot = resolve(__dirname, '../../..');
const nativeExecution = await prepareNativeVerifierExecution(arguments_, bridgeRoot);
const {
  verifierPath,
  codecPath,
  verifierSha256Hex,
  codecSha256Hex,
  pinnedLocalBuild,
} = nativeExecution;
const codecInvocationSha256Hex = {
  encodeHeaders: deriveExecutableInvocationSha256Hex(
    codecSha256Hex,
    ['--encode-headers'],
  ),
  inspectWarpProof: deriveExecutableInvocationSha256Hex(
    codecSha256Hex,
    ['--inspect-warp-proof'],
  ),
  inspectFinalityProof: deriveExecutableInvocationSha256Hex(
    codecSha256Hex,
    ['--inspect-finality-proof'],
  ),
};

const vector = JSON.parse(readFileSync(vectorPath, 'utf8')) as NativeCheckpointVector;
const frontierVector = JSON.parse(
  readFileSync(frontierVectorPath, 'utf8'),
) as FrontierBridgeEventRootVector;
strictEqual(
  vector.schema,
  'e2s.native-finalized-bridge-checkpoint.vector.v2',
  'unexpected native checkpoint vector schema',
);
strictEqual(
  frontierVector.schema,
  'e2s.frontier-bridge-event-root.vector.v1',
  'unexpected Frontier bridge event-root vector schema',
);

strictEqual(vector.rpcFixture?.synthetic, true, 'RPC collection fixture must remain synthetic');
const fixtureTransport = new FixtureRpcTransport(vector.rpcFixture.responses);
const verificationRun = await collectAndVerifyNativeFinalizedCheckpoint({
  rpc: new ReadOnlySubstrateFinalityRpc(fixtureTransport),
  codec: createNativeSubstrateRpcProofCodec({
    executablePath: codecPath,
    expectedExecutableSha256Hex: codecSha256Hex,
    expectedExecutableInvocationSha256Hex: codecInvocationSha256Hex,
  }),
  trustAnchor: vector.request.trustAnchor,
  targetNativeBlockHashHex: vector.request.targetNativeBlockHashHex,
  trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
  verifierExecutablePath: verifierPath,
  verifierExecutableSha256Hex: verifierSha256Hex,
  verifierExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
    verifierSha256Hex,
    ['--trusted-anchor-digest', vector.trustedAnchorDigestHex],
  ),
  maxAttempts: 1,
});
fixtureTransport.assertConsumed();
strictEqual(verificationRun.nativeExecutablePins.codecSha256Hex, codecSha256Hex);
deepStrictEqual(
  verificationRun.nativeExecutablePins.codecInvocationSha256Hex,
  codecInvocationSha256Hex,
);
strictEqual(verificationRun.nativeExecutablePins.verifierSha256Hex, verifierSha256Hex);
strictEqual(
  verificationRun.nativeExecutablePins.verifierInvocationSha256Hex,
  deriveExecutableInvocationSha256Hex(
    verifierSha256Hex,
    ['--trusted-anchor-digest', vector.trustedAnchorDigestHex],
  ),
);
deepStrictEqual(
  verificationRun.collection.request,
  vector.request,
  'native checkpoint RPC collection drifted from the checked-in request',
);
const verification = verificationRun.verification;
deepStrictEqual(
  verification,
  vector.expected,
  'native checkpoint verification drifted from the checked-in cross-language vector',
);

const pinnedCheckpoint = pinnedLocalBuild
  ? bindNativeCheckpointToPinnedLocalBuild({
      checkpoint: verificationRun.checkpoint,
      build: pinnedLocalBuild,
    })
  : undefined;
const checkpoint = pinnedCheckpoint ?? verificationRun.checkpoint;
strictEqual(checkpoint.boundary.sidechainFinalityVerified, true);
strictEqual(checkpoint.boundary.ergoExtensionAnchorVerified, false);
strictEqual(checkpoint.boundary.onChainAcceptanceVerified, false);
strictEqual(checkpoint.boundary.transactionMutationEnabled, false);
strictEqual(checkpoint.boundary.gate5Closed, false);
const joined = pinnedCheckpoint
  ? joinPinnedLocalNativeCheckpointToFrontierBurns({
      checkpoint: pinnedCheckpoint,
      frontier: frontierVector.input,
      targetBurnIdHex: frontierVector.expected.burnIdHexes[0],
    })
  : buildNativeFrontierCheckpointJoinCandidate({
      checkpoint,
      frontier: frontierVector.input,
      targetBurnIdHex: frontierVector.expected.burnIdHexes[0],
    });
strictEqual(joined.bridgeEventRootHex, frontierVector.expected.bridgeEventRootHex);
strictEqual(joined.burnLeafCount, frontierVector.expected.burnCount);
strictEqual(joined.targetBurnProof.leaf.burnIdHex, frontierVector.expected.burnIdHexes[0]);
strictEqual(joined.targetBurnProof.bridgeEventRootHex, joined.bridgeEventRootHex);
strictEqual(joined.boundary.nativeVerifierOutputValidated, true);
strictEqual(joined.boundary.completeBuildToolClosureVerified, false);
strictEqual(joined.boundary.dependencyCacheContentAttested, false);
strictEqual(joined.boundary.independentBuildAttestationVerified, false);
strictEqual(joined.boundary.localConformanceOnly, true);
if (nativeExecution.mode === 'pinned-local') {
  strictEqual(joined.boundary.pinnedLocalSourceBuildVerified, true);
  strictEqual(joined.boundary.verificationScope, 'pinned-local-exclusive-host-conformance');
  strictEqual(joined.boundary.nativeFinalityVerified, true);
  strictEqual(joined.boundary.runtimeStateProofVerified, true);
} else {
  strictEqual(joined.boundary.pinnedLocalSourceBuildVerified, false);
  strictEqual(joined.boundary.verificationScope, 'generic-self-pinned-local-conformance');
  strictEqual(joined.boundary.nativeFinalityVerified, false);
  strictEqual(joined.boundary.runtimeStateProofVerified, false);
}
strictEqual(joined.boundary.frontierBurnExtractionVerified, true);
strictEqual(joined.boundary.targetBurnInclusionVerified, true);
strictEqual(joined.boundary.ergoExtensionCandidateDerived, true);
strictEqual(joined.boundary.ergoExtensionAnchorVerified, false);
strictEqual(joined.boundary.onChainAcceptanceVerified, false);
strictEqual(joined.boundary.admissionEligible, false);
strictEqual(joined.boundary.committeeBypassPrevented, false);
strictEqual(joined.boundary.gate5Closed, false);

console.log(
  nativeExecution.mode === 'pinned-local'
    ? 'Native finalized bridge checkpoint: PASS'
    : 'Native checkpoint vector conformance: PASS',
);
console.log(
  nativeExecution.mode === 'pinned-local'
    ? 'Pinned local locked-source verifier conformance: PASS'
    : 'Supplied native executable vector conformance: PASS',
);
console.log('Read-only RPC proof package collection: PASS');
console.log(
  nativeExecution.mode === 'pinned-local'
    ? 'Frontier burn extraction and native checkpoint join: PASS'
    : 'Frontier burn extraction and checkpoint candidate join: PASS',
);
console.log(`Target: ${verification.target.nativeBlockHashHex} @ ${verification.target.nativeHeight}`);
console.log(
  `Finality horizon: ${verification.finality.horizonHashHex} @ ${verification.finality.horizonHeight}`,
);
console.log(
  `${nativeExecution.mode === 'pinned-local' ? 'Authenticated' : 'Decoded'} GRANDPA transitions: ` +
  verification.authority.transitionCount,
);
console.log(`Checkpoint commitment: ${checkpoint.checkpointCommitment.checkpointCommitmentHex}`);
console.log(`0x0401 candidate: ${checkpoint.checkpointCommitment.extensionValueHex}`);
console.log(
  `Joined burn proof: ${joined.targetBurnProof.leaf.burnIdHex} ` +
  `(${joined.targetBurnProof.proof.length} Merkle step(s))`,
);
console.log(nativeExecution.mode === 'pinned-local'
  ? 'Boundary: relative to the supplied conformance trust anchor, the pinned local vector verifies sidechain finality, ' +
    'runtime-state inclusion, Frontier extraction, and target burn inclusion; ' +
    'complete build-tool closure, dependency-cache attestation, independent build attestation, provisioning/rebuild integration, ' +
    'Ergo anchoring, on-chain acceptance, committee-bypass prevention, and Gate 5 remain open.'
  : 'Boundary: the supplied executable outputs match the checked-in checkpoint vector and join the checked-in Frontier burn vector; ' +
    'source provenance, pinned-local build identity, promoted sidechain finality, promoted runtime-state verification, ' +
    'complete build-tool closure, independent build attestation, Ergo anchoring, on-chain acceptance, ' +
    'committee-bypass prevention, and Gate 5 remain open.');
if (pinnedLocalBuild) {
  disposePinnedLocalNativeVerifierBuild(pinnedLocalBuild);
}

function parseArguments(argv: string[]): ParsedArguments {
  const supported = new Set([
    '--frontier-source',
    '--cargo',
    '--rustc',
    '--git',
    '--supplied-verifier',
    '--supplied-codec',
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!supported.has(option) || !value || value.startsWith('--') || values.has(option)) {
      throw new Error(
        'usage: verify-native-finalized-bridge-checkpoint ' +
        '[--frontier-source <absolute-path>] --cargo <absolute-path> ' +
        '--rustc <absolute-path> --git <absolute-path> | ' +
        '--supplied-verifier <absolute-path> --supplied-codec <absolute-path>',
      );
    }
    values.set(option, value);
  }
  const suppliedExecutableMode = values.has('--supplied-verifier') || values.has('--supplied-codec');
  if (suppliedExecutableMode) {
    if (
      !values.has('--supplied-verifier')
      || !values.has('--supplied-codec')
      || values.has('--frontier-source')
      || values.has('--cargo')
      || values.has('--rustc')
      || values.has('--git')
    ) {
      throw new Error(
        'supplied-executable verifier mode requires exactly ' +
        '--supplied-verifier and --supplied-codec',
      );
    }
    return {
      mode: 'supplied-executables',
      verifierExecutablePath: values.get('--supplied-verifier')!,
      codecExecutablePath: values.get('--supplied-codec')!,
    };
  }
  for (const required of ['--cargo', '--rustc', '--git']) {
    if (!values.has(required)) {
      throw new Error('pinned local native verifier build requires explicit Cargo, rustc, and Git paths');
    }
  }
  return {
    mode: 'pinned-local',
    frontierSourcePath: values.get('--frontier-source'),
    cargoExecutablePath: values.get('--cargo')!,
    rustcExecutablePath: values.get('--rustc')!,
    gitExecutablePath: values.get('--git')!,
  };
}

async function prepareNativeVerifierExecution(
  arguments_: ParsedArguments,
  bridgeRoot: string,
): Promise<NativeVerifierExecutionSelection> {
  if (arguments_.mode === 'pinned-local') {
    const frontierSourcePath = arguments_.frontierSourcePath ?? resolve(bridgeRoot, 'substrate-node');
    if (!isAbsolute(frontierSourcePath)) {
      throw new Error('pinned Frontier source path must be absolute');
    }
    const pinnedLocalBuild = await preparePinnedLocalNativeVerifierBuild({
      frontierSourcePath,
      cargoExecutablePath: arguments_.cargoExecutablePath,
      rustcExecutablePath: arguments_.rustcExecutablePath,
      gitExecutablePath: arguments_.gitExecutablePath,
    });
    const execution = getPinnedLocalNativeVerifierExecution(pinnedLocalBuild);
    return {
      mode: 'pinned-local',
      verifierPath: execution.verifierExecutablePath,
      codecPath: execution.codecExecutablePath,
      verifierSha256Hex: execution.verifierSha256Hex,
      codecSha256Hex: execution.codecSha256Hex,
      pinnedLocalBuild,
    };
  }

  const verifierPath = requireAbsoluteRegularExecutable(
    arguments_.verifierExecutablePath,
    'supplied native verifier',
  );
  const codecPath = requireAbsoluteRegularExecutable(
    arguments_.codecExecutablePath,
    'supplied native RPC proof codec',
  );
  return {
    mode: 'supplied-executables',
    verifierPath,
    codecPath,
    verifierSha256Hex: await deriveExecutableSha256Hex(verifierPath, 'supplied native verifier'),
    codecSha256Hex: await deriveExecutableSha256Hex(codecPath, 'supplied native RPC proof codec'),
  };
}

function requireAbsoluteRegularExecutable(value: string, label: string): string {
  if (!isAbsolute(value)) {
    throw new Error(`${label} path must be absolute`);
  }
  const path = resolve(value);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error(`${label} is unavailable`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(path);
  } catch {
    throw new Error(`${label} canonical path is unavailable`);
  }
  if (normalizePathIdentity(canonicalPath) !== normalizePathIdentity(path)) {
    throw new Error(`${label} path and ancestors must be canonical and non-symlinked`);
  }
  return path;
}

function normalizePathIdentity(value: string): string {
  const normalized = resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function deriveExecutableSha256Hex(path: string, label: string): Promise<string> {
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk as Buffer);
    }
  } catch {
    throw new Error(`failed to read ${label}`);
  }
  return `0x${hash.digest('hex')}`;
}
