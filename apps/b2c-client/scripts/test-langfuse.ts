/**
 * Quick smoke test for the Langfuse + intent check integration.
 * Run with:  npx tsx --env-file=.env.local scripts/test-langfuse.ts
 */

import { checkProductIntent } from '../lib/ai/intentCheck';

const cases = [
  { query: 'חלב ולחם',    expect: true  },   // valid: milk and bread
  { query: 'eggs and milk', expect: true  },   // valid
  { query: 'hello how are you', expect: false }, // conversational
  { query: 'SELECT * FROM users', expect: false }, // injection
];

async function main() {
  console.log('Testing intent check + Langfuse tracing...\n');

  for (const { query, expect } of cases) {
    const result = await checkProductIntent(query, 'test-script');
    const status = result === expect ? '✅' : '❌';
    console.log(`${status}  "${query}"  →  ${result ? 'YES' : 'NO'}  (expected ${expect ? 'YES' : 'NO'})`);
  }

  console.log('\nDone. Check https://cloud.langfuse.com for traces.');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
