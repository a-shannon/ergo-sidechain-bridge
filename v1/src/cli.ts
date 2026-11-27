import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import {
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
} from './core/avl.js';
import {
  DEFAULT_MINER_FEE,
  MIN_BOX_VALUE,
  ZERO_32_HEX,
  bytesToHex,
  computeErgoKeySetDigest,
  decodeTrackerGovernanceR9,
} from './core/codecs.js';
import {
  BridgeV1FamilyParams,
  compileBridgeV1Family,
  compileRotatedTracker,
} from './core/contracts.js';
import {
  buildDepositLockTx,
  buildRefundDepositTx,
  buildRentRefreshTx,
  buildTrackerCancelUpgradeTx,
  buildTrackerExecuteUpgradeTx,
  buildTrackerProposeUpgradeTx,
} from './core/tx-builders.js';
import {
  deriveKeyPairFromSecretHex,
  signTransaction,
  signTransactionDistributedCommittee,
} from './crypto/signer.js';
import {
  CommitteeSignerServer,
  createFrontierCheckpointVerifier,
} from './crypto/ceremony-server.js';
import {
  RemoteCommitteeSignerEndpoint,
  executeRemoteCommitteeCeremony,
} from './crypto/ceremony-client.js';
import { ErgoIndexedBox, StockErgoNodeClient } from './clients/ergo-node.js';
import { FrontierEvmClient, loadSolidityArtifact } from './clients/evm-client.js';
import {
  BridgeStateDb,
  readLiveReserveLiability,
  readLiveTrackerLatestSourceHeight,
} from './state/db.js';
import { ActiveCommitteeEpochConfig, BridgeRelayerDaemon } from './relayer/daemon.js';
import { BridgeWebServer, parseErgoP2pkRecipient } from './web/server.js';

export interface BridgeCliEpochEntry {
  epoch: number;
  pubKeysHex: string[];
  threshold: number;
}

export interface BridgeCliConfigFile {
  ergoNodeUrl: string;
  ergoApiKey?: string;
  evmRpcUrl: string;
  /** Optional BridgeCommitteeTimelock contract address owning ErgoBridge ([H-5]) */
  timelockAddressHex?: string;
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

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid port value: ${raw}`);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Port ${raw} outside valid range 0..65535`);
  }
  return port;
}

