#!/usr/bin/env bash
# reset.sh — wipe all local data for a clean fresh start
# Run AFTER stopping Arvis (npm stop / Ctrl+C)

set -e

DATA_DIR="${ARVIS_DATA_DIR:-./data}"

echo ""
echo "  >_< arvis — reset to factory state"
echo ""
echo "  This will delete:"
echo "    $DATA_DIR/arvis.db  (all agents, messages, queue, config)"
echo "    $DATA_DIR/.jwt-secret"
echo "    $DATA_DIR/backups/"
echo "    $DATA_DIR/sessions/"
echo ""
read -p "  Are you sure? (y/N) " confirm
echo ""

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "  Cancelled."
  exit 0
fi

rm -f  "$DATA_DIR/arvis.db"
rm -f  "$DATA_DIR/arvis.db-shm"
rm -f  "$DATA_DIR/arvis.db-wal"
rm -f  "$DATA_DIR/.jwt-secret"
rm -rf "$DATA_DIR/backups"
rm -rf "$DATA_DIR/sessions"

mkdir -p "$DATA_DIR/backups"
mkdir -p "$DATA_DIR/sessions"

echo "  ✓ Database deleted"
echo "  ✓ JWT secret deleted"
echo "  ✓ Backups cleared"
echo "  ✓ Sessions cleared"
echo ""
echo "  Run 'npm start' to start fresh."
echo ""
