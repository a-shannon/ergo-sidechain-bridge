import {
  assertFrontierLabApplicationOwnerClaimV1,
  disposeFrontierLabApplicationOwnerV1,
  signFrontierLabApplicationCallsOnceV1,
  type FrontierLabApplicationOwnerV1,
} from '../../adapters/frontier-lab-application-owner-v1.js';
import {
  buildFrontierLabApplicationTransactionPlanV1,
  inspectFrontierLabApplicationSignedTransactionsV1,
} from '../../substrate-federated-isolated-devnet-frontier-application-transactions-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance,
  type SubstrateFederatedIsolatedDevnetPacketV2,
  type SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';

const SIGNING_OWNERS = new WeakSet<object>();

/** Same-process LAB composition only; signatures do not authorize transport or prove consensus. */
export async function signFrontierLabProofBoundApplicationV1(
  owner: Readonly<FrontierLabApplicationOwnerV1>,
  requestSha256Hex: string,
  packet: Readonly<SubstrateFederatedIsolatedDevnetPacketV2>,
  proof: Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>,
  ergoRecipientPublicKeyHex: string,
): Promise<Readonly<Record<'mint' | 'approval' | 'pegOut', string>>> {
  // Check custody before accepting ownership of cleanup for this call.
  assertFrontierLabApplicationOwnerClaimV1(owner, requestSha256Hex);
  if (SIGNING_OWNERS.has(owner)) throw new Error('LAB application signing composition is already consumed');
  SIGNING_OWNERS.add(owner);
  try {
    assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet);
    // Also validates the genuine inner receipt, runtime/profile and proof envelope.
    assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(proof);
    if (proof.packetReceiptDigestHex !== packet.receipt.receiptDigestHex
      || proof.targetDescriptorDigestHex !== packet.receipt.targetDescriptorDigestHex
      || proof.sourceProof.targetDescriptorDigestHex !== packet.receipt.targetDescriptorDigestHex
      || proof.sourceProofReceiptDigestHex !== proof.sourceProof.receiptDigestHex) {
      throw new Error('LAB signing proof is not bound to the retained packet and target');
    }
    const input = Object.freeze({
      mintReservationStatementHex: proof.sourceProof.request.statementHex,
      ergoRecipientPublicKeyHex,
    });
    const plan = buildFrontierLabApplicationTransactionPlanV1(input);
    if (plan.ownerAddressHex !== owner.ownerAddressHex
      || plan.mintReservationStatementIdHex !== proof.sourceProof.mintReservationStatementIdHex
      || plan.mintIdentityHex !== proof.sourceProof.mintIdentityHex) {
      throw new Error('LAB signing statement differs from the retained owner or proof identity');
    }
    const signed = await signFrontierLabApplicationCallsOnceV1(owner, requestSha256Hex, plan.transactions);
    inspectFrontierLabApplicationSignedTransactionsV1(input, signed);
    return signed;
  } finally {
    disposeFrontierLabApplicationOwnerV1(owner);
  }
}
