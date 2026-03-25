"""
Nearbit — Price Sync Service
============================
Reads parser CSV outputs, diffs against Redis state,
and writes only CHANGED / ADDED prices to global_market_prices.

Flow:
  1. Read price_file_*.csv from outputs/
  2. Diff prices against Redis cache (keyed by barcode+chain)
  3. Batch-upsert changed rows into Supabase `global_market_prices`
  4. Update Redis with the new price state
  5. Clean up files older than CLEANUP_DAYS from outputs/ and dumps/

Environment variables:
  NEXT_PUBLIC_SUPABASE_URL      e.g. https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY     service role key (bypasses RLS)
  UPSTASH_REDIS_REST_URL        Upstash REST URL
  UPSTASH_REDIS_REST_TOKEN      Upstash REST token

Flags:
  --dry-run    Print what would change without writing to Supabase or deleting files
"""

import os
import csv
import json
import time
import logging
import hashlib
import argparse
from pathlib import Path

import requests
from supabase import create_client, Client

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("PARSER_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("price-sync")

# ── Config ────────────────────────────────────────────────────────────────────
OUTPUTS_DIR      = Path(os.getenv("OUTPUTS_DIR", "/app/outputs"))
DUMPS_DIR        = Path(os.getenv("DUMPS_DIR",   "/app/dumps"))
BATCH_SIZE       = int(os.getenv("SYNC_BATCH_SIZE", "500"))
CLEANUP_DAYS     = int(os.getenv("CLEANUP_DAYS", "3"))
MAX_CSV_AGE_HOURS = float(os.getenv("MAX_CSV_AGE_HOURS", "2"))

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REDIS_URL    = os.environ["UPSTASH_REDIS_REST_URL"].rstrip("/")
REDIS_TOKEN  = os.environ["UPSTASH_REDIS_REST_TOKEN"]

REDIS_STATE_KEY = "nearbit:global_prices:state"
REDIS_STATE_TTL = 8 * 60 * 60  # 8 hours

# Parser chain name → display name
CHAIN_DISPLAY = {
    "SHUFERSAL":                 "Shufersal",
    "BAREKET":                   "Bareket",
    "YAYNO_BITAN_AND_CARREFOUR": "Yayno Bitan",
    "RAMI_LEVY":                 "Rami Levy",
    "VICTORY":                   "Victory",
    "HAZI_HINAM":                "Hazi Hinam",
    "TIV_TAAM":                  "Tiv Taam",
    "OSHER_AD":                  "Osher Ad",
    "SUPER_PHARM":               "Super Pharm",
    "COFIX":                     "Cofix",
}


# ── Redis (Upstash REST) ──────────────────────────────────────────────────────

def _redis(method: str, *args):
    resp = requests.post(
        f"{REDIS_URL}/{method}/{'/'.join(str(a) for a in args)}",
        headers={"Authorization": f"Bearer {REDIS_TOKEN}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("result")


def redis_get_state() -> dict:
    raw = _redis("get", REDIS_STATE_KEY)
    return json.loads(raw) if raw else {}


def redis_set_state(state: dict):
    _redis("set", REDIS_STATE_KEY, json.dumps(state), "EX", REDIS_STATE_TTL)


# ── Supabase ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def upsert_in_batches(sb: Client, rows: list, dry_run: bool):
    if dry_run:
        log.info(f"  [dry-run] would upsert {len(rows)} rows")
        return
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        sb.table("global_market_prices").upsert(
            batch, on_conflict="barcode,chain_name"
        ).execute()
        total += len(batch)
        log.info(f"  upserted {total}/{len(rows)} rows")


# ── Sync ──────────────────────────────────────────────────────────────────────

def sync_chain(
    sb: Client,
    price_csv: Path,
    chain_key: str,
    prev_state: dict,
    new_state: dict,
    dry_run: bool,
) -> tuple:
    """Returns (total_rows, updated, skipped)."""
    chain_name = CHAIN_DISPLAY.get(chain_key.upper(), chain_key.title())
    log.info(f"── {chain_name}: diffing {price_csv.name}")
    changed = []
    total_rows = 0
    skipped = 0

    with open(price_csv, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            barcode   = str(row.get("ItemCode",  "")).strip()
            name_heb  = str(row.get("ItemName",  "")).strip()
            price_raw = str(row.get("ItemPrice", "")).strip()

            if not name_heb or not price_raw:
                continue

            total_rows += 1
            state_key  = f"{chain_key}:{barcode or name_heb}"
            price_hash = hashlib.md5(f"{price_raw}|{name_heb}".encode()).hexdigest()[:16]
            new_state[state_key] = price_hash

            if prev_state.get(state_key) == price_hash:
                skipped += 1
                continue  # unchanged — skip

            try:
                price = float(price_raw)
            except ValueError:
                skipped += 1
                continue

            changed.append({
                "barcode":    barcode or None,
                "name_heb":   name_heb,
                "price":      price,
                "chain_name": chain_name,
            })

    updated = len(changed)
    log.info(
        f"  processed {total_rows:,} rows — "
        f"{updated:,} updated, {skipped:,} skipped"
    )

    if changed:
        upsert_in_batches(sb, changed, dry_run)

    return total_rows, updated, skipped


# ── Cleanup ───────────────────────────────────────────────────────────────────

def cleanup_old_files(directory: Path, days: int, dry_run: bool) -> int:
    """Delete files older than `days` days. Returns count of affected files."""
    if not directory.exists():
        return 0

    cutoff = time.time() - days * 86400
    deleted = 0

    for f in directory.rglob("*"):
        if not f.is_file():
            continue
        if f.stat().st_mtime < cutoff:
            if dry_run:
                log.info(f"  [dry-run] would delete {f.name}")
            else:
                f.unlink()
                log.debug(f"  deleted {f.name}")
            deleted += 1

    return deleted


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Nearbit Price Sync")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Simulate sync — no DB writes, no file deletions",
    )
    args = parser.parse_args()
    dry_run = args.dry_run

    log.info(
        "=== Nearbit Price Sync starting%s ===",
        " [DRY RUN]" if dry_run else "",
    )

    if not OUTPUTS_DIR.exists():
        log.warning(f"{OUTPUTS_DIR} not found — parser may not have run yet")
        return

    price_files = sorted(OUTPUTS_DIR.glob("price_file_*.csv"))
    if not price_files:
        log.warning("No price CSVs found in outputs/ — parser has not run yet")
        return

    # Check freshness: skip if all CSVs are older than MAX_CSV_AGE_HOURS
    cutoff = time.time() - MAX_CSV_AGE_HOURS * 3600
    fresh_files = [f for f in price_files if f.stat().st_mtime >= cutoff]
    if not fresh_files:
        oldest_min = int((time.time() - max(f.stat().st_mtime for f in price_files)) / 60)
        log.warning(
            f"All CSVs are stale (oldest: {oldest_min}m ago, limit: {int(MAX_CSV_AGE_HOURS * 60)}m) "
            f"— skipping sync, parser may not have run this cycle"
        )
        return
    price_files = fresh_files

    sb = None if dry_run else get_supabase()
    prev_state = redis_get_state()
    log.info(f"Redis state: {len(prev_state)} items from previous run")
    new_state: dict = {}

    grand_total = grand_updated = grand_skipped = 0

    for csv_path in price_files:
        chain_key = csv_path.stem.replace("price_file_", "").upper()
        try:
            total, updated, skipped = sync_chain(
                sb, csv_path, chain_key, prev_state, new_state, dry_run
            )
            grand_total   += total
            grand_updated += updated
            grand_skipped += skipped
        except Exception as e:
            log.error(f"Failed to sync {chain_key}: {e}")

    if not dry_run:
        redis_set_state(new_state)

    log.info(
        "=== Sync done: %s rows across %d chains — %s updated, %s skipped ===",
        f"{grand_total:,}", len(price_files),
        f"{grand_updated:,}", f"{grand_skipped:,}",
    )

    # Cleanup old files after successful sync
    deleted = (
        cleanup_old_files(OUTPUTS_DIR, CLEANUP_DAYS, dry_run)
        + cleanup_old_files(DUMPS_DIR,  CLEANUP_DAYS, dry_run)
    )
    if deleted:
        verb = "[dry-run] would delete" if dry_run else "deleted"
        log.info(f"Cleanup: {verb} {deleted} files older than {CLEANUP_DAYS} days")


if __name__ == "__main__":
    main()
