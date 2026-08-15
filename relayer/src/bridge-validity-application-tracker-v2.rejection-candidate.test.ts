import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { describe, expect, it } from 'vitest';

import {
  loadEip0045BridgeApplicationBindingRejectionCandidateV2,
} from './bridge-validity-application-complete-candidate-v2.js';
import {
  decodeBridgeValidityApplicationPayloadV3,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';

const candidateDirectory =
  process.env
    .BRIDGE_EIP0045_APPLICATION_TRACKER_BINDING_REJECTION_CANDIDATE_DIR;

describe.skipIf(candidateDirectory === undefined)(
  'real EIP-0045 application binding rejection candidate',
  () => {
    it('loads one alternate proof candidate with one runtime hash mutation', () => {
      const candidate =
        loadEip0045BridgeApplicationBindingRejectionCandidateV2(
          resolve(candidateDirectory!),
        );
      const payload = decodeBridgeValidityApplicationPayloadV3(
        candidate.envelope.consumerAbi.applicationPayloadHex,
      );
      const canonical = Buffer.from(
        EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
        'hex',
      );
      const alternate = Buffer.from(
        payload.application.encodedBindingHex,
        'hex',
      );
      const differences = [...canonical.keys()].filter(
        index => canonical[index] !== alternate[index],
      );

      expect(candidate.mutationField)
        .toBe('bridge-runtime-code-sha256');
      expect(candidate.envelope.contractIdHex)
        .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX);
      expect(differences).toEqual([168]);
      expect(canonical[168]).toBe(0xbb);
      expect(alternate[168]).toBe(0xba);
      expect(candidate.envelope.consumerAbi.applicationPayloadHex.length / 2)
        .toBe(973);
      expect(candidate.envelope.encodedStatementHex.length / 2)
        .toBe(1_132);
    });

    it('builds a distinct rejection fixture only with the explicit trust anchor', () => {
      const root = resolve(candidateDirectory!);
      const candidate =
        loadEip0045BridgeApplicationBindingRejectionCandidateV2(root);
      const payload = decodeBridgeValidityApplicationPayloadV3(
        candidate.envelope.consumerAbi.applicationPayloadHex,
      );
      const tempRoot = mkdtempSync(join(
        tmpdir(),
        'bridge-application-binding-rejection-cli-',
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
        const fixture = JSON.parse(
          readFileSync(acceptedOutput, 'ascii'),
        );
        expect(fixture.schema).toBe(
          'e2s.bridge-validity-application-tracker-binding-rejection-context.v2',
        );
        expect(fixture.trackerTransition.applicationBindingHex)
          .toBe(payload.application.encodedBindingHex);
        expect(fixture.contextExtension.serializedBytes).toBe(224_178);
        expect(fixture.contextExtension.serializedBlake2b256Hex)
          .toBe(
            'd3c1592783d13120a01900e63d3b902f5f90299c4ac967c83daf7cee806410b2',
          );
        expect(fixture.prooflessTransactionBytes).toBe(226_795);
        expect(fixture.prooflessTransactionIdHex)
          .toBe(
            'f4332ecd54cabf88452e45832787ce9fa6802a0aad2776b1249bfd1193d1759b',
          );
        expect(fixture.boundaries).toMatchObject({
          exactContractPinnedApplicationProfileIncluded: false,
          expectedContractAcceptance: false,
          signingPerformed: false,
          nodeCheckPerformed: false,
          submissionPerformed: false,
          broadcastPerformed: false,
          profileActivated: false,
          gate5Closed: false,
          fundsAuthorityEstablished: false,
        });

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
      'src/scripts/build-bridge-validity-application-tracker-binding-rejection-context-v2.ts',
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
