/**
 * Devnet Funding Preflight - checks relayer balance on patched Ergo devnet.
 *
 * Read-only. No .env loading for secrets. No signing. No DB writes.
 * Default mode does not read mnemonic env values. Use --address for a
 * no-secret public address balance check, or --include-secret-material in a
 * local devnet operator shell to derive the relayer P2PK address from
 * WALLET_MNEMONIC (address only, never prints mnemonic or private key).
 *
 * Exit 0: always (informational). Status in output.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { ErgoHDKey } from '@fleet-sdk/wallet';
import {
  resolvePatchedNodeUrl,
  type EnvBag,
} from '../patched-devnet-env.js';
import {
  classifyFunding,
  classifyDeployReadiness,
  classifyNodeOffline,
  classifySignerMissing,
  sumPureErgBalance,
  formatFundingReport,
  formatErg,
  DEVNET_MIN_FUNDING_NANOERG,
  DEVNET_COMFORTABLE_FUNDING_NANOERG,
} from '../devnet-funding-preflight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CliArgs {
  help: boolean;
  includeSecretMaterial: boolean;
  address: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, includeSecretMaterial: false, address: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--include-secret-material') {
      args.includeSecretMaterial = true;
    } else if (arg === '--address') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--address requires a value');
      }
      args.address = value;
      i += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log([
    'Usage: npm run demo:devnet:funding -- [--address <relayer-address> | --include-secret-material]',
    '',
    'Read-only patched-devnet funding diagnostic.',
    'Default mode does not read WALLET_MNEMONIC values, node configs, .env files, runtime databases, or deployment state.',
    '--address checks a public relayer address without secret material.',
    'Use --include-secret-material only in a local devnet operator shell when the address must be derived.',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// Derive relayer address without printing secrets
// ---------------------------------------------------------------------------

async function deriveRelayerAddress(): Promise<string | null> {
  const mnemonic = process.env.WALLET_MNEMONIC?.trim();
  if (!mnemonic) {
    return null;
  }
  const masterKey = await ErgoHDKey.fromMnemonic(mnemonic);
  const childKey = masterKey.deriveChild(0);
  const networkPrefix = parseInt(process.env.ERGO_NETWORK_PREFIX ?? '16', 10);
  return childKey.address.toString(networkPrefix);
}

// ---------------------------------------------------------------------------
// Query unspent boxes
// ---------------------------------------------------------------------------

async function queryBalance(
  nodeUrl: string,
  address: string,
): Promise<bigint | null> {
  try {
    const resp = await axios.get(
      `${nodeUrl}/blockchain/box/unspent/byAddress/${address}?offset=0&limit=100`,
      { timeout: 5000 },
    );
    if (!Array.isArray(resp.data)) return null;
    return sumPureErgBalance(resp.data);
  } catch {
    return null;
  }
}

/**
 * Query mining reward boxes (time-locked rewardOutputScript).
 * The reward ErgoTree wraps the pubkey in a covenant -- different from P2PK.
 * We reconstruct the reward ErgoTree prefix and query by ErgoTree.
 */
