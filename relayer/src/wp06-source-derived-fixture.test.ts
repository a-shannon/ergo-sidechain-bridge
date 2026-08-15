import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const pinnedProvenance = vi.hoisted(() => ({
  assertCheckpoint: vi.fn(),
}));

vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./pinned-local-native-verifier-build.js')
  >();
  return {
    ...actual,
    assertPinnedLocalSourceNativeCheckpointProvenance:
      pinnedProvenance.assertCheckpoint,
  };
});

import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';
import {
  buildNativeCheckpointAggregateFinalityProofV1,
  buildNativeVerifiedBridgeCheckpoint,
  verifyNativeFinalizedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import type {
  PinnedLocalSourceNativeVerifiedBridgeCheckpoint,
} from './pinned-local-native-verifier-build.js';
import {
  assertWp06SourceDerivedFixtureProvenance,
  buildWp06ExtensionMembership,
  buildWp06SourceDerivedFixture,
  loadWp06PublicVectors,
  runWp06SourceDerivedAdversarialMatrix,
  WP06_SOURCE_DERIVED_NEGATIVE_CASES,
  type Wp06PublicVectors,
} from './test-fixtures/wp06-source-derived-fixture.js';
import {
  assertWp06SourceToTrackerVmResultProvenance,
} from './scripts/spikes/spike15-wp06-source-to-tracker-vm.js';
import { assertExactExecutableErgoTree } from './wp06-source-bound-jvm-validation.js';

let vectors: Wp06PublicVectors;
let checkpoint: PinnedLocalSourceNativeVerifiedBridgeCheckpoint;
let aggregateFinalityProof: ReturnType<typeof buildNativeCheckpointAggregateFinalityProofV1>;

beforeAll(async () => {
  vectors = loadWp06PublicVectors();
  const expectedBase64 = Buffer.from(
    JSON.stringify(vectors.native.expected),
    'utf8',
  ).toString('base64');
  const verifierScript = [
    "const chunks=[];",
    "process.stdin.on('data',chunk=>chunks.push(chunk));",
    "process.stdin.on('end',()=>{",
    "JSON.parse(Buffer.concat(chunks).toString('utf8'));",
    `process.stdout.write(Buffer.from('${expectedBase64}','base64'));`,
    '});',
  ].join('');
  const executableArgs = ['-e', verifierScript, '--'];
  const executableSha256Hex = `0x${createHash('sha256')
    .update(readFileSync(process.execPath))
    .digest('hex')}`;
  const verification = await verifyNativeFinalizedBridgeCheckpoint({
    executablePath: process.execPath,
    expectedExecutableSha256Hex: executableSha256Hex,
    expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
      executableSha256Hex,
      [...executableArgs, '--trusted-anchor-digest', vectors.native.trustedAnchorDigestHex],
    ),
    executableArgs,
    trustedAnchorDigestHex: vectors.native.trustedAnchorDigestHex,
    request: vectors.native.request,
  });
  const verified = buildNativeVerifiedBridgeCheckpoint(verification);
  checkpoint = verified as PinnedLocalSourceNativeVerifiedBridgeCheckpoint;
  aggregateFinalityProof = buildNativeCheckpointAggregateFinalityProofV1({
    checkpoint: verified,
    request: vectors.native.request,
  });
  pinnedProvenance.assertCheckpoint.mockImplementation(candidate => {
    if (candidate !== checkpoint) {
      throw new Error('pinned-local-source native checkpoint provenance is missing');
    }
  });
});

