import { describe, expect, it } from 'vitest';

import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';

describe('evidence sensitive target classification', () => {
  it('recognizes environment, secret-bearing, and runtime evidence target names', () => {
    expect(isEvidenceEnvironmentFileName('.env')).toBe(true);
    expect(isEvidenceEnvironmentFileName('.env.local')).toBe(true);
    expect(isEvidenceEnvironmentFileName('(.env)')).toBe(true);
    expect(isEvidenceEnvironmentFileName('{.env}')).toBe(true);
    expect(isEvidenceEnvironmentFileName('[.env]')).toBe(true);
    expect(isEvidenceEnvironmentFileName('".env.local"')).toBe(true);
    expect(isEvidenceEnvironmentFileName('sourceTarget:.env')).toBe(true);
    expect(isEvidenceEnvironmentFileName('sourceTarget=.env')).toBe(true);
    expect(isEvidenceEnvironmentFileName('sourceTarget=(.env)')).toBe(true);
    expect(isEvidenceEnvironmentFileName('sourceTarget:{.env}')).toBe(true);
    expect(isEvidenceEnvironmentFileName('sourceTarget:(.env.local)')).toBe(true);
    expect(isEvidenceEnvironmentFileName('{sourceTarget:.env.local}')).toBe(true);
    expect(isEvidenceEnvironmentFileName('targetBindings.freshCheckpoint=.env')).toBe(true);
    expect(isEvidenceEnvironmentFileName('targetBindings.freshCheckpoint=(.env)')).toBe(true);
    expect(isEvidenceEnvironmentFileName('targetBindings.freshCheckpoint:{.env.local}')).toBe(true);
    expect(isEvidenceEnvironmentFileName('"targetBindings.freshCheckpoint":".env"')).toBe(true);
    expect(isEvidenceEnvironmentFileName('targetBindings:{freshCheckpoint:.env}')).toBe(true);
    expect(isEvidenceEnvironmentFileName('targetBindings:{freshCheckpoint:".env.local"}')).toBe(true);
    expect(isEvidenceEnvironmentFileName('release.env.md')).toBe(false);
    expect(isEvidenceEnvironmentFileName('{release.env.md}')).toBe(false);
    expect(isEvidenceEnvironmentFileName('sourceTarget:release.env.md')).toBe(false);
    expect(isEvidenceEnvironmentFileName('sourceTarget:{release.env.md}')).toBe(false);
    expect(isEvidenceEnvironmentFileName('targetBindings.freshCheckpoint=release.env.md')).toBe(false);
    expect(isEvidenceEnvironmentFileName('targetBindings.freshCheckpoint:{.env-proof.md}')).toBe(false);
    expect(isEvidenceEnvironmentFileName('targetBindings:{freshCheckpoint:release.env.md}')).toBe(false);
    expect(isEvidenceEnvironmentFileName('foo:.env-proof.md')).toBe(false);

    for (const target of [
      `operator/secrets.${'dlog'}.md`,
      'operator/mnemonic-review.md',
      'operator/private-key-review.md',
      'operator/signing-key-review.md',
      'operator/api-key-review.md',
      'operator/seed-phrase-review.md',
      'runtime/runtime-state-review.md',
    ]) {
      expect(isEvidenceSecretOrRuntimeName(target), target).toBe(true);
    }
  });

  it('keeps deployed-state matching explicit and runtime-database matching separate', () => {
    expect(isEvidenceSecretOrRuntimeName('state/deployed_state.json')).toBe(false);
    expect(isEvidenceSecretOrRuntimeName('state/deployed_state.json', { includeDeployedState: true })).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('runtime/bridge-state.sqlite')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('(runtime/bridge-state.sqlite)')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('{runtime/bridge-state.sqlite}')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('sourceTarget=runtime/bridge-state.sqlite')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('sourceTarget=(runtime/bridge-state.sqlite)')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('sourceTarget:{runtime/bridge-state.sqlite}')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('"targetBindings.freshCheckpoint":"runtime/bridge-state.sqlite"')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('targetBindings:{freshCheckpoint:runtime/bridge-state.sqlite}')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('runtime/bridge-state.sqlite.md')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('runtime/bridge-state.sqlite?raw=1')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('runtime/bridge-state.sqlite#operator-review')).toBe(true);
    expect(isEvidenceRuntimeDatabaseTarget('sourceTarget:{runtime/bridge-state.sqlite2}')).toBe(false);
    expect(isEvidenceSecretOrRuntimeName('runtime/bridge-state.sqlite.md')).toBe(false);
  });

  it('recognizes named Unicode compatibility separators inside secret-bearing evidence names', () => {
    const hasSecretVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(candidate => isEvidenceSecretOrRuntimeName(candidate));

    expect(hasSecretVariant('operator/private\\N{FULLWIDTH LOW LINE}key-review.md')).toBe(true);
    expect(hasSecretVariant('operator/api\\N{FULLWIDTH HYPHEN-MINUS}key-review.md')).toBe(true);
    expect(hasSecretVariant('operator/signing\\N{MINUS SIGN}key-review.md')).toBe(true);
    expect(hasSecretVariant('operator/seed\\N{NON-BREAKING HYPHEN}phrase-review.md')).toBe(true);
    expect(
      hasSecretVariant('artifact://public/org\\N{FULLWIDTH FULL STOP}ergoplatform\\N{FULLWIDTH FULL STOP}sdk'),
    ).toBe(false);
  });

  it('recognizes HTML named-entity separators inside secret-bearing evidence names', () => {
    const hasSecretVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(candidate => isEvidenceSecretOrRuntimeName(candidate));

    expect(hasSecretVariant('operator/private&lowbar;key-review.md')).toBe(true);
    expect(hasSecretVariant('operator/private%26UnderBar%3Bkey-review.md')).toBe(true);
    expect(hasSecretVariant('operator/api&hyphen;key-review.md')).toBe(true);
    expect(hasSecretVariant('operator/signing&minus;key-review.md')).toBe(true);
    expect(hasSecretVariant('operator/seed&NonBreakingHyphen;phrase-review.md')).toBe(true);
    expect(hasSecretVariant('artifact://public/org&period;ergoplatform&period;sdk')).toBe(false);
  });

  it('provides decoded inspection variants for encoded evidence targets', () => {
    expect(evidenceTargetInspectionVariants('sourceTarget=%28runtime%2Fbridge-state.sqlite%29')).toEqual([
      'sourceTarget=%28runtime%2Fbridge-state.sqlite%29',
      'sourcetarget=(runtime/bridge-state.sqlite)',
    ]);
    expect(evidenceTargetInspectionVariants('sourceTarget=%2528.env%2529')).toEqual([
      'sourceTarget=%2528.env%2529',
      'sourcetarget=%28.env%29',
      'sourcetarget=(.env)',
    ]);
  });

  it('provides nested decoded inspection variants for deeply encoded evidence targets', () => {
    const nestedEncodedEnvironmentTarget = 'sourceTarget=%252524HOME%25252Fbridge-state.sqlite';
    const encodeUriRepeated = (target: string, depth: number) => {
      let encoded = target;
      for (let index = 0; index < depth; index += 1) encoded = encodeURIComponent(encoded);
      return encoded;
    };
    const nestedAmpEntity = (entity: string, depth: number) => {
      let encoded = `&${entity};`;
      for (let index = 0; index < depth; index += 1) encoded = `&amp;${encoded.slice(1)}`;
      return encoded;
    };
    const deeplyEncodedFileTarget = `sourceTarget=${encodeUriRepeated('file:runtime/bridge-state.sqlite', 6)}`;
    const deeplyHtmlEncodedFileTarget = `sourceTarget=file${nestedAmpEntity('colon', 6)}runtime/bridge-state.sqlite`;

    expect(evidenceTargetInspectionVariants(nestedEncodedEnvironmentTarget)).toContain(
      'sourcetarget=$home/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(deeplyEncodedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(deeplyHtmlEncodedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides tolerant decoded inspection variants when malformed escapes are present', () => {
    const malformedEncodedEnvironmentTarget = 'sourceTarget=%24HOME%2Fbridge-state.sqlite%ZZ';

    expect(evidenceTargetInspectionVariants(malformedEncodedEnvironmentTarget)).toContain(
      'sourcetarget=$home/bridge-state.sqlite%zz',
    );
  });

  it('provides JSON-unicode decoded inspection variants for escaped local targets', () => {
    const unicodeEscapedFileTarget = 'sourceTarget=file\\u003aC\\u003a\\u005ctmp\\u005cbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(unicodeEscapedFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides repeated-u Unicode decoded inspection variants for escaped local targets', () => {
    const repeatedUnicodeFileTarget = 'sourceTarget=file\\uu003aC\\uuu003a\\uu005ctmp\\uu005cbridge-state.sqlite';
    const encodedRepeatedUnicodeFileTarget =
      'sourceTarget=file%5Cuu003aC%5Cuuu003a%5Cuu005ctmp%5Cuu005cbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(repeatedUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedRepeatedUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides JavaScript-hex decoded inspection variants for escaped local targets', () => {
    const hexEscapedFileTarget = 'sourceTarget=file\\x3aC\\x3a\\x5ctmp\\x5cbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(hexEscapedFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides CSS-hex decoded inspection variants for escaped local targets', () => {
    const cssHexEscapedFileTarget = 'sourceTarget=file\\3a runtime\\2f bridge-state\\2e sqlite';
    const cssEscapedLetterFileTarget = 'sourceTarget=f\\69 le\\3a runtime\\2f bridge-state\\2e sqlite';
    const cssEscapedLetterWithoutTerminatorTarget = 'sourceTarget=f\\69le:runtime/bridge-state.sqlite';
    const cssEscapedLeadingLetterWithoutTerminatorTarget = 'sourceTarget=\\66ile:runtime/bridge-state.sqlite';
    const cssEscapedInvisibleFileTarget = 'sourceTarget=fi\\e0061 le\\3a runtime\\2f bridge-state\\2e sqlite';
    const cssEscapedInvisibleWithoutTerminatorTarget = 'sourceTarget=fi\\e0061le:runtime/bridge-state.sqlite';
    const encodedCssHexEscapedFileTarget = 'sourceTarget=file%5C3a%20runtime%5C2f%20bridge-state%5C2e%20sqlite';

    expect(evidenceTargetInspectionVariants(cssHexEscapedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(cssEscapedLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(cssEscapedLetterWithoutTerminatorTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(cssEscapedLeadingLetterWithoutTerminatorTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(cssEscapedInvisibleFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(cssEscapedInvisibleWithoutTerminatorTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedCssHexEscapedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=file\\3a org\\2e ergoplatform\\2e sdk')).toContain(
      'sourcetarget=file:org.ergoplatform.sdk',
    );
  });

  it('provides octal byte decoded inspection variants for escaped local targets', () => {
    const octalEscapedFileTarget = 'sourceTarget=file\\072runtime\\057bridge-state\\056sqlite';
    const octalEscapedLetterFileTarget = 'sourceTarget=f\\151le:runtime/bridge-state.sqlite';
    const octalEscapedInnerLetterFileTarget = 'sourceTarget=fi\\154e:runtime/bridge-state.sqlite';
    const octalEscapedLeadingLetterFileTarget = 'sourceTarget=\\146ile:runtime/bridge-state.sqlite';
    const encodedOctalEscapedFileTarget = 'sourceTarget=file%5C072runtime%5C057bridge-state%5C056sqlite';
    const encodedOctalEscapedLetterFileTarget = 'sourceTarget=f%5C151le%3Aruntime%2Fbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(octalEscapedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(octalEscapedLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(octalEscapedInnerLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(octalEscapedLeadingLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedOctalEscapedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedOctalEscapedLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides JavaScript code point decoded inspection variants for escaped local targets', () => {
    const codePointEscapedFileTarget = 'sourceTarget=file\\u{3a}runtime/bridge-state.sqlite';
    const paddedCodePointEscapedFileTarget = 'sourceTarget=file\\u{00003a}runtime/bridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(codePointEscapedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(paddedCodePointEscapedFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides eight-digit Unicode decoded inspection variants for escaped local targets', () => {
    const eightDigitUnicodeFileTarget = 'sourceTarget=file\\U0000003aC\\U0000003a\\U0000005ctmp\\U0000005cbridge-state.sqlite';
    const encodedEightDigitUnicodeFileTarget =
      'sourceTarget=file%5CU0000003aC%5CU0000003a%5CU0000005ctmp%5CU0000005cbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(eightDigitUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedEightDigitUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides named Unicode decoded inspection variants for escaped local targets', () => {
    const namedUnicodeFileTarget =
      'sourceTarget=file\\N{COLON}C\\N{COLON}\\N{REVERSE SOLIDUS}tmp\\N{REVERSE SOLIDUS}bridge-state.sqlite';
    const compactNamedUnicodeFileTarget =
      'sourceTarget=file\\N{COLON}runtime\\N{SOLIDUS}bridge-state\\N{FULL STOP}sqlite';
    const namedUnicodeSoftHyphenFileTarget = 'sourceTarget=fi\\N{SOFT HYPHEN}le:runtime/bridge-state.sqlite';
    const namedUnicodeZeroWidthFileTarget =
      'sourceTarget=fi\\N{ZERO WIDTH NON-JOINER}le:runtime/bridge-state.sqlite';
    const namedUnicodeBomFileTarget =
      'sourceTarget=fi\\N{ZERO WIDTH NO-BREAK SPACE}le:runtime/bridge-state.sqlite';
    const namedUnicodeVariationSelectorFileTarget =
      'sourceTarget=fi\\N{VARIATION SELECTOR-16}le:runtime/bridge-state.sqlite';
    const namedUnicodeAsciiFileTarget =
      'sourceTarget=\\N{LATIN CAPITAL LETTER F}\\N{LATIN SMALL LETTER I}\\N{LATIN SMALL LETTER L}\\N{LATIN SMALL LETTER E}:runtime/bridge-state.sqlite';
    const namedUnicodeDigitFileTarget = 'sourceTarget=file:runtime/bridge-state\\N{FULL STOP}sqlite\\N{DIGIT THREE}';
    const namedUnicodeLigatureFileTarget = 'sourceTarget=\\N{LATIN SMALL LIGATURE FI}le:runtime/bridge-state.sqlite';
    const namedUnicodeFullwidthPathMarkerFileTarget =
      'sourceTarget=file\\N{FULLWIDTH COLON}runtime\\N{FULLWIDTH SOLIDUS}bridge-state\\N{FULLWIDTH FULL STOP}sqlite';
    const namedUnicodeFullwidthDriveTarget =
      'sourceTarget=C\\N{FULLWIDTH COLON}runtime\\N{FULLWIDTH REVERSE SOLIDUS}bridge-state\\N{FULLWIDTH FULL STOP}sqlite';
    const encodedNamedUnicodeFileTarget =
      'sourceTarget=file%5CN%7BCOLON%7DC%5CN%7BCOLON%7D%5CN%7BREVERSE%20SOLIDUS%7Dtmp%5CN%7BREVERSE%20SOLIDUS%7Dbridge-state.sqlite';
    const encodedNamedUnicodeSoftHyphenFileTarget =
      'sourceTarget=fi%5CN%7BSOFT%20HYPHEN%7Dle%3Aruntime%2Fbridge-state.sqlite';
    const encodedNamedUnicodeAsciiFileTarget =
      'sourceTarget=%5CN%7BLATIN%20CAPITAL%20LETTER%20F%7D%5CN%7BLATIN%20SMALL%20LETTER%20I%7D%5CN%7BLATIN%20SMALL%20LETTER%20L%7D%5CN%7BLATIN%20SMALL%20LETTER%20E%7D%3Aruntime%2Fbridge-state.sqlite';
    const encodedNamedUnicodeLigatureFileTarget =
      'sourceTarget=%5CN%7BLATIN%20SMALL%20LIGATURE%20FI%7Dle%3Aruntime%2Fbridge-state.sqlite';
    const encodedNamedUnicodeFullwidthPathMarkerFileTarget =
      'sourceTarget=file%5CN%7BFULLWIDTH%20COLON%7Druntime%5CN%7BFULLWIDTH%20SOLIDUS%7Dbridge-state%5CN%7BFULLWIDTH%20FULL%20STOP%7Dsqlite';

    expect(evidenceTargetInspectionVariants(namedUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(compactNamedUnicodeFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeSoftHyphenFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeZeroWidthFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeBomFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeVariationSelectorFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeAsciiFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeDigitFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite3',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeLigatureFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeFullwidthPathMarkerFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(namedUnicodeFullwidthDriveTarget)).toContain(
      'sourcetarget=c:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedNamedUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedNamedUnicodeSoftHyphenFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedNamedUnicodeAsciiFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedNamedUnicodeLigatureFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedNamedUnicodeFullwidthPathMarkerFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides backslash-punctuation decoded inspection variants for escaped local targets', () => {
    const escapedPunctuationFileTarget = 'sourceTarget=file\\:runtime\\/bridge-state\\.sqlite';
    const backslashEscapedLetterFileTarget = 'sourceTarget=f\\ile:runtime/bridge-state.sqlite';
    const backslashEscapedInnerLetterFileTarget = 'sourceTarget=fi\\le:runtime/bridge-state.sqlite';
    const backslashEscapedBracedVariableTarget = 'sourceTarget=\\${HOME}/bridge-state.sqlite';
    const backslashEscapedWindowsVariableTarget = 'sourceTarget=\\%USERPROFILE\\%/bridge-state.sqlite';
    const encodedEscapedPunctuationFileTarget =
      'sourceTarget=file%5C%3Aruntime%5C%2Fbridge-state%5C.sqlite';

    expect(evidenceTargetInspectionVariants(escapedPunctuationFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backslashEscapedLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backslashEscapedInnerLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backslashEscapedBracedVariableTarget)).toContain(
      'sourcetarget=${home}/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backslashEscapedWindowsVariableTarget)).toContain(
      'sourcetarget=%userprofile%/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedEscapedPunctuationFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides HTML-entity decoded inspection variants for escaped local targets', () => {
    const htmlEscapedFileTarget = 'sourceTarget=file&#58;C&#58;&#92;tmp&#92;bridge-state.sqlite';
    const semicolonlessDecimalHtmlFileTarget = 'sourceTarget=file&#58runtime/bridge-state.sqlite';
    const semicolonlessHexHtmlFileTarget = 'sourceTarget=file&#x3aruntime/bridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(htmlEscapedFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(semicolonlessDecimalHtmlFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(semicolonlessHexHtmlFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides HTML named-entity decoded inspection variants for escaped local targets', () => {
    const htmlNamedEscapedFileTarget = 'sourceTarget=file&colon;C&colon;&bsol;tmp&bsol;bridge-state.sqlite';
    const htmlNamedSoftHyphenFileTarget = 'sourceTarget=fi&shy;le:runtime/bridge-state.sqlite';
    const htmlNamedZeroWidthFileTarget = 'sourceTarget=fi&zwnj;le:runtime/bridge-state.sqlite';
    const htmlNamedNoBreakFileTarget = 'sourceTarget=fi&NoBreak;le:runtime/bridge-state.sqlite';
    const htmlNamedFractionSlashFileTarget = 'sourceTarget=file&colon;runtime&frasl;bridge-state.sqlite';
    const htmlNamedBackslashFileTarget = 'sourceTarget=file&colon;C&colon;&Backslash;tmp&Backslash;bridge-state.sqlite';
    const htmlNamedNegativeSpaceFileTarget = 'sourceTarget=fi&NegativeMediumSpace;le:runtime/bridge-state.sqlite';
    const htmlNamedTabFileTarget = 'sourceTarget=fi&Tab;le:runtime/bridge-state.sqlite';
    const htmlNamedNewLineFileTarget = 'sourceTarget=fi&NewLine;le:runtime/bridge-state.sqlite';
    const htmlNamedInvisibleOperatorFileTarget = 'sourceTarget=fi&InvisibleTimes;le:runtime/bridge-state.sqlite';
    const htmlNamedApplyFunctionFileTarget = 'sourceTarget=fi&ApplyFunction;le:runtime/bridge-state.sqlite';
    const htmlNamedInvisibleCommaFileTarget = 'sourceTarget=fi&InvisibleComma;le:runtime/bridge-state.sqlite';
    const htmlNamedApplyFunctionAliasFileTarget = 'sourceTarget=fi&af;le:runtime/bridge-state.sqlite';
    const htmlNamedInvisibleOperatorAliasFileTarget = 'sourceTarget=fi&it;le:runtime/bridge-state.sqlite';
    const htmlNamedInvisibleCommaAliasFileTarget = 'sourceTarget=fi&ic;le:runtime/bridge-state.sqlite';
    const htmlNamedLigatureFileTarget = 'sourceTarget=&filig;le:runtime/bridge-state.sqlite';
    const htmlNamedLigatureInsideFileTarget = 'sourceTarget=fi&fllig;:runtime/bridge-state.sqlite';
    const htmlNamedCommandSubstitutionTarget = 'sourceTarget=$&lpar;pwd&rpar;/completed-release-note.md';
    const htmlNamedBacktickCommandSubstitutionTarget = 'sourceTarget=&grave;pwd&grave;completed-release-note.md';
    const htmlNamedCaretEscapedWindowsVariableTarget =
      'sourceTarget=&Hat;&percnt;USERPROFILE&Hat;&percnt;/bridge-state.sqlite';
    const htmlNamedBashSourceCommandSubstitutionTarget =
      'sourceTarget=&dollar;&lpar;dirname &dollar;&lcub;BASH_SOURCE&lsqb;0&rsqb;&rcub;&rpar;/completed-release-note.md';
    const htmlNamedDoubleQuotedScriptDirectoryTarget =
      'sourceTarget=&dollar;&lpar;dirname &quot;&dollar;0&quot;&rpar;/completed-release-note.md';
    const htmlNamedSingleQuotedScriptDirectoryTarget =
      'sourceTarget=&dollar;&lpar;dirname &apos;&dollar;0&apos;&rpar;/completed-release-note.md';
    const htmlNamedCurlyQuotedScriptDirectoryTarget =
      'sourceTarget=&dollar;&lpar;dirname &OpenCurlyQuote;&dollar;0&CloseCurlyQuote;&rpar;/completed-release-note.md';
    const encodedHtmlNamedSoftHyphenFileTarget = 'sourceTarget=fi%26shy%3Ble%3Aruntime%2Fbridge-state.sqlite';
    const encodedHtmlNamedNoBreakFileTarget = 'sourceTarget=fi%26NoBreak%3Ble%3Aruntime%2Fbridge-state.sqlite';
    const encodedHtmlNamedLigatureFileTarget = 'sourceTarget=%26filig%3Ble%3Aruntime%2Fbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(htmlNamedEscapedFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedSoftHyphenFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedZeroWidthFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedNoBreakFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedFractionSlashFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedBackslashFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedNegativeSpaceFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedTabFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedNewLineFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedInvisibleOperatorFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedApplyFunctionFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedInvisibleCommaFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedApplyFunctionAliasFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedInvisibleOperatorAliasFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedInvisibleCommaAliasFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedLigatureFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedLigatureInsideFileTarget)).toContain(
      'sourcetarget=fifl:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedCommandSubstitutionTarget)).toContain(
      'sourcetarget=$(pwd)/completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedBacktickCommandSubstitutionTarget)).toContain(
      'sourcetarget=`pwd`completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedCaretEscapedWindowsVariableTarget)).toContain(
      'sourcetarget=%userprofile%/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedBashSourceCommandSubstitutionTarget)).toContain(
      'sourcetarget=$(dirname ${bash_source[0]})/completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedDoubleQuotedScriptDirectoryTarget)).toContain(
      'sourcetarget=$(dirname "$0")/completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants(htmlNamedSingleQuotedScriptDirectoryTarget)).toContain(
      "sourcetarget=$(dirname '$0')/completed-release-note.md",
    );
    expect(evidenceTargetInspectionVariants(htmlNamedCurlyQuotedScriptDirectoryTarget)).toContain(
      "sourcetarget=$(dirname '$0')/completed-release-note.md",
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=cat&nbsp;completed-release-note.md')).toContain(
      'sourcetarget=cat completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=Out-File&ThinSpace;-FilePath&ThinSpace;report.txt')).toContain(
      'sourcetarget=out-file -filepath report.txt',
    );
    expect(evidenceTargetInspectionVariants(encodedHtmlNamedSoftHyphenFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedHtmlNamedNoBreakFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedHtmlNamedLigatureFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides semicolonless HTML named-entity decoded variants at separator boundaries', () => {
    const semicolonlessNamedFileTarget = 'sourceTarget=file&colon/runtime/bridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(semicolonlessNamedFileTarget)).toContain(
      'sourcetarget=file:/runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=file&colonruntime/bridge-state.sqlite')).not.toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides Unicode compatibility-normalized inspection variants for escaped local targets', () => {
    const fullwidthFileTarget = 'sourceTarget=file：C：＼tmp＼bridge-state．sqlite';
    const encodedFullwidthFileTarget =
      'sourceTarget=file%EF%BC%9AC%EF%BC%9A%EF%BC%BCtmp%EF%BC%BCbridge-state%EF%BC%8Esqlite';
    const escapedFullwidthFileTarget = 'sourceTarget=file\\uff1aC\\uff1a\\uff3ctmp\\uff3cbridge-state\\uff0esqlite';

    expect(evidenceTargetInspectionVariants(fullwidthFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedFullwidthFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(escapedFullwidthFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides Unicode format-control stripped inspection variants for escaped local targets', () => {
    const syriacAbbreviationMark = '\u070f';
    const combiningGraphemeJoiner = '\u034f';
    const softHyphen = '\u00ad';
    const arabicLetterMark = '\u061c';
    const hangulChoseongFiller = '\u115f';
    const khmerInherentAq = '\u17b4';
    const mongolianFreeVariationSelectorOne = '\u180b';
    const mongolianVowelSeparator = '\u180e';
    const hangulFiller = '\u3164';
    const interlinearAnnotationAnchor = '\ufff9';
    const languageTag = '\u{e0001}';
    const tagLetterA = '\u{e0061}';
    const cancelTag = '\u{e007f}';
    const shorthandFormatLetterOverlap = '\u{1bca0}';
    const musicalSymbolBeginBeam = '\u{1d173}';
    const egyptianHieroglyphBeginSegment = '\u{13430}';
    const zeroWidthSpace = '\u200b';
    const zeroWidthNonJoiner = '\u200c';
    const zeroWidthJoiner = '\u200d';
    const byteOrderMark = '\ufeff';
    const hiddenFileTarget = `sourceTarget=fi${zeroWidthSpace}le:C:${zeroWidthJoiner}\\tmp\\bridge-state.sqlite`;
    const defaultIgnorableFileTarget =
      `sourceTarget=fi${combiningGraphemeJoiner}le:${softHyphen}runtime` +
      `${arabicLetterMark}/bridge-state${mongolianVowelSeparator}.sqlite`;
    const remainingFormatControlFileTarget =
      `sourceTarget=fi${syriacAbbreviationMark}le:${hangulChoseongFiller}runtime` +
      `${khmerInherentAq}/bridge-state${mongolianFreeVariationSelectorOne}.sqlite`;
    const supplementalFormatControlFileTarget =
      `sourceTarget=fi${hangulFiller}le:${interlinearAnnotationAnchor}runtime/bridge-state` +
      `${shorthandFormatLetterOverlap}${musicalSymbolBeginBeam}${egyptianHieroglyphBeginSegment}.sqlite`;
    const tagCharacterFileTarget =
      `sourceTarget=fi${tagLetterA}le:${languageTag}runtime/bridge-state${cancelTag}.sqlite`;
    const encodedHiddenFileTarget = 'sourceTarget=fi%E2%80%8Ble%3AC%E2%80%8C%3A%2Ftmp%2Fbridge-state.sqlite';
    const escapedHiddenFileTarget =
      'sourceTarget=file\\u200b:C\\u200c:\\u200d\\tmp\\bridge-state.sqlite\\ufeff';

    expect(evidenceTargetInspectionVariants(hiddenFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(defaultIgnorableFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(remainingFormatControlFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(supplementalFormatControlFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(tagCharacterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedHiddenFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(escapedHiddenFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(`sourceTarget=file:${byteOrderMark}runtime/bridge-state.sqlite`)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('provides ASCII control stripped inspection variants for escaped local targets', () => {
    const encodedNulFileTarget = 'sourceTarget=fi%00le%3AC%3A%5Ctmp%5Cbridge-state.sqlite';
    const encodedCrLfFileTarget = 'sourceTarget=file%3A%0D%0A%09runtime%2Fbridge-state.sqlite';
    const unicodeEscapedNulFileTarget = 'sourceTarget=fi\\u0000le:C\\u0000:/tmp/bridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(encodedNulFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedCrLfFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(unicodeEscapedNulFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides legacy percent-unicode decoded inspection variants for escaped local targets', () => {
    const legacyPercentUnicodeFileTarget = 'sourceTarget=file%u003aC%u003a%u005ctmp%u005cbridge-state.sqlite';
    const eightDigitPercentUnicodeFileTarget =
      'sourceTarget=file%U0000003aC%U0000003a%U0000005ctmp%U0000005cbridge-state.sqlite';
    const encodedEightDigitPercentUnicodeFileTarget =
      'sourceTarget=file%25U0000003aC%25U0000003a%25U0000005ctmp%25U0000005cbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(legacyPercentUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(eightDigitPercentUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedEightDigitPercentUnicodeFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides quoted-printable decoded inspection variants for escaped local targets', () => {
    const quotedPrintableFileTarget = 'sourceTarget=file=3AC=3A=5Ctmp=5Cbridge-state=2Esqlite';
    const quotedPrintableLetterFileTarget = 'sourceTarget=f=69le=3Aruntime=2Fbridge-state=2Esqlite';
    const quotedPrintableLeadingLetterFileTarget = 'sourceTarget==66ile=3Aruntime=2Fbridge-state=2Esqlite';
    const quotedPrintableInvisibleFileTarget = 'sourceTarget=fi=ADle=3Aruntime=2Fbridge-state=2Esqlite';
    const encodedQuotedPrintableFileTarget =
      'sourceTarget=file%3D3AC%3D3A%3D5Ctmp%3D5Cbridge-state%3D2Esqlite';

    expect(evidenceTargetInspectionVariants(quotedPrintableFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(quotedPrintableLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(quotedPrintableLeadingLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(quotedPrintableInvisibleFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedQuotedPrintableFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides cmd-caret decoded inspection variants for escaped local targets', () => {
    const caretFileTarget = 'sourceTarget=file^:C^:^\\tmp^\\bridge-state^.sqlite';
    const caretEscapedLetterFileTarget = 'sourceTarget=f^ile^:runtime^/bridge-state^.sqlite';
    const caretEscapedInnerLetterFileTarget = 'sourceTarget=fi^le^:runtime^/bridge-state^.sqlite';
    const caretEscapedEnvironmentFileTarget = 'sourceTarget=^%USERPROFILE^%^/bridge-state.sqlite';
    const encodedCaretFileTarget =
      'sourceTarget=file%5E%3AC%5E%3A%5E%5Ctmp%5E%5Cbridge-state%5E.sqlite';

    expect(evidenceTargetInspectionVariants(caretFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(caretEscapedLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(caretEscapedInnerLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(caretEscapedEnvironmentFileTarget)).toContain(
      'sourcetarget=%userprofile%/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(encodedCaretFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides PowerShell-backtick decoded inspection variants for escaped local targets', () => {
    const backtickFileTarget = 'sourceTarget=file`:C`:`\\tmp`\\bridge-state.sqlite';
    const backtickEscapedLetterFileTarget = 'sourceTarget=f`ile`:runtime`/bridge-state`.sqlite';
    const backtickEscapedInnerLetterFileTarget = 'sourceTarget=fi`le`:runtime`/bridge-state`.sqlite';
    const backtickEscapedBracedVariableTarget = 'sourceTarget=`$`{HOME`}`/bridge-state.sqlite';
    const backtickEscapedCommandSubstitutionTarget = 'sourceTarget=`$`(pwd`)`/completed-release-note.md';
    const encodedBacktickFileTarget =
      'sourceTarget=file%60%3AC%60%3A%60%5Ctmp%60%5Cbridge-state.sqlite';

    expect(evidenceTargetInspectionVariants(backtickFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backtickEscapedLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backtickEscapedInnerLetterFileTarget)).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backtickEscapedBracedVariableTarget)).toContain(
      'sourcetarget=${home}/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants(backtickEscapedCommandSubstitutionTarget)).toContain(
      'sourcetarget=$(pwd)/completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants(encodedBacktickFileTarget)).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
  });

  it('provides form-urlencoded plus decoded inspection variants for local shell targets', () => {
    expect(evidenceTargetInspectionVariants('sourceTarget=cat+completed-release-note.md')).toContain(
      'sourcetarget=cat completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=cat&plus;completed-release-note.md')).toContain(
      'sourcetarget=cat completed-release-note.md',
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=Get-Content+-LiteralPath+completed-release-note.md')).toContain(
      'sourcetarget=get-content -literalpath completed-release-note.md',
    );
    expect(
      evidenceTargetInspectionVariants('sourceTarget=Get-Content&plus;-LiteralPath&plus;completed-release-note.md'),
    ).toContain('sourcetarget=get-content -literalpath completed-release-note.md');
    expect(
      evidenceTargetInspectionVariants('sourceTarget=%24%28pwd+-P%29%2Fcompleted-release-note.md'),
    ).toContain('sourcetarget=$(pwd -p)/completed-release-note.md');
  });

  it('provides variation-selector stripped inspection variants for local targets', () => {
    expect(evidenceTargetInspectionVariants('sourceTarget=fi\ufe0fle:runtime/bridge-state.sqlite')).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=file\ufe0f:C:\\tmp\\bridge-state.sqlite')).toContain(
      'sourcetarget=file:c:/tmp/bridge-state.sqlite',
    );
    expect(evidenceTargetInspectionVariants('sourceTarget=file\ufe0e:runtime/bridge-state.sqlite')).toContain(
      'sourcetarget=file:runtime/bridge-state.sqlite',
    );
  });

  it('recognizes home-relative local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=~/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=~\\bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=~%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%7E%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%7E%5Cbridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=~operator/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=~operator\\bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=~operator%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%7Eoperator%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%7Eoperator%5Cbridge-state.sqlite')).toBe(true);
  });

  it('recognizes environment-variable local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);
    const bridgeStateTmpTarget = ['', 'tmp', 'bridge-state.sqlite'].join('/');
    const completedReleaseNoteTmpTarget = ['', 'tmp', 'completed-release-note.md'].join('/');

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$HOME/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${HOME}/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${HOME}completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference(`sourceTarget=\${HOME:-${bridgeStateTmpTarget}}`)).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference(`sourceTarget=\${TMPDIR:=${completedReleaseNoteTmpTarget}}`)).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${XDG_RUNTIME_DIR:?missing runtime dir}')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$env:USERPROFILE/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${env:USERPROFILE}/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${env:USERPROFILE}completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$env:SystemDrive/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$env:USERPROFILErelease-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$TMPDIR/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${XDG_RUNTIME_DIR}/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$PSScriptRoot/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${PSCommandPath}')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$PROFILE')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$PSHOME/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$PWD.Path')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${PWD}.Path')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$PWD.Pathrelease-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$PWD.ProviderPath\\completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${PWD}.ProviderPath/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$MyInvocation.MyCommand.Path')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$MyInvocation.MyCommand.Pathrelease-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${MyInvocation}.MyCommand.Path')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$ExecutionContext.SessionState.Path.CurrentLocation')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$ExecutionContext.SessionState.Path.CurrentLocationrelease-note.md',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Env:USERPROFILE/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Env:/LOCALAPPDATA/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Variable:HOME/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Variable:/PWD/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd)/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd)completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd -P)completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=`pwd`completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(realpath .)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Get-Location)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Get-Location)completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gl)completed-release-note.md')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(git rev-parse --show-toplevel)completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=`git rev-parse --show-toplevel`completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(dirname "$0")completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=$(dirname '$0')completed-release-note.md")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=`dirname "$0"`completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Get-Location).ProviderPath\\bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gl)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gl).ProviderPath\\bridge-state.sqlite')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Get-Location | Select-Object -ExpandProperty ProviderPath)\\bridge-state.sqlite',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Get-Location | Select-Object -ExpandProperty ProviderPath)release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gl | foreach ProviderPath)\\bridge-state.sqlite'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gl | foreach ProviderPath)release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd | Select -Expand Path)/completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd | Select -Expand Path)release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd | % ProviderPath)\\bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd | % ProviderPath)release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$((Get-Location).Path)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$((Get-Location).ProviderPath)/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Convert-Path .)/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(cvpa .)/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Convert-Path ".")/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Join-Path . bridge-state.sqlite)')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Join-Path "." bridge-state.sqlite)')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Join-Path -Path . -ChildPath completed-release-note.md)'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Join-Path -Path . -ChildPath completed-release-note.md)release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Join-Path -Path "." -ChildPath completed-release-note.md)'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Join-Path -ChildPath bridge-state.sqlite -Path .)'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Join-Path -LiteralPath . -ChildPath bridge-state.sqlite)'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Join-Path .. bridge-state.sqlite)')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Resolve-Path .)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Resolve-Path ..)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=$(Resolve-Path '.')/completed-release-note.md")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Resolve-Path .).ProviderPath/bridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Resolve-Path -LiteralPath .).ProviderPath/bridge-state.sqlite'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        "sourceTarget=$(Resolve-Path -Path '..').ProviderPath/bridge-state.sqlite",
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(rvpa .)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(rvpa -Path ..).ProviderPath/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Get-Item .).FullName/completed-release-note.md')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Get-Item -LiteralPath .).FullName\\completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Get-Item -Path ..).FullName\\completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Get-Item .).PSPath\\completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=$(Get-Item '.').FullName/completed-release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gi .).FullName/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gi -Path ..).PSPath\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(gi -LiteralPath "..").PSPath\\bridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        "sourceTarget=[Environment]::GetEnvironmentVariable('USERPROFILE')/bridge-state.sqlite",
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        "sourceTarget=[Environment]::GetEnvironmentVariable('USERPROFILE')completed-release-note.md",
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=[System.Environment]::GetEnvironmentVariable("LOCALAPPDATA")/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        "sourceTarget=[Environment]::GetFolderPath('UserProfile')/bridge-state.sqlite",
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        "sourceTarget=[Environment]::GetFolderPath('UserProfile')completed-release-note.md",
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=[System.Environment]::GetFolderPath("LocalApplicationData")/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        "sourceTarget=[Environment]::ExpandEnvironmentVariables('%USERPROFILE%')/bridge-state.sqlite",
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=[System.Environment]::ExpandEnvironmentVariables("$TMPDIR")/completed-release-note.md',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%USERPROFILE%/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%USERPROFILE%completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%HOMEPATH%/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%HOMEDRIVE%/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%CD%/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%CD%completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%TMPDIR%/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%ProgramData%/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%PUBLIC%/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%SystemRoot%/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=!USERPROFILE!/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=!CD!/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=!CD!completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&dollar;HOME/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&dollar;{HOME}/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&dollar;&lcub;HOME&rcub;/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=$&lpar;pwd&rpar;/completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&dollar;&lpar;pwd&rpar;/completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&grave;pwd&grave;completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&percnt;USERPROFILE&percnt;/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&excl;USERPROFILE&excl;/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=&Hat;&percnt;USERPROFILE&Hat;&percnt;/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;org&period;ergoplatform&period;sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=%24HOME%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7BHOME%7Dcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7Benv%3AUSERPROFILE%7Dcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7BHOME%3A-%2Ftmp%2Fbridge-state.sqlite%7D')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7BTMPDIR%3A%3D%2Ftmp%2Fcompleted-release-note.md%7D')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7BXDG_RUNTIME_DIR%3A%3Fmissing%20runtime%20dir%7D')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24PSScriptRoot%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7BPSCommandPath%7D')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24PROFILE')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24PSHOME%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24PWD.Path')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24PWD.Pathrelease-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24PWD.ProviderPath%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24MyInvocation.MyCommand.Path')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24MyInvocation.MyCommand.Pathrelease-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24ExecutionContext.SessionState.Path.CurrentLocation')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=%24ExecutionContext.SessionState.Path.CurrentLocationrelease-note.md'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Env%3AUSERPROFILE%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Variable%3APWD%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%60pwd%60completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Get-Location%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gl%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28git%20rev-parse%20--show-toplevel%29completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%60git%20rev-parse%20--show-toplevel%60completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28dirname%20%22%240%22%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%60dirname%20%22%240%22%60completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Get-Location%29%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Get-Location%29.ProviderPath%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gl%29%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gl%29.ProviderPath%5Cbridge-state.sqlite')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%24%28Get-Location%20%7C%20Select-Object%20-ExpandProperty%20ProviderPath%29%5Cbridge-state.sqlite',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%24%28Get-Location%20%7C%20Select-Object%20-ExpandProperty%20ProviderPath%29release-note.md',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gl%20%7C%20foreach%20ProviderPath%29%5Cbridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gl%20%7C%20foreach%20ProviderPath%29release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd%20%7C%20Select%20-Expand%20Path%29%2Fcompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd%20%7C%20Select%20-Expand%20Path%29release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd%20%7C%20%25%20ProviderPath%29%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd%20%7C%20%25%20ProviderPath%29release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28%28Get-Location%29.Path%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28%28Get-Location%29.ProviderPath%29%2Fbridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Convert-Path%20.%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28cvpa%20.%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Convert-Path%20%22.%22%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Join-Path%20.%20bridge-state.sqlite%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Join-Path%20%22.%22%20bridge-state.sqlite%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Join-Path%20-Path%20.%20-ChildPath%20completed-release-note.md%29')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%24%28Join-Path%20-Path%20.%20-ChildPath%20completed-release-note.md%29release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=%24%28Join-Path%20-Path%20%22.%22%20-ChildPath%20completed-release-note.md%29'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Join-Path%20-ChildPath%20bridge-state.sqlite%20-Path%20.%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Join-Path%20-LiteralPath%20.%20-ChildPath%20bridge-state.sqlite%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Join-Path%20..%20bridge-state.sqlite%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Resolve-Path%20.%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Resolve-Path%20..%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Resolve-Path%20%27.%27%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Resolve-Path%20.%29.ProviderPath%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Resolve-Path%20-LiteralPath%20.%29.ProviderPath%2Fbridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%24%28Resolve-Path%20-Path%20%27..%27%29.ProviderPath%2Fbridge-state.sqlite',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28rvpa%20.%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28rvpa%20-Path%20..%29.ProviderPath%2Fbridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gi%20.%29.FullName%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gi%20-Path%20..%29.PSPath%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Get-Item%20%27.%27%29.FullName%2Fcompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28gi%20-LiteralPath%20%22..%22%29.PSPath%5Cbridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Get-Item%20-LiteralPath%20.%29.FullName%5Ccompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Get-Item%20-Path%20..%29.FullName%5Ccompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28Get-Item%20.%29.PSPath%5Ccompleted-release-note.md')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%5BEnvironment%5D%3A%3AGetEnvironmentVariable%28%27USERPROFILE%27%29%2Fbridge-state.sqlite',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%5BSystem.Environment%5D%3A%3AGetFolderPath%28%22LocalApplicationData%22%29%2Fcompleted-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%5BEnvironment%5D%3A%3AGetFolderPath%28%27UserProfile%27%29completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%5BEnvironment%5D%3A%3AExpandEnvironmentVariables%28%27%25USERPROFILE%25%5Cbridge-state.sqlite%27%29',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24XDG_RUNTIME_DIR%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7BXDG_RUNTIME_DIR%7D%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24env%3AUSERPROFILE%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%7Benv%3AUSERPROFILE%7D%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24env%3ASystemDrive%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24env%3AUSERPROFILErelease-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25USERPROFILE%25%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25USERPROFILE%25completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25HOMEPATH%25%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25HOMEDRIVE%25%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25CD%25%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25CD%25completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25TMPDIR%25%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25ProgramFiles%28x86%29%25%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%21USERPROFILE%21%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%21OneDrive%21%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%21CD%21completed-release-note.md')).toBe(true);
  });

  it('recognizes Windows batch parameter local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%~dp0/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%~f0')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%~dp0completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25~dp0%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%25~f0')).toBe(true);
  });

  it('recognizes shell command local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat ./completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat&plus;completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat&nbsp;completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat Microsoft.PowerShell.Management.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat org.ergoplatform.sdk.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=type System.Management.Automation.log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat "completed-release-note.md"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=cat 'completed-release-note.md'")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=`cat completed-release-note.md`')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat completed-release-note.md|sha256sum')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=grep PASS ../completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=grep PASS "completed-release-note.md"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=grep "Release gate PASS" completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cp ../bridge-state.sqlite evidence.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cp completed-release-note.md evidence-copy.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rm -f ./completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mkdir -p ../bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Content ./completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Content completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Content "completed-release-note.md"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sha256sum ./completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sha256sum completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sha256sum "completed-release-note.md"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sha256sum --check=completed-release-note.sha256')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-FileHash ./completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=certutil -hashfile ../bridge-state.sqlite SHA256')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=stat bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=type .\\completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=type completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gc completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sls PASS completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gci ../bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ri ../bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mi completed-release-note.md evidence.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clc completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ac completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cpi completed-release-note.md evidence.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ii completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=move completed-release-note.md evidence.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ni completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sc completed-release-note.md ok')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=si completed-release-note.md ok')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Item -Path completed-release-note.md ok')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dir ../bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=readlink -f completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=realpath completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tar -cf evidence.tar completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tar --files-from=completed-release-note.md -cf evidence.tar')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=zip evidence.zip completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=7z a evidence.7z completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Compress-Archive -Path completed-release-note.md -DestinationPath evidence.zip')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=scp completed-release-note.md evidence-host:evidence/')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rsync completed-release-note.md evidence-host:evidence/')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sftp evidence-host <<< put completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=curl --upload-file completed-release-note.md https://example.invalid/evidence')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wget --post-file=completed-release-note.md https://example.invalid/evidence')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=az storage blob upload --file completed-release-note.md --container evidence')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python scripts/collect-evidence.py completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python3 scripts/collect-evidence.py completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python -m json.tool completed-release-note.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python -m json.tool "completed-release-note.json"')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python3 -m json.tool completed-release-note.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=py -m json.tool completed-release-note.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python -c "print(1)" completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=node scripts/collect-evidence.js completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=node -e readFile completed-release-note.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=node -e "console.log(1)" completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=deno eval readFile completed-release-note.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bun --print completed-release-note.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=perl -ne print completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=perl -ne print "completed-release-note.md"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ruby -ne puts completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npx tsx scripts/collect-evidence.ts completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=npx tsx -e "console.log(1)" scripts/collect-evidence.ts'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pwsh -File scripts/collect-evidence.ps1 completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=powershell -File scripts/collect-evidence.ps1 completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bash scripts/collect-evidence.sh completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sh scripts/collect-evidence.sh completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git show HEAD:completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git show --format="%H %s" HEAD:completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git cat-file -p HEAD:completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jq . completed-release-note.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=yq . completed-release-note.yaml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sqlite3 runtime/bridge-state.sqlite .schema')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sqlite-utils tables runtime/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gh release upload test completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gh gist create completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=openssl dgst -sha256 completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=openssl pkey -in ../private.pem -pubout')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gpg --verify completed-release-note.sig completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ssh -i ../id_ed25519 evidence-host')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ssh -F ../ssh_config evidence-host')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sops --config ../.sops.yaml evidence.enc.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cosign sign --key ../cosign.key image')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=age --identity ../age-key.txt evidence.age')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=aws --ca-bundle ../ca.pem s3 ls')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcloud auth activate-service-account --key-file ../gcp-key.json'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcloud --credential-file-override ../gcp-key.json auth list'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vault agent -config=../vault.hcl')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=vault login -method=cert -client-cert=../client.pem -client-key=../client.key',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=op inject -i ../template.env')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rg PASS completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rg PASS "completed-release-note.md"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rg "Release gate PASS" completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ripgrep PASS completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fd completed-release-note.md evidence')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bat completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=xxd completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hexdump -C completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=od -An -tx1 completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=awk {print} completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=awk "{ print }" completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cut -f1 completed-release-note.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sort completed-release-note.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=uniq completed-release-note.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=nl completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-String PASS ./completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-String "Release gate PASS" completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sha256sum --check=./completed-release-note.sha256')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-FileHash -Path=./completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-FileHash completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Get-Content&plus;-LiteralPath&plus;completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Content -LiteralPath:../bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Content -Path ./evidence.txt -Value ok')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Clear-Content -Path ./evidence.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=certutil /hashfile:../bridge-state.sqlite SHA256')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Content -Path ../bridge-state.sqlite -Value ok')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Out-File -FilePath completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Out-File&ThinSpace;-FilePath&ThinSpace;completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Csv -Path report.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Csv report.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=epal ./aliases.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Alias -Path ./aliases.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=epcsv -Path report.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Clixml -LiteralPath ./evidence.xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Clixml ./evidence.xml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Csv ./evidence.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipal ./aliases.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Alias -Path ./aliases.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipcsv ./evidence.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Clixml -Path ./evidence.xml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Clixml ./evidence.xml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Module ./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipmo ./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Module -Name ./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PSSession $session -OutputModule ./session-module')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Import-PSSession $session -OutputModule Microsoft.PowerShell.Management.psd1',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipsn $session -OutputModule ./session-module')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-PSSession $session -OutputModule ./session-module')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=epsn $session -OutputModule ./session-module')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PowerShellDataFile ./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PowerShellDataFile -Path:./module.psd1')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PowerShellDataFile -LiteralPath ./module.psd1'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-ModuleManifest -Path ./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-ModuleManifest -Path Microsoft.PowerShell.Management.psd1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-ModuleManifest -RootModule ./bridge.psm1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-ModuleManifest ./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-ModuleManifest -Path ./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-ModuleManifest -Path:./module.psd1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-ModuleManifest -Path ./module.psd1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Publish-Module -Path ./module')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Publish-Script -Path ./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check | Export-Csv report.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-AuthenticodeSignature ./evidence.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-AuthenticodeSignature -FilePath ./evidence.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-PfxCertificate ./operator.pfx')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-PfxCertificate operator.pfx')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Certificate -FilePath ./certificate.cer')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Certificate -FilePath ./certificate.cer')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-PfxCertificate -FilePath ./operator.pfx')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PfxCertificate -FilePath ./operator.pfx')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Counter -Path ./counter.blg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Counter -Path ./counter.blg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Unblock-File ./evidence.zip')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Acl -Path ./evidence.txt -AclObject $acl')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-ItemProperty ./evidence.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gpv -Path ./evidence.json -Name ok')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-ItemProperty -Path ./evidence.json -Name ok')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Remove-ItemProperty -Path ./evidence.json -Name ok')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clp -Path ./evidence.json -Name ok')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cpp -Path ./evidence.json -Destination ./other.json -Name ok')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mp -Path ./evidence.json -Destination ./other.json -Name ok')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rnp -Path ./evidence.json -Name old -NewName new')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Rename-Item ./evidence.txt report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ren ./evidence.txt report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rd ./evidence-dir')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=md ./evidence-dir')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cli ./evidence.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSDrive -Name X -PSProvider FileSystem -Root ./evidence')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ndr -Name X -PSProvider FileSystem -Root ./evidence')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-Item ./evidence.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-Xml -Path ./evidence.xml -XPath /root')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-Xml -Path org.ergoplatform.sdk.xml -XPath /root'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcm ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command -Name ./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command -Name:./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcm -Name ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Help ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=help ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=man ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Help -Path ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Help -Path:./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Format-Hex ./evidence.bin')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fhx ./evidence.bin')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-WebRequest https://example.invalid/evidence -OutFile ./evidence.html')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Invoke-WebRequest https://example.invalid/evidence -OutFile org.ergoplatform.sdk.html',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-WebRequest https://example.invalid/evidence -InFile ./payload.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=iwr -Uri https://example.invalid/evidence -OutFile ./evidence.html')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-RestMethod https://example.invalid/api -OutFile ./evidence.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-RestMethod https://example.invalid/api -InFile ./payload.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=irm https://example.invalid/api -OutFile ./evidence.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-BitsTransfer -Source https://example.invalid/file -Destination ./evidence.bin')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-BitsTransfer -Source org.ergoplatform.sdk.zip')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Help -Module Microsoft.PowerShell.Management -DestinationPath ./help')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Module -Name Pester -Path ./modules')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Package -Name Bridge -Path ./packages')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Script -Name Invoke-Build -Path ./scripts')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-LocalizedData -BaseDirectory ./locale')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-LocalizedData -FileName ./strings.psd1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-FormatData -Path ./format.ps1xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-FormatData -Path:./format.ps1xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Type -Path ./bridge-evidence.cs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Type ./bridge-evidence.cs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Type -LiteralPath ./bridge-evidence.cs')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Type -OutputAssembly ./bridge-evidence.dll')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Type -ReferencedAssemblies ./bridge-dep.dll')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertFrom-String -TemplateFile ./template.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Console -Path ./console.psc1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSSessionConfigurationFile -Path ./session.pssc')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSSessionConfigurationFile -TranscriptDirectory ./transcripts')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npssc -Path ./session.pssc')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSRoleCapabilityFile -Path ./role.psrc')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Register-PSSessionConfiguration -Path ./session.pssc')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Register-PSSessionConfiguration -ModulesToImport ./module.psd1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-PSSessionConfiguration -StartupScript ./startup.ps1')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Set-PSSessionConfiguration -StartupScript System.Management.Automation.ps1',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-PSSessionConfiguration -Path ./session.pssc')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Remove-TypeData -Path ./types.ps1xml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-TraceSource -Name bridge -FilePath ./trace.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-PSSessionConfigurationFile -Path ./session.pssc')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Trace-Command -Name ParameterBinding -Expression { npm test } -FilePath ./trace.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-Help -SourcePath ./help')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-FormatData -PrependPath ./format.ps1xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-FormatData -AppendPath ./format.ps1xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-TypeData -PrependPath ./types.ps1xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-TypeData -AppendPath ./types.ps1xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Console -Path:./console.psc1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Console -Path "console.psc1"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertTo-Json > report.json')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=ConvertTo-Json &gt; report.json')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=ConvertTo-Json &gt;&gt; report.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertTo-Json > Microsoft.PowerShell.Management.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertFrom-Json < report.json')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=ConvertFrom-Json &lt; report.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertTo-Csv > report.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertTo-Html > report.html')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Compare-Object expected actual > diff.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Format-Table Name > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Group-Object Name > groups.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Measure-Object -Line > metrics.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-Object Name > selected.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=select Name > selected.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Sort-Object Name > sorted.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Where-Object Name -eq bridge > filtered.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=? Name -eq bridge > filtered.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=group Name > groups.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=measure -Line > metrics.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=compare expected actual > diff.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ft Name > table.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fl Name > list.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fw Name > wide.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=foreach Name > each.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=% Name > each.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Out-String > output.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Write-Output PASS > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Write-Host PASS > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Write-Error failure 2> errors.txt')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Write-Error failure 2&gt; errors.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -Path ./event.evtx')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -Path:event.evtx')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent ./event.evtx')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent event.evtx')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -FilterHashtable @{Path="./event.evtx"}'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=Get-WinEvent -FilterHashtable &commat;&lcub;Path&equals;&quot;./event.evtx&quot;&rcub;',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Get-WinEvent -FilterHashtable @{Path=Microsoft.PowerShell.Management.evtx}',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=Get-WinEvent -FilterHashtable &commat;&lcub;Path&equals;Microsoft.PowerShell.Management.evtx&semi;ProviderName&equals;&quot;Bridge&quot;&rcub;',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Counter -Path ./counter.blg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Counter -Path:counter.blg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-Command -FilePath ./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-Command -FilePath:./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=icm -FilePath ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=icm -FilePath:./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Job -FilePath ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Job -FilePath:./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sajb -FilePath ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sajb -FilePath:./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-ThreadJob -FilePath ./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-ThreadJob -FilePath:./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=where .\\scripts\\check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=where.exe .\\scripts\\check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fc completed-release-note.md expected.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=comp completed-release-note.md expected.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=attrib +R completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=attrib.exe +R completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=icacls completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=robocopy evidence out completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=xcopy completed-release-note.md out\\')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=reg import ./evidence.reg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=reg import org.ergoplatform.sdk.reg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=reg query HKCU\\Software\\Bridge')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=regedit /s ./evidence.reg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=regedit /s Microsoft.PowerShell.Management.reg')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=makecab completed-release-note.md evidence.cab')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=makecab.exe completed-release-note.md evidence.cab')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=expand evidence.cab ./out')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=expand.exe evidence.cab ./out')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=extrac32 evidence.cab ./out')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=signtool verify /pa completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=signtool.exe verify /pa completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=certreq -submit ./request.inf')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wevtutil qe Application /lf:true ./eventlog.evtx')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=wevtutil.exe qe Application /lf:true ./eventlog.evtx'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=schtasks /create /xml ./task.xml /tn BridgeEvidence')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=schtasks /create /xml org.ergoplatform.sdk.xml /tn BridgeEvidence'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=for /f %i in (completed-release-note.md) do echo %i')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=for /f %i in (org.ergoplatform.sdk.txt) do echo %i')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=msiexec /i ./package.msi /qn /l*v ./install.log')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=msiexec.exe /i ./package.msi /qn')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rundll32.exe ./bridge.dll,EntryPoint')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=regsvr32 /s ./bridge.dll')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=regsvr32.exe /s ./bridge.dll')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bitsadmin /transfer job ./source.bin ./out.bin')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cipher /w:./evidence')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=compact /c completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=esentutl /y ./source.edb /d ./copy.edb')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pnputil /add-driver ./driver.inf /install')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dism /Online /Add-Package /PackagePath:./package.cab')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dism.exe /Image:./mount /Add-Driver /Driver:./driver.inf')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bcdedit /import ./bcd.bak')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=takeown /f completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cscript ./check.vbs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wscript.exe ./check.vbs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mshta ./evidence.hta')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=installutil ./BridgeService.exe')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=installutil.exe ./BridgeService.exe')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=presentationhost.exe ./app.xbap')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=control ./desk.cpl')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wmic /output:./wmic.txt process list')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wmic process list /format:./format.xsl')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=lodctr /r:./counters.ini')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=relog ./input.blg -o ./out.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=typeperf -cf ./counters.txt -o ./perf.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tracerpt ./trace.etl -o ./trace.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=logman import bridge -xml ./collector.xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=auditpol /backup /file:./audit.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=auditpol /restore /file:./audit.csv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=secedit /configure /db ./security.sdb /cfg ./security.inf')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=secedit /export /cfg ./security.inf')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gpresult /x ./gpresult.xml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tasklist /fi imagename eq node.exe > ./tasks.txt')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=tasklist /fi imagename eq node.exe > Microsoft.PowerShell.Management.txt'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=netsh exec ./network.netsh')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=netsh -f ./network.netsh')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=& ./scripts/check.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=& Microsoft.PowerShell.Management.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript -Path report.txt; npm run check')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript -Path:report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript -LiteralPath ./logs/session.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript -OutputDirectory ./logs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript -OutputDirectory:./logs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=echo PASS >completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=echo PASS > completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=printf PASS >>completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=printf PASS >> completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat<completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat>completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sed -n p<completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat <<EOF > completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat <<EOF >completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat <<<EOF > completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat --input=Microsoft.PowerShell.Management.log')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=read line <completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mapfile lines < completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=while read line; do echo $line; done < completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=source completed-release-note.sh')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=source org.ergoplatform.sdk.sh')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=. completed-release-note.sh')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=. System.Management.Automation.ps1')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=>completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=> completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=2>completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=<completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=:>completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=true >completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=exec 3<completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bash -c "<completed-release-note.md"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check&&cat completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check;cat completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check||cat completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=for %f in (completed-release-note.md) do type %f')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=forfiles /m completed-release-note.md /c "cmd /c type @file"'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=xargs -a completed-release-note.md echo')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Copy-Item -LiteralPath ./completed-release-note.md evidence.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Remove-Item -Force ../bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process npm -WorkingDirectory ../bridge')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process -FilePath npm -WorkingDirectory "./relayer"'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=saps -FilePath npm -WorkingDirectory ./relayer')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=start -FilePath npm -WorkingDirectory ./relayer')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process -FilePath ./scripts/check.ps1')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=start ./evidence.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process npm -RedirectStandardOutput ./out.log')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Start-Process npm -RedirectStandardOutput Microsoft.PowerShell.Management.log',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process npm -RedirectStandardError ./err.log')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process npm -RedirectStandardInput ./input.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cd ../bridge && npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cd ./relayer; npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cd -Path:./relayer; npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cd -LiteralPath:./relayer; npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=chdir -Path:../bridge && npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=chdir -LiteralPath:../bridge && npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pushd ../bridge && npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location ../bridge; npm test')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location -LiteralPath ./relayer; npm test'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location -LiteralPath:./relayer; npm test'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location -Path=./relayer; npm test')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location -Path Microsoft.PowerShell.Management.psd1'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Push-Location -Path ../bridge; npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Push-Location -Path:../bridge; npm test')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Push-Location -LiteralPath:../bridge; npm test'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cd /tmp && npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check 2>&1 > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check | Tee-Object report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check | Tee-Object -FilePath report.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vitest run >> ./logs/vitest.log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cargo test > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=go test ./... > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest tests > report.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make test < input.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm --prefix ../bridge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm --prefix=../bridge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm --userconfig org.ergoplatform.sdk.json test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=yarn --cwd ../bridge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pnpm --dir ../bridge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make -C ../bridge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git -C ../bridge status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git -C org.ergoplatform.sdk.json status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git --git-dir ../repo/.git status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git --output org.ergoplatform.sdk.txt log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git bundle create ../repo.bundle HEAD')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git bundle create repo.bundle HEAD')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git clone https://example.invalid/repo.git ../clone')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git worktree add ../wt HEAD')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git apply ../patch.diff')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git am ../patch.mbox')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git checkout-index --prefix ../out/ -a')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=cargo test --manifest-path ../bridge/Cargo.toml'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest --rootdir ../bridge tests')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=go test ./... -C ../bridge')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install --requirement ../requirements.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install --requirement org.ergoplatform.sdk.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install -c ../constraints.txt -r requirements.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install --find-links ../wheels bridge-package')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install --editable ../bridge-package')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=uv pip install -r ../requirements.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=poetry -C ../bridge install')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=poetry --directory ../bridge run pytest')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=uv --project ../bridge run pytest')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tox -c ../tox.ini')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tox --workdir ../tox-work run')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=nox --noxfile ../noxfile.py')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=nox --envdir ../nox-envs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ruff check --config ../ruff.toml src')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=black --config ../pyproject.toml src')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mypy --config-file ../mypy.ini src')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=coverage run --rcfile ../coveragerc -m pytest')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=flake8 --append-config ../flake8-extra.ini src')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pyright --project ../pyrightconfig.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=virtualenv ../venv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python -m venv ../venv')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql -f ../schema.sql postgres://localhost/db')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql --file ../schema.sql postgres://localhost/db')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql --file org.ergoplatform.sdk.sql postgres://localhost/db'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pg_dump --file ../dump.sql bridge')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pg_dump --file org.ergoplatform.sdk.dump bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pg_restore --dbname bridge ../dump.sql')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mysql --defaults-extra-file ../my.cnf bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mysql < ../schema.sql')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mysql < Microsoft.PowerShell.Management.sql')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql < org.ergoplatform.sdk.sql')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sqlite3 < bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mysqldump --result-file ../dump.sql bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mariadb --defaults-file ../my.cnf bridge')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sqlcmd -i ../migration.sql -o report.txt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=liquibase --defaultsFile ../liquibase.properties update')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=liquibase --changeLogFile ../changelog.xml update')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=flyway -configFiles=../flyway.conf migrate')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=flyway -configFiles=org.ergoplatform.sdk.conf migrate')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=flyway -locations=filesystem:../migrations migrate')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=prisma migrate deploy --schema ../schema.prisma')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=drizzle-kit generate --config ../drizzle.config.ts')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm --userconfig ../.npmrc test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=yarn --cache-folder ../yarn-cache test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pnpm --store-dir ../pnpm-store test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cargo test --target-dir ../target')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest --basetemp ../pytest-tmp tests')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=go test -coverprofile ../coverage.out ./...')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc -L ../native src/lib.rs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc -L../native src/lib.rs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc -Clink-arg=../linker-script.ld src/lib.rs')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --out-dir ../out src/lib.rs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --out-dir org.ergoplatform.sdk.json src/lib.rs')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --extern foo=../target/libfoo.rlib src/lib.rs')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --extern foo=org.ergoplatform.sdk.rlib src/lib.rs'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --sysroot ../sysroot src/lib.rs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --remap-path-prefix ../src=src src/lib.rs')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustdoc --output ../doc src/lib.rs')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-pack build --out-dir ../pkg')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-pack build --target-dir ../target')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-pack build --manifest-path ../Cargo.toml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-pack build ../wasm-avl')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-bindgen ../pkg/app_bg.wasm --out-dir pkg')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-bindgen pkg/app_bg.wasm --out-dir ../pkg')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-bindgen org.ergoplatform.sdk.wasm --out-dir pkg')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustup toolchain link bridge ../rust-toolchain')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mvn -s ../settings.xml test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mvn -s org.ergoplatform.sdk.xml test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mvn --settings ../settings.xml test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mvn -gs ../global-settings.xml test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mvn -Dmaven.repo.local=../m2 test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gradle --project-cache-dir ../gradle-cache test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gradle --init-script ../init.gradle test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gradle -g ../gradle-home test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sbt -Dsbt.global.base=../sbt-global test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sbt -Dsbt.boot.directory=../sbt-boot test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sbt -sbt-dir ../sbt-dir test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mill --home ../mill-home bridge.test')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=cs launch --repository ../ivy-cache org:name:version'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -cp ../classes org.example.Main')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -cp org.ergoplatform.sdk.jar Main')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -classpath ../classes org.example.Main')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java --class-path ../classes org.example.Main')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -Djava.io.tmpdir=../tmp org.example.Main')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -Duser.home=../home org.example.Main')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -Djava.library.path=../lib Main')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -Xbootclasspath/a:../classes Main')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java --patch-module app=../patches Main')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=javac -cp ../classes src/Main.java')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=javac -d ../classes src/Main.java')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=javac --source-path ../src src/Main.java')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jar --file ../app.jar -C classes .')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jar -cf ../app.jar -C classes .')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jarsigner -keystore ../keystore.jks app.jar alias')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jarsigner -signedjar ../signed.jar app.jar alias')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=keytool -keystore ../keystore.jks -list')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ant -buildfile ../build.xml test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=scala -classpath ../classes Main')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=scalac -d ../classes src/Main.scala')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kotlinc -classpath ../classes -d ../out src/Main.kt')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=composer install --working-dir ../app')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=composer --working-dir ../app install')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=composer install --no-cache --cache-dir ../composer-cache')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=phpunit --configuration ../phpunit.xml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=phpunit --configuration org.ergoplatform.sdk.xml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=phpunit --bootstrap ../vendor/autoload.php')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=phpunit --log-junit ../junit.xml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bundle config set path ../vendor/bundle')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bundle exec rake -f ../Rakefile test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bundler exec rspec --require ../spec_helper.rb')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rake -f ../Rakefile test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rspec --require ../spec_helper.rb')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rspec --out ../rspec.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gem install --install-dir ../gems rake')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=solc --base-path ../contracts ErgoBridge.sol')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=solc --include-path ../node_modules ErgoBridge.sol')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=solc --allow-paths ../contracts,../lib ErgoBridge.sol')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=solc --output-dir ../build ErgoBridge.sol')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hardhat --config ../hardhat.config.ts test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test --root ../foundry')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test --root org.ergoplatform.sdk.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge --root ../foundry test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test --config-path ../foundry.toml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test --cache-path ../forge-cache')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=forge test --remappings @openzeppelin/=../lib/openzeppelin-contracts',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test --remappings @openzeppelin/=org.ergoplatform.sdk.json'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=anvil --load-state ../anvil-state.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=anvil --dump-state ../anvil-state.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet test --settings ../test.runsettings')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet test --settings org.ergoplatform.sdk.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet test --results-directory ../TestResults')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet restore --configfile ../NuGet.config')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet restore --packages ../packages')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet build -o ../out')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet publish --output ../publish')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet test --logger trx;LogFileName=../test-results.trx'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=nuget restore solution.sln -ConfigFile ../NuGet.config'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=nuget restore solution.sln -PackagesDirectory ../packages'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=msbuild solution.sln /p:OutputPath=../bin')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=msbuild solution.sln /p:BaseIntermediateOutputPath=../obj'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=msbuild solution.sln /restore /p:RestoreConfigFile=../NuGet.config',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=msbuild solution.sln /bl:../build.binlog')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vitest --config ../vitest.config.ts')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tsc --project ../tsconfig.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git -C../bridge status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make -C../bridge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make -f ../Makefile test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make -f../Makefile test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make --file ../Makefile test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make --makefile=../Makefile test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake -S ../src -B build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake -B ../build -S .')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake --toolchain ../toolchain.cmake -S . -B build')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake --toolchain org.ergoplatform.sdk.cmake -S . -B build'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake --build ../build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake -DCMAKE_TOOLCHAIN_FILE=../toolchain.cmake -S . -B build')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ninja -C ../build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ninja -f ../build.ninja')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ninja -f org.ergoplatform.sdk.ninja')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=meson setup ../build . --cross-file ../cross.ini')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=meson setup build ../src --native-file ../native.ini')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=meson setup build . --cross-file org.ergoplatform.sdk.ini'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bazel --output_user_root=../bazel version')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bazel --bazelrc=../bazelrc version')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bazel --disk_cache=../cache build @repo//app:target')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcc -I ../include -L ../lib src.c')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcc -I org.ergoplatform.sdk.h src.c')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clang -isystem ../sysroot/include src.c')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clang++ --sysroot ../sysroot src.cc')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=g++ -ffile-prefix-map=../src=src src.cc')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ccache --set-config=cache_dir=../ccache')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --proto_path ../proto --descriptor_set_out ../out.pb bridge.proto')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --proto_path org.ergoplatform.sdk.proto bridge.proto')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --descriptor_set_out org.ergoplatform.sdk.pb bridge.proto')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc -I../proto --js_out=../generated bridge.proto')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --plugin=protoc-gen-ts=../bin/protoc-gen-ts bridge.proto'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buf --config ../buf.yaml generate')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buf --config org.ergoplatform.sdk.yaml generate')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buf generate --path ../proto')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buf generate --template ../buf.gen.yaml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=openapi-generator-cli generate -i ../openapi.yaml -o ../generated')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=openapi-generator generate --input-spec ../openapi.yaml --output ../generated'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=swagger-codegen generate -i ../openapi.yaml -o ../generated')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=graphql-codegen --config ../codegen.yml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=redocly build-docs ../openapi.yaml --output ../docs/index.html')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=spectral lint -r ../rules.yaml ../openapi.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=typedoc --options ../typedoc.json --out ../docs src')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=act -W ../.github/workflows/ci.yml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=act -W org.ergoplatform.sdk.yml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=act --workflows ../.github/workflows/ci.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=act --env-file ../ci.env')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=circleci local execute --config ../.circleci/config.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gitlab-runner exec docker test --docker-volumes ../cache:/cache')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=gitlab-runner exec docker test --docker-volumes org.ergoplatform.sdk.yml:/cache'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buildkite-agent pipeline upload ../pipeline.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=drone exec --trusted --pipeline ../.drone.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dagger call -m ../dagger test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=task --taskfile ../Taskfile.yml ci')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=task --taskfile org.ergoplatform.sdk.yml ci')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=just --justfile ../justfile ci')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pandoc ../report.md -o ../report.pdf')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pandoc --output org.ergoplatform.sdk.html report.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=quarto render ../report.qmd --output-dir ../out')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jupyter nbconvert --execute ../notebook.ipynb --output-dir ../reports')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=papermill ../input.ipynb ../output.ipynb')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mkdocs build -f ../mkdocs.yml -d ../site')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sphinx-build -c ../docs -b html ../docs ../_build/html')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=asciidoctor -o ../out.html ../manual.adoc')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mdbook build ../book --dest-dir ../book-out')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hugo --source ../site --destination ../public')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docusaurus build --out-dir ../build')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=trivy fs --config ../trivy.yaml --output ../trivy.sarif .'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=trivy fs --config org.ergoplatform.sdk.yaml --output org.ergoplatform.sdk.sarif .'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=grype dir:. -o sarif --file ../grype.sarif')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=syft dir:. -o cyclonedx-json=../sbom.json')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=osv-scanner --lockfile ../package-lock.json --format sarif --output ../osv.sarif',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=semgrep scan --config ../semgrep.yml --sarif --output ../semgrep.sarif',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=snyk test --file ../package.json --json-file-output ../snyk.json',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=dependency-check --project bridge --scan ../relayer --out ../depcheck'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cyclonedx-npm --output-file ../bom.json')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=gitleaks detect --config ../gitleaks.toml --report-path ../gitleaks.json',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=trufflehog filesystem ../repo --json > ../trufflehog.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=detect-secrets scan ../repo > ../secrets.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hadolint -c ../hadolint.yaml Dockerfile')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=shellcheck -f json -o all ../scripts/*.sh')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=checkov --config-file ../checkov.yaml -d . --output-file-path ../checkov.sarif',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kics scan -p ../infra -o ../kics')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terrascan scan -d ../infra -o ../terrascan')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tfsec --config-file ../tfsec.yml ../infra')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=k6 run --out json=../k6.json ../load.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=k6 run --summary-export org.ergoplatform.sdk.json script.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=k6 run --out json=org.ergoplatform.sdk.json script.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=k6 archive -O ../bundle.tar ./script.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=artillery run --output ../artillery.json ../scenario.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=artillery report --output ../report.html ../artillery.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=autocannon -o ../autocannon.json http://localhost:3000')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wrk -s ../script.lua http://localhost:3000')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hey -o csv -output ../hey.csv http://localhost:3000')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vegeta attack -targets ../targets.txt -output ../results.bin')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vegeta report -input ../results.bin')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ab -g ../ab.tsv http://localhost:3000/')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=siege -f ../urls.txt')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=locust -f ../locustfile.py --csv ../locust')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jmeter -n -t ../plan.jmx -l ../results.jtl -e -o ../report')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=oha --output ../oha.json http://localhost:3000')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bombardier -o json http://localhost:3000 > ../bombardier.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tsc -p ../tsconfig.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=go test -o ../testbin ./...')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --outputFile ../jest-report.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --coverageDirectory ../coverage')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --resolver ../resolver.js')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --snapshotResolver ../snapshot-resolver.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --testResultsProcessor ../processor.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --globalTeardown ../teardown.js')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vite build --outDir ../dist')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=mocha --reporter-options output=../mocha.json test/**/*.js'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --setupFiles ../setup.js')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jest --setupFilesAfterEnv ../setup-after-env.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vitest --globalSetup ../setup.ts')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vitest --globalTeardown ../teardown.ts')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mocha --require ../hooks/register.js test/**/*.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mocha -r ../hooks/register.js test/**/*.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mocha -r../hooks/register.js test/**/*.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=eslint --rulesdir ../rules src')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=eslint --ignore-path ../.eslintignore src')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=eslint --resolve-plugins-relative-to ../tools src')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest --confcutdir ../tests tests')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest --cov-config ../.coveragerc tests')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest --cov-report html:../coverage tests')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest --cov-report=html:../coverage tests')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=playwright test --config ../playwright.config.ts')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cypress run --config-file ../cypress.config.ts')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm --workspace ../pkg test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm --workspace=../pkg test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pnpm --workspace-root --filter ../pkg test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pnpm --filter=../pkg test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker compose -f ../docker-compose.yml config')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker compose -f../docker-compose.yml config')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker-compose -f ../docker-compose.yml config')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker compose --file ../docker-compose.yml config'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker compose --env-file ../local.env config')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker build -f ../Dockerfile .')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker run --env-file ../local.env image')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker logs bridge-node > report.log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker logs bridge-node 2>&1 > report.log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker inspect bridge-node > ./inspect.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl --kubeconfig ../kubeconfig get pods')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl --kubeconfig=../kubeconfig get pods')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm upgrade bridge chart --values ../values.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm upgrade bridge chart --values=../values.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm template bridge chart -f ../values.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform plan -var-file ../prod.tfvars')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform plan -var-file=../prod.tfvars')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform plan -var-file org.ergoplatform.sdk.tfvars')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform apply -chdir=../infra')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform init -backend-config=../backend.hcl')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform init -from-module=../modules/bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform apply ../plan.tfplan')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform show ../plan.tfplan')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform state pull > ../terraform.tfstate')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tofu plan -var-file=../prod.tfvars')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tofu init -backend-config=../backend.hcl')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terragrunt plan --terragrunt-config ../terragrunt.hcl')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terragrunt plan --terragrunt-working-dir ../infra')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pulumi preview --cwd ../infra')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pulumi stack export --file ../stack.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=packer build -var-file=../vars.pkrvars.hcl template.pkr.hcl')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=packer init ../template.pkr.hcl')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ansible-playbook -i ../inventory.ini playbook.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ansible-playbook -i../inventory.ini playbook.yml')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=ansible-playbook --inventory ../inventory.ini playbook.yml'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker compose --project-directory ../bridge config'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker build --build-context docs=../docs .')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker build --secret id=npmrc,src=../.npmrc .'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker build --secret id=cfg,src=org.ergoplatform.sdk.yaml .'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker run -v ../data:/data image')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker run --volume ../data:/data image')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker run -v org.ergoplatform.sdk.json:/data image')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker run --mount type=bind,source=../data,target=/data image'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker --tlscacert ../ca.pem ps')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker --tlscert ../cert.pem ps')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker --tlskey ../key.pem ps')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=podman --authfile ../auth.json push image')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=skopeo copy --src-authfile ../auth.json docker://src docker://dst'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=skopeo copy --dest-authfile ../auth.json docker://src docker://dst'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buildah --authfile ../auth.json bud .')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=crane auth login --keychain ../keychain.json registry.example')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=oras login --registry-config ../oras/config.json registry.example')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=nerdctl --hosts-dir ../certs pull image')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm template bridge ../chart')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm template bridge "../chart"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm package ../chart')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl kustomize ../overlays/prod')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl apply -k ../overlays/prod')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl apply -k../overlays/prod')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl logs bridge-pod > report.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl get pods -o yaml > ./pods.yaml')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl create configmap bridge --from-file=../config'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl create configmap bridge --from-file=org.ergoplatform.sdk.yaml'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl create configmap bridge --from-file=app=../config'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl create configmap bridge --from-file=app=org.ergoplatform.sdk.yaml'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl --certificate-authority ../ca.crt get pods')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl --client-certificate=../client.crt get pods'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl --client-key ../client.key get pods')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm upgrade bridge chart --set-file config=../config.yaml')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm upgrade bridge chart --set-file=config=../config.yaml'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kustomize build ../overlays/prod')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kustomize build \"../overlays/prod\"')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kustomize edit add resource ../deployment.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm --registry-config ../registry.json pull chart')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm --repository-config=../repositories.yaml repo list'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm --repository-cache ../cache repo update')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm verify --keyring ../pubring.gpg chart.tgz')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ansible-playbook ../playbook.yml')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=KUBECONFIG=../kubeconfig kubectl get pods')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=HELM_REGISTRY_CONFIG=../registry.json helm pull chart'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=HELM_REPOSITORY_CONFIG=../repositories.yaml helm repo list'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=HELM_REPOSITORY_CACHE=../cache helm repo update')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=AWS_SHARED_CREDENTIALS_FILE=../aws/credentials aws sts get-caller-identity',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=AWS_CONFIG_FILE=../aws/config aws s3 ls')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=GOOGLE_APPLICATION_CREDENTIALS=../gcp/key.json gcloud auth list',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CLOUDSDK_CONFIG=../gcloud gcloud config list')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=AZURE_CONFIG_DIR=../azure az account show')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SSH_AUTH_SOCK=../agent.sock ssh evidence-host')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=VAULT_CACERT=../ca.pem vault status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=VAULT_CAPATH=../certs vault status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=VAULT_CLIENT_CERT=../client.pem vault login')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=VAULT_CLIENT_KEY=../client.key vault login')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=OP_CONFIG_DIR=../op op account list')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GNUPGHOME=../gnupg gpg --list-keys')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GIT_DIR=../repo/.git git status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GIT_WORK_TREE=../repo git status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GIT_INDEX_FILE=../index git status')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GIT_OBJECT_DIRECTORY=../objects git status')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GIT_SSH_COMMAND=ssh -F ../ssh_config git fetch')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SOPS_AGE_KEY_FILE=../agekey.txt sops -d secrets.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SSL_CERT_FILE=../ca.pem curl https://example.invalid')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SSL_CERT_DIR=../certs curl https://example.invalid')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DOCKER_CONFIG=../docker docker login registry.example')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DOCKER_CERT_PATH=../certs docker --tls ps')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=REGISTRY_AUTH_FILE=../auth.json podman push image')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=CONTAINERS_AUTH_FILE=../auth.json skopeo copy src dest'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BUILDAH_AUTHFILE=../auth.json buildah push image')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ORAS_CONFIG=../oras oras login registry.example')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CMAKE_TOOLCHAIN_FILE=../toolchain.cmake cmake -S . -B build')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CMAKE_PREFIX_PATH=../deps cmake -S . -B build')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CC=../bin/clang cmake -S . -B build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CXX=../bin/clang++ cmake -S . -B build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CFLAGS=-I ../include make')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CXXFLAGS=-isystem ../sysroot/include make')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=LDFLAGS=-L ../lib make')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CCACHE_DIR=../ccache make')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=MESON_BUILD_ROOT=../build meson compile')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BAZEL_OUTPUT_USER_ROOT=../bazel bazel version')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PROTOC_INCLUDE=../proto protoc --version')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BUF_CONFIG=../buf.yaml buf generate')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BUF_CACHE_DIR=../buf-cache buf generate')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=OPENAPI_GENERATOR_TEMPLATE_DIR=../templates openapi-generator-cli version'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GRAPHQL_CODEGEN_CONFIG=../codegen.yml graphql-codegen')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=REDOCLY_CONFIG=../redocly.yaml redocly lint openapi.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SPECTRAL_RULESET=../rules.yaml spectral lint openapi.yaml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TYPEDOC_OPTIONS=../typedoc.json typedoc src')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ACT_WORKFLOWS=../.github/workflows act')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CIRCLECI_CONFIG=../.circleci/config.yml circleci local execute')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GITLAB_RUNNER_CONFIG=../gitlab-runner.toml gitlab-runner verify')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BUILDKITE_PIPELINE=../pipeline.yml buildkite-agent pipeline upload')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DRONE_YAML=../.drone.yml drone exec')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DAGGER_MODULE=../dagger dagger call test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TASKFILE=../Taskfile.yml task ci')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JUSTFILE=../justfile just ci')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PANDOC_DEFAULTS=../pandoc.yaml pandoc --version')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=QUARTO_PROJECT_DIR=../docs quarto render')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JUPYTER_CONFIG_DIR=../jupyter jupyter nbconvert --version')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=MKDOCS_CONFIG=../mkdocs.yml mkdocs build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SPHINX_BUILD_DIR=../_build sphinx-build docs build')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=HUGO_DESTINATION=../public hugo')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=MDBOOK_DEST_DIR=../book-out mdbook build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DOCUSAURUS_OUT_DIR=../build docusaurus build')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TRIVY_CONFIG=../trivy.yaml trivy fs .')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GRYPE_DB_CACHE_DIR=../grype-db grype dir:.')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SYFT_CONFIG=../syft.yaml syft dir:.')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SEMGREP_CONFIG=../semgrep.yml semgrep scan')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SNYK_POLICY_PATH=../.snyk snyk test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DEPENDENCY_CHECK_DATA=../depcheck-data dependency-check')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GITLEAKS_CONFIG=../gitleaks.toml gitleaks detect')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DETECT_SECRETS_BASELINE=../.secrets.baseline detect-secrets scan')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=HADOLINT_CONFIG=../hadolint.yaml hadolint Dockerfile')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SHELLCHECKRC=../shellcheckrc shellcheck scripts/check.sh')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CHECKOV_CONFIG_FILE=../checkov.yaml checkov -d .')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=KICS_OUTPUT_PATH=../kics kics scan -p infra')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TFSEC_CONFIG_FILE=../tfsec.yml tfsec .')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=K6_SUMMARY_EXPORT=../summary.json k6 run script.js')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ARTILLERY_OUTPUT=../artillery.json artillery run scenario.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=VEGETA_TARGETS=../targets.txt vegeta attack')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=LOCUST_LOCUSTFILE=../locustfile.py locust --headless')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JMETER_RESULT_FILE=../results.jtl jmeter -n')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=HEY_OUTPUT=../hey.csv hey http://localhost:3000')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=OHA_OUTPUT=../oha.json oha http://localhost:3000')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BOMBARDIER_OUTPUT=../bombardier.json bombardier http://localhost:3000')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TF_CLI_CONFIG_FILE=../terraformrc terraform plan')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TF_DATA_DIR=../tfdata terraform plan')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TOFU_PLUGIN_CACHE_DIR=../tofu-plugins tofu init')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TERRAGRUNT_CONFIG=../terragrunt.hcl terragrunt plan')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TERRAGRUNT_DOWNLOAD=../tg-cache terragrunt plan')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PACKER_CONFIG=../packer.hcl packer build template.pkr.hcl')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PACKER_PLUGIN_PATH=../packer-plugins packer init')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PULUMI_HOME=../pulumi pulumi preview')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PULUMI_CONFIG_PASSPHRASE_FILE=../passphrase pulumi preview')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ANSIBLE_CONFIG=../ansible.cfg ansible-playbook site.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ANSIBLE_ROLES_PATH=../roles ansible-playbook site.yml')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=NPM_CONFIG_USERCONFIG=../.npmrc npm test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=YARN_CACHE_FOLDER=../yarn-cache yarn test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PNPM_STORE_DIR=../pnpm-store pnpm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CARGO_TARGET_DIR=../target cargo test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CARGO_CONFIG=../cargo-config.toml cargo test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CARGO_CONFIG=org.ergoplatform.sdk.toml cargo test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CARGO_CONFIG_PATH=../cargo/config.toml cargo test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=RUSTFLAGS=-L ../native cargo test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=RUSTFLAGS=-Clink-arg=../linker-script.ld cargo test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=RUSTDOCFLAGS=--html-in-header ../header.html cargo doc')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=RUSTC_WRAPPER=../sccache cargo build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=RUSTUP_HOME=../rustup rustup show')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PYTHONPATH=../bridge pytest tests')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PYTHONHOME=../python python -V')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PIP_CONFIG_FILE=../pip.conf pip install bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PIP_FIND_LINKS=../wheels pip install bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PIP_CACHE_DIR=../pip-cache pip install bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PIPENV_PIPFILE=../Pipfile pipenv sync')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=POETRY_HOME=../poetry poetry install')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=UV_CACHE_DIR=../uv-cache uv run pytest')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TOX_WORK_DIR=../tox-work tox run')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=VIRTUAL_ENV=../venv python -V')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DATABASE_URL=sqlite:../bridge-state.sqlite prisma migrate deploy')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=FLYWAY_CONFIG_FILES=../flyway.conf flyway migrate')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=LIQUIBASE_DEFAULTS_FILE=../liquibase.properties liquibase update')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PRISMA_SCHEMA=../schema.prisma prisma migrate deploy')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PGSERVICEFILE=../pg_service.conf psql service=bridge')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PGPASSFILE=../.pgpass psql bridge')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=MYSQL_HOME=../mysql mysql bridge')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SQLCMDINI=../sqlcmd.ini sqlcmd -S localhost')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=COURSIER_CACHE=../coursier cs fetch org:name:version'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GRADLE_USER_HOME=../gradle gradle test')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=MAVEN_OPTS=-Dmaven.repo.local=../m2 mvn test'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=SBT_OPTS=-Dsbt.global.base=../sbt sbt test'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=NUGET_PACKAGES=../packages dotnet restore')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DOTNET_CLI_HOME=../dotnet dotnet test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DOTNET_ROOT_X64=../dotnet dotnet test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=MSBUILDSDKSPATH=../sdk msbuild solution.sln')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=../tmp java Main')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JDK_JAVA_OPTIONS=-Duser.home=../home java Main')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CLASSPATH=../classes java Main')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JAVA_HOME=../jdk java -version')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ANT_OPTS=-Djava.io.tmpdir=../tmp ant test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=COMPOSER_HOME=../composer composer install')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=COMPOSER_CACHE_DIR=../composer-cache composer install')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=COMPOSER_AUTH=../auth.json composer install')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BUNDLE_GEMFILE=../Gemfile bundle exec rake')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=BUNDLE_PATH=../vendor/bundle bundle exec rake')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GEM_HOME=../gems bundle exec rake')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PHP_INI_SCAN_DIR=../php.d php -m')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=FOUNDRY_ROOT=../foundry forge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=FOUNDRY_CONFIG=../foundry.toml forge test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=FOUNDRY_CACHE_PATH=../forge-cache forge test')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=FOUNDRY_OUT=../out forge build')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DAPP_ROOT=../dapp forge test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=SOLC_PATH=../bin/solc solc --version')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=HARDHAT_CONFIG=../hardhat.config.ts hardhat test')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=NODE_OPTIONS=--require=../hooks/register.js npm test'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=NODE_OPTIONS=--require ../hooks/register.js npm test'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=NODE_OPTIONS=--require org.ergoplatform.sdk.js npm test'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=NODE_PATH=../node_modules npm test')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JEST_CONFIG=../jest.config.js jest')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=ESLINT_CONFIG_PATH=../eslint.config.js eslint .'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=MOCHA_OPTIONS=../mocha.opts mocha')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=JEST_JUNIT_OUTPUT=../junit.xml jest')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=VITEST_CONFIG=../vitest.config.ts vitest run')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$env:NPM_CONFIG_USERCONFIG="../.npmrc"; npm test'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=set NPM_CONFIG_USERCONFIG=..\\.npmrc && npm test'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=set NODE_OPTIONS=--require ..\\hooks\\register.js && npm test'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat%20.%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat%20%22completed-release-note.md%22')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%60cat%20completed-release-note.md%60')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat%20completed-release-note.md%7Csha256sum')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=sha256sum%20.%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=sha256sum%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=sha256sum%20%22completed-release-note.md%22')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=tar%20-cf%20evidence.tar%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=zip%20evidence.zip%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=scp%20completed-release-note.md%20evidence-host%3Aevidence%2F')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=curl%20--upload-file%20completed-release-note.md%20https%3A%2F%2Fexample.invalid%2Fevidence')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=python%20scripts%2Fcollect-evidence.py%20completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=python%20-m%20json.tool%20completed-release-note.json')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=python%20-c%20%22print%281%29%22%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=node%20-e%20readFile%20completed-release-note.json')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=node%20-e%20%22console.log%281%29%22%20completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=perl%20-ne%20print%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=pwsh%20-File%20scripts%2Fcollect-evidence.ps1%20completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=git%20show%20HEAD%3Acompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=jq%20.%20completed-release-note.json')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=gh%20release%20upload%20test%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=rg%20PASS%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=rg%20%22Release%20gate%20PASS%22%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=xxd%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=hexdump%20-C%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Get-FileHash%20.%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Get-FileHash%20-Path%3D.%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=sha256sum%20--check%3D.%2Fcompleted-release-note.sha256')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Get-Content%20.%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Get-Content%20%22completed-release-note.md%22')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=echo%20PASS%20%3Ecompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=printf%20PASS%20%3E%3E%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat%3Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat%3Ecompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=read%20line%20%3Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=source%20completed-release-note.sh')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%3Ecompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=2%3Ecompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%3Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%3A%3Ecompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=exec%203%3Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=bash%20-c%20%22%3Ccompleted-release-note.md%22')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat%20%3C%3CEOF%20%3Ecompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=while%20read%20line%3B%20do%20echo%20%24line%3B%20done%20%3C%20completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=npm%20run%20check%26%26cat%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=forfiles%20%2Fm%20completed-release-note.md%20%2Fc%20%22cmd%20%2Fc%20type%20%40file%22')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=xargs%20-a%20completed-release-note.md%20echo')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=gc%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=sls%20PASS%20completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=gci%20..%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Remove-Item%20-Force%20..%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=protoc%20--proto_path%20..%2Fproto')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat+completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=gc+completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Get-Content+-LiteralPath+completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=cat+org.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=java+-cp+org.ergoplatform.sdk+Main')).toBe(false);
  });

  it('recognizes command-substituted local root evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(pwd -P)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=`pwd -P`/completed-release-note.md')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(git rev-parse --show-toplevel)/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=`git rev-parse --show-toplevel`/completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(git rev-parse --git-dir)/config')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=`git rev-parse --git-dir`/config')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(git -C . rev-parse --show-toplevel)/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=`git -C . rev-parse --show-toplevel`/completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(cd . && pwd)/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(cd .. && pwd)completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(cd ./scripts && pwd)/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=`cd . && pwd`completed-release-note.md')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=%24%28git%20rev-parse%20--show-toplevel%29%2Fcompleted-release-note.md'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd%20-P%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%60git%20rev-parse%20--show-toplevel%60%2Fcompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%60pwd%20-P%60%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28cd%20.%20%26%26%20pwd%29%2Fcompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%24%28cd%20..%20%26%26%20pwd%29completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%60cd%20.%20%26%26%20pwd%60completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28pwd+-P%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28git+rev-parse+--show-toplevel%29%2Fcompleted-release-note.md')).toBe(
      true,
    );
  });

  it('recognizes script-directory command-substituted evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(dirname "$0")/completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference("sourceTarget=$(dirname '${BASH_SOURCE[0]}')/completed-release-note.md"),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(cd "$(dirname "$0")" && pwd)/completed-release-note.md',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=`dirname "$0"`/completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%24%28dirname%20%22%240%22%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%60dirname%20%22%240%22%60%2Fcompleted-release-note.md')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=&dollar;&lpar;dirname &dollar;&lcub;BASH_SOURCE&lsqb;0&rsqb;&rcub;&rpar;/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=&dollar;&lpar;dirname &dollar;&lcub;BASH_SOURCE&lbrack;0&rbrack;&rcub;&rpar;/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=&dollar;&lpar;dirname &quot;&dollar;0&quot;&rpar;/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=&dollar;&lpar;dirname &apos;&dollar;0&apos;&rpar;/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=&dollar;&lpar;dirname &apos;&dollar;&lcub;BASH_SOURCE&lsqb;0&rsqb;&rcub;&apos;&rpar;/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=&dollar;&lpar;dirname &OpenCurlyQuote;&dollar;0&CloseCurlyQuote;&rpar;/completed-release-note.md',
      ),
    ).toBe(true);
  });

  it('recognizes PowerShell script-directory evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Split-Path -Parent $PSCommandPath)/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Split-Path -LiteralPath $PSCommandPath -Parent)/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Split-Path $MyInvocation.MyCommand.Path -Parent)/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$([System.IO.Path]::GetDirectoryName($PSCommandPath))/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%24%28Split-Path%20-Parent%20%24PSCommandPath%29%2Fcompleted-release-note.md',
      ),
    ).toBe(true);
  });

  it('recognizes PowerShell pipeline-resolved local evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Resolve-Path . | Select-Object -ExpandProperty Path)/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(Resolve-Path . | % Path)/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=$(Get-Item . | Select-Object -ExpandProperty FullName)/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$((Resolve-Path .).Path)/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$((Get-Item .).FullName)/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%24%28Resolve-Path%20.%20%7C%20Select-Object%20-ExpandProperty%20Path%29%2Fcompleted-release-note.md',
      ),
    ).toBe(true);
  });

  it('recognizes raw backslash local-only evidence target separators', () => {
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$HOME\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=${HOME}\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=$env:USERPROFILE\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Env:USERPROFILE\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=%USERPROFILE%\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=!USERPROFILE!\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=process.env.USERPROFILE\\bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.tmpdir()\\completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=path.resolve('.')\\bridge-state.sqlite")).toBe(true);
  });

  it('recognizes PowerShell provider-qualified local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=HKCU:/Software/Bridge/completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Registry::HKEY_CURRENT_USER/Software/Bridge/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Microsoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE\\Software\\Bridge\\completed-release-note.md',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=FileSystem::z:/bridge-state.sqlite')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Microsoft.PowerShell.Core\\FileSystem::z:/bridge-state.sqlite',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=HKCU%3A%5CSoftware%5CBridge%5Ccompleted-release-note.md')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=Registry%3A%3AHKEY_CURRENT_USER%5CSoftware%5CBridge%5Ccompleted-release-note.md',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=FileSystem%3A%3Az%3A%2Fbridge-state.sqlite')).toBe(true);
  });

  it('recognizes language runtime local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=process.cwd()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=process.cwd()completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=process.env.USERPROFILE/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=__dirname/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=__filename')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=import.meta.dirname/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path(__file__).resolve().parent/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.dirname(__FILE__)/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=__DIR__/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=__dir__/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.of("completed-release-note.md").toAbsolutePath()')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Paths.get("completed-release-note.md").toRealPath()'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new File("completed-release-note.md").getAbsolutePath()'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::fs::canonicalize("completed-release-note.md")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::fs::canonicalize("completed-release-note.md")release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::fs::read_to_string("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs::read("./completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::fs::write("../bridge-state.sqlite", "ok")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::fs::File::open("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File::open("completed-release-note.md")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=OpenOptions::new().read(true).open("completed-release-note.md")'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PathBuf::from("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::path::Path::new("completed-release-note.md")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Command::new("cat").arg("completed-release-note.md").output()'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=std::process::Command::new("cat").args(["completed-release-note.md"]).status()',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=std::process::Command::new("npm").arg("test").current_dir("../bridge").status()',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=let mut cmd = Command::new("npm"); cmd.current_dir("../bridge").status();',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=std%3A%3Afs%3A%3Aread_to_string%28%22completed-release-note.md%22%29')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/std::fs::read_to_string("completed-release-note.md")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=filepath.Abs("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=filepath.Abs("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.ReadFile("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.Open("./completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.Create("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.MkdirAll("./evidence", 0o755)')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ioutil.ReadFile("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=io/ioutil.ReadFile("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=filepath.Join(".", "completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=path/filepath.Join("..", "bridge-state.sqlite")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=filepath.Clean("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=exec.Command("cat", "completed-release-note.md")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=cmd := exec.Command("npm", "test"); cmd.Dir = "../bridge"; cmd.Run()',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os%2EReadFile%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/os.ReadFile("completed-release-note.md")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.homedir()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.homedir()completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.home()/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.home()completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pathlib.Path.home()/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pathlib.Path.home()completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=process.cwd%28%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=process.cwd%28%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=process.env.USERPROFILE%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=__dirname%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Path%28__file__%29.resolve%28%29.parent%2Fcompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=__DIR__%2Fcompleted-release-note.md')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=Path.of%28%22completed-release-note.md%22%29.toAbsolutePath%28%29',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=pathlib.Path.home%28%29%2Fcompleted-release-note.md')).toBe(true);
  });

  it('recognizes language runtime environment accessor local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=process.env['USERPROFILE']/bridge-state.sqlite")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=process.env["HOME"]/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=process.env["HOME"]release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=Deno.env.get('HOME')/bridge-state.sqlite")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.env.get("HOME")release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.env.get("HOME")release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.env.USERPROFILE/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.environ["HOME"]/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.environ["HOME"]release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.getenv('TMPDIR')/completed-release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.environ.get("HOME")release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=ENV['HOME']/bridge-state.sqlite")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ENV["HOME"]release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.getenv("USERPROFILE")/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.getenv("USERPROFILE")release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.getProperty("user.home")/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.getProperty("user.home")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.getProperty("user.dir")/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.environ.get("HOME")/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=std::env::var('HOME')/bridge-state.sqlite")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::env::var("HOME")release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=env::var_os("TMPDIR")\\completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=env::var_os("TMPDIR")release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=process.env%5B%27USERPROFILE%27%5D%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=process.env%5B%22HOME%22%5Drelease-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Deno.env.get%28%27HOME%27%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Deno.env.get%28%22HOME%22%29release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.getenv%28%27TMPDIR%27%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=System.getenv%28%22USERPROFILE%22%29%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=System.getenv%28%22USERPROFILE%22%29release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.environ.get%28%22HOME%22%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.environ.get%28%22HOME%22%29release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=std%3A%3Aenv%3A%3Avar%28%27HOME%27%29%2Fbridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=std%3A%3Aenv%3A%3Avar%28%22HOME%22%29release-note.md')).toBe(true);
  });

  it('recognizes language runtime directory helper local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=require('os').homedir()/bridge-state.sqlite")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=require("node:os").tmpdir()/bridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=require("node:os").tmpdir()completed-release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.tmpdir()/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.tmpdir()completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tempfile.gettempdir()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tempfile.gettempdir()completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.cwd()/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.cwd()completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pathlib.Path.cwd()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pathlib.Path.cwd()completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::env::temp_dir()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::env::temp_dir()completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=env::current_dir()/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=env::current_dir()completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dirs::home_dir()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dirs::home_dir()completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=std::env::current_dir().unwrap().join("completed-release-note.md")',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::env::current_dir()?.join("bridge-state.sqlite")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::env::temp_dir().join("bridge-state.sqlite")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=dirs::home_dir().expect("home").join("bridge-state.sqlite")'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=std%3A%3Aenv%3A%3Atemp_dir%28%29.join%28%22bridge-state.sqlite%22%29',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('artifact://release/std::env::temp_dir().join("bridge-state.sqlite")'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.GetTempPath()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.GetTempPath()completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=[IO.Path]::GetTempPath()/bridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=[System.IO.Path]::GetTempPath()/bridge-state.sqlite'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Directory.GetCurrentDirectory()/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=[System.IO.Directory]::GetCurrentDirectory()/completed-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=[System.IO.Directory]::GetCurrentDirectory()completed-release-note.md',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Environment.CurrentDirectory/bridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=[System.Environment]::CurrentDirectory/bridge-state.sqlite'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=AppContext.BaseDirectory/completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=[System.AppContext]::BaseDirectory/completed-release-note.md',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=require%28%27os%27%29.homedir%28%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.tmpdir%28%29%5Ccompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.tmpdir%28%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%5BIO.Path%5D%3A%3AGetTempPath%28%29%5Cbridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%5BSystem.IO.Directory%5D%3A%3AGetCurrentDirectory%28%29%5Ccompleted-release-note.md',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%5BSystem.IO.Directory%5D%3A%3AGetCurrentDirectory%28%29completed-release-note.md',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=std%3A%3Aenv%3A%3Atemp_dir%28%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=std%3A%3Aenv%3A%3Atemp_dir%28%29completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=Directory.GetCurrentDirectory%28%29%5Ccompleted-release-note.md')).toBe(
      true,
    );
  });

  it('recognizes additional runtime directory helper local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.UserHomeDir()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.UserCacheDir()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.UserConfigDir()/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.TempDir()/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.Getwd()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.getcwd()/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.getcwdb()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Dir.home/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Dir.pwd/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Dir.tmpdir/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=File.expand_path('~')/bridge-state.sqlite")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=getcwd()/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=getcwd()completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sys_get_temp_dir()/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sys_get_temp_dir()completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=get_current_dir_name()/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=get_current_dir_name()completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Path.GetTempPath()/bridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Directory.GetCurrentDirectory()/bridge-state.sqlite'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Directory.GetFiles("..")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.Environment.GetFolderPath("UserProfile")/bridge-state.sqlite'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.Environment.CurrentDirectory/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.AppContext.BaseDirectory/completed-release-note.md'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.UserHomeDir%28%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.UserCacheDir%28%29%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.getcwd%28%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Dir.tmpdir%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=getcwd%28%29%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=getcwd%28%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=sys_get_temp_dir%28%29%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=System.IO.Path.GetTempPath%28%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=System.AppContext.BaseDirectory%5Ccompleted-release-note.md')).toBe(true);
  });

  it('recognizes runtime path expansion helper local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=path.resolve('.')/bridge-state.sqlite")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=path.resolve('.')completed-release-note.md")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=path.resolve("completed-release-note.md")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=path.resolve("completed-release-note.md")release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=path.join('.', 'completed-release-note.md')")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=path.join('.', 'completed-release-note.md')release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=path.normalize('./completed-release-note.md')release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.path.abspath('.')/bridge-state.sqlite")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.path.abspath('.')completed-release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.path.realpath('./completed-release-note.md')")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.path.realpath('.')completed-release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.path.realpath("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.path.expanduser('~')/bridge-state.sqlite")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.path.expanduser('~')completed-release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=os.path.expandvars('$HOME')/completed-release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=Path('~').expanduser()/bridge-state.sqlite")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=pathlib.Path('.').resolve()/completed-release-note.md")).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path("completed-release-note.md").resolve()release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=pathlib.Path("completed-release-note.md").absolute()release-note.md',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=File.expand_path('.')/bridge-state.sqlite")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=File.expand_path('completed-release-note.md')")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=File.expand_path('completed-release-note.md')release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=realpath('./completed-release-note.md')")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=realpath('completed-release-note.md')")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=realpath('completed-release-note.md')release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.readFileSync("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.readFileSync("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.readFileSync("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.promises.readFile("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.promises.readFile("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.promises.readFile("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=require("fs").promises.readdir("../bridge-state.sqlite")'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.rmSync("./completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.copyFileSync("./completed-release-note.md", "evidence.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.mkdirSync("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.realpathSync("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.watch("../bridge-state.sqlite")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=require("node:fs").createReadStream("../bridge-state.sqlite")'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=require("node:fs").createReadStream("completed-release-note.md")release-note.md',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=readFileSync("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=readFile("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=writeFileSync("./completed-release-note.md", "ok")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=createReadStream("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=statSync("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=readdirSync(".")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rmSync("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=execFileSync("cat", ["completed-release-note.md"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=spawnSync("cat", ["completed-release-note.md"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=spawn("cat", ["./completed-release-note.md"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=child_process.spawn("cat", ["../bridge-state.sqlite"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=execa("cat", ["completed-release-note.md"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=spawnSync("cat", ["completed-release-note.md"])release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=spawnSync("npm", ["test"], { cwd: "../bridge" })')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=execa("npm", ["test"], { cwd: "./relayer" })')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=const opts = { cwd: "../bridge" }; spawnSync("npm", ["test"], opts);',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.spawn(["cat", "completed-release-note.md"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.spawnSync(["cat", "./completed-release-note.md"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.spawn(["npm", "test"], { cwd: "./relayer" })')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.readTextFile("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.readTextFile("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.readTextFile("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.writeTextFile("./completed-release-note.md", "ok")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.remove("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.realPath("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.watchFs("../bridge-state.sqlite")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new Deno.Command("cat", { args: ["completed-release-note.md"] })'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=new Deno.Command("cat", { args: ["../bridge-state.sqlite"] }).outputSync()',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new Deno.Command("npm", { args: ["test"], cwd: "../bridge" })'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.file("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.file("bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.file("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.write("./completed-release-note.md", "ok")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.write("completed-release-note.md", "ok")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Bun.write("completed-release-note.md", "ok")release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new URL("./completed-release-note.md", import.meta.url)'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new URL("completed-release-note.md", import.meta.url)'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::ifstream("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::ofstream("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::fstream("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ifstream("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::filesystem::path("completed-release-note.md")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::filesystem::canonical("completed-release-note.md")'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=std::filesystem::exists("../bridge-state.sqlite")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=boost::filesystem::path("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=QFile("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=QFileInfo("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=freopen("completed-release-note.md", "r", stdin)')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fopen_s(&file, "completed-release-note.md", "r")')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=std%3A%3Aifstream%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/std::ifstream("completed-release-note.md")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=stat("completed-release-note.md", &st)')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=lstat("../bridge-state.sqlite", &st)')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=access("completed-release-note.md", R_OK)')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=chmod("completed-release-note.md", 0600)')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=opendir("./evidence")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=readlink("completed-release-note.md", buf, sizeof(buf))')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=truncate("../bridge-state.sqlite", 0)')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=CreateFileA("completed-release-note.md", GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL)',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=CreateFileW(L"completed-release-note.md", GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL)',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DeleteFileA("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GetFileAttributesW(L"completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=_wstat(L"completed-release-note.md", &st)')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=_tfopen(TEXT("completed-release-note.md"), "r")')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=CreateFileW%28L%22completed-release-note.md%22%2C%20GENERIC_READ%29')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/stat("completed-release-note.md", &st)')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Paths.get(".", "bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Paths.get("bridge-state.sqlite")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Paths.get("completed-release-note.md")release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=java.nio.file.Paths.get("..", "completed-release-note.md")'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.of("./completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.of("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path.of("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new File(".", "bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new File("bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new File("bridge-state.sqlite")release-note.md')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new java.io.File("..", "completed-release-note.md")'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new FileReader("completed-release-note.md")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new java.io.FileInputStream("./completed-release-note.md")'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new RandomAccessFile("../bridge-state.sqlite", "r")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File("completed-release-note.md").readText()')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java.io.File("../bridge-state.sqlite").exists()')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Files.readString("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=scala.io.Source.fromFile("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kotlin.io.path.Path("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path("completed-release-note.md").readText()')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new ProcessBuilder("cat", "completed-release-note.md").start()'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Runtime.getRuntime().exec(new String[]{"cat", "completed-release-note.md"})',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=new%20FileReader%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new Scanner("completed-release-note.md")')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/new FileReader("completed-release-note.md")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new FileInfo(".\\bridge-state.sqlite")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new System.IO.DirectoryInfo("..")/completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.File.ReadAllText("./completed-release-note.md")'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.File.ReadAllText("completed-release-note.md")'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.File.ReadAllText("completed-release-note.md")release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.File.Create("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.File.Create("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.File.Create("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.CreateText(".\\bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Directory.Move("..", "evidence")')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Directory.EnumerateFileSystemEntries(".")'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Directory.EnumerateFileSystemEntries(".")release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.OpenRead(".\\bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=[IO.Path]::GetFullPath('.')/bridge-state.sqlite")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=[IO.Path]::GetFullPath('.')completed-release-note.md")).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=[IO.Path]::GetFullPath('completed-release-note.md')")).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        "sourceTarget=[System.IO.Path]::GetFullPath('.\\completed-release-note.md')",
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference("sourceTarget=[IO.Path]::Combine('.', 'bridge-state.sqlite')"),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference("sourceTarget=[IO.Path]::Combine('.', 'bridge-state.sqlite')release-note.md"),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=[System.IO.Path]::Join("..", "completed-release-note.md")',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Path.Combine(".", "bridge-state.sqlite")'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Path.GetFullPath(".")/bridge-state.sqlite'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=System.IO.Path.GetFullPath(".")completed-release-note.md'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=[System.Diagnostics.Process]::Start("cat", "completed-release-note.md")'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Process.Start("cat", "./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=new ProcessStartInfo("cat", "../bridge-state.sqlite")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=new ProcessStartInfo("npm", "test") { WorkingDirectory = "../bridge" }'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=ProcessStartInfo psi = new("npm", "test"); psi.WorkingDirectory = "../bridge";',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=open("./completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=open("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=open("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=open('completed-release-note.md').read()")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=open("completed-release-note.md").read()release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path("./completed-release-note.md").read_text()')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path("completed-release-note.md").read_text()')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path("completed-release-note.md").read_text()release-note.md'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pathlib.Path("../bridge-state.sqlite").write_text("ok")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=shutil.copyfile("./completed-release-note.md", "evidence.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=os.remove("../bridge-state.sqlite")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=subprocess.run(["cat", "completed-release-note.md"])')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=subprocess.check_output(["cat", "./completed-release-note.md"])'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=subprocess.Popen(["cat", "../bridge-state.sqlite"])')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=subprocess.run(("cat", "completed-release-note.md"))')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=subprocess.run(["npm", "test"], cwd="../bridge")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=open(r'completed-release-note.md').read()")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=open(b'completed-release-note.md').read()")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference("sourceTarget=File.open('completed-release-note.md').read")).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.open("completed-release-note.md").read()release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.read(%q{completed-release-note.md})')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.open(%q{completed-release-note.md}).read')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.read("./completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.read("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.read("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File.write("../bridge-state.sqlite", "ok")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Dir.entries(".")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file_get_contents("./completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file_get_contents("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file_get_contents("completed-release-note.md")release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file_put_contents("../bridge-state.sqlite", "ok")')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=perl -e "open my $fh, q{<}, q{completed-release-note.md}"'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=perl -e "open(my $fh, q{<}, q{completed-release-note.md})"'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=io.open("completed-release-note.md", "r")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=lfs.attributes("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=readLines("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=normalizePath("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file.path(".", "completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=read("completed-release-note.md", String)')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=joinpath(".", "completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fileread("completed-release-note.md")')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=exist("completed-release-note.md", "file")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fullfile(".", "completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Path::Tiny::path("completed-release-note.md")->slurp')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=File::Slurp::read_file("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=IO::File->new("completed-release-note.md")')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.readFileSync(`completed-release-note.md`)')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.readFileSync(String.raw`completed-release-note.md`)'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=scandir(".")')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=path.resolve%28%27.%27%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=path.resolve%28%27.%27%29completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=path.resolve%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.path.expanduser%28%27~%27%29%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=os.path.expandvars%28%27%24HOME%27%29%2Fcompleted-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%5BIO.Path%5D%3A%3AGetFullPath%28%27.%27%29%5Cbridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=%5BIO.Path%5D%3A%3AGetFullPath%28%27.%27%29completed-release-note.md')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant('sourceTarget=%5BIO.Path%5D%3A%3AGetFullPath%28%27completed-release-note.md%27%29'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%5BIO.Path%5D%3A%3ACombine%28%27.%27%2C%20%27bridge-state.sqlite%27%29')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=%5BSystem.IO.Path%5D%3A%3AJoin%28%22..%22%2C%20%22completed-release-note.md%22%29',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=System.IO.Path.Combine%28%22.%22%2C%20%22bridge-state.sqlite%22%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=System.IO.Path.GetFullPath%28%22.%22%29%5Cbridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=System.IO.Path.GetFullPath%28%22.%22%29completed-release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=Paths.get%28%22.%22%2C%20%22bridge-state.sqlite%22%29')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=java.nio.file.Paths.get%28%22..%22%2C%20%22completed-release-note.md%22%29',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Path.of%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=new%20File%28%22.%22%2C%20%22bridge-state.sqlite%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=new%20FileInfo%28%22.%5Cbridge-state.sqlite%22%29')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=System.IO.File.ReadAllText%28%22.%2Fcompleted-release-note.md%22%29',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=System.IO.File.ReadAllText%28%22completed-release-note.md%22%29release-note.md'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=System.IO.File.Create%28%22.%2Fcompleted-release-note.md%22%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=Directory.Move%28%22..%22%2C%20%22evidence%22%29')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=System.IO.Directory.EnumerateFileSystemEntries%28%22.%22%29'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=open%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=open%28r%27completed-release-note.md%27%29.read%28%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=open%28b%27completed-release-note.md%27%29.read%28%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=open%28%27completed-release-note.md%27%29.read%28%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Path%28%22.%2Fcompleted-release-note.md%22%29.read_text%28%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=Path%28r%27completed-release-note.md%27%29.read_text%28%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=fs.readFileSync%28%60completed-release-note.md%60%29')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=fs.readFileSync%28String.raw%60completed-release-note.md%60%29'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=File.read%28%25q%7Bcompleted-release-note.md%7D%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=File.open%28%25q%7Bcompleted-release-note.md%7D%29.read')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=File.open%28%27completed-release-note.md%27%29.read')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=File.read%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file_get_contents%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=io.open%28%22completed-release-note.md%22%2C%20%22r%22%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=readLines%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fullfile%28%22.%22%2C%20%22completed-release-note.md%22%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=Path%3A%3ATiny%3A%3Apath%28%22completed-release-note.md%22%29-%3Eslurp')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=fs.readFileSync%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fs.readFileSync%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fs.readFileSync%28%22completed-release-note.md%22%29release-note.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=readFileSync%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=createReadStream%28%22completed-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=statSync%28%22..%2Fbridge-state.sqlite%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=spawnSync%28%22cat%22%2C%20%5B%22completed-release-note.md%22%5D%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=fs.promises.readFile%28%22.%2Fcompleted-release-note.md%22%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=fs.promises.readFile%28%22completed-release-note.md%22%29')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=fs.promises.readFile%28%22completed-release-note.md%22%29release-note.md'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=require%28%22fs%22%29.promises.readdir%28%22..%2Fbridge-state.sqlite%22%29'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fs.rmSync%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fs.mkdirSync%28%22..%2Fbridge-state.sqlite%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fs.realpathSync%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=require%28%22node%3Afs%22%29.createReadStream%28%22..%2Fbridge-state.sqlite%22%29'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Deno.readTextFile%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Deno.readTextFile%28%22completed-release-note.md%22%29')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=Deno.readTextFile%28%22completed-release-note.md%22%29release-note.md'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Deno.remove%28%22..%2Fbridge-state.sqlite%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Deno.realPath%28%22.%2Fcompleted-release-note.md%22%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=Bun.write%28%22.%2Fcompleted-release-note.md%22%2C%20%22ok%22%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=Bun.write%28%22completed-release-note.md%22%2C%20%22ok%22%29')).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=Bun.write%28%22completed-release-note.md%22%2C%20%22ok%22%29release-note.md',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=new%20URL%28%22.%2Fcompleted-release-note.md%22%2C%20import.meta.url%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=new%20URL%28%22completed-release-note.md%22%2C%20import.meta.url%29')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=realpath%28%27.%2Fcompleted-release-note.md%27%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=realpath%28%27completed-release-note.md%27%29')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=realpath%28%27completed-release-note.md%27%29release-note.md')).toBe(
      true,
    );
  });

  it('recognizes quoted JSON-style local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);
    const tmpTarget = ['', 'tmp', 'bridge-state.sqlite'].join('/');
    const fileUrlTarget = ['file:', '', '', 'tmp', 'bridge-state.sqlite'].join('/');

    expect(hasEvidenceLocalOnlyInspectionReference(`"sourceTarget":"${tmpTarget}"`)).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference(`'sourceTarget':'${fileUrlTarget}'`)).toBe(true);
    expect(hasLocalOnlyVariant('"sourceTarget":"%2Ftmp%2Fbridge-state.sqlite"')).toBe(true);
    expect(hasLocalOnlyVariant('"sourceTarget":"%24HOME%2Fbridge-state.sqlite"')).toBe(true);
  });

  it('does not treat artifact URI schemes as local-only references', () => {
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://evidence/completed-check.log')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/fs.readFileSync("completed-release-note.md")release-note.md')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/readFileSync("completed-release-note.md")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/execSync("cat completed-release-note.md")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/spawnSync("cat", ["completed-release-note.md"])')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=artifact://release/execFileSync("cat", ["completed-release-note.md"])'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('artifact://release/file_get_contents("completed-release-note.md")release-note.md'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/io.open("completed-release-note.md")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/readLines("completed-release-note.md")')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('artifact://release/Path::Tiny::path("completed-release-note.md")->slurp'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('artifact://release/$(pwd | Select -Expand Path)release-note.md'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/$(cd . && pwd)release-note.md')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('artifact://release/process.env["HOME"]release-note.md'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('artifact://release/$env:USERPROFILErelease-note.md'),
    ).toBe(false);
  });

  it('recognizes local-only target bindings embedded inside artifact URI references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasLocalOnlyVariant('artifact://release-gate/sourceTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/sourceTarget:%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget:/tmp/release-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/validatedTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/validatedTarget:%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/validationTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('validatedTarget:/tmp/release-gate-ci.log')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('validationTarget:/tmp/release-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/reportTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/transcriptTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate/artifactTargets.prebroadcast=%2Ftmp%2Fprebroadcast.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate/targetBindings.approvals=%2Ftmp%2Fapprovals.json')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate/artifactTargets%2Fprebroadcast%3D%2Ftmp%2Fprebroadcast.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate/targetBindings%2Fapprovals%3D%2Ftmp%2Fapprovals.json')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant('artifact://release-gate/artifactTargets%2Fprebroadcast%2Flive%3D%2Ftmp%2Fprebroadcast.md'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('artifact://release-gate/targetBindings%2Fapprovals%2Foutput%3D%2Ftmp%2Fapprovals.json'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/targetBindings[approvals]=%2Ftmp%2Fapprovals.json')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate/targetBindings%5B%20approvals%20%5D=%2Ftmp%2Fapprovals.json')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant('artifact://release-gate/targetBindings%5B%20%22approvals%22%20%5D=%2Ftmp%2Fapprovals.json'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('artifact://release-gate/targetBindings%5Bapprovals%5D%5Boutput%5D%3D%2Ftmp%2Fapproval.json'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/artifactTargets[prebroadcast]=%2Ftmp%2Fprebroadcast.md')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate/artifactTargets%5Bprebroadcast%5D=%2Ftmp%2Fprebroadcast.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets.prebroadcast:/tmp/prebroadcast.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings.approvals:/tmp/approvals.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets . prebroadcast:/tmp/prebroadcast.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings . approvals:/tmp/approvals.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets/prebroadcast:/tmp/prebroadcast.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings/approvals:/tmp/approvals.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets / prebroadcast:/tmp/prebroadcast.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings / approvals:/tmp/approvals.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets/prebroadcast/live:/tmp/prebroadcast.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings/approvals/output:/tmp/approvals.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets[prebroadcast]:/tmp/prebroadcast.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings[approvals]:/tmp/approvals.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets [prebroadcast]:/tmp/prebroadcast.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings [approvals]:/tmp/approvals.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings[approvals][output]:/tmp/approvals.json')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifactTargets[ prebroadcast ]:/tmp/prebroadcast.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings[ "approvals" ]:/tmp/approvals.json')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings:{approvals:/tmp/approvals.json}')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings:{"approvals":"/tmp/approvals.json"}')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings:{approvals:file:runtime/bridge-state.sqlite}')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{summary:https://example.invalid/summary.json,approvals:/tmp/approvals.json}',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{summary:https://example.invalid/summary.json,approvals:file:runtime/bridge-state.sqlite}',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings:{approvals:{path:/tmp/approvals.json}}')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('targetBindings:{approvals:{path:file:runtime/bridge-state.sqlite}}'),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{approvals:https://example.invalid/approvals.json} targetBindings:{approvals:/tmp/approvals.json}',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{summary:https://example.invalid/summary.json} targetBindings:{approvals:file:runtime/bridge-state.sqlite}',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{summary:https://example.invalid/summary.json} targetBindings:{approvals:{path:file:runtime/bridge-state.sqlite}}',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{approvals:[https://example.invalid/approvals.json,/tmp/approvals.json]}',
      ),
    ).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{approvals:[https://example.invalid/approvals.json,file:runtime/bridge-state.sqlite]}',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('artifact://gate/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Flive-preflight.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate&quest;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate&num;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate&Tab;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate&NewLine;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant(
        'artifact://release-gate&quest;sourceTarget&equals;file&colon;runtime&sol;bridge-state.sqlite',
      ),
    ).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate;sourceTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate,sourceTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate&colon;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate&commat;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate%3AtargetBindings.approvals%3D%2Ftmp%2Fapproval.json')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate%40targetBindings[approvals]%3D%2Ftmp%2Fapproval.json')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate&lpar;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate%5BsourceTarget%3D%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate&lcub;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate%7DsourceTarget%3D%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate|sourceTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate%7CsourceTarget%3D%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate&lt;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate&gt;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate%29sourceTarget%3D%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate%5DsourceTarget%3D%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate%3DsourceTarget%3D%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/"sourceTarget"=%2Ftmp%2Frelease-gate-ci.log')).toBe(true);
    expect(
      hasLocalOnlyVariant('artifact://release-gate/&quot;sourceTarget&quot;&equals;%2Ftmp%2Frelease-gate-ci.log'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('artifact://release-gate/%22sourceTarget%22%3D%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('artifact://release-gate/targetBindings%3A%7Bapprovals%3A%2Ftmp%2Fapprovals.json%7D')).toBe(
      true,
    );
    expect(
      hasLocalOnlyVariant(
        'artifact://release-gate/targetBindings%3A%7Bsummary%3Ahttps%3A%2F%2Fexample.invalid%2Fsummary.json%2Capprovals%3A%2Ftmp%2Fapprovals.json%7D',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'artifact://release-gate/targetBindings%3A%7Bapprovals%3A%7Bpath%3Afile%3Aruntime%2Fbridge-state.sqlite%7D%7D',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'artifact://release-gate/targetBindings%3A%7Bapprovals%3Ahttps%3A%2F%2Fexample.invalid%2Fapprovals.json%7D%20targetBindings%3A%7Bapprovals%3A%2Ftmp%2Fapprovals.json%7D',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'artifact://release-gate/targetBindings%3A%7Bapprovals%3A%5Bhttps%3A%2F%2Fexample.invalid%2Fapprovals.json%2C%2Ftmp%2Fapprovals.json%5D%7D',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('artifact://release-gate&semi;sourceTarget&equals;%2Ftmp%2Frelease-gate-ci.log'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=artifact://release-gate/sourceTarget=%2Ftmp%2Frelease-gate-ci.log')).toBe(
      true,
    );
  });

  it('recognizes local-only evidence text after artifact URI references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(
      hasLocalOnlyVariant('artifact://approvals/operator-approval.json completed target copied from %2Ftmp%2Fapproval.json'),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=artifact://approvals/check-output.log command PASS copied from //operator-share/check.log'),
    ).toBe(true);
  });

  it('does not treat release evidence binding prose as local-only shell commands', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings/approvals:https://example.invalid/approvals.json')).toBe(
      false,
    );
    expect(
      hasLocalOnlyVariant(
        'artifact://release-gate/targetBindings%2Fapprovals%2Foutput%3Dhttps%3A%2F%2Fexample.invalid%2Fapprovals.json',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings . approvals:https://example.invalid/approvals.json')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings / approvals:https://example.invalid/approvals.json')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings [approvals]:https://example.invalid/approvals.json')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('targetBindings:{approvals:https://example.invalid/approvals.json}')).toBe(
      false,
    );
    expect(
      hasLocalOnlyVariant(
        'artifact://release-gate/targetBindings%3A%7Bapprovals%3Ahttps%3A%2F%2Fexample.invalid%2Fapprovals.json%7D',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{summary:https://example.invalid/summary.json,approvals:https://example.invalid/approvals.json}',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{summary:https://example.invalid/summary.json} targetBindings:{approvals:https://example.invalid/approvals.json}',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('targetBindings:{approvals:{path:https://example.invalid/approvals.json}}'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{approvals:[https://example.invalid/approvals.json,https://example.invalid/other.json]}',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{approvals:[artifact://release-gate/approvals.json,artifact://release-gate/other.json]}',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'targetBindings:{approvals:[ipfs://bafyabc/approvals.json,s3://bridge-evidence/other.json]}',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm install bridge bitnami/nginx')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm install bridge "bitnami/nginx"')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=helm repo add bridge https://example.invalid/charts')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cosign sign --key awskms://alias/bridge image')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=aws s3 ls s3://bridge-evidence')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcloud config configurations activate bridge')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vault kv get secret/bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=op read op://bridge/password')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sops -d https://example.invalid/secrets.yaml')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker pull registry.example/bridge/image:tag')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=oras pull ghcr.io/org/artifact:tag')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git status')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git log --oneline')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git clone https://example.invalid/repo.git')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git -C org.ergoplatform.sdk status')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git --git-dir org.ergoplatform.sdk status')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=$(cd org.ergoplatform.sdk && pwd)completed-release-note.md'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=`cd Microsoft.PowerShell.Management && pwd`completed-release-note.md'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fs.readFileSync("org.ergoplatform.sdk")')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=open("org.ergoplatform.sdk")')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=path.resolve("Microsoft.PowerShell.Management")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java.nio.file.Paths.get("org.ergoplatform.sdk")')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=node -e "x > org.ergoplatform.sdk"')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=python -c "x > Microsoft.PowerShell.Management"')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git --work-tree Microsoft.PowerShell.Management status')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git --output org.ergoplatform.sdk log')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=git --reference org.ergoplatform.sdk clone https://example.invalid/repo.git clone'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git worktree list')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git apply --check')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=git am --abort')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=GIT_AUTHOR_NAME=A. Shannon git log')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check 2>&1')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm run check | Tee-Object')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CARGO_TARGET_DIR=org.ergoplatform.sdk cargo test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=CARGO_CONFIG=org.ergoplatform.sdk cargo test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=RUSTFLAGS=-L org.ergoplatform.sdk cargo test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=NODE_OPTIONS=--require org.ergoplatform.sdk npm test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=PYTHONPATH=org.ergoplatform.sdk pytest tests')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=TF_DATA_DIR=Microsoft.PowerShell.Management terraform plan')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DOCKER_CONFIG=Microsoft.PowerShell.Management docker ps')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=KUBECONFIG=org.ergoplatform.sdk kubectl get pods')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl -k org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl create configmap bridge --from-file=org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl create configmap bridge --from-file=app=org.ergoplatform.sdk'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker build --secret id=cfg,src=org.ergoplatform.sdk .')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker run -v org.ergoplatform.sdk:/cache image')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npm --prefix org.ergoplatform.sdk run check')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest --rootdir org.ergoplatform.sdk tests')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=poetry -C org.ergoplatform.sdk install')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=yarn --cwd Microsoft.PowerShell.Management test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=make -C org.ergoplatform.sdk test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cp Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dir Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ls Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rm Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sort Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tee Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=type Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=where Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat System.Management.Automation')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=type Microsoft.Extensions.Configuration')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dir org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ls com.fasterxml.jackson.databind')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cp io.grpc.Channel')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=where java.base')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sort scala.collection.immutable')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat --input=Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cp --target=System.Management.Automation')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dir /path:org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=& Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=& System.Management.Automation')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=. org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=source com.fasterxml.jackson.databind')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Tee-Object Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tee-object Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Csv')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=epal')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=epcsv')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipal')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipcsv')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Csv -InputObject Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Csv -NoTypeInformation Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Clixml -Depth 2 Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Clixml Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Alias -Name Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Alias -Scope Global Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Module Pester')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipmo Pester')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Module Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Module -Name Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PSSession $session')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ipsn $session')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-PSSession $session')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=epsn $session')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PSSession $session -Module Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-PSSession $session -Module Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Import-PSSession $session -OutputModule Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PowerShellDataFile')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PowerShellDataFile -SkipLimitCheck')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-PowerShellDataFile -SkipLimitCheck 1.2.3.4'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Import-PowerShellDataFile -SkipLimitCheck Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-ModuleManifest')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-ModuleManifest -ModuleVersion 1.2.3.4')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-ModuleManifest -RootModule Bridge.Module')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-ModuleManifest -Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-ModuleManifest')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-ModuleManifest -ModuleVersion 1.2.3.4')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-ModuleManifest -Guid Microsoft.PowerShell.Management'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-ModuleManifest')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-ModuleManifest -ModuleVersion 1.2.3.4')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-ModuleManifest -Path System.Management.Automation')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Publish-Module -Name Bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Publish-Module -Name Bridge -RequiredVersion 1.2.3')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Publish-Module -Path org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Publish-Script -Name Invoke-Build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Publish-Script -Name Invoke-Build -RequiredVersion 1.2.3')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command npm')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcm npm')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command -Name Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command -Name:Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command -Module Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Command -Module:Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcm -Module Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-Item')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-Xml -Content "<root/>" -XPath /root')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-Xml -Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-Xml -LiteralPath org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Help about_Remote')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=help about_Remote')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=man about_Remote')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Help -Name Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Help -Name:Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=help Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=man Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Format-Hex')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fhx')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Content Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gc Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-FileHash Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-String Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sls Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Content -Value ok Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Content -Value ok Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Clear-Content Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clc Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Out-File -InputObject ok Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Format-Hex Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fhx Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Write-Output Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Clear-Item Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Clear-ItemProperty Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Copy-Item Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Copy-ItemProperty Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Convert-Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Acl Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-ChildItem Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gci Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Item Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gi Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-ItemProperty Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-ItemPropertyValue Microsoft.PowerShell.Management'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gpv Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Compress-Archive Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Expand-Archive Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-Item Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ii Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Move-Item Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mi Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-Item Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ni Microsoft.PowerShell.Management')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=New-PSDrive -Name X -PSProvider FileSystem -Root Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Remove-Item Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ri Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Rename-Item Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Resolve-Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Acl Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-ItemProperty Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Item Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sc Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Unblock-File Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-AuthenticodeSignature Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-AuthenticodeSignature -Certificate Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-PfxCertificate Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Certificate -Type CERT Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Import-Certificate -CertStoreLocation Cert:\\CurrentUser\\My Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-PfxCertificate -Password x Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Import-PfxCertificate -CertStoreLocation Cert:\\CurrentUser\\My Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Counter -Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-Counter -Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-WebRequest https://example.invalid/evidence')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Invoke-WebRequest https://example.invalid/evidence -OutFile Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=iwr https://example.invalid/evidence')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-RestMethod https://example.invalid/api')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Invoke-RestMethod https://example.invalid/api -InFile org.ergoplatform.sdk',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=irm https://example.invalid/api')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-BitsTransfer -Source https://example.invalid/file')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-BitsTransfer -Source com.fasterxml.jackson.databind')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Help -Module Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Module -Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Package -DestinationPath org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Module -Name Pester')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Package -Name Bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Save-Script -Name Invoke-Build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-LocalizedData')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Import-LocalizedData -BindingVariable Bridge')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Import-LocalizedData -BindingVariable Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-FormatData')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-FormatData -PowerShellVersion 7.4.1')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Add-Type -AssemblyName System.Xml')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertFrom-String -Delimiter ,')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Console')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Console -Force')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Export-Console -Force Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSSessionConfigurationFile')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=npssc')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSRoleCapabilityFile')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSSessionConfigurationFile -Path Microsoft.PowerShell.Management'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSRoleCapabilityFile -Path System.Management.Automation')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Register-PSSessionConfiguration -Name Bridge')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Register-PSSessionConfiguration -Path org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Register-PSSessionConfiguration -AssemblyName System.Management.Automation')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-PSSessionConfiguration -Name Bridge')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Set-PSSessionConfiguration -StartupScript System.Management.Automation',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-PSSessionConfiguration -AssemblyName System.Management.Automation')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Remove-TypeData -TypeName System.String')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-TraceSource -Name bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Test-PSSessionConfigurationFile')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Trace-Command -Name ParameterBinding -Expression { npm test }')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Trace-Command -Name ParameterBinding -Expression { npm test } -FilePath Microsoft.PowerShell.Management',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-Help -Module Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-Help -SourcePath org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-FormatData')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-FormatData -PowerShellVersion 7.4.1')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-TypeData')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Update-TypeData -TypeName System.String')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertTo-Json')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Format-Table Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Select-Object Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=select Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Where-Object Name -eq bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=? Name -eq bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=group Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=measure -Line')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=compare expected actual')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ft Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=fl Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=foreach Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=% Name')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Out-String')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Out-String > org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Write-Host PASS')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ConvertTo-Json > Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cat > org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -LogName Application')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -LogName Microsoft.PowerShell')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -ProviderName Microsoft.PowerShell')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -ListProvider Microsoft.PowerShell')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -FilterHashtable @{LogName="Application"}'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -FilterHashtable @{Path=Microsoft.PowerShell.Management}'),
    ).toBe(false);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=Get-WinEvent -FilterHashtable &commat;&lcub;Path&equals;Microsoft.PowerShell.Management&rcub;',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-WinEvent -FilterHashtable @{File=org.ergoplatform.sdk}'),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Get-WinEvent -FilterHashtable @{ProviderName="Microsoft.PowerShell"}',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Counter -Counter \\Processor(_Total)\\% Processor Time')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Counter -Counter Microsoft.PowerShell')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Get-Counter -ListSet Microsoft.PowerShell')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Invoke-Command -ScriptBlock { npm test }')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Invoke-Command -ComputerName Microsoft.PowerShell.Management -ScriptBlock { npm test }',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=icm -ScriptBlock { npm test }')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=icm -ComputerName Microsoft.PowerShell.Management -ScriptBlock { npm test }',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Job -ScriptBlock { npm test }')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Start-Job -Name Microsoft.PowerShell.Management -ScriptBlock { npm test }',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sajb -ScriptBlock { npm test }')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=sajb -Name Microsoft.PowerShell.Management -ScriptBlock { npm test }',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Start-ThreadJob -Name Microsoft.PowerShell.Management -ScriptBlock { npm test }',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process -FilePath npm')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process -FilePath notepad.exe')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process npm -ArgumentList test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process npm -PassThru')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Process npm -WorkingDirectory Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=saps -FilePath npm')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=start -FilePath npm')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=saps Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=start Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=where npm')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ren')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rd')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=md')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cli')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=New-PSDrive')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ndr')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clp')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gpv')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cpp')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mp')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rnp')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=robocopy')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=regedit')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=reg import org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=regedit /s Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=makecab')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=certreq -ping')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wevtutil qe Application')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=schtasks /query /tn BridgeEvidence')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=schtasks /create /xml org.ergoplatform.sdk /tn BridgeEvidence'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=for /l %i in (1,1,3) do echo %i')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=for %f in (org.ergoplatform.sdk) do type %f')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=msiexec')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=regsvr32')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bitsadmin /list')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dism /Online /Get-Packages')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pnputil /enum-drivers')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=takeown')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cscript /nologo')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wscript')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mshta')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=installutil')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=control')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wmic process list')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=logman start bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=driverquery /v /fo csv')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=systeminfo /fo csv')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tasklist /fi imagename eq node.exe')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tasklist > Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=netsh interface show interface')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=& npm run check')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location -StackName bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Push-Location -StackName bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cd -StackName bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=chdir -StackName bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cd Microsoft.PowerShell.Management')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location -Path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Push-Location org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Set-Location -LiteralPath')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript -IncludeInvocationHeader Microsoft.PowerShell.Management'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Start-Transcript -UseMinimalHeader 1.2.3.4')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Stop-Transcript')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vitest run')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cargo test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=go test ./...')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pytest tests')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docker logs bridge-node')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kubectl logs bridge-pod')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mvn test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gradle test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sbt test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cs fetch org:name:version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mvn -s org.ergoplatform.sdk test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gradle --init-script org.ergoplatform.sdk test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sbt -Dsbt.global.base=org.ergoplatform.sdk test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install bridge-package')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install --requirement org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pip install --prefix org.ergoplatform.sdk bridge')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=uv pip install -r org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=poetry install')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=uv run pytest')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tox -e py311')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tox -p 3.11')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=nox -s tests')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ruff check src')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=black --check src')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mypy src')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=coverage run -m pytest')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=virtualenv --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql -c ../schema.sql')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql --file org.ergoplatform.sdk postgres://localhost/db'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pg_dump bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pg_dump --file Microsoft.PowerShell.Management bridge')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mysql bridge')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mysql --defaults-extra-file org.ergoplatform.sdk bridge')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mysql < Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=psql < org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sqlite3 < org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=liquibase status')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=liquibase --changeLogFile org.ergoplatform.sdk update')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=flyway migrate')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=flyway -configFiles=org.ergoplatform.sdk migrate')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=prisma migrate deploy')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=prisma migrate deploy --schema org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=DATABASE_URL=postgres://localhost/db psql bridge')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform plan')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform -chdir=org.ergoplatform.sdk plan')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform -config=org.ergoplatform.sdk plan')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform -var-file Microsoft.PowerShell.Management plan')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform apply tfplan')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terraform state list')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tofu plan')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terragrunt plan')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=terragrunt --terragrunt-config org.ergoplatform.sdk plan'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pulumi preview')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pulumi preview --cwd org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pulumi stack export')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=packer build template.pkr.hcl')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=packer build -var-file org.ergoplatform.sdk template.pkr.hcl'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake -S . -B build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake -S org.ergoplatform.sdk -B build')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cmake -B Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ninja -C build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ninja -C org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=meson setup build .')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=meson setup org.ergoplatform.sdk build')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcc src.c')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gcc -I org.ergoplatform.sdk src.c')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clang -isystem Microsoft.PowerShell.Management src.c')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ccache --set-config=cache_dir=org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=g++ -Wl,-rpath,org.ergoplatform.sdk app.o')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=clang --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ccache --show-config')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bazel --bazelrc=/workspace/bazelrc version')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --proto_path org.ergoplatform.sdk bridge.proto')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --descriptor_set_out Microsoft.PowerShell.Management bridge.proto')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc -Iorg.ergoplatform.sdk --js_out=Microsoft.PowerShell.Management bridge.proto')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=protoc --plugin=protoc-gen-ts=org.ergoplatform.sdk bridge.proto'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buf generate')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buf --config org.ergoplatform.sdk generate')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buf generate --template org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=openapi-generator-cli version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=openapi-generator-cli generate -g typescript-fetch')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=openapi-generator-cli generate -i org.ergoplatform.sdk -o Microsoft.PowerShell.Management'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=swagger-codegen version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=graphql-codegen --help')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=graphql-codegen --config org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=redocly build-docs openapi.yaml')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=redocly build-docs openapi.yaml --output org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=spectral lint openapi.yaml')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=spectral lint -r org.ergoplatform.sdk openapi.yaml')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=typedoc src/index.ts')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=typedoc --options org.ergoplatform.sdk --out Microsoft.PowerShell.Management src')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=act --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=act -W org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=act --workflows Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=circleci local execute')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=circleci local execute --config org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gitlab-runner --version')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=gitlab-runner exec docker test --docker-volumes org.ergoplatform.sdk:/cache'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=buildkite-agent --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=drone exec')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=drone exec --pipeline org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dagger version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dagger call -m org.ergoplatform.sdk test')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=task ci')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=task --taskfile org.ergoplatform.sdk ci')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=just ci')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=just --justfile org.ergoplatform.sdk ci')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pandoc --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=pandoc --output org.ergoplatform.sdk report.md')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=quarto render report.qmd')).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=quarto render report.qmd --output-dir Microsoft.PowerShell.Management'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jupyter nbconvert --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=papermill --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mkdocs build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mkdocs build -f org.ergoplatform.sdk -d Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=sphinx-build docs build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=asciidoctor manual.adoc')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=mdbook build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hugo version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hugo --source org.ergoplatform.sdk --destination Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docusaurus build')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=docusaurus build --out-dir org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=trivy --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=trivy image --config org.ergoplatform.sdk --output Microsoft.PowerShell.Management registry.example/bridge:latest')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=grype --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=syft packages .')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=osv-scanner --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=semgrep scan --config auto')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=semgrep scan --config org.ergoplatform.sdk --output Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=snyk test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=snyk test --file org.ergoplatform.sdk --json-file-output Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dependency-check --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dependency-check --scan org.ergoplatform.sdk --out Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cyclonedx-npm --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gitleaks detect')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=trufflehog --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=detect-secrets scan')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hadolint Dockerfile')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=shellcheck scripts/check.sh')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=checkov --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=checkov --config-file org.ergoplatform.sdk --framework terraform --output-file-path Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kics version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=terrascan version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=tfsec --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=k6 version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=k6 run script.js')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=k6 run --summary-export org.ergoplatform.sdk script.js')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=artillery run scenario.yml')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=artillery run --output org.ergoplatform.sdk scenario.yml')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=autocannon http://localhost:3000')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wrk http://localhost:3000')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hey http://localhost:3000')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vegeta report')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vegeta attack -targets org.ergoplatform.sdk -output Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ab -n 10 http://localhost:3000/')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=siege https://example.invalid')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=locust --headless')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=locust -f org.ergoplatform.sdk --csv Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jmeter --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jmeter -n -t org.ergoplatform.sdk -l Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=oha http://localhost:3000')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bombardier http://localhost:3000')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cargo test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --out-dir org.ergoplatform.sdk src/lib.rs')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustc --extern foo=org.ergoplatform.sdk src/lib.rs')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustdoc src/lib.rs')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-pack build --target nodejs')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-pack build --out-dir Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-pack build --manifest-path org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=completed CI workflow evidence wasm-pack 0.13.1 artifact://ci/workflow-wasm-pack-version-is-pinned.md',
      ),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-bindgen --version')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=wasm-bindgen org.ergoplatform.sdk --out-dir pkg')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustup show')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rustup toolchain link bridge org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet publish --output Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=dotnet test --settings org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=msbuild solution.sln /p:OutputPath=Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=nuget restore solution.sln')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=nuget restore solution.sln -ConfigFile org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=msbuild solution.sln')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java org.example.Main')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -cp org.ergoplatform.sdk Main')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java -Djava.io.tmpdir=Microsoft.PowerShell.Management Main')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=java --patch-module app=org.ergoplatform.sdk Main')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=javac src/Main.java')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=javac --source-path org.ergoplatform.sdk Main.java')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=jar --describe-module java.base')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=ant test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=scala Main')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=composer install')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=composer --working-dir org.ergoplatform.sdk install')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=phpunit tests')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=phpunit --configuration org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bundle exec rake')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=bundle config set path org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rspec --require org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rake test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=rspec spec')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=gem install rake')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=solc ErgoBridge.sol')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=solc --base-path org.ergoplatform.sdk ErgoBridge.sol')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=solc --include-path Microsoft.PowerShell.Management ErgoBridge.sol'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=hardhat test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test --root org.ergoplatform.sdk')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=forge test --remappings @openzeppelin/=org.ergoplatform.sdk')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=anvil --fork-url https://rpc.example')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=anvil --load-state Microsoft.PowerShell.Management')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cast rpc --rpc-url https://rpc.example eth_blockNumber')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=skopeo copy docker://registry.example/src docker://registry.example/dst'),
    ).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=kustomize build github.com/org/repo//overlay')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'Fresh checkpoint sourceBindings prove height evidence source provenance with live read-only `/info` plus `getBlockNumber` and concrete read-only `ergoNodeUrl`/`sidechainRpcUrl` endpoint bindings',
      ),
    ).toBe(false);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'Fresh checkpoint sourceBindings mention A:completed-release-note.md as prose, not a target binding',
      ),
    ).toBe(false);
  });

  it('does not treat adjacent runtime property-like names as local-only references', () => {
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=__dirnamecompleted-release-note.md')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=import.meta.dirnamecompleted-release-note.md')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Dir.pwdcompleted-release-note.md')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=process.env.HOMEcompleted-release-note.md')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=Deno.env.HOMErelease-note.md')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=AppContext.BaseDirectorycompleted-release-note.md')).toBe(
      false,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=Environment.CurrentDirectorycompleted-release-note.md'),
    ).toBe(false);
  });

  it('recognizes compact file URI local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);
    const compactFileUrlTarget = ['file:', 'tmp', 'bridge-state.sqlite'].join('/');

    expect(hasEvidenceLocalOnlyInspectionReference(`sourceTarget=${compactFileUrlTarget}`)).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3A%2Ftmp%2Fbridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;runtime&frasl;bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;C&colon;&Backslash;tmp&Backslash;bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:./completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:../completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:$env:USERPROFILE/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:${env:USERPROFILE}/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:%USERPROFILE%/completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:!USERPROFILE!/completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3Acompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3Aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3A.%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3A..%2Fcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\u003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\uu003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5Cuu003aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\u{3a}runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\u{00003a}runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\U0000003aruntime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5CU0000003aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\N{COLON}runtime/bridge-state.sqlite')).toBe(true);
    expect(
      hasLocalOnlyVariant('sourceTarget=file\\N{COLON}runtime\\N{SOLIDUS}bridge-state\\N{FULL STOP}sqlite'),
    ).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5CN%7BCOLON%7Druntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5Cu%7B3a%7Druntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5Cu003a%2Ftmp%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\:runtime\\/bridge-state\\.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5C%3Aruntime%5C%2Fbridge-state%5C.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\3a runtime\\2f bridge-state\\2e sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5C3a%20runtime%5C2f%20bridge-state%5C2e%20sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\072runtime\\057bridge-state\\056sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5C072runtime%5C057bridge-state%5C056sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\x3a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5Cx3a%2Ftmp%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\u{3a}org.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\\uu003aorg\\uu002eergoplatform\\uu002esdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\\uu002forg\\uu002eergoplatform\\uu002esdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\\U0000003aorg\\U0000002eergoplatform\\U0000002esdk')).toBe(
      false,
    );
    expect(hasLocalOnlyVariant('sourceTarget=file\\N{COLON}org\\N{FULL STOP}ergoplatform\\N{FULL STOP}sdk')).toBe(
      false,
    );
    expect(hasLocalOnlyVariant('sourceTarget=file\\N{SOLIDUS}org\\N{FULL STOP}ergoplatform\\N{FULL STOP}sdk')).toBe(
      false,
    );
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=file\\N{FULLWIDTH COLON}runtime\\N{FULLWIDTH SOLIDUS}bridge-state\\N{FULLWIDTH FULL STOP}sqlite',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=file%5CN%7BFULLWIDTH%20COLON%7Druntime%5CN%7BFULLWIDTH%20SOLIDUS%7Dbridge-state%5CN%7BFULLWIDTH%20FULL%20STOP%7Dsqlite',
      ),
    ).toBe(true);
    expect(
      hasLocalOnlyVariant(
        'sourceTarget=file\\N{FULLWIDTH COLON}org\\N{FULLWIDTH FULL STOP}ergoplatform\\N{FULLWIDTH FULL STOP}sdk',
      ),
    ).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=C\\N{FULLWIDTH COLON}runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\:org\\.ergoplatform\\.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\\3a org\\2e ergoplatform\\2e sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\\2f org\\2e ergoplatform\\2e sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\\072org\\056ergoplatform\\056sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\\x3aorg.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file&#58;completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&#x3a;runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&#58runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&#x3aruntime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%26%2358%3Bcompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%26%23x3a%3Bruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&#58;org.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file&#58org&#46ergoplatform&#46sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file%u003acompleted-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%U0000003aruntime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%25U0000003aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%u003aorg.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file%U0000003aorg%U0000002eergoplatform%U0000002esdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file%U0000002forg%U0000002eergoplatform%U0000002esdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file=3Aruntime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3D3Aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file=3Aorg=2Eergoplatform=2Esdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file=2Forg=2Eergoplatform=2Esdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;completed-release-note.md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;runtime&sol;bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&amp;colon;runtime&amp;sol;bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;completed-release-note&period;md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon/runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colonruntime/bridge-state.sqlite')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;org&period;ergoplatform&period;sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file：completed-release-note．md')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file：runtime／bridge-state．sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%EF%BC%9Aruntime%EF%BC%8Fbridge-state%EF%BC%8Esqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=file：org．ergoplatform．sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u200ble:/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file:\\u200bruntime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi%E2%80%8Ble%3Aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file:\\u200borg.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u034fle:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\u00ad:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u061cle:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\u180e:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file:org\u034f.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\u00ad:org.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file:org\u061c.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\u180e:org.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u{e0061}le:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\u{e007f}:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file:org\u{e0061}.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\u{e0001}:org.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u070fle:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u115fle:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u17b4le:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u180ble:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u3164le:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\ufff9le:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u{1bca0}le:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u{1d173}le:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=fi\u{13430}le:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file:org\u070f.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file:org\u115f.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file:org\u{13430}.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=fi%00le%3Aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3A%0Druntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3A%0A%09runtime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3Aorg%00.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=fi\ufe0fle:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\ufe0f:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file:org\ufe0f.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file\ufe0f:org.ergoplatform.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file^:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%5E%3Aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file^:org^.ergoplatform^.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file^/org^.ergoplatform^.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file`:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%60%3Aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file`:org`.ergoplatform`.sdk')).toBe(false);
    expect(hasLocalOnlyVariant('sourceTarget=file`/org`.ergoplatform`.sdk')).toBe(false);
  });

  it('recognizes drive-qualified file URI local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);
    const driveFileUrlTarget = ['file:c:', 'users', 'bridge-state.sqlite'].join('/');

    expect(hasEvidenceLocalOnlyInspectionReference(`sourceTarget=${driveFileUrlTarget}`)).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3Ac%3A%2Fusers%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\u003aC\\u003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\u003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\uu003aC\\uu003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\uuu003aruntime\\uuu002fbridge-state\\uuu002esqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\u{3a}C\\u{3a}/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\u{3a}runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\U0000003aC\\U0000003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\U0000003aruntime\\U0000002fbridge-state\\U0000002esqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=file\\N{COLON}C\\N{COLON}/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\N{COLON}runtime\\N{SOLIDUS}bridge-state\\N{FULL STOP}sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=C\\:runtime\\/bridge-state\\.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\3a runtime\\2f bridge-state\\2e sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\072runtime\\057bridge-state\\056sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file\\x3aC\\x3a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\\x3a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&#58;C&#58;Users/operator/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C&#58;bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C&#58bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%u003aC%u003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C%u003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%U0000003aC%U0000003a/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C%U0000003aruntime%U0000002fbridge-state%U0000002esqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=file=3AC=3A/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C=3Aruntime=2Fbridge-state=2Esqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;C&colon;Users/operator/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C&colon;bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C&colon/runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file&colon;C&colon;&bsol;tmp&bsol;bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file：C：Users/operator/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C：bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file：C：＼tmp＼bridge-state．sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C\u200c:/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file:C:' + '\\u200d' + '/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C%00%3Aruntime%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3AC%00%3A/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C^:runtime^/bridge-state^.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file^:C^:^\\tmp^\\bridge-state^.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C`:runtime/bridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file`:C`:`\\tmp`\\bridge-state.sqlite')).toBe(true);
  });

  it('recognizes local editor file URI evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/C:/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode-insiders://file/C:/tmp/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/tmp/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cursor://file/var/tmp/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscodium://file//tmp/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cursor://file//tmp/completed-release-note.md')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/~/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/~operator/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/$HOME/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/${HOME}/bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/$env:USERPROFILE/bridge-state.sqlite')).toBe(
      true,
    );
    expect(
      hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscode://file/${env:USERPROFILE}/bridge-state.sqlite'),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=cursor://file/%USERPROFILE%/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=vscodium://file/!USERPROFILE!/bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasLocalOnlyVariant('sourceTarget=vscode%3A%2F%2Ffile%2FC%3A%2Ftmp%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=vscode%3A%2F%2Ffile%2Ftmp%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=vscode%3A%2F%2Ffile%2F~%2Fbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=vscode%3A%2F%2Ffile%2F%24HOME%2Fbridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/vscode://file/C:/tmp/bridge-state.sqlite')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/vscode://file/tmp/bridge-state.sqlite')).toBe(
      false,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/vscode://file/$HOME/bridge-state.sqlite')).toBe(
      false,
    );
  });

  it('recognizes binding-scoped Windows drive-relative local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);

    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=C:bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=C:completed-release-note.md')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=c:Users\\operator\\bridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=file:C:Users\\operator\\bridge-state.sqlite')).toBe(
      true,
    );
    expect(hasEvidenceLocalOnlyInspectionReference('sourceTarget=FileSystem::z:bridge-state.sqlite')).toBe(true);
    expect(
      hasEvidenceLocalOnlyInspectionReference(
        'sourceTarget=Microsoft.PowerShell.Core\\FileSystem::z:Users\\operator\\bridge-state.sqlite',
      ),
    ).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('"sourceTarget":"C:bridge-state.sqlite"')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=C%3Abridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=FileSystem%3A%3Az%3Abridge-state.sqlite')).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/C:completed-release-note.md')).toBe(false);
    expect(hasEvidenceLocalOnlyInspectionReference('artifact://release/FileSystem::z:bridge-state.sqlite')).toBe(false);
  });

  it('recognizes Windows backslash root local-only evidence target references', () => {
    const hasLocalOnlyVariant = (target: string) =>
      evidenceTargetInspectionVariants(target).some(hasEvidenceLocalOnlyInspectionReference);
    const windowsUserTarget = ['sourceTarget=C:', 'Users', 'operator', 'bridge-state.sqlite'].join('\\');
    const windowsTmpTarget = ['sourceTarget=c:', 'tmp', 'completed-release-note.md'].join('\\');
    const windowsFileTarget = ['sourceTarget=file:C:', 'Users', 'operator', 'bridge-state.sqlite'].join('\\');
    const windowsFileUrlTarget = ['sourceTarget=file://C:', 'tmp', 'completed-release-note.md'].join('\\');
    const uncTarget = ['sourceTarget=', '', 'server', 'share', 'bridge-state.sqlite'].join('\\');

    expect(hasEvidenceLocalOnlyInspectionReference(windowsUserTarget)).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference(windowsTmpTarget)).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference(windowsFileTarget)).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference(windowsFileUrlTarget)).toBe(true);
    expect(hasEvidenceLocalOnlyInspectionReference(uncTarget)).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=file%3Ac%3A%5Cusers%5Cbridge-state.sqlite')).toBe(true);
    expect(hasLocalOnlyVariant('sourceTarget=%5C%5Cserver%5Cshare%5Cbridge-state.sqlite')).toBe(true);
  });
});
