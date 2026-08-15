import { readFileSync } from 'fs';

import { collectAndVerifyNativeFinalizedCheckpoint } from '../native-checkpoint-proof-collector.js';
import type { NativeFinalizedBridgeCheckpointRequest } from '../native-finalized-bridge-checkpoint.js';
import { createNativeSubstrateRpcProofCodec } from '../native-substrate-rpc-proof-codec.js';
import { deriveExecutableInvocationSha256Hex } from '../native-executable-pin.js';
import {
  BoundedHttpSubstrateRpcTransport,
  ReadOnlySubstrateFinalityRpc,
} from '../substrate-finality-provider.js';

const INPUT_SCHEMA = 'e2s.native-finalized-checkpoint-collection-input.v2';
const OUTPUT_SCHEMA = 'e2s.native-finalized-checkpoint-collection-output.v2';
const MAX_INPUT_BYTES = 64 * 1024;

const reviewed = parseReviewedArguments(process.argv.slice(2));

const rawInput = readFileSync(0);
if (rawInput.length === 0 || rawInput.length > MAX_INPUT_BYTES) {
  throw new Error(`checkpoint collection input must contain 1..${MAX_INPUT_BYTES} bytes`);
}
let parsed: unknown;
try {
  parsed = JSON.parse(rawInput.toString('utf8'));
} catch {
  throw new Error('checkpoint collection input must be valid JSON');
}
const input = exactRecord(parsed, [
  'schema',
  'rpcUrl',
  'targetNativeBlockHashHex',
  'trustAnchor',
  'codecExecutablePath',
  'verifierExecutablePath',
  'rpcTimeoutMs',
  'nativeTimeoutMs',
  'collectionDeadlineMs',
  'rpcConcurrency',
  'maxAttempts',
], 'checkpoint collection input');
if (input.schema !== INPUT_SCHEMA) {
  throw new Error('unsupported checkpoint collection input schema');
}
if (typeof input.rpcUrl !== 'string') throw new Error('rpcUrl must be a string');
if (typeof input.targetNativeBlockHashHex !== 'string') {
  throw new Error('targetNativeBlockHashHex must be a string');
}
if (typeof input.codecExecutablePath !== 'string') {
  throw new Error('codecExecutablePath must be a string');
}
if (typeof input.verifierExecutablePath !== 'string') {
  throw new Error('verifierExecutablePath must be a string');
}

const rpcTimeoutMs = integer(input.rpcTimeoutMs, 1, 60_000, 'rpcTimeoutMs');
const nativeTimeoutMs = integer(input.nativeTimeoutMs, 1, 5 * 60_000, 'nativeTimeoutMs');
const collectionDeadlineMs = integer(
  input.collectionDeadlineMs,
  1,
  10 * 60_000,
  'collectionDeadlineMs',
);
const rpcConcurrency = integer(input.rpcConcurrency, 1, 32, 'rpcConcurrency');
const maxAttempts = integer(input.maxAttempts, 1, 3, 'maxAttempts');
const codecInvocationSha256Hex = {
  encodeHeaders: deriveExecutableInvocationSha256Hex(
    reviewed.codecSha256Hex,
    ['--encode-headers'],
  ),
  inspectWarpProof: deriveExecutableInvocationSha256Hex(
    reviewed.codecSha256Hex,
    ['--inspect-warp-proof'],
  ),
  inspectFinalityProof: deriveExecutableInvocationSha256Hex(
    reviewed.codecSha256Hex,
    ['--inspect-finality-proof'],
  ),
};

const transport = new BoundedHttpSubstrateRpcTransport(input.rpcUrl, {
  timeoutMs: rpcTimeoutMs,
});
const result = await collectAndVerifyNativeFinalizedCheckpoint({
  rpc: new ReadOnlySubstrateFinalityRpc(transport),
  codec: createNativeSubstrateRpcProofCodec({
    executablePath: input.codecExecutablePath,
    expectedExecutableSha256Hex: reviewed.codecSha256Hex,
    expectedExecutableInvocationSha256Hex: codecInvocationSha256Hex,
    timeoutMs: nativeTimeoutMs,
  }),
  trustAnchor: input.trustAnchor as NativeFinalizedBridgeCheckpointRequest['trustAnchor'],
  targetNativeBlockHashHex: input.targetNativeBlockHashHex,
  trustedAnchorDigestHex: reviewed.trustedAnchorDigestHex,
  verifierExecutablePath: input.verifierExecutablePath,
  verifierExecutableSha256Hex: reviewed.verifierSha256Hex,
  verifierExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
    reviewed.verifierSha256Hex,
    ['--trusted-anchor-digest', reviewed.trustedAnchorDigestHex],
  ),
  verifierTimeoutMs: nativeTimeoutMs,
  deadlineMs: collectionDeadlineMs,
  rpcConcurrency,
  maxAttempts,
});

process.stdout.write(JSON.stringify({
  schema: OUTPUT_SCHEMA,
  status: 'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
  result,
  boundary: {
    readOnlyRpc: true,
    transactionMutationEnabled: false,
    ergoExtensionAnchorVerified: false,
    onChainAcceptanceVerified: false,
    gate5Closed: false,
  },
}));

function exactRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
  return record;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

function parseReviewedArguments(arguments_: string[]): {
  trustedAnchorDigestHex: string;
  codecSha256Hex: string;
  verifierSha256Hex: string;
} {
  if (arguments_.length !== 6) {
    throw new Error(
      'usage: collect-native-finalized-checkpoint --trusted-anchor-digest <hex> --codec-sha256 <hex> --verifier-sha256 <hex>',
    );
  }
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if (
      !['--trusted-anchor-digest', '--codec-sha256', '--verifier-sha256'].includes(option) ||
      values.has(option)
    ) {
      throw new Error('reviewed checkpoint arguments are missing, duplicated, or unknown');
    }
    values.set(option, digestHex(value, option));
  }
  return {
    trustedAnchorDigestHex: values.get('--trusted-anchor-digest')!,
    codecSha256Hex: values.get('--codec-sha256')!,
    verifierSha256Hex: values.get('--verifier-sha256')!,
  };
}

function digestHex(value: string, label: string): string {
  if (!/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed 32-byte digest`);
  }
  return value;
}
