import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { buildSubstrateFederatedCheckpointProfileV1 } from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { sha256CanonicalJson } from './strict-json.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import { buildSubstrateFederatedTrackerCompilerRequestV1 } from './substrate-federated-tracker-compiler-v1.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV1 } from './substrate-federated-tracker-jvm-compiler-v1.js';
import * as trackerCompilerV1 from './substrate-federated-tracker-jvm-compiler-v1.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2,
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input,
} from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource,
  resolveSubstrateFederatedSettlementFamilyV1PredecessorSources,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS,
} from './substrate-federated-settlement-family-v1.js';

const roles = ['duplicatePrevention', 'sourceLock', 'pooledReserve'] as const;
const vector = readJson('../test-vectors/substrate-federated-v1-tracker-admission.json');
const identityV1 = readJson('../test-vectors/substrate-federated-v1-tracker-contract.json');
const frozenBatch = readJson('../test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json');
const lock = readJson('../../sources/substrate-federated-tracker-compiler-lock-v1.json');
const requestDomain = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_REQUEST_V2';
const receiptDomain = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V2';
type Input = CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input;
type Receipt = Awaited<ReturnType<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2>>;
let request: ReturnType<typeof buildSubstrateFederatedTrackerCompilerRequestV2>;
let changedRequest: typeof request;
let trackerReceipt: Awaited<ReturnType<typeof compileSubstrateFederatedTrackerWithPinnedJvmV2>>;
let input: Input;
let receipt: Receipt;
let familyExecution: Awaited<ReturnType<typeof trackerCompilerV1.executePinnedFederatedJvmCompilerV1>>;
let snapshotReceipt: Receipt;
let snapshotMutatedInput: Input;
let requestV1: ReturnType<typeof buildSubstrateFederatedTrackerCompilerRequestV1>;
let trackerReceiptV1: Awaited<ReturnType<typeof compileSubstrateFederatedTrackerWithPinnedJvmV1>>;
let inputV1: Parameters<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1>[0];
let receiptV1: Awaited<ReturnType<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1>>;

