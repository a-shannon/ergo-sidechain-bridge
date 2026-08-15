import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveProvisioningRepositoryInputPath } from './authenticated-v2-sanitized-io.js';

const sandboxes: string[] = [];

function createSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), 'authenticated-v2-repository-input-'));
  sandboxes.push(sandbox);
  return sandbox;
}

function expectRepositoryRejection(run: () => unknown, sensitiveTarget: string): void {
  try {
    run();
    throw new Error('expected repository input rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/inside the bridge repository/i);
    expect((error as Error).message).not.toContain(sensitiveTarget);
  }
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

describe('authenticated V2 sanitized repository input', () => {
  it('accepts sanitized JSON files inside explicit and default bridge roots', () => {
    const sandbox = createSandbox();
    const bridgeRoot = join(sandbox, 'bridge');
    const cwd = join(bridgeRoot, 'relayer');
    const input = join(cwd, 'candidate.json');
    mkdirSync(cwd, { recursive: true });
    writeFileSync(input, '{}\n', 'utf8');

    expect(resolveProvisioningRepositoryInputPath('candidate.json', { cwd, bridgeRoot }))
      .toBe(realpathSync(input));

    const checkedInPackage = new URL('../package.json', import.meta.url);
    expect(resolveProvisioningRepositoryInputPath('../package.json', {
      cwd: fileURLToPath(new URL('./', import.meta.url)),
    })).toBe(realpathSync(fileURLToPath(checkedInPackage)));
  });

  it('rejects absolute input paths without reflecting the target', () => {
    const sandbox = createSandbox();
    const bridgeRoot = join(sandbox, 'bridge');
    const outside = join(sandbox, 'absolute-candidate.json');
    mkdirSync(bridgeRoot, { recursive: true });
    writeFileSync(outside, '{}\n', 'utf8');

    expectRepositoryRejection(
      () => resolveProvisioningRepositoryInputPath(outside, { cwd: bridgeRoot, bridgeRoot }),
      outside,
    );
  });

  it('rejects relative repository escapes without reflecting the target', () => {
    const sandbox = createSandbox();
    const bridgeRoot = join(sandbox, 'bridge');
    const cwd = join(bridgeRoot, 'relayer');
    const outside = join(sandbox, 'escaped-candidate.json');
    mkdirSync(cwd, { recursive: true });
    writeFileSync(outside, '{}\n', 'utf8');
    const target = relative(cwd, outside);

    expectRepositoryRejection(
      () => resolveProvisioningRepositoryInputPath(target, { cwd, bridgeRoot }),
      target,
    );
  });

  it('rejects directory junction escapes without reflecting the target', () => {
    const sandbox = createSandbox();
    const bridgeRoot = join(sandbox, 'bridge');
    const cwd = join(bridgeRoot, 'relayer');
    const outside = join(sandbox, 'external-material');
    const target = join('linked-inputs', 'junction-candidate.json');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'junction-candidate.json'), '{}\n', 'utf8');
    symlinkSync(outside, join(cwd, 'linked-inputs'), 'junction');

    expectRepositoryRejection(
      () => resolveProvisioningRepositoryInputPath(target, { cwd, bridgeRoot }),
      target,
    );
  });
});
