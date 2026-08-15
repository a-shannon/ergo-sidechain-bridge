import { spawnSync } from 'child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { describe, expect, it } from 'vitest';

import {
  loadEip0045BridgeApplicationCompleteCandidateV2,
} from './bridge-validity-application-complete-candidate-v2.js';
import {
  assertEip0045BridgeApplicationProofEnvelopeV2Matches,
} from './bridge-validity-application-proof-envelope-v2.js';
import {
  decodeBridgeValidityApplicationPayloadV3,
} from './bridge-validity-application-statement-v2.js';
import {
  buildEip0045BridgeApplicationTrackerContextV2,
} from './bridge-validity-application-tracker-context-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  buildErgoExtensionMembershipProof,
} from './ergo-extension-membership.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  buildApplicationValiditySpvAdmissionV2,
} from './spv-tracker-validity-v2.js';

const candidateDirectory =
  process.env.BRIDGE_EIP0045_APPLICATION_TRACKER_CANDIDATE_DIR;

describe.skipIf(candidateDirectory === undefined)(
  'real EIP-0045 application tracker candidate integration',
  () => {
    it('binds one real receipt through the exact V2 tracker transition', async () => {
      const root = resolve(candidateDirectory!);
      const stat = lstatSync(root);
      expect(stat.isDirectory()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
      const candidate =
        loadEip0045BridgeApplicationCompleteCandidateV2(root);
      const envelope =
        assertEip0045BridgeApplicationProofEnvelopeV2Matches(
          candidate.envelope,
          candidate.expected,
        );
      expect(envelope.contractIdHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX);
      expect(candidate.expected.contractPropositionBytes)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX);

      const payload = decodeBridgeValidityApplicationPayloadV3(
        envelope.consumerAbi.applicationPayloadHex,
      );
      const finality = payload.finality;
      const application = payload.application;
      expect(application.encodedBindingHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX);
      expect(application.sourceNetworkIdHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX);
      expect(application.sidechainIdHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX);
      expect(application.settlementProfileIdHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX);
      expect(application.causalProfileIdHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX);

      const membership = buildErgoExtensionMembershipProof([
        {
          key: Buffer.from('0201', 'hex'),
          value: Buffer.from('bb'.repeat(32), 'hex'),
        },
        {
          key: Buffer.from('0301', 'hex'),
          value: Buffer.from('dd'.repeat(32), 'hex'),
        },
        {
          key: Buffer.from(finality.extensionKeyHex, 'hex'),
          value: Buffer.from(finality.extensionValueHex, 'hex'),
        },
      ], Buffer.from(finality.extensionKeyHex, 'hex'));
      const currentErgoHeight = 2_000;
      const anchorContextIndex = 3;
      const wasmModule = await import('ergo-lib-wasm-nodejs');
      const wasm = wasmModule.default ?? wasmModule;
      const headerContext =
        buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
          currentHeight: currentErgoHeight,
          anchorContextIndex,
          anchorExtensionRootHex: membership.root.toString('hex'),
        });
      const plan = buildApplicationValiditySpvAdmissionV2({
        encodedStatement: envelope.encodedStatementHex,
        expectedContractIdHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
        trackerNftIdHex: finality.trackerNftIdHex,
        extensionProofHex: membership.proof.toString('hex'),
        suppliedAnchorTuple: {
          idHex: headerContext.anchorHeader.id,
          height: headerContext.anchorHeader.height,
          extensionRootHex: headerContext.anchorHeader.extensionRootHex,
          contextIndex: headerContext.anchorContextIndex,
        },
        expectedSourceNetworkIdHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
        expectedSidechainIdHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
        expectedTrustAnchorDigestHex: finality.trustedAnchorDigestHex,
        expectedApplicationBindingDigestHex:
          payload.applicationBindingDigestHex,
        expectedSettlementProfileIdHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
        expectedCausalProfileIdHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
        history: [],
        currentCounter: 0,
        currentLatestSidechainHeight:
          BigInt(finality.checkpoint.sidechainHeight) - 1n,
        currentStampHeight: currentErgoHeight - 10,
        currentErgoHeight,
      });
      const fixture =
        await buildEip0045BridgeApplicationTrackerContextV2({
          plan,
          envelope,
          expected: candidate.expected,
          headerContext,
        });

      expect(fixture.contextExtension.keys).toEqual([0, 1, 2, 3]);
      expect(fixture.contextExtension.applicationPayloadBytes).toBe(973);
      expect(fixture.contextExtension.serializedBytes).toBe(224_178);
      expect(fixture.contextExtension.serializedBlake2b256Hex)
        .toBe('3b610ce8276eb4be623add280dc6e9da9da6b3d2439d832ef3743efdc32c5e48');
      expect(fixture.prooflessTransactionBytes).toBe(226_795);
      expect(fixture.prooflessTransactionIdHex)
        .toBe('72353d8aaaa61625ec5e9080019775650d0d736d1bb7710d95bf11173225de81');
      expect(fixture.trackerTransition.applicationBindingHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX);
      expect(fixture.eip12UnsignedTransaction.outputs[0].ergoTree)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX);
      expect(fixture.boundaries).toMatchObject({
        serializationConformanceOnly: true,
        exactContractPinnedApplicationProfileIncluded: true,
        proofValidityEstablishedByFixture: false,
        minedHeaderEvidenceEstablished: false,
        signingPerformed: false,
        nodeCheckPerformed: false,
        submissionPerformed: false,
        broadcastPerformed: false,
        profileActivated: false,
        gate5Closed: false,
        fundsAuthorityEstablished: false,
      });
    });

    it('writes only with the explicit candidate trust anchor', () => {
      const root = resolve(candidateDirectory!);
      const candidate =
        loadEip0045BridgeApplicationCompleteCandidateV2(root);
      const payload = decodeBridgeValidityApplicationPayloadV3(
        candidate.envelope.consumerAbi.applicationPayloadHex,
      );
      const tempRoot = mkdtempSync(join(
        tmpdir(),
        'bridge-application-tracker-cli-',
      ));
      const acceptedOutput = join(tempRoot, 'accepted.json');
      const rejectedOutput = join(tempRoot, 'rejected.json');
      try {
        const accepted = runFixtureCli(
          root,
          acceptedOutput,
          payload.finality.trustedAnchorDigestHex,
        );
        expect(accepted.status).toBe(0);
        expect(existsSync(acceptedOutput)).toBe(true);
        const fixture = JSON.parse(readFileSync(acceptedOutput, 'ascii'));
        expect(fixture.schema)
          .toBe('e2s.bridge-validity-application-tracker-context.v2');
        expect(fixture.boundaries.fundsAuthorityEstablished).toBe(false);

        const rejected = runFixtureCli(
          root,
          rejectedOutput,
          '99'.repeat(32),
        );
        expect(rejected.status).toBe(1);
        expect(rejected.stderr)
          .toContain('explicit trust-anchor digest does not match');
        expect(existsSync(rejectedOutput)).toBe(false);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  },
);

function runFixtureCli(
  candidateRoot: string,
  output: string,
  trustedAnchorDigest: string,
): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'src/scripts/build-bridge-validity-application-tracker-context-v2.ts',
      '--candidate-dir',
      candidateRoot,
      '--out',
      output,
      '--trusted-anchor-digest',
      trustedAnchorDigest,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
}
