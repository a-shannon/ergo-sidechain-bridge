import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const srcRoot = join(process.cwd(), 'src');
const daemonSource = readFileSync(
  join(srcRoot, 'relayer-daemon.ts'),
  'utf8',
);
const rewardSource = readFileSync(
  join(srcRoot, 'scripts', 'devnet-consolidate-rewards.ts'),
  'utf8',
);
const drillSource = readFileSync(
  join(srcRoot, 'scripts', 'ergo-signer-unavailability-drill.ts'),
  'utf8',
);

function importDeclarationHasRuntimeBinding(
  declaration: ts.ImportDeclaration,
): boolean {
  const clause = declaration.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return Boolean(bindings);
  return bindings.elements.some(element => !element.isTypeOnly);
}

function exportDeclarationHasRuntimeBinding(
  declaration: ts.ExportDeclaration,
): boolean {
  if (declaration.isTypeOnly) return false;
  const clause = declaration.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return true;
  return clause.elements.some(element => !element.isTypeOnly);
}

function staticRuntimeRelativeSpecifiers(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node)
      && importDeclarationHasRuntimeBinding(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.startsWith('.')
    ) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node)
      && exportDeclarationHasRuntimeBinding(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.startsWith('.')
    ) {
      specifiers.add(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...specifiers];
}

function resolveRuntimeDependency(sourcePath: string, specifier: string): string {
  const base = resolve(dirname(sourcePath), specifier);
  const candidates = base.endsWith('.js')
    ? [base.slice(0, -3) + '.ts', base]
    : [base, `${base}.ts`, join(base, 'index.ts')];
  const target = candidates.find(candidate => existsSync(candidate));
  if (!target) {
    throw new Error(`unresolved runtime dependency ${specifier} from ${sourcePath}`);
  }
  return target;
}

function staticRuntimeDependencyClosure(entryPath: string): string[] {
  const pending = [entryPath];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const specifier of staticRuntimeRelativeSpecifiers(current)) {
      pending.push(resolveRuntimeDependency(current, specifier));
    }
  }
  return [...visited]
    .map(path => relative(srcRoot, path).replace(/\\/g, '/'))
    .sort();
}

describe('Ergo signer daemon containment boundary', () => {
  it('keeps the observation-only daemon free of signer capability', () => {
    expect(daemonSource).not.toContain('getSignerKeys');
    expect(daemonSource).not.toContain('ergoSigner');
    expect(daemonSource).not.toContain('ErgoSignerUnavailableError');
    expect(daemonSource).not.toContain('createBridgeDaemonErgoSignerBoundary');
    expect(daemonSource).not.toContain('containErgoSignerUnavailable');
    expect(daemonSource).not.toContain('signer loading');
    expect(daemonSource).not.toContain('keys.address');
    expect(daemonSource).toContain(
      "signerAvailability: 'not_configured'",
    );
    expect(daemonSource).toContain(
      'Ergo signer:        not configured (observation-only daemon)',
    );
  });

  it('keeps signer capability outside the daemon static runtime closure', () => {
    const closure = staticRuntimeDependencyClosure(
      join(srcRoot, 'relayer-daemon.ts'),
    );

    expect(closure).toContain(
      'authenticated-settlement-candidate-revalidation.ts',
    );
    expect(closure).toContain('ergo-unsigned-transaction.ts');
    expect(closure).toContain('authenticated-settlement-jvm-check.ts');
    expect(closure).toContain('ergo-check-profiles.ts');
    expect(closure).not.toContain('fleet-signer.ts');
    expect(closure).not.toContain(
      'apps/bridge-daemon/ergo-signer-containment.ts',
    );
  });

  it('preserves the separately bounded devnet reward signer', () => {
    expect(rewardSource).toContain('executeDevnetRewardConsolidation');
    expect(rewardSource).toContain('signTransactionForSubmission');
    expect(rewardSource).toContain('const response = await ncheck(');
    expect(rewardSource).toContain('journal: {');
    expect(rewardSource).toContain('transport: {');
    expect(rewardSource).toContain('const response = await npostDirect(');
    expect(rewardSource).not.toContain('BridgeRelayerDaemon');
  });

  it('retains signer-failure behavior only as a config-free drill model', () => {
    expect(drillSource).toContain('createBridgeDaemonErgoSignerBoundary');
    expect(drillSource).toContain('ErgoSignerUnavailableError');
    expect(drillSource).not.toMatch(/process\.env|getSignerKeys|fleet-signer/i);
    expect(daemonSource).not.toContain('submitPegInCommittedVaultTransition');
    expect(daemonSource).not.toContain('legacy-aggregate-settlement-execution');
    expect(daemonSource).not.toContain('submitExplicitAggregate');
    expect(daemonSource).not.toMatch(
      /wallet\/transaction\/sign|wallet\/transaction\/generateCommitments/,
    );
  });
});
