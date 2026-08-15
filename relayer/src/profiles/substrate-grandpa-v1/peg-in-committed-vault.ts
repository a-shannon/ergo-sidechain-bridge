import {
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeCollByteRegister,
  encodeLongRegister,
} from '../../ergo-settlement-core/ergo-encoding.js';
import { safeNanoErgNumber } from '../../ergo-settlement-core/tx-balance.js';
import {
  selectSubstrateGrandpaV1AssetProfile,
} from './asset-profile.js';

export const MIN_PEG_IN_COMMIT_CONFIRMATIONS_V1 = 10;

export interface PegInMintIntentV1 {
  assetProfileId: string;
  sourceBoxIdHex: string;
  targetH160Hex: string;
  amountNanoErg: bigint;
  depositorErgoTreeHex: string | null;
}

export interface CanonicalPegInCommitmentV1 {
  transactionIdHex: string;
  inclusionBlockIdHex: string;
  inclusionHeight: number;
  inputBoxIdsHex: readonly string[];
}

export interface CanonicalCommittedVaultV1 {
  boxIdHex: string;
  valueNanoErg: bigint;
  ergoTreeHex: string;
  tokenCount: number;
  registers: Readonly<{
    R4?: string;
    R5?: string;
    R6?: string;
    R7?: string;
  }>;
}

export interface CanonicalCommittedVaultBackingBoxV1 {
  boxIdHex: string;
  valueNanoErg: bigint;
  ergoTreeHex: string;
  tokenCount: number;
  registers: Readonly<Record<string, string>>;
}

export interface PegInDeploymentConfigV1 {
  mainChainLock: {
    address: string;
    ergoTreeHex: string;
    version?: string;
    settlementVaultErgoTreeHex?: string;
  };
  mainChainAggregateUnlockTrustless?: {
    address: string;
    ergoTreeHex: string;
  };
}

export interface ActivePegInDeploymentV1 {
  lockAddress: string;
  lockErgoTreeHex: string;
  vaultAddress: string;
  vaultErgoTreeHex: string;
}

