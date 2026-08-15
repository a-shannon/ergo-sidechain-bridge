import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  EIP0045_BRIDGE_VALIDITY_SETTLEMENT_ADMISSION_PROFILE_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTEXT_V1_SCHEMA,
  EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTRACTS_V1_SCHEMA,
  EIP0045_BRIDGE_VALIDITY_SETTLEMENT_DUP_NFT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SIGMA_STATE_COMMIT,
  EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SOURCE_NETWORK_ID_HEX,
  buildEip0045BridgeValiditySettlementContextV1,
} from './bridge-validity-settlement-context-v1.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v1.js';
import {
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  extractFrontierBridgeEventRoot,
} from './frontier-bridge-event-root.js';
import {
  encodeValiditySpvTrackerAvlRegister,
  encodeValiditySpvTrackerValue,
  getValiditySpvTrackerDigest,
  deriveValiditySpvTrackerKey,
} from './spv-tracker-validity-v1.js';

const vectorBytes = readFileSync(
  new URL('../test-vectors/frontier-bridge-event-root-v1.json', import.meta.url),
);
const vector = JSON.parse(vectorBytes.toString('utf8'));
const TRACKER_NFT_ID_HEX = '91'.repeat(32);
const TRUST_ROOT_HEX =
  '4ebf246ef2a1ad2e27005b6fed7a85c7e2dcb4ce88c97400e31fd33bb5251454';
const SEMANTIC_PROGRAM_ID_HEX =
  'c175355a0813b4381e9ec9526e00dc0eb920bee5d841936ae2b8d3d3aea3e106';
const VERIFIER_PROFILE_ID_HEX = '82'.repeat(32);
const SIDECHAIN_HEIGHT = 1024;

