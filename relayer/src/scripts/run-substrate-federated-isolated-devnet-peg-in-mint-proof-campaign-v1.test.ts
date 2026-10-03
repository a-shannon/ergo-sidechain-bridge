import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocked = vi.hoisted(() => ({
  loader: vi.fn(),
  process: vi.fn(),
  root: vi.fn(),
}));

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1:
        mocked.root,
    };
  },
);
vi.mock(
  './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js',
  () => ({ loadCanonicalBootstrapRequestBoundToSha256: mocked.loader }),
);
vi.mock('../pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  resolveBridgeRepositoryRootsFromCheckoutLayout,
} from '../bridge-repository-layout.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1_SCHEMA,
} from '../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_MINT_SOURCE_PROOF_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA,
} from '../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  derivePegInSourceIntentIdV2Hex,
  encodePegInSourceIntentV2Hex,
} from '../peg-in-causal-admission-v2.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION,
  deriveValidityApplicationPooledReserveMintIdentityV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
} from '../validity-application-pooled-reserve-mint-reservation-v4.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1,
  parseSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-receipt-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignCommandFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-worker-v1.js';

const ROOT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1';
const DRAFT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1';
const EVIDENCE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1';
const EVIDENCE_BYTES_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_BYTES_V1';
const SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_RECEIPT_V2';
const PACKET_PROOF_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_MINT_SOURCE_PROOF_V2';
const CONSUMER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2';
const AMOUNT_NANO_ERG = '10000000';
const RECIPIENT_ADDRESS_HEX = '11'.repeat(20);
const REQUEST_DIGEST_HEX = 'f'.repeat(64);
const REPOSITORY_ROOTS = resolveBridgeRepositoryRootsFromCheckoutLayout(
  resolve(process.cwd(), '..'),
);

