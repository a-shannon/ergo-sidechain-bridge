import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from './strict-json.js';
import { getDupTreeDigest, getPooledReserveEmptyDigest } from './avl-bridge.js';
import { encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister, MINER_FEE } from './ergo-encoding.js';
import { getSubstrateFederatedTrackerDigestV1Hex } from './substrate-federated-burn-settlement-v1.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 } from './substrate-federated-genesis-issuance-materialization-v1.js';
import { SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SINGLETON_VALUE_NANOERG } from './substrate-federated-isolated-devnet-generation-v1.js';
import { normalizeEip12Box, type Eip12Box, type MaterializedUnsignedTransaction } from './unsigned-ergo-transaction.js';
import { VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS } from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance,
  type SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2,
} from './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1 } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  validateSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
  type SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
} from './substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance,
  type SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import {
  readSubstrateFederatedGenesisProfilesFromSessionV2,
  type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  buildSubstrateFederatedGenesisV1, prepareSubstrateFederatedGenesisV1,
  type PrepareSubstrateFederatedGenesisV1Input,
} from './substrate-federated-runtime-genesis-v1.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 } from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';

export interface CompileObservedSubstrateFederatedGenesisV1Input {
  readonly genesis: Omit<PrepareSubstrateFederatedGenesisV1Input, 'checkpointProfile' | 'mintProofProfile'>;
  readonly setupSigner: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2>;
  readonly sourceSession: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly ownedDiscovery: Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>;
  readonly history: Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2>;
}

export type ObservedSubstrateFederatedGenesisV1 = Awaited<ReturnType<typeof compileObservedSubstrateFederatedGenesisV1>>;

const COMPILED_GENESIS = new WeakMap<object, Readonly<{
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  assertCustody: () => Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
}>>();

/** Compile one candidate and its unsigned Ergo issuance transactions from live
 * custody. The caller still owns fresh node checks, authorization and issuance.
 */
