#!/usr/bin/env bash
# Pixel-diffs every PNG of two suite folders; writes <b>/diff/<name>.png (8x amplified).
A=${1:?usage: compare.sh <dirA> <dirB>}; B=${2:?}; mkdir -p "$B/diff"
for f in "$A"/*.png; do n=$(basename "$f"); node "$(dirname "$0")/diff.js" "$f" "$B/$n" "$B/diff/$n" || true; done
