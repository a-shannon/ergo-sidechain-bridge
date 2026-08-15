import { createHash } from 'crypto';

import {
  runAuthenticatedV2JvmVmConformance,
  type AuthenticatedV2JvmVmConformanceReport,
} from './authenticated-v2-source-tree-conformance.js';
import {
  compilePinnedAuthenticatedV2VmTrees,
  type PinnedAuthenticatedV2VmTrees,
} from './authenticated-v2-offline-vm-fixture.js';

export const AUTHENTICATED_V2_JVM_VM_FIXTURE_SCHEMA =
  'e2s.authenticated-v2-jvm-vm-fixture.v2';

export type AuthenticatedV2JvmContractRole =
  | 'tracker'
  | 'unlock'
  | 'duplicatePrevention';

export interface AuthenticatedV2JvmContractBinding {
  role: AuthenticatedV2JvmContractRole;
  ergoTreeHex: string;
}

export interface AuthenticatedV2JvmHeaderRecord {
  raw: Record<string, unknown>;
  id?: string;
}

export interface BuildAuthenticatedV2JvmVmFixtureInput {
  wasm: any;
  mode: 'tracker' | 'settlement';
  signedTransaction: Record<string, unknown>;
  signedTransactionBytes: Uint8Array;
  unsignedTransaction: Record<string, unknown>;
  inputBoxes: Record<string, unknown>[];
  dataInputBoxes: Record<string, unknown>[];
  contractBindings: {
    inputs: AuthenticatedV2JvmContractBinding[];
    dataInputs: AuthenticatedV2JvmContractBinding[];
  };
  canonicalContractTrees: PinnedAuthenticatedV2VmTrees['trees'];
  preHeader: AuthenticatedV2JvmHeaderRecord;
  headers: AuthenticatedV2JvmHeaderRecord[];
}

export interface AuthenticatedV2JvmVmFixture {
  schema: typeof AUTHENTICATED_V2_JVM_VM_FIXTURE_SCHEMA;
  mode: 'tracker' | 'settlement';
  contextKind: 'node-simplified-upcoming';
  signedTransactionHex: string;
  signedTransactionSha256Hex: string;
  expectedTransactionIdHex: string;
  expectedUnsignedIdHex: string;
  inputBoxesHex: string[];
  dataInputBoxesHex: string[];
  contractBindings: {
    inputs: AuthenticatedV2JvmContractBinding[];
    dataInputs: AuthenticatedV2JvmContractBinding[];
  };
  preHeaderJson: string;
  headers: Array<{
    expectedIdHex: string;
    headerJson: string;
  }>;
  contextSha256Hex: string;
  costLimit: 1_000_000;
  initCost: 0;
  activatedScriptVersion: 3;
  boundaries: {
    nodeStatefulAcceptance: false;
    broadcastPerformed: false;
    gate5Closed: false;
  };
}

