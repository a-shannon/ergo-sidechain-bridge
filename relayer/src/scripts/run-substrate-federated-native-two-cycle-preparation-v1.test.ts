import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as artifacts from '../create-only-out-of-repository-artifact.js';
import { canonicalJson, sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  captureNativeTwoCyclePreparationConfigV1,
  createNativeTwoCyclePreparationFailureV1,
  NATIVE_TWO_CYCLE_PREPARATION_FAILURE_FILE_V1,
  originalNativeTwoCyclePreparationFailureV1,
  parseNativeTwoCyclePreparationFailureV1,
  tryPublishNativeTwoCyclePreparationFailureV1,
  withNativeTwoCyclePreparationPhaseV1,
} from '../substrate-federated-native-two-cycle-preparation-v1.js';

const PHASES = ['environment-before-build', 'ergo-inputs-before-wasm', 'wasm-build',
  'wasm-package', 'environment-after-build', 'environment-stability',
  'pre-attempt-outputs', 'ergo-inputs-before-attempt'] as const;
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREPARATION_FAILURE_V1';
const expected = { configSha256Hex: 'a'.repeat(64),
  expectedBridgeCommit: 'b'.repeat(40), pathIdentityDigestHex: 'c'.repeat(64) };
async function failure(phase: typeof PHASES[number], raw: unknown): Promise<unknown> {
  try { await withNativeTwoCyclePreparationPhaseV1(phase, () => { throw raw; }); }
  catch (error) { return error; }
  throw new Error('fixture must refuse');
}
function fixture() {
  const bridgeRoot = resolve(import.meta.dirname, '..', '..', '..');
  const root = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT
    ?? join(dirname(bridgeRoot), 'diagnostics', 'two-cycle-preparation'));
  mkdirSync(root, { recursive: true });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || realpathSync(root).toLowerCase() !== root.toLowerCase()) {
    throw new Error('test parent must be direct and canonical');
  }
  const directory = mkdtempSync(join(root, 'two-cycle-preparation-'));
  const configCanonicalPath = join(directory, 'invocation-config.json');
  const configBytes = Buffer.from('{"fixture":true}\n');
  writeFileSync(configCanonicalPath, configBytes, { flag: 'wx' });
  const initial = { config: { expectedBridgeCommit: expected.expectedBridgeCommit },
    configBytes, configSha256Hex: createHash('sha256').update(configBytes).digest('hex'),
    configCanonicalPath, pathIdentityDigestHex: expected.pathIdentityDigestHex };
  return { directory, initial, target: join(directory,
    NATIVE_TWO_CYCLE_PREPARATION_FAILURE_FILE_V1),
  expected: { ...expected, configSha256Hex: initial.configSha256Hex } };
}
function reseal(value: Record<string, unknown>, domain = DOMAIN): string {
  const { receiptDigestHex: _old, ...body } = value;
  return canonicalJson({ ...body, receiptDigestHex: sha256CanonicalJson(body, domain) }) + '\n';
}

