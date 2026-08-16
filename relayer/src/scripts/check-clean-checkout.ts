import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPILER_NODE_EXECUTABLE_ENV =
  'BRIDGE_COMPILER_NODE_EXECUTABLE' as const;

interface CompilerNodeLock {
  readonly platform: string;
  readonly nodeVersion: string;
  readonly nodeExecutableSha256: string;
}

interface AuditNodeLock extends CompilerNodeLock {}

interface AuditNpmLock {
  readonly schema: 'e2s.clean-checkout-npm-lock.v1';
  readonly npmVersion: string;
  readonly npmCliRelativePath: string;
  readonly npmPackageSha256: string;
}

export interface CompilerNodeIdentityInput {
  readonly locks: readonly Readonly<CompilerNodeLock>[];
  readonly platform: string;
  readonly arch: string;
  readonly observedVersion: string;
  readonly executableBytes: Buffer;
}

export interface AuditNpmIdentityInput {
  readonly lock: Readonly<AuditNpmLock>;
  readonly configuredPath: string;
  readonly canonicalPath: string;
  readonly expectedPath: string;
  readonly isRegularFile: boolean;
  readonly isSymbolicLink: boolean;
  readonly observedVersion: string;
  readonly packageSha256: string;
}

export interface CompilerCheckStep {
  readonly label: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

interface NpmPackFileEntry {
  readonly path?: unknown;
}

interface NpmPackReport {
  readonly files?: unknown;
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const relayerRoot = path.resolve(scriptDirectory, '..', '..');
const bridgeRoot = path.resolve(relayerRoot, '..');
const compilerLockPaths = [
  path.resolve(bridgeRoot, 'sources', 'authenticated-v2-compiler-lock.json'),
  path.resolve(
    bridgeRoot,
    'sources',
    'substrate-federated-tracker-compiler-lock-v1.json',
  ),
] as const;
const auditNodeLockPath = path.resolve(
  bridgeRoot,
  'sources',
  'authenticated-v2-runtime-bundle-build-lock-v2.json',
);
const auditNpmLockPath = path.resolve(
  bridgeRoot,
  'sources',
  'clean-checkout-npm-lock-v1.json',
);

export function validateCompilerNodeIdentity(
  input: Readonly<CompilerNodeIdentityInput>,
): Readonly<CompilerNodeLock> {
  if (input.locks.length !== compilerLockPaths.length) {
    throw new Error('clean-checkout compiler Node requires both reviewed locks');
  }
  const [canonical, ...remaining] = input.locks;
  if (!canonical) {
    throw new Error('clean-checkout compiler Node lock is missing');
  }
  validateCompilerNodeLock(canonical);
  for (const lock of remaining) {
    validateCompilerNodeLock(lock);
    if (
      lock.platform !== canonical.platform
      || lock.nodeVersion !== canonical.nodeVersion
      || lock.nodeExecutableSha256 !== canonical.nodeExecutableSha256
    ) {
      throw new Error('clean-checkout compiler Node locks disagree');
    }
  }
  if (`${input.platform}-${input.arch}` !== canonical.platform) {
    throw new Error('clean-checkout compiler Node platform does not match its locks');
  }
  if (input.observedVersion !== `v${canonical.nodeVersion}`) {
    throw new Error('clean-checkout compiler Node version does not match its locks');
  }
  const executableSha256 = createHash('sha256')
    .update(input.executableBytes)
    .digest('hex');
  if (executableSha256 !== canonical.nodeExecutableSha256) {
    throw new Error('clean-checkout compiler Node executable does not match its locks');
  }
  return Object.freeze({ ...canonical });
}

export function resolveCompilerNodeExecutable(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env[COMPILER_NODE_EXECUTABLE_ENV];
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error(
      `${COMPILER_NODE_EXECUTABLE_ENV} must name the absolute reviewed Node 24.14.0 executable`,
    );
  }
  const resolved = path.resolve(configured);
  if (!existsSync(resolved)) {
    throw new Error('clean-checkout compiler Node executable is missing');
  }
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('clean-checkout compiler Node executable must be a regular file');
  }
  const canonicalPath = realpathSync(resolved);
  if (normalizePath(canonicalPath) !== normalizePath(resolved)) {
    throw new Error('clean-checkout compiler Node executable must use its canonical path');
  }

