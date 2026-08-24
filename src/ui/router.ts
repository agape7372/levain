// 화면 스택 라우터 (URL 없음) + Android backButton 계약 (ARCHITECTURE §5):
// ① 열린 모달 닫기 → ② 스택 back → ③ 루트면 minimize(호출자 주입) / 연출 중이면 스킵 콜백.
import { closeTopModal } from './components/modal';

export interface Screen {
  readonly id: string;
  readonly el: HTMLElement;
  /** 화면이 보일 때 (rAF 게이팅 등) */
  onShow?(): void;
  onHide?(): void;
}

export interface RouterDeps {
  /** 루트에서 백 — 네이티브는 App.minimizeApp(), 웹은 no-op */
  onRootBack: () => void;
  /** 연출 진행 중이면 스킵을 수행하고 true (백 소비) */
  trySkipSequence?: () => boolean;
}

export class Router {
  private stack: Screen[] = [];

  constructor(
    private host: HTMLElement,
    private deps: RouterDeps,
  ) {}

  /** 탭 전환 — 스택을 루트 하나로 교체 */
  setRoot(screen: Screen): void {
    for (const s of this.stack) {
      s.onHide?.();
      s.el.remove();
    }
    this.stack = [screen];
    // 홈·레시피 Screen은 앱 수명 동안 재사용된다 — push()가 남긴 display:none을
    // 여기서 복구하지 않으면 그 탭이 재시작 전까지 백지가 된다 (BUG-1)
    screen.el.style.display = '';
    this.host.appendChild(screen.el);
    screen.onShow?.();
  }

  push(screen: Screen): void {
    const top = this.stack[this.stack.length - 1];
    top?.onHide?.();
    if (top) top.el.style.display = 'none';
    this.stack.push(screen);
    this.host.appendChild(screen.el);
    screen.onShow?.();
  }

  back(): boolean {
    if (this.stack.length <= 1) return false;
    const popped = this.stack.pop()!;
    popped.onHide?.();
    popped.el.remove();
    const top = this.stack[this.stack.length - 1];
    top.el.style.display = '';
    top.onShow?.();
    return true;
  }

  current(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** 하드웨어 백 진입점 — 계약 순서 고정 */
  handleBack(): void {
    if (this.deps.trySkipSequence?.()) return;
    if (closeTopModal()) return;
    if (this.back()) return;
    this.deps.onRootBack();
  }
}
