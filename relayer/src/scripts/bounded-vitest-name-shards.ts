export interface ListedVitestTest {
  readonly name: string;
  readonly file: string;
}

export function parseListedVitestTests(value: unknown): readonly ListedVitestTest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Vitest list output must contain at least one test');
  }
  const seen = new Set<string>();
  return Object.freeze(value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Vitest list entry ${index} must be an object`);
    }
    const { name, file } = entry as Record<string, unknown>;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`Vitest list entry ${index} must contain a non-empty name`);
    }
    if (typeof file !== 'string' || file.length === 0) {
      throw new Error(`Vitest list entry ${index} must contain a non-empty file`);
    }
    if (seen.has(name)) {
      throw new Error(`Vitest list contains duplicate test name: ${name}`);
    }
    seen.add(name);
    return Object.freeze({ name, file });
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toVitestFilterName(listedName: string): string {
  return listedName.replaceAll(' > ', ' ');
}

export function buildExactTestNamePatterns(
  tests: readonly ListedVitestTest[],
  maximumTestsPerShard: number,
): readonly string[] {
  if (!Number.isInteger(maximumTestsPerShard) || maximumTestsPerShard < 1 || maximumTestsPerShard > 100) {
    throw new Error('maximumTestsPerShard must be an integer from 1 to 100');
  }
  if (tests.length === 0) {
    throw new Error('cannot shard an empty Vitest test list');
  }
  const patterns: string[] = [];
  const filterNames = tests.map(test => toVitestFilterName(test.name));
  if (new Set(filterNames).size !== filterNames.length) {
    throw new Error('Vitest list names become ambiguous after filter-name normalization');
  }
  for (let index = 0; index < tests.length; index += maximumTestsPerShard) {
    const alternatives = filterNames
      .slice(index, index + maximumTestsPerShard)
      .map(escapeRegExp);
    patterns.push(`^(?:${alternatives.join('|')})$`);
  }
  return Object.freeze(patterns);
}
