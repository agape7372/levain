// 로컬 알림 포트 — @capacitor/local-notifications 래퍼 (push 아님). 정본: GDD §7.
// 웹·플러그인 부재에서는 전부 no-op. 문구는 ui/copy.ts가 유일한 출처.
import type { NotifyPlan, NotifySlot } from '../sim';
import { copy } from '../ui/copy';
import { loadPlugin } from './native';

export type PermissionState = 'granted' | 'denied' | 'unavailable';

export interface NotifierPort {
  /** 예약 전체를 플랜으로 갈아끼운다 (cancel → schedule) */
  applyPlan(plan: NotifyPlan): Promise<void>;
  requestPermission(): Promise<PermissionState>;
  openSettings(): Promise<void>;
}

const CHANNEL_ID = 'levain-care';

interface ScheduleAt {
  at: Date;
  every?: 'week';
  repeats?: boolean;
}

interface LocalNotificationsPlugin {
  LocalNotifications: {
    checkPermissions(): Promise<{ display: string }>;
    requestPermissions(): Promise<{ display: string }>;
    schedule(options: {
      notifications: Array<{
        id: number;
        title: string;
        body: string;
        channelId?: string;
        schedule?: ScheduleAt;
      }>;
    }): Promise<unknown>;
    cancel(options: { notifications: Array<{ id: number }> }): Promise<void>;
    getPending(): Promise<{ notifications: Array<{ id: number }> }>;
    createChannel?(options: {
      id: string;
      name: string;
      importance: number;
      visibility?: number;
    }): Promise<void>;
  };
}

type LocalNotifications = LocalNotificationsPlugin['LocalNotifications'];

function toScheduled(slot: NotifySlot): {
  id: number;
  title: string;
  body: string;
  channelId: string;
  schedule: ScheduleAt;
} {
  return {
    id: slot.id,
    channelId: CHANNEL_ID,
    title: copy.notify[slot.copyKey],
    body: '', // 제목 한 줄이 전부 — 담백하게 (GDD §10)
    // allowWhileIdle을 켜지 않는다 = inexact 알람. SCHEDULE_EXACT_ALARM 권한 회피 (GDD §7).
    schedule: slot.weekly
      ? { at: new Date(slot.at), every: 'week', repeats: true }
      : { at: new Date(slot.at) },
  };
}

export function createNotifier(): NotifierPort {
  let channelReady = false;

  async function plugin(): Promise<LocalNotifications | null> {
    const mod = await loadPlugin<LocalNotificationsPlugin>('@capacitor/local-notifications');
    return mod?.LocalNotifications ?? null;
  }

  async function ensureChannel(ln: LocalNotifications): Promise<void> {
    if (channelReady || !ln.createChannel) return;
    channelReady = true;
    try {
      // importance 3 = DEFAULT (소리 있음, 헤드업 없음), visibility 1 = PUBLIC
      await ln.createChannel({ id: CHANNEL_ID, name: copy.notify.channel, importance: 3, visibility: 1 });
    } catch {
      /* 채널 생성 실패해도 플러그인 기본 채널로 발화한다 */
    }
  }

  return {
    async applyPlan(plan: NotifyPlan): Promise<void> {
      const ln = await plugin();
      if (!ln) return;

      // 이 앱은 자기 로컬 알림 전부를 소유한다 — 대기 중인 것을 전부 걷고 플랜만 다시 심는다.
      // 슬롯 고정 id를 여기 복제하지 않아도 되고, id가 바뀌어도 유령 예약이 안 남는다.
      try {
        const pending = await ln.getPending();
        const ids = pending?.notifications ?? [];
        if (ids.length > 0) await ln.cancel({ notifications: ids.map((n) => ({ id: n.id })) });
      } catch {
        /* 취소 실패는 같은 고정 id 재예약으로 덮인다 */
      }

      if (plan.slots.length === 0) return;
      await ensureChannel(ln);
      try {
        await ln.schedule({ notifications: plan.slots.map(toScheduled) });
      } catch {
        /* 권한 거부 등 — 알림 없이도 전 기능 정상 (GDD §7) */
      }
    },

    async requestPermission(): Promise<PermissionState> {
      const ln = await plugin();
      if (!ln) return 'unavailable';
      try {
        const current = await ln.checkPermissions();
        if (current.display === 'granted') return 'granted';
        const asked = await ln.requestPermissions();
        return asked.display === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'unavailable';
      }
    },

    async openSettings(): Promise<void> {
      // 코어 플러그인에 앱 설정 딥링크가 없다. M6에서 네이티브로 배선하고,
      // 그 전까지는 copy.notify.permissionSettings 안내 문구만으로 산다.
    },
  };
}

/** 알림을 쓰지 않는 경로(테스트·웹)용 */
export const noopNotifier: NotifierPort = {
  applyPlan: async () => undefined,
  requestPermission: async () => 'unavailable',
  openSettings: async () => undefined,
};
