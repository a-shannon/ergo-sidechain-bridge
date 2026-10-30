import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { StateTracker } from './state-tracker.js';
import { SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_ADMISSION_V2_OPERATION_PROFILE as PROFILE }
  from './relayer-core/ergo-operational-transaction-lifecycle.js';
import type { OwnedFederatedGenesisDevnetProcessV1Receipt }
  from './substrate-federated-authority-safe-devnet-process-v1.js';
import {
  captureSubstrateFederatedTwoCycleRecoveryV1 as capture,
  type TwoCycleRecoveryCaptureInputV1,
} from './substrate-federated-two-cycle-recovery-capture-v1.js';

vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync) };
});

const hex = (byte: number) => byte.toString(16).padStart(2, '0').repeat(32);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function confirmed(tracker: StateTracker, offset: number, disposition: 'accepted' | 'ambiguous') {
  const row = tracker.reserveErgoOperationalTransactionAttempt({
    operationProfile: PROFILE, expectedTxId: hex(offset + 1), sourceBoxId: hex(offset + 2),
    inputBoxIds: [hex(offset + 2), hex(offset + 3)], attemptedAtHeight: 100 + offset,
    targetSidechainHeight: null, targetSidechainBlockHashHex: null, heartbeatKeyHex: null,
    reconciliationIdentityDigestHex: hex(offset + 4), bindingDigestHex: hex(offset + 5),
    signedTransactionDigestHex: hex(offset + 6), checkResponseDigestHex: hex(offset + 7),
    revalidationDigestHex: hex(offset + 8), authorizationDigestHex: hex(offset + 9),
  });
  tracker.finalizeErgoOperationalTransactionAttempt({ expectedTxId: row.expectedTxId,
    durableAttemptDigestHex: row.durableAttemptDigestHex, disposition,
    submittedTxId: disposition === 'accepted' ? row.expectedTxId : null,
    responseDigestHex: disposition === 'accepted' ? hex(offset + 10) : null });
  const confirmationHeight = 103 + offset;
  const confirmationHeaderIdHex = hex(offset + 11);
  tracker.confirmErgoOperationalTransactionAttempt({ expectedTxId: row.expectedTxId,
    confirmationHeight, confirmationHeaderId: confirmationHeaderIdHex });
  return { expectedTxId: row.expectedTxId, durableAttemptDigestHex: row.durableAttemptDigestHex,
    authorizationDigestHex: row.authorizationDigestHex, transportDisposition: disposition,
    confirmationHeight, confirmationHeaderIdHex };
}

