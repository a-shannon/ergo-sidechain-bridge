import { createHash } from 'node:crypto';
import { win32 } from 'node:path';

import {
  validateNativePegInCausalF2dInstallationDeclarationsV1,
  type NativePegInCausalF2dInstallationDeclarationsV1,
} from './native-peg-in-causal-f2d-dual-origin-campaign-v1.js';
import {
  deriveCampaignInputManifestDigestHex,
  parseCampaignInputManifest,
} from './scripts/run-native-peg-in-causal-f2d-dual-origin-campaign.js';

export const NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_SCHEMA =
  'e2s.native-peg-in-causal-f2e-input-validation.v1' as const;
export const NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_STATUS =
  'PUBLIC_PROOF_INPUT_VALIDATED_WITHOUT_EXECUTION' as const;
export const NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_SCHEMA =
  'e2s.native-peg-in-causal-f2e-operator-handoff.v1' as const;
export const NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_STATUS =
  'PROTECTED_HOST_PREREQUISITES_BOUND_WITHOUT_ACTIVATION' as const;

const INPUT_VALIDATION_BOUNDARY = deepFreeze({
  syntaxAndSemanticShapeValidated: true as const,
  proofSignaturesReverified: false as const,
  sourceCanonicalityVerified: false as const,
  sidechainFinalityVerified: false as const,
  executionPerformed: false as const,
  installationPerformed: false as const,
  registryRead: false as const,
  registryWrite: false as const,
  mintAuthorized: false as const,
  signingAuthorized: false as const,
  submissionAuthorized: false as const,
  broadcastAuthorized: false as const,
  gate5Closed: false as const,
  productionReadinessVerified: false as const,
});

const HANDOFF_BOUNDARY = deepFreeze({
  hostArchitectureChecked: true as const,
  regularFilePrerequisitesChecked: true as const,
  brokerSourceDigestMatched: true as const,
  installedLauncherPathDerivedSeparately: true as const,
  observedProgramFilesPathIsNotExecutionAuthority: true as const,
  installerRevalidatesKnownFolderAtExecution: true as const,
  installerArgumentsBoundPerRole: true as const,
  inspectionArgumentsBoundPerRole: true as const,
  installerRehashRequiredBeforeElevation: true as const,
  installerExecutionAuthorized: false as const,
  executeArgumentsBound: true as const,
  sourceCheckoutVerified: false as const,
  installationPerformed: false as const,
  inspectionPerformed: false as const,
  activationCampaignCompleted: false as const,
  proofExecutionPerformed: false as const,
  registryRead: false as const,
  registryWrite: false as const,
  sourceCanonicalityVerified: false as const,
  sidechainFinalityVerified: false as const,
  mintAuthorized: false as const,
  signingAuthorized: false as const,
  submissionAuthorized: false as const,
  broadcastAuthorized: false as const,
  gate5Closed: false as const,
  productionReadinessVerified: false as const,
});

export interface NativePegInCausalF2eInputValidationV1 {
  readonly schema: typeof NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_SCHEMA;
  readonly status: typeof NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_STATUS;
  readonly validatedAtIso: string;
  readonly input: Readonly<{
    schema: 'e2s.native-peg-in-causal-f2d-campaign-input.v1';
    canonicalDigestHex: string;
    targetNativeBlockHashHex: string;
    trustedAnchorDigestHex: string;
  }>;
  readonly boundary: typeof INPUT_VALIDATION_BOUNDARY;
  readonly reportDigestHex: string;
}

export interface NativePegInCausalF2eFileIdentityV1 {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256Hex: string;
}

export interface NativePegInCausalF2eHostObservationV1 {
  readonly platform: 'win32';
  readonly architecture: 'x64';
  readonly process64Bit: true;
  readonly programFilesX64Path: string;
  readonly knownFolderSource: 'dotnet-special-folder-program-files';
}

