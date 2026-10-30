import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  resolvePinnedSubstrateFederatedSettlementFamilyV2Sources,
} from './substrate-federated-settlement-family-v2.js';
import type {
  ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
} from './substrate-federated-tracker-v2-reserve-v7-family-identity-v1.js';

const root = resolve(import.meta.dirname, '..', '..');
const roles = ['tracker', 'duplicatePrevention', 'sourceLock', 'pooledReserve'] as const;
const paths = [
  'contracts/SPVTrackerSubstrateFederatedV2.es',
  'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  'contracts/MainChainLockPooledReserveV6.es',
  'contracts/MainChainPooledReserveValidityApplicationV7.es',
] as const;
const expectedSources = [
  '015e7f3c82895ded29432b90395dd86a273a4108d3fcea7e6d304d23ed3551f4',
  'c7450301980d2fe0a42de4604d06936bc765a7a3bc57231b3b93a108c2441569',
  'f71a6c1eb975e5db121f60cf276a76e9a7bb2c2b412e0edfff77414613d75013',
  'e1b0f3e360a7d5d0fcf4699704c50015dcf529ed4777721ce19868ed352d3bb3',
] as const;
const expectedIds = [
  '9e9a4bc54640a35299110f9870b8ffab6d7ed5a64cb39dbe323d805caaa91da7',
  '0b9403ef836effe2a402fd85fb006ee1dd3805dacfe470a384185267fd1ef2de',
  '36aa9030eb5fc45dbcac71b75dc717aadc023a23981fd051708d11a6b1908de2',
  'cd987d5a77ee19f2fa3894d4d2265207156638a40fbdaefe85f3d512b38fc320',
] as const;

function fixture(): ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input {
  return {
    receiptBytes: readFileSync(resolve(root,
      'relayer/test-vectors/substrate-federated-tracker-v2-reserve-v7-family-compiler-receipt-v1.json')),
    intentBytes: readFileSync(resolve(root,
      'relayer/test-vectors/substrate-federated-tracker-v2-reserve-v7-family-compiler-intent-v1.json')),
    admissionBytes: readFileSync(resolve(root,
      'relayer/test-vectors/substrate-federated-v1-tracker-admission.json')),
    templates: roles.map((role, index) => ({
      role,
      relativePath: paths[index],
      sourceBytes: readFileSync(resolve(root, paths[index])),
    })),
  };
}

function forgedReceipt(
  input: ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
  mutate: (receipt: Record<string, unknown> & { contracts: Record<string, unknown>[] }) => void,
): Buffer {
  const receipt = JSON.parse(Buffer.from(input.receiptBytes).toString('utf8')) as
    Record<string, unknown> & { contracts: Record<string, unknown>[] };
  mutate(receipt);
  return Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
}

