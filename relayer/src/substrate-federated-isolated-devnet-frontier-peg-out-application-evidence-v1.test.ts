import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1ConsumerConstruction,
  consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1,
} from './substrate-federated-isolated-devnet-frontier-peg-out-application-evidence-v1.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(sourceDirectory, '..', '..');
const canonicalFrontierPatchBytes = readFileSync(path.resolve(
  bridgeRoot,
  'sources',
  'frontier',
  '0001-bridge-runtime-commitment.patch',
));
const applicationEvidenceOverlayPatchBytes = readFileSync(path.resolve(
  bridgeRoot,
  'sources',
  'frontier',
  '0002-federated-lab-peg-out-application-proof.patch',
));

const EXACT_PRODUCER_STDOUT = [
  'bridge-lab-peg-out-sidechain-id=0xd82f3dc47cfc500fd972fe3c87b0cd8bd42e29b50bf58d0a8dad03c677f49633',
  'bridge-lab-peg-out-execution-block-number=7',
  'bridge-lab-peg-out-execution-block-hash=0xd14e7f50ba77ac0b7353267dcd916f4012cd26dde96defc746fb3ad76f2a5410',
  'bridge-lab-peg-out-bridge-address=0x970951a12f975e6762482aca81e57d5a2a4e73f4',
  'bridge-lab-peg-out-token-address=0xc01ee7f10ea4af4673cfff62710e1d7792aba8f3',
  'bridge-lab-peg-out-transaction-index=1',
  'bridge-lab-peg-out-transaction-hash=0x1c32b916c276066251965fd44a2eee5be857e101c615b6bc09591946763c2e50',
  'bridge-lab-peg-out-receipt-status=1',
  'bridge-lab-peg-out-log-index=3',
  'bridge-lab-peg-out-topic0=0x22257318f701aff7be06ddd1ea71190b56ffc8c5c9431f202df9bf6d9bd25cf3',
  'bridge-lab-peg-out-topic1=0x000000000000000000000000f24ff3a9cf04c71dbc94d0b566f7a27b94566cac',
  'bridge-lab-peg-out-data=0x0000000000000000000000000000000000000000000000000000000000989680000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f8179800000000000000000000000000000000000000000000000000000000000000',
  'bridge-lab-peg-out-bridge-event-root=0x29e0100dff08579432408ade2fbe4d7419f786ad474b663a3fa5fc7da3d4ed78',
  'bridge-lab-peg-out-burn-leaf-count=1',
  'bridge-lab-peg-out-burn-id=0xf911bc2f5822330556ddc558f7f183fd0b976f1f253f5038049403d2dc664903',
  'bridge-lab-peg-out-burn-leaf-hash=0x29e0100dff08579432408ade2fbe4d7419f786ad474b663a3fa5fc7da3d4ed78',
  'bridge-lab-peg-out-net-amount-nano-erg=10000000',
  'bridge-lab-peg-out-recipient-ergo-tree=0x0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  'bridge-lab-peg-out-recipient-ergo-tree-hash=0x0f6b39a5b637a8403f03714361c319298c406d2100ed836f413cd9e4c98a996e',
  'bridge-lab-peg-out-supply-before=15000000',
  'bridge-lab-peg-out-supply-after=5000000',
  'bridge-lab-peg-out-escrow-after=5000000',
].join('\n');

