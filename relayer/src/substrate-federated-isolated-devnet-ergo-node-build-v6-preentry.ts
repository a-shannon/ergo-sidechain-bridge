import { isAbsolute, resolve } from 'node:path';

import {
  captureV6BuildDependencies, rootsOverlap,
  selectV6DependencyPathsNonAuthorizing,
  type V6DependencyCaptureInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import {
  captureV4PostBuildPhysicalTree, type V4PostBuildPhysicalCapture,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-capture.js';
import {
  assertSameV4PhysicalPlanSnapshot, snapshotV4PhysicalPlan,
  type V4PhysicalPlanSnapshot,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';
import {
  inspectV6NodeBuildPreflightWithPlan,
  type V4NodeBuildPreflightObservation, type V6NodeBuildPreflightInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js';
import {
  V4_GENERATED_OUTPUT_ROOTS,
  type V4GeneratedOutputRoot, type V4PostBuildCap, type V4PostBuildCaps,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';

const MAX_OUTPUT_FILES = 50_000;
const MAX_OUTPUT_DIRECTORIES = 4_096;
const MAX_OUTPUT_BYTES = 536_870_912;
const MAX_MEMBERSHIP_BYTES = 16_777_216;

export interface V6BuildPreentryInput extends V6NodeBuildPreflightInput,
  Omit<V6DependencyCaptureInput, 'bridgeRoot' | 'lockSelection'> {
  readonly caps: Readonly<V4PostBuildCaps>;
  readonly maxMembershipBytes: number;
}

export interface V6BuildPreentry {
  readonly schema: 'substrate-federated-isolated-devnet-node-build-v6-preentry';
  readonly sourceOnly: true;
  readonly resolverExecuted: false;
  readonly buildExecuted: false;
  readonly bridgeHeadBound: false;
  readonly campaignAdmitted: false;
  readonly externalAcceptanceEstablished: false;
  readonly preflight: Readonly<V4NodeBuildPreflightObservation>;
  readonly planSnapshot: Readonly<V4PhysicalPlanSnapshot>;
  readonly prebuild: Readonly<V4PostBuildPhysicalCapture>;
  readonly dependencies: Readonly<{
    readonly lockSha256Hex: string;
    readonly mirrorReceiptSha256Hex: string;
    readonly mavenTerminalSha256Hex: string;
    readonly leveldbReceiptSha256Hex: string;
    readonly leveldbTerminalSha256Hex: string;
    readonly mirrorMetadataSha256Hex: string;
    readonly mirrorFileCount: number;
    readonly mirrorBytes: number;
    readonly bootJarFrameSha256Hex: string;
    readonly bootFileCount: number;
    readonly bootBytes: number;
    readonly leveldbAggregateSha256Hex: string;
    readonly leveldbFileCount: number;
    readonly leveldbBytes: number;
  }>;
  readonly caps: Readonly<V4PostBuildCaps>;
  readonly maxMembershipBytes: number;
}

function fail(reason: string): never {
  throw new Error('V6 build preentry: ' + reason);
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
    maxFiles: value.maxFiles, maxDirectories: value.maxDirectories,
    maxBytes: value.maxBytes,
  });
}
function capsCopy(value: Readonly<V4PostBuildCaps>): Readonly<V4PostBuildCaps> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || !value.roots || typeof value.roots !== 'object' || Array.isArray(value.roots)
      || Object.keys(value).sort().join('\0') !== 'roots\0total'
      || Object.keys(value.roots).sort().join('\0')
        !== [...V4_GENERATED_OUTPUT_ROOTS].sort().join('\0')) {
    fail('exact six-root caller caps are required');
  }
  const total = capCopy(value.total);
  if (total.maxFiles > MAX_OUTPUT_FILES
      || total.maxDirectories > MAX_OUTPUT_DIRECTORIES
      || total.maxBytes > MAX_OUTPUT_BYTES) {
    fail('approved V6 output cap differs');
  }
  const roots = {} as Record<V4GeneratedOutputRoot, Readonly<V4PostBuildCap>>;
  for (const root of V4_GENERATED_OUTPUT_ROOTS) {
    const cap = capCopy(value.roots[root]);
    if (cap.maxFiles > total.maxFiles
        || cap.maxDirectories > total.maxDirectories
        || cap.maxBytes > total.maxBytes) {
      fail('V6 root cap exceeds total cap');
    }
    roots[root] = cap;
  }
  return Object.freeze({ roots: Object.freeze(roots), total });
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

/** Validates only literal input, roots and caps; no file or build authority. */
export function selectV6BuildPreentryInputNonAuthorizing(
  input: Readonly<V6BuildPreentryInput>,
): Readonly<{
  preflight: Readonly<V6NodeBuildPreflightInput>;
  dependencies: Readonly<V6DependencyCaptureInput>;
  caps: Readonly<V4PostBuildCaps>;
  maxMembershipBytes: number;
}> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join('\0') !== [
        'bootRoot', 'bridgeRoot', 'caps', 'gitExecutablePath', 'gitHomePath',
        'leveldbReceiptPath', 'leveldbRoot', 'lockSelection',
        'mavenNamespaceRoot', 'maxMembershipBytes', 'mirrorRoot',
        'sourcePath', 'v6MavenSourceRoot',
      ].sort().join('\0') || input.lockSelection !== 'v6-current') {
    fail('explicit V6 input fields or lock selection differ');
  }
  const caps = capsCopy(input.caps);
  if (!Number.isSafeInteger(input.maxMembershipBytes)
      || input.maxMembershipBytes <= 0
      || input.maxMembershipBytes > MAX_MEMBERSHIP_BYTES) {
    fail('explicit V6 membership cap differs');
  }
  const ownedRoots = [input.bridgeRoot, input.sourcePath, input.gitHomePath,
    input.mirrorRoot, input.bootRoot, input.leveldbRoot];
  if (ownedRoots.some(root => typeof root !== 'string' || !isAbsolute(root))
      || typeof input.mavenNamespaceRoot !== 'string'
      || !isAbsolute(input.mavenNamespaceRoot)
      || typeof input.v6MavenSourceRoot !== 'string'
      || !isAbsolute(input.v6MavenSourceRoot)) {
    fail('all V6 roots must be absolute');
  }
  for (let i = 0; i < ownedRoots.length; i++) {
    for (let j = i + 1; j < ownedRoots.length; j++) {
      if (rootsOverlap(ownedRoots[i]!, ownedRoots[j]!)) fail('owned V6 roots overlap');
    }
  }
  for (const root of [input.bridgeRoot, input.sourcePath, input.gitHomePath,
    input.mirrorRoot]) {
    if (rootsOverlap(root, input.mavenNamespaceRoot)) fail('V6 namespace overlaps an owned root');
  }
  for (const root of [...ownedRoots, input.mavenNamespaceRoot]) {
    if (rootsOverlap(root, input.v6MavenSourceRoot)) {
      fail('V6 Maven source overlaps an owned root');
    }
  }
  const dependencies: Readonly<V6DependencyCaptureInput> = Object.freeze({
    bridgeRoot: input.bridgeRoot, lockSelection: 'v6-current' as const,
    mavenNamespaceRoot: input.mavenNamespaceRoot,
    v6MavenSourceRoot: input.v6MavenSourceRoot,
    mirrorRoot: input.mirrorRoot, bootRoot: input.bootRoot,
    leveldbRoot: input.leveldbRoot,
    leveldbReceiptPath: input.leveldbReceiptPath,
  });
  selectV6DependencyPathsNonAuthorizing(dependencies);
  return Object.freeze({
    preflight: Object.freeze({
      bridgeRoot: input.bridgeRoot, sourcePath: input.sourcePath,
      gitHomePath: input.gitHomePath,
      gitExecutablePath: input.gitExecutablePath,
      lockSelection: 'v6-current' as const,
    }),
    dependencies, caps, maxMembershipBytes: input.maxMembershipBytes,
  });
}

