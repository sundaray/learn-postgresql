---
title: 'Two Ways to Fix a Read-Write Race in Postgres'
description: 'A hospital booked more vaccine doses than it had in stock. The bug was three lines of ordinary code, and wrapping them in a transaction does not fix it.'
postedOn: '2026-08-19'
categories: ['Concurrency', 'PostgreSQL', 'Transactions']
---

In a recent technical interview, I was asked to diagnose a bug in a hospital system: it had booked more vaccine doses for patients than the inventory allowed. The stock figure said 500. The confirmed reservations were well past 500. Nobody had touched the stock number. Patients were arriving for their appointments and being turned away.

The culprit was the backend route responsible for reserving a dose:

```ts
// POST /reserve-dose
router.post('/reserve-dose', async (req: Request, res: Response) => {
    const { patientId } = req.body;
    let client;

    try {
        client = await getDbClient();

        // 1. Check the stock.
        const inventoryResult = await client.query(
            'SELECT count FROM inventory WHERE item_name = $1',
            ['Pfizer-Batch-A'],
        );
        const currentCount = inventoryResult.rows[0].count;

        if (currentCount > 0) {
            // 2. Decrement the stock.
            await client.query(
                'UPDATE inventory SET count = count - 1 WHERE item_name = $1',
                ['Pfizer-Batch-A'],
            );

            // 3. Create the reservation.
            await client.query(
                'INSERT INTO reservations (patient_id, status, timestamp) VALUES ($1, $2, NOW())',
                [patientId, 'CONFIRMED'],
            );

            res.json({ success: true, message: 'Dose reserved' });
        } else {
            res.status(400).json({ error: 'No doses available' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        if (client) await client.end();
    }
});
```

Read it once. It looks reasonable. Check the stock, and if there is stock, take one and write the reservation. The guard is right there in the middle of the handler.

Can you tell what is wrong with this code?

Take a moment before reading on. The hint is that nothing is wrong with it when one request runs at a time.

## There are two issues, and they are not the same issue

This is the part that trips people up, so I want to name it early.

1. The three steps are not **atomic**. They can partly succeed.
2. The three steps are not **isolated**. Two requests can run through them at the same time and interfere with each other.

Those are two different properties with two different fixes, and fixing the first does not fix the second. If you ship only the first fix, the hospital still oversells. Let us take them one at a time.

## Issue 1: checking and reserving are not atomic

Look at what happens when the route succeeds. It writes to two places: it decrements `inventory`, then it inserts into `reservations`. Those are two separate statements sent to Postgres, and with nothing wrapping them, Postgres treats each one as its own transaction and commits it immediately. This is autocommit, and it is the default.

So the decrement is permanent the instant it runs, before the insert has even been attempted.

Now suppose the insert fails. Maybe `patientId` was missing and the `NOT NULL` constraint rejected it. Maybe the connection dropped. Maybe the Node process restarted at exactly the wrong moment. The dose has already left the shelf and there is no reservation to show for it. The stock count and the reservations table have drifted apart, and nothing in the system will ever reconcile them. Run this route enough times and your inventory becomes fiction.

Checking availability and recording the reservation have to **succeed together or fail together**. That is what atomic means: all or nothing, no half-finished states. Nothing in the code above guarantees it.

The fix is a transaction:

```ts
// POST /reserve-dose
router.post('/reserve-dose', async (req: Request, res: Response) => {
    const { patientId } = req.body;
    let client;

    try {
        client = await getDbClient();

        await client.query('BEGIN');

        // 1. Check the stock.
        const inventoryResult = await client.query(
            'SELECT count FROM inventory WHERE item_name = $1',
            ['Pfizer-Batch-A'],
        );
        const currentCount = inventoryResult.rows[0].count;

        if (currentCount > 0) {
            // 2. Decrement the stock.
            await client.query(
                'UPDATE inventory SET count = count - 1 WHERE item_name = $1',
                ['Pfizer-Batch-A'],
            );

            // 3. Create the reservation.
            await client.query(
                'INSERT INTO reservations (patient_id, status, timestamp) VALUES ($1, $2, NOW())',
                [patientId, 'CONFIRMED'],
            );

            await client.query('COMMIT');

            res.json({ success: true, message: 'Dose reserved' });
        } else {
            await client.query('ROLLBACK');
            res.status(400).json({ error: 'No doses available' });
        }
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => undefined);
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        if (client) await client.end();
    }
});
```

