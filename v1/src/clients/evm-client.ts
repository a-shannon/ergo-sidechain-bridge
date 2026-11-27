import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { normalizeRecipientErgoTreeHex } from '../core/codecs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOLIDITY_COMPILED_DIR = path.resolve(__dirname, '../../solidity/compiled');

export interface CompiledSolidityArtifact {
  abi: ethers.InterfaceAbi;
  bytecode: string;
}

export function loadSolidityArtifact(name: 'SERG' | 'ErgoBridge'): CompiledSolidityArtifact {
  const abi = JSON.parse(
    fs.readFileSync(path.join(SOLIDITY_COMPILED_DIR, `${name}.abi`), 'utf8'),
  ) as ethers.InterfaceAbi;
  const binHex = fs
    .readFileSync(path.join(SOLIDITY_COMPILED_DIR, `${name}.bin`), 'utf8')
    .trim();
  return { abi, bytecode: `0x${binHex}` };
}

export interface EvmPegOutLog {
  blockNumber: number;
  blockHash: string;
  txHash: string;
  logIndex: number;
  user: string;
  netAmountNanoErg: bigint;
  recipientRawHex: string;
  recipientErgoTreeHex: string;
}

export interface EvmSolvencySnapshot {
  blockNumber: number;
  totalSupplyNanoErg: bigint;
  bridgeEscrowedFeesNanoErg: bigint;
  accumulatedFeesNanoErg: bigint;
  paused: boolean;
  owner: string;
}

