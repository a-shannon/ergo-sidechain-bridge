import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  CHECK_ONLY_COMMITTEE_THRESHOLD,
} from './committee-config.js';
import {
  derivePegInCausalLineageProfileV3,
  type PegInCausalLineageProfileV3Semantics,
} from './peg-in-causal-lineage-profile-v3.js';
import {
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
} from './spv-tracker-validity-v2.js';
import {
  VALIDITY_APPLICATION_LINEAGE_COMPILER_BATCH_V1_SHA256_HEX,
  VALIDITY_APPLICATION_LINEAGE_COMPILER_RECEIPT_V1_SCHEMA,
  VALIDITY_APPLICATION_LINEAGE_SBT_VERSION,
  VALIDITY_APPLICATION_LINEAGE_SCALA_VERSION,
  VALIDITY_APPLICATION_LINEAGE_SIGMASTATE_COMMIT,
  assertCompiledValidityApplicationLineageInstanceV3Candidate,
  compileValidityApplicationLineageInstanceV3,
  createPinnedValidityApplicationLineageCompilerV3,
  deriveValidityApplicationLineageFinalityPolicyIdV1Hex,
  deriveValidityApplicationLineageSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationLineageCompilerReceiptV1,
  type ValidityApplicationLineageCompilerV3,
  type ValidityApplicationLineageProofBindingV3,
} from './validity-application-lineage-instance-v3.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const TEMPLATE_PATHS = {
  tracker: resolve(
    BRIDGE_ROOT,
    'contracts',
    'SPVTrackerValidityApplicationLineageV3.es',
  ),
  causalVault: resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainCausalVaultValidityApplicationV2.es',
  ),
  duplicatePrevention: resolve(
    BRIDGE_ROOT,
    'contracts',
    'DoubleUnlockPreventionValidityApplicationV2.es',
  ),
  sourceLock: resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainLockCausalLineageV3.es',
  ),
} as const;
const JVM_RECEIPT_PATH = resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-lineage-compiler-v3.json',
);
const PINNED_COMPILER_BATCH_JSON =
  readFileSync(JVM_RECEIPT_PATH, 'utf8');
const TEMPLATES = Object.freeze({
  tracker: readFileSync(TEMPLATE_PATHS.tracker, 'utf8'),
  causalVault: readFileSync(TEMPLATE_PATHS.causalVault, 'utf8'),
  duplicatePrevention: readFileSync(
    TEMPLATE_PATHS.duplicatePrevention,
    'utf8',
  ),
  sourceLock: readFileSync(TEMPLATE_PATHS.sourceLock, 'utf8'),
});
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const EXPECTED_TRACKER_GENESIS_BOX_ID =
  '00e4ed6ac28c8ccd2a3476a39cb8ac33f7fdefefd0b88978841ed9bb9045a7e9';
const EXPECTED_DUP_GENESIS_BOX_ID =
  '667382038b0da5742442e04629d11ca4047a73ea98da1b21ba37e5bd8a4eb538';
const EXPECTED_LINEAGE_PROFILE_ID =
  '0xab7b2ad7d79dfedb57ec1ba2c9e2d09ab404d3bda6c311a3a90bc75957c4b246';
const APPROVED_TRUST_ANCHOR_DIGEST_HEX = `0x${'aa'.repeat(32)}`;
const PROOF_BINDING: ValidityApplicationLineageProofBindingV3 = {
  proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  approvedTrustAnchorDigestHex: APPROVED_TRUST_ANCHOR_DIGEST_HEX,
  programIdHex: `0x${EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX}`,
  verifierProfileIdHex:
    `0x${EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX}`,
};
const COMMITTEE = {
  publicKeys: CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  threshold: CHECK_ONLY_COMMITTEE_THRESHOLD,
} as const;
const RUNTIME_BINDING = {
  bridgeRuntimeCodeSha256Hex: 'bb'.repeat(32),
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: 'cc'.repeat(32),
  tokenRuntimeCodeBytes: 2048,
} as const;

