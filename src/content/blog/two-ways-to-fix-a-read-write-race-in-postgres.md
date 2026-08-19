---
title: 'Two Ways to Fix a Read-Write Race in Postgres'
postedOn: '2026-08-19'
categories: ['Concurrency', 'PostgreSQL', 'Transactions']
---

In a recent technical interview, I was asked to diagnose a bug in a hospital system. The hospital had 500 COVID vaccine doses in stock, but the system had allowed more than 500 confirmed reservations to be made.

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

In this route, we first read the current stock count. If there is at least one dose available, we decrease the count by 1 and then create a reservation. Pretty straightforward.

So what could go wrong?

There are two problems with this code. Let me explain what they are and how we can fix them.

## Problem 1: Checking and reserving are not atomic

What does **not atomic** mean?

It means the operations that should happen together are currently independent of each other. In the `/reserve-dose` route, we first decrease the vaccine stock and then create the reservation. These are two separate database operations.

The problem is that the first operation can succeed while the second one fails.

For example, imagine the stock count is 500. The `UPDATE` succeeds and decreases it to 499. But then, for some reason, the `INSERT` that creates the reservation fails.

Now the database says there are 499 doses left, even though no reservation was created for the dose that was removed from the inventory.

That is the problem atomicity is meant to prevent. These two operations should either both succeed or both fail.

The fix is to run them inside a database transaction.

```ts {+9,+31,+35}
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

By running these operations inside a transaction (`BEGIN ... COMMIT`), they now succeed or fail together. If creating the reservation fails, the stock decrease is rolled back as well. The two operations are now atomic.

So we have solved the first problem. What is the second one?

## Problem 2: Concurrent requests can interfere with each other

PostgreSQL allows multiple transactions to run concurrently. This means that while one request is in the middle of reserving a dose, another request can start its own transaction and work with the same data.

That creates a problem with our current code.

Suppose there is exactly **one dose left** and two reservation requests arrive at almost the same time.

Request A reads the stock count and sees `1`.

Before Request A finishes its transaction, Request B also reads the stock count and sees `1`.

Both requests then evaluate this condition: `if (currentCount > 0)`.

For both requests, the condition is true. So both decide that a dose is available and proceed with the reservation.

We now have two requests that have decided they are allowed to reserve a dose, even though only one dose exists.

So why can both requests read the stock count as `1`?

### Why both requests can see the same stock count

By default, PostgreSQL uses an isolation level called **READ COMMITTED**.

Under READ COMMITTED, each SQL statement only sees data that had been committed when that statement began. It does not see changes made by another transaction that have not yet been committed.

So imagine Request A has already started its transaction and is in the process of reserving the last dose. Until Request A commits its changes, Request B's `SELECT` does not see those changes.

Request B therefore reads the last committed value of the stock count, which is still `1`.

This is why both requests can make the same decision:

```text
Request A: reads 1 → decides a dose is available
Request B: reads 1 → decides a dose is available
```

Wrapping the operations in a transaction solved our first problem because the stock update and reservation now succeed or fail together. But a transaction does not prevent another transaction from reading the same stock and making its own decision at the same time.

We therefore need a way to make sure that once one request claims the last available dose, another request cannot also claim it.

There are two ways we can fix this read-write race. Let's look at both approaches and then compare them to understand why one is a better fit for this particular case.

## Solution 1: Lock the row while reading it

One way to fix the race is to prevent two transactions from making the reservation decision based on the same stock value.

PostgreSQL lets us do this with `SELECT ... FOR UPDATE`.

Instead of reading the stock like this:

```sql
SELECT count
FROM inventory
WHERE item_name = $1;
```

we read it like this:

```sql
SELECT count
FROM inventory
WHERE item_name = $1
FOR UPDATE;
```

`FOR UPDATE` tells PostgreSQL to lock the selected row until the transaction finishes.

Here's the updated `/reserve-dose` route:

```ts {+9,-13,+14,+32,+36}
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
            'SELECT count FROM inventory WHERE item_name = $1 FOR UPDATE',
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

Now suppose there is one dose left and Request A and Request B arrive at almost the same time.

Request A executes `SELECT ... FOR UPDATE`, reads `1`, and locks the inventory row.

When Request B reaches the same `SELECT ... FOR UPDATE`, PostgreSQL does not let it immediately read the row. It waits because Request A is holding the lock.

Request A then decreases the stock to `0`, creates the reservation, and commits the transaction. The lock is released.

Only then can Request B continue. It reads the updated stock count of `0`, fails the availability check, and does not create another reservation.

So instead of this:

```text
Request A: reads 1 → reserves
Request B: reads 1 → reserves
```

we get this:

```text
Request A: reads 1 → locks row → reserves → commits
Request B: waits → reads 0 → reservation rejected
```

### `FOR UPDATE` must be used inside a transaction

The row lock is held until the transaction ends.

That is why `SELECT ... FOR UPDATE` needs to be used inside a transaction. If we ran it without `BEGIN` and `COMMIT`, the statement would finish and the lock would be released immediately. It would no longer protect the later `UPDATE`.

So this solution works.

However, notice what we are doing:

1. We query the database to read and lock the stock.
2. We bring the value back to our application and check whether `currentCount > 0`.
3. If it is, we send another query to decrease the stock.

That means we are still making a separate read (getting the stock count) before the write (decreasing the stock count), and we are holding the row lock while our application makes the decision.

This solution works. However, there is a more elegant way to solve this particular problem.

Instead of reading the stock, locking the row, bringing the value back to our application, and then deciding whether to decrease it, we can ask PostgreSQL to perform the check and the update in a single statement.

## Solution 2: Update with a condition

Instead of first reading the stock and then deciding in our application whether we can decrease it, we can move that condition directly into the `UPDATE` statement.

```sql
UPDATE inventory
SET count = count - 1
WHERE item_name = $1
  AND count > 0
RETURNING count;
```

The important part is:

```sql
AND count > 0
```

We are telling PostgreSQL:

> Decrease the stock by 1, but only if there is at least one dose available.

So the `/reserve-dose` route can look like this:

```ts {+9,-11-16,+18-26,-28-33,+35,+42,+46}
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

        // 1. Claim a dose, but only if one is available.
        const claim = await client.query(
            `UPDATE inventory
             SET count = count - 1
             WHERE item_name = $1
               AND count > 0
             RETURNING count`,
            ['Pfizer-Batch-A'],
        );

        if (currentCount > 0) {
            // 2. Decrement the stock.
            await client.query(
                'UPDATE inventory SET count = count - 1 WHERE item_name = $1',
                ['Pfizer-Batch-A'],
            );

        if (claim.rowCount > 0) {
            // 2. Create the reservation.
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

If a dose was available, PostgreSQL updates the row and `rowCount` is `1`.

If no dose was available, the condition `count > 0` does not match, nothing is updated, and `rowCount` is `0`.

We have therefore combined the stock check and the stock decrease into a single database operation.

### But what happens when two requests run concurrently?

Suppose again that there is exactly one dose left and Request A and Request B execute the conditional `UPDATE` at almost the same time.

Request A reaches the row first. PostgreSQL sees that `count > 0` is true, decreases the count from `1` to `0`, and locks the row.

Request B reaches the same row while Request A is still holding that lock. PostgreSQL makes Request B wait.

Once Request A commits, Request B can continue. But PostgreSQL does not simply proceed based on the value that existed before it started waiting. It checks the `WHERE` condition against the updated row again.

The stock is now `0`, so:

```sql
count > 0
```

is false.

Request B therefore updates nothing, and its `rowCount` is `0`.

So we get:

```text
Request A: count is 1 → updates it to 0 → commits
Request B: waits → checks again → count is 0 → updates nothing
```

One dose results in exactly one successful reservation.

### Why does this work?

An `UPDATE` automatically takes a lock on the row it modifies.

So unlike our original plain `SELECT`, we do not need to explicitly use `FOR UPDATE`. PostgreSQL already handles the locking required for the write.

More importantly, the condition that determines whether the write is allowed now lives inside the SQL statement itself:

```sql
WHERE item_name = $1
  AND count > 0
```

That matters because PostgreSQL can check that condition against the latest value of the row before performing the update.

In the original code, the availability check lived in JavaScript:

```ts
if (currentCount > 0) {
```

PostgreSQL had no knowledge of that condition. By the time the later `UPDATE` ran, PostgreSQL only had this condition to work with:

```sql
WHERE item_name = $1
```

Even if another request had already reduced the stock to `0`, the item name still matched, so the update could decrease it again.

By moving `count > 0` into the `UPDATE` itself, the database now knows the condition that must remain true for the write to happen.

That is what makes the conditional update safe under concurrent requests.

## Conclusion

During the interview, I was able to identify the root cause of the bug and explain how I would fix it. But afterward, I wanted to understand the underlying PostgreSQL concepts more deeply, especially why the race happens and why these solutions work.

That is what led me to write this post.

If you are preparing for a full-stack developer interview, or simply want to get better at reasoning about concurrency and database correctness, I hope you found it useful.
