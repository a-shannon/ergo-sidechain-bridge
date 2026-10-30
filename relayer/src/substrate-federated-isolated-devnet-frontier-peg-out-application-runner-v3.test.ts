import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { sha256CanonicalJson } from './strict-json.js';

const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)),
  'substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.ts');
const source = ts.createSourceFile(sourcePath, readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true);
const constantNames = [
  'RECEIPT_DIGEST_DOMAIN', 'RECEIPT_V3_DIGEST_DOMAIN', 'CARGO_TEST_NAME',
  'SIGNED_CARGO_TEST_NAME', 'CARGO_ARGUMENTS', 'SIGNED_CARGO_ARGUMENTS',
  'CANONICAL_FRONTIER_PATCH_SHA256', 'APPLICATION_OVERLAY_PATCH_SHA256',
  'SIGNED_APPLICATION_OVERLAY_PATCH_SHA256', 'OVERLAY_APPLIED_NODE_SOURCE_LF_SHA256',
  'OVERLAY_APPLIED_RUNTIME_SOURCE_LF_SHA256', 'SIGNED_OVERLAY_APPLIED_NODE_SOURCE_LF_SHA256',
  'DYNAMIC_SOURCE_PROOF_ENVELOPE_ENV',
  'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_RUNNER_V3_SCHEMA',
];
const constants = new Function(ts.transpileModule(source.statements.filter(node =>
  ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration =>
    ts.isIdentifier(declaration.name) && constantNames.includes(declaration.name.text)),
).map(node => node.getText(source).replace(/^export /u, '')).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText + `\nreturn {${constantNames.join(',')}};`)() as Record<string, any>;

// Run the actual orchestration body with bounded, explicit I/O doubles. Real
// source restoration and signed-byte codecs have separate direct tests.
function functionWithScope(name: string, scope: Record<string, unknown>): (...args: any[]) => any {
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node)
    && node.name?.text === name && node.body !== undefined);
  if (declaration === undefined) throw new Error(`missing implementation: ${name}`);
  const compiled = ts.transpileModule(declaration.getText(source).replace(/^export /u, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(scope), `${compiled}\nreturn ${name};`)(...Object.values(scope));
}

