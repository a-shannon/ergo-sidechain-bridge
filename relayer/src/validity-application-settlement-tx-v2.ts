/**
 * Unsigned, offline assembly for Application-Bound Validity Settlement V2.
 *
 * This builder has no checker, signer, submitter, or broadcast capability.
 * It accepts only the exact WP-06AD tracker family and binds its V2 settlement
 * plan to the complete DUP/vault/payout/fee transaction shape.
 */

import { createHash } from 'crypto';

import {
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import { decodePegInSourceIntentV2Hex, PEG_IN_SOURCE_INTENT_V2_BYTES } from './peg-in-causal-admission-v2.js';
import {
  decodeBridgeCausalApplicationBindingV2,
} from './bridge-validity-application-statement-v2.js';
import {
  encodeApplicationValiditySpvTrackerAvlRegister,
} from './spv-tracker-validity-v2.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  deriveValidityApplicationSettlementProfileDescriptorDigestV2,
  encodeValidityApplicationSettlementProfileV2,
  type ValidityApplicationSettlementPlanV2,
} from './validity-application-settlement-v2.js';
import { deriveEip0045ContractIdHex } from './bridge-validity-finality-statement-v2.js';

export const VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX =
  'bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493abe';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_SIGMA_STATE_COMMIT =
  'f78deadd668f801e7fae3bc884283f79c6f484fa';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_CONTRACT_IDENTITY_SCHEMA =
  'e2s.bridge-validity-application-settlement-contracts.v2';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_CONTRACT_ID_HEX =
  'a77327ce3bd279b725ea4dddbbbd78046ab744f3cb75ccf46d5147046fe77064';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_CONTRACT_ID_HEX =
  '58d1e5b169a86e7906d4d87fe2a4214bd5327ff4053370c6a0fbe3b8e79939b9';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_BYTES = 3562;