async function waitReceipt(
  provider: ethers.JsonRpcProvider,
  txHash: string,
  timeoutMs = 30_000,
): Promise<ethers.TransactionReceipt> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for EVM tx receipt ${txHash}`);
}

export class FrontierEvmClient {
  public readonly provider: ethers.JsonRpcProvider;
  public readonly relayerWallet: ethers.Wallet;
  public readonly bridgeContract: ethers.Contract;
  public readonly sergContract: ethers.Contract;
  public readonly bridgeAddress: string;
  public readonly sergAddress: string;

  constructor(opts: {
    rpcUrl: string;
    relayerPrivateKey: string;
    bridgeAddress: string;
    sergAddress: string;
  }) {
    this.provider = new ethers.JsonRpcProvider(opts.rpcUrl);
    this.relayerWallet = new ethers.Wallet(opts.relayerPrivateKey, this.provider);
    const bridgeArt = loadSolidityArtifact('ErgoBridge');
    const sergArt = loadSolidityArtifact('SERG');
    this.bridgeAddress = ethers.getAddress(opts.bridgeAddress);
    this.sergAddress = ethers.getAddress(opts.sergAddress);
    this.bridgeContract = new ethers.Contract(this.bridgeAddress, bridgeArt.abi, this.relayerWallet);
    this.sergContract = new ethers.Contract(this.sergAddress, sergArt.abi, this.relayerWallet);
  }

  static async deployFresh(opts: {
    rpcUrl: string;
    deployerPrivateKey: string;
  }): Promise<{
    sergAddress: string;
    bridgeAddress: string;
    client: FrontierEvmClient;
  }> {
    const provider = new ethers.JsonRpcProvider(opts.rpcUrl);
    const wallet = new ethers.Wallet(opts.deployerPrivateKey, provider);
    const sergArt = loadSolidityArtifact('SERG');
    const bridgeArt = loadSolidityArtifact('ErgoBridge');

    const baseNonce = await provider.getTransactionCount(wallet.address, 'pending');
    const sergFactory = new ethers.ContractFactory(sergArt.abi, sergArt.bytecode, wallet);
    const serg = await sergFactory.deploy({ nonce: baseNonce });
    const sergDeployTx = serg.deploymentTransaction();
    if (!sergDeployTx) throw new Error('Missing SERG deployment tx');
    const sergReceipt = await waitReceipt(provider, sergDeployTx.hash);
    const sergAddress = sergReceipt.contractAddress ?? (await serg.getAddress());

    const bridgeFactory = new ethers.ContractFactory(bridgeArt.abi, bridgeArt.bytecode, wallet);
    const bridge = await bridgeFactory.deploy(sergAddress, { nonce: baseNonce + 1 });
    const bridgeDeployTx = bridge.deploymentTransaction();
    if (!bridgeDeployTx) throw new Error('Missing ErgoBridge deployment tx');
    const bridgeReceipt = await waitReceipt(provider, bridgeDeployTx.hash);
    const bridgeAddress = bridgeReceipt.contractAddress ?? (await bridge.getAddress());

    // Transfer SERG ownership to ErgoBridge so only the bridge can mint/bridgeBurn
    const sergBound = new ethers.Contract(sergAddress, sergArt.abi, wallet);
    const tx = await sergBound.transferOwnership(bridgeAddress, { nonce: baseNonce + 2 });
    const ownReceipt = await waitReceipt(provider, tx.hash);
    if (ownReceipt.status !== 1) throw new Error('SERG transferOwnership failed');

    const client = new FrontierEvmClient({
      rpcUrl: opts.rpcUrl,
      relayerPrivateKey: opts.deployerPrivateKey,
      bridgeAddress,
      sergAddress,
    });
    return { sergAddress, bridgeAddress, client };
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async getBlockHash(blockNumber: number): Promise<string> {
    const block = await this.provider.getBlock(blockNumber);
    if (!block || !block.hash) {
      throw new Error(`Frontier block ${blockNumber} not found`);
    }
    return block.hash.replace(/^0x/, '').toLowerCase();
  }

  async getSolvencySnapshot(): Promise<EvmSolvencySnapshot> {
    const [blockNumber, totalSupply, bridgeBal, accFees, paused, owner] = await Promise.all([
      this.provider.getBlockNumber(),
      this.sergContract.totalSupply() as Promise<bigint>,
      this.bridgeContract.bridgeSERGBalance() as Promise<bigint>,
      this.bridgeContract.accumulatedFees() as Promise<bigint>,
      this.bridgeContract.paused() as Promise<boolean>,
      this.bridgeContract.owner() as Promise<string>,
    ]);
    return {
      blockNumber,
      totalSupplyNanoErg: totalSupply,
      bridgeEscrowedFeesNanoErg: bridgeBal,
      accumulatedFeesNanoErg: accFees,
      paused,
      owner,
    };
  }

  async isPegInProcessed(ergoBoxIdHex: string): Promise<boolean> {
    const key = ergoBoxIdHex.startsWith('0x') ? ergoBoxIdHex : `0x${ergoBoxIdHex}`;
    return (await this.bridgeContract.processedPegIns(key)) as boolean;
  }

  async mintSerg(
    toAddress: string,
    amountNanoErg: bigint,
    ergoBoxIdHex: string,
  ): Promise<ethers.TransactionReceipt> {
    const key = ergoBoxIdHex.startsWith('0x') ? ergoBoxIdHex : `0x${ergoBoxIdHex}`;
    const nonce = await this.provider.getTransactionCount(this.relayerWallet.address, 'pending');
    const tx = await this.bridgeContract.mintSERG(toAddress, amountNanoErg, key, { nonce });
    const receipt = await waitReceipt(this.provider, tx.hash);
    if (receipt.status !== 1) {
      throw new Error(`mintSERG tx failed for box ${ergoBoxIdHex}`);
    }
    return receipt;
  }

  async emergencyPause(reason: string): Promise<void> {
    const nonce = await this.provider.getTransactionCount(this.relayerWallet.address, 'pending');
    const tx = await this.bridgeContract.emergencyPause(reason, { nonce });
    await waitReceipt(this.provider, tx.hash);
  }

  /**
   * Helper for users / CLI / E2E tests: approve + call pegOut(grossAmount, recipient).
   */
  async userPegOut(params: {
    userPrivateKey: string;
    grossAmountNanoErg: bigint;
    recipientPubKeyOrErgoTreeHex: string;
  }): Promise<ethers.TransactionReceipt> {
    const userWallet = new ethers.Wallet(params.userPrivateKey, this.provider);
    const sergArt = loadSolidityArtifact('SERG');
    const bridgeArt = loadSolidityArtifact('ErgoBridge');
    const userSerg = new ethers.Contract(this.sergAddress, sergArt.abi, userWallet);
    const userBridge = new ethers.Contract(this.bridgeAddress, bridgeArt.abi, userWallet);

    const startNonce = await this.provider.getTransactionCount(userWallet.address, 'pending');
    const approveTx = await userSerg.approve(this.bridgeAddress, params.grossAmountNanoErg, {
      nonce: startNonce,
    });
    const approveReceipt = await waitReceipt(this.provider, approveTx.hash);
    if (approveReceipt.status !== 1) throw new Error('sERG approve failed');

    const recipientBytes = params.recipientPubKeyOrErgoTreeHex.startsWith('0x')
      ? params.recipientPubKeyOrErgoTreeHex
      : `0x${params.recipientPubKeyOrErgoTreeHex}`;
    const pegOutTx = await userBridge.pegOut(params.grossAmountNanoErg, recipientBytes, {
      nonce: startNonce + 1,
    });
    const receipt = await waitReceipt(this.provider, pegOutTx.hash);
    if (receipt.status !== 1) {
      throw new Error('pegOut transaction failed');
    }
    return receipt;
  }

  /**
   * Scan PegOut events across [fromBlock, toBlock] in bounded RPC chunks
   * (avoiding eth_getLogs range caps [H-5]), deterministically ordered by
   * (blockNumber, logIndex).
   */
  async scanPegOutEvents(
    fromBlock: number,
    toBlock: number,
    maxChunkBlocks = 1000,
  ): Promise<EvmPegOutLog[]> {
    if (fromBlock > toBlock) return [];
    const filter = this.bridgeContract.filters.PegOut();
    const results: EvmPegOutLog[] = [];
    for (let start = fromBlock; start <= toBlock; start += maxChunkBlocks) {
      const end = Math.min(toBlock, start + maxChunkBlocks - 1);
      const rawLogs = await this.bridgeContract.queryFilter(filter, start, end);
      for (const log of rawLogs) {
        if (!('args' in log) || !log.args) continue;
        const user = String(log.args[0]);
        const netAmountNanoErg = BigInt(log.args[1]);
        const recipientRawHex = String(log.args[2]).replace(/^0x/, '').toLowerCase();
        const recipientErgoTreeHex = normalizeRecipientErgoTreeHex(recipientRawHex);
        results.push({
          blockNumber: log.blockNumber,
          blockHash: log.blockHash.replace(/^0x/, '').toLowerCase(),
          txHash: log.transactionHash.replace(/^0x/, '').toLowerCase(),
          logIndex: log.index,
          user,
          netAmountNanoErg,
          recipientRawHex,
          recipientErgoTreeHex,
        });
      }
    }
    results.sort((a, b) =>
      a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.logIndex - b.logIndex,
    );
    return results;
  }
}
