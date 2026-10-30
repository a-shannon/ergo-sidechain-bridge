import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertV6DirectRecordShape,
  assertV6MavenCacheTreeNonAuthorizing,
  decodeV6RecordBytes,
  parseV6MavenCacheRecordsNonAuthorizing,
  type V6MavenCacheExpected,
  type V6MavenCacheTexts,
} from './substrate-federated-native-v6-maven-cache-reader.js';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const text = (value: unknown): string => JSON.stringify(value) + '\n';
const entrySha = 'd'.repeat(64);
const attestorSha = 'e'.repeat(64);
const fileSha = sha('hi');
const directorySha = sha('');
const membershipSha = sha('x.jar\0');
const aggregateSha = sha('x.jar\0' + '2' + '\0' + fileSha + '\n');
const locks = Object.freeze({
  'package-lock.json': 'a'.repeat(64),
  'build-manifest.json': 'b'.repeat(64),
  'consensus-source-lock.json': 'c'.repeat(64),
});
const namespaceRoot = resolve('synthetic-v6-maven-records');
const sourceRoot = resolve('synthetic-public-source-cache');
const mirrorRoot = resolve('synthetic-public-mirror');
const reportPath = resolve(namespaceRoot, 'maven-public-cache-reattest-01.json');

function fixture(reportPatch: Record<string, unknown> = {}): Readonly<{
  texts: V6MavenCacheTexts;
  expected: V6MavenCacheExpected;
}> {
  const entry = {
    schema: 'bridge-v6-public-maven-reattest-owner-entry-v1',
    ownerSourceSha256Hex: entrySha,
    attestorSourceSha256Hex: attestorSha,
    reportName: 'maven-public-cache-reattest-01.json',
    sourceOnly: true, campaignAdmitted: false,
  };
  const entryText = text(entry);
  const child = {
    schema: 'bridge-v6-public-maven-reattest-child-identity-v1',
    entrySha256Hex: sha(entryText), processName: 'powershell.exe',
    processId: 1234, creationDateUtc: '2026-10-28T20:00:00.0000000Z',
    sameProvider: 'Win32_Process', campaignAdmitted: false,
  };
  const childText = text(child);
  const report = {
    schema: 'bridge-v6-public-maven-cache-reattest-v1',
    sourceRoot, mirrorRoot,
    sourceRootIdentity: '1:2:3:1:0:4:5:6',
    mirrorRootIdentity: '7:8:9:1:0:10:11:12',
    directoryCount: 0, directorySha256: directorySha,
    fileCount: 1, fileMembershipSha256: membershipSha,
    byteCount: '2', suffixCounts: { '.jar': 1 },
    aggregateSha256: aggregateSha,
    files: [{ path: 'x.jar', size: '2', sha256: fileSha }],
    currentBridgeLockSha256: locks,
    sourceStableBeforeAfter: true, mirrorStableBeforeAfter: true,
    sourceMirrorBytesEqual: true, reusedPublicCacheData: true,
    oldReceiptRead: false, resolverExecuted: false,
    campaignAdmitted: false, externalAcceptanceEstablished: false,
    ...reportPatch,
  };
  const reportText = text(report);
  const terminal = {
    schema: 'bridge-v6-public-maven-reattest-owner-terminal-v1',
    entrySha256Hex: sha(entryText), childIdentitySha256Hex: sha(childText),
    attestationSha256Hex: sha(reportText),
    attestationBytes: Buffer.byteLength(reportText, 'utf8'),
    attestationPhysicalIdentity: '1:2:3:1',
    jobOwnerExitCode: 0, jobClosedByPinnedOwner: true,
    sourceOnly: true, oldReceiptRead: false, gitHeadBound: false,
    independentMirrorRecaptureComplete: false,
    campaignAdmitted: false, externalAcceptanceEstablished: false,
  };
  const terminalText = text(terminal);
  return {
    texts: { entryText, childText, terminalText, reportText },
    expected: {
      namespaceRoot, sourceRoot, mirrorRoot, reportPath,
      terminalSha256Hex: sha(terminalText),
      ownerSha256Hex: entrySha, attestorSha256Hex: attestorSha,
      lockSha256: locks, directoryCount: 0, fileCount: 1, byteCount: 2,
      directorySha256Hex: directorySha, membershipSha256Hex: membershipSha,
      aggregateSha256Hex: aggregateSha, suffixCounts: { '.jar': 1 },
    },
  };
}

