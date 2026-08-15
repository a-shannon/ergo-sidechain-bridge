import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

describe('release gate CLI', () => {
  it('rejects every retired legacy V1 evidence option', () => {
    const retiredFlags = [
      '--aggregate-prebroadcast-json',
      '--window-prep-json',
      '--prep-bundle-json',
      '--offline-gate-json',
      '--preflight-json',
    ];
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/release-gate.ts',
        ...retiredFlags.flatMap(flag => [flag, `artifact://retired/${flag.slice(2)}.json`]),
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    for (const flag of retiredFlags) {
      expect(result.stdout).toContain(`structural issue: unknown option ${flag}`);
    }
  });
});
