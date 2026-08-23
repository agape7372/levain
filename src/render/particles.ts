// 공용 파티클 풀 — InstancedMesh 256 고정 할당, draw call 1 (VISUAL §8).
// 용도: 밀가루 낙하(밥주기·덮개 걷기), 김(굽기 결과 쇼케이스 — 다이제틱 보상).
import * as THREE from 'three';

const POOL = 256;

interface P {
  active: boolean;
  mode: 'flour' | 'steam';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  floorY: number;
  life: number;
}

export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private parts: P[] = [];
  private dummy = new THREE.Object3D();
  private activeCount = 0;

  constructor() {
    const geo = new THREE.SphereGeometry(0.014, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf7f2e6, transparent: true, opacity: 0.9, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, POOL);
    this.mesh.count = 0;
    this.mesh.renderOrder = 4;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < POOL; i++) {
      this.parts.push({
        active: false, mode: 'flour', pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        scale: 1, floorY: 0, life: 0,
      });
    }
  }

  /** 밀가루 뿌림 — 병 위에서 낙하, 반죽 표면에서 소멸 (상한 80) */
  spawnFlour(n: number, doughTopY: number): void {
    let spawned = 0;
    for (const p of this.parts) {
      if (spawned >= Math.min(n, 80)) break;
      if (p.active) continue;
      const r = Math.sqrt(Math.random()) * 0.55;
      const th = Math.random() * Math.PI * 2;
      p.active = true;
      p.mode = 'flour';
      p.pos.set(Math.cos(th) * r, 2.2 + Math.random() * 0.5, Math.sin(th) * r);
      p.vel.set((Math.random() - 0.5) * 0.14, -0.6 - Math.random() * 0.5, (Math.random() - 0.5) * 0.14);
      p.scale = 0.7 + Math.random() * 0.8;
      p.floorY = doughTopY + 0.01 + Math.random() * 0.03;
      spawned++;
    }
  }

  /** 김 — 갓 구운 빵 위로 피어오르는 모트 (상한 10, 다이제틱 보상) */
  spawnSteam(n: number, fromY: number): void {
    let spawned = 0;
    for (const p of this.parts) {
      if (spawned >= Math.min(n, 10)) break;
      if (p.active) continue;
      const r = Math.sqrt(Math.random()) * 0.35;
      const th = Math.random() * Math.PI * 2;
      p.active = true;
      p.mode = 'steam';
      p.pos.set(Math.cos(th) * r, fromY + Math.random() * 0.1, Math.sin(th) * r);
      p.vel.set((Math.random() - 0.5) * 0.08, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08);
      p.scale = 0.9 + Math.random() * 0.9;
      p.life = 1.1 + Math.random() * 0.7;
      spawned++;
    }
  }

  update(dt: number): void {
    if (this.activeCount === 0 && this.mesh.count === 0) {
      // 유휴 — 스폰 직후엔 activeCount가 0이어도 아래 루프가 세운다
    }
    let count = 0;
    for (const p of this.parts) {
      if (!p.active) continue;
      if (p.mode === 'steam') {
        p.vel.y += 0.35 * dt; // 부력
        p.pos.addScaledVector(p.vel, dt);
        p.scale *= 1 + 0.7 * dt; // 퍼지며 옅어지는 감각 — 알파 대신 스케일
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
      } else {
        p.vel.y -= 2.2 * dt; // 중력
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y <= p.floorY) {
          p.active = false;
          continue;
        }
      }
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(p.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);
      count++;
    }
    this.activeCount = count;
    if (this.mesh.count !== count) this.mesh.count = count;
    if (count > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
