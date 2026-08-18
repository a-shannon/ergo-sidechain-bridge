import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
  () => ({
    runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1:
      mocked.root,
  }),
);
vi.mock(
  './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js',
  () => ({ loadCanonicalBootstrapRequestBoundToSha256: mocked.loader }),
);
vi.mock('../pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { encodePegInSourceIntentV2Hex } from '../peg-in-causal-admission-v2.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-check-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckWorkerFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-check-worker-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

const AMOUNT_NANO_ERG = '10000000';
const RECIPIENT_ADDRESS_HEX = '11'.repeat(20);

describe('isolated devnet peg-in source-lock check command V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.loader.mockReturnValue(Object.freeze({
      build: Object.freeze({ source: 'canonical-request' }),
      lifecycle: Object.freeze({ source: 'canonical-request' }),
    }));
    mocked.root.mockResolvedValue({ receipt: executionReceipt() });
    mocked.process.mockImplementation(async input => {
      const requestShaIndex = input.args.indexOf('--expected-request-sha256');
      const requestSha = input.args[requestShaIndex + 1];
      return {
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(workerReceipt(requestSha))}\n`,
        stderr: '',
      };
    });
  });

  it('maps the canonical request and exact peg-in plan only into the static root', async () => {
    const requestPath = resolve(tmpdir(), 'fed6lab-source-lock-request.json');
    const expectedRequestSha256Hex = 'f'.repeat(64);
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckWorkerFromArgumentsV1([
        '--request',
        requestPath,
        '--expected-request-sha256',
        expectedRequestSha256Hex,
        '--amount-nano-erg',
        AMOUNT_NANO_ERG,
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
      ]);

    expect(receipt).toEqual(workerReceipt(expectedRequestSha256Hex));
    expect(canonicalJson(receipt)).not.toMatch(
      /eip12Tx|depositPacket|signedTransactionBytesHex|sourceFundingInput/iu,
    );
    expect(mocked.loader).toHaveBeenCalledWith(
      requestPath,
      resolve(process.cwd(), '..'),
      resolve(process.cwd(), '..', '..'),
      expectedRequestSha256Hex,
    );
    expect(mocked.root).toHaveBeenCalledTimes(1);
    expect(mocked.root).toHaveBeenCalledWith({
      ...mocked.loader.mock.results[0]?.value,
      pegIn: {
        amountNanoErg: AMOUNT_NANO_ERG,
        recipientAddressHex: RECIPIENT_ADDRESS_HEX,
      },
    });
  });

  it('runs one disposable worker and publishes only a validated create-only receipt', async () => {
    await withFixture(async fixture => {
      const originalNodeOptions = process.env.NODE_OPTIONS;
      const originalUnsafe = process.env.E2S_UNSAFE_TEST_VALUE;
      process.env.NODE_OPTIONS = '--inspect';
      process.env.E2S_UNSAFE_TEST_VALUE = 'must-not-cross';
      try {
        const result =
          await runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandFromArgumentsV1([
            '--request',
            fixture.requestPath,
            '--amount-nano-erg',
            AMOUNT_NANO_ERG,
            '--recipient-address-hex',
            RECIPIENT_ADDRESS_HEX,
            '--output',
            fixture.outputPath,
          ]);
        const expected = commandReceipt(fixture.requestSha256Hex);
        expect(result).toEqual({
          status: 'isolated_peg_in_source_lock_check_receipt_published',
          receiptDigestHex: expected.receiptDigestHex,
        });
        expect(readFileSync(fixture.outputPath, 'utf8'))
          .toBe(`${canonicalJson(expected)}\n`);

        const processInput = mocked.process.mock.calls[0]?.[0];
        expect(processInput).toMatchObject({
          executablePath: process.execPath,
          cwd: process.cwd(),
          timeoutMs: 90 * 60_000,
          terminationGraceMs: 30_000,
          maxStdoutBytes: 512 * 1024,
          maxStderrBytes: 64 * 1024,
          label: 'isolated peg-in source-lock check worker',
        });
        expect(processInput.args).toEqual([
          'node_modules/tsx/dist/cli.mjs',
          expect.stringMatching(
            /run-substrate-federated-isolated-devnet-peg-in-source-lock-check-worker-v1\.ts$/u,
          ),
          '--request',
          fixture.requestPath,
          '--expected-request-sha256',
          fixture.requestSha256Hex,
          '--amount-nano-erg',
          AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
        ]);
        expect(processInput.env.NODE_OPTIONS).toBeUndefined();
        expect(processInput.env.E2S_UNSAFE_TEST_VALUE).toBeUndefined();
      } finally {
        restoreEnvironment('NODE_OPTIONS', originalNodeOptions);
        restoreEnvironment('E2S_UNSAFE_TEST_VALUE', originalUnsafe);
      }
    });
  });

  it('rejects occupied, in-worktree, and linked output paths before launch', async () => {
    await withFixture(async fixture => {
      writeFileSync(fixture.outputPath, 'occupied\n', 'utf8');
      await expect(runCommand(fixture)).rejects.toThrow('must not already exist');

      const inWorktreeOutput = resolve(
        process.cwd(),
        `.e2s-source-lock-test-${process.pid}.json`,
      );
      await expect(runCommand({
        ...fixture,
        outputPath: inWorktreeOutput,
      })).rejects.toThrow('must remain outside the worktree');

      const realParent = join(fixture.root, 'real-output-parent');
      const linkedParent = join(fixture.root, 'linked-output-parent');
      mkdirSync(realParent);
      symlinkSync(realParent, linkedParent, 'junction');
      await expect(runCommand({
        ...fixture,
        outputPath: join(linkedParent, 'receipt.json'),
      })).rejects.toThrow('must be one regular directory');
      expect(mocked.process).not.toHaveBeenCalled();
    });
  });

  it('revalidates output confinement after the worker exits', async () => {
    await withFixture(async fixture => {
      mocked.process.mockImplementationOnce(async input => {
        writeFileSync(fixture.outputPath, 'raced output\n', 'utf8');
        const requestShaIndex = input.args.indexOf(
          '--expected-request-sha256',
        );
        return {
          pid: 1234,
          exitCode: 0,
          stdout: `${canonicalJson(workerReceipt(
            input.args[requestShaIndex + 1],
          ))}\n`,
          stderr: '',
        };
      });
      await expect(runCommand(fixture)).rejects.toThrow(
        'must not already exist',
      );
      expect(readFileSync(fixture.outputPath, 'utf8')).toBe('raced output\n');
    });
  });

  it('rejects diagnostics, noncanonical output, and authority or binding drift', async () => {
    await withFixture(async fixture => {
      const validWorkerReceipt = workerReceipt(fixture.requestSha256Hex);
      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(validWorkerReceipt)}\n`,
        stderr: 'unexpected diagnostic\n',
      });
      await expect(runCommand(fixture)).rejects.toThrow('emitted diagnostics');

      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${JSON.stringify(validWorkerReceipt, null, 2)}\n`,
        stderr: '',
      });
      await expect(runCommand(fixture)).rejects.toThrow(
        'must be canonical JSON plus one LF',
      );

      const variants = [
        mutateWorkerReceipt(fixture.requestSha256Hex, receipt => {
          receipt.boundaries.valuePathBroadcastAuthorityEstablished = true;
        }),
        workerReceipt('e'.repeat(64)),
        mutateWorkerReceipt(fixture.requestSha256Hex, receipt => {
          receipt.candidate.sourceFundingBoxIdHex = 'a'.repeat(64);
        }),
        mutateWorkerReceipt(fixture.requestSha256Hex, receipt => {
          receipt.setup.transactions[0]!.role = 'pooledReserve';
        }),
      ];
      for (const variant of variants) {
        mocked.process.mockResolvedValueOnce({
          pid: 1234,
          exitCode: 0,
          stdout: `${canonicalJson(variant)}\n`,
          stderr: '',
        });
        await expect(runCommand(fixture)).rejects.toThrow();
        expect(() => readFileSync(fixture.outputPath, 'utf8')).toThrow();
      }
    });
  });

  it('projects no capability payload and rejects rehashed object drift', () => {
    const opaqueRoot = mutateReceipt(receipt => {
      receipt.pegIn.candidate.depositPacket.reserve = {
        signedTransactionBytesHex: 'ab'.repeat(64),
        eip12Tx: { shouldNotEscapeTheWorker: true },
      };
      refreshCandidateDigest(receipt);
    });
    const projection =
      buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
        opaqueRoot,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      );
    expect(canonicalJson(projection)).not.toMatch(
      /signedTransactionBytesHex|eip12Tx|depositPacket|sourceFundingInput/iu,
    );

    const fundingObjectDrift = mutateReceipt(receipt => {
      receipt.pegIn.candidate.depositPacket.boxes.sourceFundingInput = {
        boxId: '9'.repeat(64),
        value: 123,
      };
      refreshCandidateDigest(receipt);
    });
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
        fundingObjectDrift,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('funding, candidate, and check binding changed');

    const unsignedTransactionDrift = mutateReceipt(receipt => {
      receipt.pegIn.candidate.depositPacket.transactions
        .sourceLockCreation.eip12Tx = { mutated: true };
      refreshCandidateDigest(receipt);
    });
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
        unsignedTransactionDrift,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('funding, candidate, and check binding changed');
  });

  it('rejects malformed plans and keeps the process boundary statically scoped', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckWorkerFromArgumentsV1([]),
    ).rejects.toThrow('worker arguments are invalid');
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandFromArgumentsV1([
        '--request',
        'request.json',
        '--amount-nano-erg',
        '0',
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
        '--output',
        'receipt.json',
      ]),
    ).rejects.toThrow('plan is invalid');
    expect(mocked.loader).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();

    const launcher = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-peg-in-source-lock-check-v1.ts',
      import.meta.url,
    ), 'utf8');
    const worker = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-peg-in-source-lock-check-worker-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(launcher).not.toMatch(
      /dotenv|ergo-client|state-tracker|node-wallet|checked-submission-transport/iu,
    );
    expect(launcher).not.toContain(
      'runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1',
    );
    expect(worker).not.toMatch(
      /dotenv|ergo-client|state-tracker|node-wallet|checked-submission-transport/iu,
    );
    expect(worker.match(
      /runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1/gu,
    )).toHaveLength(2);
    expect(launcher).toContain(
      "process.stderr.write('isolated peg-in source-lock check failed\\n')",
    );
    expect(worker).toContain(
      "process.stderr.write('isolated peg-in source-lock worker failed\\n')",
    );

    const packageJson = JSON.parse(readFileSync(
      resolve(process.cwd(), 'package.json'),
      'utf8',
    )) as { scripts: Record<string, string> };
    expect(
      packageJson.scripts[
        'federated:isolated:peg-in-source-lock:check-local'
      ],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-check-v1.ts',
    );
  });
});

async function runCommand(fixture: Readonly<{
  requestPath: string;
  outputPath: string;
}>): Promise<unknown> {
  return runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandFromArgumentsV1([
    '--request',
    fixture.requestPath,
    '--amount-nano-erg',
    AMOUNT_NANO_ERG,
    '--recipient-address-hex',
    RECIPIENT_ADDRESS_HEX,
    '--output',
    fixture.outputPath,
  ]);
}

async function withFixture(
  operation: (fixture: Readonly<{
    root: string;
    requestPath: string;
    requestSha256Hex: string;
    outputPath: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-source-lock-command-'));
  try {
    const requestPath = join(root, 'request.json');
    const requestBytes = Buffer.from('{}\n', 'utf8');
    writeFileSync(requestPath, requestBytes);
    await operation({
      root,
      requestPath,
      requestSha256Hex: createHash('sha256')
        .update(requestBytes)
        .digest('hex'),
      outputPath: join(root, 'receipt.json'),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function commandReceipt(commandRequestSha256Hex: string) {
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-command-receipt.v1',
    version: 1,
    status: 'request_bound_local_peg_in_source_lock_check_completed',
    commandRequestSha256Hex,
    pegIn: {
      amountNanoErg: AMOUNT_NANO_ERG,
      recipientAddressHex: RECIPIENT_ADDRESS_HEX,
    },
    executionReceipt: workerReceipt(commandRequestSha256Hex),
    checks: {
      exactRequestBytesBoundAcrossParentAndWorker: true,
      exactPegInPlanBoundAcrossParentAndWorker: true,
      executionReceiptValidatedBeforePublication: true,
      workerExitedBeforePublication: true,
      outputConfinementRevalidatedImmediatelyBeforePublication: true,
      createOnlyPublicationUsed: true,
    },
    boundaries: {
      signedTransactionBytesReturnedOrPersisted: false,
      physicalSecretMemoryErasureEstablished: false,
      hostileSameUserProcessAttestationEstablished: false,
      independentExecutionAttestationEstablished: false,
      valuePathSubmissionAuthorityEstablished: false,
      valuePathBroadcastAuthorityEstablished: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_COMMAND_RECEIPT_V1',
    ),
  };
}

function workerReceipt(commandRequestSha256Hex: string) {
  return buildSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
    executionReceipt(),
    commandRequestSha256Hex,
    Object.freeze({
      amountNanoErg: AMOUNT_NANO_ERG,
      recipientAddressHex: RECIPIENT_ADDRESS_HEX,
    }),
  );
}

function executionReceipt() {
  const build = buildReceipt();
  const processReceipt = {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
    version: 1,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMiningDuringAction: true,
    witnessReadOnlyDuringAction: true,
    buildIdentityDigestHex: build.buildIdentityDigestHex,
    executableIdentityDigestHex: '4'.repeat(64),
    processBindingDigestHex: '5'.repeat(64),
    executionTargetIdentityDigestHex: '6'.repeat(64),
    initialSnapshot: {
      network: 'devnet',
      fullHeight: 100,
      indexedHeight: 100,
      headerIdHex: 'a'.repeat(64),
    },
    finalSnapshot: {
      network: 'devnet',
      fullHeight: 150,
      indexedHeight: 150,
      headerIdHex: 'b'.repeat(64),
    },
  };
  const setup = {
    lifecycle: {
      federationProfileIdHex: 'c'.repeat(64),
      sourceAttestationKeySetDigestHex: 'd'.repeat(64),
      ergoAdmissionKeySetDigestHex: 'e'.repeat(64),
      packetReceiptDigestHex: 'f'.repeat(64),
      setupCheckReceiptDigestHex: '0'.repeat(64),
      setupRequestDigestHex: '1'.repeat(64),
      executionTargetIdentityDigestHex:
        processReceipt.executionTargetIdentityDigestHex,
    },
    transactions: [
      transaction(0, 'tracker', '1', 110),
      transaction(1, 'duplicatePrevention', '2', 120),
      transaction(2, 'pooledReserve', '3', 130),
    ],
  };
  const sourceFundingBoxIdHex = '9'.repeat(64);
  const sourceLockTransactionIdHex = '8'.repeat(64);
  const sourceFundingBox = { boxId: sourceFundingBoxIdHex };
  const sourceLockTransaction = {
    txId: sourceLockTransactionIdHex,
    eip12Tx: {},
    outputs: [],
  };
  const sourceFundingBoxDigestHex = sha256CanonicalJson(
    sourceFundingBox,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_FUNDING_BOX_V1',
  );
  const unsignedTransactionDigestHex = sha256CanonicalJson(
    sourceLockTransaction,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_TRANSACTION_V1',
  );
  const family = {
    familyIdHex: '4'.repeat(64),
    compilerBindingDigestHex: '5'.repeat(64),
    compilerProvenanceKind: 'same-process-pinned-jvm',
    compilerProvenanceDigestHex: '6'.repeat(64),
  };
  const depositPacket = {
    schema: 'e2s.substrate-federated-pooled-reserve-deposit.v1',
    version: 1,
    trustModel: 'federated_non_trustless',
    familyIdHex: family.familyIdHex,
    familyCompiler: {
      bindingDigestHex: family.compilerBindingDigestHex,
      provenanceKind: family.compilerProvenanceKind,
      provenanceDigestHex: family.compilerProvenanceDigestHex,
    },
    sourceIntentHex: sourceIntentHex(AMOUNT_NANO_ERG),
    depositCommitmentHex: 'aa',
    depositInsertProofHex: 'bb',
    reserve: {},
    transactions: {
      sourceLockCreation: sourceLockTransaction,
      reserveTransition: {},
    },
    boxes: {
      sourceFundingInput: sourceFundingBox,
      sourceLock: {},
      transitionFeeFunding: {},
      reservePredecessor: {},
      reserveSuccessor: {},
    },
    invariants: {
      exactFederatedFamilyBound: true,
      exactSourceIntentBound: true,
      sourceLockCreatedBeforeRefundTimeout: true,
      transitionConsumesExactSourceAndReserve: true,
      depositCommitmentBindsSourceIdAndIntent: true,
      reserveInsertProofReplayed: true,
      reserveValueAndLiabilityIncreaseTogether: true,
      protectedReserveSeedPreserved: true,
      externalFeeIsValueNeutral: true,
      deterministicUnsignedTransactionsConstructed: true,
    },
    boundaries: {
      sourceLockCreationConstructed: true,
      reserveTransitionConstructed: true,
      predecessorStateProvenanceEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      depositCommitmentStateEstablished: false,
      ergoDepositFinalityEstablished: false,
      sidechainMintAcceptanceEstablished: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  const candidateBody = {
    schema: 'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v1',
    version: 1,
    status: 'unsigned_non_authorizing_candidate',
    trustModel: 'federated_non_trustless',
    target: {
      processBindingDigestHex: processReceipt.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        processReceipt.executionTargetIdentityDigestHex,
    },
    setup: {
      requestDigestHex: setup.lifecycle.setupRequestDigestHex,
      checkReceiptDigestHex: setup.lifecycle.setupCheckReceiptDigestHex,
      pooledReserveIssuanceOrdinal: 2,
      pooledReserveTransactionIdHex: setup.transactions[2]!.expectedTxId,
      pooledReserveBoxIdHex: '7'.repeat(64),
    },
    family,
    depositPacket,
    boundaries: {
      exactSetupBatchAndTargetBound: true,
      exactFamilyCompilerBindingConsumed: true,
      pooledReservePredecessorDerivedFromSetup: true,
      deterministicUnsignedDepositConstructed: true,
      setupCanonicalConfirmationEstablished: false,
      sourceFundingObservationEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  const candidate = {
    ...candidateBody,
    candidateDigestHex: sha256CanonicalJson(
      candidateBody,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V1',
    ),
  };
  const checkBody = {
    schema: 'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check.v1',
    version: 1,
    status: 'PASS',
    sourceFundingBoxIdHex,
    unsignedTransactionIdHex: sourceLockTransactionIdHex,
    unsignedTransactionDigestHex,
    signedTransactionIdHex: sourceLockTransactionIdHex,
    signedTransactionCanonicalJsonSha256Hex: '2'.repeat(64),
    signedTransactionBytesSha256Hex: '3'.repeat(64),
    signedTransactionBytesLength: 1234,
    checkResponseSha256Hex: '4'.repeat(64),
    target: {
      processBindingDigestHex: processReceipt.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        processReceipt.executionTargetIdentityDigestHex,
    },
    signer: {
      derivation: 'wasm-root',
      publicKeyHex: `02${'5'.repeat(64)}`,
      p2pkErgoTreeHex: '0008cd025555',
      stateContextTipHeight: 140,
      stateContextTipIdHex: '6'.repeat(64),
    },
    checker: {
      nodeOrigin: 'http://127.0.0.1:9051',
      path: '/transactions/check',
      method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      exactProcessOwnedTargetBound: true,
      exactTransactionAndSourceBoxBound: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      signedTransactionBytesPersisted: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  const sourceLockCheck = {
    ...checkBody,
    receiptDigestHex: sha256CanonicalJson(
      checkBody,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1',
    ),
  };
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-execution-root.v1',
    version: 1,
    status: 'setup_confirmed_and_peg_in_source_lock_node_check_passed',
    staticExecutionManifestDigestHex:
      '863900bbef60e43e1207f85c3dab855bb524c43cbfd84ef8a58e7520b9b417da',
    build,
    process: processReceipt,
    setup,
    pegIn: {
      fundingObservation: {
        reportDigestHex: '1'.repeat(64),
        observedAt: '2026-08-18T10:00:00.000Z',
        primaryNodeOrigin: 'http://127.0.0.1:9051',
        witnessNodeOrigin: 'http://127.0.0.1:9052',
        genesisHeaderIdHex: '2'.repeat(64),
        tipHeight: 130,
        tipHeaderIdHex: '3'.repeat(64),
        sourceFundingBoxIdHex,
        sourceFundingBoxDigestHex,
        postCandidateReportDigestHex: '5'.repeat(64),
        postCandidateTipHeight: 135,
        postCandidateTipHeaderIdHex: '6'.repeat(64),
        postCheckReportDigestHex: '7'.repeat(64),
        postCheckTipHeight: 140,
        postCheckTipHeaderIdHex: '8'.repeat(64),
      },
      candidate,
      sourceLockCheck,
    },
    checks: {
      setupCandidateAndCheckCompletedInOneTargetLifetime: true,
      exactCandidateFundingAndUnsignedTransactionBound: true,
      sourceFundingRevalidatedImmediatelyBeforeSigning: true,
      sourceFundingRevalidatedAfterNodeCheck: true,
      exactSameNodeSigningContextAndJvmCheckUsed: true,
      signedTransactionBytesReturnedOrPersisted: false,
      returnedValueContainsCapabilities: false,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      localSetupCanonicalConfirmationEstablished: true,
      localSourceFundingObservationEstablished: true,
      valuePathLocalSyntheticSigningPerformed: true,
      valuePathJvmNodeCheckPassed: true,
      valuePathSubmissionAuthorityEstablished: false,
      valuePathBroadcastAuthorityEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      existingWalletMaterialUsed: false,
      sourceConsensusIndependentlyAuthenticated: false,
      ergoConsensusIndependentlyAuthenticated: false,
      profileActivated: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1',
    ),
  };
}

function sourceIntentHex(amountNanoErg: string): string {
  return encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: '01'.repeat(32),
    sidechainIdHex: '02'.repeat(32),
    bridgeAddressHex: '03'.repeat(20),
    tokenAddressHex: '04'.repeat(20),
    settlementProfileIdHex: '05'.repeat(32),
    admissionProfileIdHex: '06'.repeat(32),
    sourceAssetIdHex: '07'.repeat(32),
    amountNanoErg,
    recipientAddressHex: RECIPIENT_ADDRESS_HEX,
  });
}

function buildReceipt() {
  const build = {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-build.v1',
    version: 1,
    status: 'exact_locked_patched_node_built',
    source: {
      consensusSourceLockSha256Hex: '1'.repeat(64),
      sourceBaselineDigestHex: '2'.repeat(64),
      ergoNodeBaseCommit: '3'.repeat(40),
      ergoPatchSha256Hex: '4'.repeat(64),
    },
    toolchain: {
      platform: 'win32-x64',
      gitVersion: '2.54.0.windows.1',
      gitExecutableSha256Hex: '5'.repeat(64),
      javaMajorVersion: 17,
      javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS',
      javaHomeSha256Hex: '6'.repeat(64),
      javaExecutableSha256Hex: '7'.repeat(64),
      sbtLauncherJarSha256Hex: '8'.repeat(64),
      projectSbtVersion: '1.11.1',
    },
    build: {
      invocation:
        'reviewed Windows Job Object -> java -jar <pinned-sbt-launcher> assembly',
      processRunner: 'reviewed-windows-job-object-v1',
      processRunnerSha256Hex: '9'.repeat(64),
      timeoutMs: 900_000,
      terminationGraceMs: 10_000,
      maxOutputBytes: 16_777_216,
      artifactName: 'ergo-node.jar',
      artifactBytes: 123_456,
      artifactSha256Hex: 'a'.repeat(64),
    },
    checks: Object.fromEntries([
      'exactTrackedRuntimeLockConsumed',
      'exactConsensusSourceLockConsumed',
      'exactPatchedSourceValidatedBeforeBuild',
      'exactPatchedSourceRevalidatedAfterBuild',
      'completeJavaDistributionValidatedBeforeAndAfterBuild',
      'pinnedGitExecutableValidatedBeforeAndAfterBuild',
      'pinnedSbtLauncherValidatedBeforeAndAfterBuild',
      'reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild',
      'fixedJavaArgumentsLaunchedWithoutShell',
      'inheritedBuildEnvironmentMinimized',
      'preexistingAssemblyCandidatesRejected',
      'assemblyPathChainLinkFree',
      'buildProcessTimeBound',
      'buildProcessTreeTerminationBounded',
      'singleFreshAssemblySelected',
    ].map(key => [key, true])),
    buildIdentityDigestHex: 'b'.repeat(64),
    boundaries: {
      loadedBytesAttestedAgainstHostileSameUserProcess: false,
      dependencyCacheContentAttested: false,
      independentBuildAttestationVerified: false,
      targetNodeAcceptanceEstablished: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
  };
  const { buildIdentityDigestHex: _placeholder, ...identity } = build;
  build.buildIdentityDigestHex = sha256CanonicalJson(
    identity,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1',
  );
  return build;
}

function transaction(
  ordinal: number,
  role: string,
  idSeed: string,
  confirmationHeight: number,
) {
  return {
    ordinal,
    role,
    expectedTxId: idSeed.repeat(64),
    transportStatus: 'accepted',
    durableAttemptDigestHex: '4'.repeat(64),
    journalDigestHex: '5'.repeat(64),
    confirmationDigestHex: '6'.repeat(64),
    confirmationHeight,
    confirmationHeaderIdHex: '7'.repeat(64),
  };
}

type MutableReceipt = ReturnType<typeof executionReceipt> & {
  boundaries: { valuePathBroadcastAuthorityEstablished: boolean };
  pegIn: {
    fundingObservation: { sourceFundingBoxIdHex: string };
    candidate: {
      candidateDigestHex: string;
      target: { processBindingDigestHex: string };
      depositPacket: {
        sourceIntentHex: string;
        reserve: unknown;
        boxes: {
          sourceFundingInput: Record<string, unknown>;
        };
        transactions: {
          sourceLockCreation: {
            eip12Tx: Record<string, unknown>;
          };
        };
      };
    };
    sourceLockCheck: {
      receiptDigestHex: string;
      boundaries: { signedTransactionBytesPersisted: boolean };
    };
  };
};

function mutateReceipt(mutate: (receipt: MutableReceipt) => void) {
  const receipt = structuredClone(executionReceipt()) as MutableReceipt;
  mutate(receipt);
  refreshRootReceiptDigest(receipt);
  return receipt;
}

type MutableWorkerReceipt = {
  boundaries: { valuePathBroadcastAuthorityEstablished: boolean };
  candidate: { sourceFundingBoxIdHex: string };
  setup: { transactions: { role: string }[] };
  receiptDigestHex: string;
};

function mutateWorkerReceipt(
  commandRequestSha256Hex: string,
  mutate: (receipt: MutableWorkerReceipt) => void,
) {
  const receipt = structuredClone(
    workerReceipt(commandRequestSha256Hex),
  ) as unknown as MutableWorkerReceipt;
  mutate(receipt);
  const { receiptDigestHex: _discarded, ...body } = receipt;
  receipt.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_WORKER_RECEIPT_V1',
  );
  return receipt;
}

function refreshCandidateDigest(receipt: MutableReceipt): void {
  const { candidateDigestHex: _discarded, ...body } = receipt.pegIn.candidate;
  receipt.pegIn.candidate.candidateDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V1',
  );
}

function refreshSourceLockCheckDigest(receipt: MutableReceipt): void {
  const { receiptDigestHex: _discarded, ...body } =
    receipt.pegIn.sourceLockCheck;
  receipt.pegIn.sourceLockCheck.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_V1',
  );
}

function refreshRootReceiptDigest(receipt: MutableReceipt): void {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  receipt.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1',
  );
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