`BEGIN` opens the transaction. Nothing between `BEGIN` and `COMMIT` is visible to anyone else, and nothing is permanent, until the `COMMIT` lands. If the insert throws, the `catch` block issues a `ROLLBACK` and the decrement is undone as though it never happened. The dose goes back on the shelf.

That is a real fix for a real bug. And the hospital still oversells.

## Issue 2: Postgres runs transactions concurrently

Here is what a transaction does not give you. `BEGIN` does not mean "nobody else runs while I am in here". Postgres runs many transactions at the same time. That is the entire point of a database server. Your transaction is atomic, meaning all or nothing, but it is not alone.

So two requests can both be inside this route, both between `BEGIN` and `COMMIT`, both reading and writing the same inventory row, at the same moment.

Let me walk through what that does.

Say there is exactly **one dose left** and two reservation requests arrive together. The first request reads the inventory, sees a count of 1, passes the `currentCount > 0` guard, decrements the stock, and inserts a confirmed reservation. Perfectly correct behaviour. But at the same time, before the first request has committed anything, the second request also reads the inventory. It also sees 1, because that is what is committed and visible right now. It also passes the guard. It also decrements. It also inserts a confirmed reservation.

Two patients now hold a confirmed reservation for one physical dose.

### Why the second request sees a stale 1

This comes down to the isolation level. Postgres runs at **READ COMMITTED** by default, which works like this: each statement sees a snapshot of the data as it was committed at the moment that statement started. That gives you two guarantees worth knowing, and one gap that matters enormously here.

The guarantees: you never read another transaction's uncommitted changes, and your statement sees a stable picture for its whole run.

The gap: **a plain `SELECT` takes no locks and blocks nobody.** It reads its snapshot and gets out of the way. Ten thousand concurrent transactions can all `SELECT` the same row at the same instant and all see the same value. Nothing about reading a row reserves it, holds it, or warns anyone else off it.

That is why both requests see 1. Neither one did anything wrong. They both just looked before either one acted.

### The progression

Here is the interleaving with one dose in stock. Read it top to bottom as wall-clock time.

| Time | Request A | Request B | `inventory.count` |
| --- | --- | --- | --- |
| t1 | `BEGIN` | | 1 |
| t2 | `SELECT count` returns **1** | | 1 |
| t3 | | `BEGIN` | 1 |
| t4 | | `SELECT count` returns **1** | 1 |
| t5 | `1 > 0` passes the guard | | 1 |
| t6 | | `1 > 0` passes the guard | 1 |
| t7 | `UPDATE count = count - 1` | | 0 |
| t8 | | `UPDATE count = count - 1` | **-1** |
| t9 | `INSERT` reservation | | -1 |
| t10 | | `INSERT` reservation | -1 |
| t11 | `COMMIT`, responds 200 OK | | -1 |
| t12 | | `COMMIT`, responds 200 OK | **-1** |

One dose in stock. Two confirmed reservations. A stock count of -1.

Scale that up and the arithmetic gets ugly fast. Fire forty concurrent requests at a stock of five and you get somewhere near forty confirmations, because nearly all of them finish their read before any of them finishes its write. That is the morning booking rush, and that is how you get past 500 reservations against 500 doses without anyone touching the stock figure.

One detail in that table is worth pausing on. The count lands on -1, not 0. Postgres did not lose either decrement. `count = count - 1` is computed by the database against the current value of the row, and both decrements applied correctly. **What was lost is not the arithmetic. It is the decision.** Both requests decided based on a value that was already spent by the time they acted on it.

This shape of bug has a name: **check-then-act**. You check a condition, then you act on it, and the world changes in between. The gap between the check and the act is where the bug lives.

So how do we close the gap? There are two ways, and one of them is the better fit for this route.

## Solution 1: lock the row while you read it

If the problem is that a plain `SELECT` lets everyone read the same value at once, then make the read exclusive. Postgres gives you `SELECT ... FOR UPDATE` for exactly this. It reads the row **and** takes an exclusive lock on it, the same lock a write would take, and holds that lock until your transaction ends.

