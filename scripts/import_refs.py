"""레퍼런스 반입 — 투명 PNG를 페일 세이지 위에 평탄화해 assets/breads/src/ 규약에 맞춘다.

왜 필요한가 (2026-09-02):
  기존 레퍼런스 13종은 전부 **불투명 RGB + 페일 세이지 배경**(#DFEAE0)이다. Codex(ChatGPT
  imagegen) 산출물은 RGBA 투명 배경이라 그냥 복사하면 규약이 깨진다 — align_pair.py /
  diagnose_render.py / breadlab compare 콜라주가 전부 불투명 배경을 전제한다.
  또 assets/breads/src/ 에는 git untracked 파일이 섞여 있어(생성 직후 미커밋 상태) 덮어쓰면
  복구가 불가능하다. 그래서 이 스크립트는 **백업 먼저, 그다음 평탄화 복사**한다.

Node 가 아니라 Python 인 이유: 레포에 이미지 라이브러리가 없다(sharp/jimp/canvas 전부 미설치).
PIL 은 스킬 파이프라인이 이미 쓰고 있으므로 새 의존성이 아니다.

사용:
  PYTHONIOENCODING=utf-8 python scripts/import_refs.py --set assets/breads/generated/pancakes-menu-1024 --id pancake--strawberry-fresh
  ... --ids a,b,c        여러 종 한 번에
  ... --bg '#DFEAE0'     배경색(기본값이 정본)
  ... --dry-run          무엇을 할지만 출력

⚠ PowerShell 로 직접 실행하면 exit 49 / cp949 로 죽는다. Bash + PYTHONIOENCODING=utf-8 로 돌릴 것
   (assets/breads/work/CRIB.md 환경 규칙).
"""
import argparse
import os
import shutil
import sys

from PIL import Image

VIEW_SUFFIXES = ("", "-2", "-3")
DEFAULT_BG = "#DFEAE0"
DEFAULT_DEST = os.path.join("assets", "breads", "src")


def hex_to_rgb(value):
    v = value.lstrip("#")
    if len(v) != 6:
        raise ValueError("배경색은 #RRGGBB 형식이어야 한다: " + value)
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def backup_dir_for(bread_id):
    return os.path.join("assets", "breads", "work", bread_id, "ref-prev")


def flatten(src_path, dst_path, bg_rgb, dry_run):
    im = Image.open(src_path)
    had_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    rgba = im.convert("RGBA")
    plate = Image.new("RGB", rgba.size, bg_rgb)
    plate.paste(rgba, mask=rgba.split()[3])
    if not dry_run:
        plate.save(dst_path, "PNG")
    return rgba.size, had_alpha


def main():
    ap = argparse.ArgumentParser(description="투명 레퍼런스를 src/ 규약(불투명 페일 세이지)으로 반입")
    ap.add_argument("--set", dest="src_set", required=True, help="생성 이미지 세트 디렉터리")
    ap.add_argument("--id", dest="single_id", help="빵 id 하나")
    ap.add_argument("--ids", dest="id_list", help="빵 id 여럿, 쉼표 구분")
    ap.add_argument("--bg", default=DEFAULT_BG, help="평탄화 배경색 (기본 " + DEFAULT_BG + ")")
    ap.add_argument("--dest", default=DEFAULT_DEST, help="대상 디렉터리")
    ap.add_argument("--dry-run", action="store_true", help="실제로 쓰지 않고 계획만 출력")
    args = ap.parse_args()

    ids = []
    if args.single_id:
        ids.append(args.single_id)
    if args.id_list:
        ids.extend([s.strip() for s in args.id_list.split(",") if s.strip()])
    if not ids:
        ap.error("--id 또는 --ids 중 하나는 필요하다")

    bg_rgb = hex_to_rgb(args.bg)
    os.makedirs(args.dest, exist_ok=True)

    missing = []
    rows = []
    for bread_id in ids:
        bdir = backup_dir_for(bread_id)
        for suffix in VIEW_SUFFIXES:
            name = bread_id + suffix + ".png"
            src_path = os.path.join(args.src_set, name)
            dst_path = os.path.join(args.dest, name)
            if not os.path.exists(src_path):
                missing.append(src_path)
                continue
            action = "new"
            if os.path.exists(dst_path):
                if not args.dry_run:
                    os.makedirs(bdir, exist_ok=True)
                    shutil.copy2(dst_path, os.path.join(bdir, name))
                action = "backup+overwrite"
            size, had_alpha = flatten(src_path, dst_path, bg_rgb, args.dry_run)
            rows.append((name, action, "%dx%d" % size, "alpha" if had_alpha else "opaque"))

    width = max([len(r[0]) for r in rows] + [4])
    for name, action, size, alpha in rows:
        print("%-*s  %-16s %-10s %s" % (width, name, action, size, alpha))
    if missing:
        print("", file=sys.stderr)
        for m in missing:
            print("없음: " + m, file=sys.stderr)
        return 1
    if args.dry_run:
        print("(dry-run — 아무것도 쓰지 않았다)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
