const GIT_COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export function isGitCommitSha(value: string): boolean {
  return GIT_COMMIT_SHA_PATTERN.test(value.trim());
}

export function validateGitCommitField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (value.trim().length > 0 && !isGitCommitSha(value)) {
    errors.push(`${section}: ${field} must be a 7-40 character Git commit SHA`);
  }
}
