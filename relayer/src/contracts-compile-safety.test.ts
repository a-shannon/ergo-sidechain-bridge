import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  bindCompiledContractIdentity,
  canonicalizeCompiledErgoTreeHex,
  deriveCompiledErgoTreeHashHex,
} from './scripts/compiled-contract-identity.js';
import {
  prepareCheckOnlyFederatedSettlementFamilySource,
  prepareCheckOnlyFederatedTrackerSource,
} from './scripts/compile-contracts.js';
import {
  createContractsCheckNodeClient,
} from './scripts/contracts-check-node-client.js';

describe('contracts compile check safety', () => {
  const source = readFileSync(join(process.cwd(), 'src/scripts/compile-contracts.ts'), 'utf8');

  it('keeps contracts:check away from dotenv, deployment state, and signer secrets', () => {
    expect(source).not.toContain("import 'dotenv/config'");
    expect(source).not.toContain('import { ErgoClient }');
    expect(source).not.toContain('import { getSignerKeys }');
    expect(source).toContain("await import('dotenv/config')");
    expect(source).toContain("await import('../ergo-client.js')");
    expect(source).toContain("await import('../fleet-signer.js')");
    expect(source).toContain('createContractsCheckNodeClient(');
    expect(source).not.toContain('process.env.ERGO_API_KEY');
    expect(source).not.toContain('process.env.EVM_PRIVATE_KEY');

    const mainStart = source.indexOf('async function main()');
    const checkOnlyGuard = source.indexOf('if (CHECK_ONLY) {', mainStart);
    const checkOnlyClient = source.indexOf(
      'createContractsCheckNodeClient(',
      checkOnlyGuard,
    );
    const nonCheckBranch = source.indexOf('} else {', checkOnlyClient);
    const dotenvImport = source.indexOf("await import('dotenv/config')");
    const ergoClientImport = source.indexOf("await import('../ergo-client.js')");
    expect(checkOnlyGuard).toBeGreaterThan(mainStart);
    expect(checkOnlyClient).toBeGreaterThan(checkOnlyGuard);
    expect(checkOnlyClient).toBeLessThan(nonCheckBranch);
    expect(dotenvImport).toBeGreaterThan(nonCheckBranch);
    expect(ergoClientImport).toBeGreaterThan(dotenvImport);

    const committeeStart = source.indexOf('async function resolveCommitteeConfig');
    const committeeCheckOnly = source.indexOf('if (CHECK_ONLY)', committeeStart);
    const committeeDeployedRead = source.indexOf('readJson(DEPLOYED_STATE_PATH)', committeeStart);
    const committeeSignerImport = source.indexOf("await import('../fleet-signer.js')", committeeStart);
    expect(committeeCheckOnly).toBeGreaterThan(committeeStart);
    expect(committeeCheckOnly).toBeLessThan(committeeDeployedRead);
    expect(committeeCheckOnly).toBeLessThan(committeeSignerImport);

    const unlockStart = source.indexOf('// MainChainUnlock: needs real SCS NFT from deployed_state');
    const unlockCheckOnly = source.indexOf('if (CHECK_ONLY)', unlockStart);
    const unlockDeployedRead = source.indexOf('readJson(DEPLOYED_STATE_PATH)', unlockStart);
    expect(unlockCheckOnly).toBeGreaterThan(unlockStart);
    expect(unlockCheckOnly).toBeLessThan(unlockDeployedRead);
  });

  it('keeps the complete check-only import closure credential-free', () => {
    const entry = join(process.cwd(), 'src/scripts/compile-contracts.ts');
    const { files: closure, dynamicImports } =
      collectCheckOnlyImportClosure(entry);
    const normalizedPaths = [...closure].map(path => path.replaceAll('\\', '/'));
    const dependencySource = [...closure]
      .filter(path => resolve(path) !== resolve(entry))
      .map(path => readFileSync(path, 'utf8'))
      .join('\n');

    for (const forbiddenSuffix of [
      '/config.ts',
      '/ergo-client.ts',
      '/fleet-signer.ts',
    ]) {
      expect(normalizedPaths.some(path => path.endsWith(forbiddenSuffix)))
        .toBe(false);
    }
    expect(dependencySource).not.toMatch(
      /ERGO_API_KEY|EVM_PRIVATE_KEY|getSignerKeys|dotenv\/config/,
    );
    expect(dynamicImports).toEqual([
      '../ergo-client.js',
      '../fleet-signer.js',
      'dotenv/config',
      'ergo-lib-wasm-nodejs',
    ]);
  });

  it('accepts only a credential-free compiler node origin', () => {
    expect(() => createContractsCheckNodeClient('http://127.0.0.1:9052'))
      .not.toThrow();
    for (const unsafe of [
      'http://user:password@127.0.0.1:9052',
      'http://127.0.0.1:9052/?x-api-key=secret',
      'http://127.0.0.1:9052/?signature=secret',
      'http://127.0.0.1:9052/api',
      'http://127.0.0.1:9052/#credential',
    ]) {
      expect(() => createContractsCheckNodeClient(unsafe))
        .toThrow(/credential|origin/i);
    }
  });

  it('keeps check output deterministic and failure-visible', () => {
    expect(source).toContain('CHECK_ONLY_COMMITTEE_PUBKEY_HEXES');
    expect(source).toContain('CHECK_ONLY_COMMITTEE_THRESHOLD');
    expect(source).toContain('CHECK_ONLY_TRACKER_NFT_ID');
    expect(source).toContain('CHECK_ONLY_DUP_NFT_ID');
    expect(source).toContain('CHECK_ONLY_SCS_NFT_ID');
    expect(source).toContain('CHECK_ONLY_SETTLEMENT_VAULT_ERGOTREE');
    expect(source).toContain('CHECK_ONLY_AUTHENTICATED_UNLOCK_HASH');
    expect(source).toContain("'MainChainAggregateUnlockTrustless.es'");
    expect(source).toContain("'MainChainAggregateUnlockAuthenticated.es'");
    expect(source).toContain("'DoubleUnlockPreventionAuthenticated.es'");
    expect(source).toContain("'SPVTrackerSubstrateFederatedV1.es'");
    expect(source).toContain('prepareCheckOnlyFederatedTrackerSource');
    expect(source).toContain('prepareCheckOnlyFederatedSettlementFamilySource');
    expect(source).toContain('FEDERATED_TRACKER_VECTOR_SHA256');
    expect(source).toContain('FEDERATED_TRACKER_IDENTITY_SHA256');
    expect(source).toContain(
      'federated tracker compiled ErgoTree differs from the frozen identity',
    );
    expect(source).toContain('non-deployed federated candidate and is check-only');
    expect(source).toContain(
      "'MainChainAggregateUnlockAuthenticatedExternalFeeV1.es'",
    );
    expect(source).toContain(
      "'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es'",
    );
    expect(
      source.indexOf("'MainChainAggregateUnlockAuthenticatedExternalFeeV1.es'"),
    ).toBeLessThan(
      source.indexOf("'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es'"),
    );
    expect(source).toContain('EXTERNAL_FEE_CANDIDATE_FILES.has(filename)');
    expect(source).toContain(
      'compiledThisRun.MainChainAggregateUnlockAuthenticatedExternalFeeV1?.ergoTreeHex',
    );
    expect(source).toContain(
      "'AUTHENTICATED_EXTERNAL_FEE_UNLOCK_HASH_PLACEHOLDER'",
    );
    expect(source).toContain('deriveCompiledErgoTreeHashHex(');
    expect(source).toContain('bindCompiledContractIdentity(');
    expect(source).toContain("'MainChainAggregateUnlockBatch.es'");
    expect(source).toContain('AGGREGATE_UNLOCK_PLACEHOLDER_FILES.has(filename)');
    expect(source).toContain("source.includes('SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER')");
    expect(source).toContain('const compiled: Record<string, CompiledContract> = CHECK_ONLY ? {} : readJson(OUTPUT_PATH);');
    expect(source).toContain('process.exit(1);');
  });

  it('resolves the exact check-only federated tracker and no other identity', () => {
    const template = readFileSync(
      join(process.cwd(), '../contracts/SPVTrackerSubstrateFederatedV1.es'),
      'utf8',
    );
    const resolved = prepareCheckOnlyFederatedTrackerSource(template);

    expect(resolved).toContain('SPVTrackerSubstrateFederatedV1');
    expect(resolved).toContain('atLeast(2, ergoAdmissionKeys)');
    expect(resolved).not.toMatch(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/);
    expect(createHash('sha256').update(resolved).digest('hex')).toBe(
      '7b8a1d7efe253360dfb2ae21ecd44199c061176e7e73a6f87960b66e304311d8',
    );
    expect(() => prepareCheckOnlyFederatedTrackerSource(
      template.replace('SPVTrackerSubstrateFederatedV1', 'drifted'),
    )).toThrow(/template SHA-256 mismatch/);
  });

  it('resolves the exact three-contract federated settlement family', () => {
    for (const [filename, expectedSha256] of [
      [
        'DoubleUnlockPreventionSubstrateFederatedV1.es',
        '292df2012b71fe85643277ebc051d36aa5b21f0eafe7603572a0177f81a42475',
      ],
      [
        'MainChainLockPooledReserveV6.es',
        'a8f5aa39976829580c5b7755caf9d66edfe114179161e400fc4d14b71d670c87',
      ],
      [
        'MainChainPooledReserveValidityApplicationV6.es',
        '74e1d560985898772a325a3c98813fc805b2a9a713fa3aceb559a29e3ebce8ef',
      ],
    ] as const) {
      const template = readFileSync(
        join(process.cwd(), '../contracts', filename),
        'utf8',
      );
      const resolved = prepareCheckOnlyFederatedSettlementFamilySource(
        filename,
        template,
      );
      expect(resolved).not.toMatch(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/);
      expect(createHash('sha256').update(resolved).digest('hex'))
        .toBe(expectedSha256);
      expect(() => prepareCheckOnlyFederatedSettlementFamilySource(
        filename,
        `${template}\n`,
      )).toThrow(/template SHA-256 mismatch/);
    }
    expect(() => prepareCheckOnlyFederatedSettlementFamilySource(
      'unknown.es',
      'sigmaProp(false)',
    )).toThrow(/unknown federated settlement-family contract/);
  });

  it('rejects malformed compiler ErgoTrees before dependency hashing', () => {
    const compiledTree = `0008cd02${'11'.repeat(32)}`;
    const compiledAddress =
      '5AgXz2JnXjP5CKuBXTezLuLsdFzeeQW1CvN2Y2kP57LwEFDjGSSZFTPh';
    expect(canonicalizeCompiledErgoTreeHex(
      `0x${compiledTree.toUpperCase()}`,
    )).toBe(compiledTree);
    expect(bindCompiledContractIdentity(
      compiledAddress,
      compiledTree.toUpperCase(),
    )).toEqual({
      address: compiledAddress,
      ergoTreeHex: compiledTree,
    });
    expect(deriveCompiledErgoTreeHashHex(compiledTree)).toBe(
      '94986c3ea5f3f1b903d33e1ebda062f86455a03e0dd1926b6a728bf39d11ea71',
    );
    expect(() => bindCompiledContractIdentity(compiledAddress, '00'))
      .toThrow(/address does not encode the compiled ErgoTree/);
    expect(() => bindCompiledContractIdentity('not-an-address', compiledTree))
      .toThrow(/valid base58 address/);
    for (const malformed of [
      undefined,
      null,
      {},
      '',
      '0x',
      '0',
      '{}',
      '00zz',
      '0x00zz',
    ]) {
      expect(() => deriveCompiledErgoTreeHashHex(malformed))
        .toThrow(/canonical nonempty even-length hex/);
    }
  });
});

