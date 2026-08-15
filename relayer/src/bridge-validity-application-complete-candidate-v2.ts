import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'fs';
import {
  isAbsolute,
  resolve,
} from 'path';

import blakejs from 'blakejs';

import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  decodeBridgeValidityApplicationPayloadV3,
} from './bridge-validity-application-statement-v2.js';
import {
  buildEip0045BridgeApplicationProofEnvelopeV2,
  type Eip0045BridgeApplicationProofEnvelopeV2ExpectedContext,
} from './bridge-validity-application-proof-envelope-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
} from './spv-tracker-validity-v2.js';

const EXPECTED_TERMINAL_CONTROL_ID_HEX =
  '7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e';
const APPLICATION_BINDING_REJECTION_MUTATION_FIELD =
  'bridge-runtime-code-sha256';
const CANDIDATE_FILES = [
  'statement.bin',
  'program-id.bin',
  'profile-id.bin',
  'terminal-control-id.bin',
  'proof-chunk-0.bin',
  'proof-chunk-1.bin',
  'proof-chunk-2.bin',
  'proof-chunk-3.bin',
] as const;

export interface LoadedEip0045BridgeApplicationCompleteCandidateV2 {
  readonly candidateRoot: string;
  readonly envelope:
    ReturnType<typeof buildEip0045BridgeApplicationProofEnvelopeV2>;
  readonly expected:
    Eip0045BridgeApplicationProofEnvelopeV2ExpectedContext;
}

export interface LoadedEip0045BridgeApplicationBindingRejectionCandidateV2
  extends LoadedEip0045BridgeApplicationCompleteCandidateV2 {
  readonly mutationField:
    typeof APPLICATION_BINDING_REJECTION_MUTATION_FIELD;
}

export function loadEip0045BridgeApplicationCompleteCandidateV2(
  candidateDirectory: string,
): LoadedEip0045BridgeApplicationCompleteCandidateV2 {
  const loaded = loadCandidate(candidateDirectory, {
    manifestName: 'candidate-manifest-v2.txt',
    prefix: [
      'schema=e2s.bridge-validity-eip0045-application-candidate.v2',
      'version=2',
    ],
  });
  const payload = decodeBridgeValidityApplicationPayloadV3(
    loaded.envelope.consumerAbi.applicationPayloadHex,
  );
  if (
    payload.application.encodedBindingHex
    !== EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX
  ) {
    throw new Error(
      'complete application candidate does not match the pinned application binding',
    );
  }
  return loaded;
}

export function loadEip0045BridgeApplicationBindingRejectionCandidateV2(
  candidateDirectory: string,
): LoadedEip0045BridgeApplicationBindingRejectionCandidateV2 {
  const loaded = loadCandidate(candidateDirectory, {
    manifestName: 'application-binding-rejection-manifest-v2.txt',
    prefix: [
      'schema=e2s.bridge-validity-eip0045-application-binding-rejection-candidate.v2',
      'version=2',
      `mutation-field=${APPLICATION_BINDING_REJECTION_MUTATION_FIELD}`,
      `contract-id=${EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX}`,
    ],
  });
  const payload = decodeBridgeValidityApplicationPayloadV3(
    loaded.envelope.consumerAbi.applicationPayloadHex,
  );
  const canonical = Buffer.from(
    EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    'hex',
  );
  const alternate = Buffer.from(
    payload.application.encodedBindingHex,
    'hex',
  );
  const differences = [...canonical.keys()].filter(
    index => canonical[index] !== alternate[index],
  );
  if (
    differences.length !== 1
    || differences[0] !== 168
    || canonical[168] !== 0xbb
    || alternate[168] !== 0xba
  ) {
    throw new Error(
      'application binding rejection candidate is not the exact bridge runtime hash mutation',
    );
  }
  return deepFreeze({
    ...loaded,
    mutationField: APPLICATION_BINDING_REJECTION_MUTATION_FIELD,
  });
}

