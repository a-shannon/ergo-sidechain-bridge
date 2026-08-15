# sigma-rust ContextExtension Serializer Scope

Reviewed source: signer guard evidence and transaction serialization path.

Risk reviewed: sigma-rust ContextExtension serializer behavior can affect signed bytes and TX ID consensus. The guard evidence keeps the path closed until upstream signer release and JVM/node conformance evidence validate.
