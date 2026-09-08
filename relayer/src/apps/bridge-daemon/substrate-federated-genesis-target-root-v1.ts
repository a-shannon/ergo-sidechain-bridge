import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createFederatedGenesisOperatorV1, assertFederatedGenesisOperatorV1, disposeFederatedGenesisOperatorV1,
  type FederatedGenesisOperatorV1,
} from '../../adapters/federated-genesis-operator-v1.js';
import { observeFederatedGenesisTargetsV1 } from '../../adapters/federated-genesis-target-observation-v1.js';
import { assertNoDuplicateJsonKeys } from '../../ergo-settlement-core/strict-json.js';
import { verifyExecutableSha256 } from '../../native-executable-pin.js';
import { runBoundedProcess } from '../../pinned-local-native-verifier-build.js';
import { buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1 } from '../../substrate-federated-authority-safe-devnet-build-environment-v1.js';
import { withOwnedFederatedGenesisDevnetProcessesV1 } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
import { buildSubstrateFederatedGenesisNodeV1, type BuildSubstrateFederatedGenesisNodeV1Input } from '../../substrate-federated-genesis-node-build-v1.js';
import { collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2 } from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import { buildSubstrateFederatedIsolatedDevnetErgoNodeV1, type BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input } from '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import { createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2, assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1, type SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2 } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1 } from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance } from '../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2, readSubstrateFederatedGenesisProfilesFromSessionV2, type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2 } from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { compileObservedSubstrateFederatedGenesisV1 } from '../../substrate-federated-observed-genesis-v1.js';

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const MAX_RESPONSE_BYTES = 34 * 1024 * 1024;
const KEYS = {
  code: '0x3a636f6465',
  profile: '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde',
  enforced: '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1',
  bridge: '0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45',
  sudo: '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b',
} as const;

export interface RunSubstrateFederatedGenesisTargetRootV1Input {
  readonly frontierBuild: Omit<BuildSubstrateFederatedGenesisNodeV1Input, 'sourceSession'>;
  readonly ergoBuild: BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input;
}