export interface NativePegInCausalF2eOperatorHandoffV1 {
  readonly schema: typeof NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_SCHEMA;
  readonly status: typeof NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_STATUS;
  readonly generatedAtIso: string;
  readonly input: Readonly<{
    path: string;
    canonicalDigestHex: string;
  }>;
  readonly declarations: Readonly<{
    reportDigestHex: string;
    launcherSha256Hex: string;
  }>;
  readonly host: Readonly<{
    platform: 'win32';
    architecture: 'x64';
    process64Bit: true;
    programFilesX64Path: string;
    knownFolderSource: 'dotnet-special-folder-program-files';
    installedLauncherPath: string;
    installedLauncherMatchesObservedKnownFolder: true;
  }>;
  readonly prerequisites: Readonly<{
    brokerSource: NativePegInCausalF2eFileIdentityV1;
    installerScript: Readonly<NativePegInCausalF2eFileIdentityV1 & {
      repositoryCommitHex: string;
      trackedBlobSha256Hex: string;
    }>;
    frontierSourcePath: string;
    cargo: NativePegInCausalF2eFileIdentityV1;
    rustc: NativePegInCausalF2eFileIdentityV1;
    git: NativePegInCausalF2eFileIdentityV1;
  }>;
  readonly policy: Readonly<{
    epoch: number;
    notBeforeUnixMs: number;
    expiresAtUnixMs: number;
    allowedSystemDlls: readonly string[];
  }>;
  readonly profiles: readonly [OperatorProfileV1, OperatorProfileV1];
  readonly execute: Readonly<{
    command: 'npm.cmd';
    arguments: readonly string[];
    outputPath: string;
    primaryRpcOrigin: string;
    witnessRpcOrigin: string;
  }>;
  readonly boundary: typeof HANDOFF_BOUNDARY;
  readonly reportDigestHex: string;
}

interface OperatorProfileV1 {
  readonly role: 'causal-v3-verifier' | 'source-proof-result-producer';
  readonly authorityProfileDigestHex: string;
  readonly executionPolicySha256: string;
  readonly minimumPolicyEpoch: number;
  readonly installationParameters: Readonly<{
    BrokerPath: string;
    BrokerSha256: string;
    ProfileDigest: string;
    PolicyDigestSha256: string;
    MinimumPolicyEpoch: number;
  }>;
  readonly inspectionParameters: Readonly<{
    BrokerPath: string;
    BrokerSha256: string;
    ProfileDigest: string;
    PolicyDigestSha256: string;
    MinimumPolicyEpoch: number;
    InspectOnly: true;
    AsJson: true;
  }>;
}

export function createNativePegInCausalF2eInputValidationV1(input: {
  readonly validatedAt: Date;
  readonly manifestBytes: Buffer;
}): NativePegInCausalF2eInputValidationV1 {
  if (!Buffer.isBuffer(input.manifestBytes)) {
    throw new Error('F2e input validation requires manifest bytes');
  }
  const manifest = parseCampaignInputManifest(Buffer.from(input.manifestBytes));
  const body = {
    schema: NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_SCHEMA,
    status: NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_STATUS,
    validatedAtIso: canonicalDate(input.validatedAt, 'input validation time'),
    input: {
      schema: 'e2s.native-peg-in-causal-f2d-campaign-input.v1' as const,
      canonicalDigestHex: deriveCampaignInputManifestDigestHex(manifest),
      targetNativeBlockHashHex: digest32(
        manifest.targetNativeBlockHashHex,
        'target native block hash',
      ),
      trustedAnchorDigestHex: digest32(
        manifest.trustedAnchorDigestHex,
        'trusted anchor digest',
      ),
    },
    boundary: INPUT_VALIDATION_BOUNDARY,
  };
  const report = deepFreeze({
    ...body,
    reportDigestHex: reportDigest(
      'E2S_NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1',
      body,
    ),
  });
  validateNativePegInCausalF2eInputValidationV1(report);
  return report;
}

