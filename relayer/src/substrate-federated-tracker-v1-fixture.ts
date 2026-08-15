import { readFileSync } from 'node:fs';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1Input,
  type SubstrateFederatedCheckpointStatementV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerV1Context,
  type SubstrateFederatedTrackerContractV1Identity,
  type SubstrateFederatedTrackerV1Context,
} from './substrate-federated-tracker-v1.js';

interface TrackerVectorInput {
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: Omit<SubstrateFederatedCheckpointStatementV1Input, 'profile'>;
    readonly tracker: {
      readonly currentErgoHeight: number;
    };
  };
}

export async function buildSubstrateFederatedTrackerV1AcceptanceFixture():
Promise<Readonly<SubstrateFederatedTrackerV1Context>> {
  const vector = JSON.parse(readFileSync(new URL(
    '../test-vectors/substrate-federated-v1-tracker-admission.json',
    import.meta.url,
  ), 'utf8')) as TrackerVectorInput;
  const contract = JSON.parse(readFileSync(new URL(
    '../test-vectors/substrate-federated-v1-tracker-contract.json',
    import.meta.url,
  ), 'utf8')) as SubstrateFederatedTrackerContractV1Identity;
  const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
  const statement = buildSubstrateFederatedCheckpointStatementV1({
    profile,
    ...vector.input.statement,
  });
  return buildSubstrateFederatedTrackerV1Context({
    contract,
    profile,
    encodedStatementHex: statement.encodedStatementHex,
    currentErgoHeight: vector.input.tracker.currentErgoHeight,
    anchorContextIndex: 1,
  });
}
