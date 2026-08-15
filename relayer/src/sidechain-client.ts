/**
 * Sidechain Client — read-only ethers.js interface to Frontier EVM
 *
 * Connects to the configured Frontier endpoint and observes historical SERG +
 * ErgoBridge compatibility deployments. It deliberately exposes no signer or
 * contract-write capability.
 */

import { ethers } from 'ethers';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { SUBSTRATE_CONFIG, loadDeployedState } from './config.js';
import {
  observeFrontierPegInMintTransportConfirmation,
} from './adapters/peg-in-mint-confirmation.js';
import {
  loadTrackedDeploymentIdentityArtifactProfile,
} from './read-only-deployment-identity-observer.js';
import {
  type PegInMintTransportConfirmationObservation,
} from './relayer-core/peg-in-mint-transport-lifecycle.js';
import {
  createFrontierReadOnlyObservationPort,
  type FrontierReadOnlyObservationPort,
} from './frontier-read-only-observation-port.js';
import type { FrontierBurnProofProvider } from './frontier-burn-proof-source.js';
import { BRIDGE_ABI, SERG_ABI } from './sidechain-contract-abi.js';

export class SidechainClient {
  readonly #provider: ethers.JsonRpcProvider;
  readonly #observationPort: FrontierReadOnlyObservationPort;
  readonly #rpcUrl: string;
  readonly #expectedBridgeCodeHashHex: string;
  readonly #expectedSergCodeHashHex: string;
  #bridgeContract!: ethers.Contract;
  #sergContract!: ethers.Contract;
  #bridgeAddress = '';
  #sergAddress = '';
  #expectedChainId = '';
  #initialized = false;

  constructor(rpcUrl = SUBSTRATE_CONFIG.evmRpcUrl) {
    this.#rpcUrl = rpcUrl;
    this.#provider = new ethers.JsonRpcProvider(rpcUrl);
    this.#observationPort = createFrontierReadOnlyObservationPort(this.#provider);
    const runtimeIdentity = loadReviewedPegInMintRuntimeIdentity(
      resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    );
    this.#expectedBridgeCodeHashHex =
      runtimeIdentity.bridgeCodeHashHex;
    this.#expectedSergCodeHashHex =
      runtimeIdentity.sergCodeHashHex;
  }

  /**
   * Initialize contracts from reviewed deployment metadata.
   * The historical owner-mint deployment helper is retired.
   */
  async init(): Promise<void> {
    const state = loadDeployedState();
    if (!state.solidity) {
      throw new Error(
        'Reviewed sidechain deployment metadata is missing the "solidity" field. ' +
        'The legacy owner-mint deployment route is retired.'
      );
    }
    if (
      typeof state.solidity.evmChainId !== 'string'
      || !/^[1-9][0-9]*$/u.test(state.solidity.evmChainId)
    ) {
      throw new Error(
        'Solidity deployment is missing a canonical EVM chain ID; sidechain writes remain disabled.',
      );
    }
    this.#bridgeAddress = ethers.getAddress(state.solidity.bridgeAddress);
    this.#sergAddress = ethers.getAddress(state.solidity.sergAddress);
    this.#expectedChainId = BigInt(state.solidity.evmChainId).toString();

    this.#bridgeContract = new ethers.Contract(
      this.#bridgeAddress,
      BRIDGE_ABI,
      this.#provider,
    );

