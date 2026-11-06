import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { createFederatedReferenceReleaseEvidenceV1 as create, validateFederatedReferenceReleaseEvidenceV1 as validate, parseFederatedReferenceReleaseEvidenceV1 as parse } from './federated-reference-release-evidence-v1.js';

const candidate = { bridgeCommit: 'a'.repeat(40), bridgeTree: 'b'.repeat(40) };
const reportDomain = 'E2S_FEDERATED_REFERENCE_RELEASE_EVIDENCE_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_TERMINAL_V1';
const resultDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1';
function resign(value: Record<string, any>, domain = reportDomain): void {
  const { receiptDigestHex: _old, ...body } = value;
  value.receiptDigestHex = sha256CanonicalJson(body, domain);
}
function report(): Record<string, any> { return structuredClone(create(candidate)); }

// Public synthetic receipt shapes; these fixtures are not node, launcher or custody evidence.
function parent(): Record<string, any> {
  const cycle = (seed: number) => {
    const id = (offset: number) => (seed + offset).toString(16).padStart(2, '0').repeat(32);
    return {
      pegIn: { sourceLockTransactionIdHex: id(0), reserveTransitionTransactionIdHex: id(1), sourceLockBoxIdHex: id(2), reserveSuccessorBoxIdHex: id(3), mintIdentityHex: `0x${id(4)}`, sourceProofReceiptDigestHex: id(5) },
      mintIdentityHex: `0x${id(4)}`, sourceProofReceiptDigestHex: id(5), amountNanoErg: '20000000',
      burnGrossAmountNanoErg: '15000000', burnNetAmountNanoErg: '10000000',
      trackerTransactionIdHex: id(6), payoutTransactionIdHex: id(7), payoutAmountNanoErg: '10000000',
    };
  };
  const result: Record<string, any> = {
    schema: 'e2s.substrate-federated-native-two-cycle-result.v1', version: 1, status: 'two_cycle_local_synthetic_execution_completed', rootResultDigestHex: 'c'.repeat(64),
    genesis: { nativeGenesisHashHex: `0x${'10'.repeat(32)}`, typedGenesisSha256Hex: '11'.repeat(32), rawSpecSha256Hex: '12'.repeat(32), runtimeProfileIdHex: '13'.repeat(32), familyIdHex: '14'.repeat(32), sourceProofProfileIdHex: '15'.repeat(32), nodeSha256Hex: '16'.repeat(32), wasmSha256Hex: '17'.repeat(32), operatorAddressHex: `0x${'18'.repeat(20)}`, storageKeysChecked: 6 },
    issuance: { inputBoxIds: ['21','22','23'].map(x => x.repeat(32)), transactionIds: ['31','32','33'].map(x => x.repeat(32)), confirmationHeights: [100,101,102] },
    firstCycle: cycle(64), secondCycle: cycle(96),
    checks: { completedCycles: 2, nativeAndErgoCleanupCompletedBeforeReturn: true, cycleIdentitiesDistinct: true, createOnlyWorkerTransportRequired: true },
    boundaries: { fixedSyntheticLoopbackProfile: true, trustedHostAndCachesRequired: true, independentlyReproducibleBuildEstablished: false, independentOperatorCustodyEstablished: false, publicNetworkUsed: false, realFundsUsed: false, releaseReadinessEstablished: false, productionReadinessEstablished: false },
  };
  resign(result, resultDomain);
  const value: Record<string, any> = {
    schema: 'e2s.substrate-federated-native-two-cycle-terminal.v1', version: 1, status: 'two_cycle_local_synthetic_execution_completed',
    configSha256Hex: 'd'.repeat(64), ...candidate, pathIdentityDigestHex: 'e'.repeat(64), toolIdentityDigestHex: 'f'.repeat(64), result,
    checks: { startRecordedBeforeWorkerLaunch: true, workerExitedCleanlyWithoutOutput: true, workerTransportValidated: true, repositoryAndToolsRevalidatedAfterRootCleanup: true, terminalArtifactCreatedOnce: true },
    boundaries: { localSyntheticExecutionOnly: true, trustedHostAndCachesRequired: true, parentRuntimeAttestedBeforeInitialTsxLoad: false, independentOperatorCustodyEstablished: false, releaseReadinessEstablished: false, productionReadinessEstablished: false },
  };
  resign(value, parentDomain); return value;
}

