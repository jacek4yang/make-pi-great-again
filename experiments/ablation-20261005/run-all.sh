#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
rm -rf results
echo "=== PHASE 1: short-session study (3 arms x 3 runs) ==="
node run-ablation.mjs 3
mv results results-short-final
echo "=== PHASE 2: long-session study (baseline+ours-full x 2 runs, 13 turns) ==="
ABLATION_LONG=1 ABLATION_ARMS=baseline,ours-full node run-ablation.mjs 2
mv results results-long-final
echo "ALL PHASES COMPLETE"
