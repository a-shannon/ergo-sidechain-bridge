import * as fs from 'node:fs';
import { resolve, sep } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    directories: new Set<string>(),
    attemptHasEntry: false,
    markerPresent: false,
    createSetup: vi.fn(),
    events: [] as string[],
    handlers,
    invoke(name: string, ...args: unknown[]) {
      const handler = handlers.get(name);
      if (handler === undefined) throw new Error('unmocked V3 boundary: ' + name);
      return handler(...args);
    },
  };
});

// Boundaries are modeled without starting a builder, native addon or node.
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const key = (path: fs.PathLike) => resolve(String(path));
  const realpath = Object.assign((path: fs.PathLike) => {
    const value = key(path);
    return model.directories.has(value) ? value : actual.realpathSync(path);
  }, { native: actual.realpathSync.native });
  return { ...actual,
    realpathSync: realpath,
    lstatSync: ((path: fs.PathLike, options?: { throwIfNoEntry?: boolean }) => {
      const value = key(path);
      if (value.endsWith('native-reservation-attempt.json') && model.markerPresent) {
        return { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
      }
      if (model.directories.has(value)) {
        return { isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
      }
      if (options?.throwIfNoEntry === false) return undefined;
      return actual.lstatSync(path);
    }) as typeof actual.lstatSync,
    opendirSync: ((path: fs.PathLike) => {
      if (!model.directories.has(key(path))) throw new Error('unexpected directory read');
      return { readSync: () => model.attemptHasEntry ? { name: 'foreign' } : null,
        closeSync: () => undefined };
    }) as typeof actual.opendirSync,
    readFileSync: ((path: fs.PathLike, ...args: unknown[]) => {
      const selected = key(path);
      if (selected.startsWith(resolve('virtual-v3-d') + sep)) {
        return model.invoke('fs.read', selected);
      }
      return (actual.readFileSync as unknown as (...readArgs: unknown[]) => unknown)(path, ...args);
    }) as typeof actual.readFileSync,
    mkdtempSync: ((prefix: string, ...args: unknown[]) => {
      if (key(prefix).startsWith(resolve('virtual-v3-d') + sep)) {
        return model.invoke('fs.mkdtemp', prefix);
      }
      return (actual.mkdtempSync as unknown as (...createArgs: unknown[]) => unknown)(prefix, ...args);
    }) as typeof actual.mkdtempSync,
    mkdirSync: ((path: fs.PathLike, ...args: unknown[]) => {
      if (key(path).startsWith(resolve('virtual-v3-d') + sep)) {
        return model.invoke('fs.mkdir', key(path));
      }
      return (actual.mkdirSync as unknown as (...createArgs: unknown[]) => unknown)(path, ...args);
    }) as typeof actual.mkdirSync,
  };
});
vi.mock('../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', () => ({
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2: model.createSetup,
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2: (...a: unknown[]) => model.invoke('setup.claim', ...a),
}));
vi.mock('../../adapters/federated-genesis-operator-v1.js', () => ({
  createFederatedGenesisOperatorV1: (...a: unknown[]) => model.invoke('operator.create', ...a),
  assertFederatedGenesisOperatorV1: (...a: unknown[]) => model.invoke('operator.assert', ...a),
  disposeFederatedGenesisOperatorV1: (...a: unknown[]) => model.invoke('operator.dispose', ...a),
}));
vi.mock('../../state-tracker.js', () => ({
  StateTracker: class {
    constructor(path: string) { model.invoke('state.new', path); }
    close() { model.invoke('state.close'); }
  },
}));
vi.mock('../../substrate-federated-genesis-node-build-v1.js', () => ({
  buildSubstrateFederatedGenesisNodeV1: (...a: unknown[]) => model.invoke('frontier.build', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1: (...a: unknown[]) => model.invoke('ergo.build', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v3.js', () => ({
  buildSubstrateFederatedIsolatedDevnetErgoNodeV3: (...a: unknown[]) => model.invoke('ergo.build', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2: (...a: unknown[]) => model.invoke('ergo.create', ...a),
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: (...a: unknown[]) => model.invoke('ergo.assert', ...a),
  holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1: (...a: unknown[]) => model.invoke('ergo.hold', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance: (...a: unknown[]) => model.invoke('setup.assertSigner', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-mining-credential-v1.js', () => ({
  revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1: (...a: unknown[]) => model.invoke('mining.revoke', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-source-attestation-session-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2: (...a: unknown[]) => model.invoke('source.create', ...a),
  readSubstrateFederatedGenesisProfilesFromSessionV2: (...a: unknown[]) => model.invoke('source.read', ...a),
  createSubstrateFederatedNativeGenesisSourceAttestationOperationV1: (...a: unknown[]) => model.invoke('operation.create', ...a),
  produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV3: (...a: unknown[]) => model.invoke('operation.produce', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1: (...a: unknown[]) => model.invoke('reward.discover', ...a),
  createSubstrateFederatedDepositFundingRequirementsV1: (...a: unknown[]) => model.invoke('funding.requirements', ...a),
  discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1: (...a: unknown[]) => model.invoke('funding.discover', ...a),
  assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1: (...a: unknown[]) => model.invoke('funding.assert', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2: (...a: unknown[]) => model.invoke('history.collect', ...a),
}));
vi.mock('../../substrate-federated-observed-genesis-v3.js', () => ({
  compileObservedSubstrateFederatedGenesisV3: (...a: unknown[]) => model.invoke('genesis.compile', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3: (...a: unknown[]) => model.invoke('batch.assert', ...a),
}));
vi.mock('../../substrate-federated-settlement-family-v1.js', () => ({
  decodeSubstrateFederatedSettlementFamilyV1Profile: (...a: unknown[]) => model.invoke('family.decode', ...a),
}));
vi.mock('../../peg-in-causal-admission-v2.js', () => ({
  decodePegInSourceIntentV2Hex: (...a: unknown[]) => model.invoke('packet.decodeIntent', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-candidate-v3.js', () => ({
  buildSubstrateFederatedNativeGenesisPegInPacketV3: (...a: unknown[]) => model.invoke('packet.build', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js', () => ({
  buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV3: (...a: unknown[]) => model.invoke('draft.build', ...a),
}));
vi.mock('../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js', () => ({
  collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV3: (...a: unknown[]) => model.invoke('evidence.collect', ...a),
}));
vi.mock('./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', () => ({
  executeSubstrateFederatedNativeGenesisBatchV3: (...a: unknown[]) => model.invoke('issuance.execute', ...a),
  executeSubstrateFederatedNativeGenesisPegInSourceLockV3: (...a: unknown[]) => model.invoke('sourceLock.execute', ...a),
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV3: (...a: unknown[]) => model.invoke('vault.execute', ...a),
}));
vi.mock('./substrate-federated-v3-held-issuance-confirmation.js', () => ({
  assertSubstrateFederatedV3HeldIssuanceConfirmations: (...a: unknown[]) => model.invoke('held.confirm', ...a),
}));
vi.mock('./substrate-federated-v3-frontier-reservation-target-root.js', () => ({
  executeSubstrateFederatedV3FrontierReservationTarget: (...a: unknown[]) => model.invoke('reservation.execute', ...a),
}));

import { runSubstrateFederatedV3OwnedGenesisReservationRoot }
  from './substrate-federated-v3-owned-genesis-reservation-root.js';

const BRIDGE = resolve('virtual-v3-c/bridge');
const FRONTIER_SOURCE = resolve('virtual-v3-c/bridge/frontier-source');
const FRONTIER_BUILD = resolve('virtual-v3-d/frontier-build');
const CARGO_HOME = resolve('virtual-v3-d/cargo-home');
const ERGO_WORKTREE = resolve('virtual-v3-d/ergo-worktree');
const ERGO_SOURCE = resolve('virtual-v3-d/ergo-worktree/source');
const ATTEMPT = resolve('virtual-v3-c/attempt');

function input(attemptDirectory = ATTEMPT) {
  return {
    frontierBuild: { bridgeRoot: BRIDGE, frontierSourcePath: FRONTIER_SOURCE,
      buildParentDirectory: FRONTIER_BUILD, cargoHomeDirectory: CARGO_HOME,
      cargoExecutablePath: resolve('virtual-v3-c/no-cargo.exe'),
      rustcExecutablePath: resolve('virtual-v3-c/no-rustc.exe'),
      gitExecutablePath: resolve('virtual-v3-c/no-git.exe'),
      protocExecutablePath: resolve('virtual-v3-c/no-protoc.exe') },
    ergoBuild: { worktreeRoot: ERGO_WORKTREE, bridgeRoot: BRIDGE,
      ergoSourcePath: ERGO_SOURCE,
      gitExecutablePath: resolve('virtual-v3-c/no-git.exe'),
      javaExecutablePath: resolve('virtual-v3-c/no-java.exe'),
      sbtLauncherJarPath: resolve('virtual-v3-d/no-sbt.jar') },
    attemptDirectory, sourceAmountNanoErg: '20000000',
    genesis: { evmChainId: '4242', bridgeAddressHex: '33'.repeat(20),
      tokenAddressHex: '44'.repeat(20) },
    sourceProofWindow: { issuedAtNativeHeight: '0', expiresAtNativeHeight: '32' },
  };
}

type FundingDrift = 'genesis' | 'tip';

function configureOwnedFlow(options: {
  heldFailure?: boolean;
  fundingDrift?: FundingDrift;
} = {}) {
  const target = Object.freeze({ identity: 'owned-v3-target' });
  const signer = Object.freeze({
    publicKeyHex: '02' + '11'.repeat(32),
    p2pkErgoTreeHex: '0008cd' + '11'.repeat(33),
    rewardInputErgoTrees: Object.freeze(['reward-tree']),
  });
  const source = { dispose: () => { model.events.push('source.dispose'); } };
  const operator = Object.freeze({
    launchDomainHex: 'ab'.repeat(32),
    addressHex: '33'.repeat(20),
    nativeFunding: Object.freeze({ amountUnits: '1000' }),
  });
  const operation = { dispose: () => { model.events.push('operation.dispose'); } };
  const roles = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
  const outputs = roles.map((_, index) => Object.freeze({
    boxId: String(index + 1).padStart(64, '0'),
    value: '20000000', ergoTree: '1001',
    assets: Object.freeze([]), additionalRegisters: Object.freeze({}),
    creationHeight: 117 + index,
    transactionId: String(index + 11).padStart(64, '0'), index: 0,
  }));
  const compiled = Object.freeze({
    preparation: Object.freeze({
      mintProofProfileScaleHex: 'profile-scale',
      mintProofProfile: Object.freeze({ proofProfileIdHex: 'profile-id' }),
    }),
    issuance: Object.freeze({ orderedTransactions: roles.map((role, index) => Object.freeze({
      role, transaction: Object.freeze({
        txId: String(index + 11).padStart(64, '0'),
        outputs: Object.freeze([outputs[index]!]),
      }),
    })) }),
    familyReceipt: Object.freeze({ profile: Object.freeze({ familyIdHex: 'family-id' }) }),
  });
  const batch = Object.freeze({
    request: Object.freeze({ target: Object.freeze({ genesisHeaderIdHex: 'aa'.repeat(32) }) }),
    orderedTransactions: roles.map((_, index) => Object.freeze({
      issuance: Object.freeze({ genesisInputBoxIdHex: String(index + 21).padStart(64, '0') }),
    })),
  });
  const receipts = roles.map((role, index) => Object.freeze({
    role, ordinal: index,
    expectedTxId: compiled.issuance.orderedTransactions[index]!.transaction.txId,
    confirmationHeight: 117 + index,
    confirmationHeaderIdHex: String(index + 31).padStart(64, '0'),
  }));
  const held = Object.freeze({ fullHeight: 120, headerIdHex: 'bb'.repeat(32) });
  const fundingInput = Object.freeze({ identity: 'funding-input' });
  const requirements = Object.freeze({
    sourceAmountNanoErg: '20000000',
    sourceLockCreationFeeNanoErg: '1000000',
    reserveTransitionFeeNanoErg: '1000000',
  });
  const funding = Object.freeze({
    target: Object.freeze({
      genesisHeaderIdHex: options.fundingDrift === 'genesis'
        ? 'cc'.repeat(32) : batch.request.target.genesisHeaderIdHex,
      tipHeight: held.fullHeight,
      tipHeaderIdHex: options.fundingDrift === 'tip'
        ? 'dd'.repeat(32) : held.headerIdHex,
    }),
    fundingInput,
  });
  const frontierTargetDirectory = resolve(FRONTIER_BUILD, 'bridge-fed-genesis-ABC123', 'target');
  const wasmPath = resolve(frontierTargetDirectory, 'runtime.wasm');
  const frontier = Object.freeze({
    targetDirectory: frontierTargetDirectory,
    wasm: Object.freeze({ path: wasmPath, sha256Hex: 'ee'.repeat(32) }),
    sourceProofProfileScaleHex: compiled.preparation.mintProofProfileScaleHex,
    sourceProofProfileIdHex: compiled.preparation.mintProofProfile.proofProfileIdHex,
  });
  const builtErgo = Object.freeze({
    javaExecutablePath: resolve('virtual-v3-c/no-java.exe'),
    nodeAssemblyJarPath: resolve('virtual-v3-d/no-node.jar'),
    receipt: Object.freeze({
      toolchain: Object.freeze({ javaExecutableSha256Hex: 'fe'.repeat(32) }),
      build: Object.freeze({ artifactSha256Hex: 'ef'.repeat(32) }),
      buildIdentityDigestHex: 'fa'.repeat(32),
    }),
  });
  const credentials = Object.freeze({
    miningCredential: Object.freeze({ identity: 'mining' }),
    checkpointMiningCredential: Object.freeze({ identity: 'checkpoint' }),
    trackerAdmissionMiningCredential: Object.freeze({ identity: 'admission' }),
    trackerConfirmationMiningCredential: Object.freeze({ identity: 'confirmation' }),
  });
  const sourceLockObservation = Object.freeze({ identity: 'source-lock-observation' });
  const vaultObservation = Object.freeze({ identity: 'vault-observation' });
  const packet = Object.freeze({ sourceIntentHex: 'cafe' });
  const draft = Object.freeze({ identity: 'draft' });
  const evidence = Object.freeze({ identity: 'evidence' });
  const proof = Object.freeze({ identity: 'proof' });
  const result = Object.freeze({ identity: 'reservation-result' });
  const ownedDiscovery = Object.freeze({ observation: Object.freeze({ identity: 'reward-observation' }) });
  const history = Object.freeze({ identity: 'history' });
  const observedFunding = Object.freeze({ identity: 'observed-funding' });
  let retainedState: unknown;
  let retainedDraftInputs: unknown;

  const on = (name: string, handler: (...args: unknown[]) => unknown, record = false) => {
    model.handlers.set(name, (...args: unknown[]) => {
      if (record) model.events.push(name);
      return handler(...args);
    });
  };
  const same = (actual: unknown, expected: unknown) => { expect(actual).toBe(expected); };
  const session = Object.freeze({
    signer,
    runNativeGenesisRetainingSignerV3: vi.fn(async (selectedCompiled: unknown, selectedTarget: unknown) => {
      model.events.push('setup.run');
      same(selectedCompiled, compiled);
      same(selectedTarget, target);
      return batch;
    }),
    dispose: () => { model.events.push('setup.dispose'); },
  });
  const ergo = Object.freeze({
    startMining: async () => { model.events.push('ergo.start'); },
    withMiningActiveExecutionTarget: async (
      callback: (selectedTarget: typeof target) => Promise<unknown>,
    ) => ({ value: await callback(target) }),
    stop: async () => { model.events.push('ergo.stop'); },
  });

  model.createSetup.mockImplementation(async () => {
    model.events.push('setup.create');
    return session;
  });
  on('source.create', selected => {
    expect(selected).toEqual({ ergoAdmissionThreshold: 1,
      ergoAdmissionPublicKeysHex: [signer.publicKeyHex] });
    return source;
  }, true);
  on('source.read', selected => { same(selected, source); return {}; });
  on('operator.create', () => operator, true);
  on('operator.assert', selected => { same(selected, operator); });
  on('operator.dispose', selected => {
    same(selected, operator);
    model.events.push('operator.dispose');
  });
  on('setup.assertSigner', selected => { same(selected, signer); });
  on('frontier.build', selected => {
    const value = selected as { sourceSession: unknown; bridgeRoot: unknown };
    same(value.sourceSession, source);
    same(value.bridgeRoot, BRIDGE);
    return frontier;
  }, true);
  on('ergo.build', selected => { expect(selected).toEqual(input().ergoBuild); return builtErgo; }, true);
  on('setup.claim', selected => { same(selected, session); return credentials; }, true);
  on('ergo.create', (built, processInput, ...claimed) => {
    const value = built as { javaExecutablePath: unknown; nodeAssemblyJarPath: unknown };
    same(value.javaExecutablePath, builtErgo.javaExecutablePath);
    same(value.nodeAssemblyJarPath, builtErgo.nodeAssemblyJarPath);
    same((built as { buildIdentityDigestHex: unknown }).buildIdentityDigestHex,
      builtErgo.receipt.buildIdentityDigestHex);
    same((processInput as { miningTargetPublicKeyHex: unknown }).miningTargetPublicKeyHex,
      signer.publicKeyHex);
    expect(claimed).toEqual(Object.values(credentials));
    return ergo;
  }, true);
  on('ergo.assert', selected => { same(selected, target); });
  on('mining.revoke', credential => {
    expect(Object.values(credentials)).toContain(credential);
    model.events.push('mining.revoke');
  });
  on('reward.discover', (selectedSigner, selectedTarget) => {
    same(selectedSigner, signer);
    same(selectedTarget, target);
    return ownedDiscovery;
  }, true);
  on('history.collect', selected => {
    same(selected, ownedDiscovery.observation);
    return history;
  }, true);
  on('fs.read', selected => {
    same(selected, wasmPath);
    return Buffer.from('0061736d01000000', 'hex');
  });
  on('genesis.compile', selected => {
    const value = selected as {
      setupSigner: unknown; sourceSession: unknown; target: unknown;
      ownedDiscovery: unknown; history: unknown;
      genesis: { runtimeWasm: unknown };
    };
    same(value.setupSigner, signer);
    same(value.sourceSession, source);
    same(value.target, target);
    same(value.ownedDiscovery, ownedDiscovery);
    same(value.history, history);
    expect(value.genesis.runtimeWasm).toEqual(Buffer.from('0061736d01000000', 'hex'));
    return compiled;
  }, true);
  on('batch.assert', (selectedBatch, selectedTarget) => {
    same(selectedBatch, batch);
    same(selectedTarget, target);
  });
  on('fs.mkdtemp', prefix => {
    same(prefix, resolve(frontierTargetDirectory, 'issuance-journal-'));
    return String(prefix) + 'TEST01';
  }, true);
  on('fs.mkdir', selected => {
    same(selected, resolve(frontierTargetDirectory, 'issuance-journal-TEST01', 'attempt-markers'));
  }, true);
  on('state.new', selected => {
    same(selected, resolve(frontierTargetDirectory, 'issuance-journal-TEST01', 'state-store'));
  }, true);
  on('state.close', () => { model.events.push('state.close'); });
  on('issuance.execute', selected => {
    const value = selected as {
      target: unknown; batch: unknown; state: unknown; markerDirectory: unknown;
    };
    same(value.target, target);
    same(value.batch, batch);
    same(value.markerDirectory,
      resolve(frontierTargetDirectory, 'issuance-journal-TEST01', 'attempt-markers'));
    retainedState = value.state;
    return receipts;
  }, true);
  on('ergo.hold', selected => { same(selected, target); return held; }, true);
  on('held.confirm', (selectedTarget, selectedHeld, selectedReceipts, boxes, assertBatchActive) => {
    same(selectedTarget, target);
    same(selectedHeld, held);
    same(selectedReceipts, receipts);
    expect(boxes).toEqual(roles.map((_, index) => ({
      sourceBoxIdHex: batch.orderedTransactions[index]!.issuance.genesisInputBoxIdHex,
      singletonOutput: outputs[index],
    })));
    (boxes as { singletonOutput: unknown }[]).forEach((box, index) =>
      same(box.singletonOutput, outputs[index]));
    expect(typeof assertBatchActive).toBe('function');
    (assertBatchActive as () => void)();
    if (options.heldFailure) throw new Error('held sentinel');
  }, true);
  on('funding.requirements', amount => {
    same(amount, input().sourceAmountNanoErg);
    return requirements;
  }, true);
  on('funding.discover', (selectedSigner, selectedTarget, selectedRequirements) => {
    same(selectedSigner, signer);
    same(selectedTarget, target);
    same(selectedRequirements, requirements);
    return observedFunding;
  }, true);
  on('funding.assert', (selectedFunding, selectedTarget, selectedRequirements) => {
    same(selectedFunding, observedFunding);
    same(selectedTarget, target);
    same(selectedRequirements, requirements);
    return funding;
  }, true);
  on('family.decode', selected => {
    same(selected, compiled.familyReceipt.profile);
    return { sourceNetworkIdHex: '01', sidechainIdHex: '02',
      bridgeAddressHex: input().genesis.bridgeAddressHex,
      tokenAddressHex: input().genesis.tokenAddressHex,
      settlementProfileIdHex: '03', settlementAssetIdHex: '04' };
  });
  on('packet.build', selected => {
    const value = selected as {
      batch: unknown; target: unknown; sourceFundingInput: unknown;
      sourceIntent: { amountNanoErg: unknown };
    };
    same(value.batch, batch);
    same(value.target, target);
    same(value.sourceFundingInput, fundingInput);
    same(value.sourceIntent.amountNanoErg, requirements.sourceAmountNanoErg);
    return packet;
  }, true);
  on('packet.decodeIntent', selected => {
    same(selected, packet.sourceIntentHex);
    return { amountNanoErg: requirements.sourceAmountNanoErg };
  });
  on('sourceLock.execute', selected => {
    const value = selected as {
      target: unknown; batch: unknown; packet: unknown; setupSession: unknown; state: unknown;
    };
    same(value.target, target);
    same(value.batch, batch);
    same(value.packet, packet);
    same(value.setupSession, session);
    same(value.state, retainedState);
    return { outputObservation: sourceLockObservation };
  }, true);
  on('vault.execute', selected => {
    const value = selected as {
      target: unknown; batch: unknown; packet: unknown; setupSession: unknown;
      state: unknown; sourceLockObservation: unknown;
    };
    same(value.target, target);
    same(value.batch, batch);
    same(value.packet, packet);
    same(value.setupSession, session);
    same(value.state, retainedState);
    same(value.sourceLockObservation, sourceLockObservation);
    return { outputObservation: vaultObservation };
  }, true);
  on('operation.create', selected => { same(selected, source); return operation; }, true);
  on('draft.build', selected => {
    const value = selected as {
      target: unknown; batch: unknown; packet: unknown; committedVaultObservation: unknown;
    };
    same(value.target, target);
    same(value.batch, batch);
    same(value.packet, packet);
    same(value.committedVaultObservation, vaultObservation);
    retainedDraftInputs = selected;
    return draft;
  }, true);
  on('evidence.collect', selected => {
    const value = selected as { draft: unknown };
    same(value.draft, draft);
    return evidence;
  }, true);
  on('operation.produce', (selectedOperation, selectedInput) => {
    same(selectedOperation, operation);
    const value = selectedInput as {
      draftInputs: unknown; draft: unknown; evidenceReceipt: unknown;
      issuedAtNativeHeight: unknown; expiresAtNativeHeight: unknown;
    };
    same(value.draftInputs, retainedDraftInputs);
    same(value.draft, draft);
    same(value.evidenceReceipt, evidence);
    same(value.issuedAtNativeHeight, input().sourceProofWindow.issuedAtNativeHeight);
    same(value.expiresAtNativeHeight, input().sourceProofWindow.expiresAtNativeHeight);
    return proof;
  }, true);
  on('reservation.execute', selected => {
    const value = selected as {
      built: unknown; buildParentDirectory: unknown; signing: {
        operator: unknown; sourceOperation: unknown; draftInputs: unknown;
        draft: unknown; proof: unknown; compiled: unknown; target: unknown;
      }; attemptDirectory: unknown; broadcastScope: unknown;
    };
    same(value.built, frontier);
    same(value.buildParentDirectory, FRONTIER_BUILD);
    same(value.signing.operator, operator);
    same(value.signing.sourceOperation, operation);
    same(value.signing.draftInputs, retainedDraftInputs);
    same(value.signing.draft, draft);
    same(value.signing.proof, proof);
    same(value.signing.compiled, compiled);
    same(value.signing.target, target);
    same(value.attemptDirectory, ATTEMPT);
    same(value.broadcastScope, 'fed-native-local-synthetic-v3-reservation-only');
    return result;
  }, true);
  return { result, held, batch, receipts, compiled, target };
}

describe('V3 owned reservation pre-entry', () => {
  beforeEach(() => {
    model.directories.clear();
    for (const path of [BRIDGE, FRONTIER_SOURCE, FRONTIER_BUILD, CARGO_HOME,
      ERGO_WORKTREE, ERGO_SOURCE, ATTEMPT]) model.directories.add(path);
    model.attemptHasEntry = false;
    model.markerPresent = false;
    model.handlers.clear();
    model.events.length = 0;
    model.createSetup.mockReset();
    model.createSetup.mockRejectedValue(new Error('setup sentinel'));
  });

  it('rejects a foreign entry before acquiring setup', async () => {
    model.attemptHasEntry = true;
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(input()))
      .rejects.toThrow(/must be empty/u);
    expect(model.createSetup).not.toHaveBeenCalled();
  });

  it.each([BRIDGE, resolve(BRIDGE, 'attempt'), FRONTIER_BUILD,
    resolve(ERGO_WORKTREE, 'attempt')])(
    'rejects an attempt overlapping selected source or build custody: %s', async attempt => {
      model.directories.add(attempt);
      await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(input(attempt)))
        .rejects.toThrow(/overlaps selected source or build custody/u);
      expect(model.createSetup).not.toHaveBeenCalled();
    });

  it('rejects an already recorded attempt before acquiring setup', async () => {
    model.markerPresent = true;
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(input()))
      .rejects.toThrow(/attempt already exists/u);
    expect(model.createSetup).not.toHaveBeenCalled();
  });

  it('rejects an accessor and an extra field before acquiring setup', async () => {
    const accessor = Object.defineProperty(input(), 'attemptDirectory', {
      enumerable: true, get: () => ATTEMPT,
    });
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(accessor))
      .rejects.toThrow(/input fields differ/u);
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot({ ...input(), extra: true } as never))
      .rejects.toThrow(/input fields differ/u);
    expect(model.createSetup).not.toHaveBeenCalled();
  });

  it('rejects a noncanonical amount and inverted proof window before acquiring setup', async () => {
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot({
      ...input(), sourceAmountNanoErg: '020000000',
    })).rejects.toThrow(/input differs/u);
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot({
      ...input(), sourceProofWindow: { issuedAtNativeHeight: '33', expiresAtNativeHeight: '32' },
    })).rejects.toThrow(/input differs/u);
    expect(model.createSetup).not.toHaveBeenCalled();
  });

  it('crosses the pre-entry boundary once for a fresh, direct and empty attempt', async () => {
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(input()))
      .rejects.toThrow('setup sentinel');
    expect(model.createSetup).toHaveBeenCalledOnce();
  });

  it('joins one owned V3 post-setup batch through held funding and reservation, then closes custody', async () => {
    const flow = configureOwnedFlow();
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(input()))
      .resolves.toBe(flow.result);
    expect(model.createSetup).toHaveBeenCalledOnce();
    expect(flow.compiled.issuance.orderedTransactions.map(item => item.role))
      .toEqual(['tracker', 'duplicatePrevention', 'pooledReserve']);
    expect(flow.receipts.map(item => item.role))
      .toEqual(['tracker', 'duplicatePrevention', 'pooledReserve']);
    expect(model.events).toEqual([
      'setup.create', 'source.create', 'operator.create',
      'frontier.build', 'ergo.build', 'setup.claim', 'ergo.create', 'ergo.start',
      'reward.discover', 'history.collect', 'genesis.compile', 'setup.run',
      'fs.mkdtemp', 'fs.mkdir', 'state.new', 'issuance.execute',
      'ergo.hold', 'held.confirm',
      'funding.requirements', 'funding.discover', 'funding.assert',
      'packet.build', 'sourceLock.execute', 'vault.execute',
      'operation.create', 'draft.build', 'evidence.collect', 'operation.produce',
      'reservation.execute', 'ergo.stop',
      'mining.revoke', 'mining.revoke', 'mining.revoke', 'mining.revoke',
      'operation.dispose', 'source.dispose', 'operator.dispose',
      'setup.dispose', 'state.close',
    ]);
  });

  it('stops before funding and reservation when the held issuance confirmation fails', async () => {
    configureOwnedFlow({ heldFailure: true });
    await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(input()))
      .rejects.toThrow('held sentinel');
    expect(model.events).toContain('held.confirm');
    expect(model.events).not.toContain('funding.discover');
    expect(model.events).not.toContain('sourceLock.execute');
    expect(model.events).not.toContain('reservation.execute');
    expect(model.events.slice(-9)).toEqual([
      'ergo.stop', 'mining.revoke', 'mining.revoke', 'mining.revoke', 'mining.revoke',
      'source.dispose', 'operator.dispose', 'setup.dispose', 'state.close',
    ]);
  });

  it.each(['genesis', 'tip'] as const)(
    'stops before the deposit and reservation when funding %s drifts from held issuance',
    async fundingDrift => {
      configureOwnedFlow({ fundingDrift });
      await expect(runSubstrateFederatedV3OwnedGenesisReservationRoot(input()))
        .rejects.toThrow(/deposit funding differs from the held issuance and owned genesis/u);
      expect(model.events).toContain('held.confirm');
      expect(model.events).toContain('funding.assert');
      expect(model.events).not.toContain('packet.build');
      expect(model.events).not.toContain('sourceLock.execute');
      expect(model.events).not.toContain('reservation.execute');
      expect(model.events.slice(-9)).toEqual([
        'ergo.stop', 'mining.revoke', 'mining.revoke', 'mining.revoke', 'mining.revoke',
        'source.dispose', 'operator.dispose', 'setup.dispose', 'state.close',
      ]);
    });
});