async function fixture() {
  const extraction = extractFrontierBridgeEventRoot(vector.input);
  if (!extraction.commitment) throw new Error('test vector must contain burns');
  const trackerKeyHex = deriveValiditySpvTrackerKey({
    sidechainIdHex: vector.input.sidechainIdHex,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: vector.input.executionBlockHashHex,
  });
  const trackerValueHex = encodeValiditySpvTrackerValue({
    bridgeEventRootHex: extraction.commitment.bridgeEventRootHex,
    checkpointCommitmentHex: '51'.repeat(32),
    anchorHeaderIdHex: '52'.repeat(32),
    anchorHeaderHeight: 100,
    compatibilityStatementDigestHex: '53'.repeat(32),
    compatibilitySemanticProgramIdHex: SEMANTIC_PROGRAM_ID_HEX,
    compatibilityVerifierProfileIdHex: VERIFIER_PROFILE_ID_HEX,
    compatibilityPayloadDigestHex: '54'.repeat(32),
    compatibilityAggregateProofDigestHex: '55'.repeat(32),
  });
  const successorDigestHex = getValiditySpvTrackerDigest([{
    key: trackerKeyHex,
    value: trackerValueHex,
  }]);
  const successorRegisters = {
    R4: encodeLongRegister(1),
    R5: encodeValiditySpvTrackerAvlRegister(successorDigestHex),
    R6: encodeCollByteRegister(Buffer.from(vector.input.sidechainIdHex, 'hex')),
    R7: encodeLongRegister(SIDECHAIN_HEIGHT),
    R8: encodeIntRegister(101),
    R9: encodeCollByteRegister(Buffer.from(TRUST_ROOT_HEX, 'hex')),
  };
  const trackerUnsigned = {
    inputs: [{ boxId: '61'.repeat(32), extension: {} }],
    dataInputs: [],
    outputs: [{
      value: '10000000',
      ergoTree: EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
      assets: [{ tokenId: TRACKER_NFT_ID_HEX, amount: '1' }],
      additionalRegisters: successorRegisters,
      creationHeight: 101,
    }],
  };
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const parsed = wasm.UnsignedTransaction.from_json(JSON.stringify(trackerUnsigned));
  let parsedId: any;
  let trackerProoflessTransactionIdHex: string;
  try {
    parsedId = parsed.id();
    trackerProoflessTransactionIdHex = parsedId.to_str();
  } finally {
    parsedId?.free?.();
    parsed.free?.();
  }
  const trackerContext = {
    schema: 'e2s.bridge-validity-tracker-context.v1',
    version: 1,
    sourceAdmission: {
      trackerKeyHex,
      trackerValueHex,
      successorDigestHex,
    },
    trackerTransition: {
      trackerNftIdHex: TRACKER_NFT_ID_HEX,
      approvedTrustAnchorDigestHex: TRUST_ROOT_HEX,
      successorRegisters,
    },
    eip12UnsignedTransaction: trackerUnsigned,
    prooflessTransactionIdHex: trackerProoflessTransactionIdHex,
    boundaries: {
      exactTrackerSuccessorIncluded: true,
      profileActivated: false,
      gate5Closed: false,
      fundsAuthorityEstablished: false,
    },
  };
  const vaultPropositionHex = `0008cd02${'71'.repeat(32)}`;
  const duplicatePreventionPropositionHex = `0008cd02${'72'.repeat(32)}`;
  const identityRole = (propositionHex: string) => ({
    templateSha256Hex: sha256Hex(Buffer.from(`template:${propositionHex}`, 'ascii')),
    resolvedSourceSha256Hex: sha256Hex(Buffer.from(`source:${propositionHex}`, 'ascii')),
    propositionHex,
    propositionBytes: propositionHex.length / 2,
    propositionSha256Hex: sha256Hex(Buffer.from(propositionHex, 'hex')),
    contractIdHex: blake2b256Hex(Buffer.from(propositionHex, 'hex')),
  });
  const contractIdentity = {
    schema: EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTRACTS_V1_SCHEMA,
    version: 1,
    sigmaStateCommit:
      EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SIGMA_STATE_COMMIT,
    settlementProfileIdHex:
      EIP0045_BRIDGE_VALIDITY_SETTLEMENT_PROFILE_ID_HEX,
    vault: identityRole(vaultPropositionHex),
    duplicatePrevention:
      identityRole(duplicatePreventionPropositionHex),
    profileActivated: false,
    nodeCheckPerformed: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
  };
  return {
    trackerContext,
    contractIdentity,
    trackerContextBytes: Buffer.from(JSON.stringify(trackerContext), 'ascii'),
    contractIdentityBytes: Buffer.from(
      JSON.stringify(contractIdentity),
      'ascii',
    ),
    input: {
      trackerContextBytes: Buffer.from(JSON.stringify(trackerContext), 'ascii'),
      contractIdentityBytes: Buffer.from(
        JSON.stringify(contractIdentity),
        'ascii',
      ),
      frontierVectorBytes: vectorBytes,
    },
  };
}

