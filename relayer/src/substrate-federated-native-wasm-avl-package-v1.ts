import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createContext, Script } from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';

const PACKAGE_NOT_READY =
  'native two-cycle generated WASM AVL package does not match its source and production ABI';
type WasmValueType = 'i32' | 'i64' | 'f32' | 'f64' | 'v128' | 'funcref' | 'externref';

interface ProductionAbiSignature {
  readonly rustParameterTypes: readonly string[];
  readonly rustReturnType: string;
  readonly wasmParameterTypes: readonly WasmValueType[];
  readonly wasmResultTypes: readonly WasmValueType[];
}

const PRODUCTION_ABI = {
  bridge_generate_proofs: {
    rustParameterTypes: ['&str', '&str'],
    rustReturnType: 'String',
    wasmParameterTypes: ['i32', 'i32', 'i32', 'i32'],
    wasmResultTypes: ['i32', 'i32'],
  },
  bridge_lookup_membership: {
    rustParameterTypes: ['&str', '&str'],
    rustReturnType: 'String',
    wasmParameterTypes: ['i32', 'i32', 'i32', 'i32'],
    wasmResultTypes: ['i32', 'i32'],
  },
  empty_digest: {
    rustParameterTypes: [],
    rustReturnType: 'String',
    wasmParameterTypes: [],
    wasmResultTypes: ['i32', 'i32'],
  },
  tracker_v2_empty_digest: {
    rustParameterTypes: [],
    rustReturnType: 'String',
    wasmParameterTypes: [],
    wasmResultTypes: ['i32', 'i32'],
  },
  tracker_v2_get_proof: {
    rustParameterTypes: ['&str', '&str'],
    rustReturnType: 'String',
    wasmParameterTypes: ['i32', 'i32', 'i32', 'i32'],
    wasmResultTypes: ['i32', 'i32'],
  },
  tracker_v2_insert: {
    rustParameterTypes: ['&str', '&str', '&str'],
    rustReturnType: 'String',
    wasmParameterTypes: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32'],
    wasmResultTypes: ['i32', 'i32'],
  },
  tracker_v2_verify_insert: {
    rustParameterTypes: ['&str', '&str', '&str', '&str'],
    rustReturnType: 'Result<String,JsValue>',
    wasmParameterTypes: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32'],
    wasmResultTypes: ['i32', 'i32', 'i32', 'i32'],
  },
} as const satisfies Readonly<Record<string, ProductionAbiSignature>>;

const REQUIRED_PRODUCTION_EXPORTS = Object.freeze(Object.keys(PRODUCTION_ABI).sort());
const REQUIRED_PACKAGE_FILES = Object.freeze([
  '.gitignore',
  'README.md',
  'bridge_avl.d.ts',
  'bridge_avl.js',
  'bridge_avl_bg.wasm',
  'bridge_avl_bg.wasm.d.ts',
  'package.json',
].sort());
const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const SMOKE_TIMEOUT_MS = 15_000;
const MAX_SMOKE_RESULT_CHARS = 64 * 1024;