function fixture(tempParent = tmpdir()) {
  // Test-owned synthetic files only; no node or historical runtime is read.
  const root = realpathSync.native(mkdtempSync(join(realpathSync.native(tempParent),
    'bridge-recovery-capture-synthetic-')));
  const targetDirectory = join(root, 'builder');
  const journalDirectory = join(targetDirectory, 'issuance-journal');
  mkdirSync(targetDirectory);
  mkdirSync(journalDirectory);
  const tracker = new StateTracker(join(journalDirectory, 'state-store'));
  const attempts = [confirmed(tracker, 0, 'accepted'), confirmed(tracker, 32, 'ambiguous')] as const;
  tracker.updateSyncState({ ergoHeight: 170, sidechainHeight: 25,
    stateBoxId: hex(70), preventionBoxId: hex(71) });
  tracker.insertPegIn(hex(80), 'synthetic-event', 1n, 1);
  const roots = { ergo: [join(root, 'ergo-primary'), join(root, 'ergo-witness')],
    frontier: [join(root, 'frontier-primary'), join(root, 'frontier-witness')] };
  for (const kind of ['ergo', 'frontier'] as const) {
    const trees = kind === 'ergo' ? ['state', 'history']
      : ['chains/bridge_federated_v4_genesis/db/full', 'chains/bridge_federated_v4_genesis/frontier/db'];
    for (const nodeRoot of roots[kind]) {
      for (const tree of trees) {
        mkdirSync(join(nodeRoot, tree), { recursive: true });
        writeFileSync(join(nodeRoot, tree, '000001.sst'), `${kind}:cycle-one:cycle-two`);
      }
      for (const excluded of ['wallet', 'keystore', 'network', 'jvm-temp']) {
        mkdirSync(join(nodeRoot, excluded));
        writeFileSync(join(nodeRoot, excluded, 'excluded.txt'), 'EXCLUDED-SYNTHETIC-SENTINEL');
      }
      writeFileSync(join(nodeRoot, 'config.json'), 'EXCLUDED-SYNTHETIC-SENTINEL');
    }
  }
  const receipt: Readonly<OwnedFederatedGenesisDevnetProcessV1Receipt> = Object.freeze({
    schema: 'e2s.substrate-federated-genesis-devnet-process.v1', version: 1,
    nodeBinarySha256Hex: hex(90), chainSpecSha256Hex: hex(91),
    primaryPeerIdSha256Hex: hex(92), witnessPeerIdSha256Hex: hex(93), processBindingDigestHex: hex(94),
    checks: Object.freeze({ freshArchiveStateUsed: true,
      runningImageIdentityBoundForBothNodes: true,
      chainSpecFileRecheckedBeforeBothLaunchesAndAfterAction: true,
      rpcP2pAndPrometheusListenersOwnedBySpawnedProcesses: true,
      allListenersBoundToLoopback: true, exactMutualPeerIdentityObservedAtActionBoundaries: true,
      exactBinaryRecheckedAfterAction: true, bothProcessesStoppedAndListenersReleased: true }),
  });
  const events: string[] = [];
  const ergoSession: TwoCycleRecoveryCaptureInputV1['ergoSession'] = {
    stopWithStoppedData: vi.fn(async action => {
      events.push('ergo-stopped');
      await action({ primaryDataDirectory: roots.ergo[0], witnessDataDirectory: roots.ergo[1] });
      expect(existsSync(join(partial(), 'ergo/manifest.json'))).toBe(true);
      events.push('ergo-callback-completed');
    }),
  };
  const frontierSession: TwoCycleRecoveryCaptureInputV1['frontierSession'] = {
    closeWithStoppedData: vi.fn(async action => {
      events.push('frontier-stopped');
      await action({ primaryBasePath: roots.frontier[0], witnessBasePath: roots.frontier[1] });
      expect(existsSync(join(partial(), 'frontier/manifest.json'))).toBe(true);
      events.push('frontier-callback-completed');
      return receipt;
    }),
  };
  const sync = tracker.getSyncState.bind(tracker);
  vi.spyOn(tracker, 'getSyncState').mockImplementation(() => { events.push('sync'); return sync(); });
  const close = tracker.close.bind(tracker);
  vi.spyOn(tracker, 'close').mockImplementation(() => { events.push('tracker-close'); close(); });
  const input: TwoCycleRecoveryCaptureInputV1 = {
    targetDirectory, journalDirectory, tracker, expectedAttempts: attempts, ergoSession, frontierSession,
  };
  function partial() {
    const names = readdirSync(targetDirectory).filter(name => name.startsWith('.two-cycle-recovery.partial-'));
    expect(names).toHaveLength(1);
    return join(targetDirectory, names[0]);
  }
  return { root, roots, input, events, receipt, partial };
}

