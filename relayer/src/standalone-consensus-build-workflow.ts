import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseDocument } from 'yaml';

export const STANDALONE_CONSENSUS_WORKFLOW_PATH =
  '.github/workflows/relayer-checks.yml';
export const STANDALONE_CONSENSUS_JOB_ID = 'consensus-sources';

const EXPECTED_WORKFLOW_NAME = 'Bridge public-audit candidate checks';
const EXPECTED_WORKFLOW_JOB_IDS = ['audit-alpha', STANDALONE_CONSENSUS_JOB_ID] as const;
const EXPECTED_TRIGGER_PATHS = [
  '.github/workflows/relayer-checks.yml',
  '.gitattributes',
  '.gitignore',
  '.gitmodules',
  'README.md',
  'docs/**',
  'phases/**',
  'contracts/**',
  'relayer/**',
  'scripts/**',
  'solidity/**',
  'sources/**',
  'validity-proof/**',
  'wasm-avl/**',
  'substrate-node',
] as const;
const EXPECTED_PUSH_BRANCHES = ['main', 'master', 'fix/**'] as const;
const FRONTIER_BUILD_COMMAND = 'cargo build --locked --release -p frontier-template-node';
const ERGO_TEST_COMMAND = 'sbt "testOnly org.ergoplatform.mining.CandidateGeneratorSpec"';
const ERGO_BUILD_COMMAND = 'sbt assembly';

const EXPECTED_STEP_NAMES = [
  'Checkout recursive source graph',
  'Setup Node.js',
  'Setup Java 17',
  'Setup sbt',
  'Install Frontier native build prerequisites',
  'Install relayer dependencies',
  'Verify reproducible Solidity build closure',
  'Verify standalone consensus workflow',
  'Verify tracked source lock',
  'Validate Frontier bridge event root vector',
  'Assemble finalized bridge checkpoint candidate vector',
  'Apply tracked Frontier runtime commitment patch',
  'Prepare pinned patched Ergo source',
  'Verify complete source checkouts',
  'Test Frontier bridge commitment producer',
  'Test native GRANDPA finality proof verifier',
  'Test native finalized bridge state proof verifier',
  'Test native finalized checkpoint verifier',
  'Verify native finalized checkpoint cross-language vector',
  'Build patched Frontier template node',
  'Test Ergo extension producer patch',
  'Build patched Ergo node',
  'Recheck source identity after builds',
] as const;

interface WorkflowSourceLock {
  frontier: {
    repository: string;
    commit: string;
    patchPath: string;
    buildCommand: string;
  };
  ergoNode: {
    repository: string;
    baseCommit: string;
    baseTag: string;
    patchPath: string;
    testCommand: string;
    buildCommand: string;
  };
}

export interface StandaloneConsensusBuildWorkflowReport {
  schemaVersion: 1;
  kind: 'bridge-standalone-consensus-build-workflow-report';
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  workflowPath: typeof STANDALONE_CONSENSUS_WORKFLOW_PATH;
  jobId: typeof STANDALONE_CONSENSUS_JOB_ID;
  sourceIdentity: {
    frontierRepository: string | null;
    frontierCommit: string | null;
    frontierPatchPath: string | null;
    ergoRepository: string | null;
    ergoBaseCommit: string | null;
    ergoPatchPath: string | null;
  };
  checks: {
    yamlSyntaxValid: boolean;
    exactCommandGraphValid: boolean;
    recursiveGitlinkCheckoutRequired: boolean;
    lockedPatchesOnly: boolean;
    sourceIdentityRecheckedAfterBuilds: boolean;
    noLiveCapabilityCommands: boolean;
  };
  boundaries: {
    hostedExecutionObserved: false;
    proofProfileActivated: false;
    runtimeDeploymentIdentityProved: false;
    gate5Closed: false;
    publicationAuthorized: false;
  };
}

