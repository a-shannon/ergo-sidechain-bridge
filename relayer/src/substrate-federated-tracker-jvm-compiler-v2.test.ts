import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildSubstrateFederatedCheckpointProfileV1 } from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { sha256CanonicalJson } from './strict-json.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
  type SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV2,
  type SubstrateFederatedTrackerCompilerRequestV2,
} from './substrate-federated-tracker-compiler-v2.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1,
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
  parseSubstrateFederatedTrackerJvmCompilerOutputV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2_SCHEMA,
  assertSubstrateFederatedTrackerJvmCompilerReceiptV2,
  compileSubstrateFederatedTrackerWithPinnedJvmV2,
  type SubstrateFederatedTrackerJvmCompilerReceiptV2,
} from './substrate-federated-tracker-jvm-compiler-v2.js';

const vector = readJson('../test-vectors/substrate-federated-v1-tracker-admission.json');
const identityV1 = readJson('../test-vectors/substrate-federated-v1-tracker-contract.json');
const lock = readJson('../../sources/substrate-federated-tracker-compiler-lock-v1.json');
const templateV2 = readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url), 'utf8');
let request: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
let changedRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
let requestV1: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
let receipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
let changedReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
let receiptV1: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;

describe('substrate federated tracker process-owned JVM compiler V2', () => {
  beforeAll(async () => {
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const testNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      request = buildSubstrateFederatedTrackerCompilerRequestV2(input());
      changedRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
        ...input(), trackerGenesisInputBoxIdHex: '9d'.repeat(32),
      });
      requestV1 = buildSubstrateFederatedTrackerCompilerRequestV1({
        ...input(),
        template: {
          relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
          source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV1.es', import.meta.url), 'utf8'),
        },
      });
      receipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(request);
      changedReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(changedRequest);
      receiptV1 = await compileSubstrateFederatedTrackerWithPinnedJvmV1(requestV1);
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
  }, 90_000);

  it('compiles the complete V2 template with exact process pins and an independent identity', () => {
    expect(receipt.schema).toBe(SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2_SCHEMA);
    expect(receipt.version).toBe(2);
    expect(receipt.anchorSelector).toBe('absolute-ergo-header-height');
    expect(receipt.compilerRequestDigestHex).toBe(request.requestDigestHex);
    expect(receipt.contract.resolvedSourceSha256Hex).toBe(request.template.resolvedSourceSha256Hex);
    expect(receipt.compiler).toEqual({
      execution: 'process-owned-resolver-free-jvm',
      sigmaStateVersion: lock.sigmaStateVersion,
      sigmaStateArtifactSha256: lock.sigmaStateArtifactSha256,
      dependencyClasspathSha256: lock.dependencyClasspathSha256,
      javaDistribution: lock.javaDistribution,
      javaHomeSha256: lock.javaHomeSha256,
      toolSha256: lock.toolSha256,
      compiledToolClassesSha256: lock.compiledToolClassesSha256,
      networkPrefix: 16, scriptVersion: 3, treeVersion: 0,
    });
    const tree = Buffer.from(receipt.contract.propositionHex, 'hex');
    expect(tree.length).toBe(receipt.contract.propositionBytes);
    expect(createHash('sha256').update(tree).digest('hex')).toBe(receipt.contract.propositionSha256Hex);
    expect(Buffer.from(blakejs.blake2b(tree, undefined, 32)).toString('hex')).toBe(receipt.contract.contractIdHex);
    expect(receipt.contract.propositionHex).not.toBe(identityV1.propositionHex);
    const { receiptDigestHex, ...binding } = receipt;
    expect(sha256CanonicalJson(binding, 'E2S_SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2'))
      .toBe(receiptDigestHex);
    expect(assertSubstrateFederatedTrackerJvmCompilerReceiptV2(receipt, request)).toBe(receipt);
  });

  it('preserves the exact V1 compiled tree and requires a V2 receipt for the changed source', () => {
    expect(receiptV1.contract).toEqual({
      resolvedSourceSha256Hex: identityV1.resolvedSourceSha256Hex,
      propositionBytes: identityV1.propositionBytes,
      propositionHex: identityV1.propositionHex,
      propositionSha256Hex: identityV1.propositionSha256Hex,
      contractIdHex: identityV1.contractIdHex,
    });
    expect(assertSubstrateFederatedTrackerJvmCompilerReceiptV1(receiptV1, requestV1)).toBe(receiptV1);
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV2(receiptV1 as any, request))
      .toThrow(/lacks process provenance/);
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV1(receipt as any, requestV1))
      .toThrow(/lacks process provenance/);
  });

  it('binds a distinct genesis to distinct compiled bytes and rejects receipt substitution', () => {
    expect(changedReceipt.contract.resolvedSourceSha256Hex).not.toBe(receipt.contract.resolvedSourceSha256Hex);
    expect(changedReceipt.contract.propositionHex).not.toBe(receipt.contract.propositionHex);
    expect(changedReceipt.contract.contractIdHex).not.toBe(receipt.contract.contractIdHex);
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV2(receipt, changedRequest))
      .toThrow(/request binding drifted/);
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV2(changedReceipt, request))
      .toThrow(/request binding drifted/);
    expect(assertSubstrateFederatedTrackerJvmCompilerReceiptV2(changedReceipt, changedRequest)).toBe(changedReceipt);
  });

  it('rejects request copying and cross-version requests before process execution', async () => {
    for (const invalid of [structuredClone(request), { ...request, version: 1 }, requestV1]) {
      await expect(compileSubstrateFederatedTrackerWithPinnedJvmV2(invalid as any))
        .rejects.toThrow(/same-process provenance/);
    }
    await expect(compileSubstrateFederatedTrackerWithPinnedJvmV1(request as any))
      .rejects.toThrow(/same-process provenance/);
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV2(receipt, structuredClone(request)))
      .toThrow(/same-process provenance/);
  });

  it('rejects copied, relabelled or recomputed receipts even when all digests are self-consistent', () => {
    const forged = structuredClone(receipt) as any;
    forged.contract.propositionHex = `00${receipt.contract.propositionHex.slice(2)}`;
    const tree = Buffer.from(forged.contract.propositionHex, 'hex');
    forged.contract.propositionSha256Hex = createHash('sha256').update(tree).digest('hex');
    forged.contract.contractIdHex = Buffer.from(blakejs.blake2b(tree, undefined, 32)).toString('hex');
    const { receiptDigestHex: _oldDigest, ...binding } = forged;
    forged.receiptDigestHex = sha256CanonicalJson(binding, 'E2S_SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2');
    const relabelled = { ...receiptV1, schema: receipt.schema, version: 2, anchorSelector: receipt.anchorSelector };
    for (const invalid of [structuredClone(receipt), forged, relabelled]) {
      expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV2(invalid as any, request))
        .toThrow(/lacks process provenance/);
    }
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.contract)).toBe(true);
    expect(Object.isFrozen(receipt.boundaries)).toBe(true);
    expect(() => { (receipt.contract as any).contractIdHex = '00'.repeat(32); }).toThrow();
  });

  it('keeps parsed compiler output observation-only', () => {
    const output = [
      ['BRIDGE_FED_TRACKER_META', 1, 16, 3, 0, 17, '2.12.20',
        receipt.compiler.sigmaStateArtifactSha256, receipt.compiler.dependencyClasspathSha256,
        receipt.compiler.javaHomeSha256, receipt.compiler.compiledToolClassesSha256,
        request.requestDigestHex].join('\t'),
      ['BRIDGE_FED_TRACKER_CONTRACT', 'tracker', receipt.contract.resolvedSourceSha256Hex,
        receipt.contract.propositionBytes, receipt.contract.propositionHex,
        receipt.contract.propositionSha256Hex, receipt.contract.contractIdHex].join('\t'),
      '',
    ].join('\n');
    const parsed = parseSubstrateFederatedTrackerJvmCompilerOutputV1(output, {
      requestDigestHex: request.requestDigestHex,
      resolvedSourceSha256Hex: request.template.resolvedSourceSha256Hex,
      lock,
    });
    expect(parsed.authority).toBe('observation-only');
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV2(parsed as any, request))
      .toThrow(/lacks process provenance/);
  });

  it('retains the locked JVM environment guard on the V2 entrypoint', async () => {
    const original = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--trace-warnings';
    try {
      await expect(compileSubstrateFederatedTrackerWithPinnedJvmV2(request))
        .rejects.toThrow(/parent environment contains NODE_OPTIONS/);
    } finally {
      process.env.NODE_OPTIONS = original;
    }
  });

  it('proves compilation only, not profile activation, node admission or funds authority', () => {
    expect(receipt.checks).toEqual({
      sameProcessCompilerRequestVerified: true, processOwnedInputCreated: true,
      pinnedToolSourceCompiled: true, pinnedRuntimeSnapshotVerified: true,
      exactCompilerOutputBound: true, propositionIdentityRecomputed: true,
      jvmSerializationRoundTripVerified: true, callerContractIdentityAccepted: false,
      callerAuthorityClaimsAccepted: false,
    });
    expect(receipt.boundaries).toEqual({
      ...request.boundaries,
      jvmCompilationReplayed: true, compilerReceiptAuthenticated: true,
      trustedHostRequired: true, concurrentSameUserTamperingOutOfScope: true,
    });
    expect(receipt.boundaries.targetNodeAcceptanceEstablished).toBe(false);
    expect(receipt.boundaries.fundsAuthorityEstablished).toBe(false);
    expect(receipt.boundaries.profileActivated).toBe(false);
  });
});

function input() {
  return {
    template: { relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es', source: templateV2 },
    trackerGenesisInputBoxIdHex: identityV1.trackerNftIdHex as string,
    profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile),
    application: structuredClone(identityV1.application),
  };
}

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}
