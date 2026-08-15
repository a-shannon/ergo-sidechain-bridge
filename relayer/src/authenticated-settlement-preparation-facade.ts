import type { AggregateSettlementService } from './aggregate-settlement-service.js';

type PrepareAuthenticatedSettlementUnsignedTx =
  AggregateSettlementService['prepareAuthenticatedSettlementUnsignedTx'];

export interface AuthenticatedSettlementPreparationFacade {
  prepareAuthenticatedSettlementUnsignedTx: PrepareAuthenticatedSettlementUnsignedTx;
}

export function createAuthenticatedSettlementPreparationFacade(
  service: Pick<AggregateSettlementService, 'prepareAuthenticatedSettlementUnsignedTx'>,
): AuthenticatedSettlementPreparationFacade {
  return Object.freeze({
    prepareAuthenticatedSettlementUnsignedTx: (
      ...args: Parameters<PrepareAuthenticatedSettlementUnsignedTx>
    ) => service.prepareAuthenticatedSettlementUnsignedTx(...args),
  });
}
