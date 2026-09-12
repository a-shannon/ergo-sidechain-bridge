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

// Hand-reviewed V2 legacy bindings feed the three existing checks below. This
// table is static: new source imports never expand the reviewed authority set.
const REVIEWED_TRACKER_V2_APP_LEGACY_IMPORT_BINDINGS: ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
> = new Map([
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-managed-setup-v2.ts',
    new Map([
      ['state-tracker.ts', new Set(['StateTracker'])],
      ['strict-json.ts', new Set(['sha256CanonicalJson'])],
      ['peg-in-causal-admission-v2.ts', new Set(['PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION'])],
      ['substrate-federated-settlement-family-v1.ts', new Set([
        'decodeSubstrateFederatedSettlementFamilyV1Profile',
      ])],
      ['substrate-federated-authority-safe-devnet-history-v1.ts', new Set([
        'collectSubstrateFederatedAuthoritySafeDevnetHistoryV1',
      ])],
      ['substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts', new Set([
        'collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2',
      ])],
      ['substrate-federated-isolated-devnet-reward-input-discovery-v1.ts', new Set([
        'assertSubstrateFederatedRewardInputDiscoveryV2Provenance',
        'discoverSubstrateFederatedRewardInputsV2',
      ])],
      ['substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.ts', new Set([
        'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1',
      ])],
      ['substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts', new Set([
        'RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input',
      ])],
      ['substrate-federated-isolated-devnet-setup-check-runner-v2.ts', new Set([
        'SubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
      ])],
      ['substrate-federated-isolated-devnet-ergo-node-process-v1.ts', new Set([
        'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1',
        'SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1',
      ])],
      ['substrate-federated-isolated-devnet-packet-producer-v1.ts', new Set([
        'assertSubstrateFederatedIsolatedDevnetPacketV3Provenance',
        'ProduceSubstrateFederatedIsolatedDevnetPacketV1Input',
      ])],
      ['substrate-federated-isolated-devnet-portable-replay-v1.ts', new Set([
        'takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2',
      ])],
      ['substrate-federated-isolated-devnet-setup-check-execution-v2.ts', new Set([
        'assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3',
        'getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3',
        'promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
        'promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1',
      ])],
      ['substrate-federated-isolated-devnet-peg-in-candidate-v2.ts', new Set([
        'buildSubstrateFederatedIsolatedDevnetPegInCandidateV2',
        'assertSubstrateFederatedIsolatedDevnetPegInCandidateV2',
      ])],
      ['substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.ts', new Set([
        'createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV2',
      ])],
      ['substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.ts', new Set([
        'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV2',
      ])],
      ['substrate-federated-isolated-devnet-checked-submission-transport-v1.ts', new Set([
        'createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1',
        'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1',
        'projectSubstrateFederatedIsolatedDevnetCheckedSubmissionDiagnostic',
      ])],
      ['substrate-federated-local-devnet-peg-in-source-lock-journal-v1.ts', new Set([
        'createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1',
      ])],
      ['substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.ts', new Set([
        'createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1',
      ])],
      ['substrate-federated-local-devnet-genesis-journal-v1.ts', new Set([
        'createSubstrateFederatedLocalDevnetGenesisJournalV1',
      ])],
      ['substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts', new Set([
        'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
      ])],
      ['substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.ts', new Set([
        'observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV2',
        'assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2',
      ])],
      ['substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.ts', new Set([
        'observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV2',
        'assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2',
      ])],
      ['substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.ts', new Set([
        'buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2',
      ])],
      ['substrate-federated-isolated-devnet-committed-reserve-evidence-v1.ts', new Set([
        'collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV2',
      ])],
      ['substrate-federated-isolated-devnet-source-attestation-session-v1.ts', new Set([
        'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2',
        'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2',
      ])],
      ['unsigned-ergo-transaction.ts', new Set([
        'materializeUnsignedTransaction',
        'Eip12UnsignedTransaction',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
    new Map([
      ['substrate-federated-isolated-devnet-ergo-node-build-v1.ts', new Set([
        'buildSubstrateFederatedIsolatedDevnetErgoNodeV1',
      ])],
      ['substrate-federated-isolated-devnet-ergo-node-process-v1.ts', new Set([
        'createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1',
      ])],
      ['substrate-federated-isolated-devnet-setup-check-runner-v2.ts', new Set([
        'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
        'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
      ])],
      ['substrate-federated-isolated-devnet-mining-credential-v1.ts', new Set([
        'revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1',
      ])],
      ['substrate-federated-isolated-devnet-reward-input-discovery-v1.ts', new Set([
        'SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN',
        'SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN',
      ])],
      ['substrate-federated-isolated-devnet-frontier-lab-application-v1.ts', new Set([
        'assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1',
      ])],
      ['substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.ts', new Set([
        'observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1',
        'assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
        'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2',
        'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2',
      ])],
      ['bridge-validity-tracker-header-context-v1.ts', new Set([
        'buildBridgeValidityTrackerObservedHeaderContextV1',
      ])],
      ['substrate-federated-tracker-v2.ts', new Set([
        'buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context',
      ])],
      ['substrate-federated-tracker-v2-external-fee.ts', new Set([
        'buildSubstrateFederatedTrackerV2ExternalFeeTransaction',
      ])],
      ['substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.ts', new Set([
        'authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission',
        'reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission',
        'revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission',
        'confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission',
      ])],
      ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.ts', new Set([
        'authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2',
        'reserveSubstrateFederatedIsolatedDevnetWithdrawalV2',
        'confirmSubstrateFederatedIsolatedDevnetWithdrawalV2',
      ])],
      ['substrate-federated-isolated-devnet-checked-submission-transport-v1.ts', new Set([
        'submitSubstrateFederatedIsolatedDevnetTrackerV2Admission',
        'finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission',
        'submitSubstrateFederatedIsolatedDevnetWithdrawalV2',
        'finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2',
      ])],
      ['substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts', new Set([
        'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
      ])],
      ['substrate-federated-settlement-family-v1.ts', new Set([
        'decodeSubstrateFederatedSettlementFamilyV1Profile',
      ])],
      ['state-tracker.ts', new Set(['StateTracker'])],
    ]),
  ],
]);

const FEDERATED_GENESIS_TARGET_ROOT =
  'apps/bridge-daemon/substrate-federated-genesis-target-root-v1.ts';
const FEDERATED_GENESIS_OPERATOR = 'adapters/federated-genesis-operator-v1.ts';
const FEDERATED_NATIVE_RESERVATION_SIGNING = 'apps/bridge-daemon/frontier-native-proof-bound-reservation-signing-v1.ts';
const FEDERATED_GENESIS_TARGET_OBSERVATION = 'adapters/federated-genesis-target-observation-v1.ts';
const FEDERATED_NATIVE_RESERVATION_EXECUTION = 'adapters/federated-native-reservation-execution-v1.ts';
const REVIEWED_NATIVE_RESERVATION_SIGNING_BINDINGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['validity-application-pooled-reserve-mint-reservation-v4.ts', new Set(['decodeValidityApplicationPooledReserveMintReservationStatementV4Hex'])],
  ['peg-in-causal-admission-v2.ts', new Set(['decodePegInSourceIntentV2Hex'])],
  ['federated-native-mint-runtime-state-v1.ts', new Set(['encodeFederatedNativeMintConsumedV4ScaleHex', 'encodeFederatedNativeMintExtrinsicV1Hex'])],
  ['pooled-reserve-mint-reservation-runtime-state-v4.ts', new Set([
    'derivePooledReserveMintReservationRuntimeStorageKeysV4', 'encodePooledReserveMintReservationPendingV4ScaleHex',
  ])],
  ['substrate-federated-authority-safe-devnet-process-v1.ts', new Set([
    'assertOwnedFederatedGenesisDevnetTargetV1', 'OwnedFederatedGenesisDevnetTargetV1',
  ])],
  ['substrate-federated-isolated-devnet-source-attestation-session-v1.ts', new Set([
    'assertSubstrateFederatedNativeGenesisMintSourceProofReceiptV1',
    'produceSubstrateFederatedNativeGenesisCheckpointAttestationV1',
    'assertSubstrateFederatedNativeGenesisCheckpointAttestationV1',
    'SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2', 'SubstrateFederatedNativeGenesisMintSourceProofReceiptV1',
  ])],
  ['substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.ts', new Set(['SubstrateFederatedNativeGenesisPegInMintReservationDraftV1'])],
  ['substrate-federated-observed-genesis-v1.ts', new Set(['assertObservedSubstrateFederatedGenesisV1', 'ObservedSubstrateFederatedGenesisV1'])],
  ['substrate-federated-isolated-devnet-ergo-node-process-v1.ts', new Set(['SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1'])],
]);
const REVIEWED_NATIVE_RESERVATION_IMPORT_BINDINGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['blakejs', new Set(['blake2b'])],
  ['ethers', new Set(['computeAddress'])],
  ['../../adapters/federated-native-reservation-execution-v1.js', new Set([
    'reserveFederatedNativeReservationAttemptV1', 'submitFederatedNativeReservationV1',
    'sealFederatedNativeReservationV1', 'observeFederatedNativeReservationInclusionV1',
    'observeFederatedNativeMintParentV1', 'reserveFederatedNativeMintAttemptV1', 'submitFederatedNativeMintV1',
    'sealFederatedNativeMintV1', 'observeFederatedNativeMintInclusionV1', 'observeFederatedNativeMintStateV1',
    'observeFederatedNativeWithdrawalParentV1', 'reserveFederatedNativeWithdrawalAttemptV1',
    'submitFederatedNativeWithdrawalV1', 'sealFederatedNativeWithdrawalV1', 'observeFederatedNativeWithdrawalInclusionV1',
    'collectFederatedNativeBurnCommitmentV1',
  ])],
  ['../../adapters/federated-genesis-target-observation-v1.js', new Set(['observeFederatedGenesisReservationTargetV1'])],
  ...[...REVIEWED_NATIVE_RESERVATION_SIGNING_BINDINGS].map(
    ([target, bindings]) => [`../../${target.replace(/\.ts$/, '.js')}`, bindings] as const,
  ),
  ['../../adapters/federated-genesis-operator-v1.js', new Set([
    'assertFederatedGenesisOperatorV1', 'signFederatedGenesisReservationV1', 'signFederatedGenesisMintV1', 'FederatedGenesisOperatorV1',
    'signFederatedGenesisApproveV1', 'signFederatedGenesisBurnV1',
  ])],
]);

