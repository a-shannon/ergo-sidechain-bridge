import { createHash } from 'node:crypto';
import { win32 } from 'node:path';

import { assertV4EffectiveResolverCommands } from './substrate-federated-isolated-devnet-ergo-node-build-v4-resolver-runtime.js';

const MAX_STDOUT_BYTES = 4_194_304;
const SCOPES = Object.freeze(['project', 'ergo', 'ergo', 'ergoCore', 'ergoWallet', 'avldb'] as const);
const REPOSITORIES = Object.freeze([
  'bridge-maven-central-cache',
  'bridge-gitlab-leveldb-local',
  'bridge-empty-offline',
] as const);
const INTERPROJECT_PREFIX = '[info] * Raw(ProjectResolver(inter-project, mapped: ';
const INTERPROJECT_SUFFIX = '))';
const PROBE_MARKER = 'BRIDGE_SOURCE24_RESOLVER_';
const PROBE_REFUSED_CODES = Object.freeze([
  'PROBE_REFUSED_S1', 'PROBE_REFUSED_S2', 'PROBE_REFUSED_S3',
  'PROBE_REFUSED_S4', 'PROBE_REFUSED_S5',
] as const);

const BASE_REFUSAL_CODES = Object.freeze([
  'COMMAND_SEQUENCE',
  'SOURCE_ROOT_PATH', 'SOURCE_ROOT_COMPONENT', 'SOURCE_ROOT_CANONICAL',
  'REPOSITORIES_ABSENT', 'REPOSITORIES_SHAPE',
  'REPOSITORY_DECLARATION', 'REPOSITORY_URI', 'REPOSITORY_DUPLICATE',
  'STDOUT_SIZE', 'STDOUT_BOM', 'STDOUT_UTF8', 'STDOUT_CONTROL',
  'STDOUT_REMOTE', 'STDOUT_LINE_ENDING',
  'SCOPE_MARKERS', 'RESOLVER_LINE_COUNT', 'RESOLVER_LINE_FORMAT',
  'RESOLVER_SET', 'PROBE_COUNT', 'PROBE_SCOPE',
  ...PROBE_REFUSED_CODES, 'PROBE_ORDER', 'PROBE_DIGEST',
] as const);

const SCOPE_INDEXES = [0, 1, 2, 3, 4, 5] as const;
const REPOSITORY_SLOTS = [1, 2, 3] as const;
const KNOWN_LINE_PERMUTATIONS = [
  '0123', '0132', '0213', '0231', '0312', '0321',
  '1023', '1032', '1203', '1230', '1302', '1320',
  '2013', '2031', '2103', '2130', '2301', '2310',
  '3012', '3021', '3102', '3120', '3201', '3210',
] as const;
const LOCAL_URI_VARIANTS = [
  'TRIPLE_SLASH', 'NO_TRAILING_SLASH', 'CASE_ONLY',
  'PERCENT_ENCODING', 'PINNED_OTHER_URI', 'OTHER_LOCAL_URI',
] as const;

type ScopeIndex = (typeof SCOPE_INDEXES)[number];
type RepositorySlot = (typeof REPOSITORY_SLOTS)[number];
type LinePermutation = Exclude<(typeof KNOWN_LINE_PERMUTATIONS)[number], '0123'>;
type LocalUriVariant = (typeof LOCAL_URI_VARIANTS)[number];
type ResolverSetDetailCode =
  | `RESOLVER_SET_S${ScopeIndex}_BLOCK_DISTRIBUTION`
  | `RESOLVER_SET_S${ScopeIndex}_ORDER_${LinePermutation}`
  | `RESOLVER_SET_S${ScopeIndex}_INTERPROJECT_EMPTY_MAP`
  | `RESOLVER_SET_S${ScopeIndex}_INTERPROJECT_MAPPED_PAYLOAD`
  | `RESOLVER_SET_S${ScopeIndex}_INTERPROJECT_LINE`
  | `RESOLVER_SET_S${ScopeIndex}_REPO${RepositorySlot}_${LocalUriVariant}`
  | `RESOLVER_SET_S${ScopeIndex}_OTHER_LOCAL_SET`;