describe('FED reference preparation evidence V1', () => {
  it('creates a canonical blocked report without claiming a missing parent', () => {
    const value = create(candidate);
    expect(parse(`${canonicalJson(value)}\n`)).toEqual(value);
    expect(value.parentResult).toBeNull();
    expect(value.checks.publicParentResultValidated).toBe(false);
    expect(value.releaseStatus).toBe('BLOCKED');
    expect(Object.values(value.claims).every(value => value === false)).toBe(true);
    expect(value.openObligations).toHaveLength(6);
  });
  it('replays the actual parent and projected result codecs, retaining every final claim false', () => {
    const value = create(candidate, parent());
    expect(validate(value).checks.publicParentResultValidated).toBe(true);
    expect(value.claims.lifecycleEstablished).toBe(false);
    expect(value.releaseStatus).toBe('BLOCKED');
  });
  it.each(['schema','version','settlementProfileId','evidencePurpose','environment','releaseStatus'])('rejects rehashed incompatible %s', field => {
    const value = report(); value[field] = 'other'; resign(value);
    expect(() => validate(value)).toThrow();
  });
  it.each(Object.keys(create(candidate).claims))('rejects the rehashed escalated %s claim', field => {
    const value = report(); value.claims[field] = true; resign(value);
    expect(() => validate(value)).toThrow();
  });
  it.each([true, 'false', 0, null])('rejects an absent parent with incorrect derived validation %s', value => {
    const altered = report(); altered.checks.publicParentResultValidated = value; resign(altered);
    expect(() => validate(altered)).toThrow();
  });
  it.each(['bridgeCommit','bridgeTree'])('rejects parent %s drift even after parent rehash', field => {
    const value = parent(); value[field] = '1'.repeat(40); resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow('candidate differs');
  });
  it.each(['schema','status','version'])('rejects a failure relabel or changed parent %s', field => {
    const value = parent(); value[field] = 'execution_failure'; resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow('identity differs');
  });
  it.each(['configSha256Hex','pathIdentityDigestHex','toolIdentityDigestHex'])('rejects malformed parent %s', field => {
    const value = parent(); value[field] = 'xx'; resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow();
  });
  it.each(Object.keys(parent().checks))('rejects changed parent check %s', field => {
    const value = parent(); value.checks[field] = 'true'; resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow('checks differ');
  });
  it.each(Object.keys(parent().boundaries))('rejects changed parent boundary %s', field => {
    const value = parent(); value.boundaries[field] = !value.boundaries[field]; resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow('boundaries differ');
  });
  it('rejects a missing cycle with valid enclosing digests', () => {
    const value = parent(); delete value.result.secondCycle; resign(value.result, resultDomain); resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow();
  });
  it('rejects recycled cycle identities with both digests recomputed', () => {
    const value = parent(); value.result.secondCycle.trackerTransactionIdHex = value.result.firstCycle.trackerTransactionIdHex;
    resign(value.result, resultDomain); resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow('identities or conservation');
  });
  it('rejects a corrupt inner result despite a valid parent digest', () => {
    const value = parent(); value.result.receiptDigestHex = '0'.repeat(64); resign(value, parentDomain);
    expect(() => create(candidate, value)).toThrow('result digest differs');
  });
  it('rejects a corrupt parent digest', () => {
    const value = parent(); value.receiptDigestHex = '0'.repeat(64);
    expect(() => create(candidate, value)).toThrow('parent canonical digest differs');
  });
  it('rejects removed or reordered obligations independently of the report digest', () => {
    const removed = report(); removed.openObligations.pop(); resign(removed);
    expect(() => validate(removed)).toThrow();
    const reordered = report(); reordered.openObligations.reverse(); resign(reordered);
    expect(() => validate(reordered)).toThrow();
  });
  it('rejects extra and missing report keys', () => {
    const extra = report(); extra.extra = true; resign(extra); expect(() => validate(extra)).toThrow();
    const missing = report(); delete missing.claims; resign(missing); expect(() => validate(missing)).toThrow();
  });
  it('rejects wrong digest domain and noncanonical bytes separately', () => {
    const value = report(); resign(value, 'OTHER'); expect(() => validate(value)).toThrow();
    expect(() => parse(JSON.stringify(create(candidate)))).toThrow('canonical JSON');
    expect(() => parse(`${canonicalJson(create(candidate))}\r\n`)).toThrow('canonical JSON');
  });
  it('refuses duplicate JSON fields before parsing their replacement', () => {
    expect(() => parse('{"schema":"x","schema":"y"}\n')).toThrow('duplicate JSON');
  });
  it('refuses getters and proxies without executing either', () => {
    let effects = 0;
    const getter = { get schema() { effects++; return 'x'; } };
    expect(() => validate(getter)).toThrow('accessor');
    const proxy = new Proxy({}, { ownKeys() { effects++; return []; }, getPrototypeOf() { effects++; return null; } });
    expect(() => validate(proxy)).toThrow('plain JSON'); expect(effects).toBe(0);
  });
  it('refuses sparse arrays, aliases, cycles and oversized graphs', () => {
    const sparse = report(); sparse.openObligations = new Array(6); expect(() => validate(sparse)).toThrow('holes');
    const cyclic: any = {}; cyclic.self = cyclic; expect(() => validate(cyclic)).toThrow('aliases or cycles');
    const leaf = {}; expect(() => validate({a: leaf, b: leaf})).toThrow('aliases or cycles');
    expect(() => parse(' '.repeat(65537))).toThrow('bounded size');
  });
});
