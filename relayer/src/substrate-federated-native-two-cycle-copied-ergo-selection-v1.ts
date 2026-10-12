import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { types } from 'node:util';
import { canonicalJson, sha256CanonicalJson, parseStrictJson } from './strict-json.js';
import { canonicalPathIdentity, readBoundedRegularFile } from './create-only-out-of-repository-artifact.js';
import { prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1 } from './substrate-federated-two-cycle-copied-ergo-selection-v1.js';
import { projectSubstrateFederatedNativeTwoCycleResultV1 } from './substrate-federated-native-two-cycle-invocation-v1.js';
import { parseNativeTwoCycleWorkerRecoveryLocatorV1, parseNativeTwoCycleParentRecoveryLocatorV1,
  type RecoveryLocatorBindingsV1, type RecoveryLocatorPointerV1 } from './substrate-federated-native-two-cycle-recovery-locator-v1.js';

const WORKER_SCHEMA = 'e2s.substrate-federated-native-two-cycle-worker-copied-ergo-selection.v1' as const;
const PARENT_SCHEMA = 'e2s.substrate-federated-native-two-cycle-parent-copied-ergo-selection.v1' as const;
const WORKER_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COPIED_ERGO_SELECTION_V1';
const PARENT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COPIED_ERGO_SELECTION_V1';
const BINDING_KEYS = ['configSha256Hex', 'bridgeCommit', 'bridgeTree', 'pathIdentityDigestHex',
  'toolIdentityDigestHex', 'rootResultDigestHex', 'projectedReceiptDigestHex'] as const;
const CLAIMS = Object.freeze({ successAuthenticated: false as const, recoveryAdmitted: false as const,
  nodeConsistencyEstablished: false as const, freshRestartValidated: false as const,
  executionAuthorityRestored: false as const });
const COMMON_KEYS = [...BINDING_KEYS, 'version', 'rootRawSha256Hex', 'locator', 'ergoManifestSha256Hex',
  'expectedSnapshot', 'workerRecoveryLocatorReceiptDigestHex', ...Object.keys(CLAIMS)] as const;

export interface NativeTwoCycleCopiedErgoSelectionBindingsV1 extends RecoveryLocatorBindingsV1 {
  readonly projectedReceiptDigestHex: string;
}
export interface NativeTwoCycleCopiedErgoSnapshotV1 {
  readonly network: 'devnet'; readonly fullHeight: number; readonly indexedHeight: number;
  readonly headerIdHex: string;
}
export interface NativeTwoCycleCopiedErgoSelectionExpectedV1 {
  readonly bindings: Readonly<NativeTwoCycleCopiedErgoSelectionBindingsV1>;
  readonly locator: Readonly<RecoveryLocatorPointerV1>;
  readonly ergoManifestSha256Hex: string;
  readonly workerRecoveryLocatorReceiptDigestHex: string;
  /** Optional independently selected pins, not inferred authentication. */
  readonly rootRawSha256Hex?: string;
  readonly expectedSnapshot?: Readonly<NativeTwoCycleCopiedErgoSnapshotV1>;
}
export interface NativeTwoCycleParentCopiedErgoSelectionExpectedV1 extends NativeTwoCycleCopiedErgoSelectionExpectedV1 {
  readonly terminalReceiptDigestHex: string;
  readonly parentRecoveryLocatorReceiptDigestHex: string;
  readonly workerSelectionReceiptDigestHex?: string;
}
interface SelectionBody extends NativeTwoCycleCopiedErgoSelectionBindingsV1 {
  readonly version: 1;
  readonly rootRawSha256Hex: string;
  readonly locator: Readonly<RecoveryLocatorPointerV1>;
  readonly ergoManifestSha256Hex: string;
  readonly expectedSnapshot: Readonly<NativeTwoCycleCopiedErgoSnapshotV1>;
  readonly workerRecoveryLocatorReceiptDigestHex: string;
  readonly successAuthenticated: false;
  readonly recoveryAdmitted: false;
  readonly nodeConsistencyEstablished: false;
  readonly freshRestartValidated: false;
  readonly executionAuthorityRestored: false;
}
export interface NativeTwoCycleWorkerCopiedErgoSelectionV1 extends SelectionBody {
  readonly schema: typeof WORKER_SCHEMA;
  readonly status: 'root_copied_ergo_selection_bound';
  readonly receiptDigestHex: string;
}
export interface NativeTwoCycleParentCopiedErgoSelectionV1 extends SelectionBody {
  readonly schema: typeof PARENT_SCHEMA;
  readonly status: 'worker_copied_ergo_selection_validated';
  readonly terminalReceiptDigestHex: string;
  readonly parentRecoveryLocatorReceiptDigestHex: string;
  readonly workerSelectionReceiptDigestHex: string;
  readonly receiptDigestHex: string;
}

