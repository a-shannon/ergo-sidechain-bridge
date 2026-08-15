# Authenticated Settlement JVM Check V1

## Purpose

This boundary turns one journaled authenticated V2 settlement candidate into an
exact, non-broadcast Ergo node check. It does not submit the transaction and it
does not close Gate 5.

Ergo node `POST /transactions/check` accepts a signed `ErgoTransaction`, not an
unsigned EIP-12 candidate. The check path therefore has to preserve one identity
through five stages:

1. the journaled candidate and its canonical EIP-12 digest;
2. a freshly recollected native checkpoint and Frontier burn proof;
3. the exact digest-bound WP-06T10 unsigned settlement package;
4. the proof-independent unsigned Ergo transaction ID;
5. the locally signed transaction ID and the ID returned by the JVM node.

Any mismatch stops before the journal can move to `check_passed`.

## Reconstruction Rule

After a restart, continued box existence is not sufficient. The relayer must:

1. re-read the exact burn event by `burnId` and global log index;
2. recollect all successful bridge burns in the execution block;
3. rebuild the frozen `bridge_event_root` and target inclusion path;
4. rerun the reviewed native checkpoint collector and GRANDPA verifier;
5. bind the result to the authenticated tracker value and Ergo anchor;
6. refetch the exact tracker, DUP, and vault boxes;
7. rebuild through `prepareAuthenticatedSettlementUnsignedTx()` using the
   journaled output `creationHeight` and vault box ID;
8. require the rebuilt stable binding and EIP-12 digest to match the journal;
9. rederive the complete native-bound candidate ID and require it to match the
   journal;
10. derive the proof-independent unsigned transaction ID;
11. revalidate the explicit WP-06T10 package and bind it to the freshly
    prepared candidate through process-local provenance.

The output `creationHeight` is now persisted explicitly. Candidates created by
the older schema are invalidated during migration rather than assuming that an
observed Ergo tip was necessarily the transaction creation height.

The canonical EIP-12 transaction now includes the complete authenticated tracker
data-input box. An ID-only data input cannot be signed by the WASM signer because
the signer needs the box bytes and a real positive `creationHeight`.

## Check Rule

The explicit operator command is:

```text
npm run settle:authenticated:check -- <candidate-id> --state-db <relative.sqlite> --deployed-state-json <sanitized.json> --unsigned-package <wp06-t10.json> --expected-package-digest <64hex>
```

The package must be the deterministic output of
`npm run trustless:wp06-unsigned-package`; the expected digest is supplied
separately so selecting a different internally consistent package fails closed.
If the candidate was checked before, its journaled package digest must already
be canonical lowercase hex and equal this operator-supplied digest. A mismatch
stops before proof collection, signing, or JVM contact.
The command additionally requires `AUTHENTICATED_SETTLEMENT_CHECK_ENABLED=true`, an
explicit non-mainnet deployment, a reviewed native-checkpoint profile, aligned
Ergo node endpoints, and broadcast policy disabled. The read-only Ergo client
and actual signed-check transport must both use userinfo-free loopback HTTP(S)
base URLs with no proxy path; the sidechain RPC must also be loopback. Before
any proof collection or signing, the command reads `/info` from that Ergo node
and requires its observed network to equal the deployment network. The check
POST carries no API-key header and does not follow HTTP redirects, so the signed
transaction cannot be rerouted by URL metadata or a redirect response. The
check POST, signer header lookup, and read-only Ergo client also disable
environment HTTP(S) proxies explicitly and fail closed on a 30-second timeout.

After fresh candidate reconstruction, the command validates the package and
requires the independently derived transaction ID plus the exact EIP-12,
claim, burn proof, tracker, DUP, payout, asset, recipient, contract singleton,
and selected-box bindings. EIP-12 monetary values are normalized only across
equivalent JSON number and decimal-string representations; the independently
derived transaction ID remains the signable identity.

Immediately before signing, the command re-reads the journaled Ergo anchor from
the live node, requires the exact header ID, checks that chain height has not
rolled below the output creation height, and rechecks the minimum anchor depth.
The command then uses the existing sigma-rust WASM signer. Before contacting the
node, it requires the signed transaction ID to equal the derived unsigned ID.
The JVM response must be a transaction ID equal to both. The journal transition
then records:

- expected transaction ID;
- unsigned settlement package digest;
- JVM response digest;
- fresh revalidation digest;
- native verification request digest;
- reviewed trust-anchor digest;
- finality horizon hash and height;
- canonical finality-statement digest and semantic program ID;
- proof-system ID, verifier profile, payload digest, and complete proof digest.

These proof fields are check-wrapper and journal metadata. The JVM receives only
the prepared Ergo transaction and does not verify the statement or aggregate
proof. They prevent identity drift across restart/recheck while the
Ergo-verifiable proof consumer remains open.

