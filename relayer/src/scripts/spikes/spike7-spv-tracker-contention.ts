/**
 * Spike 7: SPV Tracker Contention Pattern
 * =======================================
 *
 * STATUS: PASS (architecture / transaction-pattern spike)
 *
 * This spike models the BoxId contention introduced by a mutable SPV Tracker:
 * - ingest spends tracker box Tn and creates Tn+1
 * - peg-out claim originally wanted to read Tn via DataInput
 *
 * In Ergo, a DataInput must still be an unspent box at validation time. If an
 * ingest TX spends Tn before the peg-out TX confirms, the peg-out TX becomes
 * invalid. The viable Phase 011a pattern is a coordinator-built aggregate TX:
 *
 *   INPUTS:  tracker Tn + DUP + lock boxes + fee boxes
 *   OUTPUTS: tracker Tn+1 + DUP successor + user payouts + fee/change
 *
 * Peg-out contracts read the tracker as an INPUT (or its successor OUTPUT), not
 * as a DataInput. The tracker input script enforces the AVL digest transition,
 * and the peg-out script authenticates the hardcoded Tracker_NFT on the
 * tracker input/output.
 */

type BoxId = string;

type TrackerBox = {
  id: BoxId;
  digest: string;
  height: number;
  hasTrackerNft: boolean;
};

type TxModel = {
  name: string;
  inputs: BoxId[];
  dataInputs: BoxId[];
  outputs: TrackerBox[];
};

type PatternResult = {
  name: string;
  noBoxIdContention: boolean;
  authenticatesTracker: boolean;
  supportsFreshIngestAndPegout: boolean;
  dupCompatible: boolean;
  latency: 'low' | 'medium' | 'high';
  complexity: 'low' | 'medium' | 'high';
  verdict: 'PASS' | 'PARTIAL' | 'FAIL';
  reason: string;
};

const TRACKER_NFT_ID = 'TRACKER_NFT_ID_COMPILETIME_CONSTANT';

function nextTracker(prev: TrackerBox, suffix: string): TrackerBox {
  return {
    id: `${prev.id}_${suffix}`,
    digest: `${prev.digest}_${suffix}`,
    height: prev.height + 1,
    hasTrackerNft: true,
  };
}

function validateTx(tx: TxModel, utxo: Set<BoxId>): { valid: boolean; reason: string } {
  for (const input of tx.inputs) {
    if (!utxo.has(input)) {
      return { valid: false, reason: `missing input ${input}` };
    }
  }
  for (const dataInput of tx.dataInputs) {
    if (!utxo.has(dataInput)) {
      return { valid: false, reason: `missing dataInput ${dataInput}` };
    }
  }
  return { valid: true, reason: 'all inputs/dataInputs are unspent' };
}

function applyTx(tx: TxModel, utxo: Set<BoxId>): Set<BoxId> {
  const validation = validateTx(tx, utxo);
  if (!validation.valid) {
    throw new Error(`${tx.name} invalid: ${validation.reason}`);
  }

  const next = new Set(utxo);
  for (const input of tx.inputs) next.delete(input);
  for (const output of tx.outputs) next.add(output.id);
  return next;
}

function scenarioSeparateTxs(): { pass: boolean; detail: string } {
  const t0: TrackerBox = { id: 'T0', digest: 'D0', height: 100, hasTrackerNft: true };
  const t1 = nextTracker(t0, 'ingest');
  const ingestTx: TxModel = {
    name: 'ingest',
    inputs: [t0.id],
    dataInputs: [],
    outputs: [t1],
  };
  const pegoutTx: TxModel = {
    name: 'pegout-with-dataInput',
    inputs: ['DUP0', 'LOCK0'],
    dataInputs: [t0.id],
    outputs: [],
  };

  const utxo0 = new Set<BoxId>([t0.id, 'DUP0', 'LOCK0']);
  const utxoAfterIngest = applyTx(ingestTx, utxo0);
  const pegoutAfterIngest = validateTx(pegoutTx, utxoAfterIngest);

  return {
    pass: !pegoutAfterIngest.valid && pegoutAfterIngest.reason === 'missing dataInput T0',
    detail: `separate peg-out after ingest -> ${pegoutAfterIngest.reason}`,
  };
}