const PRODUCTION_SMOKE_SCRIPT = `(() => {
  const expected = ${JSON.stringify(REQUIRED_PRODUCTION_EXPORTS)};
  const api = globalThis.exports;
  const fail = () => { throw new Error('WASM AVL production smoke failed'); };
  if (api === null || typeof api !== 'object'
    || expected.some(name => typeof api[name] !== 'function')) fail();
  const exactObject = (text, keys) => {
    if (typeof text !== 'string' || text.length > ${MAX_SMOKE_RESULT_CHARS}) fail();
    let value;
    try { value = JSON.parse(text); } catch { return fail(); }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
    const actual = Object.keys(value).sort();
    const required = [...keys].sort();
    if (actual.length !== required.length
      || actual.some((name, index) => name !== required[index])) fail();
    return value;
  };
  const hex = (value, label, bytes) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > ${MAX_SMOKE_RESULT_CHARS}
      || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)
      || (bytes !== undefined && value.length !== bytes * 2)) {
      throw new Error('WASM AVL production smoke failed: ' + label);
    }
    return value;
  };
  const digest = (value, label) => hex(value, label, 33);
  const key = '11'.repeat(32);
  const trackerValue = '22'.repeat(264);
  digest(api.empty_digest(), 'empty DUP digest');
  const generated = exactObject(
    api.bridge_generate_proofs('[]', key),
    ['lookup_proof_hex', 'insert_proof_hex', 'new_digest_hex'],
  );
  hex(generated.lookup_proof_hex, 'DUP non-membership proof');
  hex(generated.insert_proof_hex, 'DUP insert proof');
  const dupDigest = digest(generated.new_digest_hex, 'DUP successor digest');
  const membership = exactObject(
    api.bridge_lookup_membership(JSON.stringify([key]), key),
    ['digest_hex', 'lookup_proof_hex'],
  );
  if (digest(membership.digest_hex, 'DUP membership digest') !== dupDigest) fail();
  hex(membership.lookup_proof_hex, 'DUP membership proof');

  const trackerEmpty = digest(api.tracker_v2_empty_digest(), 'empty tracker digest');
  const inserted = exactObject(
    api.tracker_v2_insert('[]', key, trackerValue),
    ['insert_proof_hex', 'new_digest_hex'],
  );
  hex(inserted.insert_proof_hex, 'tracker insert proof');
  const trackerDigest = digest(inserted.new_digest_hex, 'tracker successor digest');
  const history = JSON.stringify([{ key, value: trackerValue }]);
  const membershipV2 = exactObject(
    api.tracker_v2_get_proof(history, key),
    ['digest_hex', 'get_proof_hex', 'value_hex'],
  );
  if (digest(membershipV2.digest_hex, 'tracker membership digest') !== trackerDigest
    || hex(membershipV2.value_hex, 'tracker value', 264) !== trackerValue) fail();
  hex(membershipV2.get_proof_hex, 'tracker membership proof');
  const verified = exactObject(
    api.tracker_v2_verify_insert(
      trackerEmpty,
      key,
      trackerValue,
      inserted.insert_proof_hex,
    ),
    ['new_digest_hex'],
  );
  if (digest(verified.new_digest_hex, 'verified tracker digest') !== trackerDigest) fail();
  return 'e2s.wasm-avl-production-smoke.v1';
})()`;

export interface SubstrateFederatedNativeWasmAvlPackageIdentityV1 {
  readonly sourceSha256Hex: string;
  readonly packageSha256Hex: string;
}

function fail(): never {
  throw new Error(PACKAGE_NOT_READY);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalFilesDigest(files: ReadonlyMap<string, Buffer>): string {
  const manifest = [...files.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, bytes]) => `${name}  ${sha256(bytes)}\n`)
    .join('');
  return sha256(Buffer.from(manifest, 'utf8'));
}

function collectRegularFiles(
  root: string,
  options: Readonly<{ excludedRootDirectories?: ReadonlySet<string>; maxBytes: number }>,
): ReadonlyMap<string, Buffer> {
  const files = new Map<string, Buffer>();
  let totalBytes = 0;

  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      if (
        directory === root
        && options.excludedRootDirectories?.has(entry.name)
      ) continue;
      const absolute = join(directory, entry.name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) fail();
      if (metadata.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!metadata.isFile() || metadata.size < 0) fail();
      totalBytes += metadata.size;
      if (totalBytes > options.maxBytes) fail();
      const name = relative(root, absolute).split(sep).join('/');
      if (name.includes('\n') || name.includes('\r') || name.includes('\0')) fail();
      if (files.has(name)) fail();
      files.set(name, readFileSync(absolute));
    }
  };

  visit(root);
  return files;
}

function requireManifestFiles(
  files: ReadonlyMap<string, Buffer>,
  expected: readonly string[],
): void {
  const actual = [...files.keys()].sort();
  if (actual.length !== expected.length
    || actual.some((name, index) => name !== expected[index])) fail();
}

function extractRustWasmExports(rustSource: string): readonly string[] {
  const names = [...rustSource.matchAll(
    /#\[wasm_bindgen\]\s*pub\s+fn\s+([A-Za-z_$][\w$]*)\s*\(/gu,
  )].map(match => match[1]!);
  if (names.length === 0 || new Set(names).size !== names.length) fail();
  return Object.freeze(names.sort());
}

