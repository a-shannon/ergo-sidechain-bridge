#!/usr/bin/env tsx
/**
 * Deterministic stateful EVM fuzzing & invariant campaign executed directly
 * against a REAL Substrate Frontier EVM node (`frontier-template-node`).
 *
 * Proves formal accounting, deduplication, access-control, secp256k1 validation,
 * and timelock invariants across 80 randomized adversarial operations with ZERO mocks.
 *
 * Usage:
 *   FRONTIER_BIN=<path-to-frontier-template-node> npm run fuzz:evm-frontier
 */
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ethers } from 'ethers';
import { loadSolidityArtifact } from '../src/clients/evm-client.js';

const FRONTIER_BIN = process.env.FRONTIER_BIN;
const SEED = Number(process.env.FUZZ_SEED ?? '20261127');
const ITERATIONS = Number(process.env.FUZZ_STEPS ?? '80');

// Standard Frontier --dev prefunded accounts
const DEV_KEYS = {
  alith: '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133',
  baltathar: '0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b',
  charleth: '0x0b6e18cafb6ed99687ec547bd28139cafdd2bffe70e6b688025de6b445aa5c5b',
  dorothy: '0x39539ab1876910bbf3a223d84a29e28f1cb4e2e456503e7e91ed39b2e7223d68',
  ethan: '0x7dce9bc8babb68fec1409be38c844850742be0be69e21d9f1765a34e5381054a',
  faith: '0xb9d2ea9a615f3165812e8d44de0d24da9bbd164b65c4f0573e1ce2c8dbd9c8df',
};

const VALID_SECP256K1_PUBKEY =
  '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const OFF_CURVE_PUBKEY = `0x02${'00'.repeat(31)}05`;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`INVARIANT FAILED: ${msg}`);
}

/**
 * Under Frontier `--sealing=instant`, ethers v6 `tx.wait()` can hang waiting for
 * a subsequent block event. Poll `eth_getTransactionReceipt` directly instead.
 */
