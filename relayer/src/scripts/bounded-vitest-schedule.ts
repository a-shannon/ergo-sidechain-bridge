export const BOUNDED_VITEST_PRIORITY_TARGETS = Object.freeze([
  'src/architecture/layer-import-rules.test.ts',
  'src/publication-hygiene.test.ts',
  'src/scripts/run-substrate-federated-native-two-cycle-v1.test.ts',
  'src/substrate-federated-native-two-cycle-environment-v1.test.ts',
  'src/substrate-federated-native-two-cycle-failure-diagnostic-v1.test.ts',
  'src/substrate-federated-native-two-cycle-invocation-v1.test.ts',
] as const);

export interface BoundedVitestExecutionPlan {
  readonly scheduledTests: readonly string[];
  readonly selectedTests: readonly string[];
}

function assertUniqueTargets(targets: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target)) {
      throw new Error(`bounded Vitest ${label} contains duplicate target: ${target}`);
    }
    seen.add(target);
  }
}

export function buildBoundedVitestSchedule(
  collectedTargets: readonly string[],
  priorityTargets: readonly string[] = BOUNDED_VITEST_PRIORITY_TARGETS,
): readonly string[] {
  assertUniqueTargets(collectedTargets, 'inventory');
  assertUniqueTargets(priorityTargets, 'priority list');

  const collected = new Set(collectedTargets);
  for (const priorityTarget of priorityTargets) {
    if (!collected.has(priorityTarget)) {
      throw new Error(`bounded Vitest priority target was not collected: ${priorityTarget}`);
    }
  }

  const priorities = new Set(priorityTargets);
  const residualTargets = collectedTargets
    .filter(target => !priorities.has(target))
    .sort((left, right) => left.localeCompare(right));
  return Object.freeze([...priorityTargets, ...residualTargets]);
}

export function buildBoundedVitestExecutionPlan(
  collectedTargets: readonly string[],
  requestedStartAfter: string | undefined,
  priorityTargets: readonly string[] = BOUNDED_VITEST_PRIORITY_TARGETS,
): BoundedVitestExecutionPlan {
  const scheduledTests = buildBoundedVitestSchedule(collectedTargets, priorityTargets);
  if (!requestedStartAfter) {
    return Object.freeze({ scheduledTests, selectedTests: scheduledTests });
  }

  const boundaryIndex = scheduledTests.indexOf(requestedStartAfter);
  if (boundaryIndex < 0) {
    throw new Error(
      `--start-after must name an exact collected test file; got ${requestedStartAfter}`,
    );
  }
  if (boundaryIndex === scheduledTests.length - 1) {
    throw new Error('--start-after must leave at least one collected test file to execute');
  }
  return Object.freeze({
    scheduledTests,
    selectedTests: Object.freeze(scheduledTests.slice(boundaryIndex + 1)),
  });
}