function harness(fault?: string) {
  const events: string[] = [];
  const root = path.resolve('synthetic-runner-scope');
  const input = {
    frontierSourceDirectory: path.join(root, 'source'), temporaryDirectoryRoot: root,
    cargoDependencyCacheDirectory: path.join(root, 'cache'), cargoExecutablePath: 'cargo',
    rustcExecutablePath: 'rustc', gitExecutablePath: 'git', offline: true,
  };
  const nodePath = path.join(input.frontierSourceDirectory, 'template/node/src/bridge_federated_lab_reservation_tests.rs');
  const runtimePath = path.join(input.frontierSourceDirectory, 'template/runtime/src/bridge_commitment.rs');
  const files = new Map([[nodePath, 'node-before'], [runtimePath, 'runtime-before']]);
  const hashes = new Map([
    ['0001-bridge-runtime-commitment.patch', constants.CANONICAL_FRONTIER_PATCH_SHA256],
    ['0002-federated-lab-peg-out-application-proof.patch', constants.APPLICATION_OVERLAY_PATCH_SHA256],
    ['0003-federated-lab-signed-application-calls.patch', constants.SIGNED_APPLICATION_OVERLAY_PATCH_SHA256],
    ['node-0002', constants.OVERLAY_APPLIED_NODE_SOURCE_LF_SHA256],
    ['runtime-0002', constants.OVERLAY_APPLIED_RUNTIME_SOURCE_LF_SHA256],
    ['node-0003', constants.SIGNED_OVERLAY_APPLIED_NODE_SOURCE_LF_SHA256],
  ]);
  let toolsCount = 0;
  let baselineCount = 0;
  let capturedCargo: any;
  const signedInput = {
    mintSourceProofReceipt: { request: { statementHex: 'statement' } },
    ergoRecipientPublicKeyHex: 'recipient', signedTransactions: { mint: 'mint', approval: 'approval', pegOut: 'pegOut' },
  };
  const environment = { [constants.DYNAMIC_SOURCE_PROOF_ENVELOPE_ENV]: 'proof' };
  const digest = (bytes: Uint8Array) => hashes.get(Buffer.from(bytes).toString())
    ?? createHash('sha256').update(bytes).digest('hex');
  const restore = async (value: any) => {
    if (value.sources.every((item: any) => files.get(item.sourcePath) === Buffer.from(item.originalSourceBytes).toString())) return;
    for (const item of value.sources) {
      const current = files.get(item.sourcePath)!;
      if (current !== Buffer.from(item.originalSourceBytes).toString()
        && digest(Buffer.from(current)) !== item.expectedAppliedSourceLfSha256) {
        throw new Error('foreign source preserved');
      }
    }
    await value.reverseOverlay();
  };
  const scope: Record<string, any> = {
    ...constants, path, Buffer,
    resolveBridgeRoot: () => path.join(root, 'bridge'), resolveRepositoryRoot: () => root,
    requireRegularFile: (file: string) => file,
    readFileSync: (file: string) => Buffer.from(files.get(file) ?? path.basename(file)),
    sha256Bytes: digest, sha256LfNormalized: digest, sha256CanonicalJson,
    sha256Text: (text: string) => createHash('sha256').update(text).digest('hex'),
    inspectTools: () => {
      events.push('tools');
      return { cargo: { sha256: 'cargo' }, rustc: { sha256: 'rustc' }, git: { sha256: 'git' },
        nativeToolchainLockSha256: 'lock', rustTarget: 'target', drift: fault === 'tools' && ++toolsCount > 1 };
    },
    inspectSourceBaseline: () => {
      events.push('baseline');
      return { drift: fault === 'baseline' && ++baselineCount > 1 };
    },
    assertDeadline: () => {}, remainingCargoBudgetMs: () => 1000,
    runExactGitApply: async ({ args }: { args: string[] }) => {
      const signed = args.at(-1)!.includes('0003');
      const reverse = args.includes('--reverse');
      if (args.includes('--check')) {
        if (fault === 'signed-preflight' && signed && !reverse) throw new Error(fault);
        return;
      }
      events.push(`${reverse ? 'reverse' : 'apply'}${signed ? '3' : '2'}`);
      if (signed) files.set(nodePath, reverse ? 'node-0002' : 'node-0003');
      else {
        files.set(nodePath, reverse ? 'node-before' : 'node-0002');
        files.set(runtimePath, reverse ? 'runtime-before' : 'runtime-0002');
      }
      if (signed && !reverse && fault === 'foreign-source') files.set(nodePath, 'foreign');
      if (signed && !reverse && fault === 'signed-apply') throw new Error(fault);
    },
    createPinnedLocalNativeBuildWorkspace: () => ({
      cargoHomePath: 'isolated-home', buildTargetPath: 'fresh-target',
      cleanup: () => { events.push('cleanup'); if (fault === 'cleanup') throw new Error(fault); },
    }),
    assertCargoConfigurationIsolated: () => {},
    buildCargoEnvironment: (value: any) => value,
    runBoundedProcess: async (cargo: any) => {
      capturedCargo = cargo;
      events.push('cargo');
      if (fault === 'cargo') throw new Error(fault);
      const test = fault === 'wrong-test' ? constants.CARGO_TEST_NAME : constants.SIGNED_CARGO_TEST_NAME;
      return { stdout: `test ${test} ... ok\ntest result: ok. 1 passed; 0 failed;`, stderr: '' };
    },
    assertExactCargoTestPassed: functionWithScope('assertExactCargoTestPassed', {}),
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationDynamicSourceProofMarkerV2: () => {
      events.push('proof-marker'); if (fault === 'marker') throw new Error(fault);
    },
    restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourcesV1: restore,
    restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1: (value: any) =>
      restore({ sources: [value], reverseOverlay: value.reverseOverlay }),
    deepFreeze: (value: unknown) => value,
    inspectFrontierLabApplicationSignedTransactionsV1: () => ({
      plan: { ownerAddressHex: 'owner' }, transactionHashes: { mint: 'mh', approval: 'ah', pegOut: 'ph' },
    }),
    consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2: (value: any) => {
      events.push('evidence-v2');
      expect(value.expected).toEqual({ ownerAddressHex: 'owner', ergoRecipientPublicKeyHex: 'recipient',
        transactionHashes: { mint: 'mh', approval: 'ah', pegOut: 'ph' } });
      if (fault === 'evidence') throw new Error(fault);
      return { version: 2 };
    },
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2ConsumerConstruction: () => {},
    consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1: () => { throw new Error('legacy evidence forbidden'); },
  };
  return {
    events, files, nodePath, runtimePath, environment,
    run: () => functionWithScope('executeRunner', scope)(input, Date.now() + 10000, environment, signedInput),
    cargo: () => capturedCargo,
  };
}

