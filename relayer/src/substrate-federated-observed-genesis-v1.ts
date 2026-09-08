import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from './strict-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance,
  type SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2,
} from './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
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

/** Compile one candidate from live custody and exact issuance-input observations.
 * The caller retains custody and owns node revalidation, issuance and activation.
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
    assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(ownedDiscovery, target);
    assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setupSigner);
    return readSubstrateFederatedGenesisProfilesFromSessionV2(sourceSession);
  };
  const profiles = assertCustody();
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
  const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
  assertCustody();
  const familyCompilerInput = Object.freeze({ trackerRequest, trackerReceipt, templates,
    duplicatePreventionGenesisInputBoxIdHex, pooledReserveGenesisInputBoxIdHex });
  const familyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(familyCompilerInput);
  assertCustody();
  const candidate = buildSubstrateFederatedGenesisV1({ preparation, familyCompilerInput, familyReceipt });
  return Object.freeze({ preparation, familyCompilerInput, familyReceipt, candidate, discovery, history });
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
