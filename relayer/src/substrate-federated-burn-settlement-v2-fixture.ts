import { readFileSync } from 'node:fs';
import blakejs from 'blakejs';

import { getDupTreeDigest, getPooledReserveEmptyDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { buildSubstrateFederatedTrackerAdmissionV1 } from './profiles/substrate-federated-v1/tracker-admission.js';
import { getSubstrateFederatedTrackerDigestV1Hex } from './substrate-federated-burn-settlement-v1.js';
import type { BuildSubstrateFederatedBurnSettlementV2Input } from './substrate-federated-burn-settlement-v2.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 } from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { buildTrustlessBurnInclusionProof, deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import type { Eip12Box, Eip12OutputCandidate } from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_WITHDRAWAL_FIXTURE_RECIPIENT =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

export function substrateFederatedWithdrawalFixtureTemplate(relativePath: string) {
  return { relativePath, source: readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8') };
}

/** Fresh compiler provenance; all tracker/reserve/DUP boxes below are synthetic. */
export async function buildSubstrateFederatedBurnSettlementV2FixtureInput():
Promise<BuildSubstrateFederatedBurnSettlementV2Input> {
  const vector = JSON.parse(readFileSync(new URL(
    '../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url,
  ), 'utf8'));
  const identity = JSON.parse(readFileSync(new URL(
    '../test-vectors/substrate-federated-v1-tracker-contract.json', import.meta.url,
  ), 'utf8'));
  // V1 checkpoint/application codecs are the unchanged V2 settlement layout,
  // not compiler receipts or evidence of admission.
  const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
    template: substrateFederatedWithdrawalFixtureTemplate('contracts/SPVTrackerSubstrateFederatedV2.es'),
    trackerGenesisInputBoxIdHex: vector.input.tracker.trackerNftIdHex,
    profile, application: identity.application,
  });
  const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
  const familyCompilerInput = {
    trackerRequest, trackerReceipt,
    templates: {
      duplicatePrevention: substrateFederatedWithdrawalFixtureTemplate('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
      sourceLock: substrateFederatedWithdrawalFixtureTemplate('contracts/MainChainLockPooledReserveV6.es'),
      pooledReserve: substrateFederatedWithdrawalFixtureTemplate('contracts/MainChainPooledReserveValidityApplicationV6.es'),
    },
    duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32),
    pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32),
  };
  const family = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(familyCompilerInput);
  const leaves = [0, 1, 2].map(eventIndex => {
    const sidechainTxHashHex = String(eventIndex + 1).padStart(2, '0').repeat(32);
    return {
      sidechainIdHex: trackerRequest.application.sidechainIdHex,
      sidechainBlockHashHex: vector.input.statement.executionBlockHashHex as string,
      sidechainTxHashHex, eventIndex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex: trackerRequest.application.sidechainIdHex, sidechainTxHashHex, eventIndex,
      }),
      recipientErgoTreeHashHex: Buffer.from(blakejs.blake2b(
        Buffer.from(SUBSTRATE_FEDERATED_WITHDRAWAL_FIXTURE_RECIPIENT, 'hex'), undefined, 32,
      )).toString('hex'),
      amountNanoErg: eventIndex === 1 ? '10000000' : '1000000',
      assetIdHex: '00'.repeat(32),
    };
  });
  const proof = buildTrustlessBurnInclusionProof(leaves, leaves[1].burnIdHex);
  const statement = buildSubstrateFederatedCheckpointStatementV1({
    ...vector.input.statement, profile,
    bridgeEventRootHex: proof.bridgeEventRootHex, burnLeafCount: proof.leafCount,
  });
  const admission = buildSubstrateFederatedTrackerAdmissionV1({
    profile, encodedStatementHex: statement.encodedStatementHex,
    currentErgoHeight: 1030, anchorHeaderIdHex: '0a'.repeat(32), anchorHeaderHeight: 1028,
  });
  const history = [{ key: admission.trackerKeyHex, value: admission.trackerValueHex }];
  const familyRegister = encodeCollByteRegister(Buffer.from(family.profile.familyIdHex, 'hex'));
  const common = { creationHeight: 1030, value: '2000000' };
  const tracker = await materializeSubstrateFederatedWithdrawalFixtureBox({
    ...common, ergoTree: trackerReceipt.contract.propositionHex,
    assets: [{ tokenId: trackerRequest.trackerNftIdHex, amount: '1' }],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
      R5: encodeAvlTreeRegister(Buffer.from(getSubstrateFederatedTrackerDigestV1Hex(history), 'hex'), 1, 370),
      R6: encodeCollByteRegister(Buffer.from(statement.sidechainIdHex, 'hex')),
      R7: encodeLongRegister(BigInt(statement.sourceNativeBlockHeight)), R8: encodeIntRegister(1030),
      R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
    },
  });
  const reserve = await materializeSubstrateFederatedWithdrawalFixtureBox({
    ...common, value: '42000000', ergoTree: family.contracts.pooledReserve.propositionHex,
    assets: [{ tokenId: family.profile.pooledReserveNftIdHex, amount: '1' }],
    additionalRegisters: {
      R4: familyRegister,
      R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32),
      R6: encodeLongRegister(40_000_000n),
    },
  });
  const dup = await materializeSubstrateFederatedWithdrawalFixtureBox({
    ...common, ergoTree: family.contracts.duplicatePrevention.propositionHex,
    assets: [{ tokenId: family.profile.duplicatePreventionNftIdHex, amount: '1' }],
    additionalRegisters: {
      R4: familyRegister, R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), 1, 1),
    },
  });
  return {
    familyCompilerInput, familyCompilerReceipt: family,
    trackerState: { dataInput: tracker, history }, reserveState: { predecessor: reserve },
    duplicatePreventionState: { predecessor: dup, historyKeys: [] },
    feeFundingInput: await materializeSubstrateFederatedWithdrawalFixtureBox({
      ...common, value: String(MINER_FEE), ergoTree: SUBSTRATE_FEDERATED_WITHDRAWAL_FIXTURE_RECIPIENT,
      assets: [], additionalRegisters: {},
    }),
    claim: {
      trackerIdentity: {
        sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
        sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex,
        executionBlockHashHex: statement.executionBlockHashHex,
      },
      burnLeaf: leaves[1], leafIndex: proof.leafIndex, leafCount: proof.leafCount,
      burnProof: proof.proof, recipientErgoTreeHex: SUBSTRATE_FEDERATED_WITHDRAWAL_FIXTURE_RECIPIENT,
    },
    currentErgoHeight: 1038, creationHeight: 1038, feeNanoErg: MINER_FEE,
  };
}

/** Arbitrary synthetic box materialization, never observed or funded state. */
export async function materializeSubstrateFederatedWithdrawalFixtureBox(
  candidate: Eip12OutputCandidate,
): Promise<Eip12Box> {
  const module = await import('ergo-lib-wasm-nodejs');
  const wasm = module.default ?? module;
  const tx = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: '91'.repeat(32), extension: {} }], dataInputs: [],
    outputs: [{
      value: String(candidate.value), ergoTree: candidate.ergoTree,
      assets: candidate.assets ?? [], additionalRegisters: candidate.additionalRegisters ?? {},
      creationHeight: candidate.creationHeight,
    }],
  }));
  const id = tx.id();
  const outputs = tx.output_candidates();
  const output = outputs.get(0);
  const box = wasm.ErgoBox.from_box_candidate(output, id, 0);
  try { return box.to_js_eip12() as Eip12Box; }
  finally { box.free(); output.free(); outputs.free(); id.free(); tx.free(); }
}
