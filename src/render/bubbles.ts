// 기포 생명주기 — 공유 uBump 배열 4슬롯 전부를 CPU에서 구동 (VISUAL §2 개정).
// 2026-11-19(A1-13): 동시 가시 상한이 4라 셰이더가 8슬롯을 늘 계산하던 것을 4로 맞췄다. 연출 스폰(spawnNow)은
// 빈 슬롯이 없으면 가장 오래된 기포 자리를 넘겨받는다.
// 레거시 고정 혹(음수 진폭 4개)은 '라떼아트 얼룩'의 주범이라 폐기 — 정지 실루엣은 셰이더 FBM이 담당.
// 2026-11-19 R2-08: 큰 물집 돔(k 16~26 · 진폭 0.06~0.11 = 월드 1.2cm 혹)을 작고 날카로운 돔(k 60~140 · 진폭 ≤0.022)으로
// 바꿨다. 터지면 바늘구멍(얕은 음수 진폭)이 SCAR_SEC 동안 남았다 옅어진다 — 프래그가 음수 슬롯을 바늘구멍으로 그린다.
// 부풀기(easeOut) → 정점 → "뽁"(80ms에 바늘구멍으로) → 바늘구멍이 몇 초에 걸쳐 옅어짐 → 소멸. 스폰 간격 lerp(6s, 0.8s).
// agitation(젓는 세기 0~1): 스폰 간격 ÷(1+2a), 수명 ÷(1+a) — 젓는 동안 끓어오른다.
// 2026-11-19 R-M3: 바늘구멍이 슬롯을 붙들어 젓기가 오히려 돔을 줄였다(쉼 1.6 → 젓기 0.6개). 새 돔은 빈 슬롯이 없으면
// 가장 오래된 바늘구멍 자리를 넘겨받고, 수명은 update의 ÷(1+a) 한 번만 줄인다(스폰 때 한 번 더 나눠 ÷(1+a)²였다).

