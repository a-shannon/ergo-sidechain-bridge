import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import type { SubstrateFederatedNativeTwoCycleResultV1 } from './substrate-federated-native-two-cycle-invocation-v1.js';

export function validateSubstrateFederatedNativeTwoCycleResultV1(
  value: unknown,
): Readonly<SubstrateFederatedNativeTwoCycleResultV1> {
  const result = exactRecord(value, [
    'schema', 'version', 'status', 'rootResultDigestHex', 'genesis',
    'issuance', 'firstCycle', 'secondCycle', 'checks', 'boundaries',
    'receiptDigestHex',
  ], 'native two-cycle projected result');
  if (
    result.schema !== 'e2s.substrate-federated-native-two-cycle-result.v1'
    || result.version !== 1
    || result.status !== 'two_cycle_local_synthetic_execution_completed'
  ) throw new Error('native two-cycle projected result identity differs');
  lowerHex(result.rootResultDigestHex, 32, 'root result digest');
  const genesis = exactRecord(result.genesis, [
    'nativeGenesisHashHex', 'typedGenesisSha256Hex', 'rawSpecSha256Hex',
    'runtimeProfileIdHex', 'familyIdHex', 'sourceProofProfileIdHex',
    'nodeSha256Hex', 'wasmSha256Hex', 'operatorAddressHex',
    'storageKeysChecked',
  ], 'projected genesis');
  for (const key of [
    'nativeGenesisHashHex', 'typedGenesisSha256Hex', 'rawSpecSha256Hex',
    'runtimeProfileIdHex', 'familyIdHex', 'sourceProofProfileIdHex',
    'nodeSha256Hex', 'wasmSha256Hex',
  ]) flexibleHex(genesis[key], 32, `projected genesis ${key}`);
  flexibleHex(genesis.operatorAddressHex, 20, 'projected operator address');
  positiveSafeInteger(genesis.storageKeysChecked, 'projected storage key count');
  const issuance = exactRecord(result.issuance, [
    'inputBoxIds', 'transactionIds', 'confirmationHeights',
  ], 'projected issuance');
  const inputBoxIds = hexArray(issuance.inputBoxIds, 3, 'projected issuance inputs');
  const transactionIds = hexArray(
    issuance.transactionIds,
    3,
    'projected issuance transactions',
  );
  if (
    !Array.isArray(issuance.confirmationHeights)
    || issuance.confirmationHeights.length !== 3
    || issuance.confirmationHeights.some(value => !Number.isSafeInteger(value) || value <= 0)
    || inputBoxIds.length !== transactionIds.length
  ) throw new Error('projected issuance confirmation heights differ');
  const firstCycle = projectedCycle(result.firstCycle, 'projected first cycle');
  const secondCycle = projectedCycle(result.secondCycle, 'projected second cycle');
  if (
    firstCycle.mintIdentityHex === secondCycle.mintIdentityHex
    || firstCycle.trackerTransactionIdHex === secondCycle.trackerTransactionIdHex
    || firstCycle.payoutTransactionIdHex === secondCycle.payoutTransactionIdHex
    || firstCycle.amountNanoErg !== '20000000'
    || secondCycle.amountNanoErg !== firstCycle.amountNanoErg
    || firstCycle.burnGrossAmountNanoErg !== '15000000'
    || secondCycle.burnGrossAmountNanoErg !== firstCycle.burnGrossAmountNanoErg
    || firstCycle.burnNetAmountNanoErg !== '10000000'
    || secondCycle.burnNetAmountNanoErg !== firstCycle.burnNetAmountNanoErg
    || firstCycle.payoutAmountNanoErg !== firstCycle.burnNetAmountNanoErg
    || secondCycle.payoutAmountNanoErg !== secondCycle.burnNetAmountNanoErg
  ) throw new Error('projected two-cycle identities or conservation differ');
  const checks = exactRecord(result.checks, [
    'completedCycles', 'nativeAndErgoCleanupCompletedBeforeReturn',
    'cycleIdentitiesDistinct', 'createOnlyWorkerTransportRequired',
  ], 'projected result checks');
  if (
    checks.completedCycles !== 2
    || checks.nativeAndErgoCleanupCompletedBeforeReturn !== true
    || checks.cycleIdentitiesDistinct !== true
    || checks.createOnlyWorkerTransportRequired !== true
  ) throw new Error('projected two-cycle checks differ');
  const boundaries = exactRecord(result.boundaries, [
    'fixedSyntheticLoopbackProfile', 'trustedHostAndCachesRequired',
    'independentlyReproducibleBuildEstablished',
    'independentOperatorCustodyEstablished', 'publicNetworkUsed',
    'realFundsUsed', 'releaseReadinessEstablished',
    'productionReadinessEstablished',
  ], 'projected result boundaries');
  if (
    boundaries.fixedSyntheticLoopbackProfile !== true
    || boundaries.trustedHostAndCachesRequired !== true
    || boundaries.independentlyReproducibleBuildEstablished !== false
    || boundaries.independentOperatorCustodyEstablished !== false
    || boundaries.publicNetworkUsed !== false
    || boundaries.realFundsUsed !== false
    || boundaries.releaseReadinessEstablished !== false
    || boundaries.productionReadinessEstablished !== false
  ) throw new Error('projected two-cycle boundaries differ');
  const { receiptDigestHex, ...body } = result;
  if (
    lowerHex(receiptDigestHex, 32, 'projected result digest')
      !== sha256CanonicalJson(body, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1')
  ) throw new Error('native two-cycle projected result digest differs');
  assertNoLocalPath(result);
  return result as unknown as Readonly<SubstrateFederatedNativeTwoCycleResultV1>;
}

function projectedCycle(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const cycle = exactRecord(value, [
    'pegIn', 'mintIdentityHex', 'sourceProofReceiptDigestHex',
    'amountNanoErg', 'burnGrossAmountNanoErg', 'burnNetAmountNanoErg',
    'trackerTransactionIdHex', 'payoutTransactionIdHex',
    'payoutAmountNanoErg',
  ], label);
  const pegIn = exactRecord(cycle.pegIn, [
    'sourceLockTransactionIdHex', 'reserveTransitionTransactionIdHex',
    'sourceLockBoxIdHex', 'reserveSuccessorBoxIdHex', 'mintIdentityHex',
    'sourceProofReceiptDigestHex',
  ], `${label} peg-in`);
  for (const [key, field] of Object.entries(pegIn)) {
    flexibleHex(field, 32, `${label} peg-in ${key}`);
  }
  for (const key of [
    'mintIdentityHex', 'sourceProofReceiptDigestHex',
    'trackerTransactionIdHex', 'payoutTransactionIdHex',
  ]) flexibleHex(cycle[key], 32, `${label} ${key}`);
  if (
    cycle.mintIdentityHex !== pegIn.mintIdentityHex
    || cycle.sourceProofReceiptDigestHex !== pegIn.sourceProofReceiptDigestHex
  ) throw new Error(`${label} differs from its peg-in`);
  for (const key of [
    'amountNanoErg', 'burnGrossAmountNanoErg', 'burnNetAmountNanoErg',
    'payoutAmountNanoErg',
  ]) canonicalDecimal(cycle[key], `${label} ${key}`);
  return cycle;
}
function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be one object`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))
  ) throw new Error(`${label} fields differ from V1`);
  return record;
}

function lowerHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) throw new Error(`${label} must be ${bytes} lowercase hexadecimal bytes`);
  return value;
}

function flexibleHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  lowerHex(normalized, bytes, label);
  return value;
}

function hexArray(value: unknown, length: number, label: string): string[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain exactly ${length} values`);
  }
  const result = value.map((item, index) => lowerHex(item, 32, `${label} ${index}`));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be distinct`);
  return result;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function canonicalDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,30}$/u.test(value)) {
    throw new Error(`${label} must be a positive canonical decimal`);
  }
  return value;
}

function assertNoLocalPath(value: unknown): void {
  const visit = (current: unknown): void => {
    if (
      typeof current === 'string'
      && (/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u.test(current)
        || /^(?:\\\\|\/\/|\\[?.]\\|\\Device\\)/iu.test(current))
    ) throw new Error('native two-cycle terminal data must not contain local paths');
    if (Array.isArray(current)) current.forEach(visit);
    else if (current !== null && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
}
