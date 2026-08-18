import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const srcRoot = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

interface ParsedRuntimeSource {
  rel: string;
  source: ts.SourceFile;
}

let cachedProductionSources: ParsedRuntimeSource[] | undefined;
let cachedProductionImportFiles: Map<string, string[]> | undefined;
let cachedProductionIdentifierFiles: Map<string, string[]> | undefined;

function productionSources(): ParsedRuntimeSource[] {
  cachedProductionSources ??= walk(srcRoot)
    .map(file => ({
      rel: toPosix(relative(srcRoot, file)),
      source: ts.createSourceFile(
        file,
        readFileSync(file, 'utf-8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      ),
    }))
    .filter(({ rel }) => !rel.endsWith('.test.ts'));
  return cachedProductionSources;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === kind));
}

function runtimeExports(source: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) names.push(element.name.text);
      }
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement))
      && statement.name
    ) {
      names.push(statement.name.text);
    }
  }
  return names;
}

function exportedFunctions(source: ts.SourceFile): string[] {
  return source.statements
    .filter(ts.isFunctionDeclaration)
    .filter(statement => statement.name && hasModifier(statement, ts.SyntaxKind.ExportKeyword))
    .map(statement => statement.name!.text);
}

function runtimeImports(source: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || statement.importClause.isTypeOnly) continue;
    if (statement.importClause.name) names.push(statement.importClause.name.text);
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
      }
    }
  }
  return names;
}

function importFileIndex(sources: ParsedRuntimeSource[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const { rel, source } of sources) {
    for (const name of new Set(runtimeImports(source))) {
      const files = index.get(name) ?? [];
      files.push(rel);
      index.set(name, files);
    }
  }
  for (const files of index.values()) files.sort();
  return index;
}

function filesImporting(sources: ParsedRuntimeSource[], name: string): string[] {
  if (sources === cachedProductionSources) {
    cachedProductionImportFiles ??= importFileIndex(sources);
    return cachedProductionImportFiles.get(name) ?? [];
  }
  return sources
    .filter(({ source }) => runtimeImports(source).includes(name))
    .map(({ rel }) => rel)
    .sort();
}

function identifierFileIndex(sources: ParsedRuntimeSource[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const { rel, source } of sources) {
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) names.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const name of names) {
      const files = index.get(name) ?? [];
      files.push(rel);
      index.set(name, files);
    }
  }
  for (const files of index.values()) files.sort();
  return index;
}

function filesContainingIdentifier(sources: ParsedRuntimeSource[], name: string): string[] {
  if (sources === cachedProductionSources) {
    cachedProductionIdentifierFiles ??= identifierFileIndex(sources);
    return cachedProductionIdentifierFiles.get(name) ?? [];
  }
  const files: string[] = [];
  for (const { rel, source } of sources) {
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isIdentifier(node) && node.text === name) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (found) files.push(rel);
  }
  return files.sort();
}

