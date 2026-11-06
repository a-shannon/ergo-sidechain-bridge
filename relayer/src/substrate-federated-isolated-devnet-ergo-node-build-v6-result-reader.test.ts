import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync,
  unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { V4_GENERATED_OUTPUT_ROOTS } from
  './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import {
  inspectSelectedV6NodeBuildLock, V6_NODE_BUILD_LOCK_RELATIVE_PATH,
  V6_NODE_BUILD_LOCK_SHA256_HEX,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';
import {
  parseV6PublicBuildResultNonAuthorizing, readDirectV6PublicBuildFile,
  selectV6PublicBuildOutcomePathNonAuthorizing,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-result-reader.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const lock = inspectSelectedV6NodeBuildLock({
  path: resolve(bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
  expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
}).lock;
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const FAILURE_TEXT = '{"campaignAdmitted":false,"failedWhile":"RESOLVER_JOB",'
  + '"kind":"v6-process-owned-build-failure-phase",'
  + '"receiptDigestHex":"58e77a47bb780055b98c5b7173f89d6163efa1e5741eeef1b06beaf9d4c1faf3",'
  + '"schemaVersion":1,"successEstablished":false}\n';

function successBody(): Record<string, unknown> {
  const cap = { maxFiles: 50_000, maxDirectories: 4_096,
    maxBytes: 536_870_912 };
  const capture = { entryCount: 999, sha256Hex: 'a'.repeat(64) };
  const job = { stdoutBytes: 1, stdoutSha256Hex: sha('x') };
  return {
    schemaVersion: 1,
    kind: 'v6-process-owned-build-static-observation',
    source: {
      checkoutHead: lock.ergoNodeBaseCommit,
      checkoutTree: '9f8d571534b21eec660ff21177adf725e50ddf02',
      checkoutIndexSha256Hex: 'b'.repeat(64),
      physicalSourceDigestHex: 'c'.repeat(64),
      planSnapshotSha256Hex: 'd'.repeat(64),
      lockSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
    },
    dependencies: {
      lockSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
      mirrorReceiptSha256Hex: lock.ownedMavenMirrorReceiptSha256,
      mavenTerminalSha256Hex: lock.v6MavenTerminalSha256,
      leveldbReceiptSha256Hex: lock.ownedGitlabLeveldbReceiptSha256,
      leveldbTerminalSha256Hex: lock.v6LeveldbTerminalSha256,
      mirrorMetadataSha256Hex: lock.ownedMavenMirrorMetadataSha256,
      mirrorFileCount: lock.ownedMavenMirrorFileCount,
      mirrorBytes: lock.ownedMavenMirrorBytes,
      bootJarFrameSha256Hex: lock.ownedBootJarFrameSha256,
      bootFileCount: lock.ownedBootJarCount,
      bootBytes: lock.ownedBootJarBytes,
      leveldbAggregateSha256Hex: lock.ownedGitlabLeveldbAggregateSha256,
      leveldbFileCount: lock.ownedGitlabLeveldbFileCount,
      leveldbBytes: lock.ownedGitlabLeveldbBytes,
    },
    caps: { total: cap, roots: Object.fromEntries(
      V4_GENERATED_OUTPUT_ROOTS.map(root => [root, cap])) },
    captures: { b0: capture, r: capture, u: capture, a: capture },
    jobs: { resolver: job, update: job, assembly: job },
    assembly: { relativePath: 'target/scala-2.12/ergo-synthetic.jar',
      bytes: 33_554_432, sha256Hex: 'e'.repeat(64) },
    status: { resolverExecuted: true, updateExecuted: true,
      assemblyExecuted: true, updateDependencyGraphReviewed: false,
      campaignAdmitted: false },
  };
}
function signedSuccess(body: Record<string, unknown>): string {
  const receiptDigestHex = sha256CanonicalJson(body,
    'E2S_SUBSTRATE_FED_V6_OWNED_BUILD_STATIC_RECEIPT_V1');
  return canonicalJson({ ...body, receiptDigestHex }) + '\n';
}

describe('selected V6 public B0 result reader, without build authority', () => {
  it('classifies a synthetic success claim but leaves the JAR unverified', () => {
    const selected = parseV6PublicBuildResultNonAuthorizing(
      signedSuccess(successBody()), lock);
    expect(selected).toMatchObject({
      kind: 'reported_static_success', jobsReportedExecuted: true,
      physicalAssemblyVerified: false, cleanBridgeReferenceVerified: false,
      campaignAdmitted: false,
      assembly: { relativePath: 'target/scala-2.12/ergo-synthetic.jar',
        bytes: 33_554_432 },
    });
  });

  it('classifies the exact current public failure with no receipt-contained lineage', () => {
    expect(sha(FAILURE_TEXT)).toBe(
      'da2ca18d37477e3d5fa30f53798cfe79adbe8abd5f4416cd6a89e59f3c9afd26');
    expect(parseV6PublicBuildResultNonAuthorizing(FAILURE_TEXT, lock))
      .toMatchObject({ kind: 'public_failure', failedWhile: 'RESOLVER_JOB',
        successEstablished: false, lineageInReceipt: false,
        campaignAdmitted: false, physicalAssemblyVerified: false });
  });

  it('refuses digest drift, foreign lock or terminal, extra fields and duplicate keys', () => {
    const original = successBody();
    const changedDigest = JSON.parse(signedSuccess(original)) as Record<string, unknown>;
    changedDigest.receiptDigestHex = '0'.repeat(64);
    expect(() => parseV6PublicBuildResultNonAuthorizing(
      canonicalJson(changedDigest) + '\n', lock)).toThrow(/digest differs/u);
    for (const key of ['lockSha256Hex', 'mavenTerminalSha256Hex',
      'leveldbTerminalSha256Hex']) {
      const changed = successBody();
      (changed.dependencies as Record<string, unknown>)[key] = 'f'.repeat(64);
      expect(() => parseV6PublicBuildResultNonAuthorizing(
        signedSuccess(changed), lock)).toThrow(/lineage differs/u);
    }
    expect(() => parseV6PublicBuildResultNonAuthorizing(
      signedSuccess({ ...original, extra: true }), lock)).toThrow(/fields differ/u);
    expect(() => parseV6PublicBuildResultNonAuthorizing(
      '{"kind":"x","kind":"x"}\n', lock)).toThrow(/duplicate keys/u);
    const badStatus = successBody();
    (badStatus.status as Record<string, unknown>).campaignAdmitted = true;
    expect(() => parseV6PublicBuildResultNonAuthorizing(
      signedSuccess(badStatus), lock)).toThrow(/status claims differ/u);
  });

  it('refuses ambiguous presence and old V4 siblings without opening their bytes', () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'v6-public-result-test-')));
    try {
      expect(() => selectV6PublicBuildOutcomePathNonAuthorizing(root))
        .toThrow(/presence is ambiguous/u);
      const failure = join(root, 'v6-process-owned-build-failure-phase.json');
      writeFileSync(failure, FAILURE_TEXT, { flag: 'wx' });
      expect(selectV6PublicBuildOutcomePathNonAuthorizing(root)).toMatchObject({
        path: failure, kind: 'failure',
      });
      const foreign = join(root, 'foreign.txt');
      writeFileSync(foreign, 'SENSITIVE_SENTINEL', { flag: 'wx' });
      expect(() => selectV6PublicBuildOutcomePathNonAuthorizing(root))
        .toThrow(/unexpected result parent member/u);
      unlinkSync(foreign);
      const old = join(root, 'v4-process-owned-build-result.json');
      writeFileSync(old, 'SENSITIVE_SENTINEL', { flag: 'wx' });
      expect(() => selectV6PublicBuildOutcomePathNonAuthorizing(root))
        .toThrow(/foreign or optional sibling is occupied/u);
      unlinkSync(old);
      const success = join(root, 'v6-process-owned-build-result.json');
      writeFileSync(success, signedSuccess(successBody()), { flag: 'wx' });
      expect(() => selectV6PublicBuildOutcomePathNonAuthorizing(root))
        .toThrow(/presence is ambiguous/u);
      unlinkSync(success);
      linkSync(failure, join(root, 'linked-copy.json'));
      expect(() => readDirectV6PublicBuildFile(failure, 16_384))
        .toThrow(/indirect or exceeds cap/u);
      const occupied = join(root, 'occupied');
      mkdirSync(occupied);
      expect(() => readDirectV6PublicBuildFile(occupied, 16_384))
        .toThrow(/indirect or exceeds cap/u);
    } finally {
      const parent = resolve(realpathSync.native(tmpdir()));
      if (dirname(root).toLowerCase() !== parent.toLowerCase()
          || !basename(root).startsWith('v6-public-result-test-')
          || !root.toLowerCase().startsWith(parent.toLowerCase() + sep)) {
        throw new Error('unsafe V6 public result fixture cleanup path');
      }
      rmSync(root, { recursive: true });
    }
  });
});
