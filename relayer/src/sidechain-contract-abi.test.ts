import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EventFragment,
  FunctionFragment,
  Interface,
} from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  BRIDGE_ABI,
  SERG_ABI,
} from './sidechain-contract-abi.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');

describe('sidechain contract ABI closure', () => {
  it('keeps every relayer bridge fragment compatible with the compiled ABI', () => {
    assertFragmentsMatchCompiledAbi(
      BRIDGE_ABI,
      resolve(BRIDGE_ROOT, 'solidity', 'compiled', 'ErgoBridge.abi'),
    );
  });

  it('keeps every relayer token fragment compatible with the compiled ABI', () => {
    assertFragmentsMatchCompiledAbi(
      SERG_ABI,
      resolve(BRIDGE_ROOT, 'solidity', 'compiled', 'SERG.abi'),
    );
  });
});

function assertFragmentsMatchCompiledAbi(
  fragments: readonly string[],
  compiledAbiPath: string,
): void {
  const consumer = new Interface(fragments);
  const compiled = new Interface(JSON.parse(readFileSync(compiledAbiPath, 'utf8')));

  for (const fragment of consumer.fragments) {
    if (fragment instanceof FunctionFragment) {
      const signature = fragment.format('sighash');
      const compiledFragment = compiled.getFunction(signature);
      expect(compiledFragment, signature).not.toBeNull();
      if (!compiledFragment) continue;
      expect(compiledFragment.selector, signature).toBe(fragment.selector);
      expect(compiledFragment.stateMutability, signature)
        .toBe(fragment.stateMutability);
      expect(compiledFragment.inputs.map(input => input.type), signature)
        .toEqual(fragment.inputs.map(input => input.type));
      expect(compiledFragment.outputs.map(output => output.type), signature)
        .toEqual(fragment.outputs.map(output => output.type));
      continue;
    }
    if (fragment instanceof EventFragment) {
      const signature = fragment.format('sighash');
      const compiledFragment = compiled.getEvent(signature);
      expect(compiledFragment, signature).not.toBeNull();
      if (!compiledFragment) continue;
      expect(compiledFragment.topicHash, signature).toBe(fragment.topicHash);
      expect(compiledFragment.anonymous, signature).toBe(fragment.anonymous);
      expect(
        compiledFragment.inputs.map(input => ({
          type: input.type,
          indexed: Boolean(input.indexed),
        })),
        signature,
      ).toEqual(fragment.inputs.map(input => ({
        type: input.type,
        indexed: Boolean(input.indexed),
      })));
      continue;
    }
    throw new Error(`unsupported relayer ABI fragment: ${fragment.format()}`);
  }
}