describe('pinned V2 tracker and V7 reserve source family', () => {
  it('exposes the ordered fully resolved static sources and 596-byte profile', () => {
    const input = fixture();
    const result = resolvePinnedSubstrateFederatedSettlementFamilyV2Sources(input);
    expect(result.provenance).toBe('source-only-pinned-static-jvm-fixture');
    expect(result.receiptSha256Hex)
      .toBe('a48a49ead2b1072bdb46acd42fa7a735be94e01a0696a15a3c51e32bbead6db6');
    expect(result.familyProfileHex.length / 2).toBe(596);
    expect(result.familyIdHex)
      .toBe('9f03d6a02746b1d42c1d7b9f6108938dd1bdfc7aea14e4cc56c44cf88d96c756');
    expect(result.contracts.map(contract => contract.role)).toEqual(roles);
    expect(result.contracts.map(contract => contract.relativePath)).toEqual(paths);
    expect(result.contracts.map(contract => contract.resolvedSourceSha256Hex)).toEqual(expectedSources);
    expect(result.contracts.map(contract => contract.contractIdHex)).toEqual(expectedIds);
    for (const contract of result.contracts) {
      expect(createHash('sha256').update(contract.source, 'ascii').digest('hex'))
        .toBe(contract.resolvedSourceSha256Hex);
      expect(contract.source).not.toMatch(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/);
      expect(Object.isFrozen(contract)).toBe(true);
    }
    expect(Object.values(result.boundaries).every(value => value === false)).toBe(true);
    expect(Object.isFrozen(result.contracts)).toBe(true);
  });

  it.each([
    [0, 'contracts/SPVTrackerSubstrateFederatedV1.es'],
    [2, 'contracts/MainChainLockPooledReserveV7.es'],
    [3, 'contracts/MainChainPooledReserveValidityApplicationV6.es'],
  ] as const)('rejects an isolated wrong family template path at role %i', (index, wrongPath) => {
    const input = fixture();
    const templates = input.templates.map((template, position) =>
      position === index ? { ...template, relativePath: wrongPath } : template);
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, templates,
    })).toThrow(/template role or path/);
  });

  it('rejects an oversized receipt before copying its bytes', () => {
    const input = fixture();
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, receiptBytes: Buffer.alloc(32 * 1024 + 1, 0x61),
    })).toThrow(/receipt byte length is outside the fixture bound/);
  });

  it('rejects an oversized template before copying its bytes', () => {
    const input = fixture();
    const templates = input.templates.map((template, index) => index === 3
      ? { ...template, sourceBytes: Buffer.alloc(64 * 1024 + 1, 0x61) }
      : template);
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, templates,
    })).toThrow(/pooledReserve byte length/);
  });

  it('rejects reordered template roles before fixture validation', () => {
    const input = fixture();
    const templates = [...input.templates];
    [templates[1], templates[2]] = [templates[2], templates[1]];
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, templates,
    })).toThrow(/template role or path/);
  });

  it.each(roles)('rejects isolated %s template byte drift', role => {
    const input = fixture();
    const templates = input.templates.map(template => template.role === role
      ? { ...template, sourceBytes: Buffer.concat([template.sourceBytes, Buffer.from('\n')]) }
      : template);
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, templates,
    })).toThrow(/source SHA-256/);
  });

  it.each(roles)('rejects coherent forged %s compiled proposition', role => {
    const input = fixture();
    const receiptBytes = forgedReceipt(input, receipt => {
      const contract = receipt.contracts[roles.indexOf(role)];
      const proposition = Buffer.from(contract.propositionHex as string, 'hex');
      proposition[16] ^= 1;
      contract.propositionHex = proposition.toString('hex');
      contract.propositionSha256Hex = createHash('sha256').update(proposition).digest('hex');
      contract.contractIdHex = Buffer.from(blakejs.blake2b(proposition, undefined, 32))
        .toString('hex');
    });
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, receiptBytes,
    })).toThrow(/proposition pin drifted/);
  });

  it('rejects a V1/V6 predecessor ID substitution even with the V7 source bytes', () => {
    const input = fixture();
    const receiptBytes = forgedReceipt(input, receipt => {
      receipt.contracts[1].contractIdHex =
        '3a3c8f40d4901b8ae30a5b6a43c001127bcf8d4cb6a3e89bc1b075620b7683e4';
    });
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, receiptBytes,
    })).toThrow(/proposition contract ID/);
  });

  it('does not accept a caller-modified profile or family ID', () => {
    const input = fixture();
    const receiptBytes = forgedReceipt(input, receipt => {
      const profile = Buffer.from(receipt.familyProfileHex as string, 'hex');
      profile[504] ^= 1;
      receipt.familyProfileHex = profile.toString('hex');
      receipt.familyIdHex = Buffer.from(blakejs.blake2b(Buffer.concat([
        Buffer.from('E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1', 'ascii'),
        profile,
      ]), undefined, 32)).toString('hex');
    });
    expect(() => resolvePinnedSubstrateFederatedSettlementFamilyV2Sources({
      ...input, receiptBytes,
    })).toThrow(/family profile bindings/);
  });
});