/** Derives the public selection from the complete live producer result. No caller
 * supplied snapshot is accepted. Hash correspondence is not authentication. */
export function createNativeTwoCycleWorkerCopiedErgoSelectionV1(input: Readonly<{
  rootResultText: string;
  captureManifestText: string;
  buildParentDirectory: string;
  workerRecoveryLocatorText: string;
  bindings: Readonly<NativeTwoCycleCopiedErgoSelectionBindingsV1>;
}>): Readonly<NativeTwoCycleWorkerCopiedErgoSelectionV1> {
  const raw = exact(input, ['rootResultText', 'captureManifestText', 'buildParentDirectory',
    'workerRecoveryLocatorText', 'bindings']);
  const bindings = normalizeBindings(raw.bindings);
  const rootText = boundedText(raw.rootResultText, 2 * 1024 * 1024);
  const captureText = boundedText(raw.captureManifestText, 16 * 1024);
  const selection = prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1({
    rootResultText: rootText, expectedRootResultSha256Hex: hash(rootText), captureManifestText: captureText,
    buildParentDirectory: raw.buildParentDirectory as string,
    // The pure selector stores this callback but never invokes it; it cannot
    // supply a usable stopped-owner assertion if accidentally forwarded.
    assertSourcesQuiescent: () => { throw new Error('public selection does not admit recovery'); },
  });
  const root = parseStrictJson(rootText) as Record<string, unknown>;
  const projected = projectSubstrateFederatedNativeTwoCycleResultV1(root);
  if (projected.rootResultDigestHex !== bindings.rootResultDigestHex
    || selection.legacyProjectedReceiptDigestHex !== bindings.projectedReceiptDigestHex) {
    throw new Error('copied Ergo root projection ancestry differs');
  }
  const workerLocatorText = boundedText(raw.workerRecoveryLocatorText, 16 * 1024);
  const workerLocator = parseNativeTwoCycleWorkerRecoveryLocatorV1(workerLocatorText, locatorBindings(bindings));
  const locator = normalizeLocator(root.recoveryEvidence);
  equal(locator, workerLocator.locator, 'root locator');
  const body = Object.freeze({ schema: WORKER_SCHEMA, version: 1 as const,
    status: 'root_copied_ergo_selection_bound' as const, ...bindings,
    rootRawSha256Hex: selection.rootRawSha256Hex, locator,
    ergoManifestSha256Hex: selection.ownerInput.capturedManifestSha256Hex,
    expectedSnapshot: normalizeSnapshot(selection.ownerInput.expectedSnapshot),
    workerRecoveryLocatorReceiptDigestHex: hex(workerLocator.receiptDigestHex), ...CLAIMS });
  return seal(body, WORKER_DOMAIN);
}

export function parseNativeTwoCycleWorkerCopiedErgoSelectionV1(
  text: string, expectedValue: Readonly<NativeTwoCycleCopiedErgoSelectionExpectedV1>,
): Readonly<NativeTwoCycleWorkerCopiedErgoSelectionV1> {
  const expected = normalizeExpected(expectedValue, false);
  const raw = exact(parseCanonical(text), ['schema', 'status', ...COMMON_KEYS, 'receiptDigestHex']);
  if (raw.schema !== WORKER_SCHEMA || raw.status !== 'root_copied_ergo_selection_bound') {
    throw new Error('worker copied Ergo selection identity differs');
  }
  verifyDigest(raw, WORKER_DOMAIN);
  const common = normalizeCommon(raw);
  compareExpected(common, expected);
  return Object.freeze({ schema: WORKER_SCHEMA, status: 'root_copied_ergo_selection_bound',
    ...common, receiptDigestHex: hex(raw.receiptDigestHex) });
}