function extractDeclarationExports(declarations: string): readonly string[] {
  const names = [...declarations.matchAll(
    /^export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gmu,
  )].map(match => match[1]!);
  if (names.length === 0 || new Set(names).size !== names.length) fail();
  return Object.freeze(names.sort());
}

function extractJavaScriptExports(javascript: string): readonly string[] {
  const names = [...javascript.matchAll(
    /^exports\.([A-Za-z_$][\w$]*)\s*=/gmu,
  )].map(match => match[1]!);
  if (names.length === 0 || new Set(names).size !== names.length) fail();
  return Object.freeze(names.sort());
}

function requireSameNames(
  actual: readonly string[],
  expected: readonly string[],
): void {
  if (actual.length !== expected.length
    || actual.some((name, index) => name !== expected[index])) fail();
}

function readByte(
  bytes: Buffer,
  state: { offset: number },
  end: number,
): number {
  if (state.offset >= end) return fail();
  return bytes[state.offset++]!;
}

function readUnsignedLeb128(
  bytes: Buffer,
  state: { offset: number },
  end: number,
): number {
  let value = 0;
  let multiplier = 1;
  for (let index = 0; index < 5; index += 1) {
    const byte = readByte(bytes, state, end);
    if (index === 4 && (byte & 0xf0) !== 0) return fail();
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value) || value > 0xffff_ffff) return fail();
    if ((byte & 0x80) === 0) return value;
    multiplier *= 0x80;
  }
  return fail();
}

function readWasmName(
  bytes: Buffer,
  state: { offset: number },
  end: number,
): string {
  const length = readUnsignedLeb128(bytes, state, end);
  if (length > end - state.offset) return fail();
  const value = new TextDecoder('utf-8', { fatal: true }).decode(
    bytes.subarray(state.offset, state.offset + length),
  );
  state.offset += length;
  return value;
}

function readWasmValueType(
  bytes: Buffer,
  state: { offset: number },
  end: number,
): WasmValueType {
  const code = readByte(bytes, state, end);
  const valueTypes: Readonly<Record<number, WasmValueType>> = {
    0x7f: 'i32',
    0x7e: 'i64',
    0x7d: 'f32',
    0x7c: 'f64',
    0x7b: 'v128',
    0x70: 'funcref',
    0x6f: 'externref',
  };
  const valueType = valueTypes[code];
  if (valueType === undefined) return fail();
  return valueType;
}

function readWasmValueTypeVector(
  bytes: Buffer,
  state: { offset: number },
  end: number,
): readonly WasmValueType[] {
  const count = readUnsignedLeb128(bytes, state, end);
  if (count > end - state.offset) return fail();
  return Object.freeze(Array.from(
    { length: count },
    () => readWasmValueType(bytes, state, end),
  ));
}

interface WasmFunctionType {
  readonly parameters: readonly WasmValueType[];
  readonly results: readonly WasmValueType[];
}

interface WasmExportDescriptor {
  readonly kind: number;
  readonly index: number;
}