async function waitReceipt(
  provider: ethers.JsonRpcProvider,
  txHash: string,
  timeoutMs = 15_000,
): Promise<ethers.TransactionReceipt> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Timed out waiting for Frontier receipt: ${txHash}`);
}

async function waitRpcReady(url: string, timeoutMs = 45_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: string };
        if (json.result?.startsWith('0x')) return json.result;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Frontier RPC at ${url} did not become ready in ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  if (!FRONTIER_BIN || !fs.existsSync(FRONTIER_BIN)) {
    throw new Error('Set FRONTIER_BIN to a valid frontier-template-node binary path');
  }

  const rpcPort = 19945 + Math.floor(Math.random() * 500);
  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-evm-fuzz-'));

  let proc: ChildProcess | null = null;
  let provider: ethers.JsonRpcProvider | null = null;

  try {
    proc = spawn(
      FRONTIER_BIN,
      [
        '--dev',
        '--sealing=instant',
        '--rpc-port',
        String(rpcPort),
        '--base-path',
        tmpDir,
        '--no-telemetry',
        '--no-prometheus',
      ],
      { stdio: 'ignore' },
    );

    const chainIdHex = await waitRpcReady(rpcUrl);
    const net = new ethers.Network('frontier-fuzz', BigInt(chainIdHex));
    provider = new ethers.JsonRpcProvider(rpcUrl, net, { staticNetwork: net });

    const alith = new ethers.Wallet(DEV_KEYS.alith, provider);
    const c1 = new ethers.Wallet(DEV_KEYS.baltathar, provider);
    const c2 = new ethers.Wallet(DEV_KEYS.charleth, provider);
    const c3 = new ethers.Wallet(DEV_KEYS.dorothy, provider);
    const userA = new ethers.Wallet(DEV_KEYS.ethan, provider);
    const userB = new ethers.Wallet(DEV_KEYS.faith, provider);
    const users = [userA, userB];

    const nonces = new Map<string, number>();
    const nextNonce = async (w: ethers.Wallet): Promise<number> => {
      const addr = w.address.toLowerCase();
      if (!nonces.has(addr)) {
        nonces.set(addr, await provider!.getTransactionCount(w.address, 'latest'));
      }
      const n = nonces.get(addr)!;
      nonces.set(addr, n + 1);
      return n;
    };
    const syncNonce = async (w: ethers.Wallet): Promise<void> => {
      nonces.set(w.address.toLowerCase(), await provider!.getTransactionCount(w.address, 'pending'));
    };

    // Ensure all committee and user test wallets have native Frontier gas balance
    for (const w of [c1, c2, c3, userA, userB]) {
      const bal = await provider.getBalance(w.address);
      if (bal < ethers.parseEther('0.5')) {
        const ftx = await alith.sendTransaction({
          to: w.address,
          value: ethers.parseEther('1.0'),
          nonce: await nextNonce(alith),
        });
        const frec = await waitReceipt(provider, ftx.hash);
        assert(frec.status === 1, `Gas funding tx failed for ${w.address}`);
      }
    }

    const deploy = async (name: 'SERG' | 'ErgoBridge' | 'BridgeCommitteeTimelock', args: unknown[]) => {
      const art = loadSolidityArtifact(name);
      const factory = new ethers.ContractFactory(art.abi, art.bytecode, alith);
      const deployTx = await factory.getDeployTransaction(...args);
      const sent = await alith.sendTransaction({ ...deployTx, nonce: await nextNonce(alith) });
      const rec = await waitReceipt(provider!, sent.hash);
      assert(rec.status === 1 && rec.contractAddress, `Deploy failed for ${name}`);
      return new ethers.Contract(rec.contractAddress!, art.abi, provider!);
    };

    const sendOk = async (txPromise: Promise<ethers.TransactionResponse>, label: string) => {
      const tx = await txPromise;
      const rec = await waitReceipt(provider!, tx.hash);
      assert(rec.status === 1, `${label} reverted (${tx.hash})`);
      return rec;
    };

    // Under Frontier --sealing=instant, block.timestamp only advances when a new block seals.
    const advanceFrontierTime = async (ms: number) => {
      await new Promise((r) => setTimeout(r, ms));
      await sendOk(
        alith.sendTransaction({ to: alith.address, value: 0n, nonce: await nextNonce(alith) }),
        'advance-timestamp-block',
      );
    };

    const serg = await deploy('SERG', []);
    const sergAddr = await serg.getAddress();
    const bridge = await deploy('ErgoBridge', [sergAddr]);
    const bridgeAddr = await bridge.getAddress();
    await sendOk(
      (serg.connect(alith) as ethers.Contract).transferOwnership(bridgeAddr, {
        nonce: await nextNonce(alith),
      }),
      'SERG.transferOwnership',
    );

    const timelock = await deploy('BridgeCommitteeTimelock', [
      bridgeAddr,
      [c1.address, c2.address, c3.address],
      2,
      1, // 1s adminDelaySeconds
      alith.address, // mintOperator
    ]);
    const timelockAddr = await timelock.getAddress();
    await sendOk(
      (bridge.connect(alith) as ethers.Contract).transferOwnership(timelockAddr, {
        nonce: await nextNonce(alith),
      }),
      'ErgoBridge.transferOwnership',
    );

    const rand = mulberry32(SEED);
    const mintedBoxIds: string[] = [];
    let ghostTotalMinted = 0n;
    let ghostTotalNetBurned = 0n;
    let ghostTotalFeesAccrued = 0n;
    let ghostTotalFeesWithdrawn = 0n;
    let isPaused = false;

    const stats = {
      mints: 0,
      pegOuts: 0,
      feeWithdraws: 0,
      pauseCycles: 0,
      revertsVerified: 0,
    };

    const checkAllInvariants = async (stepLabel: string) => {
      const [supply, accFees, escrowBal, sergOwner, bridgeOwner, paused] = await Promise.all([
        serg.totalSupply() as Promise<bigint>,
        bridge.accumulatedFees() as Promise<bigint>,
        bridge.bridgeSERGBalance() as Promise<bigint>,
        serg.owner() as Promise<string>,
        bridge.owner() as Promise<string>,
        bridge.paused() as Promise<boolean>,
      ]);
      const expectedSupply = ghostTotalMinted - ghostTotalNetBurned;
      const expectedFees = ghostTotalFeesAccrued - ghostTotalFeesWithdrawn;
      assert(supply === expectedSupply, `[${stepLabel}] supply ${supply} != expected ${expectedSupply}`);
      assert(supply <= ghostTotalMinted, `[${stepLabel}] supply ${supply} > minted ${ghostTotalMinted}`);
      assert(accFees === expectedFees, `[${stepLabel}] accumulatedFees ${accFees} != ${expectedFees}`);
      assert(escrowBal >= accFees, `[${stepLabel}] escrow ${escrowBal} < accumulatedFees ${accFees}`);
      assert(sergOwner.toLowerCase() === bridgeAddr.toLowerCase(), `[${stepLabel}] SERG owner drifted`);
      assert(bridgeOwner.toLowerCase() === timelockAddr.toLowerCase(), `[${stepLabel}] Bridge owner drifted`);
      assert(paused === isPaused, `[${stepLabel}] paused state mismatch`);
    };

    const expectRevertTx = async (fn: () => Promise<ethers.TransactionResponse>, w: ethers.Wallet) => {
      const addr = w.address.toLowerCase();
      if (!nonces.has(addr)) {
        nonces.set(addr, await provider!.getTransactionCount(w.address, 'latest'));
      }
      const prevNonce = nonces.get(addr)!;
      let reverted = false;
      let sent = false;
      try {
        const tx = await fn();
        sent = true;
        const rec = await waitReceipt(provider!, tx.hash);
        if (!rec || rec.status !== 1) reverted = true;
      } catch {
        reverted = true;
        if (!sent) {
          nonces.set(addr, prevNonce);
        }
      }
      assert(reverted, 'Expected adversarial transaction to revert');
      stats.revertsVerified++;
    };

    for (let step = 1; step <= ITERATIONS; step++) {
      const roll = rand();

      if (roll < 0.32 && !isPaused) {
        // Valid mint via Timelock.relayMintSERG
        const u = users[Math.floor(rand() * users.length)];
        const amount = 15_000_000n + BigInt(Math.floor(rand() * 200_000_000));
        const boxId = ethers.keccak256(ethers.toUtf8Bytes(`fuzz-box-${SEED}-${step}`));
        await sendOk(
          (timelock.connect(alith) as ethers.Contract).relayMintSERG(u.address, amount, boxId, {
            nonce: await nextNonce(alith),
          }),
          `relayMintSERG-${step}`,
        );
        mintedBoxIds.push(boxId);
        ghostTotalMinted += amount;
        stats.mints++;
      } else if (roll < 0.56 && !isPaused) {
        // Valid pegOut burn
        const u = users[Math.floor(rand() * users.length)];
        const bal = (await serg.balanceOf(u.address)) as bigint;
        if (bal >= 15_000_000n) {
          const span = bal - 15_000_000n;
          const gross = 15_000_000n + (span > 0n ? BigInt(Math.floor(rand() * Number(span > 100_000_000n ? 100_000_000n : span))) : 0n);
          await sendOk(
            (serg.connect(u) as ethers.Contract).approve(bridgeAddr, gross, {
              nonce: await nextNonce(u),
            }),
            `approve-${step}`,
          );
          await sendOk(
            (bridge.connect(u) as ethers.Contract).pegOut(gross, VALID_SECP256K1_PUBKEY, {
              nonce: await nextNonce(u),
            }),
            `pegOut-${step}`,
          );
          ghostTotalNetBurned += gross - 5_000_000n;
          ghostTotalFeesAccrued += 5_000_000n;
          stats.pegOuts++;
        }
      } else if (roll < 0.68 && mintedBoxIds.length > 0) {
        // Adversarial: replay existing ergoBoxId -> MUST REVERT
        const dupBox = mintedBoxIds[Math.floor(rand() * mintedBoxIds.length)];
        await expectRevertTx(
          async () =>
            (timelock.connect(alith) as ethers.Contract).relayMintSERG(
              userA.address,
              20_000_000n,
              dupBox,
              { nonce: await nextNonce(alith), gasLimit: 300_000 },
            ),
          alith,
        );
      } else if (roll < 0.78) {
        // Adversarial: 1-of-n committee member tries to mint directly -> MUST REVERT ([H-4])
        const rogue = rand() < 0.5 ? c1 : userA;
        await expectRevertTx(
          async () =>
            (timelock.connect(rogue) as ethers.Contract).relayMintSERG(
              userA.address,
              20_000_000n,
              ethers.keccak256(ethers.toUtf8Bytes(`rogue-${step}`)),
              { nonce: await nextNonce(rogue), gasLimit: 300_000 },
            ),
          rogue,
        );
      } else if (roll < 0.86) {
        // Adversarial: off-curve secp256k1 or sub-minimum pegOut -> MUST REVERT
        const bal = (await serg.balanceOf(userA.address)) as bigint;
        if (bal >= 20_000_000n) {
          await sendOk(
            (serg.connect(userA) as ethers.Contract).approve(bridgeAddr, 20_000_000n, {
              nonce: await nextNonce(userA),
            }),
            `approve-adv-${step}`,
          );
          const useOffCurve = rand() < 0.5;
          await expectRevertTx(
            async () =>
              (bridge.connect(userA) as ethers.Contract).pegOut(
                useOffCurve ? 20_000_000n : 14_999_999n,
                useOffCurve ? OFF_CURVE_PUBKEY : VALID_SECP256K1_PUBKEY,
                { nonce: await nextNonce(userA), gasLimit: 300_000 },
              ),
            userA,
          );
        }
      } else if (roll < 0.94) {
        // Timelocked 2-of-3 withdrawFees (must preserve totalSupply!)
        const acc = (await bridge.accumulatedFees()) as bigint;
        if (acc > 0n) {
          const data = bridge.interface.encodeFunctionData('withdrawFees', [c3.address]);
          const salt = ethers.keccak256(ethers.toUtf8Bytes(`wd-${step}`));
          const pRec = await sendOk(
            (timelock.connect(c1) as ethers.Contract).proposeAction(bridgeAddr, data, salt, {
              nonce: await nextNonce(c1),
            }),
            `propose-wd-${step}`,
          );
          const actionId = pRec.logs
            .map((l: ethers.Log) => {
              try {
                return timelock.interface.parseLog(l);
              } catch {
                return null;
              }
            })
            .find((p: ethers.LogDescription | null) => p?.name === 'ActionProposed')?.args[0];
          await sendOk(
            (timelock.connect(c2) as ethers.Contract).confirmAction(actionId, {
              nonce: await nextNonce(c2),
            }),
            `confirm-wd-${step}`,
          );
          await advanceFrontierTime(1_500);
          await sendOk(
            (timelock.connect(alith) as ethers.Contract).executeAction(actionId, {
              nonce: await nextNonce(alith),
            }),
            `exec-wd-${step}`,
          );
          ghostTotalFeesWithdrawn += acc;
          stats.feeWithdraws++;
        }
      } else {
        // Emergency pause + timelocked 2-of-3 unpause cycle
        if (!isPaused) {
          await sendOk(
            (timelock.connect(c2) as ethers.Contract).emergencyPause(`fuzz-step-${step}`, {
              nonce: await nextNonce(c2),
            }),
            `pause-${step}`,
          );
          isPaused = true;
        } else {
          const data = bridge.interface.encodeFunctionData('unpause', []);
          const salt = ethers.keccak256(ethers.toUtf8Bytes(`unpause-${step}`));
          const pRec = await sendOk(
            (timelock.connect(c1) as ethers.Contract).proposeAction(bridgeAddr, data, salt, {
              nonce: await nextNonce(c1),
            }),
            `propose-unpause-${step}`,
          );
          const actionId = pRec.logs
            .map((l: ethers.Log) => {
              try {
                return timelock.interface.parseLog(l);
              } catch {
                return null;
              }
            })
            .find((p: ethers.LogDescription | null) => p?.name === 'ActionProposed')?.args[0];
          await sendOk(
            (timelock.connect(c3) as ethers.Contract).confirmAction(actionId, {
              nonce: await nextNonce(c3),
            }),
            `confirm-unpause-${step}`,
          );
          await advanceFrontierTime(1_500);
          await sendOk(
            (timelock.connect(alith) as ethers.Contract).executeAction(actionId, {
              nonce: await nextNonce(alith),
            }),
            `exec-unpause-${step}`,
          );
          isPaused = false;
          stats.pauseCycles++;
        }
      }

      await checkAllInvariants(`step-${step}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          seed: SEED,
          iterations: ITERATIONS,
          stats,
          finalState: {
            ghostTotalMinted: ghostTotalMinted.toString(),
            ghostTotalNetBurned: ghostTotalNetBurned.toString(),
            ghostTotalFeesAccrued: ghostTotalFeesAccrued.toString(),
            ghostTotalFeesWithdrawn: ghostTotalFeesWithdrawn.toString(),
            finalSupply: (ghostTotalMinted - ghostTotalNetBurned).toString(),
          },
          verdict: `Live Frontier EVM stateful fuzzing PASS (${ITERATIONS}/${ITERATIONS} steps, 7 invariants checked per step)`,
        },
        null,
        2,
      ),
    );
  } finally {
    if (provider) provider.destroy();
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore Windows handle release race
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
