import { describe, expect, it, vi } from 'vitest';

import {
  createAuthenticatedSettlementPreparationFacade,
} from './authenticated-settlement-preparation-facade.js';

describe('authenticated settlement preparation facade', () => {
  it('exposes only the preparation capability at runtime', async () => {
    const prepare = vi.fn(async () => ({ expectedTxId: '11'.repeat(32) }));
    const service = {
      prepareAuthenticatedSettlementUnsignedTx: prepare,
      submitAuthenticatedSettlement: vi.fn(),
      signAndSubmit: vi.fn(),
    };

    const facade = createAuthenticatedSettlementPreparationFacade(service as any);

    expect(Object.keys(facade)).toEqual(['prepareAuthenticatedSettlementUnsignedTx']);
    expect(Object.isFrozen(facade)).toBe(true);
    expect('submitAuthenticatedSettlement' in facade).toBe(false);
    expect('signAndSubmit' in facade).toBe(false);
    await facade.prepareAuthenticatedSettlementUnsignedTx({ candidateId: '22'.repeat(32) } as any);
    expect(prepare).toHaveBeenCalledOnce();
  });
});