describe('isolated devnet peg-in mint-proof campaign command V1', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.loader.mockReturnValue(canonicalBootstrapInput());
    mocked.root.mockResolvedValue({ receipt: rootReceipt() });
  });

  it('resolves the reviewed Frontier and toolchain inputs inside the worker', async () => {
    const requestPath = resolve(tmpdir(), 'fed6lab-mint-proof-request.json');
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerFromArgumentsV1([
        '--request',
        requestPath,
        '--expected-request-sha256',
        REQUEST_DIGEST_HEX,
        '--amount-nano-erg',
        AMOUNT_NANO_ERG,
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
      ]);

    expect(mocked.loader).toHaveBeenCalledWith(
      requestPath,
      REPOSITORY_ROOTS.bridgeRoot,
      REPOSITORY_ROOTS.worktreeRoot,
      REQUEST_DIGEST_HEX,
    );
    expect(mocked.root).toHaveBeenCalledTimes(1);
    expect(mocked.root).toHaveBeenCalledWith({
      ...canonicalBootstrapInput(),
      pegIn: {
        amountNanoErg: AMOUNT_NANO_ERG,
        recipientAddressHex: RECIPIENT_ADDRESS_HEX,
      },
      frontierMintProofConsumer: {
        frontierSourceDirectory: 'C:\\reviewed\\frontier',
        cargoExecutablePath: 'C:\\reviewed\\cargo.exe',
        rustcExecutablePath: 'C:\\reviewed\\rustc.exe',
        gitExecutablePath: 'C:\\reviewed\\git.exe',
        offline: true,
      },
    });
    expect(receipt.proof.statementIdHex)
      .toBe(rootReceipt().mintProof.draft.statementIdHex);
    expect(receipt.execution.reserveSuccessorBoxIdHex).toBe('08'.repeat(32));
    expect(canonicalJson(receipt)).not.toMatch(
      /C:\\reviewed|privateKey|mnemonic|signedTransactionBytesHex/iu,
    );
  });

  it('publishes one compact request-bound receipt without exposing tool paths', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-mint-proof-command-'));
    try {
      const requestPath = join(fixture, 'request.json');
      const outputPath = join(fixture, 'receipt.json');
      const requestBytes = Buffer.from('{"request":"canonical"}\n', 'utf8');
      writeFileSync(requestPath, requestBytes);
      const requestDigest = createHash('sha256').update(requestBytes).digest('hex');
      const workerReceipt =
        buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
          rootReceipt(),
          requestDigest,
          pegInPlan(),
        );
      mocked.process.mockResolvedValue({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(workerReceipt)}\n`,
        stderr: '',
      });

      const result =
        await runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignCommandFromArgumentsV1([
          '--request',
          requestPath,
          '--amount-nano-erg',
          AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--output',
          outputPath,
        ]);

      expect(result.status)
        .toBe('isolated_peg_in_mint_proof_campaign_receipt_published');
      const processInput = mocked.process.mock.calls[0]?.[0];
      expect(processInput.args).toContain('--expected-request-sha256');
      expect(processInput.args).not.toContain('--frontier-source');
      expect(processInput.args).not.toContain('--cargo');
      expect(processInput.args).not.toContain('--rustc');
      expect(processInput.args).not.toContain('--git');
      expect(processInput.timeoutMs).toBe(90 * 60_000);
      const published = readFileSync(outputPath, 'utf8');
      expect(published).toBe(`${canonicalJson(JSON.parse(published))}\n`);
      expect(published).not.toMatch(
        /C:\\reviewed|privateKey|mnemonic|signedTransactionBytesHex/iu,
      );
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignCommandFromArgumentsV1([
          '--request',
          requestPath,
          '--amount-nano-erg',
          AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--output',
          outputPath,
        ]),
      ).rejects.toThrow(/must not already exist/iu);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('rejects a changed producer-to-consumer digest even with a recomputed root digest', () => {
    const root = structuredClone(rootReceipt());
    root.mintProof.consumerReceipt.statementIdHex = wireHex('ff');
    root.mintProof.consumerReceipt.receiptDigestHex = embeddedDigest(
      root.mintProof.consumerReceipt,
      'receiptDigestHex',
      CONSUMER_RECEIPT_DIGEST_DOMAIN,
    );
    root.receiptDigestHex = rootDigest(root);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
        root,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/producer-to-consumer binding changed/iu);
  });

  it('rejects a Frontier consumer receipt without its boundary', () => {
    const root = structuredClone(rootReceipt());
    delete root.mintProof.consumerReceipt.boundary;
    root.mintProof.consumerReceipt.receiptDigestHex = embeddedDigest(
      root.mintProof.consumerReceipt,
      'receiptDigestHex',
      CONSUMER_RECEIPT_DIGEST_DOMAIN,
    );
    root.receiptDigestHex = rootDigest(root);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
        root,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/Frontier consumer receipt fields changed/iu);
  });

  it.each([
    [
      'draft',
      (root: any) => {
        root.mintProof.draft.provenance.changed = true;
      },
      /mint reservation draft digest changed/iu,
    ],
    [
      'evidence bytes',
      (root: any) => {
        root.mintProof.evidenceReceipt.evidence.changed = true;
        root.mintProof.evidenceReceipt.receiptDigestHex = embeddedDigest(
          root.mintProof.evidenceReceipt,
          'receiptDigestHex',
          EVIDENCE_RECEIPT_DIGEST_DOMAIN,
        );
      },
      /source evidence bytes digest changed/iu,
    ],
    [
      'source proof',
      (root: any) => {
        root.mintProof.packetProof.sourceProof.result.changed = true;
      },
      /source proof receipt digest changed/iu,
    ],
    [
      'packet proof',
      (root: any) => {
        root.mintProof.packetProof.checks.changed = true;
      },
      /packet proof receipt digest changed/iu,
    ],
    [
      'Frontier consumer',
      (root: any) => {
        root.mintProof.consumerReceipt.checks.changed = true;
      },
      /Frontier consumer receipt digest changed/iu,
    ],
  ])('rejects a stale %s digest after the root digest is recomputed', (
    _label,
    mutate,
    expected,
  ) => {
    const root = structuredClone(rootReceipt());
    mutate(root);
    root.receiptDigestHex = rootDigest(root);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
        root,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(expected);
  });

  it.each([
    [
      'amount',
      Object.freeze({
        amountNanoErg: '10000001',
        recipientAddressHex: RECIPIENT_ADDRESS_HEX,
      }),
    ],
    [
      'recipient',
      Object.freeze({
        amountNanoErg: AMOUNT_NANO_ERG,
        recipientAddressHex: '22'.repeat(20),
      }),
    ],
  ])('rejects a CLI %s that differs from the root statement', (
    _label,
    changedPlan,
  ) => {
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        changedPlan,
      )
    ).toThrow(/peg-in plan differs from root statement/iu);
  });

  it('rejects changed authority boundaries and noncanonical worker JSON', () => {
    const changed = structuredClone(rootReceipt());
    changed.boundaries.mintAuthorized = true;
    changed.receiptDigestHex = rootDigest(changed);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
        changed,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/root boundaries changed/iu);

    const receipt =
      buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      );
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
        `${JSON.stringify(receipt, null, 2)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/canonical JSON/iu);
  });

  it('rejects invalid plans before loading a request or starting a worker', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerFromArgumentsV1([
        '--request',
        'request.json',
        '--expected-request-sha256',
        REQUEST_DIGEST_HEX,
        '--amount-nano-erg',
        '0',
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
      ]),
    ).rejects.toThrow(/arguments are invalid/iu);
    expect(mocked.loader).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
  });

  it('registers the config-free toolchain-resolving command', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    );
    expect(
      packageJson.scripts['federated:isolated:peg-in-mint-proof:execute-local'],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-v1.ts',
    );
  });
});

