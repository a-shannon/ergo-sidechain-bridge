import { writeFileSync } from 'fs';

import {
  loadEip0045BridgeApplicationCompleteCandidateV2,
} from '../bridge-validity-application-complete-candidate-v2.js';
import {
  decodeBridgeValidityApplicationPayloadV3,
} from '../bridge-validity-application-statement-v2.js';
import {
  buildEip0045BridgeApplicationTrackerContextV2,
} from '../bridge-validity-application-tracker-context-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from '../bridge-validity-tracker-contract-v2.js';
import {
  resolveCandidateFixtureOutputPath,
} from '../bridge-validity-complete-candidate-v1.js';
import {
  buildErgoExtensionMembershipProof,
} from '../ergo-extension-membership.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
} from '../bridge-validity-tracker-header-context-v1.js';
import {
  buildApplicationValiditySpvAdmissionV2,
} from '../spv-tracker-validity-v2.js';

const args = parseArgs(process.argv.slice(2));
const candidate =
  loadEip0045BridgeApplicationCompleteCandidateV2(args.candidateDir);
const outputPath = resolveCandidateFixtureOutputPath(
  candidate.candidateRoot,
  args.out,
);
const payload = decodeBridgeValidityApplicationPayloadV3(
  candidate.envelope.consumerAbi.applicationPayloadHex,
);
const finality = payload.finality;
const application = payload.application;
if (finality.trustedAnchorDigestHex !== args.trustedAnchorDigest) {
  throw new Error(
    'the explicit trust-anchor digest does not match the completed candidate',
  );
}
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
  encodedStatement: candidate.envelope.encodedStatementHex,
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
  expectedTrustAnchorDigestHex: args.trustedAnchorDigest,
  expectedApplicationBindingDigestHex:
    payload.applicationBindingDigestHex,
  expectedSettlementProfileIdHex:
    application.settlementProfileIdHex,
  expectedCausalProfileIdHex: application.causalProfileIdHex,
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
    envelope: candidate.envelope,
    expected: candidate.expected,
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
  'Boundary: local preactivation conformance only; the explicit trust-anchor '
  + 'digest is caller authority. No mined header evidence, proof activation, '
  + 'signing, node check, submission, broadcast, Gate 5 closure, or funds '
  + 'authority is established.',
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
  const trustedAnchorDigest = parsed.get('--trusted-anchor-digest')!;
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
    'Usage: npm run proof:validity-application-tracker:fixture -- '
    + '--candidate-dir <absolute completed candidate directory> '
    + '--out <absolute new fixture.json> '
    + '--trusted-anchor-digest <approved 32-byte lowercase hex digest>',
  );
}