export function buildAuthenticatedV2JvmVmFixture(
  input: BuildAuthenticatedV2JvmVmFixtureInput,
): AuthenticatedV2JvmVmFixture {
  if (input.headers.length !== 10) throw new Error('JVM VM fixture requires exactly 10 headers');
  if (input.inputBoxes.length === 0) throw new Error('JVM VM fixture requires at least one input box');
  const unsignedInputs = input.unsignedTransaction.inputs;
  if (!Array.isArray(unsignedInputs) || input.inputBoxes.length !== unsignedInputs.length) {
    throw new Error('JVM VM fixture input box count must match the unsigned transaction');
  }
  if (input.contractBindings.inputs.length !== input.inputBoxes.length) {
    throw new Error('JVM VM fixture input binding count must match input boxes');
  }
  if (input.contractBindings.dataInputs.length !== input.dataInputBoxes.length) {
    throw new Error('JVM VM fixture data-input binding count must match data-input boxes');
  }

  const contractBindings = {
    inputs: normalizeBindings(
      input.contractBindings.inputs,
      input.inputBoxes,
      'input',
    ),
    dataInputs: normalizeBindings(
      input.contractBindings.dataInputs,
      input.dataInputBoxes,
      'data-input',
    ),
  };
  assertModeBindings(input.mode, contractBindings);
  assertCanonicalContractBindings(contractBindings, input.canonicalContractTrees);

  const signedJson = input.wasm.Transaction.from_json(JSON.stringify(input.signedTransaction));
  const signedTransactionBytes = Buffer.from(input.signedTransactionBytes);
  if (signedTransactionBytes.length === 0) {
    throw new Error('exact signed transaction serialization is empty');
  }
  const jsonRoundTripBytes = Buffer.from(signedJson.sigma_serialize_bytes());
  if (!jsonRoundTripBytes.equals(signedTransactionBytes)) {
    throw new Error('signed transaction JSON differs from the exact wallet serialization');
  }
  // The WASM Transaction.sigma_parse_bytes helper rejects some valid signed
  // multi-input serializations emitted by its own wallet. Exactness is instead
  // established here by wallet-bytes == JSON round-trip bytes, then independently
  // by the pinned JVM parser, byte-identical round trip, ID, bytes-to-sign, and
  // spending-proof checks over these same wallet bytes.
  const signed = signedJson;
  const unsigned = input.wasm.UnsignedTransaction.from_json(JSON.stringify(input.unsignedTransaction));
  const expectedTransactionIdHex = fixedHex(
    signed.id().to_str(),
    32,
    'signed transaction ID',
  );
  const expectedUnsignedIdHex = fixedHex(
    unsigned.id().to_str(),
    32,
    'unsigned transaction ID',
  );
  if (expectedTransactionIdHex !== expectedUnsignedIdHex) {
    throw new Error('signed and unsigned transaction IDs must share one bytes-to-sign identity');
  }
  const normalizedHeaders = input.headers.map((record, index) => {
    const raw = requiredRecord(record.raw, `header ${index}`);
    const expectedIdHex = fixedHex(
      record.id ?? raw.id,
      32,
      `header ${index} ID`,
    );
    return {
      expectedIdHex,
      headerJson: buildJvmHeaderJson(raw, `header ${index}`),
    };
  });
  const preHeaderRaw = requiredRecord(input.preHeader.raw, 'preheader');
  const preHeaderHeight = safeInteger(preHeaderRaw.height, 'preheader height');
  const tipRaw = requiredRecord(input.headers[0].raw, 'header 0');
  const tipHeight = safeInteger(tipRaw.height, 'header 0 height');
  const tipIdHex = normalizedHeaders[0].expectedIdHex;
  if (preHeaderHeight !== tipHeight + 1) {
    throw new Error('preheader height must be exactly one above the context tip');
  }
  if (fixedHex(preHeaderRaw.parentId, 32, 'preheader parent ID') !== tipIdHex) {
    throw new Error('preheader must extend the context tip');
  }
  for (let index = 1; index < input.headers.length; index += 1) {
    const previousRaw = requiredRecord(input.headers[index - 1].raw, `header ${index - 1}`);
    const parentRaw = requiredRecord(input.headers[index].raw, `header ${index}`);
    if (
      fixedHex(previousRaw.parentId, 32, `header ${index - 1} parent ID`)
      !== normalizedHeaders[index].expectedIdHex
    ) {
      throw new Error(`header ${index - 1} must extend header ${index}`);
    }
    if (
      safeInteger(previousRaw.height, `header ${index - 1} height`)
      !== safeInteger(parentRaw.height, `header ${index} height`) + 1
    ) {
      throw new Error(`header ${index - 1} height must be exactly one above header ${index}`);
    }
  }

  const preHeaderJson = buildJvmPreHeaderJson(preHeaderRaw);
  const contextSha256Hex = sha256(Buffer.from([
    'node-simplified-upcoming',
    preHeaderJson,
    ...normalizedHeaders.map(header => `${header.expectedIdHex}\t${header.headerJson}`),
  ].join('\n'), 'utf8'));

  return {
    schema: AUTHENTICATED_V2_JVM_VM_FIXTURE_SCHEMA,
    mode: input.mode,
    contextKind: 'node-simplified-upcoming',
    signedTransactionHex: signedTransactionBytes.toString('hex'),
    signedTransactionSha256Hex: sha256(signedTransactionBytes),
    expectedTransactionIdHex,
    expectedUnsignedIdHex,
    inputBoxesHex: input.inputBoxes.map((box, index) => serializeBox(input.wasm, box, `input box ${index}`)),
    dataInputBoxesHex: input.dataInputBoxes.map((box, index) => (
      serializeBox(input.wasm, box, `data input box ${index}`)
    )),
    contractBindings,
    preHeaderJson,
    headers: normalizedHeaders,
    contextSha256Hex,
    costLimit: 1_000_000,
    initCost: 0,
    activatedScriptVersion: 3,
    boundaries: {
      nodeStatefulAcceptance: false,
      broadcastPerformed: false,
      gate5Closed: false,
    },
  };
}

