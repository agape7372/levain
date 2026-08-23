// 진동 포트 — @capacitor/haptics 래퍼. 웹·플러그인 부재는 no-op.
// settings.haptics 게이트는 호출 측이 아니라 여기가 진다 — 호출부 20곳에 조건문을 흩지 않는다.
import { loadPlugin } from './native';

export type HapticKind = 'light' | 'medium' | 'success';

interface HapticsPlugin {
  Haptics: {
    impact(options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
    notification(options: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): Promise<void>;
  };
}

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

async function fire(kind: HapticKind): Promise<void> {
  const mod = await loadPlugin<HapticsPlugin>('@capacitor/haptics');
  if (!mod) return;
  try {
    if (kind === 'success') await mod.Haptics.notification({ type: 'SUCCESS' });
    else await mod.Haptics.impact({ style: kind === 'light' ? 'LIGHT' : 'MEDIUM' });
  } catch {
    /* 진동은 장식 — 실패해도 조용히 넘어간다 */
  }
}

/** fire-and-forget — 호출부는 await하지 않는다 */
export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  void fire(kind);
}