export function validateNativePegInCausalF2eInputValidationV1(
  value: unknown,
): asserts value is NativePegInCausalF2eInputValidationV1 {
  const report = exactRecord(value, [
    'boundary',
    'input',
    'reportDigestHex',
    'schema',
    'status',
    'validatedAtIso',
  ], 'F2e input-validation report') as unknown as NativePegInCausalF2eInputValidationV1;
  if (
    report.schema !== NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_SCHEMA
    || report.status !== NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1_STATUS
  ) throw new Error('unsupported F2e input-validation schema or status');
  canonicalIso(report.validatedAtIso, 'input validation time');
  exactRecord(report.input, [
    'canonicalDigestHex',
    'schema',
    'targetNativeBlockHashHex',
    'trustedAnchorDigestHex',
  ], 'F2e validated input');
  if (report.input.schema !== 'e2s.native-peg-in-causal-f2d-campaign-input.v1') {
    throw new Error('unsupported F2e campaign input schema');
  }
  digest32(report.input.canonicalDigestHex, 'campaign input digest');
  digest32(report.input.targetNativeBlockHashHex, 'target native block hash');
  digest32(report.input.trustedAnchorDigestHex, 'trusted anchor digest');
  if (canonicalJson(report.boundary) !== canonicalJson(INPUT_VALIDATION_BOUNDARY)) {
    throw new Error('F2e input-validation boundary is invalid');
  }
  const body = {
    schema: report.schema,
    status: report.status,
    validatedAtIso: report.validatedAtIso,
    input: report.input,
    boundary: report.boundary,
  };
  if (report.reportDigestHex !== reportDigest(
    'E2S_NATIVE_PEG_IN_CAUSAL_F2E_INPUT_VALIDATION_V1',
    body,
  )) throw new Error('F2e input-validation report digest does not match');
}

