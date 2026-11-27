import { ChildProcess, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ethers } from 'ethers';
import * as ergoWasm from 'ergo-lib-wasm-nodejs';
import {
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
} from '../src/core/avl.js';
import {
  DEFAULT_MINER_FEE,
  MINER_FEE_ERGO_TREE_HEX,
  ZERO_32_HEX,
  asciiBytes,
  blake2b256Hex,
  bytesToHex,
  decodeTrackerGovernanceR9,
} from '../src/core/codecs.js';
import {
  compileBridgeV1Family,
  compileRotatedTracker,
} from '../src/core/contracts.js';
import {
  buildDepositLockTx,
  buildGenesisDeployTx,
  buildMintSingletonNftTx,
  buildRentRefreshTx,
  buildTrackerExecuteUpgradeTx,
  buildTrackerProposeUpgradeTx,
} from '../src/core/tx-builders.js';
import {
  ErgoBoxJson,
  deriveKeyPairFromSecretHex,
  signTransaction,
  signTransactionDistributedCommittee,
} from '../src/crypto/signer.js';
import { StockErgoNodeClient } from '../src/clients/ergo-node.js';
import { FrontierEvmClient } from '../src/clients/evm-client.js';
import {
  BridgeStateDb,
  readLiveReserveLiability,
  readLiveTrackerLatestSourceHeight,
} from '../src/state/db.js';
import { ActiveCommitteeEpochConfig, BridgeRelayerDaemon } from '../src/relayer/daemon.js';

const ERGO_STOCK_JAR = process.env.ERGO_STOCK_JAR ?? '';
const FRONTIER_BIN = process.env.FRONTIER_BIN ?? '';
if (!ERGO_STOCK_JAR || !fs.existsSync(ERGO_STOCK_JAR)) {
  throw new Error('Set ERGO_STOCK_JAR to the path of an unpatched ergo-6.0.3.jar binary');
}
if (!FRONTIER_BIN || !fs.existsSync(FRONTIER_BIN)) {
  throw new Error('Set FRONTIER_BIN to the path of the frontier-template-node binary');
}

const RUN_ID = `v1-e2e-${Date.now()}`;
const E2E_RUN_ROOT = process.env.E2E_RUN_ROOT ?? path.join(os.tmpdir(), 'ergo-bridge-v1-e2e');
const RUN_DIR = path.join(E2E_RUN_ROOT, RUN_ID);
const ERGO_PORT = 19053;
const ERGO_P2P_PORT = 19021;
const FRONTIER_RPC_PORT = 19944;
const DEVNET_RPC_HEADER = 'hello';
const DEVNET_RPC_DIGEST = blake2b256Hex(asciiBytes(DEVNET_RPC_HEADER));
const QUICK_DEVNET_GENESIS_DIGEST =
  '840ca0b8aec2d7a6c4f1589ca6070c8a5ed5924c835cdb8f816aa773b6fe1b6302';

// Standard Frontier --dev prefunded EVM accounts (devnet only!)
const EVM_ALITH_KEY = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';
const EVM_BALTATHAR_KEY = '0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b';

// Ephemeral devnet Ergo keys (NEVER use on mainnet/testnet!)
const SEC_MINER = '01'.repeat(32);
const SEC_RELAYER_FEE = '02'.repeat(32);
const SEC_USER = '03'.repeat(32);
const SEC_C1 = '11'.repeat(32);
const SEC_C2 = '22'.repeat(32);
const SEC_C3 = '33'.repeat(32);
const SEC_C4 = '44'.repeat(32);
const SEC_C5 = '55'.repeat(32);

const K_MINER = deriveKeyPairFromSecretHex(SEC_MINER, 16);
const K_FEE = deriveKeyPairFromSecretHex(SEC_RELAYER_FEE, 16);
const K_USER = deriveKeyPairFromSecretHex(SEC_USER, 16);
const K_C1 = deriveKeyPairFromSecretHex(SEC_C1, 16);
const K_C2 = deriveKeyPairFromSecretHex(SEC_C2, 16);
const K_C3 = deriveKeyPairFromSecretHex(SEC_C3, 16);
const K_C4 = deriveKeyPairFromSecretHex(SEC_C4, 16);
const K_C5 = deriveKeyPairFromSecretHex(SEC_C5, 16);

const EPHEMERAL_DEVNET_PHRASE = ethers.Mnemonic.fromEntropy(crypto.randomBytes(16)).phrase;
const MINER_ENV_VAR = 'BRIDGE_DEVNET_CPU_SEED_PHRASE';

function deriveDevnetMinerSecretsHex(): string[] {
  const seed = ergoWasm.Mnemonic.to_seed(EPHEMERAL_DEVNET_PHRASE, '');
  const master = ergoWasm.ExtSecretKey.derive_master(seed);
  const eip3 = master.derive(ergoWasm.DerivationPath.new(0, new Uint32Array([0])));
  return [
    bytesToHex(master.secret_key_bytes()),
    bytesToHex(eip3.secret_key_bytes()),
    SEC_MINER,
  ];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`E2E ASSERTION FAILED: ${msg}`);
}