async function withFixture(action: (f: ReturnType<typeof fixture>) => Promise<void>, tempParent = tmpdir()) {
  const f = fixture(tempParent);
  try { await action(f); } finally {
    try { f.input.tracker.close(); } finally {
      rmSync(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }
}

function unpublished(f: ReturnType<typeof fixture>) {
  expect(readdirSync(f.input.targetDirectory).filter(name => name.startsWith('two-cycle-recovery-'))).toEqual([]);
  for (const name of readdirSync(f.input.targetDirectory).filter(name => name.startsWith('.two-cycle-recovery.partial-'))) {
    expect(existsSync(join(f.input.targetDirectory, name, 'manifest.json'))).toBe(false);
  }
}

describe('stopped two-cycle recovery capture composer', () => {
  it('uses a canonical synthetic temp parent without accepting an aliased target', async () => {
    const parent = mkdtempSync(join(realpathSync.native(tmpdir()), 'bridge-recovery-capture-parent-'));
    try {
      const target = join(parent, 'target');
      mkdirSync(target);
      const alias = join(parent, 'alias');
      symlinkSync(target, alias, 'junction');
      await withFixture(async f => {
        expect(realpathSync.native(f.root)).toBe(f.root);
        await expect(capture({ ...f.input,
          targetDirectory: join(alias, basename(f.root), 'builder'),
        })).rejects.toThrow(/alias/);
        await expect(capture(f.input)).resolves.toMatchObject({
          manifest: { nodeConsistencyEstablished: false, freshRestartValidated: false },
        });
      }, alias);
    } finally {
      rmSync(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('captures the root layout with a journal inside the builder and publishes aggregate manifest last', async () => {
    await withFixture(async f => {
      vi.mocked(writeFileSync).mockClear();
      const result = await capture(f.input);
      expect(f.events).toEqual(['ergo-stopped', 'ergo-callback-completed',
        'frontier-stopped', 'frontier-callback-completed', 'sync', 'tracker-close']);
      expect(result.frontierProcess).toBe(f.receipt);
      expect(isAbsolute(result.recoveryDirectory)).toBe(false);
      expect(result.recoveryDirectory).toMatch(/^two-cycle-recovery-[A-Za-z0-9]+$/);
      const output = join(f.input.targetDirectory, result.recoveryDirectory);
      expect(readdirSync(f.input.targetDirectory).sort()).toEqual(['issuance-journal', result.recoveryDirectory].sort());
      expect(readdirSync(output).sort()).toEqual(['ergo', 'frontier', 'manifest.json', 'sqlite']);
      const aggregateBytes = readFileSync(join(output, 'manifest.json'));
      expect(sha(aggregateBytes)).toBe(result.manifestSha256Hex);
      expect(JSON.parse(aggregateBytes.toString())).toEqual(result.manifest);
      expect(result.manifest.nodeConsistencyEstablished).toBe(false);
      expect(result.manifest.freshRestartValidated).toBe(false);
      expect(result.manifest.executionAuthorityRestored).toBe(false);
      expect(result.manifest.summary).toMatchObject({ ergoFiles: 4, frontierFiles: 4, trackerAdmissionAttempts: 2 });
      for (const binding of Object.values(result.manifest.components)) {
        const bytes = readFileSync(join(output, binding.file));
        expect(binding.bytes).toBe(bytes.length);
        expect(binding.sha256Hex).toBe(sha(bytes));
        expect(bytes.toString()).not.toContain('EXCLUDED-SYNTHETIC-SENTINEL');
      }
      const lastWrite = vi.mocked(writeFileSync).mock.calls.at(-1)!;
      expect(String(lastWrite[0])).toMatch(/\.two-cycle-recovery\.partial-[^\\/]+[\\/]manifest\.json$/);
      expect(lastWrite[1]).toEqual(aggregateBytes);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(f.root);
      expect(serialized).not.toContain('DataDirectory');
      expect(serialized).not.toContain('BasePath');
      const reopened = new StateTracker(join(output, 'sqlite/state.sqlite'), { readOnly: true });
      try {
        expect(reopened.getErgoOperationalTransactionAttempts(PROFILE)).toHaveLength(2);
        const second = reopened.getErgoOperationalTransactionAttempt(f.input.expectedAttempts[1].expectedTxId)!;
        expect(second.status).toBe('confirmed');
        expect(second.submissionDisposition).toBe('ambiguous');
        expect(second.submittedTxId).toBeNull();
        expect(reopened.getSettlementAuthorityInventoryCounts().pegInEvents).toBe(1);
        expect(reopened.getPegInCircuitBreakerState().open).toBe(true);
      } finally { reopened.close(); }
      for (const kind of ['ergo', 'frontier'] as const) {
        const component = JSON.parse(readFileSync(join(output, kind, 'manifest.json'), 'utf8'));
        for (const file of component.files) {
          expect(sha(readFileSync(join(output, kind, file.node, file.path)))).toBe(file.sha256Hex);
        }
        expect(existsSync(join(output, kind, 'primary/wallet'))).toBe(false);
        expect(existsSync(join(output, kind, 'primary/config.json'))).toBe(false);
      }
    });
  });

  const cases: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
    ['Ergo owner stop failure', f => { Object.assign(f.input.ergoSession, { stopWithStoppedData: vi.fn(async () => { throw new Error('stop failed'); }) }); }],
    ['Ergo owner callback omitted', f => { Object.assign(f.input.ergoSession, { stopWithStoppedData: vi.fn(async () => {}) }); }],
    ['Frontier owner stop failure', f => { f.input.frontierSession.closeWithStoppedData = vi.fn(async () => { throw new Error('stop failed'); }); }],
    ['Frontier owner callback omitted', f => { f.input.frontierSession.closeWithStoppedData = vi.fn(async () => f.receipt); }],
    ['Frontier postcallback owner failure', f => {
      const original = f.input.frontierSession.closeWithStoppedData;
      f.input.frontierSession.closeWithStoppedData = vi.fn(async action => { await original(action); throw new Error('owner cleanup failed'); });
    }],
    ['Ergo callback copy failure', f => {
      Object.assign(f.input.ergoSession, { stopWithStoppedData: vi.fn(async (action: Parameters<TwoCycleRecoveryCaptureInputV1['ergoSession']['stopWithStoppedData']>[0]) => {
        await action({ primaryDataDirectory: f.root, witnessDataDirectory: f.roots.ergo[1] });
      }) });
    }],
    ['second identity mismatch', f => { Object.assign(f.input.expectedAttempts[1], { confirmationHeight: 999 }); }],
    ['duplicate tracker identities', f => { Object.assign(f.input.expectedAttempts[1], { expectedTxId: f.input.expectedAttempts[0].expectedTxId }); }],
    ['malformed identity digest', f => { Object.assign(f.input.expectedAttempts[0], { durableAttemptDigestHex: 'bad' }); }],
    ['target equals journal', f => { Object.assign(f.input, { targetDirectory: f.input.journalDirectory }); }],
    ['target inside journal', f => {
      const nestedTarget = join(f.input.journalDirectory, 'nested-builder');
      mkdirSync(nestedTarget);
      Object.assign(f.input, { targetDirectory: nestedTarget });
    }],
    ['traversal target', f => { Object.assign(f.input, { targetDirectory: join(f.root, 'builder') + '/../builder' }); }],
    ['aliased target', f => {
      const alias = join(f.root, 'builder-alias');
      symlinkSync(f.input.targetDirectory, alias, 'junction');
      Object.assign(f.input, { targetDirectory: alias });
    }],
    ['funds authority with live lock before close', f => { f.input.tracker.acquireFundsExecutionAuthority(); }],
    ['funds authority row without lock', f => {
      const raw = new Database(join(f.input.journalDirectory, 'state-store'));
      try {
        raw.prepare('INSERT INTO funds_execution_authority(id,schema,epoch_hex,owner_digest_hex) VALUES (1,?,?,?)')
          .run('e2s.funds-execution-authority.v1', hex(98), hex(99));
      } finally { raw.close(); }
    }],
  ];
  it.each(cases)('keeps the aggregate unpublished after %s', async (_name, change) => {
    await withFixture(async f => {
      change(f);
      await expect(capture(f.input)).rejects.toThrow();
      // Overlap target uses the journal, which legitimately contains the source DB.
      const builder = join(f.root, 'builder');
      const fOriginalTarget = { ...f, input: { ...f.input, targetDirectory: builder } };
      unpublished(fOriginalTarget);
      if (_name.includes('funds authority')) {
        expect(f.input.ergoSession.stopWithStoppedData).not.toHaveBeenCalled();
        expect(f.input.tracker.close).not.toHaveBeenCalled();
      }
    });
  });

  it('freezes expected identity fields before entering owner callbacks', async () => {
    await withFixture(async f => {
      const original = f.input.ergoSession.stopWithStoppedData;
      Object.assign(f.input.ergoSession, { stopWithStoppedData: vi.fn(async (action: Parameters<TwoCycleRecoveryCaptureInputV1['ergoSession']['stopWithStoppedData']>[0]) => {
        Object.assign(f.input.expectedAttempts[1], { confirmationHeight: 999, privateMaterial: 'excluded' });
        await original(action);
      }) });
      const result = await capture(f.input);
      const sqlite = JSON.parse(readFileSync(join(f.input.targetDirectory, result.recoveryDirectory, 'sqlite/manifest.json'), 'utf8'));
      expect(sqlite.trackerAdmissionAttempts[1].confirmationHeight).toBe(135);
      expect(JSON.stringify(result)).not.toContain('privateMaterial');
    });
  });

  it('rejects repeated stopped-data callbacks while retaining the completed component', async () => {
    await withFixture(async f => {
      const original = f.input.ergoSession.stopWithStoppedData;
      Object.assign(f.input.ergoSession, { stopWithStoppedData: vi.fn(async (action: Parameters<TwoCycleRecoveryCaptureInputV1['ergoSession']['stopWithStoppedData']>[0]) => {
        await original(action);
        await action({ primaryDataDirectory: f.roots.ergo[0], witnessDataDirectory: f.roots.ergo[1] });
      }) });
      await expect(capture(f.input)).rejects.toThrow('callback repeated');
      unpublished(f);
      expect(existsSync(join(f.partial(), 'ergo/manifest.json'))).toBe(true);
      expect(f.input.frontierSession.closeWithStoppedData).not.toHaveBeenCalled();
    });
  });

  it('rejects a final-directory collision without overwriting it or publishing a partial', async () => {
    await withFixture(async f => {
      const original = f.input.frontierSession.closeWithStoppedData;
      let collision = '';
      f.input.frontierSession.closeWithStoppedData = vi.fn(async action => {
        const receipt = await original(action);
        const name = basename(f.partial()).replace('.two-cycle-recovery.partial-', 'two-cycle-recovery-');
        collision = join(f.input.targetDirectory, name);
        mkdirSync(collision);
        writeFileSync(join(collision, 'retained.txt'), 'existing caller data');
        return receipt;
      });
      await expect(capture(f.input)).rejects.toThrow('destination already exists');
      expect(readdirSync(collision)).toEqual(['retained.txt']);
      expect(readFileSync(join(collision, 'retained.txt'), 'utf8')).toBe('existing caller data');
      expect(existsSync(join(f.partial(), 'manifest.json'))).toBe(false);
      expect(existsSync(join(f.partial(), 'sqlite/manifest.json'))).toBe(true);
    });
  });

  it('rejects authority introduced by a callback before close can erase the row', async () => {
    await withFixture(async f => {
      const original = f.input.frontierSession.closeWithStoppedData;
      f.input.frontierSession.closeWithStoppedData = vi.fn(async action => {
        const receipt = await original(action);
        const raw = new Database(join(f.input.journalDirectory, 'state-store'));
        try {
          raw.prepare('INSERT INTO funds_execution_authority(id,schema,epoch_hex,owner_digest_hex) VALUES (1,?,?,?)')
            .run('e2s.funds-execution-authority.v1', hex(98), hex(99));
        } finally { raw.close(); }
        return receipt;
      });
      await expect(capture(f.input)).rejects.toThrow('live funds execution authority');
      expect(f.input.tracker.close).not.toHaveBeenCalled();
      unpublished(f);
      const raw = new Database(join(f.input.journalDirectory, 'state-store'), { readonly: true });
      try { expect(raw.prepare('SELECT COUNT(*) FROM funds_execution_authority').pluck().get()).toBe(1); }
      finally { raw.close(); }
    });
  });
});
