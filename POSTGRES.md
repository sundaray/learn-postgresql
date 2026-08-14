# Local PostgreSQL practice database

This Docker database mirrors the deterministic schema and seed data used by
the app's PGlite database.

## Start the database

```bash
docker compose up -d
```

The service is ready when `docker compose ps` reports `healthy`.

## Open an interactive SQL prompt

```bash
docker compose exec postgres psql -U postgres -d ecommerce
```

Useful `psql` commands:

```text
\dt                  list tables
\d orders            describe the orders table
\l                   list databases
\q                   exit psql
```

SQL statements end with a semicolon:

```sql
SELECT *
FROM orders
WHERE customer_id = 4242
ORDER BY placed_at DESC;
```

## Run a SQL file

Put repeatable queries in the `queries` directory, then pipe a file into
`psql`:

```bash
docker compose exec -T postgres psql -U postgres -d ecommerce -f - < queries/example.sql
```

## Connect with an external database client

Use these settings with a desktop client or an application:

```text
Host:     127.0.0.1
Port:     5434
Database: ecommerce
User:     postgres
Password: postgres
URL:      postgresql://postgres:postgres@127.0.0.1:5434/ecommerce
```

The non-default port avoids the other PostgreSQL containers currently using
ports 5432 and 5433. The port is bound to localhost and is not exposed on the
local network.

## Stop or restart

```bash
docker compose stop
docker compose start
```

The named Docker volume keeps your database changes between restarts.

## Return to the original seed data

This removes this project's database volume and all changes made in it, then
creates a fresh database from `docker/postgres/init/001-ecommerce.sql`:

```bash
docker compose down -v
docker compose up -d
```

Only use the reset commands when you intend to discard your practice changes.

## Lesson-specific indexes

The initial database contains only primary-key and declared unique indexes,
matching the app's baseline. The app resets and creates additional indexes as
you move through lessons. Create or drop those indexes in this container too
when comparing a lesson's `EXPLAIN` plan. Exact timings and some planner choices
can still differ between browser-based PGlite and native PostgreSQL.
