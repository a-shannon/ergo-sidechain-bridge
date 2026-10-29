import { isAbsolute, resolve } from 'node:path';

import {
  captureV4BuildDependencies, rootsOverlap,
  type V4DependencyCaptureInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import {
  captureV4PostBuildPhysicalTree,
  type V4PostBuildPhysicalCapture,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-capture.js';
import {
  assertSameV4PhysicalPlanSnapshot, snapshotV4PhysicalPlan,
  type V4PhysicalPlanSnapshot,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';
import {
  inspectV4NodeBuildPreflightWithPlan,
  type V4NodeBuildPreflightInput,
  type V4NodeBuildPreflightObservation,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js';
import {
  V4_GENERATED_OUTPUT_ROOTS,
  type V4GeneratedOutputRoot, type V4PostBuildCap, type V4PostBuildCaps,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';

export const V4_PREENTRY_DIAGNOSTIC_STAGES = Object.freeze([
  'CAPS_COPY', 'ROOTS', 'MEMBERSHIP_CAP', 'PREFLIGHT', 'PLAN_SNAPSHOT',
  'PHYSICAL_BEFORE', 'PLAN_COMPARE', 'DEPENDENCIES', 'LOCK_COMPARE',
] as const);
export type V4PreentryDiagnosticStage = typeof V4_PREENTRY_DIAGNOSTIC_STAGES[number];

export interface V4BuildPreentryInput extends V4NodeBuildPreflightInput,
  Omit<V4DependencyCaptureInput, 'bridgeRoot'> {
  readonly caps: Readonly<V4PostBuildCaps>;
  readonly maxMembershipBytes: number;
}

export interface V4BuildPreentry {
  readonly schema: 'substrate-federated-isolated-devnet-node-build-v4-preentry';
  readonly sourceOnlyPreparation: true;
  readonly resolverExecuted: false;
  readonly buildExecuted: false;
  readonly campaignAdmitted: false;
  readonly preflight: Readonly<V4NodeBuildPreflightObservation>;
  readonly planSnapshot: Readonly<V4PhysicalPlanSnapshot>;
  readonly prebuild: Readonly<V4PostBuildPhysicalCapture>;
  readonly dependencies: Readonly<{
    lockSha256Hex: string;
    mirrorReceiptSha256Hex: string;
    leveldbReceiptSha256Hex: string;
    mirrorMetadataSha256Hex: string;
    mirrorFileCount: number;
    mirrorBytes: number;
    bootJarFrameSha256Hex: string;
    bootFileCount: number;
    bootBytes: number;
    leveldbAggregateSha256Hex: string;
    leveldbFileCount: number;
    leveldbBytes: number;
  }>;
  readonly caps: Readonly<V4PostBuildCaps>;
  readonly maxMembershipBytes: number;
}

function fail(reason: string): never {
  throw new Error('V4 build preentry: ' + reason);
}

function capCopy(value: Readonly<V4PostBuildCap>): Readonly<V4PostBuildCap> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== 'maxBytes\0maxDirectories\0maxFiles'
      || !Number.isSafeInteger(value.maxFiles) || value.maxFiles < 0
      || !Number.isSafeInteger(value.maxDirectories) || value.maxDirectories < 0
      || !Number.isSafeInteger(value.maxBytes) || value.maxBytes < 0) {
    fail('explicit output cap differs');
  }
  return Object.freeze({
    maxFiles: value.maxFiles, maxDirectories: value.maxDirectories, maxBytes: value.maxBytes,
  });
}

function capsCopy(value: Readonly<V4PostBuildCaps>): Readonly<V4PostBuildCaps> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || !value.roots || typeof value.roots !== 'object' || Array.isArray(value.roots)
      || Object.keys(value.roots).sort().join('\0')
        !== [...V4_GENERATED_OUTPUT_ROOTS].sort().join('\0')) {
    fail('exact six-root caller caps are required');
  }
  const roots = {} as Record<V4GeneratedOutputRoot, Readonly<V4PostBuildCap>>;
  for (const root of V4_GENERATED_OUTPUT_ROOTS) roots[root] = capCopy(value.roots[root]);
  return Object.freeze({ roots: Object.freeze(roots), total: capCopy(value.total) });
}

function assertDistinctRoots(input: Readonly<V4BuildPreentryInput>): void {
  const roots = [
    input.bridgeRoot, input.sourcePath, input.gitHomePath,
    input.mirrorRoot, input.bootRoot, input.leveldbRoot,
  ];
  if (roots.some(root => typeof root !== 'string' || !isAbsolute(root))) {
    fail('all owned roots must be absolute');
  }
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      if (rootsOverlap(roots[i]!, roots[j]!)) fail('owned roots overlap');
    }
  }
  for (const receipt of [input.mirrorReceiptPath, input.leveldbReceiptPath]) {
    if (typeof receipt !== 'string' || !isAbsolute(receipt)
        || roots.some(root => rootsOverlap(receipt, root))) {
      fail('receipt overlaps an owned root');
    }
  }
  if (resolve(input.mirrorReceiptPath).toLowerCase()
        !== (resolve(input.mirrorRoot) + '.json').toLowerCase()
      || resolve(input.leveldbReceiptPath).toLowerCase()
        !== (resolve(input.leveldbRoot) + '.json').toLowerCase()
      || rootsOverlap(input.mirrorReceiptPath, input.leveldbReceiptPath)) {
    fail('dependency receipt location differs');
  }
}

