import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { copiedSelectionEntryExists }
  from './run-substrate-federated-native-two-cycle-worker-v2.js';

const v1 = readFileSync(new URL('./run-substrate-federated-native-two-cycle-worker-v1.ts',
  import.meta.url), 'utf8');
const v2 = readFileSync(new URL('./run-substrate-federated-native-two-cycle-worker-v2.ts',
  import.meta.url), 'utf8');

function callsNamed(source: ts.SourceFile, name: string): readonly ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === name) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

describe('versioned V2 worker source boundary', () => {
  it('keeps the V1 worker immutable and orders the optional observation after its V1 ancestors', () => {
    expect(createHash('sha256').update(v1).digest('hex'))
      .toBe('ca43fb94332eb5a942e64f16c1d61c27d668406b67380880dbce5936348a71fa');
    expect(v1).not.toContain('worker-deposit-funding-stage-v2.json');
    expect(v2).toContain('runSubstrateFederatedNativeTwoCycleWorkerFromArgumentsV2');
    const source = ts.createSourceFile('worker-v2.ts', v2, ts.ScriptTarget.ES2022, true);
    const root = callsNamed(source, 'runSubstrateFederatedGenesisTargetRootV1');
    expect(root).toHaveLength(1);
    expect(root[0]!.arguments).toHaveLength(2);
    expect(root[0]!.arguments[1]!.getText(source)).toContain('lastDepositFunding = null');
    const writes = callsNamed(source, 'writeNewFile');
    const position = (file: string) => {
      const selected = writes.filter(call => call.arguments[0]?.getText(source)
        .includes(`'${file}'`));
      expect(selected).toHaveLength(1);
      return selected[0]!.getStart(source);
    };
    expect(position('worker-failure.json')).toBeLessThan(position('worker-cycle-step.json'));
    expect(position('worker-cycle-step.json'))
      .toBeLessThan(position('worker-deposit-funding-stage-v2.json'));
    expect(v2).toContain('selectNativeDepositFundingWorkerStageV2(');
    expect(v2).not.toContain('types.isProxy(primaryFailure)');
    expect((v2.match(/'worker-deposit-funding-stage-v2\.json'/gu) ?? [])).toHaveLength(3);
    const firstAbsence = v2.indexOf("if (['result.json', 'failure.json']");
    const preentryGuard = v2.slice(firstAbsence, root[0]!.getStart(source));
    const successAbsence = v2.indexOf(
      "copiedSelectionEntryExists(join(invocation.attemptPath, 'worker-deposit-funding-stage-v2.json'))");
    expect(firstAbsence).toBeGreaterThanOrEqual(0);
    expect(preentryGuard).toContain('copiedSelectionEntryExists(join(invocation.attemptPath,');
    expect(preentryGuard).toContain("'worker-deposit-funding-stage-v2.json'");
    expect(firstAbsence).toBeLessThan(root[0]!.getStart(source));
    expect(successAbsence).toBeGreaterThan(root[0]!.getStart(source));
    expect(successAbsence).toBeLessThan(position('worker-result.json'));
  });

  it('treats an occupied dangling link as present and access errors as indeterminate', () => {
    const path = 'synthetic-worker-v2-companion.json';
    let inspected = 0;
    expect(copiedSelectionEntryExists(path, candidate => {
      expect(candidate).toBe(path);
      inspected++;
      return { isSymbolicLink: () => true };
    })).toBe(true);
    expect(inspected).toBe(1);
    expect(copiedSelectionEntryExists(path, () => {
      throw Object.assign(new Error('synthetic absent'), { code: 'ENOENT' });
    })).toBe(false);
    const denied = Object.assign(new Error('synthetic access denied'), { code: 'EACCES' });
    let caught: unknown;
    try { copiedSelectionEntryExists(path, () => { throw denied; }); }
    catch (error) { caught = error; }
    expect(caught).toBe(denied);
  });
});
