import { win32 } from 'node:path';

import {
  assertV4FileOnlyRepositoriesTemplate,
  type V4NodeBuildLock,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

export const V4_EFFECTIVE_RESOLVER_COMMANDS = Object.freeze([
  'reload plugins', 'show thisProjectRef', 'show fullResolvers',
  'reload return',
  'project ergo', 'show thisProjectRef', 'show fullResolvers',
  'show source24ResolverProbe',
  'show thisProjectRef', 'show Compile / fullResolvers',
  'show Compile / source24ResolverProbe',
  'project ergoCore', 'show thisProjectRef', 'show Compile / fullResolvers',
  'show Compile / source24ResolverProbe',
  'project ergoWallet', 'show thisProjectRef', 'show Compile / fullResolvers',
  'show Compile / source24ResolverProbe',
  'project avldb', 'show thisProjectRef', 'show Compile / fullResolvers',
  'show Compile / source24ResolverProbe',
] as const);

export type V4ResolverRuntimeLock = Readonly<Pick<V4NodeBuildLock,
  'isolatedSbtStateDirectory' | 'sbtLauncherRepositoriesFileName'
  | 'sbtLauncherRepositoriesFileTemplate'
  | 'sbtLauncherEmptyRepositoryDirectoryName'
  | 'coursierMode' | 'javaSystemProperties'>>;

export interface V4ResolverRuntimeInput {
  readonly sourceRoot: string;
  readonly mirrorRoot: string;
  readonly leveldbRoot: string;
  readonly bootSourceRoot: string;
  readonly javaExecutablePath: string;
  readonly systemRoot: string;
  readonly lock: V4ResolverRuntimeLock;
}

export interface V4ResolverRuntimePaths {
  readonly stateRoot: string;
  readonly repositoriesFile: string;
  readonly emptyRepositoryRoot: string;
  readonly sbtBootRoot: string;
  readonly appDataRoot: string;
  readonly localAppDataRoot: string;
  readonly homeRoot: string;
  readonly tempRoot: string;
  readonly coursierCacheRoot: string;
  readonly coursierConfigRoot: string;
  readonly sbtGlobalRoot: string;
  readonly sbtLocalCacheRoot: string;
  readonly ivyRoot: string;
  readonly powershellCacheRoot: string;
  readonly scalaCliConfigFile: string;
}

export interface V4ResolverRuntimePlan {
  readonly commands: typeof V4_EFFECTIVE_RESOLVER_COMMANDS;
  readonly paths: Readonly<V4ResolverRuntimePaths>;
  readonly repositoriesText: string;
  readonly javaExecutablePath: string;
  readonly javaSystemProperties: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
}

function fail(reason: string): never {
  throw new Error('V4 resolver runtime plan: ' + reason);
}

function canonicalDrivePath(value: string, label: string): string {
  if (typeof value !== 'string' || !/^[a-z]:[\\/]/iu.test(value)
      || value.startsWith('\\\\') || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(label + ' must be an absolute drive path');
  }
  const parts = value.slice(3).split(/[\\/]/u);
  if (parts.length === 0 || parts.some(part => part.length === 0
      || part === '.' || part === '..' || /[:<>|";?*]/u.test(part)
      || /[. ]$/u.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    fail(label + ' contains an unsafe component');
  }
  const normalized = win32.resolve(value);
  if (!/^[a-z]:\\/iu.test(normalized) || normalized.length <= 3) {
    fail(label + ' is a drive root or is not canonical');
  }
  return normalized;
}

function overlaps(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.startsWith(right + '\\')
    || right.startsWith(left + '\\');
}

function fileDirectoryUri(path: string): string {
  const slash = path.replace(/\\/gu, '/');
  const drive = slash.slice(0, 2).toUpperCase();
  const parts = slash.slice(3).split('/').map(encodeURIComponent);
  return 'file:///' + drive + '/' + parts.join('/') + '/';
}

function checkedLock(lock: V4ResolverRuntimeLock): void {
  const expectedProperties = [
    '-Dsbt.offline=true',
    '-Dsbt.server.autostart=false',
    '-Dsbt.override.build.repos=true',
    '-Djava.net.useSystemProxies=false',
  ] as const;
  if (!lock || lock.isolatedSbtStateDirectory !== 'target/bridge-sbt-state-v4'
      || lock.sbtLauncherRepositoriesFileName !== 'repositories'
      || lock.sbtLauncherEmptyRepositoryDirectoryName
        !== 'sbt-launcher-empty-repository'
      || lock.coursierMode !== 'offline'
      || !Array.isArray(lock.javaSystemProperties)
      || lock.javaSystemProperties.length !== expectedProperties.length
      || expectedProperties.some((value, index) =>
        lock.javaSystemProperties[index] !== value)) {
    fail('V4 runtime lock fields differ');
  }
  assertV4FileOnlyRepositoriesTemplate(lock.sbtLauncherRepositoriesFileTemplate);
}

export function assertV4EffectiveResolverCommands(
  commands: readonly string[],
): void {
  if (!Array.isArray(commands)
      || commands.length !== V4_EFFECTIVE_RESOLVER_COMMANDS.length
      || V4_EFFECTIVE_RESOLVER_COMMANDS.some((command, index) =>
        commands[index] !== command)) {
    fail('effective project and meta-build command sequence differs');
  }
}

// This is a pure path/argument plan. It neither creates the state nor seeds
// boot JARs, starts Java, observes effective resolvers or authorizes assembly.
export function planV4ResolverRuntime(
  input: Readonly<V4ResolverRuntimeInput>,
): Readonly<V4ResolverRuntimePlan> {
  if (!input || typeof input !== 'object') fail('input absent');
  checkedLock(input.lock);
  assertV4EffectiveResolverCommands(V4_EFFECTIVE_RESOLVER_COMMANDS);
  const sourceRoot = canonicalDrivePath(input.sourceRoot, 'source root');
  const mirrorRoot = canonicalDrivePath(input.mirrorRoot, 'Maven mirror');
  const leveldbRoot = canonicalDrivePath(input.leveldbRoot, 'LevelDB repository');
  const bootSourceRoot = canonicalDrivePath(input.bootSourceRoot, 'boot source');
  const javaExecutablePath = canonicalDrivePath(input.javaExecutablePath, 'Java executable');
  const systemRoot = canonicalDrivePath(input.systemRoot, 'SystemRoot');
  const roots = [sourceRoot, mirrorRoot, leveldbRoot, bootSourceRoot];
  for (let index = 0; index < roots.length; index++) {
    for (let other = index + 1; other < roots.length; other++) {
      if (overlaps(roots[index]!, roots[other]!)) fail('owned roots overlap');
    }
  }
  const javaBin = win32.dirname(javaExecutablePath);
  if (win32.basename(javaExecutablePath).toLowerCase() !== 'java.exe'
      || win32.basename(javaBin).toLowerCase() !== 'bin') {
    fail('Java executable is not inside bin');
  }
  const javaHome = win32.dirname(javaBin);
  if (roots.some(root => overlaps(root, javaHome))
      || roots.some(root => overlaps(root, systemRoot))) {
    fail('tool or Windows root overlaps an owned input');
  }
  const stateRoot = win32.join(sourceRoot, 'target', 'bridge-sbt-state-v4');
  const paths: Readonly<V4ResolverRuntimePaths> = Object.freeze({
    stateRoot,
    repositoriesFile: win32.join(stateRoot, 'repositories'),
    emptyRepositoryRoot: win32.join(stateRoot, 'sbt-launcher-empty-repository'),
    sbtBootRoot: win32.join(stateRoot, 'sbt-boot'),
    appDataRoot: win32.join(stateRoot, 'appdata'),
    localAppDataRoot: win32.join(stateRoot, 'localappdata'),
    homeRoot: win32.join(stateRoot, 'home'),
    tempRoot: win32.join(stateRoot, 'temp'),
    coursierCacheRoot: win32.join(stateRoot, 'coursier'),
    coursierConfigRoot: win32.join(stateRoot, 'coursier-config'),
    sbtGlobalRoot: win32.join(stateRoot, 'sbt-global'),
    sbtLocalCacheRoot: win32.join(stateRoot, 'sbt-cache'),
    ivyRoot: win32.join(stateRoot, 'ivy'),
    powershellCacheRoot: win32.join(stateRoot, 'powershell-cache'),
    scalaCliConfigFile: win32.join(stateRoot, 'scala-cli-config.json'),
  });
  const repositoriesText = input.lock.sbtLauncherRepositoriesFileTemplate
    .replace('{{MAVEN_CENTRAL_CACHE_URI}}', fileDirectoryUri(mirrorRoot))
    .replace('{{GITLAB_LEVELDB_FILE_URI}}', fileDirectoryUri(leveldbRoot))
    .replace('{{EMPTY_REPOSITORY_URI}}', fileDirectoryUri(paths.emptyRepositoryRoot));
  if (repositoriesText.includes('{{') || /https?:\/\//iu.test(repositoriesText)
      || repositoriesText.split('\n').filter(line => line.includes('file:')).length !== 3) {
    fail('rendered repository file differs');
  }
  const javaSystemProperties = Object.freeze([
    ...input.lock.javaSystemProperties,
    '-Djava.io.tmpdir=' + paths.tempRoot,
    '-Duser.home=' + paths.homeRoot,
    '-Dsbt.global.base=' + paths.sbtGlobalRoot,
    '-Dsbt.global.localcache=' + paths.sbtLocalCacheRoot,
    '-Dsbt.boot.directory=' + paths.sbtBootRoot,
    '-Dsbt.ivy.home=' + paths.ivyRoot,
    '-Dsbt.repository.config=' + paths.repositoriesFile,
  ]);
  const system32 = win32.join(systemRoot, 'System32');
  const environment: Readonly<Record<string, string>> = Object.freeze({
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    SystemDrive: systemRoot.slice(0, 2),
    COMSPEC: win32.join(system32, 'cmd.exe'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    Path: [javaBin, system32, win32.join(system32, 'WindowsPowerShell', 'v1.0')].join(';'),
    JAVA_HOME: javaHome,
    HOME: paths.homeRoot,
    USERPROFILE: paths.homeRoot,
    APPDATA: paths.appDataRoot,
    LOCALAPPDATA: paths.localAppDataRoot,
    TEMP: paths.tempRoot,
    TMP: paths.tempRoot,
    COURSIER_MODE: 'offline',
    COURSIER_CACHE: paths.coursierCacheRoot,
    COURSIER_CONFIG_DIR: paths.coursierConfigRoot,
    SCALA_CLI_CONFIG: paths.scalaCliConfigFile,
    PSModuleAnalysisCachePath: win32.join(paths.powershellCacheRoot, 'ModuleAnalysisCache'),
    CI: 'true',
    NO_COLOR: '1',
  });
  return Object.freeze({
    commands: V4_EFFECTIVE_RESOLVER_COMMANDS,
    paths,
    repositoriesText,
    javaExecutablePath,
    javaSystemProperties,
    environment,
  });
}
