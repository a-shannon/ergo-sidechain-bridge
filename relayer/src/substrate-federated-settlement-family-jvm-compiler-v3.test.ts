import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { buildSubstrateFederatedCheckpointProfileV1 } from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { sha256CanonicalJson } from './strict-json.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import * as trackerCompilerV1 from './substrate-federated-tracker-jvm-compiler-v1.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3,
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input,
} from './substrate-federated-settlement-family-jvm-compiler-v3.js';
import {
  buildSubstrateFederatedSettlementFamilyV3CompilerRequest,
  resolveSubstrateFederatedSettlementFamilyV3ReserveSource,
  resolveSubstrateFederatedSettlementFamilyV3Sources,
} from './substrate-federated-settlement-family-v3.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from './substrate-federated-settlement-family-v1.js';

const roles = ['duplicatePrevention', 'sourceLock', 'pooledReserve'] as const;
const vector = readJson('../test-vectors/substrate-federated-v1-tracker-admission.json');
const identityV1 = readJson('../test-vectors/substrate-federated-v1-tracker-contract.json');
const requestDomain = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_REQUEST_V3';
const receiptDomain = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V3';
type Input = CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input;
type Receipt = Awaited<ReturnType<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3>>;
let trackerRequest: ReturnType<typeof buildSubstrateFederatedTrackerCompilerRequestV2>;
let trackerReceipt: Awaited<ReturnType<typeof compileSubstrateFederatedTrackerWithPinnedJvmV2>>;
let input: Input;
let receipt: Receipt;
let execution: Awaited<ReturnType<typeof trackerCompilerV1.executePinnedFederatedJvmCompilerV1>>;

