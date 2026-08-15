import { runAggregateSettlementRecoveryCli } from '../aggregate-settlement-recovery-cli.js';

runAggregateSettlementRecoveryCli(process.argv.slice(2)).catch((err: any) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});