export const VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_BYTES = 701;
export const VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_SHA256_HEX =
  '043657b6d81e88eefcc3e7a967f021689f01d54fbcbd88ec2e5696a91ae03e11';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_SHA256_HEX =
  '52c03c0cc46d3c168649918ab8962da30a0163ef28eb33a0a0d1ab2630582618';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX =
  '108802040204000e20222222222222222222222222222222222222222222222222222222222222222204e4050400044c0e264532535f5350565f56414c49444954595f4150504c49434154494f4e5f56414c55455f563200044c0202044e020104500201045202000e200000000000000000000000000000000000000000000000000000000000000000020002000200020004dc0204e40204b4010400045c0e2e4532535f56414c49444954595f4150504c49434154494f4e5f534554544c454d454e545f42554e444c455f563200045c0202045e02010460020104620200020002000200020002000200020002000484010494010400040c02000200020002000200020004000e2055555555555555555555555555555555555555555555555555555555555555550e20a0a5ba76f51548dfa7148b623cedcbb6205ce1f51428a508480ece5df66e73f5049402049c02040004000e20a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2049a030402044204820104c2010464047404020454049401047404840102000200020002000200020002000400040e04940104a4010400040e0400040004a40104b401040004080500044204b40105000402040005000400048004040004020400040404020408040404100406042004080440040a048001040c048002040e0410040004b40104b4010e1a4532535f54525553544c4553535f4255524e5f4e4f44455f563104000402040404060408040a040c040e0e1a4532535f54525553544c4553535f4255524e5f4c4541465f5631010104420402044204020404040804100420044004800104800204040402020002010200020104020402010004ca0204da0204ca030e1433333333333333333333333333333333333333330e1444444444444444444444444444444444444444440e14000000000000000000000000000000000000000004920304a20304040402040204000e20a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1040005020e20adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b0e20bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493abe04940104d401049c0204dc02050005800404e40204a4030e205feb8c9311afef7c729ef2df0c0648f87689b10f9e0b9f48637c15024f6b587a04a40304e40304e40304a40404a40404e40404e40404a4050e20230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c04a40504e4050e2023c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d38304d40104940205000514040204020400040005020400040005020400040202010e184532535f54525553544c4553535f4255524e5f49445f563104c201048202048202048a020e234532535f5350565f56414c49444954595f4150504c49434154494f4e5f4b45595f56320442048201048a0204ca0204da02049a03020105000400040604020400040004020202040204420e201111111111111111111111111111111111111111111111111111111111111111044204820104820104aa0104aa0104d20104d20104920204920204d20204d2020492030500050004a20304ca030440050004000e691005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a5730404000580897a05c0ac8002050004060580897a0408040404c801040001000440040004400448d843d601db6501fed60293b172017300d603957202b27201730100a7d604db63087203d6057302d606e4e3000ed607e4e3010ed608dc640ae4c6720305640272067207d609830002d60ae572087209d60bededededed93b1720a730393b4720a73047305730693b2720a730700730893b2720a730900730a93b2720a730b00730c93b2720a730d00730ed60c730fd60d8304027310731173127313d60e7cb3720d95720bb4720a73147315720dd60fe4e3030ed610b1720fd611ededededed927210731693b4720f73177318731993b2720f731a00731b93b2720f731c00731d93b2720f731e00731f93b2720f7320007321d61283080273227323732473257326732773287329d613957211b4720f732a732b7212d61493b47213732c732d830602732e732f7330733173327333d6159572147d7c7213047334d6167335d6177336d6187cb3720d95720bb4720a73377338720dd619b2a4733900d61adb63087219d61bb2a5733a00d61c733bd61de4e3020ed61e93b1721d733cd61f95721eb4721d733d733e720cd62095721eb4721d733f7340720cd621957211b4720f734173427212d622b2a5734300d62395720bb4720a73447345720cd624957211b4720f734673477212d62583070273487349734a734b734c734d734ed62693b47224734f73507225d627957211b4720f735173527212d62893b47227735373547225d6299572267d7c7224047355d62a9572287d7c7227047356d62b957211b4720f735773587212d62c93b4722b7359735a720dd62d95722c7c722b735bd62e9c722a735cd62f9a735d722ed630997210722fd631ededed722c91722d735e917230735f8f722d7e723005d6329a722f9572317d722d047360d633ededededededed7211917c72217361ededededededed7226721472289172157362907215736392722973648f7229721593722a95907215736573669590721573677368959072157369736a95907215736b736c95907215736d736e95907215736f7370959072157371737295907215737373747375723192722e737692722f7377917232722f8f72327210d634957233b4720f7378722f830002d6357379d636957233b0830804737a737b737c737d737e737f7380017381018602cbb3738201721d738301d901364c490ed803d6388c723602d6398c723601d63a8c72390195927238722a7239d806d63b9c7238738401d63cb27234723b00d63db472349a723b7385019a723b738601d63eb2830804738701738801738901738a01738b01738c01738d01738e01723800d63f9d7229723ed64095939e723f738f0173900173910173920186029593723c739301cbb3b37235723d723acbb3b37235723a723ded8c723902ed93723c7240ecefed937240739401929a723f7395019d999a7215723e739601723ed801d641723a93723d72418602720c739701d637e4c672190564d6387c95721eb4721d7398017399017212d639e5c6a7040e7209d63a93b17239739a01d63b739b01d63c739c01d63d739d01d63e7c95723ab47239739e01739f017212d63fe5c6a7050e7209d64099c1a77238d641b2a473a00100d642b1a5d643b2a599724273a10100d1edededededededededededededededed93b1720473a201938cb2720473a301000173a401938cb2720473a501000273a601eded93cbc2720373a70193e4c67203060e720593e4c67203090e73a801e67208edededededededededed9495720bb4720a73a90173aa01720c720c9495720bb4720a73ab0173ac01720c720c91720e73ad0190720e73ae0193720e7e7215059395720bb4720a73af0173b001720c73b1019395720bb4720a73b20173b301720c72169395720bb4720a73b40173b501720c72179495720bb4720a73b60173b701720c720c9395720bb4720a73b80173b901720c73ba019395720bb4720a73bb0173bc01720c73bd01ededed9495720bb4720a73be0173bf01720c720c92721873c0019072187ea30592997ea305721873c101ededededed93b1721a73c20193b1db6308721b73c301938cb2721a73c4010001721c938cb2721a73c501000273c601938cb2db6308721b73c7010001721c938cb2db6308721b73c801000273c901ed93e4c67219060e721693e4c6721b060e7216edededededed721e9395721eb4721d73ca0173cb0183000283010273cc0193721f720593cbb3b3b373cd01721f95721eb4721d73ce0173cf01720c95721eb4721d73d00173d101720d722093cbb3b3b373d201721f722195721eb4721d73d30173d401720c72069395721eb4721d73d50173d601720ccbc272229395721eb4721d73d70173d801720c720ceded947223720c8c7236029372238c723601efe6dc640a7237027220957233b4720f722f723283000293e4c6721b0564e4dc640c72370283013c0e0e8602722083010273d901957233b4720f72327210830002eded91723873da0193c17222723893b1db6308722273db01ededededededededededededededededededed93b1a473dc0193c5a7c5b2a473dd010093b1db6308a773de01723a93b4723973df0173e00183010273e10193b4723973e20173e30173e40193b4723973e50173e601720593b4723973e70173e801723b93b4723973e90173ea01723c94723b723d94723c723d93b4723973eb0173ec01721693b4723973ed0173ee01721793b4723973ef0173f001720c91723e73f10191c1a773f20190c1a7723e94b4723973f30173f401723d93b1723f73f50194723f720ceded92724073f601ededededed93b1db6308724173f70193c17241c1724393c2724373f80193b1db6308724373f90192c1724373fa0190c1724373fb01eced93724073fc0193724273fd0195ed92724073fe0193724273ff01d801d644b2a573800200ededededededed93c27244c2a7928cc77244018cc7a701908cc7724401a3928cc772440199a373810293c17244724093b1db6308724473820293e4c67244040e723993e4c67244050e723f738302edededededed720293b1720673840291b1720773850293b1722073860293b1c27222738702720b7233';
