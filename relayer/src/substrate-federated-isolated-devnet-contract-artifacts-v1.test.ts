import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, type BigIntStats } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const fsFault = vi.hoisted(() => ({
  targetPath: '',
  statCalls: 0,
  before: {} as Partial<BigIntStats>,
  after: {} as Partial<BigIntStats>,
  bytes: undefined as Buffer | undefined,
  redirected: false,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    lstatSync: (...args: unknown[]) => {
      const stat = Reflect.apply(actual.lstatSync, actual, args);
      if (String(args[0]) !== fsFault.targetPath) return stat;
      fsFault.statCalls += 1;
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat,
        fsFault.statCalls === 1 ? fsFault.before : fsFault.after);
    },
    readFileSync: (...args: unknown[]) => {
      if (String(args[0]) === fsFault.targetPath && fsFault.bytes !== undefined) {
        return Buffer.from(fsFault.bytes);
      }
      return Reflect.apply(actual.readFileSync, actual, args);
    },
    realpathSync: (...args: unknown[]) => {
      const path = Reflect.apply(actual.realpathSync, actual, args);
      return String(args[0]) === fsFault.targetPath && fsFault.redirected
        ? `${path}.redirected` : path;
    },
  };
});

import {
  assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance,
  assertSubstrateFederatedIsolatedDevnetContractArtifactsV2Provenance,
  collectSubstrateFederatedIsolatedDevnetContractArtifactsV1,
  collectSubstrateFederatedIsolatedDevnetContractArtifactsV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V2_SCHEMA,
} from './substrate-federated-isolated-devnet-contract-artifacts-v1.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH,
  SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX,
} from './substrate-federated-tracker-compiler-v2.js';

afterEach(() => {
  fsFault.targetPath = '';
  fsFault.statCalls = 0;
  fsFault.before = {};
  fsFault.after = {};
  fsFault.bytes = undefined;
  fsFault.redirected = false;
});

describe('isolated-devnet contract artifact collection', () => {
  it('collects the four exact reviewed templates as immutable source text', () => {
    const result =
      collectSubstrateFederatedIsolatedDevnetContractArtifactsV1();

    assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance(
      result,
    );
    expect(result.receipt.schema).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1_SCHEMA,
    );
    expect(result.receipt.status).toBe(
      'exact_reviewed_contract_templates_collected',
    );
    expect(Object.keys(result.templates)).toEqual([
      'tracker',
      'duplicatePrevention',
      'sourceLock',
      'pooledReserve',
    ]);
    expect(result.receipt.artifacts).toEqual({
      tracker: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
        sizeBytes: 13_865,
        sha256Hex:
          '8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852',
      },
      duplicatePrevention: {
        relativePath:
          'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
        sizeBytes: 17_657,
        sha256Hex:
          'a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f',
      },
      sourceLock: {
        relativePath: 'contracts/MainChainLockPooledReserveV6.es',
        sizeBytes: 6_401,
        sha256Hex:
          'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b',
      },
      pooledReserve: {
        relativePath:
          'contracts/MainChainPooledReserveValidityApplicationV6.es',
        sizeBytes: 9_953,
        sha256Hex:
          '44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5',
      },
    });
    for (const [role, source] of Object.entries(result.templates)) {
      const identity = result.receipt.artifacts[
        role as keyof typeof result.receipt.artifacts
      ];
      expect(source).toMatch(/\n$/u);
      expect(source).not.toContain('\r');
      expect(Buffer.byteLength(source, 'utf8')).toBe(identity.sizeBytes);
      expect(sha256(Buffer.from(source, 'utf8'))).toBe(identity.sha256Hex);
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.templates)).toBe(true);
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(result.receipt.boundaries).toMatchObject({
      compilerExecuted: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
  });

  it('does not transfer process provenance through serialization', () => {
    const result =
      collectSubstrateFederatedIsolatedDevnetContractArtifactsV1();

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance(
        structuredClone(result),
      )
    ).toThrow(/lack process provenance/u);
  });
});