describe('EIP-0045 ValiditySettlementV1 context fixture', () => {
  it('materializes the exact tracker data input plus DUP and causal vault spend', async () => {
    const f = await fixture();
    const context = await buildEip0045BridgeValiditySettlementContextV1(f.input);

    expect(context.schema)
      .toBe(EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTEXT_V1_SCHEMA);
    expect(context.profile).toMatchObject({
      sourceNetworkIdHex:
        EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SOURCE_NETWORK_ID_HEX,
      sidechainIdHex: vector.input.sidechainIdHex,
      trackerNftIdHex: TRACKER_NFT_ID_HEX,
      trackerContractIdHex:
        EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
      duplicatePreventionNftIdHex:
        EIP0045_BRIDGE_VALIDITY_SETTLEMENT_DUP_NFT_ID_HEX,
      admissionProfileIdHex:
        EIP0045_BRIDGE_VALIDITY_SETTLEMENT_ADMISSION_PROFILE_ID_HEX,
    });
    expect(context.profileIdHex)
      .toBe(EIP0045_BRIDGE_VALIDITY_SETTLEMENT_PROFILE_ID_HEX);
    expect(context.sourceBindings).toMatchObject({
      trackerContextSha256Hex: sha256Hex(f.trackerContextBytes),
      contractIdentitySha256Hex: sha256Hex(f.contractIdentityBytes),
      frontierVectorSha256Hex: sha256Hex(vectorBytes),
      trackerKeyHex: f.trackerContext.sourceAdmission.trackerKeyHex,
      trackerDigestHex:
        f.trackerContext.sourceAdmission.successorDigestHex,
      bridgeEventRootHex: vector.expected.bridgeEventRootHex,
      targetBurnIdHex: vector.expected.burnIdHexes[2],
      targetEventIndex: 5,
    });
    expect(context.contractIdentity).toMatchObject({
      sigmaStateCommit:
        EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SIGMA_STATE_COMMIT,
      causalVaultTemplateSha256Hex:
        f.contractIdentity.vault.templateSha256Hex,
      causalVaultResolvedSourceSha256Hex:
        f.contractIdentity.vault.resolvedSourceSha256Hex,
      duplicatePreventionTemplateSha256Hex:
        f.contractIdentity.duplicatePrevention.templateSha256Hex,
      duplicatePreventionResolvedSourceSha256Hex:
        f.contractIdentity.duplicatePrevention.resolvedSourceSha256Hex,
    });
    expect(context.inputBoxes).toHaveLength(3);
    expect(context.dataInputBoxes).toHaveLength(1);
    expect(context.eip12UnsignedTransaction).toMatchObject({
      inputs: [
        { boxId: context.inputBoxes[0].boxId },
        { boxId: context.inputBoxes[1].boxId },
        { boxId: context.inputBoxes[2].boxId },
      ],
      dataInputs: [{ boxId: context.dataInputBoxes[0].boxId }],
      outputs: [
        { value: '1000000' },
        { value: '3000000', ergoTree: `0008cd02${'43'.repeat(32)}` },
        { value: '7000000' },
        { value: '1100000' },
      ],
    });
    expect(context.contextExtensions.map(extension => extension.keys))
      .toEqual([[0, 1, 2], [0, 1, 2, 3], []]);
    expect(context.prooflessTransactionIdHex)
      .toBe(context.unsignedTransactionIdHex);
    expect(context.prooflessTransactionHex)
      .toHaveLength(context.prooflessTransactionBytes * 2);
    expect(context.inputBoxSigmaHex.every(value => value.length > 0))
      .toBe(true);
    expect(context.dataInputBoxSigmaHex.every(value => value.length > 0))
      .toBe(true);
    const whitespaceBoundTrackerBytes = Buffer.concat([
      Buffer.from(' \r\n', 'ascii'),
      f.trackerContextBytes,
      Buffer.from('\r\n', 'ascii'),
    ]);
    const whitespaceBoundContext =
      await buildEip0045BridgeValiditySettlementContextV1({
        ...f.input,
        trackerContextBytes: whitespaceBoundTrackerBytes,
      });
    expect(whitespaceBoundContext.sourceBindings.trackerContextSha256Hex)
      .toBe(sha256Hex(whitespaceBoundTrackerBytes));
    expect(whitespaceBoundContext.sourceBindings.trackerContextSha256Hex)
      .not.toBe(context.sourceBindings.trackerContextSha256Hex);
    expect(whitespaceBoundContext.prooflessTransactionIdHex)
      .toBe(context.prooflessTransactionIdHex);
    const whitespaceBoundFrontierBytes = Buffer.concat([
      Buffer.from(' \r\n', 'ascii'),
      vectorBytes,
      Buffer.from('\r\n', 'ascii'),
    ]);
    const whitespaceBoundFrontierContext =
      await buildEip0045BridgeValiditySettlementContextV1({
        ...f.input,
        frontierVectorBytes: whitespaceBoundFrontierBytes,
      });
    expect(
      whitespaceBoundFrontierContext.sourceBindings.frontierVectorSha256Hex,
    ).toBe(sha256Hex(whitespaceBoundFrontierBytes));
    expect(
      whitespaceBoundFrontierContext.sourceBindings.frontierVectorSha256Hex,
    ).not.toBe(context.sourceBindings.frontierVectorSha256Hex);
    expect(whitespaceBoundFrontierContext.prooflessTransactionIdHex)
      .toBe(context.prooflessTransactionIdHex);
    expect(context.boundaries).toEqual({
      exactWp06aaTrackerSuccessorConsumed: true,
      fullInputConjunctionReducedByFixture: false,
      singletonSetupLineageEstablished: false,
      bridgeEventRootFinalizedStateMembershipEstablished: false,
      feeFundingAuthorizationEstablished: false,
      signingPerformed: false,
      nodeCheckPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      profileActivated: false,
      gate5Closed: false,
      fundsAuthorityEstablished: false,
    });
  });

  it('rejects tracker, contract, provenance, and Frontier substitutions', async () => {
    const f = await fixture();
    const build = (overrides: Record<string, unknown>) =>
      buildEip0045BridgeValiditySettlementContextV1({
        ...f.input,
        ...overrides,
      });

    await expect(build({ trackerContextBytes: Buffer.alloc(0) }))
      .rejects.toThrow(/non-empty Uint8Array/);
    await expect(build({
      contractIdentityBytes: Buffer.from([0xff]),
    })).rejects.toThrow(/must be ASCII/);
    await expect(build({
      frontierVectorBytes: Buffer.from([0xfb, 0x7d]),
    })).rejects.toThrow(/must be ASCII/);
    await expect(build({
      contractIdentityBytes: Buffer.from(
        '{"schema":"first","schema":"second"}',
        'ascii',
      ),
    })).rejects.toThrow(/duplicate JSON object key: schema/);
    await expect(build({
      contractIdentityBytes: Buffer.from(JSON.stringify({
        ...f.contractIdentity,
        unexpected: true,
      }), 'ascii'),
    })).rejects.toThrow(/must contain exactly/);
    await expect(build({
      contractIdentityBytes: Buffer.from(JSON.stringify({
        ...f.contractIdentity,
        sigmaStateCommit: 'ff'.repeat(20),
      }), 'ascii'),
    })).rejects.toThrow(/SigmaState commit/);
    await expect(build({
      contractIdentityBytes: Buffer.from(JSON.stringify({
        ...f.contractIdentity,
        profileActivated: true,
      }), 'ascii'),
    })).rejects.toThrow(/boundaries are incompatible/);
    await expect(build({
      contractIdentityBytes: Buffer.from(JSON.stringify({
        ...f.contractIdentity,
        settlementProfileIdHex: 'ff'.repeat(32),
      }), 'ascii'),
    })).rejects.toThrow(/profile ID/);
    await expect(build({
      contractIdentityBytes: Buffer.from(JSON.stringify({
        ...f.contractIdentity,
        vault: {
          ...f.contractIdentity.vault,
          propositionHex: `0008cd02${'73'.repeat(32)}`,
        },
      }), 'ascii'),
    })).rejects.toThrow(/contract ID/);
    await expect(build({
      trackerContextBytes: Buffer.from(JSON.stringify({
        ...f.trackerContext,
        eip12UnsignedTransaction: {
          ...f.trackerContext.eip12UnsignedTransaction,
          outputs: [{
            ...f.trackerContext.eip12UnsignedTransaction.outputs[0],
            ergoTree: `0008cd02${'74'.repeat(32)}`,
          }],
        },
      }), 'ascii'),
    })).rejects.toThrow(/proposition differs/);
    const changedFrontier = structuredClone(vector);
    changedFrontier.input.receipts[0].logs[0].data =
      changedFrontier.input.receipts[0].logs[0].data.replace(
        '00000000002dc6c0',
        '00000000002dc6c1',
      );
    await expect(build({
      frontierVectorBytes: Buffer.from(
        JSON.stringify(changedFrontier),
        'ascii',
      ),
    }))
      .rejects.toThrow(/root does not match/);
  });
});

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
