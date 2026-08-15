# ethers EVM Event Scope

Reviewed source: package lock and sidechain event reader path.

Risk reviewed: `ethers` drives EVM event, receipt, and log parsing. The transitive `ws` advisory is moderate; no critical/high production vulnerability is open.
