import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const RELAYER_ROOT = resolve(REPOSITORY_ROOT, 'relayer');
const TSX_CLI = resolve(RELAYER_ROOT, 'node_modules/tsx/dist/cli.mjs');
const WASM_DENIAL_SENTINEL = 'FED_CLEAN_START_WASM_DENIED';

function cleanChildEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  return env;
}

function runTsxChild(source: string): string {
  const result = spawnSync(process.execPath, [TSX_CLI, '--eval', source], {
    cwd: RELAYER_ROOT,
    env: cleanChildEnvironment(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const diagnostics = [
      `clean-start child exited with status ${String(result.status)}`,
      result.signal ? `signal: ${result.signal}` : '',
      result.error ? `spawn error: ${result.error.message}` : '',
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
    ].filter(Boolean).join('\n');
    throw new Error(diagnostics);
  }
  return result.stdout.trim();
}

function wasmDenyHookSource(): string {
  return `import { registerHooks } from 'node:module';

const denied = [];
function normalizeSpecifier(specifier) {
  let normalized = String(specifier).replaceAll('\\\\', '/');
  if (normalized.startsWith('file:')) {
    normalized = new URL(normalized).pathname.replaceAll('\\\\', '/');
  }
  return normalized;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    const normalized = normalizeSpecifier(specifier);
    if (normalized.endsWith('/wasm-avl/pkg/bridge_avl.js')) {
      denied.push(normalized);
      throw new Error('${WASM_DENIAL_SENTINEL}:' + normalized);
    }
    return nextResolve(specifier, context);
  },
});
`;
}

function importBoundarySource(): string {
  const repositoryRootLiteral = JSON.stringify(REPOSITORY_ROOT);
  return `${wasmDenyHookSource()}
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = ${repositoryRootLiteral};
let compilerProcessAttempts = 0;
childProcess.execFile = () => {
  compilerProcessAttempts += 1;
  throw new Error('FED_CLEAN_START_UNEXPECTED_COMPILER_PROCESS');
};
syncBuiltinESMExports();

void (async () => {
  try {
    const compilerApi = await import(pathToFileURL(resolve(
      repositoryRoot,
      'relayer/src/substrate-federated-tracker-jvm-compiler-v1.ts',
    )).href);
    await import(pathToFileURL(resolve(
      repositoryRoot,
      'relayer/src/substrate-federated-native-two-cycle-invocation-v1.ts',
    )).href);
    let admissionError;
    try {
      compilerApi.assertPinnedFederatedJvmCompilerRuntimeV1({
        bridgeRoot: repositoryRoot,
        javaHome: '',
      });
    } catch (error) {
      admissionError = error;
    }
    if (!(admissionError instanceof Error)
        || admissionError.message !== 'federated tracker compiler admission requires a Java home') {
      throw new Error('read-only admission did not reach its exact Java-home guard');
    }
    if (compilerProcessAttempts !== 0) {
      throw new Error('compiler process was called before the Java-home guard');
    }
    if (denied.length !== 0) {
      throw new Error('a WASM import was attempted during the FED import boundary');
    }
    process.stdout.write('FED clean-start import and Java-home guard passed\\n');
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
})();
`;
}

function deniedWasmSource(): string {
  const repositoryRootLiteral = JSON.stringify(REPOSITORY_ROOT);
  return `${wasmDenyHookSource()}
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = ${repositoryRootLiteral};
const wasmSpecifier = pathToFileURL(resolve(
  repositoryRoot,
  'wasm-avl/pkg/bridge_avl.js',
)).href;
void (async () => {
  try {
    await import(wasmSpecifier);
  } catch (error) {
    if (error instanceof Error
        && error.message.startsWith('${WASM_DENIAL_SENTINEL}:')
        && denied.length === 1) {
      process.stdout.write('WASM deny-hook control passed\\n');
    } else {
      throw error;
    }
  }
  if (denied.length !== 1) {
    throw new Error('the deliberate WASM import did not trigger the deny hook');
  }
})().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
`;
}

describe('FED compiler clean-start imports', () => {
  it('imports read-only admission and native invocation without WASM or compiler execution', () => {
    expect(runTsxChild(importBoundarySource())).toBe(
      'FED clean-start import and Java-home guard passed',
    );
  });

  it('proves the deny hook blocks a deliberate WASM import', () => {
    expect(runTsxChild(deniedWasmSource())).toBe('WASM deny-hook control passed');
  });
});
