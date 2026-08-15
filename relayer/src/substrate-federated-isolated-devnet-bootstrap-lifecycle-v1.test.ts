import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1,
  type SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Ports,
} from './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import {
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';

const SETUP_SIGNER = Object.freeze({
  publicKeyHex: `02${'11'.repeat(32)}`,
  p2pkErgoTreeHex: `0008cd${'11'.repeat(33)}`,
  rewardInputErgoTrees: Object.freeze({
    delay1: '12'.repeat(40),
    delay720: '13'.repeat(40),
  }),
  networkPrefix: 16 as const,
});

const PACKET_SIGNER = Object.freeze({
  sourceAttestationThreshold: 2 as const,
  sourceAttestationPublicKeysHex: Object.freeze([
    '21'.repeat(32),
    '22'.repeat(32),
    '23'.repeat(32),
  ]),
  ergoAdmissionThreshold: 1 as const,
  ergoAdmissionPublicKeysHex: Object.freeze([SETUP_SIGNER.publicKeyHex]),
});

describe('substrate federated isolated-devnet bootstrap lifecycle v1', () => {
  it('joins the complete signer-first, non-mining, packet and no-submit order', async () => {
    const fixture = lifecycleFixture();
    const result = await runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
      fixture.input,
      fixture.ports,
    );

    expect(fixture.events).toEqual([
      'create-setup',
      'create-packet',
      'create-node-session',
      'start-mining-nodes',
      'enter-non-mining-action',
      'collect-source-history',
      'discover-reward-inputs',
      'collect-ergo-history',
      'produce-packet',
      'run-setup-check',
      'dispose-packet',
      'dispose-setup',
      'stop-nodes',
    ]);
    expect(fixture.nodeLaunchBinding).toEqual({
      miningTargetPublicKeyHex: SETUP_SIGNER.publicKeyHex,
      p2pkErgoTreeHex: SETUP_SIGNER.p2pkErgoTreeHex,
      rewardInputErgoTrees: SETUP_SIGNER.rewardInputErgoTrees,
      networkPrefix: 16,
      primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
      witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    });
    expect(fixture.packetInput?.expectedProfilePins).toEqual(expectedPins());
    expect(fixture.setupCheckInput).toEqual({
      portableReplayInput: fixture.portableReplayInput,
      primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
      witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    });
    expect(result).toEqual({
      profilePins: expectedPins(),
      ergoNodeExecution: fixture.nodeExecutionReceipt,
      packet: fixture.packetReceipt,
      setupCheck: fixture.setupReceipt,
      boundaries: {
        processFreeLifecycleOrderingOnly: true,
        staticRuntimePortsBound: false,
        nodeExecutableIdentityAuthenticated: false,
        targetNodeAcceptanceEstablished: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
      },
    });
    expect(result).not.toHaveProperty('portableReplayInput');
  });

  it.each([
    'create-setup',
    'create-packet',
    'create-node-session',
    'start-mining-nodes',
    'enter-non-mining-action',
    'collect-source-history',
    'discover-reward-inputs',
    'collect-ergo-history',
    'produce-packet',
    'run-setup-check',
  ] as const)('tears down every acquired capability when %s fails', async stage => {
    const fixture = lifecycleFixture(stage);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
        fixture.input,
        fixture.ports,
      ),
    ).rejects.toThrow(`failure at ${stage}`);

    if (stage !== 'create-setup') {
      expect(fixture.events).toContain('dispose-setup');
    }
    if (!['create-setup', 'create-packet'].includes(stage)) {
      expect(fixture.events).toContain('dispose-packet');
    }
    if (['create-setup', 'create-packet', 'create-node-session'].includes(stage)) {
      expect(fixture.events).not.toContain('stop-nodes');
    } else {
      expect(fixture.events).toContain('stop-nodes');
    }
    expect(fixture.events).not.toContain('submit');
    expect(fixture.events).not.toContain('broadcast');
  });

  it.each([
    'threshold',
    'key count',
    'key identity',
  ] as const)('rejects packet/setup signer %s divergence before creating a node session', async drift => {
    const fixture = lifecycleFixture();
    if (drift === 'threshold') {
      fixture.packetSigner.ergoAdmissionThreshold = 2 as never;
    } else if (drift === 'key count') {
      fixture.packetSigner.ergoAdmissionPublicKeysHex = Object.freeze([
        SETUP_SIGNER.publicKeyHex,
        `03${'44'.repeat(32)}`,
      ]);
    } else {
      fixture.packetSigner.ergoAdmissionPublicKeysHex = Object.freeze([
        `03${'44'.repeat(32)}`,
      ]);
    }

    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
        fixture.input,
        fixture.ports,
      ),
    ).rejects.toThrow(/Ergo-admission signer differs/u);
    expect(fixture.events).not.toContain('create-node-session');
    expect(fixture.events.slice(-2)).toEqual([
      'dispose-packet',
      'dispose-setup',
    ]);
  });

  it.each([
    ['primary origin', 'read-target-primary'],
    ['witness origin', 'read-target-witness'],
    ['mining state', 'read-target-mining'],
    ['receipt primary origin', 'receipt-primary'],
    ['receipt witness origin', 'receipt-witness'],
    ['receipt mining state', 'receipt-mining'],
    ['build identity', 'receipt-build'],
    ['executable identity', 'receipt-executable'],
    ['process binding', 'receipt-process'],
  ] as const)('rejects %s drift before returning a result', async (_label, drift) => {
    const fixture = lifecycleFixture();
    fixture.drift = drift;

    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
        fixture.input,
        fixture.ports,
      ),
    ).rejects.toThrow(/fixed non-mining target|identity digest|process binding digest/u);
    expect(fixture.events.slice(-3)).toEqual([
      'dispose-packet',
      'dispose-setup',
      'stop-nodes',
    ]);
  });

  it('preserves the primary failure when independent teardown also fails', async () => {
    const fixture = lifecycleFixture('collect-source-history');
    fixture.stopNodesFailure = new Error('node stop failed');

    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
        fixture.input,
        fixture.ports,
      ),
    ).rejects.toSatisfy((error: unknown) =>
      error instanceof AggregateError
      && error.errors.some(candidate =>
        candidate instanceof Error
        && candidate.message === 'failure at collect-source-history'
      )
      && error.errors.some(candidate =>
        candidate instanceof Error
        && candidate.message === 'Ergo node teardown failed'
      )
    );
  });

  it('continues teardown when both session disposals fail', async () => {
    const fixture = lifecycleFixture('collect-source-history');
    fixture.packetDisposeFailure = new Error('packet dispose failed');
    fixture.setupDisposeFailure = new Error('setup dispose failed');

    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
        fixture.input,
        fixture.ports,
      ),
    ).rejects.toSatisfy((error: unknown) =>
      error instanceof AggregateError
      && error.errors.length === 3
    );
    expect(fixture.events.slice(-3)).toEqual([
      'dispose-packet',
      'dispose-setup',
      'stop-nodes',
    ]);
  });

  it('rejects a successful lifecycle when teardown alone fails', async () => {
    const fixture = lifecycleFixture();
    fixture.packetDisposeFailure = new Error('packet dispose failed');

    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
        fixture.input,
        fixture.ports,
      ),
    ).rejects.toSatisfy((error: unknown) =>
      error instanceof AggregateError
      && error.message === 'isolated-devnet bootstrap teardown was incomplete'
      && error.errors.length === 1
    );
    expect(fixture.events).toContain('run-setup-check');
    expect(fixture.events.slice(-3)).toEqual([
      'dispose-packet',
      'dispose-setup',
      'stop-nodes',
    ]);
  });

  it('contains no process, transport, submit or broadcast implementation', () => {
    const source = readFileSync(new URL(
      './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(source).not.toMatch(/\b(?:spawn|execFile|fetch|submit|broadcast)\b/u);
    expect(source).not.toContain('node:child_process');
    expect(source).not.toContain('scripts/run-patched-ergo-devnet.ps1');
  });
});