/** Actual V6 source-only preentry. A later builder must reclose these inputs. */
export async function inspectV6BuildPreentry(
  input: Readonly<V6BuildPreentryInput>,
): Promise<Readonly<V6BuildPreentry>> {
  const selected = selectV6BuildPreentryInputNonAuthorizing(input);
  const preflight = await inspectV6NodeBuildPreflightWithPlan(selected.preflight);
  const preflightObservation = Object.freeze({ ...preflight.observation });
  const planSnapshot = snapshotV4PhysicalPlan(preflight.physicalPlan);
  const prebuild = immutableCapture(await captureV4PostBuildPhysicalTree({
    sourceRoot: resolve(selected.preflight.sourcePath),
    plan: preflight.physicalPlan, caps: selected.caps, phase: 'before',
    maxMembershipBytes: selected.maxMembershipBytes,
  }));
  assertSameV4PhysicalPlanSnapshot(planSnapshot, preflight.physicalPlan);
  const dependencies = await captureV6BuildDependencies(selected.dependencies);
  assertSameV4PhysicalPlanSnapshot(planSnapshot, preflight.physicalPlan);
  if (preflightObservation.lockSha256Hex !== dependencies.lockSha256Hex
      || dependencies.sourceOnly !== true || dependencies.campaignAdmitted !== false) {
    fail('preflight and V6 dependency selection differ');
  }
  return Object.freeze({
    schema: 'substrate-federated-isolated-devnet-node-build-v6-preentry' as const,
    sourceOnly: true as const, resolverExecuted: false as const,
    buildExecuted: false as const, bridgeHeadBound: false as const,
    campaignAdmitted: false as const, externalAcceptanceEstablished: false as const,
    preflight: preflightObservation,
    planSnapshot: Object.freeze({ ...planSnapshot }), prebuild,
    dependencies: Object.freeze({
      lockSha256Hex: dependencies.lockSha256Hex,
      mirrorReceiptSha256Hex: dependencies.mirrorReceiptSha256Hex,
      mavenTerminalSha256Hex: dependencies.mavenTerminalSha256Hex,
      leveldbReceiptSha256Hex: dependencies.leveldbReceiptSha256Hex,
      leveldbTerminalSha256Hex: dependencies.leveldbTerminalSha256Hex,
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
    caps: selected.caps, maxMembershipBytes: selected.maxMembershipBytes,
  });
}
