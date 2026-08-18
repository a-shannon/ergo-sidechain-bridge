import path from 'node:path';

import ts from 'typescript';

export const BRIDGE_LAYERS = [
  'ergo-settlement-core',
  'relayer-core',
  'profiles',
  'adapters',
  'apps',
] as const;

export type BridgeLayer = (typeof BRIDGE_LAYERS)[number];

export interface LayerSourceFile {
  path: string;
  source: string;
}

export interface LayerImportViolation {
  file: string;
  line: number;
  importSpecifier: string | null;
  message: string;
}

const ALLOWED_LAYER_DEPENDENCIES: Readonly<Record<BridgeLayer, ReadonlySet<BridgeLayer>>> = {
  'ergo-settlement-core': new Set(['ergo-settlement-core']),
  'relayer-core': new Set(['ergo-settlement-core', 'relayer-core']),
  profiles: new Set(['ergo-settlement-core', 'profiles']),
  adapters: new Set(['ergo-settlement-core', 'relayer-core', 'profiles', 'adapters']),
  apps: new Set(BRIDGE_LAYERS),
};

// Gate 5 may compose these reviewed legacy producers before WP-08A extracts
// them. The seam is exact by source and target; capability-bearing targets may
// additionally restrict imported bindings. It grants no general app escape.
const REVIEWED_APP_LEGACY_COMPOSITION_SEAMS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.ts',
    new Set([
      'substrate-federated-authority-safe-devnet-history-v1.ts',
      'substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts',
      'substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts',
      'substrate-federated-isolated-devnet-ergo-node-build-v1.ts',
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
      'substrate-federated-isolated-devnet-packet-producer-v1.ts',
      'substrate-federated-isolated-devnet-reward-input-discovery-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Set([
      'peg-in-causal-admission-v2.ts',
      'state-tracker.ts',
      'substrate-federated-authority-safe-devnet-history-v1.ts',
      'substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts',
      'substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts',
      'substrate-federated-isolated-devnet-ergo-node-build-v1.ts',
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
      'substrate-federated-isolated-devnet-packet-producer-v1.ts',
      'substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.ts',
      'substrate-federated-isolated-devnet-reward-input-discovery-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
      'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts',
      'substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.ts',
      'substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts',
      'substrate-federated-isolated-devnet-genesis-revalidator-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-candidate-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.ts',
      'substrate-federated-local-devnet-genesis-journal-v1.ts',
      'substrate-federated-local-devnet-peg-in-source-lock-journal-v1.ts',
      'substrate-federated-settlement-family-v1.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-dual-node-recovery-composition-v1.ts',
    new Set([
      'substrate-federated-authority-safe-devnet-process-v1.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-dual-node-recovery-campaign-v1.ts',
    new Set([
      'state-tracker.ts',
      'substrate-federated-authority-safe-devnet-acceptance-v1.ts',
      'substrate-federated-authority-safe-devnet-process-v1.ts',
    ]),
  ],
]);

const REVIEWED_APP_LEGACY_COMPOSITION_IMPORT_BINDINGS: ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
> = new Map([
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Map([
      [
        'peg-in-causal-admission-v2.ts',
        new Set(['PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION']),
      ],
      [
        'state-tracker.ts',
        new Set(['StateTracker']),
      ],
      [
        'substrate-federated-authority-safe-devnet-history-v1.ts',
        new Set(['collectSubstrateFederatedAuthoritySafeDevnetHistoryV1']),
      ],
      [
        'substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts',
        new Set([
          'RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input',
          'SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-ergo-node-build-v1.ts',
        new Set([
          'buildSubstrateFederatedIsolatedDevnetErgoNodeV1',
          'BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input',
          'SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1',
          'SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt',
          'SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV1',
          'SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts',
        new Set(['collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2']),
      ],
      [
        'substrate-federated-isolated-devnet-packet-producer-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
          'ProduceSubstrateFederatedIsolatedDevnetPacketV1Input',
          'SubstrateFederatedIsolatedDevnetPacketSessionV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-reward-input-discovery-v1.ts',
        new Set([
          'assertSubstrateFederatedRewardInputDiscoveryV2Provenance',
          'discoverSubstrateFederatedRewardInputsV2',
          'SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN',
          'SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN',
          'SubstrateFederatedRewardInputDiscoveryV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.ts',
        new Set([
          'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1',
          'SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
        new Set([
          'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2',
          'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
          'SubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
          'SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        new Set([
          'SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt',
          'SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1',
          'SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2',
          'SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2',
          'SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2',
          'discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-candidate-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPegInCandidateV1',
          'buildSubstrateFederatedIsolatedDevnetPegInCandidateV1',
          'SubstrateFederatedIsolatedDevnetPegInCandidateV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1',
          'observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1',
          'SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1',
          'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
          'SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-genesis-revalidator-v1.ts',
        new Set(['createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1']),
      ],
      [
        'substrate-federated-local-devnet-genesis-journal-v1.ts',
        new Set([
          'createSubstrateFederatedLocalDevnetGenesisJournalV1',
          'SubstrateFederatedLocalDevnetGenesisJournalV1',
        ]),
      ],
      [
        'substrate-federated-local-devnet-peg-in-source-lock-journal-v1.ts',
        new Set([
          'createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1',
        ]),
      ],
      [
        'substrate-federated-settlement-family-v1.ts',
        new Set(['decodeSubstrateFederatedSettlementFamilyV1Profile']),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-dual-node-recovery-composition-v1.ts',
    new Map([
      [
        'substrate-federated-authority-safe-devnet-process-v1.ts',
        new Set([
          'assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt',
          'assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt',
          'OwnedAuthoritySafeDevnetRecoveryBestTipV1',
          'OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt',
          'OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-dual-node-recovery-campaign-v1.ts',
    new Map([
      [
        'state-tracker.ts',
        new Set(['StateTracker']),
      ],
      [
        'substrate-federated-authority-safe-devnet-acceptance-v1.ts',
        new Set([
          'assertSubstrateFederatedSourceLockedRecoveryTimelineV1',
          'SubstrateFederatedSourceLockedRecoveryTimelineV1',
        ]),
      ],
      [
        'substrate-federated-authority-safe-devnet-process-v1.ts',
        new Set([
          'assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material',
          'captureOwnedAuthoritySafeDevnetRecoveryTimelineV1',
          'OwnedAuthoritySafeDevnetProcessV1Input',
          'OwnedAuthoritySafeDevnetRecoveryTimelineV1ObservationInput',
        ]),
      ],
    ]),
  ],
]);

const REVIEWED_APP_CAPABILITY_IMPORT_BINDINGS: ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
> = new Map([
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Map([
      ['../../state-tracker.js', new Set(['StateTracker'])],
      [
        '../../substrate-federated-authority-safe-devnet-history-v1.js',
        new Set(['collectSubstrateFederatedAuthoritySafeDevnetHistoryV1']),
      ],
      [
        '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js',
        new Set(['buildSubstrateFederatedIsolatedDevnetErgoNodeV1']),
      ],
      [
        '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js',
        new Set(['createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1']),
      ],
      [
        '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js',
        new Set(['collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2']),
      ],
      [
        '../../substrate-federated-isolated-devnet-packet-producer-v1.js',
        new Set(['createSubstrateFederatedIsolatedDevnetPacketSessionV1']),
      ],
      [
        '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js',
        new Set([
          'assertSubstrateFederatedRewardInputDiscoveryV2Provenance',
          'discoverSubstrateFederatedRewardInputsV2',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js',
        new Set([
          'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js',
        new Set([
          'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2',
          'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js',
        new Set([
          'discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js',
        new Set([
          'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js',
        new Set([
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1',
          'observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1',
          'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js',
        new Set(['createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1']),
      ],
      [
        '../../substrate-federated-isolated-devnet-genesis-revalidator-v1.js',
        new Set(['createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1']),
      ],
      [
        '../../substrate-federated-local-devnet-genesis-journal-v1.js',
        new Set(['createSubstrateFederatedLocalDevnetGenesisJournalV1']),
      ],
      [
        '../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js',
        new Set([
          'createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1',
        ]),
      ],
    ]),
  ],
]);

const REVIEWED_APP_PUBLIC_EXPORT_BINDINGS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Set([
      'RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input',
      'RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input',
      'SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1',
    ]),
  ],
]);

type CapabilityRestrictedBridgeLayer = Extract<
  BridgeLayer,
  'ergo-settlement-core' | 'relayer-core' | 'profiles'
>;

const CAPABILITY_RESTRICTED_LAYER_EXTERNAL_IMPORTS: Readonly<
  Record<CapabilityRestrictedBridgeLayer, ReadonlySet<string>>
> = {
  'ergo-settlement-core': new Set(['blakejs']),
  'relayer-core': new Set(),
  profiles: new Set(['blakejs']),
};

const CAPABILITY_RESTRICTED_FILE_IMPORT_BINDINGS: ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
> = new Map([
  [
    'ergo-settlement-core/strict-json.ts',
    new Map([
      ['node:crypto', new Set(['createHash'])],
    ]),
  ],
  [
    'profiles/substrate-grandpa-v1/ergo-settlement-policy.ts',
    new Map([
      ['node:crypto', new Set(['ECDH'])],
    ]),
  ],
  [
    'profiles/substrate-grandpa-v1/duplicate-prevention.ts',
    new Map([
      [
        '../../../../wasm-avl/pkg/bridge_avl.js',
        new Set([
          'bridge_generate_proofs',
          'bridge_lookup_membership',
          'empty_digest',
        ]),
      ],
    ]),
  ],
  [
    'profiles/substrate-grandpa-v1/spv-tracker-authenticated.ts',
    new Map([
      [
        '../../../../wasm-avl/pkg/bridge_avl.js',
        new Set([
          'tracker_v2_empty_digest',
          'tracker_v2_get_proof',
          'tracker_v2_insert',
          'tracker_v2_verify_insert',
        ]),
      ],
    ]),
  ],
]);

const CAPABILITY_RESTRICTED_LAYER_FORBIDDEN_GLOBALS = new Set([
  'Bun',
  'Deno',
  'EventSource',
  'Function',
  'Reflect',
  'WebSocket',
  'Worker',
  'XMLHttpRequest',
  'crypto',
  'eval',
  'fetch',
  'global',
  'globalThis',
  'module',
  'process',
  'require',
]);

function normalizeSourcePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\/+/, '');
  return path.posix.normalize(normalized);
}

export function classifyBridgeLayer(filePath: string): BridgeLayer | null {
  const [root] = normalizeSourcePath(filePath).split('/');
  return BRIDGE_LAYERS.find(layer => layer === root) ?? null;
}

type ModuleImportForm =
  | 'named-import'
  | 'default-or-mixed-import'
  | 'namespace-import'
  | 'side-effect-import'
  | 'export'
  | 'import-equals'
  | 'import-type'
  | 'dynamic-import'
  | 'require';

interface CollectedModuleSpecifier {
  value: string | null;
  line: number;
  form: ModuleImportForm;
  bindings: Array<{ imported: string; local: string }>;
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile): CollectedModuleSpecifier[] {
  const imports: CollectedModuleSpecifier[] = [];

  const addSpecifier = (
    node: ts.StringLiteralLike,
    form: ModuleImportForm,
    bindings: Array<{ imported: string; local: string }> = [],
  ): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    imports.push({
      value: node.text,
      line: line + 1,
      form,
      bindings,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause) {
        addSpecifier(node.moduleSpecifier, 'side-effect-import');
      } else if (clause.name) {
        addSpecifier(node.moduleSpecifier, 'default-or-mixed-import');
      } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        addSpecifier(node.moduleSpecifier, 'namespace-import');
      } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        addSpecifier(
          node.moduleSpecifier,
          'named-import',
          clause.namedBindings.elements.map(element => ({
            imported: element.propertyName?.text ?? element.name.text,
            local: element.name.text,
          })),
        );
      } else {
        addSpecifier(node.moduleSpecifier, 'default-or-mixed-import');
      }
    } else if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addSpecifier(node.moduleSpecifier, 'export');
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      addSpecifier(node.moduleReference.expression, 'import-equals');
    } else if (
      ts.isImportTypeNode(node)
      && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)
    ) {
      addSpecifier(node.argument.literal, 'import-type');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
        addSpecifier(node.arguments[0], 'dynamic-import');
      } else {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        imports.push({
          value: null,
          line: line + 1,
          form: 'dynamic-import',
          bindings: [],
        });
      }
    } else if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
    ) {
      if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
        addSpecifier(node.arguments[0], 'require');
      } else {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        imports.push({
          value: null,
          line: line + 1,
          form: 'require',
          bindings: [],
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

function inspectFileRestrictedImportBindings(
  file: string,
  imported: CollectedModuleSpecifier,
): LayerImportViolation[] {
  const allowedBindings =
    imported.value === null
      ? undefined
      : CAPABILITY_RESTRICTED_FILE_IMPORT_BINDINGS.get(file)?.get(imported.value);
  if (!allowedBindings) return [];

  return inspectRestrictedImportBindings(file, imported, allowedBindings);
}

function inspectRestrictedImportBindings(
  file: string,
  imported: CollectedModuleSpecifier,
  allowedBindings: ReadonlySet<string>,
): LayerImportViolation[] {

  if (imported.form !== 'named-import') {
    return [{
      file,
      line: imported.line,
      importSpecifier: imported.value,
      message:
        `restricted capability import must use reviewed named bindings: ${imported.value}`,
    }];
  }

  const violations: LayerImportViolation[] = [];
  for (const binding of imported.bindings) {
    if (!allowedBindings.has(binding.imported)) {
      violations.push({
        file,
        line: imported.line,
        importSpecifier: imported.value,
        message:
          `restricted capability import binding is not allowlisted: ${imported.value}#${binding.imported}`,
      });
    } else if (binding.local !== binding.imported) {
      violations.push({
        file,
        line: imported.line,
        importSpecifier: imported.value,
        message:
          `restricted capability import binding must not be aliased: ${imported.value}#${binding.imported}`,
      });
    }
  }
  return violations;
}

function collectReviewedAppExportViolations(
  file: string,
  sourceFile: ts.SourceFile,
  allowedBindings: ReadonlySet<string>,
): LayerImportViolation[] {
  const violations: LayerImportViolation[] = [];
  const addViolation = (node: ts.Node, binding: string): void => {
    if (allowedBindings.has(binding)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      file,
      line: line + 1,
      importSpecifier: null,
      message: `reviewed app root export is not allowlisted: ${binding}`,
    });
  };
  const exported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false);

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      addViolation(statement, 'default');
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        addViolation(statement, '*');
        continue;
      }
      for (const element of statement.exportClause.elements) {
        if (
          element.propertyName
          && element.propertyName.text !== element.name.text
        ) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            element.getStart(sourceFile),
          );
          violations.push({
            file,
            line: line + 1,
            importSpecifier: null,
            message:
              `reviewed app root export must not be aliased: ${element.propertyName.text}#${element.name.text}`,
          });
        }
        addViolation(element, element.name.text);
      }
      continue;
    }
    if (!exported(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          addViolation(declaration.name, declaration.name.text);
        } else {
          addViolation(declaration.name, '<destructured>');
        }
      }
      continue;
    }
    if (
      (
        ts.isFunctionDeclaration(statement)
        || ts.isClassDeclaration(statement)
        || ts.isInterfaceDeclaration(statement)
        || ts.isTypeAliasDeclaration(statement)
        || ts.isEnumDeclaration(statement)
        || ts.isModuleDeclaration(statement)
      )
      && statement.name
    ) {
      addViolation(statement.name, statement.name.text);
      continue;
    }
    addViolation(statement, '<anonymous>');
  }
  return violations;
}

function collectCapabilityRestrictedLayerViolations(
  file: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  sourceLayer: BridgeLayer,
  restrictedFileBindings:
    ReadonlyMap<string, ReadonlySet<string>> | undefined =
      CAPABILITY_RESTRICTED_FILE_IMPORT_BINDINGS.get(file),
): LayerImportViolation[] {
  const violations: LayerImportViolation[] = [];
  const addViolation = (node: ts.Node, message: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      file,
      line: line + 1,
      importSpecifier: null,
      message,
    });
  };

  const isNonValueName = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    return (
      (ts.isPropertyAccessExpression(parent) && parent.name === node)
      || (ts.isPropertyAssignment(parent) && parent.name === node)
      || (ts.isBindingElement(parent) && parent.propertyName === node)
      || (ts.isImportSpecifier(parent) && parent.propertyName === node)
      || (ts.isExportSpecifier(parent) && parent.propertyName === node)
      || (ts.isLabeledStatement(parent) && parent.label === node)
      || ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent))
        && parent.label === node)
      || (
        node.text === 'require'
        && ts.isCallExpression(parent)
        && parent.expression === node
      )
    );
  };

  const isAmbientDeclaration = (declaration: ts.Declaration): boolean => {
    if (declaration.getSourceFile().isDeclarationFile) return true;
    for (
      let current: ts.Node | undefined = declaration;
      current && !ts.isSourceFile(current);
      current = current.parent
    ) {
      if (
        ts.canHaveModifiers(current)
        && ts.getModifiers(current)?.some(
          modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword,
        )
      ) {
        return true;
      }
    }
    return false;
  };

  const staticPropertyName = (
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  ): string | null => {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    const argument = node.argumentExpression;
    if (
      argument
      && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
    ) {
      return argument.text;
    }
    return null;
  };

  const isConstructorAccess = (
    node: ts.Node,
  ): node is ts.PropertyAccessExpression | ts.ElementAccessExpression =>
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    && staticPropertyName(node) === 'constructor';

  const isConstructorBinding = (node: ts.Node): node is ts.BindingElement => {
    if (!ts.isBindingElement(node)) return false;
    const propertyName = node.propertyName;
    if (
      propertyName
      && (
        (ts.isIdentifier(propertyName) && propertyName.text === 'constructor')
        || (
          (ts.isStringLiteral(propertyName) || ts.isNumericLiteral(propertyName))
          && propertyName.text === 'constructor'
        )
      )
    ) {
      return true;
    }
    return (
      propertyName === undefined
      && ts.isIdentifier(node.name)
      && node.name.text === 'constructor'
    );
  };

  const isReviewedSha256DigestCall = (node: ts.Identifier): boolean => {
    const createCall = node.parent;
    if (
      !ts.isCallExpression(createCall)
      || createCall.expression !== node
      || createCall.arguments.length !== 1
      || !ts.isStringLiteral(createCall.arguments[0])
      || createCall.arguments[0].text !== 'sha256'
    ) {
      return false;
    }
    let current: ts.Expression = createCall;
    let sawUpdate = false;
    while (
      ts.isPropertyAccessExpression(current.parent)
      && current.parent.expression === current
      && ts.isCallExpression(current.parent.parent)
      && current.parent.parent.expression === current.parent
    ) {
      const operation = current.parent.name.text;
      const operationCall = current.parent.parent;
      if (operation === 'update') {
        sawUpdate = true;
        current = operationCall;
        continue;
      }
      return operation === 'digest'
        && sawUpdate
        && operationCall.arguments.length === 1
        && ts.isStringLiteral(operationCall.arguments[0])
        && operationCall.arguments[0].text === 'hex';
    }
    return false;
  };

  const isReceiverOfAnotherConstructorAccess = (
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  ): boolean => {
    const parent = node.parent;
    return (
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
      && parent.expression === node
      && staticPropertyName(parent) === 'constructor'
    );
  };

  const restrictedImportsBySymbol = new Map<
    ts.Symbol,
    { moduleSpecifier: string; binding: string }
  >();
  const restrictedImportsByLocalName = new Map<
    string,
    { moduleSpecifier: string; binding: string }
  >();
  if (restrictedFileBindings) {
    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement)
        || !ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        continue;
      }
      const allowedBindings = restrictedFileBindings.get(statement.moduleSpecifier.text);
      const namedBindings = statement.importClause?.namedBindings;
      if (!allowedBindings || !namedBindings || !ts.isNamedImports(namedBindings)) {
        continue;
      }
      for (const element of namedBindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (!allowedBindings.has(imported) || element.name.text !== imported) continue;
        const symbol = checker.getSymbolAtLocation(element.name);
        const binding = {
          moduleSpecifier: statement.moduleSpecifier.text,
          binding: imported,
        };
        if (symbol) restrictedImportsBySymbol.set(symbol, binding);
        restrictedImportsByLocalName.set(element.name.text, binding);
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (isConstructorAccess(node) && !isReceiverOfAnotherConstructorAccess(node)) {
      addViolation(
        node,
        `${sourceLayer} must not access an indirect dynamic-code constructor`,
      );
    }

    if (isConstructorBinding(node)) {
      addViolation(
        node,
        `${sourceLayer} must not bind an indirect dynamic-code constructor`,
      );
    }

    if (
      ts.isIdentifier(node)
      && CAPABILITY_RESTRICTED_LAYER_FORBIDDEN_GLOBALS.has(node.text)
      && !isNonValueName(node)
    ) {
      const symbol = checker.getSymbolAtLocation(node);
      const declaredInsideModule = symbol?.declarations?.some(
        declaration =>
          declaration.getSourceFile() === sourceFile
          && !isAmbientDeclaration(declaration),
      ) ?? false;
      if (!declaredInsideModule) {
        addViolation(
          node,
          `${sourceLayer} must not access unbound global capability: ${node.text}`,
        );
      }
    }

    if (ts.isExportSpecifier(node)) {
      const localName = node.propertyName?.text ?? node.name.text;
      const restricted = restrictedImportsByLocalName.get(localName);
      if (restricted) {
        addViolation(
          node,
          `restricted capability binding must not be re-exported: ${restricted.moduleSpecifier}#${restricted.binding}`,
        );
      }
    }

    if (
      ts.isIdentifier(node)
      && !ts.isImportSpecifier(node.parent)
    ) {
      const symbol = checker.getSymbolAtLocation(node);
      const restricted = symbol ? restrictedImportsBySymbol.get(symbol) : undefined;
      if (restricted) {
        const isReviewedEcdhCall =
          restricted.moduleSpecifier === 'node:crypto'
          && restricted.binding === 'ECDH'
          && ts.isPropertyAccessExpression(node.parent)
          && node.parent.expression === node
          && node.parent.name.text === 'convertKey'
          && ts.isCallExpression(node.parent.parent)
          && node.parent.parent.expression === node.parent;
        const isReviewedCryptoFactoryCall =
          restricted.moduleSpecifier === 'node:crypto'
          && restricted.binding === 'createHash'
          && isReviewedSha256DigestCall(node);
        const isReviewedDirectCall =
          restricted.moduleSpecifier !== 'node:crypto'
          && ts.isCallExpression(node.parent)
          && node.parent.expression === node;
        const isReviewedStateTrackerConstruction =
          sourceLayer === 'apps'
          && restricted.binding === 'StateTracker'
          && ts.isNewExpression(node.parent)
          && node.parent.expression === node;
        if (
          !isReviewedEcdhCall
          && !isReviewedCryptoFactoryCall
          && !isReviewedDirectCall
          && !isReviewedStateTrackerConstruction
        ) {
          addViolation(
            node,
            `restricted capability binding must not escape its reviewed call: ${restricted.moduleSpecifier}#${restricted.binding}`,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function createLayerProgram(
  normalizedFiles: ReadonlyMap<string, string>,
): {
  checker: ts.TypeChecker;
  sourceFile(file: string): ts.SourceFile;
} {
  const virtualRoot = '/bridge-layer-source';
  const virtualFiles = new Map(
    [...normalizedFiles].map(([file, source]) => [
      path.posix.join(virtualRoot, file),
      source,
    ]),
  );
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.ES2022,
  };
  const baseHost = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: fileName => virtualFiles.has(normalizeSourcePath(fileName)),
    getCurrentDirectory: () => virtualRoot,
    getSourceFile: (fileName, languageVersion) => {
      const normalized = normalizeSourcePath(fileName);
      const source = virtualFiles.get(normalized);
      if (source === undefined) return undefined;
      return ts.createSourceFile(
        normalized,
        source,
        languageVersion,
        true,
        normalized.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
    },
    readFile: fileName => virtualFiles.get(normalizeSourcePath(fileName)),
    writeFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [...virtualFiles.keys()],
    options,
    host,
  });
  const checker = program.getTypeChecker();

  return {
    checker,
    sourceFile(file: string): ts.SourceFile {
      const virtualFile = path.posix.join(virtualRoot, file);
      const sourceFile = program.getSourceFile(virtualFile);
      if (!sourceFile) {
        throw new Error(`layer import checker did not load source file: ${file}`);
      }
      return sourceFile;
    },
  };
}

function resolveRelativeImport(
  importer: string,
  importSpecifier: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  const unresolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), importSpecifier),
  );
  const extension = path.posix.extname(unresolved).toLowerCase();
  const stem = extension.length === 0
    ? unresolved
    : unresolved.slice(0, -extension.length);
  const candidates = [unresolved];

  if (extension === '.js') {
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  } else if (extension === '.mjs') {
    candidates.push(`${stem}.mts`);
  } else if (extension === '.cjs') {
    candidates.push(`${stem}.cts`);
  } else if (extension.length === 0) {
    candidates.push(
      `${stem}.ts`,
      `${stem}.tsx`,
      `${stem}.mts`,
      `${stem}.cts`,
      path.posix.join(stem, 'index.ts'),
      path.posix.join(stem, 'index.tsx'),
      path.posix.join(stem, 'index.mts'),
      path.posix.join(stem, 'index.cts'),
    );
  }

  return candidates.find(candidate => knownFiles.has(candidate)) ?? null;
}

function canonicalCycle(cycle: readonly string[]): string {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => [
    ...nodes.slice(index),
    ...nodes.slice(0, index),
  ]);
  rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
  const first = rotations[0];
  return [...first, first[0]].join(' -> ');
}

function detectLayerCycles(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): LayerImportViolation[] {
  const violations: LayerImportViolation[] = [];
  const seenCycles = new Set<string>();
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  const visit = (file: string): void => {
    visited.add(file);
    active.add(file);
    stack.push(file);

    for (const dependency of adjacency.get(file) ?? []) {
      if (!visited.has(dependency)) {
        visit(dependency);
      } else if (active.has(dependency)) {
        const start = stack.lastIndexOf(dependency);
        const cycle = [...stack.slice(start), dependency];
        const canonical = canonicalCycle(cycle);
        if (!seenCycles.has(canonical)) {
          seenCycles.add(canonical);
          violations.push({
            file,
            line: 1,
            importSpecifier: null,
            message: `layered module cycle: ${canonical}`,
          });
        }
      }
    }

    stack.pop();
    active.delete(file);
  };

  for (const file of [...adjacency.keys()].sort()) {
    if (!visited.has(file)) visit(file);
  }
  return violations;
}

export function inspectLayerImports(
  inputFiles: readonly LayerSourceFile[],
): LayerImportViolation[] {
  const normalizedFiles = new Map<string, string>();
  for (const file of inputFiles) {
    const normalized = normalizeSourcePath(file.path);
    if (normalizedFiles.has(normalized)) {
      throw new Error(`duplicate source path in layer import check: ${normalized}`);
    }
    normalizedFiles.set(normalized, file.source);
  }

  const knownFiles = new Set(normalizedFiles.keys());
  const layerProgram = createLayerProgram(normalizedFiles);
  const adjacency = new Map<string, Set<string>>();
  const violations: LayerImportViolation[] = [];

  for (const [file, source] of normalizedFiles) {
    const sourceLayer = classifyBridgeLayer(file);
    if (sourceLayer === null) continue;

    adjacency.set(file, new Set());
    const parsed = layerProgram.sourceFile(file);
    if (
      sourceLayer === 'ergo-settlement-core'
      || sourceLayer === 'relayer-core'
      || sourceLayer === 'profiles'
    ) {
      violations.push(...collectCapabilityRestrictedLayerViolations(
        file,
        parsed,
        layerProgram.checker,
        sourceLayer,
      ));
    } else if (sourceLayer === 'apps') {
      const restrictedBindings =
        REVIEWED_APP_CAPABILITY_IMPORT_BINDINGS.get(file);
      if (restrictedBindings) {
        violations.push(...collectCapabilityRestrictedLayerViolations(
          file,
          parsed,
          layerProgram.checker,
          sourceLayer,
          restrictedBindings,
        ));
      }
      const allowedExports = REVIEWED_APP_PUBLIC_EXPORT_BINDINGS.get(file);
      if (allowedExports) {
        violations.push(...collectReviewedAppExportViolations(
          file,
          parsed,
          allowedExports,
        ));
      }
    }

    for (const imported of collectModuleSpecifiers(parsed)) {
      violations.push(...inspectFileRestrictedImportBindings(file, imported));

      if (imported.value === null) {
        violations.push({
          file,
          line: imported.line,
          importSpecifier: null,
          message: 'layered modules require a static string import target',
        });
        continue;
      }

      if (!imported.value.startsWith('.')) {
        const bareLayer = classifyBridgeLayer(imported.value);
        if (bareLayer !== null) {
          violations.push({
            file,
            line: imported.line,
            importSpecifier: imported.value,
            message:
              `layer imports must be relative and resolve inside the checked source tree: ${imported.value}`,
          });
          continue;
        }
        if (
          (
            sourceLayer === 'ergo-settlement-core'
            || sourceLayer === 'relayer-core'
            || sourceLayer === 'profiles'
          )
          && !CAPABILITY_RESTRICTED_LAYER_EXTERNAL_IMPORTS[sourceLayer].has(imported.value)
          && !CAPABILITY_RESTRICTED_FILE_IMPORT_BINDINGS.get(file)?.has(imported.value)
        ) {
          violations.push({
            file,
            line: imported.line,
            importSpecifier: imported.value,
            message:
              `${sourceLayer} external import is not allowlisted: ${imported.value}`,
          });
        }
        continue;
      }

      const resolved = resolveRelativeImport(file, imported.value, knownFiles);
      if (resolved === null) {
        if (
          (
            sourceLayer === 'ergo-settlement-core'
            || sourceLayer === 'relayer-core'
            || sourceLayer === 'profiles'
          )
          && CAPABILITY_RESTRICTED_FILE_IMPORT_BINDINGS.get(file)?.has(imported.value)
        ) {
          continue;
        }
        violations.push({
          file,
          line: imported.line,
          importSpecifier: imported.value,
          message: `relative import does not resolve inside the checked source tree: ${imported.value}`,
        });
        continue;
      }

      const targetLayer = classifyBridgeLayer(resolved);
      if (targetLayer === null) {
        if (
          sourceLayer === 'apps'
          && REVIEWED_APP_LEGACY_COMPOSITION_SEAMS.get(file)?.has(resolved)
        ) {
          const allowedBindings =
            REVIEWED_APP_LEGACY_COMPOSITION_IMPORT_BINDINGS
              .get(file)
              ?.get(resolved);
          if (allowedBindings) {
            violations.push(...inspectRestrictedImportBindings(
              file,
              imported,
              allowedBindings,
            ));
          }
          continue;
        }
        violations.push({
          file,
          line: imported.line,
          importSpecifier: imported.value,
          message:
            `${sourceLayer} must not import an unclassified legacy module: ${resolved}`,
        });
        continue;
      }

      if (!ALLOWED_LAYER_DEPENDENCIES[sourceLayer].has(targetLayer)) {
        violations.push({
          file,
          line: imported.line,
          importSpecifier: imported.value,
          message: `${sourceLayer} must not depend on ${targetLayer}`,
        });
        continue;
      }

      adjacency.get(file)?.add(resolved);
    }
  }

  violations.push(...detectLayerCycles(adjacency));
  return violations.sort((left, right) =>
    left.file.localeCompare(right.file)
      || left.line - right.line
      || left.message.localeCompare(right.message),
  );
}