function inspectWasmFunctionExports(
  bytes: Buffer,
  module: WebAssembly.Module,
): ReadonlyMap<string, WasmFunctionType> {
  if (bytes.length < 8
    || !bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) {
    return fail();
  }
  const types: WasmFunctionType[] = [];
  let functionTypeIndices: number[] | undefined;
  const exports = new Map<string, WasmExportDescriptor>();
  let sawTypeSection = false;
  let sawFunctionSection = false;
  let sawExportSection = false;
  const state = { offset: 8 };
  while (state.offset < bytes.length) {
    const id = readByte(bytes, state, bytes.length);
    const payloadLength = readUnsignedLeb128(bytes, state, bytes.length);
    const payloadEnd = state.offset + payloadLength;
    if (payloadEnd > bytes.length) return fail();
    if (id === 1) {
      if (sawTypeSection) return fail();
      sawTypeSection = true;
      const count = readUnsignedLeb128(bytes, state, payloadEnd);
      if (count > payloadEnd - state.offset) return fail();
      for (let index = 0; index < count; index += 1) {
        if (readByte(bytes, state, payloadEnd) !== 0x60) return fail();
        types.push(Object.freeze({
          parameters: readWasmValueTypeVector(bytes, state, payloadEnd),
          results: readWasmValueTypeVector(bytes, state, payloadEnd),
        }));
      }
      if (state.offset !== payloadEnd) return fail();
    } else if (id === 3) {
      if (sawFunctionSection) return fail();
      sawFunctionSection = true;
      const count = readUnsignedLeb128(bytes, state, payloadEnd);
      if (count > payloadEnd - state.offset) return fail();
      functionTypeIndices = Array.from(
        { length: count },
        () => readUnsignedLeb128(bytes, state, payloadEnd),
      );
      if (state.offset !== payloadEnd) return fail();
    } else if (id === 7) {
      if (sawExportSection) return fail();
      sawExportSection = true;
      const count = readUnsignedLeb128(bytes, state, payloadEnd);
      if (count > payloadEnd - state.offset) return fail();
      for (let index = 0; index < count; index += 1) {
        const name = readWasmName(bytes, state, payloadEnd);
        const kind = readByte(bytes, state, payloadEnd);
        const exportIndex = readUnsignedLeb128(bytes, state, payloadEnd);
        if (exports.has(name)) return fail();
        exports.set(name, Object.freeze({ kind, index: exportIndex }));
      }
      if (state.offset !== payloadEnd) return fail();
    }
    state.offset = payloadEnd;
  }
  if (!sawTypeSection || !sawFunctionSection || !sawExportSection
    || functionTypeIndices === undefined) return fail();
  const importedFunctionCount = WebAssembly.Module.imports(module)
    .filter(entry => entry.kind === 'function').length;
  const signatures = new Map<string, WasmFunctionType>();
  for (const name of REQUIRED_PRODUCTION_EXPORTS) {
    const descriptor = exports.get(name);
    if (descriptor === undefined || descriptor.kind !== 0
      || descriptor.index < importedFunctionCount) return fail();
    const typeIndex = functionTypeIndices[descriptor.index - importedFunctionCount];
    const signature = typeIndex === undefined ? undefined : types[typeIndex];
    if (signature === undefined) return fail();
    signatures.set(name, signature);
  }
  return signatures;
}

function equalValues<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function rustExportSignature(
  source: string,
  name: string,
): Readonly<{ parameters: readonly string[]; returnType: string }> {
  const matches = [...source.matchAll(new RegExp(
    `#\\[wasm_bindgen\\]\\s*pub\\s+fn\\s+${name}\\s*\\(([^)]*)\\)\\s*(?:->\\s*([^\\{]+?))?\\s*\\{`,
    'gu',
  ))];
  if (matches.length !== 1) return fail();
  const rawParameters = matches[0]![1]!.trim();
  const parameterParts = rawParameters === '' ? [] : rawParameters.split(',');
  if (parameterParts.at(-1)?.trim() === '') parameterParts.pop();
  if (parameterParts.some(parameter => parameter.trim() === '')) return fail();
  const parameters = parameterParts.map(parameter => {
    const parsed = parameter.trim().match(/^[A-Za-z_$][\w$]*\s*:\s*(.+)$/u);
    if (parsed === null) return fail();
    return parsed[1]!.replace(/\s+/gu, '');
  });
  const returnType = (matches[0]![2] ?? '').replace(/\s+/gu, '');
  return Object.freeze({ parameters: Object.freeze(parameters), returnType });
}

function declarationSignature(
  declarations: string,
  name: string,
): Readonly<{ parameters: readonly string[]; returnType: string }> {
  const matches = [...declarations.matchAll(new RegExp(
    `^export\\s+function\\s+${name}\\s*\\(([^)]*)\\)\\s*:\\s*([^;]+);$`,
    'gmu',
  ))];
  if (matches.length !== 1) return fail();
  const rawParameters = matches[0]![1]!.trim();
  const parameters = rawParameters === '' ? [] : rawParameters.split(',').map(parameter => {
    const parsed = parameter.trim().match(/^[A-Za-z_$][\w$]*\s*:\s*(.+)$/u);
    if (parsed === null) return fail();
    return parsed[1]!.replace(/\s+/gu, '');
  });
  return Object.freeze({
    parameters: Object.freeze(parameters),
    returnType: matches[0]![2]!.replace(/\s+/gu, ''),
  });
}

