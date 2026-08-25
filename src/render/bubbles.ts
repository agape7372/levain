// 기포 생명주기 — 공유 uBump 배열 8슬롯 전부를 CPU에서 구동 (VISUAL §2 개정).
// 레거시 고정 혹(음수 진폭 4개)은 '라떼아트 얼룩'의 주범이라 폐기 — 정지 실루엣은 셰이더 FBM이 담당.
// 부풀기(easeOut) → 정점 → "뽁" 터짐(80ms 음수 + 잔상) → 소멸. 밀도에 따라 스폰 간격 lerp(6s, 0.8s).
// agitation(젓는 세기 0~1): 스폰 간격 ÷(1+2a), 수명 ÷(1+a) — 젓는 동안 끓어오른다.

const DYN_SLOTS = 8;
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
  /** 셰이더에 그대로 업로드되는 배열 — 8슬롯 전부 동적 */
  readonly pos = new Float32Array(16);
  readonly amp = new Float32Array(8);
  readonly k = new Float32Array(8);
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

  private spawn(t: number, scale: number, lifeBase: number): void {
    const slot = this.bubbles.findIndex((b) => !b.active);
    if (slot < 0) return;
    const b = this.bubbles[slot];
    const r = Math.sqrt(Math.random()) * this.spawnR;
    const th = Math.random() * Math.PI * 2;
    b.active = true;
    b.x = Math.cos(th) * r;
    b.z = Math.sin(th) * r;
    b.k = 16 + Math.random() * 10; // 완만한 돔 — 크면 금속성 스파이크
    b.bornAt = t;
    b.life = lifeBase + Math.random() * lifeBase;
    b.maxAmp = (0.06 + Math.random() * 0.05) * scale;
    b.popped = false;
  }

  /** 즉시 기포 하나 — 연출(밥 정착·부활 첫 숨)용 */
  spawnNow(t: number, scale = 1): void {
    this.spawn(t, scale, 1.2);
  }

  /** t: 렌더 시계(초). density·scale: RenderParams. agitation: 젓는 세기 0~1 */
  update(t: number, density: number, scale: number, agitation = 0): void {
    this.popsThisFrame = 0;

    if (density > 0.02 && t >= this.nextSpawnAt) {
      // 동시 가시 상한 4 — 밀집 클러스터 회피 (확장기획 §4-1·§4-2b 트라이포포비아 근거)
      if (this.bubbles.filter((b) => b.active).length < 4) this.spawn(t, scale, 2 / (1 + agitation));
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
        if (pa >= POP_SEC * 2.5) {
          b.active = false;
          this.amp[i] = 0;
        } else if (pa < POP_SEC) {
          // "뽁" — 함몰 −0.3→−0.12 완화. 시각 잔상은 프래그 팝 링 하이라이트가 대체 (§4-2-7)
          this.amp[i] = -0.12 * b.maxAmp * (pa / POP_SEC);
        } else {
          this.amp[i] = -0.12 * b.maxAmp * (1 - (pa - POP_SEC) / (POP_SEC * 1.5));
        }
      }
      this.pos[i * 2] = b.x;
      this.pos[i * 2 + 1] = b.z;
      this.k[i] = b.k;
    }
  }
}
