import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'fs';
import {
  basename,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'path';

import blakejs from 'blakejs';

import {
  EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
} from './bridge-validity-consumer-contract-v1.js';
import {
  deriveEip0045ContractIdHex,
} from './bridge-validity-finality-statement-v2.js';
import {
  buildEip0045BridgeValidityProofEnvelopeV1,
} from './bridge-validity-proof-envelope-v1.js';
import type {
  BuildEip0045BridgeValidityContextExtensionV1Input,
} from './bridge-validity-context-extension-v1.js';

const EXPECTED_STATEMENT_DIGEST_HEX =
  'e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c';
const EXPECTED_TERMINAL_CONTROL_ID_HEX =
  '7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e';
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

export interface LoadedEip0045BridgeValidityCompleteCandidateV1 {
  readonly candidateRoot: string;
  readonly fixtureInput: BuildEip0045BridgeValidityContextExtensionV1Input;
}

export interface Eip0045BridgeValidityCompleteCandidateConsumerV1 {
  readonly contractPropositionBytes: Buffer | string;
  readonly statementDigestHex?: string;
}

export function resolveEip0045BridgeValidityCandidateRoot(
  candidateDirectory: string,
): string {
  return exactDirectory(candidateDirectory, '--candidate-dir');
}

export function loadEip0045BridgeValidityCompleteCandidateV1(
  candidateDirectory: string,
): LoadedEip0045BridgeValidityCompleteCandidateV1 {
  return loadEip0045BridgeValidityCompleteCandidateForConsumerV1(
    candidateDirectory,
    {
      contractPropositionBytes:
        EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
      statementDigestHex: EXPECTED_STATEMENT_DIGEST_HEX,
    },
  );
}

export function loadEip0045BridgeValidityCompleteCandidateForConsumerV1(
  candidateDirectory: string,
  consumer: Eip0045BridgeValidityCompleteCandidateConsumerV1,
): LoadedEip0045BridgeValidityCompleteCandidateV1 {
  const candidateRoot =
    resolveEip0045BridgeValidityCandidateRoot(candidateDirectory);
  const manifest = parseCandidateManifest(candidateRoot);
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
    EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    'guest program ID',
  );
  assertHexIdentity(
    candidate('profile-id.bin'),
    EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    'preactivation profile ID',
  );
  assertHexIdentity(
    candidate('terminal-control-id.bin'),
    EXPECTED_TERMINAL_CONTROL_ID_HEX,
    'terminal control ID',
  );
  const contractIdHex =
    deriveEip0045ContractIdHex(consumer.contractPropositionBytes);
  assertHexIdentity(
    statement.subarray(123, 155),
    contractIdHex,
    'consumer contract ID',
  );
  const statementDigestHex =
    blake2b256Hex(statement);
  if (consumer.statementDigestHex !== undefined) {
    assertExactDigestHex(
      consumer.statementDigestHex,
      'expected statement digest',
    );
    if (statementDigestHex !== consumer.statementDigestHex) {
      throw new Error('statement digest mismatch');
    }
  }

  const chainDomainIdHex = statement.subarray(27, 59).toString('hex');
  const rawSealDigestHex = blake2b256Hex(Buffer.concat(proofChunks));
  const envelope = buildEip0045BridgeValidityProofEnvelopeV1({
    proofChunks,
    applicationPayload: statement.subarray(159),
    programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatement: statement,
    chainDomainIdHex,
    contractPropositionBytes: consumer.contractPropositionBytes,
  });

  return Object.freeze({
    candidateRoot,
    fixtureInput: Object.freeze({
      envelope,
      expected: Object.freeze({
        chainDomainIdHex,
        contractPropositionBytes: consumer.contractPropositionBytes,
        rawSealDigestHex,
      }),
    }),
  });
}

export function resolveCandidateFixtureOutputPath(
  candidateRoot: string,
  value: string,
): string {
  if (!isAbsolute(value)) {
    throw new Error('--out must be absolute');
  }
  const outputPath = resolve(value);
  const parent = resolve(outputPath, '..');
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error('--out parent must be a real directory');
  }
  const physicalOutputPath = resolve(
    realpathSync.native(parent),
    basename(outputPath),
  );
  if (isAtOrBelow(candidateRoot, physicalOutputPath)) {
    throw new Error('--out must be outside the completed candidate directory');
  }
  return physicalOutputPath;
}

function exactDirectory(value: string, label: string): string {
  if (!isAbsolute(value)) {
    throw new Error(`${label} must be absolute`);
  }
  const root = resolve(value);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  return realpathSync.native(root);
}

function isAtOrBelow(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === ''
    || (relativePath !== '..'
      && !relativePath.startsWith(`..${sep}`)
      && !isAbsolute(relativePath));
}

function parseCandidateManifest(
  root: string,
): ReadonlyMap<string, { readonly bytes: number; readonly digestHex: string }> {
  const manifestPath = resolve(root, 'candidate-manifest-v1.txt');
  const stat = lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('complete candidate manifest is unavailable');
  }
  const lines = readFileSync(manifestPath, 'ascii').split('\n');
  if (
    lines[0] !== 'schema=e2s.bridge-validity-eip0045-candidate.v1'
    || lines[1] !== 'version=1'
    || lines.at(-2) !== 'complete=true'
    || lines.at(-1) !== ''
  ) {
    throw new Error('candidate manifest envelope mismatch');
  }

  const entries = new Map<string, { bytes: number; digestHex: string }>();
  for (const line of lines.slice(2, -2)) {
    const match = /^file=([^:]+):([0-9]+):([0-9a-f]{64})$/.exec(line);
    if (!match) {
      throw new Error('candidate manifest file entry is malformed');
    }
    const [, name, bytes, digestHex] = match;
    const byteCount = Number(bytes);
    if (!Number.isSafeInteger(byteCount) || byteCount < 0) {
      throw new Error(`candidate manifest byte count is unsafe: ${name}`);
    }
    if (entries.has(name)) {
      throw new Error(`candidate manifest contains duplicate file: ${name}`);
    }
    entries.set(name, { bytes: byteCount, digestHex });
  }
  if (
    [...entries.keys()].length !== CANDIDATE_FILES.length
    || [...entries.keys()].some((name, index) => name !== CANDIDATE_FILES[index])
  ) {
    throw new Error('candidate manifest file order or names mismatch');
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
    throw new Error(`candidate file escapes candidate root: ${name}`);
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`candidate file is unavailable: ${name}`);
  }
  const bytes = readFileSync(path);
  if (bytes.length !== expected.bytes || blake2b256Hex(bytes) !== expected.digestHex) {
    throw new Error(`candidate file identity mismatch: ${name}`);
  }
  return bytes;
}

function assertHexIdentity(actual: Buffer, expectedHex: string, label: string): void {
  if (actual.toString('hex') !== expectedHex) {
    throw new Error(`${label} mismatch`);
  }
}

function assertExactDigestHex(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be exactly 32 lowercase hex bytes`);
  }
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
