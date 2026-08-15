import { writeFileSync } from 'fs';

import {
  buildEip0045BridgeValidityTrackerContextV1,
} from '../bridge-validity-tracker-context-v1.js';
import {
  loadEip0045BridgeValidityCompleteCandidateForConsumerV1,
  resolveCandidateFixtureOutputPath,
  resolveEip0045BridgeValidityCandidateRoot,
} from '../bridge-validity-complete-candidate-v1.js';
import {
  assertEip0045BridgeValidityProofEnvelopeV1Matches,
} from '../bridge-validity-proof-envelope-v1.js';
import {
  decodeBridgeValidityFinalityPayloadV2,
} from '../bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
} from '../bridge-validity-tracker-contract-v1.js';
import {
  buildErgoExtensionMembershipProof,
} from '../ergo-extension-membership.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
} from '../bridge-validity-tracker-header-context-v1.js';
import {
  buildValiditySpvAdmissionV1,
} from '../spv-tracker-validity-v1.js';

const args = parseArgs(process.argv.slice(2));
const candidateRoot =
  resolveEip0045BridgeValidityCandidateRoot(args.candidateDir);
const outputPath = resolveCandidateFixtureOutputPath(
  candidateRoot,
  args.out,
);
const candidate =
  loadEip0045BridgeValidityCompleteCandidateForConsumerV1(
    candidateRoot,
    {
      contractPropositionBytes:
        EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
    },
  );
const envelope = assertEip0045BridgeValidityProofEnvelopeV1Matches(
  candidate.fixtureInput.envelope,
  candidate.fixtureInput.expected,
);
const payload = decodeBridgeValidityFinalityPayloadV2(
  envelope.consumerAbi.applicationPayloadHex,
);
const membership = buildErgoExtensionMembershipProof([
  {
    key: Buffer.from(payload.extensionKeyHex, 'hex'),
    value: Buffer.from(payload.extensionValueHex, 'hex'),
  },
  {
    key: Buffer.from('0501', 'hex'),
    value: Buffer.from('bb'.repeat(32), 'hex'),
  },
], Buffer.from(payload.extensionKeyHex, 'hex'));
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
const plan = buildValiditySpvAdmissionV1({
  envelope,
  expectedEnvelope: candidate.fixtureInput.expected,
  trackerNftIdHex: payload.trackerNftIdHex,
  extensionProofHex: membership.proof.toString('hex'),
  anchorHeader: {
    idHex: headerContext.anchorHeader.id,
    height: headerContext.anchorHeader.height,
    extensionRootHex: headerContext.anchorHeader.extensionRootHex,
    contextIndex: headerContext.anchorContextIndex,
  },
  approvedSidechainIdHex: payload.checkpoint.sidechainIdHex,
  approvedTrustAnchorDigestHex: args.trustedAnchorDigest,
  history: [],
  currentCounter: 0,
  currentLatestSidechainHeight:
    BigInt(payload.checkpoint.sidechainHeight) - 1n,
  currentStampHeight: currentErgoHeight - 10,
  currentErgoHeight,
});
const fixture =
  await buildEip0045BridgeValidityTrackerContextV1({
    plan,
    headerContext,
  });
writeFileSync(
  outputPath,
  `${JSON.stringify(fixture, null, 2)}\n`,
  { encoding: 'ascii', flag: 'wx' },
);
console.log(
  `PASS: wrote ${fixture.schema} `
  + `(${fixture.contextExtension.serializedBytes} ContextExtension bytes, `
  + `${fixture.prooflessTransactionBytes} proofless transaction bytes)`,
);
console.log(
  `ContextExtension digest: ${
    fixture.contextExtension.serializedBlake2b256Hex
  }`,
);
console.log(
  `Proofless transaction ID: ${fixture.prooflessTransactionIdHex}`,
);
console.log(
  'Boundary: canonical synthetic preactivation conformance only; no mined '
  + 'header evidence, signing, '
  + 'node check, submission, broadcast, Gate 5 closure, or funds authority.',
);

interface CliArgs {
  readonly candidateDir: string;
  readonly out: string;
  readonly trustedAnchorDigest: string;
}

function parseArgs(values: string[]): CliArgs {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (
      ![
        '--candidate-dir',
        '--out',
        '--trusted-anchor-digest',
      ].includes(flag)
      || !value
    ) {
      usage();
    }
    if (parsed.has(flag)) throw new Error(`duplicate argument: ${flag}`);
    parsed.set(flag, value);
  }
  if (
    values.length !== 6
    || !parsed.has('--candidate-dir')
    || !parsed.has('--out')
    || !parsed.has('--trusted-anchor-digest')
  ) {
    usage();
  }
  const trustedAnchorDigest =
    parsed.get('--trusted-anchor-digest')!;
  if (!/^[0-9a-f]{64}$/.test(trustedAnchorDigest)) {
    throw new Error(
      '--trusted-anchor-digest must be exactly 32 lowercase hex bytes',
    );
  }
  return {
    candidateDir: parsed.get('--candidate-dir')!,
    out: parsed.get('--out')!,
    trustedAnchorDigest,
  };
}

function usage(): never {
  throw new Error(
    'Usage: npm run proof:validity-tracker:fixture -- '
    + '--candidate-dir <absolute completed candidate directory> '
    + '--out <absolute new fixture.json> '
    + '--trusted-anchor-digest <approved 32-byte lowercase hex digest>',
  );
}