describe('isolated-devnet V2 contract artifact collection', () => {
  it('collects the actual V2 tracker and all exact shared templates', () => {
    const v1 = collectSubstrateFederatedIsolatedDevnetContractArtifactsV1();
    const result = collectSubstrateFederatedIsolatedDevnetContractArtifactsV2();
    assertSubstrateFederatedIsolatedDevnetContractArtifactsV2Provenance(result);
    expect(result.receipt.schema).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V2_SCHEMA,
    );
    expect(result.receipt.version).toBe(2);
    expect(result.receipt.status).toBe('exact_reviewed_contract_templates_collected');
    expect(Object.keys(result.templates)).toEqual([
      'tracker', 'duplicatePrevention', 'sourceLock', 'pooledReserve',
    ]);
    expect(result.receipt.artifacts).toEqual({
      tracker: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
        sizeBytes: 14_483,
        sha256Hex:
          '110b1aa22d59e1202435bb139cadbb49f28a48c8b8a3056d0426e620ee828eec',
      },
      duplicatePrevention: {
        relativePath: 'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
        sizeBytes: 17_657,
        sha256Hex:
          'a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f',
      },
      sourceLock: {
        relativePath: 'contracts/MainChainLockPooledReserveV6.es',
        sizeBytes: 6_401,
        sha256Hex:
          'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b',
      },
      pooledReserve: {
        relativePath: 'contracts/MainChainPooledReserveValidityApplicationV6.es',
        sizeBytes: 9_953,
        sha256Hex:
          '44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5',
      },
    });
    expect(result.receipt.artifacts.tracker.relativePath)
      .toBe(SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH);
    expect(result.receipt.artifacts.tracker.sha256Hex)
      .toBe(SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX);
    expect(result.templates.tracker).not.toBe(v1.templates.tracker);
    expect(result.templates.tracker)
      .toContain('val requestedAnchorHeight = getVar[Int](2).get');
    for (const role of Object.keys(result.templates) as Array<keyof typeof result.templates>) {
      const identity = result.receipt.artifacts[role];
      const bytes = readFileSync(new URL(`../../${identity.relativePath}`, import.meta.url));
      expect(result.templates[role]).toBe(bytes.toString('utf8'));
      expect(bytes.byteLength).toBe(identity.sizeBytes);
      expect(sha256(bytes)).toBe(identity.sha256Hex);
      expect(result.templates[role]).not.toContain('\r');
      expect(result.templates[role]).toMatch(/\n$/u);
      if (role !== 'tracker') {
        expect(result.templates[role]).toBe(v1.templates[role]);
        expect(identity).toEqual(v1.receipt.artifacts[role]);
      }
    }
    expect(result.receipt.checks).toEqual(v1.receipt.checks);
    expect(Object.values(result.receipt.checks).every(value => value === true)).toBe(true);
    expect(result.receipt.boundaries).toEqual(v1.receipt.boundaries);
    expect(Object.values(result.receipt.boundaries).every(value => value === false)).toBe(true);
    expectDeepFrozen(result);
    expect(collectSubstrateFederatedIsolatedDevnetContractArtifactsV2()).toEqual(result);
  });

  it('preserves the V1 receipt pin and uses the distinct V2 digest domain', () => {
    const v1 = collectSubstrateFederatedIsolatedDevnetContractArtifactsV1();
    const v2 = collectSubstrateFederatedIsolatedDevnetContractArtifactsV2();
    expect(v1.receipt.receiptDigestHex)
      .toBe('ead859a8f85c2b31ae3799cb25678756e00d4333aa8a102856ca4b9a296d1826');
    expect(v2.receipt.receiptDigestHex)
      .toBe('697b9ed3656d2d891775a728dbbe3557874b1ec666ffde185e31e06eca9b261d');
    expect(v1.receipt.version).toBe(1);
    expect(v1.receipt.schema)
      .toBe('e2s.substrate-federated-isolated-devnet-contract-artifacts.v1');
    for (const [version, result] of [[1, v1], [2, v2]] as const) {
      const { receiptDigestHex, ...body } = result.receipt;
      expect(receiptDigestHex).toBe(sha256CanonicalJson(body,
        `E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V${version}`));
      expect(receiptDigestHex).not.toBe(sha256CanonicalJson(body,
        `E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V${version === 1 ? 2 : 1}`));
    }
    expect(v2.receipt.receiptDigestHex).not.toBe(v1.receipt.receiptDigestHex);
    assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance(v1);
  });
});

const versions = [
  {
    version: 1,
    collect: collectSubstrateFederatedIsolatedDevnetContractArtifactsV1,
    assert: assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance,
    foreign: collectSubstrateFederatedIsolatedDevnetContractArtifactsV2,
  },
  {
    version: 2,
    collect: collectSubstrateFederatedIsolatedDevnetContractArtifactsV2,
    assert: assertSubstrateFederatedIsolatedDevnetContractArtifactsV2Provenance,
    foreign: collectSubstrateFederatedIsolatedDevnetContractArtifactsV1,
  },
] as const;