Only a checker acceptance created from both the process-provenance package
binding and the process-provenance revalidated candidate can perform the
transition, including when tests inject the checker transport. A raw or
deserialized object cannot mark a candidate checked. A prior `check_passed`
row does not skip work: the command recollects, rebuilds, rechecks the live
anchor, signs, and calls the JVM again, then requires every persisted check
binding to equal the new acceptance.

Schema migration invalidates an older active `check_passed` row when the
unsigned package digest is absent, malformed, or non-canonical, or when any
canonical statement/proof identity field is absent. Such a row may
not remain active and block replacement work while being impossible to
revalidate under the stronger identity contract.

## Closeout Matrix

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Negative fixture |
|---|---|---|---|---|
| Output creation height is explicit and stable | Canonical prepared transaction; candidate journal | Unsigned ID derivation and WASM signer | Restart can rebuild different bytes or invent a missing height | Changed height; older schema invalidated |
| Tracker data input is the complete selected box | Authenticated settlement service | WASM state context and JVM validation | ID-only candidate cannot be signed or checked against the selected tracker state | Missing creation height; data-input ID/order drift |
| Rebuilt transaction equals the journaled candidate | Candidate builder plus stable binding and EIP-12 digest | Check coordinator | A stale or newly selected transaction could inherit an old candidate ID | Output, input, proof, payout, box, and height mutations |
| WP-06T10 package equals the fresh candidate | Strict package validator, expected digest, process-local package binding | Package-bound JVM checker and journal | An unrelated or post-binding-mutated transaction could be checked under a different package identity | Wrong expected digest, transaction ID, creation height, prepared provenance, cloned binding, and post-binding mutation rejected |
| Native-bound candidate identity is stable | Native admission and candidate ID derivation | Revalidation and journal CAS | A different native proof identity or verifier semantics could inherit the journal row | Candidate-ID, finality-statement digest, and program-ID mutations rejected |
| Native proof matches the anchored checkpoint commitment | Reviewed source, native verifier, admission binder | Revalidation and tracker data input | Another finality proof/root could authorize the same journal row | Changed justification/checkpoint commitment rejected |
| Ergo anchor remains canonical immediately before signing | Read-only live header and height lookup | JVM check coordinator | A reorged or under-confirmed anchor could be signed after proof reconstruction | Wrong header, rollback, and insufficient-depth fixtures |
| Unsigned, signed, and JVM IDs are equal | WASM unsigned ID, signer assertion, node-response assertion | Journal check transition | A different signed transaction or node response could be recorded | Signed-ID and node-response-ID mismatch |
| Check result has process provenance | Check coordinator WeakSet | `StateTracker` check CAS | Raw JSON could mark an unchecked candidate as checked | Cloned acceptance rejected |
| Check is non-mainnet, local, and check-only | CLI authorization, live `/info`, loopback endpoint policy, node alignment, disabled broadcast policy, static surface test | Operator command | A remote or wrong-network node could receive signed bytes or expose broadcast behavior | Missing enable flag, observed-network mismatch, remote or credentialed URL, enabled broadcast, submit-route scan |
| Restart never trusts a persisted check alone | Full revalidation and a fresh JVM check on every command run | Journal idempotence/conflict comparison | Tampered or stale SQLite state could bypass current chain checks | Existing row rerun and every persisted binding conflict |
| Reorg or spent input removes eligibility | Daemon burn/anchor/box reconciliation and reorg invalidation | Process-local revalidation cache | A stale candidate could remain eligible after its authority or inputs change | Burn reversion, anchor drift, missing tracker/DUP/vault, chain rollback |

## Finality Identity

The authenticated tracker commits to the checkpoint commitment, which includes
the canonical GRANDPA justification hash. A later finality proof that changes
that commitment is not a benign refresh for the same candidate. It requires a
new authenticated `0x0401` tracker entry and a newly prepared candidate.

The candidate and fresh JVM-check acceptance also bind the canonical
`BridgeFinalityStatementV1` digest, semantic program ID, proof-system ID,
verifier profile, payload digest, and full envelope digest. These fields are
co-recorded after JVM transaction acceptance; they are not JVM-verified public
inputs. They prevent a future proof-system consumer or changed proof semantics
from inheriting an existing journaled candidate silently.

Fresh process provenance for the same anchored checkpoint identity is accepted;
checkpoint, event-root, burn, payout, DUP, input, output, or creation-height
drift is rejected.

## Boundary

This source milestone provides a package-bound check-only route and restart-safe reconstruction.
No operator/runtime key was used and no stateful node JVM check was executed
while producing it. Exact in-memory pinned-JVM proof and bytes-to-sign
conformance now exists for the positive tracker and settlement transactions;
actual package-bound node-stateful acceptance remains open until a reviewed non-inert devnet
profile, provisioned V2 UTXOs, and explicit local-signing/check approval are
available.

The command contains no submit or broadcast branch. JVM acceptance would prove
only that one exact signed candidate passes node validation. It would not make
the bridge globally trustless: Ergo-verifiable sidechain finality and live
`0x0401` lifecycle evidence remain open.
