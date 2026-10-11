import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { validateSubstrateFederatedNativeTwoCycleResultV1 as validate } from './substrate-federated-native-two-cycle-result-codec-v1.js';

const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1';

describe('native two-cycle projected result V1 codec', () => {
  it('accepts the existing synthetic parent fixture without changing its identity or canonical bytes', () => {
    const result = projectedResult();
    const before = canonicalJson(result);
    expect(validate(result)).toBe(result);
    expect(canonicalJson(result)).toBe(before);
    expect(result.firstCycle.amountNanoErg).toBe('20000000');
    expect(result.firstCycle.burnGrossAmountNanoErg).toBe('15000000');
    expect(result.firstCycle.burnNetAmountNanoErg).toBe('10000000');
    expect(result.firstCycle.payoutAmountNanoErg).toBe('10000000');
  });

  it.each([
    ['schema', 'other'], ['version', 2], ['status', 'failed'],
  ] as const)('rejects changed result identity %s before digest validation', (field, value) => {
    const result = mutableResult();
    result[field] = value;
    resign(result);
    expect(() => validate(result)).toThrow('native two-cycle projected result identity differs');
  });

  it.each(['mintIdentityHex', 'trackerTransactionIdHex', 'payoutTransactionIdHex'] as const)(
    'rejects a repeated cross-cycle %s with a valid digest', field => {
      const result = mutableResult();
      result.secondCycle[field] = result.firstCycle[field];
      if (field === 'mintIdentityHex') result.secondCycle.pegIn[field] = result.firstCycle[field];
      resign(result);
      expect(() => validate(result)).toThrow('projected two-cycle identities or conservation differ');
    },
  );

  it.each(['firstCycle', 'secondCycle'] as const)('rejects each conservation amount in %s', cycle => {
    for (const field of ['amountNanoErg', 'burnGrossAmountNanoErg', 'burnNetAmountNanoErg', 'payoutAmountNanoErg']) {
      const result = mutableResult();
      result[cycle][field] = '1';
      resign(result);
      expect(() => validate(result), field).toThrow('projected two-cycle identities or conservation differ');
    }
  });

  it.each([
    'fixedSyntheticLoopbackProfile', 'trustedHostAndCachesRequired',
    'independentlyReproducibleBuildEstablished', 'independentOperatorCustodyEstablished',
    'publicNetworkUsed', 'realFundsUsed', 'releaseReadinessEstablished', 'productionReadinessEstablished',
  ])('rejects a flipped boundary %s with a valid digest', field => {
    const result = mutableResult();
    result.boundaries[field] = !result.boundaries[field];
    resign(result);
    expect(() => validate(result)).toThrow('projected two-cycle boundaries differ');
  });

  it.each([
    'completedCycles', 'nativeAndErgoCleanupCompletedBeforeReturn', 'cycleIdentitiesDistinct',
    'createOnlyWorkerTransportRequired',
  ])('rejects a changed completion check %s with a valid digest', field => {
    const result = mutableResult();
    result.checks[field] = field === 'completedCycles' ? 1 : false;
    resign(result);
    expect(() => validate(result)).toThrow('projected two-cycle checks differ');
  });

  it.each(['mintIdentityHex', 'sourceProofReceiptDigestHex'])('rejects broken peg-in binding %s', field => {
    const result = mutableResult();
    result.firstCycle.pegIn[field] = 'ff'.repeat(32);
    resign(result);
    expect(() => validate(result)).toThrow('projected first cycle differs from its peg-in');
  });

  it('rejects digest corruption and a different digest domain separately', () => {
    const result = mutableResult();
    result.receiptDigestHex = '00'.repeat(32);
    expect(() => validate(result)).toThrow('native two-cycle projected result digest differs');
    const { receiptDigestHex: _digest, ...body } = result;
    result.receiptDigestHex = sha256CanonicalJson(body, 'OTHER_DOMAIN');
    expect(() => validate(result)).toThrow('native two-cycle projected result digest differs');
  });

  it('rejects an extra or missing field without changing the old shape error', () => {
    const extra = mutableResult();
    extra.extra = true;
    resign(extra);
    expect(() => validate(extra)).toThrow('native two-cycle projected result fields differ from V1');
    const missing = mutableResult();
    delete missing.genesis.nodeSha256Hex;
    resign(missing);
    expect(() => validate(missing)).toThrow('projected genesis fields differ from V1');
  });

  it('rejects duplicate issuance identities and invalid confirmation heights separately', () => {
    const duplicate = mutableResult();
    duplicate.issuance.inputBoxIds[1] = duplicate.issuance.inputBoxIds[0];
    resign(duplicate);
    expect(() => validate(duplicate)).toThrow('projected issuance inputs must be distinct');
    const height = mutableResult();
    height.issuance.confirmationHeights[0] = 0;
    resign(height);
    expect(() => validate(height)).toThrow('projected issuance confirmation heights differ');
  });

  it('retains canonical decimal and fixed hexadecimal constraints', () => {
    const amount = mutableResult();
    amount.firstCycle.amountNanoErg = '020000000';
    resign(amount);
    expect(() => validate(amount)).toThrow('projected first cycle amountNanoErg must be a positive canonical decimal');
    const identity = mutableResult();
    identity.genesis.nodeSha256Hex = 'AA'.repeat(32);
    resign(identity);
    expect(() => validate(identity)).toThrow('projected genesis nodeSha256Hex must be 32 lowercase hexadecimal bytes');
  });
});

