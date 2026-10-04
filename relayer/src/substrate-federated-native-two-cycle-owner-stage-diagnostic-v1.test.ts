import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';
import { ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1, type IsolatedErgoNodePostCallbackStageV1 }
  from './substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { type NativeTwoCycleCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { createNativeTwoCycleWorkerOwnerStageV1, parseNativeTwoCycleWorkerOwnerStageV1,
  createNativeTwoCycleParentOwnerStageV1, parseNativeTwoCycleParentOwnerStageV1 }
  from './substrate-federated-native-two-cycle-owner-stage-diagnostic-v1.js';

const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminalDigest = 'd'.repeat(64);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_OWNER_STAGE_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_OWNER_STAGE_V1';
const text = (value: unknown) => `${canonicalJson(value)}\n`;
function fixture(stage: IsolatedErgoNodePostCallbackStageV1 = 'completion-check') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
    'root-or-cleanup', new Error('private cause'));
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: 'cycle-1', cleanupErrorCount: 1, ergoNodeStartupPhase: null });
  const cycleStep = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle: 'cycle-1', step: 'cycle-summary' });
  const worker = createNativeTwoCycleWorkerOwnerStageV1(bindings,
    text(failure), text(root), text(cycleStep), stage);
  const parent = createNativeTwoCycleParentOwnerStageV1(bindings, terminalDigest,
    text(failure), text(root), text(cycleStep), text(worker));
  return { failure, root, cycleStep, worker, parent };
}
type Fixture = ReturnType<typeof fixture>;
function parseWorker(candidate: string, f: Fixture) {
  return parseNativeTwoCycleWorkerOwnerStageV1(candidate, bindings,
    text(f.failure), text(f.root), text(f.cycleStep));
}
function parseParent(candidate: string, f: Fixture) {
  return parseNativeTwoCycleParentOwnerStageV1(candidate, bindings, terminalDigest,
    text(f.failure), text(f.root), text(f.cycleStep), text(f.worker));
}
function resign(record: Record<string, unknown>, domain: string) {
  const { receiptDigestHex: ignored, ...body } = record; void ignored;
  return { ...body, receiptDigestHex: sha256CanonicalJson(body, domain) };
}
function replacement(field: string): unknown {
  if (field === 'cycle') return 'cycle-2';
  if (field === 'step') return 'tracker-check';
  if (field === 'ownerStage') return 'unknown';
  if (field.endsWith('Hex')) return 'e'.repeat(64);
  if (field === 'expectedBridgeCommit') return 'e'.repeat(40);
  if (field === 'version') return 2;
  if (field.endsWith('Established') || field === 'rawCausePublished') return true;
  return 'foreign';
}
const workerFields = ['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
  'pathIdentityDigestHex', 'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
  'workerCycleStepReceiptDigestHex', 'cycle', 'step', 'ownerOperation', 'ownerStage',
  'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex'];
const parentFields = [...workerFields, 'failureReceiptDigestHex', 'workerOwnerStageReceiptDigestHex'];

