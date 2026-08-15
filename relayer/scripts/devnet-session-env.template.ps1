# Shell-scoped environment for a patched devnet session.
#
# PREFERRED: Set WALLET_MNEMONIC via SecureString (no terminal echo):
#
#   $secure = Read-Host "Enter devnet-only WALLET_MNEMONIC" -AsSecureString
#   $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
#   try {
#     $env:WALLET_MNEMONIC = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
#   } finally {
#     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
#     Remove-Variable secure -ErrorAction SilentlyContinue
#     Remove-Variable bstr -ErrorAction SilentlyContinue
#   }
#
# Then source this file for the remaining (non-secret) env vars:
#
#   . .\relayer\scripts\devnet-session-env.template.ps1
#
# ALTERNATIVE: Copy this file to devnet-session-env.local.ps1, fill the
# WALLET_MNEMONIC line, and source the copy instead. The .local.ps1 file
# is gitignored but still writes a mnemonic to disk -- use only if you
# accept that risk for a devnet-only throwaway mnemonic.
#
# AFTER the session, always clean up:
#
#   . .\relayer\scripts\clear-devnet-session-env.ps1
#
# NEVER commit a .local.ps1 file.
# NEVER use a testnet or mainnet mnemonic here.
# NEVER use node-wallet signing.

$env:ERGO_NODE = "http://127.0.0.1:9051"
$env:ERGO_NODE_URL = "http://127.0.0.1:9051"
$env:PATCHED_ERGO_NODE_URL = "http://127.0.0.1:9051"
$env:ERGO_API_KEY = "hello"
$env:AGGREGATE_ANCHOR_MIN_CONFIRMATIONS = "1"
$env:AGGREGATE_ANCHOR_LOOKBACK_BLOCKS = "100"
$env:AGGREGATE_BATCH_ENABLED = "true"
$env:AGGREGATE_BATCH_MAX_CLAIMS = "10"

# WALLET_MNEMONIC is intentionally NOT set here.
# Set it via SecureString BEFORE sourcing this file (see instructions above).
#
# Or uncomment the line below ONLY in a .local.ps1 copy:
# $env:WALLET_MNEMONIC = "<devnet-only mnemonic>"

