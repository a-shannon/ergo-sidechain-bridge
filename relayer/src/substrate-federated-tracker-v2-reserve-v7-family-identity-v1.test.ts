import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  assertPinnedSubstrateFederatedTrackerV2ReserveV7FamilyFixtureV1,
  SUBSTRATE_FEDERATED_TRACKER_V2_RESERVE_V7_RECEIPT_SHA256_HEX,
  validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1,
  type ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
} from './substrate-federated-tracker-v2-reserve-v7-family-identity-v1.js';

const root = resolve(import.meta.dirname, '..', '..');
const roles = ['tracker', 'duplicatePrevention', 'sourceLock', 'pooledReserve'] as const;
const paths = [
  'contracts/SPVTrackerSubstrateFederatedV2.es',
  'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  'contracts/MainChainLockPooledReserveV6.es',
  'contracts/MainChainPooledReserveValidityApplicationV7.es',
] as const;
const receiptPath =
  'relayer/test-vectors/substrate-federated-tracker-v2-reserve-v7-family-compiler-receipt-v1.json';
const intentPath =
  'relayer/test-vectors/substrate-federated-tracker-v2-reserve-v7-family-compiler-intent-v1.json';
const admissionPath = 'relayer/test-vectors/substrate-federated-v1-tracker-admission.json';
const familyDomain = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1';
const expectedIds = [
  '9e9a4bc54640a35299110f9870b8ffab6d7ed5a64cb39dbe323d805caaa91da7',
  '0b9403ef836effe2a402fd85fb006ee1dd3805dacfe470a384185267fd1ef2de',
  '36aa9030eb5fc45dbcac71b75dc717aadc023a23981fd051708d11a6b1908de2',
  'cd987d5a77ee19f2fa3894d4d2265207156638a40fbdaefe85f3d512b38fc320',
] as const;

type MutableReceipt = Record<string, unknown> & {
  contracts: Record<string, unknown>[];
  familyProfileHex: string;
  familyIdHex: string;
};

function loadInput(): ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input {
  return {
    receiptBytes: readFileSync(resolve(root, receiptPath)),
    intentBytes: readFileSync(resolve(root, intentPath)),
    admissionBytes: readFileSync(resolve(root, admissionPath)),
    templates: roles.map((role, index) => ({
      role,
      relativePath: paths[index],
      sourceBytes: readFileSync(resolve(root, paths[index])),
    })),
  };
}

function mutateReceipt(input: ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
  edit: (receipt: MutableReceipt) => void): Buffer {
  const receipt = JSON.parse(Buffer.from(input.receiptBytes).toString('utf8')) as MutableReceipt;
  edit(receipt);
  return Buffer.from(JSON.stringify(receipt, null, 2) + '\n', 'utf8');
}

function rebindProfile(receipt: MutableReceipt, offset: number): void {
  const bytes = Buffer.from(receipt.familyProfileHex, 'hex');
  bytes[offset] ^= 1;
  receipt.familyProfileHex = bytes.toString('hex');
  receipt.familyIdHex = Buffer.from(blakejs.blake2b(Buffer.concat([
    Buffer.from(familyDomain, 'ascii'), bytes,
  ]), undefined, 32)).toString('hex');
}

