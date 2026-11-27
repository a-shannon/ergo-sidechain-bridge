import fs from 'node:fs';
import {
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
} from './core/avl.js';
import {
  DEFAULT_MINER_FEE,
  MIN_BOX_VALUE,
  ZERO_32_HEX,
  computeErgoKeySetDigest,
  decodeTrackerGovernanceR9,
} from './core/codecs.js';
import {
  BridgeV1FamilyParams,
  compileBridgeV1Family,
  compileRotatedTracker,
} from './core/contracts.js';
import {
  buildRentRefreshTx,
  buildTrackerExecuteUpgradeTx,
  buildTrackerProposeUpgradeTx,
} from './core/tx-builders.js';
import {
  deriveKeyPairFromSecretHex,
  signTransaction,
  signTransactionDistributedCommittee,
} from './crypto/signer.js';
import { ErgoIndexedBox, StockErgoNodeClient } from './clients/ergo-node.js';
import { FrontierEvmClient } from './clients/evm-client.js';
import {
  BridgeStateDb,
  readLiveReserveLiability,
  readLiveTrackerLatestSourceHeight,
} from './state/db.js';
import { ActiveCommitteeEpochConfig, BridgeRelayerDaemon } from './relayer/daemon.js';

export interface BridgeCliEpochEntry {
  epoch: number;
  pubKeysHex: string[];
  threshold: number;
}

