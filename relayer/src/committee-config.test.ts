import { describe, expect, it } from 'vitest';

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  CHECK_ONLY_COMMITTEE_THRESHOLD,
  committeeConfigToDeployedState,
  createCommitteeConfig,
  createCommitteeConfigFromState,
  injectCommitteePlaceholders,
  parseCommitteePubKeyHexes,
} from './committee-config.js';

const [KEY_1, KEY_2, KEY_3] = CHECK_ONLY_COMMITTEE_PUBKEY_HEXES;

describe('committee config', () => {
  it('parses comma, whitespace, and semicolon separated committee keys', () => {
    expect(parseCommitteePubKeyHexes(`${KEY_1}, ${KEY_2};\n${KEY_3}`)).toEqual([
      KEY_1,
      KEY_2,
      KEY_3,
    ]);
  });

  it('injects a 2-of-3 atLeast committee expression into contract sources', () => {
    const source = [
      'val committee = Coll(',
      '  COMMITTEE_SIGMAPROP_PLACEHOLDERS',
      ')',
      'val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)',
    ].join('\n');

    const injected = injectCommitteePlaceholders(
      source,
      createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, CHECK_ONLY_COMMITTEE_THRESHOLD),
    );

    expect(injected).toContain(`atLeast(${CHECK_ONLY_COMMITTEE_THRESHOLD}, committee)`);
    expect(injected.match(/proveDlog\(decodePoint\(fromBase16/g)).toHaveLength(3);
    expect(injected).toContain(KEY_1);
    expect(injected).toContain(KEY_2);
    expect(injected).toContain(KEY_3);
    expect(injected).not.toContain('COMMITTEE_SIGMAPROP_PLACEHOLDERS');
    expect(injected).not.toContain('COMMITTEE_THRESHOLD_PLACEHOLDER');
  });

  it('preserves legacy one-key placeholder injection for old source snippets', () => {
    const source = [
      'val committee = Coll(',
      '  proveDlog(decodePoint(fromBase16("COMMITTEE_PK_HEX_PLACEHOLDER")))',
      ')',
      'val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)',
    ].join('\n');

    const injected = injectCommitteePlaceholders(source, createCommitteeConfig(KEY_1, '1'));

    expect(injected).toContain(KEY_1);
    expect(injected).toContain('atLeast(1, committee)');
    expect(injected).not.toContain('COMMITTEE_PK_HEX_PLACEHOLDER');
  });

  it('rejects duplicate committee public keys', () => {
    expect(() => createCommitteeConfig([KEY_1, KEY_1], '1')).toThrow(
      'committee public keys must be distinct',
    );
  });

  it('rejects thresholds above the committee size', () => {
    expect(() => createCommitteeConfig([KEY_1, KEY_2], '3')).toThrow(
      'COMMITTEE_THRESHOLD cannot exceed committee public key count',
    );
  });

  it('round-trips deployed committee state as the fallback config', () => {
    const deployed = {
      committee: committeeConfigToDeployedState(
        createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, CHECK_ONLY_COMMITTEE_THRESHOLD),
      ),
    };

    expect(createCommitteeConfigFromState(KEY_1, deployed, {})).toEqual({
      pubKeyHexes: [KEY_1, KEY_2, KEY_3],
      primaryPubKeyHex: KEY_1,
      threshold: CHECK_ONLY_COMMITTEE_THRESHOLD,
    });
  });

  it('requires an explicit threshold for explicit multi-key env config', () => {
    expect(() =>
      createCommitteeConfigFromState(KEY_1, {}, { COMMITTEE_PUBKEY_HEXES: `${KEY_1},${KEY_2}` }),
    ).toThrow('COMMITTEE_THRESHOLD must be set when COMMITTEE_PUBKEY_HEXES has multiple keys');
  });

  it('lets explicit env config override deployed committee state', () => {
    const deployed = {
      committee: committeeConfigToDeployedState(
        createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, CHECK_ONLY_COMMITTEE_THRESHOLD),
      ),
    };

    expect(createCommitteeConfigFromState(KEY_1, deployed, { COMMITTEE_PUBKEY_HEX: KEY_2 })).toEqual({
      pubKeyHexes: [KEY_2],
      primaryPubKeyHex: KEY_2,
      threshold: '1',
    });
  });

  it('rejects multi-key injection into legacy one-key contract sources', () => {
    const source = 'proveDlog(decodePoint(fromBase16("COMMITTEE_PK_HEX_PLACEHOLDER")))';

    expect(() =>
      injectCommitteePlaceholders(source, createCommitteeConfig([KEY_1, KEY_2], '2')),
    ).toThrow('multi-key committee injection requires COMMITTEE_SIGMAPROP_PLACEHOLDERS');
  });
});
