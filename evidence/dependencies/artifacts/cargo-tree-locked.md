# cargo tree --locked

Command evidence: `cargo tree --locked`.

Result: PASS exit code 0. The locked Rust tree resolves the `bridge-avl` crate through `ergo_avltree_rust`, `serde`, `bytes`, and `wasm-bindgen` without introducing an open critical/high finding.
