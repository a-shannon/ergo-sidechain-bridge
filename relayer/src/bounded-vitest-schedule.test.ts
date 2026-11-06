import { describe, expect, it } from 'vitest';

import {
  BOUNDED_VITEST_PRIORITY_TARGETS,
  buildBoundedVitestExecutionPlan,
  buildBoundedVitestSchedule,
} from './scripts/bounded-vitest-schedule.js';

const EXPECTED_PRIORITY_TARGETS = Object.freeze([
  'src/architecture/layer-import-rules.test.ts',
  'src/publication-hygiene.test.ts',
  'src/scripts/run-substrate-federated-native-two-cycle-v1.test.ts',
  'src/substrate-federated-native-two-cycle-environment-v1.test.ts',
  'src/substrate-federated-native-two-cycle-failure-diagnostic-v1.test.ts',
  'src/substrate-federated-native-two-cycle-invocation-v1.test.ts',
] as const);

const RESIDUAL_TARGETS = Object.freeze([
  'src/z-last.test.ts',
  'src/a-first.test.ts',
  'src/m-middle.test.ts',
]);

function collectedInventory(): string[] {
  return [
    RESIDUAL_TARGETS[0]!,
    ...[...EXPECTED_PRIORITY_TARGETS].reverse(),
    RESIDUAL_TARGETS[1]!,
    RESIDUAL_TARGETS[2]!,
  ];
}

describe('bounded Vitest execution schedule', () => {
  it('is an exact once-only inventory permutation with the fixed prefix and lexical residual', () => {
    const inventory = collectedInventory();
    const plan = buildBoundedVitestExecutionPlan(inventory, undefined);

    expect(BOUNDED_VITEST_PRIORITY_TARGETS).toEqual(EXPECTED_PRIORITY_TARGETS);
    expect(plan.scheduledTests).toEqual([
      ...EXPECTED_PRIORITY_TARGETS,
      'src/a-first.test.ts',
      'src/m-middle.test.ts',
      'src/z-last.test.ts',
    ]);
    expect(plan.selectedTests).toEqual(plan.scheduledTests);
    expect(new Set(plan.scheduledTests).size).toBe(inventory.length);
    expect([...plan.scheduledTests].sort()).toEqual([...inventory].sort());
  });

  it('rejects a missing priority target', () => {
    const missing = EXPECTED_PRIORITY_TARGETS[2];
    const inventory = collectedInventory().filter(target => target !== missing);

    expect(() => buildBoundedVitestSchedule(inventory)).toThrow(
      `bounded Vitest priority target was not collected: ${missing}`,
    );
  });

  it('rejects duplicate priority entries', () => {
    expect(() => buildBoundedVitestSchedule(
      ['src/priority.test.ts'],
      ['src/priority.test.ts', 'src/priority.test.ts'],
    )).toThrow('bounded Vitest priority list contains duplicate target: src/priority.test.ts');
  });

  it('rejects duplicate inventory paths', () => {
    const inventory = collectedInventory();
    inventory.push(inventory[0]!);

    expect(() => buildBoundedVitestSchedule(inventory)).toThrow(
      `bounded Vitest inventory contains duplicate target: ${inventory[0]}`,
    );
  });

  it('applies resume boundaries to the actual priority-first execution order', () => {
    const boundary = EXPECTED_PRIORITY_TARGETS[1];
    const plan = buildBoundedVitestExecutionPlan(collectedInventory(), boundary);

    expect(plan.selectedTests).toEqual([
      ...EXPECTED_PRIORITY_TARGETS.slice(2),
      'src/a-first.test.ts',
      'src/m-middle.test.ts',
      'src/z-last.test.ts',
    ]);
  });

  it('rejects unknown and terminal resume boundaries', () => {
    expect(() => buildBoundedVitestExecutionPlan(
      collectedInventory(),
      'src/unknown.test.ts',
    )).toThrow('--start-after must name an exact collected test file; got src/unknown.test.ts');
    expect(() => buildBoundedVitestExecutionPlan(
      collectedInventory(),
      'src/z-last.test.ts',
    )).toThrow('--start-after must leave at least one collected test file to execute');
  });
});