describe('WP-06 source-derived fixture', () => {
  it('composes one public receipt/native proof identity through exact 0x0401 membership', async () => {
    const fixture = await buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors,
    });

    expect(pinnedProvenance.assertCheckpoint).toHaveBeenCalled();
    expect(fixture.proofBundle.proof.leaf.burnIdHex)
      .toBe(vectors.frontier.expected.burnIdHexes[0]);
    expect(fixture.proofBundle.proof.bridgeEventRootHex)
      .toBe(fixture.checkpoint.checkpointCommitment.checkpoint.bridgeEventRootHex);
    expect(fixture.aggregateFinalityCommitment.statement.encodedCheckpointHex)
      .toBe(fixture.checkpoint.checkpointCommitment.encodedCheckpointHex);
    expect(fixture.extension).toMatchObject({
      keyHex: '0401',
      valueHex: fixture.checkpoint.checkpointCommitment.extensionValueHex,
    });
    expect(fixture.boundary).toEqual({
      sourceDerivedPublicFixture: true,
      sourceDependencyFetchPrevented: false,
      chainRpcAccessEnabled: false,
      pinnedLocalSourceBuildVerified: true,
      nativeFinalityVerified: true,
      runtimeStateProofVerified: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      admissionEligible: false,
      committeeBypassPrevented: false,
      r9FinalityAuthority: true,
      gate5Closed: false,
      transactionMutationEnabled: false,
      submitOrBroadcastEnabled: false,
    });
    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.extension.fields[0])).toBe(true);
    expect(Reflect.set(
      fixture.extension.fields[0] as Record<string, unknown>,
      'valueHex',
      '00',
    )).toBe(false);
    expect(() => assertWp06SourceDerivedFixtureProvenance(fixture)).not.toThrow();
    expect(() => assertWp06SourceDerivedFixtureProvenance(structuredClone(fixture)))
      .toThrow(/provenance/i);
  });

  it('selects the public burn whose recipient is an executable ErgoTree', async () => {
    const targetBurnIdHex = vectors.frontier.expected.burnIdHexes[2];
    const [first, second, fixture] = await Promise.all(
      vectors.frontier.expected.burnIdHexes.map(burnIdHex => (
        buildWp06SourceDerivedFixture({
          checkpoint,
          aggregateFinalityProof,
          vectors,
          targetBurnIdHex: burnIdHex,
        })
      )),
    );
    const wasmImport: any = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmImport.default ?? wasmImport;

    expect(fixture.targetBurn.burnIdHex).toBe(targetBurnIdHex);
    expect(fixture.targetBurn.eventIndex).toBe(5);
    expect(fixture.proofBundle.proof.leaf.burnIdHex).toBe(targetBurnIdHex);
    expect(fixture.proofBundle.proof.bridgeEventRootHex)
      .toBe(vectors.frontier.expected.bridgeEventRootHex);
    expect(() => assertExactExecutableErgoTree(
      wasm,
      first.targetBurn.recipientErgoTreeHex,
      'first public burn recipient',
    )).toThrow();
    expect(() => assertExactExecutableErgoTree(
      wasm,
      second.targetBurn.recipientErgoTreeHex,
      'second public burn recipient',
    )).toThrow();
    expect(assertExactExecutableErgoTree(
      wasm,
      fixture.targetBurn.recipientErgoTreeHex,
      'third public burn recipient',
    ))
      .toBe(fixture.targetBurn.recipientErgoTreeHex);
  });

  it('rejects receipt-root drift before producing a tracker injection', async () => {
    const frontierInput = structuredClone(vectors.frontier.input);
    frontierInput.receipts[0].transactionHash = `0x${'fe'.repeat(32)}`;

    await expect(buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors,
      frontierInput,
    })).rejects.toThrow(/event root does not match/i);
  });

  it('rejects a same-height canonical block replacement', async () => {
    await expect(buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors,
      canonicalBlockHashesHex: [
        checkpoint.checkpointCommitment.checkpoint.executionBlockHashHex,
        'fe'.repeat(32),
      ],
    })).rejects.toThrow(/hash drift|reorg/i);
  });

  it('rejects proof, checkpoint, target-burn, and extension-key substitutions independently', async () => {
    await expect(buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof: structuredClone(aggregateFinalityProof),
      vectors,
    })).rejects.toThrow(/aggregate finality proof provenance/i);

    await expect(buildWp06SourceDerivedFixture({
      checkpoint: structuredClone(checkpoint) as PinnedLocalSourceNativeVerifiedBridgeCheckpoint,
      aggregateFinalityProof,
      vectors,
    })).rejects.toThrow(/pinned-local-source native checkpoint provenance/i);

    await expect(buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors,
      targetBurnIdHex: 'fe'.repeat(32),
    })).rejects.toThrow(/absent/i);

    expect(() => buildWp06ExtensionMembership(
      checkpoint.checkpointCommitment,
      '0402',
    )).toThrow(/exact 0x0401/i);
  });

  it('binds the exact native verifier digest and retains the codec digest', async () => {
    const codecExecutableSha256Hex = 'aa'.repeat(32);
    const fixture = await buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors,
      nativeBuildIdentity: {
        verifierExecutableSha256Hex: aggregateFinalityProof.verifierProfileIdHex,
        codecExecutableSha256Hex,
      },
    });

    expect(fixture.nativeBuildIdentity).toEqual({
      verifierExecutableSha256Hex: aggregateFinalityProof.verifierProfileIdHex,
      codecExecutableSha256Hex,
    });
    await expect(buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors,
      nativeBuildIdentity: {
        verifierExecutableSha256Hex: 'ff'.repeat(32),
        codecExecutableSha256Hex,
      },
    })).rejects.toThrow(/verifier digest does not match the proof profile/i);
  });

  it('observes the exact immutable source-derived adversarial matrix', async () => {
    const fixture = await buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors,
    });

    const observed = await runWp06SourceDerivedAdversarialMatrix(fixture);

    expect(observed).toBe(WP06_SOURCE_DERIVED_NEGATIVE_CASES);
    expect(observed).toEqual([
      'receipt/root drift',
      'same-height Frontier replacement',
      'absent burn',
      'wrong extension key',
      'unfinalized target',
      'finality-horizon invalidity',
    ]);
    expect(Object.isFrozen(observed)).toBe(true);
  });

  it('freezes mutable descendants even when their parent was already frozen', async () => {
    const nestedVectors = structuredClone(vectors);
    Object.freeze(nestedVectors.frontier.expected);

    const fixture = await buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      vectors: nestedVectors,
    });

    expect(Object.isFrozen(fixture.vectors.frontier.expected.burnIdHexes)).toBe(true);
    expect(Reflect.set(
      fixture.vectors.frontier.expected.burnIdHexes as string[],
      '0',
      'fe'.repeat(32),
    )).toBe(false);
  });

  it('rejects a deeply frozen generic tracker result without source-specific provenance', () => {
    const genericResult = Object.freeze({
      sourceBindings: Object.freeze({ checkpointCommitmentHex: '00'.repeat(32) }),
    });
    expect(() => assertWp06SourceToTrackerVmResultProvenance(genericResult))
      .toThrow(/source-to-tracker provenance/i);
  });

  it('exposes one source-branded command with no chain submission or broadcast route', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(packageJson.scripts['trustless:wp06-source-to-tracker-vm'])
      .toBe('tsx src/scripts/spikes/spike15-wp06-source-to-tracker-vm.ts');

    const source = readFileSync(
      join(process.cwd(), 'src', 'scripts', 'spikes', 'spike15-wp06-source-to-tracker-vm.ts'),
      'utf8',
    );
    const trackerVmSource = readFileSync(
      join(process.cwd(), 'src', 'scripts', 'spikes', 'spike13-authenticated-spv-tracker-vm.ts'),
      'utf8',
    );
    const collectorSource = readFileSync(
      join(
        process.cwd(),
        'src',
        'test-fixtures',
        'wp06-source-derived-fixture.ts',
      ),
      'utf8',
    );
    const transitiveSurface = `${source}\n${trackerVmSource}\n${collectorSource}`;
    expect(transitiveSurface)
      .not.toMatch(/submit_transaction|sendTransaction|signAndSubmit|\/transactions\/check/);
    expect(transitiveSurface)
      .not.toMatch(/from ['"][^'"]*(?:sqlite|database|submit|broadcast)[^'"]*['"]/i);
    expect(trackerVmSource).toContain('Wallet.from_secrets');
    expect(source).toContain('generated in-memory signing');
    expect(source).toContain('Cargo may fetch');
    expect(source).toContain('missing locked dependencies');
    expect(source).toContain('assertWp06SourceToTrackerVmResultProvenance');
    expect(source).toContain('immutable WP-06 source-to-tracker provenance');
    expect(source).toContain('trackerHistoryAfterAdmission');
    expect(source).toContain('burnProofBundle');
    expect(source).toContain('targetBurn');
    expect(source).toContain('pegOut');
    expect(source).toContain('extensionMembership');
    expect(source).toContain('avlInsertProofHex');
    expect(source).toContain('R9 remains the finality');
    expect(source).toContain('Gate 5 closure');
  });
});