export function inspectStandaloneConsensusBuildWorkflow(input: {
  bridgeRoot: string;
}): StandaloneConsensusBuildWorkflowReport {
  const workflowPath = path.resolve(input.bridgeRoot, STANDALONE_CONSENSUS_WORKFLOW_PATH);
  const lockPath = path.resolve(input.bridgeRoot, 'sources', 'consensus-source-lock.json');
  const errors: string[] = [];
  let workflowText = '';
  let lock: WorkflowSourceLock | null = null;

  try {
    workflowText = readFileSync(workflowPath, 'utf8');
  } catch {
    errors.push('standalone consensus workflow is unavailable');
  }

  try {
    lock = parseWorkflowSourceLock(JSON.parse(readFileSync(lockPath, 'utf8')));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'consensus source lock is invalid');
  }

  const validation = lock && workflowText
    ? validateStandaloneConsensusBuildWorkflow(workflowText, lock)
    : emptyValidation();
  errors.push(...validation.errors);

  return {
    schemaVersion: 1,
    kind: 'bridge-standalone-consensus-build-workflow-report',
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    errors,
    workflowPath: STANDALONE_CONSENSUS_WORKFLOW_PATH,
    jobId: STANDALONE_CONSENSUS_JOB_ID,
    sourceIdentity: {
      frontierRepository: lock?.frontier.repository ?? null,
      frontierCommit: lock?.frontier.commit ?? null,
      frontierPatchPath: lock?.frontier.patchPath ?? null,
      ergoRepository: lock?.ergoNode.repository ?? null,
      ergoBaseCommit: lock?.ergoNode.baseCommit ?? null,
      ergoPatchPath: lock?.ergoNode.patchPath ?? null,
    },
    checks: validation.checks,
    boundaries: {
      hostedExecutionObserved: false,
      proofProfileActivated: false,
      runtimeDeploymentIdentityProved: false,
      gate5Closed: false,
      publicationAuthorized: false,
    },
  };
}