export function createNativePegInCausalF2eOperatorHandoffV1(input: {
  readonly generatedAt: Date;
  readonly campaignInputPath: string;
  readonly campaignOutputPath: string;
  readonly campaignInputDigestHex: string;
  readonly declarations: NativePegInCausalF2dInstallationDeclarationsV1;
  readonly host: NativePegInCausalF2eHostObservationV1;
  readonly brokerSource: NativePegInCausalF2eFileIdentityV1;
  readonly installerScript: Readonly<NativePegInCausalF2eFileIdentityV1 & {
    repositoryCommitHex: string;
    trackedBlobSha256Hex: string;
  }>;
  readonly frontierSourcePath: string;
  readonly cargo: NativePegInCausalF2eFileIdentityV1;
  readonly rustc: NativePegInCausalF2eFileIdentityV1;
  readonly git: NativePegInCausalF2eFileIdentityV1;
  readonly primaryRpcOrigin: string;
  readonly witnessRpcOrigin: string;
  readonly policyEpoch: number;
  readonly policyNotBeforeUnixMs: number;
  readonly policyExpiresAtUnixMs: number;
  readonly allowedSystemDlls: readonly string[];
}): NativePegInCausalF2eOperatorHandoffV1 {
  validateNativePegInCausalF2dInstallationDeclarationsV1(input.declarations);
  const host = normalizeHost(input.host);
  const brokerSource = normalizeFile(input.brokerSource, 'broker source');
  const installerScript = normalizeTrackedInstaller(input.installerScript);
  const cargo = normalizeFile(input.cargo, 'cargo executable');
  const rustc = normalizeFile(input.rustc, 'rustc executable');
  const git = normalizeFile(input.git, 'git executable');
  if (brokerSource.sha256Hex !== input.declarations.launcherSha256Hex) {
    throw new Error('F2e broker source digest differs from the declared launcher digest');
  }
  if (!brokerSource.path.toLowerCase().endsWith('.exe')) {
    throw new Error('F2e broker source must be an executable file');
  }
  if (!installerScript.path.toLowerCase().endsWith('\\install.ps1')) {
    throw new Error('F2e installer script must name install.ps1');
  }
  const installedLauncherPath = canonicalWindowsPath(
    input.declarations.profiles[0].launcherPath,
    'installed launcher path',
  );
  if (input.declarations.profiles[1].launcherPath !== installedLauncherPath) {
    throw new Error('F2e profiles do not share one installed launcher path');
  }
  const expectedInstalledPath = win32.join(
    host.programFilesX64Path,
    'E2SBridge',
    'NativeExecution',
    'v2',
    'Images',
    input.declarations.launcherSha256Hex.slice(2),
    'bridge-contained-launcher.exe',
  );
  if (installedLauncherPath !== expectedInstalledPath) {
    throw new Error('F2e installed launcher path differs from the 64-bit Program Files path');
  }
  const primaryRpcOrigin = canonicalRpcOrigin(input.primaryRpcOrigin, 'primary RPC origin');
  const witnessRpcOrigin = canonicalRpcOrigin(input.witnessRpcOrigin, 'witness RPC origin');
  if (primaryRpcOrigin === witnessRpcOrigin) {
    throw new Error('F2e operator handoff requires distinct RPC origins');
  }
  const policyEpoch = positiveInteger(input.policyEpoch, 'policy epoch');
  const policyNotBeforeUnixMs = nonNegativeInteger(
    input.policyNotBeforeUnixMs,
    'policy not-before time',
  );
  const policyExpiresAtUnixMs = nonNegativeInteger(
    input.policyExpiresAtUnixMs,
    'policy expiry time',
  );
  if (policyExpiresAtUnixMs <= policyNotBeforeUnixMs) {
    throw new Error('F2e policy expiry must follow its not-before time');
  }
  const allowedSystemDlls = normalizeDlls(input.allowedSystemDlls);
  const campaignInputPath = canonicalWindowsPath(input.campaignInputPath, 'campaign input path');
  const campaignOutputPath = canonicalWindowsPath(
    input.campaignOutputPath,
    'campaign output path',
  );
  if (campaignOutputPath === campaignInputPath) {
    throw new Error('F2e campaign output path must differ from its input path');
  }
  const frontierSourcePath = canonicalWindowsPath(input.frontierSourcePath, 'Frontier source path');
  const profiles = input.declarations.profiles.map(profile => createOperatorProfile(
    profile,
    brokerSource.path,
    installedLauncherPath,
  )) as [OperatorProfileV1, OperatorProfileV1];
  const executeArguments = createExecuteArguments({
    campaignInputPath,
    campaignInputDigestHex: digest32(
      input.campaignInputDigestHex,
      'campaign input digest',
    ),
    campaignOutputPath,
    primaryRpcOrigin,
    witnessRpcOrigin,
    frontierSourcePath,
    cargoPath: cargo.path,
    rustcPath: rustc.path,
    gitPath: git.path,
    installedLauncherPath,
    launcherSha256Hex: input.declarations.launcherSha256Hex,
    policyEpoch,
    policyNotBeforeUnixMs,
    policyExpiresAtUnixMs,
    allowedSystemDlls,
  });
  const body = {
    schema: NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_SCHEMA,
    status: NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_STATUS,
    generatedAtIso: canonicalDate(input.generatedAt, 'operator handoff generation time'),
    input: {
      path: campaignInputPath,
      canonicalDigestHex: digest32(
        input.campaignInputDigestHex,
        'campaign input digest',
      ),
    },
    declarations: {
      reportDigestHex: input.declarations.reportDigestHex,
      launcherSha256Hex: input.declarations.launcherSha256Hex,
    },
    host: {
      ...host,
      installedLauncherPath,
      installedLauncherMatchesObservedKnownFolder: true as const,
    },
    prerequisites: {
      brokerSource,
      installerScript,
      frontierSourcePath,
      cargo,
      rustc,
      git,
    },
    policy: {
      epoch: policyEpoch,
      notBeforeUnixMs: policyNotBeforeUnixMs,
      expiresAtUnixMs: policyExpiresAtUnixMs,
      allowedSystemDlls,
    },
    profiles,
    execute: {
      command: 'npm.cmd' as const,
      arguments: executeArguments,
      outputPath: campaignOutputPath,
      primaryRpcOrigin,
      witnessRpcOrigin,
    },
    boundary: HANDOFF_BOUNDARY,
  };
  const report = deepFreeze({
    ...body,
    reportDigestHex: reportDigest(
      'E2S_NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1',
      body,
    ),
  });
  validateNativePegInCausalF2eOperatorHandoffV1(report);
  return report;
}