// Exact source-reviewed bindings, never inferred from the root's source imports.
const REVIEWED_FEDERATED_GENESIS_LEGACY_BINDINGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['authenticated-spv-tracker-read-only-node-client.ts', new Set(['createBoundedAuthenticatedSpvTrackerReadOnlySource'])],
  ['state-tracker.ts', new Set(['StateTracker'])],
  ['unsigned-ergo-transaction.ts', new Set(['normalizeEip12Box', 'Eip12Box'])],
  ['substrate-federated-isolated-devnet-setup-check-execution-v2.ts', new Set([
    'assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1', 'assertSubstrateFederatedNativeGenesisSetupReadCustodyV1',
    'SubstrateFederatedNativeGenesisSetupExecutionBatchV1',
  ])],
  ['substrate-federated-isolated-devnet-mining-credential-v1.ts', new Set([
    'revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1', 'SubstrateFederatedIsolatedDevnetMiningCredentialV1',
  ])],
  ['substrate-federated-pooled-reserve-deposit-v2.ts', new Set(['SubstrateFederatedPooledReserveDepositV2Packet'])],
  ['trustless-burn-proof.ts', new Set(['TrustlessBurnInclusionProof'])],
  ['substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.ts', new Set([
    'observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1', 'assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
    'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2', 'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2',
  ])],
  ['bridge-validity-tracker-header-context-v1.ts', new Set(['buildBridgeValidityTrackerObservedHeaderContextV1'])],
  ['substrate-federated-tracker-v2.ts', new Set(['buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context'])],
  ['substrate-federated-tracker-v2-external-fee.ts', new Set(['buildSubstrateFederatedTrackerV2ExternalFeeTransaction'])],
  ['substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.ts', new Set([
    'authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission', 'reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission',
    'revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission', 'confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission',
  ])],
  ['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.ts', new Set([
    'authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2', 'reserveSubstrateFederatedIsolatedDevnetWithdrawalV2',
    'confirmSubstrateFederatedIsolatedDevnetWithdrawalV2',
  ])],
  ['substrate-federated-isolated-devnet-checked-submission-transport-v1.ts', new Set([
    'submitSubstrateFederatedIsolatedDevnetTrackerV2Admission', 'finalizeSubstrateFederatedIsolatedDevnetTrackerV2Admission',
    'submitSubstrateFederatedIsolatedDevnetWithdrawalV2', 'finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2',
  ])],
  ['substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts', new Set(['createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1'])],
  ['native-executable-pin.ts', new Set(['verifyExecutableSha256'])],
  ['pinned-local-native-verifier-build.ts', new Set(['runBoundedProcess'])],
  ['substrate-federated-authority-safe-devnet-build-environment-v1.ts', new Set([
    'buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1',
  ])],
  ['substrate-federated-authority-safe-devnet-process-v1.ts', new Set([
    'withOwnedFederatedGenesisDevnetProcessesV1', 'assertOwnedFederatedGenesisDevnetTargetV1',
  ])],
  ['substrate-federated-genesis-node-build-v1.ts', new Set([
    'buildSubstrateFederatedGenesisNodeV1', 'BuildSubstrateFederatedGenesisNodeV1Input',
  ])],
  ['substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts', new Set([
    'collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2',
  ])],
  ['substrate-federated-isolated-devnet-ergo-node-build-v1.ts', new Set([
    'buildSubstrateFederatedIsolatedDevnetErgoNodeV1', 'BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input',
  ])],
  ['substrate-federated-isolated-devnet-ergo-node-process-v1.ts', new Set([
    'createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2',
    'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1',
    'SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2',
  ])],
  ['substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.ts', new Set([
    'discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1',
    'assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1',
  ])],
  ['substrate-federated-isolated-devnet-setup-check-runner-v2.ts', new Set([
    'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
    'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
    'SubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
  ])],
  ['substrate-federated-isolated-devnet-setup-check-signer-binding-v2.ts', new Set([
    'assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance',
  ])],
  ['substrate-federated-isolated-devnet-source-attestation-session-v1.ts', new Set([
    'createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2',
    'readSubstrateFederatedGenesisProfilesFromSessionV2',
    'SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2',
    'SubstrateFederatedNativeGenesisCheckpointAttestationReceiptV1',
    'produceSubstrateFederatedNativeGenesisMintSourceProofV1',
  ])],
  ['substrate-federated-observed-genesis-v1.ts', new Set(['compileObservedSubstrateFederatedGenesisV1', 'ObservedSubstrateFederatedGenesisV1'])],
  ['substrate-federated-isolated-devnet-peg-in-candidate-v2.ts', new Set(['buildSubstrateFederatedNativeGenesisPegInPacketV1'])],
  ['substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.ts', new Set(['buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1'])],
  ['substrate-federated-isolated-devnet-committed-reserve-evidence-v1.ts', new Set(['collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1'])],
]);
const REVIEWED_FEDERATED_GENESIS_IMPORT_BINDINGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ...[...REVIEWED_FEDERATED_GENESIS_LEGACY_BINDINGS].map(
    ([target, bindings]) => [`../../${target.replace(/\.ts$/, '.js')}`, bindings] as const,
  ),
  ['../../adapters/federated-genesis-operator-v1.js', new Set([
    'createFederatedGenesisOperatorV1', 'assertFederatedGenesisOperatorV1', 'disposeFederatedGenesisOperatorV1',
    'FederatedGenesisOperatorV1',
  ])],
  ['../../adapters/federated-genesis-target-observation-v1.js', new Set([
    'observeFederatedGenesisTargetsV1',
  ])],
  ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', new Set([
    'executeSubstrateFederatedNativeGenesisBatchV1', 'executeSubstrateFederatedNativeGenesisPegInSourceLockV1',
    'executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1',
    'executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
    'executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1', 'waitForCanonicalConfirmation',
  ])],
  ['./frontier-native-proof-bound-reservation-signing-v1.js', new Set([
    'executeFrontierNativeProofBoundReservationMintAndBurnV1', 'attestFrontierNativeBurnCheckpointV1', 'assertFrontierNativeBurnCheckpointV1',
  ])],
  ['../../ergo-settlement-core/strict-json.js', new Set(['assertNoDuplicateJsonKeys', 'canonicalJson'])],
  ['node:crypto', new Set(['createHash'])],
  ['node:fs', new Set(['mkdirSync', 'mkdtempSync', 'readFileSync', 'realpathSync', 'writeFileSync'])],
  ['node:path', new Set(['join'])],
]);

