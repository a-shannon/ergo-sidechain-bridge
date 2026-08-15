import { assertNoDuplicateJsonKeys } from './strict-json.js';

export function parseNodeJsonPreservingPowDistance(source: string): unknown {
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes === 0 || bytes > 8 * 1024 * 1024 || source.includes('\0')) {
    throw new Error('node JSON must contain between 1 byte and 8 MiB without NUL bytes');
  }
  type ParseWithSource = (
    text: string,
    reviver: (this: unknown, key: string, value: unknown, context: { source?: string }) => unknown,
  ) => unknown;
  try {
    assertNoDuplicateJsonKeys(source);
    return (JSON.parse as ParseWithSource)(source, (key, value, context) => {
      if (typeof value !== 'number') return value;
      const lexical = context?.source ?? '';
      if (key === 'd') {
        if (!/^(?:0|[1-9][0-9]*)$/.test(lexical)) {
          throw new Error('node PoW distance must be a canonical non-negative decimal integer');
        }
        return lexical;
      }
      if (Number.isSafeInteger(value)) return value;
      if (!/^-?(?:0|[1-9][0-9]*)$/u.test(lexical)) {
        throw new Error('unsafe node JSON number must be a canonical decimal integer');
      }
      return lexical;
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`node JSON is invalid or loses PoW precision: ${detail}`);
  }
}
