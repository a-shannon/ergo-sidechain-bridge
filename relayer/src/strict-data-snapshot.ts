import { types as utilTypes } from 'node:util';

import { canonicalJson } from './strict-json.js';

/** Snapshot JSON-like caller data without invoking accessors or Proxy traps. */
export function snapshotStrictData(value: unknown, label: string): unknown {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} number is not a safe integer`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} contains an unsupported value`);
  }
  if (utilTypes.isProxy(value)) {
    throw new Error(`${label} must not be a Proxy`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new Error(`${label} must be a plain array`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expectedKeys = [
      ...Array.from({ length: value.length }, (_, index) => String(index)),
      'length',
    ].sort();
    if (
      Reflect.ownKeys(value).some(key => typeof key !== 'string')
      || canonicalJson(Reflect.ownKeys(value).sort()) !== canonicalJson(expectedKeys)
    ) {
      throw new Error(`${label} array keys are invalid`);
    }
    return Object.freeze(Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        throw new Error(`${label}[${index}] must be an own data property`);
      }
      return snapshotStrictData(descriptor.value, `${label}[${index}]`);
    }));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) {
    throw new Error(`${label} object keys are invalid`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys as string[]) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label}.${key} must be an own data property`);
    }
    Object.defineProperty(snapshot, key, {
      enumerable: true,
      value: snapshotStrictData(descriptor.value, `${label}.${key}`),
    });
  }
  return Object.freeze(snapshot);
}
