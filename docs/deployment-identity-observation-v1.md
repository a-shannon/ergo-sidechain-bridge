# Deployment Identity Observation V1

## Purpose

Deployment Identity Observation V1 binds one explicit non-mainnet
`ErgoBridge`/`SERG` address pair to the exact runtime bytecode produced by the
tracked reproducible Solidity build. It also observes the bridge's current
token binding, the bridge owner, and the token owner at one stable sidechain
tip through two distinct RPC origins.

The result is a non-authorizing candidate. It is an input to later finalized
ownership and mint/supply history reconstruction, not an approval to mint or
settle funds.

## Inputs

The command requires all deployment-specific inputs explicitly:

- primary and witness credential-free HTTP(S) RPC origins;
- bridge and token addresses;
- expected positive sidechain chain ID;
- operator-declared `local-devnet` or `public-testnet` network scope.

It does not infer addresses from a deployment file or runtime database. The
artifact profile is loaded from the tracked Solidity build manifest and exact
runtime artifacts after the source-baseline validator accepts the complete
build closure.

```powershell
npm run sidechain:deployment-identity:observe -- `
  --primary-rpc-url <primary-origin> `
  --witness-rpc-url <witness-origin> `
  --bridge-address <bridge-address> `
  --token-address <token-address> `
  --expected-chain-id <positive-decimal> `
  --network-scope public-testnet
```

The command writes one JSON candidate to standard output.

## Read-Only RPC Surface

The observer has a fixed RPC surface:

| Method | Purpose |
|---|---|
| `eth_chainId` | Bind and revalidate the explicit chain identity. |
| `eth_blockNumber` | Select and revalidate one stable observation height. |
| `eth_getBlockByNumber` | Bind and revalidate the exact tip hash at that height. |
| `eth_getCode` | Compare bridge and token runtime bytes with the tracked artifacts under an EIP-1898 canonical block-hash selector. |
| `eth_call` | Read `ErgoBridge.sergToken()`, `ErgoBridge.owner()`, and `SERG.owner()` under the same EIP-1898 canonical block-hash selector. |

Each source must return the same chain ID, tip height, and tip hash before and
after the code and call reads. A node that cannot serve canonical block-hash
selectors fails closed. Runtime code must equal the tracked bytes, the
bridge token binding must equal the explicit token address, and the token owner
must equal the explicit bridge address. The bridge owner is recorded as current
state, including a renounced zero owner, without being interpreted as approval.
The complete view must then agree
byte-for-byte across two distinct origins.

RPC source identifiers are hashes of canonical origins. Endpoint strings and
credentials are not part of the candidate.

## Producer-To-Consumer Boundary

| Producer | Exact fields | Consumer | Failure if relaxed |
|---|---|---|---|
| Reproducible Solidity build | Manifest digest, runtime bytes, decoded byte lengths and SHA-256 digests | Deployment artifact profile | Familiar addresses could run code not produced by the reviewed build. |
| Stable primary RPC view | Chain ID, tip identity, bridge/token code, token binding, current owners | Two-source agreement | A moving or replaced tip could mix state from different sidechain views. |
| Stable witness RPC view | Same complete view under a distinct origin identity | Two-source agreement | One endpoint could supply an internally consistent but unsupported deployment view. |
| Two-source agreement | Complete view digest and two distinct source IDs | Non-authorizing deployment candidate | Current code or owner disagreement could be hidden behind partial field checks. |
| Future finalized history reconstruction | Deployment candidate plus finalized block history and reviewed runtime profiles | Historical ownership/mint assessment | Current state could be misrepresented as proof that no prior owner or direct mint existed. |

## Claim Boundary

The candidate establishes only current point-in-time agreement for the exact
address pair and tracked runtime code. The non-mainnet scope is explicit but is
not independently authenticated by this observer. It does not prove:

- deterministic sidechain finality or canonical history;
- a reviewed chain profile binding scope, chain ID, and genesis/checkpoint identity;
- deployment block identity or historical code continuity;
- historical ownership, ownership-transfer absence, or direct-mint absence;
- supply conservation, committed-vault eligibility, or mint authority;
- settlement, signing, submission, or broadcast authority;
- Gate 5 closure, production readiness, or mainnet readiness.

Two agreeing RPC origins are availability and disagreement evidence. They are
not a replacement for an Ergo-verifiable finality proof.