// Gate 5 may compose these reviewed legacy producers before WP-08A extracts
// them. The seam is exact by source and target; capability-bearing targets may
// additionally restrict imported bindings. It grants no general app escape.
const REVIEWED_APP_LEGACY_COMPOSITION_SEAMS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  [FEDERATED_NATIVE_RESERVATION_SIGNING, new Set(REVIEWED_NATIVE_RESERVATION_SIGNING_BINDINGS.keys())],
  [FEDERATED_GENESIS_TARGET_ROOT, new Set(REVIEWED_FEDERATED_GENESIS_LEGACY_BINDINGS.keys())],
  ...[...REVIEWED_TRACKER_V2_APP_LEGACY_IMPORT_BINDINGS].map(
    ([file, bindings]) => [file, new Set(bindings.keys())] as const,
  ),
  [
    'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts',
    new Set([
      'substrate-federated-isolated-devnet-frontier-application-transactions-v1.ts',
      'substrate-federated-isolated-devnet-packet-producer-v1.ts',
    ]),
  ],
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
      'bridge-repository-layout.ts',
      'bridge-validity-tracker-header-context-v1.ts',
      'peg-in-causal-admission-v2.ts',
      'state-tracker.ts',
      'substrate-federated-authority-safe-devnet-history-v1.ts',
      'substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts',
      'substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts',
      'substrate-federated-isolated-devnet-ergo-node-build-v1.ts',
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
      'substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.ts',
      'substrate-federated-isolated-devnet-packet-producer-v1.ts',
      'substrate-federated-isolated-devnet-committed-reserve-evidence-v1.ts',
      'substrate-federated-isolated-devnet-frontier-lab-application-v1.ts',
      'substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.ts',
      'substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.ts',
      'substrate-federated-isolated-devnet-source-attestation-session-v1.ts',
      'substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.ts',
      'substrate-federated-isolated-devnet-reward-input-discovery-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
      'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts',
      'substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.ts',
      'substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.ts',
      'substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts',
      'substrate-federated-isolated-devnet-genesis-revalidator-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-candidate-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-candidate-v2.ts',
      'substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.ts',
      'substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.ts',
      'substrate-federated-local-devnet-genesis-journal-v1.ts',
      'substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.ts',
      'substrate-federated-local-devnet-peg-in-source-lock-journal-v1.ts',
      'substrate-federated-settlement-family-v1.ts',
      'substrate-federated-tracker-v1.ts',
      'unsigned-ergo-transaction.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.ts',
    new Set([
      'substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
    new Set([
      'substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.ts',
      'substrate-federated-isolated-devnet-packet-producer-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
      'substrate-federated-isolated-devnet-setup-check-signer-binding-v2.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-admission-reservation-authorization-v1.ts',
    new Set(['state-tracker.ts']),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts',
    new Set([
      'fleet-signer.ts',
      'state-tracker.ts',
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
      'substrate-federated-isolated-devnet-packet-producer-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts',
    new Set([
      'fleet-signer.ts',
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts',
      'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
      'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
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
  [FEDERATED_NATIVE_RESERVATION_SIGNING, REVIEWED_NATIVE_RESERVATION_SIGNING_BINDINGS],
  [FEDERATED_GENESIS_TARGET_ROOT, REVIEWED_FEDERATED_GENESIS_LEGACY_BINDINGS],
  ...REVIEWED_TRACKER_V2_APP_LEGACY_IMPORT_BINDINGS,
  [
    'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts',
    new Map([
      ['substrate-federated-isolated-devnet-frontier-application-transactions-v1.ts', new Set([
        'buildFrontierLabApplicationTransactionPlanV1',
        'inspectFrontierLabApplicationSignedTransactionsV1',
      ])],
      ['substrate-federated-isolated-devnet-packet-producer-v1.ts', new Set([
        'assertSubstrateFederatedIsolatedDevnetPacketV2Provenance',
        'assertSubstrateFederatedIsolatedDevnetPacketV3Provenance',
        'assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance',
        'SubstrateFederatedIsolatedDevnetPacketV2',
        'SubstrateFederatedIsolatedDevnetPacketV3',
        'SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.ts',
    new Map([
      [
        'substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
          'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2',
          'SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
          'SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2',
          'SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-admission-reservation-authorization-v1.ts',
    new Map([
      [
        'state-tracker.ts',
        new Set([
          'assertReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance',
          'ReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Input',
          'ReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result',
          'substrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationDigestHexV1',
          'substrateFederatedIsolatedDevnetTrackerAdmissionPersistenceStoreIdentityHexV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_V1_SCHEMA',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts',
    new Map([
      [
        'fleet-signer.ts',
        new Set(['projectLocalWasmSignedCheckInputBoxIdsV1']),
      ],
      [
        'state-tracker.ts',
        new Set([
          'ReserveSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1Result',
          'StateTracker',
          'SubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1',
          'substrateFederatedIsolatedDevnetTrackerAdmissionPersistenceStoreIdentityHexV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2',
          'SubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetBindingV1',
          'SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-packet-producer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
          'consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
          'SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1',
          'SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts',
    new Map([
      [
        'fleet-signer.ts',
        new Set([
          'assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding',
          'assertLocalWasmCheckedSubmissionHandleV1Provenance',
          'assertLocalWasmSignedCheckCandidateProvenance',
          'consumeLocalWasmCheckedSubmissionHandleV1',
          'LocalWasmCheckedSubmissionHandleV1',
          'LocalWasmExactBytesSignedCheckCandidate',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2',
          'SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1',
          'SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1',
          'SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Map([
      [
        'bridge-repository-layout.ts',
        new Set(['resolveBridgeRepositoryRootsFromCheckoutLayout']),
      ],
      [
        'bridge-validity-tracker-header-context-v1.ts',
        new Set([
          'BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE',
          'BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE',
          'buildBridgeValidityTrackerObservedHeaderContextV1',
        ]),
      ],
      [
        'peg-in-causal-admission-v2.ts',
        new Set(['PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION']),
      ],
      [
        'state-tracker.ts',
        new Set([
          'assertReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance',
          'ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result',
          'StateTracker',
        ]),
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
          'projectSubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseFailureV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA',
          'SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV1Receipt',
          'SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionV2Receipt',
          'SubstrateFederatedIsolatedDevnetCheckpointMiningV1Receipt',
          'SubstrateFederatedIsolatedDevnetErgoNodeExecutionV1Receipt',
          'SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2',
          'SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1',
          'SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt',
          'SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV2Receipt',
          'SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV2Receipt',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
          'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1',
          'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2',
          'assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1',
          'observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1',
          'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1',
          'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2',
          'observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA',
          'SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
          'SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1',
          'SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2',
          'SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts',
        new Set(['collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2']),
      ],
      [
        'substrate-federated-isolated-devnet-packet-producer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPacketV2Provenance',
          'claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
          'createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2',
          'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
          'ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input',
          'ProduceSubstrateFederatedIsolatedDevnetPacketV1Input',
          'SubstrateFederatedIsolatedDevnetPacketContinuationSessionV2',
          'SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2',
          'SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
          'SubstrateFederatedIsolatedDevnetPacketSessionV1',
          'SubstrateFederatedIsolatedDevnetPacketV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-committed-reserve-evidence-v1.ts',
        new Set([
          'collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1',
          'SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-frontier-lab-application-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance',
          'preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2',
          'runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2',
          'SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2',
          'SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.ts',
        new Set([
          'buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1',
          'SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-source-attestation-session-v1.ts',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2',
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
          'claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2',
          'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
          'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2',
          'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
          'SubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
          'SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        new Set([
          'SubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1Receipt',
          'SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1',
          'SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1Receipt',
          'SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt',
          'SubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1Receipt',
          'SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1',
          'SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2',
          'SubstrateFederatedIsolatedDevnetSetupExecutionBatchV2',
          'SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3',
          'SubstrateFederatedNativeGenesisSetupExecutionBatchV1',
          'assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1',
          'SubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1',
          'SubstrateFederatedIsolatedDevnetSetupExecutionTransactionV2',
          'SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt',
          'assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3',
          'assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1',
          'assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2',
          'assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
          'claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1',
          'discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
          'discardSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA',
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
      ['substrate-federated-isolated-devnet-peg-in-candidate-v2.ts', new Set([
        'assertSubstrateFederatedNativeGenesisPegInPacketV1',
      ])],
      [
        'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts',
        new Set([
          'createSubstrateFederatedNativeGenesisCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2',
          'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1',
          'submitSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1',
          'finalizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1',
          'submitSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
          'finalizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.ts',
        new Set([
          'authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1',
          'reserveSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1',
          'confirmSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1',
          'authorizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
          'reserveSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
          'confirmSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
          'SubstrateFederatedIsolatedDevnetTrackerFeeFundingJournalV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1',
          'createSubstrateFederatedNativeGenesisPegInCommittedVaultAuthorizationSessionV1',
          'SubstrateFederatedIsolatedDevnetPegInCommittedVaultPreTransportObservationV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1',
          'observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1',
          'assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1',
          'observeSubstrateFederatedNativeGenesisPegInCommittedVaultOutputsV1',
          'SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1',
          'createSubstrateFederatedNativeGenesisPegInSourceLockBroadcastAuthorizerV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1',
          'observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1',
          'SubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1',
          'observeSubstrateFederatedNativeGenesisPegInSourceLockOutputsV1',
          'assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.ts',
        new Set([
          'assertSubstrateFederatedNativeGenesisSetupConfirmedV1',
          'createSubstrateFederatedNativeGenesisBroadcastAuthorizerV1',
          'SubstrateFederatedNativeGenesisBroadcastAuthorizerV1',
          'assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1',
          'assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV2',
          'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
          'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2',
          'SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
          'SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.ts',
        new Set([
          'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1',
          'SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-genesis-revalidator-v1.ts',
        new Set(['createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1',
          'createSubstrateFederatedNativeGenesisRevalidatorV1',
          'createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV2']),
      ],
      [
        'substrate-federated-local-devnet-genesis-journal-v1.ts',
        new Set([
          'createSubstrateFederatedLocalDevnetGenesisJournalV1',
          'SubstrateFederatedLocalDevnetGenesisJournalV1',
          'SubstrateFederatedLocalDevnetGenesisJournalStateV1',
        ]),
      ],
      [
        'substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.ts',
        new Set([
          'createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1',
          'SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1',
        ]),
      ],
      [
        'substrate-federated-local-devnet-peg-in-source-lock-journal-v1.ts',
        new Set([
          'createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1',
          'SubstrateFederatedLocalDevnetPegInSourceLockJournalStateV1',
        ]),
      ],
      [
        'substrate-federated-settlement-family-v1.ts',
        new Set(['decodeSubstrateFederatedSettlementFamilyV1Profile']),
      ],
      [
        'substrate-federated-tracker-v1.ts',
        new Set([
          'assertSubstrateFederatedTrackerV1Context',
          'buildCompilerBoundSubstrateFederatedTrackerV1Context',
          'buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context',
          'SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA',
          'SubstrateFederatedTrackerV1Context',
        ]),
      ],
      [
        'unsigned-ergo-transaction.ts',
        new Set([
          'Eip12Box',
          'Eip12UnsignedTransaction',
          'materializeUnsignedTransaction',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
    new Map([
      [
        'substrate-federated-isolated-devnet-packet-producer-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance',
          'assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance',
          'assertSubstrateFederatedIsolatedDevnetPacketV2Provenance',
          'assertSubstrateFederatedIsolatedDevnetPacketV3Provenance',
          'createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3',
          'createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV4',
          'ProduceSubstrateFederatedIsolatedDevnetPacketMintSourceProofV2Input',
          'ProduceSubstrateFederatedIsolatedDevnetPacketV1Input',
          'SubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3',
          'SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2',
          'SubstrateFederatedIsolatedDevnetPacketSignerBindingV1',
          'SubstrateFederatedIsolatedDevnetPacketV2',
          'SubstrateFederatedIsolatedDevnetPacketV3',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance',
          'assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance',
          'preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1',
          'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2',
          'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV3',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_RUNNER_COMPLETION_BUDGET_MS_V1',
          'RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2Input',
          'SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2',
          'SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
        new Set([
          'SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2',
        ]),
      ],
      [
        'substrate-federated-isolated-devnet-setup-check-signer-binding-v2.ts',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance',
        ]),
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
  [FEDERATED_NATIVE_RESERVATION_SIGNING, REVIEWED_NATIVE_RESERVATION_IMPORT_BINDINGS],
  [FEDERATED_GENESIS_TARGET_ROOT, REVIEWED_FEDERATED_GENESIS_IMPORT_BINDINGS],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-managed-setup-v2.ts',
    new Map([
      ...[...REVIEWED_TRACKER_V2_APP_LEGACY_IMPORT_BINDINGS.get(
        'apps/bridge-daemon/substrate-federated-isolated-devnet-managed-setup-v2.ts',
      )!].map(([target, bindings]) => [`../../${target.replace(/\.ts$/, '.js')}`, bindings] as const),
      ['./ergo-operational-transaction.js', new Set(['runErgoOperationalTransaction'])],
      ['node:util/types', new Set(['isNativeError', 'isProxy'])],
      ['../../relayer-core/ergo-operational-transaction-lifecycle.js', new Set([
        'PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE',
        'SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE',
      ])],
      ['./substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js', new Set([
        'assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance',
        'SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4',
        'SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3',
      ])],
      ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', new Set([
        'executeSubstrateFederatedIsolatedDevnetGenesisBatchV3',
        'executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1',
        'executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
        'waitForCanonicalConfirmation',
        'projectTrackerCanonicalConfirmationFailureDiagnosticV1',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
    new Map([
      ...[...REVIEWED_TRACKER_V2_APP_LEGACY_IMPORT_BINDINGS.get(
        'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
      )!].map(([target, bindings]) => [`../../${target.replace(/\.ts$/, '.js')}`, bindings] as const),
      ['node:fs', new Set(['mkdirSync'])],
      ['node:path', new Set(['join'])],
      ['../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js', new Set([
        'claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
        'consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
      ])],
      ['../../adapters/frontier-lab-application-owner-v1.js', new Set([
        'claimFrontierLabApplicationOwnerRequestV1',
        'disposeFrontierLabApplicationOwnerV1',
      ])],
      ['../../profiles/substrate-federated-v1/checkpoint-statement.js', new Set([
        'buildSubstrateFederatedCheckpointProfileV1',
        'encodeSubstrateFederatedCheckpointExtensionValueV1',
      ])],
      ['../../profiles/substrate-grandpa-v1/trustless-burn-proof.js', new Set([
        'buildTrustlessBurnInclusionProof',
      ])],
      ['./substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js', new Set([
        'createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4',
        'assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance',
      ])],
      ['./substrate-federated-isolated-devnet-managed-setup-v2.js', new Set([
        'executeSubstrateFederatedIsolatedDevnetManagedSetupV2',
      ])],
      ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', new Set([
        'APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS',
        'normalizeTrackerTransportJournalRootV9',
        'assertReservedTrackerTransportJournalRootV9',
        'normalizePegInCandidatePlan',
        'normalizeFrontierApplicationRunnerPlan',
        'waitForCanonicalConfirmation',
        'finalizeReceipt',
        'RunSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Input',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts',
    new Map([
      ['../../adapters/frontier-lab-application-owner-v1.js', new Set([
        'assertFrontierLabApplicationOwnerClaimV1',
        'disposeFrontierLabApplicationOwnerV1',
        'signFrontierLabApplicationCallsOnceV1',
        'FrontierLabApplicationOwnerV1',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts',
    new Map([
      [
        '../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js',
        new Set([
          'consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
          'projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1',
          'SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-packet-producer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
          'consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
          'SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Map([
      [
        '../../state-tracker.js',
        new Set([
          'assertReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance',
          'ReloadSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result',
          'StateTracker',
        ]),
      ],
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
        new Set([
          'createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1',
          'projectSubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseFailureV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA',
          'SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessExecutionV1Receipt',
          'SubstrateFederatedIsolatedDevnetTrackerConfirmationExecutionV2Receipt',
          'SubstrateFederatedIsolatedDevnetTrackerTransportExecutionV2Receipt',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1',
          'assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1',
          'assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1',
          'observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1',
          'observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1',
          'observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1',
          'SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js',
        new Set(['collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2']),
      ],
      [
        '../../substrate-federated-isolated-devnet-packet-producer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPacketV2Provenance',
          'claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
          'createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2',
          'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
          'SubstrateFederatedIsolatedDevnetPacketRelayerLineageV1',
        ]),
      ],
      [
        '../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js',
        new Set([
          'claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
          'SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1',
          'SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js',
        new Set([
          'collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance',
          'preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2',
          'runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2',
        ]),
      ],
      [
        './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance',
          'createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3',
          'preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3',
        ]),
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
          'claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2',
          'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
          'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2',
          'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3',
          'assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1',
          'assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV1',
          'assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
          'claimSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1',
          'discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
          'discardSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1',
          'promoteSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA',
          'SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1Receipt',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js',
        new Set([
          'createSubstrateFederatedNativeGenesisCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2',
          'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1',
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1',
        ]),
      ],
      [
        './substrate-federated-isolated-devnet-tracker-checked-transport-v1.js',
        new Set([
          'submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js',
        new Set([
          'createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1',
          'createSubstrateFederatedNativeGenesisPegInCommittedVaultAuthorizationSessionV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1',
          'observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1',
          'assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1',
          'observeSubstrateFederatedNativeGenesisPegInCommittedVaultOutputsV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js',
        new Set([
          'createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1',
          'createSubstrateFederatedNativeGenesisPegInSourceLockBroadcastAuthorizerV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1',
          'observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1',
          'observeSubstrateFederatedNativeGenesisPegInSourceLockOutputsV1',
          'assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js',
        new Set([
          'assertSubstrateFederatedNativeGenesisSetupConfirmedV1',
          'createSubstrateFederatedNativeGenesisBroadcastAuthorizerV1',
          'assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1',
          'assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV2',
          'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
          'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js',
        new Set([
          'createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-genesis-revalidator-v1.js',
        new Set(['createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1',
          'createSubstrateFederatedNativeGenesisRevalidatorV1',
          'createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV2']),
      ],
      [
        '../../substrate-federated-local-devnet-genesis-journal-v1.js',
        new Set(['createSubstrateFederatedLocalDevnetGenesisJournalV1']),
      ],
      [
        '../../substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js',
        new Set([
          'createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1',
        ]),
      ],
      [
        '../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js',
        new Set([
          'createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1',
        ]),
      ],
      [
        '../../substrate-federated-tracker-v1.js',
        new Set([
          'assertSubstrateFederatedTrackerV1Context',
          'buildCompilerBoundSubstrateFederatedTrackerV1Context',
          'buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context',
        ]),
      ],
      [
        '../../unsigned-ergo-transaction.js',
        new Set(['materializeUnsignedTransaction']),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts',
    new Map([
      [
        '../../fleet-signer.js',
        new Set([
          'assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding',
          'assertLocalWasmCheckedSubmissionHandleV1Provenance',
          'assertLocalWasmSignedCheckCandidateProvenance',
          'consumeLocalWasmCheckedSubmissionHandleV1',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1',
        ]),
      ],
      [
        './substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1',
          'claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
    new Map([
      [
        '../../substrate-federated-isolated-devnet-packet-producer-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance',
          'assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance',
          'assertSubstrateFederatedIsolatedDevnetPacketV2Provenance',
          'assertSubstrateFederatedIsolatedDevnetPacketV3Provenance',
          'createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3',
          'createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV4',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance',
          'assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance',
          'preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1',
          'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2',
          'runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV3',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js',
        new Set([
          'assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance',
        ]),
      ],
      [
        './frontier-lab-proof-bound-application-signing-v1.js',
        new Set(['signFrontierLabProofBoundApplicationV1', 'signFrontierLabProofBoundApplicationV2']),
      ],
    ]),
  ],
]);

const REVIEWED_APP_READ_ONLY_VALUE_BINDINGS: ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
> = new Map([
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-managed-setup-v2.ts',
    new Map([
      ['../../peg-in-causal-admission-v2.js', new Set(['PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION'])],
      ['../../substrate-federated-isolated-devnet-source-attestation-session-v1.js', new Set([
        'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2',
        'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2',
      ])],
      ['../../relayer-core/ergo-operational-transaction-lifecycle.js', new Set([
        'PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE',
        'SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
    new Map([
      ['../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js', new Set([
        'SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN',
        'SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN',
      ])],
      ['./substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js', new Set([
        'APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Map([
      [
        './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_EXECUTION_BUDGET_MS_V3',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1',
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA',
        ]),
      ],
      [
        '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1',
        ]),
      ],
      [
        '../../substrate-federated-tracker-v1.js',
        new Set(['SUBSTRATE_FEDERATED_TRACKER_V1_SCHEMA']),
      ],
      [
        '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
    new Map([
      [
        '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_RUNNER_COMPLETION_BUDGET_MS_V1',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts',
    new Map([
      [
        '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js',
        new Set([
          'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA',
        ]),
      ],
    ]),
  ],
]);

const REVIEWED_APP_PUBLIC_EXPORT_BINDINGS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  [FEDERATED_NATIVE_RESERVATION_SIGNING, new Set([
    'signFrontierNativeProofBoundReservationV1', 'executeFrontierNativeProofBoundReservationV1',
    'executeFrontierNativeProofBoundReservationAndMintV1',
    'executeFrontierNativeProofBoundReservationMintAndBurnV1',
    'attestFrontierNativeBurnCheckpointV1', 'assertFrontierNativeBurnCheckpointV1',
  ])],
  [FEDERATED_GENESIS_TARGET_ROOT, new Set([
    'RunSubstrateFederatedGenesisTargetRootV1Input', 'runSubstrateFederatedGenesisTargetRootV1',
  ])],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-managed-setup-v2.ts',
    new Set([
      'ExecuteSubstrateFederatedIsolatedDevnetManagedSetupV2Input',
      'executeSubstrateFederatedIsolatedDevnetManagedSetupV2',
      'projectSubstrateFederatedIsolatedDevnetManagedSetupFailureV2',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
    new Set([
      'RunSubstrateFederatedIsolatedDevnetTrackerV2CampaignInput',
      'runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot',
      'SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt',
      'assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt',
      'runSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignRoot',
      'SubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt',
      'assertSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt',
      'runSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignRoot',
      'SubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt',
      'assertSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    new Set([
      'APPLICATION_CHECKPOINT_ACTION_COMPLETION_BUDGET_MS',
      'normalizeTrackerTransportJournalRootV9',
      'projectTrackerCanonicalConfirmationFailureDiagnosticV1',
      'assertReservedTrackerTransportJournalRootV9',
      'normalizePegInCandidatePlan',
      'normalizeFrontierApplicationRunnerPlan',
      'waitForCanonicalConfirmation',
      'finalizeReceipt',
      'RunSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Input',
      'RunSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Input',
      'RunSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5Input',
      'RunSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Input',
      'RunSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Input',
      'RunSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV10Input',
      'RunSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Input',
      'RunSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Input',
      'RunSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Input',
      'RunSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1Input',
      'RunSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4Input',
      'SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5',
      'SubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5Receipt',
      'SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7',
      'SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt',
      'assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance',
      'SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8',
      'SubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Receipt',
      'assertSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8Provenance',
      'SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV10',
      'SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV10Receipt',
      'assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV10Provenance',
      'projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV10',
      'SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV11Receipt',
      'SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11',
      'SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Receipt',
      'assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Provenance',
      'projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV11',
      'SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6',
      'SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6Receipt',
      'SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3',
      'SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3Receipt',
      'SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1',
      'SubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1',
      'SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1Receipt',
      'SubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4',
      'SubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4Receipt',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_ROOT_V5_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CHECKPOINT_ANCHOR_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V5',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_ROOT_V8_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_RESERVATION_FRESHNESS_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V8',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_V10_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V10',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_ROOT_V11_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V11',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_PROJECTION_MANIFEST_DIGEST_V11',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_ROOT_V3_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V3',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_PROOF_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_ROOT_V1_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_ROOT_V4_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_CANDIDATE_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V4',
      'runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1',
      'executeSubstrateFederatedNativeGenesisBatchV1',
      'executeSubstrateFederatedNativeGenesisPegInSourceLockV1',
      'executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1',
      'executeSubstrateFederatedIsolatedDevnetGenesisBatchV3',
      'executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1',
      'executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1',
      'runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3',
      'runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInCheckpointAnchorCampaignRootV5',
      'runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7',
      'runSubstrateFederatedIsolatedDevnetPegInTrackerReservationFreshnessCampaignRootV8',
      'runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV10',
      'runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11',
      'runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6',
      'runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1',
      'runSubstrateFederatedIsolatedDevnetPegInTrackerCandidateCampaignRootV4',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts',
    new Set([
      'submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
    new Set([
      'assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance',
      'assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4Provenance',
      'CompleteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input',
      'createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3',
      'createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4',
      'ExecuteSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3Input',
      'preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3',
      'runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3',
      'RunSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3Input',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_EXECUTION_BUDGET_MS_V3',
      'SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV3',
      'SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointStageV4',
      'SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3',
      'SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV4',
      'SubstrateFederatedIsolatedDevnetFrontierCheckpointAdmissionV3',
      'SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3',
      'SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV4',
      'SubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V3_SCHEMA',
      'SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_CHECKPOINT_ROOT_V4_SCHEMA',
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
  [FEDERATED_NATIVE_RESERVATION_SIGNING, REVIEWED_NATIVE_RESERVATION_IMPORT_BINDINGS],
  [FEDERATED_GENESIS_TARGET_ROOT, REVIEWED_FEDERATED_GENESIS_IMPORT_BINDINGS],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
    new Map([
      ['node:fs', new Set(['mkdirSync'])],
      ['node:path', new Set(['join'])],
    ]),
  ],
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

const EXCLUSIVE_RUNTIME_AUTHORITY_IMPORT_OWNERS: ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
> = new Map([
  [FEDERATED_GENESIS_OPERATOR, new Map([
    ['createFederatedGenesisOperatorV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['assertFederatedGenesisOperatorV1', new Set([FEDERATED_GENESIS_TARGET_ROOT, FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['disposeFederatedGenesisOperatorV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['signFederatedGenesisReservationV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['signFederatedGenesisMintV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['signFederatedGenesisApproveV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['signFederatedGenesisBurnV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
  ])],
  [FEDERATED_NATIVE_RESERVATION_SIGNING, new Map([
    ['signFrontierNativeProofBoundReservationV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['executeFrontierNativeProofBoundReservationV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['executeFrontierNativeProofBoundReservationAndMintV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['executeFrontierNativeProofBoundReservationMintAndBurnV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['attestFrontierNativeBurnCheckpointV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['assertFrontierNativeBurnCheckpointV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
  ])],
  [FEDERATED_NATIVE_RESERVATION_EXECUTION, new Map([
    ['reserveFederatedNativeReservationAttemptV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['submitFederatedNativeReservationV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['sealFederatedNativeReservationV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['observeFederatedNativeReservationInclusionV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['observeFederatedNativeMintParentV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['reserveFederatedNativeMintAttemptV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['submitFederatedNativeMintV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['sealFederatedNativeMintV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['observeFederatedNativeMintInclusionV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['observeFederatedNativeMintStateV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['observeFederatedNativeWithdrawalParentV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['reserveFederatedNativeWithdrawalAttemptV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['submitFederatedNativeWithdrawalV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['sealFederatedNativeWithdrawalV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['observeFederatedNativeWithdrawalInclusionV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
    ['collectFederatedNativeBurnCommitmentV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
  ])],
  ['substrate-federated-authority-safe-devnet-process-v1.ts', new Map([
    ['assertOwnedFederatedGenesisDevnetTargetV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING, FEDERATED_GENESIS_TARGET_ROOT])],
  ])],
  [FEDERATED_GENESIS_TARGET_OBSERVATION, new Map([
    ['observeFederatedGenesisTargetsV1', new Set([FEDERATED_GENESIS_TARGET_ROOT])],
    ['observeFederatedGenesisReservationTargetV1', new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
  ])],
  [
    'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
    new Map([
      ['runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments', new Set([
        'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
    new Map([
      ['runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot', new Set([
        'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
      ])],
      ['assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt', new Set([
        'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
      ])],
      ['runSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignRoot', new Set([
        'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
      ])],
      ['assertSubstrateFederatedIsolatedDevnetWithdrawalV2CheckCampaignReceipt', new Set([
        'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
      ])],
      ['runSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignRoot', new Set([
        'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
      ])],
      ['assertSubstrateFederatedIsolatedDevnetWithdrawalV2CampaignReceipt', new Set([
        'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
      ])],
    ]),
  ],
  [
    'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts',
    new Map([
      ['signFrontierLabProofBoundApplicationV1', new Set([
        'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
      ])],
      ['signFrontierLabProofBoundApplicationV2', new Set([
        'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
      ])],
    ]),
  ],
  [
    'adapters/frontier-lab-application-owner-v1.ts',
    new Map([
      ['createFrontierLabApplicationOwnerV1', new Set([
        'scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts',
      ])],
      ['bindFrontierLabApplicationOwnerRequestV1', new Set([
        'scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts',
      ])],
      ['claimFrontierLabApplicationOwnerRequestV1', new Set([
        'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
        'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
      ])],
      ['disposeFrontierLabApplicationOwnerV1', new Set([
        'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts',
        'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
        'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
        'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
        'scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts',
        'adapters/frontier-lab-application-owner-v1.test.ts',
      ])],
      ['signFrontierLabApplicationCallsOnceV1', new Set([
        'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts',
      ])],
    ]),
  ],
  [
    'bridge-repository-layout.ts',
    new Map([
      [
        'resolveBridgeRepositoryRootsFromCheckoutLayout',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
          'bridge-repository-layout.test.ts',
          'scripts/accept-substrate-federated-authority-safe-devnet-v1.ts',
          'scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts',
          'scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.test.ts',
          'scripts/preflight-substrate-federated-isolated-devnet-campaign-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.test.ts',
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-worker-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-genesis-setup-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-genesis-setup-v1.test.ts',
          'scripts/run-substrate-federated-isolated-devnet-genesis-setup-worker-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-worker-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-v1.test.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-worker-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-check-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-check-v1.test.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-check-worker-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-worker-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-v10.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-v11.ts',
          'substrate-federated-isolated-devnet-portable-bundle-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v10.ts',
        ]),
      ],
    ]),
  ],
  [
    'adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.ts',
    new Map([
      [
        'bindSubstrateFederatedIsolatedDevnetCanonicalBootstrapRequestBytesV1',
        new Set([
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-worker-v1.ts',
        ]),
      ],
      [
        'claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
          'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.test.ts',
        ]),
      ],
      [
        'projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts',
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.test.ts',
        ]),
      ],
      [
        'consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts',
          'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.test.ts',
        ]),
      ],
    ]),
  ],
  [
    'scripts/run-substrate-federated-isolated-devnet-bootstrap-worker-v1.ts',
    new Map([
      [
        'loadCanonicalBootstrapRequestBoundWithProvenanceV1',
        new Set([
          'scripts/run-substrate-federated-isolated-devnet-bootstrap-v1.test.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v10.ts',
          'scripts/run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v11.ts',
          'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.ts',
    new Map([
      [
        'registerSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
        ]),
      ],
    ]),
  ],
  [
    'substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.ts',
    new Map([
      [
        'executeObservedAnchorTrackerCheckKernelV1',
        new Set([
          'substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.test.ts',
          'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        ]),
      ],
      [
        'executeObservedAnchorTrackerCheckKernelV2',
        new Set([
          'substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.test.ts',
          'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        ]),
      ],
      [
        'executeObservedAnchorTrackerReservationFreshnessCheckKernelV1',
        new Set([
          'substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.test.ts',
          'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        ]),
      ],
    ]),
  ],
  [
    'substrate-federated-isolated-devnet-setup-check-signer-binding-v2.ts',
    new Map([
      [
        'registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2',
        new Set([
          'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
        ]),
      ],
      [
        'revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2',
        new Set([
          'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
        ]),
      ],
    ]),
  ],
  [
    'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
    new Map([
      'claimSubstrateFederatedIsolatedDevnetTrackerV2Check',
      'revalidateSubstrateFederatedIsolatedDevnetTrackerV2Reservation',
      'checkSubstrateFederatedIsolatedDevnetTrackerV2Transport',
    ].map(symbol => [symbol, new Set(['substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.ts'])] as const).concat([
      'claimSubstrateFederatedIsolatedDevnetWithdrawalV2Check',
      'assertSubstrateFederatedIsolatedDevnetWithdrawalV2Check',
    ].map(symbol => [symbol, new Set(['substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.ts'])] as const))),
  ],
  [
    'substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.ts',
    new Map([
      ...[
        'claimSubstrateFederatedIsolatedDevnetWithdrawalV2Transport',
        'assertSubstrateFederatedIsolatedDevnetWithdrawalV2TransportReady',
        'finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2TransportJournal',
      ].map(symbol => [symbol, new Set(['substrate-federated-isolated-devnet-checked-submission-transport-v1.ts'])] as const),
      ...[
        'authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2',
        'reserveSubstrateFederatedIsolatedDevnetWithdrawalV2',
        'confirmSubstrateFederatedIsolatedDevnetWithdrawalV2',
      ].map(symbol => [symbol, new Set([FEDERATED_GENESIS_TARGET_ROOT,
        'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts'])] as const),
    ]),
  ],
  [
    'substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.ts',
    new Map([
      'claimSubstrateFederatedIsolatedDevnetTrackerV2Transport',
      'assertSubstrateFederatedIsolatedDevnetTrackerV2TransportReady',
      'finalizeSubstrateFederatedIsolatedDevnetTrackerV2TransportJournal',
    ].map(symbol => [symbol, new Set(['substrate-federated-isolated-devnet-checked-submission-transport-v1.ts'])])),
  ],
  [
    'substrate-federated-isolated-devnet-portable-replay-v1.ts',
    new Map([
      ['takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV2', new Set([
        'apps/bridge-daemon/substrate-federated-isolated-devnet-managed-setup-v2.ts',
      ])],
    ]),
  ],
  [
    'substrate-federated-isolated-devnet-mining-credential-v1.ts',
    new Map([
      [
        'issueSubstrateFederatedIsolatedDevnetMiningCredentialV1',
        new Set([
          'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        ]),
      ],
      [
        'consumeSubstrateFederatedIsolatedDevnetMiningCredentialV1',
        new Set([
          'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
        ]),
      ],
      [
        'revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1',
        new Set([
          FEDERATED_GENESIS_TARGET_ROOT,
          'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
          'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
          'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
          'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
        ]),
      ],
    ]),
  ],
  [
    'substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
    new Map([
      [
        'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.ts',
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
        ]),
      ],
      [
        'claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
        ]),
      ],
      [
        'claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2',
        new Set([
          FEDERATED_GENESIS_TARGET_ROOT,
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
          'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
        ]),
      ],
    ]),
  ],
  [
    'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
    new Map([
      ['assertSubstrateFederatedIsolatedDevnetTrackerFreshnessLineageV2', new Set([
        'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        'substrate-federated-isolated-devnet-ergo-node-process-v1.test.ts',
        'substrate-federated-isolated-devnet-tracker-v2-provisioning.test.ts',
      ])],
      ['assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2', new Set([
        'substrate-federated-isolated-devnet-tracker-v2-admission-lifecycle.ts',
        'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        'substrate-federated-isolated-devnet-ergo-node-process-v1.test.ts',
        'substrate-federated-isolated-devnet-tracker-v2-provisioning.test.ts',
      ])],
      [
        'projectSubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseFailureV1',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
        ]),
      ],
      [
        'assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1',
        new Set([
          'substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.ts',
          'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        ]),
      ],
      [
        'issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1',
        new Set([
          'substrate-federated-isolated-devnet-ergo-node-process-v1.test.ts',
          'substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        ]),
      ],
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts',
    new Map([
      [
        'issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1',
        new Set([
          'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts',
        ]),
      ],
    ]),
  ],
]);

const EXCLUSIVE_RUNTIME_MODULE_IMPORT_OWNERS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  [FEDERATED_GENESIS_OPERATOR, new Set([FEDERATED_GENESIS_TARGET_ROOT, FEDERATED_NATIVE_RESERVATION_SIGNING])],
  [FEDERATED_NATIVE_RESERVATION_SIGNING, new Set([FEDERATED_GENESIS_TARGET_ROOT])],
  [FEDERATED_GENESIS_TARGET_OBSERVATION, new Set([FEDERATED_GENESIS_TARGET_ROOT, FEDERATED_NATIVE_RESERVATION_SIGNING])],
  [FEDERATED_NATIVE_RESERVATION_EXECUTION, new Set([FEDERATED_NATIVE_RESERVATION_SIGNING])],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.ts',
    new Set(['scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts']),
  ],
  [
    'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
    new Set(['scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts']),
  ],
  [
    'apps/bridge-daemon/frontier-lab-proof-bound-application-signing-v1.ts',
    new Set([
      'apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.ts',
    ]),
  ],
  [
    'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.ts',
    new Set([
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
      'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.ts',
      'apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.test.ts',
    ]),
  ],
]);

const REVIEWED_UNCLASSIFIED_COMPUTED_RUNTIME_IMPORTS: ReadonlyMap<
  string,
  ReadonlySet<Extract<ModuleImportForm, 'dynamic-import' | 'require'>>
> = new Map([
  [
    'authenticated-spv-tracker-jvm-avl-differential.ts',
    new Set(['require']),
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
  typeOnly: boolean;
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile): CollectedModuleSpecifier[] {
  const imports: CollectedModuleSpecifier[] = [];

  const addSpecifier = (
    node: ts.StringLiteralLike,
    form: ModuleImportForm,
    bindings: Array<{ imported: string; local: string }> = [],
    typeOnly = false,
  ): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    imports.push({
      value: node.text,
      line: line + 1,
      form,
      bindings,
      typeOnly,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause) {
        addSpecifier(node.moduleSpecifier, 'side-effect-import');
      } else if (clause.name) {
        addSpecifier(
          node.moduleSpecifier,
          'default-or-mixed-import',
          [],
          clause.isTypeOnly,
        );
      } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        addSpecifier(
          node.moduleSpecifier,
          'namespace-import',
          [],
          clause.isTypeOnly,
        );
      } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        addSpecifier(
          node.moduleSpecifier,
          'named-import',
          clause.namedBindings.elements.map(element => ({
            imported: element.propertyName?.text ?? element.name.text,
            local: element.name.text,
          })),
          clause.isTypeOnly
            || clause.namedBindings.elements.every(element => element.isTypeOnly),
        );
      } else {
        addSpecifier(node.moduleSpecifier, 'default-or-mixed-import');
      }
    } else if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const named = node.exportClause && ts.isNamedExports(node.exportClause)
        ? node.exportClause
        : undefined;
      const typeOnly = node.isTypeOnly
        || (named !== undefined && named.elements.every(element => element.isTypeOnly));
      addSpecifier(node.moduleSpecifier, 'export', [], typeOnly);
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
      addSpecifier(node.argument.literal, 'import-type', [], true);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
        const awaited = node.parent;
        const declaration = awaited.parent;
        const bindings = ts.isAwaitExpression(awaited)
          && ts.isVariableDeclaration(declaration)
          && declaration.initializer === awaited
          && ts.isVariableDeclarationList(declaration.parent)
          && (declaration.parent.flags & ts.NodeFlags.Const) !== 0
          && ts.isObjectBindingPattern(declaration.name)
          && declaration.name.elements.every(element => ts.isIdentifier(element.name)
            && !element.propertyName && !element.dotDotDotToken && !element.initializer)
          ? declaration.name.elements.map(element => ({
            imported: (element.name as ts.Identifier).text,
            local: (element.name as ts.Identifier).text,
          }))
          : [];
        addSpecifier(node.arguments[0], 'dynamic-import', bindings);
      } else {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        imports.push({
          value: null,
          line: line + 1,
          form: 'dynamic-import',
          bindings: [],
          typeOnly: false,
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
          typeOnly: false,
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
  if (file === FEDERATED_NATIVE_RESERVATION_SIGNING && !allowedBindings) {
    return [{
      file,
      line: imported.line,
      importSpecifier: imported.value,
      message: `native reservation composition import is not allowlisted: ${imported.value}`,
    }];
  }
  if (!allowedBindings) return [];

  return inspectRestrictedImportBindings(file, imported, allowedBindings);
}

function inspectExclusiveRuntimeModuleImport(
  file: string,
  imported: CollectedModuleSpecifier,
  knownFiles: ReadonlySet<string>,
): LayerImportViolation[] {
  if (
    imported.value === null
    || imported.typeOnly
    || !imported.value.startsWith('.')
  ) {
    return [];
  }
  const resolved = resolveRelativeImport(file, imported.value, knownFiles);
  if (resolved === null) return [];
  const owners = EXCLUSIVE_RUNTIME_MODULE_IMPORT_OWNERS.get(resolved);
  if (owners === undefined || owners.has(file)) return [];
  return [{
    file,
    line: imported.line,
    importSpecifier: imported.value,
    message: `exclusive runtime module import has the wrong owner: ${imported.value}`,
  }];
}

function inspectExclusiveRuntimeAuthorityImport(
  file: string,
  imported: CollectedModuleSpecifier,
  knownFiles: ReadonlySet<string>,
): LayerImportViolation[] {
  if (imported.value === null) {
    if (
      classifyBridgeLayer(file) === null
      && (imported.form === 'dynamic-import' || imported.form === 'require')
      && !REVIEWED_UNCLASSIFIED_COMPUTED_RUNTIME_IMPORTS
        .get(file)?.has(imported.form)
    ) {
      return [{
        file,
        line: imported.line,
        importSpecifier: null,
        message:
          'unclassified runtime modules require a static string import target',
      }];
    }
    return [];
  }
  if (!imported.value.startsWith('.') || imported.typeOnly) {
    return [];
  }
  const resolved = resolveRelativeImport(file, imported.value, knownFiles);
  if (resolved === null) return [];
  const restrictedBindings =
    EXCLUSIVE_RUNTIME_AUTHORITY_IMPORT_OWNERS.get(resolved);
  if (restrictedBindings === undefined) return [];
  // Retain caught loader failures without exposing the replay module namespace.
  if (file === 'scripts/replay-substrate-federated-isolated-devnet-launch-v1.ts'
    && imported.value === '../substrate-federated-isolated-devnet-portable-replay-v1.js'
    && imported.form === 'dynamic-import' && imported.bindings.length === 1
    && imported.bindings[0]!.imported === 'replaySubstrateFederatedIsolatedDevnetPortableV1'
    && imported.bindings[0]!.local === imported.bindings[0]!.imported) return [];
  if (file === 'scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts'
    && imported.value === './run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js'
    && imported.form === 'dynamic-import'
    && (imported.bindings.length === 1 || (imported.bindings.length === 2
      && imported.bindings[1]!.imported === 'formatSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure'
      && imported.bindings[1]!.local === imported.bindings[1]!.imported))
    && imported.bindings[0]!.imported === 'runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments'
    && imported.bindings[0]!.local === imported.bindings[0]!.imported) return [];
  if (imported.form !== 'named-import') {
    return [{
      file,
      line: imported.line,
      importSpecifier: imported.value,
      message:
        `exclusive authority module must use named runtime imports: ${imported.value}`,
    }];
  }

  const violations: LayerImportViolation[] = [];
  for (const binding of imported.bindings) {
    const owners = restrictedBindings.get(binding.imported);
    if (owners === undefined) continue;
    if (!owners.has(file)) {
      violations.push({
        file,
        line: imported.line,
        importSpecifier: imported.value,
        message:
          `exclusive authority import has the wrong owner: ${imported.value}#${binding.imported}`,
      });
    } else if (binding.local !== binding.imported) {
      violations.push({
        file,
        line: imported.line,
        importSpecifier: imported.value,
        message:
          `exclusive authority import must not be aliased: ${imported.value}#${binding.imported}`,
      });
    }
  }
  return violations;
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
    } else if (binding.local !== binding.imported
      && !(file === FEDERATED_GENESIS_TARGET_ROOT && imported.typeOnly
        && imported.value === '../../state-tracker.js' && binding.imported === 'StateTracker')) {
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

const FIXED_CAMPAIGN_SCRIPT_EXPORTS = new Map([
  ['scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts',
    new Set(['runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments',
      'formatSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure'])],
  ['scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts',
    new Set(['runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments',
      'readSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure'])],
]);

function collectFixedCampaignScriptViolations(
  file: string, parsed: ts.SourceFile, imports: readonly CollectedModuleSpecifier[],
  knownFiles: ReadonlySet<string>,
): LayerImportViolation[] {
  const entry = FIXED_CAMPAIGN_SCRIPT_EXPORTS.get(file);
  if (entry === undefined) return [];
  const violations = collectReviewedAppExportViolations(file, parsed, entry);
  const protectedNames = new Set<string>();
  for (const imported of imports) {
    if (imported.value === null || imported.typeOnly) continue;
    const resolved = resolveRelativeImport(file, imported.value, knownFiles);
    const restricted = resolved === null ? undefined : EXCLUSIVE_RUNTIME_AUTHORITY_IMPORT_OWNERS.get(resolved);
    for (const binding of imported.bindings) {
      if (restricted?.has(binding.imported)) protectedNames.add(binding.local);
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && protectedNames.has(node.text)
      && !ts.isImportSpecifier(node.parent)
      && !(ts.isBindingElement(node.parent) && node.parent.name === node)
      && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      violations.push({ file, line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
        importSpecifier: null, message: `fixed campaign capability must only be called directly: ${node.text}` });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
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
        if (statement.importClause?.isTypeOnly || element.isTypeOnly) continue;
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
        const isReviewedReadOnlyValue =
          sourceLayer === 'apps'
          && REVIEWED_APP_READ_ONLY_VALUE_BINDINGS
            .get(file)
            ?.get(restricted.moduleSpecifier)
            ?.has(restricted.binding) === true;
        const isReviewedErasedTypeReference =
          REVIEWED_TRACKER_V2_APP_LEGACY_IMPORT_BINDINGS.has(file)
          && ((ts.isTypeQueryNode(node.parent) && node.parent.exprName === node)
            || (ts.isTypeReferenceNode(node.parent) && node.parent.typeName === node));
        if (
          !isReviewedEcdhCall
          && !isReviewedCryptoFactoryCall
          && !isReviewedDirectCall
          && !isReviewedStateTrackerConstruction
          && !isReviewedReadOnlyValue
          && !isReviewedErasedTypeReference
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
    const parsed = layerProgram.sourceFile(file);
    const imports = collectModuleSpecifiers(parsed);
    for (const imported of imports) {
      violations.push(...inspectExclusiveRuntimeModuleImport(
        file,
        imported,
        knownFiles,
      ));
      violations.push(...inspectExclusiveRuntimeAuthorityImport(
        file,
        imported,
        knownFiles,
      ));
    }
    violations.push(...collectFixedCampaignScriptViolations(file, parsed, imports, knownFiles));
    if (sourceLayer === null) continue;

    adjacency.set(file, new Set());
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

    for (const imported of imports) {
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
      if (sourceLayer === 'apps' && targetLayer !== null) {
        const restrictedImports = REVIEWED_APP_CAPABILITY_IMPORT_BINDINGS.get(file);
        for (const [specifier] of restrictedImports ?? []) {
          if (!specifier.startsWith('.')
            || resolveRelativeImport(file, specifier, knownFiles) !== resolved) continue;
          // Escape analysis tracks canonical specifiers; equivalent spellings must not bypass it.
          if (imported.value !== specifier) {
            violations.push(...inspectRestrictedImportBindings(file, imported, new Set()));
          } else if (REVIEWED_TRACKER_V2_APP_LEGACY_IMPORT_BINDINGS.has(file)) {
            violations.push(...inspectRestrictedImportBindings(
              file,
              imported,
              restrictedImports!.get(specifier)!,
            ));
          }
          break;
        }
      }
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
