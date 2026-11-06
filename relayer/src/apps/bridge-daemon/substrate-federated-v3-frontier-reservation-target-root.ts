import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { assertNoDuplicateJsonKeys } from '../../ergo-settlement-core/strict-json.js';
import { assertFederatedGenesisOperatorV1 } from '../../adapters/federated-genesis-operator-v1.js';
import { observeFederatedGenesisTargetsV1 } from '../../adapters/federated-genesis-target-observation-v1.js';
import { verifyExecutableSha256 } from '../../native-executable-pin.js';
import { runBoundedProcess } from '../../pinned-local-native-verifier-build.js';
import { buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1 }
  from '../../substrate-federated-authority-safe-devnet-build-environment-v1.js';
import { buildSubstrateFederatedGenesisNodeV1,
  claimSubstrateFederatedGenesisNodeBuildForOperationV3 } from '../../substrate-federated-genesis-node-build-v1.js';
import {
  createOwnedFederatedGenesisDevnetProcessSessionV1,
  assertOwnedFederatedGenesisDevnetTargetV1,
} from '../../substrate-federated-authority-safe-devnet-process-v1.js';
import { assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1 }
  from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { assertObservedSubstrateFederatedGenesisV3 }
  from '../../substrate-federated-observed-genesis-v3.js';
import { assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV3 }
  from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import { assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV3 }
  from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { executeFrontierNativeProofBoundReservationV3 }
  from './frontier-native-proof-bound-reservation-signing-v1.js';

type SigningV3 = Parameters<typeof executeFrontierNativeProofBoundReservationV3>[0]['signing'];
type BuiltFrontier = Awaited<ReturnType<typeof buildSubstrateFederatedGenesisNodeV1>>;

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const MAX_RAW_SPEC_BYTES = 34 * 1024 * 1024;
const SOURCE_TREE = '8dca3c37da8e24cb37d40c8121465e5d14e8a58c';
const BUILT_WASM_PATH = ['debug', 'wbuild', 'frontier-template-v4-fed-genesis-runtime',
  'frontier_template_v4_fed_genesis_runtime.wasm'] as const;
const KEYS = {
  code: '0x3a636f6465',
  profile: '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde',
  enforced: '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1',
  bridge: '0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45',
  sudo: '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b',
} as const;

export interface SubstrateFederatedV3FrontierReservationTargetInput {
  /** Original one-shot builder output; the owning composition must build for this attempt. */
  readonly built: Readonly<BuiltFrontier>;
  readonly buildParentDirectory: string;
  readonly signing: Readonly<Omit<SigningV3,
    'frontierTarget' | 'expectedStorage' | 'expectedGenesisHashHex'>>;
  readonly attemptDirectory: string;
  readonly broadcastScope: 'fed-native-local-synthetic-v3-reservation-only';
}

