# ergo-lib-wasm-nodejs Scope

Reviewed source: package lock and signer integration path.

Risk reviewed: `ergo-lib-wasm-nodejs` binds the sigma-rust signer path. The release remains fail-closed because ContextExtension serialization must not silently diverge from JVM/node behavior.
