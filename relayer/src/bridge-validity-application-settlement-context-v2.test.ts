import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import {
  deriveBridgeCheckpointCommitmentHex,
} from './bridge-checkpoint-commitment.js';
import {
  decodeBridgeCausalApplicationBindingV2,
  decodeBridgeValidityApplicationPayloadV3,
  deriveBridgeCausalApplicationBindingV2DigestHex,
  encodeBridgeValidityApplicationPayloadV3,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_CONTEXT_V2_SCHEMA,
  EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_FRONTIER_VECTOR_SHA256_HEX,
  buildEip0045BridgeValidityApplicationSettlementContextV2,
} from './bridge-validity-application-settlement-context-v2.js';
import {
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  extractFrontierBridgeEventRoot,
} from './frontier-bridge-event-root.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  deriveApplicationValidityPayloadDigestHex,
  deriveApplicationValiditySpvTrackerKey,
  encodeApplicationValiditySpvTrackerAvlRegister,
  encodeApplicationValiditySpvTrackerValue,
  getApplicationValiditySpvTrackerDigest,
} from './spv-tracker-validity-v2.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_CONTRACT_IDENTITY_SCHEMA,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_CONTRACT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_BYTES,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_SHA256_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_SIGMA_STATE_COMMIT,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_CONTRACT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_BYTES,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_SHA256_HEX,
} from './validity-application-settlement-tx-v2.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
} from './validity-application-settlement-v2.js';

const frontierBytes = readFileSync(new URL(
  '../test-vectors/frontier-bridge-event-root-application-v2.json',
  import.meta.url,
));
const frontierVector = JSON.parse(frontierBytes.toString('ascii'));
const finalityVector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-finality-statement-v2.json',
    import.meta.url,
  ),
  'utf8',
));
const SIDECHAIN_HEIGHT = 42;
const ANCHOR_HEADER_ID_HEX = '95'.repeat(32);
const CONSENSUS_BLOCK_HASH_HEX = '94'.repeat(32);

interface SyntheticSources {
  readonly trackerContext: Record<string, any>;
  readonly contractIdentity: Record<string, any>;
  readonly trackerBytes: Buffer;
  readonly contractBytes: Buffer;
  readonly frontierBytes: Buffer;
}