describe('process-owned V2 tracker and V7 reserve family compiler V3', () => {
  beforeAll(async () => {
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const testNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
        template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
        trackerGenesisInputBoxIdHex: identityV1.trackerNftIdHex as string,
        profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile),
        application: structuredClone(identityV1.application),
      });
      trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
      input = {
        trackerRequest, trackerReceipt,
        templates: {
          duplicatePrevention: template('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
          sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
          pooledReserve: template('contracts/MainChainPooledReserveValidityApplicationV7.es'),
        },
        duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32),
        pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32),
      };
      const actual = vi.spyOn(trackerCompilerV1, 'executePinnedFederatedJvmCompilerV1');
      try {
        receipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(input);
        expect(actual).toHaveBeenCalledTimes(1);
        execution = await actual.mock.results[0]!.value;
      } finally {
        actual.mockRestore();
      }
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
  }, 120_000);

  it('binds the V7 template SHA and process-owned tracker identity in the unchanged 596-byte profile', () => {
    const family = buildSubstrateFederatedSettlementFamilyV3CompilerRequest(input);
    const decoded = decodeSubstrateFederatedSettlementFamilyV1Profile(family.profile);
    const encoded = Buffer.from(family.profile.encodedProfileHex, 'hex');
    expect(encoded.length).toBe(596);
    expect(decoded.trackerContractIdHex).toBe(trackerReceipt.contract.contractIdHex);
    expect(decoded.trackerTemplateSourceSha256Hex).toBe(trackerRequest.template.templateSourceSha256Hex);
    expect(decoded.pooledReserveTemplateSha256Hex).toBe(sha256(input.templates.pooledReserve.source));
    expect(family.contracts[2]).toEqual({
      role: 'pooledReserve',
      relativePath: 'contracts/MainChainPooledReserveValidityApplicationV7.es',
      templateSha256Hex: decoded.pooledReserveTemplateSha256Hex,
    });
    expect(receipt.profile).toEqual(family.profile);
    expect(receipt.profile.familyIdHex).toBe(blake2b(Buffer.concat([
      Buffer.from('E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1', 'ascii'), encoded,
    ])));
    expect(receipt.trackerCompilerRequestDigestHex).toBe(trackerRequest.requestDigestHex);
    expect(receipt.trackerCompilerReceiptDigestHex).toBe(trackerReceipt.receiptDigestHex);
    const preimage = {
      schema: 'e2s.substrate-federated-settlement-family-jvm-compiler-request.v3',
      version: 3, trackerAnchorSelector: 'absolute-ergo-header-height',
      settlementLayout: 'native-erg-federated-family-reserve-v7',
      trackerCompilerRequestDigestHex: trackerRequest.requestDigestHex,
      trackerCompilerReceiptDigestHex: trackerReceipt.receiptDigestHex,
      familyRequest: family,
    };
    expect(receipt.familyCompilerRequestDigestHex).toBe(sha256CanonicalJson(preimage, requestDomain));
    const { receiptDigestHex, ...body } = receipt;
    expect(receiptDigestHex).toBe(sha256CanonicalJson(body, receiptDomain));
    expect(assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3(receipt, input)).toBe(receipt);
  });

  it('rejects a copied V3 receipt despite matching canonical fields', () => {
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3(
      structuredClone(receipt), input,
    )).toThrow(/lacks process provenance/);
  });

  it('binds all three compiler proposition identities and the two same-invocation predecessor IDs', () => {
    const family = buildSubstrateFederatedSettlementFamilyV3CompilerRequest(input);
    const sources = resolveSubstrateFederatedSettlementFamilyV3Sources(family);
    const actual = {
      duplicatePrevention: sources.duplicatePrevention,
      sourceLock: sources.sourceLock,
      pooledReserve: resolveSubstrateFederatedSettlementFamilyV3ReserveSource(sources.partialReserve, {
        duplicatePreventionContractIdHex: receipt.contracts.duplicatePrevention.contractIdHex,
        sourceLockContractIdHex: receipt.contracts.sourceLock.contractIdHex,
      }),
    };
    for (const role of roles) {
      const contract = receipt.contracts[role];
      const proposition = Buffer.from(contract.propositionHex, 'hex');
      expect(contract.resolvedSourceSha256Hex).toBe(sha256(actual[role]));
      expect(contract.propositionBytes).toBe(proposition.length);
      expect(contract.propositionSha256Hex).toBe(sha256(proposition));
      expect(contract.contractIdHex).toBe(blake2b(proposition));
    }
    expect(receipt.contracts.pooledReserve.resolvedSourceSha256Hex).not.toBe(sha256(
      resolveSubstrateFederatedSettlementFamilyV3ReserveSource(sources.partialReserve, {
        duplicatePreventionContractIdHex: 'ab'.repeat(32),
        sourceLockContractIdHex: receipt.contracts.sourceLock.contractIdHex,
      }),
    ));
    expect(receipt.contracts.pooledReserve.resolvedSourceSha256Hex).not.toBe(sha256(
      resolveSubstrateFederatedSettlementFamilyV3ReserveSource(sources.partialReserve, {
        duplicatePreventionContractIdHex: receipt.contracts.duplicatePrevention.contractIdHex,
        sourceLockContractIdHex: 'bc'.repeat(32),
      }),
    ));
    expect(receipt.compilerLockDigestHex).toBe(trackerReceipt.compilerLockDigestHex);
    expect(receipt.checks.predecessorIdsFromSameCompilerProcess).toBe(true);
    expect(receipt.boundaries.profileActivated).toBe(false);
    expect(receipt.boundaries.fundsAuthorityEstablished).toBe(false);
    expect(receipt.boundaries.productionReadinessEstablished).toBe(false);
  });

  it('rejects a different family compiler lock before parsing compiler output', async () => {
    const changedLockDigest = 'a7'.repeat(32);
    expect(changedLockDigest).not.toBe(trackerReceipt.compilerLockDigestHex);
    const mocked = vi.spyOn(trackerCompilerV1, 'executePinnedFederatedJvmCompilerV1')
      .mockResolvedValueOnce({ ...execution, compilerLockDigestHex: changedLockDigest });
    try {
      await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(input))
        .rejects.toThrow('federated V3 tracker and family compiler locks differ');
      expect(mocked).toHaveBeenCalledTimes(1);
    } finally {
      mocked.mockRestore();
    }
  });

  it.each(roles)('rejects a forged %s source digest from compiler output', async role => {
    const lines = execution.output.trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    const index = roles.indexOf(role) + 1;
    const fields = lines[index]!.split('\t');
    expect(fields).toHaveLength(7);
    fields[2] = fields[2] === 'a7'.repeat(32) ? 'b7'.repeat(32) : 'a7'.repeat(32);
    lines[index] = fields.join('\t');
    const mocked = vi.spyOn(trackerCompilerV1, 'executePinnedFederatedJvmCompilerV1')
      .mockResolvedValueOnce({ ...execution, output: lines.join('\n') + '\n' });
    try {
      await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(input))
        .rejects.toThrow(role === 'pooledReserve'
          ? 'federated V3 reserve dependency binding drifted'
          : 'federated V3 predecessor source binding drifted');
      expect(mocked).toHaveBeenCalledTimes(1);
    } finally {
      mocked.mockRestore();
    }
  });

  it.each(['trackerReceipt', 'trackerRequest'] as const)(
    'rejects a rotating top-level %s getter without invoking it or the compiler', async key => {
      let getterReads = 0;
      const candidate: Record<string, unknown> = { ...input };
      Object.defineProperty(candidate, key, {
        enumerable: true, configurable: true,
        get() { getterReads += 1; return getterReads === 1 ? input[key] : structuredClone(input[key]); },
      });
      await rejectsBeforeCompiler(candidate as unknown as Input, /exact plain data fields/);
      expect(getterReads).toBe(0);
    },
  );

  it('rejects a rotating templates role getter before its first read', async () => {
    let getterReads = 0;
    const templates: Record<string, unknown> = { ...input.templates };
    Object.defineProperty(templates, 'pooledReserve', {
      enumerable: true, configurable: true,
      get() { getterReads += 1; return getterReads === 1 ? input.templates.pooledReserve : structuredClone(input.templates.pooledReserve); },
    });
    await rejectsBeforeCompiler({ ...input, templates } as Input, /exact plain data fields/);
    expect(getterReads).toBe(0);
  });

  it.each(['relativePath', 'source'] as const)(
    'rejects a rotating V7 %s getter before its first read', async key => {
      let getterReads = 0;
      const reserve: Record<string, unknown> = { ...input.templates.pooledReserve };
      Object.defineProperty(reserve, key, {
        enumerable: true, configurable: true,
        get() { getterReads += 1; return getterReads === 1 ? input.templates.pooledReserve[key] : 'forged'; },
      });
      await rejectsBeforeCompiler({ ...input, templates: { ...input.templates, pooledReserve: reserve } } as Input,
        /exact plain data fields/);
      expect(getterReads).toBe(0);
    },
  );

  it('rejects cloned and mismatched V2 tracker evidence before family compilation', async () => {
    await rejectsBeforeCompiler({ ...input, trackerReceipt: structuredClone(trackerReceipt) },
      /lacks process provenance/);
    const changedRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
      trackerGenesisInputBoxIdHex: '9d'.repeat(32),
      profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile),
      application: structuredClone(identityV1.application),
    });
    await rejectsBeforeCompiler({ ...input, trackerRequest: changedRequest }, /request binding drifted/);
  });

  it('rejects a changed V7 template SHA before family compilation', async () => {
    await rejectsBeforeCompiler({ ...input, templates: {
      ...input.templates,
      pooledReserve: { ...input.templates.pooledReserve,
        source: input.templates.pooledReserve.source + '\n// changed V7 template\n' },
    } }, /V3 template SHA-256 drifted/);
  });

  it('rejects duplicate singleton IDs before family compilation', async () => {
    await rejectsBeforeCompiler({ ...input,
      duplicatePreventionGenesisInputBoxIdHex: trackerRequest.trackerNftIdHex,
    }, /pairwise distinct/);
    await rejectsBeforeCompiler({ ...input,
      pooledReserveGenesisInputBoxIdHex: input.duplicatePreventionGenesisInputBoxIdHex,
    }, /pairwise distinct/);
  });

  it('keeps the pre-await snapshot when caller-owned references and templates change', async () => {
    const mutable = { ...input, templates: structuredClone(input.templates) } as {
      -readonly [K in keyof Input]: Input[K];
    };
    const mocked = vi.spyOn(trackerCompilerV1, 'executePinnedFederatedJvmCompilerV1')
      .mockResolvedValueOnce(execution);
    try {
      const pending = compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(mutable);
      mutable.trackerReceipt = structuredClone(trackerReceipt);
      mutable.trackerRequest = structuredClone(trackerRequest);
      mutable.duplicatePreventionGenesisInputBoxIdHex = '10'.repeat(32);
      mutable.pooledReserveGenesisInputBoxIdHex = '11'.repeat(32);
      for (const role of roles) {
        (mutable.templates[role] as { source: string }).source += '\n// caller mutation\n';
      }
      const snapshotReceipt = await pending;
      expect(mocked).toHaveBeenCalledTimes(1);
      expect(snapshotReceipt).toEqual(receipt);
      expect(assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3(snapshotReceipt, input))
        .toBe(snapshotReceipt);
      expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3(snapshotReceipt, mutable))
        .toThrow();
    } finally {
      mocked.mockRestore();
    }
  });
});

async function rejectsBeforeCompiler(value: Input, predicate: RegExp) {
  const compiler = vi.spyOn(trackerCompilerV1, 'executePinnedFederatedJvmCompilerV1');
  try {
    await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(value))
      .rejects.toThrow(predicate);
    expect(compiler).not.toHaveBeenCalled();
  } finally {
    compiler.mockRestore();
  }
}

function template(relativePath: string) {
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
