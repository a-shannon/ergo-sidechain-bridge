/**
 * Rebuild, locally sign, and JVM-check one journaled authenticated V2 candidate.
 *
 * This command has no submit or broadcast branch. It requires an explicit
 * non-mainnet operator shell, explicit state/deployment inputs, and a reviewed
 * native-checkpoint profile. It does not load dotenv files.
 */

import { existsSync } from 'fs';
import { ethers } from 'ethers';

import {
  checkPackageBoundSignedAuthenticatedSettlementCandidate,
  recollectAndRevalidateAuthenticatedSettlementCandidate,
  signPackageBoundRevalidatedAuthenticatedSettlementCandidate,
} from '../authenticated-settlement-jvm-check.js';
import {
  runAuthenticatedSettlementCheckReservationCompatibility,
} from '../authenticated-settlement-check-reservation-compatibility.js';
import {
  assertAuthenticatedSettlementCheckObservedErgoNetwork,
  assertAuthenticatedSettlementCheckStaticPolicy,
  AUTHENTICATED_SETTLEMENT_CHECK_ENABLED_ENV,
} from '../authenticated-settlement-check-policy.js';
import {
  observeAuthenticatedSettlementStableErgoView,
} from '../authenticated-settlement-ergo-anchor.js';
import {
  observeAuthenticatedSettlementStableSidechainView,
} from '../authenticated-settlement-sidechain-view.js';
import {
  AggregateSettlementService,
  AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS,
} from '../aggregate-settlement-service.js';
import {
  assertJournaledUnsignedSettlementPackageDigest,
  bindAuthenticatedV2UnsignedSettlementPackage,
} from '../authenticated-v2-settlement-package-binding.js';
import {
  ERGO_CONFIG,
  PROTOCOL_PARAMS,
  SUBSTRATE_CONFIG,
  type DeployedState,
} from '../config.js';
import { ErgoClient } from '../ergo-client.js';
import {
  createFrontierReadOnlyObservationPort,
  type FrontierReadOnlyObservationPort,
} from '../frontier-read-only-observation-port.js';
import { assertErgoNodeEndpointAlignment } from '../ergo-node-endpoint-alignment.js';
import { NODE } from '../ergo-helpers.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  loadNativeCheckpointSettlementSourceFromEnvironment,
} from '../native-checkpoint-settlement-source.js';
import {
  loadNativeVerifierExecutionAuthorityFromEnvironment,
} from '../native-verifier-execution-authority.js';
import {
  classifyPegOutBurnForSettlement,
  verifyPegOutBurnReceipt,
} from '../peg-out-burn-verifier.js';
import { resolveStateDbPath } from '../post-submit-observe-paths.js';
import {
  SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
} from '../profiles/index.js';
import type { ParsedPegOut } from '../sidechain-client.js';
import {
  StateTracker,
} from '../state-tracker.js';

interface CliOptions {
  candidateId: string;
  stateDb: string;
  deployedStateJson: string;
  unsignedPackage: string;
  expectedPackageDigestHex: string;
}

function usage(): never {
  console.error([
    'Usage:',
    '  npm run settle:authenticated:check -- <candidateId> --state-db <relative.sqlite> --deployed-state-json <sanitized.json> --unsigned-package <wp06-t10.json> --expected-package-digest <64hex>',
    '',
    `Requires ${AUTHENTICATED_SETTLEMENT_CHECK_ENABLED_ENV}=true in an explicitly approved non-mainnet shell.`,
    'The command signs locally and calls /transactions/check only; it never submits or broadcasts.',
  ].join('\n'));
  process.exit(1);
}

function parseOptions(args: string[]): CliOptions {
  let candidateId: string | undefined;
  let stateDb: string | undefined;
  let deployedStateJson: string | undefined;
  let unsignedPackage: string | undefined;
  let expectedPackageDigestHex: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--state-db') {
      stateDb = requireOptionValue(args, ++index, '--state-db');
      continue;
    }
    if (arg === '--deployed-state-json') {
      deployedStateJson = requireOptionValue(args, ++index, '--deployed-state-json');
      continue;
    }
    if (arg === '--unsigned-package') {
      unsignedPackage = requireOptionValue(args, ++index, '--unsigned-package');
      continue;
    }
    if (arg === '--expected-package-digest') {
      expectedPackageDigestHex = normalizeFixedHex(
        requireOptionValue(args, ++index, '--expected-package-digest'),
        32,
        'expected package digest',
      );
      continue;
    }
    if (arg.startsWith('--') || candidateId !== undefined) usage();
    candidateId = normalizeFixedHex(arg, 32, 'candidateId');
  }
  if (
    !candidateId
    || !stateDb
    || !deployedStateJson
    || !unsignedPackage
    || !expectedPackageDigestHex
  ) usage();
  return {
    candidateId,
    stateDb,
    deployedStateJson,
    unsignedPackage,
    expectedPackageDigestHex,
  };
}

function requireOptionValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

async function assertCheckOnlyAuthorization(
  deployed: DeployedState,
  ergo: ErgoClient,
): Promise<void> {
  const nodeInfo = await ergo.getInfo();
  assertAuthenticatedSettlementCheckObservedErgoNetwork(
    String(deployed.network ?? ''),
    String(nodeInfo.network ?? ''),
  );
  assertErgoNodeEndpointAlignment('Authenticated V2 settlement check', {
    ergoNode: NODE,
    ergoNodeUrl: ERGO_CONFIG.nodeUrl,
  });
}

function loadExplicitDeployedState(target: string): DeployedState {
  const read = readEvidenceJsonTarget(target, '--deployed-state-json');
  if (read.errors.length > 0) {
    throw new Error(read.errors.map(error => `deployed state: ${error}`).join('\n'));
  }
  const deployed = read.json as DeployedState;
  if (
    !deployed?.spvTrackerAuthenticated
    || !deployed.doubleUnlockPreventionAuthenticated
    || !deployed.mainChainAggregateUnlockAuthenticated
    || !deployed.solidity?.bridgeAddress
  ) {
    throw new Error('deployed state is missing the authenticated V2 or sidechain bridge identities');
  }
  return deployed;
}

function parsedPegOut(row: any): ParsedPegOut {
  const burnTxHash = row?.sidechain_burn_tx_hash ?? row?.sidechainBurnTxHash;
  const recipient = row?.ergo_recipient_address ?? row?.ergoRecipientAddress;
  const amount = row?.amount_nanoerg ?? row?.amountNanoErg;
  const height = row?.sidechain_burn_height ?? row?.sidechainBurnHeight;
  const blockHash = row?.sidechain_block_hash ?? row?.sidechainBlockHash;
  const logIndex = row?.sidechain_log_index ?? row?.sidechainLogIndex;
  if (
    typeof burnTxHash !== 'string'
    || typeof recipient !== 'string'
    || amount === undefined
    || !Number.isSafeInteger(height)
    || typeof blockHash !== 'string'
    || !Number.isInteger(logIndex)
  ) {
    throw new Error('journaled candidate burn row is incomplete');
  }
  return {
    sidechainTxHash: burnTxHash,
    ergoRecipientAddress: recipient,
    amount: BigInt(amount),
    user: row.user ?? '',
    sidechainBlockNumber: height,
    sidechainBlockHash: blockHash,
    sidechainLogIndex: logIndex,
  };
}