async function syntheticSources(input?: {
  readonly rootHex?: string;
  readonly burnLeafCount?: number;
}): Promise<SyntheticSources> {
  const syntheticFrontier = syntheticFrontierVector();
  const extraction = extractFrontierBridgeEventRoot(
    syntheticFrontier.input,
  );
  if (!extraction.commitment) throw new Error('synthetic vector has no burns');
  const bridgeEventRootHex =
    input?.rootHex ?? extraction.commitment.bridgeEventRootHex;
  const burnLeafCount =
    input?.burnLeafCount ?? extraction.commitment.leaves.length;
  const finalityPayloadHex = buildBoundFinalityPayloadHex({
    bridgeEventRootHex,
    burnLeafCount,
  });
  const applicationPayload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityPayloadHex,
    application: decodeBridgeCausalApplicationBindingV2(
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    ),
  });
  const decoded =
    decodeBridgeValidityApplicationPayloadV3(applicationPayload);
  const trackerKeyHex = deriveApplicationValiditySpvTrackerKey({
    sidechainIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex:
      syntheticFrontier.input.executionBlockHashHex,
  });
  const trackerValueHex = encodeApplicationValiditySpvTrackerValue({
    bridgeEventRootHex,
    checkpointCommitmentHex:
      decoded.finality.checkpointCommitmentHex,
    anchorHeaderIdHex: ANCHOR_HEADER_ID_HEX,
    anchorHeaderHeight: 100,
    sidechainConsensusBlockHashHex: CONSENSUS_BLOCK_HASH_HEX,
    burnLeafCount,
    applicationBindingDigestHex:
      decoded.applicationBindingDigestHex,
    settlementProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
    causalProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
    applicationPayloadDigestHex:
      deriveApplicationValidityPayloadDigestHex(applicationPayload),
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    verifierProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  });
  const trackerDigestHex = getApplicationValiditySpvTrackerDigest([{
    key: trackerKeyHex,
    value: trackerValueHex,
  }]);
  const successorRegisters = {
    R4: encodeLongRegister(1),
    R5: encodeApplicationValiditySpvTrackerAvlRegister(
      trackerDigestHex,
    ),
    R6: encodeCollByteRegister(Buffer.from(
      EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
      'hex',
    )),
    R7: encodeLongRegister(SIDECHAIN_HEIGHT),
    R8: encodeLongRegister(100),
    R9: encodeCollByteRegister(Buffer.from(
      VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
      'hex',
    )),
  };
  const trackerExtension = {
    '0': '1a00',
    '1': encodeCollByteRegister(applicationPayload),
    '2': encodeCollByteRegister(Buffer.from([0])),
    '3': '0406',
  };
  const eip12UnsignedTransaction = {
    inputs: [{ boxId: '66'.repeat(32), extension: trackerExtension }],
    dataInputs: [],
    outputs: [{
      value: '10000000',
      ergoTree:
        EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
      assets: [{
        tokenId:
          VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
        amount: '1',
      }],
      additionalRegisters: successorRegisters,
      creationHeight: 100,
    }],
  };
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const unsigned = wasm.UnsignedTransaction.from_json(
    JSON.stringify(eip12UnsignedTransaction),
  );
  const unsignedId = unsigned.id();
  const prooflessTransactionIdHex = unsignedId.to_str();
  unsignedId.free?.();
  unsigned.free?.();
  const trackerContext = {
    schema: 'e2s.bridge-validity-application-tracker-context.v2',
    version: 2,
    sourceAdmission: {
      statementDigestHex: 'e1'.repeat(32),
      rawSealDigestHex: 'e2'.repeat(32),
      trackerKeyHex,
      trackerValueHex,
      inputDigestHex: 'e3'.repeat(33),
      successorDigestHex: trackerDigestHex,
    },
    trackerTransition: {
      trackerNftIdHex:
        VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
      approvedTrustAnchorDigestHex:
        VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
      applicationBindingHex:
        EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
      inputValue: '10000000',
      inputRegisters: successorRegisters,
      successorRegisters,
      currentErgoHeight: 110,
      anchorHeader: {
        idHex: ANCHOR_HEADER_ID_HEX,
        height: 100,
        extensionRootHex: 'e4'.repeat(32),
        contextIndex: 3,
      },
      headers: [],
      provenance: {
        source: 'synthetic-local-context',
      },
    },
    contextExtension: {
      keys: [0, 1, 2, 3],
      valueTypes: [
        'Coll[Coll[Byte]]',
        'Coll[Byte]',
        'Coll[Byte]',
        'Int',
      ],
      proofChunkLengths: [],
      applicationPayloadBytes: 973,
      proofBundleBytes: 1,
      headerIndex: 3,
      eip12Values: trackerExtension,
      serializedHex: '00',
      serializedBytes: 1,
      serializedBlake2b256Hex: 'e5'.repeat(32),
    },
    eip12UnsignedTransaction,
    wasmRoundTripEip12: eip12UnsignedTransaction,
    unsignedTransactionIdHex: prooflessTransactionIdHex,
    prooflessTransactionIdHex,
    prooflessTransactionHex: '00',
    prooflessTransactionBytes: 1,
    rejectionVectors: {
      duplicateKey: {
        inputDigestHex: 'e6'.repeat(33),
        getProofHex: '00',
        transitionProofBundleHex: '00',
        expectedContractAcceptance: false,
      },
    },
    boundaries: {
      serializationConformanceOnly: true,
      exactTrackerSuccessorIncluded: true,
      exactContractPinnedApplicationProfileIncluded: true,
      selectedHeaderTupleIncluded: true,
      canonicalSyntheticHeaderIdsEstablished: true,
      proofValidityEstablishedByFixture: false,
      minedHeaderEvidenceEstablished: false,
      signingPerformed: false,
      nodeCheckPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      profileActivated: false,
      gate5Closed: false,
      fundsAuthorityEstablished: false,
    },
  };
  const contractIdentity = {
    schema:
      VALIDITY_APPLICATION_SETTLEMENT_V2_CONTRACT_IDENTITY_SCHEMA,
    version: 2,
    sigmaStateCommit:
      VALIDITY_APPLICATION_SETTLEMENT_V2_SIGMA_STATE_COMMIT,
    settlementProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
    causalProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
    applicationBindingDigestHex:
      deriveBridgeCausalApplicationBindingV2DigestHex(
        EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
      ),
    vault: contractRole(
      VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
      VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_BYTES,
      VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_SHA256_HEX,
      VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_CONTRACT_ID_HEX,
      'f1',
    ),
    duplicatePrevention: contractRole(
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_BYTES,
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_SHA256_HEX,
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_CONTRACT_ID_HEX,
      'f2',
    ),
    profileActivated: false,
    nodeCheckPerformed: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
  };
  return {
    trackerContext,
    contractIdentity,
    trackerBytes: asciiJson(trackerContext),
    contractBytes: asciiJson(contractIdentity),
    frontierBytes: asciiJson(syntheticFrontier),
  };
}