describe('V6 public Maven cache reader boundaries', () => {
  it('joins exact new owner records without granting Git or campaign authority', () => {
    const selected = fixture();
    const parsed = parseV6MavenCacheRecordsNonAuthorizing(
      selected.texts, selected.expected);
    expect(parsed).toMatchObject({
      files: [{ path: 'x.jar', size: 2, sha256Hex: fileSha }],
      mirrorRootIdentity: '7:8:9:1:0:10:11:12',
      sourceOnly: true, gitHeadBound: false, campaignAdmitted: false,
    });
    const tree = {
      rootIdentity: '7:8:9:1:0:10:11:12',
      directories: [], files: [{ path: 'x.jar', size: 2, sha256Hex: fileSha }],
      bytes: 2, directorySha256Hex: directorySha,
      fileMembershipSha256Hex: membershipSha,
      metadataSha256Hex: sha('synthetic metadata'), membership: 'F\tx.jar\n',
      identities: new Map(),
    };
    expect(() => assertV6MavenCacheTreeNonAuthorizing(
      parsed, tree, selected.expected)).not.toThrow();
  });

  it('refuses an absent terminal before reading partial record authority', () => {
    const selected = fixture();
    expect(() => parseV6MavenCacheRecordsNonAuthorizing(
      { ...selected.texts, terminalText: undefined }, selected.expected))
      .toThrow(/terminal encoding or size/u);
  });

  it('rejects a BOM in the terminal bytes before JSON parsing', () => {
    const selected = fixture();
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(selected.texts.terminalText!, 'utf8'),
    ]);
    expect(() => decodeV6RecordBytes(bytes, 'terminal')).toThrow(/terminal BOM/u);
  });

  it('refuses the historical sibling receipt path', () => {
    const selected = fixture();
    expect(() => parseV6MavenCacheRecordsNonAuthorizing(
      selected.texts, { ...selected.expected, reportPath: mirrorRoot + '.json' }))
      .toThrow(/selected paths/u);
  });

  it('refuses overlap between the selected public source and mirror roots', () => {
    const selected = fixture();
    expect(() => parseV6MavenCacheRecordsNonAuthorizing(
      selected.texts, { ...selected.expected, sourceRoot: mirrorRoot }))
      .toThrow(/selected paths/u);
  });

  it('refuses a changed owner lineage digest independently', () => {
    const selected = fixture();
    const terminal = JSON.parse(selected.texts.terminalText!) as Record<string, unknown>;
    terminal.entrySha256Hex = 'f'.repeat(64);
    const terminalText = text(terminal);
    expect(() => parseV6MavenCacheRecordsNonAuthorizing(
      { ...selected.texts, terminalText },
      { ...selected.expected, terminalSha256Hex: sha(terminalText) }))
      .toThrow(/owner record lineage/u);
  });

  it('refuses one altered Maven member even with a fresh terminal digest', () => {
    const selected = fixture({
      files: [{ path: 'x.jar', size: '2', sha256: 'f'.repeat(64) }],
    });
    expect(() => parseV6MavenCacheRecordsNonAuthorizing(
      selected.texts, selected.expected)).toThrow(/attestation file aggregate/u);
  });

  it('refuses changed physical mirror identity independently of file hashes', () => {
    const selected = fixture();
    const parsed = parseV6MavenCacheRecordsNonAuthorizing(
      selected.texts, selected.expected);
    const tree = {
      rootIdentity: '7:8:9:1:0:10:11:13',
      directories: [], files: [{ path: 'x.jar', size: 2, sha256Hex: fileSha }],
      bytes: 2, directorySha256Hex: directorySha,
      fileMembershipSha256Hex: membershipSha,
      metadataSha256Hex: sha('synthetic metadata'), membership: 'F\tx.jar\n',
      identities: new Map(),
    };
    expect(() => assertV6MavenCacheTreeNonAuthorizing(
      parsed, tree, selected.expected)).toThrow(/physical mirror geometry/u);
  });

  it('refuses a false-authority claim changed to true', () => {
    const selected = fixture({ campaignAdmitted: true });
    expect(() => parseV6MavenCacheRecordsNonAuthorizing(
      selected.texts, selected.expected)).toThrow(/attestation claims/u);
  });

  it('rejects a multiply linked record shape', () => {
    expect(() => assertV6DirectRecordShape({
      isFile: () => true, isSymbolicLink: () => false, nlink: 2n,
    })).toThrow(/multiply linked/u);
  });
});