    this.#sergContract = new ethers.Contract(
      this.#sergAddress,
      SERG_ABI,
      this.#provider,
    );

    const network = await this.#provider.getNetwork();
    const [
      sergToken,
      bridgeCode,
      sergOwner,
      sergCode,
    ] = await Promise.all([
      this.#bridgeContract.sergToken(),
      this.#provider.getCode(this.#bridgeAddress),
      this.#sergContract.owner(),
      this.#provider.getCode(this.#sergAddress),
    ]);
    const identity = assertHistoricalSidechainObservationIdentity({
      expectedChainId: this.#expectedChainId,
      observedChainId: network.chainId.toString(),
      bridgeAddress: this.#bridgeAddress,
      sergAddress: this.#sergAddress,
      observedSergTokenAddress: String(sergToken),
      observedSergOwnerAddress: String(sergOwner),
      bridgeCode,
      sergCode,
      expectedBridgeCodeHashHex: this.#expectedBridgeCodeHashHex,
      expectedSergCodeHashHex: this.#expectedSergCodeHashHex,
    });

    this.#initialized = true;
    console.log(`🟢 Sidechain: connected to ${this.#rpcUrl}`);
    console.log(`   Bridge:    ${state.solidity.bridgeAddress}`);
    console.log(`   sERG:      ${state.solidity.sergAddress}`);
    console.log('   Mode:      historical observation only');
    console.log(`   Ownership: ${identity.sergOwnership}`);
  }

  /**
   * Get sERG balance for an address.
   */
  async getSERGBalance(address: string): Promise<bigint> {
    this.ensureInit();
    return await this.#sergContract.balanceOf(address);
  }

  /**
   * Get total sERG supply (should match total ERG locked on mainchain).
   */
  async getTotalSupply(): Promise<bigint> {
    this.ensureInit();
    return await this.#sergContract.totalSupply();
  }

  /**
   * Get latest synced Ergo height from the bridge contract.
   */
  async getLatestErgoHeight(): Promise<number> {
    this.ensureInit();
    const h = await this.#bridgeContract.latestErgoHeight();
    return Number(h);
  }

  async getCurrentBlockNumber(): Promise<number> {
    this.ensureInit();
    return this.#observationPort.getBlockNumber();
  }

  async getBlock(blockTag: number | 'latest') {
    this.ensureInit();
    return this.#observationPort.getBlock(blockTag);
  }

  async getTransactionReceipt(transactionHash: string) {
    this.ensureInit();
    return this.#observationPort.getTransactionReceipt(transactionHash);
  }

  getFrontierBurnProofProvider(): FrontierBurnProofProvider {
    this.ensureInit();
    return this.#observationPort;
  }

  async observePegInMintTransportConfirmation(
    expectedTransactionHashHex: string,
  ): Promise<PegInMintTransportConfirmationObservation> {
    this.ensureInit();
    return observeFrontierPegInMintTransportConfirmation(
      this.#observationPort,
      expectedTransactionHashHex,
    );
  }

  /**
   * Scan for PegOut events on the sidechain (sERG burn → ERG unlock).
   * Queries ErgoBridge contract logs between fromBlock and toBlock.
   *
   * @param fromBlock Start block (inclusive)
   * @param toBlock   End block (inclusive), or 'latest'
   * @returns Array of parsed PegOut events
   */
  async scanForPegOuts(
    fromBlock: number,
    toBlock: number | 'latest',
  ): Promise<ParsedPegOut[]> {
    this.ensureInit();

    const filter = this.#bridgeContract.filters.PegOut();
    const events = await this.#bridgeContract.queryFilter(filter, fromBlock, toBlock);

    return events.map((event) => {
      const log = event as ethers.EventLog;
      return {
        user: log.args[0] as string,          // address
        amount: log.args[1] as bigint,         // uint256 (nanoERG) — NET amount after fee
        ergoRecipientAddress: log.args[2] as string, // bytes hex: 33-byte compressed pubkey or 36-byte P2PK ErgoTree
        sidechainTxHash: log.transactionHash,
        sidechainBlockNumber: log.blockNumber,
        sidechainBlockHash: (log as any).blockHash,
        sidechainLogIndex: (log as any).logIndex ?? (log as any).index,
      };
    });
  }

  /**
   * 🚨 CHAIN θ DEFENSE: Check if a peg-in boxId is marked as processed on-chain.
   * Used by reconcilePegIns() to detect phantom mints: SQLite says 'minted' but
   * the EVM TX was reorged away → user never received sERG.
   */
  async isBoxProcessed(ergoBoxId: string): Promise<boolean> {
    this.ensureInit();
    const boxIdBytes32 = ergoBoxId.startsWith('0x') ? ergoBoxId : '0x' + ergoBoxId;
    return await this.#bridgeContract.processedPegIns(boxIdBytes32);
  }

  /**
   * SOLVENCY: Get the bridge's escrowed sERG balance (accumulated fees).
   */
  async getBridgeSERGBalance(): Promise<bigint> {
    this.ensureInit();
    const result = await this.#bridgeContract.bridgeSERGBalance();
    return BigInt(result.toString());
  }

  private ensureInit(): void {
    if (!this.#initialized) {
      throw new Error('SidechainClient not initialized. Call init() first.');
    }
  }
}

