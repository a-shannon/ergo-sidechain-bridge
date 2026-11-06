import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = ts.createSourceFile('reward-input-discovery.ts', readFileSync(new URL(
  './substrate-federated-isolated-devnet-reward-input-discovery-v1.ts', import.meta.url,
), 'utf8'), ts.ScriptTarget.ES2022, true);

function exactDeclarations() {
  const functions = ['observeMatchingSourcesV2', 'observeSourceWithinBudgetV2'];
  const constants = ['REWARD_DELAYS', 'MAX_MATCHING_DUAL_OBSERVATION_ATTEMPTS',
    'DUAL_OBSERVATION_RETRY_DELAY_MS'];
  return [...functions.map(name => {
    const matches = source.statements.filter((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    expect(matches).toHaveLength(1);
    expect(matches[0].body).toBeDefined();
    return matches[0].getText(source);
  }), ...constants.map(name => {
    const matches = source.statements.filter((node): node is ts.VariableStatement =>
      ts.isVariableStatement(node) && node.declarationList.declarations.some(
        declaration => declaration.name.getText(source) === name));
    expect(matches).toHaveLength(1);
    return matches[0].getText(source);
  })].join('\n');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Peer = 'primary' | 'witness';
type Delay = 1 | 720;
type Read = { peer: Peer; address: string; active: boolean };
const id = (height: number) => height.toString(16).padStart(64, '0');
const snapshot = Object.freeze({ network: 'devnet', genesisHeaderIdHex: id(1),
  tipHeight: 40, tipHeaderIdHex: id(40) });

function fixture(peer: Peer, firstDelay: Delay, firstError?: Error, laterError?: Error,
  suspendOtherPeer = false) {
  const otherDelay: Delay = firstDelay === 1 ? 720 : 1;
  const suspendedPeer: Peer = suspendOtherPeer ? (peer === 'primary' ? 'witness' : 'primary') : peer;
  const suspended = deferred<string>();
  const entered = deferred<void>();
  const normalPeerCompleted = deferred<void>();
  const resumedLaneDrained = deferred<void>();
  const reads: Read[] = [];
  let resumedReadCount = 0;
  const client = (name: Peer) => ({
    name, active: false, ends: 0,
    info: Object.freeze({ network: 'devnet', fullHeight: 40, bestFullHeaderId: id(40) }),
    bestHeader: Object.freeze({ height: 40, id: id(40), parentId: id(39) }),
    beginAuthenticatedTrackerReconstruction() { expect(this.active).toBe(false); this.active = true; },
    endAuthenticatedTrackerReconstruction() { expect(this.active).toBe(true); this.ends += 1; this.active = false; },
    async getAddressForErgoTree(tree: string) {
      expect.soft(this.active).toBe(true);
      const delay = tree === 'delay1' ? 1 : 720;
      if (name === suspendedPeer && delay === otherDelay) { entered.resolve(); return suspended.promise; }
      if (name === peer && delay === firstDelay && firstError) throw firstError;
      return `reward-${delay}`;
    },
    async getUnspentBoxesByAddressPage(address: string) {
      expect.soft(this.active).toBe(true);
      reads.push({ peer: name, address, active: this.active });
      if (name === suspendedPeer && address === `reward-${otherDelay}` && ++resumedReadCount === 2) {
        resumedLaneDrained.resolve();
      }
      return [];
    },
  });
  const primary = client('primary'); const witness = client('witness');
  const code = ts.transpileModule(exactDeclarations(), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  expect(code).not.toMatch(/\brequire\s*\(/u);
  const run = new Function('observeFullSnapshotV2', 'readSnapshotBoundRewardBoxSet',
    'assertCanonicalSnapshotExtension', 'deepFreeze', 'canonicalJson',
    `${code}\nreturn observeMatchingSourcesV2;`)(
    async (node: typeof primary) => {
      expect(node.active).toBe(true);
      expect(node.info.fullHeight).toBe(40);
      expect(node.info.bestFullHeaderId).toBe(node.bestHeader.id);
      return snapshot;
    },
    async (node: typeof primary, address: string) => ({
      boxes: await node.getUnspentBoxesByAddressPage(address), maxObservedCreationHeight: 0,
    }),
    async (node: typeof primary, before: unknown, after: unknown) => {
      expect(before).toEqual(snapshot); expect(after).toEqual(snapshot);
      if (node.name !== peer) normalPeerCompleted.resolve();
    }, Object.freeze, JSON.stringify,
  ) as (primary: object, witness: object, signer: object) => Promise<unknown>;
  let settled = false;
  // Attach both outcomes before any input rejection can escape a microtask.
  const outcome = run(primary, witness, { rewardInputErgoTrees: { delay1: 'delay1', delay720: 'delay720' } })
    .then(value => { settled = true; return { status: 'fulfilled' as const, value }; },
      error => { settled = true; return { status: 'rejected' as const, error }; });
  return { primary, witness, reads, outcome, entered: entered.promise,
    normalPeerCompleted: normalPeerCompleted.promise, settled: () => settled,
    async releaseAndDrain() {
      if (laterError) suspended.reject(laterError);
      else suspended.resolve(`reward-${otherDelay}`);
      if (!laterError) await resumedLaneDrained.promise;
      await outcome;
      // Also drain the released lane's fixed continuation depth when the
      // original operation has already rejected on the uncorrected source.
      for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
    } };
}

async function beforeRelease(h: ReturnType<typeof fixture>) {
  await h.entered;
  await h.normalPeerCompleted;
  // The normal peer has reached its final awaited dependency. Drain the fixed
  // production continuation depth without a timer or a wall-clock race.
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  expect.soft(h.settled()).toBe(false);
  expect.soft([h.primary.ends, h.witness.ends]).toEqual([0, 0]);
}

describe('V2 reward profile lanes remain inside the actual reconstruction scope', () => {
  it('valid twin waits for its delayed lane and completes all subsequent reads within the scope', async () => {
    const h = fixture('primary', 1);
    try { await beforeRelease(h); }
    finally { await h.releaseAndDrain(); }
    expect((await h.outcome).status).toBe('fulfilled');
    expect(h.reads).toHaveLength(8);
    expect(h.reads.every(read => read.active)).toBe(true);
    expect([h.primary.ends, h.witness.ends]).toEqual([1, 1]);
  });

  it.each([{ peer: 'primary', delay: 1 }, { peer: 'primary', delay: 720 },
    { peer: 'witness', delay: 1 }, { peer: 'witness', delay: 720 }] as const)(
    '$peer delay$delay failure drains the other lane before closing and preserves its Error', async ({ peer, delay }) => {
      const original = new Error(`${peer} delay${delay} original`);
      const h = fixture(peer, delay, original);
      try { await beforeRelease(h); }
      finally { await h.releaseAndDrain(); }
      const outcome = await h.outcome;
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') expect(outcome.error).toBe(original);
      const resumed = h.reads.filter(read => read.peer === peer
        && read.address === `reward-${delay === 1 ? 720 : 1}`);
      expect(resumed).toHaveLength(2);
      expect.soft(resumed.every(read => read.active)).toBe(true);
      expect([h.primary.ends, h.witness.ends]).toEqual([1, 1]);
    });

  it.each([1, 720] as const)('two errors preserve delay%s as the temporal first failure after drainage', async delay => {
    const first = new Error(`delay${delay} first`);
    const second = new Error(`delay${delay === 1 ? 720 : 1} second`);
    const h = fixture('primary', delay, first, second);
    try { await beforeRelease(h); }
    finally { await h.releaseAndDrain(); }
    const outcome = await h.outcome;
    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.error).toBe(first);
    expect([h.primary.ends, h.witness.ends]).toEqual([1, 1]);
  });

  it.each(['primary', 'witness'] as const)('%s failure still drains an independently pending opposite peer', async peer => {
    const original = new Error(`${peer} original while opposite peer is pending`);
    const h = fixture(peer, 1, original, undefined, true);
    try {
      await h.entered;
      for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
      expect.soft(h.settled()).toBe(false);
      expect.soft([h.primary.ends, h.witness.ends]).toEqual([0, 0]);
    } finally { await h.releaseAndDrain(); }
    const outcome = await h.outcome;
    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.error).toBe(original);
    expect(h.reads.every(read => read.active)).toBe(true);
    expect([h.primary.ends, h.witness.ends]).toEqual([1, 1]);
  });
});
