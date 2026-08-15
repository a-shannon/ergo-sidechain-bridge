import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join, resolve } from 'path';
import { spawnSync } from 'child_process';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
} from './bridge-validity-consumer-contract-v1.js';
import {
  buildEip0045BridgeValidityContextExtensionV1,
} from './bridge-validity-context-extension-v1.js';
import {
  loadEip0045BridgeValidityCompleteCandidateForConsumerV1,
  loadEip0045BridgeValidityCompleteCandidateV1,
} from './bridge-validity-complete-candidate-v1.js';
import {
  assertEip0045BridgeValidityProofEnvelopeV1Matches,
  buildEip0045BridgeValidityProofEnvelopeV1,
} from './bridge-validity-proof-envelope-v1.js';
import {
  buildEip0045BridgeValidityProoflessTransactionV1,
} from './bridge-validity-proofless-transaction-v1.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v1.js';

const candidateDirectory = process.env.BRIDGE_EIP0045_CANDIDATE_DIR;
const trackerCandidateDirectory =
  process.env.BRIDGE_EIP0045_VALIDITY_TRACKER_CANDIDATE_DIR;
const EXPECTED_STATEMENT_DIGEST_HEX =
  'e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c';
const EXPECTED_TERMINAL_CONTROL_ID_HEX =
  '7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e';
const CANDIDATE_FILES = [
  'statement.bin',
  'program-id.bin',
  'profile-id.bin',
  'terminal-control-id.bin',
  'proof-chunk-0.bin',
  'proof-chunk-1.bin',
  'proof-chunk-2.bin',
  'proof-chunk-3.bin',
] as const;

describe.skipIf(candidateDirectory === undefined)(
  'real EIP-0045 candidate envelope integration',
  () => {
    it('ingests the complete Rust candidate under the executable JVM consumer identity', async () => {
      const root = resolve(candidateDirectory!);
      expect(isAbsolute(root)).toBe(true);
      const rootStat = lstatSync(root);
      expect(rootStat.isDirectory()).toBe(true);
      expect(rootStat.isSymbolicLink()).toBe(false);

      const manifest = parseCandidateManifest(root);
      const candidate = (name: typeof CANDIDATE_FILES[number]): Buffer => {
        const path = resolve(root, name);
        const stat = lstatSync(path);
        expect(stat.isFile()).toBe(true);
        expect(stat.isSymbolicLink()).toBe(false);
        const bytes = readFileSync(path);
        const expected = manifest.get(name)!;
        expect(bytes.length).toBe(expected.bytes);
        expect(blake2b256(bytes)).toBe(expected.digestHex);
        return bytes;
      };

      const statement = candidate('statement.bin');
      const proofChunks = [
        candidate('proof-chunk-0.bin'),
        candidate('proof-chunk-1.bin'),
        candidate('proof-chunk-2.bin'),
        candidate('proof-chunk-3.bin'),
      ];
      expect(candidate('program-id.bin').toString('hex'))
        .toBe(EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX);
      expect(candidate('profile-id.bin').toString('hex'))
        .toBe(EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX);
      expect(candidate('terminal-control-id.bin').toString('hex'))
        .toBe(EXPECTED_TERMINAL_CONTROL_ID_HEX);
      expect(statement.subarray(123, 155).toString('hex'))
        .toBe(EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX);
      expect(blake2b256(statement)).toBe(EXPECTED_STATEMENT_DIGEST_HEX);

      const chainDomainIdHex = statement.subarray(27, 59).toString('hex');
      const rawSealDigestHex = blake2b256(Buffer.concat(proofChunks));
      const envelope = buildEip0045BridgeValidityProofEnvelopeV1({
        proofChunks,
        applicationPayload: statement.subarray(159),
        programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
        profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
        encodedStatement: statement,
        chainDomainIdHex,
        contractPropositionBytes:
          EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
      });

      expect(envelope.encodedStatementHex).toBe(statement.toString('hex'));
      expect(envelope.contractIdHex)
        .toBe(EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX);
      expect(envelope.statementDigestHex).toBe(EXPECTED_STATEMENT_DIGEST_HEX);
      expect(envelope.rawSealDigestHex).toBe(rawSealDigestHex);
      expect(assertEip0045BridgeValidityProofEnvelopeV1Matches(envelope, {
        chainDomainIdHex,
        contractPropositionBytes:
          EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
        rawSealDigestHex,
      })).toEqual(envelope);

      const contextFixture = await buildEip0045BridgeValidityContextExtensionV1({
        envelope,
        expected: {
          chainDomainIdHex,
          contractPropositionBytes:
            EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
          rawSealDigestHex,
        },
      });
      expect(contextFixture.contextExtension.serializedHex.length / 2).toBe(223_342);
      expect(contextFixture.contextExtension.serializedBlake2b256Hex)
        .toBe('62909ee396c68bb80ef85b3edab3d39556ebe944bc61be0e5b95f5e57fd742c4');
      expect(contextFixture.unsignedTransactionIdHex)
        .toBe('89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e');

      const transactionFixture =
        await buildEip0045BridgeValidityProoflessTransactionV1({
          envelope,
          expected: {
            chainDomainIdHex,
            contractPropositionBytes:
              EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX,
            rawSealDigestHex,
          },
        });
      expect(transactionFixture.transaction.bytesToSignBytes).toBe(223_421);
      expect(transactionFixture.transaction.bytesToSignBlake2b256Hex)
        .toBe('89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e');
      expect(transactionFixture.transaction.transactionIdHex)
        .toBe('89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e');

      const loaded = loadEip0045BridgeValidityCompleteCandidateV1(root);
      expect(loaded.fixtureInput.envelope).toEqual(envelope);
      expect(loaded.fixtureInput.expected.contractPropositionBytes)
        .toBe(EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX);
    });
  },
);