export const VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX =
  '10210402040004000e20a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a20e205555555555555555555555555555555555555555555555555555555555555555040204000e20a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1040005020e20adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b0e2022222222222222222222222222222222222222222222222222222222222222220e20bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493abe0406040004020e20a77327ce3bd279b725ea4dddbbbd78046ab744f3cb75ccf46d5147046fe770640440040004000402040204000400050204000400050204c801050005feffffffffffffffff0105020201d80ed601db6501fed60293b172017300d603957202b27201730100a7d604db63087203d605e4e3010ed606e4e3000ed607e4e3020ed608e4c6a70564d609db6308a7d60ab2a5730200d60b7303d60c8cc7720a01d60de4c6a70405d60e7304d1edededededededededededededed7202eded93b172047305938cb27204730600017307938cb27204730800027309eded93cbc27203730a93e4c67203060e730b93e4c67203090e730ceded93b1a4730d93c5a7c5b2a4730e0093cbc2b2a4730f00731093b17205731191b17206731291b172077313efe6dc640a72080272057206ededededed93b17209731493b1db6308720a7315938cb2720973160001720b938cb27209731700027318938cb2db6308720a73190001720b938cb2db6308720a731a0002731b93c2720ac2a7eded92720c8cc7a70190720ca392720c99a3731ceded92720d731d8f720d731e93e4c6720a04059a720d731f93e4c6720a0564e4dc640c72080283013c0e0e8602720583010273207207ed93e4c6a7060e720e93e4c6720a060e720e93c1720ac1a7';

export interface ValidityApplicationSettlementBoxV2 {
  readonly boxId: string;
  readonly value: number | string | bigint;
  readonly ergoTree: string;
  readonly assets?: readonly { readonly tokenId: string; readonly amount: number | string | bigint }[];
  readonly additionalRegisters?: Readonly<Record<string, string>>;
  readonly creationHeight: number;
}

export interface ValidityApplicationSettlementDeploymentV2 {
  readonly tracker: {
    readonly nftIdHex: string;
    readonly ergoTreeHex: string;
  };
  readonly duplicatePrevention: {
    readonly nftIdHex: string;
    readonly ergoTreeHex: string;
  };
  readonly causalVault: {
    readonly ergoTreeHex: string;
  };
}

