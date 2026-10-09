#!/usr/bin/env bash
# Renders the reference scene set into a folder, e.g. before/after a change:
#   tools/render-harness/suite.sh renders/before   ...change...   tools/render-harness/suite.sh renders/after
#   tools/render-harness/compare.sh renders/before renders/after
set -euo pipefail
OUT=${1:?usage: suite.sh <outdir>}
H=$(dirname "$0"); S=$H/scenes; mkdir -p "$OUT"
r(){ local name=$1 scene=$2; shift 2; env "$@" node "$H/harness.js" "$OUT/$name.png" "$S/$scene.js" | grep -v '^wrote' || true; echo "  $name"; }
r default        default          W=800 H=1000
r laptop         laptop           W=800 H=1000 COLOR=silver PRESET=1
r laptop-soft    laptop           W=800 H=1000 COLOR=graphite PRESET=0
r phone-back     phone            W=800 H=1000 COLOR=silver PRESET=1
r keyboard       keyboard-closeup W=800 H=1000
r spheres        spheres          W=1000 H=600
r comp-fan       composition      W=1200 H=800 C=2
r comp-desk      composition      W=1200 H=800 C=4 PRESET=7
r sun            light-type       W=800 H=1000 MOD=sun INT=1.5 EL=50
r spot-flash     light-type       W=800 H=1000 MOD=flash INT=1.6
r spot-softbox   light-type       W=800 H=1000 MOD=softbox INT=1.2
r point-bulb     light-type       W=800 H=1000 MOD=bulb INT=1.4
r dramatic       phone            W=800 H=1000 RY=30 PRESET=4
r light-drag     light-drag       W=640 H=800 SAMPLES=1
