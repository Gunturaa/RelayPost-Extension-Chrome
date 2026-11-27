#!/usr/bin/env bash
set -euo pipefail

# Packages only the Chrome Extension files into relaypost-extension.zip
# Excludes backend (web/), git metadata, secrets, docs, and helper scripts.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_ZIP="${ROOT_DIR}/relaypost-extension.zip"

cd "${ROOT_DIR}"
rm -f "${OUT_ZIP}"

zip -r "${OUT_ZIP}" \
  manifest.json \
  network-rules.json \
  _locales \
  assets \
  background \
  content \
  data \
  engine \
  picker \
  popup \
  shared \
  -x "*.DS_Store" "*/.DS_Store" "*Thumbs.db" "*.map"

echo "Packed Chrome Web Store archive: ${OUT_ZIP}"
ls -lh "${OUT_ZIP}"