```ts
// POST /reserve-dose
router.post('/reserve-dose', async (req: Request, res: Response) => {
    const { patientId } = req.body;
    let client;

    try {
        client = await getDbClient();

        await client.query('BEGIN');

        // 1. Read the stock and lock the row. A second request reaching this
        //    line waits here until we COMMIT or ROLLBACK, and then reads the
        //    value we left behind rather than the one we started from.
        const stock = await client.query(
            'SELECT count FROM inventory WHERE item_name = $1 FOR UPDATE',
            ['Pfizer-Batch-A'],
        );

        if (stock.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Inventory not found' });
        }

        const remaining = stock.rows[0].count;

        if (remaining <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No doses available' });
        }

        // 2. Decrement. Safe to decide this in application code, because no
        //    other transaction can touch this row until we commit.
        await client.query(
            'UPDATE inventory SET count = count - 1 WHERE item_name = $1',
            ['Pfizer-Batch-A'],
        );

        // 3. Record the reservation in the same transaction, so a failure here
        //    puts the dose back on the shelf.
        await client.query(
            'INSERT INTO reservations (patient_id, status, timestamp) VALUES ($1, $2, NOW())',
            [patientId, 'CONFIRMED'],
        );

        await client.query('COMMIT');

        res.json({ success: true, message: 'Dose reserved', remaining: remaining - 1 });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => undefined);
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        if (client) await client.end();
    }
});
```

Now replay the same scenario. Request A reaches its `SELECT ... FOR UPDATE` at t1, reads 1, and takes the lock. Request B reaches its own `SELECT ... FOR UPDATE` at t2 and **stops there**. It does not read a stale 1. It does not read anything at all. It waits. A decrements, inserts, commits, and releases the lock. Only then does B's `SELECT` return, and what it returns is 0. B fails the guard, rolls back, and responds with 400. Correct.

Three things are worth noticing about this solution.

**It only works inside a transaction.** A row lock lives until the transaction that took it ends. Run `SELECT ... FOR UPDATE` outside a transaction and autocommit ends the transaction the instant the statement finishes, releasing the lock immediately, and you are back where you started. So the Issue 1 fix is not optional here. It is what gives the lock a useful lifetime. The two fixes stack.

**It costs two round trips.** You go to the database to read and lock, come back to Node, run an `if`, then go to the database again to write. The lock is held across all of that, including the network hop back to your application and the time your JavaScript spends thinking. Every other reservation for that item is queued behind that window.

**It puts the decision in your application code**, which is sometimes exactly what you want. Which brings us to the alternative.

## Solution 2: update with a condition

Step back and ask why we are reading the row at all. We do not want the number. We want a dose. The read exists only to feed an `if` statement.

So skip it. Do not read, and do not decide in Node. Send the whole decision to the database as one instruction: take one, but only if there is at least one there. That translates directly into a `WHERE` clause.

```ts
// POST /reserve-dose
router.post('/reserve-dose', async (req: Request, res: Response) => {
    const { patientId } = req.body;
    let client;

    try {
        client = await getDbClient();

        await client.query('BEGIN');

        // 1. Claim a dose. The stock check lives in the WHERE clause, so
        //    checking and decrementing are a single statement. There is no
        //    gap between them for another request to slip into.
        const claim = await client.query(
            'UPDATE inventory SET count = count - 1 WHERE item_name = $1 AND count > 0 RETURNING count',
            ['Pfizer-Batch-A'],
        );

        // No row matched, so the stock was already exhausted.
        if (claim.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No doses available' });
        }

        // 2. Record the reservation. Sharing a transaction with the claim above
        //    means a failure here returns the dose to the shelf.
        await client.query(
            'INSERT INTO reservations (patient_id, status, timestamp) VALUES ($1, $2, NOW())',
            [patientId, 'CONFIRMED'],
        );

        await client.query('COMMIT');

        res.json({ success: true, message: 'Dose reserved', remaining: claim.rows[0].count });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => undefined);
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        if (client) await client.end();
    }
});
```

The `if (currentCount > 0)` is gone from JavaScript and lives in `AND count > 0` instead. There is no window between the check and the write, because they are now the same statement. `rowCount` tells you what happened: 1 means you claimed a dose, 0 means there was nothing left to claim. `RETURNING count` hands back the new value at no extra cost, so you can tell the caller how many are left.

