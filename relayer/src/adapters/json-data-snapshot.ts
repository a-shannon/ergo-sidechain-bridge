export function snapshotJsonData(
  value: unknown,
  label: string,
  state: { nodes: number } = { nodes: 0 },
  depth = 0,
): unknown {
  state.nodes += 1;
  if (state.nodes > 250_000) {
    throw new Error(`${label} exceeds the JSON node bound`);
  }
  if (depth > 64) throw new Error(`${label} exceeds the JSON depth bound`);
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} numbers must be safe integers`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} must contain only JSON data`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined
      || !('value' in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || Number(lengthDescriptor.value) < 0
      || Number(lengthDescriptor.value) > 100_000
    ) {
      throw new Error(`${label} array length is invalid`);
    }
    const length = Number(lengthDescriptor.value);
    const allowed = new Set<PropertyKey>(['length']);
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      allowed.add(key);
      const descriptor = descriptors[key];
      if (
        descriptor === undefined
        || !('value' in descriptor)
        || descriptor.enumerable !== true
      ) {
        throw new Error(`${label}[${index}] must be a dense data property`);
      }
      snapshot.push(snapshotJsonData(
        descriptor.value,
        `${label}[${index}]`,
        state,
        depth + 1,
      ));
    }
    if (Reflect.ownKeys(descriptors).some(key => !allowed.has(key))) {
      throw new Error(`${label} array must not contain extra properties`);
    }
    return snapshot;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must contain only plain objects`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') {
      throw new Error(`${label} must not contain symbol properties`);
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    snapshot[key] = snapshotJsonData(
      descriptor.value,
      `${label}.${key}`,
      state,
      depth + 1,
    );
  }
  return snapshot;
}
