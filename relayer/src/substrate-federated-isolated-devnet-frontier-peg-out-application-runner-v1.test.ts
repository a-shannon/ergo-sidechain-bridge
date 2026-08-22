import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const mintSourceProofProvenance = vi.hoisted(() => ({
  receipts: new WeakSet<object>(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-source-attestation-session-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './substrate-federated-isolated-devnet-source-attestation-session-v1.js'
      )
    >();
    return {
      ...actual,
      assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance:
        (value: unknown) => {
          if (
            value === null
            || typeof value !== 'object'
            || !mintSourceProofProvenance.receipts.has(value)
          ) {
            throw new Error(
              'isolated-devnet settlement-family mint source-proof receipt lacks process provenance',
            );
          }
        },
    };
  },
);

import { BoundedProcessExitError } from './pinned-local-native-verifier-build.js';
import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
  encodePegInSourceIntentV2Hex,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import type {
  PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance,
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance,
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationDynamicSourceProofMarkerV2,
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationPatchGitIdentityV1,
  buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1,
  buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV2,
  inspectSubstrateFederatedIsolatedDevnetFrontierApplicationPatchGitLockV1,
  preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
  preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2,
  restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1,
  runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
  runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2,
} from './substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  type FederatedPooledReserveSourceProofRequestV1,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  createFederatedPooledReserveSourceProofV1Fixture,
} from './substrate-federated-pooled-reserve-source-proof-v1.test-helper.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(sourceDirectory, '..', '..');
const requiredIntegrationEnvironment = [
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_SOURCE',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_TEMP_ROOT',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO_CACHE',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_RUSTC',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_GIT',
] as const;
const integrationEnabled = requiredIntegrationEnvironment.every(
  name => process.env[name] !== undefined,
);
const EXPECTED_INTEGRATION_SIDECHAIN_ID_HEX =
  '0x233ab9f052d90ec0e32577793461b912118105ebacb3723e1aa0bff9df106bda';