export function validateNativePegInCausalF2eOperatorHandoffV1(
  value: unknown,
): asserts value is NativePegInCausalF2eOperatorHandoffV1 {
  const report = exactRecord(value, [
    'boundary',
    'declarations',
    'execute',
    'generatedAtIso',
    'host',
    'input',
    'policy',
    'prerequisites',
    'profiles',
    'reportDigestHex',
    'schema',
    'status',
  ], 'F2e operator handoff') as unknown as NativePegInCausalF2eOperatorHandoffV1;
  if (
    report.schema !== NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_SCHEMA
    || report.status !== NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1_STATUS
  ) throw new Error('unsupported F2e operator handoff schema or status');
  canonicalIso(report.generatedAtIso, 'operator handoff generation time');
  digest32(report.reportDigestHex, 'operator handoff digest');
  exactRecord(report.input, ['canonicalDigestHex', 'path'], 'F2e handoff input');
  canonicalWindowsPath(report.input.path, 'campaign input path');
  digest32(report.input.canonicalDigestHex, 'campaign input digest');
  exactRecord(report.declarations, [
    'launcherSha256Hex',
    'reportDigestHex',
  ], 'F2e handoff declarations');
  digest32(report.declarations.launcherSha256Hex, 'launcher digest');
  digest32(report.declarations.reportDigestHex, 'declarations report digest');
  exactRecord(report.host, [
    'architecture',
    'installedLauncherMatchesObservedKnownFolder',
    'installedLauncherPath',
    'knownFolderSource',
    'platform',
    'process64Bit',
    'programFilesX64Path',
  ], 'F2e handoff host');
  const host = normalizeHost({
    platform: report.host.platform,
    architecture: report.host.architecture,
    process64Bit: report.host.process64Bit,
    programFilesX64Path: report.host.programFilesX64Path,
    knownFolderSource: report.host.knownFolderSource,
  });
  if (report.host.installedLauncherMatchesObservedKnownFolder !== true) {
    throw new Error('F2e handoff did not bind the installed launcher to observed Program Files');
  }
  const expectedInstalledPath = win32.join(
    host.programFilesX64Path,
    'E2SBridge',
    'NativeExecution',
    'v2',
    'Images',
    report.declarations.launcherSha256Hex.slice(2),
    'bridge-contained-launcher.exe',
  );
  if (report.host.installedLauncherPath !== expectedInstalledPath) {
    throw new Error('F2e handoff installed launcher path is invalid');
  }
  exactRecord(report.prerequisites, [
    'brokerSource',
    'cargo',
    'frontierSourcePath',
    'git',
    'installerScript',
    'rustc',
  ], 'F2e handoff prerequisites');
  const brokerSource = normalizeFile(report.prerequisites.brokerSource, 'broker source');
  if (brokerSource.sha256Hex !== report.declarations.launcherSha256Hex) {
    throw new Error('F2e handoff broker source digest differs from launcher digest');
  }
  normalizeTrackedInstaller(report.prerequisites.installerScript);
  normalizeFile(report.prerequisites.cargo, 'cargo executable');
  normalizeFile(report.prerequisites.rustc, 'rustc executable');
  normalizeFile(report.prerequisites.git, 'git executable');
  canonicalWindowsPath(report.prerequisites.frontierSourcePath, 'Frontier source path');
  exactRecord(report.policy, [
    'allowedSystemDlls',
    'epoch',
    'expiresAtUnixMs',
    'notBeforeUnixMs',
  ], 'F2e handoff policy');
  const policyEpoch = positiveInteger(report.policy.epoch, 'policy epoch');
  const policyNotBeforeUnixMs = nonNegativeInteger(
    report.policy.notBeforeUnixMs,
    'policy not-before time',
  );
  const policyExpiresAtUnixMs = nonNegativeInteger(
    report.policy.expiresAtUnixMs,
    'policy expiry time',
  );
  if (policyExpiresAtUnixMs <= policyNotBeforeUnixMs) {
    throw new Error('F2e handoff policy expiry must follow its not-before time');
  }
  const allowedSystemDlls = normalizeDlls(report.policy.allowedSystemDlls);
  if (!Array.isArray(report.profiles) || report.profiles.length !== 2) {
    throw new Error('F2e handoff requires exactly two profiles');
  }
  const causalProfile = validateOperatorProfile(
    report.profiles[0],
    'causal-v3-verifier',
    brokerSource.path,
    report.host.installedLauncherPath,
    report.declarations.launcherSha256Hex,
  );
  const sourceProfile = validateOperatorProfile(
    report.profiles[1],
    'source-proof-result-producer',
    brokerSource.path,
    report.host.installedLauncherPath,
    report.declarations.launcherSha256Hex,
  );
  if (
    causalProfile.authorityProfileDigestHex === sourceProfile.authorityProfileDigestHex
    || causalProfile.executionPolicySha256 === sourceProfile.executionPolicySha256
    || causalProfile.minimumPolicyEpoch !== sourceProfile.minimumPolicyEpoch
    || causalProfile.minimumPolicyEpoch !== policyEpoch
  ) throw new Error('F2e handoff profiles are not role-distinct under one policy epoch');
  exactRecord(report.execute, [
    'arguments',
    'command',
    'outputPath',
    'primaryRpcOrigin',
    'witnessRpcOrigin',
  ], 'F2e execute command');
  if (report.execute.command !== 'npm.cmd' || !Array.isArray(report.execute.arguments)) {
    throw new Error('F2e execute command is invalid');
  }
  const primary = canonicalRpcOrigin(report.execute.primaryRpcOrigin, 'primary RPC origin');
  const witness = canonicalRpcOrigin(report.execute.witnessRpcOrigin, 'witness RPC origin');
  if (primary === witness) throw new Error('F2e execute RPC origins must be distinct');
  const outputPath = canonicalWindowsPath(report.execute.outputPath, 'campaign output path');
  if (outputPath === report.input.path) {
    throw new Error('F2e execute output path must differ from its input path');
  }
  const expectedExecuteArguments = createExecuteArguments({
    campaignInputPath: report.input.path,
    campaignInputDigestHex: report.input.canonicalDigestHex,
    campaignOutputPath: outputPath,
    primaryRpcOrigin: primary,
    witnessRpcOrigin: witness,
    frontierSourcePath: report.prerequisites.frontierSourcePath,
    cargoPath: report.prerequisites.cargo.path,
    rustcPath: report.prerequisites.rustc.path,
    gitPath: report.prerequisites.git.path,
    installedLauncherPath: report.host.installedLauncherPath,
    launcherSha256Hex: report.declarations.launcherSha256Hex,
    policyEpoch,
    policyNotBeforeUnixMs,
    policyExpiresAtUnixMs,
    allowedSystemDlls,
  });
  if (canonicalJson(report.execute.arguments) !== canonicalJson(expectedExecuteArguments)) {
    throw new Error('F2e execute arguments differ from the bound handoff fields');
  }
  if (canonicalJson(report.boundary) !== canonicalJson(HANDOFF_BOUNDARY)) {
    throw new Error('F2e operator handoff boundary is invalid');
  }
  const body = {
    schema: report.schema,
    status: report.status,
    generatedAtIso: report.generatedAtIso,
    input: report.input,
    declarations: report.declarations,
    host: report.host,
    prerequisites: report.prerequisites,
    policy: report.policy,
    profiles: report.profiles,
    execute: report.execute,
    boundary: report.boundary,
  };
  if (report.reportDigestHex !== reportDigest(
    'E2S_NATIVE_PEG_IN_CAUSAL_F2E_OPERATOR_HANDOFF_V1',
    body,
  )) throw new Error('F2e operator handoff report digest does not match');
}