### Wait, where is the lock in this one?

This is the question I got stuck on the first time I saw this pattern, and it is worth answering carefully, because it is the whole reason the code is safe.

**Every `UPDATE` locks the rows it modifies. Automatically. Always.** It has to. Two transactions cannot be rewriting the same row at the same time. That lock is held until the transaction ends, exactly like the one `FOR UPDATE` takes.

| Statement | Takes a row lock? |
| --- | --- |
| `SELECT count FROM inventory WHERE ...` | No |
| `SELECT count FROM inventory WHERE ... FOR UPDATE` | Yes |
| `UPDATE inventory SET count = count - 1 WHERE ...` | Yes, automatically |

Seen this way, `FOR UPDATE` is not the thing that creates locking. It exists so a `SELECT` can borrow the lock a write would have taken. You reach for it precisely because you are not writing yet and you want to hold the row while your application code thinks. Solution 2 is writing, so it already has the lock, for free, without asking.

### The part that makes it correct

There is a second mechanism at work, and it is the one people miss.

Reads in Postgres run off a snapshot, a frozen picture of the data from when the statement started. That is exactly why the original code's `SELECT` handed back a stale 1.

Writes cannot work that way. If an `UPDATE` wrote to a frozen picture, it would silently clobber whatever someone else had committed in the meantime. So when an `UPDATE` reaches a row that another open transaction has already modified, Postgres does not use the frozen picture, and it does not give up either. It waits for that other transaction to finish, and then:

- **If that transaction rolled back**, nothing really changed. Proceed as normal.
- **If that transaction committed**, the row has a new value now. Postgres fetches the new value and runs your `WHERE` clause against it **again**. If it still matches, the update goes ahead against the fresh value. If it no longer matches, the row is skipped and does not count towards `rowCount`.

That second bullet is the safety net. Postgres calls it EvalPlanQual if you want to search for it, but the plain version is: **a blocked `UPDATE` re-checks its `WHERE` clause against fresh data before it writes.**

Replay the scenario one last time, one dose in stock:

| Time | Request A | Request B | `count` |
| --- | --- | --- | --- |
| t1 | `UPDATE ... AND count > 0` matches (1 > 0), sets count to 0, **holds the lock** | | 0, uncommitted |
| t2 | | The same `UPDATE` arrives, hits the locked row, **waits** | 0 |
| t3 | `INSERT` reservation | still waiting | 0 |
| t4 | `COMMIT`, lock released | still waiting | 0 |
| t5 | Responds 200 OK | Wakes up, re-reads the row, sees 0, re-checks `0 > 0`, **fails**. Row skipped, `rowCount` is 0 | 0 |
| t6 | | `ROLLBACK`, responds 400 | 0 |

One dose, one reservation, a stock of 0. Notice that B waits through t3 and t4 as well. The lock is held until A's transaction ends, not just until A's `UPDATE` statement finishes.

### Why that same mechanism did not save the original code

Here is the detail that ties the whole thing together, and it is what I would want you to walk away with.

The original broken code got exactly the same treatment. Its `UPDATE` took a row lock, waited its turn, and had its `WHERE` clause re-checked against fresh data by Postgres. All of that machinery was running the whole time.

The `WHERE` clause it re-checked was:

```sql
WHERE item_name = 'Pfizer-Batch-A'
```

Which is still perfectly true after the other transaction commits. The item name did not change. The re-check passes, the decrement goes through, and the count drops to -1.

Postgres will re-check the condition you gave it in SQL. It cannot re-check this:

```ts
if (currentCount > 0) {   // in your Node process, on a value read a moment ago
```

It has no idea that line exists.

So the one-sentence version of solution 2 is: move the condition out of your `if` statement and into the `WHERE` clause, because Postgres re-checks `WHERE` clauses against fresh data and cannot re-check your `if`.

## Which solution should you pick?

Both are correct. For this route I would ship **solution 2**, for four reasons.

**One round trip instead of two.** Solution 1 reads, returns to Node, decides, then writes. Solution 2 sends one statement and reads `rowCount`.