export interface BridgeCliConfigFile {
  ergoNodeUrl: string;
  ergoApiKey?: string;
  evmRpcUrl: string;
  dbPath: string;
  broadcastEnabled?: boolean;
  ergoDepositConfirmations?: number;
  ergoReserveConfirmations?: number;
  evmBurnConfirmations?: number;
  evmStartBlock?: number;
  rentRefreshAgeBlocks?: number;
  pollIntervalMs?: number;
  starkAuthorityDigestHex?: string;
  family: {
    networkPrefix: 0 | 16;
    sourceNetworkIdHex: string;
    sidechainIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
    trackerNftIdHex: string;
    dupNftIdHex: string;
    reserveNftIdHex: string;
    committeePubKeysHex: string[];
    committeeThreshold: number;
    committeeEpoch: number;
    escapeTimeoutBlocks: number;
    minConfirmations: number;
    upgradeTimelockBlocks: number;
    maxAdmissionLagBlocks: number;
    minDepositNanoErg?: string;
    minRefreshAgeBlocks?: number;
  };
  /** Committee epoch history for post-rotation reconstruction, daemon & governance ([H-6]) */
  epochs?: BridgeCliEpochEntry[];
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable ${name}`);
  return val;
}

function loadConfig(configPath: string): {
  raw: BridgeCliConfigFile;
  familyParams: BridgeV1FamilyParams;
} {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as BridgeCliConfigFile;
  const f = raw.family;
  return {
    raw,
    familyParams: {
      networkPrefix: f.networkPrefix,
      sourceNetworkIdHex: f.sourceNetworkIdHex,
      sidechainIdHex: f.sidechainIdHex,
      bridgeAddressHex: f.bridgeAddressHex,
      tokenAddressHex: f.tokenAddressHex,
      trackerNftIdHex: f.trackerNftIdHex,
      dupNftIdHex: f.dupNftIdHex,
      reserveNftIdHex: f.reserveNftIdHex,
      committeePubKeysHex: f.committeePubKeysHex,
      committeeThreshold: f.committeeThreshold,
      committeeEpoch: BigInt(f.committeeEpoch),
      escapeTimeoutBlocks: f.escapeTimeoutBlocks,
      minConfirmations: BigInt(f.minConfirmations),
      upgradeTimelockBlocks: BigInt(f.upgradeTimelockBlocks),
      maxAdmissionLagBlocks: BigInt(f.maxAdmissionLagBlocks),
      minDepositNanoErg: f.minDepositNanoErg ? BigInt(f.minDepositNanoErg) : undefined,
      minRefreshAgeBlocks: f.minRefreshAgeBlocks,
    },
  };
}

/**
 * Build full epoch metadata map from config `family` + `raw.epochs` ([H-6]).
 */
function buildEpochDirectory(
  raw: BridgeCliConfigFile,
  family: ReturnType<typeof compileBridgeV1Family>,
): Map<bigint, { epoch: bigint; pubKeysHex: string[]; threshold: number; ergoKeySetDigestHex: string }> {
  const map = new Map<
    bigint,
    { epoch: bigint; pubKeysHex: string[]; threshold: number; ergoKeySetDigestHex: string }
  >();
  map.set(family.params.committeeEpoch, {
    epoch: family.params.committeeEpoch,
    pubKeysHex: family.params.committeePubKeysHex,
    threshold: family.params.committeeThreshold,
    ergoKeySetDigestHex: family.ergoKeySetDigestHex,
  });
  for (const e of raw.epochs ?? []) {
    const ep = BigInt(e.epoch);
    map.set(ep, {
      epoch: ep,
      pubKeysHex: e.pubKeysHex.map((pk) => pk.toLowerCase()),
      threshold: e.threshold,
      ergoKeySetDigestHex: computeErgoKeySetDigest(e.threshold, e.pubKeysHex),
    });
  }
  return map;
}

/**
 * Pick a pure-ERG fee box ensuring exact fee or change >= MIN_BOX_VALUE ([L-3]).
 */
function pickCliFeeBox(utxos: ErgoIndexedBox[], minRequired: bigint): ErgoIndexedBox {
  const candidates = utxos
    .filter((u) => (u.assets?.length ?? 0) === 0 && BigInt(u.value) >= minRequired)
    .sort((a, b) => Number(BigInt(b.value) - BigInt(a.value)));
  for (const u of candidates) {
    const rem = BigInt(u.value) - minRequired;
    if (rem === 0n || rem >= MIN_BOX_VALUE) return u;
  }
  throw new Error(
    `No suitable pure-ERG fee box >= ${minRequired} nanoERG without sub-dust change`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const configPath = getArg(args, '--config');

  if (!cmd || !configPath) {
    console.log(`Ergo <-> Frontier Sidechain Bridge V1 CLI

Usage:
  cli.ts status --config <config.json>
  cli.ts reconstruct --config <config.json>
  cli.ts daemon --config <config.json> [--once]
  cli.ts rent-refresh --config <config.json> --target <reserve|dup|tracker> [--top-up <nanoErg>]
  cli.ts propose-rotate --config <config.json> --next-pubkeys <pk1,pk2,...> --next-threshold <t>
  cli.ts propose-graduate-stark --config <config.json> --stark-contract-id <hex32> --trust-anchor <hex32>
  cli.ts execute-upgrade --config <config.json> --target-ergotree <hex>

Required env vars for signing/broadcast commands:
  BRIDGE_FEE_PAYER_SECRET_HEX
  BRIDGE_COMMITTEE_SECRETS_HEX   (comma-separated >= threshold secrets for active epoch)
  BRIDGE_EVM_RELAYER_KEY         (0x-prefixed EVM private key for daemon)
  BRIDGE_BROADCAST_ENABLED=true  (explicit opt-in; defaults to dry-run check only)`);
    process.exit(cmd ? 1 : 0);
  }

  const { raw, familyParams } = loadConfig(configPath);
  const family = compileBridgeV1Family(familyParams);
  const epochDirectory = buildEpochDirectory(raw, family);
  const ergo = new StockErgoNodeClient({
    baseUrl: raw.ergoNodeUrl,
    apiKey: raw.ergoApiKey,
  });

  if (cmd === 'status') {
    const [info, indexed, reserveBox, dupBox, trackerBox] = await Promise.all([
      ergo.getInfo(),
      ergo.getIndexedHeight(),
      ergo.getLiveSingletonBox(family.params.reserveNftIdHex),
      ergo.getLiveSingletonBox(family.params.dupNftIdHex),
      ergo.getLiveSingletonBox(family.params.trackerNftIdHex),
    ]);
    const r9Raw = decodeSigmaCollByteHex(trackerBox.additionalRegisters.R9);
    const trackerGov = r9Raw.length === 81 ? decodeTrackerGovernanceR9(r9Raw) : null;
    const statusObj: Record<string, unknown> = {
      familyId: family.familyIdHex,
      ergo: {
        fullHeight: info.fullHeight,
        indexedHeight: indexed.indexedHeight,
        reserve: {
          boxId: reserveBox.boxId,
          ergNano: reserveBox.value.toString(),
          liabilityNano: readLiveReserveLiability(reserveBox).toString(),
          bufferNano: (BigInt(reserveBox.value) - readLiveReserveLiability(reserveBox)).toString(),
          ageBlocks: info.fullHeight - reserveBox.creationHeight,
          avlDigest: decodeSigmaAvlTreeDigestHex(reserveBox.additionalRegisters.R5),
        },
        dup: {
          boxId: dupBox.boxId,
          ergNano: dupBox.value.toString(),
          ageBlocks: info.fullHeight - dupBox.creationHeight,
          avlDigest: decodeSigmaAvlTreeDigestHex(dupBox.additionalRegisters.R5),
        },
        tracker: {
          boxId: trackerBox.boxId,
          ergNano: trackerBox.value.toString(),
          ageBlocks: info.fullHeight - trackerBox.creationHeight,
          latestSourceHeight: readLiveTrackerLatestSourceHeight(trackerBox).toString(),
          mode: trackerGov ? 'FEDERATED' : 'EIP0045_STARK',
          governance: trackerGov
            ? {
                epoch: trackerGov.epoch.toString(),
                pendingMode: trackerGov.pendingMode,
                pendingTargetScriptHash: trackerGov.pendingTargetScriptHashHex,
                pendingActivatesAtHeight: trackerGov.pendingActivatesAtHeight.toString(),
              }
            : { approvedGrandpaTrustAnchor: Buffer.from(r9Raw).toString('hex') },
          avlDigest: decodeSigmaAvlTreeDigestHex(trackerBox.additionalRegisters.R5),
        },
      },
    };
    if (process.env.BRIDGE_EVM_RELAYER_KEY) {
      const evm = new FrontierEvmClient({
        rpcUrl: raw.evmRpcUrl,
        relayerPrivateKey: process.env.BRIDGE_EVM_RELAYER_KEY,
        bridgeAddress: `0x${family.params.bridgeAddressHex}`,
        sergAddress: `0x${family.params.tokenAddressHex}`,
      });
      const solv = await evm.getSolvencySnapshot();
      statusObj.evm = {
        blockNumber: solv.blockNumber,
        sergTotalSupplyNano: solv.totalSupplyNanoErg.toString(),
        escrowedFeesNano: solv.bridgeEscrowedFeesNanoErg.toString(),
        paused: solv.paused,
        solvencyOk: solv.totalSupplyNanoErg <= readLiveReserveLiability(reserveBox),
      };
    }
    console.log(JSON.stringify(statusObj, null, 2));
    return;
  }

  if (cmd === 'reconstruct') {
    const db = new BridgeStateDb(raw.dbPath);
    try {
      const epochDigests = new Map<bigint, string>();
      for (const [ep, info] of epochDirectory.entries()) {
        epochDigests.set(ep, info.ergoKeySetDigestHex);
      }
      const report = await db.reconstructFromErgoNode(
        ergo,
        family,
        epochDigests,
        raw.starkAuthorityDigestHex,
      );
      console.log(
        JSON.stringify(
          {
            reserveEntries: report.reserveEntries,
            reserveDigestHex: report.reserveDigestHex,
            reserveDigestMatched: report.reserveDigestMatched,
            trackerEntries: report.trackerEntries,
            trackerDigestHex: report.trackerDigestHex,
            trackerDigestMatched: report.trackerDigestMatched,
            dupEntries: report.dupEntries,
            dupDigestHex: report.dupDigestHex,
            dupDigestMatched: report.dupDigestMatched,
            activeTrackerEpoch: report.activeTrackerEpoch.toString(),
          },
          null,
          2,
        ),
      );
    } finally {
      db.close();
    }
    return;
  }

  if (cmd === 'daemon') {
    const feePayerSecretHex = requireEnv('BRIDGE_FEE_PAYER_SECRET_HEX');
    const committeeSecrets = requireEnv('BRIDGE_COMMITTEE_SECRETS_HEX')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const evmKey = requireEnv('BRIDGE_EVM_RELAYER_KEY');
    const broadcastEnabled =
      process.env.BRIDGE_BROADCAST_ENABLED === 'true' || raw.broadcastEnabled === true;

    const evm = new FrontierEvmClient({
      rpcUrl: raw.evmRpcUrl,
      relayerPrivateKey: evmKey,
      bridgeAddress: `0x${family.params.bridgeAddressHex}`,
      sergAddress: `0x${family.params.tokenAddressHex}`,
    });
    const db = new BridgeStateDb(raw.dbPath);
    const committeesByEpoch = new Map<bigint, ActiveCommitteeEpochConfig>();
    for (const [ep, info] of epochDirectory.entries()) {
      committeesByEpoch.set(ep, {
        epoch: ep,
        threshold: info.threshold,
        ergoKeySetDigestHex: info.ergoKeySetDigestHex,
        allPubKeysHex: info.pubKeysHex,
        signingMemberSecretsHex: committeeSecrets,
      });
    }

    const daemon = new BridgeRelayerDaemon({
      family,
      ergo,
      evm,
      db,
      feePayerSecretHex,
      committeesByEpoch,
      starkAuthorityDigestHex: raw.starkAuthorityDigestHex,
      broadcastEnabled,
      ergoDepositConfirmations: raw.ergoDepositConfirmations ?? 10,
      ergoReserveConfirmations: raw.ergoReserveConfirmations ?? 10,
      evmBurnConfirmations: raw.evmBurnConfirmations ?? 2,
      evmStartBlock: raw.evmStartBlock ?? 0,
      rentRefreshAgeBlocks: raw.rentRefreshAgeBlocks ?? 900_000,
      pollIntervalMs: raw.pollIntervalMs ?? 5_000,
    });
    process.on('SIGINT', () => {
      daemon.stop();
      db.close();
    });
    if (args.includes('--once')) {
      const res = await daemon.tick();
      console.log(
        JSON.stringify(
          {
            ...res,
            reserveErg: res.reserveErg.toString(),
            reserveLiability: res.reserveLiability.toString(),
            sergSupply: res.sergSupply.toString(),
          },
          null,
          2,
        ),
      );
      db.close();
      return;
    }
    await daemon.start();
    return;
  }

  if (cmd === 'rent-refresh') {
    const target = getArg(args, '--target');
    if (target !== 'reserve' && target !== 'dup' && target !== 'tracker') {
      throw new Error('--target must be reserve, dup, or tracker');
    }
    const topUp = BigInt(getArg(args, '--top-up') ?? '0');
    const feeSecret = requireEnv('BRIDGE_FEE_PAYER_SECRET_HEX');
    const feeKey = deriveKeyPairFromSecretHex(feeSecret, family.params.networkPrefix);
    const tokenId =
      target === 'reserve'
        ? family.params.reserveNftIdHex
        : target === 'dup'
          ? family.params.dupNftIdHex
          : family.params.trackerNftIdHex;
    const [info, headers, box, utxos] = await Promise.all([
      ergo.getInfo(),
      ergo.getLastHeaders(10),
      ergo.getLiveSingletonBox(tokenId),
      ergo.getUnspentBoxesByAddress(feeKey.address),
    ]);
    const feeBox = pickCliFeeBox(utxos, DEFAULT_MINER_FEE + topUp);
    const built = buildRentRefreshTx({
      singletonBox: box,
      feeInBox: feeBox,
      changeErgoTreeHex: feeKey.p2pkErgoTreeHex,
      topUpNanoErg: topUp,
      creationHeight: info.fullHeight,
    });
    const signed = signTransaction({
      ...built,
      secretKeysHex: [feeSecret],
      height: info.fullHeight,
      lastHeaders: headers,
    });
    await ergo.checkTransaction(signed.signedTxJson);
    if (process.env.BRIDGE_BROADCAST_ENABLED === 'true') {
      const txId = await ergo.submitTransaction(signed.signedTxJson);
      console.log(`Broadcasted rentRefresh(${target}) txId=${txId}`);
    } else {
      console.log(`DRY-RUN rentRefresh(${target}) check PASS txId=${signed.txId}`);
    }
    return;
  }

  if (cmd === 'propose-rotate' || cmd === 'propose-graduate-stark') {
    const feeSecret = requireEnv('BRIDGE_FEE_PAYER_SECRET_HEX');
    const committeeSecrets = requireEnv('BRIDGE_COMMITTEE_SECRETS_HEX')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const feeKey = deriveKeyPairFromSecretHex(feeSecret, family.params.networkPrefix);
    const [info, headers, trackerBox, utxos] = await Promise.all([
      ergo.getInfo(),
      ergo.getLastHeaders(10),
      ergo.getLiveSingletonBox(family.params.trackerNftIdHex),
      ergo.getUnspentBoxesByAddress(feeKey.address),
    ]);
    const gov = decodeTrackerGovernanceR9(decodeSigmaCollByteHex(trackerBox.additionalRegisters.R9));
    const activeEpoch = epochDirectory.get(gov.epoch);
    if (!activeEpoch) {
      throw new Error(`No epoch configuration found in config.epochs for active epoch ${gov.epoch}`);
    }

    let mode: 1 | 2;
    let targetHashHex: string;
    let trustAnchorHex: string;
    let extraInfo: Record<string, unknown> = {};

    if (cmd === 'propose-rotate') {
      const nextPubKeys = (getArg(args, '--next-pubkeys') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const nextThreshold = Number(getArg(args, '--next-threshold'));
      const rotated = compileRotatedTracker(family, {
        pubKeysHex: nextPubKeys,
        threshold: nextThreshold,
        epoch: gov.epoch + 1n,
      });
      mode = 1;
      targetHashHex = rotated.tracker.contractIdHex;
      trustAnchorHex = ZERO_32_HEX;
      extraInfo = {
        nextEpoch: (gov.epoch + 1n).toString(),
        nextTrackerErgoTreeHex: rotated.tracker.ergoTreeHex,
        nextTrackerContractId: rotated.tracker.contractIdHex,
      };
    } else {
      targetHashHex = getArg(args, '--stark-contract-id') ?? '';
      trustAnchorHex = getArg(args, '--trust-anchor') ?? '';
      if (!targetHashHex || !trustAnchorHex) {
        throw new Error('--stark-contract-id and --trust-anchor are required');
      }
      mode = 2;
    }

    const feeBox = pickCliFeeBox(utxos, DEFAULT_MINER_FEE);
    const built = buildTrackerProposeUpgradeTx({
      family,
      trackerBox,
      currentEpoch: gov.epoch,
      upgradeTimelockBlocks: family.params.upgradeTimelockBlocks,
      mode,
      targetScriptHashHex: targetHashHex,
      trustAnchorDigestHex: trustAnchorHex,
      feeInBox: feeBox,
      changeErgoTreeHex: feeKey.p2pkErgoTreeHex,
      creationHeight: info.fullHeight,
    });
    const signed = signTransactionDistributedCommittee({
      ...built,
      committeeMemberSecretsHex: committeeSecrets,
      allCommitteePubKeysHex: activeEpoch.pubKeysHex,
      threshold: activeEpoch.threshold,
      feePayerSecretHex: feeSecret,
      height: info.fullHeight,
      lastHeaders: headers,
    });
    await ergo.checkTransaction(signed.signedTxJson);
    const broadcasted = process.env.BRIDGE_BROADCAST_ENABLED === 'true';
    const txId = broadcasted ? await ergo.submitTransaction(signed.signedTxJson) : signed.txId;
    console.log(
      JSON.stringify(
        {
          cmd,
          broadcasted,
          txId,
          activatesAtHeight: built.activatesAtHeight.toString(),
          ...extraInfo,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'execute-upgrade') {
    const targetErgoTreeHex = getArg(args, '--target-ergotree');
    if (!targetErgoTreeHex) throw new Error('--target-ergotree is required');
    const feeSecret = requireEnv('BRIDGE_FEE_PAYER_SECRET_HEX');
    const feeKey = deriveKeyPairFromSecretHex(feeSecret, family.params.networkPrefix);
    const [info, headers, trackerBox, utxos] = await Promise.all([
      ergo.getInfo(),
      ergo.getLastHeaders(10),
      ergo.getLiveSingletonBox(family.params.trackerNftIdHex),
      ergo.getUnspentBoxesByAddress(feeKey.address),
    ]);
    const feeBox = pickCliFeeBox(utxos, DEFAULT_MINER_FEE);
    const built = buildTrackerExecuteUpgradeTx({
      family,
      trackerBox,
      currentR9Bytes: decodeSigmaCollByteHex(trackerBox.additionalRegisters.R9),
      targetErgoTreeHex,
      feeInBox: feeBox,
      changeErgoTreeHex: feeKey.p2pkErgoTreeHex,
      creationHeight: info.fullHeight,
    });
    const signed = signTransaction({
      ...built,
      secretKeysHex: [feeSecret],
      height: info.fullHeight,
      lastHeaders: headers,
    });
    await ergo.checkTransaction(signed.signedTxJson);
    const broadcasted = process.env.BRIDGE_BROADCAST_ENABLED === 'true';
    const txId = broadcasted ? await ergo.submitTransaction(signed.signedTxJson) : signed.txId;
    console.log(JSON.stringify({ cmd, broadcasted, txId }, null, 2));
    return;
  }

  throw new Error(`Unknown CLI command: ${cmd}`);
}

main().catch((err) => {
  console.error(`CLI ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
