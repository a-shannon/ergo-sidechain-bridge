import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const sourcePath = new URL('./substrate-federated-isolated-devnet-ergo-node-process-v1.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const guardName = 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1';
const pauseName = 'pauseSubstrateFederatedIsolatedDevnetOwnedMiningSubmissionV1';
const revalidateName = 'revalidateSubstrateFederatedIsolatedDevnetMiningPauseObservationV1';
const bindName = 'bindOwnedMiningSubmissionPause';
const selectedNames = [guardName, pauseName, revalidateName, bindName];

interface Observation { readonly pauseReceipt: object; readonly snapshot: object }
interface Extracted {
  guard: (target: object) => object;
  pause: (target: object) => Promise<Observation>;
  revalidate: (target: object, observation: Observation) => Promise<void>;
  bind: (target: object, primary: object, witness: object, guard: () => void) => void;
}

type GuardLocation = 'inner' | 'pause' | 'revalidate' | 'first-read' | 'stability' | 'second-read';

// Execute only these exact production bodies. No process owner, network, or custody is admitted by this harness.
function extract(dependencies: Record<string, unknown>, omitGuard?: GuardLocation): Extracted {
  const parsed = ts.createSourceFile(fileURLToPath(sourcePath), source, ts.ScriptTarget.Latest, true);
  const declarations = selectedNames.map(name => {
    const matches = parsed.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matches.length, 1, `one production declaration required: ${name}`);
    assert(matches[0].body);
    return matches[0].getText(parsed);
  });
  let selected = declarations.join('\n');
  if (omitGuard !== undefined) {
    const patterns: Record<GuardLocation, RegExp> = {
      inner: /await validateWatermark\(\);\s*assertOriginalTarget\(\);/gu,
      pause: /const observation = await pause\(\);\s*assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1\(target\);/gu,
      revalidate: /await binding\.revalidate\(\);\s*assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1\(target\);/gu,
      'first-read': /const \[primarySnapshot,[\s\S]*?\]\);\s*assertOriginalTarget\(\);/gu,
      stability: /await assertStableExactSnapshot\(primary, witness, snapshot\);\s*assertOriginalTarget\(\);/gu,
      'second-read': /const \[primaryAfter,[\s\S]*?\]\);\s*assertOriginalTarget\(\);/gu,
    };
    const pattern = patterns[omitGuard];
    assert.equal([...selected.matchAll(pattern)].length, 1, 'one isolated post-await guard mutant required');
    selected = selected.replace(pattern, match => match.slice(0, match.indexOf(';') + 1));
  }
  const code = ts.transpileModule(selected, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  assert(!/\brequire\s*\(/u.test(code), 'selected bodies must remain import-free');
  return new Function('exports', ...Object.keys(dependencies), `${code}\nreturn {
    guard: ${guardName}, pause: ${pauseName}, revalidate: ${revalidateName}, bind: ${bindName}
  };`)({}, ...Object.values(dependencies)) as Extracted;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => { resolve = complete; });
  return { promise, resolve };
}

function harness(omitGuard?: GuardLocation) {
  const target = Object.freeze({});
  const primary = Object.freeze({ role: 'primary', mode: 'mining', child: {} });
  const witness = Object.freeze({ role: 'witness', mode: 'mining', child: {} });
  const snapshot = Object.freeze({ network: 'devnet', fullHeight: 22, indexedHeight: 22, headerIdHex: 'cd'.repeat(32) });
  const receipt = Object.freeze({ latestAppliedBlock: Object.freeze({ height: 21, headerId: 'ab'.repeat(32) }) });
  const active = new WeakSet<object>([target]);
  const bindings = new WeakMap<object, object>();
  const pauses = new WeakMap<object, () => Promise<Observation>>();
  const observations = new WeakMap<object, { target: object; revalidate: () => Promise<void> }>();
  const register = vi.spyOn(observations, 'set');
  const pauseTransport = vi.fn(async () => receipt);
  const guard = vi.fn(() => {});
  bindings.set(target, { assertActiveProcesses: guard, processBindingDigestHex: 'process', executionTargetIdentityDigestHex: 'target' });
  const exact = vi.fn(() => {});
  const stable = vi.fn(async () => {});
  const read = vi.fn(async () => snapshot);
  const canonical = vi.fn(async () => [receipt.latestAppliedBlock.headerId]);
  const indexed = vi.fn();
  const api = extract({
    OWNED_EXECUTION_TARGET_BINDINGS: bindings,
    ACTIVE_OWNED_EXECUTION_TARGETS: active,
    OWNED_MINING_SUBMISSION_CONTROLS: new WeakMap([[primary.child, { pause: pauseTransport }]]),
    OWNED_MINING_SUBMISSION_PAUSE_TARGETS: pauses,
    OWNED_MINING_SUBMISSION_PAUSE_OBSERVATIONS: observations,
    assertLive: vi.fn(),
    waitForCommonIndexedSnapshot: vi.fn(async () => snapshot),
    readTargetSnapshot: read,
    getJson: canonical,
    assertSubstrateFederatedIsolatedDevnetPausedMiningIndexedSnapshotV1: indexed,
    assertExactSnapshot: exact,
    assertStableExactSnapshot: stable,
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN: 'primary-double',
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN: 'witness-double',
  }, omitGuard);
  return { api, target, primary, witness, snapshot, receipt, active, pauses, observations,
    register, pauseTransport, guard, exact, stable, read, canonical, indexed };
}

