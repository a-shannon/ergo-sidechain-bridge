import { createHash } from 'crypto';

import {
  initialBindingRequestFromFundingObservation,
  type ValidatedAuthenticatedV2FundingObservation,
} from './authenticated-v2-funding-observation.js';
import {
  buildAuthenticatedV2ContractInputs,
  type AuthenticatedV2ContractTemplates,
  type AuthenticatedV2ContractTrees,
} from './authenticated-v2-canonical-contracts.js';
import {
  resolveAuthenticatedV2ContractSources,
  type AuthenticatedV2ContractInputs,
  type ProvisioningContractBinding,
  type ResolvedAuthenticatedV2ContractSources,
} from './authenticated-v2-contract-sources.js';
import {
  AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
  AUTHENTICATED_V2_INITIAL_BINDING_REPORT_SCHEMA,
} from './authenticated-v2-initial-binding-schema.js';
import type {
  AuthenticatedV2CompilerObservation,
  PinnedAuthenticatedV2CompilerRun,
} from './authenticated-v2-source-tree-conformance.js';

export {
  AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
  AUTHENTICATED_V2_INITIAL_BINDING_REPORT_SCHEMA,
} from './authenticated-v2-initial-binding-schema.js';

const CONTRACT_ROLES = ['tracker', 'unlock', 'duplicatePrevention'] as const;
const SEED_TREES: AuthenticatedV2ContractTrees = {
  tracker: '1000',
  unlock: '1001',
  duplicatePrevention: '1002',
};

type ContractRole = typeof CONTRACT_ROLES[number];

export interface AuthenticatedV2InitialBindingRequest {
  environment: string;
  trackerFundingBoxId: string;
  dupVaultFundingBoxId: string;
}

export interface AuthenticatedV2FundingObservationBinding {
  reportDigestHex: string;
  snapshotDigestHex: string;
  observedAt: string;
  nodeNetwork: string;
  tipHeight: number;
  tipIdHex: string;
}

export interface AuthenticatedV2InitialBindingCompilerIdentity {
  execution: 'pinned-resolver-free-jvm';
  compilerLockDigestHex: string;
  sourceBaselineDigestHex: string;
  platform: string;
  nodeVersion: string;
  nodeExecutableSha256: string;
  gitVersion: string;
  gitExecutableSha256: string;
  relayerPackageLockSha256: string;
  ergoNodeBaseCommit: string;
  consensusSourceLockSha256: string;
  ergoPatchSha256: string;
  sigmaStateVersion: string;
  sigmaStateArtifactSha256: string;
  runtimeBundleSha256: string;
  runtimeClasspathSha256: string;
  javaHomeSha256: string;
  networkPrefix: number;
  scriptVersion: number;
  treeVersion: number;
}

export interface AuthenticatedV2InitialBindingCompilerRun {
  identity: AuthenticatedV2InitialBindingCompilerIdentity;
  observation: Pick<AuthenticatedV2CompilerObservation, 'contracts'>;
}

export interface ValidatedAuthenticatedV2InitialBindingReport {
  contracts: AuthenticatedV2ContractInputs;
  provenance: {
    reportDigestHex: string;
    inputDigestHex: string;
  };
}

export type AuthenticatedV2InitialBindingCompiler = (
  resolved: ResolvedAuthenticatedV2ContractSources,
) => Promise<AuthenticatedV2InitialBindingCompilerRun>;

