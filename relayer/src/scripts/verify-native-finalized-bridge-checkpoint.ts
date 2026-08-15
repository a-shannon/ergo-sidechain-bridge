import { deepStrictEqual, strictEqual } from 'assert';
import { readFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerificationPayload,
} from '../native-finalized-bridge-checkpoint.js';
import type { FrontierBridgeEventRootInput } from '../frontier-bridge-event-root.js';
import {
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
const verifierPath = execution.verifierExecutablePath;
const codecPath = execution.codecExecutablePath;
const verifierSha256Hex = execution.verifierSha256Hex;
const codecSha256Hex = execution.codecSha256Hex;
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

const checkpoint = bindNativeCheckpointToPinnedLocalBuild({
  checkpoint: verificationRun.checkpoint,
  build: pinnedLocalBuild,
});
strictEqual(checkpoint.boundary.sidechainFinalityVerified, true);
strictEqual(checkpoint.boundary.ergoExtensionAnchorVerified, false);
strictEqual(checkpoint.boundary.onChainAcceptanceVerified, false);
strictEqual(checkpoint.boundary.transactionMutationEnabled, false);
strictEqual(checkpoint.boundary.gate5Closed, false);
const joined = joinPinnedLocalNativeCheckpointToFrontierBurns({
  checkpoint,
  frontier: frontierVector.input,
  targetBurnIdHex: frontierVector.expected.burnIdHexes[0],
});
strictEqual(joined.bridgeEventRootHex, frontierVector.expected.bridgeEventRootHex);
strictEqual(joined.burnLeafCount, frontierVector.expected.burnCount);
strictEqual(joined.targetBurnProof.leaf.burnIdHex, frontierVector.expected.burnIdHexes[0]);
strictEqual(joined.targetBurnProof.bridgeEventRootHex, joined.bridgeEventRootHex);
strictEqual(joined.boundary.pinnedLocalSourceBuildVerified, true);
strictEqual(joined.boundary.completeBuildToolClosureVerified, false);
strictEqual(joined.boundary.dependencyCacheContentAttested, false);
strictEqual(joined.boundary.independentBuildAttestationVerified, false);
strictEqual(joined.boundary.localConformanceOnly, true);
strictEqual(joined.boundary.verificationScope, 'pinned-local-exclusive-host-conformance');
strictEqual(joined.boundary.nativeFinalityVerified, true);
strictEqual(joined.boundary.frontierBurnExtractionVerified, true);
strictEqual(joined.boundary.targetBurnInclusionVerified, true);
strictEqual(joined.boundary.ergoExtensionCandidateDerived, true);
strictEqual(joined.boundary.ergoExtensionAnchorVerified, false);
strictEqual(joined.boundary.onChainAcceptanceVerified, false);
strictEqual(joined.boundary.admissionEligible, false);
strictEqual(joined.boundary.committeeBypassPrevented, false);
strictEqual(joined.boundary.gate5Closed, false);

console.log('Native finalized bridge checkpoint: PASS');
console.log('Pinned local locked-source verifier conformance: PASS');
console.log('Read-only RPC proof package collection: PASS');
console.log('Frontier burn extraction and native checkpoint join: PASS');
console.log(`Target: ${verification.target.nativeBlockHashHex} @ ${verification.target.nativeHeight}`);
console.log(
  `Finality horizon: ${verification.finality.horizonHashHex} @ ${verification.finality.horizonHeight}`,
);
console.log(`Authenticated GRANDPA transitions: ${verification.authority.transitionCount}`);
console.log(`Checkpoint commitment: ${checkpoint.checkpointCommitment.checkpointCommitmentHex}`);
console.log(`0x0401 candidate: ${checkpoint.checkpointCommitment.extensionValueHex}`);
console.log(
  `Joined burn proof: ${joined.targetBurnProof.leaf.burnIdHex} ` +
  `(${joined.targetBurnProof.proof.length} Merkle step(s))`,
);
console.log(
  'Boundary: relative to the supplied conformance trust anchor, the local vector verifies sidechain finality, ' +
  'runtime-state inclusion, Frontier extraction, and target burn inclusion; ' +
  'complete build-tool closure, dependency-cache attestation, independent build attestation, provisioning/rebuild integration, ' +
  'Ergo anchoring, on-chain acceptance, committee-bypass prevention, and Gate 5 remain open.',
);
disposePinnedLocalNativeVerifierBuild(pinnedLocalBuild);

function parseArguments(argv: string[]): {
  frontierSourcePath?: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
} {
  const supported = new Set(['--frontier-source', '--cargo', '--rustc', '--git']);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!supported.has(option) || !value || value.startsWith('--') || values.has(option)) {
      throw new Error(
        'usage: verify-native-finalized-bridge-checkpoint ' +
        '[--frontier-source <absolute-path>] --cargo <absolute-path> ' +
        '--rustc <absolute-path> --git <absolute-path>',
      );
    }
    values.set(option, value);
  }
  for (const required of ['--cargo', '--rustc', '--git']) {
    if (!values.has(required)) {
      throw new Error('pinned local native verifier build requires explicit Cargo, rustc, and Git paths');
    }
  }
  return {
    frontierSourcePath: values.get('--frontier-source'),
    cargoExecutablePath: values.get('--cargo')!,
    rustcExecutablePath: values.get('--rustc')!,
    gitExecutablePath: values.get('--git')!,
  };
}