function createOperatorProfile(
  profile: NativePegInCausalF2dInstallationDeclarationsV1['profiles'][number],
  brokerSourcePath: string,
  installedLauncherPath: string,
): OperatorProfileV1 {
  const common = {
    BrokerSha256: profile.launcherSha256Hex.slice(2),
    ProfileDigest: profile.authorityProfileDigestHex.slice(2),
    PolicyDigestSha256: profile.executionPolicySha256,
    MinimumPolicyEpoch: profile.minimumPolicyEpoch,
  };
  return deepFreeze({
    role: profile.role,
    authorityProfileDigestHex: profile.authorityProfileDigestHex,
    executionPolicySha256: profile.executionPolicySha256,
    minimumPolicyEpoch: profile.minimumPolicyEpoch,
    installationParameters: {
      BrokerPath: brokerSourcePath,
      ...common,
    },
    inspectionParameters: {
      BrokerPath: installedLauncherPath,
      ...common,
      InspectOnly: true as const,
      AsJson: true as const,
    },
  });
}

function validateOperatorProfile(
  value: unknown,
  expectedRole: OperatorProfileV1['role'],
  brokerSourcePath: string,
  installedLauncherPath: string,
  launcherSha256Hex: string,
): OperatorProfileV1 {
  const profile = exactRecord(value, [
    'authorityProfileDigestHex',
    'executionPolicySha256',
    'inspectionParameters',
    'installationParameters',
    'minimumPolicyEpoch',
    'role',
  ], `${expectedRole} profile`);
  if (profile.role !== expectedRole) throw new Error(`F2e ${expectedRole} role is invalid`);
  const normalized = {
    role: expectedRole,
    authorityProfileDigestHex: digest32(
      profile.authorityProfileDigestHex,
      `${expectedRole} profile digest`,
    ),
    executionPolicySha256: flatDigest32(
      profile.executionPolicySha256,
      `${expectedRole} policy digest`,
    ),
    minimumPolicyEpoch: positiveInteger(
      profile.minimumPolicyEpoch,
      `${expectedRole} minimum policy epoch`,
    ),
    launcherPath: installedLauncherPath,
    launcherSha256Hex,
  } as NativePegInCausalF2dInstallationDeclarationsV1['profiles'][number];
  const expected = createOperatorProfile(
    normalized,
    brokerSourcePath,
    installedLauncherPath,
  );
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error(`F2e ${expectedRole} parameters differ from the bound profile`);
  }
  return expected;
}

