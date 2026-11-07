#!/usr/bin/env bash
# Copy the Tangerine CSVs and the local .env to the server. Run from the repo root on your laptop:
#   bash deploy/upload-data.sh root@<server-ip>
set -euo pipefail
TARGET="${1:?usage: upload-data.sh user@host [app_dir]}"
APP_DIR="${2:-/opt/pulp}"
SRC="${EVERPATH_DATA_DIR:-}"
if [ -z "$SRC" ]; then
  for d in data data-*/data; do
    if [ -f "$d/monthly_summary.csv" ]; then SRC="$d"; break; fi
  done
fi
[ -n "$SRC" ] || { echo "Could not find monthly_summary.csv; set EVERPATH_DATA_DIR"; exit 1; }
echo "==> Uploading CSVs from $SRC (transactions.csv is skipped: the API does not load it)"
ssh "$TARGET" "mkdir -p $APP_DIR/data"
for f in monthly_summary.csv loans.csv accounts.csv districts.csv standing_orders.csv clients.csv dispositions.csv cards.csv; do
  [ -f "$SRC/$f" ] && scp -q "$SRC/$f" "$TARGET:$APP_DIR/data/$f" && echo "   $f"
done
if [ -f .env ]; then
  echo "==> Uploading .env"
  scp -q .env "$TARGET:$APP_DIR/.env"
fi
echo "Done. On the server: cd $APP_DIR && DOMAIN=<your domain> docker compose up -d --build"
