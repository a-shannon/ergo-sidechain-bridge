import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ethers } from 'ethers';
import { FrontierEvmClient, loadSolidityArtifact } from '../src/clients/evm-client.js';

const FRONTIER_BIN = process.env.FRONTIER_BIN ?? '';
if (!FRONTIER_BIN || !fs.existsSync(FRONTIER_BIN)) {
  throw new Error('Set FRONTIER_BIN to the path of frontier-template-node');
}

const RPC_PORT = 19966;
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;

// Standard Frontier --dev prefunded accounts (devnet only!)
const ALITH = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';
const BALTATHAR = '0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b';
const CHARLETH = '0x0b6e18cafb6ed99687ec547bd28139cafdd2bffe70e6b688025de6b445aa5c5b';
const DOROTHY = '0x39539ab1876910bbf3a223d84a29e28f1cb4e2e456503e7e91ed39b2e7223d68';
const ETHAN = '0x7dce9bc8babb68fec1409be38c8e1a52650206a7ed90ff956ae8a6d15eeaaef4';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`TIMELOCK TEST FAILED: ${msg}`);
}

async function waitReceipt(provider: ethers.JsonRpcProvider, txHash: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const r = await provider.getTransactionReceipt(txHash);
    if (r) return r;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for receipt ${txHash}`);
}

async function expectRevert(fn: () => Promise<unknown>, expectedSubstr: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes(expectedSubstr.toLowerCase())) {
      throw new Error(`Reverted with unexpected message "${msg}", expected "${expectedSubstr}"`);
    }
    return;
  }
  throw new Error(`Expected revert containing "${expectedSubstr}" but call succeeded`);
}

function startFrontier(dir: string): ChildProcess {
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
      String(RPC_PORT),
      '--rpc-cors=all',
      '--no-telemetry',
      '--no-prometheus',
    ],
    { stdio: ['ignore', logOut, logOut], windowsHide: true },
  );
}

async function waitReady(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      });
      if (res.ok) return;
    } catch {
      // starting
    }
    await sleep(300);
  }
  throw new Error('Frontier did not start');
}

async function main(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-v1-timelock-'));
  const proc = startFrontier(tmpDir);
  try {
    await waitReady();
    const deployed = await FrontierEvmClient.deployFresh({
      rpcUrl: RPC_URL,
      deployerPrivateKey: ALITH,
    });
    const provider = deployed.client.provider;
    const wC1 = new ethers.Wallet(ALITH, provider);
    const wC2 = new ethers.Wallet(BALTATHAR, provider);
    const wC3 = new ethers.Wallet(CHARLETH, provider);
    const wOp = new ethers.Wallet(DOROTHY, provider);
    const wUser = new ethers.Wallet(ETHAN, provider);

    // Deploy 2-of-3 BridgeCommitteeTimelock with 3-second delay and Dorothy as mintOperator
    const tlArt = loadSolidityArtifact('BridgeCommitteeTimelock');
    const tlFactory = new ethers.ContractFactory(tlArt.abi, tlArt.bytecode, wC1);
    const tlNonce = await provider.getTransactionCount(wC1.address, 'pending');
    const tlDeploy = await tlFactory.deploy(
      deployed.bridgeAddress,
      [wC1.address, wC2.address, wC3.address],
      2,
      3, // 3-second timelock delay for fast live Frontier test
      wOp.address,
      { nonce: tlNonce },
    );
    const tlReceipt = await waitReceipt(provider, tlDeploy.deploymentTransaction()!.hash);
    assert(tlReceipt.status === 1 && tlReceipt.contractAddress, 'Timelock deploy failed');
    const tlAddr = tlReceipt.contractAddress;

    // Transfer ErgoBridge ownership to BridgeCommitteeTimelock!
    const xferTx = await deployed.client.bridgeContract.transferOwnership(tlAddr, {
      nonce: tlNonce + 1,
    });
    assert((await waitReceipt(provider, xferTx.hash)).status === 1, 'transferOwnership failed');
    assert(
      ((await deployed.client.bridgeContract.owner()) as string).toLowerCase() === tlAddr.toLowerCase(),
      'ErgoBridge owner must be BridgeCommitteeTimelock',
    );

    const tlC1 = new ethers.Contract(tlAddr, tlArt.abi, wC1);
    const tlC2 = new ethers.Contract(tlAddr, tlArt.abi, wC2);
    const tlC3 = new ethers.Contract(tlAddr, tlArt.abi, wC3);
    const tlOp = new ethers.Contract(tlAddr, tlArt.abi, wOp);

    const nonces = new Map<string, number>();
    const nextNonce = async (w: ethers.Wallet): Promise<number> => {
      const k = w.address.toLowerCase();
      if (!nonces.has(k)) {
        nonces.set(k, await provider.getTransactionCount(w.address, 'pending'));
      }
      const n = nonces.get(k)!;
      nonces.set(k, n + 1);
      return n;
    };
    nonces.set(wC1.address.toLowerCase(), tlNonce + 2);

    // 1. Hot mintOperator CAN relayMintSERG, CANNOT propose admin actions, CANNOT call ErgoBridge.withdrawFees directly
    //    AND [H-4]: a single committee member (1-of-n) CANNOT call relayMintSERG!
    await expectRevert(
      () => tlC1.relayMintSERG.staticCall(wUser.address, 30_000_000n, `0x${'aa'.repeat(32)}`),
      'only mint operator',
    );
    const mintTx = await tlOp.relayMintSERG(wUser.address, 30_000_000n, `0x${'aa'.repeat(32)}`, {
      nonce: await nextNonce(wOp),
    });
    assert((await waitReceipt(provider, mintTx.hash)).status === 1, 'relayMintSERG failed');
    assert(
      (await deployed.client.sergContract.balanceOf(wUser.address)) === 30_000_000n,
      'User should hold 30M sERG',
    );

    await expectRevert(
      () => tlOp.proposeAction.staticCall(deployed.bridgeAddress, '0x3f4ba83a', `0x${'01'.repeat(32)}`),
      'not committee member',
    );
    await expectRevert(
      () => deployed.client.bridgeContract.withdrawFees.staticCall(wC1.address),
      'OwnableUnauthorizedAccount',
    );

    // 2. User burns 20M gross -> escrows 5M fee in ErgoBridge
    await deployed.client.userPegOut({
      userPrivateKey: ETHAN,
      grossAmountNanoErg: 20_000_000n,
      recipientPubKeyOrErgoTreeHex: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    });

    // 3. Fast zero-delay emergencyPause by single operator
    const pauseTx = await tlOp.emergencyPause('solvency drill', { nonce: await nextNonce(wOp) });
    assert((await waitReceipt(provider, pauseTx.hash)).status === 1, 'emergencyPause failed');
    assert((await deployed.client.bridgeContract.paused()) === true, 'Bridge must be paused');

    // 4. Target allowlist: cannot propose action targeting arbitrary external contract (SERG)
    await expectRevert(
      () => tlC1.proposeAction.staticCall(deployed.sergAddress, '0x12345678', `0x${'02'.repeat(32)}`),
      'target must be bridge or timelock',
    );

    // 5. Propose unpause() via C1 -> <2 confirmations rejected -> double confirm rejected -> C2 confirms -> early execute rejected -> wait 4s -> executes!
    const unpauseData = deployed.client.bridgeContract.interface.encodeFunctionData('unpause', []);
    const propTx = await tlC1.proposeAction(deployed.bridgeAddress, unpauseData, `0x${'03'.repeat(32)}`, {
      nonce: await nextNonce(wC1),
    });
    const propRcpt = await waitReceipt(provider, propTx.hash);
    const propLog = propRcpt.logs
      .map((l) => {
        try {
          return tlC1.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p) => p?.name === 'ActionProposed');
    assert(propLog, 'ActionProposed event not emitted');
    const unpauseActionId = propLog.args[0] as string;

    await expectRevert(() => tlC1.executeAction.staticCall(unpauseActionId), 'insufficient confirmations');
    await expectRevert(() => tlC1.confirmAction.staticCall(unpauseActionId), 'already confirmed');

    const confTx = await tlC2.confirmAction(unpauseActionId, { nonce: await nextNonce(wC2) });
    assert((await waitReceipt(provider, confTx.hash)).status === 1, 'confirmAction failed');

    // Immediately executing before 3s delay MUST revert!
    await expectRevert(() => tlC1.executeAction.staticCall(unpauseActionId), 'delay not elapsed');

    // Advance wall-clock > 3s and trigger a new block so Frontier timestamp advances past readyAt
    await sleep(4_200);
    const pingTx = await wC3.sendTransaction({ to: wC3.address, value: 0n, nonce: await nextNonce(wC3) });
    await waitReceipt(provider, pingTx.hash);

    const execTx = await tlC1.executeAction(unpauseActionId, { nonce: await nextNonce(wC1) });
    assert((await waitReceipt(provider, execTx.hash)).status === 1, 'executeAction(unpause) failed');
    assert((await deployed.client.bridgeContract.paused()) === false, 'Bridge must be unpaused');

    // 6. Quorum cancel test: propose withdrawFees -> C2 confirms -> C1 + C3 cancel -> execute reverts!
    const withdrawData = deployed.client.bridgeContract.interface.encodeFunctionData('withdrawFees', [
      wC1.address,
    ]);
    const propW = await tlC1.proposeAction(deployed.bridgeAddress, withdrawData, `0x${'04'.repeat(32)}`, {
      nonce: await nextNonce(wC1),
    });
    const propWRcpt = await waitReceipt(provider, propW.hash);
    const withdrawActionId = propWRcpt.logs
      .map((l) => {
        try {
          return tlC1.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p) => p?.name === 'ActionProposed')!.args[0] as string;

    await waitReceipt(provider, (await tlC2.confirmAction(withdrawActionId, { nonce: await nextNonce(wC2) })).hash);
    // 1 cancel confirmation is NOT enough after quorum (still not canceled!)
    await waitReceipt(provider, (await tlC1.cancelAction(withdrawActionId, { nonce: await nextNonce(wC1) })).hash);
    assert((await tlC1.actions(withdrawActionId)).canceled === false, 'Single cancel must not cancel after quorum');
    // 2nd cancel confirmation reaches threshold=2 -> canceled!
    await waitReceipt(provider, (await tlC3.cancelAction(withdrawActionId, { nonce: await nextNonce(wC3) })).hash);
    assert((await tlC1.actions(withdrawActionId)).canceled === true, 'Quorum cancel must cancel action');
    await expectRevert(() => tlC1.executeAction.staticCall(withdrawActionId), 'already canceled');

    // 7. Timelocked self-call setMintOperator(wC3.address)
    const rotOpData = tlC1.interface.encodeFunctionData('setMintOperator', [wC3.address]);
    const propOp = await tlC1.proposeAction(tlAddr, rotOpData, `0x${'05'.repeat(32)}`, {
      nonce: await nextNonce(wC1),
    });
    const opActionId = (await waitReceipt(provider, propOp.hash)).logs
      .map((l) => {
        try {
          return tlC1.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p) => p?.name === 'ActionProposed')!.args[0] as string;
    await waitReceipt(provider, (await tlC2.confirmAction(opActionId, { nonce: await nextNonce(wC2) })).hash);
    await sleep(4_200);
    await waitReceipt(provider, (await wC3.sendTransaction({ to: wC3.address, value: 0n, nonce: await nextNonce(wC3) })).hash);
    await waitReceipt(provider, (await tlC1.executeAction(opActionId, { nonce: await nextNonce(wC1) })).hash);
    assert(
      ((await tlC1.mintOperator()) as string).toLowerCase() === wC3.address.toLowerCase(),
      'mintOperator should be rotated via timelocked self-call',
    );

    console.log('BridgeCommitteeTimelock live Frontier EVM verification: 100% PASS (7/7 invariants)!');
  } finally {
    proc.kill('SIGTERM');
    await sleep(500);
    if (!proc.killed) proc.kill('SIGKILL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
