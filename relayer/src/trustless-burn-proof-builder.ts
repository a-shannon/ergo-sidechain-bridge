import {
  buildTrustlessBurnInclusionProof,
  type TrustlessBurnInclusionProof,
} from './trustless-burn-proof.js';
import {
  buildTrustlessBurnLeafInputFromVerifiedPegOutBurn,
  type VerifiedPegOutBurn,
} from './peg-out-burn-verifier.js';
import {
  selectSubstrateGrandpaV1AssetProfile,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

export interface VerifiedPegOutBurnProofInput {
  burn: VerifiedPegOutBurn;
  recipientErgoTreeHashHex: string;
}

export interface TrustlessBurnProofFromVerifiedPegOutBurnsInput {
  assetProfileId: string;
  sidechainIdHex: string;
  burns: readonly VerifiedPegOutBurnProofInput[];
  targetBurnIdHex: string;
}

export function buildTrustlessBurnProofFromVerifiedPegOutBurns(
  input: TrustlessBurnProofFromVerifiedPegOutBurnsInput,
): TrustlessBurnInclusionProof {
  selectSubstrateGrandpaV1AssetProfile(input.assetProfileId);
  const leaves = input.burns.map(entry => buildTrustlessBurnLeafInputFromVerifiedPegOutBurn({
    burn: entry.burn,
    assetProfileId: input.assetProfileId,
    sidechainIdHex: input.sidechainIdHex,
    recipientErgoTreeHashHex: entry.recipientErgoTreeHashHex,
  }));

  return buildTrustlessBurnInclusionProof(leaves, input.targetBurnIdHex);
}