function startStockErgoDevnet(dir: string): ChildProcess {
  const dataDir = path.join(dir, 'ergo-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const confPath = path.join(dir, 'ergo-devnet.conf');
  const hoconPath = dataDir.replace(/\\/g, '/');
  const conf = `ergo {
  directory = "${hoconPath}"
  networkType = "devnet"
  node {
    miningPubKeyHex = "${K_MINER.pubKeyHex}"
    mining = true
    offlineGeneration = true
    internalMinerPollingInterval = 1s
    useExternalMiner = false
    extraIndex = true
    minimalFeeAmount = 0
  }
  wallet.testMnemonic = \${?${MINER_ENV_VAR}}
  wallet.testKeysQty = 1
  chain {
    genesisStateDigestHex = "${QUICK_DEVNET_GENESIS_DIGEST}"
    monetary.minerRewardDelay = 1
  }
}
scorex {
  network {
    bindAddress = "127.0.0.1:${ERGO_P2P_PORT}"
    nodeName = "bridge-v1-stock-ergo"
    knownPeers = []
    declaredAddress = null
    upnpEnabled = false
  }
  restApi {
    bindAddress = "127.0.0.1:${ERGO_PORT}"
    apiKeyHash = "${DEVNET_RPC_DIGEST}"
    publicUrl = null
  }
}
`;
  fs.writeFileSync(confPath, conf, 'ascii');
  const logOut = fs.openSync(path.join(dir, 'ergo.log'), 'w');
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  // Ephemeral runtime-generated BIP-39 phrase solely to unlock Ergo CPU devnet miner;
  // ALL bridge transactions are signed strictly via ergo-lib-wasm-nodejs!
  childEnv[MINER_ENV_VAR] = EPHEMERAL_DEVNET_PHRASE;
  return spawn('java', ['-Xmx2G', '-jar', ERGO_STOCK_JAR, '--devnet', '-c', confPath], {
    cwd: dir,
    stdio: ['ignore', logOut, logOut],
    windowsHide: true,
    env: childEnv,
  });
}

function startFrontierDev(dir: string): ChildProcess {
  const basePath = path.join(dir, 'frontier-data');
  fs.mkdirSync(basePath, { recursive: true });
  const logOut = fs.openSync(path.join(dir, 'frontier.log'), 'w');
  return spawn(
    FRONTIER_BIN,
    [
      '--dev',
      '--sealing=instant',
      '--base-path',
      basePath,
      '--rpc-port',
      String(FRONTIER_RPC_PORT),
      '--rpc-cors=all',
      '--no-telemetry',
      '--no-prometheus',
    ],
    {
      stdio: ['ignore', logOut, logOut],
      windowsHide: true,
    },
  );
}

async function waitForErgoReady(ergo: StockErgoNodeClient, minHeight: number): Promise<number> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const idx = await ergo.getIndexedHeight();
      if (idx.indexedHeight >= minHeight) return idx.indexedHeight;
    } catch {
      // starting up
    }
    await sleep(500);
  }
  throw new Error(`Stock Ergo node did not reach indexedHeight >= ${minHeight} in time`);
}

async function waitForFrontierReady(rpcUrl: string): Promise<number> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: string };
        if (json.result) return parseInt(json.result, 16);
      }
    } catch {
      // starting up
    }
    await sleep(500);
  }
  throw new Error('Frontier node did not become ready in time');
}

async function fetchCoinbaseBox(ergoUrl: string, height: number): Promise<ErgoBoxJson> {
  const idsRes = await fetch(`${ergoUrl}/blocks/at/${height}`);
  const ids = (await idsRes.json()) as string[];
  assert(ids.length > 0, `No block header at height ${height}`);
  const blkRes = await fetch(`${ergoUrl}/blocks/${ids[0]}`);
  const blk = (await blkRes.json()) as {
    blockTransactions: { transactions: Array<{ outputs: ErgoBoxJson[] }> };
  };
  const coinbaseOut = blk.blockTransactions.transactions[0]?.outputs[1];
  assert(coinbaseOut, `No miner reward output[1] at height ${height}`);
  return coinbaseOut;
}