describe('federated isolated-devnet Frontier peg-out application runner V1/V2', () => {
  it('consumes the exact node-build Git lock and rejects independent drift', () => {
    const lock =
      inspectSubstrateFederatedIsolatedDevnetFrontierApplicationPatchGitLockV1(
        bridgeRoot,
      );
    expect(lock).toEqual({
      version: 'git version 2.54.0.windows.1',
      sha256:
        '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5',
    });
    expect(Object.isFrozen(lock)).toBe(true);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierApplicationPatchGitIdentityV1(
        bridgeRoot,
        { ...lock, version: 'git version 2.55.0.windows.3' },
      )
    ).toThrow(/version changed/u);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierApplicationPatchGitIdentityV1(
        bridgeRoot,
        { ...lock, sha256: '00'.repeat(32) },
      )
    ).toThrow(/SHA-256 changed/u);
  });

  it('requires offline execution and an exact input shape', () => {
    expect(() => preflight({
      ...syntheticInput(),
      offline: false,
    } as never))
      .toThrow(/requires offline Cargo/u);
    expect(() => preflight({
      ...syntheticInput(),
      authority: true,
    } as never)).toThrow(/must contain exactly/u);
  });

  it('refuses to apply the overlay inside the bridge worktree', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    try {
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: path.join(bridgeRoot, 'substrate-node'),
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
      })).toThrow(/refuses to mutate the bridge worktree/u);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('requires the source, build root, and dependency cache to stay outside the worktree', () => {
    const sourceRoot = mkdtempSync(path.join(tmpdir(), 'e2s-frontier-source-root-'));
    const source = mkdtempSync(path.join(sourceRoot, 'source-'));
    const separateRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    try {
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: path.join(bridgeRoot, 'substrate-node'),
        cargoDependencyCacheDirectory: separateRoot,
      })).toThrow(/external temporary root/u);
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: sourceRoot,
        cargoDependencyCacheDirectory: path.join(bridgeRoot, 'substrate-node'),
      })).toThrow(/external Cargo dependency cache/u);
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: separateRoot,
        cargoDependencyCacheDirectory: sourceRoot,
      })).toThrow(/source must be inside its external temporary root/u);
    } finally {
      rmSync(sourceRoot, { recursive: true, force: true });
      rmSync(separateRoot, { recursive: true, force: true });
    }
  });

  it('rejects whitespace-bearing source and build roots before WASM execution', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    const sourceWithWhitespace = path.join(temporaryRoot, 'source with space');
    mkdirSync(sourceWithWhitespace);
    const parent = mkdtempSync(path.join(tmpdir(), 'e2s-runner-parent-'));
    const rootWithWhitespace = path.join(parent, 'root with space');
    const source = path.join(rootWithWhitespace, 'source');
    mkdirSync(source, { recursive: true });
    try {
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: sourceWithWhitespace,
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
      })).toThrow(/must be whitespace-free for deterministic WASM Rust flags/u);
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: rootWithWhitespace,
        cargoDependencyCacheDirectory: parent,
      })).toThrow(/must be whitespace-free for deterministic WASM Rust flags/u);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('canonicalizes one external scratch plan without creating authority', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    const source = mkdtempSync(path.join(temporaryRoot, 'source-'));
    try {
      const plan = preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
      });
      expect(plan).toEqual({
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
        cargoExecutablePath: process.execPath,
        rustcExecutablePath: process.execPath,
        gitExecutablePath: process.execPath,
        offline: true,
      });
      expect(Object.isFrozen(plan)).toBe(true);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('builds the exact application-specific mint reservation environment', () => {
    const environment =
      buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1();
    expect(environment).toMatchObject({
      BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX:
        '0x9b0b09bad81ef29e8d132786a8bfb27dc5ccc8444403b2ad4354c9b578c664ba',
      BRIDGE_LAB_FEDERATED_MINT_IDENTITY_V4_HEX:
        '0x12e324cd5af496b2e9de353ad80a5dc2d778e655ef3df2960d6c5dce0d62f704',
    });
    expect(environment.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX)
      .toHaveLength(2 + 603 * 2);
    expect(environment.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_ID_V4_HEX)
      .toBe('0x93473aa29d814e70310349dc74ac8ff67982381def2adaa1435a24c81ad78d01');
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it('requires one exact process-proven mint receipt for the V2 runner input', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    const source = mkdtempSync(path.join(temporaryRoot, 'source-'));
    const receipt = syntheticMintSourceProofReceipt();
    try {
      const input = {
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
        mintSourceProofReceipt: receipt,
      };
      const plan =
        preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2(
          input,
        );
      expect(plan.mintSourceProofReceipt).toBe(receipt);
      expect(Object.isFrozen(plan)).toBe(true);
      expect(() =>
        preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2({
          ...input,
          mintSourceProofReceipt: { ...receipt },
        })
      ).toThrow(/lacks process provenance/u);
      expect(() =>
        preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2({
          ...input,
          authority: true,
        } as never)
      ).toThrow(/must contain exactly/u);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('builds a frozen dynamic environment from the exact mint proof', () => {
    const receipt = syntheticMintSourceProofReceipt();
    const environment =
      buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV2(
        receipt,
      );
    expect(environment).toEqual({
      BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX:
        receipt.sourceProofProfileScaleHex,
      BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX:
        receipt.sourceProofProfileIdHex,
      BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX:
        receipt.request.statementHex,
      BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_ID_V4_HEX:
        receipt.mintReservationStatementIdHex,
      BRIDGE_LAB_FEDERATED_MINT_IDENTITY_V4_HEX: receipt.mintIdentityHex,
      BRIDGE_LAB_FEDERATED_MINT_SOURCE_PROOF_ENVELOPE_V4_HEX:
        receipt.sourceProofEnvelopeScaleHex,
    });
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it('requires one exact Rust marker for the dynamic source-proof bytes', () => {
    const envelopeHex = '0x01020304';
    const digestHex = createHash('sha256')
      .update(Buffer.from(envelopeHex.slice(2), 'hex'))
      .digest('hex');
    const marker = `bridge-lab-dynamic-source-proof-sha256=0x${digestHex}`;
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationDynamicSourceProofMarkerV2(
        `${marker}\r\n`,
        '',
        envelopeHex,
      )
    ).not.toThrow();
    for (const output of [
      '',
      'bridge-lab-dynamic-source-proof-sha256=0x'.concat('00'.repeat(32)),
      `${marker}\n${marker}`,
    ]) {
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationDynamicSourceProofMarkerV2(
          output,
          '',
          envelopeHex,
        )
      ).toThrow(/lacks the exact dynamic proof marker/u);
    }
  });

  it('keeps V1 and V2 receipt provenance registration disjoint', () => {
    const source = runnerSourceFile();
    const callGraph = localFunctionCallGraph(source);
    expect(receiptRegistrationSites(source)).toEqual([
      {
        functionName:
          'buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1',
        registryCall: 'RECEIPTS.add',
      },
      {
        functionName: 'bindDynamicMintProofToApplicationRunnerReceiptV2',
        registryCall: 'V2_RECEIPTS.set',
      },
    ]);
    expect(registryReferenceSites(source)).toEqual([
      {
        functionName:
          'buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1',
        registryName: 'RECEIPTS',
        registryCall: 'RECEIPTS.add',
      },
      {
        functionName:
          'assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance',
        registryName: 'RECEIPTS',
        registryCall: 'RECEIPTS.has',
      },
      {
        functionName:
          'assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance',
        registryName: 'V2_RECEIPTS',
        registryCall: 'V2_RECEIPTS.get',
      },
      {
        functionName: 'bindDynamicMintProofToApplicationRunnerReceiptV2',
        registryName: 'V2_RECEIPTS',
        registryCall: 'V2_RECEIPTS.set',
      },
    ]);

    const v1Calls = reachableCallNames(
      callGraph,
      'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1',
    );
    expect(v1Calls).toContain('executeRunner');
    expect(v1Calls).toContain(
      'buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1',
    );
    expect(v1Calls).toContain('RECEIPTS.add');

    const v2Calls = reachableCallNames(
      callGraph,
      'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2',
    );
    expect(v2Calls).toContain('executeRunner');
    expect(v2Calls).toContain(
      'bindDynamicMintProofToApplicationRunnerReceiptV2',
    );
    expect(v2Calls).not.toContain(
      'buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1',
    );
    expect(v2Calls).not.toContain('RECEIPTS.add');
    expect(v2Calls).toContain('V2_RECEIPTS.set');

    const neutralExecutionCalls = reachableCallNames(callGraph, 'executeRunner');
    expect(neutralExecutionCalls).not.toContain('RECEIPTS.add');
    expect(neutralExecutionCalls).not.toContain('V2_RECEIPTS.set');
    expect(functionReferenceSites(
      source,
      'buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1',
    )).toEqual([
      {
        functionName:
          'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1',
        use: 'call',
      },
    ]);
    expect(functionReferenceSites(
      source,
      'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1',
    )).toEqual([]);
  });

  it('pins reproducible path remaps for host and WASM builds', () => {
    const source = runnerSourceFile().getFullText();
    expect(source).toContain(
      'buildPinnedLocalNativeReproducibleRustFlags({',
    );
    expect(source).toContain(
      "environment.CARGO_ENCODED_RUSTFLAGS = reproducibleRustFlags.join('\\x1f');",
    );
    expect(source).toContain(
      "environment.WASM_BUILD_RUSTFLAGS = reproducibleRustFlags",
    );
    expect(source).toContain(
      ".filter(flag => !flag.startsWith('-Clink-arg='))",
    );
  });

  it('detects an indirect V2-to-V1 receipt registration mutant', () => {
    const mutant = ts.createSourceFile(
      'receipt-registration-mutant.ts',
      [
        'const RECEIPTS = new WeakSet<object>();',
        'const V2_RECEIPTS = new WeakMap<object, object>();',
        'function buildV1(value: object) { RECEIPTS.add(value); }',
        'const indirectV1 = (value: object) => buildV1(value);',
        'function bindV2(value: object) { V2_RECEIPTS.set(value, value); }',
        'function executeRunner() { return {}; }',
        'function runV2() {',
        '  const result = executeRunner();',
        '  indirectV1(result);',
        '  bindV2(result);',
        '}',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    expect(reachableCallNames(localFunctionCallGraph(mutant), 'runV2'))
      .toEqual(expect.arrayContaining(['buildV1', 'RECEIPTS.add']));
  });

  it('rejects an exact-receipt proof-envelope digest mutation', () => {
    const receipt = syntheticMintSourceProofReceipt({
      sourceProofEnvelopeSha256Hex: '00'.repeat(32),
    });
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV2(
        receipt,
      )
    ).toThrow(/envelope SHA-256 changed/u);
  });

  it('rejects exact-receipt statement and mint identity drift', () => {
    const statementReceipt = syntheticMintSourceProofReceipt({
      mintReservationStatementIdHex: `0x${'00'.repeat(32)}`,
    });
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV2(
        statementReceipt,
      )
    ).toThrow(/identity binding changed/u);

    const mintReceipt = syntheticMintSourceProofReceipt({
      mintIdentityHex: `0x${'00'.repeat(32)}`,
    });
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV2(
        mintReceipt,
      )
    ).toThrow(/identity binding changed/u);
  });

  it.each([
    [
      'recipient',
      (intent: PegInSourceIntentV2) => ({
        ...intent,
        recipientAddressHex: `0x${'11'.repeat(20)}`,
      }),
    ],
    [
      'amount',
      (intent: PegInSourceIntentV2) => ({
        ...intent,
        amountNanoErg: '14999999',
      }),
    ],
  ])('rejects a canonical mint source-intent %s mutation', (_label, mutate) => {
    const receipt = syntheticMintSourceProofReceiptWithIntentMutation(mutate);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV2(
        receipt,
      )
    ).toThrow(/differs from the reviewed LAB application/u);
  });

  it('restores the exact source snapshot when Git reversal fails', async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-overlay-restore-'));
    const sourcePath = path.join(temporaryRoot, 'source.rs');
    const original = Buffer.from('original source\r\n', 'utf8');
    const applied = Buffer.from('overlay source\r\n', 'utf8');
    writeFileSync(sourcePath, applied);
    try {
      const result =
        await restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1({
          sourcePath,
          originalSourceBytes: original,
          expectedAppliedSourceLfSha256: createHash('sha256')
            .update('overlay source\n', 'utf8')
            .digest('hex'),
          reverseOverlay: async () => {
            throw new Error('injected reversal failure');
          },
        });
      expect(result).toBe('snapshot_fallback');
      expect(readFileSync(sourcePath)).toEqual(original);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('does not overwrite unrecognized source drift during restoration', async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-overlay-drift-'));
    const sourcePath = path.join(temporaryRoot, 'source.rs');
    const drifted = Buffer.from('concurrent drift\n', 'utf8');
    writeFileSync(sourcePath, drifted);
    try {
      await expect(
        restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1({
          sourcePath,
          originalSourceBytes: Buffer.from('original source\n', 'utf8'),
          expectedAppliedSourceLfSha256: createHash('sha256')
            .update('overlay source\n', 'utf8')
            .digest('hex'),
          reverseOverlay: async () => undefined,
        }),
      ).rejects.toThrow(/unexpected bytes before restoration/u);
      expect(readFileSync(sourcePath)).toEqual(drifted);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.runIf(integrationEnabled)(
    'applies, executes, consumes, and reverses the exact application overlay',
    async () => {
      let receipt;
      try {
        receipt =
          await runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
            integrationInput(),
          );
      } catch (error) {
        if (error instanceof BoundedProcessExitError) {
          process.stderr.write(error.stderr);
        }
        throw error;
      }
      expect(receipt.status).toBe('same_process_application_burn_executed');
      expect(receipt.applicationEvidence.status)
        .toBe('local_application_burn_transcript_validated');
      expect(receipt.checks).toMatchObject({
        exactSourceBaselineRevalidatedBeforeAndAfter: true,
        overlayAppliedOnlyForBoundedExecution: true,
        exactNamedCargoTestPassedOnce: true,
        sameProcessCargoExecutionProvenanceEstablished: true,
        pureApplicationEvidenceConsumedInSameProcess: true,
        sourceNativeBlockToExecutionLookupBoundByExactSource: true,
      });
      expect(receipt.boundary).toMatchObject({
        callerSuppliedStdoutAccepted: false,
        sidechainFinalityEstablished: false,
        trackerAdmissionEstablished: false,
        globalReplayInsertionEstablished: false,
        payoutAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      });
      assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance(
        receipt,
      );
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance({
          ...receipt,
        })
      ).toThrow(/lacks process provenance/u);
    },
    45 * 60_000,
  );

  it.runIf(integrationEnabled)(
    'executes the exact dynamic mint proof before producing V2 burn evidence',
    async () => {
      const mintSourceProofReceipt = integrationMintSourceProofReceipt();
      let receipt;
      try {
        receipt =
          await runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2({
            ...integrationInput(),
            mintSourceProofReceipt,
          });
      } catch (error) {
        if (error instanceof BoundedProcessExitError) {
          process.stderr.write(error.stderr);
        }
        throw error;
      }
      expect(receipt.status)
        .toBe('same_process_mint_proof_bound_application_burn_executed');
      expect(receipt.mintSourceProof).toMatchObject({
        receiptDigestHex: mintSourceProofReceipt.receiptDigestHex,
        targetDescriptorDigestHex:
          mintSourceProofReceipt.targetDescriptorDigestHex,
        sourceProofEnvelopeSha256Hex:
          mintSourceProofReceipt.sourceProofEnvelopeSha256Hex,
      });
      expect(receipt.checks).toMatchObject({
        exactMintSourceProofReceiptObjectBound: true,
        exactDynamicProfileStatementAndProofEnvironmentBound: true,
        runnerExecutionInputCommitsDynamicEnvironment: true,
        exactDynamicSourceProofExecutionMarkerBound: true,
        applicationMatchesMintSourceIntent: true,
        mintAmountAndRecipientMatchApplicationExecution: true,
        mintSourceProofReceiptRevalidatedAfterExecution: true,
        exactExecutionResultObjectBound: true,
      });
      expect(receipt.boundary).toMatchObject({
        processProvenMintSourceProofBound: true,
        packetMintContinuationBound: false,
        checkpointAttestationEstablished: false,
        sourceConsensusEstablished: false,
        sidechainFinalityEstablished: false,
        payoutAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      });
      assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance(
        receipt,
      );
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance({
          ...receipt,
        })
      ).toThrow(/lacks process provenance/u);
    },
    45 * 60_000,
  );

  it.runIf(integrationEnabled)(
    'restores the source when post-application Cargo isolation rejects',
    async () => {
      const input = integrationInput();
      const cargoConfigDirectory = path.join(
        input.temporaryDirectoryRoot,
        '.cargo',
      );
      if (existsSync(cargoConfigDirectory)) {
        throw new Error('integration temporary root must not contain .cargo');
      }
      const sourcePath = path.join(
        input.frontierSourceDirectory,
        'template',
        'node',
        'src',
        'bridge_federated_lab_reservation_tests.rs',
      );
      const sourceBefore = readFileSync(sourcePath);
      mkdirSync(cargoConfigDirectory);
      writeFileSync(
        path.join(cargoConfigDirectory, 'config.toml'),
        '[net]\noffline = true\n',
        'utf8',
      );
      try {
        await expect(
          runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
            input,
          ),
        ).rejects.toThrow(/Cargo configuration must be absent/u);
        expect(readFileSync(sourcePath)).toEqual(sourceBefore);
      } finally {
        rmSync(cargoConfigDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

function preflight(value: Parameters<
  typeof preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1
>[0]) {
  return preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
    value,
  );
}

function syntheticInput() {
  return {
    frontierSourceDirectory: tmpdir(),
    temporaryDirectoryRoot: tmpdir(),
    cargoDependencyCacheDirectory: tmpdir(),
    cargoExecutablePath: process.execPath,
    rustcExecutablePath: process.execPath,
    gitExecutablePath: process.execPath,
    offline: true as const,
  };
}

function integrationInput() {
  const value = (name: typeof requiredIntegrationEnvironment[number]): string => {
    const selected = process.env[name];
    if (selected === undefined) throw new Error(`${name} is required`);
    return selected;
  };
  return {
    frontierSourceDirectory: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_SOURCE'),
    temporaryDirectoryRoot: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_TEMP_ROOT'),
    cargoDependencyCacheDirectory: value(
      'BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO_CACHE',
    ),
    cargoExecutablePath: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO'),
    rustcExecutablePath: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_RUSTC'),
    gitExecutablePath: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_GIT'),
    offline: true as const,
  };
}

function syntheticMintSourceProofReceipt(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2> {
  const reference =
    buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1();
  const sourceProofEnvelopeScaleHex = '0x01020304';
  const receipt = Object.freeze({
    receiptDigestHex: '11'.repeat(32),
    targetDescriptorDigestHex: '22'.repeat(32),
    mintReservationDraftDigestHex: '33'.repeat(32),
    mintReservationStatementIdHex:
      reference.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
    mintIdentityHex:
      reference.BRIDGE_LAB_FEDERATED_MINT_IDENTITY_V4_HEX,
    sourceProofProfileIdHex:
      reference.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX,
    sourceProofProfileScaleHex:
      reference.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX,
    sourceProofEnvelopeScaleHex,
    sourceProofEnvelopeSha256Hex: createHash('sha256')
      .update(Buffer.from(sourceProofEnvelopeScaleHex.slice(2), 'hex'))
      .digest('hex'),
    request: Object.freeze({
      statementHex:
        reference.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX,
    }),
    ...overrides,
  }) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2
  >;
  mintSourceProofProvenance.receipts.add(receipt);
  return receipt;
}

function integrationMintSourceProofReceipt(): Readonly<
  SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2
> {
  const reference =
    buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1();
  const referenceStatement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      reference.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX,
    );
  const sourceIntent = Object.freeze({
    ...decodePegInSourceIntentV2Hex(referenceStatement.sourceIntentHex),
    sidechainIdHex: EXPECTED_INTEGRATION_SIDECHAIN_ID_HEX,
  });
  const statement = Object.freeze({
    ...referenceStatement,
    sourceIntentHex: encodePegInSourceIntentV2Hex(sourceIntent),
    sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
  });
  const statementHex =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statement,
    );
  const frontierSource = integrationInput().frontierSourceDirectory;
  const bridgeRuntimeCode = readIntegrationRuntimeCode(
    frontierSource,
    'ErgoBridge.runtime.bin',
  );
  const tokenRuntimeCode = readIntegrationRuntimeCode(
    frontierSource,
    'SERG.runtime.bin',
  );
  const runtimeProfile = Object.freeze({
    formatVersion: 4 as const,
    lineageProfileIdHex: statement.lineageProfileIdHex,
    sourceNetworkIdHex: sourceIntent.sourceNetworkIdHex,
    sidechainIdHex: sourceIntent.sidechainIdHex,
    bridgeAddressHex: sourceIntent.bridgeAddressHex,
    tokenAddressHex: sourceIntent.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: sha256PrefixedHex(bridgeRuntimeCode),
    bridgeRuntimeCodeBytes: bridgeRuntimeCode.length,
    tokenRuntimeCodeSha256Hex: sha256PrefixedHex(tokenRuntimeCode),
    tokenRuntimeCodeBytes: tokenRuntimeCode.length,
    settlementProfileIdHex: sourceIntent.settlementProfileIdHex,
    ergoDepositFinalityPolicyIdHex:
      statement.ergoDepositFinalityPolicyIdHex,
    sourceProofSystemIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    sourceProofProfileIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    activationHeight: '4',
    maxPendingBlocks: 64,
  }) satisfies PooledReserveMintReservationRuntimeProfileV4;
  const request = Object.freeze({
    runtimeProfile,
    statementHex,
    evidence: Object.freeze({
      sourceLockBoxCanonicalHex: statement.sourceLockBoxIdHex,
      reserveTransitionTransactionCanonicalHex:
        statement.reserveTransitionTransactionIdHex,
      successorReserveBoxCanonicalHex: statement.successorReserveBoxIdHex,
      inclusionProofCanonicalHex: statement.inclusionHeaderIdHex,
      checkpointAncestryCanonicalHex: statement.targetHeaderIdHex,
      finalityProofCanonicalHex:
        `0x${statement.inclusionHeaderIdHex.slice(2)}${statement.targetHeaderIdHex.slice(2)}`,
      verifierExecutableSha256Hex: sha256PrefixedHex(Buffer.from(
        'federated-pooled-reserve-source-proof-lab-node-fixture-v1',
        'ascii',
      )),
    }),
    issuedAtNativeHeight: '4',
    expiresAtNativeHeight: '68',
  }) satisfies FederatedPooledReserveSourceProofRequestV1;
  const fixture = createFederatedPooledReserveSourceProofV1Fixture({ request });
  return syntheticMintSourceProofReceipt({
    mintReservationStatementIdHex:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        statement,
      ),
    mintIdentityHex: statement.mintIdentityHex,
    request,
    sourceProofEnvelopeScaleHex: fixture.sourceProofEnvelopeScaleHex,
    sourceProofEnvelopeSha256Hex: createHash('sha256')
      .update(Buffer.from(fixture.sourceProofEnvelopeScaleHex.slice(2), 'hex'))
      .digest('hex'),
  });
}

function readIntegrationRuntimeCode(
  frontierSource: string,
  fileName: string,
): Buffer {
  const encoded = readFileSync(path.join(
    frontierSource,
    'template',
    'node',
    'src',
    'tests',
    'res',
    'bridge-atomicity',
    fileName,
  ), 'utf8').trim();
  if (encoded.length === 0 || !/^[0-9a-f]+$/u.test(encoded)) {
    throw new Error(`${fileName} is not canonical lowercase hex`);
  }
  return Buffer.from(encoded, 'hex');
}

function sha256PrefixedHex(value: Uint8Array): string {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

function syntheticMintSourceProofReceiptWithIntentMutation(
  mutate: (intent: PegInSourceIntentV2) => PegInSourceIntentV2,
): Readonly<SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2> {
  const reference =
    buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1();
  const statement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      reference.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX,
    );
  const sourceIntent = mutate(
    decodePegInSourceIntentV2Hex(statement.sourceIntentHex),
  );
  const mutatedStatement = Object.freeze({
    ...statement,
    sourceIntentHex: encodePegInSourceIntentV2Hex(sourceIntent),
    sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
  });
  return syntheticMintSourceProofReceipt({
    mintReservationStatementIdHex:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        mutatedStatement,
      ),
    request: Object.freeze({
      statementHex:
        encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
          mutatedStatement,
        ),
    }),
  });
}

function runnerSourceFile(): ts.SourceFile {
  const sourcePath = path.join(
    sourceDirectory,
    'substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.ts',
  );
  return ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function localFunctionCallGraph(source: ts.SourceFile): ReadonlyMap<string, string[]> {
  const graph = new Map<string, string[]>();
  const collect = (node: ts.Node): void => {
    if (isRuntimeFunctionLike(node)) {
      const name = functionLikeName(node);
      if (name !== undefined) graph.set(name, directCallNames(node));
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  return graph;
}

function directCallNames(declaration: ts.FunctionLikeDeclaration): string[] {
  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== declaration && isRuntimeFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const name = callExpressionName(node.expression);
      if (name !== undefined) calls.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  return calls;
}

function reachableCallNames(
  graph: ReadonlyMap<string, string[]>,
  start: string,
): string[] {
  if (!graph.has(start)) throw new Error(`missing function declaration ${start}`);
  const visited = new Set<string>();
  const calls = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const called of graph.get(current) ?? []) {
      calls.add(called);
      if (graph.has(called) && !visited.has(called)) pending.push(called);
    }
  }
  return [...calls].sort();
}

function receiptRegistrationSites(
  source: ts.SourceFile,
): Array<Readonly<{ functionName: string; registryCall: string }>> {
  const registrations: Array<
    Readonly<{ functionName: string; registryCall: string }>
  > = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const registryCall = callExpressionName(node.expression);
      if (registryCall === 'RECEIPTS.add' || registryCall === 'V2_RECEIPTS.set') {
        registrations.push({
          functionName: nearestFunctionName(node),
          registryCall,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return registrations;
}

function registryReferenceSites(
  source: ts.SourceFile,
): Array<Readonly<{
  functionName: string;
  registryName: string;
  registryCall: string;
}>> {
  const sites: Array<
    Readonly<{
      functionName: string;
      registryName: string;
      registryCall: string;
    }>
  > = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node)
      && (node.text === 'RECEIPTS' || node.text === 'V2_RECEIPTS')
    ) {
      const parent = node.parent;
      const declarationName = ts.isVariableDeclaration(parent)
        && parent.name === node;
      if (!declarationName) {
        sites.push({
          functionName: nearestFunctionName(node),
          registryName: node.text,
          registryCall:
            ts.isPropertyAccessExpression(parent) && parent.expression === node
              ? `${node.text}.${parent.name.text}`
              : `${node.text}.<${ts.SyntaxKind[parent.kind]}>`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites.sort((left, right) =>
    left.registryName.localeCompare(right.registryName)
    || left.registryCall.localeCompare(right.registryCall)
    || left.functionName.localeCompare(right.functionName)
  );
}

function functionReferenceSites(
  source: ts.SourceFile,
  targetName: string,
): Array<Readonly<{ functionName: string; use: string }>> {
  const sites: Array<Readonly<{ functionName: string; use: string }>> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === targetName) {
      const parent = node.parent;
      const declarationName = ts.isFunctionDeclaration(parent) && parent.name === node;
      if (!declarationName) {
        sites.push({
          functionName: nearestFunctionName(node),
          use: ts.isCallExpression(parent) && parent.expression === node
            ? 'call'
            : ts.SyntaxKind[parent.kind],
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

function nearestFunctionName(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (isRuntimeFunctionLike(current)) {
      return functionLikeName(current) ?? '<anonymous-function>';
    }
    current = current.parent;
  }
  return '<module>';
}

function isRuntimeFunctionLike(
  node: ts.Node,
): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}

function functionLikeName(node: ts.FunctionLikeDeclaration): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node))
    && node.name !== undefined
  ) {
    return node.name.text;
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
    && ts.isVariableDeclaration(node.parent)
    && ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
    && ts.isPropertyAssignment(node.parent)
  ) {
    return qualifiedPropertyName(node.parent.name, node.parent.parent);
  }
  if (ts.isMethodDeclaration(node)) {
    return qualifiedPropertyName(node.name, node.parent);
  }
  return undefined;
}

function qualifiedPropertyName(
  name: ts.PropertyName,
  owner: ts.Node,
): string | undefined {
  const property = ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : undefined;
  if (property === undefined) return undefined;
  if (ts.isClassDeclaration(owner) && owner.name !== undefined) {
    return `${owner.name.text}.${property}`;
  }
  if (
    ts.isObjectLiteralExpression(owner)
    && ts.isVariableDeclaration(owner.parent)
    && ts.isIdentifier(owner.parent.name)
  ) {
    return `${owner.parent.name.text}.${property}`;
  }
  return property;
}

function callExpressionName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const owner = callExpressionName(expression.expression);
    if (owner !== undefined) return `${owner}.${expression.name.text}`;
  }
  return undefined;
}