  const versionEnvironment = sanitizedNodeEnvironment(env);
  const version = spawnSync(canonicalPath, ['--version'], {
    encoding: 'utf8',
    env: versionEnvironment,
    windowsHide: true,
  });
  if (version.error || version.status !== 0 || version.signal !== null) {
    throw new Error('clean-checkout compiler Node version probe failed');
  }

  const locks = compilerLockPaths.map(loadCompilerNodeLock);
  validateCompilerNodeIdentity({
    locks,
    platform: process.platform,
    arch: process.arch,
    observedVersion: version.stdout.trim(),
    executableBytes: readFileSync(canonicalPath),
  });
  return canonicalPath;
}

export function validateAuditNpmIdentity(
  input: Readonly<AuditNpmIdentityInput>,
): Readonly<AuditNpmLock> {
  if (!input.isRegularFile || input.isSymbolicLink) {
    throw new Error('clean-checkout npm CLI must be a regular file');
  }
  if (normalizePath(input.configuredPath) !== normalizePath(input.canonicalPath)) {
    throw new Error('clean-checkout npm CLI must use its canonical path');
  }
  if (normalizePath(input.canonicalPath) !== normalizePath(input.expectedPath)) {
    throw new Error('clean-checkout npm CLI must belong to the reviewed audit Node');
  }
  if (input.packageSha256 !== input.lock.npmPackageSha256) {
    throw new Error('clean-checkout npm package does not match its lock');
  }
  if (input.observedVersion !== input.lock.npmVersion) {
    throw new Error('clean-checkout npm version does not match its lock');
  }
  return Object.freeze({ ...input.lock });
}

export function environmentWithNodeOnPath(
  nodeExecutable: string,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const pathEntries = Object.entries(env).filter(
    ([key]) => key.toLowerCase() === 'path',
  );
  if (pathEntries.length > 1) {
    throw new Error('clean-checkout environment contains ambiguous PATH entries');
  }
  const inheritedPath = pathEntries[0]?.[1] ?? '';
  const result = { ...env };
  for (const key of Object.keys(result)) {
    if (['path', 'npm_execpath', 'npm_node_execpath'].includes(key.toLowerCase())) {
      delete result[key];
    }
  }
  result.PATH = `${path.dirname(nodeExecutable)}${path.delimiter}${inheritedPath}`;
  return result;
}

