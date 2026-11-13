/**
 * Runs a saved .eml through the ingestion parsers, with no AWS involved.
 *
 * The issuer templates in `alert-parsers.ts` are regexes over real mail that no
 * one controls, so they need checking against actual messages rather than only
 * the fixtures in the test suite. This prints what each stage saw, which is
 * enough to tune a template without deploying anything.
 *
 * Save a message from your mail client first — in Gmail, open the alert, then
 * "Show original" and "Download Original".
 *
 *   npx tsx backend/scripts/parse-eml.ts ~/Downloads/amex-alert.eml
 */

import { readFileSync } from 'node:fs';
import { detectSource, parseAlert } from '../src/lib/alert-parsers';
import { sanitizeMerchant } from '../src/lib/merchant';
import { parseEmail } from '../src/lib/mime';

const path = process.argv[2];

if (path === undefined) {
  console.error('Usage: npx tsx backend/scripts/parse-eml.ts <path-to.eml>');
  process.exit(1);
}

const email = parseEmail(readFileSync(path, 'utf8'));
const issuer = detectSource(email.from);

console.log('--- what the pipeline reads ---');
console.log('from:   ', email.from || '(absent)');
console.log('subject:', email.subject || '(absent)');
console.log('issuer: ', issuer ?? '(not a known issuer — this mail would be rejected)');

console.log('\n--- extracted body text ---');
console.log(email.text.slice(0, 1500) || '(empty — the MIME walk found no readable part)');

const parsed = parseAlert(email, new Date());

console.log('\n--- template parse ---');

if (parsed === null) {
  console.log('NO MATCH. This would fall through to Bedrock at a fraction of a cent.');
  console.log('To make it free and deterministic, adjust the regexes in');
  console.log('backend/src/lib/alert-parsers.ts against the body printed above.');
} else {
  console.log(parsed);

  const sanitized = sanitizeMerchant(parsed.merchantRaw);
  console.log('\nmerchantSanitized:', JSON.stringify(sanitized));
  console.log('dedup key:        ', `DEDUP#${parsed.date}#${parsed.amountCents}#${sanitized}`);
  console.log('\nA second alert for this purchase must produce the same dedup key.');
}