describe('federated isolated-devnet Frontier peg-out application evidence V1', () => {
  it('binds the real application burn, runtime commitment, and supply conservation', () => {
    const receipt = consume(EXACT_PRODUCER_STDOUT);

    expect(receipt.status).toBe('local_application_burn_transcript_validated');
    expect(receipt.execution).toEqual({
      sidechainIdHex:
        '0xd82f3dc47cfc500fd972fe3c87b0cd8bd42e29b50bf58d0a8dad03c677f49633',
      blockNumber: 7,
      blockHashHex:
        '0xd14e7f50ba77ac0b7353267dcd916f4012cd26dde96defc746fb3ad76f2a5410',
      transactionIndex: 1,
      transactionHashHex:
        '0x1c32b916c276066251965fd44a2eee5be857e101c615b6bc09591946763c2e50',
      eventIndex: 3,
    });
    expect(receipt.burn).toMatchObject({
      burnIdHex:
        '0xf911bc2f5822330556ddc558f7f183fd0b976f1f253f5038049403d2dc664903',
      bridgeEventRootHex:
        '0x29e0100dff08579432408ade2fbe4d7419f786ad474b663a3fa5fc7da3d4ed78',
      burnLeafHashHex:
        '0x29e0100dff08579432408ade2fbe4d7419f786ad474b663a3fa5fc7da3d4ed78',
      amountNanoErg: '10000000',
    });
    expect(receipt.conservation).toEqual({
      supplyBeforeNanoErg: '15000000',
      supplyAfterNanoErg: '5000000',
      bridgeEscrowAfterNanoErg: '5000000',
      bridgeFeeNanoErg: '5000000',
    });
    expect(receipt.boundary).toMatchObject({
      completeReceiptArrayExported: false,
      receiptTopologyIndependentlyEstablished: false,
      callerSuppliedStdoutHasProcessProvenance: false,
      sidechainFinalityEstablished: false,
      payoutAuthorized: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1ConsumerConstruction(
      receipt,
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1ConsumerConstruction({
        ...receipt,
      })
    ).toThrow(/lacks consumer construction provenance/u);
  });

  it.each([
    [
      'application drift',
      'bridge-address',
      '0x1111111111111111111111111111111111111111',
      /different application/u,
    ],
    [
      'token application drift',
      'token-address',
      '0x1111111111111111111111111111111111111111',
      /different application/u,
    ],
    [
      'execution block drift',
      'execution-block-number',
      '8',
      /execution topology changed/u,
    ],
    [
      'event topic drift',
      'topic0',
      `0x${'11'.repeat(32)}`,
      /different event topic/u,
    ],
    [
      'indexed owner drift',
      'topic1',
      `0x${'00'.repeat(12)}${'11'.repeat(20)}`,
      /different synthetic owner/u,
    ],
    [
      'ABI amount drift',
      'data',
      replaceHexRange(markerValue(EXACT_PRODUCER_STDOUT, 'data'), 0, 32, `00`.repeat(31) + '01'),
      /burn or commitment binding changed/u,
    ],
    [
      'ABI recipient offset drift',
      'data',
      replaceHexRange(markerValue(EXACT_PRODUCER_STDOUT, 'data'), 32, 64, `${'00'.repeat(31)}41`),
      /recipient offset changed/u,
    ],
    [
      'ABI recipient length drift',
      'data',
      replaceHexRange(markerValue(EXACT_PRODUCER_STDOUT, 'data'), 64, 96, `${'00'.repeat(31)}20`),
      /one compressed public key/u,
    ],
    [
      'invalid recipient key',
      'data',
      replaceHexRange(markerValue(EXACT_PRODUCER_STDOUT, 'data'), 96, 129, `02${'ff'.repeat(32)}`),
      /valid secp256k1 public key/u,
    ],
    [
      'ABI padding drift',
      'data',
      replaceHexRange(markerValue(EXACT_PRODUCER_STDOUT, 'data'), 159, 160, '01'),
      /ABI padding must be zero/u,
    ],
    [
      'recipient tree drift',
      'recipient-ergo-tree',
      `0x0008cd03${'11'.repeat(32)}`,
      /burn or commitment binding changed/u,
    ],
    [
      'event topology drift',
      'log-index',
      '2',
      /execution topology changed/u,
    ],
    [
      'burn identity drift',
      'burn-id',
      `0x${'22'.repeat(32)}`,
      /burn or commitment binding changed/u,
    ],
    [
      'root drift',
      'bridge-event-root',
      `0x${'33'.repeat(32)}`,
      /burn or commitment binding changed/u,
    ],
    [
      'burn leaf drift',
      'burn-leaf-hash',
      `0x${'44'.repeat(32)}`,
      /burn or commitment binding changed/u,
    ],
    [
      'supply drift',
      'supply-after',
      '4999999',
      /supply or fee conservation changed/u,
    ],
    [
      'initial supply drift',
      'supply-before',
      '14999999',
      /supply or fee conservation changed/u,
    ],
    [
      'fee escrow drift',
      'escrow-after',
      '4999999',
      /supply or fee conservation changed/u,
    ],
    [
      'receipt failure',
      'receipt-status',
      '0',
      /execution topology changed/u,
    ],
  ])('rejects isolated %s', (_label, marker, value, error) => {
    expect(() => consume(replaceMarker(EXACT_PRODUCER_STDOUT, marker, value)))
      .toThrow(error);
  });

  it('rejects missing, duplicate, and unknown producer markers', () => {
    expect(() => consume(EXACT_PRODUCER_STDOUT.replace(
      /^bridge-lab-peg-out-burn-id=.*$/mu,
      '',
    ))).toThrow(/missing.*burn-id/u);
    expect(() => consume(`${EXACT_PRODUCER_STDOUT}\nbridge-lab-peg-out-burn-id=0x${'44'.repeat(32)}`))
      .toThrow(/duplicate.*burn-id/u);
    expect(() => consume(`${EXACT_PRODUCER_STDOUT}\nbridge-lab-peg-out-authority=true`))
      .toThrow(/unknown.*authority/u);
  });

  it('rejects either changed source patch', () => {
    const changedCanonical = Buffer.from(canonicalFrontierPatchBytes);
    changedCanonical[0] ^= 0x01;
    expect(() => consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1({
      stdout: EXACT_PRODUCER_STDOUT,
      canonicalFrontierPatchBytes: changedCanonical,
      applicationEvidenceOverlayPatchBytes,
    })).toThrow(/canonical Frontier patch bytes changed/u);

    const changedOverlay = Buffer.from(applicationEvidenceOverlayPatchBytes);
    changedOverlay[0] ^= 0x01;
    expect(() => consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1({
      stdout: EXACT_PRODUCER_STDOUT,
      canonicalFrontierPatchBytes,
      applicationEvidenceOverlayPatchBytes: changedOverlay,
    })).toThrow(/overlay bytes changed/u);
  });
});

function consume(stdout: string) {
  return consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1({
    stdout,
    canonicalFrontierPatchBytes,
    applicationEvidenceOverlayPatchBytes,
  });
}

function replaceMarker(stdout: string, marker: string, value: string): string {
  const expression = new RegExp(
    `^bridge-lab-peg-out-${marker}=.*$`,
    'mu',
  );
  const updated = stdout.replace(
    expression,
    `bridge-lab-peg-out-${marker}=${value}`,
  );
  if (updated === stdout) throw new Error(`test marker ${marker} is absent`);
  return updated;
}

function markerValue(stdout: string, marker: string): string {
  const match = new RegExp(`^bridge-lab-peg-out-${marker}=(.*)$`, 'mu').exec(stdout);
  if (!match) throw new Error(`test marker ${marker} is absent`);
  return match[1];
}

function replaceHexRange(
  value: string,
  startByte: number,
  endByte: number,
  replacementHex: string,
): string {
  const clean = value.slice(2);
  if (replacementHex.length !== (endByte - startByte) * 2) {
    throw new Error('test replacement has the wrong byte length');
  }
  return `0x${clean.slice(0, startByte * 2)}${replacementHex}${clean.slice(endByte * 2)}`;
}
