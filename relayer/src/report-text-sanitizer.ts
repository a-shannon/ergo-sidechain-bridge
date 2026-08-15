const DRIVE_FILE_PATH =
  /(^|[^A-Za-z])((?:\\\?\\)?[A-Za-z]:[\\/](?:[^\r\n|;`'")<>]+[\\/])*[^\r\n|;`'")<>]*\.[A-Za-z0-9]{1,12})/g;
const DRIVE_DIRECTORY_PATH =
  /(^|[^A-Za-z])((?:\\\?\\)?[A-Za-z]:[\\/][^\r\n|;`'")<>]*(?=$|[\r\n|;`'")<>]))/g;
const SENSITIVE_LABEL =
  /\b(?:privateKey|private_key|mnemonic|seed phrase|seedPhrase)\b/gi;

export function sanitizeReportText(value: string): string {
  return value
    .replace(DRIVE_FILE_PATH, (_match, prefix: string) => `${prefix}[local-path]`)
    .replace(DRIVE_DIRECTORY_PATH, (_match, prefix: string) => `${prefix}[local-path]`)
    .replace(SENSITIVE_LABEL, '[redacted-sensitive-label]');
}