export function validateStandaloneConsensusBuildWorkflow(
  workflowText: string,
  lock: WorkflowSourceLock,
): Pick<StandaloneConsensusBuildWorkflowReport, 'errors' | 'checks'> {
  const errors: string[] = [];
  try {
    parseWorkflowSourceLock(lock);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'consensus source lock is invalid');
  }
  const document = parseDocument(workflowText, { uniqueKeys: true });
  const syntaxErrors = document.errors.map(error => error.message);
  errors.push(...syntaxErrors.map(error => `workflow YAML is invalid: ${error}`));

  let workflow: Record<string, unknown> | null = null;
  if (syntaxErrors.length === 0) {
    try {
      workflow = asRecord(document.toJS({ maxAliasCount: 0 }));
      if (!workflow) errors.push('workflow YAML root must be an object');
    } catch {
      errors.push('workflow YAML aliases are not allowed');
    }
  }

  if (workflow?.name !== EXPECTED_WORKFLOW_NAME) {
    errors.push(`workflow name must be ${EXPECTED_WORKFLOW_NAME}`);
  }
  if (workflow && !hasExactKeys(workflow, ['name', 'on', 'permissions', 'jobs'])) {
    errors.push('workflow may contain only its reviewed name, triggers, permissions, and jobs');
  }

  const permissions = asRecord(workflow?.permissions);
  if (permissions?.contents !== 'read' || Object.keys(permissions).length !== 1) {
    errors.push('workflow permissions must be exactly contents: read');
  }
  const triggers = asRecord(workflow?.on);
  const pullRequest = asRecord(triggers?.pull_request);
  const push = asRecord(triggers?.push);
  if (!triggers || !hasExactKeys(triggers, ['pull_request', 'push'])) {
    errors.push('workflow triggers must be exactly pull_request and push');
  }
  if (!pullRequest || !hasExactKeys(pullRequest, ['paths']) || !arraysEqual(pullRequest.paths, EXPECTED_TRIGGER_PATHS)) {
    errors.push('pull_request paths must match the reviewed workflow coverage');
  }
  if (
    !push
    || !hasExactKeys(push, ['branches', 'paths'])
    || !arraysEqual(push.branches, EXPECTED_PUSH_BRANCHES)
    || !arraysEqual(push.paths, EXPECTED_TRIGGER_PATHS)
  ) {
    errors.push('push branches and paths must match the reviewed workflow coverage');
  }

  const jobs = asRecord(workflow?.jobs);
  if (!jobs || !hasExactKeys(jobs, EXPECTED_WORKFLOW_JOB_IDS)) {
    errors.push('workflow jobs must be exactly audit-alpha and consensus-sources');
  }
  const job = asRecord(jobs?.[STANDALONE_CONSENSUS_JOB_ID]);
  if (!job) errors.push(`workflow job ${STANDALONE_CONSENSUS_JOB_ID} is missing`);
  if (job?.['runs-on'] !== 'ubuntu-latest') {
    errors.push('standalone consensus job must run on ubuntu-latest');
  }
  if (job?.['timeout-minutes'] !== 90) {
    errors.push('standalone consensus job timeout must be 90 minutes');
  }
  if (job && JSON.stringify(Object.keys(job).sort()) !== JSON.stringify([
    'name',
    'runs-on',
    'steps',
    'timeout-minutes',
  ])) {
    errors.push('standalone consensus job may contain only its name, runner, timeout, and exact steps');
  }

  const steps = Array.isArray(job?.steps) ? job.steps.map(asRecord) : [];
  if (steps.some(step => !step)) errors.push('every standalone consensus job step must be an object');
  const concreteSteps = steps.filter((step): step is Record<string, unknown> => step !== null);
  const stepNames = concreteSteps.map(step => step.name);
  if (JSON.stringify(stepNames) !== JSON.stringify(EXPECTED_STEP_NAMES)) {
    errors.push('standalone consensus job must preserve the exact ordered command graph');
  }

  requireUsesStep(errors, concreteSteps, 'Checkout recursive source graph', 'actions/checkout@v4', {
    'fetch-depth': 1,
    submodules: 'recursive',
  });
  requireUsesStep(errors, concreteSteps, 'Setup Node.js', 'actions/setup-node@v4', {
    'node-version': '24',
    cache: 'npm',
    'cache-dependency-path': 'relayer/package-lock.json\nsolidity/package-lock.json\n',
  });
  requireUsesStep(errors, concreteSteps, 'Setup Java 17', 'actions/setup-java@v4', {
    distribution: 'temurin',
    'java-version': '17',
  });
  requireUsesStep(errors, concreteSteps, 'Setup sbt', 'sbt/setup-sbt@v1');

  const frontierWorkspaceEnvironment = {
    WASM_BUILD_WORKSPACE_HINT: '${{ github.workspace }}/substrate-node',
  };
  const expectedRuns = new Map<string, {
    workingDirectory?: string;
    environment?: Record<string, unknown>;
    shell?: string;
    run: string;
  }>([
    ['Install Frontier native build prerequisites', {
      run: 'sudo apt-get update\nsudo apt-get install --yes clang libclang-dev cmake protobuf-compiler',
    }],
    ['Install relayer dependencies', { workingDirectory: 'relayer', run: 'npm ci' }],
    ['Verify reproducible Solidity build closure', {
      workingDirectory: 'solidity',
      run: 'npm ci --ignore-scripts --include=dev\nnpm run check\nnpm audit --audit-level=high',
    }],
    ['Verify standalone consensus workflow', {
      workingDirectory: 'relayer',
      run: 'npm run sources:verify:workflow',
    }],
    ['Verify tracked source lock', {
      workingDirectory: 'relayer',
      run: 'npm run sources:verify:lock',
    }],
    ['Validate Frontier bridge event root vector', {
      workingDirectory: 'relayer',
      run: 'npm run frontier:bridge-event-root:validate',
    }],
    ['Assemble finalized bridge checkpoint candidate vector', {
      workingDirectory: 'relayer',
      run: 'npm run checkpoint:finalized:candidate',
    }],
    ['Apply tracked Frontier runtime commitment patch', {
      shell: 'bash',
      run: [
        'set -euo pipefail',
        `patch="$GITHUB_WORKSPACE/${lock.frontier.patchPath}"`,
        'git -C substrate-node apply --check --unidiff-zero --whitespace=error-all "$patch"',
        'git -C substrate-node apply --unidiff-zero --whitespace=error-all "$patch"',
      ].join('\n'),
    }],
    ['Prepare pinned patched Ergo source', {
      shell: 'bash',
      run: [
        'set -euo pipefail',
        'source_dir=".source-cache/ergo-node"',
        'mkdir -p "$source_dir"',
        'git -C "$source_dir" init',
        `git -C "$source_dir" remote add origin ${lock.ergoNode.repository}`,
        `git -C "$source_dir" fetch --depth=1 origin refs/tags/${lock.ergoNode.baseTag}`,
        `git -C "$source_dir" checkout --detach ${lock.ergoNode.baseCommit}`,
        `git -C "$source_dir" apply --unidiff-zero "$GITHUB_WORKSPACE/${lock.ergoNode.patchPath}"`,
      ].join('\n'),
    }],
    ['Verify complete source checkouts', {
      workingDirectory: 'relayer',
      run: 'npm run sources:verify -- --ergo-source ../.source-cache/ergo-node',
    }],
    ['Test Frontier bridge commitment producer', {
      workingDirectory: 'substrate-node',
      environment: frontierWorkspaceEnvironment,
      run: 'cargo test --locked -p frontier-template-runtime bridge_commitment',
    }],
    ['Test native GRANDPA finality proof verifier', {
      workingDirectory: 'substrate-node',
      run: 'cargo test --locked -p bridge-finality-proof',
    }],
    ['Test native finalized bridge state proof verifier', {
      workingDirectory: 'substrate-node',
      run: 'cargo test --locked -p bridge-state-proof',
    }],
    ['Test native finalized checkpoint verifier', {
      workingDirectory: 'substrate-node',
      run: 'cargo test --locked -p bridge-checkpoint-verifier',
    }],
    ['Verify native finalized checkpoint cross-language vector', {
      workingDirectory: 'relayer',
      run: 'npm run checkpoint:finalized:native:verify',
    }],
    ['Build patched Frontier template node', {
      workingDirectory: 'substrate-node',
      environment: frontierWorkspaceEnvironment,
      run: FRONTIER_BUILD_COMMAND,
    }],
    ['Test Ergo extension producer patch', {
      workingDirectory: '.source-cache/ergo-node',
      run: ERGO_TEST_COMMAND,
    }],
    ['Build patched Ergo node', {
      workingDirectory: '.source-cache/ergo-node',
      run: ERGO_BUILD_COMMAND,
    }],
    ['Recheck source identity after builds', {
      workingDirectory: 'relayer',
      run: 'npm run sources:verify -- --ergo-source ../.source-cache/ergo-node',
    }],
  ]);

  for (const [name, expected] of expectedRuns) {
    requireRunStep(
      errors,
      concreteSteps,
      name,
      expected.run,
      expected.workingDirectory,
      expected.environment,
      expected.shell,
    );
  }

  const jobText = JSON.stringify(job ?? {});
  if (jobText.includes('ergo-sidechain-bridge/')) {
    errors.push('standalone consensus job must not contain superproject-relative paths');
  }
  if (jobText.includes('secrets.')) {
    errors.push('standalone consensus job must not consume GitHub secrets');
  }

  const runCommands = concreteSteps
    .map(step => typeof step.run === 'string' ? step.run : '')
    .filter(Boolean);
  const commandText = runCommands.join('\n');
  const forbiddenCapability = /(?:^|[\s:])(deploy|submit|broadcast)(?=$|[\s:])/i;
  const noLiveCapabilityCommands = !forbiddenCapability.test(commandText)
    && !/BRIDGE_BROADCAST_ENABLED|deployed_state|node-wallet|wallet-state/i.test(commandText);
  if (!noLiveCapabilityCommands) {
    errors.push('standalone consensus job must not contain deployment, submission, broadcast, wallet, or runtime-state commands');
  }

  const patchLines = runCommands
    .flatMap(run => normalizeRun(run).split('\n'))
    .filter(line => /\bgit\b.*\bapply\b/.test(line));
  const lockedPatchesOnly = patchLines.length === 3
    && patchLines.slice(0, 2).every(line => line.includes('"$patch"'))
    && patchLines[2]?.includes(lock.ergoNode.patchPath) === true;
  if (!lockedPatchesOnly) errors.push('standalone consensus job may apply only the two tracked locked patches');

  const recursiveGitlinkCheckoutRequired = stepUsesWith(
    concreteSteps,
    'Checkout recursive source graph',
    'submodules',
  ) === 'recursive';
  const recheckIndex = stepNames.indexOf('Recheck source identity after builds');
  const buildIndexes = [
    stepNames.indexOf('Build patched Frontier template node'),
    stepNames.indexOf('Build patched Ergo node'),
  ];
  const sourceIdentityRecheckedAfterBuilds = recheckIndex > Math.max(...buildIndexes);

  return {
    errors,
    checks: {
      yamlSyntaxValid: syntaxErrors.length === 0,
      exactCommandGraphValid: errors.length === 0,
      recursiveGitlinkCheckoutRequired,
      lockedPatchesOnly,
      sourceIdentityRecheckedAfterBuilds,
      noLiveCapabilityCommands,
    },
  };
}

