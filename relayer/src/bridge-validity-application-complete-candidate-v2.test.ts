import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import blakejs from 'blakejs';
import { afterEach, describe, expect, it } from 'vitest';

import {
  decodeBridgeCausalApplicationBindingV2,
  encodeBridgeValidityApplicationPayloadV3,
  encodeEip0045BridgeApplicationStatementV2,
} from './bridge-validity-application-statement-v2.js';
import {
  loadEip0045BridgeApplicationCompleteCandidateV2,
} from './bridge-validity-application-complete-candidate-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES,
} from './bridge-validity-proof-envelope-v1.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
} from './spv-tracker-validity-v2.js';

const TERMINAL_CONTROL_ID_HEX =
  '7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e';
const APPLICATION_TRACKER_FINALITY_PAYLOAD_HEX =
  '4532535f4252494447455f56414c49444954595f46494e414c4954595f5041594c4f41445f563200'
  + '02010100a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'
  + '01010100222222222222222222222222222222222222222222222222222222222222222200000000'
  + '0000002adc40b6eb73a31b03e44e6a49de0488b2b21535ec87bd25321ed38901237940956666666'
  + '666666666666666666666666666666666666666666666666666666666777777777777777777777777'
  + '77777777777777777777777777777777777777770000000100000000000000098019f06e148b'
  + '4364bbbf759bb879809ed1e586d3c2cbaa9a3e64dd01d24f378a9af0d0a43a6c712b974c22f170'
  + '5598fc71edf154cad2348d3abe89d1ccbed100311c992344c66e3a124b49c39c46343fc99d9fa91'
  + 'ec4d1d718d560ff127bf1db4b65487e9f20c59e7d49b4458afd3a7dfc88ad9d684eebc467fcde6'
  + 'd5af3c6cac175355a0813b4381e9ec9526e00dc0eb920bee5d841936ae2b8d3d3aea3e106a2a2a2'
  + 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2d58209bc646394ff'
  + '8e3a01fd78d9bd6ce0f49f57eaa1261a450de02f3007cfeb7844d54769787b079b7e246a49ece96'
  + 'cde519aea4a012eb4dedf3cb0624622962aa7ed3647e06a6b2b6f0757d4378908420eb78be49f47f'
  + '3e7d8e236a95aabd7bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493a'
  + 'be000000000000002adc40b6eb73a31b03e44e6a49de0488b2b21535ec87bd25321ed3890123794'
  + '09504017777777777777777777777777777777777777777777777777777777777777777311c99234'
  + '4c66e3a124b49c39c46343fc99d9fa91ec4d1d718d560ff127bf1db';
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('complete EIP-0045 application candidate V2', () => {
  it('loads one create-last manifest and binds the exact tracker proposition', () => {
    const root = writeCandidate();
    const loaded =
      loadEip0045BridgeApplicationCompleteCandidateV2(root);

    expect(loaded.candidateRoot).toBe(root);
    expect(loaded.envelope.contractIdHex)
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX);
    expect(loaded.envelope.consumerAbi.applicationPayloadHex.length / 2)
      .toBe(973);
    expect(loaded.envelope.encodedStatementHex.length / 2).toBe(1_132);
    expect(loaded.envelope.consumerAbi.programIdHex)
      .toBe(EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX);
    expect(loaded.expected.rawSealDigestHex)
      .toBe(loaded.envelope.rawSealDigestHex);
    expect(Object.isFrozen(loaded)).toBe(true);
  });

  it('rejects missing completion, V1 manifests, and file-order drift', () => {
    for (const mutate of [
      (manifest: string) => manifest.replace('complete=true\n', ''),
      (manifest: string) => manifest
        .replace(
          'schema=e2s.bridge-validity-eip0045-application-candidate.v2',
          'schema=e2s.bridge-validity-eip0045-candidate.v1',
        )
        .replace('version=2', 'version=1'),
      (manifest: string) => {
        const lines = manifest.split('\n');
        [lines[2], lines[3]] = [lines[3], lines[2]];
        return lines.join('\n');
      },
    ]) {
      const root = writeCandidate();
      const manifestPath = join(root, 'candidate-manifest-v2.txt');
      writeFileSync(
        manifestPath,
        mutate(readFileSync(manifestPath, 'ascii')),
        'ascii',
      );
      expect(() =>
        loadEip0045BridgeApplicationCompleteCandidateV2(root),
      ).toThrow();
    }
  });

  it('rejects candidate byte drift and a substituted V1 program identity', () => {
    const changedProofRoot = writeCandidate();
    const proofPath = join(changedProofRoot, 'proof-chunk-0.bin');
    const proof = readFileSync(proofPath);
    proof[0] ^= 1;
    writeFileSync(proofPath, proof);
    expect(() =>
      loadEip0045BridgeApplicationCompleteCandidateV2(changedProofRoot),
    ).toThrow('file identity mismatch');

    const changedProgramRoot = writeCandidate();
    writeFileSync(
      join(changedProgramRoot, 'program-id.bin'),
      Buffer.alloc(32, 0x77),
    );
    rewriteManifest(changedProgramRoot);
    expect(() =>
      loadEip0045BridgeApplicationCompleteCandidateV2(changedProgramRoot),
    ).toThrow('application guest program ID mismatch');
  });
});

function writeCandidate(): string {
  const root = mkdtempSync(join(tmpdir(), 'bridge-application-candidate-v2-'));
  roots.push(root);
  const applicationPayload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: APPLICATION_TRACKER_FINALITY_PAYLOAD_HEX,
    application: decodeBridgeCausalApplicationBindingV2(
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    ),
  });
  const files = new Map<string, Buffer>([
    [
      'statement.bin',
      encodeEip0045BridgeApplicationStatementV2({
        chainDomainIdHex: '11'.repeat(32),
        profileIdHex:
          EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
        programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
        contractIdHex: EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
        applicationPayload,
      }),
    ],
    [
      'program-id.bin',
      Buffer.from(EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX, 'hex'),
    ],
    [
      'profile-id.bin',
      Buffer.from(
        EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
        'hex',
      ),
    ],
    ['terminal-control-id.bin', Buffer.from(TERMINAL_CONTROL_ID_HEX, 'hex')],
  ]);
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.forEach((length, index) => {
    files.set(`proof-chunk-${index}.bin`, Buffer.alloc(length, index + 1));
  });
  for (const [name, bytes] of files) {
    writeFileSync(join(root, name), bytes, { flag: 'wx' });
  }
  rewriteManifest(root);
  return root;
}

function rewriteManifest(root: string): void {
  const names = [
    'statement.bin',
    'program-id.bin',
    'profile-id.bin',
    'terminal-control-id.bin',
    'proof-chunk-0.bin',
    'proof-chunk-1.bin',
    'proof-chunk-2.bin',
    'proof-chunk-3.bin',
  ];
  const lines = [
    'schema=e2s.bridge-validity-eip0045-application-candidate.v2',
    'version=2',
    ...names.map((name) => {
      const bytes = readFileSync(join(root, name));
      return `file=${name}:${bytes.length}:${blake2b256Hex(bytes)}`;
    }),
    'complete=true',
    '',
  ];
  writeFileSync(
    join(root, 'candidate-manifest-v2.txt'),
    lines.join('\n'),
    'ascii',
  );
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
