import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  classifyBridgeLayer,
  inspectLayerImports,
  type LayerSourceFile,
} from './layer-import-rules.js';

function inspect(files: Record<string, string>) {
  const sourceFiles: LayerSourceFile[] = Object.entries(files).map(([path, source]) => ({
    path,
    source,
  }));
  return inspectLayerImports(sourceFiles);
}

const MANAGED_SETUP_V2 =
  'apps/bridge-daemon/substrate-federated-isolated-devnet-managed-setup-v2.ts';
const TRACKER_V2_CAMPAIGN_ROOT =
  'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts';
const GENESIS_SETUP_ROOT =
  'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
const FEDERATED_GENESIS_TARGET_ROOT =
  'apps/bridge-daemon/substrate-federated-genesis-target-root-v1.ts';
const FEDERATED_GENESIS_OPERATOR = 'adapters/federated-genesis-operator-v1.ts';
const FEDERATED_GENESIS_OPERATOR_SPECIFIER = '../../adapters/federated-genesis-operator-v1.js';

function staticAppFixture(file: string, source: string): Record<string, string> {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const files: Record<string, string> = {};
  // Resolve direct source edges without loading or executing their runtime modules.
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith('.')) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
      .replace(/\.js$/, '.ts');
    files[target] = 'export {};';
  }
  files[file] = source;
  return files;
}

