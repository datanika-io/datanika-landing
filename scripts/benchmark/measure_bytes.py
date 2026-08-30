"""
Measure the *byte* volume of the benchmark workload.

Why this exists: Datanika's pricing meters **GB processed** (post-normalization bytes
on the ETL path), but `benchmark.py` only records rows and seconds. Without this, the
flagship benchmark cannot state what the workload would cost on our own plans.

Unlike the timings in `benchmark.py`, these numbers are **hardware-independent**: the
seed is deterministic, so the same seed produces the same bytes on any box.

What it reports:
  1. Source size in Postgres (`pg_total_relation_size`, and table-heap-only size).
  2. Post-normalization bytes -- the load package dlt writes to disk between
     `normalize()` and `load()`. This is the same quantity `LoadInfo.file_size`
     reports, and the quantity the cloud meter bills on.
  3. Destination size -- the DuckDB file after load.

Usage:
    python measure_bytes.py [--pg postgresql://bench:bench@localhost:15432/benchmark]
                            [--output results/bytes-<date>.md]
"""

import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import dlt
import psycopg2
from dlt.sources.sql_database import sql_database

TABLES = ["customers", "orders", "line_items"]
GB = 1024**3


def human(n: int) -> str:
    for unit, div in (("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
        if n >= div:
            return f"{n / div:.2f} {unit}"
    return f"{n} B"


def source_sizes(pg_conn: str) -> dict:
    out = {}
    with psycopg2.connect(pg_conn) as conn, conn.cursor() as cur:
        for t in TABLES:
            cur.execute(
                "SELECT pg_total_relation_size(%s), pg_table_size(%s), "
                "(SELECT count(*) FROM " + t + ")",
                (t, t),
            )
            total, table_only, rows = cur.fetchone()
            out[t] = {
                "total_bytes": int(total),
                "table_bytes": int(table_only),
                "rows": int(rows),
            }
    return out


def dir_bytes(path) -> tuple:
    """Total bytes under `path`, plus a per-extension breakdown."""
    total = 0
    by_ext = {}
    for root, _dirs, files in os.walk(path):
        for f in files:
            fp = Path(root) / f
            try:
                size = fp.stat().st_size
            except OSError:
                continue
            total += size
            key = fp.suffix or "(none)"
            by_ext[key] = by_ext.get(key, 0) + size
    return total, by_ext


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pg", default="postgresql://bench:bench@localhost:15432/benchmark")
    ap.add_argument("--dest", default="bytes_bench.duckdb")
    ap.add_argument("--output", default=None)
    args = ap.parse_args()

    print("Measuring source size in Postgres...", flush=True)
    src = source_sizes(args.pg)
    src_total = sum(v["total_bytes"] for v in src.values())
    src_tables = sum(v["table_bytes"] for v in src.values())
    src_rows = sum(v["rows"] for v in src.values())
    print(f"  source: {human(src_total)} total ({src_rows:,} rows)", flush=True)

    for p in (args.dest, args.dest + ".wal"):
        if os.path.isdir(p):
            shutil.rmtree(p)
        elif os.path.exists(p):
            os.remove(p)

    pipeline = dlt.pipeline(
        pipeline_name="bytes_bench",
        destination=dlt.destinations.duckdb(args.dest),
        dataset_name="raw_benchmark",
        progress="log",
    )
    # Start from clean pipeline state so the load package on disk is only this run.
    try:
        pipeline.drop()
    except Exception as exc:  # noqa: BLE001 - first run has nothing to drop
        print(f"  (no prior pipeline state to drop: {exc})", flush=True)

    source = sql_database(credentials=args.pg, schema="public", table_names=TABLES)

    print("Extracting...", flush=True)
    pipeline.extract(source, write_disposition="replace")
    print("Normalizing...", flush=True)
    pipeline.normalize()

    # Post-normalization bytes: the load package on disk, before it ships to the
    # destination. Measured here rather than after load() because dlt deletes
    # completed load packages.
    norm_root = Path(pipeline.working_dir) / "load" / "normalized"
    norm_bytes, norm_by_ext = dir_bytes(norm_root)
    print(f"  post-normalization: {human(norm_bytes)}  {norm_by_ext}", flush=True)

    print("Loading...", flush=True)
    info = pipeline.load()

    # Cross-check against dlt's own LoadInfo job file sizes, which is what the
    # cloud meter reads. Shape varies across dlt versions, so this is best-effort.
    loadinfo_bytes = 0
    try:
        for pkg in info.load_packages or []:
            for job in pkg.jobs.get("completed_jobs", []):
                fs = getattr(job, "file_size", None)
                if fs:
                    loadinfo_bytes += int(fs)
    except Exception as exc:  # noqa: BLE001
        print(f"  (LoadInfo file_size unavailable: {exc})", flush=True)

    dest_bytes = 0
    if os.path.isdir(args.dest):
        dest_bytes, _ = dir_bytes(Path(args.dest))
    elif os.path.exists(args.dest):
        dest_bytes = os.path.getsize(args.dest)

    payload = {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "dlt_version": getattr(dlt, "__version__", "unknown"),
        "rows": src_rows,
        "source_total_bytes": src_total,
        "source_table_bytes": src_tables,
        "source_per_table": src,
        "post_normalization_bytes": norm_bytes,
        "post_normalization_by_ext": norm_by_ext,
        "loadinfo_file_size_bytes": loadinfo_bytes,
        "destination_duckdb_bytes": dest_bytes,
    }
    print(json.dumps(payload, indent=2), flush=True)

    out = args.output or f"results/bytes-{datetime.now(timezone.utc):%Y-%m-%d}.md"
    Path(out).parent.mkdir(parents=True, exist_ok=True)

    lines = []
    lines.append("# Byte Volume -- benchmark workload\n")
    lines.append(f"**Measured**: {payload['measured_at']}  ")
    lines.append(f"**dlt**: {payload['dlt_version']}  ")
    lines.append(
        f"**Workload**: {src_rows:,} rows (customers + orders + line_items), "
        "deterministic seed  "
    )
    lines.append(
        "**Pipeline**: PostgreSQL 16 -> DuckDB via `dlt`, default loader file format\n"
    )
    lines.append(
        "> Byte volume is **hardware-independent** -- the seed is deterministic, so "
        "these\n> numbers reproduce on any box. Only the timings in `benchmark.py` "
        "depend on the host.\n"
    )
    lines.append("| Quantity | Bytes | Human | GB |")
    lines.append("|---|---:|---:|---:|")
    lines.append(
        f"| Source, Postgres total (incl. indexes/TOAST) | {src_total:,} | "
        f"{human(src_total)} | {src_total / GB:.3f} |"
    )
    lines.append(
        f"| Source, table heap only | {src_tables:,} | {human(src_tables)} | "
        f"{src_tables / GB:.3f} |"
    )
    lines.append(
        f"| **Post-normalization (billable unit)** | **{norm_bytes:,}** | "
        f"**{human(norm_bytes)}** | **{norm_bytes / GB:.3f}** |"
    )
    lines.append(
        f"| `LoadInfo.file_size` cross-check | {loadinfo_bytes:,} | "
        f"{human(loadinfo_bytes)} | {loadinfo_bytes / GB:.3f} |"
    )
    lines.append(
        f"| Destination, DuckDB file | {dest_bytes:,} | {human(dest_bytes)} | "
        f"{dest_bytes / GB:.3f} |"
    )
    lines.append("")
    lines.append(f"Post-normalization breakdown by file extension: `{norm_by_ext}`\n")
    lines.append("## Per-table source size\n")
    lines.append("| Table | Rows | Total bytes | Human |")
    lines.append("|---|---:|---:|---:|")
    for t in TABLES:
        v = src[t]
        lines.append(
            f"| `{t}` | {v['rows']:,} | {v['total_bytes']:,} | {human(v['total_bytes'])} |"
        )
    lines.append("")
    lines.append("## Caveat\n")
    lines.append(
        "The post-normalization figure is what dlt writes to disk for **this**\n"
        "destination and loader file format. A different destination (Parquet-based, or\n"
        "a warehouse with a different staging format) produces a different byte count\n"
        "for the same rows. Cite it as *this pipeline, this destination* -- never as a\n"
        "universal bytes-per-row constant.\n"
    )

    Path(out).write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {out}", flush=True)


if __name__ == "__main__":
    main()
