import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  comparePublicAuditAlphaCandidateIdentity,
  createPublicAuditGitEnvironment,
  inspectAuditGitCandidate,
  inspectPublicAuditAlphaPreflight,
  inspectRecursiveFrontierCheckout,
  PUBLIC_AUDIT_ALPHA_VALIDATION_STEPS,
  validateOpenZeppelinLicenseArtifact,
  validatePublicAuditAlphaManifest,
} from './public-audit-alpha.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(sourceDirectory, '..', '..');

describe('public audit alpha bootstrap', () => {
  it('permits public research review while blocking supported release claims', () => {
    const manifest = JSON.parse(readFileSync(
      path.join(bridgeRoot, 'docs', 'public-audit-alpha-manifest.json'),
      'utf8',
    ));

    expect(validatePublicAuditAlphaManifest(manifest)).toEqual([]);
    expect(manifest.classification).toBe('public-research-alpha');
    expect(manifest.sourcePublicationPolicy).toBe('permitted-after-promotion');
    expect(manifest.supportedReleaseStatus).toBe('blocked');
    expect(manifest.independentReviewStatus).toBe('open');
    expect(manifest.validationSteps).toEqual(PUBLIC_AUDIT_ALPHA_VALIDATION_STEPS);
    expect(manifest.authority.scope).toBe('audit-command-only');
    expect(manifest.claimBoundaries).toContain(
      'The tracked demo:devnet:consolidate-rewards utility is separately invoked, restricted to the patched loopback devnet, outside daemon composition, and never invoked by the audit command.',
    );
    expect(manifest.requiredArtifacts).toEqual(expect.arrayContaining([
      'relayer/package.json',
      'relayer/.npmignore',
      'relayer/src/public-audit-alpha-bundle.ts',
      'relayer/src/scripts/public-audit-alpha-bundle.ts',
      'relayer/src/validity-application-pooled-reserve-replay-cutover-v6.ts',
      'relayer/src/validity-application-pooled-reserve-provisioning-v6.ts',
      'relayer/src/validity-application-pooled-reserve-legacy-route-requirements-v6.ts',
      'relayer/src/validity-application-pooled-reserve-cutover-eligibility-v6.ts',
      'relayer/src/validity-application-pooled-reserve-target-check-request-v6.ts',
      'relayer/src/validity-application-pooled-reserve-funds-authority-switch-precondition-v6.ts',
    ]));
    expect(manifest.implementedSlices.at(-1)).toBe('WP-08L');
    expect(manifest.requiredArtifacts).toEqual(expect.arrayContaining([
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'solidity/LICENSE',
      'solidity/THIRD_PARTY_LICENSES/OpenZeppelin-Contracts-5.6.1.txt',
    ]));
    expect(manifest.openGaps).not.toContainEqual(expect.objectContaining({
      id: 'open-source-license',
    }));
    expect(manifest.validationSteps).toContainEqual({
      id: 'alert-delivery-drill',
      command: 'npm run operator:drill:alerts',
    });
    expect(manifest.openGaps.at(-1)).toMatchObject({
      id: 'external-alert-delivery-acknowledgement-and-live-recovery-evidence',
      severity: 'high',
      status: 'blocked',
    });
    expect(manifest.openGaps.find((gap: Record<string, unknown>) => (
      gap.id === 'historical-authority-cutover'
    ))).toMatchObject({
      nextAction: expect.stringMatching(
        /distinct V6 settlement.*retaining the frozen V5 proof-statement semantics/,
      ),
    });
    expect(manifest.openGaps.map((gap: Record<string, unknown>) => (
      String(gap.nextAction)
    )).join('\n')).not.toMatch(/\bnew V4-specific proof family\b/);
    expect(manifest.openGaps.every((gap: Record<string, unknown>) => (
      typeof gap.ownerRole === 'string'
      && typeof gap.claimImpact === 'string'
      && ['critical', 'high'].includes(String(gap.severity))
    ))).toBe(true);
    expect(manifest.openGaps.find((gap: Record<string, unknown>) => (
      gap.id === 'independent-security-review'
    ))).toMatchObject({
      claimImpact: expect.stringContaining(
        'Does not block source publication for public research review.',
      ),
    });
  });

  it('pins the exact OpenZeppelin Contracts 5.6.1 MIT notice', () => {
    const artifact = readFileSync(path.join(
      bridgeRoot,
      'solidity',
      'THIRD_PARTY_LICENSES',
      'OpenZeppelin-Contracts-5.6.1.txt',
    ));
    expect(validateOpenZeppelinLicenseArtifact(artifact)).toEqual([]);
    expect(validateOpenZeppelinLicenseArtifact(Buffer.from('tampered license'))).toEqual([
      'OpenZeppelin Contracts 5.6.1 license artifact must match the pinned SHA-256',
    ]);
  });

  it('rejects authority, ownership, and validation-sequence drift', () => {
    const manifest = JSON.parse(readFileSync(
      path.join(bridgeRoot, 'docs', 'public-audit-alpha-manifest.json'),
      'utf8',
    ));
    const authorityDrift = JSON.parse(JSON.stringify(manifest));
    authorityDrift.authority.externalBroadcastAllowed = true;
    expect(validatePublicAuditAlphaManifest(authorityDrift)).toContain(
      'authority must match the fixed no-live-capability boundary',
    );

    const ownerDrift = JSON.parse(JSON.stringify(manifest));
    ownerDrift.openGaps[0].ownerRole = '';
    expect(validatePublicAuditAlphaManifest(ownerDrift)).toContain(
      'gate5-native-profile-activation ownerRole must be concrete',
    );
    expect(validatePublicAuditAlphaManifest(ownerDrift)).toContain(
      'openGaps must match the reviewed owner, claim-impact, and next-action ledger',
    );

    const sequenceDrift = JSON.parse(JSON.stringify(manifest));
    sequenceDrift.validationSteps.reverse();
    expect(validatePublicAuditAlphaManifest(sequenceDrift)).toContain(
      'validationSteps must match the fixed non-broadcast audit sequence',
    );

    const releaseDrift = JSON.parse(JSON.stringify(manifest));
    releaseDrift.supportedReleaseStatus = 'released';
    expect(validatePublicAuditAlphaManifest(releaseDrift)).toContain(
      'supportedReleaseStatus must be blocked',
    );

    const sourcePublicationDrift = JSON.parse(JSON.stringify(manifest));
    sourcePublicationDrift.sourcePublicationPolicy = 'unconditional';
    expect(validatePublicAuditAlphaManifest(sourcePublicationDrift)).toContain(
      'sourcePublicationPolicy must be permitted-after-promotion',
    );

    const sliceDrift = JSON.parse(JSON.stringify(manifest));
    sliceDrift.implementedSlices.pop();
    expect(validatePublicAuditAlphaManifest(sliceDrift)).toContain(
      'implementedSlices must preserve the exact ordered values',
    );

    const claimDrift = JSON.parse(JSON.stringify(manifest));
    claimDrift.claimBoundaries.pop();
    expect(validatePublicAuditAlphaManifest(claimDrift)).toContain(
      'claimBoundaries must match the fixed ordered non-claim set',
    );
  });

  it('fails closed when the broadcast environment is enabled', () => {
    const report = inspectPublicAuditAlphaPreflight({
      bridgeRoot,
      environment: { BRIDGE_BROADCAST_ENABLED: 'true' },
    });
    expect(report.status).toBe('BLOCKED');
    expect(report.sourcePublicationPolicy).toBe('permitted-after-promotion');
    expect(report).not.toHaveProperty('sourcePublicationStatus');
    expect(report.checks.broadcastDisabled).toBe(false);
    expect(report.errors).toContain('audit preflight requires bridge broadcast to remain disabled');
    expect(report.authority.scope).toBe('audit-command-only');
    expect(report.authority.externalBroadcastPerformed).toBe(false);
    expect(report.authority.testSuiteMayUseEphemeralKeys).toBe(true);
  });

  it('rejects index drift, untracked source, and an inexact recursive checkout', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bridge-audit-candidate-'));
    const aliasRoot = `${root}-alias`;
    const frontierRoot = path.join(root, 'substrate-node');
    const runGit = (cwd: string, ...args: string[]) => execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    const gitmodules = [
      '[submodule "substrate-node"]',
      '\tpath = substrate-node',
      '\turl = https://github.com/polkadot-evm/frontier.git',
      '',
    ].join('\n');

    try {
      runGit(root, 'init');
      runGit(root, 'config', 'user.name', 'Audit Fixture');
      runGit(root, 'config', 'user.email', 'audit-fixture@example.invalid');
      runGit(root, 'config', 'core.autocrlf', 'false');
      runGit(root, 'init', 'substrate-node');
      runGit(frontierRoot, 'config', 'user.name', 'Audit Fixture');
      runGit(frontierRoot, 'config', 'user.email', 'audit-fixture@example.invalid');
      runGit(frontierRoot, 'config', 'core.autocrlf', 'false');
      writeFileSync(path.join(frontierRoot, 'source.txt'), 'frontier\n');
      runGit(frontierRoot, 'add', 'source.txt');
      runGit(frontierRoot, 'commit', '-m', 'fixture');
      const frontierHead = runGit(frontierRoot, 'rev-parse', 'HEAD');

      writeFileSync(path.join(root, '.gitmodules'), gitmodules);
      writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
      runGit(root, 'add', '.gitmodules', 'tracked.txt');
      runGit(root, 'update-index', '--add', '--cacheinfo', `160000,${frontierHead},substrate-node`);
      runGit(root, 'commit', '-m', 'fixture');

      const entryCandidate = inspectAuditGitCandidate({ repositoryRoot: root, bridgeRoot: root });
      expect(entryCandidate.worktreeMatchesIndex).toBe(true);
      expect(entryCandidate.untrackedSourceAbsent).toBe(true);
      expect(inspectRecursiveFrontierCheckout({ bridgeRoot: root })).toBe(true);
      symlinkSync(root, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');
      expect(inspectRecursiveFrontierCheckout({ bridgeRoot: aliasRoot })).toBe(true);

      const alternateIndex = path.join(root, '.git', 'alternate-index');
      copyFileSync(path.join(root, '.git', 'index'), alternateIndex);
      writeFileSync(path.join(root, 'tracked.txt'), 'staged through the real index\n');
      runGit(root, 'add', 'tracked.txt');
      writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
      expect(inspectAuditGitCandidate({
        repositoryRoot: root,
        bridgeRoot: root,
        environment: { ...process.env, GIT_INDEX_FILE: alternateIndex },
      }).worktreeMatchesIndex).toBe(false);
      runGit(root, 'read-tree', 'HEAD');

      writeFileSync(path.join(root, 'tracked.txt'), 'drift\n');
      expect(inspectAuditGitCandidate({ repositoryRoot: root, bridgeRoot: root }).worktreeMatchesIndex)
        .toBe(false);
      writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');

      writeFileSync(path.join(root, 'tracked.txt'), 'staged\n');
      runGit(root, 'add', 'tracked.txt');
      const stagedCandidate = inspectAuditGitCandidate({ repositoryRoot: root, bridgeRoot: root });
      expect(stagedCandidate.worktreeMatchesIndex).toBe(true);
      expect(comparePublicAuditAlphaCandidateIdentity(entryCandidate, stagedCandidate)).toEqual([
        'repository index inventory changed during the audit',
      ]);
      runGit(root, 'commit', '-m', 'staged drift');
      const committedCandidate = inspectAuditGitCandidate({ repositoryRoot: root, bridgeRoot: root });
      expect(comparePublicAuditAlphaCandidateIdentity(stagedCandidate, committedCandidate)).toEqual([
        'HEAD commit changed during the audit',
      ]);

      writeFileSync(path.join(root, 'untracked.txt'), 'untracked\n');
      expect(inspectAuditGitCandidate({ repositoryRoot: root, bridgeRoot: root }).untrackedSourceAbsent)
        .toBe(false);
      rmSync(path.join(root, 'untracked.txt'));

      writeFileSync(path.join(frontierRoot, 'source.txt'), 'dirty\n');
      expect(inspectRecursiveFrontierCheckout({ bridgeRoot: root })).toBe(false);
      writeFileSync(path.join(frontierRoot, 'source.txt'), 'frontier\n');

      writeFileSync(path.join(root, '.gitmodules'), gitmodules.replace('polkadot-evm', 'example'));
      runGit(root, 'add', '.gitmodules');
      writeFileSync(path.join(root, '.gitmodules'), gitmodules);
      const parentMetadataDrift = inspectAuditGitCandidate({
        repositoryRoot: root,
        bridgeRoot: root,
      });
      expect(parentMetadataDrift.worktreeMatchesIndex).toBe(false);
      expect(parentMetadataDrift.repositoryIndexInventorySha256)
        .not.toBe(committedCandidate.repositoryIndexInventorySha256);
    } finally {
      rmSync(aliasRoot, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pins clean-checkout line-ending semantics without inheriting Git overrides', () => {
    const environment = createPublicAuditGitEnvironment({
      ...process.env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.filemode',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_INDEX_FILE: 'untrusted-index',
    });

    expect(environment.GIT_CONFIG_COUNT).toBe('1');
    expect(environment.GIT_CONFIG_KEY_0).toBe('core.autocrlf');
    expect(environment.GIT_CONFIG_VALUE_0).toBe(process.platform === 'win32' ? 'true' : 'false');
    expect(environment.GIT_CONFIG_GLOBAL).toBe(process.platform === 'win32' ? 'NUL' : '/dev/null');
    expect(environment.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(environment.GIT_INDEX_FILE).toBeUndefined();
  });

  it('keeps the single audit command exact and non-live', () => {
    const packageJson = JSON.parse(readFileSync(path.join(bridgeRoot, 'relayer', 'package.json'), 'utf8'));
    const auditRunner = readFileSync(
      path.join(bridgeRoot, 'relayer', 'src', 'scripts', 'public-audit-alpha.ts'),
      'utf8',
    );
    const boundedVitestRunner = readFileSync(
      path.join(bridgeRoot, 'relayer', 'src', 'scripts', 'run-bounded-vitest.ts'),
      'utf8',
    );
    const cleanCheckoutRunner = readFileSync(
      path.join(bridgeRoot, 'relayer', 'src', 'scripts', 'check-clean-checkout.ts'),
      'utf8',
    );
    const auditGuide = readFileSync(
      path.join(bridgeRoot, 'docs', 'public-audit-alpha.md'),
      'utf8',
    );
    const validationScriptsBlock = auditRunner.match(
      /const validationScripts = \[([\s\S]*?)\] as const;/,
    );
    expect(validationScriptsBlock).not.toBeNull();
    const orchestratedScripts = [
      ...(validationScriptsBlock?.[1] ?? '').matchAll(/'([^']+)'/g),
    ].map(match => match[1]);
    const manifestScripts = PUBLIC_AUDIT_ALPHA_VALIDATION_STEPS
      .slice(1, -1)
      .map(step => step.command.replace(/^npm run /, ''));

    expect(packageJson.scripts['audit:alpha:preflight']).toBe(
      'tsx src/scripts/public-audit-alpha-preflight.ts',
    );
    expect(auditGuide).toContain('`demo:devnet:consolidate-rewards`');
    expect(packageJson.scripts['audit:alpha:release-structure']).toBe(
      'tsx src/scripts/public-audit-release-gate.ts',
    );
    expect(packageJson.scripts['audit:alpha']).toBe(
      'tsx src/scripts/public-audit-alpha.ts',
    );
    expect(packageJson.scripts['sources:verify:workflow']).toBe(
      'tsx src/scripts/validate-standalone-consensus-build-workflow.ts',
    );
    expect(orchestratedScripts).toEqual(manifestScripts);
    expect(packageJson.scripts['audit:alpha']).not.toMatch(/deploy|submit|broadcast|daemon|roundtrip/i);
    expect(packageJson.scripts['test:bounded']).not.toContain('--start-after');
    expect(boundedVitestRunner).toContain(
      'VITEST_START_AFTER is unsupported because inherited environment must not narrow audit tests',
    );
    expect(boundedVitestRunner).toContain(
      "parseResumeBoundary(process.argv.slice(2))",
    );
    expect(boundedVitestRunner).toContain(
      "--start-after must leave at least one collected test file to execute",
    );
    expect(boundedVitestRunner).toContain(
      "{ envName: 'RELEASE_GATE_TEST_SHARD', shardCount: 64 }",
    );
    expect(boundedVitestRunner).toContain(
      "{ envName: 'RELEASE_NOTES_TEST_SHARD', shardCount: 8 }",
    );
    expect(boundedVitestRunner).toContain(
      "const DEFAULT_TEST_TIMEOUT_MS = process.platform === 'win32'",
    );
    expect(boundedVitestRunner).toContain('? 15_000');
    expect(boundedVitestRunner).toContain(': 5_000;');
    expect(boundedVitestRunner).toContain("'--testTimeout',");
    expect(boundedVitestRunner).toContain('String(DEFAULT_TEST_TIMEOUT_MS)');
    expect(packageJson.scripts['check:clean-checkout']).toBe(
      'tsx src/scripts/check-clean-checkout.ts',
    );
    expect(auditRunner).toContain('const npmCli = resolveAuditNpmCli()');
    expect(cleanCheckoutRunner).toContain('BRIDGE_COMPILER_NODE_EXECUTABLE');
    expect(cleanCheckoutRunner).toContain("'substrate-federated-tracker-compiler-lock-v1.json'");
    expect(cleanCheckoutRunner).toContain("'clean-checkout-npm-lock-v1.json'");
    expect(cleanCheckoutRunner).toContain(
      'runAuditedNpmPackageBoundary(process.execPath, npmCli, auditEnvironment)',
    );
    expect(auditRunner.match(/resolveAuditNpmCli\(\)/g)).toHaveLength(2);
    expect(auditRunner).toContain('audit npm CLI identity changed during validation');
    expect(cleanCheckoutRunner).toContain('runCompilerCheck(compilerNode');
    expect(cleanCheckoutRunner).not.toContain("npmCli,\n    'check'");
    expect(auditGuide).toContain('npm 11.16.0');
    expect(auditGuide).toContain('`clean-checkout-npm-lock-v1.json`');
    expect(auditGuide).toMatch(
      /candidate provenance and cleanliness are\s+intentionally superproject-wide/,
    );
    expect(auditGuide).toMatch(
      /sibling content cannot enter the bridge\s+bundle/,
    );
    expect(auditGuide).not.toContain(
      'sibling repositories from becoming audit inputs',
    );
  });

  it('keeps deployment state out of tracked source without opening it', () => {
    const tracked = execFileSync(
      'git',
      ['-C', bridgeRoot, 'ls-files', '--', 'contracts/deployed_state.json'],
      { encoding: 'utf8', windowsHide: true },
    ).trim();
    expect(tracked).toBe('');
    expect(readFileSync(path.join(bridgeRoot, '.gitignore'), 'utf8')).toContain(
      'contracts/deployed_state.json',
    );
  });

  it('keeps the devnet API key out of operator output', () => {
    const script = readFileSync(
      path.join(bridgeRoot, 'relayer', 'scripts', 'devnet-auto-env-from-node1.ps1'),
      'utf8',
    );
    const apiKeyOutputLines = script
      .split(/\r?\n/)
      .filter(line => line.includes('Write-Host') && line.includes('ERGO_API_KEY'));

    expect(apiKeyOutputLines).toEqual([
      'Write-Host "  ERGO_API_KEY set (value hidden)"',
    ]);
  });

  it('routes the README to audit before every live-capable workflow', () => {
    const readme = readFileSync(path.join(bridgeRoot, 'README.md'), 'utf8');
    expect(readme).toContain('[Public Research Alpha](docs/public-audit-alpha.md)');
    expect(readme).toContain('npm.cmd run audit:alpha');
    expect(readme.indexOf('## Audit First')).toBeLessThan(readme.indexOf('## Operations Boundary'));
    expect(readme).not.toMatch(/BRIDGE_BROADCAST_ENABLED\s*=\s*true/i);
    expect(readme).not.toMatch(/src\/scripts\/deploy|test-roundtrip|auto-seeds sERG|API key `hello`|\.env\.example/i);
  });

  it('keeps the standalone workflow recursive and bound to both audit and source rebuilds', () => {
    const workflow = readFileSync(
      path.join(bridgeRoot, '.github', 'workflows', 'relayer-checks.yml'),
      'utf8',
    );
    expect(workflow).toContain('submodules: recursive');
    expect(workflow).toContain('node-version: "24.18.1"');
    expect(workflow).toContain('node-version: "24.14.0"');
    expect(workflow).toContain('BRIDGE_COMPILER_NODE_EXECUTABLE');
    expect(workflow).toContain('BRIDGE_AUDIT_NODE_DIRECTORY');
    expect(workflow).toContain('Isolate audit Node.js');
    expect(workflow).toContain("bridge-audit-node-$([guid]::NewGuid().ToString('N'))");
    expect(workflow).toContain("'node_modules\\npm\\npmrc'");
    expect(workflow).toContain("'unexpected npmrc overlay content in hosted Node toolcache'");
    expect(workflow).toContain("'e2s.authenticated-v2-runtime-bundle-build-lock.v2'");
    expect(workflow).toContain("'e2s.clean-checkout-npm-lock.v1'");
    expect(workflow).toContain("'hosted audit npm package does not match its lock'");
    expect(workflow).toContain('BRIDGE_AUDIT_NODE_EXECUTABLE');
    expect(workflow).toContain('BRIDGE_AUDIT_NPM_CLI');
    expect(workflow).toContain('& $env:BRIDGE_AUDIT_NODE_EXECUTABLE $env:BRIDGE_AUDIT_NPM_CLI ci');
    expect(workflow).not.toContain('run: npm.cmd ci');
    expect(workflow).toContain('uses: dtolnay/rust-toolchain@1.97.1');
    expect(workflow).not.toContain('uses: dtolnay/rust-toolchain@stable');
    expect(workflow).toContain('working-directory: relayer');
    expect(workflow).toContain('& $env:BRIDGE_AUDIT_NODE_EXECUTABLE $env:BRIDGE_AUDIT_NPM_CLI run audit:alpha');
    expect(workflow).toContain('  consensus-sources:');
    expect(workflow).toContain('npm run sources:verify:workflow');
    expect(workflow).toContain('Build native checkpoint cross-language executables');
    expect(workflow).toContain('--supplied-verifier "$GITHUB_WORKSPACE/substrate-node/target/debug/bridge-checkpoint-verifier"');
    expect(workflow).toContain('--supplied-codec "$GITHUB_WORKSPACE/substrate-node/target/debug/bridge-rpc-proof-codec"');
    expect(workflow).toContain('cargo build --locked --release -p frontier-template-node');
    expect(workflow).toContain('sbt assembly');
    expect(workflow).toContain('".gitignore"');
    expect(workflow).toContain('"sources/**"');
    expect(workflow).toContain('"solidity/**"');
    expect(workflow).toContain('"substrate-node"');
    expect(workflow).not.toContain('Run release evidence structural gate');
  });
});