export function createNativeTwoCycleParentCopiedErgoSelectionV1(input: Readonly<{
  workerSelectionText: string;
  workerRecoveryLocatorText: string;
  parentRecoveryLocatorText: string;
  terminalReceiptDigestHex: string;
  expected: Readonly<NativeTwoCycleCopiedErgoSelectionExpectedV1>;
}>): Readonly<NativeTwoCycleParentCopiedErgoSelectionV1> {
  const raw = exact(input, ['workerSelectionText', 'workerRecoveryLocatorText', 'parentRecoveryLocatorText',
    'terminalReceiptDigestHex', 'expected']);
  const expected = normalizeExpected(raw.expected, false);
  const worker = parseNativeTwoCycleWorkerCopiedErgoSelectionV1(raw.workerSelectionText as string,
    raw.expected as NativeTwoCycleCopiedErgoSelectionExpectedV1);
  const terminal = hex(raw.terminalReceiptDigestHex);
  const parentLocator = parseNativeTwoCycleParentRecoveryLocatorV1(
    boundedText(raw.parentRecoveryLocatorText, 16 * 1024), locatorBindings(expected.bindings), terminal,
    boundedText(raw.workerRecoveryLocatorText, 16 * 1024));
  equal(parentLocator.locator, expected.locator, 'parent locator');
  if (parentLocator.workerRecoveryLocatorReceiptDigestHex !== expected.workerRecoveryLocatorReceiptDigestHex) {
    throw new Error('parent copied Ergo worker locator ancestry differs');
  }
  const { schema: _schema, status: _status, receiptDigestHex: workerSelectionReceiptDigestHex, ...common } = worker;
  return seal(Object.freeze({ schema: PARENT_SCHEMA, status: 'worker_copied_ergo_selection_validated' as const,
    ...common, terminalReceiptDigestHex: terminal,
    parentRecoveryLocatorReceiptDigestHex: hex(parentLocator.receiptDigestHex), workerSelectionReceiptDigestHex }), PARENT_DOMAIN);
}

/** Validates a separately selected public parent companion without worker bytes.
 * Opaque worker ancestry and self-hashes do not authenticate a coordinated forgery. */
export function parseNativeTwoCycleParentCopiedErgoSelectionV1(
  text: string, expectedValue: Readonly<NativeTwoCycleParentCopiedErgoSelectionExpectedV1>,
): Readonly<NativeTwoCycleParentCopiedErgoSelectionV1> {
  const expected = normalizeExpected(expectedValue, true);
  const raw = exact(parseCanonical(text), ['schema', 'status', ...COMMON_KEYS, 'terminalReceiptDigestHex',
    'parentRecoveryLocatorReceiptDigestHex', 'workerSelectionReceiptDigestHex', 'receiptDigestHex']);
  if (raw.schema !== PARENT_SCHEMA || raw.status !== 'worker_copied_ergo_selection_validated') {
    throw new Error('parent copied Ergo selection identity differs');
  }
  verifyDigest(raw, PARENT_DOMAIN);
  const common = normalizeCommon(raw);
  compareExpected(common, expected);
  const terminalReceiptDigestHex = hex(raw.terminalReceiptDigestHex);
  const parentRecoveryLocatorReceiptDigestHex = hex(raw.parentRecoveryLocatorReceiptDigestHex);
  const workerSelectionReceiptDigestHex = hex(raw.workerSelectionReceiptDigestHex);
  if (terminalReceiptDigestHex !== expected.terminalReceiptDigestHex
    || parentRecoveryLocatorReceiptDigestHex !== expected.parentRecoveryLocatorReceiptDigestHex
    || (expected.workerSelectionReceiptDigestHex !== undefined
      && workerSelectionReceiptDigestHex !== expected.workerSelectionReceiptDigestHex)) {
    throw new Error('parent copied Ergo selection ancestry differs');
  }
  return Object.freeze({ schema: PARENT_SCHEMA, status: 'worker_copied_ergo_selection_validated', ...common,
    terminalReceiptDigestHex, parentRecoveryLocatorReceiptDigestHex, workerSelectionReceiptDigestHex,
    receiptDigestHex: hex(raw.receiptDigestHex) });
}

/** Reads only the selected aggregate, never component databases. All ancestor
 * identities and the single-link regular file are checked around the bounded read. */