export function buildCompilerCheckPlan(
  nodeExecutable: string,
  selectedRelayerRoot: string = relayerRoot,
  selectedBridgeRoot: string = bridgeRoot,
): readonly Readonly<CompilerCheckStep>[] {
  const tsxCli = path.resolve(selectedRelayerRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const tscCli = path.resolve(selectedRelayerRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  return Object.freeze([
    Object.freeze({
      label: 'architecture:check',
      executable: nodeExecutable,
      args: Object.freeze([
        tsxCli,
        path.resolve(selectedRelayerRoot, 'src', 'scripts', 'check-layer-imports.ts'),
      ]),
      cwd: selectedRelayerRoot,
    }),
    Object.freeze({
      label: 'wasm:build',
      executable: nodeExecutable,
      args: Object.freeze([
        tsxCli,
        path.resolve(selectedRelayerRoot, 'src', 'scripts', 'build-wasm-avl.ts'),
      ]),
      cwd: selectedRelayerRoot,
    }),
    Object.freeze({
      label: 'build',
      executable: nodeExecutable,
      args: Object.freeze([tscCli]),
      cwd: selectedRelayerRoot,
    }),
    Object.freeze({
      label: 'test:bounded',
      executable: nodeExecutable,
      args: Object.freeze([
        tsxCli,
        path.resolve(selectedRelayerRoot, 'src', 'scripts', 'run-bounded-vitest.ts'),
      ]),
      cwd: selectedRelayerRoot,
    }),
  ]);
}

export function validateNpmPackageBoundary(
  packageMetadata: unknown,
  packReport: unknown,
): readonly string[] {
  if (
    !packageMetadata
    || typeof packageMetadata !== 'object'
    || Array.isArray(packageMetadata)
    || (packageMetadata as Record<string, unknown>).private !== true
  ) {
    throw new Error('clean-checkout relayer npm package must remain private');
  }
  if (packReport === null || typeof packReport !== 'object' || Array.isArray(packReport)) {
    throw new Error('clean-checkout npm pack report must contain one package object');
  }
  const files = (packReport as NpmPackReport).files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('clean-checkout npm pack report must contain package files');
  }
  const paths = files.map((entry: NpmPackFileEntry) => {
    if (
      !entry
      || typeof entry !== 'object'
      || Array.isArray(entry)
      || typeof entry.path !== 'string'
      || entry.path.length === 0
    ) {
      throw new Error('clean-checkout npm pack report contains a malformed file entry');
    }
    const normalized = entry.path.replace(/\\/g, '/');
    if (
      path.posix.isAbsolute(normalized)
      || path.win32.isAbsolute(normalized)
      || normalized === '..'
      || normalized.startsWith('../')
      || normalized.includes('/../')
    ) {
      throw new Error('clean-checkout npm pack report contains an unsafe file path');
    }
    return normalized;
  });
  const forbidden = paths.filter(entry => (
    /(?:^|\/)\.env(?:\.|$)/i.test(entry) && entry !== '.env.example'
  ) || /(?:^|\/)[^/]+\.(?:(?:sqlite|sqlite3|db)(?:-(?:shm|wal))?|log(?:\..+)?)$/i.test(entry)
    || /(?:^|\/)(?:target|target-codex|node_modules|\.source-cache)(?:\/|$)/i.test(entry));
  if (forbidden.length > 0) {
    throw new Error('clean-checkout npm package contains local runtime state');
  }
  return Object.freeze(paths);
}

export function resolveAuditNpmCli(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const auditNodeLock = loadAuditNodeLock(auditNodeLockPath);
  validateCurrentAuditNode(auditNodeLock);
  const npmLock = loadAuditNpmLock(auditNpmLockPath);
  const configured = env.npm_execpath;
  if (!configured || !path.isAbsolute(configured) || !existsSync(configured)) {
    throw new Error('clean-checkout npm CLI identity is unavailable');
  }
  const resolved = path.resolve(configured);
  const metadata = lstatSync(resolved);
  const canonicalPath = realpathSync(resolved);
  const expectedPath = path.resolve(
    path.dirname(realpathSync(process.execPath)),
    npmLock.npmCliRelativePath,
  );
  const packageRoot = realpathSync(path.resolve(path.dirname(canonicalPath), '..'));
  const packageMetadata = lstatSync(packageRoot);
  if (!packageMetadata.isDirectory() || packageMetadata.isSymbolicLink()) {
    throw new Error('clean-checkout npm package must be a real directory');
  }
  const packageSha256 = hashDirectoryFiles(packageRoot);
  if (packageSha256 !== npmLock.npmPackageSha256) {
    throw new Error('clean-checkout npm package does not match its lock');
  }
  const versionEnvironment = sanitizedNodeEnvironment(
    environmentWithNodeOnPath(process.execPath, env),
  );
  const version = spawnSync(process.execPath, [canonicalPath, '--version'], {
    encoding: 'utf8',
    env: versionEnvironment,
    windowsHide: true,
  });
  if (version.error || version.status !== 0 || version.signal !== null) {
    throw new Error('clean-checkout npm version probe failed');
  }
  validateAuditNpmIdentity({
    lock: npmLock,
    configuredPath: resolved,
    canonicalPath,
    expectedPath,
    isRegularFile: metadata.isFile(),
    isSymbolicLink: metadata.isSymbolicLink(),
    observedVersion: version.stdout.trim(),
    packageSha256,
  });
  return canonicalPath;
}

function main(): void {
  if (process.argv.length > 2) {
    throw new Error('clean-checkout check accepts no arguments');
  }
  const npmCli = resolveAuditNpmCli();
  const compilerNode = resolveCompilerNodeExecutable();
  const auditEnvironment = environmentWithNodeOnPath(process.execPath);

  runAuditedNpmPackageBoundary(process.execPath, npmCli, auditEnvironment);
  runNpmScript(process.execPath, npmCli, 'clean-checkout:solidity', auditEnvironment);
  runNpmScript(process.execPath, npmCli, 'compiler:runtime-bundle', auditEnvironment);
  runCompilerCheck(compilerNode, environmentWithNodeOnPath(compilerNode));
  runNpmScript(process.execPath, npmCli, 'wasm:test', auditEnvironment);
}

function runAuditedNpmPackageBoundary(
  nodeExecutable: string,
  npmCli: string,
  env: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(
    nodeExecutable,
    [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts'],
    {
      cwd: relayerRoot,
      encoding: 'utf8',
      env: sanitizedNpmEnvironment(env),
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error('clean-checkout audited npm package inspection failed');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error('clean-checkout audited npm package inspection was not JSON');
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error('clean-checkout npm pack report must contain one package object');
  }
  const packageMetadata: unknown = JSON.parse(
    readFileSync(path.resolve(relayerRoot, 'package.json'), 'utf8'),
  );
  validateNpmPackageBoundary(packageMetadata, parsed[0]);
}

function loadAuditNodeLock(lockPath: string): Readonly<AuditNodeLock> {
  const parsed: unknown = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('clean-checkout audit Node lock must be an object');
  }
  const lock = parsed as Record<string, unknown>;
  return {
    platform: requireString(lock.platform, 'platform'),
    nodeVersion: requireString(lock.nodeVersion, 'nodeVersion'),
    nodeExecutableSha256: requireString(
      lock.nodeExecutableSha256,
      'nodeExecutableSha256',
    ),
  };
}

function loadAuditNpmLock(lockPath: string): Readonly<AuditNpmLock> {
  const parsed: unknown = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('clean-checkout npm lock must be an object');
  }
  const lock = parsed as Record<string, unknown>;
  const expectedKeys = [
    'npmCliRelativePath',
    'npmPackageSha256',
    'npmVersion',
    'schema',
  ];
  if (Object.keys(lock).sort().join('\n') !== expectedKeys.join('\n')) {
    throw new Error('clean-checkout npm lock has unexpected fields');
  }
  const schema = requireString(lock.schema, 'schema');
  const npmVersion = requireString(lock.npmVersion, 'npmVersion');
  const npmCliRelativePath = requireString(
    lock.npmCliRelativePath,
    'npmCliRelativePath',
  );
  const npmPackageSha256 = requireString(
    lock.npmPackageSha256,
    'npmPackageSha256',
  );
  if (
    schema !== 'e2s.clean-checkout-npm-lock.v1'
    || !/^\d+\.\d+\.\d+$/.test(npmVersion)
    || npmCliRelativePath !== 'node_modules/npm/bin/npm-cli.js'
    || !/^[0-9a-f]{64}$/.test(npmPackageSha256)
  ) {
    throw new Error('clean-checkout npm lock is malformed');
  }
  return {
    schema,
    npmVersion,
    npmCliRelativePath,
    npmPackageSha256,
  };
}

function validateCurrentAuditNode(lock: Readonly<AuditNodeLock>): void {
  validateCompilerNodeLock(lock);
  if (`${process.platform}-${process.arch}` !== lock.platform) {
    throw new Error('clean-checkout audit Node platform does not match its lock');
  }
  if (process.version !== `v${lock.nodeVersion}`) {
    throw new Error('clean-checkout audit Node version does not match its lock');
  }
  const resolved = path.resolve(process.execPath);
  const metadata = lstatSync(resolved);
  const canonicalPath = realpathSync(resolved);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || normalizePath(canonicalPath) !== normalizePath(resolved)
    || createHash('sha256').update(readFileSync(canonicalPath)).digest('hex')
      !== lock.nodeExecutableSha256
  ) {
    throw new Error('clean-checkout audit Node executable does not match its lock');
  }
}