function immutableCapture(capture: Readonly<V4PostBuildPhysicalCapture>):
  Readonly<V4PostBuildPhysicalCapture> {
  return Object.freeze({
    rootIdentity: capture.rootIdentity,
    gitRootIdentity: capture.gitRootIdentity,
    entries: Object.freeze(capture.entries.map(entry => Object.freeze({ ...entry }))),
    membership: capture.membership,
  });
}

// This joins source-only observations. A later builder must independently reclose the
// same inputs around its Job and must never treat this return as build authority.
export async function inspectV4BuildPreentry(
  input: Readonly<V4BuildPreentryInput>,
  onStage?: (stage: V4PreentryDiagnosticStage) => void,
): Promise<Readonly<V4BuildPreentry>> {
  const lockSelection = input.lockSelection;
  const reportStage = (stage: V4PreentryDiagnosticStage): void => {
    if (lockSelection === 'v5-source59') onStage?.(stage);
  };
  reportStage('CAPS_COPY');
  const stableInput: Readonly<V4BuildPreentryInput> = Object.freeze({
    bridgeRoot: input.bridgeRoot,
    lockSelection,
    sourcePath: input.sourcePath,
    gitHomePath: input.gitHomePath,
    gitExecutablePath: input.gitExecutablePath,
    mirrorRoot: input.mirrorRoot,
    mirrorReceiptPath: input.mirrorReceiptPath,
    bootRoot: input.bootRoot,
    leveldbRoot: input.leveldbRoot,
    leveldbReceiptPath: input.leveldbReceiptPath,
    caps: capsCopy(input.caps),
    maxMembershipBytes: input.maxMembershipBytes,
  });
  reportStage('ROOTS');
  assertDistinctRoots(stableInput);
  reportStage('MEMBERSHIP_CAP');
  if (!Number.isSafeInteger(stableInput.maxMembershipBytes)
      || stableInput.maxMembershipBytes <= 0) {
    fail('explicit membership byte cap is required');
  }
  reportStage('PREFLIGHT');
  const preflight = await inspectV4NodeBuildPreflightWithPlan(stableInput);
  const preflightObservation = Object.freeze({ ...preflight.observation });
  reportStage('PLAN_SNAPSHOT');
  const planSnapshot = snapshotV4PhysicalPlan(preflight.physicalPlan);
  reportStage('PHYSICAL_BEFORE');
  const prebuild = immutableCapture(await captureV4PostBuildPhysicalTree({
    sourceRoot: resolve(stableInput.sourcePath), plan: preflight.physicalPlan,
    caps: stableInput.caps, phase: 'before',
    maxMembershipBytes: stableInput.maxMembershipBytes,
  }));
  reportStage('PLAN_COMPARE');
  assertSameV4PhysicalPlanSnapshot(planSnapshot, preflight.physicalPlan);
  reportStage('DEPENDENCIES');
  const dependencies = await captureV4BuildDependencies(stableInput);
  reportStage('PLAN_COMPARE');
  assertSameV4PhysicalPlanSnapshot(planSnapshot, preflight.physicalPlan);
  reportStage('LOCK_COMPARE');
  if (preflightObservation.lockSha256Hex !== dependencies.lockSha256Hex) {
    fail('preflight and dependency build locks differ');
  }
  return Object.freeze({
    schema: 'substrate-federated-isolated-devnet-node-build-v4-preentry' as const,
    sourceOnlyPreparation: true as const,
    resolverExecuted: false as const,
    buildExecuted: false as const,
    campaignAdmitted: false as const,
    preflight: preflightObservation,
    planSnapshot: Object.freeze({ ...planSnapshot }),
    prebuild,
    dependencies: Object.freeze({
      lockSha256Hex: dependencies.lockSha256Hex,
      mirrorReceiptSha256Hex: dependencies.mirrorReceiptSha256Hex,
      leveldbReceiptSha256Hex: dependencies.leveldbReceiptSha256Hex,
      mirrorMetadataSha256Hex: dependencies.mirror.metadataSha256Hex,
      mirrorFileCount: dependencies.mirror.files.length,
      mirrorBytes: dependencies.mirror.bytes,
      bootJarFrameSha256Hex: dependencies.bootJarFrameSha256Hex,
      bootFileCount: dependencies.boot.files.length,
      bootBytes: dependencies.boot.bytes,
      leveldbAggregateSha256Hex: dependencies.leveldbAggregateSha256Hex,
      leveldbFileCount: dependencies.leveldb.files.length,
      leveldbBytes: dependencies.leveldb.bytes,
    }),
    caps: stableInput.caps, maxMembershipBytes: stableInput.maxMembershipBytes,
  });
}
