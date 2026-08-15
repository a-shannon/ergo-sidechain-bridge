import type {
  CommitteeGovernanceReconciliationBoundary,
  CommitteeGovernanceReconciliationKind,
} from './committee-governance-reconciliation.js';

export interface LocalCommitteeGovernanceReconciliationPacket {
  kind: CommitteeGovernanceReconciliationKind;
  sourceLabel: string;
  targetLabel: string;
  observedAt: string;
  expectedNetwork: string;
  observedNetwork: string;
  deploymentStateDigestHex: string;
  sidechainIdHex?: string;
  scsNftId?: string;
  singletonIdentities?: Record<string, string>;
  oldAuthority?: {
    label: string;
    publicIdentifiers: string[];
  };
  newCommittee?: {
    threshold: number;
    memberCount: number;
    publicIdentifiers: string[];
  };
  rollback?: {
    previousAuthorityDigestHex: string;
    rollbackStateDigestHex: string;
    recoveryPath: string;
  };
  stopCondition: string;
  boundary: CommitteeGovernanceReconciliationBoundary;
}

const EXPECTED_BOUNDARY: CommitteeGovernanceReconciliationBoundary = {
  readOnly: true,
  sanitizedPublicInputOnly: true,
  privateDeploymentStateIncluded: false,
  deploymentStateOpened: false,
  runtimeDatabaseOpened: false,
  secretOrEnvironmentFileRead: false,
  signingOrWalletMaterialRead: false,
  nodeOrRpcRequestPerformed: false,
  keyRotationAuthorized: false,
  transactionBroadcastOrMutation: false,
  gate6Closure: false,
  governanceReadyClaimSupport: false,
  productionClaimSupport: false,
  testnetProductionCandidateClaimSupport: false,
};

const identifiers = {
  deploymentStateDigestHex: '31'.repeat(32),
  sidechainIdHex: '32'.repeat(32),
  scsNftId: '33'.repeat(32),
  sideChainStateSingleton: '34'.repeat(32),
  aggregateDupSingleton: '35'.repeat(32),
  batchDupSingleton: '36'.repeat(32),
  spvTrackerSingleton: '37'.repeat(32),
  sideChainStateContract: '38'.repeat(32),
  governanceContract: '39'.repeat(32),
  oldAuthority: `02${'41'.repeat(32)}`,
  newCommittee1: `02${'51'.repeat(32)}`,
  newCommittee2: `02${'52'.repeat(32)}`,
  newCommittee3: `02${'53'.repeat(32)}`,
  previousAuthorityDigestHex: '61'.repeat(32),
  rollbackStateDigestHex: '62'.repeat(32),
};

export function buildLocalCommitteeGovernanceReconciliationPacket(
  observedAt: string,
): LocalCommitteeGovernanceReconciliationPacket {
  return {
    kind: 'deployment-state-reconciliation',
    sourceLabel: 'local public Gate 6 governance reconciliation input',
    targetLabel: 'sanitized non-mainnet committee reconciliation packet',
    observedAt,
    expectedNetwork: 'testnet',
    observedNetwork: 'testnet',
    deploymentStateDigestHex: identifiers.deploymentStateDigestHex,
    sidechainIdHex: identifiers.sidechainIdHex,
    scsNftId: identifiers.scsNftId,
    singletonIdentities: {
      sideChainState: identifiers.sideChainStateSingleton,
      aggregateDup: identifiers.aggregateDupSingleton,
      batchDup: identifiers.batchDupSingleton,
      spvTracker: identifiers.spvTrackerSingleton,
      sideChainStateContract: identifiers.sideChainStateContract,
      governanceContract: identifiers.governanceContract,
    },
    oldAuthority: {
      label: 'previous committee authority public identifier',
      publicIdentifiers: [identifiers.oldAuthority],
    },
    newCommittee: {
      threshold: 2,
      memberCount: 3,
      publicIdentifiers: [
        identifiers.newCommittee1,
        identifiers.newCommittee2,
        identifiers.newCommittee3,
      ],
    },
    rollback: {
      previousAuthorityDigestHex: identifiers.previousAuthorityDigestHex,
      rollbackStateDigestHex: identifiers.rollbackStateDigestHex,
      recoveryPath: 'rollback to previous-authority recovery packet if the committee rotation fails',
    },
    stopCondition: 'Stop and block rotation if network, singleton, authority, or rollback binding mismatches.',
    boundary: { ...EXPECTED_BOUNDARY },
  };
}

export function buildLocalCommitteeGovernanceWrongNetworkPacket(
  observedAt: string,
): LocalCommitteeGovernanceReconciliationPacket {
  return {
    kind: 'wrong-network-negative',
    sourceLabel: 'local public Gate 6 wrong-network negative input',
    targetLabel: 'sanitized non-mainnet wrong-network packet',
    observedAt,
    expectedNetwork: 'testnet',
    observedNetwork: 'patched-devnet',
    deploymentStateDigestHex: identifiers.deploymentStateDigestHex,
    stopCondition: 'Governance rotation blocked because the deployment-state network does not match the intended testnet target.',
    boundary: { ...EXPECTED_BOUNDARY },
  };
}