function collectCheckOnlyImportClosure(entry: string): {
  files: Set<string>;
  dynamicImports: string[];
} {
  const pending = [resolve(entry)];
  const visited = new Set<string>();
  const dynamicImports: string[] = [];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const source = readFileSync(current, 'utf8');
    const sourceFile = ts.createSourceFile(
      current,
      source,
      ts.ScriptTarget.Latest,
      true,
      current.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
    );
    const requireSpecifiers = collectDynamicImportsAndLiteralRequires(
      sourceFile,
      dynamicImports,
    );
    for (const specifier of [
      ...runtimeStaticImportSpecifiers(sourceFile),
      ...requireSpecifiers,
    ]) {
      if (!specifier.startsWith('.')) continue;
      const candidate = resolveTypeScriptImport(current, specifier);
      if (!visited.has(candidate)) pending.push(candidate);
    }
  }
  return { files: visited, dynamicImports: dynamicImports.sort() };
}

function runtimeStaticImportSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && isRuntimeImport(statement)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        throw new Error(`non-literal static import in ${sourceFile.fileName}`);
      }
      specifiers.push(statement.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(statement)
      && !statement.isTypeOnly
      && statement.moduleSpecifier
    ) {
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        throw new Error(`non-literal static export in ${sourceFile.fileName}`);
      }
      specifiers.push(statement.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
      && statement.moduleReference.expression
    ) {
      if (!ts.isStringLiteral(statement.moduleReference.expression)) {
        throw new Error(`non-literal import-equals in ${sourceFile.fileName}`);
      }
      specifiers.push(statement.moduleReference.expression.text);
    }
  }
  return specifiers;
}

