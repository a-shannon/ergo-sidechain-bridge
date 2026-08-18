import { createHash } from 'node:crypto';
import {
  existsSync,
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
  committedVaultRoot: vi.fn(),
  executionRoot: vi.fn(),
  loader: vi.fn(),
  process: vi.fn(),
  root: vi.fn(),
}));

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js',
  () => ({
    runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1:
      mocked.root,
    runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1:
      mocked.executionRoot,
    runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1:
      mocked.committedVaultRoot,
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
  runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCommandFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-worker-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1,
  parseSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-receipt-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-check-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCommandFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckWorkerFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-check-worker-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerFromArgumentsV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-worker-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
  parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-receipt-v1.js';
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
    mocked.executionRoot.mockResolvedValue({
      receipt: sourceLockExecutionReceipt(),
    });
    mocked.process.mockImplementation(async input => {
      const requestShaIndex = input.args.indexOf('--expected-request-sha256');
      const requestSha = input.args[requestShaIndex + 1];
      const executionWorker = input.args[1].endsWith(
        'run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-worker-v1.ts',
      );
      return {
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(
          executionWorker
            ? executionWorkerReceipt(requestSha)
            : workerReceipt(requestSha),
        )}\n`,
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

  it('publishes one create-only source-lock execution receipt', async () => {
    await withFixture(async fixture => {
      const originalNodeOptions = process.env.NODE_OPTIONS;
      const originalUnsafe = process.env.E2S_UNSAFE_TEST_VALUE;
      const originalTemp = process.env.TEMP;
      const originalTmp = process.env.TMP;
      process.env.NODE_OPTIONS = '--inspect';
      process.env.E2S_UNSAFE_TEST_VALUE = 'must-not-cross';
      process.env.TEMP = process.cwd();
      process.env.TMP = process.cwd();
      try {
        const result = await runExecutionCommand(fixture);
        const expected = executionCommandReceipt(fixture.requestSha256Hex);
        expect(result).toEqual({
          status: 'isolated_peg_in_source_lock_execution_receipt_published',
          receiptDigestHex: expected.receiptDigestHex,
        });
        expect(readFileSync(fixture.outputPath, 'utf8'))
          .toBe(`${canonicalJson(expected)}\n`);
        expect(expected.boundaries).toMatchObject({
          sourceLockCreationConfirmed: true,
          sourceLockStillRefundable: true,
          sourceLockConsumptionEstablished: false,
          reserveLineageEstablished: false,
          mintAuthorized: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
        });

        const processInput = mocked.process.mock.calls[0]?.[0];
        expect(processInput).toMatchObject({
          executablePath: process.execPath,
          cwd: process.cwd(),
          timeoutMs: 90 * 60_000,
          terminationGraceMs: 30_000,
          maxStdoutBytes: 2 * 1024 * 1024,
          maxStderrBytes: 64 * 1024,
          label: 'isolated peg-in source-lock execution worker',
        });
        expect(processInput.args).toEqual([
          'node_modules/tsx/dist/cli.mjs',
          expect.stringMatching(
            /run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-worker-v1\.ts$/u,
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
        expect(processInput.env.TEMP).toBe(
          resolve(process.cwd(), '..', '..', '..'),
        );
        expect(processInput.env.TMP).toBe(processInput.env.TEMP);
      } finally {
        restoreEnvironment('NODE_OPTIONS', originalNodeOptions);
        restoreEnvironment('E2S_UNSAFE_TEST_VALUE', originalUnsafe);
        restoreEnvironment('TEMP', originalTemp);
        restoreEnvironment('TMP', originalTmp);
      }
    });
  });

  it('keeps execution publication create-only across path races', async () => {
    await withFixture(async fixture => {
      writeFileSync(fixture.outputPath, 'occupied\n', 'utf8');
      await expect(runExecutionCommand(fixture)).rejects.toThrow(
        'must not already exist',
      );
      expect(mocked.process).not.toHaveBeenCalled();
      rmSync(fixture.outputPath);

      const inWorktreeOutput = resolve(
        process.cwd(),
        `.e2s-source-lock-execution-test-${process.pid}.json`,
      );
      await expect(runExecutionCommand({
        ...fixture,
        outputPath: inWorktreeOutput,
      })).rejects.toThrow('must remain outside the worktree');
      expect(mocked.process).not.toHaveBeenCalled();

      const realParent = join(fixture.root, 'execution-output-parent');
      const linkedParent = join(fixture.root, 'linked-execution-output-parent');
      mkdirSync(realParent);
      symlinkSync(realParent, linkedParent, 'junction');
      await expect(runExecutionCommand({
        ...fixture,
        outputPath: join(linkedParent, 'receipt.json'),
      })).rejects.toThrow('must be one regular directory');
      expect(mocked.process).not.toHaveBeenCalled();

      mocked.process.mockImplementationOnce(async input => {
        writeFileSync(fixture.outputPath, 'raced output\n', 'utf8');
        const requestShaIndex = input.args.indexOf(
          '--expected-request-sha256',
        );
        return {
          pid: 1234,
          exitCode: 0,
          stdout: `${canonicalJson(executionWorkerReceipt(
            input.args[requestShaIndex + 1],
          ))}\n`,
          stderr: '',
        };
      });
      await expect(runExecutionCommand(fixture)).rejects.toThrow(
        'must not already exist',
      );
      expect(readFileSync(fixture.outputPath, 'utf8')).toBe('raced output\n');
    });
  });

  it('rejects execution worker diagnostics and rehashed authority drift', async () => {
    await withFixture(async fixture => {
      const validReceipt = executionWorkerReceipt(fixture.requestSha256Hex);
      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(validReceipt)}\n`,
        stderr: 'unexpected diagnostic\n',
      });
      await expect(runExecutionCommand(fixture)).rejects.toThrow(
        'emitted diagnostics',
      );

      const drift = structuredClone(validReceipt) as any;
      drift.boundaries.mintAuthorized = true;
      refreshExecutionWorkerReceiptDigest(drift);
      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(drift)}\n`,
        stderr: '',
      });
      await expect(runExecutionCommand(fixture)).rejects.toThrow(
        'execution worker boundaries changed',
      );
      expect(() => readFileSync(fixture.outputPath, 'utf8')).toThrow();
    });
  });

  it('rejects inherited runtime paths inside the worktree', async () => {
    await withFixture(async fixture => {
      const originalJavaHome = process.env.JAVA_HOME;
      process.env.JAVA_HOME = process.cwd();
      try {
        await expect(runExecutionCommand(fixture)).rejects.toThrow(
          'JAVA_HOME must remain outside the worktree',
        );
        expect(mocked.process).not.toHaveBeenCalled();
      } finally {
        restoreEnvironment('JAVA_HOME', originalJavaHome);
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
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCommandFromArgumentsV1([
        '--request',
        'request.json',
        '--amount-nano-erg',
        '0',
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
        '--output',
        'receipt.json',
      ]),
    ).rejects.toThrow('execution plan is invalid');
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
    const executionWorker = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-worker-v1.ts',
      import.meta.url,
    ), 'utf8');
    const executionLauncher = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.ts',
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
    expect(executionWorker).not.toMatch(
      /dotenv|ergo-client|state-tracker|node-wallet|checked-submission-transport/iu,
    );
    expect(executionLauncher).not.toMatch(
      /dotenv|ergo-client|state-tracker|node-wallet|checked-submission-transport/iu,
    );
    expect(executionLauncher).not.toContain(
      'runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1',
    );
    expect(worker.match(
      /runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1/gu,
    )).toHaveLength(2);
    expect(executionWorker.match(
      /runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1/gu,
    )).toHaveLength(2);
    expect(executionWorker).not.toContain(
      'runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1',
    );
    expect(launcher).toContain(
      "process.stderr.write('isolated peg-in source-lock check failed\\n')",
    );
    expect(worker).toContain(
      "process.stderr.write('isolated peg-in source-lock worker failed\\n')",
    );
    expect(executionWorker).toContain(
      "process.stderr.write('isolated source-lock execution worker failed\\n')",
    );
    expect(executionLauncher).toContain(
      "process.stderr.write('isolated peg-in source-lock execution failed\\n')",
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
    expect(
      packageJson.scripts[
        'federated:isolated:peg-in-source-lock:execute-local'
      ],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.ts',
    );
  });

  it('runs the distinct execution worker and returns a path-free committed receipt', async () => {
    const requestPath = resolve(tmpdir(), 'fed6lab-source-lock-request.json');
    const expectedRequestSha256Hex = 'f'.repeat(64);
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerFromArgumentsV1([
        '--request',
        requestPath,
        '--expected-request-sha256',
        expectedRequestSha256Hex,
        '--amount-nano-erg',
        AMOUNT_NANO_ERG,
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
      ]);
    expect(mocked.executionRoot).toHaveBeenCalledTimes(1);
    expect(mocked.root).not.toHaveBeenCalled();
    expect(receipt).toEqual(executionWorkerReceipt(expectedRequestSha256Hex));
    expect(receipt.boundaries).toMatchObject({
      valuePathSubmissionExecuted: true,
      valuePathBroadcastExecuted: true,
      sourceLockCreationConfirmed: true,
      sourceLockStillRefundable: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
    });
    expect(canonicalJson(receipt)).not.toMatch(
      /signedTransactionBytesHex|mnemonic|privateKey/iu,
    );
    expect(canonicalJson(receipt)).not.toMatch(
      /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u,
    );
  });

  it('rejects candidate/output and projected execution mutations', () => {
    const root = structuredClone(sourceLockExecutionReceipt()) as any;
    root.pegIn.sourceLockExecution.outputObservation.sourceLockBoxIdHex =
      'f'.repeat(64);
    refreshOutputObservationDigest(root);
    refreshExecutionRootReceiptDigest(root);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        root,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('execution and output binding changed');

    const projected = structuredClone(
      executionWorkerReceipt('f'.repeat(64)),
    ) as any;
    projected.execution.observedSourceLockBoxIdHex = 'e'.repeat(64);
    refreshExecutionWorkerReceiptDigest(projected);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        `${canonicalJson(projected)}\n`,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('projected source-lock execution binding changed');
  });

  it('rejects coordinated projection substitution outside the committed root', () => {
    const projected = structuredClone(
      executionWorkerReceipt('f'.repeat(64)),
    ) as any;
    projected.execution.durableAttemptDigestHex = '3'.repeat(64);
    projected.execution.journalDigestHex = '4'.repeat(64);
    projected.execution.confirmationDigestHex = '5'.repeat(64);
    projected.execution.outputConfirmationDigestHex = '5'.repeat(64);
    projected.execution.confirmationHeight = 146;
    projected.execution.outputConfirmationHeight = 146;
    projected.execution.confirmationHeaderIdHex = '7'.repeat(64);
    projected.execution.outputConfirmationHeaderIdHex = '7'.repeat(64);
    projected.execution.preTransportReportDigestHex = '8'.repeat(64);
    projected.execution.preTransportTipHeight = 143;
    projected.execution.preTransportTipHeaderIdHex = '9'.repeat(64);
    projected.execution.candidateSourceLockBoxIdHex = 'a'.repeat(64);
    projected.execution.observedSourceLockBoxIdHex = 'a'.repeat(64);
    projected.execution.candidateTransitionFeeFundingBoxIdHex = 'b'.repeat(64);
    projected.execution.observedTransitionFeeFundingBoxIdHex = 'b'.repeat(64);
    projected.execution.outputObservationDigestHex = 'c'.repeat(64);
    projected.execution.primaryObservationDigestHex = 'd'.repeat(64);
    projected.execution.witnessObservationDigestHex = 'd'.repeat(64);
    refreshExecutionWorkerReceiptDigest(projected);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        `${canonicalJson(projected)}\n`,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('projection differs from committed root');
  });

  it.each([
    ['signedTransactionBytesHex', 'ab'.repeat(64)],
    ['submissionHandle', { serialized: true }],
    ['privateKeyHex', 'cd'.repeat(32)],
    ['signedTransactionHex', 'ef'.repeat(64)],
    ['apiKey', 'synthetic-api-key'],
    ['signerArtifact', { serialized: true }],
    ['checkerArtifact', { serialized: true }],
  ])(
    'rejects rehashed %s material hidden in the committed root',
    (key, value) => {
      const opaqueRoot = structuredClone(sourceLockExecutionReceipt()) as any;
      opaqueRoot.pegIn.candidate.depositPacket.reserve = {
        [key]: value,
      };
      refreshCandidateDigest(opaqueRoot);
      refreshExecutionRootReceiptDigest(opaqueRoot);
      expect(() =>
        buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
          opaqueRoot,
          'f'.repeat(64),
          Object.freeze({
            amountNanoErg: AMOUNT_NANO_ERG,
            recipientAddressHex: RECIPIENT_ADDRESS_HEX,
          }),
        )
      ).toThrow('signed or capability material');
    },
  );

  it('rejects impossible source-lock execution chronology', () => {
    const checkAfterAuthorization = structuredClone(
      sourceLockExecutionReceipt(),
    ) as any;
    checkAfterAuthorization.pegIn.fundingObservation.preTransportTipHeight =
      139;
    refreshExecutionRootReceiptDigest(checkAfterAuthorization);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        checkAfterAuthorization,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('execution pre-transport funding changed');

    const beforeAuthorization = structuredClone(
      sourceLockExecutionReceipt(),
    ) as any;
    beforeAuthorization.pegIn.fundingObservation.preTransportTipHeight = 146;
    refreshExecutionRootReceiptDigest(beforeAuthorization);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        beforeAuthorization,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('execution chronology changed');

    const afterTeardown = structuredClone(
      sourceLockExecutionReceipt(),
    ) as any;
    afterTeardown.pegIn.sourceLockExecution.confirmationHeight = 151;
    afterTeardown.pegIn.sourceLockExecution.outputObservation.confirmationHeight =
      151;
    refreshOutputObservationDigest(afterTeardown);
    refreshExecutionRootReceiptDigest(afterTeardown);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        afterTeardown,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('execution chronology changed');

    const projected = structuredClone(
      executionWorkerReceipt('f'.repeat(64)),
    ) as any;
    projected.execution.preTransportTipHeight = 146;
    refreshExecutionWorkerReceiptDigest(projected);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        `${canonicalJson(projected)}\n`,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('projected source-lock execution binding changed');

    const projectedAfterTeardown = structuredClone(
      executionWorkerReceipt('f'.repeat(64)),
    ) as any;
    projectedAfterTeardown.execution.confirmationHeight = 151;
    projectedAfterTeardown.execution.outputConfirmationHeight = 151;
    refreshExecutionWorkerReceiptDigest(projectedAfterTeardown);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
        `${canonicalJson(projectedAfterTeardown)}\n`,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('projected source-lock execution binding changed');
  });
});

describe('isolated devnet peg-in committed-vault execution command V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.loader.mockReturnValue(Object.freeze({
      build: Object.freeze({ source: 'canonical-request' }),
      lifecycle: Object.freeze({ source: 'canonical-request' }),
    }));
    mocked.committedVaultRoot.mockResolvedValue({
      receipt: committedVaultExecutionReceipt(),
    });
    mocked.process.mockImplementation(async input => {
      const requestShaIndex = input.args.indexOf('--expected-request-sha256');
      const requestSha = input.args[requestShaIndex + 1];
      return {
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(
          committedVaultExecutionWorkerReceipt(requestSha),
        )}\n`,
        stderr: '',
      };
    });
  });

  it('maps one request-bound plan only into the committed-vault execution root', async () => {
    const requestPath = resolve(tmpdir(), 'fed6lab-committed-vault-request.json');
    const expectedRequestSha256Hex = 'f'.repeat(64);
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerFromArgumentsV1([
        '--request',
        requestPath,
        '--expected-request-sha256',
        expectedRequestSha256Hex,
        '--amount-nano-erg',
        AMOUNT_NANO_ERG,
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
      ]);

    expect(mocked.committedVaultRoot).toHaveBeenCalledTimes(1);
    expect(mocked.committedVaultRoot).toHaveBeenCalledWith({
      ...mocked.loader.mock.results[0]?.value,
      pegIn: {
        amountNanoErg: AMOUNT_NANO_ERG,
        recipientAddressHex: RECIPIENT_ADDRESS_HEX,
      },
    });
    expect(receipt).toEqual(
      committedVaultExecutionWorkerReceipt(expectedRequestSha256Hex),
    );
    expect(receipt.boundaries).toMatchObject({
      sourceLockCreationConfirmed: true,
      sourceLockStillRefundable: false,
      sourceLockConsumptionEstablished: true,
      reserveLineageEstablished: true,
      depositCommitmentStateEstablished: true,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
    expect(canonicalJson(receipt)).not.toMatch(
      /signedTransactionBytesHex|mnemonic|privateKey/iu,
    );
    expect(canonicalJson(receipt)).not.toMatch(
      /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u,
    );
  });

  it('runs one disposable worker and publishes one validated create-only receipt', async () => {
    await withFixture(async fixture => {
      const result =
        await runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--amount-nano-erg',
          AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--output',
          fixture.outputPath,
        ]);
      const published = JSON.parse(
        readFileSync(fixture.outputPath, 'utf8'),
      ) as any;
      expect(result).toEqual({
        status: 'isolated_peg_in_committed_vault_execution_receipt_published',
        receiptDigestHex: published.receiptDigestHex,
      });
      expect(published).toMatchObject({
        schema:
          'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-execution-command-receipt.v1',
        version: 1,
        status:
          'request_bound_local_peg_in_committed_vault_execution_completed',
        commandRequestSha256Hex: fixture.requestSha256Hex,
        boundaries: {
          sourceLockStillRefundable: false,
          sourceLockConsumptionEstablished: true,
          reserveLineageEstablished: true,
          depositCommitmentStateEstablished: true,
          mintAuthorized: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
        },
      });
      const { receiptDigestHex, ...body } = published;
      expect(receiptDigestHex).toBe(sha256CanonicalJson(
        body,
        'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_COMMAND_RECEIPT_V1',
      ));
      const processInput = mocked.process.mock.calls[0]?.[0];
      expect(processInput).toMatchObject({
        executablePath: process.execPath,
        cwd: process.cwd(),
        timeoutMs: 90 * 60_000,
        terminationGraceMs: 30_000,
        maxStdoutBytes: 4 * 1024 * 1024,
        maxStderrBytes: 64 * 1024,
        label: 'isolated peg-in committed-vault execution worker',
      });
      expect(processInput.args).toEqual([
        'node_modules/tsx/dist/cli.mjs',
        expect.stringMatching(
          /run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-worker-v1\.ts$/u,
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
    });
  });

  it('fails closed before publication on occupied output or invalid worker output', async () => {
    await withFixture(async fixture => {
      writeFileSync(fixture.outputPath, 'occupied\n', 'utf8');
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--amount-nano-erg',
          AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow('must not already exist');
      expect(readFileSync(fixture.outputPath, 'utf8')).toBe('occupied\n');
      expect(mocked.process).not.toHaveBeenCalled();
      rmSync(fixture.outputPath);

      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: '{}\n',
        stderr: '',
      });
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--amount-nano-erg',
          AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow('fields differ from V1');
      expect(existsSync(fixture.outputPath)).toBe(false);

      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(
          committedVaultExecutionWorkerReceipt(fixture.requestSha256Hex),
        )}\n`,
        stderr: 'unexpected diagnostics',
      });
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCommandFromArgumentsV1([
          '--request',
          fixture.requestPath,
          '--amount-nano-erg',
          AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--output',
          fixture.outputPath,
        ]),
      ).rejects.toThrow('worker emitted diagnostics');
      expect(existsSync(fixture.outputPath)).toBe(false);
    });
  });

  it('rejects independently rehashed transition, check, and observation mutations', () => {
    const successorMismatch = structuredClone(
      committedVaultExecutionReceipt(),
    ) as any;
    successorMismatch.pegIn.committedVaultExecution.outputObservation
      .reserveSuccessorBoxIdHex = 'e'.repeat(64);
    refreshCommittedVaultOutputObservationDigest(successorMismatch);
    refreshCommittedVaultExecutionRootDigest(successorMismatch);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      successorMismatch,
    )).toThrow('committed-vault output binding changed');

    const unsafeCheck = structuredClone(committedVaultExecutionReceipt()) as any;
    unsafeCheck.pegIn.committedVaultCheck.boundaries.mintAuthorized = true;
    refreshCommittedVaultCheckDigest(unsafeCheck);
    refreshCommittedVaultExecutionRootDigest(unsafeCheck);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      unsafeCheck,
    )).toThrow('committed-vault check boundaries changed');

    const disagreement = structuredClone(
      committedVaultExecutionReceipt(),
    ) as any;
    disagreement.pegIn.committedVaultExecution.preTransportObservation
      .witnessObservationDigestHex = 'f'.repeat(64);
    refreshCommittedVaultPreTransportObservationDigest(disagreement);
    refreshCommittedVaultExecutionRootDigest(disagreement);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      disagreement,
    )).toThrow('committed-vault pre-transport binding changed');

    const staleConfirmation = structuredClone(
      committedVaultExecutionReceipt(),
    ) as any;
    staleConfirmation.pegIn.committedVaultExecution.outputObservation
      .confirmationHeaderIdHex = 'f'.repeat(64);
    refreshCommittedVaultOutputObservationDigest(staleConfirmation);
    refreshCommittedVaultExecutionRootDigest(staleConfirmation);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      staleConfirmation,
    )).toThrow('committed-vault execution chronology or binding changed');
  });

  it('binds the committed-vault JVM check between source confirmation and transport', () => {
    const beforeSourceConfirmation = structuredClone(
      committedVaultExecutionReceipt(),
    ) as any;
    beforeSourceConfirmation.pegIn.committedVaultCheck.signer
      .stateContextTipHeight = 144;
    refreshCommittedVaultCheckDigest(beforeSourceConfirmation);
    refreshCommittedVaultExecutionRootDigest(beforeSourceConfirmation);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      beforeSourceConfirmation,
    )).toThrow('committed-vault check chronology changed');

    const wrongSourceHeader = structuredClone(
      committedVaultExecutionReceipt(),
    ) as any;
    wrongSourceHeader.pegIn.committedVaultCheck.signer.stateContextTipHeight =
      145;
    wrongSourceHeader.pegIn.committedVaultCheck.signer.stateContextTipIdHex =
      'f'.repeat(64);
    refreshCommittedVaultCheckDigest(wrongSourceHeader);
    refreshCommittedVaultExecutionRootDigest(wrongSourceHeader);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      wrongSourceHeader,
    )).toThrow('committed-vault check chronology changed');

    const afterPreTransport = structuredClone(
      committedVaultExecutionReceipt(),
    ) as any;
    afterPreTransport.pegIn.committedVaultCheck.signer.stateContextTipHeight =
      147;
    refreshCommittedVaultCheckDigest(afterPreTransport);
    refreshCommittedVaultExecutionRootDigest(afterPreTransport);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      afterPreTransport,
    )).toThrow('committed-vault execution chronology or binding changed');

    const wrongPreTransportHeader = structuredClone(
      committedVaultExecutionReceipt(),
    ) as any;
    wrongPreTransportHeader.pegIn.committedVaultCheck.signer
      .stateContextTipIdHex = 'f'.repeat(64);
    refreshCommittedVaultCheckDigest(wrongPreTransportHeader);
    refreshCommittedVaultExecutionRootDigest(wrongPreTransportHeader);
    expect(() => committedVaultExecutionWorkerReceipt(
      'f'.repeat(64),
      wrongPreTransportHeader,
    )).toThrow('committed-vault execution chronology or binding changed');
  });

  it('rejects a coordinated projection substitution outside the committed root', () => {
    const projected = structuredClone(
      committedVaultExecutionWorkerReceipt('f'.repeat(64)),
    ) as any;
    projected.execution.durableAttemptDigestHex = 'f'.repeat(64);
    refreshCommittedVaultExecutionWorkerReceiptDigest(projected);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1(
        `${canonicalJson(projected)}\n`,
        'f'.repeat(64),
        Object.freeze({
          amountNanoErg: AMOUNT_NANO_ERG,
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow('projection differs from committed root');
  });

  it('keeps the launcher capability-free and exposes the exact guarded npm command', () => {
    const worker = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-worker-v1.ts',
      import.meta.url,
    ), 'utf8');
    const launcher = readFileSync(new URL(
      './run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(worker).not.toMatch(
      /dotenv|ergo-client|state-tracker|node-wallet|checked-submission-transport/iu,
    );
    expect(launcher).not.toMatch(
      /dotenv|ergo-client|state-tracker|node-wallet|checked-submission-transport/iu,
    );
    expect(launcher).not.toContain(
      'runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1',
    );
    expect(worker.match(
      /runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1/gu,
    )).toHaveLength(2);
    const packageJson = JSON.parse(readFileSync(
      resolve(process.cwd(), 'package.json'),
      'utf8',
    )) as { scripts: Record<string, string> };
    expect(
      packageJson.scripts[
        'federated:isolated:peg-in-committed-vault:execute-local'
      ],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-v1.ts',
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

async function runExecutionCommand(fixture: Readonly<{
  requestPath: string;
  outputPath: string;
}>): Promise<unknown> {
  return runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCommandFromArgumentsV1([
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

function executionCommandReceipt(commandRequestSha256Hex: string) {
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-command-receipt.v1',
    version: 1,
    status: 'request_bound_local_peg_in_source_lock_execution_completed',
    commandRequestSha256Hex,
    pegIn: {
      amountNanoErg: AMOUNT_NANO_ERG,
      recipientAddressHex: RECIPIENT_ADDRESS_HEX,
    },
    executionReceipt: executionWorkerReceipt(commandRequestSha256Hex),
    checks: {
      exactRequestBytesBoundAcrossParentAndWorker: true,
      exactPegInPlanBoundAcrossParentAndWorker: true,
      executionReceiptValidatedBeforePublication: true,
      workerExitedBeforePublication: true,
      outputConfinementRevalidatedImmediatelyBeforePublication: true,
      createOnlyPublicationUsed: true,
    },
    boundaries: {
      sourceLockCreationConfirmed: true,
      sourceLockStillRefundable: true,
      signedTransactionBytesReturnedOrPersisted: false,
      physicalSecretMemoryErasureEstablished: false,
      hostileSameUserProcessAttestationEstablished: false,
      independentExecutionAttestationEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
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
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_COMMAND_RECEIPT_V1',
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

function executionWorkerReceipt(commandRequestSha256Hex: string) {
  return buildSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
    sourceLockExecutionReceipt(),
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
  const reserveTransition = {
    txId: '7'.repeat(64),
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
      reserveTransition,
    },
    boxes: {
      sourceFundingInput: sourceFundingBox,
      sourceLock: { boxId: 'a'.repeat(64) },
      transitionFeeFunding: { boxId: 'b'.repeat(64) },
      reservePredecessor: { boxId: 'c'.repeat(64) },
      reserveSuccessor: { boxId: 'd'.repeat(64) },
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

function sourceLockExecutionReceipt() {
  const checked = executionReceipt();
  const expectedTxId =
    checked.pegIn.candidate.depositPacket.transactions.sourceLockCreation.txId;
  const sourceFundingBoxIdHex =
    checked.pegIn.candidate.depositPacket.boxes.sourceFundingInput.boxId;
  const sourceLockBoxIdHex =
    checked.pegIn.candidate.depositPacket.boxes.sourceLock.boxId;
  const transitionFeeFundingBoxIdHex =
    checked.pegIn.candidate.depositPacket.boxes.transitionFeeFunding.boxId;
  const confirmationHeight = 145;
  const confirmationHeaderIdHex = 'd'.repeat(64);
  const confirmationObservationDigestHex = 'c'.repeat(64);
  const nodeObservationDigestHex = 'e'.repeat(64);
  const outputBody = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1',
    version: 1,
    status: 'exact_source_spent_and_refundable_outputs_unspent',
    expectedTxId,
    sourceFundingBoxIdHex,
    sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex,
    confirmationHeight,
    confirmationHeaderIdHex,
    confirmationObservationDigestHex,
    processBindingDigestHex: checked.process.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      checked.process.executionTargetIdentityDigestHex,
    primaryObservationDigestHex: nodeObservationDigestHex,
    witnessObservationDigestHex: nodeObservationDigestHex,
    boundaries: {
      exactDualLoopbackNodesAgreed: true,
      sourceFundingSpent: true,
      sourceLockUnspentAndExact: true,
      transitionFeeFundingUnspentAndExact: true,
      sourceLockStillRefundable: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
    },
  };
  const outputObservation = {
    ...outputBody,
    observationDigestHex: sha256CanonicalJson(
      outputBody,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_OUTPUT_OBSERVATION_V1',
    ),
  };
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-root.v1',
    version: 1,
    status: 'peg_in_source_lock_creation_canonically_confirmed',
    staticExecutionManifestDigestHex:
      'cbe160668ef12be1b33f77b0c7c7bbb16a6caf823ddba7260c700f13a0bf8923',
    build: checked.build,
    process: checked.process,
    setup: checked.setup,
    pegIn: {
      fundingObservation: {
        ...checked.pegIn.fundingObservation,
        preTransportReportDigestHex: '9'.repeat(64),
        preTransportTipHeight: 142,
        preTransportTipHeaderIdHex: 'a'.repeat(64),
      },
      candidate: checked.pegIn.candidate,
      sourceLockCheck: checked.pegIn.sourceLockCheck,
      sourceLockExecution: {
        expectedTxId,
        transportStatus: 'accepted',
        durableAttemptDigestHex: '1'.repeat(64),
        journalDigestHex: '2'.repeat(64),
        confirmationDigestHex: confirmationObservationDigestHex,
        confirmationHeight,
        confirmationHeaderIdHex,
        outputObservation,
      },
    },
    checks: {
      exactCheckedCandidatePromotedOnce: true,
      sourceFundingRevalidatedImmediatelyBeforeAuthorization: true,
      durableReservationPrecededTransport: true,
      exactLoopbackTransportConsumedCheckedBytesOnce: true,
      canonicalConfirmationObservedByBothNodes: true,
      exactSourceSpentAndOutputsObserved: true,
      returnedValueContainsCapabilities: false,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      valuePathLocalSyntheticSigningPerformed: true,
      valuePathJvmNodeCheckPassed: true,
      valuePathSubmissionExecuted: true,
      valuePathBroadcastExecuted: true,
      sourceLockCreationConfirmed: true,
      sourceLockStillRefundable: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      existingWalletMaterialUsed: false,
      processLossRecoveryEstablished: false,
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
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1',
    ),
  };
}

function committedVaultExecutionWorkerReceipt(
  commandRequestSha256Hex: string,
  root = committedVaultExecutionReceipt(),
) {
  return buildSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1(
    root,
    commandRequestSha256Hex,
    Object.freeze({
      amountNanoErg: AMOUNT_NANO_ERG,
      recipientAddressHex: RECIPIENT_ADDRESS_HEX,
    }),
  );
}

function committedVaultExecutionReceipt() {
  const sourceLock = sourceLockExecutionReceipt();
  const packet = sourceLock.pegIn.candidate.depositPacket;
  const reserveTransition = packet.transactions.reserveTransition;
  const sourceFundingBoxIdHex = packet.boxes.sourceFundingInput.boxId;
  const reservePredecessorBoxIdHex = packet.boxes.reservePredecessor.boxId;
  const sourceLockBoxIdHex = packet.boxes.sourceLock.boxId;
  const transitionFeeFundingBoxIdHex =
    packet.boxes.transitionFeeFunding.boxId;
  const reserveSuccessorBoxIdHex = packet.boxes.reserveSuccessor.boxId;
  const expectedTxId = reserveTransition.txId;
  const sourceLockConfirmation = sourceLock.pegIn.sourceLockExecution;
  const preTransportObservationBody = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-pre-transport-observation.v1',
    version: 1,
    status: 'exact_transition_inputs_unspent_and_dual_node_equal',
    expectedTxId,
    reservePredecessorBoxIdHex,
    sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex,
    sourceLockConfirmationHeight: sourceLockConfirmation.confirmationHeight,
    sourceLockConfirmationDigestHex:
      sourceLockConfirmation.confirmationDigestHex,
    observedTipHeight: 146,
    observedTipHeaderIdHex: '1'.repeat(64),
    processBindingDigestHex: sourceLock.process.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      sourceLock.process.executionTargetIdentityDigestHex,
    primaryObservationDigestHex: '2'.repeat(64),
    witnessObservationDigestHex: '2'.repeat(64),
    boundaries: {
      exactDualLoopbackNodesAgreed: true,
      originalSourceFundingRemainsSpent: true,
      exactReservePredecessorUnspent: true,
      exactSourceLockUnspent: true,
      exactTransitionFeeFundingUnspent: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
    },
  };
  const preTransportObservation = {
    ...preTransportObservationBody,
    observationDigestHex: sha256CanonicalJson(
      preTransportObservationBody,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_PRE_TRANSPORT_OBSERVATION_V1',
    ),
  };
  const committedVaultCheckBody = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-check.v1',
    version: 1,
    status: 'PASS',
    reservePredecessorBoxIdHex,
    sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex,
    unsignedTransactionIdHex: expectedTxId,
    unsignedTransactionDigestHex: sha256CanonicalJson(
      reserveTransition,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_TRANSACTION_V1',
    ),
    signedTransactionIdHex: expectedTxId,
    signedTransactionCanonicalJsonSha256Hex: '3'.repeat(64),
    signedTransactionBytesSha256Hex: '4'.repeat(64),
    signedTransactionBytesLength: 2345,
    checkResponseSha256Hex: '5'.repeat(64),
    target: {
      processBindingDigestHex: sourceLock.process.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        sourceLock.process.executionTargetIdentityDigestHex,
    },
    signer: {
      derivation: 'wasm-root',
      publicKeyHex: sourceLock.pegIn.sourceLockCheck.signer.publicKeyHex,
      p2pkErgoTreeHex: sourceLock.pegIn.sourceLockCheck.signer.p2pkErgoTreeHex,
      stateContextTipHeight: 146,
      stateContextTipIdHex: preTransportObservationBody.observedTipHeaderIdHex,
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
      exactThreeInputTransitionBound: true,
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
  const committedVaultCheck = {
    ...committedVaultCheckBody,
    receiptDigestHex: sha256CanonicalJson(
      committedVaultCheckBody,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1',
    ),
  };
  const confirmationHeight = 148;
  const confirmationHeaderIdHex = '7'.repeat(64);
  const confirmationObservationDigestHex = '8'.repeat(64);
  const outputObservationBody = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1',
    version: 1,
    status: 'exact_transition_inputs_spent_and_reserve_successor_unspent',
    expectedTxId,
    sourceFundingBoxIdHex,
    reservePredecessorBoxIdHex,
    sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex,
    reserveSuccessorBoxIdHex,
    confirmationHeight,
    confirmationHeaderIdHex,
    confirmationObservationDigestHex,
    observedTipHeight: 150,
    observedTipHeaderIdHex: sourceLock.process.finalSnapshot.headerIdHex,
    processBindingDigestHex: sourceLock.process.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      sourceLock.process.executionTargetIdentityDigestHex,
    primaryObservationDigestHex: '9'.repeat(64),
    witnessObservationDigestHex: '9'.repeat(64),
    boundaries: {
      exactDualLoopbackNodesAgreed: true,
      originalSourceFundingRemainsSpent: true,
      exactReservePredecessorSpent: true,
      exactSourceLockSpent: true,
      exactTransitionFeeFundingSpent: true,
      exactReserveSuccessorUnspent: true,
      sourceLockConsumptionEstablished: true,
      reserveLineageEstablished: true,
      depositCommitmentStateEstablished: true,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
  };
  const outputObservation = {
    ...outputObservationBody,
    observationDigestHex: sha256CanonicalJson(
      outputObservationBody,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1',
    ),
  };
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-execution-root.v1',
    version: 1,
    status: 'peg_in_source_lock_consumed_into_committed_reserve',
    staticExecutionManifestDigestHex:
      '3089d13a6066a9cbde0f8d23af3d1bc1d197f8fe1fcfe40e7d4e610a4f51521e',
    build: sourceLock.build,
    process: sourceLock.process,
    setup: sourceLock.setup,
    pegIn: {
      ...sourceLock.pegIn,
      committedVaultCheck,
      committedVaultExecution: {
        expectedTxId,
        transportStatus: 'accepted',
        durableAttemptDigestHex: 'a'.repeat(64),
        journalDigestHex: 'b'.repeat(64),
        confirmationDigestHex: confirmationObservationDigestHex,
        confirmationHeight,
        confirmationHeaderIdHex,
        preTransportObservation,
        outputObservation,
      },
    },
    checks: {
      sourceLockConfirmedBeforeCommittedVaultCheck: true,
      exactThreeInputTransitionCheckedAndRevalidated: true,
      freshJvmCheckPrecededAuthorization: true,
      durableReservationPrecededTransport: true,
      exactLoopbackTransportConsumedCheckedBytesOnce: true,
      canonicalConfirmationObservedByBothNodes: true,
      exactTransitionInputsSpentAndReserveSuccessorObserved: true,
      returnedValueContainsCapabilities: false,
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      valuePathLocalSyntheticSigningPerformed: true,
      valuePathJvmNodeCheckPassed: true,
      valuePathSubmissionExecuted: true,
      valuePathBroadcastExecuted: true,
      sourceLockCreationConfirmed: true,
      sourceLockStillRefundable: false,
      sourceLockConsumptionEstablished: true,
      reserveLineageEstablished: true,
      depositCommitmentStateEstablished: true,
      mintAuthorized: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      existingWalletMaterialUsed: false,
      processLossRecoveryEstablished: false,
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
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1',
    ),
  };
}

function refreshCommittedVaultCheckDigest(root: any): void {
  const check = root.pegIn.committedVaultCheck;
  const { receiptDigestHex: _digest, ...body } = check;
  check.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_CHECK_V1',
  );
}

function refreshCommittedVaultPreTransportObservationDigest(root: any): void {
  const observation =
    root.pegIn.committedVaultExecution.preTransportObservation;
  const { observationDigestHex: _digest, ...body } = observation;
  observation.observationDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_PRE_TRANSPORT_OBSERVATION_V1',
  );
}

function refreshCommittedVaultOutputObservationDigest(root: any): void {
  const observation = root.pegIn.committedVaultExecution.outputObservation;
  const { observationDigestHex: _digest, ...body } = observation;
  observation.observationDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_OUTPUT_OBSERVATION_V1',
  );
}

function refreshCommittedVaultExecutionRootDigest(root: any): void {
  const { receiptDigestHex: _digest, ...body } = root;
  root.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1',
  );
}

function refreshCommittedVaultExecutionWorkerReceiptDigest(receipt: any): void {
  const { receiptDigestHex: _digest, ...body } = receipt;
  receipt.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_WORKER_RECEIPT_V1',
  );
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

function refreshOutputObservationDigest(receipt: any): void {
  const observation = receipt.pegIn.sourceLockExecution.outputObservation;
  const { observationDigestHex: _discarded, ...body } = observation;
  observation.observationDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_OUTPUT_OBSERVATION_V1',
  );
}

function refreshExecutionRootReceiptDigest(receipt: any): void {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  receipt.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1',
  );
}

function refreshExecutionWorkerReceiptDigest(receipt: any): void {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  receipt.receiptDigestHex = sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_WORKER_RECEIPT_V1',
  );
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
