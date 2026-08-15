import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildTestnetRecoveryDrillEvidence,
  buildTestnetRecoveryDrillObservation,
  observeTestnetRecoveryDrill,
} from './testnet-recovery-drill-evidence.js';

const EXPECTED_TX_ID = 'a'.repeat(64);
const BURN_TX_ID = 'b'.repeat(64);
const SINGLETON_ID = 'c'.repeat(64);
const OBSERVATION_ARTIFACT = 'artifact://recovery/recovery-observe.json';
const FULLWIDTH_TRUE = '\uFF34\uFF32\uFF35\uFF25';

describe('buildTestnetRecoveryDrillEvidence', () => {
  it('creates a failed-broadcast recovery row accepted by rehearsal validation focus checks', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/rehearsal-validate.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(report.status).toBe('CREATED');
    expect(report.recoveryBoundary).toEqual({
      evidenceAssemblyOnly: true,
      signingPerformed: false,
      nodeQueryPerformed: false,
      liveSubmitPerformed: false,
      confirmationObserved: false,
      reconciliationPerformed: false,
      broadcastAuthorized: false,
      gate3ClosureAllowed: false,
      productionReadyClaimAllowed: false,
      testnetProductionCandidateClaimAllowed: false,
    });
    expect(report.markdown).toContain('Failed broadcast / phantom AVL evidence');
    expect(report.markdown).toContain(`structured recovery observation PASS observation ${OBSERVATION_ARTIFACT}`);
    expect(report.markdown).toContain(`recovery-observe validation target ${OBSERVATION_ARTIFACT}`);
    expect(report.markdown).toContain('npm run rehearsal:recovery-observe:validate command output: PASS');
    expect(report.markdown).toContain('recovery-observe JSON validation PASS');
    expect(report.markdown).toContain('npm run rehearsal:validate command output: PASS');
    expect(report.markdown).toContain(`expected transaction ${EXPECTED_TX_ID}`);
    expect(report.markdown).toContain(`peg-out burn TX ID ${BURN_TX_ID}`);
  });

  it('creates a reorged-burn recovery row accepted by rehearsal validation focus checks', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'reorged-burn-stale-singleton',
      evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
      validationArtifact: 'artifact://recovery/rehearsal-validate.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
    });

    expect(report.status).toBe('CREATED');
    expect(report.markdown).toContain('Reorged burn / stale singleton evidence');
    expect(report.markdown).toContain(`structured recovery observation PASS observation ${OBSERVATION_ARTIFACT}`);
    expect(report.markdown).toContain(`recovery-observe validation target ${OBSERVATION_ARTIFACT}`);
    expect(report.markdown).toContain('npm run rehearsal:recovery-observe:validate command output: PASS');
    expect(report.markdown).toContain('recovery-observe JSON validation PASS');
    expect(report.markdown).toContain('reorged burn stale singleton detected recoverable');
    expect(report.markdown).toContain(`peg-out burn TX ID ${BURN_TX_ID}`);
    expect(report.markdown).toContain(`singleton inventory ${SINGLETON_ID}`);
  });

  it('fails closed when required drill identifiers or validation artifacts are missing', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/<failed-broadcast>.md',
      validationArtifact: 'artifact://recovery/rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/<observe>.json',
      pegOutBurnTxId: 'not-hex',
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.recoveryBoundary.broadcastAuthorized).toBe(false);
    expect(report.recoveryBoundary.gate3ClosureAllowed).toBe(false);
    expect(report.errors).toContain('peg-out burn TX ID must be 32-byte hex');
    expect(report.errors).toContain('Expected transaction ID is required for failed-broadcast recovery evidence');
    expect(report.errors).toContain('evidence artifact must be a completed artifact:// target');
    expect(report.markdown).toBeUndefined();
  });

  it('blocks secret, mainnet, or enabled-broadcast targets', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'reorged-burn-stale-singleton',
      evidenceArtifact: 'artifact://mainnet/recovery.md',
      validationArtifact: 'artifact://recovery/BRIDGE_BROADCAST_ENABLED=true.log',
      observationArtifact: 'artifact://recovery/private-key-observe.json',
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'evidence artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
    );
    expect(report.errors).toContain(
      'validation artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
    );
    expect(report.errors).toContain(
      'observation artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
    );
  });

  it('blocks certification-family broadcast approval artifact targets', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/live-broadcast-approval-certified.md',
      validationArtifact: 'artifact://recovery/rehearsal-validate-certifies-live-broadcast-approval.log',
      observationArtifact: 'artifact://recovery/broadcast-endorsed-observe.json',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'evidence artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
    );
    expect(report.errors).toContain(
      'validation artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
    );
    expect(report.errors).toContain(
      'observation artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
    );
  });

  it('blocks compatibility-normalized broadcast enablement artifact targets', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: `artifact://recovery/BRIDGE_BROADCAST_ENABLED=${FULLWIDTH_TRUE}.md`,
      validationArtifact: 'artifact://recovery/rehearsal-validate.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'evidence artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
    );
  });

  it('blocks shared sensitive and local-only recovery artifact names', () => {
    for (const evidenceArtifact of [
      'artifact://recovery/operator/signing-key-evidence.md',
      'artifact://recovery/operator/api-key-evidence.md',
      'artifact://recovery/operator/seed-phrase-evidence.md',
      'artifact://recovery/state/deployed_state.json',
      'artifact://recovery/sourceTarget=(.env)/evidence.md',
      'artifact://recovery/sourceTarget=(runtime/bridge-state.sqlite)/evidence.md',
      'artifact://recovery/sourceTarget=%28.env%29/evidence.md',
      'artifact://recovery/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/evidence.md',
      'artifact://recovery/sourceTarget=%2Ftmp%2Frecovery-observe.json',
      'artifact://recovery/sourceTarget=C%3A%2Ftmp%2Frecovery-observe.json',
      'artifact://recovery/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Frecovery-observe.json',
      'artifact://recovery/sourceTarget=%2F%2Fshare-name%2Frecovery-observe.json',
    ]) {
      const report = buildTestnetRecoveryDrillEvidence({
        kind: 'failed-broadcast-phantom-avl',
        evidenceArtifact,
        validationArtifact: 'artifact://recovery/rehearsal-validate.log',
        observationArtifact: OBSERVATION_ARTIFACT,
        expectedTxId: EXPECTED_TX_ID,
        pegOutBurnTxId: BURN_TX_ID,
      });

      expect(report.status, evidenceArtifact).toBe('BLOCKED');
      expect(report.errors, evidenceArtifact).toContain(
        'evidence artifact must not reference secrets, local-only paths, mainnet, or enabled broadcast',
      );
    }
  });

  it('blocks incomplete or reused recovery evidence targets', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/failed-broadcast-todo.md',
      validationArtifact: 'artifact://recovery/rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/rehearsal-validate.log',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('evidence artifact must not be a template, placeholder, or non-concrete target');
    expect(report.errors).toContain(
      'Recovery drill artifact targets must be distinct: validation artifact and observation artifact reuse the same evidence target',
    );
  });

  it('blocks row-named non-concrete recovery drill targets', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/generic-failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/sample-evidence-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/example-evidence-recovery-observe.json',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toEqual(expect.arrayContaining([
      'evidence artifact must not be a template, placeholder, or non-concrete target',
      'validation artifact must not be a template, placeholder, or non-concrete target',
      'observation artifact must not be a template, placeholder, or non-concrete target',
    ]));

    const fixtureReport = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/fixture-failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/mock-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/testdata-recovery-observe.json',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(fixtureReport.status).toBe('BLOCKED');
    expect(fixtureReport.markdown).toBeUndefined();
    expect(fixtureReport.errors).toEqual(expect.arrayContaining([
      'evidence artifact must not be a template, placeholder, or non-concrete target',
      'validation artifact must not be a template, placeholder, or non-concrete target',
      'observation artifact must not be a template, placeholder, or non-concrete target',
    ]));

    const syntheticReport = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/completed-synthetic-failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/completed-synthetic-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/completed-synthetic-recovery-observe.json',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(syntheticReport.status).toBe('BLOCKED');
    expect(syntheticReport.markdown).toBeUndefined();
    expect(syntheticReport.errors).toEqual(expect.arrayContaining([
      'evidence artifact must not be a template, placeholder, or non-concrete target',
      'validation artifact must not be a template, placeholder, or non-concrete target',
      'observation artifact must not be a template, placeholder, or non-concrete target',
    ]));

    const simulatedReport = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/completed-simulated-failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/completed-simulated-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/completed-simulated-recovery-observe.json',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(simulatedReport.status).toBe('BLOCKED');
    expect(simulatedReport.markdown).toBeUndefined();
    expect(simulatedReport.errors).toEqual(expect.arrayContaining([
      'evidence artifact must not be a template, placeholder, or non-concrete target',
      'validation artifact must not be a template, placeholder, or non-concrete target',
      'observation artifact must not be a template, placeholder, or non-concrete target',
    ]));

    const templateReport = buildTestnetRecoveryDrillEvidence({
      kind: 'reorged-burn-stale-singleton',
      evidenceArtifact: 'artifact://recovery/template-reorged-burn-stale-singleton.md',
      validationArtifact: 'artifact://recovery/template-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/template-recovery-observe.json',
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
    });

    expect(templateReport.status).toBe('BLOCKED');
    expect(templateReport.markdown).toBeUndefined();
    expect(templateReport.errors).toEqual(expect.arrayContaining([
      'evidence artifact must not be a template, placeholder, or non-concrete target',
      'validation artifact must not be a template, placeholder, or non-concrete target',
      'observation artifact must not be a template, placeholder, or non-concrete target',
    ]));
  });

  it('blocks claim-escalating recovery drill targets', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/production-ready-failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/testnet-production-candidate-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/production-ready-recovery-observe.json',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toEqual(expect.arrayContaining([
      'evidence artifact must not be a template, placeholder, or non-concrete target',
      'validation artifact must not be a template, placeholder, or non-concrete target',
      'observation artifact must not be a template, placeholder, or non-concrete target',
    ]));
  });

  it('allows concrete recovery audit targets that mention sample size or template removal', () => {
    const report = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/sample-size-analysis-failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/template-removal-audit-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/sample-size-analysis-recovery-observe.json',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });

    expect(report.status).toBe('CREATED');
    expect(report.errors).toEqual([]);
    expect(report.markdown).toContain('artifact://recovery/sample-size-analysis-failed-broadcast-phantom-avl.md');
    expect(report.markdown).toContain('artifact://recovery/template-removal-audit-rehearsal-validate.log');
    expect(report.markdown).toContain('artifact://recovery/sample-size-analysis-recovery-observe.json');
  });

  it('requires validation artifacts to identify rehearsal validation or test evidence', () => {
    const failedBroadcast = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/generic.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });
    const reorgGeneric = buildTestnetRecoveryDrillEvidence({
      kind: 'reorged-burn-stale-singleton',
      evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
      validationArtifact: 'artifact://recovery/generic.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
    });
    const reorgTest = buildTestnetRecoveryDrillEvidence({
      kind: 'reorged-burn-stale-singleton',
      evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
      validationArtifact: 'artifact://recovery/reorg-recovery-test.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
    });

    expect(failedBroadcast.status).toBe('BLOCKED');
    expect(failedBroadcast.errors).toContain(
      'validation artifact must not be a template, placeholder, or non-concrete target',
    );
    expect(failedBroadcast.errors).toContain(
      'validation artifact must identify rehearsal:validate evidence for failed-broadcast recovery',
    );
    expect(reorgGeneric.status).toBe('BLOCKED');
    expect(reorgGeneric.errors).toContain(
      'validation artifact must not be a template, placeholder, or non-concrete target',
    );
    expect(reorgGeneric.errors).toContain(
      'validation artifact must identify rehearsal:validate or test evidence for reorged-burn recovery',
    );
    expect(reorgTest.status).toBe('CREATED');
    expect(reorgTest.markdown).toContain('test evidence command output: PASS');
    expect(reorgTest.markdown).not.toContain('npm run rehearsal:validate command output: PASS');
  });

  it('emits the exact terms required by rehearsal recovery pass validation', () => {
    const failed = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/rehearsal-validate.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
    });
    const reorg = buildTestnetRecoveryDrillEvidence({
      kind: 'reorged-burn-stale-singleton',
      evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
      validationArtifact: 'artifact://recovery/rehearsal-validate.log',
      observationArtifact: OBSERVATION_ARTIFACT,
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
    });

    const markdown = [failed.markdown, reorg.markdown].join('\n');

    expect(markdown).toContain('npm run rehearsal:validate');
    expect(markdown).toContain('npm run rehearsal:recovery-observe:validate');
    expect(markdown).toContain('recovery-observe JSON validation PASS');
    expect(markdown).toContain('structured recovery observation PASS');
    expect(markdown).toContain('no phantom DUP AVL history inserted');
    expect(markdown).toContain(`expected transaction ${EXPECTED_TX_ID}`);
    expect(markdown).toContain(`peg-out burn TX ID ${BURN_TX_ID}`);
    expect(markdown).toContain(`singleton inventory ${SINGLETON_ID}`);
  });
});