/** Owns the two-node target for one V3 reservation. No mint or campaign authority follows. */
export async function executeSubstrateFederatedV3FrontierReservationTarget(
  supplied: Readonly<SubstrateFederatedV3FrontierReservationTargetInput>,
) {
  const input = exact(supplied, ['built', 'buildParentDirectory', 'signing', 'attemptDirectory', 'broadcastScope']);
  if (input.broadcastScope !== 'fed-native-local-synthetic-v3-reservation-only') {
    throw new Error('FED V3 reservation scope differs');
  }
  const signing = exact(input.signing, ['operator', 'sourceOperation', 'draftInputs', 'draft', 'proof', 'compiled', 'target']);
  claimSubstrateFederatedGenesisNodeBuildForOperationV3(
    input.built, input.buildParentDirectory, signing.sourceOperation);
  const built = exact(input.built, ['sourceTreeId', 'sourceDirectory', 'targetDirectory',
    'sourceProofProfileScaleHex', 'sourceProofProfileIdHex', 'node', 'wasm', 'toolchain', 'protocSha256Hex']);
  if (built.sourceTreeId !== SOURCE_TREE) throw new Error('FED V3 built source tree differs');
  const node = exact(built.node, ['path', 'bytes', 'sha256Hex']);
  const wasm = exact(built.wasm, ['path', 'bytes', 'sha256Hex']);
  const assertCurrent = () => {
    assertFederatedGenesisOperatorV1(signing.operator);
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(signing.target);
    assertObservedSubstrateFederatedGenesisV3(signing.compiled, signing.target);
    assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV3(signing.draft, signing.draftInputs);
    assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV3(
      signing.proof, signing.sourceOperation, signing.draft);
    if (signing.draftInputs.target !== signing.target
      || signing.compiled.candidate.genesisJsonSha256Hex !== signing.proof.genesisJsonSha256Hex
      || signing.compiled.candidate.runtimeProfileScaleHex !== signing.proof.runtimeProfileScaleHex
      || signing.compiled.candidate.runtimeProfileIdHex !== signing.proof.runtimeProfileIdHex
      || built.sourceProofProfileScaleHex !== signing.compiled.preparation.mintProofProfileScaleHex
      || built.sourceProofProfileIdHex !== signing.compiled.preparation.mintProofProfile.proofProfileIdHex) {
      throw new Error('FED V3 target differs from the retained source proof or build profile');
    }
  };
  assertCurrent();
  const buildParent = directDirectory(input.buildParentDirectory);
  const source = directDirectory(built.sourceDirectory);
  const target = directDirectory(built.targetDirectory);
  const buildDirectory = directDirectory(dirname(target));
  if (basename(target) !== 'target' || !/^bridge-fed-genesis-[A-Za-z0-9]{6}$/.test(basename(buildDirectory))
    || dirname(buildDirectory) !== buildParent || source !== join(buildDirectory, 'source')) {
    throw new Error('FED V3 target is outside its selected fresh build directory');
  }
  const attemptDirectory = directDirectory(input.attemptDirectory);
  if (lstatSync(join(attemptDirectory, 'native-reservation-attempt.json'), { throwIfNoEntry: false }) !== undefined) {
    throw new Error('FED V3 reservation attempt is already present');
  }
  const nodePath = directFile(node.path, 1024 * 1024, 512 * 1024 * 1024, node.bytes);
  const wasmPath = directFile(wasm.path, 8, 16 * 1024 * 1024, wasm.bytes);
  if (nodePath !== join(target, 'debug', platform() === 'win32'
    ? 'frontier-template-node.exe' : 'frontier-template-node')
    || wasmPath !== join(target, ...BUILT_WASM_PATH)) {
    throw new Error('FED V3 artifacts are outside the selected build target');
  }
  const wasmBytes = readFileSync(wasmPath);
  if (!wasmBytes.subarray(0, 8).equals(Buffer.from('0061736d01000000', 'hex'))
    || sha256(wasmBytes) !== wasm.sha256Hex
    || wasm.sha256Hex !== signing.compiled.preparation.application.sourceRuntimeCodeSha256Hex) {
    throw new Error('FED V3 built runtime differs from the compiled source runtime');
  }
  const candidate = signing.compiled.candidate;
  const candidateBytes = Buffer.from(candidate.genesisJson, 'utf8');
  if (candidateBytes.length === 0 || candidateBytes.length > MAX_RAW_SPEC_BYTES
    || sha256(candidateBytes) !== candidate.genesisJsonSha256Hex) {
    throw new Error('FED V3 typed genesis bytes differ from the compiled candidate');
  }
  const candidatePath = join(target, 'fed-genesis.json');
  if (lstatSync(candidatePath, { throwIfNoEntry: false }) !== undefined) {
    throw new Error('FED V3 typed genesis already exists');
  }
  assertCurrent();
  writeFileSync(candidatePath, candidateBytes, { flag: 'wx' });
  await verifyExecutableSha256(nodePath, `0x${node.sha256Hex}`, 'FED V3 node');
  assertCurrent();
  const raw = await runBoundedProcess({ executablePath: nodePath,
    args: ['build-spec', '--chain', `fed-genesis:${candidatePath}`, '--disable-default-bootnode', '--raw'],
    cwd: source, env: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
    timeoutMs: 120_000, maxOutputBytes: MAX_RAW_SPEC_BYTES, label: 'FED V3 typed genesis materialization' });
  await verifyExecutableSha256(nodePath, `0x${node.sha256Hex}`, 'FED V3 node');
  const candidateAfter = directFile(candidatePath, candidateBytes.length, candidateBytes.length, candidateBytes.length);
  if (!readFileSync(candidateAfter).equals(candidateBytes)) throw new Error('FED V3 typed genesis bytes changed');
  assertCurrent();
  const expectedStorage = parseSubstrateFederatedV3RawGenesisStorage({
    rawSpecJson: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw.stdoutBytes),
    runtimeWasmSha256Hex: wasm.sha256Hex,
    runtimeProfileScaleHex: candidate.runtimeProfileScaleHex,
    bridgeAddressHex: signing.compiled.preparation.application.bridgeAddressHex,
    operatorStorageKeyHex: signing.operator.nativeFunding.storageKeyHex,
    operatorAccountInfoHex: signing.operator.nativeFunding.accountInfoScaleHex,
  });
  if (lstatSync(join(attemptDirectory, 'native-reservation-attempt.json'), { throwIfNoEntry: false }) !== undefined) {
    throw new Error('FED V3 reservation attempt appeared before target start');
  }
  const session = await createOwnedFederatedGenesisDevnetProcessSessionV1({
    nodeBinaryPath: nodePath, expectedNodeBinarySha256Hex: node.sha256Hex,
    genesisJsonBytes: candidateBytes, expectedGenesisJsonSha256Hex: candidate.genesisJsonSha256Hex,
    primaryRpcUrl: PRIMARY, witnessRpcUrl: WITNESS,
    primaryP2pPort: 30355, witnessP2pPort: 30356,
    primaryPrometheusPort: 19615, witnessPrometheusPort: 19616,
  });
  let callbackFailure: unknown;
  let executionFailure: unknown;
  let result: Awaited<ReturnType<typeof executeFrontierNativeProofBoundReservationV3>> | undefined;
  try {
    result = await session.withTarget(async frontierTarget => {
      try {
        assertCurrent();
        assertOwnedFederatedGenesisDevnetTargetV1(frontierTarget);
        if (frontierTarget.primaryRpcUrl !== PRIMARY || frontierTarget.witnessRpcUrl !== WITNESS
          || frontierTarget.genesisJsonSha256Hex !== candidate.genesisJsonSha256Hex) {
          throw new Error('FED V3 owned target differs from the selected genesis');
        }
        const expectedGenesisHashHex = await observeFederatedGenesisTargetsV1(expectedStorage);
        assertCurrent();
        assertOwnedFederatedGenesisDevnetTargetV1(frontierTarget);
        return await executeFrontierNativeProofBoundReservationV3({
          signing: { ...signing, frontierTarget, expectedStorage, expectedGenesisHashHex },
          attemptDirectory, broadcastScope: input.broadcastScope,
        });
      } catch (error) {
        callbackFailure = error;
        throw error;
      }
    });
  } catch (error) { executionFailure = error; }
  let closeFailure: unknown;
  try { await session.close(); } catch (error) { closeFailure = error; }
  const failures = [...new Set([callbackFailure, executionFailure, closeFailure].filter(value => value !== undefined))];
  if (failures.length > 1) throw new AggregateError(failures, 'FED V3 reservation or owned-target close failed');
  if (failures.length === 1) throw failures[0];
  if (result === undefined) throw new Error('FED V3 reservation completed without a result');
  return result;
}