**A shorter lock window.** Both hold the inventory row until `COMMIT`, but solution 1 starts holding it one full network round trip earlier, at the `SELECT`, and keeps holding it while your JavaScript runs. Solution 2 starts the lock when the `UPDATE` reaches the server. Under a booking rush, where every request queues on the same row, that window is what decides your throughput.

**The condition cannot drift away from the write.** In solution 1 the rule (only if stock remains) lives in Node and the write lives in SQL. Someone can edit one without the other. In solution 2 they are the same line of code and cannot be separated.

**Less to get wrong.** There is no stale-read gap to reason about, because there is no read.

**Solution 1 earns its place when the decision needs logic a `WHERE` clause cannot express.** A per-patient reservation limit, a choice between several batches, a check against another table, a rule with branches. You cannot write that in a `WHERE` clause, so you take the lock, hold the row, and reason in your application language with the data frozen. That is the right tool for that job, and it is worth knowing precisely because solution 2 does not stretch that far.

One honest caveat on both: they serialize every reservation for an item on that item's single row. Requests queue. That is inherent to keeping one accurate counter, not a flaw in either approach. If that queue ever became the bottleneck, the answer is a different data model, such as a row per dose or a sharded counter, not different locking.

## Prove it to yourself in two terminals

You do not have to take any of this on faith. Open two `psql` sessions against the same database and set the stock to 1:

```sql
UPDATE inventory SET count = 1 WHERE item_name = 'Pfizer-Batch-A';
```

In the first terminal, start a transaction and claim the dose, but do not commit:

```sql
BEGIN;
UPDATE inventory SET count = count - 1
WHERE item_name = 'Pfizer-Batch-A' AND count > 0
RETURNING count;
-- returns 0. Leave this transaction open.
```

In the second terminal, run the identical statement:

```sql
BEGIN;
UPDATE inventory SET count = count - 1
WHERE item_name = 'Pfizer-Batch-A' AND count > 0
RETURNING count;
-- this hangs. Your prompt does not come back.
```

The second session is blocked on the row lock the first one is holding. Now go back to the first terminal and type:

```sql
COMMIT;
```

The second session unblocks instantly and prints `UPDATE 0` with no rows returned. That is the re-check happening in front of you: it woke up, looked at the new value, evaluated `0 > 0`, and matched nothing.

Then run the same experiment with a plain `SELECT` in both terminals and watch nothing block at all. Both return 1. That is the bug.

## One more safety net: let the schema refuse

Whichever solution you pick, add this:

```sql
ALTER TABLE inventory
ADD CONSTRAINT inventory_count_non_negative CHECK (count >= 0);
```

The column was `INTEGER NOT NULL` with no floor, which is why it happily stored -1. With the constraint in place, any code path that tries to oversell fails its transaction loudly instead of quietly corrupting the count.

This is worth doing even when your route is correct, because the next route someone writes against this table might not be. Your application logic is the first line of defence. The schema is the one that does not have bugs in it.

## Two things I left out

**Isolation levels.** Everything above assumes READ COMMITTED, the Postgres default, where a conflicting writer blocks and then re-checks. If you run at REPEATABLE READ or SERIALIZABLE, the blocked transaction does not wait and re-check. It raises a serialization failure (SQLSTATE 40001) and expects your application to retry the whole transaction. Both solutions still work there, but they need a retry loop around them.

**Input validation and connection handling.** The code above does not validate `patientId`, and it opens a fresh database connection per request, which is its own problem under load. Both matter in production. Neither has anything to do with the race, so I kept them out of the comparison.

## The takeaway

A transaction gives you **all or nothing**. It does not give you **alone**. Those are two different properties, and the overbooking bug lives entirely in the gap between them.

Whenever you catch yourself writing "read a value, decide something, write it back", ask where the decision is happening. If it is happening in your application, between two round trips, there is a window, and something will eventually slip through it. Either hold the row for the whole decision with `SELECT ... FOR UPDATE`, or better, hand the decision to the database as a single conditional write and let the `WHERE` clause do the checking.

That second approach goes well beyond counters. The same shape covers a state transition, where `WHERE status = 'pending'` means only one worker can mark an order paid. It covers a multi-field edit guarded by a version column, and an insert guarded by `ON CONFLICT DO NOTHING`. The rule underneath all of them is the same: never let a value your application read earlier decide whether a write is allowed. Write the expectation into the statement, and let the row count tell you what happened.
