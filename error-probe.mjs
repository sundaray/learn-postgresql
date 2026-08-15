// Throwaway probe: runs invalid SQL through the real runQuery + formatter and
// prints exactly what the output panel would render. Delete when done.
import { readdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'

// jiti loads the app's TypeScript modules directly. It ships with vite, so it
// lives in the pnpm store rather than at the top of node_modules.
const jitiDirectory = readdirSync('./node_modules/.pnpm').find((entry) =>
  entry.startsWith('jiti@'),
)
const { createJiti } = await import(
  `./node_modules/.pnpm/${jitiDirectory}/node_modules/jiti/lib/jiti.mjs`
)

const jiti = createJiti(import.meta.url)

const { seedDatabase } = await jiti.import(
  './src/features/practice-workspace/db/seed.ts',
)
const { runQuery } = await jiti.import(
  './src/features/practice-workspace/db/run-query.ts',
)
const { formatPostgresError } = await jiti.import(
  './src/features/practice-workspace/db/format-postgres-error.ts',
)

console.log('Seeding the practice database...')
const database = await PGlite.create()
await seedDatabase(database)

const cases = [
  [
    'column typo (the screenshot)',
    'SELECT quantity from order_items where quantiy > 2;',
  ],
  ['table typo', 'SELECT * FROM prodcts;'],
  ['syntax error at the very start', 'SELEC * FROM products;'],
  [
    'error on line 3 of a multi-line query',
    'SELECT quantity\nFROM order_items\nWHERE quantiy > 2;',
  ],
  [
    'second statement of a batch fails',
    'SELECT count(*) FROM orders;\nSELECT * FROM order_itms;',
  ],
  ['tab-indented line', 'SELECT id\nFROM orders\n\tWHERE totl_amount > 10;'],
  ['missing GROUP BY', 'SELECT country, count(*) FROM customers;'],
  [
    'foreign key violation',
    "INSERT INTO orders VALUES (999999, 424242, 'paid', 10, 'pay_x', now(), null);",
  ],
  [
    'duplicate key',
    "INSERT INTO products VALUES (1, 'SKU-000001', 'Dup', 'audio', 1.00);",
  ],
  ['division by zero', 'SELECT total_amount / 0 FROM orders;'],
  ['bad timestamp literal', "SELECT * FROM orders WHERE placed_at > 'not-a-date';"],
  ['unterminated string', "SELECT * FROM customers WHERE country = 'US;"],
  [
    'long single line',
    'SELECT id, customer_id, status, total_amount, payment_reference, placed_at, shipped_at FROM orders WHERE statuss = 1;',
  ],
]

/** Reads the character the caret actually points at, rather than eyeballing it. */
function caretReport(block) {
  const lines = block.split('\n')
  const lineIndex = lines.findIndex((line) => line.startsWith('LINE '))

  if (lineIndex === -1) return 'no LINE block'

  const caretIndex = lines[lineIndex + 1].indexOf('^')
  const pointedAt = lines[lineIndex].slice(caretIndex, caretIndex + 16)

  return `caret sits over: ${JSON.stringify(pointedAt)}`
}

for (const [label, sql] of cases) {
  const run = await runQuery(database, sql)

  console.log(`\n=== ${label} ===`)

  if (!run.error) {
    console.log('!! no error raised')
    continue
  }

  const block = formatPostgresError(run.error, run.sql)
  console.log(block)
  console.log(`  [${caretReport(block)}]`)
}