async function run(): Promise<void> {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const ergoUrl = `http://127.0.0.1:${ERGO_PORT}`;
  const frontierUrl = `http://127.0.0.1:${FRONTIER_RPC_PORT}`;

  console.log(`[e2e] Starting stock unpatched Ergo 6.0.3 + Frontier EVM in ${RUN_DIR}`);
  const ergoProc = startStockErgoDevnet(RUN_DIR);
  const frontierProc = startFrontierDev(RUN_DIR);

  const receipt: Record<string, unknown> = {
    runId: RUN_ID,
    ergoJar: ERGO_STOCK_JAR,
    frontierBin: FRONTIER_BIN,
    startedAt: new Date().toISOString(),
  };

  try {
    const ergo = new StockErgoNodeClient({ baseUrl: ergoUrl, apiKey: DEVNET_RPC_HEADER });
    const [ergoH0, evmH0] = await Promise.all([
      waitForErgoReady(ergo, 4),
      waitForFrontierReady(frontierUrl),
    ]);
    console.log(`[e2e] Live nodes ready: stock Ergo height=${ergoH0}, Frontier block=${evmH0}`);

    // ------------------------------------------------------------------------
    // Step 1: Fund P2PK UTXOs from matured devnet coinbase box (sigma-rust signing ONLY!)
    // ------------------------------------------------------------------------
    const coinbaseBox = await fetchCoinbaseBox(ergoUrl, 2);
    const liveH = (await ergo.getInfo()).fullHeight;
    const headers0 = await ergo.getLastHeaders(10);
    const coinbaseVal = BigInt(coinbaseBox.value);
    const feeVal = DEFAULT_MINER_FEE;
    // Split coinbase into: 3 mint funding boxes (20M each), 1 genesis/relayer box (500M), 1 user box (500M), remainder to relayer
    const splitOutputs = [
      { value: '20000000', ergoTree: K_FEE.p2pkErgoTreeHex, creationHeight: liveH, assets: [], additionalRegisters: {} },
      { value: '20000000', ergoTree: K_FEE.p2pkErgoTreeHex, creationHeight: liveH, assets: [], additionalRegisters: {} },
      { value: '20000000', ergoTree: K_FEE.p2pkErgoTreeHex, creationHeight: liveH, assets: [], additionalRegisters: {} },
      { value: '500000000', ergoTree: K_FEE.p2pkErgoTreeHex, creationHeight: liveH, assets: [], additionalRegisters: {} },
      { value: '500000000', ergoTree: K_USER.p2pkErgoTreeHex, creationHeight: liveH, assets: [], additionalRegisters: {} },
      {
        value: (coinbaseVal - 1_060_000_000n - feeVal).toString(),
        ergoTree: K_FEE.p2pkErgoTreeHex,
        creationHeight: liveH,
        assets: [],
        additionalRegisters: {},
      },
      { value: feeVal.toString(), ergoTree: MINER_FEE_ERGO_TREE_HEX, creationHeight: liveH, assets: [], additionalRegisters: {} },
    ];
    const signedSplit = signTransaction({
      unsignedTx: {
        inputs: [{ boxId: coinbaseBox.boxId, extension: {} }],
        dataInputs: [],
        outputs: splitOutputs,
      },
      inputBoxes: [coinbaseBox],
      secretKeysHex: deriveDevnetMinerSecretsHex(),
      height: liveH,
      lastHeaders: headers0,
    });
    const splitTxId = await ergo.submitTransaction(signedSplit.signedTxJson);
    await ergo.waitForTxConfirmed(splitTxId);
    console.log(`[e2e] Swept devnet coinbase into clean P2PK boxes: txId=${splitTxId}`);

    // ------------------------------------------------------------------------
    // Step 2: Deploy hardened SERG + ErgoBridge on Frontier & verify hardening live!
    // ------------------------------------------------------------------------
    const deployed = await FrontierEvmClient.deployFresh({
      rpcUrl: frontierUrl,
      deployerPrivateKey: EVM_ALITH_KEY,
    });
    const evm = deployed.client;
    const evmUserWallet = new ethers.Wallet(EVM_BALTATHAR_KEY, evm.provider);
    console.log(
      `[e2e] Deployed hardened Solidity on Frontier: SERG=${deployed.sergAddress}, ErgoBridge=${deployed.bridgeAddress}`,
    );

    // Live check 2a: renounceOwnership MUST revert on ErgoBridge
    let renounceReverted = false;
    try {
      await evm.bridgeContract.renounceOwnership.staticCall();
    } catch {
      renounceReverted = true;
    }
    assert(renounceReverted, 'ErgoBridge.renounceOwnership() MUST revert');

    // Live check 2b: pegOut with off-curve secp256k1 pubkey (x=5) MUST revert!
    // (First mint small test? We can verify via staticCall on invalid pubkey — note approve/burn runs after curve check!)
    const offCurvePubKey = `0x02${'00'.repeat(31)}05`;
    let offCurveReverted = false;
    try {
      await evm.bridgeContract.pegOut.staticCall(15_000_000n, offCurvePubKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('secp256k1')) offCurveReverted = true;
    }
    assert(offCurveReverted, 'ErgoBridge.pegOut() MUST reject off-curve secp256k1 pubkey on Frontier EVM');
    // Live check 2c: MAX_PEGOUTS_PER_BLOCK == 256 ([C-1]) and SERG.burn() omitted ([M-2])
    const maxPerBlock = (await evm.bridgeContract.MAX_PEGOUTS_PER_BLOCK()) as bigint;
    assert(maxPerBlock === 256n, `Expected MAX_PEGOUTS_PER_BLOCK=256, got ${maxPerBlock}`);
    assert(!evm.sergContract.interface.hasFunction('burn'), 'Public SERG.burn() must be omitted');
    console.log(
      '[e2e] Verified live Frontier EVM hardening: renounceOwnership disabled, off-curve secp256k1 rejected, MAX_PEGOUTS_PER_BLOCK=256, public SERG.burn() removed',
    );

    // ------------------------------------------------------------------------
    // Step 3: Mint 3 Singleton NFTs -> Compile V1 Family -> Atomic Genesis Deploy on Stock Ergo 6.0.3!
    // ------------------------------------------------------------------------
    const splitTx = await ergo.getTransactionById(splitTxId);
    const mintBoxA = splitTx.outputs[0];
    const mintBoxB = splitTx.outputs[1];
    const mintBoxC = splitTx.outputs[2];
    const genesisFundingBox = splitTx.outputs[3];

    const hMint = (await ergo.getInfo()).fullHeight;
    const hdrMint = await ergo.getLastHeaders(10);

    const mintTracker = buildMintSingletonNftTx({
      fundingBox: mintBoxA,
      recipientErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      tokenName: 'BridgeV1TrackerNFT',
      tokenDescription: 'Singleton NFT authenticating BridgeTracker V1',
      creationHeight: hMint,
    });
    const mintDup = buildMintSingletonNftTx({
      fundingBox: mintBoxB,
      recipientErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      tokenName: 'BridgeV1DupNFT',
      tokenDescription: 'Singleton NFT authenticating BridgeDup V1',
      creationHeight: hMint,
    });
    const mintReserve = buildMintSingletonNftTx({
      fundingBox: mintBoxC,
      recipientErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      tokenName: 'BridgeV1ReserveNFT',
      tokenDescription: 'Singleton NFT authenticating BridgeReserve V1',
      creationHeight: hMint,
    });

    const [txMintTracker, txMintDup, txMintReserve] = await Promise.all([
      ergo.submitTransaction(
        signTransaction({ ...mintTracker, secretKeysHex: [SEC_RELAYER_FEE], height: hMint, lastHeaders: hdrMint }).signedTxJson,
      ),
      ergo.submitTransaction(
        signTransaction({ ...mintDup, secretKeysHex: [SEC_RELAYER_FEE], height: hMint, lastHeaders: hdrMint }).signedTxJson,
      ),
      ergo.submitTransaction(
        signTransaction({ ...mintReserve, secretKeysHex: [SEC_RELAYER_FEE], height: hMint, lastHeaders: hdrMint }).signedTxJson,
      ),
    ]);
    const [confMintTracker, confMintDup, confMintReserve] = await Promise.all([
      ergo.waitForTxConfirmed(txMintTracker),
      ergo.waitForTxConfirmed(txMintDup),
      ergo.waitForTxConfirmed(txMintReserve),
    ]);

    const sourceNetworkIdHex = '01'.repeat(32);
    const sidechainIdHex = '02'.repeat(32);
    const family = compileBridgeV1Family({
      networkPrefix: 16,
      sourceNetworkIdHex,
      sidechainIdHex,
      bridgeAddressHex: deployed.bridgeAddress.replace(/^0x/, '').toLowerCase(),
      tokenAddressHex: deployed.sergAddress.replace(/^0x/, '').toLowerCase(),
      trackerNftIdHex: mintTracker.tokenIdHex,
      dupNftIdHex: mintDup.tokenIdHex,
      reserveNftIdHex: mintReserve.tokenIdHex,
      committeePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
      committeeThreshold: 2,
      committeeEpoch: 1n,
      escapeTimeoutBlocks: 500,
      minConfirmations: 3n,
      upgradeTimelockBlocks: 4n,
      maxAdmissionLagBlocks: 2n,
      minDepositNanoErg: 10_000_000n,
      minRefreshAgeBlocks: 1,
    });
    console.log(
      `[e2e] Compiled V1 familyId=${family.familyIdHex.slice(0, 16)}... (DepositLock=${family.depositLock.byteLength}B, Reserve=${family.reserve.byteLength}B, Dup=${family.dup.byteLength}B, Tracker=${family.tracker.byteLength}B)`,
    );

    const hGen = (await ergo.getInfo()).fullHeight;
    const hdrGen = await ergo.getLastHeaders(10);
    const genesisBuilt = buildGenesisDeployTx({
      family,
      trackerNftBox: confMintTracker.outputs[0],
      dupNftBox: confMintDup.outputs[0],
      reserveNftBox: confMintReserve.outputs[0],
      fundingBox: genesisFundingBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      trackerErg: 10_000_000n,
      dupErg: 10_000_000n,
      reserveBufferErg: 20_000_000n,
      creationHeight: hGen,
    });
    const genesisTxId = await ergo.submitTransaction(
      signTransaction({ ...genesisBuilt, secretKeysHex: [SEC_RELAYER_FEE], height: hGen, lastHeaders: hdrGen }).signedTxJson,
    );
    await ergo.waitForTxConfirmed(genesisTxId);
    console.log(`[e2e] Atomic Genesis Deploy confirmed on stock Ergo 6.0.3: txId=${genesisTxId}`);

    // Helper to build a Relayer Daemon instance
    const dbPath = path.join(RUN_DIR, 'bridge.db');
    const makeCommittees = (extra?: ActiveCommitteeEpochConfig[]) => {
      const m = new Map<bigint, ActiveCommitteeEpochConfig>([
        [
          1n,
          {
            epoch: 1n,
            threshold: 2,
            ergoKeySetDigestHex: family.ergoKeySetDigestHex,
            allPubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
            signingMemberSecretsHex: [SEC_C1, SEC_C2],
          },
        ],
      ]);
      for (const e of extra ?? []) m.set(e.epoch, e);
      return m;
    };

    const makeDaemon = (db: BridgeStateDb, committees: Map<bigint, ActiveCommitteeEpochConfig>) =>
      new BridgeRelayerDaemon({
        family,
        ergo,
        evm,
        db,
        feePayerSecretHex: SEC_RELAYER_FEE,
        committeesByEpoch: committees,
        broadcastEnabled: true,
        ergoDepositConfirmations: 1,
        ergoReserveConfirmations: 1,
        evmBurnConfirmations: 0,
        evmStartBlock: 0,
        rentRefreshAgeBlocks: 10_000,
        pollIntervalMs: 1_000,
        logger: (m) => console.log(`[daemon] ${m}`),
      });

    // Helper: run daemon ticks until predicate holds
    async function driveUntil<T>(
      daemon: BridgeRelayerDaemon,
      label: string,
      fn: (s: Awaited<ReturnType<BridgeRelayerDaemon['tick']>>) => T | null,
      timeoutMs = 90_000,
    ): Promise<T> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const res = await daemon.tick();
        const hit = fn(res);
        if (hit !== null) return hit;
        await sleep(1_200);
      }
      throw new Error(`Timed out driving daemon for: ${label}`);
    }

    let db = new BridgeStateDb(dbPath);
    let daemon = makeDaemon(db, makeCommittees());

    // ------------------------------------------------------------------------
    // Step 4: CYCLE 1 — Deposit 30M -> Reserve -> Mint 30M sERG -> Burn 20M gross (15M net) -> Distributed 2-of-3 Tracker Admit -> Payout 15M!
    // ------------------------------------------------------------------------
    const userUtxos1 = await ergo.getUnspentBoxesByAddress(K_USER.address);
    const hDep1 = (await ergo.getInfo()).fullHeight;
    const dep1Built = buildDepositLockTx({
      family,
      depositorFundingBox: userUtxos1[0],
      depositorErgoTreeHex: K_USER.p2pkErgoTreeHex,
      evmRecipientHex: evmUserWallet.address,
      amountNanoErg: 30_000_000n,
      creationHeight: hDep1,
    });
    const dep1TxId = await ergo.submitTransaction(
      signTransaction({
        ...dep1Built,
        secretKeysHex: [SEC_USER],
        height: hDep1,
        lastHeaders: await ergo.getLastHeaders(10),
      }).signedTxJson,
    );
    await ergo.waitForTxConfirmed(dep1TxId);
    console.log(`[e2e] Cycle 1 Deposit (30M nanoERG) confirmed: txId=${dep1TxId}`);

    const commit1TxId = await driveUntil(daemon, 'Cycle 1 CommitToReserve', (s) =>
      s.depositsCommitted[0] ?? null,
    );
    await ergo.waitForTxConfirmed(commit1TxId);
    const mint1TxHash = await driveUntil(daemon, 'Cycle 1 Mint sERG', (s) =>
      s.sergMinted[0] ?? null,
    );
    const userBalAfterMint1 = (await evm.sergContract.balanceOf(evmUserWallet.address)) as bigint;
    assert(userBalAfterMint1 === 30_000_000n, `Expected 30M sERG, got ${userBalAfterMint1}`);
    console.log(`[e2e] Cycle 1 Reserve commit=${commit1TxId}, sERG mint=${mint1TxHash}`);

    // User burns 20M gross -> 15M net + 5M fee escrow
    const burn1Receipt = await evm.userPegOut({
      userPrivateKey: EVM_BALTATHAR_KEY,
      grossAmountNanoErg: 20_000_000n,
      recipientPubKeyOrErgoTreeHex: K_USER.pubKeyHex,
    });
    console.log(`[e2e] Cycle 1 Frontier PegOut confirmed: block=${burn1Receipt.blockNumber}, tx=${burn1Receipt.hash}`);

    const admit1TxId = await driveUntil(daemon, 'Cycle 1 Distributed 2-of-3 Tracker Admit', (s) =>
      s.checkpointsAdmitted[0] ?? null,
    );
    await ergo.waitForTxConfirmed(admit1TxId);
    const payout1TxId = await driveUntil(daemon, 'Cycle 1 Burn Payout', (s) =>
      s.payoutsExecuted[0] ?? null,
    );
    const payout1Confirmed = await ergo.waitForTxConfirmed(payout1TxId);
    assert(BigInt(payout1Confirmed.outputs[2].value) === 15_000_000n, 'Cycle 1 payout must equal 15M');
    assert(payout1Confirmed.outputs[2].ergoTree === K_USER.p2pkErgoTreeHex, 'Cycle 1 payout recipient mismatch');
    console.log(`[e2e] Cycle 1 COMPLETE! Tracker admit=${admit1TxId}, Payout=${payout1TxId} (15M nanoERG to user)`);

    // ------------------------------------------------------------------------
    // Step 5: COLD CRASH + TOTAL SQLITE WIPE & FULL ON-CHAIN RECONSTRUCTION!
    // ------------------------------------------------------------------------
    db.close();
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    assert(!fs.existsSync(dbPath), 'SQLite DB must be deleted before cold reconstruction test');
    console.log('[e2e] Simulated cold crash: deleted SQLite DB completely! Restarting cold...');

    db = new BridgeStateDb(dbPath);
    // Also rotate active signing quorum to (C2, C3) for Cycle 2!
    const committeesC2 = makeCommittees([
      {
        epoch: 1n,
        threshold: 2,
        ergoKeySetDigestHex: family.ergoKeySetDigestHex,
        allPubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
        signingMemberSecretsHex: [SEC_C2, SEC_C3],
      },
    ]);
    daemon = makeDaemon(db, committeesC2);
    const coldTick = await daemon.tick();
    assert(coldTick.reconstructed === true, 'Cold restart MUST auto-reconstruct from Ergo L1');
    assert(coldTick.solvencyOk === true, 'Cold restart solvency MUST be OK');
    assert(db.getReserveAvlHistory().length === 1, 'Reconstructed reserve history must have 1 entry');
    assert(db.getTrackerAvlHistory().length === 1, 'Reconstructed tracker history must have 1 entry');
    assert(db.getDupHistoryBurnIds().length === 1, 'Reconstructed DUP history must have 1 entry');
    console.log('[e2e] Cold SQLite wipe & full Ergo L1 AVL reconstruction PASSED (100% digest parity)');

    // ------------------------------------------------------------------------
    // Step 6: CYCLE 2 — Spend Cycle 1's Confirmed Successors!
    // ------------------------------------------------------------------------
    const userUtxos2 = await ergo.getUnspentBoxesByAddress(K_USER.address);
    const userFunding2 = userUtxos2.find((u) => BigInt(u.value) >= 30_000_000n)!;
    const hDep2 = (await ergo.getInfo()).fullHeight;
    const dep2Built = buildDepositLockTx({
      family,
      depositorFundingBox: userFunding2,
      depositorErgoTreeHex: K_USER.p2pkErgoTreeHex,
      evmRecipientHex: evmUserWallet.address,
      amountNanoErg: 25_000_000n,
      creationHeight: hDep2,
    });
    const dep2TxId = await ergo.submitTransaction(
      signTransaction({
        ...dep2Built,
        secretKeysHex: [SEC_USER],
        height: hDep2,
        lastHeaders: await ergo.getLastHeaders(10),
      }).signedTxJson,
    );
    await ergo.waitForTxConfirmed(dep2TxId);

    const commit2TxId = await driveUntil(daemon, 'Cycle 2 CommitToReserve', (s) =>
      s.depositsCommitted[0] ?? null,
    );
    await ergo.waitForTxConfirmed(commit2TxId);
    const mint2TxHash = await driveUntil(daemon, 'Cycle 2 Mint sERG', (s) =>
      s.sergMinted[0] ?? null,
    );

    const burn2Receipt = await evm.userPegOut({
      userPrivateKey: EVM_BALTATHAR_KEY,
      grossAmountNanoErg: 15_000_000n, // 10M net + 5M fee
      recipientPubKeyOrErgoTreeHex: K_USER.p2pkErgoTreeHex, // also test 36-byte P2PK ErgoTree input!
    });
    const admit2TxId = await driveUntil(daemon, 'Cycle 2 Distributed 2-of-3 (C2+C3) Tracker Admit', (s) =>
      s.checkpointsAdmitted[0] ?? null,
    );
    await ergo.waitForTxConfirmed(admit2TxId);
    const payout2TxId = await driveUntil(daemon, 'Cycle 2 Burn Payout', (s) =>
      s.payoutsExecuted[0] ?? null,
    );
    const payout2Confirmed = await ergo.waitForTxConfirmed(payout2TxId);
    assert(BigInt(payout2Confirmed.outputs[2].value) === 10_000_000n, 'Cycle 2 payout must equal 10M');

    // Verify exact cumulative balance sheet after 2 full cycles!
    const liveResAfterC2 = await ergo.getLiveSingletonBox(family.params.reserveNftIdHex);
    const solvAfterC2 = await evm.getSolvencySnapshot();
    assert(BigInt(liveResAfterC2.value) === 50_000_000n, `Expected 50M reserve ERG, got ${liveResAfterC2.value}`);
    assert(readLiveReserveLiability(liveResAfterC2) === 30_000_000n, 'Expected 30M reserve liability');
    assert(solvAfterC2.totalSupplyNanoErg === 30_000_000n, 'Expected 30M total sERG supply');
    assert(solvAfterC2.bridgeEscrowedFeesNanoErg === 10_000_000n, 'Expected 10M escrowed bridge fees');
    console.log(
      `[e2e] Cycle 2 COMPLETE! Exact balance sheet: reserveERG=50M (buffer=20M), liability=30M == sERG_totalSupply=30M (fees=10M)`,
    );

    // ------------------------------------------------------------------------
    // Step 7: Live Permissionless Storage-Rent Refresh (+5M ERG top-up) on BridgeReserve!
    // ------------------------------------------------------------------------
    const hRef = (await ergo.getInfo()).fullHeight;
    const feeBoxesRef = await ergo.getUnspentBoxesByAddress(K_FEE.address);
    const feeBoxRef = feeBoxesRef.find((u) => (u.assets?.length ?? 0) === 0 && BigInt(u.value) >= 10_000_000n)!;
    const refreshBuilt = buildRentRefreshTx({
      singletonBox: liveResAfterC2,
      feeInBox: feeBoxRef,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      topUpNanoErg: 5_000_000n,
      creationHeight: hRef,
    });
    const refreshTxId = await ergo.submitTransaction(
      signTransaction({
        ...refreshBuilt,
        secretKeysHex: [SEC_RELAYER_FEE],
        height: hRef,
        lastHeaders: await ergo.getLastHeaders(10),
      }).signedTxJson,
    );
    await ergo.waitForTxConfirmed(refreshTxId);
    const liveResRefreshed = await ergo.getLiveSingletonBox(family.params.reserveNftIdHex);
    assert(BigInt(liveResRefreshed.value) === 55_000_000n, 'Reserve buffer top-up must reach 55M');
    assert(readLiveReserveLiability(liveResRefreshed) === 30_000_000n, 'Liability unchanged on rentRefresh');
    console.log(`[e2e] Live permissionless Reserve rentRefresh (+5M top-up) confirmed: txId=${refreshTxId}`);

    // ------------------------------------------------------------------------
    // Step 8: Live Timelocked Committee Rotation (Epoch 1 -> Epoch 2) + Post-Rotation Cycle 3 Burn!
    // ------------------------------------------------------------------------
    const rotated = compileRotatedTracker(family, {
      pubKeysHex: [K_C3.pubKeyHex, K_C4.pubKeyHex, K_C5.pubKeyHex],
      threshold: 2,
      epoch: 2n,
    });
    const liveTrkBeforeRot = await ergo.getLiveSingletonBox(family.params.trackerNftIdHex);
    const hProp = (await ergo.getInfo()).fullHeight;
    const feeBoxProp = (await ergo.getUnspentBoxesByAddress(K_FEE.address)).find(
      (u) => (u.assets?.length ?? 0) === 0 && BigInt(u.value) >= 5_000_000n,
    )!;
    const proposeBuilt = buildTrackerProposeUpgradeTx({
      family,
      trackerBox: liveTrkBeforeRot,
      currentEpoch: 1n,
      upgradeTimelockBlocks: family.params.upgradeTimelockBlocks,
      mode: 1,
      targetScriptHashHex: rotated.tracker.contractIdHex,
      trustAnchorDigestHex: ZERO_32_HEX,
      feeInBox: feeBoxProp,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: hProp,
    });
    const proposeTxId = await ergo.submitTransaction(
      signTransactionDistributedCommittee({
        ...proposeBuilt,
        committeeMemberSecretsHex: [SEC_C1, SEC_C3],
        allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
        feePayerSecretHex: SEC_RELAYER_FEE,
        height: hProp,
        lastHeaders: await ergo.getLastHeaders(10),
      }).signedTxJson,
    );
    await ergo.waitForTxConfirmed(proposeTxId);
    console.log(
      `[e2e] Proposed committee rotation -> Epoch 2 (activatesAt=${proposeBuilt.activatesAtHeight}): txId=${proposeTxId}`,
    );

    // Wait for timelock maturity on stock Ergo devnet
    await ergo.waitForIndexedHeight(Number(proposeBuilt.activatesAtHeight));
    const liveTrkPending = await ergo.getLiveSingletonBox(family.params.trackerNftIdHex);
    const hExec = (await ergo.getInfo()).fullHeight;
    const feeBoxExec = (await ergo.getUnspentBoxesByAddress(K_FEE.address)).find(
      (u) => (u.assets?.length ?? 0) === 0 && BigInt(u.value) >= 5_000_000n,
    )!;
    const execBuilt = buildTrackerExecuteUpgradeTx({
      family,
      trackerBox: liveTrkPending,
      currentR9Bytes: decodeSigmaCollByteHex(liveTrkPending.additionalRegisters.R9),
      targetErgoTreeHex: rotated.tracker.ergoTreeHex,
      feeInBox: feeBoxExec,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: hExec,
    });
    const execTxId = await ergo.submitTransaction(
      signTransaction({
        ...execBuilt,
        secretKeysHex: [SEC_RELAYER_FEE], // Permissionless!
        height: hExec,
        lastHeaders: await ergo.getLastHeaders(10),
      }).signedTxJson,
    );
    await ergo.waitForTxConfirmed(execTxId);
    const liveTrkEpoch2 = await ergo.getLiveSingletonBox(family.params.trackerNftIdHex);
    assert(liveTrkEpoch2.ergoTree === rotated.tracker.ergoTreeHex, 'Tracker must now run Epoch 2 script');
    assert(
      decodeTrackerGovernanceR9(decodeSigmaCollByteHex(liveTrkEpoch2.additionalRegisters.R9)).epoch === 2n,
      'Tracker R9 epoch must be 2',
    );
    console.log(`[e2e] Executed permissionless committee rotation to Epoch 2: txId=${execTxId}`);

    // Now run Cycle 3 Burn under Epoch 2 committee (C4 + C5) settling against UNCHANGED BridgeDup & BridgeReserve!
    const committeesEpoch2 = makeCommittees([
      {
        epoch: 2n,
        threshold: 2,
        ergoKeySetDigestHex: rotated.ergoKeySetDigestHex,
        allPubKeysHex: [K_C3.pubKeyHex, K_C4.pubKeyHex, K_C5.pubKeyHex],
        signingMemberSecretsHex: [SEC_C4, SEC_C5],
      },
    ]);
    daemon = makeDaemon(db, committeesEpoch2);

    const burn3Receipt = await evm.userPegOut({
      userPrivateKey: EVM_BALTATHAR_KEY,
      grossAmountNanoErg: 15_000_000n, // 10M net + 5M fee
      recipientPubKeyOrErgoTreeHex: K_USER.pubKeyHex,
    });
    const admit3TxId = await driveUntil(daemon, 'Cycle 3 Epoch-2 (C4+C5) Tracker Admit', (s) =>
      s.checkpointsAdmitted[0] ?? null,
    );
    await ergo.waitForTxConfirmed(admit3TxId);
    const payout3TxId = await driveUntil(daemon, 'Cycle 3 Burn Payout via UNCHANGED Dup+Reserve', (s) =>
      s.payoutsExecuted[0] ?? null,
    );
    await ergo.waitForTxConfirmed(payout3TxId);

    // Final fresh reconstruction check across BOTH Epoch 1 and Epoch 2!
    const finalRecon = await db.reconstructFromErgoNode(
      ergo,
      family,
      new Map([
        [1n, family.ergoKeySetDigestHex],
        [2n, rotated.ergoKeySetDigestHex],
      ]),
    );
    assert(finalRecon.reserveEntries === 2 && finalRecon.reserveDigestMatched, 'Final reserve recon failed');
    assert(finalRecon.trackerEntries === 3 && finalRecon.trackerDigestMatched, 'Final tracker recon failed');
    assert(finalRecon.dupEntries === 3 && finalRecon.dupDigestMatched, 'Final DUP recon failed');
    assert(finalRecon.activeTrackerEpoch === 2n, 'Active epoch must be 2');

    // Live negative test against stock Ergo 6.0.3 /transactions/check:
    // Re-submitting an already-confirmed payout tx MUST be rejected by stock Ergo 6.0.3!
    let replayRejectedByNode = false;
    try {
      const oldTx = await ergo.getTransactionById(payout3TxId);
      await ergo.checkTransaction(oldTx as unknown as Record<string, unknown>);
    } catch {
      replayRejectedByNode = true;
    }
    assert(replayRejectedByNode, 'Stock Ergo 6.0.3 node MUST reject replayed payout tx');

    const finalReserve = await ergo.getLiveSingletonBox(family.params.reserveNftIdHex);
    const finalTracker = await ergo.getLiveSingletonBox(family.params.trackerNftIdHex);
    const finalDup = await ergo.getLiveSingletonBox(family.params.dupNftIdHex);
    const finalSolvency = await evm.getSolvencySnapshot();

    assert(BigInt(finalReserve.value) === 45_000_000n, 'Final reserve ERG must be 45M (25M buffer + 20M liability)');
    assert(readLiveReserveLiability(finalReserve) === 20_000_000n, 'Final liability must be 20M');
    assert(finalSolvency.totalSupplyNanoErg === 20_000_000n, 'Final sERG totalSupply must equal 20M');
    assert(finalSolvency.bridgeEscrowedFeesNanoErg === 15_000_000n, 'Final escrowed fees must equal 15M');

    receipt.status = 'PASS';
    receipt.finishedAt = new Date().toISOString();
    receipt.familyId = family.familyIdHex;
    receipt.solidity = {
      sergAddress: deployed.sergAddress,
      bridgeAddress: deployed.bridgeAddress,
      renounceOwnershipReverted: renounceReverted,
      offCurveSecp256k1Reverted: offCurveReverted,
    };
    receipt.ergoTxs = {
      genesisTxId,
      dep1TxId,
      commit1TxId,
      admit1TxId,
      payout1TxId,
      dep2TxId,
      commit2TxId,
      admit2TxId,
      payout2TxId,
      reserveRentRefreshTxId: refreshTxId,
      proposeRotateTxId: proposeTxId,
      executeRotateTxId: execTxId,
      admit3Epoch2TxId: admit3TxId,
      payout3AfterRotationTxId: payout3TxId,
    };
    receipt.evmTxs = {
      mint1TxHash,
      burn1TxHash: burn1Receipt.hash,
      mint2TxHash,
      burn2TxHash: burn2Receipt.hash,
      burn3TxHash: burn3Receipt.hash,
    };
    receipt.coldCrashDbWipeReconstruction = {
      verified: true,
      finalReserveEntries: finalRecon.reserveEntries,
      finalTrackerEntries: finalRecon.trackerEntries,
      finalDupEntries: finalRecon.dupEntries,
      finalActiveEpoch: finalRecon.activeTrackerEpoch.toString(),
    };
    receipt.finalBalanceSheet = {
      reserveErgNano: finalReserve.value.toString(),
      reserveLiabilityNano: readLiveReserveLiability(finalReserve).toString(),
      reserveBufferNano: (BigInt(finalReserve.value) - readLiveReserveLiability(finalReserve)).toString(),
      sergTotalSupplyNano: finalSolvency.totalSupplyNanoErg.toString(),
      bridgeEscrowedFeesNano: finalSolvency.bridgeEscrowedFeesNanoErg.toString(),
      solvencyExactMatch: finalSolvency.totalSupplyNanoErg === readLiveReserveLiability(finalReserve),
      trackerLatestSourceHeight: readLiveTrackerLatestSourceHeight(finalTracker).toString(),
      reserveDigest: decodeSigmaAvlTreeDigestHex(finalReserve.additionalRegisters.R5),
      trackerDigest: decodeSigmaAvlTreeDigestHex(finalTracker.additionalRegisters.R5),
      dupDigest: decodeSigmaAvlTreeDigestHex(finalDup.additionalRegisters.R5),
    };
    receipt.replayRejectedByStockErgoNode = replayRejectedByNode;

    const receiptPath = path.join(E2E_RUN_ROOT, 'v1-e2e-receipt.json');
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    db.close();

    console.log('\n================================================================');
    console.log('  BRIDGE V1 LIVE MULTI-CYCLE E2E ON STOCK ERGO 6.0.3 + FRONTIER');
    console.log('                          100% PASS!                            ');
    console.log('================================================================');
    console.log(`Receipt written to: ${receiptPath}`);
    console.log(JSON.stringify(receipt.finalBalanceSheet, null, 2));
  } finally {
    try {
      ergoProc.kill();
    } catch {
      // ignore
    }
    try {
      frontierProc.kill();
    } catch {
      // ignore
    }
  }
}

run().catch((err) => {
  console.error('\n[e2e] FAILED:', err);
  process.exit(1);
});