function isRuntimeImport(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name || !clause.namedBindings) return true;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.some(element => !element.isTypeOnly);
}

function resolveTypeScriptImport(importer: string, specifier: string): string {
  const unresolved = resolve(dirname(importer), specifier);
  const candidates = specifier.endsWith('.js')
    ? [unresolved.slice(0, -3) + '.ts', unresolved]
    : [
        unresolved,
        `${unresolved}.ts`,
        `${unresolved}.js`,
        join(unresolved, 'index.ts'),
        join(unresolved, 'index.js'),
      ];
  const resolved = candidates.find(candidate => existsSync(candidate));
  if (!resolved) {
    throw new Error(`unresolved static import ${specifier} from ${importer}`);
  }
  return resolved;
}

function collectDynamicImportsAndLiteralRequires(
  sourceFile: ts.SourceFile,
  dynamicImports: string[],
): string[] {
  const requireSpecifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [argument] = node.arguments;
        if (
          node.arguments.length !== 1
          || !argument
          || !ts.isStringLiteralLike(argument)
        ) {
          throw new Error(`non-literal dynamic import in ${sourceFile.fileName}`);
        }
        dynamicImports.push(argument.text);
      } else if (
        ts.isIdentifier(node.expression)
        && node.expression.text === 'require'
      ) {
        const [argument] = node.arguments;
        if (
          node.arguments.length !== 1
          || !argument
          || !ts.isStringLiteralLike(argument)
        ) {
          throw new Error(`non-literal require in ${sourceFile.fileName}`);
        }
        requireSpecifiers.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return requireSpecifiers;
}