export function loadReviewedPegInMintRuntimeIdentity(
  bridgeRoot: string,
): Readonly<{
  bridgeCodeHashHex: string;
  sergCodeHashHex: string;
}> {
  const artifactProfile = loadTrackedDeploymentIdentityArtifactProfile(
    bridgeRoot,
  );
  return Object.freeze({
    bridgeCodeHashHex: ethers.keccak256(
      artifactProfile.bridge.runtimeBytecodeHex,
    ).slice(2).toLowerCase(),
    sergCodeHashHex: ethers.keccak256(
      artifactProfile.token.runtimeBytecodeHex,
    ).slice(2).toLowerCase(),
  });
}

export function assertHistoricalSidechainObservationIdentity(input: Readonly<{
  expectedChainId: string;
  observedChainId: string;
  bridgeAddress: string;
  sergAddress: string;
  observedSergTokenAddress: string;
  observedSergOwnerAddress: string;
  bridgeCode: string;
  sergCode: string;
  expectedBridgeCodeHashHex: string;
  expectedSergCodeHashHex: string;
}>): Readonly<{
  sergOwnership: 'historical_bridge_owner' | 'migrated_or_renounced';
}> {
  if (input.observedChainId !== input.expectedChainId) {
    throw new Error(
      'Configured sidechain chain ID does not match the connected Frontier provider.',
    );
  }
  const bridgeAddress = ethers.getAddress(input.bridgeAddress);
  const sergAddress = ethers.getAddress(input.sergAddress);
  if (ethers.getAddress(input.observedSergTokenAddress) !== sergAddress) {
    throw new Error('ErgoBridge sERG token does not match deployed state.');
  }
  if (
    input.bridgeCode === '0x'
    || ethers.keccak256(input.bridgeCode).slice(2).toLowerCase()
      !== input.expectedBridgeCodeHashHex
  ) {
    throw new Error(
      'Configured ErgoBridge runtime code does not match the reviewed build artifact.',
    );
  }
  if (
    input.sergCode === '0x'
    || ethers.keccak256(input.sergCode).slice(2).toLowerCase()
      !== input.expectedSergCodeHashHex
  ) {
    throw new Error(
      'Configured sERG runtime code does not match the reviewed build artifact.',
    );
  }
  const observedOwner = ethers.getAddress(input.observedSergOwnerAddress);
  return Object.freeze({
    sergOwnership: observedOwner === bridgeAddress
      ? 'historical_bridge_owner'
      : 'migrated_or_renounced',
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Peg-Out Data Types
// ──────────────────────────────────────────────────────────────────────────

export interface ParsedPegOut {
  user: string;              // EVM address that burned sERG
  amount: bigint;            // NET amount in nanoERG (after bridge fee deduction)
  ergoRecipientAddress: string; // Hex bytes: 33-byte compressed pubkey or 36-byte P2PK ErgoTree (legacy name kept for compat)
  sidechainTxHash: string;   // Sidechain TX hash
  sidechainBlockNumber: number;
  sidechainBlockHash?: string;
  sidechainLogIndex?: number;
}