describe('bounded native owner-stage diagnostic lineage', () => {
  it.each(ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1)('roundtrips allowlisted stage %s', stage => {
    const f = fixture(stage);
    expect(parseWorker(text(f.worker), f)).toEqual(f.worker);
    expect(parseParent(text(f.parent), f)).toEqual(f.parent);
    expect(f.parent).toMatchObject({ cycle: 'cycle-1', step: 'cycle-summary', ownerOperation: 'withMiningActiveExecutionTarget', ownerStage: stage,
      failureReceiptDigestHex: terminalDigest,
      workerFailureReceiptDigestHex: f.failure.receiptDigestHex,
      workerRootPhaseV2ReceiptDigestHex: f.root.receiptDigestHex,
      workerCycleStepReceiptDigestHex: f.cycleStep.receiptDigestHex,
      workerOwnerStageReceiptDigestHex: f.worker.receiptDigestHex,
      operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
    expect(Object.isFrozen(f.worker)).toBe(true);
    expect(Object.isFrozen(f.parent)).toBe(true);
    expect(text(f.parent)).not.toMatch(/private|cause|[A-Za-z]:[\\/]/u);
  });

  it.each(workerFields)('rejects independently changed worker %s after rehash', field => {
    const f = fixture(); const changed = { ...f.worker, [field]: replacement(field) };
    expect(() => parseWorker(text(field === 'receiptDigestHex'
      ? changed : resign(changed, workerDomain)), f)).toThrow();
  });
  it.each(parentFields)('rejects independently changed parent %s after rehash', field => {
    const f = fixture(); const changed = { ...f.parent,
      [field]: field === 'ownerStage' ? 'mining-shutdown' : replacement(field) };
    expect(() => parseParent(text(field === 'receiptDigestHex'
      ? changed : resign(changed, parentDomain)), f)).toThrow();
  });

  describe.each(['worker', 'parent'] as const)('%s canonical bounded text', surface => {
    it.each(['missing', 'extra', 'duplicate', 'escaped duplicate', 'whitespace', 'no newline',
      'CRLF', 'second newline', 'invalid', 'nonobject', 'array', 'unicode bound',
      'wrong domain', 'legacy domain', 'unseparated domain'] as const)('rejects %s', mutation => {
      const f = fixture(); const record = surface === 'worker' ? f.worker : f.parent;
      const domain = surface === 'worker' ? workerDomain : parentDomain;
      const { status: ignored, ...missing } = record; void ignored;
      const candidate = mutation === 'missing' ? text(resign(missing, domain))
        : mutation === 'extra' ? text(resign({ ...record, stageData: { code: 'private' } }, domain))
          : mutation === 'duplicate' ? text(record).replace('"version":1', '"version":1,"version":1')
            : mutation === 'escaped duplicate' ? text(record).replace('"version":1', '"version":1,"\\u0076ersion":1')
              : mutation === 'whitespace' ? ` ${text(record)}`
                : mutation === 'no newline' ? canonicalJson(record)
                  : mutation === 'CRLF' ? `${canonicalJson(record)}\r\n`
                    : mutation === 'second newline' ? `${text(record)}\n`
                      : mutation === 'invalid' ? '{' : mutation === 'nonobject' ? 'null\n'
                        : mutation === 'array' ? '[]\n' : mutation === 'unicode bound' ? 'é'.repeat(8193)
                          : mutation === 'wrong domain' ? text(resign({ ...record },
                            surface === 'worker' ? parentDomain : workerDomain))
                            : mutation === 'legacy domain' ? text(resign({ ...record },
                              'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_CYCLE_STEP_V1'))
                              : text(resign({ ...record }, ''));
      expect(() => surface === 'worker' ? parseWorker(candidate, f) : parseParent(candidate, f))
        .toThrow(mutation === 'unicode bound' ? /bounded text/u : undefined);
    });
    it('rejects nontext', () => {
      const f = fixture();
      expect(() => surface === 'worker' ? parseWorker(null as never, f)
        : parseParent(null as never, f)).toThrow(/bounded text/u);
    });
  });

  describe.each(['failure', 'root', 'cycleStep'] as const)('%s ancestor', ancestor => {
    it.each(['digest', 'noncanonical', 'duplicate', 'oversized', 'foreign binding'] as const)(
      'rejects isolated %s', mutation => {
        const f = fixture(); const record = f[ancestor];
        const domains = { failure: 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_FAILURE_DIAGNOSTIC_V1',
          root: 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_ROOT_PHASE_V2',
          cycleStep: 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_CYCLE_STEP_V1' };
        const changed = mutation === 'digest' ? text({ ...record, receiptDigestHex: 'e'.repeat(64) })
          : mutation === 'noncanonical' ? ` ${text(record)}`
            : mutation === 'duplicate' ? text(record).replace('"version":', '"version":1,"version":')
              : mutation === 'oversized' ? 'é'.repeat(8193)
                : text(resign({ ...record, configSha256Hex: 'e'.repeat(64) }, domains[ancestor]));
        const failureText = ancestor === 'failure' ? changed : text(f.failure);
        const rootText = ancestor === 'root' ? changed : text(f.root);
        const cycleStepText = ancestor === 'cycleStep' ? changed : text(f.cycleStep);
        expect(() => parseNativeTwoCycleWorkerOwnerStageV1(text(f.worker), bindings,
          failureText, rootText, cycleStepText)).toThrow();
        expect(() => parseNativeTwoCycleParentOwnerStageV1(text(f.parent), bindings, terminalDigest,
          failureText, rootText, cycleStepText, text(f.worker))).toThrow();
      });
  });

  it.each([['cycle-2', 'cycle-summary'], ['cycle-1', 'tracker-check'],
    ['cycle-1', 'issuance-execution']] as const)('rejects valid %s/%s ancestry', (cycle, step) => {
    const f = fixture(); const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
      { primaryPhase: cycle, cleanupErrorCount: 1, ergoNodeStartupPhase: null });
    const cycleStep = createNativeTwoCycleWorkerCycleStepV1(bindings, text(f.failure), text(root),
      { cycle, step: step as NativeTwoCycleCycleStepV1 });
    expect(() => createNativeTwoCycleWorkerOwnerStageV1(bindings,
      text(f.failure), text(root), text(cycleStep), 'completion-check')).toThrow(/cycle-1 cycle-summary/u);
    expect(() => parseNativeTwoCycleWorkerOwnerStageV1(text(f.worker), bindings,
      text(f.failure), text(root), text(cycleStep))).toThrow(/cycle-1 cycle-summary/u);
  });

  it('binds exact valid root and cycle-step ancestry, including changed cleanup data', () => {
    const f = fixture(); const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
      { primaryPhase: 'cycle-1', cleanupErrorCount: 2, ergoNodeStartupPhase: null });
    const cycleStep = createNativeTwoCycleWorkerCycleStepV1(bindings, text(f.failure), text(root),
      { cycle: 'cycle-1', step: 'cycle-summary' });
    expect(() => parseNativeTwoCycleWorkerOwnerStageV1(text(f.worker), bindings,
      text(f.failure), text(root), text(cycleStep))).toThrow(/lineage/u);
    // Updating one self-declared lineage copy and its digest cannot replace all
    // hashes reconstructed from the actual validated ancestors.
    const changed = resign({ ...f.worker, workerRootPhaseV2ReceiptDigestHex: root.receiptDigestHex }, workerDomain);
    expect(() => parseNativeTwoCycleWorkerOwnerStageV1(text(changed), bindings,
      text(f.failure), text(root), text(cycleStep))).toThrow(/lineage/u);
    const worker = createNativeTwoCycleWorkerOwnerStageV1(bindings,
      text(f.failure), text(root), text(cycleStep), 'completion-check');
    expect(() => parseNativeTwoCycleParentOwnerStageV1(text(f.parent), bindings, terminalDigest,
      text(f.failure), text(root), text(cycleStep), text(worker))).toThrow(/lineage/u);
  });

  it('rejects a valid worker failure at a different stage', () => {
    const f = fixture(); const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
      'pre-root', new Error('private'));
    expect(() => parseNativeTwoCycleWorkerOwnerStageV1(text(f.worker), bindings,
      text(failure), text(f.root), text(f.cycleStep))).toThrow();
  });
  it('binds the terminal digest even when the replacement is valid lowercase hex', () => {
    const f = fixture();
    expect(() => parseNativeTwoCycleParentOwnerStageV1(text(f.parent), bindings, 'e'.repeat(64),
      text(f.failure), text(f.root), text(f.cycleStep), text(f.worker))).toThrow();
    expect(() => createNativeTwoCycleParentOwnerStageV1(bindings, 'D'.repeat(64),
      text(f.failure), text(f.root), text(f.cycleStep), text(f.worker))).toThrow(/hex/u);
  });
  it.each(['unknown', null, { ownerStage: 'completion-check', stageData: 'private' }] as const)(
    'rejects unsupported or structured stage %j', stage => {
      const f = fixture();
      expect(() => createNativeTwoCycleWorkerOwnerStageV1(bindings,
        text(f.failure), text(f.root), text(f.cycleStep), stage as never)).toThrow(/unsupported/u);
      expect(() => parseWorker(text(resign({ ...f.worker, ownerStage: stage }, workerDomain)), f))
        .toThrow(/unsupported/u);
    });
  it.each(['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex'] as const)(
    'rejects invalid expected %s binding', field => {
      const f = fixture(); const changed = { ...bindings, [field]: 'UPPERCASE' };
      expect(() => createNativeTwoCycleWorkerOwnerStageV1(changed,
        text(f.failure), text(f.root), text(f.cycleStep), 'completion-check')).toThrow(/hex/u);
    });
  it('rejects extra binding fields', () => {
    const f = fixture();
    expect(() => createNativeTwoCycleWorkerOwnerStageV1({ ...bindings, extra: true } as never,
      text(f.failure), text(f.root), text(f.cycleStep), 'completion-check')).toThrow(/fields/u);
  });

  it('treats coordinated allowlisted stage rehashes as self-consistency, not authentication', () => {
    const f = fixture(); const changedWorker = resign({ ...f.worker, ownerStage: 'mining-shutdown' }, workerDomain);
    const parsed = parseWorker(text(changedWorker), f);
    expect(parsed.ownerStage).toBe('mining-shutdown');
    expect(parsed.operationCompletionEstablished).toBe(false);
    const parent = createNativeTwoCycleParentOwnerStageV1(bindings, terminalDigest,
      text(f.failure), text(f.root), text(f.cycleStep), text(changedWorker));
    expect(parseNativeTwoCycleParentOwnerStageV1(text(parent), bindings, terminalDigest,
      text(f.failure), text(f.root), text(f.cycleStep), text(changedWorker))).toEqual(parent);
    expect(() => parseParent(text(parent), f)).toThrow();
  });
});