export interface BuildValidityApplicationSettlementTxV2Input {
  readonly deployed: ValidityApplicationSettlementDeploymentV2;
  readonly plan: ValidityApplicationSettlementPlanV2;
  readonly trackerBox: ValidityApplicationSettlementBoxV2;
  readonly duplicatePreventionBox: ValidityApplicationSettlementBoxV2;
  readonly causalVaultBox: ValidityApplicationSettlementBoxV2;
  readonly feeFundingBox: ValidityApplicationSettlementBoxV2;
  readonly creationHeight: number;
  readonly minerFee?: number | string | bigint;
}

export interface ValidityApplicationSettlementUnsignedTxV2 {
  readonly inputs: readonly {
    readonly boxId: string;
    readonly extension: Readonly<Record<string, string>>;
  }[];
  readonly dataInputs: readonly { readonly boxId: string }[];
  readonly outputs: readonly {
    readonly value: string;
    readonly ergoTree: string;
    readonly assets: readonly { readonly tokenId: string; readonly amount: number }[];
    readonly additionalRegisters: Readonly<Record<string, string>>;
    readonly creationHeight: number;
  }[];
  readonly boundaries: {
    readonly unsignedOnly: true;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly proofValidityEstablishedInPayoutTransaction: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly gate5Closed: false;
  };
}

const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const MIN_BOX_VALUE = 1_000_000n;
const MAX_MINER_FEE = 2_100_000n;

