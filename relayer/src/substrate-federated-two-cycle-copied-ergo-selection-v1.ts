import { createHash } from 'node:crypto';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { types } from 'node:util';
import { parseStrictJson } from './strict-json.js';
import { projectSubstrateFederatedNativeTwoCycleResultV1 } from './substrate-federated-native-two-cycle-invocation-v1.js';
import type { SubstrateFederatedCopiedNonMiningErgoNodePairV1Input } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';

export interface SubstrateFederatedTwoCycleCopiedErgoSelectionV1Input {
  readonly rootResultText: string;
  readonly expectedRootResultSha256Hex: string;
  readonly captureManifestText: string;
  readonly buildParentDirectory: string;
  readonly assertSourcesQuiescent: () => void | Promise<void>;
}

/** Pure byte selection, not authentication or admission to execute a recovery.
 * Component pins remain unverified until the copied-state owner reads the files.
 * The caller must separately admit the selected capture and own its stopped state.
 */
export function prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(
  input: Readonly<SubstrateFederatedTwoCycleCopiedErgoSelectionV1Input>,
): Readonly<{
  schema: 'e2s.substrate-federated-two-cycle-copied-ergo-selection.v1';
  rootRawSha256Hex: string;
  legacyProjectedReceiptDigestHex: string;
  aggregateManifestSha256Hex: string;
  ownerInput: Readonly<SubstrateFederatedCopiedNonMiningErgoNodePairV1Input>;
  successAuthenticated: false;
  recoveryAdmitted: false;
  nodeConsistencyEstablished: false;
  executionAuthorityRestored: false;
}> {
  const fields = exact(input, ['rootResultText', 'expectedRootResultSha256Hex',
    'captureManifestText', 'buildParentDirectory', 'assertSourcesQuiescent'], 'selection input');
  const rootText = boundedText(fields.rootResultText, 2 * 1024 * 1024, 'root result');
  const captureText = boundedText(fields.captureManifestText, 16 * 1024, 'aggregate manifest');
  const rootRawSha256Hex = hash(rootText);
  if (rootRawSha256Hex !== digest(fields.expectedRootResultSha256Hex, 'selected root SHA256')) {
    throw new Error('selected root raw SHA256 differs');
  }
  const buildParent = localParent(fields.buildParentDirectory);
  const guard = fields.assertSourcesQuiescent;
  if (typeof guard !== 'function' || types.isProxy(guard)) throw new Error('quiescence callback differs');
  const root = object(parseStrictJson(rootText, 'selected root'), 'selected root');
  if (!Object.hasOwn(root, 'recoveryEvidence')) throw new Error('selected root has no recovery evidence');
  const pointer = exact(root.recoveryEvidence,
    ['buildDirectoryName', 'directoryName', 'manifestSha256Hex'], 'recovery evidence');
  const buildName = basename(pointer.buildDirectoryName, /^bridge-fed-genesis-[A-Za-z0-9]{6}$/, 'build');
  const captureName = basename(pointer.directoryName, /^two-cycle-recovery-[A-Za-z0-9]{6}$/, 'capture');
  const aggregateManifestSha256Hex = digest(pointer.manifestSha256Hex, 'aggregate manifest SHA256');
  if (hash(captureText) !== aggregateManifestSha256Hex) throw new Error('aggregate manifest SHA256 differs');
  const capture = exact(parseStrictJson(captureText, 'aggregate manifest'), [
    'schema', 'kind', 'components', 'summary', 'nodeConsistencyEstablished',
    'freshRestartValidated', 'executionAuthorityRestored',
  ], 'aggregate manifest');
  if (capture.schema !== 'e2s.substrate-federated-two-cycle-recovery-capture.v1'
    || capture.kind !== 'stopped-node-copy-and-sqlite-evidence'
    || capture.nodeConsistencyEstablished !== false || capture.freshRestartValidated !== false
    || capture.executionAuthorityRestored !== false) throw new Error('aggregate manifest identity or claims differ');
  const components = exact(capture.components, ['ergo', 'frontier', 'sqlite'], 'capture components');
  let ergoPin = '';
  for (const role of ['ergo', 'frontier', 'sqlite'] as const) {
    const component = exact(components[role], ['file', 'bytes', 'sha256Hex'], `${role} component`);
    if (component.file !== `${role}/manifest.json`) throw new Error('capture component filename differs');
    // Ergo matches the copied owner; opaque Frontier/SQLite pins retain the producer bound.
    positive(component.bytes, (role === 'ergo' ? 16 : 64) * 1024 * 1024, 'component bytes');
    const pin = digest(component.sha256Hex, 'component SHA256');
    if (role === 'ergo') ergoPin = pin;
  }
  const summary = exact(capture.summary, ['ergoFiles', 'frontierFiles', 'nodeDatabaseBytes',
    'sqliteDatabaseBytes', 'trackerAdmissionAttempts'], 'capture summary');
  positive(summary.ergoFiles, 100_000, 'Ergo file count');
  positive(summary.frontierFiles, 100_000, 'Frontier file count');
  positive(summary.nodeDatabaseBytes, 2 * 64 * 1024 ** 3, 'node database bytes');
  positive(summary.sqliteDatabaseBytes, 1024 ** 3, 'SQLite database bytes');
  if (summary.trackerAdmissionAttempts !== 2) throw new Error('capture requires two tracker attempts');
  const second = object(root.secondCycle, 'second cycle');
  const confirmation = object(second.confirmationExecution, 'second confirmation');
  const snapshot = exact(confirmation.finalSnapshot,
    ['network', 'fullHeight', 'indexedHeight', 'headerIdHex'], 'second final snapshot');
  positive(snapshot.fullHeight, 2_147_483_647, 'snapshot height');
  if (snapshot.network !== 'devnet' || snapshot.indexedHeight !== snapshot.fullHeight) {
    throw new Error('second final snapshot is not exact indexed devnet');
  }
  const expectedSnapshot = Object.freeze({ network: 'devnet' as const,
    fullHeight: snapshot.fullHeight as number, indexedHeight: snapshot.fullHeight as number,
    headerIdHex: digest(snapshot.headerIdHex, 'snapshot header') });
  // The existing projector checks the complete fixed TWO-cycle success semantics.
  // Its legacy digest deliberately excludes the separately bound recovery pointer.
  const projected = projectSubstrateFederatedNativeTwoCycleResultV1(root);
  // The canonical producer captures beneath Frontier's fixed target directory.
  const ergoRoot = join(buildParent, buildName, 'target', captureName, 'ergo');
  return Object.freeze({ schema: 'e2s.substrate-federated-two-cycle-copied-ergo-selection.v1' as const,
    rootRawSha256Hex, legacyProjectedReceiptDigestHex: projected.receiptDigestHex,
    aggregateManifestSha256Hex,
    ownerInput: Object.freeze({ primaryRoot: join(ergoRoot, 'primary'), witnessRoot: join(ergoRoot, 'witness'),
      capturedManifestSha256Hex: ergoPin, assertSourcesQuiescent: guard as () => void | Promise<void>,
      expectedSnapshot }),
    successAuthenticated: false as const, recoveryAdmitted: false as const,
    nodeConsistencyEstablished: false as const, executionAuthorityRestored: false as const });
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string'
    || !Object.hasOwn(descriptors[key]!, 'value') || descriptors[key]!.enumerable !== true)) {
    throw new Error(`${label} has accessor, symbol or nonenumerable fields`);
  }
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const record = object(value, label);
  if (Reflect.ownKeys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) {
    throw new Error(`${label} fields differ`);
  }
  return record;
}
function boundedText(value: unknown, limit: number, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > limit
    || Buffer.byteLength(value, 'utf8') > limit || Buffer.from(value, 'utf8').toString('utf8') !== value) {
    throw new Error(`${label} text bound or Unicode differs`);
  }
  let depth = 0; let quoted = false; let escaped = false;
  for (const char of value) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') {
      if (++depth > 64) throw new Error(`${label} nesting bound exceeded`);
    } else if (char === '}' || char === ']') depth--;
  }
  return value;
}
function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length !== 64 || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} differs`);
  return value;
}
function positive(value: unknown, ceiling: number, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > ceiling) {
    throw new Error(`${label} bound differs`);
  }
}
function basename(value: unknown, pattern: RegExp, label: string): string {
  const length = (label === 'build' ? 'bridge-fed-genesis-' : 'two-cycle-recovery-').length + 6;
  if (typeof value !== 'string' || value.length !== length || !pattern.test(value)) throw new Error(`${label} directory name differs`);
  return value;
}
function localParent(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || !isAbsolute(value)
    || /^[\\/]{2}/.test(value) || /[\x00-\x1f\x7f]/.test(value)) throw new Error('build parent must be local absolute');
  const root = parse(value).root;
  if (process.platform === 'win32' && !/^[A-Za-z]:[\\/]$/.test(root)) throw new Error('build parent drive differs');
  const parts = value.slice(root.length).split(/[\\/]/);
  if (parts.length === 0 || parts.some(part => !part || part === '.' || part === '..'
    || /[:<>"|?*]/.test(part) || /[. ]$/.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('build parent contains unsafe components');
  }
  return resolve(value);
}
function hash(text: string): string { return createHash('sha256').update(text, 'utf8').digest('hex'); }
