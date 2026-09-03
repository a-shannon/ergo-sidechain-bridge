import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: mocked.spawn,
    spawnSync: mocked.spawnSync,
  };
});

import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import {
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  projectSubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseFailureV1,
  type SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1,
} from './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import {
  issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';

const MNEMONIC =
  'test test test test test test test test test test test junk';
const PUBLIC_KEY_HEX =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const PRIMARY_PID = 41_001;
const WITNESS_PID = 41_002;

type InjectedPhase =
  | 'ergo node primary spawn'
  | 'ergo node primary identity'
  | 'ergo node witness spawn'
  | 'ergo node witness readiness'
  | 'ergo node witness identity'
  | 'ergo node listener ownership';

class FakeChild extends EventEmitter {
  readonly stdout = { resume: vi.fn() };
  readonly stderr = { resume: vi.fn() };
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly kill = vi.fn((signal: NodeJS.Signals = 'SIGTERM') => {
    this.signalCode = signal;
    queueMicrotask(() => this.emit('close', null, signal));
    return true;
  });

  constructor(readonly pid: number | undefined) {
    super();
  }

  closeOrderly(): void {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = 0;
    queueMicrotask(() => this.emit('close', 0, null));
  }
}

describe.skipIf(process.platform !== 'win32')(
  'isolated devnet Ergo node startup phase projection V1',
  () => {
    let injectedPhase: InjectedPhase;
    let children: FakeChild[];

    beforeEach(() => {
      children = [];
      mocked.spawn.mockReset();
      mocked.spawnSync.mockReset();
      mocked.spawn.mockImplementation(() => {
        const role = children.length === 0 ? 'primary' : 'witness';
        const spawnFailure = injectedPhase === `ergo node ${role} spawn`;
        const child = new FakeChild(
          spawnFailure
            ? undefined
            : role === 'primary'
              ? PRIMARY_PID
              : WITNESS_PID,
        );
        if (injectedPhase === `ergo node ${role} readiness`) {
          child.exitCode = 1;
        }
        children.push(child);
        return child as unknown as ChildProcess;
      });
      mocked.spawnSync.mockImplementation((
        _executable: unknown,
        args: unknown,
      ) => {
        const command = Array.isArray(args)
          ? args.map(value => String(value)).join(' ')
          : '';
        if (command.includes('-LocalPort')) return syncResult('[]');
        if (command.includes('Get-Process -Id')) {
          const pid = Number(/Get-Process -Id (\d+)/u.exec(command)?.[1]);
          const identityFailure =
            injectedPhase === 'ergo node primary identity' && pid === PRIMARY_PID
            || injectedPhase === 'ergo node witness identity' && pid === WITNESS_PID;
          return syncResult(identityFailure
            ? windowsPowerShellExecutablePath()
            : process.execPath);
        }
        if (command.includes('-OwningProcess')) {
          return syncResult(JSON.stringify(
            injectedPhase === 'ergo node listener ownership'
              ? listenerRows().slice(0, -1)
              : listenerRows(),
          ));
        }
        throw new Error('unexpected child-process inspection in startup phase test');
      });
      vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === '/info' && (init?.method ?? 'GET') === 'GET') {
          return new Response(JSON.stringify({ network: 'devnet' }), {
            status: 200,
          });
        }
        if (url.pathname === '/node/shutdown' && init?.method === 'POST') {
          const child = url.port === '9051' ? children[0] : children[1];
          setTimeout(() => child?.closeOrderly(), 0);
          return new Response('', { status: 200 });
        }
        throw new Error('unexpected HTTP request in startup phase test');
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it.each([
      'ergo node primary spawn',
      'ergo node primary identity',
      'ergo node witness spawn',
      'ergo node witness readiness',
      'ergo node witness identity',
      'ergo node listener ownership',
    ] as const)('projects executable %s failure and closes one-shot state', async phase => {
      injectedPhase = phase;
      const session = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
        processInput(),
        launchBinding(),
        issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          MNEMONIC,
          PUBLIC_KEY_HEX,
        ),
      );

      let failure: unknown;
      try {
        await session.startMining();
      } catch (error) {
        failure = error;
      }

      expect(
        projectSubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseFailureV1(
          failure,
        ),
      ).toBe(phase);
      await expect(session.startMining()).rejects.toThrow(/exactly once/);
      await expect(session.stop()).resolves.toBeUndefined();
      expect(children.every(child => (
        child.pid === undefined
        || child.exitCode !== null
        || child.signalCode !== null
      ))).toBe(true);
    });
  },
);

function processInput(): SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input {
  const executableSha256Hex = sha256(readFileSync(process.execPath));
  return {
    javaExecutablePath: process.execPath,
    expectedJavaExecutableSha256Hex: executableSha256Hex,
    nodeAssemblyJarPath: process.execPath,
    expectedNodeAssemblyJarSha256Hex: executableSha256Hex,
    buildIdentityDigestHex: sha256(Buffer.from('startup-phase-test', 'ascii')),
  };
}

function launchBinding(): SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1 {
  return {
    miningTargetPublicKeyHex: PUBLIC_KEY_HEX,
    p2pkErgoTreeHex: `0008cd${PUBLIC_KEY_HEX}`,
    rewardInputErgoTrees: {
      delay1: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
      delay720: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720),
    },
    networkPrefix: 16,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  };
}

function listenerRows(): readonly Readonly<Record<string, unknown>>[] {
  return [
    { LocalAddress: '127.0.0.1', LocalPort: 9051, OwningProcess: PRIMARY_PID },
    { LocalAddress: '127.0.0.1', LocalPort: 9021, OwningProcess: PRIMARY_PID },
    { LocalAddress: '127.0.0.1', LocalPort: 9052, OwningProcess: WITNESS_PID },
    { LocalAddress: '127.0.0.1', LocalPort: 9022, OwningProcess: WITNESS_PID },
  ];
}

function syncResult(stdout: string) {
  return {
    pid: 1,
    output: [null, stdout, ''],
    stdout,
    stderr: '',
    status: 0,
    signal: null,
    error: undefined,
  };
}

function windowsPowerShellExecutablePath(): string {
  return `${process.env.SystemRoot ?? process.env.WINDIR}`
    + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
