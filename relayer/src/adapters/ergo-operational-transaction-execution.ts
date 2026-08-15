import type {
  ErgoOperationalTransactionExecutionPorts,
} from '../relayer-core/ergo-operational-transaction-lifecycle.js';

type Ports = ErgoOperationalTransactionExecutionPorts;

export function createErgoOperationalSignerAdapter(
  sign: Ports['signer']['sign'],
): Ports['signer'] {
  return Object.freeze({
    sign: input => sign(input),
  });
}

export function createErgoOperationalCheckerAdapter(
  check: Ports['checker']['check'],
): Ports['checker'] {
  return Object.freeze({
    check: input => check(input),
  });
}

export function createErgoOperationalRevalidatorAdapter(
  revalidate: Ports['revalidator']['revalidate'],
): Ports['revalidator'] {
  return Object.freeze({
    revalidate: input => revalidate(input),
  });
}

export function createErgoOperationalBroadcastAuthorizerAdapter(
  authorize: Ports['broadcastAuthorizer']['authorize'],
): Ports['broadcastAuthorizer'] {
  return Object.freeze({
    authorize: input => authorize(input),
  });
}

export function createErgoOperationalJournalAdapter(
  journal: Ports['journal'],
): Ports['journal'] {
  return Object.freeze({
    reserve: input => journal.reserve(input),
    finalize: input => journal.finalize(input),
  });
}

export function createErgoOperationalSubmitterAdapter(
  submit: Ports['submitter']['submit'],
): Ports['submitter'] {
  return Object.freeze({
    submit: input => submit(input),
  });
}