/** Strictly parse the node's bounded raw build-spec output; no process authority is implied. */
export function parseSubstrateFederatedV3RawGenesisStorage(supplied: Readonly<{
  rawSpecJson: string;
  runtimeWasmSha256Hex: string;
  runtimeProfileScaleHex: string;
  bridgeAddressHex: string;
  operatorStorageKeyHex: string;
  operatorAccountInfoHex: string;
}>): Readonly<Record<string, string>> {
  const input = exact(supplied, ['rawSpecJson', 'runtimeWasmSha256Hex', 'runtimeProfileScaleHex',
    'bridgeAddressHex', 'operatorStorageKeyHex', 'operatorAccountInfoHex']);
  if (typeof input.rawSpecJson !== 'string' || Buffer.byteLength(input.rawSpecJson, 'utf8') > MAX_RAW_SPEC_BYTES) {
    throw new Error('FED V3 raw spec exceeds its byte bound');
  }
  if (input.rawSpecJson.startsWith('\uFEFF')) throw new Error('FED V3 raw spec BOM is forbidden');
  if (!/^[0-9a-f]{40}$/.test(input.bridgeAddressHex)
    || !/^0x[0-9a-f]{136}$/.test(input.operatorStorageKeyHex)
    || !/^0x[0-9a-f]{160}$/.test(input.operatorAccountInfoHex)) {
    throw new Error('FED V3 operator storage identifiers differ');
  }
  assertNoDuplicateJsonKeys(input.rawSpecJson);
  const spec = record(JSON.parse(input.rawSpecJson) as unknown);
  if (spec.id !== 'bridge_federated_v4_genesis' || !Array.isArray(spec.bootNodes)
    || spec.bootNodes.length !== 0) throw new Error('FED V3 raw spec target or peers differ');
  const raw = record(record(spec.genesis).raw);
  if (Object.keys(record(raw.childrenDefault)).length !== 0) throw new Error('FED V3 unexpected child storage');
  const top = record(raw.top);
  if (Object.keys(top).length < 4 || Object.keys(top).length > 256
    || Object.entries(top).some(([key, value]) => !/^0x(?:[0-9a-f]{2})+$/.test(key)
      || typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(value))) {
    throw new Error('FED V3 malformed raw storage');
  }
  const storage = top as Record<string, string>;
  if (!/^[0-9a-f]{64}$/.test(input.runtimeWasmSha256Hex)
    || !storage[KEYS.code]
    || sha256(Buffer.from(storage[KEYS.code].slice(2), 'hex')) !== input.runtimeWasmSha256Hex
    || storage[KEYS.profile] !== input.runtimeProfileScaleHex
    || storage[KEYS.enforced] !== '0x01'
    || storage[KEYS.bridge] !== `0x${input.bridgeAddressHex}`
    || storage[KEYS.sudo] !== undefined
    || storage[input.operatorStorageKeyHex] !== input.operatorAccountInfoHex) {
    throw new Error('FED V3 raw storage differs from the runtime, profile or funded operator');
  }
  return Object.freeze({ ...storage });
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('FED V3 object required');
  return value as Record<string, unknown>;
}

function exact<T>(value: T, keys: readonly string[]): Readonly<T> {
  record(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertyNames(descriptors).length
      + Object.getOwnPropertySymbols(descriptors).length !== keys.length
    || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    throw new Error('FED V3 target requires exact data fields');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as Readonly<T>;
}

function directDirectory(path: string): string {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('FED V3 direct directory required');
  const stat = lstatSync(path);
  const canonical = resolve(realpathSync(path));
  if (!stat.isDirectory() || stat.isSymbolicLink() || canonical !== resolve(path)) {
    throw new Error('FED V3 indirect directory is forbidden');
  }
  return canonical;
}

function directFile(path: string, min: number, max: number, expectedBytes: number): string {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('FED V3 direct file required');
  const stat = lstatSync(path);
  const canonical = resolve(realpathSync(path));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || stat.size < min || stat.size > max || stat.size !== expectedBytes
    || canonical !== resolve(path)) {
    throw new Error('FED V3 selected artifact differs or is indirect');
  }
  return canonical;
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