describe('Application-Bound Validity Settlement V2 context producer', () => {
  it('serializes a self-consistent 3-input/1-data-input partial payout', async () => {
    const sources = await syntheticSources();
    const fixture =
      await buildEip0045BridgeValidityApplicationSettlementContextV2({
        trackerContextBytes: sources.trackerBytes,
        contractIdentityBytes: sources.contractBytes,
        frontierVectorBytes: sources.frontierBytes,
      });

    expect(fixture.schema)
      .toBe(EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_CONTEXT_V2_SCHEMA);
    expect(fixture.profile.trackerNftIdHex).toBe('a1'.repeat(32));
    expect(fixture.profile.duplicatePreventionNftIdHex)
      .toBe('a2'.repeat(32));
    expect(fixture.profile.trackerNftIdHex)
      .not.toBe(fixture.profile.duplicatePreventionNftIdHex);
    expect(fixture.sourceBindings.frontierVectorNormalizedLfSha256Hex)
      .toBe(sha256Hex(sources.frontierBytes));
    expect(fixture.sourceBindings.publicFrontierRootVectorProvenanceMatched)
      .toBe(false);
    expect(sha256Hex(Buffer.from(
      frontierBytes.toString('ascii').replace(/\r\n/g, '\n'),
      'ascii',
    ))).toBe(
      EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_FRONTIER_VECTOR_SHA256_HEX,
    );
    expect(fixture.sourceBindings.applicationPayloadBytes).toBe(973);
    expect(fixture.settlementPlan.trackerValueHex)
      .toBe(fixture.sourceBindings.trackerValueHex);
    expect(fixture.settlementPlan.leafCount)
      .toBe(fixture.sourceBindings.burnLeafCount);
    expect(fixture.compatibility.v1TrackerContractIdHex)
      .toBe('c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b');
    expect(fixture.compatibility.v1TrackerPropositionHex)
      .not.toBe(fixture.contractIdentity.trackerPropositionHex);
    expect(fixture.inputBoxes).toHaveLength(3);
    expect(fixture.dataInputBoxes).toHaveLength(1);
    expect(fixture.contextExtensions.map(item => item.keys)).toEqual([
      [0, 1, 2],
      [0, 1, 2, 3],
      [],
    ]);
    expect(
      (fixture.eip12UnsignedTransaction.outputs as unknown[]).length,
    ).toBe(4);
    expect(fixture.wasmRoundTripEip12)
      .toEqual(fixture.eip12UnsignedTransaction);
    expect(fixture.prooflessTransactionIdHex)
      .toBe(fixture.unsignedTransactionIdHex);
    expect(fixture.boundaries).toEqual({
      localSerializationFixtureOnly: true,
      exactWp06adTrackerContextConsumed: true,
      applicationPayloadCrossCheckedOffChain: true,
      exactContractIdentityReceiptConsumed: true,
      frontierRootAndCountMatchedTracker: true,
      canonicalBurnPathValidatedByPlanner: true,
      payloadOrReceiptTransportedToSettlement: false,
      publicFrontierRootVectorProvenanceMatched: false,
      fullInputConjunctionReducedByFixture: false,
      singletonSetupLineageEstablished: false,
      bridgeEventRootFinalizedStateMembershipEstablished: false,
      feeFundingAuthorizationEstablished: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      proofValidityEstablishedInPayoutTransaction: false,
      nodeCheckPerformed: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.contextExtensions[1])).toBe(true);
    expect(() => {
      (fixture.sourceBindings as { trackerKeyHex: string })
        .trackerKeyHex = '00';
    }).toThrow();
  });

  it('rejects the real WP-06AD root/count mismatch with the public Frontier vector', async () => {
    const sources = await syntheticSources({
      rootHex: '77'.repeat(32),
      burnLeafCount: 1,
    });
    await expect(
      buildEip0045BridgeValidityApplicationSettlementContextV2({
        trackerContextBytes: sources.trackerBytes,
        contractIdentityBytes: sources.contractBytes,
        frontierVectorBytes: frontierBytes,
      }),
    ).rejects.toThrow(
      /Frontier root does not match the WP-06AD tracker value/,
    );
  });

  it('rejects V1 families and isolated tracker/receipt/provenance mutations', async () => {
    const sources = await syntheticSources();
    const cases: readonly [
      string,
      Buffer,
      Buffer,
      Buffer,
      RegExp,
    ][] = [
      [
        'V1 tracker schema',
        asciiJson({
          ...sources.trackerContext,
          schema: 'e2s.bridge-validity-tracker-context.v1',
          version: 1,
        }),
        sources.contractBytes,
        sources.frontierBytes,
        /requires the V2 application tracker context family/,
      ],
      [
        '264-byte tracker value',
        asciiJson({
          ...sources.trackerContext,
          sourceAdmission: {
            ...sources.trackerContext.sourceAdmission,
            trackerValueHex: '00'.repeat(264),
          },
        }),
        sources.contractBytes,
        sources.frontierBytes,
        /exactly 370 lowercase hex bytes/,
      ],
      [
        'tracker NFT',
        asciiJson({
          ...sources.trackerContext,
          trackerTransition: {
            ...sources.trackerContext.trackerTransition,
            trackerNftIdHex: '91'.repeat(32),
          },
        }),
        sources.contractBytes,
        sources.frontierBytes,
        /preserve one exact NFT/,
      ],
      [
        'contract proposition',
        sources.trackerBytes,
        asciiJson({
          ...sources.contractIdentity,
          vault: {
            ...sources.contractIdentity.vault,
            propositionHex:
              `00${sources.contractIdentity.vault.propositionHex.slice(2)}`,
          },
        }),
        sources.frontierBytes,
        /proposition identity is inconsistent/,
      ],
      [
        'Frontier expected-result provenance',
        sources.trackerBytes,
        sources.contractBytes,
        Buffer.from(
          sources.frontierBytes.toString('ascii').replace(
            /"bridgeEventRootHex":\s*"[0-9a-f]{64}"/,
            `"bridgeEventRootHex": "${'00'.repeat(32)}"`,
          ),
          'ascii',
        ),
        /expected result does not match extracted receipt semantics/,
      ],
      [
        'Frontier event format',
        sources.trackerBytes,
        sources.contractBytes,
        asciiJson({
          ...syntheticFrontierVector(),
          format: {
            ...syntheticFrontierVector().format,
            pegOutEvent: 'Changed(address,uint256,bytes)',
          },
        }),
        /Frontier event format is unsupported/,
      ],
      [
        'Frontier claim boundary',
        sources.trackerBytes,
        sources.contractBytes,
        asciiJson({
          ...syntheticFrontierVector(),
          claimBoundary: {
            ...syntheticFrontierVector().claimBoundary,
            finalityProven: true,
          },
        }),
        /Frontier claim boundary is incompatible/,
      ],
    ];
    for (const [label, tracker, contracts, frontier, expected] of cases) {
      await expect(
        buildEip0045BridgeValidityApplicationSettlementContextV2({
          trackerContextBytes: tracker,
          contractIdentityBytes: contracts,
          frontierVectorBytes: frontier,
        }),
        label,
      ).rejects.toThrow(expected);
    }
  });

  it('creates CLI output last and rejects symbolic-link source paths', async () => {
    const sources = await syntheticSources();
    const directory = mkdtempSync(join(tmpdir(), 'wp06ae-context-v2-'));
    try {
      const trackerPath = join(directory, 'tracker.json');
      const contractsPath = join(directory, 'contracts.json');
      const frontierPath = join(directory, 'frontier.json');
      const outputPath = join(directory, 'context.json');
      writeFileSync(trackerPath, sources.trackerBytes);
      writeFileSync(contractsPath, sources.contractBytes);
      writeFileSync(frontierPath, sources.frontierBytes);
      const result = runCli(
        trackerPath,
        contractsPath,
        frontierPath,
        outputPath,
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(existsSync(outputPath)).toBe(true);
      const written = JSON.parse(readFileSync(outputPath, 'ascii'));
      expect(written.schema)
        .toBe(EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_CONTEXT_V2_SCHEMA);
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);

      const mismatch = await syntheticSources({
        rootHex: '77'.repeat(32),
        burnLeafCount: 1,
      });
      const badTrackerPath = join(directory, 'bad-tracker.json');
      const badOutputPath = join(directory, 'must-not-exist.json');
      writeFileSync(badTrackerPath, mismatch.trackerBytes);
      const rejected = runCli(
        badTrackerPath,
        contractsPath,
        frontierPath,
        badOutputPath,
      );
      expect(rejected.status).not.toBe(0);
      expect(existsSync(badOutputPath)).toBe(false);

      const linkPath = join(directory, 'tracker-link.json');
      try {
        symlinkSync(trackerPath, linkPath, 'file');
        const linkOutputPath = join(directory, 'link-output.json');
        const linked = runCli(
          linkPath,
          contractsPath,
          frontierPath,
          linkOutputPath,
        );
        expect(linked.status).not.toBe(0);
        expect(linked.stderr).toContain('must not be a symbolic link');
        expect(existsSync(linkOutputPath)).toBe(false);
      } catch (error) {
        if (
          process.platform !== 'win32'
          || (error as NodeJS.ErrnoException).code !== 'EPERM'
        ) {
          throw error;
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function buildBoundFinalityPayloadHex(input: {
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
}): string {
  const bytes = Buffer.from(
    finalityVector.expected.encodedPayloadHex as string,
    'hex',
  );
  const checkpoint = Buffer.from(bytes.subarray(76, 292));
  Buffer.from(
    EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    'hex',
  ).copy(checkpoint, 4);
  checkpoint.writeBigUInt64BE(BigInt(SIDECHAIN_HEIGHT), 36);
  Buffer.from(CONSENSUS_BLOCK_HASH_HEX, 'hex').copy(checkpoint, 44);
  Buffer.from(
    frontierVector.input.executionBlockHashHex,
    'hex',
  ).copy(checkpoint, 76);
  Buffer.from(input.bridgeEventRootHex, 'hex').copy(checkpoint, 108);
  checkpoint.writeUInt32BE(input.burnLeafCount, 140);
  checkpoint.copy(bytes, 76);
  const commitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(checkpoint),
    'hex',
  );
  commitment.copy(bytes, 292);
  Buffer.from(
    VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
    'hex',
  ).copy(bytes, 44);
  Buffer.from(
    VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
    'hex',
  ).copy(bytes, 516);
  Buffer.concat([
    checkpoint.subarray(108, 140),
    commitment,
  ]).copy(bytes, 590);
  return bytes.toString('hex');
}

function syntheticFrontierVector(): Record<string, any> {
  const value = JSON.parse(JSON.stringify(frontierVector));
  value.input.sidechainIdHex =
    EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX;
  const extraction = extractFrontierBridgeEventRoot(value.input);
  if (!extraction.commitment) throw new Error('synthetic vector has no burns');
  value.expected = {
    burnCount: extraction.burns.length,
    eventIndexes: extraction.burns.map(burn => burn.eventIndex),
    burnIdHexes: extraction.burns.map(burn => burn.burnIdHex),
    recipientErgoTreeHashHexes:
      extraction.burns.map(burn => burn.recipientErgoTreeHashHex),
    leafHashHexes:
      extraction.commitment.leaves.map(leaf => leaf.leafHashHex),
    bridgeEventRootHex: extraction.commitment.bridgeEventRootHex,
  };
  return value;
}

function contractRole(
  propositionHex: string,
  propositionBytes: number,
  propositionSha256Hex: string,
  contractIdHex: string,
  fill: string,
) {
  return {
    templateSha256Hex: fill.repeat(32),
    resolvedSourceSha256Hex: `${fill[0]}3`.repeat(32),
    propositionBytes,
    propositionSha256Hex,
    propositionHex,
    contractIdHex,
  };
}

function asciiJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'ascii');
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function runCli(
  trackerPath: string,
  contractPath: string,
  frontierPath: string,
  outputPath: string,
) {
  return spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'src/scripts/build-bridge-validity-application-settlement-context-v2.ts',
      '--tracker-context',
      resolve(trackerPath),
      '--contract-identity',
      resolve(contractPath),
      '--frontier-vector',
      resolve(frontierPath),
      '--out',
      resolve(outputPath),
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
    },
  );
}
