#!/bin/bash
set -e
echo "Running gates..."
node --test src/**/*.test.js
echo "All gates passed."
