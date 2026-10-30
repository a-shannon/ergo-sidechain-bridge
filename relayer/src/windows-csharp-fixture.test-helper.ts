import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { runBoundedProcess } from './bounded-process-runner.js';

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readRegular(path: string, limit: number, singleLink = true): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (singleLink && stat.nlink !== 1)
    || stat.size === 0 || stat.size > limit) {
    throw new Error('C# fixture input must be a bounded regular single-link file');
  }
  const bytes = readFileSync(path);
  if (bytes.length !== stat.size) throw new Error('C# fixture input size changed');
  return bytes;
}

export async function prepareWindowsCSharpFixture(input: Readonly<{
  source: string;
  directory: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}>): Promise<Readonly<{ loadCommand(): string }>> {
  const systemRoot = input.env.SystemRoot;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error('C# fixture requires an absolute Windows system root');
  }
  const directory = lstatSync(input.directory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error('C# fixture requires a fresh regular directory');
  }
  const sourceBytes = Buffer.from(input.source, 'utf8');
  if (sourceBytes.length === 0 || sourceBytes.length > 1024 * 1024) {
    throw new Error('C# fixture source is empty or oversized');
  }
  const compilerPath = resolve(systemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  // Installed framework tools can have servicing hardlinks. Bind their bytes;
  // only the fresh owned source and assembly must have a single link.
  const compilerDigest = digest(readRegular(compilerPath, 16 * 1024 * 1024, false));
  const compilerConfigPath = join(dirname(compilerPath), 'csc.rsp');
  const readCompilerConfigDigest = () => existsSync(compilerConfigPath)
    ? digest(readRegular(compilerConfigPath, 64 * 1024, false)) : null;
  const compilerConfigDigest = readCompilerConfigDigest();
  const sourcePath = join(input.directory, 'fixture.cs');
  const assemblyPath = join(input.directory, 'fixture.dll');
  if (existsSync(assemblyPath)) throw new Error('C# fixture assembly already exists');
  writeFileSync(sourcePath, sourceBytes, { flag: 'wx' });
  const sourceDigest = digest(sourceBytes);
  const verifyInputs = () => {
    if (digest(readRegular(sourcePath, 1024 * 1024)) !== sourceDigest
      || digest(readRegular(compilerPath, 16 * 1024 * 1024, false)) !== compilerDigest
      || readCompilerConfigDigest() !== compilerConfigDigest) {
      throw new Error('C# fixture source or compiler changed');
    }
  };
  verifyInputs();
  await runBoundedProcess({
    executablePath: compilerPath,
    args: ['/nologo', '/target:library', '/platform:anycpu', `/out:${assemblyPath}`, sourcePath],
    cwd: input.cwd,
    env: input.env,
    timeoutMs: 10_000,
    maxOutputBytes: 8_192,
    label: 'fresh C# output fixture compilation',
  });
  verifyInputs();
  const assemblyBytes = readRegular(assemblyPath, 1024 * 1024);
  if (assemblyBytes.length < 2 || assemblyBytes[0] !== 0x4d || assemblyBytes[1] !== 0x5a) {
    throw new Error('C# fixture compiler did not produce a PE assembly');
  }
  const assemblyDigest = digest(assemblyBytes);
  return Object.freeze({
    loadCommand(): string {
      verifyInputs();
      if (digest(readRegular(assemblyPath, 1024 * 1024)) !== assemblyDigest) {
        throw new Error('C# fixture assembly changed');
      }
      return `Add-Type -Path '${assemblyPath.replace(/'/g, "''")}';`;
    },
  });
}