export interface AuthenticatedV2InitialBindingReport {
  schema: typeof AUTHENTICATED_V2_INITIAL_BINDING_REPORT_SCHEMA;
  reportDigestHex: string;
  status: 'DERIVED';
  inputDigestHex: string;
  environment: string;
  identities: {
    trackerNftId: string;
    duplicatePreventionNftId: string;
  };
  compiler: AuthenticatedV2InitialBindingCompilerIdentity & {
    identityDigestHex: string;
  };
  dependencyBinding: {
    compilerPasses: 3;
    trackerTreeStable: true;
    unlockTreeStable: true;
    fixedPointVerified: true;
    authenticatedUnlockErgoTreeHashHex: string;
  };
  fundingObservation:
    | {
        status: 'unobserved';
        revalidationRequiredBeforeSetup: true;
      }
    | ({
        status: 'bound';
        revalidationRequiredBeforeSetup: true;
      } & AuthenticatedV2FundingObservationBinding);
  resolvedContracts: Record<ContractRole, ProvisioningContractBinding>;
  provisioningContracts: Record<ContractRole, {
    sourceTemplateSha256Hex: string;
    ergoTreeHex: string;
    ergoTreeSha256Hex: string;
  }>;
  authorization: {
    execute: false;
    sign: false;
    check: false;
    submit: false;
    broadcast: false;
    deploy: false;
    sidechainFinalityVerifiedOnErgo: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export async function deriveAuthenticatedV2InitialBinding(
  request: AuthenticatedV2InitialBindingRequest,
  options: {
    templates: AuthenticatedV2ContractTemplates;
    compile: AuthenticatedV2InitialBindingCompiler;
  },
): Promise<AuthenticatedV2InitialBindingReport> {
  return deriveAuthenticatedV2InitialBindingInternal(request, undefined, options);
}

export async function deriveAuthenticatedV2InitialBindingFromFundingObservation(
  fundingObservationReport: unknown,
  options: {
    templates: AuthenticatedV2ContractTemplates;
    compile: AuthenticatedV2InitialBindingCompiler;
  },
): Promise<AuthenticatedV2InitialBindingReport> {
  const validated = await initialBindingRequestFromFundingObservation(fundingObservationReport);
  return deriveAuthenticatedV2InitialBindingInternal(
    validated.request,
    validated.binding,
    options,
  );
}

export function validateAuthenticatedV2InitialBindingReport(
  value: unknown,
  funding: ValidatedAuthenticatedV2FundingObservation,
  templates: AuthenticatedV2ContractTemplates,
): ValidatedAuthenticatedV2InitialBindingReport {
  const report = requireRecord(value, 'authenticated V2 initial-binding report');
  assertExactKeys(report, [
    'schema',
    'reportDigestHex',
    'status',
    'inputDigestHex',
    'environment',
    'identities',
    'compiler',
    'dependencyBinding',
    'fundingObservation',
    'resolvedContracts',
    'provisioningContracts',
    'authorization',
  ], 'authenticated V2 initial-binding report');
  if (report.schema !== AUTHENTICATED_V2_INITIAL_BINDING_REPORT_SCHEMA) {
    throw new Error(
      `initial-binding report schema must be ${AUTHENTICATED_V2_INITIAL_BINDING_REPORT_SCHEMA}`,
    );
  }
  if (report.status !== 'DERIVED') throw new Error('initial-binding report status must be DERIVED');
  const reportDigestHex = canonicalHash(
    report.reportDigestHex,
    'initial-binding report digest',
  );
  const { reportDigestHex: _discardedDigest, ...withoutDigest } = report;
  if (sha256Canonical(withoutDigest) !== reportDigestHex) {
    throw new Error('initial-binding report content does not match its report digest');
  }

  const environment = normalizeNonMainnetEnvironment(report.environment);
  if (environment !== funding.request.environment) {
    throw new Error('initial-binding environment does not match the funding observation');
  }
  const identities = requireRecord(report.identities, 'initial-binding identities');
  assertExactKeys(
    identities,
    ['trackerNftId', 'duplicatePreventionNftId'],
    'initial-binding identities',
  );
  const trackerNftId = canonicalId(identities.trackerNftId, 'initial-binding tracker NFT ID');
  const duplicatePreventionNftId = canonicalId(
    identities.duplicatePreventionNftId,
    'initial-binding DUP NFT ID',
  );
  if (trackerNftId !== funding.request.trackerFundingBoxId) {
    throw new Error('initial-binding tracker NFT ID does not match the funding observation');
  }
  if (duplicatePreventionNftId !== funding.request.dupVaultFundingBoxId) {
    throw new Error('initial-binding DUP NFT ID does not match the funding observation');
  }

  const compiler = requireRecord(report.compiler, 'initial-binding compiler');
  assertExactKeys(compiler, [
    'execution',
    'compilerLockDigestHex',
    'sourceBaselineDigestHex',
    'platform',
    'nodeVersion',
    'nodeExecutableSha256',
    'gitVersion',
    'gitExecutableSha256',
    'relayerPackageLockSha256',
    'ergoNodeBaseCommit',
    'consensusSourceLockSha256',
    'ergoPatchSha256',
    'sigmaStateVersion',
    'sigmaStateArtifactSha256',
    'runtimeBundleSha256',
    'runtimeClasspathSha256',
    'javaHomeSha256',
    'networkPrefix',
    'scriptVersion',
    'treeVersion',
    'identityDigestHex',
  ], 'initial-binding compiler');
  const compilerIdentityDigestHex = canonicalHash(
    compiler.identityDigestHex,
    'initial-binding compiler identity digest',
  );
  const { identityDigestHex: _discardedIdentityDigest, ...compilerIdentityValue } = compiler;
  const compilerIdentity = compilerIdentityValue as unknown as AuthenticatedV2InitialBindingCompilerIdentity;
  validateCompilerIdentity(compilerIdentity);
  if (sha256Canonical(compilerIdentity) !== compilerIdentityDigestHex) {
    throw new Error('initial-binding compiler identity does not match its digest');
  }

  const dependency = requireRecord(
    report.dependencyBinding,
    'initial-binding dependency binding',
  );
  assertExactKeys(dependency, [
    'compilerPasses',
    'trackerTreeStable',
    'unlockTreeStable',
    'fixedPointVerified',
    'authenticatedUnlockErgoTreeHashHex',
  ], 'initial-binding dependency binding');
  if (dependency.compilerPasses !== 3
    || dependency.trackerTreeStable !== true
    || dependency.unlockTreeStable !== true
    || dependency.fixedPointVerified !== true) {
    throw new Error('initial-binding report must retain the complete three-pass fixed point');
  }
  const authenticatedUnlockErgoTreeHashHex = canonicalHash(
    dependency.authenticatedUnlockErgoTreeHashHex,
    'initial-binding authenticated unlock ErgoTree hash',
  );

  const fundingObservation = requireRecord(
    report.fundingObservation,
    'initial-binding funding observation',
  );
  assertExactKeys(fundingObservation, [
    'status',
    'reportDigestHex',
    'snapshotDigestHex',
    'observedAt',
    'nodeNetwork',
    'tipHeight',
    'tipIdHex',
    'revalidationRequiredBeforeSetup',
  ], 'initial-binding funding observation');
  const expectedFundingObservation = {
    status: 'bound',
    ...funding.binding,
    revalidationRequiredBeforeSetup: true,
  };
  if (canonicalJson(fundingObservation) !== canonicalJson(expectedFundingObservation)) {
    throw new Error('initial-binding funding observation does not match the validated report');
  }

  validateTemplates(templates);
  const resolvedContracts = normalizeInitialBindingResolvedContracts(
    report.resolvedContracts,
  );
  const provisioningContracts = normalizeInitialBindingProvisioningContracts(
    report.provisioningContracts,
  );
  const contracts = Object.fromEntries(CONTRACT_ROLES.map(role => [role, {
    sourceTemplate: templates[role].sourceTemplate,
    sourceTemplateSha256Hex: provisioningContracts[role].sourceTemplateSha256Hex,
    ergoTreeHex: provisioningContracts[role].ergoTreeHex,
    ergoTreeSha256Hex: provisioningContracts[role].ergoTreeSha256Hex,
  }])) as unknown as AuthenticatedV2ContractInputs;
  const recomputedResolved = resolveAuthenticatedV2ContractSources(
    contracts,
    trackerNftId,
    duplicatePreventionNftId,
  );
  for (const role of CONTRACT_ROLES) {
    const expectedResolved = {
      templateSha256Hex: recomputedResolved[role].templateSha256Hex,
      resolvedSourceSha256Hex: recomputedResolved[role].resolvedSourceSha256Hex,
      ergoTreeHex: recomputedResolved[role].ergoTreeHex,
      ergoTreeSha256Hex: recomputedResolved[role].ergoTreeSha256Hex,
    };
    if (canonicalJson(resolvedContracts[role]) !== canonicalJson(expectedResolved)) {
      throw new Error(`initial-binding ${role} resolved contract does not match its inputs`);
    }
    const expectedProvisioning = {
      sourceTemplateSha256Hex: templates[role].sourceTemplateSha256Hex,
      ergoTreeHex: recomputedResolved[role].ergoTreeHex,
      ergoTreeSha256Hex: recomputedResolved[role].ergoTreeSha256Hex,
    };
    if (canonicalJson(provisioningContracts[role]) !== canonicalJson(expectedProvisioning)) {
      throw new Error(`initial-binding ${role} provisioning contract does not match its inputs`);
    }
  }
  if (recomputedResolved.authenticatedUnlockErgoTreeHashHex
    !== authenticatedUnlockErgoTreeHashHex) {
    throw new Error('initial-binding authenticated unlock ErgoTree hash does not match');
  }

  const inputDigestHex = canonicalHash(report.inputDigestHex, 'initial-binding input digest');
  const expectedInputDigestHex = sha256Canonical({
    schema: AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
    environment,
    trackerFundingBoxId: trackerNftId,
    dupVaultFundingBoxId: duplicatePreventionNftId,
    fundingObservation: funding.binding,
    sourceTemplateSha256: Object.fromEntries(CONTRACT_ROLES.map(role => [
      role,
      templates[role].sourceTemplateSha256Hex,
    ])),
  });
  if (inputDigestHex !== expectedInputDigestHex) {
    throw new Error('initial-binding input digest does not match the validated funding and templates');
  }

  assertExpectedBooleanRecord(report.authorization, {
    execute: false,
    sign: false,
    check: false,
    submit: false,
    broadcast: false,
    deploy: false,
    sidechainFinalityVerifiedOnErgo: false,
    gate5Closed: false,
    productionReady: false,
  }, 'initial-binding authorization');

  return deepFreeze({
    contracts,
    provenance: { reportDigestHex, inputDigestHex },
  });
}

async function deriveAuthenticatedV2InitialBindingInternal(
  request: AuthenticatedV2InitialBindingRequest,
  fundingObservation: AuthenticatedV2FundingObservationBinding | undefined,
  options: {
    templates: AuthenticatedV2ContractTemplates;
    compile: AuthenticatedV2InitialBindingCompiler;
  },
): Promise<AuthenticatedV2InitialBindingReport> {
  const environment = normalizeNonMainnetEnvironment(request.environment);
  const trackerNftId = canonicalId(request.trackerFundingBoxId, 'tracker funding box ID');
  const duplicatePreventionNftId = canonicalId(
    request.dupVaultFundingBoxId,
    'DUP/vault funding box ID',
  );
  if (trackerNftId === duplicatePreventionNftId) {
    throw new Error('tracker and DUP/vault funding box IDs must be distinct');
  }
  const normalizedFundingObservation = normalizeFundingObservationBinding(fundingObservation);
  validateTemplates(options.templates);

  const first = await compilePass(
    options.templates,
    SEED_TREES,
    trackerNftId,
    duplicatePreventionNftId,
    options.compile,
    1,
  );
  const second = await compilePass(
    options.templates,
    first.trees,
    trackerNftId,
    duplicatePreventionNftId,
    options.compile,
    2,
  );
  if (first.trees.tracker !== second.trees.tracker) {
    throw new Error('authenticated V2 tracker tree changed across dependency-binding passes');
  }
  if (first.trees.unlock !== second.trees.unlock) {
    throw new Error('authenticated V2 unlock tree changed across dependency-binding passes');
  }

  const third = await compilePass(
    options.templates,
    second.trees,
    trackerNftId,
    duplicatePreventionNftId,
    options.compile,
    3,
  );
  const identityDigestHex = sha256Canonical(first.run.identity);
  for (const [label, run] of [['second', second.run], ['third', third.run]] as const) {
    if (sha256Canonical(run.identity) !== identityDigestHex) {
      throw new Error(`authenticated V2 compiler identity changed during the ${label} binding pass`);
    }
  }
  for (const role of CONTRACT_ROLES) {
    if (second.trees[role] !== third.trees[role]) {
      throw new Error(`authenticated V2 ${role} tree did not reach a three-pass fixed point`);
    }
    if (
      second.resolved[role].resolvedSourceSha256Hex
      !== third.resolved[role].resolvedSourceSha256Hex
    ) {
      throw new Error(`authenticated V2 ${role} source did not reach a three-pass fixed point`);
    }
  }
  if (new Set(Object.values(third.trees)).size !== CONTRACT_ROLES.length) {
    throw new Error('authenticated V2 final tracker, unlock, and DUP ErgoTrees must be distinct');
  }

  const resolvedContracts = Object.fromEntries(CONTRACT_ROLES.map(role => [role, {
    templateSha256Hex: third.resolved[role].templateSha256Hex,
    resolvedSourceSha256Hex: third.resolved[role].resolvedSourceSha256Hex,
    ergoTreeHex: third.trees[role],
    ergoTreeSha256Hex: third.run.observation.contracts[role].ergoTreeSha256Hex,
  }])) as AuthenticatedV2InitialBindingReport['resolvedContracts'];
  const provisioningContracts = Object.fromEntries(CONTRACT_ROLES.map(role => [role, {
    sourceTemplateSha256Hex: third.resolved[role].templateSha256Hex,
    ergoTreeHex: third.trees[role],
    ergoTreeSha256Hex: third.run.observation.contracts[role].ergoTreeSha256Hex,
  }])) as AuthenticatedV2InitialBindingReport['provisioningContracts'];
  const inputDigestHex = sha256Canonical({
    schema: AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
    environment,
    trackerFundingBoxId: trackerNftId,
    dupVaultFundingBoxId: duplicatePreventionNftId,
    fundingObservation: normalizedFundingObservation,
    sourceTemplateSha256: Object.fromEntries(CONTRACT_ROLES.map(role => [
      role,
      options.templates[role].sourceTemplateSha256Hex,
    ])),
  });
  const withoutDigest: Omit<AuthenticatedV2InitialBindingReport, 'reportDigestHex'> = {
    schema: AUTHENTICATED_V2_INITIAL_BINDING_REPORT_SCHEMA,
    status: 'DERIVED' as const,
    inputDigestHex,
    environment,
    identities: { trackerNftId, duplicatePreventionNftId },
    compiler: { ...first.run.identity, identityDigestHex },
    dependencyBinding: {
      compilerPasses: 3 as const,
      trackerTreeStable: true as const,
      unlockTreeStable: true as const,
      fixedPointVerified: true as const,
      authenticatedUnlockErgoTreeHashHex: third.resolved.authenticatedUnlockErgoTreeHashHex,
    },
    fundingObservation: normalizedFundingObservation
      ? {
          status: 'bound' as const,
          ...normalizedFundingObservation,
          revalidationRequiredBeforeSetup: true as const,
        }
      : {
          status: 'unobserved' as const,
          revalidationRequiredBeforeSetup: true as const,
        },
    resolvedContracts,
    provisioningContracts,
    authorization: {
      execute: false as const,
      sign: false as const,
      check: false as const,
      submit: false as const,
      broadcast: false as const,
      deploy: false as const,
      sidechainFinalityVerifiedOnErgo: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  });
}

function normalizeFundingObservationBinding(
  value: AuthenticatedV2FundingObservationBinding | undefined,
): AuthenticatedV2FundingObservationBinding | undefined {
  if (value === undefined) return undefined;
  const reportDigestHex = canonicalHash(value.reportDigestHex, 'funding observation report digest');
  const snapshotDigestHex = canonicalHash(
    value.snapshotDigestHex,
    'funding observation snapshot digest',
  );
  const tipIdHex = canonicalId(value.tipIdHex, 'funding observation tip ID');
  if (!Number.isSafeInteger(value.tipHeight) || value.tipHeight < 0) {
    throw new Error('funding observation tip height must be a non-negative safe integer');
  }
  if (typeof value.nodeNetwork !== 'string'
    || !/^(?:testnet|devnet|local|development)$/.test(value.nodeNetwork)) {
    throw new Error('funding observation node network must be a canonical non-mainnet network');
  }
  if (typeof value.observedAt !== 'string') {
    throw new Error('funding observation timestamp must be canonical ISO-8601');
  }
  const parsedTimestamp = new Date(value.observedAt);
  if (Number.isNaN(parsedTimestamp.getTime()) || parsedTimestamp.toISOString() !== value.observedAt) {
    throw new Error('funding observation timestamp must be canonical ISO-8601');
  }
  return {
    reportDigestHex,
    snapshotDigestHex,
    observedAt: value.observedAt,
    nodeNetwork: value.nodeNetwork,
    tipHeight: value.tipHeight,
    tipIdHex,
  };
}

export function initialBindingCompilerRunFromPinnedJvm(
  run: PinnedAuthenticatedV2CompilerRun,
): AuthenticatedV2InitialBindingCompilerRun {
  const identity: AuthenticatedV2InitialBindingCompilerIdentity = {
    execution: 'pinned-resolver-free-jvm',
    compilerLockDigestHex: sha256Canonical(run.lock),
    sourceBaselineDigestHex: sha256Canonical(run.sourceBaseline),
    platform: run.lock.platform,
    nodeVersion: run.parentRuntime.nodeVersion,
    nodeExecutableSha256: run.parentRuntime.nodeExecutableSha256,
    gitVersion: run.parentRuntime.gitVersion,
    gitExecutableSha256: run.parentRuntime.gitExecutableSha256,
    relayerPackageLockSha256: run.parentRuntime.relayerPackageLockSha256,
    ergoNodeBaseCommit: run.lock.ergoNodeBaseCommit,
    consensusSourceLockSha256: run.lock.consensusSourceLockSha256,
    ergoPatchSha256: run.lock.ergoPatchSha256,
    sigmaStateVersion: run.lock.sigmaStateVersion,
    sigmaStateArtifactSha256: run.observation.metadata.sigmaStateArtifactSha256,
    runtimeBundleSha256: run.lock.runtimeBundleSha256,
    runtimeClasspathSha256: run.observation.metadata.runtimeClasspathSha256,
    javaHomeSha256: run.observation.metadata.javaHomeSha256,
    networkPrefix: run.observation.metadata.networkPrefix,
    scriptVersion: run.observation.metadata.scriptVersion,
    treeVersion: run.observation.metadata.treeVersion,
  };
  validateCompilerIdentity(identity);
  return deepFreeze({ identity, observation: { contracts: run.observation.contracts } });
}

async function compilePass(
  templates: AuthenticatedV2ContractTemplates,
  expectedTrees: AuthenticatedV2ContractTrees,
  trackerNftId: string,
  duplicatePreventionNftId: string,
  compile: AuthenticatedV2InitialBindingCompiler,
  pass: number,
) {
  const inputs = buildAuthenticatedV2ContractInputs(templates, expectedTrees);
  const resolved = resolveAuthenticatedV2ContractSources(
    inputs,
    trackerNftId,
    duplicatePreventionNftId,
  );
  const run = await compile(resolved);
  validateCompilerIdentity(run.identity);
  const trees = {} as AuthenticatedV2ContractTrees;
  for (const role of CONTRACT_ROLES) {
    const observed = run.observation.contracts[role];
    if (!observed || observed.role !== role) {
      throw new Error(`authenticated V2 compiler pass ${pass} ${role} observation is missing or misordered`);
    }
    if (observed.resolvedSourceSha256Hex !== resolved[role].resolvedSourceSha256Hex) {
      throw new Error(`authenticated V2 compiler pass ${pass} ${role} compiled source hash does not match`);
    }
    const tree = variableLowerHex(observed.ergoTreeHex, `compiler pass ${pass} ${role} ErgoTree`);
    const treeHash = canonicalHash(
      observed.ergoTreeSha256Hex,
      `compiler pass ${pass} ${role} ErgoTree SHA-256`,
    );
    if (sha256Bytes(Buffer.from(tree, 'hex')) !== treeHash) {
      throw new Error(`authenticated V2 compiler pass ${pass} ${role} ErgoTree hash does not match`);
    }
    trees[role] = tree;
  }
  return { resolved, run, trees };
}

function normalizeInitialBindingResolvedContracts(
  value: unknown,
): Record<ContractRole, ProvisioningContractBinding> {
  const records = requireRecord(value, 'initial-binding resolved contracts');
  assertExactKeys(records, [...CONTRACT_ROLES], 'initial-binding resolved contracts');
  return Object.fromEntries(CONTRACT_ROLES.map(role => {
    const binding = requireRecord(
      records[role],
      `initial-binding resolved contract ${role}`,
    );
    assertExactKeys(binding, [
      'templateSha256Hex',
      'resolvedSourceSha256Hex',
      'ergoTreeHex',
      'ergoTreeSha256Hex',
    ], `initial-binding resolved contract ${role}`);
    const ergoTreeHex = variableLowerHex(
      binding.ergoTreeHex,
      `initial-binding resolved contract ${role} ErgoTree`,
    );
    const ergoTreeSha256Hex = canonicalHash(
      binding.ergoTreeSha256Hex,
      `initial-binding resolved contract ${role} ErgoTree SHA-256`,
    );
    if (sha256Bytes(Buffer.from(ergoTreeHex, 'hex')) !== ergoTreeSha256Hex) {
      throw new Error(`initial-binding resolved contract ${role} ErgoTree hash does not match`);
    }
    return [role, {
      templateSha256Hex: canonicalHash(
        binding.templateSha256Hex,
        `initial-binding resolved contract ${role} template SHA-256`,
      ),
      resolvedSourceSha256Hex: canonicalHash(
        binding.resolvedSourceSha256Hex,
        `initial-binding resolved contract ${role} source SHA-256`,
      ),
      ergoTreeHex,
      ergoTreeSha256Hex,
    }];
  })) as Record<ContractRole, ProvisioningContractBinding>;
}

function normalizeInitialBindingProvisioningContracts(
  value: unknown,
): AuthenticatedV2InitialBindingReport['provisioningContracts'] {
  const records = requireRecord(value, 'initial-binding provisioning contracts');
  assertExactKeys(records, [...CONTRACT_ROLES], 'initial-binding provisioning contracts');
  return Object.fromEntries(CONTRACT_ROLES.map(role => {
    const binding = requireRecord(
      records[role],
      `initial-binding provisioning contract ${role}`,
    );
    assertExactKeys(binding, [
      'sourceTemplateSha256Hex',
      'ergoTreeHex',
      'ergoTreeSha256Hex',
    ], `initial-binding provisioning contract ${role}`);
    const ergoTreeHex = variableLowerHex(
      binding.ergoTreeHex,
      `initial-binding provisioning contract ${role} ErgoTree`,
    );
    const ergoTreeSha256Hex = canonicalHash(
      binding.ergoTreeSha256Hex,
      `initial-binding provisioning contract ${role} ErgoTree SHA-256`,
    );
    if (sha256Bytes(Buffer.from(ergoTreeHex, 'hex')) !== ergoTreeSha256Hex) {
      throw new Error(`initial-binding provisioning contract ${role} ErgoTree hash does not match`);
    }
    return [role, {
      sourceTemplateSha256Hex: canonicalHash(
        binding.sourceTemplateSha256Hex,
        `initial-binding provisioning contract ${role} template SHA-256`,
      ),
      ergoTreeHex,
      ergoTreeSha256Hex,
    }];
  })) as AuthenticatedV2InitialBindingReport['provisioningContracts'];
}

function assertExpectedBooleanRecord(
  value: unknown,
  expected: Record<string, boolean>,
  label: string,
): void {
  const record = requireRecord(value, label);
  assertExactKeys(record, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) {
      throw new Error(`${label}.${key} must be ${expectedValue}`);
    }
  }
}

function requireRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function assertExactKeys(
  value: Record<string, any>,
  expected: string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}

function validateTemplates(templates: AuthenticatedV2ContractTemplates): void {
  for (const role of CONTRACT_ROLES) {
    const template = templates[role];
    if (!template || typeof template.sourceTemplate !== 'string' || template.sourceTemplate.length === 0) {
      throw new Error(`authenticated V2 ${role} source template must be non-empty`);
    }
    const expected = canonicalHash(
      template.sourceTemplateSha256Hex,
      `authenticated V2 ${role} template SHA-256`,
    );
    if (sha256Utf8(template.sourceTemplate) !== expected) {
      throw new Error(`authenticated V2 ${role} source template does not match its SHA-256 pin`);
    }
  }
}

function validateCompilerIdentity(identity: AuthenticatedV2InitialBindingCompilerIdentity): void {
  if (identity.execution !== 'pinned-resolver-free-jvm') {
    throw new Error('authenticated V2 initial binding requires the pinned resolver-free JVM compiler');
  }
  for (const [label, value, bytes] of [
    ['compiler lock digest', identity.compilerLockDigestHex, 32],
    ['source baseline digest', identity.sourceBaselineDigestHex, 32],
    ['node executable SHA-256', identity.nodeExecutableSha256, 32],
    ['Git executable SHA-256', identity.gitExecutableSha256, 32],
    ['relayer package-lock SHA-256', identity.relayerPackageLockSha256, 32],
    ['Ergo base commit', identity.ergoNodeBaseCommit, 20],
    ['consensus source lock SHA-256', identity.consensusSourceLockSha256, 32],
    ['Ergo patch SHA-256', identity.ergoPatchSha256, 32],
    ['sigma-state artifact SHA-256', identity.sigmaStateArtifactSha256, 32],
    ['runtime bundle SHA-256', identity.runtimeBundleSha256, 32],
    ['runtime classpath SHA-256', identity.runtimeClasspathSha256, 32],
    ['Java home SHA-256', identity.javaHomeSha256, 32],
  ] as const) canonicalFixedHex(value, bytes, label);
  for (const [label, value] of [
    ['platform', identity.platform],
    ['Node version', identity.nodeVersion],
    ['Git version', identity.gitVersion],
    ['sigma-state version', identity.sigmaStateVersion],
  ] as const) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`authenticated V2 compiler ${label} must be non-empty`);
    }
  }
  for (const [label, value] of [
    ['network prefix', identity.networkPrefix],
    ['script version', identity.scriptVersion],
    ['tree version', identity.treeVersion],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`authenticated V2 compiler ${label} must be a nonnegative safe integer`);
    }
  }
}

function normalizeNonMainnetEnvironment(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:local|development|devnet|patched-devnet|testnet)$/.test(value)) {
    throw new Error('authenticated V2 initial binding requires an explicit canonical non-mainnet environment');
  }
  return value;
}

function canonicalId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical lowercase 32-byte hex`);
  }
  return value;
}

function canonicalHash(value: unknown, label: string): string {
  return canonicalFixedHex(value, 32, label);
}

function canonicalFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function variableLowerHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty canonical lowercase byte hex`);
  }
  return value;
}

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256Utf8(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('initial binding report cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )).join(',')}}`;
  }
  throw new Error(`initial binding report cannot serialize ${typeof value}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
