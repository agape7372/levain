// 저장 포트 — 주 localStorage(동기) + Capacitor Preferences 미러 (ARCHITECTURE §3).
// 직렬화·검증은 store/persistence.ts 소관. 여기는 바이트를 넣고 빼는 일만 한다.
import { loadPlugin } from './native';

export const SAVE_KEY = 'levain:save';

export interface StorageAdapter {
  /** 주 저장소 원문. 없거나 접근 불가면 null */
  loadRaw(): string | null;
  /** 주 저장소에 동기 저장. 실패 시 false (액션 직후 유실 창 0을 위해 동기) */
  saveRaw(json: string): boolean;
  /** 미러에 fire-and-forget 복제. 네이티브만, 실패는 삼킨다 */
  mirror(json: string): void;
  /** 미러 원문 — 복구 사다리 2단 */
  loadMirror(): Promise<string | null>;
}

interface PreferencesPlugin {
  Preferences: {
    set(options: { key: string; value: string }): Promise<void>;
    get(options: { key: string }): Promise<{ value: string | null }>;
  };
}

/** 모듈 최상위에서 localStorage를 만지지 않는다 — node(vitest)·스토리지 차단 WebView 모두에서 죽는다 */
function primary(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createStorage(key: string = SAVE_KEY): StorageAdapter {
  return {
    loadRaw(): string | null {
      try {
        return primary()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },

    saveRaw(json: string): boolean {
      try {
        const ls = primary();
        if (!ls) return false;
        ls.setItem(key, json);
        return true;
      } catch {
        return false; // 용량 초과·프라이빗 모드
      }
    },

    mirror(json: string): void {
      // SharedPreferences는 WebView 스토리지 evict 대상이 아니라 보험이 된다 (ARCHITECTURE §3).
      void loadPlugin<PreferencesPlugin>('@capacitor/preferences')
        .then((mod) => mod?.Preferences.set({ key, value: json }))
        .catch(() => undefined);
    },

    async loadMirror(): Promise<string | null> {
      const mod = await loadPlugin<PreferencesPlugin>('@capacitor/preferences');
      if (!mod) return null;
      try {
        const res = await mod.Preferences.get({ key });
        return res?.value ?? null;
      } catch {
        return null;
      }
    },
  };
}