function wasmDeclarationSignature(
  declarations: string,
  name: string,
): Readonly<{ parameters: readonly string[]; results: readonly string[] }> {
  const matches = [...declarations.matchAll(new RegExp(
    `^export\\s+const\\s+${name}\\s*:\\s*\\(([^)]*)\\)\\s*=>\\s*\\[([^\\]]*)\\];$`,
    'gmu',
  ))];
  if (matches.length !== 1) return fail();
  const rawParameters = matches[0]![1]!.trim();
  const parameters = rawParameters === '' ? [] : rawParameters.split(',').map(parameter => {
    const parsed = parameter.trim().match(/^[A-Za-z_$][\w$]*\s*:\s*(.+)$/u);
    if (parsed === null) return fail();
    return parsed[1]!.replace(/\s+/gu, '');
  });
  const rawResults = matches[0]![2]!.trim();
  const results = rawResults === '' ? [] : rawResults.split(',').map(type => type.trim());
  return Object.freeze({
    parameters: Object.freeze(parameters),
    results: Object.freeze(results),
  });
}

function assertProductionAbi(
  rustSource: string,
  publicDeclarations: string,
  wasmDeclarations: string,
  wasmBytes: Buffer,
  wasmModule: WebAssembly.Module,
): void {
  const wasmSignatures = inspectWasmFunctionExports(wasmBytes, wasmModule);
  for (const name of REQUIRED_PRODUCTION_EXPORTS) {
    const expected = PRODUCTION_ABI[name as keyof typeof PRODUCTION_ABI];
    const rust = rustExportSignature(rustSource, name);
    const publicType = declarationSignature(publicDeclarations, name);
    const lowLevelType = wasmDeclarationSignature(wasmDeclarations, name);
    const binaryType = wasmSignatures.get(name);
    if (expected === undefined || binaryType === undefined
      || !equalValues(rust.parameters, expected.rustParameterTypes)
      || rust.returnType !== expected.rustReturnType
      || !equalValues(publicType.parameters, expected.rustParameterTypes.map(() => 'string'))
      || publicType.returnType !== 'string'
      || !equalValues(lowLevelType.parameters, expected.wasmParameterTypes.map(() => 'number'))
      || !equalValues(lowLevelType.results, expected.wasmResultTypes.map(() => 'number'))
      || !equalValues(binaryType.parameters, expected.wasmParameterTypes)
      || !equalValues(binaryType.results, expected.wasmResultTypes)) return fail();
  }
}

function cargoPackageIdentity(cargoToml: string): Readonly<{
  name: string;
  version: string;
}> {
  const lines = cargoToml.split(/\r?\n/u);
  const start = lines.findIndex(line => line.trim() === '[package]');
  if (start < 0) return fail();
  const packageSection: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[[^\]]+\]\s*$/u.test(line)) break;
    packageSection.push(line);
  }
  const text = packageSection.join('\n');
  const name = text.match(/^name\s*=\s*"([^"]+)"\s*$/mu)?.[1];
  const version = text.match(/^version\s*=\s*"([^"]+)"\s*$/mu)?.[1];
  if (name === undefined || version === undefined) return fail();
  return Object.freeze({ name, version });
}

/** Hash the current crate inputs while excluding only Cargo output and wasm-pack output. */
export function fingerprintSubstrateFederatedNativeWasmAvlSourceV1(
  bridgeRoot: string,
): string {
  const wasmRoot = resolve(bridgeRoot, 'wasm-avl');
  const wasmMetadata = lstatSync(wasmRoot);
  if (!wasmMetadata.isDirectory() || wasmMetadata.isSymbolicLink()) return fail();
  const files = collectRegularFiles(wasmRoot, {
    excludedRootDirectories: new Set(['pkg', 'target']),
    maxBytes: MAX_SOURCE_BYTES,
  });
  for (const required of ['Cargo.lock', 'Cargo.toml', 'rust-toolchain.toml', 'src/lib.rs']) {
    if (!files.has(required)) fail();
  }
  return canonicalFilesDigest(files);
}

