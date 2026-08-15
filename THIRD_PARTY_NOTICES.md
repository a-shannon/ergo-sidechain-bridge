# Third-Party Notices

Unless a file or component states otherwise, repository-owned content is
licensed under the Apache License 2.0 in [`LICENSE`](LICENSE).

The following components retain their own terms. This notice is informational;
the referenced license text and per-file or per-package identifiers control.

| Component | Location | Upstream source | License boundary |
|---|---|---|---|
| Solidity build package and bridge contracts | `solidity/` | This repository | MIT, as declared by `solidity/package.json`, each Solidity source file, and `solidity/LICENSE` |
| OpenZeppelin Contracts | Imported by `solidity/` and present in compiled artifacts | `OpenZeppelin/openzeppelin-contracts` version `5.6.1` | MIT; exact upstream notice retained in `solidity/THIRD_PARTY_LICENSES/OpenZeppelin-Contracts-5.6.1.txt` |
| Frontier source checkout | `substrate-node/` | `polkadot-evm/frontier` at commit `75329a2df49e2cc7981485392c31160929d1bd48` | Per-file and per-package terms, including Apache-2.0, GPL-3.0-or-later WITH Classpath-exception-2.0, Unlicense, and ISC |
| Frontier bridge patch | `sources/frontier/0001-bridge-runtime-commitment.patch` | Patch against the Frontier commit above | Existing upstream material keeps its upstream terms; added crates declare Apache-2.0 or Unlicense in their manifests |
| Ergo node source patch | `sources/ergo-node/0001-sidechain-extension-fields.patch` | `ergoplatform/ergo` at commit `2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1` | Upstream source and patch context are under CC0-1.0; bridge-authored additions are also available under the repository Apache-2.0 terms |

Dependency lockfiles and generated build artifacts do not change the licenses
of the packages or source components from which they are produced. Consumers
must preserve all applicable upstream notices when redistributing a composed
build.
