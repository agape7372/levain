// 가시성 통합 포트 — visibilitychange + (네이티브면) Capacitor App appStateChange.
// 두 소스가 같은 전환을 이중 발화하므로 마지막 상태와 비교해 한 번만 흘린다.
import { loadPlugin } from './native';

export type LifecycleListener = (visible: boolean) => void;

interface PluginListenerHandle {
  remove: () => Promise<void>;
}

interface AppPlugin {
  App: {
    addListener(
      eventName: 'appStateChange',
      cb: (state: { isActive: boolean }) => void,
    ): Promise<PluginListenerHandle>;
  };
}

export function onLifecycle(cb: LifecycleListener): () => void {
  const hasDocument = typeof document !== 'undefined';
  let disposed = false;
  // 현재 상태를 초기값으로 잡아 둔다 — 구독 직후 같은 상태로 한 번 더 부르지 않기 위해
  let last: boolean = hasDocument ? !document.hidden : true;

  const fire = (visible: boolean): void => {
    if (disposed || visible === last) return;
    last = visible;
    cb(visible);
  };

  const onVisibility = (): void => fire(!document.hidden);
  if (hasDocument) document.addEventListener('visibilitychange', onVisibility);

  let removeNative: (() => void) | null = null;
  void loadPlugin<AppPlugin>('@capacitor/app')
    .then(async (mod) => {
      if (!mod || disposed) return;
      const handle = await mod.App.addListener('appStateChange', ({ isActive }) => fire(isActive));
      if (disposed) {
        void handle.remove();
        return;
      }
      removeNative = () => void handle.remove();
    })
    .catch(() => undefined);

  return () => {
    disposed = true;
    if (hasDocument) document.removeEventListener('visibilitychange', onVisibility);
    removeNative?.();
  };
}