/** Inspect generated bytes and ensure every current Rust export reaches both JS consumers. */
export function inspectSubstrateFederatedNativeWasmAvlPackageV1(
  bridgeRoot: string,
): Readonly<SubstrateFederatedNativeWasmAvlPackageIdentityV1> {
  const wasmRoot = resolve(bridgeRoot, 'wasm-avl');
  const packageRoot = join(wasmRoot, 'pkg');
  const wasmMetadata = lstatSync(wasmRoot);
  const packageMetadata = lstatSync(packageRoot);
  if (!wasmMetadata.isDirectory() || wasmMetadata.isSymbolicLink()
    || !packageMetadata.isDirectory() || packageMetadata.isSymbolicLink()) return fail();

  const packageFiles = collectRegularFiles(packageRoot, { maxBytes: MAX_PACKAGE_BYTES });
  requireManifestFiles(packageFiles, REQUIRED_PACKAGE_FILES);
  const manifestBytes = packageFiles.get('package.json');
  const javascriptBytes = packageFiles.get('bridge_avl.js');
  const wasmBytes = packageFiles.get('bridge_avl_bg.wasm');
  const declarationBytes = packageFiles.get('bridge_avl.d.ts');
  const wasmDeclarationBytes = packageFiles.get('bridge_avl_bg.wasm.d.ts');
  const rustBytes = readFileSync(join(wasmRoot, 'src', 'lib.rs'));
  const cargoBytes = readFileSync(join(wasmRoot, 'Cargo.toml'));
  if (manifestBytes === undefined || javascriptBytes === undefined
    || wasmBytes === undefined || declarationBytes === undefined
    || wasmDeclarationBytes === undefined) return fail();

  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8')) as unknown;
  } catch {
    return fail();
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return fail();
  const packageManifest = manifest as Record<string, unknown>;
  const cargoIdentity = cargoPackageIdentity(cargoBytes.toString('utf8'));
  const publishedFiles = packageManifest.files;
  if (
    packageManifest.name !== cargoIdentity.name
    || packageManifest.version !== cargoIdentity.version
    || packageManifest.main !== 'bridge_avl.js'
    || packageManifest.types !== 'bridge_avl.d.ts'
    || !Array.isArray(publishedFiles)
    || publishedFiles.length !== 3
    || !['bridge_avl.d.ts', 'bridge_avl.js', 'bridge_avl_bg.wasm']
      .every(name => publishedFiles.includes(name))
  ) fail();

  const rustExports = extractRustWasmExports(rustBytes.toString('utf8'));
  if (REQUIRED_PRODUCTION_EXPORTS.some(name => !rustExports.includes(name))) return fail();
  const rustSource = rustBytes.toString('utf8');
  const declarations = declarationBytes.toString('utf8');
  const wasmDeclarations = wasmDeclarationBytes.toString('utf8');
  const javascript = javascriptBytes.toString('utf8');
  requireSameNames(extractDeclarationExports(declarations), rustExports);
  requireSameNames(extractJavaScriptExports(javascript), rustExports);
  try {
    new Script(javascript, { filename: 'bridge_avl.js' });
  } catch {
    return fail();
  }

  let wasmModule: WebAssembly.Module;
  try {
    wasmModule = new WebAssembly.Module(Uint8Array.from(wasmBytes).buffer);
  } catch {
    return fail();
  }
  assertProductionAbi(
    rustSource,
    declarations,
    wasmDeclarations,
    wasmBytes,
    wasmModule,
  );
  const wasmExports = new Set(WebAssembly.Module.exports(wasmModule).map(({ name }) => name));
  const referencedWasmExports = new Set(
    [...javascript.matchAll(/\bwasm\.([A-Za-z_$][\w$]*)/gu)].map(match => match[1]!),
  );
  if (!wasmExports.has('__wbindgen_start')
    || rustExports.some(name => !wasmExports.has(name))
    || [...referencedWasmExports].some(name => !wasmExports.has(name))) return fail();

  return Object.freeze({
    sourceSha256Hex: fingerprintSubstrateFederatedNativeWasmAvlSourceV1(bridgeRoot),
    packageSha256Hex: canonicalFilesDigest(packageFiles),
  });
}