function loadCompilerNodeLock(lockPath: string): Readonly<CompilerNodeLock> {
  const parsed: unknown = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('clean-checkout compiler Node lock must be an object');
  }
  const lock = parsed as Record<string, unknown>;
  return {
    platform: requireString(lock.platform, 'platform'),
    nodeVersion: requireString(lock.nodeVersion, 'nodeVersion'),
    nodeExecutableSha256: requireString(
      lock.nodeExecutableSha256,
      'nodeExecutableSha256',
    ),
  };
}

function validateCompilerNodeLock(lock: Readonly<CompilerNodeLock>): void {
  if (
    !/^[a-z0-9]+-[a-z0-9]+$/.test(lock.platform)
    || !/^\d+\.\d+\.\d+$/.test(lock.nodeVersion)
    || !/^[0-9a-f]{64}$/.test(lock.nodeExecutableSha256)
  ) {
    throw new Error('clean-checkout compiler Node lock is malformed');
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`clean-checkout compiler Node lock ${label} must be a string`);
  }
  return value;
}

function normalizePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function sanitizedNodeEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized = { ...env };
  const forbidden = new Set([
    'NODE_COMPILE_CACHE',
    'NODE_EXTRA_CA_CERTS',
    'NODE_OPTIONS',
    'NODE_PATH',
    'TSX_TSCONFIG_PATH',
  ].map(field => field.toLowerCase()));
  for (const field of Object.keys(sanitized)) {
    if (forbidden.has(field.toLowerCase())) delete sanitized[field];
  }
  return sanitized;
}

function sanitizedNpmEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized = sanitizedNodeEnvironment(env);
  for (const field of Object.keys(sanitized)) {
    if (
      field.toLowerCase().startsWith('npm_config_')
      || field.toLowerCase().startsWith('npm_package_')
      || field.toLowerCase().startsWith('npm_lifecycle_')
      || ['init_cwd', 'npm_command'].includes(field.toLowerCase())
    ) {
      delete sanitized[field];
    }
  }
  return sanitized;
}

function listRegularFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    const candidate = path.resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('clean-checkout npm package must not contain symbolic links');
    }
    if (entry.isDirectory()) files.push(...listRegularFiles(root, candidate));
    else if (entry.isFile()) files.push(candidate);
    else throw new Error('clean-checkout npm package contains an unsupported entry');
  }
  return files;
}

function hashDirectoryFiles(root: string): string {
  const records = listRegularFiles(root)
    .map(file => `${path.relative(root, file).replace(/\\/g, '/')}:${
      createHash('sha256').update(readFileSync(file)).digest('hex')
    }`)
    .sort();
  if (records.length === 0) throw new Error('clean-checkout npm package is empty');
  return createHash('sha256').update(records.join('\n'), 'utf8').digest('hex');
}

function runNpmScript(
  nodeExecutable: string,
  npmCli: string,
  script: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = spawnSync(nodeExecutable, [npmCli, 'run', script], {
    cwd: relayerRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(`${script} failed with exit code ${String(result.status)}`);
  }
}

function runCompilerCheck(
  nodeExecutable: string,
  env: NodeJS.ProcessEnv,
): void {
  for (const step of buildCompilerCheckPlan(nodeExecutable)) {
    const result = spawnSync(step.executable, [...step.args], {
      cwd: step.cwd,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 || result.signal !== null) {
      throw new Error(`${step.label} failed with exit code ${String(result.status)}`);
    }
  }
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'clean-checkout check failed');
    process.exitCode = 1;
  }
}