export async function verifyAuthenticatedV2JvmVmFixture(input: {
  bridgeRoot: string;
  worktreeRoot: string;
  ergoSourcePath: string;
  trackerNftId: string;
  duplicatePreventionNftId: string;
  fixture: AuthenticatedV2JvmVmFixture;
}): Promise<AuthenticatedV2JvmVmConformanceReport> {
  return runAuthenticatedV2JvmVmConformance({
    bridgeRoot: input.bridgeRoot,
    worktreeRoot: input.worktreeRoot,
    ergoSourcePath: input.ergoSourcePath,
    trackerNftId: input.trackerNftId,
    duplicatePreventionNftId: input.duplicatePreventionNftId,
    fixtureJson: `${JSON.stringify(input.fixture)}\n`,
  });
}

function serializeBox(wasm: any, box: Record<string, unknown>, label: string): string {
  const bytes = Buffer.from(wasm.ErgoBox.from_json(JSON.stringify(box)).sigma_serialize_bytes());
  if (bytes.length === 0) throw new Error(`${label} serialization is empty`);
  return bytes.toString('hex');
}

function buildJvmHeaderJson(raw: Record<string, unknown>, label: string): string {
  const pow = requiredRecord(raw.powSolutions, `${label} powSolutions`);
  const powDistance = decimalInteger(pow.d, `${label} PoW distance`);
  const json = JSON.stringify({
    version: byteInteger(raw.version, `${label} version`),
    parentId: fixedHex(raw.parentId, 32, `${label} parent ID`),
    adProofsRoot: fixedHex(raw.adProofsRoot, 32, `${label} AD proofs root`),
    stateRoot: {
      digest: fixedHex(raw.stateRoot, 33, `${label} state root`),
      treeFlags: 7,
      keyLength: 32,
      valueLength: null,
    },
    transactionsRoot: fixedHex(raw.transactionsRoot, 32, `${label} transactions root`),
    timestamp: safeInteger(raw.timestamp, `${label} timestamp`),
    nBits: safeInteger(raw.nBits, `${label} nBits`),
    height: safeInteger(raw.height, `${label} height`),
    extensionRoot: fixedHex(
      raw.extensionRoot ?? raw.extensionHash,
      32,
      `${label} extension root`,
    ),
    minerPk: fixedHex(pow.pk, 33, `${label} miner public key`),
    powOnetimePk: fixedHex(pow.w, 33, `${label} PoW one-time public key`),
    powNonce: fixedHex(pow.n, 8, `${label} PoW nonce`),
    powDistance: '__POW_DISTANCE__',
    votes: fixedHex(raw.votes, 3, `${label} votes`),
  });
  return json.replace('"__POW_DISTANCE__"', powDistance);
}

