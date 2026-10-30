import path, { delimiter } from 'node:path';

import type {
  BoundedProcessInput,
  BoundedProcessResult,
} from '../bounded-process-runner.js';
import {
  validateWasmAvlBuildToolHashV2,
  type WasmAvlBuildToolNameV2,
} from '../substrate-federated-native-wasm-avl-build-tool-pins-v1.js';
import type {
  SubstrateFederatedNativeWasmAvlPackageIdentityV1,
} from '../substrate-federated-native-wasm-avl-package-v1.js';

export interface WasmAvlBuildPipelinePlanV2 {
  readonly executable: 'wasm-pack';
  readonly args: readonly [
    'build', '--target', 'nodejs', '--no-opt', '--mode', 'no-install',
  ];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface WasmAvlBuildPipelineToolV2 {
  readonly path: string;
  readonly sha256Hex: string;
  readonly version: string;
}

export interface WasmAvlBuildPipelineToolsV2 {
  readonly wasmPack: WasmAvlBuildPipelineToolV2;
  readonly wasmBindgen: WasmAvlBuildPipelineToolV2;
  readonly rustc: WasmAvlBuildPipelineToolV2;
  readonly cargo: WasmAvlBuildPipelineToolV2;
}

export interface WasmAvlBuildPipelineDependenciesV2 {
  readonly fingerprintSource: (bridgeRoot: string) => string;
  readonly inspectBuildTools: () => Promise<Readonly<WasmAvlBuildPipelineToolsV2>>;
  readonly runBoundedProcess: (
    input: BoundedProcessInput,
  ) => Promise<BoundedProcessResult>;
  readonly assertPackageSmoke: (
    bridgeRoot: string,
  ) => Readonly<SubstrateFederatedNativeWasmAvlPackageIdentityV1>;
  readonly emitBuildOutput?: (result: Readonly<BoundedProcessResult>) => void;
}

const EXPECTED_BUILD_ARGS = Object.freeze([
  'build', '--target', 'nodejs', '--no-opt', '--mode', 'no-install',
]);
const WASM_BUILD_TIMEOUT_MS = 15 * 60_000;
const WASM_BUILD_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const PROCESS_TERMINATION_GRACE_MS = 5_000;

function normalizePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function assertNoInstallOfflinePlan(
  plan: Readonly<WasmAvlBuildPipelinePlanV2>,
): void {
  if (plan.executable !== 'wasm-pack'
    || plan.args.length !== EXPECTED_BUILD_ARGS.length
    || plan.args.some((arg, index) => arg !== EXPECTED_BUILD_ARGS[index])
    || plan.env.CARGO_NET_OFFLINE !== 'true'
    || plan.env.RUSTUP_AUTO_INSTALL !== '0'
    || plan.env.WASM_PACK_CACHE !== path.resolve(
      plan.cwd,
      'target',
      'wasm-pack-cache',
    )) {
    throw new Error('WASM AVL build plan is not pinned to offline no-install mode');
  }
}

function buildExecutionEnvironment(
  env: NodeJS.ProcessEnv,
  tools: Readonly<WasmAvlBuildPipelineToolsV2>,
): NodeJS.ProcessEnv {
  const pathValue = env.PATH ?? env.Path;
  if (!pathValue) throw new Error('WASM AVL build requires PATH');
  const entries = [
    path.dirname(tools.wasmBindgen.path),
    path.dirname(tools.rustc.path),
    path.dirname(tools.cargo.path),
    path.dirname(tools.wasmPack.path),
    ...pathValue.split(delimiter).filter(Boolean),
  ];
  const seen = new Set<string>();
  const uniqueEntries = entries.filter(entry => {
    const key = normalizePath(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Object.freeze({ ...env, PATH: uniqueEntries.join(delimiter) });
}

function validateReviewedToolHashes(
  tools: Readonly<WasmAvlBuildPipelineToolsV2>,
): void {
  for (const name of ['wasmPack', 'wasmBindgen', 'rustc', 'cargo'] as const) {
    validateWasmAvlBuildToolHashV2(name satisfies WasmAvlBuildToolNameV2, tools[name].sha256Hex);
  }
}

function assertSameBuildTools(
  before: Readonly<WasmAvlBuildPipelineToolsV2>,
  after: Readonly<WasmAvlBuildPipelineToolsV2>,
): void {
  for (const name of ['wasmPack', 'wasmBindgen', 'rustc', 'cargo'] as const) {
    const left = before[name];
    const right = after[name];
    if (left.path !== right.path || left.sha256Hex !== right.sha256Hex
      || left.version !== right.version) {
      throw new Error('WASM AVL build tools changed during the source build');
    }
  }
}

export async function runWasmAvlBuildPipelineV2(
  bridgeRoot: string,
  plan: Readonly<WasmAvlBuildPipelinePlanV2>,
  dependencies: Readonly<WasmAvlBuildPipelineDependenciesV2>,
): Promise<Readonly<{
  packageIdentity: SubstrateFederatedNativeWasmAvlPackageIdentityV1;
  tools: WasmAvlBuildPipelineToolsV2;
}>> {
  assertNoInstallOfflinePlan(plan);
  const sourceBefore = dependencies.fingerprintSource(bridgeRoot);
  const toolsBefore = await dependencies.inspectBuildTools();
  validateReviewedToolHashes(toolsBefore);
  const result = await dependencies.runBoundedProcess({
    executablePath: toolsBefore.wasmPack.path,
    args: [...plan.args],
    cwd: plan.cwd,
    env: buildExecutionEnvironment(plan.env, toolsBefore),
    timeoutMs: WASM_BUILD_TIMEOUT_MS,
    maxOutputBytes: WASM_BUILD_MAX_OUTPUT_BYTES,
    terminationGraceMs: PROCESS_TERMINATION_GRACE_MS,
    label: 'WASM AVL source-locked no-install build',
  });
  dependencies.emitBuildOutput?.(result);

  const sourceAfter = dependencies.fingerprintSource(bridgeRoot);
  if (sourceBefore !== sourceAfter) {
    throw new Error('WASM AVL source inputs changed during the build');
  }
  const packageIdentity = dependencies.assertPackageSmoke(bridgeRoot);
  if (packageIdentity.sourceSha256Hex !== sourceAfter) {
    throw new Error('WASM AVL generated package does not match current crate inputs');
  }
  const toolsAfter = await dependencies.inspectBuildTools();
  validateReviewedToolHashes(toolsAfter);
  assertSameBuildTools(toolsBefore, toolsAfter);
  return Object.freeze({ packageIdentity, tools: toolsAfter });
}