/** Run bounded, isolated valid vectors through the seven production JS/WASM exports. */
export function assertSubstrateFederatedNativeWasmAvlPackageSmokeV1(
  bridgeRoot: string,
): Readonly<SubstrateFederatedNativeWasmAvlPackageIdentityV1> {
  const identity = inspectSubstrateFederatedNativeWasmAvlPackageV1(bridgeRoot);
  const packageRoot = resolve(bridgeRoot, 'wasm-avl', 'pkg');
  const javascript = readFileSync(join(packageRoot, 'bridge_avl.js'), 'utf8');
  const wasmBytes = readFileSync(join(packageRoot, 'bridge_avl_bg.wasm'));
  const wasmPath = `${packageRoot}/bridge_avl_bg.wasm`;
  const encodeUtf8 = (value: string): string => JSON.stringify(
    Array.from(new TextEncoder().encode(value)),
  );
  const decodeUtf8 = (serializedBytes: string): string => new TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: true,
  }).decode(Uint8Array.from(JSON.parse(serializedBytes) as number[]));
  Object.setPrototypeOf(encodeUtf8, null);
  Object.setPrototypeOf(decodeUtf8, null);
  const context = createContext({
    __dirname: packageRoot,
    __wasmPath: wasmPath,
    __wasmBytesJson: JSON.stringify(Array.from(wasmBytes)),
    __encodeUtf8: encodeUtf8,
    __decodeUtf8: decodeUtf8,
  }, { codeGeneration: { strings: false, wasm: true } });
  try {
    new Script(`
      const __wasmBytes = Uint8Array.from(JSON.parse(__wasmBytesJson));
      class TextEncoder {
        encode(value) {
          return Uint8Array.from(JSON.parse(__encodeUtf8(String(value))));
        }
        encodeInto(value, destination) {
          const bytes = this.encode(value);
          if (bytes.length > destination.length) throw new Error('WASM smoke buffer overflow');
          destination.set(bytes);
          return { read: String(value).length, written: bytes.length };
        }
      }
      class TextDecoder {
        decode(bytes) {
          return __decodeUtf8(JSON.stringify(Array.from(bytes ?? [])));
        }
      }
      globalThis.TextEncoder = TextEncoder;
      globalThis.TextDecoder = TextDecoder;
      const __fs = Object.freeze({
        readFileSync(path) {
          if (path !== __wasmPath) throw new Error('WASM smoke read escaped package');
          return __wasmBytes;
        },
      });
      const require = name => {
        if (name !== 'fs') throw new Error('WASM smoke requested an unreviewed module');
        return __fs;
      };
      globalThis.exports = Object.create(null);
    `).runInContext(context, { timeout: SMOKE_TIMEOUT_MS });
    new Script(javascript, { filename: 'bridge_avl.js' })
      .runInContext(context, { timeout: SMOKE_TIMEOUT_MS });
    const result = new Script(PRODUCTION_SMOKE_SCRIPT)
      .runInContext(context, { timeout: SMOKE_TIMEOUT_MS });
    if (result !== 'e2s.wasm-avl-production-smoke.v1') return fail();
  } catch {
    return fail();
  }
  const after = inspectSubstrateFederatedNativeWasmAvlPackageV1(bridgeRoot);
  if (after.sourceSha256Hex !== identity.sourceSha256Hex
    || after.packageSha256Hex !== identity.packageSha256Hex) return fail();
  return identity;
}

export function assertSubstrateFederatedNativeWasmAvlPackageMatchesV1(
  bridgeRoot: string,
  expected: Readonly<SubstrateFederatedNativeWasmAvlPackageIdentityV1>,
): void {
  const actual = inspectSubstrateFederatedNativeWasmAvlPackageV1(bridgeRoot);
  if (actual.sourceSha256Hex !== expected.sourceSha256Hex
    || actual.packageSha256Hex !== expected.packageSha256Hex) return fail();
}
