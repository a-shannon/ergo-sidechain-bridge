const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const solc = require('solc');

const BUILD_SCHEMA = 'ergo-sidechain-bridge/solidity-build-closure/v1';
const EXPECTED_SOLC_PACKAGE_VERSION = '0.8.35';
const EXPECTED_SOLC_LONG_VERSION =
  '0.8.35+commit.47b9dedd.Emscripten.clang';
const EXPECTED_OPENZEPPELIN_VERSION = '5.6.1';
const CONTRACTS = Object.freeze([
  Object.freeze({ source: 'SERG.sol', name: 'SERG' }),
  Object.freeze({ source: 'ErgoBridge.sol', name: 'ErgoBridge' }),
]);
const EXPECTED_SETTINGS = Object.freeze({
  optimizer: Object.freeze({ enabled: true, runs: 200 }),
  evmVersion: 'osaka',
  viaIR: false,
  metadata: Object.freeze({
    bytecodeHash: 'ipfs',
    appendCBOR: true,
    useLiteralContent: false,
  }),
  libraries: Object.freeze({}),
  remappings: Object.freeze([]),
  outputSelection: Object.freeze({
    '*': Object.freeze({
      '*': Object.freeze([
        'abi',
        'metadata',
        'storageLayout',
        'evm.bytecode.object',
        'evm.deployedBytecode.object',
      ]),
    }),
  }),
});

const solidityRoot = __dirname;
const outputDirectory = path.join(solidityRoot, 'compiled');
const openZeppelinRoot = path.join(
  solidityRoot,
  'node_modules',
  '@openzeppelin',
  'contracts',
);

function fail(message) {
  throw new Error(message);
}

function normalizeLf(value) {
  return value.replace(/\r\n?/g, '\n');
}

