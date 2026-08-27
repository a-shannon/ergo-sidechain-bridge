import { describe, expect, it } from 'vitest';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1,
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1,
} from './relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';

const hex = (character: string, bytes: number): string => character.repeat(bytes * 2);

function anchor() {
  const extensionValueHex = `${hex('1', 32)}${hex('2', 32)}`;
  return Object.freeze({
    extensionValueHex,
    anchorHeaderIdHex: hex('3', 32),
    anchorHeight: 42,
    anchorContextIndex: 0,
    anchorExtensionRootHex: hex('4', 32),
    extensionFields: Object.freeze([
      Object.freeze({ keyHex: '0100', valueHex: 'aa' }),
      Object.freeze({ keyHex: '0401', valueHex: extensionValueHex }),
    ]),
    extensionMembershipProofHex: 'bb',
    headers: Object.freeze([
      Object.freeze({
        canonicalHeaderBytesHex: hex('5', 64),
        idHex: hex('3', 32),
        height: 42,
        extensionRootHex: hex('4', 32),
      }),
    ]),
  });
}

describe('canonical isolated-devnet checkpoint extension observation V1', () => {
  it('joins an anchor to the same process observation domain without its envelope digest', () => {
    const value = anchor();
    const fromAnchor =
      deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
        value,
      );
    const direct =
      deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1({
        checkpoint: {
          network: 'devnet',
          fullHeight: value.anchorHeight,
          indexedHeight: value.anchorHeight,
          headerIdHex: value.anchorHeaderIdHex,
        },
        expectedExtensionValueHex: value.extensionValueHex,
        canonicalHeaderBytesHex: value.headers[0]!.canonicalHeaderBytesHex,
        extensionRootHex: value.anchorExtensionRootHex,
        extensionFields: value.extensionFields,
        extensionMembershipProofHex: value.extensionMembershipProofHex,
      });

    expect(fromAnchor).toBe(direct);
    expect(fromAnchor).toMatch(/^[0-9a-f]{64}$/u);
    const nodeDigestHex = sha256CanonicalJson({
      headerIdHex: value.anchorHeaderIdHex,
      height: value.anchorHeight,
      canonicalHeaderBytesHex: value.headers[0]!.canonicalHeaderBytesHex,
      extensionRootHex: value.anchorExtensionRootHex,
      fields: value.extensionFields,
      extensionMembershipProofHex: value.extensionMembershipProofHex,
    }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_EXTENSION_NODE_OBSERVATION_V1');
    expect(fromAnchor).toBe(sha256CanonicalJson({
      schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
      checkpoint: {
        network: 'devnet',
        fullHeight: value.anchorHeight,
        indexedHeight: value.anchorHeight,
        headerIdHex: value.anchorHeaderIdHex,
      },
      extensionKeyHex: '0401',
      extensionValueHex: value.extensionValueHex,
      primaryObservationDigestHex: nodeDigestHex,
      witnessObservationDigestHex: nodeDigestHex,
    }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_EXTENSION_OBSERVATION_V1'));
  });

  it.each([
    ['header bytes', (value: ReturnType<typeof anchor>) => ({
      ...value,
      headers: [{ ...value.headers[0]!, canonicalHeaderBytesHex: hex('6', 64) }],
    })],
    ['extension root', (value: ReturnType<typeof anchor>) => ({
      ...value,
      anchorExtensionRootHex: hex('7', 32),
      headers: [{ ...value.headers[0]!, extensionRootHex: hex('7', 32) }],
    })],
    ['side field', (value: ReturnType<typeof anchor>) => ({
      ...value,
      extensionFields: [
        { keyHex: '0100', valueHex: 'cc' },
        value.extensionFields[1]!,
      ],
    })],
    ['membership proof', (value: ReturnType<typeof anchor>) => ({
      ...value,
      extensionMembershipProofHex: 'dd',
    })],
  ] as const)('changes when the canonical %s changes', (_label, mutate) => {
    const value = anchor();
    expect(
      deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
        mutate(value),
      ),
    ).not.toBe(
      deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
        value,
      ),
    );
  });

  it('rejects an anchor context that does not bind the selected header', () => {
    const value = anchor();
    expect(() =>
      deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1({
        ...value,
        headers: [{ ...value.headers[0]!, idHex: hex('8', 32) }],
      })
    ).toThrow(/anchor context binding changed/u);
  });
});
