export const ORIGINAL_NODE_OPTIONS = process.env.NODE_OPTIONS;

const existingNodeOptions = ORIGINAL_NODE_OPTIONS ?? '';
if (!existingNodeOptions.split(/\s+/).includes('--no-deprecation')) {
  process.env.NODE_OPTIONS = `${existingNodeOptions} --no-deprecation`.trim();
}
