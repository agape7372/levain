"""Blender 진입점 — scripts/blender-export.mjs가 부른다.

blender -b --factory-startup -P scripts/blender/run.py -- <id> <outDir>
breads/<id>.py 의 build(lib) → (parts, opts) 를 받아 lib.bake_and_export 로 <outDir>/raw.glb 를 쓴다.
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
bread_id, out_dir = argv[0], argv[1]
spec = importlib.util.spec_from_file_location(f'bread_{bread_id}', os.path.join(HERE, 'breads', f'{bread_id}.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

t0 = time.time()
parts, opts = mod.build(lib)
if os.environ.get('LEVAIN_DRAFT'):  # 형태 확인용 빠른 굽기(텍스처 절반·AO 표본 적게)
    opts.update(size=512, rough_size=256, ao_samples=12)
    if isinstance(opts.get('lit'), dict):  # 빛 굽기 표본도 줄인다
        opts['lit'] = {'samples': 32, **opts['lit']}
stats = lib.bake_and_export(parts, out_dir, bread_id.replace('--', '_'), **opts)
stats['seconds'] = round(time.time() - t0, 1)
with open(os.path.join(out_dir, 'stats.json'), 'w', encoding='utf-8') as f:
    json.dump(stats, f)
print('LEVAIN_STATS', json.dumps(stats))