export async function compileObservedSubstrateFederatedGenesisV1(
  input: Readonly<CompileObservedSubstrateFederatedGenesisV1Input>,
) {
  const { setupSigner, sourceSession, target, ownedDiscovery, history, genesis: suppliedGenesis } = exact(input,
    ['genesis', 'setupSigner', 'sourceSession', 'target', 'ownedDiscovery', 'history']);
  const genesis = exact(suppliedGenesis, ['bridgeRoot', 'launchDomainHex', 'evmChainId',
    'operatorAddressHex', 'bridgeAddressHex', 'tokenAddressHex', 'runtimeWasm',
    'expectedRuntimeWasmSha256Hex', 'endowments']);
  const assertCustody = () => {
    const { processBinding } = validateSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(ownedDiscovery, target);
    assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setupSigner);
    return { processBinding, profiles: readSubstrateFederatedGenesisProfilesFromSessionV2(sourceSession) };
  };
  const { profiles } = assertCustody();
  const discovery = ownedDiscovery.observation;
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance(history);
  if (profiles.checkpointProfile.ergoAdmissionThreshold !== 1
    || canonicalJson(profiles.checkpointProfile.ergoAdmissionPublicKeysHex)
      !== canonicalJson([setupSigner.publicKeyHex])) {
    throw new Error('observed FED genesis admission keys differ from retained setup custody');
  }
  const observedSigner = discovery.signer;
  const rewardTree = observedSigner.rewardDelayBlocks === 1
    ? setupSigner.rewardInputErgoTrees.delay1 : setupSigner.rewardInputErgoTrees.delay720;
  if (observedSigner.publicKeyHex !== setupSigner.publicKeyHex
    || observedSigner.p2pkErgoTreeHex !== setupSigner.p2pkErgoTreeHex
    || observedSigner.rewardInputErgoTreeHex !== rewardTree) {
    throw new Error('observed FED genesis reward signer differs from retained setup custody');
  }
  const receipt = history.receipt;
  if (receipt.rewardInputDiscoveryDigestHex !== discovery.reportDigestHex
    || canonicalJson(receipt.genesisBoxIds) !== canonicalJson(discovery.genesisBoxIds)
    || receipt.target.genesisHeaderIdHex !== discovery.target.genesisHeaderIdHex
    || receipt.target.setupAnchorHeaderIdHex !== discovery.target.tipHeaderIdHex
    || receipt.target.setupAnchorHeight !== discovery.target.tipHeight) {
    throw new Error('observed FED genesis history differs from discovery anchor or issuance inputs');
  }
  const preparation = prepareSubstrateFederatedGenesisV1({ ...genesis, ...profiles });
  const observedHeight = discovery.target.tipHeight;
  if (!Number.isSafeInteger(observedHeight) || observedHeight < 1 || observedHeight >= 2_147_483_647) {
    throw new Error('observed FED genesis height cannot bind issuance');
  }
  const roles = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
  const capturedBoxes = exact(discovery.genesisInputs, [...roles]);
  const snapshots = roles.map(role => {
    const box = exact(capturedBoxes[role], ['boxId', 'value', 'ergoTree', 'assets',
      'additionalRegisters', 'creationHeight', 'transactionId', 'index']);
    if (!Array.isArray(box.assets) || box.assets.length !== 0
      || Object.keys(exact(box.additionalRegisters, [])).length !== 0
      || box.ergoTree !== rewardTree || box.creationHeight > observedHeight) {
      throw new Error('observed FED issuance input must be mature pure ERG owned by the setup signer');
    }
    if (box.boxId !== discovery.genesisBoxIds[role]
      || observedHeight < box.creationHeight + observedSigner.rewardDelayBlocks + 1) {
      throw new Error('observed FED issuance input identity or maturity differs');
    }
    return structuredClone(box);
  });
  if (new Set(snapshots.map(box => box.boxId)).size !== 3) {
    throw new Error('observed FED issuance inputs must be distinct');
  }
  const template = (relativePath: string) => Object.freeze({ relativePath,
    source: readFileSync(join(genesis.bridgeRoot, relativePath), 'utf8') });
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
    template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
    trackerGenesisInputBoxIdHex: discovery.genesisBoxIds.tracker,
    profile: preparation.checkpointProfile, application: preparation.application,
  });
  // Snapshot every template and observed identity before either asynchronous compiler.
  const templates = Object.freeze({
    duplicatePrevention: template('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
    sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
    pooledReserve: template('contracts/MainChainPooledReserveValidityApplicationV6.es'),
  });
  const duplicatePreventionGenesisInputBoxIdHex = discovery.genesisBoxIds.duplicatePrevention;
  const pooledReserveGenesisInputBoxIdHex = discovery.genesisBoxIds.pooledReserve;
  const funding: Eip12Box[] = [];
  for (const box of snapshots) {
    funding.push(await normalizeEip12Box(box, 'observed FED issuance input'));
    assertCustody();
  }
  const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
  assertCustody();
  const familyCompilerInput = Object.freeze({ trackerRequest, trackerReceipt, templates,
    duplicatePreventionGenesisInputBoxIdHex, pooledReserveGenesisInputBoxIdHex });
  const familyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(familyCompilerInput);
  assertCustody();
  const candidate = buildSubstrateFederatedGenesisV1({ preparation, familyCompilerInput, familyReceipt });
  const familyRegister = encodeCollByteRegister(Buffer.from(familyReceipt.profile.familyIdHex, 'hex'));
  // Proposed greenfield state, not evidence that historical replay is empty.
  const registers: Readonly<Record<string, string>>[] = [
    {
      R4: encodeCollByteRegister(Buffer.from(preparation.checkpointProfile.profileIdHex, 'hex')),
      R5: encodeAvlTreeRegister(Buffer.from(getSubstrateFederatedTrackerDigestV1Hex([]), 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS, 370),
      R6: encodeCollByteRegister(Buffer.from(preparation.application.sidechainIdHex, 'hex')),
      R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(preparation.checkpointProfile.ergoAdmissionKeySetDigestHex, 'hex')),
    },
    { R4: familyRegister, R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS, 1) },
    { R4: familyRegister, R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS, 32), R6: encodeLongRegister(0n) },
  ];
  const trees = [trackerReceipt.contract.propositionHex,
    familyReceipt.contracts.duplicatePrevention.propositionHex, familyReceipt.contracts.pooledReserve.propositionHex];
  const transactions: Readonly<{ role: typeof roles[number]; transaction: Readonly<MaterializedUnsignedTransaction> }>[] = [];
  for (const [index, role] of roles.entries()) {
    const transaction = await materializeSubstrateFederatedSingletonIssuanceV1({
      label: `observed FED ${role} issuance`, genesisInput: funding[index]!,
      expectedNftIdHex: snapshots[index]!.boxId, propositionHex: trees[index]!, registers: registers[index]!,
      singletonValue: BigInt(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SINGLETON_VALUE_NANOERG),
      fee: BigInt(MINER_FEE), creationHeight: observedHeight + 1,
    });
    assertCustody();
    transactions.push(Object.freeze({ role, transaction: freezeData(transaction) }));
  }
  const issuance = Object.freeze({ creationHeight: observedHeight + 1,
    orderedTransactions: Object.freeze(transactions),
    greenfieldReplayBaselineEstablished: false as const,
    targetNodeAcceptanceEstablished: false as const, issuanceEstablished: false as const });
  const result = Object.freeze({ preparation, familyCompilerInput, familyReceipt, candidate, discovery, history, issuance });
  COMPILED_GENESIS.set(result, Object.freeze({ target, assertCustody: () => {
    const { processBinding } = assertCustody();
    assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance(history);
    return processBinding;
  } }));
  return result;
}

export function assertObservedSubstrateFederatedGenesisV1(
  value: unknown,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): asserts value is Readonly<ObservedSubstrateFederatedGenesisV1> {
  validateObservedSubstrateFederatedGenesisV1(value, target);
}

/** One complete current-target traversal per synchronous compiler validation. */
export function validateObservedSubstrateFederatedGenesisV1(
  value: unknown,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<{
  compiled: Readonly<ObservedSubstrateFederatedGenesisV1>;
  processBinding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
}> {
  const retained = value !== null && typeof value === 'object' ? COMPILED_GENESIS.get(value) : undefined;
  if (retained === undefined || retained.target !== target) {
    throw new Error('observed FED genesis lacks exact compiler and target provenance');
  }
  const processBinding = retained.assertCustody();
  return Object.freeze({ compiled: value as Readonly<ObservedSubstrateFederatedGenesisV1>, processBinding });
}

function freezeData<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

function exact<T>(value: T, keys: readonly string[]): Readonly<T> {
  if (value === null || typeof value !== 'object'
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('observed FED genesis requires exact data fields');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length
    || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    throw new Error('observed FED genesis requires exact data fields');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as Readonly<T>;
}