for (const { version, collect, assert, foreign } of versions) {
  const assertProvenance: (value: unknown) => void = assert;
  describe(`V${version} process provenance`, () => {
    it.each(['foreign', 'spread', 'clone', 'json', 'receipt-only', 'relabelled', 'transplanted'])(
      'rejects %s receipts even when their digests are valid', mode => {
        const own = collect();
        const other = foreign();
        let candidate: unknown;
        switch (mode) {
          case 'foreign': candidate = other; break;
          case 'spread': candidate = { ...own }; break;
          case 'clone': candidate = structuredClone(own); break;
          case 'json': candidate = JSON.parse(JSON.stringify(own)); break;
          case 'receipt-only': candidate = own.receipt; break;
          case 'transplanted': candidate = { receipt: own.receipt, templates: other.templates }; break;
          case 'relabelled': {
            const { receiptDigestHex: ignored, ...body } = other.receipt;
            const relabelled = { ...body, schema: own.receipt.schema, version };
            candidate = {
              templates: other.templates,
              receipt: {
                ...relabelled,
                receiptDigestHex: sha256CanonicalJson(relabelled,
                  `E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V${version}`),
              },
            };
            break;
          }
          default: throw new Error('unknown negative');
        }
        expect(() => assertProvenance(candidate)).toThrow(/lack process provenance/u);
        expect(() => assertProvenance(own)).not.toThrow();
      },
    );

    it.each([null, undefined, false, 2, 'receipt', {}])('rejects non-receipt %j', value => {
      expect(() => assertProvenance(value)).toThrow(/lack process provenance/u);
    });
  });

  describe(`V${version} shared stable-read checks`, () => {
    const trackerPath = fileURLToPath(new URL(
      `../../contracts/SPVTrackerSubstrateFederatedV${version}.es`, import.meta.url,
    ));
    it.each<[string, Partial<BigIntStats>]>([
      ['non-regular', { isFile: () => false }],
      ['symbolic-link', { isSymbolicLink: () => true }],
      ['unlinked', { nlink: 0n }],
      ['hard-link', { nlink: 2n }],
      ['zero-device', { dev: 0n }],
      ['zero-inode', { ino: 0n }],
      ['empty', { size: 0n }],
      ['negative-size', { size: -1n }],
      ['oversized', { size: 128n * 1024n + 1n }],
    ])('rejects %s before reading', (_name, overrides) => {
      fsFault.targetPath = trackerPath;
      fsFault.before = overrides;
      expect(() => collect()).toThrow(/bounded regular single-link file/u);
      expect(fsFault.statCalls).toBe(1);
    });

    it('rejects a redirected repository path', () => {
      fsFault.targetPath = trackerPath;
      fsFault.redirected = true;
      expect(() => collect()).toThrow(/bounded regular single-link file/u);
      expect(fsFault.statCalls).toBe(1);
    });

    it.each(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'] as const)(
      'rejects post-read %s drift', field => {
        const stat = lstatSync(trackerPath, { bigint: true });
        fsFault.targetPath = trackerPath;
        fsFault.after = { [field]: stat[field] + 1n };
        expect(() => collect()).toThrow(/changed while it was read/u);
        expect(fsFault.statCalls).toBe(2);
      },
    );

    it('rejects a short read despite unchanged metadata', () => {
      fsFault.bytes = readFileSync(trackerPath).subarray(1);
      fsFault.targetPath = trackerPath;
      expect(() => collect()).toThrow(/changed while it was read/u);
    });

    it.each(['malformed-utf8', 'carriage-return', 'missing-final-lf', 'bom', 'empty-source'])(
      'rejects %s independently of size and hash', mode => {
        const bytes = readFileSync(trackerPath);
        switch (mode) {
          case 'malformed-utf8': bytes[0] = 0xff; break;
          case 'carriage-return': bytes[0] = 0x0d; break;
          case 'missing-final-lf': bytes[bytes.length - 1] = 0x20; break;
          case 'bom': bytes.set([0xef, 0xbb, 0xbf]); break;
          case 'empty-source': break;
          default: throw new Error('unknown encoding fault');
        }
        fsFault.bytes = mode === 'empty-source' ? Buffer.from([0xef, 0xbb, 0xbf]) : bytes;
        fsFault.before = fsFault.after = { size: BigInt(fsFault.bytes.length) };
        fsFault.targetPath = trackerPath;
        expect(() => collect()).toThrow(mode === 'malformed-utf8'
          ? /not strict UTF-8/u : /not canonical LF-only UTF-8 source/u);
      },
    );

    it.each(['tracker', 'duplicatePrevention', 'sourceLock', 'pooledReserve'] as const)(
      'rejects exact-source drift in %s', role => {
        const report = collect();
        const identity = report.receipt.artifacts[role];
        const path = fileURLToPath(new URL(`../../${identity.relativePath}`, import.meta.url));
        const bytes = readFileSync(path);
        bytes[0] = bytes[0] === 0x20 ? 0x21 : 0x20;
        fsFault.bytes = bytes;
        fsFault.targetPath = path;
        expect(() => collect()).toThrow(`${identity.relativePath} differs from the exact reviewed template`);
      },
    );

    it('rejects foreign-version tracker bytes at the expected path', () => {
      const other = foreign();
      fsFault.bytes = Buffer.from(other.templates.tracker, 'utf8');
      fsFault.before = fsFault.after = { size: BigInt(fsFault.bytes.length) };
      fsFault.targetPath = trackerPath;
      expect(() => collect()).toThrow(/differs from the exact reviewed template/u);
    });
  });
}

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
