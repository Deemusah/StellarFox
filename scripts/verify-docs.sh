#!/bin/bash
# Verification script for documentation completeness
# Checks that essential documentation files exist and are referenced in README

set -e

echo "Verifying documentation completeness..."

# Check deployment guide
if [ ! -f "docs/deployment-guide.md" ]; then
  echo "ERROR: docs/deployment-guide.md not found"
  exit 1
fi
echo "✓ docs/deployment-guide.md exists"

# Check troubleshooting guide
if [ ! -f "docs/troubleshooting-guide.md" ]; then
  echo "ERROR: docs/troubleshooting-guide.md not found"
  exit 1
fi
echo "✓ docs/troubleshooting-guide.md exists"

# Check README for links
if ! grep -q "\[Deployment Guide\](docs/deployment-guide.md)" README.md; then
  echo "ERROR: README.md does not contain link to deployment guide"
  exit 1
fi
echo "✓ README.md contains deployment guide link"

if ! grep -q "\[Troubleshooting Guide\](docs/troubleshooting-guide.md)" README.md; then
  echo "ERROR: README.md does not contain link to troubleshooting guide"
  exit 1
fi
echo "✓ README.md contains troubleshooting guide link"

echo "All documentation checks passed."
exit 0