export type V4EffectiveResolverRefusalCode =
  (typeof BASE_REFUSAL_CODES)[number] | ResolverSetDetailCode;

const resolverSetDetailCodes: readonly ResolverSetDetailCode[] =
  SCOPE_INDEXES.flatMap(scope => [
    `RESOLVER_SET_S${scope}_BLOCK_DISTRIBUTION`,
    ...KNOWN_LINE_PERMUTATIONS.filter(permutation => permutation !== '0123')
      .map(permutation => `RESOLVER_SET_S${scope}_ORDER_${permutation}`),
    `RESOLVER_SET_S${scope}_INTERPROJECT_EMPTY_MAP`,
    `RESOLVER_SET_S${scope}_INTERPROJECT_MAPPED_PAYLOAD`,
    `RESOLVER_SET_S${scope}_INTERPROJECT_LINE`,
    ...REPOSITORY_SLOTS.flatMap(slot => LOCAL_URI_VARIANTS
      .map(variant => `RESOLVER_SET_S${scope}_REPO${slot}_${variant}`)),
    `RESOLVER_SET_S${scope}_OTHER_LOCAL_SET`,
  ]) as ResolverSetDetailCode[];

export const V4_EFFECTIVE_RESOLVER_REFUSAL_CODES:
  readonly V4EffectiveResolverRefusalCode[] = Object.freeze([
    ...BASE_REFUSAL_CODES, ...resolverSetDetailCodes,
  ]);

if (new Set(V4_EFFECTIVE_RESOLVER_REFUSAL_CODES).size
    !== V4_EFFECTIVE_RESOLVER_REFUSAL_CODES.length) {
  throw new Error('duplicate fixed V4 resolver refusal code');
}

class V4EffectiveResolverOutputRefusal extends Error {
  readonly reasonCode: V4EffectiveResolverRefusalCode;

  constructor(reasonCode: V4EffectiveResolverRefusalCode, message: string) {
    super(message);
    this.name = 'V4EffectiveResolverOutputRefusal';
    this.reasonCode = reasonCode;
  }
}

export function classifyV4EffectiveResolverOutputRefusal(
  error: unknown,
): V4EffectiveResolverRefusalCode | undefined {
  return error instanceof V4EffectiveResolverOutputRefusal
    ? error.reasonCode : undefined;
}

export interface V4EffectiveResolverOutputInput {
  readonly stdoutBytes: Uint8Array;
  readonly sourceRoot: string;
  readonly repositoriesText: string;
  readonly commands: readonly string[];
}

export interface V4EffectiveResolverOutput {
  readonly stdoutSha256Hex: string;
  readonly scopes: typeof SCOPES;
  readonly resolverLineCount: 24;
  readonly fileRepositoryCountPerScope: 3;
  readonly parsed: true;
}

function fail(code: V4EffectiveResolverRefusalCode, reason: string): never {
  throw new V4EffectiveResolverOutputRefusal(
    code, 'V4 effective resolver output: ' + reason);
}

