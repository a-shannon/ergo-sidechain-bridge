import { sha256CanonicalJson } from '../../ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './asset-profile.js';

export const AUTHENTICATED_SETTLEMENT_PAYOUT_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_SETTLEMENT_PAYOUT_BINDING_V1';

const ERGO_LONG_MAX = 9_223_372_036_854_775_807n;

export interface SubstrateGrandpaV1AuthenticatedSettlementPayoutBinding {
  readonly candidateId: string;
  readonly burnId: string;
  readonly sidechainId: string;
  readonly burnTxHash: string;
  readonly sidechainHeight: bigint | number;
  readonly executionBlockHash: string;
  readonly eventIndex: number;
  readonly amountNanoErg: bigint;
  readonly recipientErgoTreeHex: string;
  readonly vaultBoxId: string;
}

export function deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest(
  input: SubstrateGrandpaV1AuthenticatedSettlementPayoutBinding,
): string {
  const sidechainHeight = nonnegativeBigInt(
    input.sidechainHeight,
    'candidate sidechain height',
  );
  if (!Number.isSafeInteger(input.eventIndex) || input.eventIndex < 0) {
    throw new Error('peg-out event index must be a nonnegative safe integer');
  }
  const amountNanoErg = positiveErgoLong(
    input.amountNanoErg,
    'settlement amount',
  );
  return sha256CanonicalJson({
    domain: AUTHENTICATED_SETTLEMENT_PAYOUT_DIGEST_DOMAIN,
    candidateId: fixedHex(input.candidateId, 32, 'candidate ID'),
    burnIdHex: fixedHex(input.burnId, 32, 'burn ID'),
    sidechainIdHex: fixedHex(input.sidechainId, 32, 'sidechain ID'),
    sidechainTxHashHex: fixedHex(
      input.burnTxHash,
      32,
      'burn transaction hash',
    ),
    sidechainHeight: sidechainHeight.toString(),
    executionBlockHashHex: fixedHex(
      input.executionBlockHash,
      32,
      'execution block hash',
    ),
    eventIndex: input.eventIndex,
    assetProfileId:
      SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetProfileId,
    assetIdHex: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
    amountUnit: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.amountUnit,
    amountNanoErg: amountNanoErg.toString(),
    recipientErgoTreeHex: fixedHex(
      input.recipientErgoTreeHex,
      36,
      'recipient ErgoTree',
    ),
    vaultBoxIdHex: fixedHex(
      input.vaultBoxId,
      32,
      'settlement vault box ID',
    ),
  });
}

function fixedHex(value: string, bytes: number, label: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    clean.length !== bytes * 2
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function nonnegativeBigInt(value: bigint | number, label: string): bigint {
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  const result = BigInt(value);
  if (result < 0n) throw new Error(`${label} must be nonnegative`);
  return result;
}

function positiveErgoLong(value: bigint, label: string): bigint {
  const result = BigInt(value);
  if (result <= 0n || result > ERGO_LONG_MAX) {
    throw new Error(`${label} must be a positive Ergo Long`);
  }
  return result;
}
