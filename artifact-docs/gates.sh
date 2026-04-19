#!/bin/bash
set -e
echo "Running gates..."

# Run test files individually to avoid port conflicts
# (running all together causes deadlocks when multiple files bind the same port)
failed=0
for f in src/*.test.js; do
  [ -f "$f" ] || continue
  echo "  Testing $f ..."
  if ! timeout 30 node --test "$f"; then
    echo "  FAIL: $f"
    failed=1
  fi
done

if [ "$failed" -eq 1 ]; then
  echo "Some gates failed."
  exit 1
fi

echo "All gates passed."