function createExecuteArguments(input: {
  readonly campaignInputPath: string;
  readonly campaignInputDigestHex: string;
  readonly campaignOutputPath: string;
  readonly primaryRpcOrigin: string;
  readonly witnessRpcOrigin: string;
  readonly frontierSourcePath: string;
  readonly cargoPath: string;
  readonly rustcPath: string;
  readonly gitPath: string;
  readonly installedLauncherPath: string;
  readonly launcherSha256Hex: string;
  readonly policyEpoch: number;
  readonly policyNotBeforeUnixMs: number;
  readonly policyExpiresAtUnixMs: number;
  readonly allowedSystemDlls: readonly string[];
}): readonly string[] {
  return deepFreeze([
    'run',
    'peg-in:causal-f2d:campaign',
    '--',
    '--mode',
    'execute',
    '--input',
    input.campaignInputPath,
    '--expected-input-sha256',
    input.campaignInputDigestHex,
    '--out',
    input.campaignOutputPath,
    '--primary-rpc-url',
    input.primaryRpcOrigin,
    '--witness-rpc-url',
    input.witnessRpcOrigin,
    '--frontier-source',
    input.frontierSourcePath,
    '--cargo',
    input.cargoPath,
    '--rustc',
    input.rustcPath,
    '--git',
    input.gitPath,
    '--launcher-path',
    input.installedLauncherPath,
    '--launcher-sha256',
    input.launcherSha256Hex,
    '--policy-epoch',
    String(input.policyEpoch),
    '--policy-not-before-unix-ms',
    String(input.policyNotBeforeUnixMs),
    '--policy-expires-at-unix-ms',
    String(input.policyExpiresAtUnixMs),
    ...input.allowedSystemDlls.flatMap(dll => ['--allowed-system-dll', dll]),
  ]);
}

