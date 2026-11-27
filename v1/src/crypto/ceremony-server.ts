import crypto from 'node:crypto';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import https from 'node:https';
import { ethers } from 'ethers';
import {
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
  decodeSigmaIntHex,
  decodeSigmaLongHex,
  trackerVerifyInsert,
} from '../core/avl.js';
import {
  AUTH_MODE_FEDERATED,
  BurnLeafV1,
  MINER_FEE_ERGO_TREE_HEX,
  ZERO_32_HEX,
  buildBurnMerkleTree,
  bytesToHex,
  computeFederatedStatementIdHex,
  computeTrackerKeyHex,
  decodeTrackerGovernanceR9,
  encodeBurnLeafV1,
  encodeTrackerValueV1,
  normalizeRecipientErgoTreeHex,
} from '../core/codecs.js';
import { loadSolidityArtifact } from '../clients/evm-client.js';
import {
  ErgoBoxJson,
  MinimalHeaderJson,
  UnsignedTxJson,
  committeeGenerateCommitmentsJson,
  committeePartialSignAndExtractHintsJson,
  deriveKeyPairFromSecretHex,
} from './signer.js';

export const CEREMONY_MAX_BODY_BYTES = 512 * 1024;
export const CEREMONY_BODY_TIMEOUT_MS = 5_000;
export const CEREMONY_CLOCK_SKEW_MS = 60_000;
export const CEREMONY_DEFAULT_SESSION_TTL_MS = 120_000;
export const CEREMONY_MAX_ACTIVE_SESSIONS = 128;
export const CEREMONY_MAX_SEEN_NONCES = 4_096;
export const CEREMONY_MAX_CONSUMED_TOMBSTONES = 4_096;

export interface CeremonyCommitRequest {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  height: number;
  lastHeaders?: MinimalHeaderJson[];
}

export interface CeremonyCommitResponse {
  sessionId: string;
  pubKeyHex: string;
  txDigest: string;
  publicCommitmentsJson: string;
}

export interface CeremonySignRequest {
  sessionId: string;
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  publicHintsJsonList: string[];
  simulatedPubKeysHex: string[];
  height: number;
  lastHeaders?: MinimalHeaderJson[];
}

export interface CeremonySignResponse {
  sessionId: string;
  pubKeyHex: string;
  publicExtractedHintsJson: string;
}

export interface CeremonyTlsOptions {
  keyPem: string | Buffer;
  certPem: string | Buffer;
  caPem?: string | Buffer;
  requireClientCert?: boolean;
}

export interface ParsedAdmitCheckpoint {
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  sourceHeight: bigint;
  sourceBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnCount: number;
  admissionHeight: number;
  epoch: bigint;
}

export interface ApprovedUpgradeTarget {
  mode: 1 | 2;
  targetScriptHashHex: string;
  trustAnchorDigestHex: string;
}

export interface CommitteePolicyConfig {
  trackerNftIdHex: string;
  familyIdHex: string;
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  ergoKeySetDigestHex: string;
  /** REQUIRED: compiled BridgeTracker ErgoTree hex for this signer's active epoch ([H-2]) */
  expectedTrackerErgoTreeHex: string;
  minUpgradeTimelockBlocks: bigint;
  maxAdmissionLagBlocks: bigint;
  forbiddenExtraNftIdsHex?: string[];
  /**
   * Independent checkpoint truth verifier (e.g., querying the signer's own Frontier RPC).
   * REQUIRED for `admitCheckpoint` unless `allowUnverifiedAdmitForTesting` is explicitly true ([C-1]).
   */
  checkpointVerifier?: (checkpoint: ParsedAdmitCheckpoint) => Promise<void> | void;
  /** Dev/test-only bypass when no Frontier RPC is attached; NEVER enable in production ([C-1]). */
  allowUnverifiedAdmitForTesting?: boolean;
  /** Optional signer-local Ergo height provider to cross-check `req.height` ([C-2]). */
  ergoHeightProvider?: () => Promise<number> | number;
  /** Governance signing is DISABLED by default on automated signer nodes ([C-2]). */
  allowGovernancePropose?: boolean;
  approvedUpgradeTargets?: ApprovedUpgradeTarget[];
  allowGovernanceCancel?: boolean;
  /** Optional extra operator policy hook */
  customPolicyCheck?: (req: CeremonyCommitRequest) => Promise<void> | void;
}

export interface CommitteeSignerServerConfig {
  memberSecretHex: string;
  networkPrefix?: 0 | 16;
  authSecret: string;
  policy: CommitteePolicyConfig;
  host?: string;
  port?: number;
  sessionTtlMs?: number;
  tls?: CeremonyTlsOptions;
  logger?: (msg: string) => void;
}

/**
 * Create an independent Frontier EVM RPC checkpoint verifier for `signer-node` ([C-1]).
 * Each committee host verifies block hash, confirmation depth, exact PegOut logs,
 * burnCount, and recomputed Blake2b Merkle root against its OWN Frontier RPC node.
 */
