// 원격 빵 자산 — 주소 꼴 · 맵 형식 · 묶음 안/원격 나눔 규칙 · split 결정성 (2026-11-16)
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { ASSET_BASE, parseAssetMap, remoteUrl } from '../src/platform/remoteAssets';
import { hashedPath, isRemoteBread } from '../scripts/lib/families.mjs';
import { buildRemoteMap } from '../scripts/split-remote.mjs';

const ROOT = new URL('..', import.meta.url);

describe('remoteUrl', () => {
  const map = { 'breads/scone--maple-cube.glb': '0123456789', 'breads/thumbs/scone--maple-cube.png': 'abcdef0123' };
  it('맵에 있으면 해시 이름 주소, 없으면 null', () => {
    expect(remoteUrl(map, 'breads/scone--maple-cube.glb')).toBe(`${ASSET_BASE}/breads/scone--maple-cube.0123456789.glb`);
    expect(remoteUrl(map, 'breads/thumbs/scone--maple-cube.png')).toBe(
      `${ASSET_BASE}/breads/thumbs/scone--maple-cube.abcdef0123.png`,
    );
    expect(remoteUrl(map, 'breads/scone.glb')).toBeNull();
    expect(remoteUrl({}, 'breads/scone--maple-cube.glb')).toBeNull();
  });
  it('스크립트(families.hashedPath)와 같은 꼴', () => {
    for (const [k, h] of Object.entries(map)) expect(remoteUrl(map, k)).toBe(`${ASSET_BASE}/${hashedPath(k, h)}`);
  });
});

describe('parseAssetMap', () => {
  it('형식이 어긋나면 빈 맵(= 전부 로컬)', () => {
    expect(parseAssetMap('<!doctype html>')).toEqual({});
    expect(parseAssetMap(null)).toEqual({});
    expect(parseAssetMap(['x'])).toEqual({});
    expect(parseAssetMap({ 'breads/a--b.glb': 'xyz' })).toEqual({});
    expect(parseAssetMap({ '../evil.glb': '0123456789' })).toEqual({});
    expect(parseAssetMap({ 'breads/a--b.glb': '0123456789' })).toEqual({ 'breads/a--b.glb': '0123456789' });
  });
});

describe('묶음 안 / 원격 나눔', () => {
  it('묶음 안 변형 17종 = git이 추적하는 변형 GLB', () => {
    const tracked = execFileSync('git', ['ls-files', 'public/breads'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((l) => l.match(/^public\/breads\/([^/]+--[^/]+)\.glb$/)?.[1])
      .filter((id): id is string => id !== undefined)
      .sort();
    const onDisk = readdirSync(new URL('public/breads/', ROOT)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
    const bundled = onDisk.filter((id) => id.includes('--') && !isRemoteBread(id)).sort();
    expect(bundled).toHaveLength(17);
    expect(bundled).toEqual(tracked);
    // 베이스는 언제나 묶음 안
    expect(onDisk.filter((id) => !id.includes('--')).some(isRemoteBread)).toBe(false);
  });

  it('split 맵은 결정적 · 키 정렬 · 원격만', () => {
    const a = buildRemoteMap();
    const b = buildRemoteMap();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const keys = Object.keys(a);
    expect(keys).toEqual([...keys].sort());
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const id = k.replace(/^breads\/(thumbs\/)?/, '').replace(/\.(glb|png)$/, '');
      expect(isRemoteBread(id)).toBe(true);
      expect(a[k]).toMatch(/^[0-9a-f]{10}$/);
    }
    expect(parseAssetMap(a)).toEqual(a); // 앱 검사를 통과하는 꼴
  });
});