function normalizeHost(value: unknown): NativePegInCausalF2eHostObservationV1 {
  const host = exactRecord(value, [
    'architecture',
    'platform',
    'process64Bit',
    'programFilesX64Path',
    'knownFolderSource',
  ], 'F2e host observation');
  if (host.platform !== 'win32' || host.architecture !== 'x64' || host.process64Bit !== true) {
    throw new Error('F2e protected-host handoff requires a 64-bit Windows x64 process');
  }
  if (host.knownFolderSource !== 'dotnet-special-folder-program-files') {
    throw new Error('F2e host must use the .NET Program Files known-folder observation');
  }
  return deepFreeze({
    platform: 'win32',
    architecture: 'x64',
    process64Bit: true,
    knownFolderSource: 'dotnet-special-folder-program-files',
    programFilesX64Path: canonicalWindowsPath(
      host.programFilesX64Path,
      '64-bit Program Files path',
    ).replace(/\\+$/, ''),
  });
}

function normalizeFile(value: unknown, label: string): NativePegInCausalF2eFileIdentityV1 {
  const file = exactRecord(value, ['path', 'sha256Hex', 'sizeBytes'], label);
  if (!Number.isSafeInteger(file.sizeBytes) || Number(file.sizeBytes) <= 0) {
    throw new Error(`${label} size must be a positive safe integer`);
  }
  return deepFreeze({
    path: canonicalWindowsPath(file.path, `${label} path`),
    sizeBytes: Number(file.sizeBytes),
    sha256Hex: digest32(file.sha256Hex, `${label} digest`),
  });
}

function normalizeTrackedInstaller(
  value: unknown,
): NativePegInCausalF2eOperatorHandoffV1['prerequisites']['installerScript'] {
  const record = exactRecord(value, [
    'path',
    'repositoryCommitHex',
    'sha256Hex',
    'sizeBytes',
    'trackedBlobSha256Hex',
  ], 'tracked installer script');
  const file = normalizeFile({
    path: record.path,
    sizeBytes: record.sizeBytes,
    sha256Hex: record.sha256Hex,
  }, 'installer script');
  const repositoryCommitHex = commitHex(
    record.repositoryCommitHex,
    'installer repository commit',
  );
  const trackedBlobSha256Hex = digest32(
    record.trackedBlobSha256Hex,
    'tracked installer blob digest',
  );
  if (trackedBlobSha256Hex !== file.sha256Hex) {
    throw new Error('installer worktree bytes differ from the tracked commit');
  }
  return deepFreeze({
    ...file,
    repositoryCommitHex,
    trackedBlobSha256Hex,
  });
}

function normalizeDlls(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new Error('F2e allowed DLL list must contain 1..64 entries');
  }
  const dlls = value.map((entry, index) => {
    if (typeof entry !== 'string' || !/^[a-z0-9._-]+\.dll$/.test(entry)) {
      throw new Error(`F2e allowed DLL ${index} is invalid`);
    }
    if (index > 0 && value[index - 1] >= entry) {
      throw new Error('F2e allowed DLLs must be sorted and unique');
    }
    return entry;
  });
  return deepFreeze(dlls);
}

function canonicalRpcOrigin(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) throw new Error(`${label} must be a credential-free HTTP(S) origin`);
  return url.toString();
}

function canonicalWindowsPath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^[A-Z]:\\/.test(value)
    || value.includes('\0')
    || win32.normalize(value) !== value
  ) throw new Error(`${label} must be a canonical absolute Windows path`);
  return value;
}

function canonicalDate(value: unknown, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid Date`);
  }
  return value.toISOString();
}

function canonicalIso(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function digest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed 32-byte digest`);
  }
  return value;
}

function flatDigest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 64 lowercase hex characters`);
  }
  return value;
}

function commitHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 40-character Git commit ID`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
  return record;
}

function reportDigest(domain: string, value: unknown): string {
  return `0x${createHash('sha256')
    .update(Buffer.from(domain, 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonicalJson(value), 'utf8'))
    .digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('F2e report contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('F2e report contains a non-canonical value');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
