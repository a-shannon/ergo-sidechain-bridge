import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildWasmAvlEnvironment,
  buildWasmAvlPlan,
  validateWasmPackVersion,
} from './scripts/build-wasm-avl.js';

const BRIDGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOME_ROOT = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
if (!process.env.CARGO_HOME && !HOME_ROOT) throw new Error('test CARGO_HOME is unavailable');
const CARGO_HOME = path.resolve(process.env.CARGO_HOME ?? path.join(HOME_ROOT!, '.cargo'));
const RUSTUP_HOME = path.resolve(process.env.RUSTUP_HOME ?? path.join(HOME_ROOT!, '.rustup'));
const PATH_VALUE = process.env.PATH ?? process.env.Path;
if (!PATH_VALUE) throw new Error('test PATH is unavailable');

describe('deterministic WASM AVL build', () => {
  it('uses encoded remap flags so paths with spaces remain one rustc argument', () => {
    const env = buildWasmAvlEnvironment({
      env: { KEEP: 'discarded', PATH: PATH_VALUE },
      bridgeRoot: '/workspace with spaces/bridge',
      cargoHome: '/profile with spaces/.cargo',
      rustupHome: '/profile with spaces/.rustup',
    });
    expect(env.KEEP).toBeUndefined();
    expect(env.CARGO_INCREMENTAL).toBe('0');
    expect(env.CARGO_HOME).toBe('/profile with spaces/.cargo');
    expect(env.CARGO_ENCODED_RUSTFLAGS?.split('\u001f')).toEqual([
      '--remap-path-prefix=/profile with spaces/.cargo=/cargo-home',
      '--remap-path-prefix=/workspace with spaces/bridge=/bridge-source',
    ]);
  });

  it.each([
    'CARGO_ENCODED_RUSTFLAGS',
    'RUSTC_WORKSPACE_WRAPPER',
    'RUSTC_WRAPPER',
    'RUSTFLAGS',
  ])('rejects inherited %s', field => {
    expect(() => buildWasmAvlEnvironment({
      env: { [field.toLowerCase()]: 'unreviewed' },
      bridgeRoot: BRIDGE_ROOT,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
    })).toThrow(`forbidden override ${field}`);
  });

  it.each([
    'CARGO_BUILD_TARGET',
    'CARGO_PROFILE_RELEASE_OPT_LEVEL',
    'CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS',
  ])('rejects inherited %s', field => {
    expect(() => buildWasmAvlEnvironment({
      env: { [field]: 'unreviewed' },
      bridgeRoot: BRIDGE_ROOT,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
    })).toThrow(`forbidden override ${field}`);
  });

  it('rejects the encoded rustflags separator inside a remap source', () => {
    expect(() => buildWasmAvlEnvironment({
      env: { PATH: PATH_VALUE },
      bridgeRoot: `/workspace${'\u001f'}injected`,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
    })).toThrow('unsafe remap separator');
  });

  it('pins the wasm-pack command and canonical crate root', () => {
    const plan = buildWasmAvlPlan({
      bridgeRoot: BRIDGE_ROOT,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
      env: { PATH: PATH_VALUE },
    });
    expect(plan.executable).toBe('wasm-pack');
    expect(plan.args).toEqual(['build', '--target', 'nodejs']);
    expect(plan.cwd).toBe(path.resolve(BRIDGE_ROOT, 'wasm-avl'));
    expect(plan.env.RUSTUP_HOME).toBe(RUSTUP_HOME);
    expect(plan.env.CARGO_ENCODED_RUSTFLAGS?.split('\u001f')).toEqual([
      `--remap-path-prefix=${CARGO_HOME}=/cargo-home`,
      `--remap-path-prefix=${BRIDGE_ROOT}=/bridge-source`,
    ]);
  });

  it('accepts only the reviewed wasm-pack version', () => {
    expect(() => validateWasmPackVersion('wasm-pack 0.14.0\n')).not.toThrow();
    expect(() => validateWasmPackVersion('wasm-pack 0.15.0\n')).toThrow(
      'requires wasm-pack 0.14.0',
    );
  });
});
