// 기포 생명주기 — 공유 uBump 배열의 동적 슬롯(4~7)을 CPU에서 구동 (VISUAL §2).
// 부풀기(easeOut) → 정점 → "뽁" 터짐(80ms 음수 + 잔상) → 소멸. 밀도에 따라 스폰 간격 lerp(6s, 0.8s).
export const LEGACY_BUMPS: ReadonlyArray<{ x: number; z: number; k: number }> = [
  { x: 0.2, z: 0.04, k: 20 },
  { x: -0.1, z: 0.2, k: 24 },
  { x: 0.06, z: -0.18, k: 22 },
  { x: -0.26, z: -0.06, k: 18 },
];

const DYN_SLOTS = 4; // 슬롯 4~7
const POP_SEC = 0.08;

interface Bubble {
  active: boolean;
  x: number;
  z: number;
  k: number;
  bornAt: number;   // 초 (렌더 시계)
  life: number;     // 부풀기+정점 구간 길이 (초)
  maxAmp: number;
  popped: boolean;
  poppedAt: number;
}

export class BubbleSystem {
  /** 셰이더에 그대로 업로드되는 배열 — 슬롯 0~3 레거시 고정, 4~7 동적 */
  readonly pos = new Float32Array(16);
  readonly amp = new Float32Array(8);
  readonly k = new Float32Array(8);
  /** 이번 프레임에 터진 기포 수 — 사운드 트리거용 */
  popsThisFrame = 0;

  private bubbles: Bubble[] = [];
  private nextSpawnAt = 0;

  constructor() {
    LEGACY_BUMPS.forEach((b, i) => {
      this.pos[i * 2] = b.x;
      this.pos[i * 2 + 1] = b.z;
      this.amp[i] = -0.4; // 레거시 혹 = 프로토타입 원형 그대로
      this.k[i] = b.k;
    });
    for (let i = 0; i < DYN_SLOTS; i++) {
      this.bubbles.push({ active: false, x: 0, z: 0, k: 40, bornAt: 0, life: 0, maxAmp: 0, popped: false, poppedAt: 0 });
      this.k[4 + i] = 40;
    }
  }

  /** t: 렌더 시계(초). density·scale: RenderParams. */
  update(t: number, density: number, scale: number): void {
    this.popsThisFrame = 0;

    if (density > 0.02 && t >= this.nextSpawnAt) {
      const slot = this.bubbles.findIndex((b) => !b.active);
      if (slot >= 0) {
        const b = this.bubbles[slot];
        const r = Math.sqrt(Math.random()) * 0.42;
        const th = Math.random() * Math.PI * 2;
        b.active = true;
        b.x = Math.cos(th) * r;
        b.z = Math.sin(th) * r;
        b.k = 16 + Math.random() * 10; // 레거시 혹(18~24)과 같은 부드러움 — 크면 금속성 스파이크
        b.bornAt = t;
        b.life = 2 + Math.random() * 2;
        b.maxAmp = (0.06 + Math.random() * 0.05) * scale;
        b.popped = false;
      }
      const interval = 6 + (0.8 - 6) * Math.min(1, density);
      this.nextSpawnAt = t + interval * (0.7 + Math.random() * 0.6);
    }

    for (let i = 0; i < DYN_SLOTS; i++) {
      const b = this.bubbles[i];
      const s = 4 + i;
      if (!b.active) {
        this.amp[s] = 0;
        continue;
      }
      const age = t - b.bornAt;
      if (!b.popped) {
        if (age >= b.life) {
          b.popped = true;
          b.poppedAt = t;
          this.popsThisFrame++;
        } else {
          const u = Math.min(1, age / (b.life * 0.55));
          const ease = 1 - Math.pow(1 - u, 3); // easeOutCubic 부풀기
          this.amp[s] = b.maxAmp * ease;
        }
      }
      if (b.popped) {
        const pa = t - b.poppedAt;
        if (pa >= POP_SEC * 2.5) {
          b.active = false;
          this.amp[s] = 0;
        } else if (pa < POP_SEC) {
          this.amp[s] = -0.3 * b.maxAmp * (pa / POP_SEC); // "뽁" — 순간 함몰
        } else {
          this.amp[s] = -0.3 * b.maxAmp * (1 - (pa - POP_SEC) / (POP_SEC * 1.5));
        }
      }
      this.pos[s * 2] = b.x;
      this.pos[s * 2 + 1] = b.z;
      this.k[s] = b.k;
    }
  }
}
