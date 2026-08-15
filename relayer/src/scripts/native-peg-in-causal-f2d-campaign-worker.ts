import { createReadStream } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  executeNativePegInCausalF2dSingleRunWorkerV1,
  parseNativePegInCausalF2dSingleRunWorkerRequestV1,
} from './run-native-peg-in-causal-f2d-dual-origin-campaign.js';

const MAX_WORKER_INPUT_BYTES = 8 * 1024 * 1024;

export async function runNativePegInCausalF2dCampaignWorker(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  if (argv.length !== 1) {
    throw new Error('F2d worker requires exactly one request-file path');
  }
  const requestPath = canonicalAbsolutePath(argv[0]);
  const bytes = await readNativePegInCausalF2dWorkerInput(createReadStream(requestPath));
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('F2d worker input must be valid JSON');
  }
  const request = parseNativePegInCausalF2dSingleRunWorkerRequestV1(parsed);
  const report = await executeNativePegInCausalF2dSingleRunWorkerV1(request);
  process.stdout.write(JSON.stringify(report));
}

function canonicalAbsolutePath(value: string): string {
  if (
    value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
    || resolve(value) !== value
  ) {
    throw new Error('F2d worker request path must be absolute, canonical, and NUL-free');
  }
  return value;
}

export async function readNativePegInCausalF2dWorkerInput(
  stream: Readable,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.length;
    if (totalBytes > MAX_WORKER_INPUT_BYTES) {
      throw new Error('F2d worker input exceeded its byte limit');
    }
    chunks.push(bytes);
  }
  if (totalBytes === 0) throw new Error('F2d worker input must not be empty');
  return Buffer.concat(chunks, totalBytes);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runNativePegInCausalF2dCampaignWorker().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