function pegInPlan() {
  return Object.freeze({
    amountNanoErg: AMOUNT_NANO_ERG,
    recipientAddressHex: RECIPIENT_ADDRESS_HEX,
  });
}

function canonicalBootstrapInput() {
  return Object.freeze({
    build: Object.freeze({ source: 'canonical-request' }),
    lifecycle: Object.freeze({
      sourceHistory: Object.freeze({
        acceptance: Object.freeze({
          frontierSourcePath: 'C:\\reviewed\\frontier',
          cargoExecutablePath: 'C:\\reviewed\\cargo.exe',
          rustcExecutablePath: 'C:\\reviewed\\rustc.exe',
          gitExecutablePath: 'C:\\reviewed\\git.exe',
        }),
      }),
    }),
  });
}

function rootReceipt(): any {
  const lineageProfileIdHex = wireHex('41');
  const sourceIntent = {
    formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    sourceNetworkIdHex: wireHex('42'),
    sidechainIdHex: wireHex('43'),
    bridgeAddressHex: wireHex('44', 20),
    tokenAddressHex: wireHex('45', 20),
    settlementProfileIdHex: wireHex('46'),
    admissionProfileIdHex: lineageProfileIdHex,
    sourceAssetIdHex: wireHex('00'),
    amountNanoErg: AMOUNT_NANO_ERG,
    recipientAddressHex: `0x${RECIPIENT_ADDRESS_HEX}`,
  } as const;
  const sourceIntentHex = encodePegInSourceIntentV2Hex(sourceIntent);
  const sourceIntentIdHex = derivePegInSourceIntentIdV2Hex(sourceIntent);
  const sourceLockBoxIdHex = wireHex('47');
  const depositCommitmentHex = wireHex('48');
  const mintIdentityHex =
    deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex,
      sourceLockBoxIdHex,
      depositCommitmentHex,
    });
  const statement = {
    formatVersion:
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_FORMAT_VERSION,
    lineageProfileIdHex,
    sourceIntentHex,
    sourceIntentIdHex,
    mintIdentityHex,
    sourceLockBoxIdHex,
    reserveTransitionTransactionIdHex: wireHex('49'),
    depositCommitmentHex,
    successorReserveBoxIdHex: wireHex('08'),
    successorReserveDigestHex: `0x01${'4a'.repeat(32)}`,
    successorReserveLiabilityNanoErg: AMOUNT_NANO_ERG,
    ergoDepositFinalityPolicyIdHex: wireHex('4b'),
    inclusionHeaderIdHex: wireHex('4c'),
    inclusionHeight: 10,
    targetHeaderIdHex: wireHex('4d'),
    targetHeight: 20,
    requiredSuccessorDepth: 10,
  } as const;
  const statementHex =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statement,
    );
  const statementIdHex =
    deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
      statement,
    );
  const draftDigestHex = '0a'.repeat(32);
  const evidenceReceiptDigestHex = '0c'.repeat(32);
  const packetReceiptDigestHex = '0d'.repeat(32);
  const sourceProofReceiptDigestHex = '0e'.repeat(32);
  const packetProofReceiptDigestHex = '0f'.repeat(32);
  const targetDescriptorDigestHex = '10'.repeat(32);
  const packetProof = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_MINT_SOURCE_PROOF_V2_SCHEMA,
    version: 2,
    status: 'packet_bound_collected_federated_source_proof_produced',
    packetReceiptDigestHex,
    targetDescriptorDigestHex,
    sourceProofReceiptDigestHex,
    sourceProof: {
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA,
      version: 2,
      status: 'collected_federated_source_proof_produced',
      sourceAttestationBindingDigestHex: '11'.repeat(32),
      sourceEvidenceReceiptDigestHex: evidenceReceiptDigestHex,
      targetDescriptorDigestHex,
      mintReservationDraftDigestHex: draftDigestHex,
      mintReservationStatementIdHex: statementIdHex,
      mintIdentityHex,
      settlementFamilyIdHex: wireHex('12'),
      encodedSettlementFamilyProfileHex: '0x00',
      runtimeProfileScaleHex: '0x00',
      runtimeProfileIdHex: wireHex('13'),
      sourceProofProfileIdHex: wireHex('14'),
      sourceProofProfileScaleHex: '0x00',
      requestDigestHex: '15'.repeat(32),
      request: {},
      result: {},
      signatureVerification: {},
      proofBytesScaleHex: '0x00',
      sourceProofEnvelopeScaleHex: '0x00',
      sourceProofEnvelopeSha256Hex: '16'.repeat(32),
      checks: {},
      boundary: {},
      limitations: [],
      receiptDigestHex: sourceProofReceiptDigestHex,
    },
    checks: {},
    receiptDigestHex: packetProofReceiptDigestHex,
  };
  const body: any = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA,
    version: 1,
    status: 'committed_reserve_proof_consumed_by_frontier_lab',
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    build: {
      schema: 'build',
      version: 1,
      status: 'exact_locked_patched_node_built',
      source: {},
      toolchain: {},
      build: {},
      checks: {},
      buildIdentityDigestHex: '01'.repeat(32),
      boundaries: {},
    },
    process: {
      schema: 'process',
      version: 1,
      primaryNodeOrigin: 'http://127.0.0.1:19051',
      witnessNodeOrigin: 'http://127.0.0.1:19052',
      primaryMiningDuringAction: true,
      witnessReadOnlyDuringAction: true,
      buildIdentityDigestHex: '01'.repeat(32),
      executableIdentityDigestHex: '02'.repeat(32),
      processBindingDigestHex: '03'.repeat(32),
      executionTargetIdentityDigestHex: '04'.repeat(32),
      initialSnapshot: {},
      finalSnapshot: {},
    },
    setup: {},
    pegIn: {
      fundingObservation: {},
      candidate: {},
      sourceLockCheck: {},
      sourceLockExecution: {},
      committedVaultCheck: {},
      committedVaultExecution: {
        expectedTxId: '05'.repeat(32),
        transportStatus: 'accepted',
        durableAttemptDigestHex: '06'.repeat(32),
        journalDigestHex: '07'.repeat(32),
        confirmationDigestHex: '18'.repeat(32),
        confirmationHeight: 10,
        confirmationHeaderIdHex: '19'.repeat(32),
        preTransportObservation: {},
        outputObservation: {
          schema: 'output-observation',
          version: 1,
          status: 'exact_transition_inputs_spent_and_reserve_successor_unspent',
          expectedTxId: '05'.repeat(32),
          sourceFundingBoxIdHex: '20'.repeat(32),
          reservePredecessorBoxIdHex: '21'.repeat(32),
          sourceLockBoxIdHex: '22'.repeat(32),
          transitionFeeFundingBoxIdHex: '23'.repeat(32),
          reserveSuccessorBoxIdHex: '08'.repeat(32),
          confirmationHeight: 10,
          confirmationHeaderIdHex: '19'.repeat(32),
          confirmationObservationDigestHex: '24'.repeat(32),
          finalityTargetHeight: 19,
          finalityTargetHeaderIdHex: '25'.repeat(32),
          requiredSuccessorDepth: 10,
          finalityPathHeaderIdsHex: [],
          observedTipHeight: 19,
          observedTipHeaderIdHex: '25'.repeat(32),
          processBindingDigestHex: '03'.repeat(32),
          executionTargetIdentityDigestHex: '04'.repeat(32),
          primaryObservationDigestHex: '26'.repeat(32),
          witnessObservationDigestHex: '27'.repeat(32),
          boundaries: {},
          observationDigestHex: '28'.repeat(32),
        },
      },
    },
    mintProof: {
      draft: {
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA,
        version: 1,
        status: 'canonical_statement_waiting_for_source_proof',
        statement,
        statementHex,
        statementIdHex,
        reservationKeyHex: mintIdentityHex,
        provenance: {},
        boundary: {},
        limitations: [],
        draftDigestHex,
      },
      evidenceReceipt: {
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMMITTED_RESERVE_EVIDENCE_V1_SCHEMA,
        version: 1,
        status: 'canonical_committed_reserve_evidence_collected',
        mintReservationDraftDigestHex: draftDigestHex,
        mintReservationStatementIdHex: statementIdHex,
        mintIdentityHex,
        candidateDigestHex: '29'.repeat(32),
        committedVaultObservationDigestHex: '28'.repeat(32),
        processBindingDigestHex: '03'.repeat(32),
        executionTargetIdentityDigestHex: '04'.repeat(32),
        collectorExecutableSha256Hex: '30'.repeat(32),
        collectorModuleSha256Hex: '31'.repeat(32),
        evidence: {},
        evidenceDigestHex: '32'.repeat(32),
        checks: {},
        boundaries: {},
        limitations: [],
        receiptDigestHex: evidenceReceiptDigestHex,
      },
      packetProof,
      consumerReceipt: {
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2_SCHEMA,
        version: 2,
        status: 'packet_bound_proof_consumed_by_frontier_lab',
        packetProof: structuredClone(packetProof),
        packetProofReceiptDigestHex,
        sourceProofReceiptDigestHex,
        sourceEvidenceReceiptDigestHex: evidenceReceiptDigestHex,
        targetDescriptorDigestHex,
        runtimeProfileIdHex: wireHex('13'),
        sourceProofProfileIdHex: wireHex('14'),
        statementIdHex,
        mintIdentityHex,
        sourceLockDigestHex: '33'.repeat(32),
        toolchainDigestHex: '34'.repeat(32),
        dynamicSourceProofSha256Hex: wireHex('35'),
        executionInputDigestHex: '36'.repeat(32),
        stdoutSha256Hex: '37'.repeat(32),
        stderrSha256Hex: '38'.repeat(32),
        checks: {},
        boundary: {
          isolatedTestClientOnly: true,
          processOwnedSyntheticCustodyOnly: true,
          localSourceAndToolIdentityOnly: true,
          completeBuildToolClosureVerified: false,
          dependencyCacheContentAttested: false,
          atomicSourceAndToolSnapshotEstablished: false,
          exclusiveNonAdversarialSameUserExecutionRequired: true,
          callerSuppliedEvidenceBytesAccepted: false,
          sourceEvidenceCollectionProvenanceEstablished: true,
          sourceCanonicalityIndependentlyVerified: false,
          ergoPowAuthenticated: false,
          externalTargetNodeAcceptanceEstablished: false,
          activationAuthorized: false,
          submissionAuthorized: false,
          broadcastAuthorized: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
          trustlessStatusEstablished: false,
          productionReadinessEstablished: false,
        },
        limitations: [],
        receiptDigestHex: '39'.repeat(32),
      },
    },
    checks: {
      committedReserveAndProofConsumedInOneTargetLifetime: true,
      compatibilityPacketReplacedByBoundContinuationV2: true,
      exactCommittedReserveBoundToMintStatement: true,
      exactCollectedEvidenceBoundToPacketProof: true,
      exactPacketProofConsumedByFrontier: true,
      everyEphemeralCapabilityDisposedBeforeReturn: true,
      returnedValueContainsCapabilities: false,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      localSetupAndValuePathBroadcastExecuted: true,
      sourceLockConsumptionEstablished: true,
      reserveLineageEstablished: true,
      depositCommitmentStateEstablished: true,
      sourceEvidenceCollectionProvenanceEstablished: true,
      frontierTestClientReservationAndMintExecuted: true,
      externalTargetNodeAcceptanceEstablished: false,
      sourceCanonicalityIndependentlyVerified: false,
      ergoPowAuthenticated: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      existingWalletMaterialUsed: false,
      processLossRecoveryEstablished: false,
      profileActivated: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  const draft = body.mintProof.draft;
  draft.draftDigestHex = embeddedDigest(
    draft,
    'draftDigestHex',
    DRAFT_DIGEST_DOMAIN,
  );

  const evidence = body.mintProof.evidenceReceipt;
  evidence.mintReservationDraftDigestHex = draft.draftDigestHex;
  evidence.evidenceDigestHex = sha256CanonicalJson(
    evidence.evidence,
    EVIDENCE_BYTES_DIGEST_DOMAIN,
  );
  evidence.receiptDigestHex = embeddedDigest(
    evidence,
    'receiptDigestHex',
    EVIDENCE_RECEIPT_DIGEST_DOMAIN,
  );

  const sourceProof = packetProof.sourceProof;
  sourceProof.sourceEvidenceReceiptDigestHex = evidence.receiptDigestHex;
  sourceProof.mintReservationDraftDigestHex = draft.draftDigestHex;
  sourceProof.receiptDigestHex = embeddedDigest(
    sourceProof,
    'receiptDigestHex',
    SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN,
  );
  packetProof.sourceProofReceiptDigestHex = sourceProof.receiptDigestHex;
  packetProof.receiptDigestHex = embeddedDigest(
    packetProof,
    'receiptDigestHex',
    PACKET_PROOF_RECEIPT_DIGEST_DOMAIN,
  );

  const consumer = body.mintProof.consumerReceipt;
  consumer.packetProof = structuredClone(packetProof);
  consumer.packetProofReceiptDigestHex = packetProof.receiptDigestHex;
  consumer.sourceProofReceiptDigestHex = sourceProof.receiptDigestHex;
  consumer.sourceEvidenceReceiptDigestHex = evidence.receiptDigestHex;
  consumer.receiptDigestHex = embeddedDigest(
    consumer,
    'receiptDigestHex',
    CONSUMER_RECEIPT_DIGEST_DOMAIN,
  );
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, ROOT_DIGEST_DOMAIN),
  };
}

function rootDigest(root: any): string {
  const { receiptDigestHex: _digest, ...body } = root;
  return sha256CanonicalJson(body, ROOT_DIGEST_DOMAIN);
}

function embeddedDigest(
  record: Record<string, any>,
  digestKey: string,
  domain: string,
): string {
  const body = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== digestKey),
  );
  return sha256CanonicalJson(body, domain);
}

function wireHex(byte: string, bytes = 32): string {
  return `0x${byte.repeat(bytes)}`;
}