/** Static local target composition. No caller callback, signer or transport escapes. */
export async function runSubstrateFederatedGenesisTargetRootV1(input: RunSubstrateFederatedGenesisTargetRootV1Input) {
  const captured = exact(input, ['frontierBuild', 'ergoBuild']);
  const frontierInput = exact(captured.frontierBuild, ['bridgeRoot', 'frontierSourcePath',
    'buildParentDirectory', 'cargoHomeDirectory', 'cargoExecutablePath', 'rustcExecutablePath',
    'gitExecutablePath', 'protocExecutablePath']);
  const ergoInput = exact(captured.ergoBuild, ['worktreeRoot', 'bridgeRoot', 'ergoSourcePath',
    'gitExecutablePath', 'javaExecutablePath', 'sbtLauncherJarPath']);
  if (realpathSync(frontierInput.bridgeRoot) !== realpathSync(ergoInput.bridgeRoot)) {
    throw new Error('FED target builders must use the same bridge repository');
  }
  const setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
  let source: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2> | undefined;
  let operator: Readonly<FederatedGenesisOperatorV1> | undefined;
  let ergo: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2> | undefined;
  try {
    source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
      ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [setup.signer.publicKeyHex],
    });
    operator = createFederatedGenesisOperatorV1();
    const retainedSource = source;
    const retainedOperator = operator;
    const assertCustody = () => {
      assertFederatedGenesisOperatorV1(retainedOperator);
      assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup.signer);
      readSubstrateFederatedGenesisProfilesFromSessionV2(retainedSource);
    };
    // Compile before starting the bounded Ergo mining lifetime.
    const frontier = await buildSubstrateFederatedGenesisNodeV1({ ...frontierInput, sourceSession: retainedSource });
    assertCustody();
    const builtErgo = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1(ergoInput);
    assertCustody();
    ergo = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2({
      javaExecutablePath: builtErgo.javaExecutablePath,
      expectedJavaExecutableSha256Hex: builtErgo.receipt.toolchain.javaExecutableSha256Hex,
      nodeAssemblyJarPath: builtErgo.nodeAssemblyJarPath,
      expectedNodeAssemblyJarSha256Hex: builtErgo.receipt.build.artifactSha256Hex,
      buildIdentityDigestHex: builtErgo.receipt.buildIdentityDigestHex,
    }, {
      miningTargetPublicKeyHex: setup.signer.publicKeyHex,
      p2pkErgoTreeHex: setup.signer.p2pkErgoTreeHex,
      rewardInputErgoTrees: setup.signer.rewardInputErgoTrees,
      networkPrefix: 16, primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052',
    }, claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(setup));
    await ergo.startMining();
    const executed = await ergo.withMiningActiveExecutionTarget(async target => {
      const ownedDiscovery = await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(setup.signer, target);
      const history = await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(ownedDiscovery.observation);
      assertCustody();
      const compiled = await compileObservedSubstrateFederatedGenesisV1({
        setupSigner: setup.signer, sourceSession: retainedSource, target, ownedDiscovery, history,
        genesis: {
          bridgeRoot: frontierInput.bridgeRoot, launchDomainHex: retainedOperator.launchDomainHex,
          evmChainId: '4242', operatorAddressHex: retainedOperator.addressHex,
          bridgeAddressHex: '33'.repeat(20), tokenAddressHex: '44'.repeat(20),
          runtimeWasm: readFileSync(frontier.wasm.path), expectedRuntimeWasmSha256Hex: frontier.wasm.sha256Hex,
          endowments: [{ addressHex: retainedOperator.addressHex, balance: retainedOperator.nativeFunding.amountUnits }],
        },
      });
      const candidate = compiled.candidate;
      if (compiled.preparation.mintProofProfileScaleHex !== frontier.sourceProofProfileScaleHex
        || compiled.preparation.mintProofProfile.proofProfileIdHex !== frontier.sourceProofProfileIdHex) {
        throw new Error('FED compiled target federation differs from retained build custody');
      }
      const candidateBytes = Buffer.from(candidate.genesisJson);
      const candidatePath = join(frontier.targetDirectory, 'fed-genesis.json');
      writeFileSync(candidatePath, candidateBytes, { flag: 'wx' });
      await verifyExecutableSha256(frontier.node.path, `0x${frontier.node.sha256Hex}`, 'FED node');
      const raw = await runBoundedProcess({ executablePath: frontier.node.path,
        args: ['build-spec', '--chain', `fed-genesis:${candidatePath}`, '--disable-default-bootnode', '--raw'],
        cwd: frontier.sourceDirectory, env: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
        timeoutMs: 120_000, maxOutputBytes: MAX_RESPONSE_BYTES, label: 'FED typed genesis materialization' });
      await verifyExecutableSha256(frontier.node.path, `0x${frontier.node.sha256Hex}`, 'FED node');
      if (!readFileSync(candidatePath).equals(candidateBytes)) throw new Error('FED typed genesis bytes changed');
      const expected = materializedStorage(raw.stdout, candidate.runtimeProfileScaleHex,
        compiled.preparation.application.bridgeAddressHex, frontier.wasm.sha256Hex);
      if (expected[retainedOperator.nativeFunding.storageKeyHex] !== retainedOperator.nativeFunding.accountInfoScaleHex) {
        throw new Error('FED materialized operator funding differs from retained custody');
      }
      assertCustody();
      assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      const running = await withOwnedFederatedGenesisDevnetProcessesV1({
        nodeBinaryPath: frontier.node.path, expectedNodeBinarySha256Hex: frontier.node.sha256Hex,
        genesisJsonBytes: candidateBytes, expectedGenesisJsonSha256Hex: candidate.genesisJsonSha256Hex,
        primaryRpcUrl: PRIMARY, witnessRpcUrl: WITNESS,
        primaryP2pPort: 30355, witnessP2pPort: 30356, primaryPrometheusPort: 19615, witnessPrometheusPort: 19616,
      }, async endpoints => {
        if (endpoints.primaryRpcUrl !== PRIMARY || endpoints.witnessRpcUrl !== WITNESS) {
          throw new Error('FED owned node endpoints changed');
        }
        const genesis = await observeFederatedGenesisTargetsV1(expected);
        assertCustody();
        assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
        return genesis;
      });
      return Object.freeze({ nativeGenesisHashHex: running.value, frontierProcess: running.receipt,
        typedGenesisSha256Hex: candidate.genesisJsonSha256Hex, rawSpecSha256Hex: sha256(Buffer.from(raw.stdout)),
        runtimeProfileIdHex: candidate.runtimeProfileIdHex, familyIdHex: candidate.familyIdHex,
        sourceProofProfileIdHex: frontier.sourceProofProfileIdHex,
        nodeSha256Hex: frontier.node.sha256Hex, wasmSha256Hex: frontier.wasm.sha256Hex,
        operatorAddressHex: retainedOperator.addressHex, storageKeysChecked: Object.keys(expected).length,
        issuanceInputBoxIds: compiled.discovery.genesisBoxIds });
    });
    assertCustody();
    return Object.freeze({ status: 'fresh-federated-genesis-observed' as const,
      ...executed.value, ergoExecution: executed.receipt,
      singletonIssuanceEstablished: false as const, operationalMintEstablished: false as const });
  } finally {
    try { if (ergo) await ergo.stop(); }
    finally {
      try { if (operator) disposeFederatedGenesisOperatorV1(operator); }
      finally { try { source?.dispose(); } finally { setup.dispose(); } }
    }
  }
}

function materializedStorage(text: string, profile: string, bridge: string, wasmHash: string): Readonly<Record<string, string>> {
  const spec = record(parseJson(text));
  if (spec.id !== 'bridge_federated_v4_genesis' || !Array.isArray(spec.bootNodes) || spec.bootNodes.length !== 0) {
    throw new Error('FED raw spec target or peers differ');
  }
  const raw = record(record(spec.genesis).raw);
  if (Object.keys(record(raw.childrenDefault)).length !== 0) throw new Error('FED unexpected child storage');
  const top = record(raw.top);
  if (Object.keys(top).length < 4 || Object.keys(top).length > 256
    || Object.entries(top).some(([key, value]) => !/^0x(?:[0-9a-f]{2})+$/.test(key)
      || typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(value))) {
    throw new Error('FED malformed raw storage');
  }
  const result = top as Record<string, string>;
  if (!result[KEYS.code] || sha256(Buffer.from(result[KEYS.code].slice(2), 'hex')) !== wasmHash
    || result[KEYS.profile] !== profile || result[KEYS.enforced] !== '0x01'
    || result[KEYS.bridge] !== `0x${bridge}` || result[KEYS.sudo] !== undefined) {
    throw new Error('FED raw storage differs from the compiled runtime/profile or authority');
  }
  return Object.freeze(result);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('FED object required');
  return value as Record<string, unknown>;
}
function parseJson(text: string): unknown {
  assertNoDuplicateJsonKeys(text);
  return JSON.parse(text) as unknown;
}
function exact<T>(value: T, keys: string[]): Readonly<T> {
  record(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertyNames(descriptors).length !== keys.length
    || Object.getOwnPropertySymbols(descriptors).length !== 0
    || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    throw new Error('FED target requires exact data fields');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as Readonly<T>;
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
