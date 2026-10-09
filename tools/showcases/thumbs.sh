#!/usr/bin/env bash
# Renders the showcase thumbnails (public/showcases/<id>.jpg) through the real export path.
# Usage: tools/showcases/thumbs.sh [id ...]   (no ids: all templates). Re-run after changing templates or devices.
set -euo pipefail
cd "$(dirname "$0")/../.."
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  ids=($(node --input-type=module -e "import('./src/state/templates.js').then(m=>console.log(m.TEMPLATES.map(t=>t.id).join(' ')))"))
fi
for id in "${ids[@]}"; do
  log=$(T=$id EXPORT=1 MARKERS=0 W=720 H=720 node tools/render-harness/harness.js "public/showcases/$id.jpg" tools/render-harness/scenes/template.js 2>&1) || { echo "$log"; echo "failed: $id" >&2; exit 1; }
  echo "  $id"
done
