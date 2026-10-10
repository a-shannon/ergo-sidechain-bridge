import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertSubstrateFederatedNativeWasmAvlPackageSmokeV1,
  assertSubstrateFederatedNativeWasmAvlPackageMatchesV1,
  fingerprintSubstrateFederatedNativeWasmAvlSourceV1,
  inspectSubstrateFederatedNativeWasmAvlPackageV1,
} from './substrate-federated-native-wasm-avl-package-v1.js';

const temporaryRoots: string[] = [];
const ABI_SIGNATURES = {
  bridge_generate_proofs: {
    rustParameterTypes: ['&str', '&str'], rustReturnType: 'String', wasmParameterCount: 4, wasmResultCount: 2,
  },
  bridge_lookup_membership: {
    rustParameterTypes: ['&str', '&str'], rustReturnType: 'String', wasmParameterCount: 4, wasmResultCount: 2,
  },
  empty_digest: {
    rustParameterTypes: [], rustReturnType: 'String', wasmParameterCount: 0, wasmResultCount: 2,
  },
  tracker_v2_empty_digest: {
    rustParameterTypes: [], rustReturnType: 'String', wasmParameterCount: 0, wasmResultCount: 2,
  },
  tracker_v2_get_proof: {
    rustParameterTypes: ['&str', '&str'], rustReturnType: 'String', wasmParameterCount: 4, wasmResultCount: 2,
  },
  tracker_v2_insert: {
    rustParameterTypes: ['&str', '&str', '&str'], rustReturnType: 'String', wasmParameterCount: 6, wasmResultCount: 2,
  },
  tracker_v2_verify_insert: {
    rustParameterTypes: ['&str', '&str', '&str', '&str'], rustReturnType: 'Result<String, JsValue>', wasmParameterCount: 8, wasmResultCount: 4,
  },
} as const;
const ABI_FUNCTIONS = Object.keys(ABI_SIGNATURES) as (keyof typeof ABI_SIGNATURES)[];
const PACKAGE_FILES = [
  '.gitignore',
  'README.md',
  'bridge_avl.d.ts',
  'bridge_avl.js',
  'bridge_avl_bg.wasm',
  'bridge_avl_bg.wasm.d.ts',
  'package.json',
] as const;

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('generated WASM AVL package inspection', () => {
  it('matches the complete ABI, including multiline Rust parameters with a trailing comma', () => {
    const fixture = packageFixture();
    const identity = inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root);
    expect(identity.sourceSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
    expect(identity.packageSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
    expect(() => assertSubstrateFederatedNativeWasmAvlPackageSmokeV1(fixture.root)).not.toThrow();
    expect(() => assertSubstrateFederatedNativeWasmAvlPackageMatchesV1(
      fixture.root,
      identity,
    )).not.toThrow();
  });

  it('rejects a zero-argument fake WASM function for a two-string production export', () => {
    const fixture = packageFixture({
      wasmSignatures: {
        bridge_generate_proofs: { parameterCount: 0, resultCount: 0 },
      },
    });
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects Rust argument-type drift even when export names remain unchanged', () => {
    const fixture = packageFixture();
    const sourcePath = join(fixture.wasmRoot, 'src', 'lib.rs');
    const source = readFileSync(sourcePath, 'utf8');
    const expected = 'pub fn bridge_generate_proofs(arg0: &str, arg1: &str) -> String';
    expect(source).toContain(expected);
    writeFileSync(
      sourcePath,
      source.replace(expected, 'pub fn bridge_generate_proofs(arg0: u32, arg1: &str) -> String'),
    );
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects public TypeScript declarations that disagree with the Rust ABI', () => {
    const fixture = packageFixture();
    const path = join(fixture.packageRoot, 'bridge_avl.d.ts');
    const declarations = readFileSync(path, 'utf8');
    const expected = 'export function bridge_generate_proofs(arg0: string, arg1: string): string;';
    expect(declarations).toContain(expected);
    writeFileSync(
      path,
      declarations.replace(
        expected,
        'export function bridge_generate_proofs(arg0: number, arg1: string): string;',
      ),
    );
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects low-level WASM declarations that disagree with the binary type', () => {
    const fixture = packageFixture();
    const path = join(fixture.packageRoot, 'bridge_avl_bg.wasm.d.ts');
    const declarations = readFileSync(path, 'utf8');
    const expected = 'export const bridge_generate_proofs: (a: number, b: number, c: number, d: number) => [number, number];';
    expect(declarations).toContain(expected);
    writeFileSync(
      path,
      declarations.replace(
        expected,
        'export const bridge_generate_proofs: (a: number, b: number) => [number, number];',
      ),
    );
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects a smoke result that does not replay to the tracked successor digest', () => {
    const fixture = packageFixture({ verifiedTrackerDigest: 'ff'.repeat(33) });
    expect(() => assertSubstrateFederatedNativeWasmAvlPackageSmokeV1(fixture.root)).toThrow();
  });

  it.each(PACKAGE_FILES)('rejects a missing generated file %s', name => {
    const fixture = packageFixture();
    rmSync(join(fixture.packageRoot, name));
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects extra stale output files instead of hashing an open-ended package', () => {
    const fixture = packageFixture();
    writeFileSync(join(fixture.packageRoot, 'stale.js'), 'exports.old = true;');
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it.each([
    { field: 'name', manifest: { ...validManifest(), name: 'stale-avl' } },
    { field: 'version', manifest: { ...validManifest(), version: '0.0.0' } },
    { field: 'main', manifest: { ...validManifest(), main: 'stale.js' } },
    { field: 'types', manifest: { ...validManifest(), types: 'stale.d.ts' } },
    {
      field: 'published files',
      manifest: { ...validManifest(), files: ['bridge_avl.js', 'bridge_avl_bg.wasm'] },
    },
  ])('rejects stale package metadata in $field', ({ manifest }) => {
    const fixture = packageFixture();
    writeFileSync(join(fixture.packageRoot, 'package.json'), JSON.stringify(manifest));
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects a hand-built package whose declarations omit one current Rust export', () => {
    const fixture = packageFixture();
    writeFileSync(
      join(fixture.packageRoot, 'bridge_avl.d.ts'),
      declarations(ABI_FUNCTIONS.slice(1)),
    );
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects a hand-built package whose CommonJS exports omit one current Rust export', () => {
    const fixture = packageFixture();
    writeFileSync(
      join(fixture.packageRoot, 'bridge_avl.js'),
      javascript(ABI_FUNCTIONS.slice(1)),
    );
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects a WASM module that omits one current Rust export', () => {
    const fixture = packageFixture();
    writeFileSync(
      join(fixture.packageRoot, 'bridge_avl_bg.wasm'),
      wasmModuleWithExports(ABI_FUNCTIONS.slice(1)),
    );
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });

  it('rejects malformed JavaScript and malformed WASM bytes', () => {
    const javascriptFixture = packageFixture();
    writeFileSync(join(javascriptFixture.packageRoot, 'bridge_avl.js'), 'const wasm = ;');
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(javascriptFixture.root))
      .toThrow();

    const wasmFixture = packageFixture();
    writeFileSync(join(wasmFixture.packageRoot, 'bridge_avl_bg.wasm'), Buffer.from('not-wasm'));
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(wasmFixture.root)).toThrow();
  });

  it('binds the identity to source and package bytes', () => {
    const fixture = packageFixture();
    const identity = inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root);
    writeFileSync(join(fixture.packageRoot, 'README.md'), 'changed package bytes');
    expect(() => assertSubstrateFederatedNativeWasmAvlPackageMatchesV1(
      fixture.root,
      identity,
    )).toThrow();

    const sourceFixture = packageFixture();
    const sourceIdentity = inspectSubstrateFederatedNativeWasmAvlPackageV1(sourceFixture.root);
    writeFileSync(join(sourceFixture.wasmRoot, 'src', 'lib.rs'), 'changed source ABI');
    expect(() => assertSubstrateFederatedNativeWasmAvlPackageMatchesV1(
      sourceFixture.root,
      sourceIdentity,
    )).toThrow();
  });

  it('changes the canonical source fingerprint when a crate input changes', () => {
    const fixture = packageFixture();
    const before = fingerprintSubstrateFederatedNativeWasmAvlSourceV1(fixture.root);
    writeFileSync(join(fixture.wasmRoot, 'Cargo.lock'), 'version = 4\n');
    expect(fingerprintSubstrateFederatedNativeWasmAvlSourceV1(fixture.root)).not.toBe(before);
  });

  it.each(['wasm-avl', 'pkg'])(
    'rejects a junction used for the %s directory',
    name => {
      const fixture = packageFixture();
      const existingPath = join(
        fixture.root,
        name === 'wasm-avl' ? name : `wasm-avl/${name}`,
      );
      const targetPath = join(fixture.root, `${name}-redirect-target`);
      renameSync(existingPath, targetPath);
      symlinkSync(
        targetPath,
        existingPath,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
    },
  );

  it('rejects a junction at a required package file path', () => {
    const fixture = packageFixture();
    const manifestPath = join(fixture.packageRoot, 'package.json');
    const redirectedManifest = join(fixture.root, 'redirected-package-directory');
    rmSync(manifestPath);
    mkdirSync(redirectedManifest);
    symlinkSync(redirectedManifest, manifestPath, 'junction');
    expect(lstatSync(manifestPath).isSymbolicLink()).toBe(true);
    expect(() => inspectSubstrateFederatedNativeWasmAvlPackageV1(fixture.root)).toThrow();
  });
});

const DUP_DIGEST_HEX = 'aa'.repeat(33);
const TRACKER_EMPTY_DIGEST_HEX = 'bb'.repeat(33);
const TRACKER_DIGEST_HEX = 'cc'.repeat(33);
const SMOKE_PROOF_HEX = 'dd'.repeat(16);

type WasmFixtureSignatureOverride = Readonly<{
  parameterCount?: number;
  resultCount?: number;
}>;

function packageFixture(input: Readonly<{
  wasmSignatures?: Readonly<Record<string, WasmFixtureSignatureOverride>>;
  verifiedTrackerDigest?: string;
}> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'e2s-wasm-avl-package-'));
  temporaryRoots.push(root);
  const wasmRoot = join(root, 'wasm-avl');
  const packageRoot = join(wasmRoot, 'pkg');
  mkdirSync(join(wasmRoot, 'src'), { recursive: true });
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(wasmRoot, 'Cargo.toml'), '[package]\nname = "bridge-avl"\nversion = "0.1.0"\n');
  writeFileSync(join(wasmRoot, 'Cargo.lock'), 'version = 3\n');
  writeFileSync(join(wasmRoot, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.97.1"\n');
  writeFileSync(
    join(wasmRoot, 'src', 'lib.rs'),
    rustSource(),
  );
  for (const name of PACKAGE_FILES) {
    const file = join(packageRoot, name);
    if (name === 'package.json') writeFileSync(file, JSON.stringify(validManifest()));
    else if (name === 'bridge_avl.js') {
      writeFileSync(file, javascript(ABI_FUNCTIONS, input.verifiedTrackerDigest));
    }
    else if (name === 'bridge_avl.d.ts') writeFileSync(file, declarations(ABI_FUNCTIONS));
    else if (name === 'bridge_avl_bg.wasm.d.ts') {
      writeFileSync(file, wasmDeclarations(ABI_FUNCTIONS));
    } else if (name === 'bridge_avl_bg.wasm') {
      writeFileSync(file, wasmModuleWithExports(ABI_FUNCTIONS, input.wasmSignatures));
    }
    else writeFileSync(file, `fixture:${name}\n`);
  }
  return { root, wasmRoot, packageRoot };
}

function rustSource(): string {
  return ABI_FUNCTIONS.map(name => {
    const signature = ABI_SIGNATURES[name];
    const parameters = signature.rustParameterTypes.map((type, index) => `arg${index}: ${type}`);
    const parameterBlock = name === 'tracker_v2_verify_insert'
      ? `\n    ${parameters.join(',\n    ')},\n`
      : parameters.join(', ');
    return `#[wasm_bindgen]\npub fn ${name}(${parameterBlock}) -> ${signature.rustReturnType} { unreachable!() }`;
  }).join('\n');
}

function validManifest() {
  return {
    name: 'bridge-avl',
    version: '0.1.0',
    main: 'bridge_avl.js',
    types: 'bridge_avl.d.ts',
    files: ['bridge_avl_bg.wasm', 'bridge_avl.js', 'bridge_avl.d.ts'],
  };
}

function declarations(names: readonly string[]): string {
  return names.map(name => {
    const signature = ABI_SIGNATURES[name as keyof typeof ABI_SIGNATURES];
    const parameters = signature.rustParameterTypes
      .map((_, index) => `arg${index}: string`)
      .join(', ');
    return `export function ${name}(${parameters}): string;`;
  }).join('\n');
}

function wasmDeclarations(names: readonly string[]): string {
  return names.map(name => {
    const signature = ABI_SIGNATURES[name as keyof typeof ABI_SIGNATURES];
    const parameters = Array.from(
      { length: signature.wasmParameterCount },
      (_, index) => `${String.fromCharCode(97 + index)}: number`,
    ).join(', ');
    const results = Array.from({ length: signature.wasmResultCount }, () => 'number').join(', ');
    return `export const ${name}: (${parameters}) => [${results}];`;
  }).join('\n');
}

function javascript(names: readonly string[], verifiedTrackerDigest = TRACKER_DIGEST_HEX): string {
  const implementations: Readonly<Record<string, string>> = {
    bridge_generate_proofs:
      `() => JSON.stringify({lookup_proof_hex: '${SMOKE_PROOF_HEX}', insert_proof_hex: '${SMOKE_PROOF_HEX}', new_digest_hex: '${DUP_DIGEST_HEX}'})`,
    bridge_lookup_membership:
      `() => JSON.stringify({digest_hex: '${DUP_DIGEST_HEX}', lookup_proof_hex: '${SMOKE_PROOF_HEX}'})`,
    empty_digest: `() => '${DUP_DIGEST_HEX}'`,
    tracker_v2_empty_digest: `() => '${TRACKER_EMPTY_DIGEST_HEX}'`,
    tracker_v2_get_proof:
      `() => JSON.stringify({digest_hex: '${TRACKER_DIGEST_HEX}', get_proof_hex: '${SMOKE_PROOF_HEX}', value_hex: '${'22'.repeat(264)}'})`,
    tracker_v2_insert:
      `() => JSON.stringify({insert_proof_hex: '${SMOKE_PROOF_HEX}', new_digest_hex: '${TRACKER_DIGEST_HEX}'})`,
    tracker_v2_verify_insert:
      `() => JSON.stringify({new_digest_hex: '${verifiedTrackerDigest}'})`,
  };
  return names.map(name => `exports.${name} = ${implementations[name] ?? '() => ""'};`).join('\n');
}

function wasmModuleWithExports(
  names: readonly string[],
  overrides: Readonly<Record<string, WasmFixtureSignatureOverride>> = {},
): Buffer {
  const uleb128 = (value: number): Buffer => {
    const output: number[] = [];
    let remaining = value;
    do {
      let byte = remaining & 0x7f;
      remaining >>>= 7;
      if (remaining !== 0) byte |= 0x80;
      output.push(byte);
    } while (remaining !== 0);
    return Buffer.from(output);
  };
  const section = (id: number, payload: Buffer): Buffer => Buffer.concat([
    Buffer.from([id]),
    uleb128(payload.length),
    payload,
  ]);
  const signatures = names.map(name => {
    const expected = ABI_SIGNATURES[name as keyof typeof ABI_SIGNATURES];
    const override = overrides[name];
    return {
      parameterCount: override?.parameterCount ?? expected.wasmParameterCount,
      resultCount: override?.resultCount ?? expected.wasmResultCount,
    };
  });
  const functionTypes = [
    ...signatures,
    { parameterCount: 0, resultCount: 0 },
  ];
  const vector = (values: readonly number[]): Buffer => Buffer.concat([
    uleb128(values.length),
    ...values.map(value => Buffer.from([value])),
  ]);
  const typeEntries = functionTypes.map(({ parameterCount, resultCount }) => Buffer.concat([
    Buffer.from([0x60]),
    vector(Array.from({ length: parameterCount }, () => 0x7f)),
    vector(Array.from({ length: resultCount }, () => 0x7f)),
  ]));
  const typePayload = Buffer.concat([uleb128(typeEntries.length), ...typeEntries]);
  const functionTypeIndices = [...names.map((_, index) => index), names.length];
  const functionPayload = vector(functionTypeIndices);
  const exportRows = [
    ...names.map((name, index) => ({ name, index })),
    { name: '__wbindgen_start', index: names.length },
  ];
  const exportEntries = exportRows.map(({ name, index }) => {
    const encoded = Buffer.from(name, 'utf8');
    return Buffer.concat([uleb128(encoded.length), encoded, Buffer.from([0]), uleb128(index)]);
  });
  const exportPayload = Buffer.concat([uleb128(exportEntries.length), ...exportEntries]);
  const codeBodies = functionTypes.map(({ resultCount }) => {
    const instructions = Buffer.from([
      0,
      ...Array.from({ length: resultCount }, () => [0x41, 0]).flat(),
      0x0b,
    ]);
    return Buffer.concat([uleb128(instructions.length), instructions]);
  });
  const codePayload = Buffer.concat([uleb128(codeBodies.length), ...codeBodies]);
  return Buffer.concat([
    Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
    section(1, typePayload),
    section(3, functionPayload),
    section(7, exportPayload),
    section(10, codePayload),
  ]);
}