export const DYN_SLOTS = 4;
const POP_SEC = 0.08;
/** 터진 자리 바늘구멍이 남는 시간(초) — 새 돔이 오면 가장 오래된 바늘구멍부터 자리를 내준다 */
const SCAR_SEC = 4;
/** 바늘구멍 깊이(오브젝트) — 프래그는 −amp/SCAR_AMP를 바늘구멍 세기로 읽는다(dough.frag.glsl 같은 상수) */
export const SCAR_AMP = 0.004;
/** 돔 진폭 상한 — 크기 배율(≤1.5)이 커도 혹이 되지 않게 */
const DOME_MAX = 0.025;

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
  /** 셰이더에 그대로 업로드되는 배열 — 4슬롯 전부 동적 */
  readonly pos = new Float32Array(DYN_SLOTS * 2);
  readonly amp = new Float32Array(DYN_SLOTS);
  readonly k = new Float32Array(DYN_SLOTS);
  /** 이번 프레임에 터진 기포 수 — 사운드 트리거용 */
  popsThisFrame = 0;

  private bubbles: Bubble[] = [];
  private nextSpawnAt = 0;
  /** 스폰 반경(오브젝트) — 몸통이 유리까지 확장되면 함께 커진다(윗면 점유율 보존). DoughMesh가 설정 */
  spawnR = 0.42;

  constructor() {
    for (let i = 0; i < DYN_SLOTS; i++) {
      this.bubbles.push({ active: false, x: 0, z: 0, k: 40, bornAt: 0, life: 0, maxAmp: 0, popped: false, poppedAt: 0 });
      this.k[i] = 40;
    }
  }

  private spawn(t: number, scale: number, lifeBase: number, steal = false): void {
    let slot = this.bubbles.findIndex((b) => !b.active);
    // 바늘구멍은 돔 자리를 막지 않는다 — 가장 오래 전에 터진 자리를 넘겨받는다(R-M3)
    if (slot < 0) {
      for (let i = 0; i < DYN_SLOTS; i++) {
        const b = this.bubbles[i];
        if (b.popped && (slot < 0 || b.poppedAt < this.bubbles[slot].poppedAt)) slot = i;
      }
    }
    if (slot < 0 && steal) {
      slot = 0;
      for (let i = 1; i < DYN_SLOTS; i++) if (this.bubbles[i].bornAt < this.bubbles[slot].bornAt) slot = i;
    }
    if (slot < 0) return;
    const b = this.bubbles[slot];
    const r = Math.sqrt(Math.random()) * this.spawnR;
    const th = Math.random() * Math.PI * 2;
    b.active = true;
    b.x = Math.cos(th) * r;
    b.z = Math.sin(th) * r;
    b.k = 60 + Math.random() * 80; // 작고 날카로운 돔(1/e 반경 0.08~0.13 오브젝트) — 윗면 바늘구멍 크기
    b.bornAt = t;
    b.life = lifeBase + Math.random() * lifeBase;
    b.maxAmp = Math.min(DOME_MAX, (0.012 + Math.random() * 0.01) * scale);
    b.popped = false;
  }

  /** 렌더 시계가 delta만큼 옮겨졌다(역행 방어) — 시각 기록을 같이 옮겨 생명주기를 잇는다 */
  shift(delta: number): void {
    this.nextSpawnAt += delta;
    for (const b of this.bubbles) {
      b.bornAt += delta;
      b.poppedAt += delta;
    }
  }

  /** 즉시 기포 하나 — 연출(밥 정착·부활 첫 숨)용 */
  spawnNow(t: number, scale = 1): void {
    this.spawn(t, scale, 1.2, true);
  }

  /** t: 렌더 시계(초). density·scale: RenderParams. agitation: 젓는 세기 0~1 */
  update(t: number, density: number, scale: number, agitation = 0): void {
    this.popsThisFrame = 0;

    if (density > 0.02 && t >= this.nextSpawnAt) {
      // 동시 가시 상한 4(= 슬롯 수) — 밀집 클러스터 회피 (확장기획 §4-1·§4-2b 트라이포포비아 근거)
      this.spawn(t, scale, 2); // 젓기 수명 단축은 아래 effLife ÷(1+a) 한 번
      const interval = (6 + (0.8 - 6) * Math.min(1, density)) / (1 + 2 * agitation);
      this.nextSpawnAt = t + interval * (0.7 + Math.random() * 0.6);
    }

    for (let i = 0; i < DYN_SLOTS; i++) {
      const b = this.bubbles[i];
      if (!b.active) {
        this.amp[i] = 0;
        continue;
      }
      const age = t - b.bornAt;
      if (!b.popped) {
        // 젓는 동안 수명 가속 — 나이를 앞당기는 대신 남은 수명을 줄인다
        const effLife = b.life / (1 + agitation);
        if (age >= effLife) {
          b.popped = true;
          b.poppedAt = t;
          this.popsThisFrame++;
        } else {
          const u = Math.min(1, age / (effLife * 0.55));
          const ease = 1 - Math.pow(1 - u, 3); // easeOutCubic 부풀기
          this.amp[i] = b.maxAmp * ease;
        }
      }
      if (b.popped) {
        const pa = t - b.poppedAt;
        if (pa >= POP_SEC + SCAR_SEC) {
          b.active = false;
          this.amp[i] = 0;
        } else if (pa < POP_SEC) {
          // "뽁" — 돔이 80ms에 바늘구멍 깊이로 꺼진다
          const u = pa / POP_SEC;
          this.amp[i] = b.maxAmp * (1 - u) - SCAR_AMP * u;
        } else {
          // 바늘구멍이 옅어진다 — 처음엔 빨리, 끝은 천천히(easeOut)
          const f = 1 - (pa - POP_SEC) / SCAR_SEC;
          this.amp[i] = -SCAR_AMP * f * f;
        }
      }
      this.pos[i * 2] = b.x;
      this.pos[i * 2 + 1] = b.z;
      this.k[i] = b.k;
    }
  }
}
