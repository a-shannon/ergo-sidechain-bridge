import {
  derivePegInRuntimeRecordKeyV1Hex,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';

export const PEG_IN_MINT_REPLAY_IDENTITY_V1_SCHEMA =
  'e2s.substrate-grandpa-v1.peg-in-mint-replay-identity.v1' as const;

export interface PegInEvmReplayIdentityV1 {
  readonly sourceBoxIdHex: string;
  readonly evmProcessedPegInKeyHex: string;
}

export interface PegInMintReplayIdentityV1 extends PegInEvmReplayIdentityV1 {
  readonly schema: typeof PEG_IN_MINT_REPLAY_IDENTITY_V1_SCHEMA;
  readonly sidechainIdHex: string;
  readonly nativeRuntimeRecordKeyHex: string;
  readonly nativeProcessedRecordStorageKeyHex: string;
}

function normalizeFixedHex(
  value: string,
  expectedBytes: number,
  label: string,
  rejectZero = false,
): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    !/^[0-9a-fA-F]+$/.test(clean)
    || clean.length !== expectedBytes * 2
  ) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  const normalized = clean.toLowerCase();
  if (rejectZero && /^0+$/.test(normalized)) {
    throw new Error(`${label} must not be zero`);
  }
  return normalized;
}

/**
 * Bind the existing Solidity `processedPegIns[bytes32]` key without implying
 * the distinct native runtime replay identity.
 */
export function derivePegInEvmReplayIdentityV1(
  sourceBoxIdHex: string,
): PegInEvmReplayIdentityV1 {
  const normalizedSourceBoxIdHex = normalizeFixedHex(
    sourceBoxIdHex,
    32,
    'source box id',
    true,
  );
  return Object.freeze({
    sourceBoxIdHex: normalizedSourceBoxIdHex,
    evmProcessedPegInKeyHex: `0x${normalizedSourceBoxIdHex}`,
  });
}

/**
 * Bind both replay namespaces explicitly. The native runtime key remains
 * domain-separated by sidechain ID; it is not interchangeable with the raw
 * EVM `bytes32` key.
 */
export function derivePegInMintReplayIdentityV1(input: {
  sourceBoxIdHex: string;
  sidechainIdHex: string;
}): PegInMintReplayIdentityV1 {
  const evm = derivePegInEvmReplayIdentityV1(input.sourceBoxIdHex);
  const sidechainIdHex = `0x${normalizeFixedHex(
    input.sidechainIdHex,
    32,
    'sidechain ID',
    true,
  )}`;
  const nativeIdentity = {
    sidechainIdHex,
    ergoBoxIdHex: evm.evmProcessedPegInKeyHex,
  };
  return Object.freeze({
    schema: PEG_IN_MINT_REPLAY_IDENTITY_V1_SCHEMA,
    sidechainIdHex,
    ...evm,
    nativeRuntimeRecordKeyHex: derivePegInRuntimeRecordKeyV1Hex(nativeIdentity),
    nativeProcessedRecordStorageKeyHex:
      deriveProcessedPegInRuntimeStorageKeyV1Hex(nativeIdentity),
  });
}
