#!/bin/sh
# 한 회전: 높이장 → 굽기 → 포장 → 미리보기 → 판. 사용: sh strand_detail_run.sh <work> [seed 무관]
set -e
W=${1:-.work/blender/fx/strand_detail/r2}
B="C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
S=scripts/blender/fx
mkdir -p "$W" public/fx
python3 $S/strand_detail_field.py "$W"
"$B" -b --factory-startup --python-exit-code 1 -P $S/strand_detail.py -- bake "$W" | grep -E "BAKE|rror"
python3 $S/strand_detail_pack.py pack "$W" public/fx/strand_detail.png
cp public/fx/strand_detail.png "$W/strand_detail.png"
"$B" -b --factory-startup --python-exit-code 1 -P $S/strand_detail.py -- render "$W" public/fx/strand_detail.png | grep -E "RENDER|rror"
python3 $S/strand_detail_pack.py board "$W" public/fx/strand_detail.png .work/refs/feel2/lift-finger/UPQ94iuWWr0_b.png
