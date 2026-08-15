import {
  assertNoDuplicateJsonKeys,
} from './ergo-settlement-core/strict-json.js';

export {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';

export function parseStrictJson(source: string, label = 'JSON'): unknown {
  try {
    assertNoDuplicateJsonKeys(source);
    return JSON.parse(source) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`${label} must contain strict valid JSON without duplicate keys: ${detail}`);
  }
}