function staticRelativeDependencies(
  sources: ParsedRuntimeSource[],
): ReadonlyMap<string, ReadonlyArray<string>> {
  const known = new Set(sources.map(({ rel }) => rel));
  const dependencies = new Map<string, ReadonlyArray<string>>();
  for (const { rel, source } of sources) {
    const resolved: string[] = [];
    for (const statement of source.statements) {
      if (
        !(
          ts.isImportDeclaration(statement)
          || ts.isExportDeclaration(statement)
        )
        || !statement.moduleSpecifier
        || !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const base = toPosix(join(dirname(rel), specifier));
      const candidates = base.endsWith('.js')
        ? [base.slice(0, -3) + '.ts']
        : [base, `${base}.ts`, `${base}/index.ts`];
      const dependency = candidates.find(candidate => known.has(candidate));
      if (dependency) resolved.push(dependency);
    }
    dependencies.set(rel, Object.freeze([...new Set(resolved)].sort()));
  }
  return dependencies;
}

function reachesTestFixture(
  rel: string,
  dependencies: ReadonlyMap<string, ReadonlyArray<string>>,
  visited = new Set<string>(),
): boolean {
  if (rel.startsWith('test-fixtures/')) return true;
  if (visited.has(rel)) return false;
  visited.add(rel);
  return (dependencies.get(rel) ?? []).some(dependency =>
    reachesTestFixture(dependency, dependencies, visited)
  );
}

describe('broadcast surface isolation', () => {
  it('confines WP-06 fixture modules to an explicit test-only domain', () => {
    const sources = productionSources();
    const fixtureSources = sources
      .filter(({ rel }) => rel.startsWith('test-fixtures/'))
      .map(({ rel }) => rel)
      .sort();
    expect(fixtureSources).toEqual([
      'test-fixtures/frontier-ergo-utxo-runtime-statement-v3-fixture.ts',
      'test-fixtures/wp06-fixture-backed-lifecycle.ts',
      'test-fixtures/wp06-source-derived-fixture.ts',
    ]);

    const allowedFixtureConsumers = new Set([
      'scripts/spikes/spike15-wp06-source-to-tracker-vm.ts',
      'scripts/spikes/spike17-wp06-fixture-backed-lifecycle.ts',
    ]);
    const fixtureConsumers = sources
      .filter(({ rel }) => !rel.startsWith('test-fixtures/'))
      .filter(({ source }) => source.text.includes('test-fixtures/'))
      .map(({ rel }) => rel)
      .sort();
    expect(fixtureConsumers).toEqual([...allowedFixtureConsumers].sort());

    const runtimeAuthorityConsumers = fixtureConsumers.filter(rel =>
      rel === 'relayer-daemon.ts'
      || rel.startsWith('apps/')
      || rel.startsWith('adapters/')
      || rel.startsWith('profiles/')
      || rel.startsWith('relayer-core/')
      || rel.startsWith('ergo-settlement-core/')
    );
    expect(runtimeAuthorityConsumers).toEqual([]);

    const dependencies = staticRelativeDependencies(sources);
    const fixtureReachableSources = sources
      .map(({ rel }) => rel)
      .filter(rel => !rel.startsWith('test-fixtures/'))
      .filter(rel => reachesTestFixture(rel, dependencies))
      .sort();
    expect(fixtureReachableSources).toEqual([
      'scripts/spikes/spike14-authenticated-settlement-full-tx-eval.ts',
      'scripts/spikes/spike15-wp06-source-to-tracker-vm.ts',
      'scripts/spikes/spike16-wp06-source-to-settlement-vm.ts',
      'scripts/spikes/spike17-wp06-fixture-backed-lifecycle.ts',
      'wp06-source-bound-settlement.ts',
    ]);

    const authorityRoots = sources
      .map(({ rel }) => rel)
      .filter(rel =>
        rel === 'relayer-daemon.ts'
        || rel.startsWith('apps/')
        || rel.startsWith('adapters/')
        || rel.startsWith('profiles/')
        || rel.startsWith('relayer-core/')
        || rel.startsWith('ergo-settlement-core/')
      );
    expect(
      authorityRoots.filter(rel => reachesTestFixture(rel, dependencies)),
    ).toEqual([]);

    const packageJson = JSON.parse(
      readFileSync(join(srcRoot, '..', 'package.json'), 'utf-8'),
    ) as { scripts?: Record<string, string> };
    for (const operationalScript of ['daemon', 'dev', 'start']) {
      const command = packageJson.scripts?.[operationalScript];
      expect(command).toBeDefined();
      const entrypoint = command!.match(/\bsrc\/([^\s]+\.ts)\b/)?.[1];
      expect(entrypoint).toBeDefined();
      expect(reachesTestFixture(entrypoint!, dependencies)).toBe(false);
    }
  });

  it('keeps production /transactions broadcast endpoints in gated modules only', () => {
    const allowedPathFragments = [
      'broadcast-surface.test.ts',
      'ergo-helpers.ts',
      'scripts/devnet-consolidate-rewards.ts',
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts',
    ];

    const offenders = walk(srcRoot)
      .map(file => ({
        rel: toPosix(relative(srcRoot, file)),
        text: readFileSync(file, 'utf-8'),
      }))
      .filter(({ rel }) => !allowedPathFragments.some(fragment => rel.includes(fragment)))
      .filter(({ text }) => /\b(?:npost(?:Direct)?|post)\(\s*['"]\/transactions['"]/.test(text))
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
    expect(filesImporting(productionSources(), 'npostDirect')).toEqual([
      'scripts/devnet-consolidate-rewards.ts',
    ]);
  });

  it('keeps the FED-6-LAB checked transport dormant and outside no-submit roots', () => {
    const sources = productionSources();
    const authorizerFile =
      'substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.ts';
    const transportFile =
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts';
    const authorizer = readFileSync(join(srcRoot, authorizerFile), 'utf-8');
    const transport = readFileSync(join(srcRoot, transportFile), 'utf-8');
    const frozenNoSubmit = [
      'apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
      'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
    ].map(file => readFileSync(join(srcRoot, file), 'utf-8')).join('\n');

    expect(filesImporting(
      sources,
      'consumeLocalWasmCheckedSubmissionHandleV1',
    )).toEqual([transportFile]);
    expect(filesContainingIdentifier(
      sources,
      'consumeLocalWasmCheckedSubmissionHandleV1',
    )).toEqual([
      'fleet-signer.ts',
      transportFile,
    ]);
    expect(sources
      .filter(({ source }) => source.text.includes(
        'consumeLocalWasmCheckedSubmissionHandleV1',
      ))
      .map(({ rel }) => rel)
      .sort()).toEqual([
        'fleet-signer.ts',
        transportFile,
      ]);
    expect(filesImporting(
      sources,
      'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    )).toEqual([]);
    expect(filesContainingIdentifier(
      sources,
      'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    )).toEqual([transportFile]);
    expect(filesImporting(
      sources,
      'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
    )).toEqual([]);
    expect(filesContainingIdentifier(
      sources,
      'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
    )).toEqual([authorizerFile]);
    expect(filesImporting(
      sources,
      'assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1',
    )).toEqual([transportFile]);
    expect(filesImporting(
      sources,
      'takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2',
    )).toEqual([
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
    ]);
    expect(transport).toContain(
      'SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN',
    );
    expect(transport).toContain(
      '`${SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN}${SUBMISSION_PATH}`',
    );
    expect(transport).toContain("const SUBMISSION_PATH = '/transactions'");
    expect(transport).toContain('maxRedirects: 0');
    expect(transport).toContain('proxy: false');
    expect(transport).not.toContain('npostDirect');
    expect(transport).not.toContain('API_KEY');
    expect(authorizer).not.toContain("'/transactions'");
    expect(authorizer).not.toContain('axios');
    expect(authorizer).not.toContain('consumeLocalWasmCheckedSubmissionHandleV1');
    expect(authorizer).not.toContain('process.env');
    expect(authorizer).not.toMatch(/\bverified\s*:\s*true\b/u);
    expect(frozenNoSubmit).not.toContain(
      'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    );
    expect(frozenNoSubmit).not.toContain(
      'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
    );
    expect(frozenNoSubmit).not.toContain(
      'consumeLocalWasmCheckedSubmissionHandleV1',
    );
  });

  it('keeps generic signer and client modules free of production broadcast endpoints', () => {
    for (const file of ['fleet-signer.ts', 'ergo-client.ts']) {
      const source = readFileSync(join(srcRoot, file), 'utf-8');
      expect(source).not.toMatch(
        /\b(?:npost(?:Direct)?|post)\(\s*['"]\/transactions['"]/,
      );
    }
  });

  it('keeps fixed operational submission out of the daemon while retaining split lifecycle ports', () => {
    const sources = productionSources();
    const daemon = readFileSync(join(srcRoot, 'relayer-daemon.ts'), 'utf-8');
    const compatibilityPath = join(
      srcRoot,
      'ergo-operational-transaction-compatibility.ts',
    );
    const lifecycle = readFileSync(
      join(srcRoot, 'relayer-core', 'ergo-operational-transaction-lifecycle.ts'),
      'utf-8',
    );
    const application = readFileSync(
      join(srcRoot, 'apps', 'bridge-daemon', 'ergo-operational-transaction.ts'),
      'utf-8',
    );
    const adapters = readFileSync(
      join(srcRoot, 'adapters', 'ergo-operational-transaction-execution.ts'),
      'utf-8',
    );
    const retiredRoutes = [
      'submitPegInCommittedVaultTransition',
      'submitDupHeartbeatTouch',
      'submitScsOracleUpdate',
    ];

    expect(existsSync(compatibilityPath)).toBe(false);
    expect(daemon).not.toContain('signAndSubmit');
    for (const route of retiredRoutes) {
      expect(daemon).not.toContain(`${route}({`);
      expect(filesImporting(sources, route)).toEqual([]);
    }
    expect(filesContainingIdentifier(sources, 'submitDetected')).toEqual([]);
    expect(filesContainingIdentifier(sources, 'submitCommitment')).toEqual([]);
    expect(daemon).not.toContain('peg-in commitment signer loading');
    expect(daemon).not.toContain('peg-in commitment fee selection');
    expect(daemon).not.toContain('this.pegInCoordinator.submitDetected');

    const signIndex = lifecycle.indexOf('ports.signer.sign(admission)');
    const checkIndex = lifecycle.indexOf('ports.checker.check(signed)');
    const revalidateIndex = lifecycle.indexOf(
      'ports.revalidator.revalidate(checked)',
    );
    const authorizeIndex = lifecycle.indexOf(
      'ports.broadcastAuthorizer.authorize(revalidated)',
    );
    const reserveIndex = lifecycle.indexOf(
      'ports.journal.reserve(authorization)',
    );
    const submitIndex = lifecycle.indexOf('ports.submitter.submit(attempt)');
    const finalizeIndex = lifecycle.indexOf('ports.journal.finalize({ attempt, submission })');
    expect(signIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeGreaterThan(signIndex);
    expect(revalidateIndex).toBeGreaterThan(checkIndex);
    expect(authorizeIndex).toBeGreaterThan(revalidateIndex);
    expect(reserveIndex).toBeGreaterThan(authorizeIndex);
    expect(submitIndex).toBeGreaterThan(reserveIndex);
    expect(finalizeIndex).toBeGreaterThan(submitIndex);

    for (const layered of [application, adapters, lifecycle]) {
      expect(layered).not.toContain('fleet-signer');
      expect(layered).not.toContain('state-tracker');
      expect(layered).not.toContain('ergo-client');
      expect(layered).not.toContain('npostDirect');
      expect(layered).not.toContain("'/transactions'");
    }
  });

  it('keeps the check signer and checker as distinct non-broadcast capabilities', () => {
    const source = readFileSync(join(srcRoot, 'fleet-signer.ts'), 'utf-8');
    const nodeHelpers = readFileSync(join(srcRoot, 'ergo-helpers.ts'), 'utf-8');
    const signerStart = source.indexOf('export async function signTransactionForCheck');
    const checkerStart = source.indexOf('export async function checkSignedTransaction');
    const facadeStart = source.indexOf('export async function signAndCheck');
    const normalizeStart = source.indexOf('export function normalizeNodeOrigin');
    expect(signerStart).toBeGreaterThan(-1);
    expect(checkerStart).toBeGreaterThan(signerStart);
    expect(facadeStart).toBeGreaterThan(checkerStart);
    expect(normalizeStart).toBeGreaterThan(facadeStart);

    const signerSource = source.slice(signerStart, checkerStart);
    expect(signerSource).toContain('wasmSignWithStateContext(');
    expect(signerSource).toContain('registerLocalWasmSignedCheckCandidate({');
    expect(signerSource).toContain('signerContext: {');
    expect(signerSource).not.toContain('LOCAL_WASM_SIGNED_CHECK_MATERIAL.set(');
    expect(signerSource).not.toContain('ncheck(');
    expect(signerSource).not.toMatch(/\bnpost(?:Direct)?\s*\(/);
    expect(signerSource).not.toContain('assertBroadcastAllowed(');
    expect(source).not.toContain(
      'createLocalWasmSignedCheckCandidateForTesting',
    );

    const checkerSource = source.slice(checkerStart, facadeStart);
    expect(checkerSource)
      .toContain("'/transactions/check'");
    expect(checkerSource).toContain('checkerIdentity: Object.freeze({');
    expect(checkerSource).not.toContain('wasmSign');
    expect(checkerSource).not.toMatch(/\bnpost(?:Direct)?\s*\(/);
    expect(checkerSource).not.toContain('assertBroadcastAllowed(');

    const facadeSource = source.slice(facadeStart, normalizeStart);
    expect(facadeSource).toContain('signTransactionForCheck(');
    expect(facadeSource).toContain('checkSignedTransaction(');
    expect(facadeSource).not.toMatch(/\bnpost(?:Direct)?\s*\(/);
    expect(nodeHelpers).toContain('maxRedirects: 0');
    const checkTransportStart = nodeHelpers.indexOf('export async function ncheck');
    const checkTransportEnd = nodeHelpers.indexOf('export async function getHeight');
    expect(checkTransportStart).toBeGreaterThan(-1);
    expect(checkTransportEnd).toBeGreaterThan(checkTransportStart);
    const checkTransport = nodeHelpers.slice(checkTransportStart, checkTransportEnd);
    expect(checkTransport).not.toContain('api_key');
    expect(checkTransport).toContain('maxRedirects: 0');
    expect(checkTransport).toContain('proxy: false');
    expect(checkTransport).toContain('timeout: 30_000');
    const directGetStart = nodeHelpers.indexOf('export async function ngetDirect');
    const directGetEnd = nodeHelpers.indexOf('export async function npost');
    expect(directGetStart).toBeGreaterThan(-1);
    expect(directGetEnd).toBeGreaterThan(directGetStart);
    const directGet = nodeHelpers.slice(directGetStart, directGetEnd);
    expect(directGet).not.toContain('api_key');
    expect(directGet).toContain('maxRedirects: 0');
    expect(directGet).toContain('proxy: false');
    expect(directGet).toContain('timeout: 30_000');
  });

  it('keeps authenticated V2 JVM checking behind exact revalidation and without a submit route', () => {
    const source = readFileSync(
      join(srcRoot, 'authenticated-settlement-jvm-check.ts'),
      'utf-8',
    );
    expect(source).toContain('assertRevalidatedAuthenticatedSettlementCandidateProvenance(candidate)');
    expect(source).toContain('assertPackageBoundAuthenticatedSettlementProvenance(packageBinding)');
    expect(source).toContain(
      'checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting',
    );
    expect(source).not.toContain(
      'signPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting',
    );
    expect(source).not.toContain(
      'checkPackageBoundSignedAuthenticatedSettlementCandidateForTesting',
    );
    expect(source).not.toContain('checkRevalidatedAuthenticatedSettlementCandidateForTesting');
    expect(source).toContain('signAndCheck');
    expect(source).not.toContain('signAndSubmit');
    expect(source).not.toMatch(/\bnpost\(\s*['"]\/transactions['"]/);
  });

  it('keeps database-loss package recovery below checker, signer, and submit authority', () => {
    const recoveryRuntimePaths = [
      ['relayer-core', 'authenticated-v2-prepared-candidate-recovery.ts'],
      ['adapters', 'authenticated-v2-package-recovery-reconstruction.ts'],
      ['adapters', 'authenticated-v2-package-recovery-source.ts'],
      ['adapters', 'authenticated-v2-package-recovery-journal.ts'],
      ['apps', 'bridge-daemon', 'authenticated-v2-package-recovery.ts'],
      ['authenticated-v2-package-recovery.ts'],
    ];
    const sources = recoveryRuntimePaths.map(parts =>
      readFileSync(join(srcRoot, ...parts), 'utf-8'));
    const combined = sources.join('\n');
    const compatibilitySource = sources.at(-1)!;
    const coreSource = sources[0];
    const sidechainViewSource = readFileSync(
      join(srcRoot, 'authenticated-settlement-sidechain-view.ts'),
      'utf-8',
    );
    expect(compatibilitySource).toContain('runAuthenticatedV2PackageRecovery(input, {');
    expect(compatibilitySource)
      .toContain('observeMatchingAuthenticatedSettlementStableSidechainViews({');
    expect(compatibilitySource).not.toContain(
      'createAuthenticatedSettlementSidechainObservationSourcePairForTesting',
    );
    expect(sidechainViewSource).toContain('new ethers.JsonRpcProvider(primary.rpcUrl)');
    expect(sidechainViewSource).toContain('new ethers.JsonRpcProvider(witness.rpcUrl)');
    expect(sidechainViewSource).toContain('SIDECHAIN_OBSERVATION_SOURCE_PAIR_BINDINGS');
    expect(sidechainViewSource).not.toContain('readonly primarySource:');
    expect(sidechainViewSource).not.toContain('readonly witnessSource:');
    expect(coreSource).toContain("restoredCandidateStatus: 'prepared'");
    expect(coreSource).toContain('checkPassedRestored: false');
    for (const forbiddenCapability of [
      'authorizeAuthenticatedSettlementCheckAdmission',
      'markAuthenticatedSettlementCandidateCheckPassed',
      'signAndCheck',
      'signAndSubmit',
      'submitTransaction',
      'submissionApproval',
      'broadcastAuthorization',
      'transportCapability',
      'assertBroadcastAllowed',
      'assertSidechainBroadcastAllowed',
    ]) {
      expect(combined).not.toContain(forbiddenCapability);
    }
    expect(combined).not.toMatch(/\b(?:npost|post)\(\s*['"]\/transactions['"]/);
    expect(combined).not.toMatch(/\bsignTransaction\b/);
    expect(combined).not.toMatch(/\bsign_transaction\b/);
  });

  it('exposes authenticated V2 checking only as an explicit non-mainnet check-only command', () => {
    const source = readFileSync(
      join(srcRoot, 'scripts', 'check-authenticated-settlement.ts'),
      'utf-8',
    );
    expect(source).toContain('AUTHENTICATED_SETTLEMENT_CHECK_ENABLED_ENV');
    expect(source).toContain('assertAuthenticatedSettlementCheckStaticPolicy({');
    expect(source).toContain('assertAuthenticatedSettlementCheckObservedErgoNetwork(');
    expect(source).toContain('signerErgoNodeUrl: NODE');
    expect(source).toContain(
      'new ErgoClient(ERGO_CONFIG.nodeUrl, { readOnly: true, direct: true })',
    );
    const policy = readFileSync(
      join(srcRoot, 'authenticated-settlement-check-policy.ts'),
      'utf-8',
    );
    expect(policy).toContain('BRIDGE_BROADCAST_ENABLED to remain false');
    const compatibility = readFileSync(
      join(
        srcRoot,
        'authenticated-settlement-check-reservation-compatibility.ts',
      ),
      'utf-8',
    );
    const application = readFileSync(
      join(
        srcRoot,
        'apps',
        'bridge-daemon',
        'authenticated-settlement-check-reservation.ts',
      ),
      'utf-8',
    );
    expect(source).toContain('recollectAndRevalidateAuthenticatedSettlementCandidate({');
    expect(source).toContain('assertJournaledUnsignedSettlementPackageDigest(');
    expect(source).toContain('bindAuthenticatedV2UnsignedSettlementPackage({');
    expect(source).toContain('observeAuthenticatedSettlementStableSidechainView({');
    expect(source).toContain('observeAuthenticatedSettlementStableErgoView({');
    expect(source).toContain(
      'signPackageBoundRevalidatedAuthenticatedSettlementCandidate(',
    );
    expect(source).toContain(
      'checkPackageBoundSignedAuthenticatedSettlementCandidate(',
    );
    expect(source).toContain(
      'runAuthenticatedSettlementCheckReservationCompatibility(',
    );
    expect(source).toContain('--unsigned-package');
    expect(source).toContain('--expected-package-digest');
    expect(compatibility).toContain(
      'authorizeAuthenticatedSettlementCheckAdmission({',
    );
    expect(compatibility).toContain(
      'deps.state.markAuthenticatedSettlementCandidateCheckPassed(',
    );
    expect(compatibility).toContain(
      'authorizeAuthenticatedSettlementExecution({',
    );
    expect(compatibility).toContain(
      'authorizeAuthenticatedSettlementExecutionReservation({',
    );
    expect(compatibility).toContain(
      'deps.state.reserveAuthenticatedSettlementExecution(actualAdmission)',
    );
    expect(application).toContain(
      'prepareAuthenticatedSettlementExecutionReservation(input, ports)',
    );
    const executableMain = source.slice(
      source.indexOf('async function main(): Promise<void> {'),
      source.indexOf('function normalizeFixedHex('),
    );
    expect(executableMain).toContain('assertJournaledUnsignedSettlementPackageDigest(');
    expect(executableMain).toContain(
      'runAuthenticatedSettlementCheckReservationCompatibility(',
    );
    expect(executableMain.indexOf('assertJournaledUnsignedSettlementPackageDigest('))
      .toBeLessThan(executableMain.indexOf(
        'runAuthenticatedSettlementCheckReservationCompatibility(',
      ));
    const compatibilityCall = executableMain.slice(
      executableMain.indexOf(
        'runAuthenticatedSettlementCheckReservationCompatibility(',
      ),
    );
    const orderedCallbacks = [
      'revalidate:',
      'bindPackage:',
      'sign:',
      'check:',
      'observeStableErgo:',
      'observeStableSidechain:',
    ];
    for (let index = 1; index < orderedCallbacks.length; index += 1) {
      expect(compatibilityCall.indexOf(orderedCallbacks[index - 1]))
        .toBeLessThan(compatibilityCall.indexOf(orderedCallbacks[index]));
    }
    expect(source).not.toContain("candidate.status === 'check_passed'");
    expect(source).not.toContain("import 'dotenv/config'");
    expect(source).not.toMatch(/\bnpost\(\s*['"]\/transactions['"]/);
    const checkOnlyClosure = `${source}\n${compatibility}\n${application}`;
    expect(checkOnlyClosure).not.toContain('signAndSubmit');
    expect(checkOnlyClosure).not.toContain('submitTransaction');
    expect(checkOnlyClosure).not.toContain('broadcastAuthorization:');
    expect(checkOnlyClosure).not.toContain('transportReservationJournal:');
    expect(checkOnlyClosure).not.toContain('confirmationObservation:');
    expect(checkOnlyClosure).not.toMatch(
      /\b(?:npost|post)\(\s*['"]\/transactions['"]/,
    );

    const authorization = readFileSync(
      join(srcRoot, 'authenticated-settlement-execution-authorization.ts'),
      'utf-8',
    );
    expect(authorization).not.toContain('signAndCheck');
    expect(authorization).not.toContain('signAndSubmit');
    expect(authorization).not.toContain('submitTransaction');
    expect(authorization).not.toMatch(/\bprepared\s*:/);
    expect(authorization).not.toMatch(/\b(?:npost|post)\(\s*['"]\/transactions['"]/);

    const reservation = readFileSync(
      join(srcRoot, 'authenticated-settlement-execution-reservation.ts'),
      'utf-8',
    );
    expect(reservation).toContain(
      'assertAuthenticatedSettlementExecutionAuthorizationProvenance(input.authorization)',
    );
    expect(reservation).not.toContain('fleet-signer');
    expect(reservation).not.toContain('signAndCheck');
    expect(reservation).not.toContain('signAndSubmit');
    expect(reservation).not.toContain('submitTransaction');
    expect(reservation).not.toMatch(/\b(?:fetch|axios|nget|npost|ncheck)\s*\(/);
    expect(reservation).not.toMatch(/\b(?:npost|post)\(\s*['"]\/transactions['"]/);

    const packageJson = JSON.parse(
      readFileSync(join(srcRoot, '..', 'package.json'), 'utf-8'),
    );
    expect(packageJson.scripts['settle:authenticated:check'])
      .toBe('tsx src/scripts/check-authenticated-settlement.ts');
  });

  it('keeps the authenticated reserved-execution composition non-default and route-isolated', () => {
    const compatibility = readFileSync(
      join(
        srcRoot,
        'authenticated-settlement-reserved-execution-compatibility.ts',
      ),
      'utf-8',
    );
    const application = readFileSync(
      join(
        srcRoot,
        'apps',
        'bridge-daemon',
        'authenticated-settlement-reserved-execution.ts',
      ),
      'utf-8',
    );
    const adapters = readFileSync(
      join(
        srcRoot,
        'adapters',
        'authenticated-settlement-reserved-execution.ts',
      ),
      'utf-8',
    );
    const checkOnly = readFileSync(
      join(srcRoot, 'scripts', 'check-authenticated-settlement.ts'),
      'utf-8',
    );
    const daemon = readFileSync(
      join(srcRoot, 'relayer-daemon.ts'),
      'utf-8',
    );
    const packageJson = readFileSync(
      join(srcRoot, '..', 'package.json'),
      'utf-8',
    );

    expect(compatibility).toContain(
      'runAuthenticatedSettlementReservedExecution(handoff, {',
    );
    expect(compatibility).toContain(
      'reserveAuthenticatedSettlementTransportAttempt(admission)',
    );
    expect(compatibility).toContain(
      'assertBroadcastApprovalCurrent({',
    );
    expect(compatibility).toContain(
      'reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility',
    );
    expect(application).toContain(
      'executeAuthenticatedSettlementReservedHandoff(handoff, ports)',
    );
    expect(application).toContain(
      'reconcileAuthenticatedSettlementSubmission(durable, ports)',
    );
    expect(adapters).not.toContain('state-tracker');
    expect(adapters).not.toContain('fleet-signer');

    const runtimeSources = productionSources();
    const compatibilityPath =
      'authenticated-settlement-reserved-execution-compatibility.ts';
    const applicationPath =
      'apps/bridge-daemon/authenticated-settlement-reserved-execution.ts';
    const compatibilityConsumers = runtimeSources
      .filter(({ rel }) => rel !== compatibilityPath)
      .filter(({ source }) =>
        source.text.includes(
          'authenticated-settlement-reserved-execution-compatibility',
        )
      )
      .map(({ rel }) => rel)
      .sort();
    expect(compatibilityConsumers).toEqual([]);
    for (const capability of [
      'runAuthenticatedSettlementReservedExecutionCompatibility',
      'reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility',
      'createAuthenticatedSettlementFixedSubmitter',
      'createAuthenticatedSettlementReservedExecutionCompatibilityDeps',
      'createAuthenticatedSettlementRestartCompatibilityDeps',
    ]) {
      expect(
        filesContainingIdentifier(runtimeSources, capability)
          .filter(rel => rel !== compatibilityPath),
      ).toEqual([]);
    }
    const applicationConsumers = runtimeSources
      .filter(({ rel }) => rel !== applicationPath)
      .filter(({ source }) =>
        source.text.includes(
          'apps/bridge-daemon/authenticated-settlement-reserved-execution',
        )
      )
      .map(({ rel }) => rel)
      .sort();
    expect(applicationConsumers).toEqual([compatibilityPath]);
    for (const capability of [
      'runAuthenticatedSettlementReservedExecution',
      'reconcileAuthenticatedSettlementSubmissionAttempt',
    ]) {
      expect(
        filesContainingIdentifier(runtimeSources, capability)
          .filter(rel => rel !== applicationPath),
      ).toEqual([compatibilityPath]);
    }

    for (const activeSource of [checkOnly, daemon, packageJson]) {
      expect(activeSource).not.toContain(
        'authenticated-settlement-reserved-execution-compatibility',
      );
      expect(activeSource).not.toContain(
        'runAuthenticatedSettlementReservedExecutionCompatibility',
      );
      expect(activeSource).not.toContain(
        'reconcileRecoverableAuthenticatedSettlementSubmissionsCompatibility',
      );
    }
    for (const inactiveSource of [compatibility, application, adapters]) {
      expect(inactiveSource).not.toContain("'/transactions'");
      expect(inactiveSource).not.toContain('"/transactions"');
      expect(inactiveSource).not.toContain('npostDirect');
      expect(inactiveSource).not.toContain('signAndSubmit');
      expect(inactiveSource).not.toContain('signTransactionForSubmission');
      expect(inactiveSource).not.toContain('node-wallet');
    }
    expect(compatibility).not.toContain('"signedTx":');
    expect(application).not.toContain('fleet-signer');
    expect(application).not.toContain('state-tracker');
    const packageScripts = Object.values(
      JSON.parse(packageJson).scripts as Record<string, string>,
    ).join('\n');
    expect(packageScripts).not.toContain(
      'authenticated-settlement-reserved-execution-compatibility',
    );
    expect(packageScripts).not.toContain(
      'runAuthenticatedSettlementReservedExecutionCompatibility',
    );
  });

  it('keeps authenticated V2 provisioning deterministic and fully offline', () => {
    const source = readFileSync(
      join(srcRoot, 'scripts', 'plan-authenticated-v2-provisioning.ts'),
      'utf-8',
    );
    expect(source).toContain('buildAuthenticatedV2ProvisioningPlan(input)');
    expect(source).toContain('AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA');
    expect(source).not.toContain('dotenv/config');
    expect(source).not.toContain('ErgoClient');
    expect(source).not.toContain('signAndCheck');
    expect(source).not.toMatch(/\b(?:fetch|axios|nget|npost|ncheck)\s*\(/);
    expect(source).not.toMatch(/\bnpost\(\s*['"]\/transactions['"]/);
    const checkSource = readFileSync(
      join(srcRoot, 'scripts', 'check-authenticated-settlement.ts'),
      'utf-8',
    );
    expect(checkSource).not.toContain('authenticated-v2-provisioning-plan');

    const stageSource = readFileSync(
      join(srcRoot, 'scripts', 'plan-authenticated-v2-stage-rebuild.ts'),
      'utf-8',
    );
    expect(stageSource).toContain('buildAuthenticatedV2AdmissionStagePlan');
    expect(stageSource).toContain('buildAuthenticatedV2SettlementStagePlan');
    expect(stageSource).not.toContain('dotenv/config');
    expect(stageSource).not.toContain('ErgoClient');
    expect(stageSource).not.toContain('signAndCheck');
    expect(stageSource).not.toMatch(/\b(?:fetch|axios|nget|npost|ncheck)\s*\(/);
    expect(stageSource).not.toMatch(/\bnpost\(\s*['"]\/transactions['"]/);

    const conformanceCli = readFileSync(
      join(srcRoot, 'scripts', 'authenticated-v2-source-tree-conformance.ts'),
      'utf-8',
    );
    const conformanceCore = readFileSync(
      join(srcRoot, 'authenticated-v2-source-tree-conformance.ts'),
      'utf-8',
    );
    const compilerSelfcheck = readFileSync(
      join(srcRoot, 'scripts', 'authenticated-v2-compiler-selfcheck.ts'),
      'utf-8',
    );
    const contractSourceResolver = readFileSync(
      join(srcRoot, 'authenticated-v2-contract-sources.ts'),
      'utf-8',
    );
    const initialBindingCore = readFileSync(
      join(srcRoot, 'authenticated-v2-initial-binding.ts'),
      'utf-8',
    );
    const initialBindingCli = readFileSync(
      join(srcRoot, 'scripts', 'derive-authenticated-v2-initial-binding.ts'),
      'utf-8',
    );
    for (const conformanceSource of [
      conformanceCli,
      conformanceCore,
      compilerSelfcheck,
      contractSourceResolver,
      initialBindingCore,
      initialBindingCli,
    ]) {
      expect(conformanceSource).not.toContain('dotenv/config');
      expect(conformanceSource).not.toContain('ErgoClient');
      expect(conformanceSource).not.toContain('fleet-signer');
      expect(conformanceSource).not.toContain('signAndCheck');
      expect(conformanceSource).not.toMatch(/\b(?:fetch|axios|nget|npost|ncheck)\s*\(/);
      expect(conformanceSource).not.toMatch(/\bnpost\(\s*['"]\/transactions['"]/);
    }
    expect(conformanceCore).toContain("execution: 'pinned-resolver-free-jvm'");
    expect(conformanceCore).toContain('SIGMASTATE_VERSION');
    expect(conformanceCore).toContain('runtimeBundleSha256');
    expect(conformanceCore).toContain('javaHomeSha256');
    expect(conformanceCore).not.toContain('runSbtCompiler');
    expect(conformanceCore).not.toContain('sbt-launch.jar');
    expect(initialBindingCore).not.toContain('authenticated-v2-provisioning-plan');
    expect(initialBindingCli).not.toContain('plan-authenticated-v2-provisioning');
    expect(initialBindingCore).not.toContain('materializeUnsignedTransaction');
    expect(initialBindingCore).not.toContain('ErgoClient');
    expect(initialBindingCore).not.toContain('boxId');
    expect(compilerSelfcheck).toContain("from '../authenticated-v2-initial-binding.js'");
    expect(compilerSelfcheck).not.toContain("from '../authenticated-v2-provisioning-plan.js'");
    expect(conformanceCore).toContain("await import(\n    './authenticated-v2-provisioning-plan.js'");

    const packageJson = JSON.parse(
      readFileSync(join(srcRoot, '..', 'package.json'), 'utf-8'),
    );
    expect(packageJson.scripts['settle:authenticated:provision-plan'])
      .toBe('tsx src/scripts/plan-authenticated-v2-provisioning.ts');
    expect(packageJson.scripts['settle:authenticated:stage-plan'])
      .toBe('tsx src/scripts/plan-authenticated-v2-stage-rebuild.ts');
    expect(packageJson.scripts['contracts:authenticated-v2:conformance'])
      .toBe('tsx src/scripts/authenticated-v2-source-tree-conformance.ts');
    expect(packageJson.scripts['contracts:authenticated-v2:compiler-selfcheck'])
      .toBe('tsx src/scripts/authenticated-v2-compiler-selfcheck.ts');
    expect(packageJson.scripts['contracts:authenticated-v2:derive-initial-binding'])
      .toBe('tsx src/scripts/derive-authenticated-v2-initial-binding.ts');
  });

  it('runs signer creationHeight guards before key derivation and signing', () => {
    const source = readFileSync(join(srcRoot, 'fleet-signer.ts'), 'utf-8');

    const signOnlyStart = source.indexOf('export async function signTransactionForSubmission');
    const signOnlyEnd = source.indexOf('function normalizeTransactionId', signOnlyStart);
    expect(signOnlyStart).toBeGreaterThan(-1);
    expect(signOnlyEnd).toBeGreaterThan(signOnlyStart);
    const signOnlySource = source.slice(signOnlyStart, signOnlyEnd);
    const submitCreationGuard = signOnlySource.indexOf('assertEip12CreationHeights(label, eip12Tx)');
    const submitKeyDerivation = signOnlySource.indexOf('getSignerKeys()');
    const submitWasmSign = signOnlySource.indexOf('const signed = await wasmSign(');
    expect(submitCreationGuard).toBeGreaterThan(-1);
    expect(submitKeyDerivation).toBeGreaterThan(-1);
    expect(submitWasmSign).toBeGreaterThan(-1);
    expect(submitCreationGuard).toBeLessThan(submitKeyDerivation);
    expect(submitCreationGuard).toBeLessThan(submitWasmSign);

    const checkSignerStart = source.indexOf(
      'export async function signTransactionForCheck',
    );
    const checkCheckerStart = source.indexOf(
      'export async function checkSignedTransaction',
      checkSignerStart,
    );
    expect(checkSignerStart).toBeGreaterThan(-1);
    expect(checkCheckerStart).toBeGreaterThan(checkSignerStart);
    const checkSignerSource = source.slice(checkSignerStart, checkCheckerStart);
    const checkCreationGuard = checkSignerSource.indexOf(
      'assertEip12CreationHeights(label, eip12Tx)',
    );
    const checkKeyDerivation = checkSignerSource.indexOf('getSignerKeys()');
    const checkNodeOrigin = checkSignerSource.indexOf(
      'normalizeNodeOrigin(nodeOrigin)',
    );
    const checkContextHeaders = checkSignerSource.indexOf(
      "await ngetDirect('/blocks/lastHeaders/10', signerNodeOrigin)",
    );
    const checkWasmSign = checkSignerSource.indexOf('wasmSignWithStateContext(');
    expect(checkCreationGuard).toBeGreaterThan(-1);
    expect(checkNodeOrigin).toBeGreaterThan(-1);
    expect(checkKeyDerivation).toBeGreaterThan(-1);
    expect(checkContextHeaders).toBeGreaterThan(-1);
    expect(checkWasmSign).toBeGreaterThan(-1);
    expect(checkCreationGuard).toBeLessThan(checkKeyDerivation);
    expect(checkCreationGuard).toBeLessThan(checkNodeOrigin);
    expect(checkNodeOrigin).toBeLessThan(checkContextHeaders);
    expect(checkCreationGuard).toBeLessThan(checkContextHeaders);
    expect(checkContextHeaders).toBeLessThan(checkKeyDerivation);
    expect(checkCreationGuard).toBeLessThan(checkWasmSign);

    const checkFacadeStart = source.indexOf(
      'export async function signAndCheck',
      checkCheckerStart,
    );
    const checkerSource = source.slice(checkCheckerStart, checkFacadeStart);
    expect(checkerSource).toContain("'/transactions/check'");
    expect(checkerSource).not.toContain('getSignerKeys()');
    expect(checkerSource).not.toContain('wasmSign');
  });

  it('keeps the e2e aggregate runner unsigned and rejects its removed check command', () => {
    const source = readFileSync(
      join(srcRoot, 'scripts', 'e2e-aggregate-settlement.ts'),
      'utf-8',
    );
    expect(source).toContain(
      'No command in this runner signs, checks, submits, or broadcasts a new V1 payout.',
    );
    expect(source).not.toContain('npm run e2e:aggregate -- check');
    expect(source).not.toContain("if (command === 'check')");
    expect(source).not.toContain('signAndCheck(');
    expect(source).not.toContain('/fleet-signer.js');
    expect(source).not.toContain('/transactions/check');
  });

  it('removes every mutation command from the aggregate e2e runner', () => {
    const source = readFileSync(
      join(srcRoot, 'scripts', 'e2e-aggregate-settlement.ts'),
      'utf-8',
    );
    const main = source.indexOf('async function main(): Promise<void>');
    const allowlist = source.indexOf(
      'if (!supportedNonSubmissionCommands.has(command)) usage();',
      main,
    );
    const state = source.indexOf('const state = new StateTracker(', main);
    expect(allowlist).toBeGreaterThan(main);
    expect(allowlist).toBeLessThan(state);

    for (const command of ['trigger', 'check', 'submit', 'run', 'import-pegout']) {
      expect(source).not.toContain(`if (command === '${command}')`);
    }
    expect(source).not.toContain('assertE2eBroadcastAllowed');
    expect(source).not.toContain('submitAnchored(');
    expect(source).not.toContain('triggerPegOut(');
  });
  it('removes direct sidechain burn initiation while payout authority is retired', () => {
    expect(existsSync(join(srcRoot, 'scripts', 'trigger-peg-out.ts'))).toBe(false);

    const directBurnCallPatterns = [
      /\.pegOut\s*\(/u,
      /\[\s*['"]pegOut['"]\s*\]\s*\(/u,
      /\.getFunction\s*\(\s*['"]pegOut['"]\s*\)/u,
    ];
    const directBurnCallers = productionSources()
      .filter(({ source }) => directBurnCallPatterns.some(pattern => pattern.test(source.text)))
      .map(({ rel }) => rel)
      .sort();
    expect(directBurnCallers).toEqual([]);

    for (const script of ['e2e-pegout-test.ts', 'test-roundtrip.ts']) {
      const source = readFileSync(join(srcRoot, 'scripts', script), 'utf-8');
      expect(source).toContain('assertLegacyMcuDisabled');
      expect(source).not.toMatch(/\.approve\(|\.pegOut\(|assertSidechainBroadcastAllowed/);
    }
  });

  it('keeps the legacy owner-mint deployment outside supported operator surfaces', () => {
    const packageJson = JSON.parse(
      readFileSync(join(srcRoot, '..', 'package.json'), 'utf-8'),
    ) as { scripts?: Record<string, string> };
    const goNoGo = readFileSync(
      join(srcRoot, 'scripts', 'patched-devnet-go-no-go.ts'),
      'utf-8',
    );
    const goNoGoCore = readFileSync(
      join(srcRoot, 'patched-devnet-go-no-go.ts'),
      'utf-8',
    );
    const activeGuidance = [
      readFileSync(join(srcRoot, 'scripts', 'demo-readiness.ts'), 'utf-8'),
      readFileSync(
        join(srcRoot, 'scripts', 'sidechain-demo-preflight.ts'),
        'utf-8',
      ),
      readFileSync(join(srcRoot, 'sidechain-client.ts'), 'utf-8'),
    ].join('\n');

    expect(packageJson.scripts?.['deploy:sidechain']).toBeUndefined();
    expect(existsSync(join(srcRoot, 'scripts', 'deploy-sidechain.ts')))
      .toBe(false);
    expect(goNoGo).toContain('classifyPatchedDevnetPackageScripts(scripts)');
    expect(goNoGoCore).toContain(
      'legacy owner-mint deployment must not be exposed by package.json',
    );
    expect(activeGuidance).not.toContain('npm run deploy:sidechain');
    expect(activeGuidance).not.toContain('Run deploy-sidechain');
    expect(activeGuidance).toContain(
      'The legacy owner-mint deployment route is retired',
    );
  });

  it('keeps the Frontier receipt-extraction spike synthetic and read-only', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'spikes', 'spike5-frontier-pegout-extraction.ts'), 'utf-8');
    expect(source).toContain('function syntheticChecks()');
    expect(source).not.toMatch(
      /dotenv\/config|JsonRpcProvider|ethers\.Wallet|ContractFactory|relayerPrivateKey|assertSidechainBroadcastAllowed|mintSERG|transferOwnership|\.deploy\s*\(|\.approve\s*\(|\.pegOut\s*\(/u,
    );
  });

  it('removes aggregate settlement CLI submission and persistence branches', () => {
    const source = readFileSync(
      join(srcRoot, 'scripts', 'aggregate-settlement.ts'),
      'utf-8',
    );

    expect(source).toContain('Prepare commands construct unsigned diagnostics only. New legacy V1 signing');
    expect(source).toContain('node checking, authorization, submission, and transport are absent');
    expect(source).not.toContain('function recordSubmittedSettlement');
    expect(source).not.toContain('function recordSubmittedBatchSettlement');
    expect(source).not.toContain('submitExplicitAggregate');
    for (const command of [
      'submit',
      'submit-batch',
      'submit-with-ingest',
      'submit-anchored',
    ]) {
      expect(source).not.toContain(`npm run settle:aggregate -- ${command}`);
      expect(source).not.toContain(`if (command === '${command}')`);
    }
    expect(source).toContain(
      'npm run settle:aggregate -- confirm <sidechainTxHash> <settlementTxId>',
    );
    expect(source).toContain(
      'npm run settle:aggregate -- confirm-batch <settlementTxId>',
    );
  });
  it('routes aggregate settlement CLI batch confirmation through the batch service reconciler', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');
    expect(source).toContain('npm run settle:aggregate -- confirm-batch <settlementTxId>');

    const branchStart = source.indexOf("if (command === 'confirm-batch')");
    expect(branchStart).toBeGreaterThan(-1);
    const branchEnd = source.indexOf('return;', branchStart);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const branchSource = source.slice(branchStart, branchEnd);
    expect(branchSource).toContain('service.confirmBatchSettlement(');
    expect(branchSource).toContain('requireTrackerIdentity: false');
    expect(branchSource).not.toContain('assertSettlementSigningNodeAlignment(command)');
    expect(branchSource).not.toContain('service.submit');
    expect(branchSource).not.toContain('signAndSubmit');
  });

  it('opens aggregate dry-run commands with a read-only state tracker', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');
    expect(source).toContain('const READ_ONLY_AGGREGATE_COMMANDS = new Set([');
    expect(source).toContain('function isReadOnlyAggregateCommand');
    expect(source).toContain('readOnly: isReadOnlyAggregateCommand(command)');

    const setStart = source.indexOf('const READ_ONLY_AGGREGATE_COMMANDS = new Set([');
    const setEnd = source.indexOf(']);', setStart);
    expect(setStart).toBeGreaterThan(-1);
    expect(setEnd).toBeGreaterThan(setStart);
    const readOnlyCommandSet = source.slice(setStart, setEnd);
    for (const command of [
      'prepare',
      'prepare-batch',
      'prepare-with-ingest',
      'prepare-anchored',
    ]) {
      expect(readOnlyCommandSet).toContain(`'${command}'`);
    }
    for (const command of [
      'submit',
      'submit-with-ingest',
      'submit-anchored',
      'submit-batch',
      'confirm',
      'confirm-with-ingest',
      'confirm-anchored',
      'confirm-batch',
    ]) {
      expect(readOnlyCommandSet).not.toContain(`'${command}'`);
    }
  });

  it('removes legacy signed-check evidence capture from the aggregate CLI', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');
    expect(source).not.toContain('EVIDENCE_JSON_COMMANDS');
    expect(source).not.toContain('evidenceJsonPath');
    expect(source).not.toContain('--evidence-json');
    expect(source).not.toContain('writePrebroadcastEvidenceJsonIfRequested');
  });

  it('prevalidates aggregate CLI targets before opening state or clients', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');

    expect(source).toContain('resolveAggregateSettlementStateDbPath(options.stateDbPath)');
    expect(source).toContain('const deployed = loadAggregateSettlementDeployedState(options);');
    expect(source).toContain('const state = new StateTracker(stateDbTarget.path!, {');
    expect(source).toContain('const ergo = new ErgoClient();');

    const txHashIndex = source.indexOf('const txHash = args[0];');
    const stateDbIndex = source.indexOf('const stateDbTarget = resolveAggregateSettlementStateDbPath');
    const deployedIndex = source.indexOf('const deployed = loadAggregateSettlementDeployedState(options);');
    const stateIndex = source.indexOf('const state = new StateTracker(stateDbTarget.path!, {');
    const ergoIndex = source.indexOf('const ergo = new ErgoClient();');

    expect(txHashIndex).toBeGreaterThan(-1);
    expect(stateDbIndex).toBeGreaterThan(txHashIndex);
    expect(deployedIndex).toBeGreaterThan(stateDbIndex);
    expect(deployedIndex).toBeLessThan(stateIndex);
    expect(stateDbIndex).toBeLessThan(ergoIndex);
  });

  it('rejects removed aggregate signing and submit commands before opening state or clients', () => {
    const source = readFileSync(
      join(srcRoot, 'scripts', 'aggregate-settlement.ts'),
      'utf-8',
    );
    const main = source.indexOf('async function main(): Promise<void>');
    const allowlist = source.indexOf(
      'if (!SUPPORTED_AGGREGATE_COMMANDS.has(command)) usage();',
      main,
    );
    const state = source.indexOf(
      'const state = new StateTracker(stateDbTarget.path!, {',
      main,
    );
    const client = source.indexOf('const ergo = new ErgoClient();', main);

    expect(main).toBeGreaterThanOrEqual(0);
    expect(allowlist).toBeGreaterThan(main);
    expect(allowlist).toBeLessThan(state);
    expect(allowlist).toBeLessThan(client);
    expect(source).not.toContain('const SUBMIT_COMMANDS');
    expect(source).not.toContain('state.acquireFundsExecutionAuthority()');
    for (const command of [
      'check',
      'check-batch',
      'check-with-ingest',
      'check-anchored',
      'submit',
      'submit-batch',
      'submit-with-ingest',
      'submit-anchored',
    ]) {
      expect(source).not.toContain(`if (command === '${command}')`);
    }
  });
  it('keeps legacy owner mint out of active daemon composition', () => {
    const client = readFileSync(join(srcRoot, 'sidechain-client.ts'), 'utf-8');
    const contractAbi = readFileSync(
      join(srcRoot, 'sidechain-contract-abi.ts'),
      'utf-8',
    );
    const daemon = readFileSync(join(srcRoot, 'relayer-daemon.ts'), 'utf-8');
    const transition = readFileSync(
      join(srcRoot, 'peg-in-transition.ts'),
      'utf-8',
    );
    const confirmation = readFileSync(
      join(srcRoot, 'adapters', 'peg-in-mint-confirmation.ts'),
      'utf-8',
    );
    const lifecycle = readFileSync(
      join(srcRoot, 'relayer-core', 'peg-in-mint-transport-lifecycle.ts'),
      'utf-8',
    );
    const packageJson = JSON.parse(
      readFileSync(join(srcRoot, '..', 'package.json'), 'utf-8'),
    ) as { scripts?: Record<string, string> };

    expect(client).toContain('#bridgeContract!: ethers.Contract');
    expect(client).not.toMatch(
      /ethers\.Wallet|relayerPrivateKey|assertSidechainBroadcastAllowed/u,
    );
    expect(client).not.toContain('async updateErgoState');
    expect(client).not.toContain('.updateErgoState(');
    expect(client).not.toContain('async mintSERG');
    expect(client).not.toContain('this.bridgeContract.mintSERG(');
    expect(client).not.toContain('submitPegInMint');
    expect(client).not.toContain('signPegInMintEnvelope');
    expect(client).not.toContain('buildPegInMintEnvelope');
    expect(client).not.toContain('observePegInMintTarget');
    expect(client).not.toMatch(/public readonly provider|this\.provider/u);
    expect(client).toContain('readonly #provider: ethers.JsonRpcProvider');
    expect(client).toContain('createFrontierReadOnlyObservationPort');
    expect(contractAbi).not.toContain('mintSERG');
    expect(contractAbi).not.toContain('updateErgoState');
    expect(client).toContain(
      'loadTrackedDeploymentIdentityArtifactProfile',
    );
    expect(client).not.toContain(
      "readFileSync(runtimePath, 'utf8')",
    );
    expect(daemon).not.toContain('runPegInMintTransport');
    expect(daemon).not.toContain('executeMintTransport');
    expect(daemon).not.toContain('this.sidechain.provider');
    expect(transition).toContain('legacy owner-mint execution is retired');
    expect(transition).not.toContain('executeMintTransport');
    expect(transition).not.toContain('startFundsReleaseTransport');
    expect(confirmation).toContain(
      'observeFrontierPegInMintTransportConfirmation',
    );
    expect(confirmation).not.toMatch(
      /ethers\.Wallet|signTransaction|broadcastTransaction|mintSERG/u,
    );
    expect(lifecycle).not.toContain('executePegInMintTransport');
    expect(lifecycle).not.toContain('PegInMintTransportPorts');
    expect(existsSync(
      join(srcRoot, 'adapters', 'peg-in-mint-transport.ts'),
    )).toBe(false);
    expect(existsSync(
      join(srcRoot, 'apps', 'bridge-daemon', 'peg-in-mint-transport.ts'),
    )).toBe(false);
    expect(packageJson.scripts?.['deploy:sidechain']).toBeUndefined();
    expect(existsSync(
      join(srcRoot, 'scripts', 'deploy-sidechain.ts'),
    )).toBe(false);
  });

  it('keeps the reusable sidechain client observation-only', () => {
    const source = readFileSync(join(srcRoot, 'sidechain-client.ts'), 'utf-8');
    const port = readFileSync(
      join(srcRoot, 'frontier-read-only-observation-port.ts'),
      'utf-8',
    );
    expect(source).toContain(
      "console.log('   Mode:      historical observation only')",
    );
    expect(source).not.toMatch(
      /ethers\.Wallet|relayerPrivateKey|assertSidechainBroadcastAllowed|async updateErgoState|\.updateErgoState\s*\(/u,
    );
    expect(source).not.toMatch(/public readonly provider|this\.provider/u);
    expect(port).toContain("backend.send('eth_getBlockReceipts'");
    expect(port).not.toMatch(/sendTransaction|broadcastTransaction/u);
  });

  it('requires aggregate settlement state database targets to use the guarded state-db resolver', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');

    expect(source).toContain("import { resolveStateDbPath } from '../post-submit-observe-paths.js';");
    expect(source).toContain("let stateDbPath = './bridge-state.sqlite';");
    expect(source).toContain('let stateDbProvided = false;');
    expect(source).toContain("if (arg === '--state-db') {");
    expect(source).toContain("throw new Error('--state-db may only be provided once');");
    expect(source).toContain("throw new Error('--state-db requires a path');");
    expect(source).toContain('stateDbProvided = true;');
    expect(source).toContain('function resolveAggregateSettlementStateDbPath');
    expect(source).toContain('return { errors: resolved.errors.map(error => `aggregate settlement: ${error}`) };');
    expect(source).toContain('const state = new StateTracker(stateDbTarget.path!, {');
  });

  it('allows aggregate settlement to use an explicit guarded deployed-state JSON input', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');

    expect(source).toContain("import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';");
    expect(source).toContain('deployedStateJsonPath?: string;');
    expect(source).not.toContain('deployedStateJsonProvided');
    expect(source).toContain("if (arg === '--deployed-state-json') {");
    expect(source).toContain("throw new Error('--deployed-state-json may only be provided once');");
    expect(source).toContain("throw new Error('--deployed-state-json requires a path');");
    expect(source).toContain('deployedStateJsonPath = value;');
    expect(source).toContain("readEvidenceJsonTarget(options.deployedStateJsonPath, '--deployed-state-json')");
    expect(source).toContain('aggregate settlement deployed state: ${error}');
    expect(source).toContain('return loadDeployedState();');
    expect(source).toContain('const deployed = loadAggregateSettlementDeployedState(options);');
  });

  it('keeps aggregate settlement operator inputs explicit instead of auto-loading dotenv', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');

    expect(source).not.toContain('dotenv/config');
    expect(source).toContain("import { loadDeployedState, SUBSTRATE_CONFIG } from '../config.js';");
    expect(source).toContain('--state-db <relative.sqlite>');
    expect(source).toContain('--deployed-state-json <relative.json>');
    expect(source).toContain('provide approved environment');
  });

  it('removes aggregate settlement review JSON evidence generation', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');

    expect(source).not.toContain('function assertExplicitAggregateEvidenceInputs');
    expect(source).not.toContain('--evidence-json');
    expect(source).not.toContain('buildExplicitAggregateEvidenceSourceBindings');
    expect(source).not.toContain('buildAggregateSettlementPrebroadcastSourceBindings');
    expect(source).not.toContain('sourceBindings:');
  });

  it('keeps generic signer and node-client submission capabilities absent', () => {
    const signerSource = readFileSync(join(srcRoot, 'fleet-signer.ts'), 'utf-8');
    const clientSource = readFileSync(join(srcRoot, 'ergo-client.ts'), 'utf-8');
    const signOnlyStart = signerSource.indexOf(
      'export async function signTransactionForSubmission',
    );
    const signOnlyEnd = signerSource.indexOf(
      'function normalizeTransactionId',
      signOnlyStart,
    );
    const signOnlySource = signerSource.slice(signOnlyStart, signOnlyEnd);

    expect(signOnlySource).toContain('assertSignedTransactionIdMatchesExpected');
    expect(signerSource).not.toContain('export async function signAndSubmit(');
    expect(signerSource).not.toContain('export async function signAndSubmitDetailed(');
    expect(signerSource).not.toContain('export function interpretSubmitResult(');
    expect(signerSource).not.toContain("npostDirect('/transactions'");
    expect(clientSource).not.toContain('async submitTransaction(');
    expect(clientSource).not.toContain("this.client.post('/transactions',");
  });

  it('physically removes legacy aggregate execution and service transport APIs', () => {
    expect(
      existsSync(join(srcRoot, 'legacy-aggregate-settlement-execution.ts')),
    ).toBe(false);

    const service = readFileSync(
      join(srcRoot, 'aggregate-settlement-service.ts'),
      'utf-8',
    );
    for (const removed of [
      'preflightLegacyAggregateSettlementSubmission',
      'admitLegacyAggregateSettlementSubmission',
      'revalidateLegacyAggregateSettlementSubmission',
      'reserveLegacyAggregateSettlementSubmission',
      'finalizeLegacyAggregateSettlementSubmission',
      'legacyAggregateExecution',
    ]) {
      expect(service).not.toContain(removed);
    }
    expect(service).not.toContain('signAndSubmit');
    expect(service).not.toContain("'/transactions'");
  });
  it('does not export or import approval minters, resolver implementations, capability getters, or factories', () => {
    const sources = productionSources();
    const forbiddenExact = new Set([
      'StaticAggregateSettlementApprovalResolver',
      'createLegacyAggregateSettlementExecutionCapabilityForTesting',
      'getLegacyAggregateSettlementExecutionCapability',
      'getDisabledLegacyAggregateSettlementExecutionCapability',
    ]);
    const offenders = sources.flatMap(({ rel, source }) => {
      const names = [...runtimeExports(source), ...runtimeImports(source)];
      return names
        .filter(name =>
          forbiddenExact.has(name)
          || /^mint.*AggregateSettlementApproval$/.test(name)
          || /^get.*LegacyAggregateSettlementExecutionCapability$/.test(name))
        .map(name => `${rel}:${name}`);
    });

    expect(offenders).toEqual([]);
    expect(filesContainingIdentifier(sources, 'legacyAggregateExecution')).toEqual([]);
    for (const removed of [
      'LegacyAggregateSettlementSubmissionApproval',
      'mintSubmissionApproval',
      'mintValidatedFileAggregateSettlementApproval',
      'submissionApprovalForSingle',
      'submissionApprovalForBatch',
      'assertLegacyAggregateSettlementApprovalCurrent',
      'assertLegacyAggregateSettlementApprovalMatches',
      'assertLegacyAggregateSettlementApprovalNodeOrigin',
      'AggregateSettlementApprovalResolver',
      'StaticAggregateSettlementApprovalResolver',
      'loadAggregateSettlementApprovals',
    ]) {
      expect(filesContainingIdentifier(sources, removed)).toEqual([]);
    }
  });

  it('has no legacy aggregate submission facade or importer', () => {
    const sources = productionSources();
    const removedNames = [
      'submitFileApprovedAggregateBatchClaims',
      'submitFileApprovedAggregateSingleClaim',
      'submitFileApprovedAggregateSingleClaimNoIngest',
      'submitExplicitAggregateBatchClaims',
      'submitExplicitAggregateSingleClaim',
      'submitExplicitAggregateSingleClaimNoIngest',
      'submitExplicitAggregateSingleClaimNoIngestFromPegOut',
      'submitExplicitApprovedAggregateBatchClaims',
      'submitExplicitApprovedAggregateSingleClaim',
      'submitExplicitApprovedAggregateSingleClaimNoIngest',
      'submitExplicitApprovedAggregateSingleClaimNoIngestFromPegOut',
    ];

    for (const name of removedNames) {
      expect(filesImporting(sources, name)).toEqual([]);
      expect(filesContainingIdentifier(sources, name)).toEqual([]);
    }
  });
  it('keeps aggregate settlement recovery off the broadcast surface', () => {
    const recoveryRuntimePaths = [
      ['aggregate-settlement-recovery.ts'],
      ['adapters', 'aggregate-settlement-ergo-finality-policy.ts'],
      ['adapters', 'aggregate-settlement-ergo-observation.ts'],
      ['adapters', 'aggregate-settlement-recovery-ergo.ts'],
      ['adapters', 'aggregate-settlement-recovery-journal.ts'],
      ['adapters', 'ergo-node-endpoint-alignment.ts'],
      ['apps', 'bridge-daemon', 'aggregate-settlement-recovery.ts'],
    ];
    const recoveryRuntimeSources = recoveryRuntimePaths.map(parts =>
      readFileSync(join(srcRoot, ...parts), 'utf-8'));
    const cli = readFileSync(join(srcRoot, 'aggregate-settlement-recovery-cli.ts'), 'utf-8');
    const script = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement-recovery.ts'), 'utf-8');
    const packageJson = readFileSync(join(srcRoot, '..', 'package.json'), 'utf-8');
    const combined = [...recoveryRuntimeSources, cli, script].join('\n');
    const layeredRecoveryCombined = recoveryRuntimeSources.slice(1).join('\n');
    for (const source of recoveryRuntimeSources) {
      expect(source).not.toContain('fleet-signer');
      expect(source).not.toContain('legacy-aggregate-settlement-execution');
      expect(source).not.toContain('aggregate-settlement-approvals');
    }
    expect(cli).not.toContain('fleet-signer');
    expect(script).not.toContain('fleet-signer');
    expect(combined).not.toContain('signAndSubmit');
    expect(combined).not.toContain('signAndSubmitDetailed');
    expect(combined).not.toContain('signAndCheck');
    expect(combined).not.toContain('submitTransaction');
    expect(combined).not.toContain('npost');
    expect(combined).not.toContain('eth_sendRawTransaction');
    expect(combined).not.toContain("'/transactions'");
    expect(combined).not.toContain('"/transactions"');
    expect(combined).not.toContain('loadAggregateSettlementApprovals');
    expect(combined).not.toMatch(/\bsubmissionApproval\b/);
    expect(combined).not.toMatch(/\bbroadcastAuthorization\b/);
    expect(combined).not.toMatch(/\btransportCapability\b/);
    expect(combined).not.toContain('assertBroadcastAllowed');
    expect(combined).not.toContain('assertSidechainBroadcastAllowed');
    expect(layeredRecoveryCombined).not.toMatch(/\bsignTransaction\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\bsign_transaction\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\bsigner\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\bchecker\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\bsubmitter\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\bapproval\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\btransport\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\bbroadcast\b/);
    expect(layeredRecoveryCombined).not.toMatch(/\bWallet\b/);
    expect(cli).toContain("readOnly: args.command === 'scan'");
    expect(packageJson).toContain('"settle:aggregate:recover": "tsx src/scripts/aggregate-settlement-recovery.ts"');
  });

  it('keeps authenticated candidate reconciliation below funds capabilities', () => {
    const reconciliationRuntimePaths = [
      ['relayer-core', 'authenticated-settlement-candidate-reconciliation.ts'],
      ['adapters', 'authenticated-settlement-candidate-journal.ts'],
      ['adapters', 'authenticated-settlement-candidate-observation.ts'],
      [
        'apps',
        'bridge-daemon',
        'authenticated-settlement-candidate-reconciliation.ts',
      ],
    ];
    const sources = reconciliationRuntimePaths.map(parts =>
      readFileSync(join(srcRoot, ...parts), 'utf-8'));
    const combined = sources.join('\n');

    for (const forbiddenImport of [
      'fleet-signer',
      'authenticated-settlement-jvm-check',
      'legacy-aggregate-settlement-execution',
      'aggregate-settlement-approvals',
      'ergo-client',
      'sidechain-client',
      'state-tracker',
      'config.js',
    ]) {
      expect(combined).not.toContain(forbiddenImport);
    }
    for (const forbiddenCapability of [
      'signAndCheck',
      'signAndSubmit',
      'submitTransaction',
      'npost',
      'eth_sendRawTransaction',
      'submissionApproval',
      'broadcastAuthorization',
      'transportCapability',
      'assertBroadcastAllowed',
      'assertSidechainBroadcastAllowed',
    ]) {
      expect(combined).not.toContain(forbiddenCapability);
    }
    expect(combined).not.toMatch(/\bsignTransaction\b/);
    expect(combined).not.toMatch(/\bsign_transaction\b/);
    expect(combined).not.toMatch(/\bsigner\b/);
    expect(combined).not.toMatch(/\bchecker\b/);
    expect(combined).not.toMatch(/\bsubmitter\b/);
    expect(combined).not.toMatch(/\bapproval\b/);
    expect(combined).not.toMatch(/\btransport\b/);
    expect(combined).not.toMatch(/\bbroadcast\b/);
    expect(combined).not.toMatch(/\bWallet\b/);
  });

  it('keeps authenticated candidate and peg-in profile preparation pure and non-authorizing', () => {
    const profileRuntimePaths = [
      ['profiles', 'substrate-grandpa-v1', 'authenticated-settlement-candidate.ts'],
      ['profiles', 'substrate-grandpa-v1', 'authenticated-settlement-plan.ts'],
      ['profiles', 'substrate-grandpa-v1', 'authenticated-settlement-transaction.ts'],
      ['profiles', 'substrate-grandpa-v1', 'asset-profile.ts'],
      ['profiles', 'substrate-grandpa-v1', 'duplicate-prevention.ts'],
      ['profiles', 'substrate-grandpa-v1', 'ergo-settlement-policy.ts'],
      ['profiles', 'substrate-grandpa-v1', 'peg-in-commitment.ts'],
      ['profiles', 'substrate-grandpa-v1', 'peg-in-committed-vault.ts'],
      ['profiles', 'substrate-grandpa-v1', 'peg-in-mint-identity.ts'],
      ['profiles', 'substrate-grandpa-v1', 'peg-in-runtime-state.ts'],
      ['profiles', 'substrate-grandpa-v1', 'settlement-limits.ts'],
      ['profiles', 'substrate-grandpa-v1', 'spv-tracker-authenticated.ts'],
    ];
    const profileSources = profileRuntimePaths.map(parts =>
      readFileSync(join(srcRoot, ...parts), 'utf-8'));
    const combined = profileSources.join('\n');
    const service = readFileSync(join(srcRoot, 'aggregate-settlement-service.ts'), 'utf-8');

    for (const forbiddenImport of [
      'aggregate-settlement-service',
      'authenticated-settlement-jvm-check',
      'aggregate-settlement-approvals',
      'legacy-aggregate-settlement-execution',
      'sidechain-client',
      'state-tracker',
      'ergo-client',
      'config.js',
    ]) {
      expect(combined).not.toContain(forbiddenImport);
    }
    for (const forbiddenCapability of [
      'ensureEip12Box',
      'ContextExtension',
      'signAndCheck',
      'signAndSubmit',
      'submitTransaction',
      'mintSERG',
      'isBoxProcessed',
      'eth_sendRawTransaction',
      'broadcastAuthorization',
      'transportCapability',
    ]) {
      expect(combined).not.toContain(forbiddenCapability);
    }

    expect(service).toContain('prepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx');
    expect(service).toContain('materializeAuthenticatedSettlementUnsignedTxPure');
    expect(service).toContain('ensureEip12Box');
    expect(service).toContain('summarizeDefaultContextExtensionGuard');
    expect(service).toContain('PREPARED_AUTHENTICATED_SETTLEMENT_UNSIGNED_TX_RESULTS');
  });

  it('keeps anchor preflight on a read-only Ergo node client', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'anchor-preflight.ts'), 'utf-8');

    expect(source).toContain('Anchor Preflight -- read-only check');
    expect(source).toContain('new ErgoClient(parsedArgs.nodeUrl, { readOnly: true })');
    expect(source).not.toContain('submitTransaction');
    expect(source).not.toContain('assertBroadcastAllowed');
  });

  it('keeps fresh checkpoint auto-heights on a read-only EVM height client', () => {
    const script = readFileSync(join(srcRoot, 'scripts', 'testnet-fresh-checkpoint.ts'), 'utf-8');
    const client = readFileSync(join(srcRoot, 'read-only-evm-height-client.ts'), 'utf-8');

    expect(script).toContain('const sidechainRpcUrl = SUBSTRATE_CONFIG.evmRpcUrl');
    expect(script).toContain('createReadOnlyEvmHeightClient(sidechainRpcUrl)');
    expect(script).not.toContain('new ethers.JsonRpcProvider');
    expect(client).toContain("method: 'eth_blockNumber'");
    expect(client).not.toContain('eth_sendRawTransaction');
    expect(client).not.toContain('sendTransaction');
  });

  it('keeps aggregate daemon payout compatibility historical-only', () => {
    const daemon = readFileSync(join(srcRoot, 'relayer-daemon.ts'), 'utf-8');
    const readiness = readFileSync(join(srcRoot, 'live-settlement-readiness.ts'), 'utf-8');

    expect(readiness).toContain('historical confirmation and recovery only');
    expect(readiness).toContain(
      'candidate admission, signing, authorization, submission, and broadcast are absent',
    );
    expect(daemon).toContain(
      'Peg-out held fail-closed because legacy aggregate payout execution is retired',
    );
    expect(daemon).toContain('confirmSingleClaimSettlement(');

    for (const removed of [
      'loadAggregateSettlementApprovals',
      'submissionApprovalForSingle',
      'submissionApprovalForBatch',
      'submitFileApprovedAggregateSingleClaim',
      'submitFileApprovedAggregateBatchClaims',
      'tryBatchSettlement(',
    ]) {
      expect(daemon).not.toContain(removed);
    }

    const startupStart = daemon.indexOf('async start(): Promise<void>');
    const readinessIndex = daemon.indexOf(
      'assertLiveSettlementStartupReadiness(PROTOCOL_PARAMS)',
      startupStart,
    );
    const sidechainInitIndex = daemon.indexOf(
      'await this.sidechain.init()',
      startupStart,
    );
    expect(startupStart).toBeGreaterThanOrEqual(0);
    expect(readinessIndex).toBeGreaterThan(startupStart);
    expect(readinessIndex).toBeLessThan(sidechainInitIndex);
  });
  it('keeps aggregate settlement preparation unsigned and removes every node-check route', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'aggregate-settlement.ts'), 'utf-8');
    expect(source).toContain('Prepare commands construct unsigned diagnostics only.');
    expect(source).not.toContain('signAndCheck(');
    expect(source).not.toContain('/fleet-signer.js');
    expect(source).not.toContain('/transactions/check');

    for (const command of ['check', 'check-batch', 'check-with-ingest', 'check-anchored']) {
      expect(source).not.toContain(`if (command === '${command}')`);
      expect(source).not.toContain(`npm run settle:aggregate -- ${command}`);
    }
    for (const command of ['prepare', 'prepare-batch', 'prepare-with-ingest', 'prepare-anchored']) {
      expect(source).toContain(`if (command === '${command}')`);
    }
  });
});