async function verifyBurn(
  provider: FrontierReadOnlyObservationPort,
  bridgeAddress: string,
  pegOut: ParsedPegOut,
) {
  let receipt;
  let currentSidechainHeight;
  let canonicalBlockHash;
  try {
    receipt = await provider.getTransactionReceipt(pegOut.sidechainTxHash);
    if (receipt) {
      currentSidechainHeight = await provider.getBlockNumber();
      canonicalBlockHash = (await provider.getBlock(receipt.blockNumber))?.hash ?? undefined;
    }
  } catch {
    return 'unknown' as const;
  }
  return classifyPegOutBurnForSettlement(verifyPegOutBurnReceipt({
    pegOut,
    receipt,
    bridgeAddress,
    canonicalBlockHash,
    sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
    currentSidechainHeight,
    requiredSidechainConfirmations: PROTOCOL_PARAMS.confirmationDepth,
  }));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const stateDb = resolveStateDbPath(options.stateDb);
  if (stateDb.errors.length > 0 || !stateDb.path) {
    throw new Error(stateDb.errors.map(error => `state DB: ${error}`).join('\n'));
  }
  if (!existsSync(stateDb.path)) throw new Error('the explicit state DB does not exist');
  const deployed = loadExplicitDeployedState(options.deployedStateJson);
  const packageRead = readEvidenceJsonTarget(options.unsignedPackage, '--unsigned-package');
  if (packageRead.errors.length > 0) {
    throw new Error(packageRead.errors.map(error => `unsigned package: ${error}`).join('\n'));
  }
  const bridgeAddress = deployed.solidity!.bridgeAddress;
  assertAuthenticatedSettlementCheckStaticPolicy({
    checkEnabled: process.env[AUTHENTICATED_SETTLEMENT_CHECK_ENABLED_ENV] === 'true',
    broadcastEnabled: PROTOCOL_PARAMS.broadcastEnabled,
    deployedErgoNetwork: String(deployed.network ?? ''),
    sidechainNetwork: String(SUBSTRATE_CONFIG.network ?? ''),
    ergoNodeUrl: ERGO_CONFIG.nodeUrl,
    signerErgoNodeUrl: NODE,
    sidechainRpcUrl: SUBSTRATE_CONFIG.evmRpcUrl,
  });
  const ergo = new ErgoClient(ERGO_CONFIG.nodeUrl, { readOnly: true, direct: true });
  await assertCheckOnlyAuthorization(deployed, ergo);

  const nativeExecutionAuthority =
    loadNativeVerifierExecutionAuthorityFromEnvironment();
  const nativeCheckpointSource = loadNativeCheckpointSettlementSourceFromEnvironment(
    process.env,
    nativeExecutionAuthority ?? undefined,
  );
  if (!nativeCheckpointSource) {
    throw new Error('a reviewed native checkpoint settlement profile is required');
  }
  const state = new StateTracker(stateDb.path);
  try {
    const candidate = state.getAuthenticatedSettlementCandidate(options.candidateId);
    if (!candidate) throw new Error('authenticated settlement candidate was not found');
    if (candidate.status === 'invalidated') {
      throw new Error('invalidated authenticated settlement candidate cannot be checked');
    }
    assertJournaledUnsignedSettlementPackageDigest(
      options.expectedPackageDigestHex,
      candidate.checkUnsignedPackageDigest,
    );
    const row = state.getPegOutByBurnId(candidate.burnId);
    if (!row) throw new Error('journaled candidate burn row was not found');
    const pegOut = parsedPegOut(row);
    const trackerIdentity = state.getAuthenticatedSpvTrackerIdentityByHeight(
      pegOut.sidechainBlockNumber,
      candidate.sidechainId,
    );
    if (!trackerIdentity) throw new Error('authenticated tracker identity was not found');

    const frontierProvider = createFrontierReadOnlyObservationPort(
      new ethers.JsonRpcProvider(SUBSTRATE_CONFIG.evmRpcUrl),
    );
    const settlementService = new AggregateSettlementService({
      ergo,
      state,
      deployed,
      sidechainIdHex: candidate.sidechainId,
      verifySidechainBurn: target => verifyBurn(
        frontierProvider,
        bridgeAddress,
        target,
      ),
    });
    const {
      acceptance,
      authorization,
      reservation,
    } = await runAuthenticatedSettlementCheckReservationCompatibility(
      {
        sourceProfileSelection:
          SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
        candidate,
        pegOut,
        expectedPackageDigestHex: options.expectedPackageDigestHex,
      },
      {
        state,
        revalidate: () =>
          recollectAndRevalidateAuthenticatedSettlementCandidate({
            candidate,
            pegOut,
            trackerIdentity,
            trackerHistory: state.getAuthenticatedSpvTrackerHistory(
              candidate.sidechainId,
            ),
            sidechainIdHex: candidate.sidechainId,
            bridgeAddress,
            frontierProvider,
            nativeCheckpointSource,
            settlementService,
          }),
        bindPackage: revalidated =>
          bindAuthenticatedV2UnsignedSettlementPackage({
            packageValue: packageRead.json,
            expectedPackageDigestHex: options.expectedPackageDigestHex,
            expectedTxId: revalidated.expectedTxId,
            prepared: revalidated.prepared,
          }),
        sign: (packageBinding, revalidated) =>
          signPackageBoundRevalidatedAuthenticatedSettlementCandidate(
            packageBinding,
            revalidated,
            'Authenticated V2 settlement',
            NODE,
          ),
        check: (packageBinding, revalidated, signed) =>
          checkPackageBoundSignedAuthenticatedSettlementCandidate(
            packageBinding,
            revalidated,
            signed,
            'Authenticated V2 settlement',
          ),
        observeStableErgo: revalidated =>
          observeAuthenticatedSettlementStableErgoView({
            ergo,
            candidate,
            prepared: revalidated.prepared,
            minimumConfirmations:
              AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS,
          }),
        observeStableSidechain: () =>
          observeAuthenticatedSettlementStableSidechainView({
            source: frontierProvider,
            bridgeAddress,
            sidechainIdHex: candidate.sidechainId,
            requiredConfirmations: PROTOCOL_PARAMS.confirmationDepth,
            candidate,
            pegOut,
          }),
      },
    );
    console.log('Authenticated V2 JVM /transactions/check passed.');
    console.log(`Candidate ID: ${acceptance.candidateId}`);
    console.log(`Expected transaction ID: ${acceptance.expectedTxId}`);
    console.log(`Unsigned package digest: ${acceptance.unsignedPackageDigestHex}`);
    console.log(`Signed transaction digest: ${acceptance.signedTransactionDigestHex}`);
    console.log(`Signer context digest: ${acceptance.signerContextDigestHex}`);
    console.log(`Checker identity digest: ${acceptance.checkerIdentityDigestHex}`);
    console.log(`Revalidation digest: ${acceptance.revalidationDigestHex}`);
    console.log(`Check response digest: ${acceptance.checkResponseDigestHex}`);
    console.log(`Ephemeral execution authorization: ${authorization.authorizationDigestHex}`);
    console.log(`Durable execution reservation: ${reservation.reservationDigestHex}`);
    console.log(`Execution reservation status: ${reservation.status}`);
    console.log('Broadcast: no');
  } finally {
    state.close();
  }
}

function normalizeFixedHex(value: string, bytes: number, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

await main();
