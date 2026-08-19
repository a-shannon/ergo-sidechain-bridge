interface Arguments {
  readonly requestPath: string;
  readonly expectedTargetDescriptorDigestHex: string;
  readonly expectedSourceAttestationKeySetDigestHex: string;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const [
    { canonicalJson },
    { loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1 },
    { replaySubstrateFederatedIsolatedDevnetPortableV1 },
  ] = await Promise.all([
    import('../strict-json.js'),
    import('../substrate-federated-isolated-devnet-portable-replay-files-v1.js'),
    import('../substrate-federated-isolated-devnet-portable-replay-v1.js'),
  ]);
  const input = loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1(
    args.requestPath,
    {
      expectedTargetDescriptorDigestHex:
        args.expectedTargetDescriptorDigestHex,
      expectedSourceAttestationKeySetDigestHex:
        args.expectedSourceAttestationKeySetDigestHex,
    },
  );
  const report = await replaySubstrateFederatedIsolatedDevnetPortableV1(input);
  process.stdout.write(`${canonicalJson(report)}\n`);
}

function parseArguments(argv: readonly string[]): Arguments {
  if (
    argv.length !== 6
    || argv[0] !== '--request'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[2] !== '--expected-target-descriptor-digest'
    || argv[3] === undefined
    || argv[3].length === 0
    || argv[4] !== '--expected-source-attestation-key-set-digest'
    || argv[5] === undefined
    || argv[5].length === 0
  ) {
    throw new Error(
      'expected request plus explicit target-descriptor and source-key-set pins',
    );
  }
  return {
    requestPath: argv[1],
    expectedTargetDescriptorDigestHex: argv[3],
    expectedSourceAttestationKeySetDigestHex: argv[5],
  };
}

main().catch(() => {
  process.stderr.write('isolated portable replay failed\n');
  process.exitCode = 1;
});