describe('bounded public preparation diagnostics', () => {
  it.each(PHASES)('round-trips the actual writer after isolated %s refusal', async phase => {
    const f = fixture(), context = captureNativeTwoCyclePreparationConfigV1(f.initial);
    expect(context).not.toBeNull();
    const raw = Object.freeze(new Error('private fixture secret; ' + join(f.directory, 'not-for-public')));
    const events: string[] = [];
    let escaped: unknown;
    try {
      for (const current of PHASES) await withNativeTwoCyclePreparationPhaseV1(current, () => {
        events.push(current); if (current === phase) throw raw;
      });
    } catch (error) {
      expect(tryPublishNativeTwoCyclePreparationFailureV1(f.initial, context, error)).toBe(true);
      escaped = originalNativeTwoCyclePreparationFailureV1(error);
    }
    expect(escaped).toBe(raw);
    expect(events).toEqual(PHASES.slice(0, PHASES.indexOf(phase) + 1));
    const read = artifacts.readBoundedRegularFile(f.target, 'fixture public failure', 4096);
    const text = Buffer.from(read.bytes).toString('utf8');
    const record = parseNativeTwoCyclePreparationFailureV1(text, f.expected);
    expect(record.phase).toBe(phase);
    expect(record.rawCausePublished).toBe(false);
    expect(text).not.toContain('private');
    expect(text).not.toContain(f.directory);
    expect(text).toBe(canonicalJson(record) + '\n');
    expect(Object.keys(record)).toHaveLength(13);
    expect(existsSync(join(f.directory, 'attempt'))).toBe(false);
  });
  it.each(PHASES)('retains async and primitive causes at %s', async phase => {
    for (const raw of [null, 7, 'secret-token', Symbol('secret'), Object.freeze(new Error('secret'))]) {
      let wrapped: unknown;
      try { await withNativeTwoCyclePreparationPhaseV1(phase, () => Promise.reject(raw)); }
      catch (error) { wrapped = error; }
      expect(originalNativeTwoCyclePreparationFailureV1(wrapped)).toBe(raw);
      const record = createNativeTwoCyclePreparationFailureV1(expected, wrapped);
      expect(record?.phase).toBe(phase);
      expect(canonicalJson(record)).not.toContain('secret');
    }
  });
  it('preserves successful order and values without any failure artifact', async () => {
    const f = fixture(), events: string[] = [];
    const values = [];
    for (const phase of PHASES) values.push(await withNativeTwoCyclePreparationPhaseV1(
      phase, () => { events.push(phase); return phase; }));
    expect(events).toEqual(PHASES); expect(values).toEqual(PHASES);
    expect(existsSync(f.target)).toBe(false);
  });
  it('rejects an invalid source phase before invoking the operation', async () => {
    let called = false, caught: unknown;
    try { await withNativeTwoCyclePreparationPhaseV1('unknown' as typeof PHASES[number],
      () => { called = true; }); }
    catch (error) { caught = error; }
    expect(called).toBe(false);
    expect(createNativeTwoCyclePreparationFailureV1(expected, caught)).toBeNull();
  });
  it('preserves an already wrapped callback-thrown value without unwrapping it twice', async () => {
    const inner = await failure('environment-before-build', Object.freeze(new Error('raw')));
    const outer = await failure('wasm-build', inner);
    expect(createNativeTwoCyclePreparationFailureV1(expected, outer)?.phase).toBe('wasm-build');
    expect(originalNativeTwoCyclePreparationFailureV1(outer)).toBe(inner);
  });
  it('does not assign a phase to load/import/post-attempt or forged errors', () => {
    for (const raw of [new Error('unknown'), { phase: PHASES[0] }, null, 1,
      new Proxy({}, { get() { throw new Error('must not inspect'); } })]) {
      expect(createNativeTwoCyclePreparationFailureV1(expected, raw)).toBeNull();
      expect(originalNativeTwoCyclePreparationFailureV1(raw)).toBe(raw);
    }
  });
  it('rejects every field violation even after its digest is recomputed', async () => {
    const record = createNativeTwoCyclePreparationFailureV1(expected,
      await failure('wasm-build', 'private'))!;
    const mutations: Record<string, unknown>[] = [
      { schema: 'foreign' }, { version: '1' }, { status: 'ok' },
      { configSha256Hex: 'd'.repeat(64) }, { expectedBridgeCommit: 'e'.repeat(40) },
      { pathIdentityDigestHex: 'f'.repeat(64) }, { phase: 'unknown' },
      { operationCompletionEstablished: true }, { rootCleanupEstablished: true },
      { twoCyclesEstablished: true }, { externalAcceptanceEstablished: true },
      { rawCausePublished: true },
    ];
    for (const mutation of mutations) expect(() => parseNativeTwoCyclePreparationFailureV1(
      reseal({ ...record, ...mutation }), expected)).toThrow();
    expect(() => parseNativeTwoCyclePreparationFailureV1(canonicalJson({
      ...record, receiptDigestHex: '0'.repeat(64) }) + '\n', expected)).toThrow();
    expect(() => parseNativeTwoCyclePreparationFailureV1(
      reseal({ ...record }, 'FOREIGN_DOMAIN'), expected)).toThrow();
    const { phase: _phase, ...missing } = record;
    for (const text of [reseal({ ...record, extra: false }), reseal(missing)]) {
      expect(() => parseNativeTwoCyclePreparationFailureV1(text, expected)).toThrow();
    }
    const valid = canonicalJson(record) + '\n';
    for (const text of ['\ufeff' + valid, valid.replace('\n', '\r\n'),
      valid.trimEnd(), valid + '\n', ' '.repeat(4097),
      valid.replace('"version":1', '"version":1,"version":1')]) {
      expect(() => parseNativeTwoCyclePreparationFailureV1(text, expected)).toThrow();
    }
  });
  it('preserves occupied targets, original error and existing bytes', async () => {
    const f = fixture(), context = captureNativeTwoCyclePreparationConfigV1(f.initial);
    writeFileSync(f.target, 'retained evidence\n', { flag: 'wx' });
    const raw = Object.freeze(new Error('original')), wrapped = await failure('wasm-build', raw);
    expect(tryPublishNativeTwoCyclePreparationFailureV1(f.initial, context, wrapped)).toBe(false);
    expect(readFileSync(f.target, 'utf8')).toBe('retained evidence\n');
    expect(originalNativeTwoCyclePreparationFailureV1(wrapped)).toBe(raw);
  });
  it('does not follow an occupied junction or modify its target', async () => {
    const f = fixture(), context = captureNativeTwoCyclePreparationConfigV1(f.initial);
    const retained = join(f.directory, 'retained'); mkdirSync(retained);
    writeFileSync(join(retained, 'sentinel'), 'keep');
    symlinkSync(retained, f.target, 'junction');
    const wrapped = await failure('wasm-build', 'original');
    expect(tryPublishNativeTwoCyclePreparationFailureV1(f.initial, context, wrapped)).toBe(false);
    expect(lstatSync(f.target).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(retained, 'sentinel'), 'utf8')).toBe('keep');
    expect(originalNativeTwoCyclePreparationFailureV1(wrapped)).toBe('original');
  });
  it('refuses missing context, stale config, identity replacement and changed context', async () => {
    const wrapped = await failure('environment-before-build', 'original');
    const noContext = fixture();
    expect(tryPublishNativeTwoCyclePreparationFailureV1(noContext.initial, null, wrapped)).toBe(false);
    expect(existsSync(noContext.target)).toBe(false);
    for (const mode of ['bytes', 'identity', 'context'] as const) {
      const f = fixture(), context = captureNativeTwoCyclePreparationConfigV1(f.initial);
      if (mode === 'bytes') writeFileSync(f.initial.configCanonicalPath, '{"changed":true}\n');
      if (mode === 'identity') {
        renameSync(f.initial.configCanonicalPath, join(f.directory, 'old-config.json'));
        writeFileSync(f.initial.configCanonicalPath, f.initial.configBytes, { flag: 'wx' });
      }
      const changed = mode === 'context' ? {
        ...f.initial, pathIdentityDigestHex: 'd'.repeat(64) } : f.initial;
      expect(tryPublishNativeTwoCyclePreparationFailureV1(changed, context, wrapped)).toBe(false);
      expect(existsSync(f.target)).toBe(false);
      expect(originalNativeTwoCyclePreparationFailureV1(wrapped)).toBe('original');
    }
  });
  it('allows legitimate sibling creation without freezing directory timestamps', async () => {
    const f = fixture(), context = captureNativeTwoCyclePreparationConfigV1(f.initial);
    writeFileSync(join(f.directory, 'unrelated-preparation-file'), 'retained', { flag: 'wx' });
    const wrapped = await failure('environment-after-build', 'original');
    expect(tryPublishNativeTwoCyclePreparationFailureV1(f.initial, context, wrapped)).toBe(true);
    expect(parseNativeTwoCyclePreparationFailureV1(readFileSync(f.target, 'utf8'),
      f.expected).phase).toBe('environment-after-build');
  });
  it('retains a synthetic partial writer result and never substitutes its error', async () => {
    const f = fixture(), context = captureNativeTwoCyclePreparationConfigV1(f.initial);
    const raw = Object.freeze(new Error('original')), wrapped = await failure('wasm-build', raw);
    const spy = vi.spyOn(artifacts, 'writeNewFile').mockImplementationOnce((path, bytes) => {
      writeFileSync(path, Buffer.from(bytes).subarray(0, 5), { flag: 'wx' });
      throw new Error('synthetic writer refusal');
    });
    try {
      expect(tryPublishNativeTwoCyclePreparationFailureV1(f.initial, context, wrapped)).toBe(false);
      expect(readFileSync(f.target)).toHaveLength(5);
      expect(originalNativeTwoCyclePreparationFailureV1(wrapped)).toBe(raw);
    } finally { spy.mockRestore(); }
  });
});