describe('layer import rules', () => {
  it('accepts the actual FED genesis source without executing the root', () => {
    const file = FEDERATED_GENESIS_TARGET_ROOT;
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    expect(inspect(staticAppFixture(file, source))).toEqual([]);
  });

  it.each([
    ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'executeSubstrateFederatedNativeGenesisBatchV1'],
    ['../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', 'assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1'],
    ['../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', 'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1'],
    ['../../authenticated-spv-tracker-read-only-node-client.js', 'createBoundedAuthenticatedSpvTrackerReadOnlySource'],
    ['../../substrate-federated-authority-safe-devnet-process-v1.js', 'assertOwnedFederatedGenesisDevnetTargetV1'],
    ['../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', 'assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1'],
    ['../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js', 'buildSubstrateFederatedNativeGenesisPegInPacketV1'],
    ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'executeSubstrateFederatedNativeGenesisPegInSourceLockV1'],
    ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1'],
    ['../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js', 'buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1'],
    ['../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js', 'collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1'],
    ['../../substrate-federated-isolated-devnet-source-attestation-session-v1.js', 'produceSubstrateFederatedNativeGenesisMintSourceProofV1'],
    ['./frontier-native-proof-bound-reservation-signing-v1.js', 'executeFrontierNativeProofBoundReservationMintAndBurnV1'],
    ['./frontier-native-proof-bound-reservation-signing-v1.js', 'attestFrontierNativeBurnCheckpointV1'],
    ['./frontier-native-proof-bound-reservation-signing-v1.js', 'assertFrontierNativeBurnCheckpointV1'],
    ['../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', 'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2'],
    ['../../substrate-federated-isolated-devnet-mining-credential-v1.js', 'revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1'],
    ['../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', 'assertSubstrateFederatedNativeGenesisSetupReadCustodyV1'],
    ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1'],
    ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1'],
    ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'waitForCanonicalConfirmation'],
    ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'projectTrackerCanonicalConfirmationFailureDiagnosticV1'],
    ['../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js', 'observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1'],
    ['../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js', 'assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1'],
    ['../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js', 'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2'],
    ['../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js', 'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2'],
    ['../../bridge-validity-tracker-header-context-v1.js', 'buildBridgeValidityTrackerObservedHeaderContextV1'],
    ['../../substrate-federated-tracker-v2.js', 'buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context'],
    ['../../substrate-federated-tracker-v2-external-fee.js', 'buildSubstrateFederatedTrackerV2ExternalFeeTransaction'],
    ['../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js', 'authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission'],
    ['../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js', 'reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission'],
    ['../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js', 'revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission'],
    ['../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js', 'confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission'],
    ['../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', 'submitSubstrateFederatedIsolatedDevnetTrackerV2Admission'],
    ['../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', 'finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission'],
    ['../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', 'projectSubstrateFederatedIsolatedDevnetCheckedSubmissionDiagnostic'],
    ['../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', 'submitSubstrateFederatedIsolatedDevnetWithdrawalV2'],
    ['../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', 'finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2'],
    ['../../substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js', 'authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2'],
    ['../../substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js', 'reserveSubstrateFederatedIsolatedDevnetWithdrawalV2'],
    ['../../substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js', 'confirmSubstrateFederatedIsolatedDevnetWithdrawalV2'],
  ])('keeps native target lifecycle binding %s#%s at its fixed call site', (specifier, binding) => {
    const declaration = `import { ${binding} } from '${specifier}';`;
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${binding}();`))).toEqual([]);
    for (const escape of [`capture(${binding});`, `const escaped = ${binding};`, `function expose() { return ${binding}; }`]) {
      expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${escape}`))
        .map(item => item.message)).toContain(
        `restricted capability binding must not escape its reviewed call: ${specifier}#${binding}`);
    }
  });

  it.each([
    ['substrate-federated-isolated-devnet-setup-check-runner-v2.ts', 'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2'],
    ['substrate-federated-isolated-devnet-mining-credential-v1.ts', 'revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1'],
    ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.ts', 'authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2'],
    ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.ts', 'reserveSubstrateFederatedIsolatedDevnetWithdrawalV2'],
    ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.ts', 'confirmSubstrateFederatedIsolatedDevnetWithdrawalV2'],
  ])('keeps native return authority %s#%s unavailable to foreign callers', (target, binding) => {
    for (const foreign of ['apps/bridge-daemon/foreign.ts', 'adapters/foreign.ts', 'foreign.ts']) {
      const relative = './' + path.posix.relative(path.posix.dirname(foreign), target.replace(/\.ts$/, '.js'));
      expect(inspect(staticAppFixture(foreign, `import { ${binding} } from '${relative}'; ${binding}();`)).map(item => item.message))
        .toContain(`exclusive authority import has the wrong owner: ${relative}#${binding}`);
    }
  });

  it.each([
    ['./frontier-native-proof-bound-reservation-signing-v1.js', 'executeFrontierNativeProofBoundReservationAndMintV1'],
    ['../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', 'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2'],
  ])('rejects superseded mint-only root binding %s#%s', (specifier, binding) => {
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT,
      `import { ${binding} } from '${specifier}'; ${binding}();`)).map(item => item.message)).toContain(
      `restricted capability import binding is not allowlisted: ${specifier}#${binding}`);
  });

  it('permits owned native journal construction without exposing StateTracker', () => {
    const specifier = '../../state-tracker.js';
    const declaration = `import { StateTracker } from '${specifier}';`;
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} new StateTracker('owned');`))).toEqual([]);
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} const escaped = StateTracker;`))
      .map(item => item.message)).toContain(
      `restricted capability binding must not escape its reviewed call: ${specifier}#StateTracker`);
  });

  it('permits an erased native journal type alias without a runtime alias or type query', () => {
    const specifier = '../../state-tracker.js';
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT,
      `import type { StateTracker as Journal } from '${specifier}'; type Current = Journal;`))).toEqual([]);
    for (const declaration of [
      `import { StateTracker as Journal } from '${specifier}';`,
      `import { StateTracker, type StateTracker as Journal } from '${specifier}';`,
    ]) {
      expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, declaration)).map(item => item.message))
        .toContain(`restricted capability import binding must not be aliased: ${specifier}#StateTracker`);
    }
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT,
      `import { StateTracker } from '${specifier}'; type Journal = typeof StateTracker;`)).map(item => item.message))
      .toContain(`restricted capability binding must not escape its reviewed call: ${specifier}#StateTracker`);
  });

  it('reserves FED genesis target observation to direct root calls', () => {
    const root = FEDERATED_GENESIS_TARGET_ROOT;
    const target = 'adapters/federated-genesis-target-observation-v1.ts';
    const specifier = '../../adapters/federated-genesis-target-observation-v1.js';
    const binding = 'observeFederatedGenesisTargetsV1';
    const declaration = `import { ${binding} } from '${specifier}';`;
    expect(inspect(staticAppFixture(root, `${declaration} ${binding}({});`))).toEqual([]);
    for (const escape of [
      `const escaped = ${binding};`, `capture(${binding});`,
      `export function runSubstrateFederatedGenesisTargetRootV1() { return ${binding}; }`,
    ]) {
      expect(inspect(staticAppFixture(root, `${declaration} ${escape}`)).map(item => item.message))
        .toContain(`restricted capability binding must not escape its reviewed call: ${specifier}#${binding}`);
    }
    expect(inspect(staticAppFixture(root, `${declaration} export { ${binding} };`)).map(item => item.message))
      .toContain(`restricted capability binding must not be re-exported: ${specifier}#${binding}`);
    expect(inspect(staticAppFixture(root,
      `import { ${binding} as observe } from '${specifier}'; observe({});`)).map(item => item.message))
      .toContain(`exclusive authority import must not be aliased: ${specifier}#${binding}`);
    for (const source of [
      `import * as observer from '${specifier}';`,
      `export { ${binding} } from '${specifier}';`,
      `const observer = await import('${specifier}');`,
      `const observer = require('${specifier}');`,
    ]) {
      expect(inspect({ [target]: 'export {};', [root]: source }).map(item => item.message))
        .toContain(`exclusive authority module must use named runtime imports: ${specifier}`);
    }
    for (const foreign of ['apps/bridge-daemon/foreign.ts', 'adapters/foreign.ts', 'foreign.ts']) {
      const relative = `./${path.posix.relative(path.posix.dirname(foreign), target).replace(/\.ts$/, '.js')}`;
      expect(inspect(staticAppFixture(foreign, `import { ${binding} } from '${relative}';`))
        .map(item => item.message))
        .toContain(`exclusive runtime module import has the wrong owner: ${relative}`);
    }
  });

  it.each([
    ['../../adapters/federated-genesis-operator-v1.js', 'FederatedGenesisOperatorV1'],
    ['../../substrate-federated-isolated-devnet-source-attestation-session-v1.js',
      'SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2'],
    ['../../substrate-federated-isolated-devnet-ergo-node-process-v1.js',
      'SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2'],
    ['../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', 'SubstrateFederatedIsolatedDevnetSetupCheckSessionV2'],
    ['../../substrate-federated-observed-genesis-v1.js', 'ObservedSubstrateFederatedGenesisV1'],
    ['../../substrate-federated-isolated-devnet-mining-credential-v1.js', 'SubstrateFederatedIsolatedDevnetMiningCredentialV1'],
    ['../../substrate-federated-pooled-reserve-deposit-v2.js', 'SubstrateFederatedPooledReserveDepositV2Packet'],
    ['../../substrate-federated-isolated-devnet-source-attestation-session-v1.js', 'SubstrateFederatedNativeGenesisCheckpointAttestationReceiptV1'],
    ['../../unsigned-ergo-transaction.js', 'Eip12Box'],
    ['../../trustless-burn-proof.js', 'TrustlessBurnInclusionProof'],
  ])('accepts the explicit FED genesis type %s#%s without runtime escape', (specifier, binding) => {
    const root = FEDERATED_GENESIS_TARGET_ROOT;
    expect(inspect(staticAppFixture(root,
      `import type { ${binding} } from '${specifier}'; type Current = Readonly<${binding}>;`)))
      .toEqual([]);
    expect(inspect(staticAppFixture(root,
      `import { ${binding} } from '${specifier}'; const escaped = ${binding};`)).map(item => item.message))
      .toContain(`restricted capability binding must not escape its reviewed call: ${specifier}#${binding}`);
  });

  it.each([
    'createFederatedGenesisOperatorV1',
    'assertFederatedGenesisOperatorV1',
    'disposeFederatedGenesisOperatorV1',
  ])('reserves FED genesis custody operation %s to direct root composition', binding => {
    const specifier = FEDERATED_GENESIS_OPERATOR_SPECIFIER;
    const declaration = `import { ${binding} } from '${specifier}';`;
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${binding}();`))).toEqual([]);
    for (const escape of [
      `export { ${binding} };`, `const escaped = ${binding};`,
      `capture(${binding});`, `function expose() { return ${binding}; }`,
      `export function runSubstrateFederatedGenesisTargetRootV1() { return ${binding}; }`,
    ]) {
      expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${escape}`))
        .map(item => item.message)).toContain(
        `restricted capability binding must not ${escape.startsWith('export {')
          ? 'be re-exported' : 'escape its reviewed call'}: ${specifier}#${binding}`,
      );
    }
    for (const foreign of ['apps/bridge-daemon/foreign.ts', 'adapters/foreign.ts', 'foreign.ts']) {
      const foreignSpecifier = path.posix.relative(path.posix.dirname(foreign), FEDERATED_GENESIS_OPERATOR)
        .replace(/\.ts$/, '.js');
      const relative = foreignSpecifier.startsWith('.') ? foreignSpecifier : `./${foreignSpecifier}`;
      expect(inspect(staticAppFixture(foreign, `import { ${binding} } from '${relative}'; ${binding}();`))
        .map(item => item.message)).toContain(
        `exclusive authority import has the wrong owner: ${relative}#${binding}`,
      );
    }
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT,
      `import { ${binding} as alias } from '${specifier}'; alias();`)).map(item => item.message))
      .toContain(`exclusive authority import must not be aliased: ${specifier}#${binding}`);
  });

  it.each(['signFederatedGenesisReservationV1', 'signFederatedGenesisMintV1', 'signFederatedGenesisApproveV1', 'signFederatedGenesisBurnV1'])
    ('restricts %s to its proof-bound composition, not the target root', binding => {
    const composition = 'apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.ts';
    const specifier = FEDERATED_GENESIS_OPERATOR_SPECIFIER;
    const declaration = `import { ${binding} } from '${specifier}';`;
    expect(inspect(staticAppFixture(composition, `${declaration} ${binding}({}, {});`))).toEqual([]);
    for (const escape of [`const escaped = ${binding};`, `capture(${binding});`,
      `function expose() { return ${binding}; }`]) {
      expect(inspect(staticAppFixture(composition, `${declaration} ${escape}`)).map(item => item.message))
        .toContain(`restricted capability binding must not escape its reviewed call: ${specifier}#${binding}`);
    }
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${binding}({}, {});`))
      .map(item => item.message)).toContain(`exclusive authority import has the wrong owner: ${specifier}#${binding}`);
    for (const name of ['createFederatedGenesisOperatorV1', 'disposeFederatedGenesisOperatorV1']) {
      expect(inspect(staticAppFixture(composition, `import { ${name} } from '${specifier}'; ${name}();`))
        .map(item => item.message)).toContain(`exclusive authority import has the wrong owner: ${specifier}#${name}`);
    }
    const proofSpecifier = '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
    expect(inspect(staticAppFixture(composition, `import { produceSubstrateFederatedNativeGenesisMintSourceProofV1 } from '${proofSpecifier}';`))
      .map(item => item.message)).toContain(
        `restricted capability import binding is not allowlisted: ${proofSpecifier}#produceSubstrateFederatedNativeGenesisMintSourceProofV1`);
  });

  it.each([
    ['../../adapters/federated-genesis-target-observation-v1.js', 'observeFederatedGenesisReservationTargetV1'],
    ['../../substrate-federated-authority-safe-devnet-process-v1.js', 'assertOwnedFederatedGenesisDevnetTargetV1'],
  ])('keeps native target preflight at its reviewed call: %s#%s', (specifier, binding) => {
    const composition = 'apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.ts';
    const declaration = `import { ${binding} } from '${specifier}';`;
    expect(inspect(staticAppFixture(composition, `${declaration} ${binding}({});`))).toEqual([]);
    for (const escape of [`const escaped = ${binding};`, `capture(${binding});`, `function expose() { return ${binding}; }`]) {
      expect(inspect(staticAppFixture(composition, `${declaration} ${escape}`)).map(item => item.message))
        .toContain(`restricted capability binding must not escape its reviewed call: ${specifier}#${binding}`);
    }
    if (binding === 'assertOwnedFederatedGenesisDevnetTargetV1') {
      expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${binding}({});`))).toEqual([]);
      expect(inspect(staticAppFixture('apps/bridge-daemon/foreign.ts', `${declaration} ${binding}({});`))
        .map(item => item.message)).toContain(`exclusive authority import has the wrong owner: ${specifier}#${binding}`);
    } else {
      expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${binding}({});`))
        .map(item => item.message)).toContain(`exclusive authority import has the wrong owner: ${specifier}#${binding}`);
    }
  });

  it('accepts the exact native target-observed signing composition', () => {
    const file = 'apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.ts';
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    expect(inspect(staticAppFixture(file, source))).toEqual([]);
  });

  it.each(['reserveFederatedNativeReservationAttemptV1', 'submitFederatedNativeReservationV1',
    'sealFederatedNativeReservationV1', 'observeFederatedNativeReservationInclusionV1',
    'observeFederatedNativeMintParentV1', 'reserveFederatedNativeMintAttemptV1', 'submitFederatedNativeMintV1',
    'sealFederatedNativeMintV1', 'observeFederatedNativeMintInclusionV1', 'observeFederatedNativeMintStateV1',
    'observeFederatedNativeWithdrawalParentV1', 'reserveFederatedNativeWithdrawalAttemptV1',
    'submitFederatedNativeWithdrawalV1', 'sealFederatedNativeWithdrawalV1', 'observeFederatedNativeWithdrawalInclusionV1',
    'collectFederatedNativeBurnCommitmentV1'])
    ('keeps native execution capability in its proof-bound consumer: %s', binding => {
      const composition = 'apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.ts';
      const specifier = '../../adapters/federated-native-reservation-execution-v1.js';
      const declaration = `import { ${binding} } from '${specifier}';`;
      expect(inspect(staticAppFixture(composition, `${declaration} ${binding}({});`))).toEqual([]);
      expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, `${declaration} ${binding}({});`))
        .map(item => item.message)).toContain(`exclusive authority import has the wrong owner: ${specifier}#${binding}`);
      for (const use of [`capture(${binding});`, `const escaped = ${binding};`, `export { ${binding} };`]) {
        expect(inspect(staticAppFixture(composition, `${declaration} ${use}`)).map(item => item.message))
          .toContainEqual(expect.stringMatching(/restricted capability binding must not/));
      }
    });

  it.each([
    ['node:crypto', "import { createPrivateKey } from 'SPECIFIER';"],
    ['ethers', "import { Wallet } from 'SPECIFIER';"],
    ['axios', "import client from 'SPECIFIER';"],
    ['../../adapters/unreviewed.ts', "import { send } from 'SPECIFIER';"],
    ['./unreviewed.ts', "import { run } from 'SPECIFIER';"],
    ['../../ergo-settlement-core/unreviewed.ts', "import type { Input } from 'SPECIFIER';"],
    ['ethers', "export { Wallet } from 'SPECIFIER';"],
    ['axios', "const client = await import('SPECIFIER');"],
  ])('closes native reservation composition imports: %s (%s)', (specifier, declaration) => {
    const composition = 'apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.ts';
    const source = declaration.replace('SPECIFIER', specifier);
    expect(inspect(staticAppFixture(composition, source)).map(item => item.message))
      .toContain(specifier === 'ethers' ? declaration.startsWith('export')
        ? 'restricted capability import must use reviewed named bindings: ethers'
        : 'restricted capability import binding is not allowlisted: ethers#Wallet'
        : `native reservation composition import is not allowlisted: ${specifier}`);
  });

  it.each(['SigningKey', 'HDNodeWallet'])('keeps %s out of the native composition key-validation import', binding => {
    const file = 'apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.ts';
    expect(inspect(staticAppFixture(file, `import { ${binding} } from 'ethers';`)).map(item => item.message))
      .toContain(`restricted capability import binding is not allowlisted: ethers#${binding}`);
  });

  it.each([
    "import * as owner from 'SPECIFIER';",
    "export * from 'SPECIFIER';",
    "export { createFederatedGenesisOperatorV1 } from 'SPECIFIER';",
    "const owner = await import('SPECIFIER');",
    "const owner = require('SPECIFIER');",
  ])('rejects broad FED genesis custody access: %s', declaration => {
    const specifier = FEDERATED_GENESIS_OPERATOR_SPECIFIER;
    expect(inspect({
      [FEDERATED_GENESIS_OPERATOR]: 'export {};',
      [FEDERATED_GENESIS_TARGET_ROOT]: declaration.replace('SPECIFIER', specifier),
    }).map(item => item.message)).toContain(
      `exclusive authority module must use named runtime imports: ${specifier}`,
    );
  });

  it('keeps FED genesis owner types erased without granting foreign runtime ownership', () => {
    const typeImport = "import type { FederatedGenesisOperatorV1 } from './adapters/federated-genesis-operator-v1.js';";
    expect(inspect(staticAppFixture('foreign.ts', `${typeImport} type Owner = FederatedGenesisOperatorV1;`)))
      .toEqual([]);
    expect(inspect(staticAppFixture('foreign.ts', typeImport.replace('import type', 'import')))
      .map(item => item.message)).toContain(
      'exclusive runtime module import has the wrong owner: ./adapters/federated-genesis-operator-v1.js',
    );
  });

  it.each([
    ['../../adapters/federated-genesis-operator-v1.js', 'signFederatedGenesisOperatorV1'],
    ['../../adapters/federated-genesis-target-observation-v1.js', 'rpc'],
    ['../../ergo-settlement-core/strict-json.js', 'parseStrictJson'],
    ['../../substrate-federated-isolated-devnet-setup-check-runner-v2.js',
      'claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2'],
    ['../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js', 'buildSubstrateFederatedIsolatedDevnetPegInCandidateV2'],
    ['../../substrate-federated-isolated-devnet-source-attestation-session-v1.js', 'assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance'],
    ['./frontier-native-proof-bound-reservation-signing-v1.js', 'signFrontierNativeProofBoundReservationV1'],
    ['node:fs', 'rmSync'],
    ['node:crypto', 'createPrivateKey'],
  ])('rejects an unregistered FED genesis binding %s#%s', (specifier, binding) => {
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT,
      `import { ${binding} } from '${specifier}'; ${binding}();`)).map(item => item.message)).toContain(
      `restricted capability import binding is not allowlisted: ${specifier}#${binding}`,
    );
  });

  it('retains exact FED genesis legacy, type and public export boundaries', () => {
    const root = FEDERATED_GENESIS_TARGET_ROOT;
    const specifier = '../../substrate-federated-genesis-node-build-v1.js';
    expect(inspect(staticAppFixture(root, `
      import type { BuildSubstrateFederatedGenesisNodeV1Input } from '${specifier}';
      export interface RunSubstrateFederatedGenesisTargetRootV1Input {
        readonly frontierBuild: Omit<BuildSubstrateFederatedGenesisNodeV1Input, 'sourceSession'>;
      }
      export function runSubstrateFederatedGenesisTargetRootV1() {}
      export function projectSubstrateFederatedNativeTrackerConfirmationFailureV1() {}
    `))).toEqual([]);
    expect(inspect(staticAppFixture(root, "import '../../unregistered-authority.js';"))
      .map(item => item.message)).toContain(
      'apps must not import an unclassified legacy module: unregistered-authority.ts',
    );
    expect(inspect(staticAppFixture('apps/bridge-daemon/foreign.ts',
      `import { buildSubstrateFederatedGenesisNodeV1 } from '${specifier}';`))
      .map(item => item.message)).toContain(
      'apps must not import an unclassified legacy module: substrate-federated-genesis-node-build-v1.ts',
    );
    expect(inspect({ [root]: 'export function unexpectedAuthority() {}' }).map(item => item.message))
      .toEqual(['reviewed app root export is not allowlisted: unexpectedAuthority']);
    expect(inspect({ [root]: 'const hidden = () => {}; export { hidden as runSubstrateFederatedGenesisTargetRootV1 };' })
      .map(item => item.message)).toContain(
      'reviewed app root export must not be aliased: hidden#runSubstrateFederatedGenesisTargetRootV1',
    );
    expect(inspect({ [root]: 'const hidden = () => {}; export { hidden as projectSubstrateFederatedNativeTrackerConfirmationFailureV1 };' })
      .map(item => item.message)).toContain(
      'reviewed app root export must not be aliased: hidden#projectSubstrateFederatedNativeTrackerConfirmationFailureV1',
    );
  });

  it('keeps confirmation progress imports bounded to the reviewed native root and exact binding', () => {
    const specifier = '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
    const binding = 'projectSubstrateFederatedIsolatedDevnetConfirmationProgressV1';
    const source = `import { ${binding} } from '${specifier}'; ${binding}(null, '', '');`;
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, source))).toEqual([]);
    expect(inspect(staticAppFixture(GENESIS_SETUP_ROOT, source)).map(item => item.message))
      .toContain(`restricted capability import binding is not allowlisted: ${specifier}#${binding}`);
    const otherBinding = 'reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1';
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT,
      source.replaceAll(binding, otherBinding))).map(item => item.message))
      .toContain(`restricted capability import binding is not allowlisted: ${specifier}#${otherBinding}`);
  });

  it.each([
    'SubstrateFederatedIsolatedDevnetConfirmationProgressV1',
    'SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
  ])('keeps the new native-root type import erased and bounded: %s', binding => {
    const specifier = '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
    const source = `import type { ${binding} } from '${specifier}';`;
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, source))).toEqual([]);
    const message = `restricted capability import binding is not allowlisted: ${specifier}#${binding}`;
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT, source.replace('import type', 'import')))
      .map(item => item.message)).toContain(message);
    expect(inspect(staticAppFixture(TRACKER_V2_CAMPAIGN_ROOT, source)).map(item => item.message)).toContain(message);
    expect(inspect(staticAppFixture(FEDERATED_GENESIS_TARGET_ROOT,
      source.replace(`${binding} }`, `${binding} as Alias }`))).length).toBeGreaterThan(0);
  });

  it('does not exempt the FED genesis root from global RPC, reflection, entropy or type-query guards', () => {
    const root = FEDERATED_GENESIS_TARGET_ROOT;
    expect(inspect({ [root]: "fetch('http://127.0.0.1:19955');" }).map(item => item.message))
      .toContain('apps must not access unbound global capability: fetch');
    expect(inspect({ [root]: 'Reflect.ownKeys({});' }).map(item => item.message))
      .toContain('apps must not access unbound global capability: Reflect');
    expect(inspect({ [root]: "import { randomBytes } from 'node:crypto'; randomBytes(32);" })
      .map(item => item.message)).toContain(
      'restricted capability import binding is not allowlisted: node:crypto#randomBytes',
    );
    expect(inspect(staticAppFixture(root,
      `import { createFederatedGenesisOperatorV1 } from '${FEDERATED_GENESIS_OPERATOR_SPECIFIER}';
       type Owner = ReturnType<typeof createFederatedGenesisOperatorV1>;`))
      .map(item => item.message)).toContain(
      `restricted capability binding must not escape its reviewed call: ${FEDERATED_GENESIS_OPERATOR_SPECIFIER}#createFederatedGenesisOperatorV1`,
    );
  });

  it.each(['local export', 'alias export', 'returned function', 'assigned function'])('rejects the fixed worker authority escape through %s', mode => {
    const worker = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts';
    const binding = 'runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot';
    const specifier = '../apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.js';
    const escape = mode === 'local export' ? `export { ${binding} };`
      : mode === 'alias export' ? `export { ${binding} as exposed };`
        : mode === 'returned function' ? `function expose(){ return ${binding}; }`
          : `const exposed = ${binding};`;
    const violations = inspect(staticAppFixture(worker, `import { ${binding} } from '${specifier}'; ${escape}`));
    expect(violations.map(item => item.message)).toContain(`fixed campaign capability must only be called directly: ${binding}`);
  });

  it.each([
    'runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot',
    'runSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignRoot',
    'assertSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt',
    'runSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignRoot',
    'assertSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt',
  ])('permits only the fixed V2 worker to import %s', binding => {
    const worker = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts';
    const rootSpecifier = '../apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.js';
    expect(inspect(staticAppFixture(worker, `import { ${binding} } from '${rootSpecifier}'; ${binding}();`))).toEqual([]);
    expect(inspect(staticAppFixture('scripts/foreign-worker.ts',
      `import { ${binding} } from '${rootSpecifier}'; ${binding}();`)).map(item => item.message)).toContain(
      `exclusive authority import has the wrong owner: ${rootSpecifier}#${binding}`,
    );
    expect(inspect(staticAppFixture(worker,
      `import { ${binding} as run } from '${rootSpecifier}'; run();`)).map(item => item.message)).toEqual([
      `exclusive authority import must not be aliased: ${rootSpecifier}#${binding}`,
    ]);
    expect(inspect(staticAppFixture(worker,
      `import * as root from '${rootSpecifier}'; root.${binding}();`)).map(item => item.message)).toEqual([
      `exclusive authority module must use named runtime imports: ${rootSpecifier}`,
    ]);
    expect(inspect({
      [TRACKER_V2_CAMPAIGN_ROOT]: 'export {};',
      [worker]: `export { ${binding} } from '${rootSpecifier}';`,
    }).map(item => item.message)).toContain(
      `exclusive authority module must use named runtime imports: ${rootSpecifier}`,
    );
  });

  it('keeps the V2 worker behind its exact command and rejects alternate callers', () => {
    const worker = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts';
    const command = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts';
    const specifier = './run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js';
    const source = `const { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments } = await import('${specifier}');`;
    expect(inspect({ [worker]: 'export {};', [command]: source })).toEqual([]);
    const diagnosticSource = source.replace('WorkerFromArguments }',
      'WorkerFromArguments, formatSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure }');
    expect(inspect({ [worker]: 'export {};', [command]: diagnosticSource })).toEqual([]);
    expect(inspect({ [worker]: 'export {};', 'scripts/unregistered.ts': source }).map(item => item.message)).toContain(
      `exclusive runtime module import has the wrong owner: ${specifier}`,
    );
  });

  it.each(['local export', 'returned function', 'assigned function'])('rejects a command capability escape through %s', mode => {
    const worker = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts';
    const command = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts';
    const binding = 'runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments';
    const escape = mode === 'local export' ? `export { ${binding} };`
      : mode === 'returned function' ? `function expose(){ return ${binding}; }`
        : `const exposed = ${binding};`;
    const violations = inspect({ [worker]: 'export {};', [command]:
      `const { ${binding} } = await import('./run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js'); ${escape}` });
    expect(violations.map(item => item.message)).toContain(`fixed campaign capability must only be called directly: ${binding}`);
  });

  it.each([
    'const worker = await import(SPECIFIER);',
    'const worker = await import(SPECIFIER_LITERAL);',
    'const { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments: run } = await import(SPECIFIER_LITERAL);',
    'const { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments, formatSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure: format } = await import(SPECIFIER_LITERAL);',
    'const { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments, unknownCapability } = await import(SPECIFIER_LITERAL);',
  ])('rejects a non-canonical dynamic command binding: %s', declaration => {
    const worker = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts';
    const command = 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts';
    const specifier = './run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js';
    const source = declaration.replace('SPECIFIER_LITERAL', `'${specifier}'`);
    const expected = declaration.includes('SPECIFIER_LITERAL')
      ? `exclusive authority module must use named runtime imports: ${specifier}`
      : 'unclassified runtime modules require a static string import target';
    expect(inspect({ [worker]: 'export {};', [command]: source }).map(item => item.message)).toContain(expected);
  });

  it('rejects a local root re-export through worker and command to an unregistered consumer', () => {
    const stem = 'substrate-federated-isolated-devnet-tracker-v2-campaign';
    const binding = 'runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot';
    const violations = inspect({
      [`apps/bridge-daemon/${stem}-root.ts`]: `export function ${binding}(_input: unknown) {}`,
      [`scripts/run-${stem}-worker.ts`]: `import { ${binding} } from '../apps/bridge-daemon/${stem}-root.js'; export { ${binding} };`,
      [`scripts/run-${stem}.ts`]: `export { ${binding} } from './run-${stem}-worker.js';`,
      'scripts/foreign-worker.ts': `import { ${binding} } from './run-${stem}.js'; ${binding}({});`,
    });
    expect(violations.map(item => item.message)).toContain(`fixed campaign capability must only be called directly: ${binding}`);
  });

  it.each([MANAGED_SETUP_V2, TRACKER_V2_CAMPAIGN_ROOT, GENESIS_SETUP_ROOT])(
    'accepts the actual reviewed app source without executing it: %s', file => {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(inspect(staticAppFixture(file, source))).toEqual([]);
    },
  );

  it.each([
    [TRACKER_V2_CAMPAIGN_ROOT, 'adapters/frontier-lab-application-owner-v1', 'claimFrontierLabApplicationOwnerRequestV1'],
    [TRACKER_V2_CAMPAIGN_ROOT, 'adapters/frontier-lab-application-owner-v1', 'disposeFrontierLabApplicationOwnerV1'],
    [TRACKER_V2_CAMPAIGN_ROOT, 'adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1', 'claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1'],
    [TRACKER_V2_CAMPAIGN_ROOT, 'adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1', 'consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1'],
    [TRACKER_V2_CAMPAIGN_ROOT, 'substrate-federated-isolated-devnet-setup-check-runner-v2', 'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2'],
    [TRACKER_V2_CAMPAIGN_ROOT, 'substrate-federated-isolated-devnet-mining-credential-v1', 'revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1'],
    [MANAGED_SETUP_V2, 'substrate-federated-isolated-devnet-portable-replay-v1', 'takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2'],
  ])('pins the V2 lifecycle import %s -> %s#%s to its exact owner', (owner, module, binding) => {
    const specifier = `../../${module}.js`;
    const source = `import { ${binding} } from '${specifier}'; ${binding}();`;
    expect(inspect(staticAppFixture(owner, source))).toEqual([]);
    const otherOwner = owner === MANAGED_SETUP_V2 ? TRACKER_V2_CAMPAIGN_ROOT : MANAGED_SETUP_V2;
    expect(inspect(staticAppFixture(otherOwner, source)).map(item => item.message)).toContain(
      `exclusive authority import has the wrong owner: ${specifier}#${binding}`,
    );
    expect(inspect({
      [`${module}.ts`]: 'export {};',
      'unowned-v2-campaign.ts': `import { ${binding} } from './${module}.js'; ${binding}();`,
    }).map(item => item.message)).toEqual([
      `exclusive authority import has the wrong owner: ./${module}.js#${binding}`,
    ]);
    expect(inspect(staticAppFixture(owner,
      `import { ${binding} as escaped } from '${specifier}'; escaped();`,
    )).map(item => item.message)).toContain(
      `exclusive authority import must not be aliased: ${specifier}#${binding}`,
    );
  });

  it.each([
    [MANAGED_SETUP_V2, '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', 'claimSubstrateFederatedIsolatedDevnetTrackerV2Check'],
    [MANAGED_SETUP_V2, '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', 'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2'],
    [MANAGED_SETUP_V2, '../../substrate-federated-isolated-devnet-portable-replay-v1.js', 'takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1'],
    [MANAGED_SETUP_V2, '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', 'submitSubstrateFederatedIsolatedDevnetTrackerV2Admission'],
    [MANAGED_SETUP_V2, './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11'],
    [TRACKER_V2_CAMPAIGN_ROOT, '../../adapters/frontier-lab-application-owner-v1.js', 'createFrontierLabApplicationOwnerV1'],
    [TRACKER_V2_CAMPAIGN_ROOT, '../../adapters/frontier-lab-application-owner-v1.js', 'signFrontierLabApplicationCallsOnceV1'],
    [TRACKER_V2_CAMPAIGN_ROOT, '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', 'claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2'],
    [TRACKER_V2_CAMPAIGN_ROOT, '../../substrate-federated-isolated-devnet-mining-credential-v1.js', 'issueSubstrateFederatedIsolatedDevnetMiningCredentialV1'],
    [TRACKER_V2_CAMPAIGN_ROOT, '../../substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.js', 'claimSubstrateFederatedIsolatedDevnetTrackerV2Transport'],
    [TRACKER_V2_CAMPAIGN_ROOT, './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js', 'createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3'],
    [TRACKER_V2_CAMPAIGN_ROOT, 'node:fs', 'readFileSync'],
  ])('rejects a capability outside the V2 allowlist: %s -> %s#%s', (file, specifier, binding) => {
    const source = `import { ${binding} } from '${specifier}'; ${binding}();`;
    expect(inspect(staticAppFixture(file, source)).map(item => item.message)).toContain(
      `restricted capability import binding is not allowlisted: ${specifier}#${binding}`,
    );
  });

  it.each([
    [MANAGED_SETUP_V2, '../../substrate-federated-isolated-devnet-portable-replay-v1.js', 'takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2'],
    [TRACKER_V2_CAMPAIGN_ROOT, './substrate-federated-isolated-devnet-managed-setup-v2.js', 'executeSubstrateFederatedIsolatedDevnetManagedSetupV2'],
    [TRACKER_V2_CAMPAIGN_ROOT, './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', 'finalizeReceipt'],
  ])('keeps V2 capability values inside direct calls: %s -> %s#%s', (file, specifier, binding) => {
    const imported = `import { ${binding} } from '${specifier}';`;
    expect(inspect(staticAppFixture(file, `${imported} ${binding}();`))).toEqual([]);
    for (const use of [`const escaped = ${binding};`, `capture(${binding});`, `export { ${binding} };`]) {
      expect(inspect(staticAppFixture(file, `${imported} ${use}`)).map(item => item.message)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/restricted capability binding must not (?:escape its reviewed call|be re-exported)/),
        ]),
      );
    }
    for (const source of [
      `import * as authority from '${specifier}';`,
      `await import('${specifier}');`,
      `require('${specifier}');`,
      `export * from '${specifier}';`,
    ]) {
      expect(inspect(staticAppFixture(file, `${imported} ${source}`)).map(item => item.message)).toEqual(
        expect.arrayContaining([expect.stringMatching(/must use (?:reviewed named bindings|named runtime imports)/)]),
      );
    }
  });

  it.each([MANAGED_SETUP_V2, TRACKER_V2_CAMPAIGN_ROOT, GENESIS_SETUP_ROOT])(
    'rejects an additional public export from %s', file => {
      expect(inspect({ [file]: 'export const unexpectedAuthority = () => {};' }).map(item => item.message))
        .toEqual(['reviewed app root export is not allowlisted: unexpectedAuthority']);
    },
  );

  it.each([
    [MANAGED_SETUP_V2, './ergo-operational-transaction.js', 'runErgoOperationalTransaction'],
    [TRACKER_V2_CAMPAIGN_ROOT, './substrate-federated-isolated-devnet-managed-setup-v2.js', 'executeSubstrateFederatedIsolatedDevnetManagedSetupV2'],
    [TRACKER_V2_CAMPAIGN_ROOT, '../../state-tracker.js', 'StateTracker'],
  ])('allows erased V2 type references but not runtime capability values: %s#%s',
    (file, specifier, binding) => {
      const imported = `import { ${binding} } from '${specifier}';`;
      expect(inspect(staticAppFixture(file,
        `${imported} type Input = Parameters<typeof ${binding}>; type Instance = ${binding};`,
      ))).toEqual([]);
      for (const use of [
        `const escaped = typeof ${binding};`,
        `const escaped = ${binding} as unknown as typeof ${binding};`,
        `const escaped = { authority: ${binding} };`,
      ]) {
        expect(inspect(staticAppFixture(file, `${imported} ${use}`)).map(item => item.message))
          .toContain(`restricted capability binding must not escape its reviewed call: ${specifier}#${binding}`);
      }
    },
  );

  it('allows only the existing replay CLI function through a caught dynamic binding', () => {
    const file = 'scripts/replay-substrate-federated-isolated-devnet-launch-v1.ts';
    const target = 'substrate-federated-isolated-devnet-portable-replay-v1.ts';
    const specifier = `../${target.replace(/\.ts$/, '.js')}`;
    const binding = 'replaySubstrateFederatedIsolatedDevnetPortableV1';
    const authority = 'takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2';
    const source = `async function main() {
      const { ${binding} } = await import('${specifier}'); ${binding}();
    } main().catch(() => {});`;
    expect(inspect({ [file]: source, [target]: 'export {};' })).toEqual([]);
    const actual = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    expect(inspect({ [file]: actual, [target]: 'export {};' })).toEqual([]);
    for (const expression of [
      `const module = await import('${specifier}');`,
      `const { ${authority} } = await import('${specifier}');`,
      `const { ${binding}, ${authority} } = await import('${specifier}');`,
      `const { ${binding}, ...rest } = await import('${specifier}');`,
      `const { ${binding}: alias } = await import('${specifier}');`,
      `const { ${binding} = fallback } = await import('${specifier}');`,
      `let { ${binding} } = await import('${specifier}');`,
      `const [{ ${binding} }] = await Promise.all([import('${specifier}')]);`,
      `const { ${binding} } = await import('.././${target.replace(/\.ts$/, '.js')}');`,
    ]) {
      expect(inspect({ [file]: expression, [target]: 'export {};' }).map(item => item.message))
        .toEqual([expect.stringContaining('exclusive authority module must use named runtime imports')]);
    }
    expect(inspect({ 'scripts/unowned-replay.ts': source, [target]: 'export {};' })
      .map(item => item.message))
      .toEqual([expect.stringContaining('exclusive authority module must use named runtime imports')]);
  });

  it('allows exactly the seven extracted genesis helpers and the V2 public entry points', () => {
    expect(inspect({
      [GENESIS_SETUP_ROOT]: `
        export const APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS = 1;
        export function normalizeTrackerTransportJournalRootV9() {}
        export function assertReservedTrackerTransportJournalRootV9() {}
        export function normalizePegInCandidatePlan() {}
        export function normalizeFrontierApplicationRunnerPlan() {}
        export function waitForCanonicalConfirmation() {}
        export function finalizeReceipt() {}
      `,
      [MANAGED_SETUP_V2]: `
        export interface ExecuteSubstrateFederatedIsolatedDevnetManagedSetupV2Input {}
        export function executeSubstrateFederatedIsolatedDevnetManagedSetupV2() {}
      `,
      [TRACKER_V2_CAMPAIGN_ROOT]: `
        export type RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput = unknown;
        export function runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot() {}
        export type SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt = unknown;
        export function assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt() {}
      `,
    })).toEqual([]);
  });

  it('permits only the reviewed V2 constant values to leave direct-call positions', () => {
    const managed = `
      import { PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION } from '../../peg-in-causal-admission-v2.js';
      import { SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2
      } from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
      import { PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE
      } from '../../relayer-core/ergo-operational-transaction-lifecycle.js';
      capture(PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
        PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE);
    `;
    const root = `
      import { SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
        SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
      } from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
      import { APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS
      } from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
      capture(SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
        SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN, APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS);
    `;
    expect(inspect(staticAppFixture(MANAGED_SETUP_V2, managed))).toEqual([]);
    expect(inspect(staticAppFixture(TRACKER_V2_CAMPAIGN_ROOT, root))).toEqual([]);
  });

  it.each([
    ['substrate-federated-isolated-devnet-setup-check-execution-v2', 'claimSubstrateFederatedIsolatedDevnetTrackerV2Check', 'substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle'],
    ['substrate-federated-isolated-devnet-setup-check-execution-v2', 'revalidateSubstrateFederatedIsolatedDevnetTrackerV2Reservation', 'substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle'],
    ['substrate-federated-isolated-devnet-setup-check-execution-v2', 'checkSubstrateFederatedIsolatedDevnetTrackerV2Transport', 'substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle'],
    ['substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle', 'claimSubstrateFederatedIsolatedDevnetTrackerV2Transport', 'substrate-federated-isolated-devnet-checked-submission-transport-v1'],
    ['substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle', 'assertSubstrateFederatedIsolatedDevnetTrackerV2TransportReady', 'substrate-federated-isolated-devnet-checked-submission-transport-v1'],
    ['substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle', 'finalizeSubstrateFederatedIsolatedDevnetTrackerV2TransportJournal', 'substrate-federated-isolated-devnet-checked-submission-transport-v1'],
    ['substrate-federated-isolated-devnet-setup-check-execution-v2', 'claimSubstrateFederatedIsolatedDevnetWithdrawalV2Check', 'substrate-federated-isolated-devnet-withdrawal-v2-lifecycle'],
    ['substrate-federated-isolated-devnet-setup-check-execution-v2', 'assertSubstrateFederatedIsolatedDevnetWithdrawalV2Check', 'substrate-federated-isolated-devnet-withdrawal-v2-lifecycle'],
    ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle', 'claimSubstrateFederatedIsolatedDevnetWithdrawalV2Transport', 'substrate-federated-isolated-devnet-checked-submission-transport-v1'],
    ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle', 'assertSubstrateFederatedIsolatedDevnetWithdrawalV2TransportReady', 'substrate-federated-isolated-devnet-checked-submission-transport-v1'],
    ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle', 'finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2TransportJournal', 'substrate-federated-isolated-devnet-checked-submission-transport-v1'],
    ['substrate-federated-isolated-devnet-ergo-node-process-v1', 'assertSubstrateFederatedIsolatedDevnetTrackerFreshnessLineageV2', 'substrate-federated-isolated-devnet-setup-check-execution-v2'],
    ['substrate-federated-isolated-devnet-ergo-node-process-v1', 'assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2', 'substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle'],
    ['substrate-federated-isolated-devnet-ergo-node-process-v1', 'assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2', 'substrate-federated-isolated-devnet-setup-check-execution-v2'],
  ])('keeps the V2 admission capability %s#%s in its concrete owner', (module, symbol, owner) => {
    const source = `import { ${symbol} } from './${module}.js'; ${symbol}();`;
    const producer = { [`${module}.ts`]: `export const ${symbol} = () => {};` };
    expect(inspect({ ...producer, [`${owner}.ts`]: source })).toEqual([]);
    expect(inspect({ ...producer, 'other-admission-caller.ts': source }).map(item => item.message)).toEqual([
      `exclusive authority import has the wrong owner: ./${module}.js#${symbol}`,
    ]);
  });

  it.each([
    'authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2',
    'reserveSubstrateFederatedIsolatedDevnetWithdrawalV2',
    'confirmSubstrateFederatedIsolatedDevnetWithdrawalV2',
  ])('keeps withdrawal orchestration %s in the owned campaign', symbol => {
    const module = 'substrate-federated-isolated-devnet-withdrawal-v2-lifecycle';
    const source = `import { ${symbol} } from '../../${module}.js'; ${symbol}();`;
    expect(inspect(staticAppFixture(TRACKER_V2_CAMPAIGN_ROOT, source))).toEqual([]);
    expect(inspect({ [`${module}.ts`]: `export const ${symbol} = () => {};`,
      'other-withdrawal-caller.ts': `import { ${symbol} } from './${module}.js'; ${symbol}();` })
      .map(item => item.message)).toEqual([
      `exclusive authority import has the wrong owner: ./${module}.js#${symbol}`,
    ]);
  });

  it('classifies only physical architecture layers', () => {
    expect(classifyBridgeLayer('ergo-settlement-core/codec.ts')).toBe('ergo-settlement-core');
    expect(classifyBridgeLayer('profiles/substrate-grandpa-v1/statement.ts')).toBe('profiles');
    expect(classifyBridgeLayer('state-tracker.ts')).toBeNull();
  });

  it('accepts the target one-way dependency graph and approved pure core imports', () => {
    expect(inspect({
      'ergo-settlement-core/value.ts': `
        import blakejs from 'blakejs';
        export const value = blakejs;
      `,
      'ergo-settlement-core/index.ts': `export * from './value.js';`,
      'relayer-core/lifecycle.ts': `import '../ergo-settlement-core/index.js';`,
      'profiles/substrate-grandpa-v1/index.ts': `
        import blakejs from 'blakejs';
        import '../../ergo-settlement-core/index.js';
        export const digest = blakejs;
      `,
      'adapters/frontier.ts': `
        import '../relayer-core/lifecycle.js';
        import '../profiles/substrate-grandpa-v1/index.js';
      `,
      'apps/bridge-daemon.ts': `
        import '../relayer-core/lifecycle.js';
        import '../adapters/frontier.js';
      `,
    })).toEqual([]);
  });

  it('resolves NodeNext .mjs and .cjs imports to layered TypeScript sources', () => {
    expect(inspect({
      'ergo-settlement-core/esm-value.mts': `export const esmValue = true;`,
      'ergo-settlement-core/esm-index.mts': `export * from './esm-value.mjs';`,
      'ergo-settlement-core/cjs-value.cts': `export const cjsValue = true;`,
      'ergo-settlement-core/cjs-index.cts': `export * from './cjs-value.cjs';`,
    })).toEqual([]);
  });

  it('rejects core access to adapters, legacy modules, and non-pure packages', () => {
    const violations = inspect({
      'legacy.ts': `export const legacy = true;`,
      'adapters/ergo-rpc.ts': `export const rpc = true;`,
      'ergo-settlement-core/invalid.ts': `
        import axios from 'axios';
        import '../adapters/ergo-rpc.js';
        import '../legacy.js';
        export const invalid = axios;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core external import is not allowlisted: axios',
      'ergo-settlement-core must not depend on adapters',
      'ergo-settlement-core must not import an unclassified legacy module: legacy.ts',
    ]);
  });

  it('rejects adapter and composition-root shortcuts into unclassified legacy modules', () => {
    const violations = inspect({
      'legacy-state.ts': `export const state = true;`,
      'legacy-daemon.ts': `export const daemon = true;`,
      'adapters/sqlite.ts': `import '../legacy-state.js';`,
      'apps/bridge-daemon.ts': `import '../legacy-daemon.js';`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'adapters must not import an unclassified legacy module: legacy-state.ts',
      'apps must not import an unclassified legacy module: legacy-daemon.ts',
    ]);
  });

  it('allows only the exact reviewed Gate 5 app-to-legacy composition seam', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.ts';
    const reviewedTarget =
      'substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts';
    expect(inspect({
      [reviewedRoot]: `
        import '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
      `,
      [reviewedTarget]: 'export const lifecycle = true;',
    })).toEqual([]);

    expect(inspect({
      'apps/bridge-daemon/other-root.ts': `
        import '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
      `,
      [reviewedTarget]: 'export const lifecycle = true;',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${reviewedTarget}`,
    ]);

    expect(inspect({
      [reviewedRoot]: `import '../../unreviewed-legacy-authority.js';`,
      'unreviewed-legacy-authority.ts': 'export const authority = true;',
    }).map(violation => violation.message)).toEqual([
      'apps must not import an unclassified legacy module: unreviewed-legacy-authority.ts',
    ]);
  });

  it('limits checkout layout discovery to reviewed Gate 5 entry points', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const layoutTarget = 'bridge-repository-layout.ts';
    expect(inspect({
      [reviewedRoot]: `
        import { resolveBridgeRepositoryRootsFromCheckoutLayout } from '../../bridge-repository-layout.js';
        resolveBridgeRepositoryRootsFromCheckoutLayout('bridge');
      `,
      [layoutTarget]: `
        export function resolveBridgeRepositoryRootsFromCheckoutLayout(_root: string) {}
        export function discoverBridgeRepositoryRoot(_root: string) {}
      `,
    })).toEqual([]);

    expect(inspect({
      [reviewedRoot]: `
        import { discoverBridgeRepositoryRoot } from '../../bridge-repository-layout.js';
        discoverBridgeRepositoryRoot('bridge');
      `,
      [layoutTarget]: `
        export function discoverBridgeRepositoryRoot(_root: string) {}
      `,
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../bridge-repository-layout.js#discoverBridgeRepositoryRoot',
    ]);

    expect(inspect({
      'scripts/unreviewed-entry-point.ts': `
        import { resolveBridgeRepositoryRootsFromCheckoutLayout } from '../bridge-repository-layout.js';
        resolveBridgeRepositoryRootsFromCheckoutLayout('bridge');
      `,
      [layoutTarget]: `
        export function resolveBridgeRepositoryRootsFromCheckoutLayout(_root: string) {}
      `,
    }).map(violation => violation.message)).toEqual([
      'exclusive authority import has the wrong owner: ../bridge-repository-layout.js#resolveBridgeRepositoryRootsFromCheckoutLayout',
    ]);
  });

  it('pins the federated application/checkpoint root to direct reviewed calls', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts';
    const packetTarget =
      'substrate-federated-isolated-devnet-packet-producer-v1.ts';
    const runnerTarget =
      'substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.ts';
    const signerTarget =
      'substrate-federated-isolated-devnet-setup-check-runner-v2.ts';
    const targets = {
      [packetTarget]: 'export function createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3() {}',
      [runnerTarget]: `
        export function preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1() {}
        export function runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2() {}
      `,
      [signerTarget]: 'export interface SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2 {}',
    };
    expect(inspect({
      ...targets,
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3,
        } from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
        import {
          preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
          runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2,
        } from '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';
        import type {
          SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
        } from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
        export async function runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
          signer: SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
        ) {
          createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3(signer);
          preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1({});
          return runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2({});
        }
      `,
    })).toEqual([]);

    expect(inspect({
      ...targets,
      [reviewedRoot]: `
        import {
          runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2,
        } from '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';
        const injectedRunner =
          runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2;
      `,
    }).map(violation => violation.message)).toContain(
      'restricted capability binding must not escape its reviewed call: ../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js#runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2',
    );

    expect(inspect({
      ...targets,
      [reviewedRoot]: `
        import {
          preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
        } from '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';
        const injectedPreflight =
          preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1;
      `,
    }).map(violation => violation.message)).toContain(
      'restricted capability binding must not escape its reviewed call: ../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js#preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1',
    );

    expect(inspect({
      ...targets,
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3,
        } from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
        const injectedContinuation =
          createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3;
      `,
    }).map(violation => violation.message)).toContain(
      'restricted capability binding must not escape its reviewed call: ../../substrate-federated-isolated-devnet-packet-producer-v1.js#createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3',
    );

    expect(inspect({
      ...targets,
      [reviewedRoot]: `
        import {
          runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
        } from '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';
        runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1({});
      `,
    }).map(violation => violation.message)).toContain(
      'restricted capability import binding is not allowlisted: ../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js#runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1',
    );
  });

  it.each([
    ['../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js',
      'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV3'],
    ['../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js',
      'assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance'],
    ['../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js',
      'assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance'],
    ['./frontier-lab-proof-bound-application-signing-v1.js',
      'signFrontierLabProofBoundApplicationV1'],
    ['./frontier-lab-proof-bound-application-signing-v1.js',
      'signFrontierLabProofBoundApplicationV2'],
    ['../../substrate-federated-isolated-devnet-packet-producer-v1.js',
      'createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV4'],
    ['../../substrate-federated-isolated-devnet-packet-producer-v1.js',
      'assertSubstrateFederatedIsolatedDevnetPacketV3Provenance'],
  ])('keeps the signed application capability %s#%s inside reviewed calls', (specifier, binding) => {
    const root = 'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts';
    const target = specifier.startsWith('../../')
      ? specifier.slice(6).replace(/\.js$/, '.ts')
      : `apps/bridge-daemon/${specifier.slice(2).replace(/\.js$/, '.ts')}`;
    const sources = { [target]: `export function ${binding}() {}` };
    const importStatement = `import { ${binding} } from '${specifier}';`;
    expect(inspect({ ...sources, [root]: `${importStatement} ${binding}();` })).toEqual([]);
    for (const escape of [`export { ${binding} };`, `export const escaped = ${binding};`]) {
      expect(inspect({ ...sources, [root]: `${importStatement} ${escape}` })
        .map(value => value.message)).toEqual(expect.arrayContaining([
        expect.stringMatching(/restricted capability binding must not (?:be re-exported|escape its reviewed call)/),
      ]));
    }
    expect(inspect({
      ...sources,
      [root]: `import { ${binding} as replacement } from '${specifier}'; replacement();`,
    }).map(value => value.message)).toContain(
      `${specifier.startsWith('../../') ? 'restricted capability import binding' : 'exclusive authority import'} must not be aliased: ${specifier}#${binding}`,
    );
  });

  it('reserves isolated signer and mining authority imports to exact owners', () => {
    const signerBinding =
      'substrate-federated-isolated-devnet-setup-check-signer-binding-v2.ts';
    const miningCredential =
      'substrate-federated-isolated-devnet-mining-credential-v1.ts';
    const runner =
      'substrate-federated-isolated-devnet-setup-check-runner-v2.ts';
    const execution =
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts';
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    expect(inspect({
      [signerBinding]: 'export const registry = true;',
      [miningCredential]: 'export const credential = true;',
      [runner]: `
        import {
          registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
          revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
        } from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
      `,
      [execution]: `
        import {
          issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
          revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
        } from './substrate-federated-isolated-devnet-mining-credential-v1.js';
      `,
      [reviewedRoot]: `
        import {
          claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2,
        } from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
        claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2({});
      `,
      'authenticated-spv-tracker-jvm-avl-differential.ts': `
        declare const runtimePath: string;
        export const pinnedWasm = require(runtimePath);
      `,
    })).toEqual([]);

    expect(inspect({
      [signerBinding]: 'export const registry = true;',
      [miningCredential]: 'export const credential = true;',
      'forged-provenance.ts': `
        import {
          registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
        } from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
        import {
          issueSubstrateFederatedIsolatedDevnetMiningCredentialV1 as issue,
        } from './substrate-federated-isolated-devnet-mining-credential-v1.js';
      `,
      'namespace-forgery.ts': `
        import * as registry from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
      `,
      'computed-forgery.ts': `
        const authorityModule =
          './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
        export async function forge() {
          return import(authorityModule);
        }
      `,
    }).map(violation => violation.message)).toEqual([
      'unclassified runtime modules require a static string import target',
      'exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js#registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2',
      'exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-mining-credential-v1.js#issueSubstrateFederatedIsolatedDevnetMiningCredentialV1',
      'exclusive authority module must use named runtime imports: ./substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js',
    ]);

    expect(inspect({
      [runner]: 'export const runner = true;',
      'unauthorized-credential-sequence.ts': `
        import {
          claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2,
        } from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
        claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2({});
      `,
    }).map(violation => violation.message)).toEqual([
      'exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-setup-check-runner-v2.js#claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
    ]);
  });

  it('reserves fresh LAB owner creation and request binding to the canonical producer', () => {
    const ownerModule = 'adapters/frontier-lab-application-owner-v1.ts';
    const create = 'createFrontierLabApplicationOwnerV1';
    const bind = 'bindFrontierLabApplicationOwnerRequestV1';
    const moduleSource = `export const ${create} = () => {}; export const ${bind} = () => {};`;
    expect(inspect({
      [ownerModule]: moduleSource,
      'scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts': `
        import { ${create}, ${bind} } from '../adapters/frontier-lab-application-owner-v1.js';
      `,
    })).toEqual([]);
    for (const binding of [create, bind]) {
      expect(inspect({
        [ownerModule]: moduleSource,
        'unreviewed-owner.ts': `
          import { ${binding} as issue } from './adapters/frontier-lab-application-owner-v1.js';
        `,
      }).map(violation => violation.message)).toEqual([
        `exclusive authority import has the wrong owner: ./adapters/frontier-lab-application-owner-v1.js#${binding}`,
      ]);
    }
    expect(inspect({
      [ownerModule]: moduleSource,
      'namespace-owner.ts': `
        import * as custody from './adapters/frontier-lab-application-owner-v1.js';
      `,
    }).map(violation => violation.message)).toEqual([
      'exclusive authority module must use named runtime imports: ./adapters/frontier-lab-application-owner-v1.js',
    ]);
  });

  it('reserves bootstrap request provenance issuance and claiming to V9 owners', () => {
    const bindingModule =
      'adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.ts';
    const loaderModule =
      'scripts/run-substrate-federated-isolated-devnet-bootstrap-worker-v1.ts';
    const issue =
      'bindSubstrateFederatedIsolatedDevnetCanonicalBootstrapRequestBytesV1';
    const claim =
      'claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1';
    const project =
      'projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1';
    const consume =
      'consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1';
    const load =
      'loadCanonicalBootstrapRequestBoundWithProvenanceV1';

    expect(inspect({
      [bindingModule]: `
        export const ${issue} = () => {};
        export const ${claim} = () => {};
        export const ${project} = () => {};
        export const ${consume} = () => {};
      `,
      [loaderModule]: `
        export const ${load} = () => {};
      `,
      'forged-request-authority.ts': `
        import { ${issue}, ${claim}, ${project}, ${consume} } from './adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js';
        import { ${load} } from './scripts/run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
        ${issue}();
        ${claim}();
        ${project}();
        ${consume}();
        ${load}();
      `,
    }).map(violation => violation.message)).toEqual([
      `exclusive authority import has the wrong owner: ./adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js#${issue}`,
      `exclusive authority import has the wrong owner: ./adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js#${claim}`,
      `exclusive authority import has the wrong owner: ./adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js#${consume}`,
      `exclusive authority import has the wrong owner: ./adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js#${project}`,
      `exclusive authority import has the wrong owner: ./scripts/run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js#${load}`,
    ]);
  });

  it('reserves fresh custody claiming to the campaign root without granting it creation authority', () => {
    const ownerModule = 'adapters/frontier-lab-application-owner-v1.ts';
    const claim = 'claimFrontierLabApplicationOwnerRequestV1';
    const create = 'createFrontierLabApplicationOwnerV1';
    const root = 'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const source = `export const ${claim} = () => {}; export const ${create} = () => {};`;
    expect(inspect({
      [ownerModule]: source,
      [root]: `import { ${claim} } from '../../adapters/frontier-lab-application-owner-v1.js';`,
    })).toEqual([]);
    for (const importer of [
      'scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts',
      'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
    ]) {
      const path = importer.startsWith('apps/') ? '../../' : '../';
      expect(inspect({
        [ownerModule]: source,
        [importer]: `import { ${claim} as take } from '${path}adapters/frontier-lab-application-owner-v1.js';`,
      }).map(value => value.message)).toContain(
        `exclusive authority import has the wrong owner: ${path}adapters/frontier-lab-application-owner-v1.js#${claim}`,
      );
    }
    expect(inspect({
      [ownerModule]: source,
      [root]: `import { ${create} } from '../../adapters/frontier-lab-application-owner-v1.js';`,
    }).map(value => value.message)).toContain(
      `exclusive authority import has the wrong owner: ../../adapters/frontier-lab-application-owner-v1.js#${create}`,
    );
  });

  it.each(['signFrontierLabProofBoundApplicationV1', 'signFrontierLabProofBoundApplicationV2'])(
    'reserves scoped LAB signing %s to the retained-packet root', compose => {
    const ownerModule = 'adapters/frontier-lab-application-owner-v1.ts';
    const sign = 'signFrontierLabApplicationCallsOnceV1';
    const composition = 'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts';
    const root = 'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts';
    const sources = {
      [ownerModule]: `export const ${sign} = () => {};`,
      [composition]: `import { ${sign} } from '../../adapters/frontier-lab-application-owner-v1.js'; export const ${compose} = () => {};`,
    };
    expect(inspect({
      ...sources,
      [root]: `import { ${compose} } from './frontier-lab-proof-bound-application-signing-v1.js';`,
    })).toEqual([]);
    for (const importer of [root, 'apps/bridge-daemon/unreviewed-lab-signing.ts']) {
      expect(inspect({
        ...sources,
        [importer]: `import { ${sign} } from '../../adapters/frontier-lab-application-owner-v1.js';`,
      }).map(value => value.message)).toContain(
        `exclusive authority import has the wrong owner: ../../adapters/frontier-lab-application-owner-v1.js#${sign}`,
      );
    }
    expect(inspect({
      ...sources,
      'unreviewed-lab-signing.ts': `import { ${compose} } from './apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.js';`,
    }).map(value => value.message)).toContain(
      'exclusive runtime module import has the wrong owner: ./apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.js',
    );
    for (const escape of [`export { ${sign} };`, `export const rawSigner = ${sign};`]) {
      expect(inspect({
        ...sources,
        [composition]: `import { ${sign} } from '../../adapters/frontier-lab-application-owner-v1.js'; ${escape}`,
      }).map(value => value.message)).toEqual(expect.arrayContaining([
        expect.stringMatching(/restricted capability binding must not (?:be re-exported|escape its reviewed call)/),
      ]));
    }
    for (const specifier of [
      '../../adapters/./frontier-lab-application-owner-v1.js',
      '../../adapters/../adapters/frontier-lab-application-owner-v1.js',
    ]) {
      expect(inspect({
        ...sources,
        [composition]: `import { ${sign} } from '${specifier}'; export { ${sign} };`,
      }).map(value => value.message)).toContain(
        `restricted capability import binding is not allowlisted: ${specifier}#${sign}`,
      );
    }
  });

  it('keeps the tracker attempt journal behind its two reviewed app owners', () => {
    const attempt =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts';
    const transport =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts';
    const claim =
      'claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1';
    const issueResult =
      'issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1';
    expect(inspect({
      [attempt]: `
        export const ${claim} = () => {};
        export const ${issueResult} = () => {};
      `,
      [transport]: `
        import { ${claim}, ${issueResult} } from './substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js';
        export async function submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1() {
          ${claim}();
          ${issueResult}();
        }
      `,
    })).toEqual([]);

    expect(inspect({
      [attempt]: `export const ${claim} = () => {};`,
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts': `
        import { ${claim} } from './apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js';
        ${claim}();
      `,
    }).map(violation => violation.message)).toEqual([
      'exclusive runtime module import has the wrong owner: ./apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js',
    ]);

    expect(inspect({
      [attempt]: `export const ${issueResult} = () => {};`,
      'apps/bridge-daemon/forged-tracker-result.ts': `
        import { ${issueResult} } from './substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js';
        ${issueResult}();
      `,
    }).map(violation => violation.message)).toEqual([
      `exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js#${issueResult}`,
      'exclusive runtime module import has the wrong owner: ./substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js',
    ]);
  });

  it('reserves tracker freshness completion issuance to setup execution', () => {
    const processModule =
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts';
    const setupExecution =
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts';
    const issue =
      'issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1';
    expect(inspect({
      [processModule]: `export const ${issue} = () => {};`,
      [setupExecution]: `
        import { ${issue} } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
        ${issue}();
      `,
    })).toEqual([]);

    expect(inspect({
      [processModule]: `export const ${issue} = () => {};`,
      'forged-freshness-completion.ts': `
        import { ${issue} } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
        ${issue}();
      `,
    }).map(violation => violation.message)).toEqual([
      `exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-ergo-node-process-v1.js#${issue}`,
    ]);
  });

  it('reserves node-startup phase projection to the reviewed composition root', () => {
    const processModule =
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts';
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const projector =
      'projectSubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseFailureV1';
    expect(inspect({
      [processModule]: `export const ${projector} = () => {};`,
      [reviewedRoot]: `
        import { ${projector} } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
        ${projector}({});
      `,
    })).toEqual([]);

    expect(inspect({
      [processModule]: `export const ${projector} = () => {};`,
      'apps/bridge-daemon/forged-startup-phase-root.ts': `
        import { ${projector} } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
        ${projector}({});
      `,
    }).map(violation => violation.message)).toEqual([
      'apps must not import an unclassified legacy module: substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
      `exclusive authority import has the wrong owner: ../../substrate-federated-isolated-devnet-ergo-node-process-v1.js#${projector}`,
    ]);
  });

  it('keeps the tracker confirmation receipt type inside the reviewed composition root', () => {
    const processModule =
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts';
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const receipt =
      'SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV2Receipt';
    expect(inspect({
      [processModule]: `export interface ${receipt} {}`,
      [reviewedRoot]: `
        import type { ${receipt} } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
        type ReviewedConfirmation = ${receipt};
      `,
    })).toEqual([]);

    expect(inspect({
      [processModule]: `export interface ${receipt} {}`,
      'apps/bridge-daemon/forged-confirmation-root.ts': `
        import type { ${receipt} } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
        type ForgedConfirmation = ${receipt};
      `,
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${processModule}`,
    ]);
  });

  it('reserves frozen V7 provenance registration to the execution root', () => {
    const registry =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.ts';
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const registration =
      'registerSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance';
    expect(inspect({
      [registry]: `export const ${registration} = () => {};`,
      [reviewedRoot]: `
        import { ${registration} } from './substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.js';
        ${registration}();
      `,
    })).toEqual([]);

    expect(inspect({
      [registry]: `export const ${registration} = () => {};`,
      'apps/bridge-daemon/forged-v7-provenance.ts': `
        import { ${registration} } from './substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.js';
        ${registration}();
      `,
    }).map(violation => violation.message)).toEqual([
      `exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.js#${registration}`,
    ]);
  });

  it('reserves every isolated tracker signing kernel to the reviewed execution module', () => {
    const kernel =
      'substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.ts';
    const v2 = 'executeObservedAnchorTrackerCheckKernelV2';
    const freshness =
      'executeObservedAnchorTrackerReservationFreshnessCheckKernelV1';

    expect(inspect({
      [kernel]: `
        export const ${v2} = () => {};
        export const ${freshness} = () => {};
      `,
      'unauthorized-tracker-check.ts': `
        import { ${v2}, ${freshness} } from './substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.js';
        ${v2}();
        ${freshness}();
      `,
    }).map(violation => violation.message)).toEqual([
      `exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.js#${v2}`,
      `exclusive authority import has the wrong owner: ./substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.js#${freshness}`,
    ]);
  });

  it.each([
    ['substrate-federated-isolated-devnet-genesis-revalidator-v1', 'createSubstrateFederatedNativeGenesisRevalidatorV1'],
    ['substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1', 'createSubstrateFederatedNativeGenesisBroadcastAuthorizerV1'],
    ['substrate-federated-isolated-devnet-checked-submission-transport-v1', 'createSubstrateFederatedNativeGenesisCheckedSubmissionTransportV1'],
    ['substrate-federated-isolated-devnet-genesis-revalidator-v1', 'createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV2'],
    ['substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1', 'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2'],
    ['substrate-federated-isolated-devnet-checked-submission-transport-v1', 'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2'],
  ] as const)('keeps native and V3 genesis capability %s#%s inside the fixed root', (module, factory) => {
    const root = 'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const target = `${module}.ts`;
    const specifier = `../../${module}.js`;
    expect(inspect({
      [root]: `import { ${factory} } from '${specifier}'; ${factory}();`,
      [target]: `export function ${factory}() {}`,
    })).toEqual([]);
    expect(inspect({
      [root]: `import { ${factory} } from '${specifier}'; export const escaped = ${factory};`,
      [target]: `export function ${factory}() {}`,
    }).map(value => value.message)).toContain(
      `restricted capability binding must not escape its reviewed call: ${specifier}#${factory}`,
    );
    expect(inspect({
      'apps/bridge-daemon/unreviewed-genesis-root.ts': `import { ${factory} } from '${specifier}'; ${factory}();`,
      [target]: `export function ${factory}() {}`,
    }).map(value => value.message)).toContain(
      `apps must not import an unclassified legacy module: ${target}`,
    );
  });

  it('limits the isolated-devnet execution root to its reviewed broadcast bindings', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const authorizerTarget =
      'substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.ts';
    const sourceLockAuthorizerTarget =
      'substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.ts';
    const ownedRewardDiscoveryTarget =
      'substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.ts';
    const transportTarget =
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts';
    const applicationCheckpointTarget =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts';
    expect(inspect({
      [reviewedRoot]: `
        import {
          assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
          createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
        } from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
        import {
          createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
        } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
        import {
          createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1,
        } from '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
          createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
        import {
          createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
        } from '../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';
        import {
          discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1,
        } from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
        import {
          assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance,
          createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3,
          preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3,
        } from './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';
        preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3({});
      `,
      [authorizerTarget]: 'export const authorizer = true;',
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts':
        'export const process = true;',
      'substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts':
        'export const observer = true;',
      [sourceLockAuthorizerTarget]: 'export const authorizer = true;',
      [ownedRewardDiscoveryTarget]: 'export const discovery = true;',
      [transportTarget]: 'export const transport = true;',
      [applicationCheckpointTarget]: `
        export function assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance() {}
        export function createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3() {}
        export function preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3() {}
      `,
    })).toEqual([]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          authorizeUnreviewedBroadcast,
        } from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
      `,
      [authorizerTarget]: 'export const authorizer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js#authorizeUnreviewedBroadcast',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3,
        } from './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';
        export const escapedApplicationCheckpointContinuation =
          createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3;
      `,
      [applicationCheckpointTarget]: `
        export function createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3() {}
      `,
    }).map(violation => violation.message)).toEqual([
      'reviewed app root export is not allowlisted: escapedApplicationCheckpointContinuation',
      'restricted capability binding must not escape its reviewed call: ./substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js#createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
        export const escapedTransport =
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1;
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      'reviewed app root export is not allowlisted: escapedTransport',
      'restricted capability binding must not escape its reviewed call: ../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js#createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
        export function leakedTransport(target: unknown, authorizer: unknown) {
          return createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
            target,
            authorizer,
          );
        }
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      'reviewed app root export is not allowlisted: leakedTransport',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
        function leakedTransport(target: unknown, authorizer: unknown) {
          return createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
            target,
            authorizer,
          );
        }
        export {
          leakedTransport as runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1,
        };
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      'reviewed app root export must not be aliased: leakedTransport#runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1',
    ]);

    expect(inspect({
      'apps/bridge-daemon/other-execution-root.ts': `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${transportTarget}`,
    ]);

    expect(inspect({
      'apps/bridge-daemon/other-execution-root.ts': `
        import {
          createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
        } from '../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';
      `,
      [sourceLockAuthorizerTarget]: 'export const authorizer = true;',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${sourceLockAuthorizerTarget}`,
    ]);
  });

  it('limits the dual-node recovery composition seam to its reviewed process producer', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-dual-node-recovery-composition-v1.ts';
    const reviewedTarget =
      'substrate-federated-authority-safe-devnet-process-v1.ts';
    expect(inspect({
      [reviewedRoot]: `
        import {
          assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt,
          assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt,
          type OwnedAuthoritySafeDevnetRecoveryBestTipV1,
          type OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt,
          type OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    })).toEqual([]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          withOwnedAuthoritySafeDevnetProcessesV1,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-authority-safe-devnet-process-v1.js#withOwnedAuthoritySafeDevnetProcessesV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          withOwnedAuthoritySafeDevnetProcessesV1,
        } from '../.././substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../.././substrate-federated-authority-safe-devnet-process-v1.js#withOwnedAuthoritySafeDevnetProcessesV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import * as processModule from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'exclusive authority module must use named runtime imports: ../../substrate-federated-authority-safe-devnet-process-v1.js',
      'restricted capability import must use reviewed named bindings: ../../substrate-federated-authority-safe-devnet-process-v1.js',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt as assertProcess,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding must not be aliased: ../../substrate-federated-authority-safe-devnet-process-v1.js#assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        void import('../../substrate-federated-authority-safe-devnet-process-v1.js');
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'exclusive authority module must use named runtime imports: ../../substrate-federated-authority-safe-devnet-process-v1.js',
      'restricted capability import must use reviewed named bindings: ../../substrate-federated-authority-safe-devnet-process-v1.js',
    ]);

    expect(inspect({
      [reviewedRoot]: `import '../../unreviewed-recovery-authority.js';`,
      'unreviewed-recovery-authority.ts': 'export const authority = true;',
    }).map(violation => violation.message)).toEqual([
      'apps must not import an unclassified legacy module: unreviewed-recovery-authority.ts',
    ]);

    expect(inspect({
      'apps/bridge-daemon/other-recovery-root.ts': `
        import '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${reviewedTarget}`,
      'exclusive authority module must use named runtime imports: ../../substrate-federated-authority-safe-devnet-process-v1.js',
    ]);
  });

  it('keeps exact reviewed type imports out of runtime capability flow', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const stateTarget = 'state-tracker.ts';
    expect(inspect({
      [reviewedRoot]: `
        import {
          type ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result,
        } from '../../state-tracker.js';
        interface ReloadHolder {
          readonly reload: ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result;
        }
      `,
      [stateTarget]: `
        export interface ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result {}
      `,
    })).toEqual([]);
  });

  it('limits the concrete recovery campaign to its exact process and SQLite bindings', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-dual-node-recovery-campaign-v1.ts';
    const processTarget =
      'substrate-federated-authority-safe-devnet-process-v1.ts';
    const acceptanceTarget =
      'substrate-federated-authority-safe-devnet-acceptance-v1.ts';
    const stateTarget = 'state-tracker.ts';
    expect(inspect({
      [reviewedRoot]: `
        import { StateTracker } from '../../state-tracker.js';
        import {
          assertSubstrateFederatedSourceLockedRecoveryTimelineV1,
          type SubstrateFederatedSourceLockedRecoveryTimelineV1,
        } from '../../substrate-federated-authority-safe-devnet-acceptance-v1.js';
        import {
          assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material,
          captureOwnedAuthoritySafeDevnetRecoveryTimelineV1,
          type OwnedAuthoritySafeDevnetProcessV1Input,
          type OwnedAuthoritySafeDevnetRecoveryTimelineV1ObservationInput,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [acceptanceTarget]: 'export const sourceLockedAcceptance = true;',
      [processTarget]: 'export const processProducer = true;',
      [stateTarget]: 'export class StateTracker {}',
    })).toEqual([]);

    expect(inspect({
      [reviewedRoot]: `
        import { captureSubstrateFederatedSourceLockedRecoveryTimelineV1 }
          from '../../substrate-federated-authority-safe-devnet-acceptance-v1.js';
      `,
      [acceptanceTarget]: 'export const sourceLockedAcceptance = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-authority-safe-devnet-acceptance-v1.js#captureSubstrateFederatedSourceLockedRecoveryTimelineV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import { withOwnedAuthoritySafeDevnetProcessesV1 }
          from '../../substrate-federated-authority-safe-devnet-process-v1.js';
        import { StateTracker } from '../../state-tracker.js';
      `,
      [processTarget]: 'export const processProducer = true;',
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-authority-safe-devnet-process-v1.js#withOwnedAuthoritySafeDevnetProcessesV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import { StateTracker, type PegInEvent } from '../../state-tracker.js';
      `,
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../state-tracker.js#PegInEvent',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import * as state from '../../state-tracker.js';
      `,
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import must use reviewed named bindings: ../../state-tracker.js',
    ]);

    expect(inspect({
      'apps/bridge-daemon/other-campaign.ts': `
        import { StateTracker } from '../../state-tracker.js';
      `,
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${stateTarget}`,
    ]);
  });

  it('rejects profile access to relayer-core or adapters', () => {
    const violations = inspect({
      'relayer-core/lifecycle.ts': `export const lifecycle = true;`,
      'adapters/frontier.ts': `export const frontier = true;`,
      'profiles/substrate-grandpa-v1/invalid.ts': `
        import '../../relayer-core/lifecycle.js';
        import '../../adapters/frontier.js';
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles must not depend on relayer-core',
      'profiles must not depend on adapters',
    ]);
  });

  it('rejects persistence and ambient RPC capabilities in relayer-core', () => {
    const violations = inspect({
      'relayer-core/invalid.ts': `
        import Database from 'better-sqlite3';
        export const environment = process;
        export const request = fetch;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'relayer-core external import is not allowlisted: better-sqlite3',
      'relayer-core must not access unbound global capability: process',
      'relayer-core must not access unbound global capability: fetch',
    ]);
  });

  it('rejects unreviewed dependencies and ambient capabilities in pure profiles', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts': `
        import axios from 'axios';
        export const environment = process;
        export const request = fetch;
        export const digest = crypto;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles external import is not allowlisted: axios',
      'profiles must not access unbound global capability: process',
      'profiles must not access unbound global capability: fetch',
      'profiles must not access unbound global capability: crypto',
    ]);
  });

  it('allows only the exact profile files to use the reviewed crypto and AVL runtimes', () => {
    expect(inspect({
      'ergo-settlement-core/strict-json.ts':
        `import { createHash } from 'node:crypto'; export const digest = createHash('sha256').update('x').digest('hex');`,
      'profiles/substrate-grandpa-v1/ergo-settlement-policy.ts':
        `import { ECDH } from 'node:crypto'; export const converted = ECDH.convertKey('02', 'secp256k1');`,
      'profiles/substrate-grandpa-v1/duplicate-prevention.ts':
        `import { bridge_generate_proofs, bridge_lookup_membership, empty_digest } from '../../../../wasm-avl/pkg/bridge_avl.js';`,
      'profiles/substrate-grandpa-v1/spv-tracker-authenticated.ts':
        `import { tracker_v2_empty_digest, tracker_v2_get_proof, tracker_v2_insert, tracker_v2_verify_insert } from '../../../../wasm-avl/pkg/bridge_avl.js';`,
    })).toEqual([]);
  });

  it('rejects escaping or broadening the reviewed settlement-core hash capability', () => {
    const violations = inspect({
      'ergo-settlement-core/strict-json.ts': `
        import { createHash, sign } from 'node:crypto';
        export const hashFactory = createHash;
        export function openHash() { return createHash('sha256'); }
        export const weakDigest = createHash('md5').update('x').digest('hex');
        export const signature = sign;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: node:crypto#sign',
      'restricted capability binding must not escape its reviewed call: node:crypto#createHash',
      'restricted capability binding must not escape its reviewed call: node:crypto#createHash',
      'restricted capability binding must not escape its reviewed call: node:crypto#createHash',
    ]);
  });

  it('rejects broader or disguised capability imports from the reviewed profile files', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/ergo-settlement-policy.ts':
        `import { ECDH, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'; export const keygen = new ECDH('secp256k1');`,
      'profiles/substrate-grandpa-v1/duplicate-prevention.ts':
        `import * as bridgeAvl from '../../../../wasm-avl/pkg/bridge_avl.js'; export const avl = bridgeAvl;`,
      'profiles/substrate-grandpa-v1/spv-tracker-authenticated.ts':
        `import { tracker_v2_insert as insert, bridge_generate_proofs } from '../../../../wasm-avl/pkg/bridge_avl.js'; export const trackerInsert = insert;`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'restricted capability import must use reviewed named bindings: ../../../../wasm-avl/pkg/bridge_avl.js',
      'restricted capability binding must not escape its reviewed call: node:crypto#ECDH',
      'restricted capability import binding is not allowlisted: node:crypto#createPrivateKey',
      'restricted capability import binding is not allowlisted: node:crypto#generateKeyPairSync',
      'restricted capability import binding is not allowlisted: node:crypto#sign',
      'restricted capability import binding is not allowlisted: ../../../../wasm-avl/pkg/bridge_avl.js#bridge_generate_proofs',
      'restricted capability import binding must not be aliased: ../../../../wasm-avl/pkg/bridge_avl.js#tracker_v2_insert',
    ]);
  });

  it('rejects transitive re-exports of restricted profile capabilities', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/ergo-settlement-policy.ts': `
        import { ECDH } from 'node:crypto';
        export { ECDH };
      `,
      'profiles/substrate-grandpa-v1/duplicate-prevention.ts': `
        import { bridge_generate_proofs } from '../../../../wasm-avl/pkg/bridge_avl.js';
        export { bridge_generate_proofs };
      `,
      'profiles/substrate-grandpa-v1/consumer.ts': `
        import { ECDH } from './ergo-settlement-policy.js';
        import { bridge_generate_proofs } from './duplicate-prevention.js';
        export const keygen = new ECDH('secp256k1');
        export const rawAvl = bridge_generate_proofs;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'restricted capability binding must not be re-exported: ../../../../wasm-avl/pkg/bridge_avl.js#bridge_generate_proofs',
      'restricted capability binding must not be re-exported: node:crypto#ECDH',
    ]);
  });

  it('rejects profile-runtime allowlist reuse from any other file', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts': `
        import { ECDH } from 'node:crypto';
        import '../../../../wasm-avl/pkg/bridge_avl.js';
        export const curve = ECDH;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles external import is not allowlisted: node:crypto',
      'relative import does not resolve inside the checked source tree: ../../../../wasm-avl/pkg/bridge_avl.js',
    ]);
  });

  it('rejects indirect dynamic-code constructors in pure profiles', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts': `
        export const fromProperty =
          ({}).constructor.constructor('return process')();
        export const fromElement =
          [][ 'filter' ][ 'constructor' ]('return fetch')();
        const { constructor: DynamicFunction } = [].filter;
        export const fromDestructuring = DynamicFunction('return process')();
        const ReflectedFunction = Reflect.get([].filter, 'constructor');
        export const fromReflection = ReflectedFunction('return fetch')();
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles must not access an indirect dynamic-code constructor',
      'profiles must not access an indirect dynamic-code constructor',
      'profiles must not bind an indirect dynamic-code constructor',
      'profiles must not access unbound global capability: Reflect',
    ]);
  });

  it('rejects dynamic bypasses, unresolved imports, and layered module cycles', () => {
    const violations = inspect({
      'ergo-settlement-core/a.ts': `
        import('./b.js');
        require('./missing.js');
        import(dynamicTarget);
      `,
      'ergo-settlement-core/b.ts': `export * from './a.js';`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'relative import does not resolve inside the checked source tree: ./missing.js',
      'layered modules require a static string import target',
      'layered module cycle: ergo-settlement-core/a.ts -> ergo-settlement-core/b.ts -> ergo-settlement-core/a.ts',
    ]);
  });

  it('rejects a bare-specifier bypass of a physical layer dependency', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts':
        `import 'relayer-core/lifecycle.js';`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'layer imports must be relative and resolve inside the checked source tree: relayer-core/lifecycle.js',
    ]);
  });

  it('rejects import-equals and import-type bypasses', () => {
    const violations = inspect({
      'adapters/ergo-rpc.ts': `export interface ErgoRpc { readonly url: string }`,
      'ergo-settlement-core/invalid.ts': `
        import ErgoRpcModule = require('../adapters/ergo-rpc.js');
        export type ErgoRpc = import('../adapters/ergo-rpc.js').ErgoRpc;
        export const module = ErgoRpcModule;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core must not depend on adapters',
      'ergo-settlement-core must not depend on adapters',
    ]);
  });

  it('rejects direct, aliased, and computed global capabilities in settlement core', () => {
    const violations = inspect({
      'ergo-settlement-core/invalid.ts': `
        export const runtime = process;
        export const request = fetch;
        export const signer = crypto;
        export const computed = globalThis['fetch'];
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core must not access unbound global capability: process',
      'ergo-settlement-core must not access unbound global capability: fetch',
      'ergo-settlement-core must not access unbound global capability: crypto',
      'ergo-settlement-core must not access unbound global capability: globalThis',
    ]);
  });

  it('allows capability-like names when they resolve to local declarations', () => {
    expect(inspect({
      'ergo-settlement-core/local-names.ts': `
        const process = { env: 'pure input' };
        const fetch = (value: string): string => value;
        const crypto = { digest: 'fixed' };
        export const local = [process.env, fetch('value'), crypto.digest];
      `,
    })).toEqual([]);
  });

  it('rejects erased ambient declarations that fall through to runtime globals', () => {
    const violations = inspect({
      'ergo-settlement-core/ambient.ts': `
        declare const process: { readonly env: unknown };
        declare function fetch(value: string): Promise<unknown>;
        declare const crypto: { readonly subtle: unknown };
        export const runtime = process;
        export const request = fetch;
        export const signer = crypto;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core must not access unbound global capability: process',
      'ergo-settlement-core must not access unbound global capability: fetch',
      'ergo-settlement-core must not access unbound global capability: crypto',
      'ergo-settlement-core must not access unbound global capability: process',
      'ergo-settlement-core must not access unbound global capability: fetch',
      'ergo-settlement-core must not access unbound global capability: crypto',
    ]);
  });
});