export function readNativeTwoCycleCopiedErgoCaptureManifestV1(
  buildParentDirectory: string, locatorValue: Readonly<RecoveryLocatorPointerV1>,
): Readonly<{ captureManifestText: string; ergoManifestSha256Hex: string }> {
  const locator = normalizeLocator(locatorValue);
  const parent = lexicalParent(buildParentDirectory);
  const capture = join(parent, locator.buildDirectoryName, 'target', locator.directoryName);
  const paths: string[] = [];
  for (let path = capture; ; path = dirname(path)) {
    paths.unshift(path);
    if (dirname(path) === path) break;
  }
  const identities = paths.map(directoryIdentity);
  const manifest = join(capture, 'manifest.json');
  const before = lstatSync(manifest);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('capture manifest must be direct single-link file');
  const bytes = readBoundedRegularFile(manifest, 'copied Ergo aggregate manifest', 64 * 1024).bytes;
  const after = lstatSync(manifest);
  if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
    || fileIdentity(before) !== fileIdentity(after)) throw new Error('capture manifest changed during selection');
  paths.forEach((path, index) => {
    if (directoryIdentity(path) !== identities[index]) throw new Error('capture ancestor changed during selection');
  });
  if (createHash('sha256').update(bytes).digest('hex') !== locator.manifestSha256Hex) {
    throw new Error('capture aggregate manifest SHA256 differs');
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('capture aggregate manifest is not UTF8'); }
  // This reader retains the parent aggregate bound. The worker's pure selector
  // additionally imposes its narrower 16 KiB semantic input bound.
  const aggregate = exact(parseStrictJson(boundedText(text, 64 * 1024)), ['schema', 'kind', 'components', 'summary',
    'nodeConsistencyEstablished', 'freshRestartValidated', 'executionAuthorityRestored']);
  if (aggregate.schema !== 'e2s.substrate-federated-two-cycle-recovery-capture.v1'
    || aggregate.kind !== 'stopped-node-copy-and-sqlite-evidence'
    || aggregate.nodeConsistencyEstablished !== false || aggregate.freshRestartValidated !== false
    || aggregate.executionAuthorityRestored !== false) throw new Error('capture aggregate identity differs');
  const components = exact(aggregate.components, ['ergo', 'frontier', 'sqlite']);
  let ergoManifestSha256Hex = '';
  for (const role of ['ergo', 'frontier', 'sqlite'] as const) {
    const component = exact(components[role], ['file', 'bytes', 'sha256Hex']);
    if (component.file !== `${role}/manifest.json`) throw new Error('capture aggregate component role differs');
    positive(component.bytes, (role === 'ergo' ? 16 : 64) * 1024 * 1024);
    const pin = hex(component.sha256Hex);
    if (role === 'ergo') ergoManifestSha256Hex = pin;
  }
  const summary = exact(aggregate.summary, ['ergoFiles', 'frontierFiles', 'nodeDatabaseBytes',
    'sqliteDatabaseBytes', 'trackerAdmissionAttempts']);
  positive(summary.ergoFiles, 100_000); positive(summary.frontierFiles, 100_000);
  positive(summary.nodeDatabaseBytes, 128 * 1024 ** 3); positive(summary.sqliteDatabaseBytes, 1024 ** 3);
  if (summary.trackerAdmissionAttempts !== 2) throw new Error('capture aggregate tracker count differs');
  return Object.freeze({ captureManifestText: text, ergoManifestSha256Hex });
}

