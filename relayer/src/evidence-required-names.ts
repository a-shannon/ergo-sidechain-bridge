export function validateRequiredNames(label: string, actual: string[], required: string[]): string[] {
  const errors: string[] = [];
  const actualSet = new Set(actual);
  const counts = new Map<string, number>();

  for (const name of actual) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  for (const [name, count] of counts) {
    if (name.trim().length > 0 && count > 1) {
      errors.push(`${label}: ${name}: duplicate required row`);
    }
  }

  for (const name of required) {
    if (!actualSet.has(name)) errors.push(`${label}: ${name}: missing required row`);
  }

  return errors;
}

export function validateDuplicateRequiredFields(label: string, actual: string[], required: string[]): string[] {
  const errors: string[] = [];
  const counts = new Map<string, number>();

  for (const name of actual) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  for (const name of required) {
    if (name.trim().length > 0 && (counts.get(name) ?? 0) > 1) {
      errors.push(`${label}: ${name}: duplicate required field`);
    }
  }

  return errors;
}
