# Auto-configure devnet session environment from node1/application.conf.
#
# DEVNET ONLY. Do not use for testnet or mainnet.
#
# Reads testMnemonic from the patched Ergo devnet config and sets
# WALLET_MNEMONIC plus all required non-secret env vars.
# Also derives the Fleet signer address and sets DEVNET_MINING_TARGET
# so run-patched-ergo-devnet.ps1 can route mining rewards to it.
#
# Does not print the mnemonic. Does not write it to disk.
# Does not use node-wallet signing.
#
# Usage (source in current shell):
#   . .\relayer\scripts\devnet-auto-env-from-node1.ps1
#
# After the session, always clean up:
#   . .\relayer\scripts\clear-devnet-session-env.ps1

$ErrorActionPreference = "Stop"

# Resolve config path relative to bridge root
$bridgeRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$configPath = Join-Path $bridgeRoot "..\ergo-source\src\main\resources\node1\application.conf"
$configPath = [System.IO.Path]::GetFullPath($configPath)

if (-not (Test-Path $configPath)) {
  Write-Host "FAIL: node1 config not found at: $configPath" -ForegroundColor Red
  return
}

# Parse testMnemonic = "..." from config
$content = Get-Content $configPath -Raw
if ($content -match 'testMnemonic\s*=\s*"([^"]+)"') {
  $mnemonic = $Matches[1]
} else {
  Write-Host "FAIL: testMnemonic not found in: $configPath" -ForegroundColor Red
  return
}

# Set env vars
$env:WALLET_MNEMONIC = $mnemonic
$env:ERGO_NODE = "http://127.0.0.1:9051"
$env:ERGO_NODE_URL = "http://127.0.0.1:9051"
$env:PATCHED_ERGO_NODE_URL = "http://127.0.0.1:9051"
$env:ERGO_API_KEY = "hello"
$env:AGGREGATE_ANCHOR_MIN_CONFIRMATIONS = "1"
$env:AGGREGATE_ANCHOR_LOOKBACK_BLOCKS = "100"
$env:AGGREGATE_BATCH_ENABLED = "true"
$env:AGGREGATE_BATCH_MAX_CLAIMS = "10"

# Clear intermediate mnemonic variable
Remove-Variable mnemonic -ErrorAction SilentlyContinue

# Derive Fleet signer address for mining target.
# Uses the same derivation as fleet-signer.ts: masterKey.deriveChild(0).
$relayerDir = Join-Path $bridgeRoot "relayer"
$fleetOutput = & npx.cmd -y tsx "$relayerDir\src\scripts\devnet-fleet-address.ts" 2>&1
$fleetAddress = ($fleetOutput | Where-Object { $_ -match "^FLEET_ADDRESS=" }) -replace "^FLEET_ADDRESS=", ""
$fleetPubKeyHex = ($fleetOutput | Where-Object { $_ -match "^FLEET_PUBKEY_HEX=" }) -replace "^FLEET_PUBKEY_HEX=", ""

if ([string]::IsNullOrWhiteSpace($fleetPubKeyHex)) {
  Write-Host "WARN: could not derive Fleet signer pubkey" -ForegroundColor Yellow
  Write-Host "  Output: $fleetOutput"
} else {
  # miningPubKeyHex requires raw hex pubkey, not P2PK address.
  $env:DEVNET_MINING_TARGET = $fleetPubKeyHex
  $env:DEVNET_FLEET_ADDRESS = $fleetAddress
}

Write-Host "Devnet auto-env from node1 config:" -ForegroundColor Green
Write-Host "  Config: $configPath"
Write-Host "  WALLET_MNEMONIC set from node1 application.conf (value hidden)"
Write-Host "  ERGO_NODE = $env:ERGO_NODE"
Write-Host "  ERGO_NODE_URL = $env:ERGO_NODE_URL"
Write-Host "  ERGO_API_KEY set (value hidden)"
Write-Host "  AGGREGATE_BATCH_ENABLED = $env:AGGREGATE_BATCH_ENABLED"
Write-Host "  AGGREGATE_ANCHOR_MIN_CONFIRMATIONS = $env:AGGREGATE_ANCHOR_MIN_CONFIRMATIONS"
if ($env:DEVNET_MINING_TARGET) {
  Write-Host "  DEVNET_MINING_TARGET = $env:DEVNET_MINING_TARGET (pubkey hex)"
}
if ($env:DEVNET_FLEET_ADDRESS) {
  Write-Host "  DEVNET_FLEET_ADDRESS = $env:DEVNET_FLEET_ADDRESS"
}
Write-Host ""
Write-Host "DEVNET ONLY. Do not use for testnet or mainnet." -ForegroundColor Yellow
