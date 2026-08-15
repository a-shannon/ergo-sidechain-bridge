# Clear all devnet session environment variables.
# Source this after every devnet session:
#
#   . .\relayer\scripts\clear-devnet-session-env.ps1

Remove-Item Env:ERGO_NODE -ErrorAction SilentlyContinue
Remove-Item Env:ERGO_NODE_URL -ErrorAction SilentlyContinue
Remove-Item Env:PATCHED_ERGO_NODE_URL -ErrorAction SilentlyContinue
Remove-Item Env:ERGO_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:AGGREGATE_ANCHOR_MIN_CONFIRMATIONS -ErrorAction SilentlyContinue
Remove-Item Env:AGGREGATE_ANCHOR_LOOKBACK_BLOCKS -ErrorAction SilentlyContinue
Remove-Item Env:AGGREGATE_BATCH_ENABLED -ErrorAction SilentlyContinue
Remove-Item Env:AGGREGATE_BATCH_MAX_CLAIMS -ErrorAction SilentlyContinue
Remove-Item Env:EXPECTED_BRIDGE_EVENT_ROOT_HEX -ErrorAction SilentlyContinue
Remove-Item Env:WALLET_MNEMONIC -ErrorAction SilentlyContinue
Write-Host "Devnet session environment cleared."