export function buildValidityApplicationSettlementTxV2(
  input: BuildValidityApplicationSettlementTxV2Input,
): ValidityApplicationSettlementUnsignedTxV2 {
  const plan = input.plan;
  if (
    plan.contractCompatibility
    !== 'validity-application-settlement-v2-preactivation'
  ) {
    throw new Error(
      'application settlement V2 TX assembly requires the exact V2 preactivation plan',
    );
  }
  if (
    plan.profile.approvedTrustRootDigestHex
    !== VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX
  ) {
    throw new Error(
      'application settlement V2 plan does not bind the regenerated WP-06AD trust root',
    );
  }
  if (plan.trackerValueHex.length !== 370 * 2) {
    throw new Error(
      'application settlement V2 requires the exact 370-byte tracker value family',
    );
  }
  const encodedProfileHex =
    encodeValidityApplicationSettlementProfileV2(plan.profile);
  if (
    encodedProfileHex !== plan.encodedProfileHex
    || deriveValidityApplicationSettlementProfileDescriptorDigestV2(
      plan.profile,
    ) !== plan.profileDescriptorDigestHex
    || plan.settlementProfileIdHex
      !== plan.profile.settlementProfileIdHex
  ) {
    throw new Error(
      'application settlement V2 plan profile identity is inconsistent',
    );
  }
  if (
    plan.profile.trackerNftIdHex
    === plan.profile.duplicatePreventionNftIdHex
  ) {
    throw new Error(
      'application settlement tracker and DUP singleton IDs must be distinct',
    );
  }
  assertExactContextExtension(
    plan.dupExtension,
    {
      '0': encodeCollByteRegister(
        Buffer.from(plan.dupLookupProofHex, 'hex'),
      ),
      '1': encodeCollByteRegister(
        Buffer.from(plan.duplicatePreventionKeyHex, 'hex'),
      ),
      '2': encodeCollByteRegister(
        Buffer.from(plan.dupInsertProofHex, 'hex'),
      ),
    },
    'application settlement DUP',
  );
  assertExactContextExtension(
    plan.vaultExtension,
    {
      '0': encodeCollByteRegister(Buffer.from(plan.trackerKeyHex, 'hex')),
      '1': encodeCollByteRegister(
        Buffer.from(plan.trackerGetProofHex, 'hex'),
      ),
      '2': encodeCollByteRegister(
        Buffer.from(plan.burnLeaf.encodedLeafHex, 'hex'),
      ),
      '3': encodeCollByteRegister(Buffer.from(plan.proofBundleHex, 'hex')),
    },
    'application settlement vault',
  );
  // The protected state successors also enforce this value against VM HEIGHT.
  const creationHeight = positiveInt(input.creationHeight, 'creationHeight');
  assertInputCreationHeight(
    input.duplicatePreventionBox,
    creationHeight,
    'application settlement DUP',
  );
  assertInputCreationHeight(
    input.causalVaultBox,
    creationHeight,
    'application settlement causal vault',
  );
  assertInputCreationHeight(
    input.feeFundingBox,
    creationHeight,
    'application settlement fee funding',
  );
  const deployed = normalizeDeployment(input.deployed);
  assertTrackerBox(input.trackerBox, deployed, plan);
  const dup = assertDuplicatePreventionBox(
    input.duplicatePreventionBox,
    deployed,
    plan,
  );
  const vaultRegisters = assertCausalVaultBox(
    input.causalVaultBox,
    deployed,
    plan,
  );
  const amount = positiveLong(plan.burnLeaf.amountNanoErg, 'validity settlement payout');
  const vaultValue = positiveLong(input.causalVaultBox.value, 'causal vault value');
  const requestedFee = positiveLong(input.minerFee ?? MINER_FEE, 'miner fee');
  if (requestedFee < MIN_BOX_VALUE || requestedFee > MAX_MINER_FEE) {
    throw new Error('validity settlement miner fee must be between 1000000 and 2100000 nanoERG');
  }
  if (vaultValue < amount) {
    throw new Error('causal validity vault does not cover payout');
  }
  const remainingVaultValue = vaultValue - amount;
  if (remainingVaultValue > 0n && remainingVaultValue < MIN_BOX_VALUE) {
    throw new Error('causal validity vault successor would be below minimum box value');
  }
  assertFeeFundingBox(input.feeFundingBox, requestedFee);
  const duplicatePreventionBoxId = fixedHex(
    input.duplicatePreventionBox.boxId,
    32,
    'validity DUP box ID',
  );
  const causalVaultBoxId = fixedHex(
    input.causalVaultBox.boxId,
    32,
    'causal validity vault box ID',
  );
  const feeFundingBoxId = fixedHex(
    input.feeFundingBox.boxId,
    32,
    'validity fee funding box ID',
  );
  if (
    new Set([
      duplicatePreventionBoxId,
      causalVaultBoxId,
      feeFundingBoxId,
    ]).size !== 3
  ) {
    throw new Error('validity settlement spending input box IDs must be distinct');
  }
  const dupValue = positiveLong(input.duplicatePreventionBox.value, 'validity DUP value');
  const outputs: ValidityApplicationSettlementUnsignedTxV2['outputs'][number][] = [
    {
      value: dupValue.toString(),
      ergoTree: deployed.duplicatePrevention.ergoTreeHex,
      assets: [{ tokenId: deployed.duplicatePrevention.nftIdHex, amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(dup.counter + 1n),
        R5: encodeAvlTreeRegister(
          Buffer.from(plan.dupOutputDigestHex, 'hex'),
          dup.flags,
          1,
        ),
        R6: encodeCollByteRegister(
          Buffer.from(plan.settlementProfileIdHex, 'hex'),
        ),
      },
      creationHeight,
    },
    {
      value: amount.toString(),
      ergoTree: plan.recipientErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight,
    },
  ];
  if (remainingVaultValue > 0n) {
    outputs.push({
      value: remainingVaultValue.toString(),
      ergoTree: deployed.causalVault.ergoTreeHex,
      assets: [],
      additionalRegisters: vaultRegisters,
      creationHeight,
    });
  }
  outputs.push({
    value: requestedFee.toString(),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });
  return deepFreeze({
    inputs: [
      {
        boxId: duplicatePreventionBoxId,
        extension: plan.dupExtension,
      },
      {
        boxId: causalVaultBoxId,
        extension: plan.vaultExtension,
      },
      {
        boxId: feeFundingBoxId,
        extension: {},
      },
    ],
    dataInputs: [
      {
        boxId: fixedHex(input.trackerBox.boxId, 32, 'validity tracker box ID'),
      },
    ],
    outputs,
    boundaries: {
      unsignedOnly: true as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      proofValidityEstablishedInPayoutTransaction: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      nodeCheckPerformed: false as const,
      gate5Closed: false as const,
    },
  }) as ValidityApplicationSettlementUnsignedTxV2;
}

function assertFeeFundingBox(
  box: ValidityApplicationSettlementBoxV2,
  requestedFee: bigint,
): void {
  const value = positiveLong(box.value, 'validity fee funding box value');
  if (value !== requestedFee) {
    throw new Error('validity fee funding box must equal the exact miner fee');
  }
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error('validity fee funding box must contain only ERG');
  }
  fixedVariableHex(box.ergoTree, 'validity fee funding box ErgoTree');
}