function scenarioCombinedTx(): { pass: boolean; detail: string } {
  const t0: TrackerBox = { id: 'T0', digest: 'D0', height: 100, hasTrackerNft: true };
  const t1 = nextTracker(t0, 'batched');
  const combinedTx: TxModel = {
    name: 'combined-ingest-pegouts',
    inputs: [t0.id, 'DUP0', 'LOCK0', 'LOCK1'],
    dataInputs: [],
    outputs: [t1],
  };

  const utxo0 = new Set<BoxId>([t0.id, 'DUP0', 'LOCK0', 'LOCK1']);
  const validation = validateTx(combinedTx, utxo0);

  return {
    pass: validation.valid,
    detail: `combined TX consumes tracker as INPUT and creates ${t1.id}`,
  };
}

function scenarioEpochWindow(): { pass: boolean; detail: string } {
  const t0: TrackerBox = { id: 'T0', digest: 'D0', height: 100, hasTrackerNft: true };
  const pegoutTx: TxModel = {
    name: 'pegout-inside-epoch-window',
    inputs: ['DUP0', 'LOCK0'],
    dataInputs: [t0.id],
    outputs: [],
  };

  const utxoStableWindow = new Set<BoxId>([t0.id, 'DUP0', 'LOCK0']);
  const stableResult = validateTx(pegoutTx, utxoStableWindow);
  const utxoAfterScheduledIngest = applyTx({
    name: 'scheduled-ingest',
    inputs: [t0.id],
    dataInputs: [],
    outputs: [nextTracker(t0, 'epoch')],
  }, utxoStableWindow);
  const staleResult = validateTx(pegoutTx, utxoAfterScheduledIngest);

  return {
    pass: stableResult.valid && !staleResult.valid,
    detail: 'epoch windows reduce contention only if relayer freezes ingestion while peg-outs settle',
  };
}

function scenarioSnapshotAttack(): { pass: boolean; detail: string } {
  const realSnapshot = {
    scriptHash: 'snapshotScript',
    digest: 'REAL_DIGEST',
    eventRoot: 'REAL_EVENT_ROOT',
    snapshotNft: 'SNAPSHOT_NFT',
  };
  const fakeSnapshot = {
    scriptHash: realSnapshot.scriptHash,
    digest: realSnapshot.digest,
    eventRoot: 'FAKE_EVENT_ROOT',
    snapshotNft: undefined,
  };

  const weakAuthAcceptsFake =
    fakeSnapshot.scriptHash === realSnapshot.scriptHash &&
    fakeSnapshot.digest === realSnapshot.digest;
  const nftAuthRejectsFake = fakeSnapshot.snapshotNft !== realSnapshot.snapshotNft;

  return {
    pass: weakAuthAcceptsFake && nftAuthRejectsFake,
    detail: 'script/register matching accepts fake snapshot; singleton-token auth rejects it but reintroduces mutable BoxId movement',
  };
}

function optionScores(): PatternResult[] {
  return [
    {
      name: 'A: coordinator aggregate TX (tracker INPUT + peg-outs)',
      noBoxIdContention: true,
      authenticatesTracker: true,
      supportsFreshIngestAndPegout: true,
      dupCompatible: true,
      latency: 'low',
      complexity: 'medium',
      verdict: 'PASS',
      reason: 'Single TX atomically advances tracker and resolves peg-outs. Tracker_NFT is authenticated on INPUT/OUTPUT; DUP batching was validated in Spike 4.',
    },
    {
      name: 'B: snapshot box pattern',
      noBoxIdContention: false,
      authenticatesTracker: false,
      supportsFreshIngestAndPegout: false,
      dupCompatible: true,
      latency: 'low',
      complexity: 'high',
      verdict: 'FAIL',
      reason: 'Unauthenticated snapshots are forgeable. A singleton Snapshot_NFT authenticates only the latest snapshot and moves on update, recreating BoxId contention.',
    },
    {
      name: 'C: epoch-based ingestion window',
      noBoxIdContention: true,
      authenticatesTracker: true,
      supportsFreshIngestAndPegout: false,
      dupCompatible: true,
      latency: 'medium',
      complexity: 'low',
      verdict: 'PARTIAL',
      reason: 'Works as an operational fallback if ingestion is frozen during peg-out windows, but adds latency and cannot atomically include fresh commitments.',
    },
  ];
}

