import { describe, expect, it } from 'vitest';

import {
  LEGACY_MCU_DISABLED_MESSAGE,
  LegacyMcuDisabledError,
  assertLegacyMcuDisabled,
} from './legacy-peg-out-guard.js';

describe('legacy MCU containment guard', () => {
  it('always blocks creation and spend with the cryptographic reason', () => {
    for (const operation of ['legacy MCU creation', 'legacy MCU spend']) {
      expect(() => assertLegacyMcuDisabled(operation)).toThrow(LegacyMcuDisabledError);
      expect(() => assertLegacyMcuDisabled(operation)).toThrow(operation);
      expect(() => assertLegacyMcuDisabled(operation)).toThrow(LEGACY_MCU_DISABLED_MESSAGE);
    }
  });
});