function readNormalizedText(filePath) {
  return normalizeLf(fs.readFileSync(filePath, 'utf8'));
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function compareOrdinal(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function jsonBytes(value, trailingNewline = false) {
  return Buffer.from(
    `${JSON.stringify(value, null, 2)}${trailingNewline ? '\n' : ''}`,
    'utf8',
  );
}

function exactJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} differs from the reviewed build closure`);
  }
}

function loadPackageClosure() {
  const packageJsonPath = path.join(solidityRoot, 'package.json');
  const packageLockPath = path.join(solidityRoot, 'package-lock.json');
  const packageJsonBytes = Buffer.from(readNormalizedText(packageJsonPath), 'utf8');
  const packageJson = JSON.parse(packageJsonBytes.toString('utf8'));
  const packageLockBytes = Buffer.from(readNormalizedText(packageLockPath), 'utf8');
  const packageLock = JSON.parse(packageLockBytes.toString('utf8'));

  exactJson(
    packageJson.devDependencies,
    {
      '@openzeppelin/contracts': EXPECTED_OPENZEPPELIN_VERSION,
      solc: EXPECTED_SOLC_PACKAGE_VERSION,
    },
    'package.json devDependencies',
  );
  if (packageLock.lockfileVersion !== 3) {
    fail('package-lock.json must use lockfileVersion 3');
  }
  exactJson(
    packageLock.packages?.['']?.devDependencies,
    packageJson.devDependencies,
    'package-lock.json root devDependencies',
  );

  const dependencies = [
    {
      name: '@openzeppelin/contracts',
      expectedVersion: EXPECTED_OPENZEPPELIN_VERSION,
      lockKey: 'node_modules/@openzeppelin/contracts',
    },
    {
      name: 'solc',
      expectedVersion: EXPECTED_SOLC_PACKAGE_VERSION,
      lockKey: 'node_modules/solc',
    },
  ].map(({ name, expectedVersion, lockKey }) => {
    const lockEntry = packageLock.packages?.[lockKey];
    if (!lockEntry || lockEntry.version !== expectedVersion) {
      fail(`${name} package-lock version must be ${expectedVersion}`);
    }
    if (typeof lockEntry.integrity !== 'string' || !lockEntry.integrity) {
      fail(`${name} package-lock integrity is missing`);
    }
    const installedPackage = JSON.parse(readNormalizedText(
      path.join(solidityRoot, 'node_modules', ...name.split('/'), 'package.json'),
    ));
    if (installedPackage.version !== expectedVersion) {
      fail(`${name} installed version must be ${expectedVersion}`);
    }
    return Object.freeze({
      name,
      version: expectedVersion,
      integrity: lockEntry.integrity,
    });
  });

  if (solc.version() !== EXPECTED_SOLC_LONG_VERSION) {
    fail(`solc long version must be ${EXPECTED_SOLC_LONG_VERSION}`);
  }
  return Object.freeze({
    packageJsonSha256Hex: sha256Hex(packageJsonBytes),
    packageLockSha256Hex: sha256Hex(packageLockBytes),
    dependencies: Object.freeze(dependencies),
  });
}

function compile() {
  const packageClosure = loadPackageClosure();
  const buildDriverBytes = Buffer.from(readNormalizedText(__filename), 'utf8');
  const settingsPath = path.join(solidityRoot, 'solc-settings.json');
  const settingsBytes = Buffer.from(readNormalizedText(settingsPath), 'utf8');
  const settings = JSON.parse(settingsBytes.toString('utf8'));
  exactJson(settings, EXPECTED_SETTINGS, 'solc-settings.json');

  const sources = {};
  const sourceClosure = new Map();
  for (const contract of CONTRACTS) {
    const content = readNormalizedText(path.join(solidityRoot, contract.source));
    sources[contract.source] = { content };
    sourceClosure.set(contract.source, content);
  }

  function findImport(importPath) {
    const prefix = '@openzeppelin/contracts/';
    if (!importPath.startsWith(prefix)) {
      return { error: `unsupported import outside ${prefix}: ${importPath}` };
    }
    const relativePath = importPath.slice(prefix.length);
    const resolvedPath = path.resolve(openZeppelinRoot, relativePath);
    const requiredPrefix = `${path.resolve(openZeppelinRoot)}${path.sep}`;
    if (!resolvedPath.startsWith(requiredPrefix) || !fs.existsSync(resolvedPath)) {
      return { error: `unresolved or unsafe import: ${importPath}` };
    }
    const content = readNormalizedText(resolvedPath);
    sourceClosure.set(importPath, content);
    return { contents: content };
  }

  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources,
    settings,
  }), { import: findImport }));
  const diagnostics = output.errors ?? [];
  if (diagnostics.length > 0) {
    fail(diagnostics.map(diagnostic => diagnostic.formattedMessage).join('\n'));
  }

  const observedSources = Object.keys(output.sources ?? {}).sort();
  const expectedSources = [...sourceClosure.keys()].sort();
  exactJson(observedSources, expectedSources, 'compiled source closure');

  const generated = new Map();
  const contractManifest = {};
  for (const contract of CONTRACTS) {
    const compiled = output.contracts?.[contract.source]?.[contract.name];
    if (!compiled) {
      fail(`missing compiled output for ${contract.source}:${contract.name}`);
    }
    const creationHex = compiled.evm.bytecode.object;
    const runtimeHex = compiled.evm.deployedBytecode.object;
    if (!/^[0-9a-f]+$/.test(creationHex) || !/^[0-9a-f]+$/.test(runtimeHex)) {
      fail(`${contract.name} bytecode must be non-empty lowercase hex`);
    }

    const outputs = {
      abi: {
        path: `compiled/${contract.name}.abi`,
        bytes: jsonBytes(compiled.abi),
      },
      creationBytecode: {
        path: `compiled/${contract.name}.bin`,
        bytes: Buffer.from(creationHex, 'utf8'),
        payload: Buffer.from(creationHex, 'hex'),
      },
      runtimeBytecode: {
        path: `compiled/${contract.name}.runtime.bin`,
        bytes: Buffer.from(runtimeHex, 'utf8'),
        payload: Buffer.from(runtimeHex, 'hex'),
      },
      metadata: {
        path: `compiled/${contract.name}.metadata.json`,
        bytes: Buffer.from(compiled.metadata, 'utf8'),
      },
      storageLayout: {
        path: `compiled/${contract.name}.storage-layout.json`,
        bytes: jsonBytes(compiled.storageLayout),
      },
    };
    for (const artifact of Object.values(outputs)) {
      generated.set(artifact.path, artifact.bytes);
    }
    contractManifest[contract.name] = {
      source: contract.source,
      abi: fileIdentity(outputs.abi),
      creationBytecode: bytecodeIdentity(outputs.creationBytecode),
      runtimeBytecode: bytecodeIdentity(outputs.runtimeBytecode),
      metadata: fileIdentity(outputs.metadata),
      storageLayout: fileIdentity(outputs.storageLayout),
    };
  }

  const sourceManifest = [...sourceClosure.entries()]
    .sort(([left], [right]) => compareOrdinal(left, right))
    .map(([sourcePath, content]) => ({
      path: sourcePath,
      compilerInputSha256Hex: sha256Hex(Buffer.from(content, 'utf8')),
    }));
  const inputClosureSha256Hex = sha256Hex(Buffer.from(JSON.stringify({
    language: 'Solidity',
    settings,
    sources: sourceManifest,
  }), 'utf8'));
  const manifest = {
    schema: BUILD_SCHEMA,
    compiler: {
      package: 'solc',
      packageVersion: EXPECTED_SOLC_PACKAGE_VERSION,
      longVersion: EXPECTED_SOLC_LONG_VERSION,
    },
    dependencyClosure: {
      packageJsonPath: 'package.json',
      packageJsonSha256Hex: packageClosure.packageJsonSha256Hex,
      packageLockPath: 'package-lock.json',
      packageLockSha256Hex: packageClosure.packageLockSha256Hex,
      packages: packageClosure.dependencies,
    },
    compilerInput: {
      buildDriverPath: 'compile.js',
      buildDriverSha256Hex: sha256Hex(buildDriverBytes),
      lineEndings: 'lf',
      settingsPath: 'solc-settings.json',
      settingsSha256Hex: sha256Hex(settingsBytes),
      inputClosureSha256Hex,
      sources: sourceManifest,
    },
    contracts: contractManifest,
    scope: {
      proves: 'reproducible local source-to-artifact closure',
      doesNotProve: [
        'deployed runtime code or address identity',
        'bridge-to-token ownership or historical mint state',
        'sidechain finality or Gate 5 closure',
        'production readiness',
      ],
    },
  };
  generated.set('compiled/build-manifest.json', jsonBytes(manifest, true));
  return generated;
}

function fileIdentity(artifact) {
  return {
    path: artifact.path,
    fileByteLength: artifact.bytes.length,
    fileSha256Hex: sha256Hex(artifact.bytes),
  };
}

function bytecodeIdentity(artifact) {
  return {
    ...fileIdentity(artifact),
    encoding: 'lowercase-hex-no-prefix',
    bytecodeByteLength: artifact.payload.length,
    bytecodeSha256Hex: sha256Hex(artifact.payload),
  };
}

function writeOutputs(generated) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const [relativePath, bytes] of generated) {
    fs.writeFileSync(path.join(solidityRoot, relativePath), bytes);
  }
}

function checkOutputs(generated) {
  const expectedFiles = new Set([...generated.keys()].map(relativePath =>
    path.basename(relativePath)));
  const observedFiles = fs.existsSync(outputDirectory)
    ? fs.readdirSync(outputDirectory).sort()
    : [];
  const unexpected = observedFiles.filter(file => !expectedFiles.has(file));
  const missing = [...expectedFiles].filter(file => !observedFiles.includes(file));
  const drifted = [];
  for (const [relativePath, expected] of generated) {
    const artifactPath = path.join(solidityRoot, relativePath);
    if (fs.existsSync(artifactPath)
      && !fs.readFileSync(artifactPath).equals(expected)) {
      drifted.push(relativePath);
    }
  }
  if (missing.length || unexpected.length || drifted.length) {
    fail([
      missing.length ? `missing artifacts: ${missing.join(', ')}` : '',
      unexpected.length ? `unexpected artifacts: ${unexpected.join(', ')}` : '',
      drifted.length ? `drifted artifacts: ${drifted.join(', ')}` : '',
    ].filter(Boolean).join('; '));
  }
}

function main() {
  const mode = process.argv[2];
  if (!['build', 'check'].includes(mode)) {
    fail('usage: node compile.js <build|check>');
  }
  const generated = compile();
  if (mode === 'build') {
    writeOutputs(generated);
  } else {
    checkOutputs(generated);
  }
  console.log(`Solidity build closure ${mode} PASS (${CONTRACTS.length} contracts)`);
}

try {
  main();
} catch (error) {
  console.error(`Solidity build closure FAIL: ${error.message}`);
  process.exitCode = 1;
}