function normalizeHex(value: string, label: string, expectedBytes?: number): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be even-length hex`);
  }
  if (expectedBytes !== undefined && clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return clean.toLowerCase();
}

/**
 * Inspect canonical V1 transaction fields supplied by the Ergo observation
 * boundary. Canonical-chain membership and confirmation policy remain
 * adapter/lifecycle responsibilities.
 */
export function inspectPegInCommitmentInclusionV1(input: {
  commitment: CanonicalPegInCommitmentV1;
  expectedTransactionIdHex: string;
  sourceBoxIdHex: string;
}): CanonicalPegInCommitmentV1 {
  const transactionIdHex = normalizeHex(
    input.commitment.transactionIdHex,
    'commit transaction id',
    32,
  );
  if (
    transactionIdHex
    !== normalizeHex(input.expectedTransactionIdHex, 'persisted commitment transaction id', 32)
  ) {
    throw new Error('canonical transaction id does not match persisted commitment id');
  }
  const sourceBoxIdHex = normalizeHex(input.sourceBoxIdHex, 'source box id', 32);
  const inputBoxIdsHex = input.commitment.inputBoxIdsHex.map(
    boxId => normalizeHex(boxId, 'transaction input box id', 32),
  );
  if (!inputBoxIdsHex.includes(sourceBoxIdHex)) {
    throw new Error('commitment transaction does not consume the persisted source deposit');
  }
  const inclusionBlockIdHex = normalizeHex(
    input.commitment.inclusionBlockIdHex,
    'commit inclusion block id',
    32,
  );
  if (
    !Number.isSafeInteger(input.commitment.inclusionHeight)
    || input.commitment.inclusionHeight < 0
  ) {
    throw new Error('commit transaction is missing a valid inclusion height');
  }
  return Object.freeze({
    transactionIdHex,
    inclusionBlockIdHex,
    inclusionHeight: input.commitment.inclusionHeight,
    inputBoxIdsHex: Object.freeze(inputBoxIdsHex),
  });
}

/**
 * Verify the exact V1 non-refundable vault shape for one mint intent.
 * UTXO existence and canonicality are observed outside the profile.
 */
export function assertExactCommittedVaultV1(
  intent: PegInMintIntentV1,
  box: CanonicalCommittedVaultV1,
  vaultErgoTreeHex: string,
): string {
  selectSubstrateGrandpaV1AssetProfile(intent.assetProfileId);
  const vaultBoxIdHex = normalizeHex(box.boxIdHex, 'committed vault box id', 32);
  if (
    normalizeHex(box.ergoTreeHex, 'committed vault ErgoTree')
    !== normalizeHex(vaultErgoTreeHex, 'configured vault ErgoTree')
  ) {
    throw new Error('committed vault output uses the wrong ErgoTree');
  }
  if (box.valueNanoErg !== intent.amountNanoErg) {
    throw new Error('committed vault output value does not equal the deposit value');
  }
  if (box.tokenCount !== 0) {
    throw new Error('committed vault output must be pure ERG');
  }
  if (!intent.depositorErgoTreeHex) {
    throw new Error('peg-in is missing persisted depositor ErgoTree provenance');
  }

  const expectedRegisters: Record<string, string> = {
    R4: encodeCollByteRegister(Buffer.from(
      normalizeHex(intent.sourceBoxIdHex, 'source box id', 32),
      'hex',
    )),
    R5: encodeCollByteRegister(Buffer.from(
      normalizeHex(intent.targetH160Hex, 'target H160', 20),
      'hex',
    )),
    R6: encodeLongRegister(safeNanoErgNumber(intent.amountNanoErg, 'peg-in amount')),
    R7: encodeCollByteRegister(Buffer.from(
      normalizeHex(intent.depositorErgoTreeHex, 'depositor ErgoTree'),
      'hex',
    )),
  };
  for (const [register, expected] of Object.entries(expectedRegisters)) {
    if (box.registers[register as keyof CanonicalCommittedVaultV1['registers']]
        ?.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`committed vault output ${register} binding mismatch`);
    }
  }
  return vaultBoxIdHex;
}

/**
 * Sum only exact, canonical V1 vault boxes for the conservative backing alarm.
 * Canonical EIP-12 byte/box-ID validation remains the observation adapter's
 * responsibility before values enter this pure profile boundary.
 */
export function sumCanonicalCommittedVaultBackingV1(
  boxes: readonly Readonly<CanonicalCommittedVaultBackingBoxV1>[],
  vaultErgoTreeHex: string,
): bigint {
  const expectedTreeHex = normalizeHex(
    vaultErgoTreeHex,
    'configured vault ErgoTree',
  );
  const seenBoxIds = new Set<string>();
  let totalNanoErg = 0n;

  for (const [index, box] of boxes.entries()) {
    const label = `committed vault backing box ${index}`;
    const boxIdHex = normalizeHex(box.boxIdHex, `${label} ID`, 32);
    if (seenBoxIds.has(boxIdHex)) {
      throw new Error(`${label} duplicates box ${boxIdHex}`);
    }
    seenBoxIds.add(boxIdHex);
    if (normalizeHex(box.ergoTreeHex, `${label} ErgoTree`) !== expectedTreeHex) {
      throw new Error(`${label} uses the wrong ErgoTree`);
    }
    if (box.tokenCount !== 0) {
      throw new Error(`${label} must be pure ERG`);
    }
    const registerKeys = Object.keys(box.registers).sort();
    if (registerKeys.join(',') !== 'R4,R5,R6,R7') {
      throw new Error(`${label} must contain exactly R4-R7`);
    }
    const sourceBoxIdHex = decodeCanonicalCollByteRegister(
      box.registers.R4,
      `${label} R4`,
    );
    if (sourceBoxIdHex.length !== 64) {
      throw new Error(`${label} R4 must contain exactly 32 bytes`);
    }
    const targetH160Hex = decodeCanonicalCollByteRegister(
      box.registers.R5,
      `${label} R5`,
    );
    if (targetH160Hex.length !== 40) {
      throw new Error(`${label} R5 must contain exactly 20 bytes`);
    }
    const originalAmountNanoErg = decodeCanonicalLongRegister(
      box.registers.R6,
      `${label} R6`,
    );
    if (originalAmountNanoErg <= 0n || originalAmountNanoErg !== box.valueNanoErg) {
      throw new Error(`${label} R6 must equal its positive box value`);
    }
    const depositorErgoTreeHex = decodeCanonicalCollByteRegister(
      box.registers.R7,
      `${label} R7`,
    );
    if (depositorErgoTreeHex.length === 0) {
      throw new Error(`${label} R7 must contain a nonempty depositor ErgoTree`);
    }
    totalNanoErg += box.valueNanoErg;
  }

  return totalNanoErg;
}

function decodeCanonicalCollByteRegister(registerHex: string, label: string): string {
  const decodedHex = decodeCollByteRegister(registerHex, label);
  if (
    encodeCollByteRegister(Buffer.from(decodedHex, 'hex'))
    !== normalizeHex(registerHex, label)
  ) {
    throw new Error(`${label} must use canonical Coll[Byte] encoding`);
  }
  return decodedHex;
}

/**
 * Resolve the active V1 compatibility deployment without reading deployment
 * state or performing network I/O.
 */
export function resolveActivePegInDeploymentV1(
  deployed: PegInDeploymentConfigV1,
): ActivePegInDeploymentV1 | null {
  const lock = deployed.mainChainLock;
  const vault = deployed.mainChainAggregateUnlockTrustless;
  if (
    lock.version !== 'committed-vault-v3'
    || !lock.settlementVaultErgoTreeHex
    || !vault
  ) {
    return null;
  }
  const configuredVaultTree = normalizeHex(
    lock.settlementVaultErgoTreeHex,
    'MainChainLock settlement vault ErgoTree',
  );
  const deployedVaultTree = normalizeHex(
    vault.ergoTreeHex,
    'V2 settlement vault ErgoTree',
  );
  if (configuredVaultTree !== deployedVaultTree) {
    throw new Error('MainChainLock settlement vault does not match the deployed V2 vault');
  }
  return Object.freeze({
    lockAddress: lock.address,
    lockErgoTreeHex: lock.ergoTreeHex,
    vaultAddress: vault.address,
    vaultErgoTreeHex: deployedVaultTree,
  });
}
