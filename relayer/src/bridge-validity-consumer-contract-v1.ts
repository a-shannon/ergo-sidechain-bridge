/**
 * Funds-neutral preactivation identity for the bridge EIP-0045 consumer.
 *
 * The proposition is the exact version-4, constant-segregated ErgoTree emitted
 * by SigmaState draft f78deadd668f801e7fae3bc884283f79c6f484fa. It reads
 * proof chunks from context variable 0 and the application payload from
 * context variable 1, then supplies the two frozen constants below to
 * VerifyStark. These bytes do not activate the opcode or authorize funds.
 */
export const EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX =
  '23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383';
export const EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX =
  '5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934';
export const EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES_HEX =
  '1c53020e205b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934'
  + '0e2023c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383'
  + 'd1b9e4e3001ae4e3010e73007301';
export const EIP0045_BRIDGE_VALIDITY_CONSUMER_PROPOSITION_BYTES = 85;
export const EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID_HEX =
  '9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc';