describe('substrate federated settlement-family process-owned JVM compiler V2', () => {
  beforeAll(async () => {
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const testNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      request = buildSubstrateFederatedTrackerCompilerRequestV2(trackerInput(2));
      changedRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
        ...trackerInput(2), trackerGenesisInputBoxIdHex: '9d'.repeat(32),
      });
      trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(request);
      input = familyInput();
      const actualExecution = vi.spyOn(trackerCompilerV1, 'executePinnedFederatedJvmCompilerV1');
      try {
        receipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(input);
        expect(actualExecution).toHaveBeenCalledTimes(1);
        familyExecution = await actualExecution.mock.results[0]!.value;
      } finally {
        actualExecution.mockRestore();
      }
      requestV1 = buildSubstrateFederatedTrackerCompilerRequestV1(trackerInput(1));
      trackerReceiptV1 = await compileSubstrateFederatedTrackerWithPinnedJvmV1(requestV1);
      inputV1 = { ...familyInput(), trackerRequest: requestV1, trackerReceipt: trackerReceiptV1 };
      receiptV1 = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(inputV1);

      const mutable = { ...familyInput(), templates: structuredClone(input.templates) };
      let settled = false;
      const pending = compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(mutable)
        .finally(() => { settled = true; });
      // Mutate caller-owned containers after the real compiler has yielded.
      [snapshotReceipt] = await Promise.all([
        pending,
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          expect(settled).toBe(false);
          mutable.trackerRequest = changedRequest;
          mutable.trackerReceipt = trackerReceiptV1 as unknown as Input['trackerReceipt'];
          mutable.duplicatePreventionGenesisInputBoxIdHex = '10'.repeat(32);
          mutable.pooledReserveGenesisInputBoxIdHex = '11'.repeat(32);
          for (const role of roles) {
            (mutable.templates[role] as { source: string }).source += '\n// caller mutation\n';
          }
        })(),
      ]);
      snapshotMutatedInput = mutable;
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
  }, 120_000);

  it('binds V2 receipt and request canonical preimages to distinct domains', () => {
    expect(receipt.schema).toBe('e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v2');
    expect(receipt.version).toBe(2);
    expect(receipt.trackerAnchorSelector).toBe('absolute-ergo-header-height');
    expect(receipt.settlementLayout).toBe('native-erg-federated-family-v1');
    expect(receipt.trackerCompilerRequestDigestHex).toBe(request.requestDigestHex);
    expect(receipt.trackerCompilerReceiptDigestHex).toBe(trackerReceipt.receiptDigestHex);
    const preimage = {
      schema: 'e2s.substrate-federated-settlement-family-jvm-compiler-request.v2',
      version: 2,
      trackerAnchorSelector: 'absolute-ergo-header-height',
      settlementLayout: 'native-erg-federated-family-v1',
      trackerCompilerRequestDigestHex: request.requestDigestHex,
      trackerCompilerReceiptDigestHex: trackerReceipt.receiptDigestHex,
      familyRequest: familyRequest(),
    };
    expect(sha256CanonicalJson(preimage, requestDomain)).toBe(receipt.familyCompilerRequestDigestHex);
    expect(sha256CanonicalJson(preimage, requestDomain.replace(/V2$/, 'V1')))
      .not.toBe(receipt.familyCompilerRequestDigestHex);
    const { receiptDigestHex, ...binding } = receipt;
    expect(sha256CanonicalJson(binding, receiptDomain)).toBe(receiptDigestHex);
    expect(sha256CanonicalJson(binding, receiptDomain.replace(/V2$/, 'V1'))).not.toBe(receiptDigestHex);
    expect(assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(receipt, input)).toBe(receipt);
  });

  it('decodes all 17 identity bindings and template hashes in the unchanged 596-byte layout', () => {
    const encoded = Buffer.from(receipt.profile.encodedProfileHex, 'hex');
    expect(encoded.length).toBe(596);
    expect(receipt.profile.schema).toBe('e2s.substrate-federated-settlement-family.v1');
    expect(receipt.profile.version).toBe(1);
    expect(decodeSubstrateFederatedSettlementFamilyV1Profile(receipt.profile)).toEqual({
      version: 1, hashAlgorithmId: 1, settlementAssetProfileId: 1, flags: 0,
      sourceNetworkIdHex: request.application.sourceNetworkIdHex,
      sidechainIdHex: request.application.sidechainIdHex,
      bridgeAddressHex: request.application.bridgeAddressHex,
      tokenAddressHex: request.application.tokenAddressHex,
      runtimeProfileIdHex: request.application.runtimeProfileIdHex,
      settlementProfileIdHex: request.application.settlementProfileIdHex,
      federationProfileIdHex: request.profile.profileIdHex,
      sourceAttestationKeySetDigestHex: request.profile.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold: request.profile.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex: request.profile.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: request.profile.ergoAdmissionThreshold,
      federationEpoch: request.profile.federationEpoch,
      trackerNftIdHex: request.trackerNftIdHex,
      duplicatePreventionNftIdHex: input.duplicatePreventionGenesisInputBoxIdHex,
      pooledReserveNftIdHex: input.pooledReserveGenesisInputBoxIdHex,
      trackerContractIdHex: trackerReceipt.contract.contractIdHex,
      trackerTemplateSourceSha256Hex: request.template.templateSourceSha256Hex,
      duplicatePreventionTemplateSha256Hex: sha256(input.templates.duplicatePrevention.source),
      sourceLockTemplateSha256Hex: sha256(input.templates.sourceLock.source),
      pooledReserveTemplateSha256Hex: sha256(input.templates.pooledReserve.source),
      sourceRefundDelayBlocks: 10_000,
      minimumAnchorConfirmations: 10,
      maximumSuccessorCreationHeightLag: 100,
      minimumExternalFeeNanoErg: '1000000', maximumExternalFeeNanoErg: '2100000',
      settlementAssetIdHex: '00'.repeat(32),
    });
    expect(blake2b(Buffer.concat([
      Buffer.from('E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1', 'ascii'), encoded,
    ]))).toBe(receipt.profile.familyIdHex);
    expect(receipt.profile).toEqual(familyRequest().profile);
  });

  it('checks all source and proposition hashes against actual dependent JVM identities', () => {
    const derived = familyRequest();
    const sources = {
      ...resolveSubstrateFederatedSettlementFamilyV1PredecessorSources(derived),
      pooledReserve: reserveSource(
        receipt.contracts.duplicatePrevention.contractIdHex,
        receipt.contracts.sourceLock.contractIdHex,
      ),
    };
    for (const role of roles) {
      const contract = receipt.contracts[role];
      const tree = Buffer.from(contract.propositionHex, 'hex');
      expect(contract.resolvedSourceSha256Hex).toBe(sha256(sources[role]));
      expect(contract.propositionBytes).toBe(tree.length);
      expect(contract.propositionSha256Hex).toBe(sha256(tree));
      expect(contract.contractIdHex).toBe(blake2b(tree));
    }
    expect(receipt.compilerLockDigestHex).toBe(trackerReceipt.compilerLockDigestHex);
    expect(receipt.compiler).toEqual({
      execution: 'process-owned-dependent-family-jvm',
      sigmaStateVersion: lock.sigmaStateVersion,
      sigmaStateArtifactSha256: lock.sigmaStateArtifactSha256,
      dependencyClasspathSha256: lock.dependencyClasspathSha256,
      javaDistribution: lock.javaDistribution, javaHomeSha256: lock.javaHomeSha256,
      toolSha256: lock.toolSha256, compiledToolClassesSha256: lock.compiledToolClassesSha256,
    });
  });

  it('independently binds each reserve dependency to compiled IDs rather than V1 goldens', () => {
    const dup = receipt.contracts.duplicatePrevention.contractIdHex;
    const sourceLock = receipt.contracts.sourceLock.contractIdHex;
    const expected = receipt.contracts.pooledReserve.resolvedSourceSha256Hex;
    expect(sha256(reserveSource(dup, sourceLock))).toBe(expected);
    expect(sha256(reserveSource(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.duplicatePrevention, sourceLock)))
      .not.toBe(expected);
    expect(sha256(reserveSource(dup, SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS.sourceLock)))
      .not.toBe(expected);
  });

  it('rejects a different family compiler lock before parsing compiler output', async () => {
    const differentLockDigest = 'a7'.repeat(32);
    expect(differentLockDigest).not.toBe(trackerReceipt.compilerLockDigestHex);
    // Rejection-only executor double: all positive receipts use real compilation.
    const execution = vi.spyOn(trackerCompilerV1, 'executePinnedFederatedJvmCompilerV1')
      .mockResolvedValueOnce({
        ...familyExecution, compilerLockDigestHex: differentLockDigest,
      });
    try {
      await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(input))
        .rejects.toThrow('federated V2 tracker and family compiler locks differ');
      expect(execution).toHaveBeenCalledTimes(1);
    } finally {
      execution.mockRestore();
    }
  });

  it('replays the genuine V1 tracker and family goldens without reusing any V1 family contract ID', () => {
    expect(trackerReceiptV1.contract).toEqual({
      resolvedSourceSha256Hex: identityV1.resolvedSourceSha256Hex,
      propositionBytes: identityV1.propositionBytes, propositionHex: identityV1.propositionHex,
      propositionSha256Hex: identityV1.propositionSha256Hex, contractIdHex: identityV1.contractIdHex,
    });
    expect(assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(receiptV1, inputV1)).toBe(receiptV1);
    for (const expected of frozenBatch.contracts) {
      const role = expected.role as typeof roles[number];
      expect(receiptV1.contracts[role]).toEqual({
        resolvedSourceSha256Hex: expected.resolvedSourceSha256Hex,
        propositionBytes: expected.propositionBytes, propositionHex: expected.propositionHex,
        propositionSha256Hex: expected.propositionSha256Hex, contractIdHex: expected.contractIdHex,
      });
      expect(receiptV1.contracts[role].contractIdHex).toBe(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS[role]);
      expect(receipt.contracts[role].contractIdHex).not.toBe(receiptV1.contracts[role].contractIdHex);
    }
    expect(trackerReceipt.contract.contractIdHex).not.toBe(trackerReceiptV1.contract.contractIdHex);
    expect(receipt.profile.familyIdHex).not.toBe(receiptV1.profile.familyIdHex);
  });

  it('rejects genuine cross-version family receipts in both process-owned guards', () => {
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(receiptV1 as any, input))
      .toThrow(/lacks process provenance/);
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(receipt as any, inputV1))
      .toThrow(/lacks process provenance/);
  });

  it.each(['cloned', 'serialized', 'mutated', 'relabelled-v1'] as const)(
    'rejects %s tracker receipts before external compilation', async kind => {
      const invalid = kind === 'serialized' ? JSON.parse(JSON.stringify(trackerReceipt))
        : kind === 'relabelled-v1' ? {
          ...trackerReceiptV1, schema: trackerReceipt.schema, version: 2,
          anchorSelector: trackerReceipt.anchorSelector,
        } : structuredClone(trackerReceipt);
      if (kind === 'mutated') invalid.contract.contractIdHex = 'ab'.repeat(32);
      await rejectsBeforeCompiler({ ...input, trackerReceipt: invalid }, /lacks process provenance/);
    },
  );

  it('rejects a copied tracker request and a genuine V1 tracker request', async () => {
    await rejectsBeforeCompiler({ ...input, trackerRequest: structuredClone(request) }, /same-process provenance/);
    await rejectsBeforeCompiler({ ...input, trackerRequest: requestV1 } as any, /same-process provenance/);
  });

  it('rejects a genuine mismatched V2 tracker request and receipt', async () => {
    expect(changedRequest.requestDigestHex).not.toBe(request.requestDigestHex);
    await rejectsBeforeCompiler({ ...input, trackerRequest: changedRequest }, /request binding drifted/);
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(receipt, {
      ...input, trackerRequest: changedRequest,
    })).toThrow(/request binding drifted/);
  });

  it.each(['duplicatePreventionGenesisInputBoxIdHex', 'pooledReserveGenesisInputBoxIdHex'] as const)(
    'rejects independent expected %s drift at family binding', key => {
      const changed = { ...input, [key]: '12'.repeat(32) };
      expect(new Set([
        request.trackerNftIdHex, changed.duplicatePreventionGenesisInputBoxIdHex,
        changed.pooledReserveGenesisInputBoxIdHex,
      ]).size).toBe(3);
      expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(receipt, changed))
        .toThrow(/family compiler binding drifted/);
    },
  );

  it.each(roles)('rejects malformed %s source at its template predicate', async role => {
    const templates = structuredClone(input.templates);
    (templates[role] as { source: string }).source += '\r';
    await rejectsBeforeCompiler({ ...input, templates }, new RegExp(`${role} template must be non-empty LF-only ASCII`));
  });

  it.each(roles)('rejects validly shaped altered %s source at family binding', role => {
    const templates = structuredClone(input.templates);
    (templates[role] as { source: string }).source += '\n// changed source binding\n';
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(receipt, { ...input, templates }))
      .toThrow(/family compiler binding drifted/);
  });

  it.each(['tracker', 'familyIdentity', 'authority'] as const)(
    'rejects extra %s input claims before external compilation', async key => {
      await rejectsBeforeCompiler({ ...input, [key]: { accepted: true } } as any, /requires exact compiler inputs/);
    },
  );

  it.each(['tracker-dup', 'tracker-reserve', 'dup-reserve'] as const)(
    'rejects duplicate singleton NFT IDs: %s', async pair => {
      const changed = { ...input };
      if (pair === 'tracker-dup') changed.duplicatePreventionGenesisInputBoxIdHex = request.trackerNftIdHex;
      if (pair === 'tracker-reserve') changed.pooledReserveGenesisInputBoxIdHex = request.trackerNftIdHex;
      if (pair === 'dup-reserve') changed.pooledReserveGenesisInputBoxIdHex = input.duplicatePreventionGenesisInputBoxIdHex;
      await rejectsBeforeCompiler(changed, /singleton IDs must be pairwise distinct/);
    },
  );

  it.each(['cloned', 'serialized', 'relabelled-v1', 'promoted-authority'] as const)(
    'rejects %s family receipts despite caller-controlled content', kind => {
      const invalid = kind === 'serialized' ? JSON.parse(JSON.stringify(receipt))
        : kind === 'relabelled-v1' ? {
          ...receiptV1, schema: receipt.schema, version: 2,
          trackerAnchorSelector: receipt.trackerAnchorSelector, settlementLayout: receipt.settlementLayout,
        } : structuredClone(receipt);
      if (kind === 'promoted-authority') invalid.boundaries.fundsAuthorityEstablished = true;
      const { receiptDigestHex: _old, ...binding } = invalid;
      invalid.receiptDigestHex = sha256CanonicalJson(binding, receiptDomain);
      expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(invalid, input))
        .toThrow(/lacks process provenance/);
    },
  );

  it('retains the initially captured input through delayed caller and nested source mutation', () => {
    expect(snapshotMutatedInput.trackerRequest).toBe(changedRequest);
    expect(snapshotMutatedInput.trackerReceipt).toBe(trackerReceiptV1);
    for (const role of roles) {
      expect(snapshotMutatedInput.templates[role].source).not.toBe(input.templates[role].source);
    }
    expect(snapshotReceipt).not.toBe(receipt);
    expect(snapshotReceipt).toEqual(receipt);
    expect(assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(snapshotReceipt, input)).toBe(snapshotReceipt);
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(snapshotReceipt, snapshotMutatedInput))
      .toThrow(/lacks process provenance/);
  });

  it('keeps the exact checks and authority boundaries immutable without activation claims', () => {
    expect(receipt.checks).toEqual({
      sameProcessTrackerRequestVerified: true, sameProcessTrackerReceiptVerified: true,
      trackerBindingDerivedInternally: true, sameCompilerLockVerified: true,
      processOwnedFamilyRequestCreated: true,
      predecessorContractsCompiledFirst: true, reserveContractIdsDerivedFromPropositions: true,
      reserveSourceDependencyRecomputed: true, exactCompilerOutputBound: true,
      callerTrackerIdentityAccepted: false, callerFamilyIdentityAccepted: false,
      callerAuthorityClaimsAccepted: false,
    });
    expect(receipt.boundaries).toEqual({
      profileActivated: false, targetGenesisBoxesObserved: false,
      targetNetworkIdentityAuthenticated: false, jvmCompilationReplayed: true,
      compilerReceiptAuthenticated: true, trustedHostRequired: true,
      concurrentSameUserTamperingOutOfScope: true, nodeCheckPerformed: false,
      targetNodeAcceptanceEstablished: false, signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false, broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false, gate5Closed: false,
      trustlessStatusEstablished: false, productionReadinessEstablished: false,
    });
    for (const value of [receipt, receipt.profile, receipt.contracts, receipt.compiler,
      receipt.checks, receipt.boundaries, ...Object.values(receipt.contracts)]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => { (receipt.boundaries as any).fundsAuthorityEstablished = true; }).toThrow();
  });
});