function normalizeBindings(value: unknown): Readonly<NativeTwoCycleCopiedErgoSelectionBindingsV1> {
  const raw = exact(value, BINDING_KEYS);
  return Object.freeze({ configSha256Hex: hex(raw.configSha256Hex), bridgeCommit: hex(raw.bridgeCommit, 20),
    bridgeTree: hex(raw.bridgeTree, 20), pathIdentityDigestHex: hex(raw.pathIdentityDigestHex),
    toolIdentityDigestHex: hex(raw.toolIdentityDigestHex), rootResultDigestHex: hex(raw.rootResultDigestHex),
    projectedReceiptDigestHex: hex(raw.projectedReceiptDigestHex) });
}
function locatorBindings(bindings: Readonly<NativeTwoCycleCopiedErgoSelectionBindingsV1>): Readonly<RecoveryLocatorBindingsV1> {
  const { projectedReceiptDigestHex: _projected, ...legacy } = bindings;
  return Object.freeze(legacy);
}
function normalizeLocator(value: unknown): Readonly<RecoveryLocatorPointerV1> {
  const raw = exact(value, ['buildDirectoryName', 'directoryName', 'manifestSha256Hex']);
  if (typeof raw.buildDirectoryName !== 'string' || raw.buildDirectoryName.length !== 'bridge-fed-genesis-'.length + 6
    || !/^bridge-fed-genesis-[A-Za-z0-9]{6}$/.test(raw.buildDirectoryName)
    || typeof raw.directoryName !== 'string' || raw.directoryName.length !== 'two-cycle-recovery-'.length + 6
    || !/^two-cycle-recovery-[A-Za-z0-9]{6}$/.test(raw.directoryName)) {
    throw new Error('copied Ergo relative locator differs');
  }
  return Object.freeze({ buildDirectoryName: raw.buildDirectoryName, directoryName: raw.directoryName,
    manifestSha256Hex: hex(raw.manifestSha256Hex) });
}
function normalizeSnapshot(value: unknown): Readonly<NativeTwoCycleCopiedErgoSnapshotV1> {
  const raw = exact(value, ['network', 'fullHeight', 'indexedHeight', 'headerIdHex']);
  if (raw.network !== 'devnet' || !Number.isSafeInteger(raw.fullHeight) || (raw.fullHeight as number) < 1
    || (raw.fullHeight as number) > 2_147_483_647 || raw.indexedHeight !== raw.fullHeight) {
    throw new Error('copied Ergo exact snapshot differs');
  }
  return Object.freeze({ network: 'devnet', fullHeight: raw.fullHeight as number,
    indexedHeight: raw.fullHeight as number, headerIdHex: hex(raw.headerIdHex) });
}
function normalizeCommon(raw: Record<string, unknown>): Readonly<SelectionBody> {
  if (raw.version !== 1 || Object.keys(CLAIMS).some(key => raw[key] !== false)) throw new Error('copied Ergo selection claims differ');
  return Object.freeze({ ...normalizeBindings(Object.fromEntries(BINDING_KEYS.map(key => [key, raw[key]]))),
    version: 1, rootRawSha256Hex: hex(raw.rootRawSha256Hex), locator: normalizeLocator(raw.locator),
    ergoManifestSha256Hex: hex(raw.ergoManifestSha256Hex), expectedSnapshot: normalizeSnapshot(raw.expectedSnapshot),
    workerRecoveryLocatorReceiptDigestHex: hex(raw.workerRecoveryLocatorReceiptDigestHex), ...CLAIMS });
}
function normalizeExpected(value: unknown, parent: boolean) {
  const raw = record(value);
  const optional = ['rootRawSha256Hex', 'expectedSnapshot', ...(parent ? ['workerSelectionReceiptDigestHex'] : [])];
  exact(raw, ['bindings', 'locator', 'ergoManifestSha256Hex', 'workerRecoveryLocatorReceiptDigestHex',
    ...(parent ? ['terminalReceiptDigestHex', 'parentRecoveryLocatorReceiptDigestHex'] : []),
    ...optional.filter(key => Object.hasOwn(raw, key))]);
  return Object.freeze({ bindings: normalizeBindings(raw.bindings), locator: normalizeLocator(raw.locator),
    ergoManifestSha256Hex: hex(raw.ergoManifestSha256Hex),
    workerRecoveryLocatorReceiptDigestHex: hex(raw.workerRecoveryLocatorReceiptDigestHex),
    ...(Object.hasOwn(raw, 'rootRawSha256Hex') ? { rootRawSha256Hex: hex(raw.rootRawSha256Hex) } : {}),
    ...(Object.hasOwn(raw, 'expectedSnapshot') ? { expectedSnapshot: normalizeSnapshot(raw.expectedSnapshot) } : {}),
    terminalReceiptDigestHex: parent ? hex(raw.terminalReceiptDigestHex) : undefined,
    parentRecoveryLocatorReceiptDigestHex: parent ? hex(raw.parentRecoveryLocatorReceiptDigestHex) : undefined,
    workerSelectionReceiptDigestHex: Object.hasOwn(raw, 'workerSelectionReceiptDigestHex') ? hex(raw.workerSelectionReceiptDigestHex) : undefined });
}
function compareExpected(actual: SelectionBody, expected: ReturnType<typeof normalizeExpected>): void {
  equal(normalizeBindings(Object.fromEntries(BINDING_KEYS.map(key => [key, actual[key]]))), expected.bindings, 'selection bindings');
  equal(actual.locator, expected.locator, 'selection locator');
  if (actual.ergoManifestSha256Hex !== expected.ergoManifestSha256Hex
    || actual.workerRecoveryLocatorReceiptDigestHex !== expected.workerRecoveryLocatorReceiptDigestHex
    || (expected.rootRawSha256Hex !== undefined && actual.rootRawSha256Hex !== expected.rootRawSha256Hex)) {
    throw new Error('copied Ergo selection independently expected pin differs');
  }
  if (expected.expectedSnapshot !== undefined) equal(actual.expectedSnapshot, expected.expectedSnapshot, 'selected snapshot');
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('copied Ergo selection requires plain records');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !Object.hasOwn(descriptors[key]!, 'value')
    || !descriptors[key]!.enumerable)) throw new Error('copied Ergo selection accessor or symbol differs');
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const raw = record(value);
  if (Reflect.ownKeys(raw).length !== keys.length || keys.some(key => !Object.hasOwn(raw, key))) {
    throw new Error('copied Ergo selection fields differ');
  }
  return raw;
}
function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum
    || Buffer.byteLength(value, 'utf8') > maximum || Buffer.from(value, 'utf8').toString('utf8') !== value) {
    throw new Error('copied Ergo selection text bound or Unicode differs');
  }
  let depth = 0; let quoted = false; let escaped = false;
  for (const char of value) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') { if (++depth > 64) throw new Error('copied Ergo selection nesting bound differs'); }
    else if (char === ']' || char === '}') depth--;
  }
  return value;
}
function parseCanonical(text: unknown): unknown {
  const source = boundedText(text, 16 * 1024); const value = parseStrictJson(source);
  if (`${canonicalJson(value)}\n` !== source) throw new Error('copied Ergo selection must be canonical JSON plus LF');
  return value;
}
function hex(value: unknown, bytes = 32): string {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) throw new Error('copied Ergo selection digest differs');
  return value;
}
function positive(value: unknown, maximum: number): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new Error('capture aggregate numeric bound differs');
  }
}
function equal(a: unknown, b: unknown, label: string): void {
  if (canonicalJson(a) !== canonicalJson(b)) throw new Error(`copied Ergo ${label} differs`);
}
function hash(text: string): string { return createHash('sha256').update(text, 'utf8').digest('hex'); }
function seal<T extends object>(body: T, domain: string): Readonly<T & { receiptDigestHex: string }> {
  const result = Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, domain) });
  boundedText(`${canonicalJson(result)}\n`, 16 * 1024);
  return result;
}
function verifyDigest(raw: Record<string, unknown>, domain: string): void {
  const { receiptDigestHex, ...body } = raw;
  if (hex(receiptDigestHex) !== sha256CanonicalJson(body, domain)) throw new Error('copied Ergo selection self digest differs');
}
function lexicalParent(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || !isAbsolute(value)
    || /^[\\/]{2}/.test(value) || /[\x00-\x1f\x7f]/.test(value)) throw new Error('capture parent must be local absolute');
  const root = parse(value).root;
  if (process.platform === 'win32' && !/^[A-Za-z]:[\\/]$/.test(root)) throw new Error('capture parent drive differs');
  if (value.slice(root.length).split(/[\\/]/).some(part => !part || part === '.' || part === '..'
    || /[:<>"|?*]/.test(part) || /[. ]$/.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('capture parent path differs');
  return resolve(value);
}
function directoryIdentity(path: string): string {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || canonicalPathIdentity(realpathSync(path)) !== canonicalPathIdentity(path)) {
    throw new Error('capture ancestor is not direct canonical directory');
  }
  return `${stat.dev}:${stat.ino}`;
}
function fileIdentity(stat: NonNullable<ReturnType<typeof lstatSync>>): string {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.nlink}`;
}