async function queryRewardBalance(
  nodeUrl: string,
  pubKeyHex: string,
): Promise<{ balance: bigint; rewardAddress: string } | null> {
  // Mining reward ErgoTree structure:
  // 1002040208cd<33-byte-pubkey>ea02d192a39a8cc7a70173007301
  // The prefix "1002040208cd" + pubkey + suffix is the rewardOutputScript(1, pk)
  // For minerRewardDelay=1 in devnet. The actual suffix varies with delay,
  // so we query the node API to derive the correct reward address.
  const p2pkTree = `0008cd${pubKeyHex}`;
  // A simpler approach: query by ErgoTree pattern using the indexed API
  // Actually, the reward ErgoTree for delay=1 is deterministic. But to be
  // robust, we query a recent block's emission TX to find the reward address.
  try {
    const headersResp = await axios.get(
      `${nodeUrl}/blocks/lastHeaders/1`,
      { timeout: 5000 },
    );
    if (!Array.isArray(headersResp.data) || headersResp.data.length === 0) return null;
    const blockId = headersResp.data[0].id;
    const blockResp = await axios.get(
      `${nodeUrl}/blocks/${blockId}`,
      { timeout: 5000 },
    );
    const txs = blockResp.data?.blockTransactions?.transactions;
    if (!Array.isArray(txs) || txs.length === 0) return null;
    // The emission TX is the first TX; its second output is the reward box
    const rewardOutput = txs[0]?.outputs?.[1];
    if (!rewardOutput?.ergoTree) return null;
    // Verify the reward ErgoTree contains our pubkey
    if (!rewardOutput.ergoTree.includes(pubKeyHex)) return null;
    // Convert reward ErgoTree to address
    const addrResp = await axios.get(
      `${nodeUrl}/utils/ergoTreeToAddress/${rewardOutput.ergoTree}`,
      { timeout: 5000 },
    );
    const rewardAddress = addrResp.data?.address;
    if (!rewardAddress) return null;
    // Query unspent boxes at the reward address
    const boxResp = await axios.get(
      `${nodeUrl}/blockchain/box/unspent/byAddress/${rewardAddress}?offset=0&limit=100`,
      { timeout: 5000 },
    );
    if (!Array.isArray(boxResp.data)) return null;
    return {
      balance: sumPureErgBalance(boxResp.data),
      rewardAddress,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const env: EnvBag = {
    PATCHED_ERGO_NODE_URL: process.env.PATCHED_ERGO_NODE_URL,
    ERGO_NODE_URL: process.env.ERGO_NODE_URL,
    ERGO_NODE: process.env.ERGO_NODE,
  };
  const nodeUrl = resolvePatchedNodeUrl(env);

  if (args.address && args.includeSecretMaterial) {
    const result = classifySignerMissing(
      'choose either --address or --include-secret-material, not both',
    );
    console.log(formatFundingReport(result, undefined, nodeUrl));
    process.exit(0);
  }

  if (args.address) {
    const p2pkBalance = await queryBalance(nodeUrl, args.address);
    if (p2pkBalance === null) {
      const result = classifyNodeOffline(nodeUrl);
      console.log(formatFundingReport(result, args.address, nodeUrl));
      process.exit(0);
    }

    const controlledResult = classifyFunding(p2pkBalance);
    console.log(formatFundingReport(controlledResult, args.address, nodeUrl));
    const SEP = '-'.repeat(70);
    console.log(SEP);
    console.log(`  P2PK deploy balance:  ${formatErg(p2pkBalance)} ERG`);
    console.log('  Reward balance:       not inspected (no secret material)');
    console.log(`  Total public balance: ${formatErg(p2pkBalance)} ERG`);
    console.log('');

    const deployResult = classifyDeployReadiness(p2pkBalance, 0n);
    const deployPrefix =
      deployResult.status === 'PASS' ? '  [PASS]' :
      deployResult.status === 'WARN' ? '  [WARN]' :
      '  [FAIL]';
    console.log(`${deployPrefix} ${deployResult.label}: ${deployResult.detail}`);
    console.log('');
    console.log('  Do not use node-wallet signing in this workflow.');
    console.log('');
    process.exit(0);
  }

  if (!args.includeSecretMaterial) {
    const result = classifySignerMissing(
      'secret material inspection disabled by default -- provide --address <relayer-address> or pass --include-secret-material only in a local devnet operator shell',
    );
    console.log(formatFundingReport(result, undefined, nodeUrl));
    process.exit(0);
  }

  // Derive address
  const address = await deriveRelayerAddress();
  if (!address) {
    const result = classifySignerMissing(
      'WALLET_MNEMONIC not set -- cannot derive relayer address',
    );
    console.log(formatFundingReport(result, undefined, nodeUrl));
    process.exit(0);
  }

  // Mining target context
  const miningTarget = process.env.DEVNET_MINING_TARGET?.trim() || null;

  // Derive pubkey hex for reward address lookup
  const masterKey = await ErgoHDKey.fromMnemonic(process.env.WALLET_MNEMONIC!.trim());
  const childKey = masterKey.deriveChild(0);
  const pubKeyHex = Buffer.from(childKey.publicKey).toString('hex');

  // Query P2PK balance
  const p2pkBalance = await queryBalance(nodeUrl, address);
  if (p2pkBalance === null) {
    const result = classifyNodeOffline(nodeUrl);
    console.log(formatFundingReport(result, address, nodeUrl));
    process.exit(0);
  }

  // Query mining reward balance (time-locked rewardOutputScript boxes)
  const rewardResult = await queryRewardBalance(nodeUrl, pubKeyHex);
  const rewardBalance = rewardResult?.balance ?? 0n;
  const rewardAddress = rewardResult?.rewardAddress ?? '(unknown)';

  // Total controlled = P2PK + reward boxes
  const totalBalance = p2pkBalance + rewardBalance;

  // 1. Total controlled balance (informational)
  const controlledResult = classifyFunding(totalBalance);
  console.log(formatFundingReport(controlledResult, address, nodeUrl));

  // 2. Detailed breakdown
  const SEP = '-'.repeat(70);
  console.log(SEP);
  console.log(`  P2PK deploy balance:  ${formatErg(p2pkBalance)} ERG`);
  console.log(`  Reward balance:       ${formatErg(rewardBalance)} ERG (time-locked mining rewards)`);
  if (rewardBalance > 0n) {
    console.log(`  Reward address:       ${rewardAddress}`);
  }
  console.log(`  Total controlled:     ${formatErg(totalBalance)} ERG`);
  console.log('');

  // 3. Deploy readiness (P2PK-specific -- deploy scripts only use P2PK boxes)
  const deployResult = classifyDeployReadiness(p2pkBalance, rewardBalance);
  const deployPrefix =
    deployResult.status === 'PASS' ? '  [PASS]' :
    deployResult.status === 'WARN' ? '  [WARN]' :
    '  [FAIL]';
  console.log(`${deployPrefix} ${deployResult.label}: ${deployResult.detail}`);
  console.log('');

  if (miningTarget) {
    console.log('  Mining target: routed to Fleet signer (via miningPubKeyHex)');
  } else {
    console.log('  [INFO] DEVNET_MINING_TARGET not set in this shell session.');
  }

  console.log('');
  console.log('  Do not use node-wallet signing in this workflow.');
  console.log('');

  process.exit(0);
}

main().catch((err: any) => {
  console.error(`Funding preflight error: ${err.message ?? err}`);
  process.exit(0); // informational, never hard-fail
});