async function genesisInputs(): Promise<readonly [Eip12Box, Eip12Box]> {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [0, 1, 2].map(() => ({
      value: '100000000',
      ergoTree: GENESIS_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    })),
  }, 'application lineage V3 genesis fixture');
  return [funding.outputs[0], funding.outputs[1]];
}

async function deriveCandidate(overrides: Partial<
  PegInCausalLineageProfileV3Semantics
> = {}) {
  const [trackerGenesisInputBox, duplicatePreventionGenesisInputBox] =
    await genesisInputs();
  const semantics: PegInCausalLineageProfileV3Semantics = {
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    sourceLockTemplateSha256Hex: `0x${sha256(TEMPLATES.sourceLock)}`,
    validityTrackerTemplateSha256Hex: `0x${sha256(TEMPLATES.tracker)}`,
    causalVaultTemplateSha256Hex: `0x${sha256(TEMPLATES.causalVault)}`,
    duplicatePreventionTemplateSha256Hex:
      `0x${sha256(TEMPLATES.duplicatePrevention)}`,
    finalityPolicyIdHex:
      deriveValidityApplicationLineageFinalityPolicyIdV1Hex(PROOF_BINDING),
    proofSystemIdHex: PROOF_BINDING.proofSystemIdHex,
    proofProfileIdHex: PROOF_BINDING.proofProfileIdHex,
    sourceCommitmentPolicyIdHex:
      deriveValidityApplicationLineageSourceCommitmentPolicyIdV1Hex(COMMITTEE),
    profileRevision: '1',
    activationHeight: '0',
    ...overrides,
  };
  return derivePegInCausalLineageProfileV3({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    semantics,
  });
}

async function compileCandidate(
  compiler: ValidityApplicationLineageCompilerV3 =
    createPinnedValidityApplicationLineageCompilerV3(
      PINNED_COMPILER_BATCH_JSON,
    ),
  candidate = deriveCandidate(),
) {
  return compileValidityApplicationLineageInstanceV3({
    lineageCandidate: await candidate,
    templates: TEMPLATES,
    runtimeBinding: RUNTIME_BINDING,
    proofBinding: PROOF_BINDING,
    committee: COMMITTEE,
    compiler,
  });
}