describe('static V2 tracker and V7 reserve family JVM identity', () => {
  it('pins the public receipt and validates the distinct four-contract family without runtime authority', () => {
    const input = loadInput();
    expect(createHash('sha256').update(input.receiptBytes).digest('hex'))
      .toBe(SUBSTRATE_FEDERATED_TRACKER_V2_RESERVE_V7_RECEIPT_SHA256_HEX);
    expect(input.receiptBytes.length).toBe(23_184);
    const identity =
      assertPinnedSubstrateFederatedTrackerV2ReserveV7FamilyFixtureV1(input);
    expect(identity.provenance).toBe('source-only-static-jvm-fixture');
    expect(identity.compilerIntentSha256Hex)
      .toBe('f1b153e054a00099d0d786a638a4191d4325fee3dda20595fd532360f392539a');
    expect(identity.trackerAnchorSelector).toBe('absolute-ergo-header-height');
    expect(identity.familyProfileHex.length).toBe(1192);
    expect(identity.familyIdHex)
      .toBe('9f03d6a02746b1d42c1d7b9f6108938dd1bdfc7aea14e4cc56c44cf88d96c756');
    expect(roles.map(role => identity.contracts[role].contractIdHex)).toEqual(expectedIds);
    expect(Object.values(identity.boundaries)).toEqual(Array(7).fill(false));
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.contracts.tracker)).toBe(true);
  });

  it.each(roles)('rejects %s template byte drift', role => {
    const input = loadInput();
    const templates = input.templates.map(template =>
      template.role === role
        ? { ...template, sourceBytes: Buffer.concat([template.sourceBytes, Buffer.from('\n')]) }
        : template);
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, templates,
    })).toThrow(/source SHA-256/);
  });

  it.each(roles)('rejects %s resolved-source SHA drift', role => {
    const input = loadInput();
    const index = roles.indexOf(role);
    const changed = mutateReceipt(input, receipt => {
      receipt.contracts[index].resolvedSourceSha256Hex = 'ab'.repeat(32);
    });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/resolved source pin/);
  });

  it.each(roles)('rejects %s proposition-byte corruption', role => {
    const input = loadInput();
    const index = roles.indexOf(role);
    const changed = mutateReceipt(input, receipt => {
      const proposition = receipt.contracts[index].propositionHex as string;
      receipt.contracts[index].propositionHex =
        (proposition.startsWith('00') ? '01' : '00') + proposition.slice(2);
    });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/proposition SHA-256/);
  });

  it.each(roles)('rejects coherent %s proposition forgery at the compiled pin', role => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => {
      const contract = receipt.contracts[roles.indexOf(role)];
      const proposition = Buffer.from(contract.propositionHex as string, 'hex');
      proposition[16] ^= 1;
      contract.propositionHex = proposition.toString('hex');
      contract.propositionSha256Hex = createHash('sha256').update(proposition).digest('hex');
      contract.contractIdHex = Buffer.from(blakejs.blake2b(proposition, undefined, 32))
        .toString('hex');
    });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(role + ' proposition pin drifted');
  });

  it.each(roles)('rejects %s proposition length drift', role => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => {
      const contract = receipt.contracts[roles.indexOf(role)];
      contract.propositionBytes = (contract.propositionBytes as number) + 1;
    });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/proposition/);
  });

  it.each(roles)('rejects %s proposition digest drift', role => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => {
      receipt.contracts[roles.indexOf(role)].propositionSha256Hex = 'ab'.repeat(32);
    });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/proposition SHA-256/);
  });

  it.each(roles)('rejects %s contract-ID drift', role => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => {
      receipt.contracts[roles.indexOf(role)].contractIdHex = 'ab'.repeat(32);
    });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/proposition contract ID/);
  });

  it.each([
    ['tracker NFT', 280],
    ['DUP NFT', 312],
    ['reserve NFT', 344],
    ['tracker contract ID', 376],
    ['tracker template', 408],
    ['DUP template', 440],
    ['source-lock template', 472],
    ['V7 reserve template', 504],
    ['minimum fee', 555],
    ['maximum fee', 563],
  ] as const)('rejects profile %s drift even when its family ID is recomputed', (_label, offset) => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => rebindProfile(receipt, offset));
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/family profile bindings/);
  });

  it('rejects a mismatched family ID', () => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => { receipt.familyIdHex = 'aa'.repeat(32); });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/family ID/);
  });

  it.each([
    'profileActivated', 'nodeCheckPerformed', 'signingAuthorityEstablished',
    'submissionAuthorityEstablished', 'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished', 'gate5Closed',
  ] as const)('rejects promoted %s authority', field => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => { receipt[field] = true; });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow(/must keep/);
  });

  it.each(['extra', 'missing', 'child-extra', 'role-order', 'role-duplicate', 'script-version',
    'selector'] as const)('rejects %s structural drift', kind => {
    const input = loadInput();
    const changed = mutateReceipt(input, receipt => {
      if (kind === 'extra') receipt.unreviewed = true;
      if (kind === 'missing') delete receipt.sbtVersion;
      if (kind === 'child-extra') receipt.contracts[0].unreviewed = true;
      if (kind === 'role-order') receipt.contracts.reverse();
      if (kind === 'role-duplicate') receipt.contracts[1].role = 'tracker';
      if (kind === 'script-version') receipt.contracts[0].scriptVersion = 4;
      if (kind === 'selector') receipt.trackerAnchorSelector = 'latest';
    });
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    })).toThrow();
  });

  it('rejects malformed encoding, duplicate keys and a changed intent pin', () => {
    const input = loadInput();
    const receipt = Buffer.from(input.receiptBytes);
    const malformed = Buffer.from(receipt);
    malformed[0] = 0xff;
    const duplicate = Buffer.from(receipt.toString('utf8').replace('{\n',
      '{\n  "schema": "duplicate",\n'), 'utf8');
    const crlf = Buffer.from(receipt.toString('utf8').replace('\n', '\r\n'), 'utf8');
    for (const invalid of [
      malformed, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), receipt]),
      duplicate, crlf,
    ]) {
      expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
        ...input, receiptBytes: invalid,
      })).toThrow();
    }
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, intentBytes: Buffer.concat([input.intentBytes, Buffer.from('\n')]),
    })).toThrow(/intent SHA-256/);
  });

  it('rejects old V1 and V2 three-contract compiler batches and the V6 reserve template', () => {
    const input = loadInput();
    for (const path of [
      'relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json',
      'relayer/test-vectors/substrate-federated-v2-settlement-family-compiler-v1.json',
    ]) {
      expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
        ...input, receiptBytes: readFileSync(resolve(root, path)),
      })).toThrow();
    }
    const templates = [...input.templates];
    templates[3] = {
      ...templates[3],
      sourceBytes: readFileSync(resolve(root,
        'contracts/MainChainPooledReserveValidityApplicationV6.es')),
    };
    expect(() => validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, templates,
    })).toThrow(/source SHA-256/);
  });

  it('keeps exact fixture pin separate from semantic source-only validation', () => {
    const input = loadInput();
    const changed = Buffer.from(input.receiptBytes.toString().replace('\n', ' \n'));
    expect(validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1({
      ...input, receiptBytes: changed,
    }).familyIdHex).toBe('9f03d6a02746b1d42c1d7b9f6108938dd1bdfc7aea14e4cc56c44cf88d96c756');
    expect(() => assertPinnedSubstrateFederatedTrackerV2ReserveV7FamilyFixtureV1({
      ...input, receiptBytes: changed,
    })).toThrow(/frozen V7 compiler fixture SHA-256/);
  });
});
