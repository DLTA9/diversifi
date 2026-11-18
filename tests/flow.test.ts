// The amount box: what someone types becomes the exact on-chain amount (18 decimals). Run: npm test
import { parseAmount } from '../lib/flow';

const E18 = 10n ** 18n;
const cases: [string, bigint | null][] = [
  ['1', E18],
  ['1.5', 15n * E18 / 10n],
  ['1.', E18],
  ['.5', E18 / 2n],
  ['0.01', E18 / 100n],
  ['100.25', 10025n * E18 / 100n],
  ['1234567.89', 123456789n * E18 / 100n],
  ['0', 0n],
  ['', null],
  ['.', null],
  ['1.234', null], // more than two decimals is refused, never rounded
  ['1,5', null],
  ['-1', null],
  ['1e3', null],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = parseAmount(input);
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${input}" → ${got}`);
  if (!ok) fail++;
}
process.exit(fail);