function parseStrictUnsignedBigInt(raw: string, label: string): bigint {
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${label} must be a non-negative integer string, got "${raw}"`);
  }
  return BigInt(raw.trim());
}

function loadConfig(configPath: string): {
  raw: BridgeCliConfigFile;
  familyParams: BridgeV1FamilyParams;
} {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as BridgeCliConfigFile;
  if (process.env.BRIDGE_EVM_RPC_URL) {
    raw.evmRpcUrl = process.env.BRIDGE_EVM_RPC_URL;
  }
  if (process.env.BRIDGE_DB_PATH) {
    raw.dbPath = process.env.BRIDGE_DB_PATH;
  }
  if (process.env.BRIDGE_TIMELOCK_ADDRESS) {
    raw.timelockAddressHex = process.env.BRIDGE_TIMELOCK_ADDRESS;
  }
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

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

async function readKeylessEvmSolvency(
  evmRpcUrl: string,
  bridgeAddressHex: string,
  tokenAddressHex: string,
): Promise<Record<string, unknown> | null> {
  if (!evmRpcUrl) return null;
  // Probe eth_chainId first so ethers v6 never logs retry noise when Frontier RPC is offline.
  let chainIdHex: string;
  try {
    const probeRes = await fetch(evmRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(2_500),
    });
    if (!probeRes.ok) return null;
    const probeJson = (await probeRes.json()) as { result?: unknown };
    if (typeof probeJson.result !== 'string' || !/^0x[0-9a-f]+$/i.test(probeJson.result)) {
      return null;
    }
    chainIdHex = probeJson.result;
  } catch {
    return null;
  }

  const staticNet = new ethers.Network('frontier', BigInt(chainIdHex));
  const provider = new ethers.JsonRpcProvider(evmRpcUrl, staticNet, { staticNetwork: staticNet });
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const bridgeAddr = ethers.getAddress(`0x${bridgeAddressHex.replace(/^0x/i, '')}`);
    const sergAddr = ethers.getAddress(`0x${tokenAddressHex.replace(/^0x/i, '')}`);
    const serg = new ethers.Contract(sergAddr, loadSolidityArtifact('SERG').abi, provider);
    const bridge = new ethers.Contract(bridgeAddr, loadSolidityArtifact('ErgoBridge').abi, provider);
    const [blockNumber, totalSupply, escrowedFees, paused, owner] = await Promise.race([
      Promise.all([
        provider.getBlockNumber(),
        serg.totalSupply() as Promise<bigint>,
        bridge.bridgeSERGBalance() as Promise<bigint>,
        bridge.paused() as Promise<boolean>,
        bridge.owner() as Promise<string>,
      ]),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('EVM RPC timeout')), 4_000);
      }),
    ]);
    return {
      chainIdHex,
      blockNumber,
      sergTotalSupplyNano: totalSupply.toString(),
      escrowedFeesNano: escrowedFees.toString(),
      paused,
      owner,
    };
  } catch {
    return null;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    provider.destroy();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const configPath = getArg(args, '--config');

  if (!cmd || cmd === '--help' || cmd === '-h' || !configPath) {
    console.log(`Ergo <-> Frontier Sidechain Bridge V1 CLI

Usage:
  cli.ts status --config <config.json>
  cli.ts reconstruct --config <config.json>
  cli.ts ui --config <config.json> [--host 127.0.0.1] [--port 3000]
  cli.ts signer-node --config <config.json> [--host 127.0.0.1] [--port 7101] [--health-port 7201] [--allow-unverified-admit-unsafe]
  cli.ts deposit --config <config.json> --amount <nanoErg> --evm-recipient <0x...>
  cli.ts refund --config <config.json> --box-id <depositBoxIdHex>
  cli.ts pegout --config <config.json> --amount <grossNanoErg> --ergo-recipient <addressOrPubKey>
  cli.ts daemon --config <config.json> [--once]
  cli.ts rent-refresh --config <config.json> --target <reserve|dup|tracker> [--top-up <nanoErg>]
  cli.ts propose-rotate --config <config.json> --next-pubkeys <pk1,pk2,...> --next-threshold <t>
  cli.ts propose-graduate-stark --config <config.json> --stark-contract-id <hex32> --trust-anchor <hex32>
  cli.ts cancel-upgrade --config <config.json>
  cli.ts execute-upgrade --config <config.json> --target-ergotree <hex>

Required env vars for signing/broadcast commands:
  BRIDGE_FEE_PAYER_SECRET_HEX    (relayer / governance fee payer)
  BRIDGE_COMMITTEE_SECRETS_HEX   (local single-host daemon/governance; omit when using BRIDGE_REMOTE_SIGNERS_JSON)
  BRIDGE_REMOTE_SIGNERS_JSON     (multi-host daemon/governance: JSON array of {id,url,pubKeyHex,authSecret,tls?})
  BRIDGE_SIGNER_SECRET_HEX       (isolated signer-node single key)
  BRIDGE_SIGNER_AUTH_SECRET      (isolated signer-node HMAC secret >= 16 chars)
  BRIDGE_SIGNER_TLS_KEY/CERT/CA  (optional TLS/mTLS files for signer-node)
  BRIDGE_SIGNER_HEALTH_PORT      (optional loopback HTTP port for /health & /metrics under mTLS)
  BRIDGE_USER_SECRET_HEX         (user deposit / refund commands)
  BRIDGE_EVM_USER_KEY            (user pegout command on Frontier EVM)
  BRIDGE_EVM_RELAYER_KEY         (0x-prefixed EVM private key for daemon)
  BRIDGE_EVM_RPC_URL             (optional override for config.evmRpcUrl)
  BRIDGE_DB_PATH                 (optional override for config.dbPath)
  BRIDGE_TIMELOCK_ADDRESS        (optional BridgeCommitteeTimelock owner address)
  BRIDGE_BROADCAST_ENABLED=true  (explicit opt-in; defaults to dry-run check only)`);
    process.exit(!cmd || cmd === '--help' || cmd === '-h' ? 0 : 1);
  }

  const { raw, familyParams } = loadConfig(configPath);
  const family = compileBridgeV1Family(familyParams);
  const epochDirectory = buildEpochDirectory(raw, family);
  const ergo = new StockErgoNodeClient({
    baseUrl: raw.ergoNodeUrl,
    apiKey: raw.ergoApiKey,
  });

  if (cmd === 'status') {
    const [info, indexed, reserveBox, dupBox, trackerBox, evmReadOnly] = await Promise.all([
      ergo.getInfo(),
      ergo.getIndexedHeight(),
      ergo.getLiveSingletonBox(family.params.reserveNftIdHex),
      ergo.getLiveSingletonBox(family.params.dupNftIdHex),
      ergo.getLiveSingletonBox(family.params.trackerNftIdHex),
      readKeylessEvmSolvency(
        raw.evmRpcUrl,
        family.params.bridgeAddressHex,
        family.params.tokenAddressHex,
      ),
    ]);
    const liability = readLiveReserveLiability(reserveBox);
    const reserveErg = BigInt(reserveBox.value);
    const r9Raw = decodeSigmaCollByteHex(trackerBox.additionalRegisters.R9);
    const trackerGov = r9Raw.length === 81 ? decodeTrackerGovernanceR9(r9Raw) : null;
    const statusObj: Record<string, unknown> = {
      familyId: family.familyIdHex,
      ergo: {
        fullHeight: info.fullHeight,
        indexedHeight: indexed.indexedHeight,
        reserve: {
          boxId: reserveBox.boxId,
          ergNano: reserveErg.toString(),
          liabilityNano: liability.toString(),
          bufferNano: (reserveErg - liability).toString(),
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
    if (evmReadOnly) {
      const supply = BigInt(String(evmReadOnly.sergTotalSupplyNano));
      statusObj.evm = {
        ...evmReadOnly,
        solvencyOk: supply <= liability && liability <= reserveErg,
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

  if (cmd === 'ui') {
    const host = getArg(args, '--host') ?? '127.0.0.1';
    const port = parsePort(getArg(args, '--port'), 3000);
    const web = new BridgeWebServer({
      family,
      ergo,
      evmRpcUrl: raw.evmRpcUrl,
      configFileLabel: path.basename(configPath),
      host,
      port,
      logger: (m) => console.log(`[ui] ${m}`),
    });
    const url = await web.start();
    console.log(`Bridge Web Console ready at ${url}`);
    const shutdown = () => {
      void web.stop().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  if (cmd === 'signer-node') {
    const memberSecretHex = requireEnv('BRIDGE_SIGNER_SECRET_HEX');
    const authSecret = requireEnv('BRIDGE_SIGNER_AUTH_SECRET');
    const host = getArg(args, '--host') ?? '127.0.0.1';
    const port = parsePort(getArg(args, '--port'), 7101);
    const rawHealthPort = getArg(args, '--health-port') ?? process.env.BRIDGE_SIGNER_HEALTH_PORT;
    const healthPort = rawHealthPort ? parsePort(rawHealthPort, 7201) : undefined;
    const allowUnverifiedAdmitUnsafe = args.includes('--allow-unverified-admit-unsafe');

    // Fail closed on partial TLS env configuration ([H-3])
    const tlsKeyPath = process.env.BRIDGE_SIGNER_TLS_KEY;
    const tlsCertPath = process.env.BRIDGE_SIGNER_TLS_CERT;
    const tlsCaPath = process.env.BRIDGE_SIGNER_TLS_CA;
    const anyTlsSet = Boolean(tlsKeyPath || tlsCertPath || tlsCaPath);
    if (anyTlsSet && (!tlsKeyPath || !tlsCertPath)) {
      throw new Error(
        'Partial TLS configuration detected: both BRIDGE_SIGNER_TLS_KEY and BRIDGE_SIGNER_TLS_CERT are required when enabling TLS/mTLS',
      );
    }
    const tls =
      tlsKeyPath && tlsCertPath
        ? {
            keyPem: fs.readFileSync(tlsKeyPath),
            certPem: fs.readFileSync(tlsCertPath),
            caPem: tlsCaPath ? fs.readFileSync(tlsCaPath) : undefined,
            requireClientCert: Boolean(tlsCaPath),
          }
        : undefined;
    if (!tls && !isLoopbackHost(host) && process.env.BRIDGE_ALLOW_INSECURE_HTTP !== 'true') {
      throw new Error(
        `Refusing to bind plaintext HTTP signer-node on non-loopback host ${host} without TLS/mTLS (set BRIDGE_SIGNER_TLS_KEY/CERT or BRIDGE_ALLOW_INSECURE_HTTP=true for isolated private overlay networks)`,
      );
    }

    // Resolve active epoch Tracker ErgoTree & keySetDigest from live chain or config ([H-2])
    let activeTrackerErgoTreeHex = family.tracker.ergoTreeHex;
    let activeKeySetDigestHex = family.ergoKeySetDigestHex;
    try {
      const liveTracker = await ergo.getLiveSingletonBox(family.params.trackerNftIdHex);
      const r9Raw = decodeSigmaCollByteHex(liveTracker.additionalRegisters.R9);
      if (r9Raw.length === 81) {
        const liveGov = decodeTrackerGovernanceR9(r9Raw);
        if (liveGov.epoch !== family.params.committeeEpoch) {
          const epCfg = epochDirectory.get(liveGov.epoch);
          if (!epCfg) {
            throw new Error(`Active on-chain epoch ${liveGov.epoch} missing from config.epochs`);
          }
          const rotated = compileRotatedTracker(family, {
            pubKeysHex: epCfg.pubKeysHex,
            threshold: epCfg.threshold,
            epoch: epCfg.epoch,
          });
          activeTrackerErgoTreeHex = rotated.tracker.ergoTreeHex;
          activeKeySetDigestHex = rotated.ergoKeySetDigestHex;
        }
      }
    } catch (err) {
      // Allow booting before genesis deploy using genesis family epoch, but fail on epoch mismatch error
      if (err instanceof Error && err.message.includes('config.epochs')) throw err;
    }

    // Wire independent Frontier EVM RPC checkpoint verifier ([C-1])
    if (!raw.evmRpcUrl && !allowUnverifiedAdmitUnsafe) {
      throw new Error(
        'signer-node requires evmRpcUrl (or BRIDGE_EVM_RPC_URL) for independent Frontier burn root verification',
      );
    }
    const checkpointVerifier = raw.evmRpcUrl
      ? createFrontierCheckpointVerifier({
          evmRpcUrl: raw.evmRpcUrl,
          bridgeAddressHex: family.params.bridgeAddressHex,
          sidechainIdHex: family.params.sidechainIdHex,
          evmBurnConfirmations: raw.evmBurnConfirmations ?? 2,
        })
      : undefined;

    const signerServer = new CommitteeSignerServer({
      memberSecretHex,
      networkPrefix: family.params.networkPrefix,
      authSecret,
      host,
      port,
      healthPort,
      tls,
      policy: {
        trackerNftIdHex: family.params.trackerNftIdHex,
        familyIdHex: family.familyIdHex,
        sourceNetworkIdHex: family.params.sourceNetworkIdHex,
        sidechainIdHex: family.params.sidechainIdHex,
        ergoKeySetDigestHex: activeKeySetDigestHex,
        expectedTrackerErgoTreeHex: activeTrackerErgoTreeHex,
        minUpgradeTimelockBlocks: family.params.upgradeTimelockBlocks,
        maxAdmissionLagBlocks: family.params.maxAdmissionLagBlocks,
        forbiddenExtraNftIdsHex: [family.params.dupNftIdHex, family.params.reserveNftIdHex],
        checkpointVerifier,
        allowUnverifiedAdmitForTesting: allowUnverifiedAdmitUnsafe,
        ergoHeightProvider: async () => (await ergo.getInfo()).fullHeight,
        allowGovernancePropose: false,
        allowGovernanceCancel: false,
      },
      logger: (m) => console.log(`[signer-node] ${m}`),
    });
    const url = await signerServer.start();
    console.log(
      JSON.stringify(
        {
          ok: true,
          url,
          healthUrl: signerServer.healthUrl,
          pubKeyHex: signerServer.pubKeyHex,
          tls: Boolean(tls),
          mtls: Boolean(tls?.requireClientCert),
          independentFrontierVerifier: Boolean(checkpointVerifier),
        },
        null,
        2,
      ),
    );
    const shutdown = () => {
      void signerServer.stop().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  if (cmd === 'deposit') {
    const amountStr = getArg(args, '--amount');
    const evmRecipient = getArg(args, '--evm-recipient');
    if (!amountStr || !evmRecipient) {
      throw new Error('--amount <nanoErg> and --evm-recipient <0x...> are required');
    }
    const amountNanoErg = parseStrictUnsignedBigInt(amountStr, '--amount');
    if (amountNanoErg < family.params.minDepositNanoErg) {
      throw new Error(
        `Deposit amount ${amountNanoErg} is below family minimum ${family.params.minDepositNanoErg} nanoERG`,
      );
    }
    const userSecret = requireEnv('BRIDGE_USER_SECRET_HEX');
    const userKey = deriveKeyPairFromSecretHex(userSecret, family.params.networkPrefix);
    const [info, headers, utxos] = await Promise.all([
      ergo.getInfo(),
      ergo.getLastHeaders(10),
      ergo.getUnspentBoxesByAddress(userKey.address),
    ]);
    const fundingBox = pickCliFeeBox(utxos, amountNanoErg + DEFAULT_MINER_FEE);
    const built = buildDepositLockTx({
      family,
      depositorFundingBox: fundingBox,
      depositorErgoTreeHex: userKey.p2pkErgoTreeHex,
      evmRecipientHex: evmRecipient,
      amountNanoErg,
      creationHeight: info.fullHeight,
    });
    const signed = signTransaction({
      ...built,
      secretKeysHex: [userSecret],
      height: info.fullHeight,
      lastHeaders: headers,
    });
    await ergo.checkTransaction(signed.signedTxJson);
    const broadcasted = process.env.BRIDGE_BROADCAST_ENABLED === 'true';
    const txId = broadcasted ? await ergo.submitTransaction(signed.signedTxJson) : signed.txId;
    console.log(
      JSON.stringify(
        { cmd: 'deposit', broadcasted, txId, amountNanoErg: amountNanoErg.toString(), evmRecipient },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'refund') {
    const boxId = getArg(args, '--box-id');
    if (!boxId) throw new Error('--box-id <depositBoxIdHex> is required');
    const feeSecret = process.env.BRIDGE_USER_SECRET_HEX ?? requireEnv('BRIDGE_FEE_PAYER_SECRET_HEX');
    const feeKey = deriveKeyPairFromSecretHex(feeSecret, family.params.networkPrefix);
    const [info, headers, depBox, utxos] = await Promise.all([
      ergo.getInfo(),
      ergo.getLastHeaders(10),
      ergo.getBoxById(boxId),
      ergo.getUnspentBoxesByAddress(feeKey.address),
    ]);
    // Verify unspent & escape timeout elapsed, and decode original R5 depositor tree ([M-7])
    if (depBox.spentTransactionId !== null) {
      throw new Error(`DepositLock box ${boxId} is already spent in tx ${depBox.spentTransactionId}`);
    }
    const unlockHeight = depBox.creationHeight + family.params.escapeTimeoutBlocks;
    if (info.fullHeight < unlockHeight) {
      throw new Error(
        `Escape-hatch refund not yet unlocked: current height ${info.fullHeight} < ${unlockHeight}`,
      );
    }
    const r5Hex = depBox.additionalRegisters?.R5;
    if (!r5Hex) throw new Error(`DepositLock box ${boxId} missing R5 depositor ErgoTree`);
    const depositorErgoTreeHex = bytesToHex(decodeSigmaCollByteHex(r5Hex));
    const feeBox = pickCliFeeBox(utxos, DEFAULT_MINER_FEE);
    const built = buildRefundDepositTx({
      depositLockBox: depBox,
      depositorErgoTreeHex,
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
    console.log(JSON.stringify({ cmd: 'refund', broadcasted, txId, sourceBoxId: boxId }, null, 2));
    return;
  }

  if (cmd === 'pegout') {
    const amountStr = getArg(args, '--amount');
    const recipient = getArg(args, '--ergo-recipient');
    if (!amountStr || !recipient) {
      throw new Error('--amount <grossNanoErg> and --ergo-recipient <addressOrPubKey> are required');
    }
    const grossAmountNanoErg = parseStrictUnsignedBigInt(amountStr, '--amount');
    if (grossAmountNanoErg < 15_000_000n) {
      throw new Error('Gross peg-out amount must be >= 15000000 nanoERG (0.015 sERG)');
    }
    const parsedRecipient = parseErgoP2pkRecipient(recipient, family.params.networkPrefix);
    const userEvmKey = requireEnv('BRIDGE_EVM_USER_KEY');
    const evm = new FrontierEvmClient({
      rpcUrl: raw.evmRpcUrl,
      relayerPrivateKey: userEvmKey,
      bridgeAddress: `0x${family.params.bridgeAddressHex}`,
      sergAddress: `0x${family.params.tokenAddressHex}`,
    });
    const broadcasted = process.env.BRIDGE_BROADCAST_ENABLED === 'true';
    if (!broadcasted) {
      // Dry-run validation without spending gas or burning sERG ([H-10])
      const bal = (await evm.sergContract.balanceOf(evm.relayerWallet.address)) as bigint;
      const paused = (await evm.bridgeContract.paused()) as boolean;
      console.log(
        JSON.stringify(
          {
            cmd: 'pegout',
            broadcasted: false,
            dryRunOk: !paused && bal >= grossAmountNanoErg,
            paused,
            userSergBalanceNano: bal.toString(),
            grossAmountNanoErg: grossAmountNanoErg.toString(),
            netErgoUnlockNanoErg: (grossAmountNanoErg - 5_000_000n).toString(),
            ergoRecipientAddress: parsedRecipient.address,
            ergoRecipientPubKeyHex: parsedRecipient.pubKeyHex,
          },
          null,
          2,
        ),
      );
      return;
    }

    const receipt = await evm.userPegOut({
      userPrivateKey: userEvmKey,
      grossAmountNanoErg,
      recipientPubKeyOrErgoTreeHex: parsedRecipient.pubKeyHex,
    });
    console.log(
      JSON.stringify(
        {
          cmd: 'pegout',
          broadcasted: true,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          grossAmountNanoErg: grossAmountNanoErg.toString(),
          netErgoUnlockNanoErg: (grossAmountNanoErg - 5_000_000n).toString(),
          ergoRecipientAddress: parsedRecipient.address,
          ergoRecipientPubKeyHex: parsedRecipient.pubKeyHex,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'daemon') {
    const feePayerSecretHex = requireEnv('BRIDGE_FEE_PAYER_SECRET_HEX');
    const remoteSignersJson = process.env.BRIDGE_REMOTE_SIGNERS_JSON;
    const remoteSigners = remoteSignersJson
      ? (JSON.parse(remoteSignersJson) as RemoteCommitteeSignerEndpoint[])
      : undefined;
    const committeeSecrets = remoteSigners
      ? undefined
      : requireEnv('BRIDGE_COMMITTEE_SECRETS_HEX')
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
      timelockAddress: raw.timelockAddressHex
        ? `0x${raw.timelockAddressHex.replace(/^0x/i, '')}`
        : undefined,
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
        remoteSigners,
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

    // Safe shutdown: stop loop first, close DB ONLY after in-flight tick completes ([M-7])
    const stopLoop = () => daemon.stop();
    process.on('SIGINT', stopLoop);
    process.on('SIGTERM', stopLoop);

    try {
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
        return;
      }
      await daemon.start();
    } finally {
      db.close();
    }
    return;
  }

  if (cmd === 'rent-refresh') {
    const target = getArg(args, '--target');
    if (target !== 'reserve' && target !== 'dup' && target !== 'tracker') {
      throw new Error('--target must be reserve, dup, or tracker');
    }
    const topUp = parseStrictUnsignedBigInt(getArg(args, '--top-up') ?? '0', '--top-up');
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

  if (cmd === 'propose-rotate' || cmd === 'propose-graduate-stark' || cmd === 'cancel-upgrade') {
    const feeSecret = requireEnv('BRIDGE_FEE_PAYER_SECRET_HEX');
    const remoteSignersJson = process.env.BRIDGE_REMOTE_SIGNERS_JSON;
    const remoteSigners = remoteSignersJson
      ? (JSON.parse(remoteSignersJson) as RemoteCommitteeSignerEndpoint[])
      : undefined;
    const committeeSecrets = remoteSigners
      ? undefined
      : requireEnv('BRIDGE_COMMITTEE_SECRETS_HEX')
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
    const feeBox = pickCliFeeBox(utxos, DEFAULT_MINER_FEE);

    let extraInfo: Record<string, unknown> = {};
    let builtTx: {
      unsignedTx: ReturnType<typeof buildTrackerCancelUpgradeTx>['unsignedTx'];
      inputBoxes: ReturnType<typeof buildTrackerCancelUpgradeTx>['inputBoxes'];
    };

    if (cmd === 'cancel-upgrade') {
      const cancelled = buildTrackerCancelUpgradeTx({
        family,
        trackerBox,
        currentEpoch: gov.epoch,
        feeInBox: feeBox,
        changeErgoTreeHex: feeKey.p2pkErgoTreeHex,
        creationHeight: info.fullHeight,
      });
      builtTx = cancelled;
    } else {
      let mode: 1 | 2;
      let targetHashHex: string;
      let trustAnchorHex: string;
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
      const proposed = buildTrackerProposeUpgradeTx({
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
      builtTx = proposed;
      extraInfo.activatesAtHeight = proposed.activatesAtHeight.toString();
    }

    const signed =
      remoteSigners && remoteSigners.length >= activeEpoch.threshold
        ? await executeRemoteCommitteeCeremony({
            ...builtTx,
            allCommitteePubKeysHex: activeEpoch.pubKeysHex,
            threshold: activeEpoch.threshold,
            remoteSigners,
            feePayerSecretHex: feeSecret,
            height: info.fullHeight,
            lastHeaders: headers,
          })
        : signTransactionDistributedCommittee({
            ...builtTx,
            committeeMemberSecretsHex: committeeSecrets ?? [],
            allCommitteePubKeysHex: activeEpoch.pubKeysHex,
            threshold: activeEpoch.threshold,
            feePayerSecretHex: feeSecret,
            height: info.fullHeight,
            lastHeaders: headers,
          });

    await ergo.checkTransaction(signed.signedTxJson);
    const broadcasted = process.env.BRIDGE_BROADCAST_ENABLED === 'true';
    const txId = broadcasted ? await ergo.submitTransaction(signed.signedTxJson) : signed.txId;
    console.log(JSON.stringify({ cmd, broadcasted, txId, ...extraInfo }, null, 2));
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