function parseWorkflowSourceLock(value: unknown): WorkflowSourceLock {
  const lock = asRecord(value);
  const frontier = asRecord(lock?.frontier);
  const ergoNode = asRecord(lock?.ergoNode);
  if (!frontier || !ergoNode) throw new Error('consensus source lock must define frontier and ergoNode');

  return {
    frontier: {
      repository: requireString(frontier.repository, 'frontier.repository'),
      commit: requireSha1(frontier.commit, 'frontier.commit'),
      patchPath: requirePatchPath(frontier.patchPath, 'frontier.patchPath'),
      buildCommand: requireExactString(
        frontier.buildCommand,
        'frontier.buildCommand',
        FRONTIER_BUILD_COMMAND,
      ),
    },
    ergoNode: {
      repository: requireString(ergoNode.repository, 'ergoNode.repository'),
      baseCommit: requireSha1(ergoNode.baseCommit, 'ergoNode.baseCommit'),
      baseTag: requireString(ergoNode.baseTag, 'ergoNode.baseTag'),
      patchPath: requirePatchPath(ergoNode.patchPath, 'ergoNode.patchPath'),
      testCommand: requireExactString(
        ergoNode.testCommand,
        'ergoNode.testCommand',
        ERGO_TEST_COMMAND,
      ),
      buildCommand: requireExactString(
        ergoNode.buildCommand,
        'ergoNode.buildCommand',
        ERGO_BUILD_COMMAND,
      ),
    },
  };
}

