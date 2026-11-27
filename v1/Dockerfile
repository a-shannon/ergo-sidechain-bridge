# Multi-stage reproducible image for Ergo Sidechain Bridge V1
# - Stage 1: Builds the Rust WASM AVL+ prover with pinned SHA-256 wasm-pack v0.14.0
# - Stage 2: Fetches SigmaState 6.0.2 JVM JARs AND pre-compiles BridgeJvmTool.java ([C-3])
# - Stage 3: Minimal non-root Node 24 + JRE 17 runtime ([C-3], [H-11])

FROM rust:1.85-bookworm AS wasm-builder
WORKDIR /build
RUN rustup target add wasm32-unknown-unknown
RUN curl -fsSL \
      "https://github.com/wasm-bindgen/wasm-pack/releases/download/v0.14.0/wasm-pack-v0.14.0-x86_64-unknown-linux-musl.tar.gz" \
      -o /tmp/wasm-pack.tar.gz && \
    echo "278a8d668085821f4d1a637bd864f1713f872b0ae3a118c77562a308c0abfe8d  /tmp/wasm-pack.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/wasm-pack.tar.gz -C /tmp && \
    mv /tmp/wasm-pack-v0.14.0-x86_64-unknown-linux-musl/wasm-pack /usr/local/bin/wasm-pack && \
    rm -rf /tmp/wasm-pack*
COPY wasm-avl ./wasm-avl
WORKDIR /build/wasm-avl
RUN wasm-pack build --target nodejs --out-dir pkg

FROM maven:3.9.9-eclipse-temurin-17 AS jvm-deps
WORKDIR /build/v1/jvm
COPY v1/jvm/pom.xml ./pom.xml
COPY v1/jvm/BridgeJvmTool.java ./BridgeJvmTool.java
RUN mvn -B dependency:copy-dependencies -DoutputDirectory=/build/sigma-jars && \
    mkdir -p /build/jvm-classes && \
    javac -cp "/build/sigma-jars/*" -d /build/jvm-classes BridgeJvmTool.java && \
    sha256sum BridgeJvmTool.java | cut -c1-16 > /build/jvm-classes/.src-sha256

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-17-jre-headless python3 make g++ curl && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=wasm-builder /build/wasm-avl/pkg ./wasm-avl/pkg
COPY --from=jvm-deps /build/sigma-jars ./v1/jvm/target/dependency
COPY --from=jvm-deps /build/jvm-classes ./v1/jvm/classes
WORKDIR /app/v1
COPY v1/package.json v1/package-lock.json v1/tsconfig.json ./
RUN npm ci
COPY v1/src ./src
COPY v1/contracts ./contracts
COPY v1/solidity/compiled ./solidity/compiled
COPY v1/web ./web
COPY v1/jvm/BridgeJvmTool.java ./jvm/BridgeJvmTool.java
COPY v1/config.testnet.example.json v1/config.testnet.live.json ./
RUN npm run build && mkdir -p /app/v1/data && chown -R node:node /app
USER node
ENV BRIDGE_SIGMA_JARS_DIR=/app/v1/jvm/target/dependency
ENV BRIDGE_V1_JVM_CLASSES_DIR=/app/v1/jvm/classes
EXPOSE 3000 7101
ENTRYPOINT ["./node_modules/.bin/tsx", "src/cli.ts"]
CMD ["status", "--config", "config.testnet.live.json"]