function expectedPins() {
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: 1,
    maxAdmissionValidityBlocks: 64,
    sourceAttestationThreshold: PACKET_SIGNER.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      PACKET_SIGNER.sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold: PACKET_SIGNER.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: PACKET_SIGNER.ergoAdmissionPublicKeysHex,
  });
  return {
    federationProfileIdHex: profile.profileIdHex,
    sourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
  };
}

function lifecycleFixture(failAt?: string) {
  const events: string[] = [];
  const input = Object.freeze({
    sourceHistory: Object.freeze({ acceptance: Object.freeze({}) }) as never,
    relayerArtifacts: Object.freeze({ marker: 'relayer-artifacts' }) as never,
  });
  const sourceHistory = Object.freeze({ marker: 'source-history' }) as never;
  const rewardInputs = Object.freeze({ marker: 'reward-inputs' }) as never;
  const ergoHistory = Object.freeze({ marker: 'ergo-history' }) as never;
  const portableReplayInput = Object.freeze({ marker: 'portable-input' }) as never;
  const packetReceipt = Object.freeze({ marker: 'packet-receipt' }) as never;
  const setupReceipt = Object.freeze({ marker: 'setup-receipt' }) as never;
  const readOnlyTarget = {
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    miningStopped: true as const,
  };
  const nodeExecutionReceipt = {
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    miningStoppedBeforeAction: true as const,
    buildIdentityDigestHex: '31'.repeat(32),
    executableIdentityDigestHex: '32'.repeat(32),
    processBindingDigestHex: '33'.repeat(32),
  };
  let nodeLaunchBinding: unknown;
  let packetInput: any;
  let setupCheckInput: unknown;
  let stopNodesFailure: Error | undefined;
  let packetDisposeFailure: Error | undefined;
  let setupDisposeFailure: Error | undefined;
  let drift: string | undefined;
  const packetSigner: {
    sourceAttestationThreshold: 2;
    sourceAttestationPublicKeysHex: readonly string[];
    ergoAdmissionThreshold: 1;
    ergoAdmissionPublicKeysHex: readonly string[];
  } = {
    ...PACKET_SIGNER,
    ergoAdmissionPublicKeysHex:
      PACKET_SIGNER.ergoAdmissionPublicKeysHex,
  };
  const fail = (stage: string) => {
    events.push(stage);
    if (failAt === stage) throw new Error(`failure at ${stage}`);
  };
  const setupSession = {
    signer: SETUP_SIGNER,
    dispose: vi.fn(() => {
      events.push('dispose-setup');
      if (setupDisposeFailure !== undefined) throw setupDisposeFailure;
    }),
    run: vi.fn(async value => {
      setupCheckInput = value;
      fail('run-setup-check');
      return setupReceipt;
    }),
  };
  const packetSession = {
    signer: packetSigner,
    dispose: vi.fn(() => {
      events.push('dispose-packet');
      if (packetDisposeFailure !== undefined) throw packetDisposeFailure;
    }),
    produce: vi.fn(async value => {
      packetInput = value;
      fail('produce-packet');
      return Object.freeze({
        receipt: packetReceipt,
        portableReplayInput,
        replay: Object.freeze({}),
      }) as never;
    }),
  };
  const ports: SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Ports = {
    createSetupSession: vi.fn(async () => {
      fail('create-setup');
      return setupSession as never;
    }),
    createPacketSession: vi.fn(signer => {
      expect(signer).toBe(SETUP_SIGNER);
      fail('create-packet');
      return packetSession as never;
    }),
    createErgoNodeSession: vi.fn(binding => {
      nodeLaunchBinding = binding;
      fail('create-node-session');
      return {
        startMining: vi.fn(async () => {
          fail('start-mining-nodes');
        }),
        withMiningStoppedReadOnlyTarget: vi.fn(async action => {
          fail('enter-non-mining-action');
          const target = { ...readOnlyTarget };
          const receipt = { ...nodeExecutionReceipt };
          if (drift === 'read-target-primary') {
            target.primaryNodeOrigin = 'http://127.0.0.1:19051' as never;
          } else if (drift === 'read-target-witness') {
            target.witnessNodeOrigin = 'http://127.0.0.1:19052' as never;
          } else if (drift === 'read-target-mining') {
            target.miningStopped = false as never;
          }
          const value = await action(target);
          if (drift === 'receipt-primary') {
            receipt.primaryNodeOrigin = 'http://127.0.0.1:19051' as never;
          } else if (drift === 'receipt-witness') {
            receipt.witnessNodeOrigin = 'http://127.0.0.1:19052' as never;
          } else if (drift === 'receipt-mining') {
            receipt.miningStoppedBeforeAction = false as never;
          } else if (drift === 'receipt-build') {
            receipt.buildIdentityDigestHex = 'AA'.repeat(32);
          } else if (drift === 'receipt-executable') {
            receipt.executableIdentityDigestHex = 'AA'.repeat(32);
          } else if (drift === 'receipt-process') {
            receipt.processBindingDigestHex = 'AA'.repeat(32);
          }
          return { value, receipt };
        }),
        stop: vi.fn(async () => {
          events.push('stop-nodes');
          if (stopNodesFailure !== undefined) throw stopNodesFailure;
        }),
      };
    }),
    collectSourceHistory: vi.fn(async value => {
      expect(value).toBe(input.sourceHistory);
      fail('collect-source-history');
      return sourceHistory;
    }),
    discoverRewardInputs: vi.fn(async signer => {
      expect(signer).toBe(SETUP_SIGNER);
      fail('discover-reward-inputs');
      return rewardInputs;
    }),
    collectErgoHistory: vi.fn(async discovery => {
      expect(discovery).toBe(rewardInputs);
      fail('collect-ergo-history');
      return ergoHistory;
    }),
  };
  return {
    events,
    input,
    ports,
    sourceHistory,
    rewardInputs,
    ergoHistory,
    portableReplayInput,
    packetReceipt,
    setupReceipt,
    readOnlyTarget,
    nodeExecutionReceipt,
    packetSigner,
    get nodeLaunchBinding() { return nodeLaunchBinding; },
    get packetInput() { return packetInput; },
    get setupCheckInput() { return setupCheckInput; },
    get stopNodesFailure() { return stopNodesFailure; },
    set stopNodesFailure(value: Error | undefined) { stopNodesFailure = value; },
    get packetDisposeFailure() { return packetDisposeFailure; },
    set packetDisposeFailure(value: Error | undefined) {
      packetDisposeFailure = value;
    },
    get setupDisposeFailure() { return setupDisposeFailure; },
    set setupDisposeFailure(value: Error | undefined) {
      setupDisposeFailure = value;
    },
    get drift() { return drift; },
    set drift(value: string | undefined) { drift = value; },
  };
}
