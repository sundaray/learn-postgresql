-- Run with:
-- docker compose exec -T postgres psql -U postgres -d ecommerce -f - < queries/example.sql

SELECT
  customer_id,
  count(*) AS order_count,
  sum(total_amount) AS total_spent
FROM orders
WHERE customer_id = 4242
GROUP BY customer_id;