describe('buildTestnetRecoveryDrillObservation', () => {
  const baseNode = {
    observedAt: new Date().toISOString(),
    nodeHeight: 123,
    nodeNetwork: 'testnet',
    expectedTxId: EXPECTED_TX_ID,
    confirmedChain: false,
    mempool: false,
  };
  const baseState = {
    aggregateAttempt: {
      expectedTxId: EXPECTED_TX_ID,
      submittedTxId: EXPECTED_TX_ID,
      status: 'submitted',
      mode: 'single',
      burnTxHashes: [BURN_TX_ID],
    },
    pegOut: {
      burnTxHash: BURN_TX_ID,
      status: 'aggregate_submitted',
      phase1BoxId: null,
      phase2UnlockTxId: null,
      pendingAvlKey: null,
    },
    avlKeyPresent: false,
    pendingDupHeartbeatForTx: false,
  };

  it('passes failed-broadcast recovery observation only when tx and phantom AVL are absent', () => {
    const report = buildTestnetRecoveryDrillObservation({
      kind: 'failed-broadcast-phantom-avl',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
      stateTargetClass: 'operator-provided-state-db',
      node: baseNode,
      state: baseState,
    });

    expect(report.status).toBe('PASS');
    expect(report.sourceBindings).toEqual({
      node: {
        sourceType: 'live-read-only-node',
        readOnly: true,
        noAuthHeader: true,
        observedAt: baseNode.observedAt,
        nodeHeight: baseNode.nodeHeight,
        nodeNetwork: baseNode.nodeNetwork,
      },
      state: {
        sourceType: 'read-only-state-tracker',
        readOnly: true,
        runtimePathSerialized: false,
        targetClass: 'operator-provided-state-db',
      },
    });
    expect(report.lines.join('\n')).toContain(
      'source bindings: live-read-only-node plus read-only state tracker; runtime database path serialized: no',
    );
    expect(report.observationBoundary).toEqual({
      readOnlyObservationOnly: true,
      nodeQueryPerformed: true,
      stateReadPerformed: true,
      signingPerformed: false,
      broadcastAuthorized: false,
      liveSubmitPerformed: false,
      confirmationObserved: false,
      nodeMutationPerformed: false,
      repairPerformed: false,
      stateMutationPerformed: false,
      reconciliationPerformed: false,
      gate3ClosureAllowed: false,
      productionReadyClaimAllowed: false,
      testnetProductionCandidateClaimAllowed: false,
    });
  });

  it('blocks failed-broadcast observations that still see tx or phantom AVL state', () => {
    const report = buildTestnetRecoveryDrillObservation({
      kind: 'failed-broadcast-phantom-avl',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
      stateTargetClass: 'operator-provided-state-db',
      node: {
        ...baseNode,
        confirmedChain: true,
        mempool: true,
      },
      state: {
        ...baseState,
        avlKeyPresent: true,
        pendingDupHeartbeatForTx: true,
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'recovery observation must prove Expected transaction ID is absent from confirmed chain',
    );
    expect(report.errors).toContain(
      'recovery observation must prove Expected transaction ID is absent from mempool',
    );
    expect(report.errors).toContain('failed-broadcast observation must prove no DUP AVL key was inserted for the burn');
    expect(report.errors).toContain(
      'recovery observation must prove no pending DUP heartbeat exists for the Expected transaction ID',
    );
  });

  it('blocks failed-broadcast observations without aggregate attempt or peg-out state bindings', () => {
    const report = buildTestnetRecoveryDrillObservation({
      kind: 'failed-broadcast-phantom-avl',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
      stateTargetClass: 'operator-provided-state-db',
      node: baseNode,
      state: {
        avlKeyPresent: false,
        pendingDupHeartbeatForTx: false,
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'failed-broadcast observation must include aggregate settlement attempt for Expected transaction ID',
    );
    expect(report.errors).toContain('failed-broadcast observation must include peg-out state for the burn');
  });

  it('blocks failed-broadcast observations with inconsistent aggregate attempt status bindings', () => {
    const missingSubmittedId = buildTestnetRecoveryDrillObservation({
      kind: 'failed-broadcast-phantom-avl',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
      stateTargetClass: 'operator-provided-state-db',
      node: baseNode,
      state: {
        ...baseState,
        aggregateAttempt: {
          expectedTxId: EXPECTED_TX_ID,
          submittedTxId: null,
          status: 'submitted',
          mode: 'single',
          burnTxHashes: [BURN_TX_ID],
        },
      },
    });
    const abandonedWithSubmittedId = buildTestnetRecoveryDrillObservation({
      kind: 'failed-broadcast-phantom-avl',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
      stateTargetClass: 'operator-provided-state-db',
      node: baseNode,
      state: {
        ...baseState,
        aggregateAttempt: {
          expectedTxId: EXPECTED_TX_ID,
          submittedTxId: EXPECTED_TX_ID,
          status: 'abandoned',
          mode: 'single',
          burnTxHashes: [BURN_TX_ID],
        },
      },
    });

    expect(missingSubmittedId.errors).toContain(
      'failed-broadcast submitted aggregate attempt must include submitted transaction ID matching input',
    );
    expect(abandonedWithSubmittedId.errors).toContain(
      'failed-broadcast pending or abandoned aggregate attempt must not include submitted transaction ID',
    );
  });

  it('accepts failed-broadcast observations for pending or abandoned attempts without submitted transaction IDs', () => {
    for (const status of ['pending', 'abandoned']) {
      const report = buildTestnetRecoveryDrillObservation({
        kind: 'failed-broadcast-phantom-avl',
        expectedTxId: EXPECTED_TX_ID,
        pegOutBurnTxId: BURN_TX_ID,
        stateTargetClass: 'operator-provided-state-db',
        node: baseNode,
        state: {
          ...baseState,
          aggregateAttempt: {
            expectedTxId: EXPECTED_TX_ID,
            submittedTxId: null,
            status,
            mode: 'single',
            burnTxHashes: [BURN_TX_ID],
          },
        },
      });

      expect(report.errors, status).toEqual([]);
      expect(report.status, status).toBe('PASS');
    }
  });

  it('passes reorg recovery observation when a stale singleton candidate is read-only recoverable', () => {
    const report = buildTestnetRecoveryDrillObservation({
      kind: 'reorged-burn-stale-singleton',
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
      stateTargetClass: 'operator-provided-state-db',
      node: {
        observedAt: new Date().toISOString(),
        nodeHeight: 123,
        nodeNetwork: 'testnet',
      },
      state: {
        avlKeyPresent: true,
        spvTrackerKeyPresent: true,
        pendingDupHeartbeatForTx: false,
        reorgCandidate: {
          burnTxHash: BURN_TX_ID,
          pendingAvlKey: BURN_TX_ID,
          status: 'burn_reverted',
          phase1BoxId: EXPECTED_TX_ID,
        },
      },
    });

    expect(report.status).toBe('PASS');
  });

  it('blocks reorg recovery observation without a recoverable stale singleton candidate', () => {
    const report = buildTestnetRecoveryDrillObservation({
      kind: 'reorged-burn-stale-singleton',
      pegOutBurnTxId: BURN_TX_ID,
      singletonInventoryId: SINGLETON_ID,
      stateTargetClass: 'operator-provided-state-db',
      node: {
        observedAt: new Date().toISOString(),
        nodeHeight: 123,
        nodeNetwork: 'testnet',
      },
      state: {
        avlKeyPresent: false,
        spvTrackerKeyPresent: false,
        pendingDupHeartbeatForTx: false,
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'reorg observation must identify a recoverable stale singleton / pending AVL candidate',
    );
  });
});

describe('observeTestnetRecoveryDrill', () => {
  it('uses read-only dependency methods to build a failed-broadcast observation', async () => {
    const calls: string[] = [];
    const report = await observeTestnetRecoveryDrill({
      kind: 'failed-broadcast-phantom-avl',
      expectedTxId: EXPECTED_TX_ID,
      pegOutBurnTxId: BURN_TX_ID,
      stateTargetClass: 'operator-provided-state-db',
      ergo: {
        getInfo: async () => {
          calls.push('getInfo');
          return { fullHeight: 123, network: 'testnet' };
        },
        getTransaction: async () => {
          calls.push('getTransaction');
          return null;
        },
        hasUnconfirmedTransaction: async () => {
          calls.push('hasUnconfirmedTransaction');
          return false;
        },
      },
      state: {
        getAggregateSettlementAttempt: () => ({
          expectedTxId: EXPECTED_TX_ID,
          submittedTxId: EXPECTED_TX_ID,
          status: 'submitted',
          mode: 'single',
          burnTxHashes: [BURN_TX_ID],
        }),
        getPegOutByTxHash: () => ({
          sidechainBurnTxHash: BURN_TX_ID,
          status: 'aggregate_submitted',
          phase1BoxId: null,
          phase2UnlockTxId: null,
          pendingAvlKey: null,
        }),
        hasAvlKey: () => false,
        hasSpvTrackerKey: () => false,
        getPendingDupHeartbeats: () => [],
        getPegOutsWithAvlKeysForReorg: () => [],
      },
    });

    expect(report.status).toBe('PASS');
    expect(calls).toEqual(['getInfo', 'getTransaction', 'hasUnconfirmedTransaction']);
    expect(report.sourceBindings?.state).toEqual({
      sourceType: 'read-only-state-tracker',
      readOnly: true,
      runtimePathSerialized: false,
      targetClass: 'operator-provided-state-db',
    });
  });
});

describe('recovery observation CLI surface', () => {
  it('uses read-only clients and avoids signer, broadcast, and mutation calls', () => {
    const source = readFileSync(join(process.cwd(), 'src/scripts/testnet-recovery-drill-observe.ts'), 'utf8');

    expect(source).toContain('new ErgoClient(args.nodeUrl, { readOnly: true })');
    expect(source).toContain("new StateTracker(stateDbPath, { readOnly: true })");
    expect(source).toContain("stateTargetClass: 'operator-provided-state-db'");
    expect(source).not.toContain("stateDbPath ?? './bridge-state.sqlite'");
    expect(source).not.toContain('default-state-db');
    expect(source).toContain('resolveStateDbPath(target)');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('resolveEvidenceJsonOutputPath(args.jsonOut)');
    expect(source.indexOf('const outputTarget = resolveEvidenceJsonOutputPath(args.jsonOut);')).toBeLessThan(
      source.indexOf('const stateDbTarget = resolveCliStateDbPath(args.stateDb);'),
    );
    expect(source).not.toContain('resolveEvidenceOutputPath(args.jsonOut)');
    expect(source).not.toContain('assertBroadcastAllowed');
    expect(source).not.toContain('submitTransaction');
    expect(source).not.toContain('signAndSubmit');
    expect(source).not.toContain('insertAvlKey');
    expect(source).not.toContain('updatePegOutStatus');
    expect(source).not.toContain('clearPhase1Artifacts');
    expect(source).not.toContain('abandonAggregateSettlementAttempt');
  });

  it('requires explicit CLI state database target before opening local files', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-recovery-drill-observe.ts',
        '--kind',
        'failed-broadcast-phantom-avl',
        '--expected-tx-id',
        EXPECTED_TX_ID,
        '--peg-out-burn-tx-id',
        BURN_TX_ID,
        '--json-out',
        'tmp-recovery-observe/out.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'recovery observation: --state-db is required for read-only state observation; no default runtime database is opened',
    );
    expect(result.stderr).not.toContain('bridge-state.sqlite');
    expect(result.stderr).not.toContain('could not be read in read-only mode');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI JSON output targets before opening local state databases', () => {
    const jsonOutTarget = '../operator/private-key-recovery-observe.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-recovery-drill-observe.ts',
        '--kind',
        'failed-broadcast-phantom-avl',
        '--expected-tx-id',
        EXPECTED_TX_ID,
        '--peg-out-burn-tx-id',
        BURN_TX_ID,
        '--state-db',
        'missing-recovery-state.sqlite',
        '--json-out',
        jsonOutTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json-out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(jsonOutTarget);
    expect(result.stderr).not.toContain('missing-recovery-state.sqlite');
    expect(result.stderr).not.toContain('could not be read in read-only mode');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI state database targets before opening local files', () => {
    const stateDbTarget = '../operator/private-key.sqlite';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-recovery-drill-observe.ts',
        '--kind',
        'failed-broadcast-phantom-avl',
        '--expected-tx-id',
        EXPECTED_TX_ID,
        '--peg-out-burn-tx-id',
        BURN_TX_ID,
        '--state-db',
        stateDbTarget,
        '--json-out',
        'tmp-recovery-observe/out.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'recovery observation: --state-db <blocked state-db target> must not target secret-bearing material',
    );
    expect(result.stderr).not.toContain(stateDbTarget);
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('requires row assembly to validate the recovery-observe JSON before writing evidence', () => {
    const source = readFileSync(join(process.cwd(), 'src/scripts/testnet-recovery-drill-evidence.ts'), 'utf8');

    expect(source).toContain('--observation-json');
    expect(source).toContain('readEvidenceJsonTarget');
    expect(source).toContain('validateRecoveryObserveJsonReport');
    expect(source).toContain('recovery-observe JSON validation PASS');
    expect(source).not.toContain('ErgoClient');
    expect(source).not.toContain('StateTracker');
    expect(source).not.toContain('assertBroadcastAllowed');
    expect(source).not.toContain('submitTransaction');
  });

  it('blocks unsafe row assembly JSON output targets before reading observation JSON', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-recovery-drill-evidence.ts',
        '--kind',
        'failed-broadcast-phantom-avl',
        '--evidence-artifact',
        'artifact://recovery/failed-broadcast-phantom-avl.md',
        '--validation-artifact',
        'artifact://recovery/rehearsal-validate.log',
        '--observation-artifact',
        'artifact://recovery/recovery-observe.json',
        '--observation-json',
        'missing-recovery-observe.json',
        '--expected-tx-id',
        EXPECTED_TX_ID,
        '--peg-out-burn-tx-id',
        BURN_TX_ID,
        '--json-out',
        jsonOutTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json-out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(jsonOutTarget);
    expect(result.stderr).not.toContain('missing-recovery-observe.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe row assembly Markdown output targets before reading observation JSON', () => {
    const outTarget = '../operator/private-key-recovery-row.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-recovery-drill-evidence.ts',
        '--kind',
        'failed-broadcast-phantom-avl',
        '--evidence-artifact',
        'artifact://recovery/failed-broadcast-phantom-avl.md',
        '--validation-artifact',
        'artifact://recovery/rehearsal-validate.log',
        '--observation-artifact',
        'artifact://recovery/recovery-observe.json',
        '--observation-json',
        'missing-recovery-observe.json',
        '--expected-tx-id',
        EXPECTED_TX_ID,
        '--peg-out-burn-tx-id',
        BURN_TX_ID,
        '--out',
        outTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(outTarget);
    expect(result.stderr).not.toContain('missing-recovery-observe.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps row assembly output guards before observation JSON reads', () => {
    const source = readFileSync(join(process.cwd(), 'src/scripts/testnet-recovery-drill-evidence.ts'), 'utf8');

    expect(source).toContain("import { resolveEvidenceOutputPath } from '../evidence-output-path.js'");
    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain("const observationJson = readEvidenceJsonTarget(args.observationJson!, '--observation-json');");
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf("const observationJson = readEvidenceJsonTarget(args.observationJson!, '--observation-json');"),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf("const observationJson = readEvidenceJsonTarget(args.observationJson!, '--observation-json');"),
    );
  });
});
