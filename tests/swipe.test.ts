// 스와이프 확정 판정 (§5-5 · §16 수용 기준: 배경 스와이프와 반죽 드래그 불간섭)
import { describe, it, expect } from 'vitest';
import { isSwipeCommit } from '../src/render/input';

describe('isSwipeCommit', () => {
  it('48px 미만은 확정 아님', () => {
    expect(isSwipeCommit(47, 0)).toBe(false);
    expect(isSwipeCommit(-47, 0)).toBe(false);
  });

  it('48px 이상 수평 이동은 확정', () => {
    expect(isSwipeCommit(48, 0)).toBe(true);
    expect(isSwipeCommit(-120, 10)).toBe(true);
  });

  it('수직 우세는 확정 아님 — 세로 흔들림에 전환되지 않는다', () => {
    expect(isSwipeCommit(60, 60)).toBe(false);
    expect(isSwipeCommit(60, 40)).toBe(false); // 60 > 40*1.5 아님(경계)
    expect(isSwipeCommit(60, 39)).toBe(true);
  });
});