function buildJvmPreHeaderJson(raw: Record<string, unknown>): string {
  return JSON.stringify({
    version: byteInteger(raw.version, 'preheader version'),
    parentId: fixedHex(raw.parentId, 32, 'preheader parent ID'),
    timestamp: safeInteger(raw.timestamp, 'preheader timestamp'),
    nBits: safeInteger(raw.nBits, 'preheader nBits'),
    height: safeInteger(raw.height, 'preheader height'),
    minerPk: fixedHex(raw.minerPk, 33, 'preheader miner public key'),
    votes: emptyVotes(raw.votes),
  });
}

function normalizeBindings(
  bindings: AuthenticatedV2JvmContractBinding[],
  boxes: Record<string, unknown>[],
  label: 'input' | 'data-input',
): AuthenticatedV2JvmContractBinding[] {
  return bindings.map((binding, index) => {
    const role = binding?.role;
    if (role !== 'tracker' && role !== 'unlock' && role !== 'duplicatePrevention') {
      throw new Error(`${label} binding ${index} role is unsupported`);
    }
    const ergoTreeHex = canonicalHex(binding.ergoTreeHex, `${label} binding ${index} ErgoTree`);
    const box = requiredRecord(boxes[index], `${label} box ${index}`);
    if (canonicalHex(box.ergoTree, `${label} box ${index} ErgoTree`) !== ergoTreeHex) {
      throw new Error(`${label} binding ${index} ErgoTree must match ${label} box ${index}`);
    }
    return { role, ergoTreeHex };
  });
}

function assertModeBindings(
  mode: 'tracker' | 'settlement',
  bindings: AuthenticatedV2JvmVmFixture['contractBindings'],
): void {
  const inputRoles = bindings.inputs.map(binding => binding.role).join(',');
  const dataInputRoles = bindings.dataInputs.map(binding => binding.role).join(',');
  if (mode === 'tracker') {
    if (inputRoles !== 'tracker') {
      throw new Error('tracker fixture input roles must be exactly tracker');
    }
    if (dataInputRoles !== '') {
      throw new Error('tracker fixture must not contain data-input roles');
    }
    return;
  }
  if (inputRoles !== 'duplicatePrevention,unlock') {
    throw new Error('settlement fixture input roles must be exactly duplicatePrevention,unlock');
  }
  if (dataInputRoles !== 'tracker') {
    throw new Error('settlement fixture data-input roles must be exactly tracker');
  }
}

function assertCanonicalContractBindings(
  bindings: AuthenticatedV2JvmVmFixture['contractBindings'],
  canonicalTreesInput: PinnedAuthenticatedV2VmTrees['trees'],
): void {
  const canonicalTrees = {
    tracker: canonicalHex(canonicalTreesInput.tracker, 'canonical tracker ErgoTree'),
    unlock: canonicalHex(canonicalTreesInput.unlock, 'canonical unlock ErgoTree'),
    duplicatePrevention: canonicalHex(
      canonicalTreesInput.duplicatePrevention,
      'canonical duplicate-prevention ErgoTree',
    ),
  };
  for (const [kind, entries] of [
    ['input', bindings.inputs],
    ['data-input', bindings.dataInputs],
  ] as const) {
    entries.forEach((binding, index) => {
      if (binding.ergoTreeHex !== canonicalTrees[binding.role]) {
        throw new Error(
          `${kind} binding ${index} ${binding.role} ErgoTree must match the pinned canonical compilation`,
        );
      }
    });
  }
}

function requiredRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hex`);
  }
  return normalized.toLowerCase();
}

function canonicalHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return normalized.toLowerCase();
}

function emptyVotes(value: unknown): '' {
  if (value !== '') throw new Error('preheader votes must be empty for node simplifiedUpcoming context');
  return '';
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function byteInteger(value: unknown, label: string): number {
  const parsed = safeInteger(value, label);
  if (parsed > 255) throw new Error(`${label} must fit in one byte`);
  return parsed;
}

function decimalInteger(value: unknown, label: string): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string'
      ? value
      : '';
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${label} must be a canonical non-negative decimal integer`);
  }
  return text;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