function assertTrackerBox(
  box: ValidityApplicationSettlementBoxV2,
  deployed: Required<ValidityApplicationSettlementDeploymentV2>,
  plan: ValidityApplicationSettlementPlanV2,
): void {
  if (deployed.tracker.nftIdHex !== plan.profile.trackerNftIdHex) {
    throw new Error('validity tracker deployment NFT does not match settlement profile');
  }
  const ergoTree = fixedVariableHex(box.ergoTree, 'validity tracker ErgoTree');
  if (ergoTree !== deployed.tracker.ergoTreeHex) {
    throw new Error('validity tracker box ErgoTree does not match deployment');
  }
  if (deriveEip0045ContractIdHex(Buffer.from(ergoTree, 'hex')) !== plan.profile.trackerContractIdHex) {
    throw new Error('validity tracker proposition bytes do not match the profile contract ID');
  }
  assertSingletonToken(box, plan.profile.trackerNftIdHex, 'validity tracker box');
  const r5 = register(box, 'R5', 'validity tracker box');
  if (
    r5
    !== encodeApplicationValiditySpvTrackerAvlRegister(
      plan.trackerInputDigestHex,
    )
  ) {
    throw new Error('validity tracker box R5 does not match the planned tracker digest');
  }
  assertCanonicalCollByte(
    register(box, 'R6', 'validity tracker box'),
    plan.profile.sidechainIdHex,
    'validity tracker box R6',
  );
  assertCanonicalCollByte(
    register(box, 'R9', 'validity tracker box'),
    plan.profile.approvedTrustRootDigestHex,
    'validity tracker box R9',
  );
  // R8 is deliberately not read: it is a mutable stamp, not a finality fact.
}

function assertDuplicatePreventionBox(
  box: ValidityApplicationSettlementBoxV2,
  deployed: Required<ValidityApplicationSettlementDeploymentV2>,
  plan: ValidityApplicationSettlementPlanV2,
): { readonly counter: bigint; readonly flags: number } {
  if (
    deployed.duplicatePrevention.nftIdHex
    !== plan.profile.duplicatePreventionNftIdHex
  ) {
    throw new Error('validity DUP deployment NFT does not match settlement profile');
  }
  if (fixedVariableHex(box.ergoTree, 'validity DUP ErgoTree') !== deployed.duplicatePrevention.ergoTreeHex) {
    throw new Error('validity DUP box ErgoTree does not match deployment');
  }
  assertSingletonToken(box, plan.profile.duplicatePreventionNftIdHex, 'validity DUP box');
  const avl = decodeCanonicalDupAvlRegister(register(box, 'R5', 'validity DUP box'));
  if (avl.digestHex !== plan.dupInputDigestHex) {
    throw new Error('validity DUP box R5 does not match the planned DUP digest');
  }
  assertCanonicalCollByte(
    register(box, 'R6', 'validity DUP box'),
    plan.settlementProfileIdHex,
    'validity DUP box R6',
  );
  const counter = decodeCanonicalLongRegister(
    register(box, 'R4', 'validity DUP box'),
    'validity DUP box R4',
  );
  if (counter < 0n || counter === ERGO_LONG_MAX) {
    throw new Error('validity DUP counter must be nonnegative and incrementable');
  }
  return { counter, flags: avl.flags };
}

