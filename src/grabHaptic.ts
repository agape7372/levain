// 들기 진동 규칙(VISUAL §5, 떼어내기 v4~v6) — 한 번 들기에 최대 2회 = 항복 light 1 + 마지막 끊김 light 1.
// 가는 갈래 끊김 · 착지 = 무진동 · 끊긴 뒤 놓으면 무진동 · 끊기 전에 놓으면 놓을 때 light 1.
// 시큼(묽음)은 항복 · 끊김이 없어 놓을 때 1회뿐(의도). app.ts가 소리와 함께 부르고 tests/grabHaptic.test.ts가 배선을 잠근다
import type { StrandBreak } from './render/dough/StrandMesh';
import type { HapticKind } from './platform/haptics';

export function grabHaptics(haptic: (k: HapticKind) => void) {
  let broke = false;
  return {
    start(): void {
      broke = false;
    },
    event(e: StrandBreak): void {
      if (e.kind === 'yield') haptic('light');
      else if (e.kind === 'break' && e.last) {
        broke = true;
        haptic('light');
      }
    },
    end(): void {
      if (!broke) haptic('light');
    },
  };
}
