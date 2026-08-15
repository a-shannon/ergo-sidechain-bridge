import { createHash } from 'node:crypto';

const MAX_STRICT_JSON_DEPTH = 256;

export function assertNoDuplicateJsonKeys(source: string): void {
  let offset = 0;

  const skipWhitespace = (): void => {
    while (offset < source.length && /[\t\n\r ]/.test(source[offset])) offset += 1;
  };

  const parseString = (): string => {
    const start = offset;
    if (source[offset] !== '"') throw new Error('JSON object key must be a string');
    offset += 1;
    while (offset < source.length) {
      const code = source.charCodeAt(offset);
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset)) as string;
      }
      if (source[offset] === '\\') {
        offset += 2;
        if (source[offset - 1] === 'u') offset += 4;
        continue;
      }
      if (code < 0x20) throw new Error('JSON string contains an unescaped control character');
      offset += 1;
    }
    throw new Error('JSON string is unterminated');
  };

  const parsePrimitive = (): void => {
    const rest = source.slice(offset);
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest)?.[0];
    if (!token) throw new Error('JSON value is invalid');
    offset += token.length;
  };

  const parseValue = (depth: number): void => {
    if (depth > MAX_STRICT_JSON_DEPTH) {
      throw new Error(`JSON nesting must not exceed ${MAX_STRICT_JSON_DEPTH}`);
    }
    skipWhitespace();
    if (source[offset] === '{') {
      offset += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (source[offset] === '}') {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error(`duplicate JSON object key: ${key}`);
        keys.add(key);
        skipWhitespace();
        if (source[offset] !== ':') throw new Error('JSON object key must be followed by a colon');
        offset += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (source[offset] === '}') {
          offset += 1;
          return;
        }
        if (source[offset] !== ',') throw new Error('JSON object members must be comma-separated');
        offset += 1;
      }
      throw new Error('JSON object is unterminated');
    }
    if (source[offset] === '[') {
      offset += 1;
      skipWhitespace();
      if (source[offset] === ']') {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (source[offset] === ']') {
          offset += 1;
          return;
        }
        if (source[offset] !== ',') throw new Error('JSON array items must be comma-separated');
        offset += 1;
      }
      throw new Error('JSON array is unterminated');
    }
    if (source[offset] === '"') {
      parseString();
      return;
    }
    parsePrimitive();
  };

  parseValue(0);
  skipWhitespace();
  if (offset !== source.length) throw new Error('JSON contains trailing content');
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('canonical JSON permits only safe integers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('canonical JSON permits only plain objects');
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => {
      if (record[key] === undefined) {
        throw new Error('canonical JSON forbids undefined object values');
      }
      return `${JSON.stringify(key)}:${canonicalJson(record[key])}`;
    }).join(',')}}`;
  }
  throw new Error(`canonical JSON cannot encode ${typeof value}`);
}

export function sha256CanonicalJson(value: unknown, domain?: string): string {
  const encoded = canonicalJson(value);
  if (domain === undefined) {
    return createHash('sha256').update(encoded, 'utf8').digest('hex');
  }
  return createHash('sha256')
    .update(domain, 'ascii')
    .update('\0', 'ascii')
    .update(encoded, 'utf8')
    .digest('hex');
}

/** Deterministic byte digest for process-free settlement-core codecs. */
export function sha256Bytes(value: Uint8Array): string {
  if (!(value instanceof Uint8Array)) {
    throw new Error('SHA-256 input must be bytes');
  }
  return createHash('sha256').update(value).digest('hex');
}