function requireUsesStep(
  errors: string[],
  steps: Record<string, unknown>[],
  name: string,
  expectedUses: string,
  expectedWith?: Record<string, unknown>,
): void {
  const step = steps.find(candidate => candidate.name === name);
  if (!step) return;
  if (step.uses !== expectedUses) errors.push(`${name}: uses must be ${expectedUses}`);
  if (expectedWith && JSON.stringify(step.with) !== JSON.stringify(expectedWith)) {
    errors.push(`${name}: with bindings must match the reviewed workflow`);
  }
  if (!expectedWith && step.with !== undefined) errors.push(`${name}: with bindings are not allowed`);
  if (step.run !== undefined) errors.push(`${name}: run command is not allowed`);
  const expectedKeys = expectedWith ? ['name', 'uses', 'with'] : ['name', 'uses'];
  if (JSON.stringify(Object.keys(step).sort()) !== JSON.stringify(expectedKeys.sort())) {
    errors.push(`${name}: action step may contain only the reviewed keys`);
  }
}

function requireRunStep(
  errors: string[],
  steps: Record<string, unknown>[],
  name: string,
  expectedRun: string,
  expectedWorkingDirectory?: string,
  expectedEnvironment?: Record<string, unknown>,
  expectedShell?: string,
): void {
  const step = steps.find(candidate => candidate.name === name);
  if (!step) return;
  if (normalizeRun(step.run) !== normalizeRun(expectedRun)) {
    errors.push(`${name}: run command must match the reviewed command graph`);
  }
  if (step['working-directory'] !== expectedWorkingDirectory) {
    errors.push(`${name}: working-directory must be ${expectedWorkingDirectory ?? '<workflow root>'}`);
  }
  if (step.uses !== undefined) errors.push(`${name}: uses action is not allowed`);
  if (JSON.stringify(step.env) !== JSON.stringify(expectedEnvironment)) {
    errors.push(`${name}: environment must match the reviewed command graph`);
  }
  if (step.shell !== expectedShell) {
    errors.push(`${name}: shell must be ${expectedShell ?? '<runner default>'}`);
  }
  const expectedKeys = [
    'name',
    'run',
    ...(expectedWorkingDirectory ? ['working-directory'] : []),
    ...(expectedEnvironment ? ['env'] : []),
    ...(expectedShell ? ['shell'] : []),
  ].sort();
  if (JSON.stringify(Object.keys(step).sort()) !== JSON.stringify(expectedKeys)) {
    errors.push(`${name}: run step may contain only the reviewed keys`);
  }
}

function stepUsesWith(
  steps: Record<string, unknown>[],
  name: string,
  key: string,
): unknown {
  const step = steps.find(candidate => candidate.name === name);
  return asRecord(step?.with)?.[key];
}

function emptyValidation(): Pick<StandaloneConsensusBuildWorkflowReport, 'errors' | 'checks'> {
  return {
    errors: [],
    checks: {
      yamlSyntaxValid: false,
      exactCommandGraphValid: false,
      recursiveGitlinkCheckoutRequired: false,
      lockedPatchesOnly: false,
      sourceIdentityRecheckedAfterBuilds: false,
      noLiveCapabilityCommands: false,
    },
  };
}

function normalizeRun(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\r\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trim()
    : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function arraysEqual(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireExactString(value: unknown, label: string, expected: string): string {
  const result = requireString(value, label);
  if (result !== expected) throw new Error(`${label} must match the reviewed command`);
  return result;
}

function requireSha1(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (!/^[0-9a-f]{40}$/i.test(result)) throw new Error(`${label} must be a 40-character commit`);
  return result;
}

function requirePatchPath(value: unknown, label: string): string {
  const result = requireString(value, label).replace(/\\/g, '/');
  if (!/^sources\/[a-z0-9-]+\/[a-z0-9._-]+\.patch$/i.test(result) || result.includes('..')) {
    throw new Error(`${label} must be a repository-relative tracked patch path`);
  }
  return result;
}