export function createFrontierCheckpointVerifier(params: {
  evmRpcUrl: string;
  bridgeAddressHex: string;
  sidechainIdHex: string;
  evmBurnConfirmations: number;
  timeoutMs?: number;
}): (checkpoint: ParsedAdmitCheckpoint) => Promise<void> {
  const bridgeAddress = params.bridgeAddressHex.startsWith('0x')
    ? params.bridgeAddressHex
    : `0x${params.bridgeAddressHex}`;
  const bridgeAbi = loadSolidityArtifact('ErgoBridge').abi;
  const timeoutMs = params.timeoutMs ?? 10_000;

  return async (checkpoint: ParsedAdmitCheckpoint): Promise<void> => {
    // Pre-probe eth_chainId so ethers v6 never spawns background network-detection retries ([N-3])
    let chainIdHex: string;
    try {
      const probeRes = await fetch(params.evmRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(Math.min(5_000, timeoutMs)),
      });
      if (!probeRes.ok) {
        throw new Error(`HTTP ${probeRes.status}`);
      }
      const probeJson = (await probeRes.json()) as { result?: unknown };
      if (typeof probeJson.result !== 'string' || !/^0x[0-9a-f]+$/i.test(probeJson.result)) {
        throw new Error('invalid eth_chainId payload');
      }
      chainIdHex = probeJson.result;
    } catch (err) {
      throw new Error(
        `Policy reject: Frontier RPC unreachable for checkpoint verification (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    const staticNet = new ethers.Network('frontier', BigInt(chainIdHex));
    const provider = new ethers.JsonRpcProvider(params.evmRpcUrl, staticNet, {
      staticNetwork: staticNet,
    });
    try {
      const runWithTimeout = async <T>(p: Promise<T>): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            p,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Frontier RPC checkpoint verification timed out')),
                timeoutMs,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      const currentBlock = await runWithTimeout(provider.getBlockNumber());
      const finalizedBlock = BigInt(currentBlock) - BigInt(Math.max(0, params.evmBurnConfirmations));
      if (checkpoint.sourceHeight > finalizedBlock) {
        throw new Error(
          `Policy reject: sidechain block ${checkpoint.sourceHeight} not yet finalized (finalized=${finalizedBlock})`,
        );
      }
      const blkNum = Number(checkpoint.sourceHeight);
      const block = await runWithTimeout(provider.getBlock(blkNum));
      if (!block || !block.hash) {
        throw new Error(`Policy reject: Frontier RPC returned no block at height ${blkNum}`);
      }
      const liveBlockHash = block.hash.replace(/^0x/i, '').toLowerCase();
      if (
        liveBlockHash !== checkpoint.executionBlockHashHex ||
        liveBlockHash !== checkpoint.sourceBlockHashHex
      ) {
        throw new Error(
          `Policy reject: Frontier block hash mismatch at height ${blkNum} (live=${liveBlockHash}, claimed=${checkpoint.executionBlockHashHex})`,
        );
      }

      const bridge = new ethers.Contract(bridgeAddress, bridgeAbi, provider);
      const rawLogs = await runWithTimeout(
        bridge.queryFilter(bridge.filters.PegOut(), blkNum, blkNum),
      );
      const sortedLogs = rawLogs
        .filter((l): l is ethers.EventLog => 'args' in l && Boolean(l.args))
        .sort((a, b) => a.index - b.index);
      if (sortedLogs.length !== rawLogs.length) {
        throw new Error(
          `Policy reject: Frontier RPC returned undecodable PegOut logs at height ${blkNum}`,
        );
      }

      // Bind every log's blockHash to the verified canonical block to prevent split-view/reorg TOCTOU ([N-3])
      for (const log of sortedLogs) {
        const logBlockHash = (log.blockHash ?? '').replace(/^0x/i, '').toLowerCase();
        if (logBlockHash !== liveBlockHash) {
          throw new Error(
            `Policy reject: Frontier PegOut log blockHash mismatch at height ${blkNum} (reorg/split-view detected)`,
          );
        }
      }

      if (sortedLogs.length !== checkpoint.burnCount) {
        throw new Error(
          `Policy reject: Frontier PegOut count mismatch at height ${blkNum} (live=${sortedLogs.length}, claimed=${checkpoint.burnCount})`,
        );
      }

      const leaves: BurnLeafV1[] = sortedLogs.map((log) => ({
        sidechainIdHex: params.sidechainIdHex.toLowerCase(),
        executionBlockHashHex: liveBlockHash,
        sidechainTxHashHex: log.transactionHash.replace(/^0x/i, '').toLowerCase(),
        eventIndex: log.index,
        recipientErgoTreeHex: normalizeRecipientErgoTreeHex(
          String(log.args[2]).replace(/^0x/i, '').toLowerCase(),
        ),
        amountNanoErg: BigInt(log.args[1]),
      }));
      const merkle = buildBurnMerkleTree(leaves.map((l) => encodeBurnLeafV1(l).encodedLeaf));
      if (merkle.rootHex !== checkpoint.bridgeEventRootHex) {
        throw new Error(
          `Policy reject: Frontier burn Merkle root mismatch at height ${blkNum} (live=${merkle.rootHex}, claimed=${checkpoint.bridgeEventRootHex})`,
        );
      }
    } finally {
      provider.destroy();
    }
  };
}

/** Deterministic recursive-key-sorted JSON serialization ([L-3]). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

export function computeCeremonyHmacHex(
  authSecret: string,
  timestampMs: string,
  requestNonce: string,
  method: string,
  reqPath: string,
  rawBody: string,
): string {
  return crypto
    .createHmac('sha256', authSecret)
    .update(`${timestampMs}\n${requestNonce}\n${method.toUpperCase()}\n${reqPath}\n${rawBody}`)
    .digest('hex');
}

export function computeCeremonyTxDigest(req: CeremonyCommitRequest): string {
  const canonical = canonicalJson({
    unsignedTx: req.unsignedTx,
    inputBoxes: req.inputBoxes,
    dataBoxes: req.dataBoxes ?? [],
    height: req.height,
    lastHeaders: req.lastHeaders ?? [],
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length || aHex.length === 0 || aHex.length % 2 !== 0) return false;
  if (!/^[0-9a-fA-F]+$/.test(aHex) || !/^[0-9a-fA-F]+$/.test(bHex)) return false;
  return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
}

function readU64BE(bytes: Uint8Array, offset: number): bigint {
  let out = 0n;
  for (let i = 0; i < 8; i++) {
    out = (out << 8n) | BigInt(bytes[offset + i]);
  }
  return out;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * Full cryptographic anti-blind-signing policy verifier executed on EVERY committee
 * signer host before Round 1 commitments and again before Round 2 partial signing.
 * Closes [C-1], [C-2], and [H-2] completely.
 */
export async function verifyCommitteeTxPolicy(
  req: CeremonyCommitRequest,
  policy: CommitteePolicyConfig,
): Promise<void> {
  if (!req || !req.unsignedTx || !Array.isArray(req.inputBoxes)) {
    throw new Error('Policy reject: malformed ceremony payload');
  }
  if (!Number.isInteger(req.height) || req.height <= 0) {
    throw new Error('Policy reject: invalid Ergo height');
  }
  if (!policy.expectedTrackerErgoTreeHex) {
    throw new Error('Policy reject: signer missing required expectedTrackerErgoTreeHex');
  }

  // Optional signer-local Ergo height cross-check ([C-2])
  if (policy.ergoHeightProvider) {
    const ownHeight = await policy.ergoHeightProvider();
    if (Math.abs(ownHeight - req.height) > 5) {
      throw new Error(
        `Policy reject: coordinator height ${req.height} diverges from signer Ergo height ${ownHeight}`,
      );
    }
  }

  // Exact BridgeTracker.es tx shape ([H-2]): 0 dataInputs, 2 inputs, 2 or 3 outputs
  if ((req.unsignedTx.dataInputs?.length ?? 0) !== 0 || (req.dataBoxes?.length ?? 0) !== 0) {
    throw new Error('Policy reject: BridgeTracker transactions must have zero dataInputs');
  }
  if (req.inputBoxes.length !== 2 || req.unsignedTx.inputs.length !== 2) {
    throw new Error('Policy reject: BridgeTracker transactions must have exactly 2 inputs');
  }
  if (
    !Array.isArray(req.unsignedTx.outputs) ||
    (req.unsignedTx.outputs.length !== 2 && req.unsignedTx.outputs.length !== 3)
  ) {
    throw new Error('Policy reject: BridgeTracker transactions must have 2 or 3 outputs');
  }
  if (
    req.unsignedTx.inputs[0].boxId !== req.inputBoxes[0].boxId ||
    req.unsignedTx.inputs[1].boxId !== req.inputBoxes[1].boxId
  ) {
    throw new Error('Policy reject: unsignedTx input boxIds do not match inputBoxes');
  }

  const trackerNft = policy.trackerNftIdHex.toLowerCase();
  const familyId = policy.familyIdHex.toLowerCase();
  const inTracker = req.inputBoxes[0];
  const inFee = req.inputBoxes[1];
  const outTracker = req.unsignedTx.outputs[0];
  const outFee = req.unsignedTx.outputs[1];
  const outChange = req.unsignedTx.outputs[2];

  // Fee input & outputs must be pure ERG, exact miner fee bounds, exact ERG conservation
  if ((inFee.assets?.length ?? 0) !== 0) {
    throw new Error('Policy reject: INPUTS(1) fee box must be pure ERG (zero assets)');
  }
  if (
    outFee.ergoTree.toLowerCase() !== MINER_FEE_ERGO_TREE_HEX.toLowerCase() ||
    (outFee.assets?.length ?? 0) !== 0
  ) {
    throw new Error('Policy reject: OUTPUTS(1) must be pure-ERG miner fee box');
  }
  const feeVal = BigInt(outFee.value);
  if (feeVal < 1_000_000n || feeVal > 5_000_000n) {
    throw new Error(`Policy reject: miner fee ${feeVal} outside [1000000, 5000000]`);
  }
  let changeVal = 0n;
  if (outChange) {
    if ((outChange.assets?.length ?? 0) !== 0) {
      throw new Error('Policy reject: OUTPUTS(2) fee change must be pure ERG');
    }
    changeVal = BigInt(outChange.value);
    if (changeVal < 1_000_000n) {
      throw new Error(`Policy reject: OUTPUTS(2) fee change ${changeVal} below 1000000`);
    }
    if (
      outChange.ergoTree.toLowerCase() === inTracker.ergoTree.toLowerCase() ||
      outChange.ergoTree.toLowerCase() === MINER_FEE_ERGO_TREE_HEX.toLowerCase()
    ) {
      throw new Error('Policy reject: OUTPUTS(2) fee change has forbidden ErgoTree');
    }
  }

  const inTrackerVal = BigInt(inTracker.value);
  const inFeeVal = BigInt(inFee.value);
  const outTrackerVal = BigInt(outTracker.value);
  if (outTrackerVal < inTrackerVal) {
    throw new Error('Policy reject: OUTPUTS(0) drains ERG from BridgeTracker');
  }
  if (inTrackerVal + inFeeVal !== outTrackerVal + feeVal + changeVal) {
    throw new Error('Policy reject: transaction does not conserve ERG exactly');
  }

  const inAssets = inTracker.assets ?? [];
  if (
    inAssets.length !== 1 ||
    inAssets[0].tokenId.toLowerCase() !== trackerNft ||
    BigInt(inAssets[0].amount) !== 1n
  ) {
    throw new Error('Policy reject: INPUTS(0) does not carry the exact Tracker singleton NFT');
  }
  const outAssets = outTracker.assets ?? [];
  if (
    outAssets.length !== 1 ||
    outAssets[0].tokenId.toLowerCase() !== trackerNft ||
    BigInt(outAssets[0].amount) !== 1n
  ) {
    throw new Error('Policy reject: OUTPUTS(0) does not preserve the Tracker singleton NFT');
  }

  if (inTracker.ergoTree.toLowerCase() !== policy.expectedTrackerErgoTreeHex.toLowerCase()) {
    throw new Error('Policy reject: INPUTS(0) ErgoTree does not match configured BridgeTracker');
  }
  if (outTracker.ergoTree.toLowerCase() !== inTracker.ergoTree.toLowerCase()) {
    throw new Error('Policy reject: committee signing cannot mutate Tracker ErgoTree directly');
  }

  // Ensure forbidden singleton NFTs never appear on INPUTS(1)
  const forbiddenNfts = new Set([
    trackerNft,
    ...(policy.forbiddenExtraNftIdsHex ?? []).map((x) => x.toLowerCase()),
  ]);
  for (const asset of inFee.assets ?? []) {
    if (forbiddenNfts.has(asset.tokenId.toLowerCase())) {
      throw new Error('Policy reject: unexpected bridge singleton NFT in fee input');
    }
  }

  const inRegs = inTracker.additionalRegisters ?? {};
  const outRegs = outTracker.additionalRegisters ?? {};
  if (!inRegs.R4 || !inRegs.R5 || !inRegs.R6 || !inRegs.R7 || !inRegs.R8 || !inRegs.R9) {
    throw new Error('Policy reject: incomplete BridgeTracker input registers');
  }
  if (!outRegs.R4 || !outRegs.R5 || !outRegs.R6 || !outRegs.R7 || !outRegs.R8 || !outRegs.R9) {
    throw new Error('Policy reject: incomplete BridgeTracker output registers');
  }

  const inFamily = Buffer.from(decodeSigmaCollByteHex(inRegs.R4)).toString('hex');
  const outFamily = Buffer.from(decodeSigmaCollByteHex(outRegs.R4)).toString('hex');
  if (inFamily !== familyId || outFamily !== familyId) {
    throw new Error('Policy reject: BridgeTracker familyId mismatch in R4');
  }
  const inSidechain = Buffer.from(decodeSigmaCollByteHex(inRegs.R6)).toString('hex');
  const outSidechain = Buffer.from(decodeSigmaCollByteHex(outRegs.R6)).toString('hex');
  if (
    inSidechain !== policy.sidechainIdHex.toLowerCase() ||
    outSidechain !== policy.sidechainIdHex.toLowerCase()
  ) {
    throw new Error('Policy reject: BridgeTracker sidechainId mismatch in R6');
  }

  const inSourceHeight = decodeSigmaLongHex(inRegs.R7);
  const outSourceHeight = decodeSigmaLongHex(outRegs.R7);
  const inAdmissionHeight = decodeSigmaIntHex(inRegs.R8);
  const outAdmissionHeight = decodeSigmaIntHex(outRegs.R8);
  if (
    !Number.isInteger(outTracker.creationHeight) ||
    outTracker.creationHeight < inTracker.creationHeight ||
    outTracker.creationHeight > req.height
  ) {
    throw new Error(
      `Policy reject: invalid OUTPUTS(0).creationHeight ${outTracker.creationHeight} at height ${req.height}`,
    );
  }

  const inGov = decodeTrackerGovernanceR9(decodeSigmaCollByteHex(inRegs.R9));
  const outGov = decodeTrackerGovernanceR9(decodeSigmaCollByteHex(outRegs.R9));
  if (outGov.epoch !== inGov.epoch) {
    throw new Error('Policy reject: committee signing cannot directly alter committee epoch');
  }

  // Parse ContextExtension Var(0) action bytes strictly matching BridgeTracker.es
  const ext0Hex = req.unsignedTx.inputs[0].extension?.['0'];
  if (!ext0Hex) {
    throw new Error('Policy reject: missing ContextExtension Var(0) action bytes on INPUTS(0)');
  }
  const actionBytes = decodeSigmaCollByteHex(ext0Hex);

  // Branch 1: admitCheckpoint (len === 174, tag === 0x01, version === 1) ([C-1])
  if (actionBytes.length === 174 && actionBytes[0] === 0x01) {
    if (actionBytes[1] !== 1) {
      throw new Error(`Policy reject: unsupported admit action version ${actionBytes[1]}`);
    }
    if (inRegs.R9.toLowerCase() !== outRegs.R9.toLowerCase()) {
      throw new Error('Policy reject: admitCheckpoint cannot alter governance R9');
    }

    const sourceNetworkIdHex = bytesToHex(actionBytes.slice(2, 34));
    const sidechainIdHex = bytesToHex(actionBytes.slice(34, 66));
    const sourceHeight = readU64BE(actionBytes, 66);
    const sourceBlockHashHex = bytesToHex(actionBytes.slice(74, 106));
    const executionBlockHashHex = bytesToHex(actionBytes.slice(106, 138));
    const bridgeEventRootHex = bytesToHex(actionBytes.slice(138, 170));
    const burnCount = readU32BE(actionBytes, 170);

    if (sourceNetworkIdHex !== policy.sourceNetworkIdHex.toLowerCase()) {
      throw new Error('Policy reject: admit action sourceNetworkId mismatch');
    }
    if (sidechainIdHex !== policy.sidechainIdHex.toLowerCase()) {
      throw new Error('Policy reject: admit action sidechainId mismatch');
    }
    if (sourceHeight <= 0n || sourceHeight <= inSourceHeight || sourceHeight !== outSourceHeight) {
      throw new Error('Policy reject: non-monotonic or mismatched admit sourceHeight');
    }
    if (
      sourceBlockHashHex === ZERO_32_HEX ||
      executionBlockHashHex === ZERO_32_HEX ||
      bridgeEventRootHex === ZERO_32_HEX
    ) {
      throw new Error('Policy reject: zero hash/root in admit action');
    }
    if (burnCount < 1 || burnCount > 256) {
      throw new Error(`Policy reject: admit burnCount ${burnCount} outside [1, 256]`);
    }
    if (
      outAdmissionHeight !== outTracker.creationHeight ||
      outAdmissionHeight < inAdmissionHeight ||
      BigInt(outTracker.creationHeight) < BigInt(req.height) - policy.maxAdmissionLagBlocks
    ) {
      throw new Error('Policy reject: admit creationHeight/R8 violates admission lag or monotonicity');
    }

    // Cryptographically verify Var(1) AVL insert proof produces exact OUTPUTS(0).R5 digest!
    const ext1Hex = req.unsignedTx.inputs[0].extension?.['1'];
    if (!ext1Hex) {
      throw new Error('Policy reject: missing ContextExtension Var(1) AVL insert proof');
    }
    const avlProofBytes = decodeSigmaCollByteHex(ext1Hex);
    if (avlProofBytes.length === 0) {
      throw new Error('Policy reject: empty AVL insert proof');
    }

    const statementIdHex = computeFederatedStatementIdHex(actionBytes);
    const trackerKeyHex = computeTrackerKeyHex({
      sourceNetworkIdHex,
      sidechainIdHex,
      sourceHeight,
      sourceBlockHashHex,
      executionBlockHashHex,
    });
    const trackerValueBytes = encodeTrackerValueV1({
      authMode: AUTH_MODE_FEDERATED,
      familyIdHex: familyId,
      sidechainIdHex,
      sourceHeight,
      sourceBlockHashHex,
      executionBlockHashHex,
      bridgeEventRootHex,
      burnCount,
      statementIdHex,
      admissionHeight: BigInt(outTracker.creationHeight),
      authorityEpoch: inGov.epoch,
      authorityDigestHex: policy.ergoKeySetDigestHex.toLowerCase(),
      trustAnchorDigestHex: ZERO_32_HEX,
      sourceNetworkIdHex,
    });

    const inDigestHex = decodeSigmaAvlTreeDigestHex(inRegs.R5);
    const outDigestHex = decodeSigmaAvlTreeDigestHex(outRegs.R5);
    const verifiedNextDigest = trackerVerifyInsert(
      inDigestHex,
      trackerKeyHex,
      bytesToHex(trackerValueBytes),
      bytesToHex(avlProofBytes),
    );
    if (verifiedNextDigest.toLowerCase() !== outDigestHex.toLowerCase()) {
      throw new Error(
        `Policy reject: OUTPUTS(0).R5 AVL digest (${outDigestHex}) != verified insert (${verifiedNextDigest})`,
      );
    }

    const parsedCheckpoint: ParsedAdmitCheckpoint = {
      sourceNetworkIdHex,
      sidechainIdHex,
      sourceHeight,
      sourceBlockHashHex,
      executionBlockHashHex,
      bridgeEventRootHex,
      burnCount,
      admissionHeight: outTracker.creationHeight,
      epoch: inGov.epoch,
    };

    // Fail closed unless an independent checkpoint verifier confirms the burn root ([C-1])!
    if (policy.checkpointVerifier) {
      await policy.checkpointVerifier(parsedCheckpoint);
    } else if (!policy.allowUnverifiedAdmitForTesting) {
      throw new Error(
        'Policy reject: independent checkpointVerifier is required to sign admitCheckpoint',
      );
    }
  } else if (actionBytes.length === 66 && actionBytes[0] === 0x02) {
    // Branch 2: proposeUpgrade — DISABLED BY DEFAULT ([C-2])
    if (!policy.allowGovernancePropose) {
      throw new Error(
        'Policy reject: automated proposeUpgrade signing is disabled on this signer node',
      );
    }
    const mode = actionBytes[1];
    if (mode !== 1 && mode !== 2) {
      throw new Error(`Policy reject: invalid proposeUpgrade mode ${mode}`);
    }
    const targetScriptHashHex = bytesToHex(actionBytes.slice(2, 34));
    const trustAnchorDigestHex = bytesToHex(actionBytes.slice(34, 66));
    if (targetScriptHashHex === ZERO_32_HEX) {
      throw new Error('Policy reject: proposeUpgrade targetScriptHash cannot be zero');
    }
    if (mode === 1 && trustAnchorDigestHex !== ZERO_32_HEX) {
      throw new Error('Policy reject: mode 1 committee rotation requires zero trustAnchor');
    }
    if (mode === 2 && trustAnchorDigestHex === ZERO_32_HEX) {
      throw new Error('Policy reject: mode 2 STARK graduation requires non-zero trustAnchor');
    }

    const approved = (policy.approvedUpgradeTargets ?? []).some(
      (t) =>
        t.mode === mode &&
        t.targetScriptHashHex.toLowerCase() === targetScriptHashHex &&
        t.trustAnchorDigestHex.toLowerCase() === trustAnchorDigestHex,
    );
    if (!approved) {
      throw new Error(
        `Policy reject: proposeUpgrade target ${targetScriptHashHex} is not in operator approvedUpgradeTargets allowlist`,
      );
    }
    if (
      inGov.pendingMode !== 0 ||
      outGov.pendingMode !== mode ||
      outGov.pendingTargetScriptHashHex !== targetScriptHashHex ||
      outGov.pendingTrustAnchorDigestHex !== trustAnchorDigestHex ||
      outGov.pendingActivatesAtHeight <
        BigInt(outTracker.creationHeight) + policy.minUpgradeTimelockBlocks ||
      outSourceHeight !== inSourceHeight ||
      outAdmissionHeight !== inAdmissionHeight ||
      outRegs.R5.toLowerCase() !== inRegs.R5.toLowerCase()
    ) {
      throw new Error('Policy reject: proposeUpgrade register transition invalid');
    }
  } else if (actionBytes.length === 1 && actionBytes[0] === 0x03) {
    // Branch 3: cancelUpgrade — DISABLED BY DEFAULT ([C-2])
    if (!policy.allowGovernanceCancel) {
      throw new Error(
        'Policy reject: automated cancelUpgrade signing is disabled on this signer node',
      );
    }
    if (
      inGov.pendingMode === 0 ||
      outGov.pendingMode !== 0 ||
      outGov.pendingTargetScriptHashHex !== ZERO_32_HEX ||
      outGov.pendingActivatesAtHeight !== 0n ||
      outGov.pendingTrustAnchorDigestHex !== ZERO_32_HEX ||
      outSourceHeight !== inSourceHeight ||
      outAdmissionHeight !== inAdmissionHeight ||
      outRegs.R5.toLowerCase() !== inRegs.R5.toLowerCase()
    ) {
      throw new Error('Policy reject: cancelUpgrade register transition invalid');
    }
  } else {
    throw new Error(
      `Policy reject: unsupported BridgeTracker action (len=${actionBytes.length}, tag=${actionBytes[0] ?? 'none'})`,
    );
  }

  if (policy.customPolicyCheck) {
    await policy.customPolicyCheck(req);
  }
}

interface ActiveNonceSession {
  txDigest: string;
  privateCommitmentsJson: string;
  expiresAtMs: number;
}

export class CommitteeSignerServer {
  private readonly cfg: CommitteeSignerServerConfig;
  private readonly keyPair: ReturnType<typeof deriveKeyPairFromSecretHex>;
  private readonly activeSessions = new Map<string, ActiveNonceSession>();
  private readonly consumedSessions = new Map<string, number>();
  private readonly seenRequestNonces = new Map<string, number>();
  private readonly server: http.Server | https.Server;
  private readonly log: (msg: string) => void;
  private boundUrl = '';

  constructor(cfg: CommitteeSignerServerConfig) {
    if (!cfg.authSecret || cfg.authSecret.length < 16) {
      throw new Error('CommitteeSignerServer requires authSecret of at least 16 characters');
    }
    this.cfg = cfg;
    this.keyPair = deriveKeyPairFromSecretHex(cfg.memberSecretHex, cfg.networkPrefix ?? 16);
    this.log = cfg.logger ?? (() => {});

    const handler = (req: IncomingMessage, res: ServerResponse) => {
      void this.handleRequest(req, res);
    };
    if (cfg.tls) {
      this.server = https.createServer(
        {
          key: cfg.tls.keyPem,
          cert: cfg.tls.certPem,
          ca: cfg.tls.caPem,
          requestCert: cfg.tls.requireClientCert ?? false,
          rejectUnauthorized: cfg.tls.requireClientCert ?? false,
        },
        handler,
      );
    } else {
      this.server = http.createServer(handler);
    }
    // Tight HTTP timeouts mitigating slow-body / Slowloris stalls ([H-1])
    this.server.headersTimeout = 10_000;
    this.server.requestTimeout = 15_000;
  }

  get pubKeyHex(): string {
    return this.keyPair.pubKeyHex;
  }

  get url(): string {
    return this.boundUrl;
  }

  async start(): Promise<string> {
    const host = this.cfg.host ?? '127.0.0.1';
    const port = this.cfg.port ?? 0;
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Unexpected server bind address');
    }
    const proto = this.cfg.tls ? 'https' : 'http';
    this.boundUrl = `${proto}://${host}:${addr.port}`;
    this.log(`Committee signer (${this.pubKeyHex.slice(0, 12)}...) listening on ${this.boundUrl}`);
    return this.boundUrl;
  }

  async stop(): Promise<void> {
    this.activeSessions.clear();
    this.consumedSessions.clear();
    this.seenRequestNonces.clear();
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private pruneExpired(nowMs: number): void {
    for (const [id, s] of this.activeSessions.entries()) {
      if (s.expiresAtMs <= nowMs) this.activeSessions.delete(id);
    }
    for (const [id, exp] of this.consumedSessions.entries()) {
      if (exp <= nowMs) this.consumedSessions.delete(id);
    }
    for (const [nonce, exp] of this.seenRequestNonces.entries()) {
      if (exp <= nowMs) this.seenRequestNonces.delete(nonce);
    }
  }

  private sendJson(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  }

  private preCheckAuthHeaders(req: IncomingMessage, nowMs: number): {
    tsHeader: string;
    nonceHeader: string;
    sigHeader: string;
  } {
    const tsHeader = req.headers['x-bridge-timestamp'];
    const nonceHeader = req.headers['x-bridge-nonce'];
    const sigHeader = req.headers['x-bridge-signature'];
    if (
      typeof tsHeader !== 'string' ||
      typeof nonceHeader !== 'string' ||
      typeof sigHeader !== 'string' ||
      !/^\d{10,16}$/.test(tsHeader) ||
      nonceHeader.length < 16 ||
      nonceHeader.length > 128
    ) {
      throw Object.assign(new Error('Missing or malformed HMAC authentication headers'), {
        httpStatus: 401,
      });
    }
    const ts = Number(tsHeader);
    if (!Number.isSafeInteger(ts) || Math.abs(nowMs - ts) > CEREMONY_CLOCK_SKEW_MS) {
      throw Object.assign(new Error('Request timestamp outside allowed clock skew window'), {
        httpStatus: 401,
      });
    }
    return { tsHeader, nonceHeader, sigHeader };
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      const fail = (err: Error & { httpStatus?: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      const timer = setTimeout(() => {
        req.destroy();
        fail(Object.assign(new Error('Request body read timed out'), { httpStatus: 408 }));
      }, CEREMONY_BODY_TIMEOUT_MS);

      req.on('data', (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > CEREMONY_MAX_BODY_BYTES) {
          req.destroy();
          fail(
            Object.assign(new Error('Request payload exceeds maximum allowed size'), {
              httpStatus: 413,
            }),
          );
          return;
        }
        chunks.push(buf);
      });
      req.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      req.on('error', (err) => fail(err));
    });
  }

  private finalizeAuth(
    headers: { tsHeader: string; nonceHeader: string; sigHeader: string },
    method: string,
    reqPath: string,
    rawBody: string,
    authNowMs: number,
  ): void {
    // Re-check clock skew AFTER body finishes reading ([H-1])!
    const ts = Number(headers.tsHeader);
    if (Math.abs(authNowMs - ts) > CEREMONY_CLOCK_SKEW_MS) {
      throw Object.assign(new Error('Request timestamp expired during body transfer'), {
        httpStatus: 401,
      });
    }
    const expected = computeCeremonyHmacHex(
      this.cfg.authSecret,
      headers.tsHeader,
      headers.nonceHeader,
      method,
      reqPath,
      rawBody,
    );
    if (!timingSafeHexEqual(headers.sigHeader, expected)) {
      throw Object.assign(new Error('Invalid HMAC signature'), { httpStatus: 401 });
    }
    if (this.seenRequestNonces.has(headers.nonceHeader)) {
      throw Object.assign(new Error('Replayed HTTP request nonce rejected'), { httpStatus: 409 });
    }
    if (this.seenRequestNonces.size >= CEREMONY_MAX_SEEN_NONCES) {
      throw Object.assign(new Error('Authentication replay cache saturated'), { httpStatus: 429 });
    }
    this.seenRequestNonces.set(headers.nonceHeader, authNowMs + CEREMONY_CLOCK_SKEW_MS * 2 + 1_000);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reqPath = (req.url ?? '/').split('?')[0];

    try {
      if (req.method === 'GET' && reqPath === '/health') {
        this.pruneExpired(Date.now());
        this.sendJson(res, 200, {
          ok: true,
          pubKeyHex: this.pubKeyHex,
          trackerNftIdHex: this.cfg.policy.trackerNftIdHex.toLowerCase(),
          familyIdHex: this.cfg.policy.familyIdHex.toLowerCase(),
          activeSessions: this.activeSessions.size,
        });
        return;
      }

      if (req.method !== 'POST') {
        this.sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      if (reqPath !== '/v1/ceremony/commit' && reqPath !== '/v1/ceremony/sign') {
        this.sendJson(res, 404, { error: `Unknown endpoint ${reqPath}` });
        return;
      }

      // Pre-check auth header format & skew BEFORE buffering body ([M-1])
      const preHeaders = this.preCheckAuthHeaders(req, Date.now());
      const rawBody = await this.readBody(req);

      // Recompute authoritative timestamp & prune AFTER body read ([H-1])
      const authNowMs = Date.now();
      this.pruneExpired(authNowMs);
      this.finalizeAuth(preHeaders, req.method, reqPath, rawBody, authNowMs);

      if (reqPath === '/v1/ceremony/commit') {
        if (this.activeSessions.size >= CEREMONY_MAX_ACTIVE_SESSIONS) {
          this.sendJson(res, 429, { error: 'Too many active signing sessions' });
          return;
        }
        const body = JSON.parse(rawBody) as CeremonyCommitRequest;
        try {
          await verifyCommitteeTxPolicy(body, this.cfg.policy);
        } catch (policyErr) {
          this.sendJson(res, 403, {
            error: policyErr instanceof Error ? policyErr.message : String(policyErr),
          });
          return;
        }

        // Re-check cap after async verifyCommitteeTxPolicy (prevents TOCTOU burst [M-1])
        const postPolicyNow = Date.now();
        this.pruneExpired(postPolicyNow);
        if (this.activeSessions.size >= CEREMONY_MAX_ACTIVE_SESSIONS) {
          this.sendJson(res, 429, { error: 'Too many active signing sessions' });
          return;
        }

        const txDigest = computeCeremonyTxDigest(body);
        const r1 = committeeGenerateCommitmentsJson({
          unsignedTx: body.unsignedTx,
          inputBoxes: body.inputBoxes,
          dataBoxes: body.dataBoxes,
          memberSecretHex: this.cfg.memberSecretHex,
          inputIndex: 0,
          height: body.height,
          lastHeaders: body.lastHeaders,
        });

        const sessionId = crypto.randomBytes(16).toString('hex');
        const ttl = this.cfg.sessionTtlMs ?? CEREMONY_DEFAULT_SESSION_TTL_MS;
        this.activeSessions.set(sessionId, {
          txDigest,
          privateCommitmentsJson: r1.privateCommitmentsJson,
          expiresAtMs: postPolicyNow + ttl,
        });

        const resp: CeremonyCommitResponse = {
          sessionId,
          pubKeyHex: r1.pubKeyHex,
          txDigest,
          publicCommitmentsJson: r1.publicCommitmentsJson,
        };
        this.sendJson(res, 200, resp);
        return;
      }

      if (reqPath === '/v1/ceremony/sign') {
        const body = JSON.parse(rawBody) as CeremonySignRequest;
        if (typeof body.sessionId !== 'string' || !body.sessionId) {
          this.sendJson(res, 400, { error: 'Missing sessionId' });
          return;
        }
        if (this.consumedSessions.has(body.sessionId)) {
          this.sendJson(res, 409, {
            error: 'Session already consumed; Schnorr nonce reuse is strictly forbidden',
          });
          return;
        }
        const session = this.activeSessions.get(body.sessionId);
        if (!session || session.expiresAtMs <= authNowMs) {
          this.activeSessions.delete(body.sessionId);
          this.sendJson(res, 404, { error: 'Unknown or expired ceremony session' });
          return;
        }

        // Consume-before-use: remove from activeSessions & record bounded tombstone immediately
        // so concurrent requests or thrown exceptions can NEVER reuse a Schnorr nonce!
        const ownPrivateCommitmentsJson = session.privateCommitmentsJson;
        const expectedTxDigest = session.txDigest;
        this.activeSessions.delete(body.sessionId);
        if (this.consumedSessions.size >= CEREMONY_MAX_CONSUMED_TOMBSTONES) {
          const oldestKey = this.consumedSessions.keys().next().value;
          if (oldestKey) this.consumedSessions.delete(oldestKey);
        }
        this.consumedSessions.set(body.sessionId, session.expiresAtMs);

        const txDigest = computeCeremonyTxDigest({
          unsignedTx: body.unsignedTx,
          inputBoxes: body.inputBoxes,
          dataBoxes: body.dataBoxes,
          height: body.height,
          lastHeaders: body.lastHeaders,
        });
        if (!timingSafeHexEqual(txDigest, expectedTxDigest)) {
          this.sendJson(res, 403, {
            error: 'Policy reject: Round-2 transaction does not match Round-1 committed txDigest',
          });
          return;
        }

        try {
          await verifyCommitteeTxPolicy(
            {
              unsignedTx: body.unsignedTx,
              inputBoxes: body.inputBoxes,
              dataBoxes: body.dataBoxes,
              height: body.height,
              lastHeaders: body.lastHeaders,
            },
            this.cfg.policy,
          );
        } catch (policyErr) {
          this.sendJson(res, 403, {
            error: policyErr instanceof Error ? policyErr.message : String(policyErr),
          });
          return;
        }

        const publicExtractedHintsJson = committeePartialSignAndExtractHintsJson({
          unsignedTx: body.unsignedTx,
          inputBoxes: body.inputBoxes,
          dataBoxes: body.dataBoxes,
          memberSecretHex: this.cfg.memberSecretHex,
          ownPrivateCommitmentsJson,
          publicHintsJsonList: body.publicHintsJsonList,
          simulatedPubKeysHex: body.simulatedPubKeysHex,
          height: body.height,
          lastHeaders: body.lastHeaders,
        });

        const resp: CeremonySignResponse = {
          sessionId: body.sessionId,
          pubKeyHex: this.pubKeyHex,
          publicExtractedHintsJson,
        };
        this.sendJson(res, 200, resp);
        return;
      }
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'httpStatus' in err
          ? Number((err as { httpStatus: number }).httpStatus)
          : 400;
      this.sendJson(res, status, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
