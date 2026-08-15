import {
  createErgoOperationalBroadcastAuthorizerAdapter,
  createErgoOperationalCheckerAdapter,
  createErgoOperationalJournalAdapter,
  createErgoOperationalRevalidatorAdapter,
  createErgoOperationalSignerAdapter,
  createErgoOperationalSubmitterAdapter,
} from '../../adapters/ergo-operational-transaction-execution.js';
import {
  executeErgoOperationalTransaction,
  type ErgoOperationalExecutionResult,
  type ErgoOperationalTransactionExecutionPorts,
  type ErgoOperationalTransactionInput,
} from '../../relayer-core/ergo-operational-transaction-lifecycle.js';

type Ports = ErgoOperationalTransactionExecutionPorts;

export interface ErgoOperationalTransactionApplicationDeps {
  readonly sign: Ports['signer']['sign'];
  readonly check: Ports['checker']['check'];
  readonly revalidate: Ports['revalidator']['revalidate'];
  readonly authorize: Ports['broadcastAuthorizer']['authorize'];
  readonly reserve: Ports['journal']['reserve'];
  readonly finalize: Ports['journal']['finalize'];
  readonly submit: Ports['submitter']['submit'];
  readonly signer?: never;
  readonly checker?: never;
  readonly submitter?: never;
  readonly broadcastCapability?: never;
  readonly fundsAuthority?: never;
}

export async function runErgoOperationalTransaction(
  input: ErgoOperationalTransactionInput,
  deps: ErgoOperationalTransactionApplicationDeps,
): Promise<ErgoOperationalExecutionResult> {
  const ports: ErgoOperationalTransactionExecutionPorts = Object.freeze({
    signer: createErgoOperationalSignerAdapter(deps.sign),
    checker: createErgoOperationalCheckerAdapter(deps.check),
    revalidator: createErgoOperationalRevalidatorAdapter(deps.revalidate),
    broadcastAuthorizer:
      createErgoOperationalBroadcastAuthorizerAdapter(deps.authorize),
    journal: createErgoOperationalJournalAdapter({
      reserve: deps.reserve,
      finalize: deps.finalize,
    }),
    submitter: createErgoOperationalSubmitterAdapter(deps.submit),
  });
  return executeErgoOperationalTransaction(input, ports);
}
