// 쇼케이스 중 천 덮기 — 천은 상태만 두고 보이지 않고, 홈으로 나오면 보인다 (R-01, 2026-11-19)
import { describe, it, expect } from 'vitest';
import { SceneHost } from '../src/render/SceneHost';
import { Cloth } from '../src/render/cloth';

function host(showcasing: boolean) {
  const h = Object.create(SceneHost.prototype) as Record<string, unknown>;
  const cloth = new Cloth();
  h.cloth = cloth;
  h.showcase = { group: { visible: showcasing } };
  return { h: h as unknown as SceneHost, cloth };
}

describe('coverCloth — 쇼케이스 중', () => {
  it('쇼케이스 중이면 covering은 true, 메시는 숨김', () => {
    const { h, cloth } = host(true);
    h.coverCloth();
    expect(cloth.covering).toBe(true);
    expect(cloth.mesh.visible).toBe(false);
  });
  it('홈이면 그대로 보인다', () => {
    const { h, cloth } = host(false);
    h.coverCloth();
    expect(cloth.covering).toBe(true);
    expect(cloth.mesh.visible).toBe(true);
  });
});
