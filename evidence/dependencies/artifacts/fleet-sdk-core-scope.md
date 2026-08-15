# Fleet SDK Core Scope

Reviewed source: package lock and transaction assembly call sites.

Risk reviewed: `@fleet-sdk/core` API drift can alter transaction assembly. The current decision is to keep the dependency pinned for the institutional reference release.
