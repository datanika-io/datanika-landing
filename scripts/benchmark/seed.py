"""
Seed the benchmark Postgres with 10M rows of realistic e-commerce data.

Schema: customers (100k) → orders (2M) → line_items (8M) = ~10M total rows.
Deterministic — same seed always produces the same data.

Usage:
    python seed.py [--conn postgres://bench:bench@localhost:15432/benchmark]
"""

import argparse
import hashlib
import math
import time

import psycopg2

CUSTOMERS = 100_000
ORDERS = 2_000_000
LINE_ITEMS = 8_000_000

DDL = """
DROP TABLE IF EXISTS line_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE customers (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    name        TEXT NOT NULL,
    company     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    status          TEXT NOT NULL,
    total_cents     INTEGER NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'USD',
    ordered_at      TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP NOT NULL
);

CREATE TABLE line_items (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    product     TEXT NOT NULL,
    quantity    INTEGER NOT NULL,
    unit_cents  INTEGER NOT NULL
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_line_items_order ON line_items(order_id);
"""

STATUSES = ["pending", "confirmed", "shipped", "delivered", "returned"]
PRODUCTS = [
    "Widget A", "Widget B", "Gadget Pro", "Sensor Kit", "Cable Pack",
    "Adapter XL", "Module 7", "Board Rev2", "Power Unit", "Connector Set",
    "Display 4K", "Relay Switch", "Motor Drive", "Filter Pack", "Bracket M",
    "Enclosure S", "Fan Unit", "LED Strip", "Battery 18V", "Charger USB-C",
]
COMPANIES = [
    "Acme Corp", "Globex Inc", "Initech", "Umbrella Co", "Stark Industries",
    "Wayne Enterprises", "Cyberdyne", "Soylent Corp", "Weyland-Yutani", None,
]

BATCH = 50_000


def deterministic_hash(seed: int, salt: str) -> int:
    """Fast deterministic pseudo-random from a seed + salt."""
    h = hashlib.md5(f"{seed}:{salt}".encode(), usedforsecurity=False)
    return int.from_bytes(h.digest()[:4], "little")


def seed_customers(cur, n: int):
    print(f"  Seeding {n:,} customers...")
    buf = []
    for i in range(1, n + 1):
        h = deterministic_hash(i, "cust")
        email = f"user{i}@example.com"
        name = f"User {i}"
        company = COMPANIES[h % len(COMPANIES)]
        buf.append((email, name, company))
        if len(buf) >= BATCH:
            _insert_customers(cur, buf)
            buf.clear()
    if buf:
        _insert_customers(cur, buf)


def _insert_customers(cur, rows):
    args = ",".join(
        cur.mogrify("(%s,%s,%s)", r).decode() for r in rows
    )
    cur.execute(f"INSERT INTO customers (email, name, company) VALUES {args}")


def seed_orders(cur, n: int, n_customers: int):
    print(f"  Seeding {n:,} orders...")
    buf = []
    for i in range(1, n + 1):
        h = deterministic_hash(i, "ord")
        cid = (h % n_customers) + 1
        status = STATUSES[h % len(STATUSES)]
        total = 500 + (h % 50000)
        # Spread orders over ~2 years
        day_offset = i % 730
        buf.append((cid, status, total, day_offset))
        if len(buf) >= BATCH:
            _insert_orders(cur, buf)
            buf.clear()
    if buf:
        _insert_orders(cur, buf)


def _insert_orders(cur, rows):
    args = ",".join(
        cur.mogrify(
            "(%s,%s,%s,now()-interval '%s days',now()-interval '%s days')",
            (r[0], r[1], r[2], r[3], max(0, r[3] - 5)),
        ).decode()
        for r in rows
    )
    cur.execute(
        f"INSERT INTO orders (customer_id,status,total_cents,ordered_at,updated_at) VALUES {args}"
    )


def seed_line_items(cur, n: int, n_orders: int):
    print(f"  Seeding {n:,} line_items...")
    buf = []
    for i in range(1, n + 1):
        h = deterministic_hash(i, "li")
        oid = (h % n_orders) + 1
        product = PRODUCTS[h % len(PRODUCTS)]
        qty = 1 + (h % 10)
        unit = 100 + (h % 5000)
        buf.append((oid, product, qty, unit))
        if len(buf) >= BATCH:
            _insert_line_items(cur, buf)
            buf.clear()
    if buf:
        _insert_line_items(cur, buf)


def _insert_line_items(cur, rows):
    args = ",".join(
        cur.mogrify("(%s,%s,%s,%s)", r).decode() for r in rows
    )
    cur.execute(f"INSERT INTO line_items (order_id,product,quantity,unit_cents) VALUES {args}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--conn",
        default="postgres://bench:bench@localhost:15432/benchmark",
        help="PostgreSQL connection string",
    )
    args = parser.parse_args()

    print(f"Connecting to {args.conn}")
    conn = psycopg2.connect(args.conn)
    conn.autocommit = False

    with conn.cursor() as cur:
        print("Creating schema...")
        conn.autocommit = True
        cur.execute(DDL)
        conn.autocommit = False

        t0 = time.time()
        seed_customers(cur, CUSTOMERS)
        conn.commit()
        print(f"    customers: {time.time() - t0:.1f}s")

        t1 = time.time()
        seed_orders(cur, ORDERS, CUSTOMERS)
        conn.commit()
        print(f"    orders: {time.time() - t1:.1f}s")

        t2 = time.time()
        seed_line_items(cur, LINE_ITEMS, ORDERS)
        conn.commit()
        print(f"    line_items: {time.time() - t2:.1f}s")

    total = time.time() - t0
    rows = CUSTOMERS + ORDERS + LINE_ITEMS
    print(f"\nDone: {rows:,} rows in {total:.1f}s ({rows / total:,.0f} rows/s)")
    conn.close()


if __name__ == "__main__":
    main()
