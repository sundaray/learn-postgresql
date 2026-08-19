import type { PGlite } from '@electric-sql/pglite'

/**
 * The two members seeding reaches for. Naming the pair rather than PGlite lets
 * the tab pass its worker handle, which carries both but is a separate type.
 */
type SeedDatabase = Pick<PGlite, 'exec' | 'query'>

const schemaSql = `
CREATE TABLE IF NOT EXISTS customers (
  id integer PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  country text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id integer PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  price numeric(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers (id),
  status text NOT NULL,
  total_amount numeric(10, 2) NOT NULL,
  payment_reference text NOT NULL,
  placed_at timestamptz NOT NULL,
  shipped_at timestamptz
);

CREATE TABLE IF NOT EXISTS order_items (
  id integer PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id),
  product_id integer NOT NULL REFERENCES products (id),
  quantity integer NOT NULL,
  unit_price numeric(10, 2) NOT NULL
);
`

// Generation is deterministic on purpose: lesson identifiers such as customer
// 4242 and pay_00004242 must resolve to the same rows for every learner.
const dataSql = `
INSERT INTO customers (id, email, full_name, country, created_at)
SELECT
  n,
  'Customer' || n || '@Example.com',
  'Customer ' || n,
  (ARRAY['US', 'GB', 'DE', 'IN', 'BR'])[1 + (n % 5)],
  timestamptz '2021-01-01 00:00:00+00' + ((n % 900) * interval '1 day')
FROM generate_series(1, 10000) AS n;

INSERT INTO products (id, sku, name, category, price)
SELECT
  n,
  'SKU-' || lpad(n::text, 6, '0'),
  'Product ' || n,
  (ARRAY['audio', 'home', 'outdoor', 'office', 'garden'])[1 + (n % 5)],
  round(((500 + (n % 45000)) / 100.0)::numeric, 2)
FROM generate_series(1, 5000) AS n;

INSERT INTO orders (
  id, customer_id, status, total_amount, payment_reference, placed_at, shipped_at
)
SELECT
  n,
  CASE WHEN n % 500 = 0 THEN 1 + (n % 7) ELSE 1 + (n % 10000) END,
  CASE
    WHEN n % 100 < 70 THEN 'delivered'
    WHEN n % 100 < 85 THEN 'shipped'
    WHEN n % 100 < 93 THEN 'processing'
    WHEN n % 100 < 98 THEN 'cancelled'
    ELSE 'pending'
  END,
  round(((1000 + (n % 89000)) / 100.0)::numeric, 2),
  'pay_' || lpad(n::text, 8, '0'),
  placed.placed_at,
  CASE
    WHEN n % 100 < 85 THEN placed.placed_at + ((1 + (n % 5)) * interval '1 day')
    ELSE NULL
  END
FROM generate_series(1, 100000) AS n
CROSS JOIN LATERAL (
  SELECT timestamptz '2021-01-01 00:00:00+00' + ((n % 1460) * interval '1 day')
    AS placed_at
) AS placed;

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
SELECT
  n,
  1 + (n % 100000),
  1 + (n % 5000),
  1 + (n % 4),
  round(((300 + (n % 19700)) / 100.0)::numeric, 2)
FROM generate_series(1, 300000) AS n;
`

// Dropping the schema takes more than the seeded tables with it: an index the
// learner added, or a table they created, goes too. That is what putting the
// database back the way it started has to mean.
const dropSql = `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
`

/** Discards everything in the database and builds the seeded state again. */
export async function resetDatabase(database: SeedDatabase) {
  await database.exec(dropSql)
  await database.exec(schemaSql)
  await database.exec(dataSql)
  await database.exec('ANALYZE;')
}

export async function seedDatabase(database: SeedDatabase) {
  await database.exec(schemaSql)

  const existing = await database.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM orders',
  )

  if ((existing.rows[0]?.count ?? 0) > 0) {
    return
  }

  // An empty `orders` says nothing about the other three tables: a learner can
  // empty one and leave the rest. Inserting on top of the survivors would
  // collide on their primary keys, and since the whole block is one implicit
  // transaction the collision would roll every insert back, leaving the same
  // empty `orders` behind for the next reload to trip over. Clearing the
  // schema first means the reseed always starts from nothing.
  await resetDatabase(database)
}
