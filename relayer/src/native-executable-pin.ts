import { createHash, timingSafeEqual } from 'crypto';
import { createReadStream } from 'fs';

export function normalizeExecutableSha256Hex(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-f]{64}$/.test(value)
  ) {
    throw new Error(`${label} must be a lowercase 0x-prefixed SHA-256 digest`);
  }
  return value;
}

export async function verifyExecutableSha256(
  executablePath: string,
  expectedSha256Hex: string,
  label: string,
): Promise<void> {
  const expected = Buffer.from(
    normalizeExecutableSha256Hex(expectedSha256Hex, `${label} digest`).slice(2),
    'hex',
  );
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(executablePath)) {
      hash.update(chunk as Buffer);
    }
  } catch {
    throw new Error(`failed to read pinned ${label}`);
  }
  const actual = hash.digest();
  if (!timingSafeEqual(actual, expected)) {
    throw new Error(`${label} SHA-256 digest does not match the reviewed pin`);
  }
}

export function deriveExecutableInvocationSha256Hex(
  executableSha256Hex: string,
  argv: readonly string[],
): string {
  const executableDigest = Buffer.from(
    normalizeExecutableSha256Hex(
      executableSha256Hex,
      'native executable digest',
    ).slice(2),
    'hex',
  );
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string' || value.includes('\0'))) {
    throw new Error('native executable invocation arguments are invalid');
  }
  const count = Buffer.alloc(4);
  count.writeUInt32BE(argv.length);
  const encodedArgs = argv.map(value => {
    const encoded = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(encoded.length);
    return Buffer.concat([length, encoded]);
  });
  return `0x${createHash('sha256').update(Buffer.concat([
    Buffer.from('E2S_NATIVE_EXECUTABLE_INVOCATION_V1', 'utf8'),
    executableDigest,
    count,
    ...encodedArgs,
  ])).digest('hex')}`;
}

export function verifyExecutableInvocationSha256(
  executableSha256Hex: string,
  argv: readonly string[],
  expectedInvocationSha256Hex: unknown,
  label: string,
): string {
  const expected = normalizeExecutableSha256Hex(
    expectedInvocationSha256Hex,
    `${label} invocation digest`,
  );
  if (deriveExecutableInvocationSha256Hex(executableSha256Hex, argv) !== expected) {
    throw new Error(`${label} invocation does not match the reviewed argv pin`);
  }
  return expected;
}
