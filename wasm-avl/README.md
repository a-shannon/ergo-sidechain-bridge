# Bridge AVL+ WASM Crate

Adapted from `reference-avl` for sidechain bridge use. Phase 003.

## Key Differences from prior art-avl

| Feature | reference-avl | bridge-avl |
|---------|------------|------------|
| Keys | 32-byte Blake2b hashes | 32-byte box/TX IDs |
| Values | Empty (set membership) | `Coll[Byte]` (e.g., `0x01` marker) |
| Batch insert | `rebuild_and_insert_batch()` | `rebuild_and_insert_kv_batch()` |
| Persistence | Rebuild-on-Demand from SQLite | Same pattern |

## Build

```bash
wasm-pack build --target nodejs
```

The relayer imports the generated bindings from `wasm-avl/pkg/`. From
`relayer/`, run `npm run wasm:build` before `npm run build` or `npm test` on a
fresh checkout.
