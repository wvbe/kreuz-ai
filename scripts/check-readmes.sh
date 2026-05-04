#!/usr/bin/env bash
set -euo pipefail

errors=0
while IFS= read -r -d '' dir; do
  if [ ! -f "$dir/README.md" ]; then
    echo "MISSING: $dir/README.md"
    errors=$((errors + 1))
  fi
done < <(find src -type d -print0)

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "ERROR: $errors folder(s) missing README.md"
  exit 1
else
  echo "All folders have README.md ✓"
fi