function mutableResult(): Record<string, any> {
  return structuredClone(projectedResult());
}

function resign(result: Record<string, any>): void {
  const { receiptDigestHex: _digest, ...body } = result;
  result.receiptDigestHex = sha256CanonicalJson(body, DOMAIN);
}

function projectedResult() {
  const projectedCycle = (seed: string) => ({
    pegIn: {
      sourceLockTransactionIdHex: seed.repeat(32),
      reserveTransitionTransactionIdHex: next(seed, 1).repeat(32),
      sourceLockBoxIdHex: next(seed, 2).repeat(32),
      reserveSuccessorBoxIdHex: next(seed, 3).repeat(32),
      mintIdentityHex: `0x${next(seed, 4).repeat(32)}`,
      sourceProofReceiptDigestHex: next(seed, 5).repeat(32),
    },
    mintIdentityHex: `0x${next(seed, 4).repeat(32)}`,
    sourceProofReceiptDigestHex: next(seed, 5).repeat(32),
    amountNanoErg: '20000000',
    burnGrossAmountNanoErg: '15000000',
    burnNetAmountNanoErg: '10000000',
    trackerTransactionIdHex: next(seed, 6).repeat(32),
    payoutTransactionIdHex: next(seed, 7).repeat(32),
    payoutAmountNanoErg: '10000000',
  });
  const body = {
    schema: 'e2s.substrate-federated-native-two-cycle-result.v1',
    version: 1,
    status: 'two_cycle_local_synthetic_execution_completed',
    rootResultDigestHex: '9'.repeat(64),
    genesis: {
      nativeGenesisHashHex: `0x${'10'.repeat(32)}`,
      typedGenesisSha256Hex: '11'.repeat(32),
      rawSpecSha256Hex: '12'.repeat(32),
      runtimeProfileIdHex: '13'.repeat(32),
      familyIdHex: '14'.repeat(32),
      sourceProofProfileIdHex: '15'.repeat(32),
      nodeSha256Hex: '16'.repeat(32),
      wasmSha256Hex: '17'.repeat(32),
      operatorAddressHex: `0x${'18'.repeat(20)}`,
      storageKeysChecked: 6,
    },
    issuance: {
      inputBoxIds: ['21', '22', '23'].map(seed => seed.repeat(32)),
      transactionIds: ['31', '32', '33'].map(seed => seed.repeat(32)),
      confirmationHeights: [100, 101, 102],
    },
    firstCycle: projectedCycle('40'),
    secondCycle: projectedCycle('60'),
    checks: {
      completedCycles: 2,
      nativeAndErgoCleanupCompletedBeforeReturn: true,
      cycleIdentitiesDistinct: true,
      createOnlyWorkerTransportRequired: true,
    },
    boundaries: {
      fixedSyntheticLoopbackProfile: true,
      trustedHostAndCachesRequired: true,
      independentlyReproducibleBuildEstablished: false,
      independentOperatorCustodyEstablished: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      releaseReadinessEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1',
    ),
  });
}

function next(seed: string, increment: number): string {
  return (Number.parseInt(seed, 16) + increment).toString(16).padStart(2, '0');
}