function trackerInput(version: 1 | 2) {
  return {
    template: contractTemplate(`contracts/SPVTrackerSubstrateFederatedV${version}.es`),
    trackerGenesisInputBoxIdHex: identityV1.trackerNftIdHex as string,
    profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile),
    application: structuredClone(identityV1.application),
  };
}

function familyInput(): Input {
  return {
    trackerRequest: request, trackerReceipt,
    templates: {
      duplicatePrevention: contractTemplate('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
      sourceLock: contractTemplate('contracts/MainChainLockPooledReserveV6.es'),
      pooledReserve: contractTemplate('contracts/MainChainPooledReserveValidityApplicationV6.es'),
    },
    duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32),
    pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32),
  };
}

function familyRequest() {
  return buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
    templates: input.templates,
    duplicatePreventionGenesisInputBoxIdHex: input.duplicatePreventionGenesisInputBoxIdHex,
    pooledReserveGenesisInputBoxIdHex: input.pooledReserveGenesisInputBoxIdHex,
    tracker: {
      contractIdHex: trackerReceipt.contract.contractIdHex,
      templateSourceSha256Hex: request.template.templateSourceSha256Hex,
      trackerNftIdHex: request.trackerNftIdHex,
      sourceNetworkIdHex: request.application.sourceNetworkIdHex,
      sidechainIdHex: request.application.sidechainIdHex,
      bridgeAddressHex: request.application.bridgeAddressHex,
      tokenAddressHex: request.application.tokenAddressHex,
      runtimeProfileIdHex: request.application.runtimeProfileIdHex,
      settlementProfileIdHex: request.application.settlementProfileIdHex,
      federationProfileIdHex: request.profile.profileIdHex,
      sourceAttestationKeySetDigestHex: request.profile.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold: request.profile.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex: request.profile.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: request.profile.ergoAdmissionThreshold,
      federationEpoch: request.profile.federationEpoch,
    },
  });
}

function reserveSource(duplicatePreventionId: string, sourceLockId: string): string {
  return resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource(familyRequest())
    .replace('POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER', duplicatePreventionId)
    .replace('POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER', sourceLockId);
}

async function rejectsBeforeCompiler(value: Input, predicate: RegExp): Promise<void> {
  // The reviewed parent sentinel rejects any accidental entry into the executor.
  expect(process.env.NODE_OPTIONS).toBe('--no-deprecation');
  await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(value)).rejects.toThrow(predicate);
}

function contractTemplate(relativePath: string) {
  return { relativePath, source: readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8') };
}

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