describe.skipIf(trackerCandidateDirectory === undefined)(
  'real EIP-0045 validity tracker candidate ingestion',
  () => {
    it('binds the complete proof to the exact validity tracker proposition', () => {
      const loaded =
        loadEip0045BridgeValidityCompleteCandidateForConsumerV1(
          trackerCandidateDirectory!,
          {
            contractPropositionBytes:
              EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
          },
        );
      const envelope = assertEip0045BridgeValidityProofEnvelopeV1Matches(
        loaded.fixtureInput.envelope,
        loaded.fixtureInput.expected,
      );

      expect(envelope.contractIdHex)
        .toBe(EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX);
      expect(loaded.fixtureInput.expected.contractPropositionBytes)
        .toBe(EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX);
      expect(envelope.trustBoundary).toMatchObject({
        proofValidityEstablished: false,
        profileActivated: false,
        onChainAcceptanceEstablished: false,
        fundsAuthorityEstablished: false,
      });
    });
  },
);

describe('EIP-0045 context fixture output containment', () => {
  it('rejects an output whose ancestor junction resolves inside the candidate', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'bridge-context-output-link-'));
    const candidate = join(tempRoot, 'candidate');
    const alias = join(tempRoot, 'candidate-alias');
    const nestedOutputParent = join(candidate, 'nested-output');
    const output = join(alias, 'nested-output', 'fixture.json');

    try {
      mkdirSync(nestedOutputParent, { recursive: true });
      symlinkSync(
        candidate,
        alias,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/build-bridge-validity-context-extension-v1.ts',
          '--candidate-dir',
          candidate,
          '--out',
          output,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr)
        .toContain('--out must be outside the completed candidate directory');
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

function parseCandidateManifest(
  root: string,
): ReadonlyMap<string, { readonly bytes: number; readonly digestHex: string }> {
  const manifestPath = resolve(root, 'candidate-manifest-v1.txt');
  const stat = lstatSync(manifestPath);
  expect(stat.isFile()).toBe(true);
  expect(stat.isSymbolicLink()).toBe(false);
  const lines = readFileSync(manifestPath, 'ascii').split('\n');
  expect(lines.slice(0, 2)).toEqual([
    'schema=e2s.bridge-validity-eip0045-candidate.v1',
    'version=1',
  ]);
  expect(lines.slice(-2)).toEqual(['complete=true', '']);

  const entries = new Map<string, { bytes: number; digestHex: string }>();
  for (const line of lines.slice(2, -2)) {
    const match = /^file=([^:]+):([0-9]+):([0-9a-f]{64})$/.exec(line);
    expect(match).not.toBeNull();
    const [, name, bytes, digestHex] = match!;
    expect(entries.has(name)).toBe(false);
    entries.set(name, { bytes: Number(bytes), digestHex });
  }
  expect([...entries.keys()]).toEqual(CANDIDATE_FILES);
  return entries;
}

function blake2b256(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