describe('owned mining pause production asynchronous lifetime boundaries', () => {
  it('registers and revalidates the same observation while its exact test-owned target stays active', async () => {
    const h = harness();
    h.api.bind(h.target, h.primary, h.witness, h.guard);
    const observation = await h.api.pause(h.target);
    expect(observation).toEqual({ pauseReceipt: h.receipt, snapshot: h.snapshot });
    expect(Object.isFrozen(observation)).toBe(true);
    expect(h.observations.get(observation)?.target).toBe(h.target);
    await h.api.revalidate(h.target, observation);
    expect(h.pauseTransport).toHaveBeenCalledTimes(1);
    expect(h.register).toHaveBeenCalledTimes(1);
    expect(h.stable).toHaveBeenCalledTimes(2);
    expect(h.read).toHaveBeenCalledTimes(8);
    expect(h.canonical).toHaveBeenCalledTimes(8);
  });

  it.each((['first-read', 'stability', 'second-read'] as const).flatMap(stage =>
    [false, true].map(omit => ({ stage, omit }))))(
    'stops at pending $stage revocation before subsequent work (omit guard=$omit)', async ({ stage, omit }) => {
      const h = harness(omit ? stage : undefined);
      const entered = deferred();
      const gate = deferred();
      if (stage === 'stability') {
        h.stable.mockImplementationOnce(() => { entered.resolve(); return gate.promise; });
      } else {
        let reads = 0;
        h.read.mockImplementation(async () => {
          reads += 1;
          if (reads === (stage === 'first-read' ? 1 : 3)) {
            entered.resolve();
            await gate.promise;
          }
          return h.snapshot;
        });
      }
      h.api.bind(h.target, h.primary, h.witness, h.guard);
      const pending = h.pauses.get(h.target)!();
      await entered.promise;
      expect(h.active.has(h.target)).toBe(true);
      h.active.delete(h.target);
      gate.resolve();
      // Later guards still reject every mutant; the deciding difference is work after revocation.
      await expect(pending).rejects.toThrow('not owned by the active mining action');
      expect(h.register).not.toHaveBeenCalled();
      const expectedReads = stage === 'second-read' || (stage === 'stability' && omit) ? 4 : 2;
      expect(h.read).toHaveBeenCalledTimes(expectedReads);
      expect(h.canonical).toHaveBeenCalledTimes(expectedReads);
      expect(h.stable).toHaveBeenCalledTimes(stage === 'first-read' && !omit ? 0 : 1);
      const expectedObservations = stage === 'first-read' ? (omit ? 1 : 0)
        : stage === 'second-read' && omit ? 2 : 1;
      expect(h.indexed).toHaveBeenCalledTimes(expectedObservations);
      expect(h.exact).toHaveBeenCalledTimes(expectedObservations * 2);
    },
  );

  it.each([false, true])('isolates inner validation-to-registration revocation (omit guard=%s)', async omit => {
    const h = harness(omit ? 'inner' : undefined);
    const gate = deferred();
    h.stable.mockImplementationOnce(() => gate.promise);
    let scheduled = false;
    h.guard.mockImplementation(() => {
      if (h.exact.mock.calls.length === 4 && !scheduled) {
        scheduled = true;
        queueMicrotask(() => h.active.delete(h.target));
      }
    });
    h.api.bind(h.target, h.primary, h.witness, h.guard);
    // Invoke the real private closure directly, so the public outer guard cannot hide this mutant.
    const pending = h.pauses.get(h.target)!();
    gate.resolve();
    if (omit) {
      await expect(pending).resolves.toEqual({ pauseReceipt: h.receipt, snapshot: h.snapshot });
      expect(h.register).toHaveBeenCalledTimes(1);
    } else {
      await expect(pending).rejects.toThrow('not owned by the active mining action');
      expect(h.register).not.toHaveBeenCalled();
    }
    expect(scheduled).toBe(true);
    expect(h.active.has(h.target)).toBe(false);
  });

  it.each([false, true])('isolates private pause-to-public return revocation (omit guard=%s)', async omit => {
    const h = harness(omit ? 'pause' : undefined);
    const gate = deferred();
    const observation = Object.freeze({ pauseReceipt: h.receipt, snapshot: h.snapshot });
    h.pauses.set(h.target, async () => {
      await gate.promise;
      h.api.guard(h.target);
      queueMicrotask(() => h.active.delete(h.target));
      return observation;
    });
    const pending = h.api.pause(h.target);
    gate.resolve();
    if (omit) await expect(pending).resolves.toBe(observation);
    else await expect(pending).rejects.toThrow('not owned by the active mining action');
    expect(h.active.has(h.target)).toBe(false);
  });

  it.each([false, true])('isolates private revalidation-to-public return revocation (omit guard=%s)', async omit => {
    const h = harness(omit ? 'revalidate' : undefined);
    const gate = deferred();
    const observation = Object.freeze({ pauseReceipt: h.receipt, snapshot: h.snapshot });
    h.observations.set(observation, { target: h.target, revalidate: async () => {
      await gate.promise;
      h.api.guard(h.target);
      queueMicrotask(() => h.active.delete(h.target));
    } });
    const pending = h.api.revalidate(h.target, observation);
    gate.resolve();
    if (omit) await expect(pending).resolves.toBeUndefined();
    else await expect(pending).rejects.toThrow('not owned by the active mining action');
    expect(h.active.has(h.target)).toBe(false);
  });
});