function trackerInputPseudocode(): string {
  return `
// SPV Tracker input script, simplified
val trackerOut = OUTPUTS(0)
val preserveNft = trackerOut.tokens(0)._1 == SELF.tokens(0)._1
val oldTree = SELF.R5[AvlTree].get
val insertOps = getVar[Coll[Byte]](0).get
val insertProof = getVar[Coll[Byte]](1).get
val newTree = oldTree.insert(insertOps, insertProof).get
sigmaProp(
  preserveNft &&
  trackerOut.R5[AvlTree].get.digest == newTree.digest &&
  committeeOk
)
`.trim();
}

function pegoutPseudocode(): string {
  return `
// Peg-out contract path, simplified
val trackerIn = INPUTS(trackerInputIndex)
val trackerOut = OUTPUTS(trackerOutputIndex)
val trackerInputOk = trackerIn.tokens(0)._1 == TRACKER_NFT_ID
val trackerOutputOk = trackerOut.tokens(0)._1 == TRACKER_NFT_ID

// Use trackerIn for already-accepted commitments, trackerOut for a commitment
// ingested in this same aggregate TX.
val trackerTree = if (usePostIngestDigest) {
  trackerOut.R5[AvlTree].get
} else {
  trackerIn.R5[AvlTree].get
}

val valueOpt = trackerTree.get(commitmentKey, trackerProof)
sigmaProp(trackerInputOk && trackerOutputOk && valueOpt.isDefined && burnProofOk && dupUpdated)
`.trim();
}

function run() {
  const scenarios = [
    ['Separate ingest then peg-out DataInput conflict', scenarioSeparateTxs()],
    ['Combined aggregate TX avoids stale DataInput', scenarioCombinedTx()],
    ['Epoch window is only a scheduling fallback', scenarioEpochWindow()],
    ['Snapshot forgery risk is real without token auth', scenarioSnapshotAttack()],
  ] as const;

  console.log('Spike 7: SPV Tracker Contention Pattern');
  console.log('========================================');
  console.log('');

  for (const [name, result] of scenarios) {
    console.log(`${result.pass ? 'PASS' : 'FAIL'} | ${name}`);
    console.log(`       ${result.detail}`);
  }

  console.log('');
  console.log('Option matrix:');
  for (const option of optionScores()) {
    console.log(`${option.verdict.padEnd(7)} | ${option.name}`);
    console.log(`       noContention=${option.noBoxIdContention} auth=${option.authenticatesTracker} freshSameTx=${option.supportsFreshIngestAndPegout} dup=${option.dupCompatible} latency=${option.latency} complexity=${option.complexity}`);
    console.log(`       ${option.reason}`);
  }

  console.log('');
  console.log('Winning pattern: Option A');
  console.log('- Relayer/coordinator builds one aggregate TX per settlement batch.');
  console.log('- Tracker is an INPUT, not a peg-out DataInput, so no stale tracker BoxId.');
  console.log('- Peg-outs can prove against tracker input digest or tracker output digest.');
  console.log('- DUP remains a mutable input/output and can batch multiple inserts as validated in Spike 4.');

  console.log('');
  console.log('Tracker input pseudocode:');
  console.log(trackerInputPseudocode());

  console.log('');
  console.log('Peg-out pseudocode:');
  console.log(pegoutPseudocode());

  const allScenariosPass = scenarios.every(([, result]) => result.pass);
  const winner = optionScores().find(option => option.name.startsWith('A:'));
  const decisionPass = allScenariosPass && winner?.verdict === 'PASS';

  console.log('');
  console.log(`Result: ${decisionPass ? 'PASS' : 'FAIL'}`);
  console.log(decisionPass
    ? 'Option A is the Phase 011a pattern. Option C is an operational fallback; Option B is rejected for Phase 011a.'
    : 'No viable contention pattern found.');

  if (!decisionPass) process.exit(1);

  // Keep the compile-time constant visible in the script so future reviewers do
  // not accidentally downgrade tracker auth to a claimant-provided Var.
  if (!TRACKER_NFT_ID.includes('TRACKER_NFT')) process.exit(1);
}

run();