describe('signed application runner V3 orchestration', () => {
  it('executes only the signed test and restores both overlays before consuming V2 evidence', async () => {
    const h = harness();
    const result = await h.run();
    expect(h.events).toEqual(['tools', 'baseline', 'apply2', 'apply3', 'cargo', 'proof-marker',
      'cleanup', 'reverse3', 'reverse2', 'tools', 'baseline', 'evidence-v2']);
    expect(h.cargo().args).toEqual(['test', '-p', 'frontier-template-node', '--no-default-features',
      '--features', 'bridge-federated-v4-lab-node', '--offline', '--locked',
      constants.SIGNED_CARGO_TEST_NAME, '--', '--exact', '--ignored', '--nocapture']);
    expect(h.cargo().env.authorityEnvironment).toBe(h.environment);
    expect(result.source.signedApplicationOverlayPatchSha256).toBe(constants.SIGNED_APPLICATION_OVERLAY_PATCH_SHA256);
    expect(result.source.overlayAppliedNodeSourceLfSha256).toBe(constants.SIGNED_OVERLAY_APPLIED_NODE_SOURCE_LF_SHA256);
    expect(result.execution.cargoTestName).toBe(constants.SIGNED_CARGO_TEST_NAME);
    expect(result.boundary.deterministicSyntheticAccountOnly).toBe(false);
    expect(result.boundary.fundsAuthorityEstablished).toBe(false);
  });

  it.each(['signed-preflight', 'signed-apply', 'cargo', 'cleanup', 'marker', 'wrong-test', 'tools', 'baseline', 'evidence'])(
    'restores exact source and refuses a receipt after %s failure', async fault => {
      const h = harness(fault);
      await expect(h.run()).rejects.toThrow();
      expect(h.files.get(h.nodePath)).toBe('node-before');
      expect(h.files.get(h.runtimePath)).toBe('runtime-before');
      expect(h.events.filter(event => event === 'reverse2')).toHaveLength(1);
      expect(h.events.filter(event => event === 'reverse3')).toHaveLength(fault === 'signed-preflight' ? 0 : 1);
    },
  );

  it('preserves unexpected source instead of overwriting it during either restoration', async () => {
    const h = harness('foreign-source');
    await expect(h.run()).rejects.toThrow(/foreign source preserved/u);
    expect(h.files.get(h.nodePath)).toBe('foreign');
    expect(h.events).not.toContain('cargo');
    expect(h.events).not.toContain('reverse3');
    expect(h.events).not.toContain('reverse2');
  });
});

function receiptHarness() {
  const hex = (byte: string, count = 32) => `0x${byte.repeat(count)}`;
  const proof = {
    request: { statementHex: 'statement' }, receiptDigestHex: '11'.repeat(32),
    targetDescriptorDigestHex: '22'.repeat(32), mintReservationDraftDigestHex: '33'.repeat(32),
    sourceProofProfileIdHex: hex('44'), sourceProofEnvelopeSha256Hex: '55'.repeat(32),
  };
  const environment = { proof: 'proof', mint: 'mint', approval: 'approval', pegOut: 'pegOut' };
  const inspected = {
    plan: { ownerAddressHex: hex('11', 20), mintReservationStatementIdHex: hex('66'), mintIdentityHex: hex('77') },
    transactionHashes: { mint: hex('aa'), approval: hex('bb'), pegOut: hex('cc') },
  };
  const intent = {
    sidechainIdHex: hex('01'), bridgeAddressHex: hex('02', 20), tokenAddressHex: hex('03', 20),
    amountNanoErg: 15_000_000n,
  };
  const input = { mintSourceProofReceipt: proof, ergoRecipientPublicKeyHex: `0x02${'12'.repeat(32)}` };
  const execution: any = {
    source: { baselineReportDigestHex: 'baseline' }, tools: { toolchainDigestHex: 'tools' },
    execution: { executionInputDigestHex: sha256CanonicalJson({
      authorityEnvironment: environment, baselineReportDigestHex: 'baseline', toolchainDigestHex: 'tools',
      cargoArguments: constants.SIGNED_CARGO_ARGUMENTS,
      canonicalFrontierPatchSha256: constants.CANONICAL_FRONTIER_PATCH_SHA256,
      applicationOverlayPatchSha256: constants.APPLICATION_OVERLAY_PATCH_SHA256,
      signedApplicationOverlayPatchSha256: constants.SIGNED_APPLICATION_OVERLAY_PATCH_SHA256,
    }, constants.RECEIPT_V3_DIGEST_DOMAIN) },
    applicationEvidence: {
      execution: { sidechainIdHex: intent.sidechainIdHex },
      application: { ownerAddressHex: inspected.plan.ownerAddressHex,
        bridgeAddressHex: intent.bridgeAddressHex, tokenAddressHex: intent.tokenAddressHex },
      conservation: { supplyBeforeNanoErg: '15000000' },
      signedApplication: { ergoRecipientPublicKeyHex: input.ergoRecipientPublicKeyHex,
        transactionHashes: { ...inspected.transactionHashes } },
    },
    boundary: { fundsAuthorityEstablished: false }, limitations: ['test-only execution double'],
  };
  const registry = new WeakMap();
  let proofActive = true;
  const proofCheck = (value: unknown) => {
    if (!proofActive || value !== proof) throw new Error('test proof lacks provenance');
  };
  const scope: Record<string, any> = {
    ...constants, V3_RECEIPTS: registry, sha256CanonicalJson,
    deepFreeze: functionWithScope('deepFreeze', {}),
    exactRecord: functionWithScope('exactRecord', {}),
    canonicalSha256Hex: functionWithScope('canonicalSha256Hex', {}),
    canonicalPrefixedHex: functionWithScope('canonicalPrefixedHex', {}),
    buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV3: () => {
      proofCheck(proof); return environment;
    },
    inspectFrontierLabApplicationSignedTransactionsV1: () => inspected,
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex: () => ({ sourceIntentHex: 'intent' }),
    decodePegInSourceIntentV2Hex: () => intent,
    assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance: proofCheck,
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2ConsumerConstruction: (value: unknown) => {
      if (value !== execution.applicationEvidence) throw new Error('test evidence lacks provenance');
    },
  };
  return {
    execution, environment, proof, registry,
    bind: (env: object = environment) => functionWithScope('bindSignedApplicationRunnerReceiptV3', scope)(input, execution, env),
    assert: (receipt: unknown) => functionWithScope('assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance', scope)(receipt),
    revokeProof: () => { proofActive = false; },
  };
}

