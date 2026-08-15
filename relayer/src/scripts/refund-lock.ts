/**
 * Retired unsafe funding helper.
 *
 * An empty-register output at MainChainLock is not a valid peg-in deposit and
 * cannot be used to manufacture demo TVL. Keep this entrypoint fail-closed so
 * old operator notes cannot accidentally create stranded MCL boxes.
 */

throw new Error(
  'refund-lock is disabled: MainChainLock funding requires an exact committed-vault-v3 deposit',
);
