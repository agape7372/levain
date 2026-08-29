// 로컬 알림 포트 — @capacitor/local-notifications 래퍼 (push 아님). 정본: GDD §7.
// 웹에서는 no-op. 문구는 ui/copy.ts가 유일한 출처.
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { NotifyPlan, NotifySlot } from '../sim';
import { copy } from '../ui/copy';
import { isNative } from './native';

export type PermissionState = 'granted' | 'denied' | 'unavailable';

export interface NotifierPort {
  /** 예약 전체를 플랜으로 갈아끼운다 (cancel → schedule) */
  applyPlan(plan: NotifyPlan): Promise<void>;
  requestPermission(): Promise<PermissionState>;
  openSettings(): Promise<void>;
}

// 채널 2분할(2026-08-30): 일상 케어 vs 놓치면 잃는 신호. 시스템 설정에서 따로 조절할 수 있고
// warn은 importance HIGH(헤드업)다. care id는 기존 값 유지 — 이미 설치된 기기의 채널 설정 보존.
const CHANNEL_CARE = 'levain-care';
const CHANNEL_WARN = 'levain-warn';
/** 경고 채널로 가는 슬롯 — 반점(사망 예고)·깊은 잠(잃기 직전) */
const WARN_KEYS = new Set<NotifySlot['copyKey']>(['moldWarn', 'dormant']);

function toScheduled(slot: NotifySlot): LocalNotificationSchema {
  return {
    id: slot.id,
    channelId: WARN_KEYS.has(slot.copyKey) ? CHANNEL_WARN : CHANNEL_CARE,
    // 멀티 르방 병합 슬롯(count ≥2)은 집계 문구 (§5-6)
    title:
      slot.count && slot.count > 1
        ? (copy.notifyMany[slot.copyKey]?.(slot.count) ?? copy.notify[slot.copyKey])
        : copy.notify[slot.copyKey],
    body: '', // 제목 한 줄이 전부 — 담백하게 (GDD §10)
    // ★ isExactNotification 기본값이 true라서, 끄지 않으면 권한 없을 때 플러그인이
    // schedule마다 시스템 "Alarms & reminders" 설정 화면을 강제로 연다 (에뮬 실측).
    // 밥 리마인더에 분 단위 정밀도는 불필요 — 명시적 inexact (GDD §7).
    isExactNotification: false,
    schedule: slot.weekly
      ? { at: new Date(slot.at), every: 'week', repeats: true }
      : { at: new Date(slot.at) },
  };
}

export function createNotifier(): NotifierPort {
  let channelReady = false;

  async function ensureChannel(): Promise<void> {
    if (channelReady) return;
    channelReady = true;
    try {
      // importance 3 = DEFAULT (소리 있음, 헤드업 없음), 4 = HIGH (헤드업), visibility 1 = PUBLIC
      await LocalNotifications.createChannel({
        id: CHANNEL_CARE,
        name: copy.notify.channel,
        importance: 3,
        visibility: 1,
      });
      await LocalNotifications.createChannel({
        id: CHANNEL_WARN,
        name: copy.notify.channelWarn,
        importance: 4,
        visibility: 1,
      });
    } catch {
      /* 채널 생성 실패해도 플러그인 기본 채널로 발화한다 */
    }
  }

  return {
    async applyPlan(plan: NotifyPlan): Promise<void> {
      if (!isNative()) return;

      // 이 앱은 자기 로컬 알림 전부를 소유한다 — 대기 중인 것을 전부 걷고 플랜만 다시 심는다.
      try {
        const pending = await LocalNotifications.getPending();
        const ids = pending?.notifications ?? [];
        if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids.map((n) => ({ id: n.id })) });
      } catch {
        /* 취소 실패는 같은 고정 id 재예약으로 덮인다 */
      }

      if (plan.slots.length === 0) return;
      await ensureChannel();
      try {
        await LocalNotifications.schedule({ notifications: plan.slots.map(toScheduled) });
      } catch {
        /* 권한 거부 등 — 알림 없이도 전 기능 정상 (GDD §7) */
      }
    },

    async requestPermission(): Promise<PermissionState> {
      if (!isNative()) return 'unavailable';
      try {
        const current = await LocalNotifications.checkPermissions();
        if (current.display === 'granted') return 'granted';
        const asked = await LocalNotifications.requestPermissions();
        return asked.display === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'unavailable';
      }
    },

    async openSettings(): Promise<void> {
      // 코어 플러그인에 앱 설정 딥링크가 없다 — 안내 문구(copy.notify.permissionSettings)로 산다.
    },
  };
}

/** 알림을 쓰지 않는 경로(테스트)용 */
export const noopNotifier: NotifierPort = {
  applyPlan: async () => undefined,
  requestPermission: async () => 'unavailable',
  openSettings: async () => undefined,
};