describe('signed application runner V3 receipt binding', () => {
  it('registers only its exact frozen execution and retains proof provenance', () => {
    const h = receiptHarness();
    const receipt = h.bind();
    expect(receipt.version).toBe(3);
    expect(receipt.schema).toBe(constants.SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_RUNNER_V3_SCHEMA);
    expect(receipt.executionResult).toBe(h.execution);
    expect(h.registry.get(receipt)).toEqual({ mintSourceProofReceipt: h.proof, executionResult: h.execution });
    expect(Object.isFrozen(receipt.signedApplication.transactionHashes)).toBe(true);
    expect(() => h.assert(receipt)).not.toThrow();
    expect(() => h.assert({ ...receipt })).toThrow(/provenance/u);
    h.revokeProof();
    expect(() => h.assert(receipt)).toThrow(/provenance/u);
  });

  it.each(['proof', 'mint', 'approval', 'pegOut'])('rejects changed execution environment %s', key => {
    const h = receiptHarness();
    expect(() => h.bind({ ...h.environment, [key]: 'changed' })).toThrow(/environment changed/u);
  });

  it('rejects proof revocation after execution before issuing a receipt', () => {
    const h = receiptHarness();
    h.revokeProof();
    expect(() => h.bind()).toThrow(/test proof lacks provenance/u);
  });

  it('rejects an extra environment field and a different execution input digest', () => {
    const h = receiptHarness();
    expect(() => h.bind({ ...h.environment, extra: 'value' })).toThrow(/exactly/u);
    h.execution.execution.executionInputDigestHex = '00'.repeat(32);
    expect(() => h.bind()).toThrow(/did not commit/u);
  });

  it.each([
    ['execution', 'sidechainIdHex'], ['application', 'ownerAddressHex'],
    ['application', 'bridgeAddressHex'], ['application', 'tokenAddressHex'],
    ['conservation', 'supplyBeforeNanoErg'], ['signedApplication', 'ergoRecipientPublicKeyHex'],
  ])('rejects different evidence %s.%s', (section, field) => {
    const h = receiptHarness();
    h.execution.applicationEvidence[section][field] = 'changed';
    expect(() => h.bind()).toThrow(/differs from the exact mint proof or signed calls/u);
  });

  it.each(['mint', 'approval', 'pegOut'])('rejects a different evidence %s hash', role => {
    const h = receiptHarness();
    h.execution.applicationEvidence.signedApplication.transactionHashes[role] = 'changed';
    expect(() => h.bind()).toThrow(/differs from the exact mint proof or signed calls/u);
  });
});