function sourceDirectoryUri(sourceRoot: string): string {
  if (typeof sourceRoot !== 'string' || !/^[a-z]:[\\/]/iu.test(sourceRoot)
      || sourceRoot.startsWith('\\\\') || /[\u0000-\u001f\u007f]/u.test(sourceRoot)) {
    fail('SOURCE_ROOT_PATH', 'source root must be an absolute drive path');
  }
  const parts = sourceRoot.slice(3).split(/[\\/]/u);
  if (parts.length === 0 || parts.some(part => part.length === 0 || part === '.'
      || part === '..' || /[:<>|";?*]/u.test(part) || /[. ]$/u.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    fail('SOURCE_ROOT_COMPONENT', 'source root contains an unsafe component');
  }
  const normalized = win32.resolve(sourceRoot).replace(/\\/gu, '/');
  if (!/^[a-z]:\//iu.test(normalized)) {
    fail('SOURCE_ROOT_CANONICAL', 'source root is not canonical');
  }
  const drive = normalized.slice(0, 2).toUpperCase();
  return 'file:/' + drive + '/' + normalized.slice(3).split('/').map(encodeURIComponent).join('/') + '/';
}

function expectedResolverLines(repositoriesText: string): readonly string[] {
  if (typeof repositoriesText !== 'string') {
    fail('REPOSITORIES_ABSENT', 'repositories text is absent');
  }
  const lines = repositoriesText.split('\n');
  if (lines.length !== 5 || lines[0] !== '[repositories]' || lines[4] !== '') {
    fail('REPOSITORIES_SHAPE', 'repositories file has an unexpected shape');
  }
  const uris: string[] = [];
  const expected: string[] = [];
  for (let index = 0; index < REPOSITORIES.length; index++) {
    const name = REPOSITORIES[index]!;
    const prefix = '  ' + name + ': ';
    const suffix = index === 2 ? ', bootOnly' : '';
    const line = lines[index + 1]!;
    if (!line.startsWith(prefix) || !line.endsWith(suffix)) {
      fail('REPOSITORY_DECLARATION', 'repository declaration differs');
    }
    const uri = line.slice(prefix.length, suffix ? -suffix.length : undefined);
    if (!/^file:\/\/\/[a-z]:\/(?:[^\\/?#\s]+\/)+$/iu.test(uri)
        || uri.split('/').some(part => part === '.' || part === '..')) {
      fail('REPOSITORY_URI', 'repository URI is not a local file directory');
    }
    uris.push(uri);
    expected.push('[info] * ' + name + ': ' + uri.replace(/^file:\/\//u, 'file:'));
  }
  if (new Set(uris).size !== REPOSITORIES.length) {
    fail('REPOSITORY_DUPLICATE', 'repository URI is duplicated');
  }
  return expected;
}

function decodeOutput(stdoutBytes: Uint8Array): string[] {
  if (!(stdoutBytes instanceof Uint8Array) || stdoutBytes.byteLength === 0
      || stdoutBytes.byteLength > MAX_STDOUT_BYTES) {
    fail('STDOUT_SIZE', 'stdout is absent or exceeds its selected byte cap');
  }
  if (stdoutBytes[0] === 0xef && stdoutBytes[1] === 0xbb
      && stdoutBytes[2] === 0xbf) fail('STDOUT_BOM', 'stdout has a BOM');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(stdoutBytes);
  } catch {
    fail('STDOUT_UTF8', 'stdout is not UTF-8');
  }
  if (text.includes('\ufeff')) fail('STDOUT_BOM', 'stdout has a BOM');
  if (text.endsWith('\u001b[0J')) text = text.slice(0, -4);
  text = text.replace(/\u001b\[[0-9;]*m/gu, '');
  if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    fail('STDOUT_CONTROL', 'stdout contains a control character or remote repository');
  }
  if (/\b(?:https?|s3|ssh|ftp|git):\/\//iu.test(text)
      || /\b(?:sonatype|bintray|repo1\.maven\.org)\b/iu.test(text)) {
    fail('STDOUT_REMOTE', 'stdout contains a control character or remote repository');
  }
  text = text.replace(/\r\n/gu, '\n');
  if (text.includes('\r') || !text.endsWith('\n')) {
    fail('STDOUT_LINE_ENDING', 'stdout line endings differ');
  }
  return text.slice(0, -1).split('\n');
}

function isVisibleInterprojectResolver(line: string, scope: number): boolean {
  if (!line.startsWith(INTERPROJECT_PREFIX) || !line.endsWith(INTERPROJECT_SUFFIX)) {
    return false;
  }
  const payload = line.slice(INTERPROJECT_PREFIX.length, -INTERPROJECT_SUFFIX.length);
  // The meta-build is still required to render the exact empty map. For the
  // project scopes, a source24 task binds this visible text to structured SBT
  // values; the rendered Map.keys string is not an invertible identifier list.
  return scope === 0 ? payload.length === 0 : payload.length <= 1024;
}

function refuseResolverSet(
  scope: ScopeIndex,
  block: readonly string[],
  repositories: readonly string[],
): never {
  if (block.length !== 4) {
    fail(`RESOLVER_SET_S${scope}_BLOCK_DISTRIBUTION`,
      'resolver lines are distributed across scopes differently');
  }
  const expected = [
    INTERPROJECT_PREFIX + INTERPROJECT_SUFFIX,
    ...repositories,
  ];
  const observedIndexes = block.map(line => expected.indexOf(line));
  if (observedIndexes.every(index => index >= 0)
      && new Set(observedIndexes).size === expected.length) {
    const permutation = observedIndexes.join('');
    const knownPermutation = KNOWN_LINE_PERMUTATIONS.find(value =>
      value === permutation);
    if (knownPermutation && knownPermutation !== '0123') {
      fail(`RESOLVER_SET_S${scope}_ORDER_${knownPermutation}`,
        'known resolver lines appear in a different order');
    }
  }
  if (block.slice(1).every((line, index) => line === repositories[index])) {
    const interprojectLine = block[0]!;
    const mappedPrefix = INTERPROJECT_PREFIX.slice(0, -1);
    if (interprojectLine === mappedPrefix + '))') {
      fail(`RESOLVER_SET_S${scope}_INTERPROJECT_EMPTY_MAP`,
        'resolver set inter-project line renders an empty map differently');
    }
    if (interprojectLine.startsWith(mappedPrefix)
        && interprojectLine.endsWith('))')) {
      const payload = interprojectLine.slice(mappedPrefix.length, -2);
      if (payload.length > 0 && payload.length <= 1024
          && !/[()]/u.test(payload)) {
        fail(`RESOLVER_SET_S${scope}_INTERPROJECT_MAPPED_PAYLOAD`,
          'resolver set inter-project line carries bounded mapped text');
      }
    }
    fail(`RESOLVER_SET_S${scope}_INTERPROJECT_LINE`,
      'resolver set inter-project line differs');
  }
  if (block[0] === expected[0]) {
    for (const slot of REPOSITORY_SLOTS) {
      const actual = block[slot]!;
      const wanted = repositories[slot - 1]!;
      if (actual === wanted) continue;
      const prefix = '[info] * ' + REPOSITORIES[slot - 1]! + ': ';
      if (!actual.startsWith(prefix)) break;
      const actualUri = actual.slice(prefix.length);
      const wantedUri = wanted.slice(prefix.length);
      let variant: LocalUriVariant | undefined;
      if (actualUri === wantedUri.replace(/^file:\//u, 'file:///')) {
        variant = 'TRIPLE_SLASH';
      } else if (actualUri === wantedUri.slice(0, -1)) {
        variant = 'NO_TRAILING_SLASH';
      } else if (actualUri !== wantedUri
          && actualUri.toLowerCase() === wantedUri.toLowerCase()) {
        variant = 'CASE_ONLY';
      } else {
        try {
          if (decodeURIComponent(actualUri) === wantedUri) {
            variant = 'PERCENT_ENCODING';
          }
        } catch {
          // An invalid escape remains in the fixed other-local category.
        }
      }
      if (!variant && repositories.some((line, index) => index !== slot - 1
          && actualUri === line.slice(('[info] * ' + REPOSITORIES[index]! + ': ').length))) {
        variant = 'PINNED_OTHER_URI';
      }
      if (!variant && actualUri.startsWith('file:/')) {
        variant = 'OTHER_LOCAL_URI';
      }
      if (variant) {
        fail(`RESOLVER_SET_S${scope}_REPO${slot}_${variant}`,
          'resolver set local repository URI differs');
      }
      break;
    }
  }
  fail(`RESOLVER_SET_S${scope}_OTHER_LOCAL_SET`,
    'a local resolver set differs');
}

export function parseV4EffectiveResolverOutput(
  input: Readonly<V4EffectiveResolverOutputInput>,
): Readonly<V4EffectiveResolverOutput> {
  try {
    assertV4EffectiveResolverCommands(input.commands);
  } catch {
    throw new V4EffectiveResolverOutputRefusal('COMMAND_SEQUENCE',
      'V4 resolver runtime plan: effective project and meta-build command sequence differs');
  }
  const rootUri = sourceDirectoryUri(input.sourceRoot);
  const repositories = expectedResolverLines(input.repositoriesText);
  const lines = decodeOutput(input.stdoutBytes);
  const expectedMarkers = SCOPES.map((scope, index) =>
    '[info] ProjectRef(' + rootUri + (index === 0 ? 'project/' : '') + ',' + scope + ')');
  const markers = lines.flatMap((line, index) => line.includes('ProjectRef(') ? [index] : []);
  if (markers.length !== SCOPES.length || markers.some((at, index) =>
    lines[at] !== expectedMarkers[index])) {
    fail('SCOPE_MARKERS',
      'project and meta-build scopes are missing, duplicated or reordered');
  }
  const resolverLines = lines.filter(line => /^\[info\]\s*\*/u.test(line));
  if (resolverLines.length !== SCOPES.length * 4) {
    fail('RESOLVER_LINE_COUNT', 'resolver line count differs');
  }
  if (resolverLines.some(line => !line.startsWith('[info] * '))) {
    fail('RESOLVER_LINE_FORMAT', 'resolver line format differs');
  }
  if (lines.filter(line => line.includes(PROBE_MARKER)).length !== 5) {
    fail('PROBE_COUNT', 'structured resolver probe count differs');
  }
  for (let index = 0; index < markers.length; index++) {
    const span = lines.slice(markers[index]! + 1, markers[index + 1] ?? lines.length);
    const block = span.filter(line => line.startsWith('[info] * '));
    if (block.length !== 4
        || !isVisibleInterprojectResolver(block[0]!, index)
        || block.slice(1).some((line, repositoryIndex) => line !== repositories[repositoryIndex])) {
      refuseResolverSet(index as ScopeIndex, block, repositories);
    }
    const probes = span.flatMap((line, at) => line.includes(PROBE_MARKER)
      ? [{ line, at }] : []);
    if (index === 0) {
      if (probes.length !== 0) fail('PROBE_SCOPE', 'meta-build has a project probe');
      continue;
    }
    if (probes.length !== 1) fail('PROBE_SCOPE', 'project probe is missing or duplicated');
    const probe = probes[0]!;
    const refusedCode = PROBE_REFUSED_CODES[index - 1];
    if (refusedCode !== undefined
        && probe.line === `[info] ${PROBE_MARKER}REFUSED_S${index}`) {
      fail(refusedCode, 'project probe returned a fixed refusal');
    }
    const expected = `[info] ${PROBE_MARKER}MATCH_S${index}:`;
    if (!probe.line.startsWith(expected)
        || !/^[0-9a-f]{64}$/u.test(probe.line.slice(expected.length))) {
      fail('PROBE_SCOPE', 'project probe scope or format differs');
    }
    const lastResolverAt = span.reduce((last, line, at) =>
      line.startsWith('[info] * ') ? at : last, -1);
    if (probe.at <= lastResolverAt) {
      fail('PROBE_ORDER', 'project probe precedes its resolver observation');
    }
    const visible = block[0]!.slice('[info] * '.length);
    const digest = createHash('sha256').update(visible, 'utf8').digest('hex');
    if (probe.line.slice(expected.length) !== digest) {
      fail('PROBE_DIGEST', 'project probe differs from the visible resolver');
    }
  }
  return Object.freeze({
    stdoutSha256Hex: createHash('sha256').update(input.stdoutBytes).digest('hex'),
    scopes: SCOPES,
    resolverLineCount: 24 as const,
    fileRepositoryCountPerScope: 3 as const,
    parsed: true as const,
  });
}
