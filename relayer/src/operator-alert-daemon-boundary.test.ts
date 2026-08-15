import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const daemonSource = readFileSync(
  join(sourceRoot, 'relayer-daemon.ts'),
  'utf8',
);

function daemonMethod(): string {
  const start = daemonSource.indexOf('  private emitOperatorHealthProjection(');
  const end = daemonSource.indexOf(
    '  private requireCurrentErgoReadQuorumDecision(',
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return daemonSource.slice(start, end);
}

function runtimeLocalClosure(rootRelativePath: string): readonly string[] {
  const visited = new Set<string>();
  const visit = (file: string): void => {
    const normalized = resolve(file);
    if (visited.has(normalized)) return;
    visited.add(normalized);
    const sourceFile = ts.createSourceFile(
      normalized,
      readFileSync(normalized, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of sourceFile.statements) {
      let specifier: ts.Expression | undefined;
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        if (clause?.isTypeOnly) continue;
        if (
          clause
          && clause.name === undefined
          && clause.namedBindings
          && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.every(element => element.isTypeOnly)
        ) continue;
        specifier = statement.moduleSpecifier;
      } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
        specifier = statement.moduleSpecifier;
      }
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      if (!specifier.text.startsWith('.')) continue;
      const candidate = resolve(
        dirname(normalized),
        specifier.text.replace(/\.js$/, '.ts'),
      );
      if (existsSync(candidate)) visit(candidate);
    }
  };
  visit(join(sourceRoot, rootRelativePath));
  return Object.freeze([...visited]
    .map(file => relative(sourceRoot, file).replaceAll('\\', '/'))
    .sort());
}

describe('operator alert daemon boundary', () => {
  it('delivers only after read-only health projection and before log deduplication', () => {
    const method = daemonMethod();
    const projection = method.indexOf('buildBridgeDaemonOperatorHealth({');
    const alert = method.indexOf('runBridgeDaemonOperatorAlerts({');
    const fingerprint = method.indexOf('operatorHealthStateFingerprint(projection)');

    expect(daemonSource).toContain(
      "from './apps/bridge-daemon/operator-alerts.js';",
    );
    expect(projection).toBeGreaterThanOrEqual(0);
    expect(alert).toBeGreaterThan(projection);
    expect(fingerprint).toBeGreaterThan(alert);
    expect(method).toContain("'operator_alert'");
    expect(method).toContain("'operator_alert_delivery_deferred'");
    expect(method).toContain('writeLocalAlert: alert =>');
    expect(method).not.toContain('delivery:');
  });

  it('does not add control-plane capabilities to the health method', () => {
    const method = daemonMethod();

    expect(method).not.toMatch(
      /\b(?:clearHold|releaseHold|runChecker|runSigner|signTransaction|submitTransaction|broadcastTransaction|authorizeFunds)\b/,
    );
    expect(method).not.toMatch(/\b(?:privateKey|mnemonic|boxId|burnId|transactionId)\b/);
    expect(method).not.toContain('error.message');
    expect(method).not.toMatch(/webhook|pager|email|fetch\(|https?:\/\//);
  });

  it('keeps alert imports inside the bounded projection, persistence, and drill surface', () => {
    const allowedRuntimeFiles = new Set([
      'adapters/operator-alert-acknowledgement-state.ts',
      'adapters/operator-alert-delivery-state.ts',
      'adapters/operator-alert-external-delivery.ts',
      'adapters/operator-alert-external-outbox.ts',
      'apps/bridge-daemon/operator-alerts.ts',
      'relayer-daemon.ts',
      'relayer-core/operator-alert-delivery-state.ts',
      'relayer-core/operator-alert-delivery.ts',
      'relayer-core/operator-alert-external-outbox.ts',
      'scripts/operator-alert-delivery-drill.ts',
      'state-tracker.ts',
    ]);
    const files = readdirSync(sourceRoot, {
      recursive: true,
      encoding: 'utf8',
    }).filter(file => file.endsWith('.ts')).map(file => join(sourceRoot, file));
    const importers = files
      .filter(file => !file.endsWith('.test.ts'))
      .filter(file => {
        const source = readFileSync(file, 'utf8');
        return source.includes('operator-alert-delivery')
          || source.includes("apps/bridge-daemon/operator-alerts");
      })
      .map(file => relative(sourceRoot, file).replaceAll('\\', '/'))
      .sort();

    expect(importers).toEqual([...allowedRuntimeFiles].sort());
  });

  it('isolates the persistence codec from delivery and action lookup', () => {
    const stateTrackerSource = readFileSync(
      join(sourceRoot, 'state-tracker.ts'),
      'utf8',
    );
    expect(stateTrackerSource).toContain(
      "from './relayer-core/operator-alert-delivery-state.js';",
    );
    expect(stateTrackerSource).not.toContain(
      "from './relayer-core/operator-alert-delivery.js';",
    );

    const files = readdirSync(sourceRoot, {
      recursive: true,
      encoding: 'utf8',
    }).filter(file => file.endsWith('.ts')).map(file => join(sourceRoot, file));
    const actionDeliveryImporters = files
      .filter(file => !file.endsWith('.test.ts'))
      .filter(file => readFileSync(file, 'utf8').match(
        /from\s+['"][^'"]*relayer-core\/operator-alert-delivery\.js['"]/
      ))
      .map(file => relative(sourceRoot, file).replaceAll('\\', '/'))
      .sort();

    expect(actionDeliveryImporters).toEqual([
      'adapters/operator-alert-external-delivery.ts',
      'apps/bridge-daemon/operator-alerts.ts',
      'scripts/operator-alert-delivery-drill.ts',
    ]);
  });

  it('keeps external transport and acknowledgement outside the daemon value-cycle root', () => {
    expect(daemonSource).toContain('externalOutbox: this.operatorAlertExternalOutbox');
    expect(daemonSource).not.toContain('operator-alert-external-delivery.js');
    expect(daemonSource).not.toContain('operator-alert-worker');
    expect(daemonSource).not.toContain('operator-alert-acknowledgement-verifier');

    const workerSource = readFileSync(
      join(sourceRoot, 'apps/operator-alert-worker/operator-alert-worker.ts'),
      'utf8',
    );
    expect(workerSource).not.toMatch(
      /state-tracker|relayer-daemon|checker|signer|authorization|submission|broadcast|holdClear/,
    );
  });

  it('keeps every runtime-transitive alert root outside funds capabilities', () => {
    const roots = [
      'apps/bridge-daemon/operator-alerts.ts',
      'apps/operator-alert-worker/operator-alert-worker.ts',
      'scripts/operator-alert-external-worker.ts',
      'scripts/operator-alert-acknowledge.ts',
    ];
    const forbidden = /(?:^|\/)(?:state-tracker|relayer-daemon|[^/]*(?:checker|signer|submitter|broadcast|settlement-execution|execution-authorization)[^/]*)\.ts$/;
    for (const root of roots) {
      expect(runtimeLocalClosure(root).filter(file => forbidden.test(file)))
        .toEqual([]);
    }
  });
});
