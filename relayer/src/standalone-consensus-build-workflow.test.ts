import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  inspectStandaloneConsensusBuildWorkflow,
  STANDALONE_CONSENSUS_WORKFLOW_PATH,
  validateStandaloneConsensusBuildWorkflow,
} from './standalone-consensus-build-workflow.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(sourceDirectory, '..', '..');
const workflowText = readFileSync(
  path.resolve(bridgeRoot, STANDALONE_CONSENSUS_WORKFLOW_PATH),
  'utf8',
);
const sourceLock = JSON.parse(readFileSync(
  path.resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'),
  'utf8',
));

describe('standalone consensus-source build workflow', () => {
  it('binds the standalone hosted command graph to the canonical source lock', () => {
    const report = inspectStandaloneConsensusBuildWorkflow({ bridgeRoot });

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
    expect(report.checks).toEqual({
      yamlSyntaxValid: true,
      exactCommandGraphValid: true,
      recursiveGitlinkCheckoutRequired: true,
      lockedPatchesOnly: true,
      sourceIdentityRecheckedAfterBuilds: true,
      noLiveCapabilityCommands: true,
    });
    expect(report.sourceIdentity).toEqual({
      frontierRepository: sourceLock.frontier.repository,
      frontierCommit: sourceLock.frontier.commit,
      frontierPatchPath: sourceLock.frontier.patchPath,
      ergoRepository: sourceLock.ergoNode.repository,
      ergoBaseCommit: sourceLock.ergoNode.baseCommit,
      ergoPatchPath: sourceLock.ergoNode.patchPath,
    });
    expect(report.boundaries).toEqual({
      hostedExecutionObserved: false,
      proofProfileActivated: false,
      runtimeDeploymentIdentityProved: false,
      gate5Closed: false,
      publicationAuthorized: false,
    });
  });

  it('rejects malformed YAML before interpreting a command graph', () => {
    const result = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace('jobs:\n', 'jobs: [\n'),
      sourceLock,
    );

    expect(result.checks.yamlSyntaxValid).toBe(false);
    expect(result.errors.some(error => error.startsWith('workflow YAML is invalid:'))).toBe(true);
  });

  it('rejects workflow-level inheritance and unreviewed sibling jobs', () => {
    const inheritedEnvironment = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        'permissions:\n',
        'env:\n  BASH_ENV: /tmp/unreviewed-bootstrap\n\npermissions:\n',
      ),
      sourceLock,
    );
    expect(inheritedEnvironment.errors).toContain(
      'workflow may contain only its reviewed name, triggers, permissions, and jobs',
    );

    const siblingJob = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '  consensus-sources:\n',
        '  unreviewed-network-job:\n    runs-on: ubuntu-latest\n    steps:\n      - run: curl https://example.invalid\n\n  consensus-sources:\n',
      ),
      sourceLock,
    );
    expect(siblingJob.errors).toContain(
      'workflow jobs must be exactly audit-alpha, solidity-audit, and consensus-sources',
    );
  });

  it('binds exact trigger coverage and rejects decoded target triggers', () => {
    const missingSourceCoverage = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace('      - "sources/**"\n', ''),
      sourceLock,
    );
    expect(missingSourceCoverage.errors).toContain(
      'pull_request paths must match the reviewed workflow coverage',
    );

    const decodedTargetTrigger = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace('on:\n', 'on:\n  "pull_request\\u005ftarget": {}\n'),
      sourceLock,
    );
    expect(decodedTargetTrigger.errors).toContain(
      'workflow triggers must be exactly pull_request and push',
    );

    const duplicateFeaturePush = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace('      - "a-shannon/research-alpha"', '      - "a-shannon/**"'),
      sourceLock,
    );
    expect(duplicateFeaturePush.errors).toContain(
      'push branches and paths must match the reviewed workflow coverage',
    );
  });

  it('keeps dependency auditing fail-closed while bounding transient fetch retries', () => {
    const missingRetry = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(' --fetch-retries=5', ''),
      sourceLock,
    );
    expect(missingRetry.errors).toContain(
      'Audit Solidity dependencies: run command must match the reviewed command graph',
    );
    expect(missingRetry.checks.exactCommandGraphValid).toBe(false);

    const ignoredAuditFailure = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace('--fetch-timeout=30000', '--fetch-timeout=30000 || true'),
      sourceLock,
    );
    expect(ignoredAuditFailure.errors).toContain(
      'Audit Solidity dependencies: run command must match the reviewed command graph',
    );
    expect(ignoredAuditFailure.checks.exactCommandGraphValid).toBe(false);

    const redirectedRegistry = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '--registry=https://registry.npmjs.org/',
        '--registry=https://example.invalid/',
      ),
      sourceLock,
    );
    expect(redirectedRegistry.errors).toContain(
      'Audit Solidity dependencies: run command must match the reviewed command graph',
    );

    const omittedDevelopmentDependencies = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        ' --include=dev --include=optional --include=peer',
        ' --omit=dev --include=optional --include=peer',
      ),
      sourceLock,
    );
    expect(omittedDevelopmentDependencies.errors).toContain(
      'Audit Solidity dependencies: run command must match the reviewed command graph',
    );
  });

  it('rejects a non-recursive or superproject-relative checkout', () => {
    const nonRecursive = validateStandaloneConsensusBuildWorkflow(
      workflowText.replaceAll('submodules: recursive', 'submodules: false'),
      sourceLock,
    );
    expect(nonRecursive.checks.recursiveGitlinkCheckoutRequired).toBe(false);
    expect(nonRecursive.errors).toContain(
      'Checkout recursive source graph: with bindings must match the reviewed workflow',
    );

    const nested = validateStandaloneConsensusBuildWorkflow(
      workflowText.replaceAll(
        'working-directory: relayer',
        'working-directory: ergo-sidechain-bridge/relayer',
      ),
      sourceLock,
    );
    expect(nested.errors).toContain(
      'workflow jobs must not contain superproject-relative paths',
    );
  });

  it('rejects moving Ergo refs and unreviewed patch paths', () => {
    const movingRef = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        `refs/tags/${sourceLock.ergoNode.baseTag}`,
        'refs/heads/main',
      ),
      sourceLock,
    );
    expect(movingRef.errors).toContain(
      'Prepare pinned patched Ergo source: run command must match the reviewed command graph',
    );

    const foreignPatch = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        sourceLock.ergoNode.patchPath,
        'sources/ergo-node/unreviewed.patch',
      ),
      sourceLock,
    );
    expect(foreignPatch.checks.lockedPatchesOnly).toBe(false);
    expect(foreignPatch.errors).toContain(
      'standalone consensus job may apply only the two tracked locked patches',
    );
  });

  it('rejects commands co-modified in the source lock and workflow', () => {
    const unreviewedCommand = 'curl https://example.invalid';
    const driftedLock = structuredClone(sourceLock);
    driftedLock.frontier.buildCommand = unreviewedCommand;
    const result = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(sourceLock.frontier.buildCommand, unreviewedCommand),
      driftedLock,
    );

    expect(result.errors).toContain(
      'frontier.buildCommand must match the reviewed command',
    );
    expect(result.checks.exactCommandGraphValid).toBe(false);
  });

  it('rejects patch execution outside the reviewed bash shell', () => {
    const result = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace('        shell: bash\n        run: |', '        shell: pwsh\n        run: |'),
      sourceLock,
    );

    expect(result.errors).toContain(
      'Apply tracked Frontier runtime commitment patch: shell must be bash',
    );
    expect(result.checks.exactCommandGraphValid).toBe(false);
  });

  it('binds the cross-language vector to same-job supplied executables', () => {
    const missingBuild = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '      - name: Build native checkpoint cross-language executables\n',
        '',
      ),
      sourceLock,
    );
    expect(missingBuild.errors).toContain(
      'standalone consensus job must preserve the exact ordered command graph',
    );

    const foreignVerifier = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '$GITHUB_WORKSPACE/substrate-node/target/debug/bridge-checkpoint-verifier',
        '/tmp/unreviewed-bridge-checkpoint-verifier',
      ),
      sourceLock,
    );
    expect(foreignVerifier.errors).toContain(
      'Verify native finalized checkpoint cross-language vector: run command must match the reviewed command graph',
    );
    expect(foreignVerifier.checks.exactCommandGraphValid).toBe(false);
  });

  it('rejects reordered identity checks and live-capability commands', () => {
    const reordered = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '      - name: Recheck source identity after builds',
        '      - name: Recheck source identity before builds',
      ),
      sourceLock,
    );
    expect(reordered.checks.sourceIdentityRecheckedAfterBuilds).toBe(false);
    expect(reordered.errors).toContain(
      'standalone consensus job must preserve the exact ordered command graph',
    );

    const liveCommand = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        'run: npm run sources:verify:lock',
        'run: npm run deploy',
      ),
      sourceLock,
    );
    expect(liveCommand.checks.noLiveCapabilityCommands).toBe(false);
    expect(liveCommand.errors).toContain(
      'workflow jobs must not contain deployment, submission, broadcast, wallet, or runtime-state commands',
    );
  });

  it('rejects public-audit command drift and live-capability mutations', () => {
    const cachedUnverifiedRuntime = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '          node-version: "24.18.1"',
        '          node-version: "24.18.1"\n          cache: npm',
      ),
      sourceLock,
    );
    expect(cachedUnverifiedRuntime.errors).toContain(
      'Setup Node.js: with bindings must match the reviewed workflow',
    );

    const liveAuditCommand = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '& $env:BRIDGE_AUDIT_NODE_EXECUTABLE $env:BRIDGE_AUDIT_NPM_CLI ci',
        '& $env:BRIDGE_AUDIT_NODE_EXECUTABLE $env:BRIDGE_AUDIT_NPM_CLI run deploy',
      ),
      sourceLock,
    );
    expect(liveAuditCommand.checks.noLiveCapabilityCommands).toBe(false);
    expect(liveAuditCommand.errors).toContain(
      'Install relayer dependencies: run command must match the reviewed command graph',
    );
    expect(liveAuditCommand.errors).toContain(
      'workflow jobs must not contain deployment, submission, broadcast, wallet, or runtime-state commands',
    );

    const pythonBytecodeEnabled = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        "          $env:PYTHONDONTWRITEBYTECODE = '1'\n",
        '',
      ),
      sourceLock,
    );
    expect(pythonBytecodeEnabled.errors).toContain(
      'Install relayer dependencies: run command must match the reviewed command graph',
    );

    const auditPythonBytecodeEnabled = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        [
          '      - name: Run public-audit candidate gate',
          '        run: |',
          "          $env:PYTHONDONTWRITEBYTECODE = '1'",
        ].join('\n'),
        [
          '      - name: Run public-audit candidate gate',
          '        run: |',
        ].join('\n'),
      ),
      sourceLock,
    );
    expect(auditPythonBytecodeEnabled.errors).toContain(
      'Run public-audit candidate gate: run command must match the reviewed command graph',
    );

    const driftedIsolation = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        "throw 'hosted audit npm package is empty'",
        "throw 'hosted audit npm package unexpectedly empty'",
      ),
      sourceLock,
    );
    expect(driftedIsolation.errors).toContain(
      'Isolate audit Node.js: run command digest must match the reviewed command graph',
    );

    const injectedEnvironment = validateStandaloneConsensusBuildWorkflow(
      workflowText.replace(
        '      - name: Install relayer dependencies\n        run: |',
        '      - name: Install relayer dependencies\n        env:\n          NODE_OPTIONS: --require unreviewed.js\n        run: |',
      ),
      sourceLock,
    );
    expect(injectedEnvironment.errors).toContain(
      'Install relayer dependencies: environment must match the reviewed command graph',
    );
    expect(injectedEnvironment.errors).toContain(
      'Install relayer dependencies: run step may contain only the reviewed keys',
    );
  });
});