describe('validity application lineage instance V3', () => {
  it('compiles one exact non-circular instance in dependency order', async () => {
    const compiled = await compileCandidate();

    expect(Object.values(compiled.contracts).map(
      contract => contract.receipt.role,
    )).toEqual([
      'tracker',
      'causalVault',
      'duplicatePrevention',
      'sourceLock',
    ]);
    expect(Object.values(compiled.contracts).map(
      contract => contract.receipt.treeVersion,
    )).toEqual([4, 0, 0, 0]);
    expect(compiled.genesis).toEqual({
      trackerInputBoxIdHex: `0x${EXPECTED_TRACKER_GENESIS_BOX_ID}`,
      trackerNftIdHex: `0x${EXPECTED_TRACKER_GENESIS_BOX_ID}`,
      duplicatePreventionInputBoxIdHex: `0x${EXPECTED_DUP_GENESIS_BOX_ID}`,
      duplicatePreventionNftIdHex: `0x${EXPECTED_DUP_GENESIS_BOX_ID}`,
    });
    expect(compiled.application.statementContractIdHex)
      .toBe(compiled.contracts.tracker.receipt.contractIdHex);
    expect(compiled.relations).toEqual({
      trackerContractBoundIntoVault: true,
      vaultContractBoundIntoDuplicatePrevention: true,
      vaultContractBoundIntoSourceLock: true,
      singletonIdsDerivedFromGenesisInputs: true,
    });
    expect(Object.values(compiled.boundaries).every(value => value === false))
      .toBe(true);
    expect(() =>
      assertCompiledValidityApplicationLineageInstanceV3Candidate(compiled)
    ).not.toThrow();
    expect(() =>
      assertCompiledValidityApplicationLineageInstanceV3Candidate(
        structuredClone(compiled),
      )
    ).toThrow(/same-process derived lineage profile/);
  });

  it('is byte-deterministic for repeated exact compilation', async () => {
    const first = await compileCandidate();
    const second = await compileCandidate();

    expect(second).toEqual(first);
    expect(first.contracts.tracker.templateSha256Hex)
      .toBe(sha256(TEMPLATES.tracker));
    expect(first.contracts.causalVault.templateSha256Hex)
      .toBe(sha256(TEMPLATES.causalVault));
    expect(first.contracts.duplicatePrevention.templateSha256Hex)
      .toBe(sha256(TEMPLATES.duplicatePrevention));
    expect(first.contracts.sourceLock.templateSha256Hex)
      .toBe(sha256(TEMPLATES.sourceLock));
  });

  it('accepts the exact create-only pinned-JVM compiler receipt', async () => {
    const batch = JSON.parse(PINNED_COMPILER_BATCH_JSON) as {
      schema: string;
      version: number;
      sigmaStateCommit: string;
      scalaVersion: string;
      sbtVersion: string;
      contracts: ValidityApplicationLineageCompilerReceiptV1[];
      profileActivated: boolean;
      nodeCheckPerformed: boolean;
      signingAuthorityEstablished: boolean;
      submissionAuthorityEstablished: boolean;
      broadcastAuthorityEstablished: boolean;
      fundsAuthorityEstablished: boolean;
      gate5Closed: boolean;
    };
    expect(Object.keys(batch).sort()).toEqual([
      'broadcastAuthorityEstablished',
      'contracts',
      'fundsAuthorityEstablished',
      'gate5Closed',
      'nodeCheckPerformed',
      'profileActivated',
      'sbtVersion',
      'scalaVersion',
      'schema',
      'sigmaStateCommit',
      'signingAuthorityEstablished',
      'submissionAuthorityEstablished',
      'version',
    ]);
    expect(batch).toMatchObject({
      schema: 'e2s.validity-application-lineage-compiler-batch.v1',
      version: 1,
      sigmaStateCommit: VALIDITY_APPLICATION_LINEAGE_SIGMASTATE_COMMIT,
      scalaVersion: VALIDITY_APPLICATION_LINEAGE_SCALA_VERSION,
      sbtVersion: VALIDITY_APPLICATION_LINEAGE_SBT_VERSION,
      profileActivated: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
    expect(batch.contracts.map(receipt => receipt.role)).toEqual([
      'tracker',
      'causalVault',
      'duplicatePrevention',
      'sourceLock',
    ]);
    expect(sha256(PINNED_COMPILER_BATCH_JSON))
      .toBe(VALIDITY_APPLICATION_LINEAGE_COMPILER_BATCH_V1_SHA256_HEX);

    const compiled = await compileCandidate();
    expect(compiled.lineageProfileIdHex).toBe(EXPECTED_LINEAGE_PROFILE_ID);
    expect(compiled.application.bindingDigestHex)
      .toBe('519646a9e4980570caaed860fb21e76938635ea3bfb05bc89a095ceb8adc3d57');
    expect(Object.fromEntries(
      Object.entries(compiled.contracts).map(([role, contract]) => [
        role,
        contract.receipt.contractIdHex,
      ]),
    )).toEqual({
      tracker:
        'e0770da9d4be80c9cb5270401346189f2a28b1c8afc301948d14c7e838d4da42',
      causalVault:
        '402eed06957dfa7cbdcd817c6e8e99498b2b2857a22e9af4edc8e5c8f8c78831',
      duplicatePrevention:
        '8e616c52d62bc99fb8efcbd3ea63df858b938cf0e81c6286bc0db628452894fb',
      sourceLock:
        'd32271c7e408b69d57e8ce56aa161b8d30c7d960180233d6376c0078b73ef675',
    });
  });

  it('keeps V2 frozen while V3 binds the exact intent and vault contract', () => {
    const frozenV2 = readFileSync(
      resolve(BRIDGE_ROOT, 'contracts', 'MainChainLockCausalV2.es'),
      'utf8',
    );
    expect(sha256(frozenV2))
      .toBe('52b98598397b1bb1baa22313a7a49884e6abada386e6e2de58e33dcfdaeac8f6');
    expect(
      readFileSync(resolve(BRIDGE_ROOT, '.gitattributes'), 'utf8')
        .split(/\r?\n/u)
        .map(rule => rule.trim()),
    ).toContain('contracts/MainChainLockCausalV2.es text eol=lf');
    expect(frozenV2)
      .toContain('CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER');
    expect(TEMPLATES.sourceLock)
      .toContain('CAUSAL_SETTLEMENT_VAULT_CONTRACT_ID_HEX_PLACEHOLDER');
    for (const placeholder of [
      'CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER',
      'CAUSAL_SIDECHAIN_ID_HEX_PLACEHOLDER',
      'CAUSAL_BRIDGE_ADDRESS_HEX_PLACEHOLDER',
      'CAUSAL_TOKEN_ADDRESS_HEX_PLACEHOLDER',
      'CAUSAL_SETTLEMENT_PROFILE_ID_HEX_PLACEHOLDER',
      'CAUSAL_PROFILE_ID_HEX_PLACEHOLDER',
    ]) {
      expect(TEMPLATES.sourceLock).toContain(placeholder);
    }
    for (const exactIntentBinding of [
      'sourceIntent.slice(1, 33) == sourceNetworkId',
      'sourceIntent.slice(33, 65) == sidechainId',
      'sourceIntent.slice(65, 85) == bridgeAddress',
      'sourceIntent.slice(85, 105) == tokenAddress',
      'sourceIntent.slice(105, 137) == settlementProfileId',
      'sourceIntent.slice(137, 169) == causalProfileId',
    ]) {
      expect(TEMPLATES.sourceLock).toContain(exactIntentBinding);
    }
    expect(TEMPLATES.sourceLock)
      .toContain(
        'blake2b256(vaultOut.propositionBytes) == causalVaultContractId',
      );
    expect(TEMPLATES.sourceLock)
      .not.toContain('CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER');
  });

  it('rejects decoded lineage candidates and every template drift', async () => {
    const candidate = await deriveCandidate();
    await expect(compileValidityApplicationLineageInstanceV3({
      lineageCandidate: structuredClone(candidate),
      templates: TEMPLATES,
      runtimeBinding: RUNTIME_BINDING,
      proofBinding: PROOF_BINDING,
      committee: COMMITTEE,
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    })).rejects.toThrow(/same process|complete validated EIP-12 genesis inputs/);

    for (const role of Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>) {
      await expect(compileValidityApplicationLineageInstanceV3({
        lineageCandidate: candidate,
        templates: {
          ...TEMPLATES,
          [role]: `${TEMPLATES[role]}\n`,
        },
        runtimeBinding: RUNTIME_BINDING,
        proofBinding: PROOF_BINDING,
        committee: COMMITTEE,
        compiler: createPinnedValidityApplicationLineageCompilerV3(
          PINNED_COMPILER_BATCH_JSON,
        ),
      }), role).rejects.toThrow(/does not match the lineage profile SHA-256/);
    }
  });

  it('snapshots the branded lineage candidate exactly once', async () => {
    const candidate = await deriveCandidate();
    const decodedAlias = structuredClone(candidate);
    let reads = 0;
    const input = {
      templates: TEMPLATES,
      runtimeBinding: RUNTIME_BINDING,
      proofBinding: PROOF_BINDING,
      committee: COMMITTEE,
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    } as Record<string, unknown>;
    Object.defineProperty(input, 'lineageCandidate', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? candidate : decodedAlias;
      },
    });

    const result = await compileValidityApplicationLineageInstanceV3(
      input as unknown as Parameters<
        typeof compileValidityApplicationLineageInstanceV3
      >[0],
    );
    expect(reads).toBe(1);
    expect(result.lineageProfileIdHex).toBe(candidate.profileIdHex);
  });

  it('rejects finality and source-commitment policy substitution', async () => {
    const candidate = await deriveCandidate();
    await expect(compileValidityApplicationLineageInstanceV3({
      lineageCandidate: candidate,
      templates: TEMPLATES,
      runtimeBinding: RUNTIME_BINDING,
      proofBinding: {
        ...PROOF_BINDING,
        approvedTrustAnchorDigestHex: `0x${'ab'.repeat(32)}`,
      },
      committee: COMMITTEE,
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    })).rejects.toThrow(/finality-policy ID/);
    await expect(compileValidityApplicationLineageInstanceV3({
      lineageCandidate: candidate,
      templates: TEMPLATES,
      runtimeBinding: RUNTIME_BINDING,
      proofBinding: PROOF_BINDING,
      committee: {
        ...COMMITTEE,
        publicKeys: [...COMMITTEE.publicKeys].reverse(),
      },
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    })).rejects.toThrow(/source-commitment policy ID/);
  });

  it('rejects proof and runtime binding drift before proposition promotion', async () => {
    const candidate = await deriveCandidate();
    await expect(compileValidityApplicationLineageInstanceV3({
      lineageCandidate: candidate,
      templates: TEMPLATES,
      runtimeBinding: RUNTIME_BINDING,
      proofBinding: {
        ...PROOF_BINDING,
        proofSystemIdHex: `0x${'ef'.repeat(32)}`,
      },
      committee: COMMITTEE,
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    })).rejects.toThrow(/proof-system ID/);
    await expect(compileValidityApplicationLineageInstanceV3({
      lineageCandidate: candidate,
      templates: TEMPLATES,
      runtimeBinding: {
        ...RUNTIME_BINDING,
        tokenRuntimeCodeBytes: 2049,
      },
      proofBinding: PROOF_BINDING,
      committee: COMMITTEE,
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    })).rejects.toThrow(/compiler receipt identity/);
  });

  it('rejects arbitrary compilers and every pinned batch byte drift', async () => {
    const arbitraryCompiler: ValidityApplicationLineageCompilerV3 =
      async () => {
        throw new Error('arbitrary compiler must not be called');
      };
    await expect(compileCandidate(arbitraryCompiler))
      .rejects.toThrow(/reviewed pinned compiler batch/);

    expect(() =>
      createPinnedValidityApplicationLineageCompilerV3(
        `${PINNED_COMPILER_BATCH_JSON} `,
      )
    ).toThrow(/reviewed SHA-256 lock/);
    const oneByteMutation = PINNED_COMPILER_BATCH_JSON.replace(
      '"profileActivated": false',
      '"profileActivated": true ',
    );
    expect(oneByteMutation).not.toBe(PINNED_COMPILER_BATCH_JSON);
    expect(() =>
      createPinnedValidityApplicationLineageCompilerV3(oneByteMutation)
    ).toThrow(/reviewed SHA-256 lock/);
  });

  it('rejects unknown proof fields, placeholders and V2 lineage substitution', async () => {
    const candidate = await deriveCandidate();
    await expect(compileValidityApplicationLineageInstanceV3({
      lineageCandidate: candidate,
      templates: TEMPLATES,
      runtimeBinding: RUNTIME_BINDING,
      proofBinding: {
        ...PROOF_BINDING,
        unknownBinding: `0x${'dd'.repeat(32)}`,
      } as ValidityApplicationLineageProofBindingV3,
      committee: COMMITTEE,
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    })).rejects.toThrow(/proof binding must contain exactly/);
    await expect(compileValidityApplicationLineageInstanceV3({
      lineageCandidate: candidate,
      templates: {
        ...TEMPLATES,
        tracker: TEMPLATES.tracker.replace(
          'VALIDITY_APPLICATION_BINDING_PLACEHOLDER',
          'UNREVIEWED_APPLICATION_BINDING_PLACEHOLDER',
        ),
      },
      runtimeBinding: RUNTIME_BINDING,
      proofBinding: PROOF_BINDING,
      committee: COMMITTEE,
      compiler: createPinnedValidityApplicationLineageCompilerV3(
        PINNED_COMPILER_BATCH_JSON,
      ),
    })).rejects.toThrow(/SHA-256|placeholder set/);
    const compiled = await compileCandidate();
    expect(compiled.genesis.trackerNftIdHex).not.toBe(`0x${'a1'.repeat(32)}`);
    expect(compiled.genesis.duplicatePreventionNftIdHex)
      .not.toBe(`0x${'a2'.repeat(32)}`);
  });
});

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