function assertCausalVaultBox(
  box: ValidityApplicationSettlementBoxV2,
  deployed: Required<ValidityApplicationSettlementDeploymentV2>,
  plan: ValidityApplicationSettlementPlanV2,
): Readonly<Record<'R4' | 'R5', string>> {
  if (fixedVariableHex(box.ergoTree, 'causal validity vault ErgoTree') !== deployed.causalVault.ergoTreeHex) {
    throw new Error('causal validity vault ErgoTree does not match deployment');
  }
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error('causal validity vault must be a pure ERG box');
  }
  const r4 = register(box, 'R4', 'causal validity vault');
  const r5 = register(box, 'R5', 'causal validity vault');
  const intentHex = decodeCollByteRegister(r4, 'causal validity vault R4');
  if (Buffer.from(intentHex, 'hex').length !== PEG_IN_SOURCE_INTENT_V2_BYTES) {
    throw new Error('causal validity vault R4 must contain the exact 229-byte source intent');
  }
  if (encodeCollByteRegister(Buffer.from(intentHex, 'hex')) !== r4) {
    throw new Error('causal validity vault R4 must use canonical Coll[Byte] encoding');
  }
  const intent = decodePegInSourceIntentV2Hex(`0x${intentHex}`);
  if (strip0x(intent.sourceNetworkIdHex) !== plan.profile.sourceNetworkIdHex) {
    throw new Error('causal validity vault source network does not match settlement profile');
  }
  if (strip0x(intent.sidechainIdHex) !== plan.profile.sidechainIdHex) {
    throw new Error('causal validity vault sidechain does not match settlement profile');
  }
  if (
    strip0x(intent.settlementProfileIdHex)
    !== plan.settlementProfileIdHex
  ) {
    throw new Error('causal validity vault settlement profile does not match plan');
  }
  if (
    strip0x(intent.admissionProfileIdHex)
    !== plan.profile.causalProfileIdHex
  ) {
    throw new Error('causal validity vault causal profile does not match settlement profile');
  }
  const application = decodeBridgeCausalApplicationBindingV2(
    plan.profile.applicationBindingHex,
  );
  if (strip0x(intent.bridgeAddressHex) !== application.bridgeAddressHex) {
    throw new Error('causal validity vault bridge address does not match application binding');
  }
  if (strip0x(intent.tokenAddressHex) !== application.tokenAddressHex) {
    throw new Error('causal validity vault token address does not match application binding');
  }
  if (
    strip0x(intent.sourceAssetIdHex)
    !== VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX
  ) {
    throw new Error('causal validity vault source asset must be the zero native ERG asset ID');
  }
  const sourceAmount = positiveLong(intent.amountNanoErg, 'causal validity source amount');
  const vaultValue = positiveLong(box.value, 'causal validity vault value');
  if (vaultValue > sourceAmount) {
    throw new Error('causal validity vault value cannot exceed its source intent amount');
  }
  const sourceBoxId = decodeCollByteRegister(r5, 'causal validity vault R5');
  if (sourceBoxId === '00'.repeat(32)) {
    throw new Error('causal validity vault consumed source box ID must be nonzero');
  }
  if (fixedHex(sourceBoxId, 32, 'causal validity vault consumed source box ID') !== sourceBoxId) {
    throw new Error('causal validity vault consumed source box ID is invalid');
  }
  if (encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')) !== r5) {
    throw new Error('causal validity vault R5 must use canonical Coll[Byte] encoding');
  }
  if (strip0x(intent.recipientAddressHex) === '00'.repeat(20)) {
    throw new Error('causal validity vault source recipient must be nonzero');
  }
  return Object.freeze({ R4: r4, R5: r5 });
}

function normalizeDeployment(
  deployment: ValidityApplicationSettlementDeploymentV2,
): Required<ValidityApplicationSettlementDeploymentV2> {
  const normalized = Object.freeze({
    tracker: Object.freeze({
      nftIdHex: fixedHex(deployment.tracker.nftIdHex, 32, 'validity tracker deployment NFT'),
      ergoTreeHex: fixedVariableHex(deployment.tracker.ergoTreeHex, 'validity tracker deployment ErgoTree'),
    }),
    duplicatePrevention: Object.freeze({
      nftIdHex: fixedHex(deployment.duplicatePrevention.nftIdHex, 32, 'validity DUP deployment NFT'),
      ergoTreeHex: fixedVariableHex(deployment.duplicatePrevention.ergoTreeHex, 'validity DUP deployment ErgoTree'),
    }),
    causalVault: Object.freeze({
      ergoTreeHex: fixedVariableHex(deployment.causalVault.ergoTreeHex, 'causal validity vault deployment ErgoTree'),
    }),
  });
  assertExactApplicationSettlementProposition(
    normalized.causalVault.ergoTreeHex,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_CONTRACT_ID_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_SHA256_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_BYTES,
    'application settlement causal vault',
  );
  assertExactApplicationSettlementProposition(
    normalized.duplicatePrevention.ergoTreeHex,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_CONTRACT_ID_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_SHA256_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_BYTES,
    'application settlement DUP',
  );
  return normalized;
}