function loadCandidate(
  candidateDirectory: string,
  manifestProfile: {
    readonly manifestName: string;
    readonly prefix: readonly string[];
  },
): LoadedEip0045BridgeApplicationCompleteCandidateV2 {
  const candidateRoot = exactDirectory(candidateDirectory, '--candidate-dir');
  const manifest = parseCandidateManifest(candidateRoot, manifestProfile);
  const candidate = (name: typeof CANDIDATE_FILES[number]): Buffer =>
    readCandidateFile(candidateRoot, name, manifest.get(name)!);
  const statement = candidate('statement.bin');
  const proofChunks = [
    candidate('proof-chunk-0.bin'),
    candidate('proof-chunk-1.bin'),
    candidate('proof-chunk-2.bin'),
    candidate('proof-chunk-3.bin'),
  ];
  assertHexIdentity(
    candidate('program-id.bin'),
    EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    'application guest program ID',
  );
  assertHexIdentity(
    candidate('profile-id.bin'),
    EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    'preactivation profile ID',
  );
  assertHexIdentity(
    candidate('terminal-control-id.bin'),
    EXPECTED_TERMINAL_CONTROL_ID_HEX,
    'terminal control ID',
  );
  const chainDomainIdHex = statement.subarray(27, 59).toString('hex');
  const rawSealDigestHex = blake2b256Hex(Buffer.concat(proofChunks));
  const envelope = buildEip0045BridgeApplicationProofEnvelopeV2({
    proofChunks,
    applicationPayload: statement.subarray(159),
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    profileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatement: statement,
    chainDomainIdHex,
    contractPropositionBytes:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  });
  return deepFreeze({
    candidateRoot,
    envelope,
    expected: {
      chainDomainIdHex,
      contractPropositionBytes:
        EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
      rawSealDigestHex,
    },
  });
}

function exactDirectory(value: string, label: string): string {
  if (!isAbsolute(value)) throw new Error(`${label} must be absolute`);
  const root = resolve(value);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  return realpathSync.native(root);
}

function parseCandidateManifest(
  root: string,
  profile: {
    readonly manifestName: string;
    readonly prefix: readonly string[];
  },
): ReadonlyMap<string, { readonly bytes: number; readonly digestHex: string }> {
  const manifestPath = resolve(root, profile.manifestName);
  const stat = lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('complete application candidate manifest is unavailable');
  }
  const lines = readFileSync(manifestPath, 'ascii').split('\n');
  if (
    profile.prefix.some((line, index) => lines[index] !== line)
    || lines.at(-2) !== 'complete=true'
    || lines.at(-1) !== ''
  ) {
    throw new Error('application candidate manifest envelope mismatch');
  }
  const entries =
    new Map<string, { readonly bytes: number; readonly digestHex: string }>();
  for (const line of lines.slice(profile.prefix.length, -2)) {
    const match = /^file=([^:]+):([0-9]+):([0-9a-f]{64})$/.exec(line);
    if (!match) {
      throw new Error('application candidate manifest entry is malformed');
    }
    const [, name, bytes, digestHex] = match;
    const byteCount = Number(bytes);
    if (!Number.isSafeInteger(byteCount) || byteCount < 0) {
      throw new Error(
        `application candidate byte count is unsafe: ${name}`,
      );
    }
    if (entries.has(name)) {
      throw new Error(
        `application candidate manifest contains duplicate file: ${name}`,
      );
    }
    entries.set(name, { bytes: byteCount, digestHex });
  }
  if (
    entries.size !== CANDIDATE_FILES.length
    || [...entries.keys()].some(
      (name, index) => name !== CANDIDATE_FILES[index],
    )
  ) {
    throw new Error(
      'application candidate manifest file order or names mismatch',
    );
  }
  return entries;
}

function readCandidateFile(
  root: string,
  name: typeof CANDIDATE_FILES[number],
  expected: { readonly bytes: number; readonly digestHex: string },
): Buffer {
  const path = resolve(root, name);
  if (resolve(path, '..') !== root) {
    throw new Error(`application candidate file escapes root: ${name}`);
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`application candidate file is unavailable: ${name}`);
  }
  const bytes = readFileSync(path);
  if (
    bytes.length !== expected.bytes
    || blake2b256Hex(bytes) !== expected.digestHex
  ) {
    throw new Error(`application candidate file identity mismatch: ${name}`);
  }
  return bytes;
}

function assertHexIdentity(
  actual: Buffer,
  expectedHex: string,
  label: string,
): void {
  if (actual.toString('hex') !== expectedHex) {
    throw new Error(`${label} mismatch`);
  }
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