function assertSingletonToken(
  box: ValidityApplicationSettlementBoxV2,
  expectedTokenIdHex: string,
  label: string,
): void {
  if ((box.assets?.length ?? 0) !== 1) {
    throw new Error(`${label} must contain exactly one singleton token`);
  }
  const token = box.assets![0];
  if (fixedHex(token.tokenId, 32, `${label} token ID`) !== expectedTokenIdHex) {
    throw new Error(`${label} singleton token ID does not match profile`);
  }
  if (BigInt(token.amount) !== 1n) {
    throw new Error(`${label} singleton token amount must equal one`);
  }
}

function assertCanonicalCollByte(
  registerHex: string,
  expectedPayloadHex: string,
  label: string,
): void {
  const decoded = decodeCollByteRegister(registerHex, label);
  if (decoded !== expectedPayloadHex) {
    throw new Error(`${label} does not match the active validity settlement profile`);
  }
  if (encodeCollByteRegister(Buffer.from(decoded, 'hex')) !== registerHex) {
    throw new Error(`${label} must use canonical Coll[Byte] encoding`);
  }
}

function decodeCanonicalDupAvlRegister(registerHex: string): {
  readonly digestHex: string;
  readonly flags: number;
} {
  if (
    !/^[0-9a-f]+$/.test(registerHex)
    || registerHex.length !== 76
    || !registerHex.startsWith('64')
    || registerHex.slice(70, 72) !== '20'
    || registerHex.slice(72) !== '0101'
  ) {
    throw new Error('validity DUP box R5 must be a canonical 32-byte-key, one-byte-value AVL register');
  }
  const flags = Number.parseInt(registerHex.slice(68, 70), 16);
  if ((flags & 0x01) === 0) {
    throw new Error('validity DUP box R5 must permit append-only inserts');
  }
  return Object.freeze({ digestHex: registerHex.slice(2, 68), flags });
}

function register(
  box: ValidityApplicationSettlementBoxV2,
  name: string,
  label: string,
): string {
  const value = box.additionalRegisters?.[name];
  if (!value) throw new Error(`${label} is missing ${name}`);
  if (!/^[0-9a-f]+$/.test(value)) throw new Error(`${label} ${name} must be lowercase canonical hex`);
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function fixedVariableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function positiveLong(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an exact integer`);
  }
  if (typeof value === 'string' && !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer`);
  }
  const normalized = BigInt(value);
  if (normalized <= 0n || normalized > ERGO_LONG_MAX) {
    throw new Error(`${label} must fit a positive signed Long`);
  }
  return normalized;
}

function positiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must fit a positive Int`);
  }
  return value;
}

function assertExactContextExtension(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
    || expectedKeys.some(key => actual[key] !== expected[key])
  ) {
    throw new Error(`${label} ContextExtension does not match the canonical plan`);
  }
}

function assertInputCreationHeight(
  box: ValidityApplicationSettlementBoxV2,
  successorCreationHeight: number,
  label: string,
): void {
  const inputCreationHeight = positiveInt(
    box.creationHeight,
    `${label} creationHeight`,
  );
  if (inputCreationHeight > successorCreationHeight) {
    throw new Error(`${label} creationHeight cannot exceed its successor`);
  }
}

function strip0x(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function assertExactApplicationSettlementProposition(
  propositionHex: string,
  expectedPropositionHex: string,
  expectedContractIdHex: string,
  expectedSha256Hex: string,
  expectedBytes: number,
  label: string,
): void {
  const bytes = Buffer.from(propositionHex, 'hex');
  if (bytes.length !== expectedBytes) {
    throw new Error(
      `${label} proposition must contain exactly ${expectedBytes} bytes`,
    );
  }
  const contractIdHex = deriveEip0045ContractIdHex(bytes);
  const sha256Hex = createHash('sha256').update(bytes).digest('hex');
  if (
    propositionHex !== expectedPropositionHex
    || contractIdHex !== expectedContractIdHex
    || sha256Hex !== expectedSha256Hex
  ) {
    throw new Error(`${label} proposition identity is not the regenerated V2 contract`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
