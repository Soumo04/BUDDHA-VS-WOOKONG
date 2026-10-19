/**
 * TelegraphFX — ground shadow rings and charge glow effects.
 * Every boss attack telegraphs 1-2s in advance; the visual shows
 * exactly where/what will hit. Uses a pool of ring meshes.
 */
import * as THREE from 'three';
import type { TelegraphType } from '@combat/AttackDef';

interface TelegraphInstance {
  group: THREE.Group;
  timer: number;
  maxTime: number;
  type: TelegraphType;
  rings: THREE.Mesh[];
  active: boolean;
}

export class TelegraphFX {
  private scene: THREE.Scene;
  private pool: TelegraphInstance[] = [];
  private readonly POOL_SIZE = 6;

  // Materials — shared across pool
  private ringMats: Map<string, THREE.MeshBasicMaterial> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initPool();
  }

  /**
   * Spawn a telegraph at the target position.
   * @param type    Visual style (see TelegraphType)
   * @param duration Seconds until the attack hits
   * @param targetPos World position of the attack's center
   * @param bossPos  Boss world position (for aiming effects)
   * @param color   THREEjs Color for the telegraph glow
   */
  spawn(
    type: TelegraphType,
    duration: number,
    targetPos: THREE.Vector3,
    bossPos: THREE.Vector3,
    color: THREE.Color,
  ): void {
    const inst = this.pool.find(i => !i.active);
    if (!inst) return;

    inst.active  = true;
    inst.timer   = 0;
    inst.maxTime = duration;
    inst.type    = type;

    // Reset group
    inst.group.position.copy(targetPos);
    inst.group.position.y = 0.05;
    inst.group.rotation.set(0, 0, 0);
    inst.group.scale.set(1, 1, 1);
    inst.group.visible = true;

    // Clear old rings
    for (const r of inst.rings) {
      inst.group.remove(r);
      r.geometry.dispose();
    }
    inst.rings = [];

    // Build telegraph geometry by type
    switch (type) {
      case 'shadow_ring':
        this.buildShadowRing(inst, color, 4);
        break;
      case 'orbit_rings':
        this.buildOrbitRings(inst, color, 12);
        break;
      case 'arm_glow':
        this.buildShadowRing(inst, color, 6);
        break;
      case 'lotus_spin':
        this.buildLotusSpinner(inst, color, 5);
        break;
      case 'rune_circle':
        this.buildRuneCircle(inst, color, 8);
        break;
      case 'foot_glow':
        this.buildShadowRing(inst, color, 3);
        break;
      case 'full_body_glow':
        this.buildRuneCircle(inst, color, 18);
        break;
      default:
        this.buildShadowRing(inst, color, 5);
    }
  }

  update(dt: number): void {
    for (const inst of this.pool) {
      if (!inst.active) continue;

      inst.timer += dt;
      const t = inst.timer / inst.maxTime; // 0→1

      if (t >= 1) {
        inst.active = false;
        inst.group.visible = false;
        continue;
      }

      // Expand + pulse
      const scale  = 0.5 + t * 0.5;
      const pulse  = 1 + Math.sin(inst.timer * 12) * 0.04;
      inst.group.scale.set(scale * pulse, 1, scale * pulse);

      // Opacity ramps up then flashes at end
      const opacity = t < 0.7
        ? THREE.MathUtils.lerp(0.3, 0.9, t / 0.7)
        : THREE.MathUtils.lerp(0.9, 0.0, (t - 0.7) / 0.3);

      for (const ring of inst.rings) {
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, opacity);
      }

      // Rotate orbit rings and rune circles
      if (inst.type === 'orbit_rings' || inst.type === 'rune_circle') {
        inst.group.rotation.y += dt * 2;
      }
      if (inst.type === 'lotus_spin') {
        inst.group.rotation.y += dt * 4;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Builders                                                              */
  /* ------------------------------------------------------------------ */

  private buildShadowRing(inst: TelegraphInstance, color: THREE.Color, radius: number): void {
    // Ground ring shadow (flat)
    const geo = new THREE.RingGeometry(radius * 0.85, radius, 48);
    const mat = this.getOrCreateMat(color, 0.6);
    const ring = new THREE.Mesh(geo, mat.clone());
    ring.rotation.x = -Math.PI / 2;
    inst.group.add(ring);
    inst.rings.push(ring);

    // Outer warning ring
    const outerGeo = new THREE.RingGeometry(radius, radius + 0.25, 48);
    const outerMat = this.getOrCreateMat(color, 0.9);
    const outer = new THREE.Mesh(outerGeo, outerMat.clone());
    outer.rotation.x = -Math.PI / 2;
    inst.group.add(outer);
    inst.rings.push(outer);
  }

  private buildOrbitRings(inst: TelegraphInstance, color: THREE.Color, radius: number): void {
    // Multiple concentric rings for sutra volley
    for (let i = 0; i < 3; i++) {
      const r = radius * (0.4 + i * 0.3);
      const geo = new THREE.RingGeometry(r, r + 0.15, 48);
      const mat = this.getOrCreateMat(color, 0.7 - i * 0.15);
      const ring = new THREE.Mesh(geo, mat.clone());
      ring.rotation.x = -Math.PI / 2;
      inst.group.add(ring);
      inst.rings.push(ring);
    }

    // Cross arrows
    for (let i = 0; i < 4; i++) {
      const arrowGeo = new THREE.PlaneGeometry(0.2, radius);
      const arrowMat = this.getOrCreateMat(color, 0.4);
      const arrow = new THREE.Mesh(arrowGeo, arrowMat.clone());
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = (i / 4) * Math.PI;
      arrow.position.y = 0.01;
      inst.group.add(arrow);
      inst.rings.push(arrow);
    }
  }

  private buildLotusSpinner(inst: TelegraphInstance, color: THREE.Color, radius: number): void {
    const petalCount = 8;
    for (let i = 0; i < petalCount; i++) {
      const angle  = (i / petalCount) * Math.PI * 2;
      const geo    = new THREE.PlaneGeometry(1.5, radius * 0.7);
      const mat    = this.getOrCreateMat(color, 0.55);
      const petal  = new THREE.Mesh(geo, mat.clone());
      petal.rotation.x = -Math.PI / 2;
      petal.rotation.z = angle;
      petal.position.set(Math.cos(angle) * radius * 0.35, 0, Math.sin(angle) * radius * 0.35);
      inst.group.add(petal);
      inst.rings.push(petal);
    }
    this.buildShadowRing(inst, color, radius * 0.3);
  }

  private buildRuneCircle(inst: TelegraphInstance, color: THREE.Color, radius: number): void {
    this.buildShadowRing(inst, color, radius);

    // Tick marks around ring
    const ticks = 16;
    for (let i = 0; i < ticks; i++) {
      const angle = (i / ticks) * Math.PI * 2;
      const geo   = new THREE.PlaneGeometry(0.15, 0.6 + (i % 4 === 0 ? 0.4 : 0));
      const mat   = this.getOrCreateMat(color, 0.8);
      const tick  = new THREE.Mesh(geo, mat.clone());
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = angle;
      tick.position.set(
        Math.cos(angle) * radius,
        0.01,
        Math.sin(angle) * radius,
      );
      inst.group.add(tick);
      inst.rings.push(tick);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                               */
  /* ------------------------------------------------------------------ */

  private initPool(): void {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;
      this.scene.add(group);
      this.pool.push({ group, timer: 0, maxTime: 1, type: 'shadow_ring', rings: [], active: false });
    }
  }

  private getOrCreateMat(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
    const key = `${color.getHexString()}_${opacity}`;
    if (!this.ringMats.has(key)) {
      this.ringMats.set(key, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
    }
    return this.ringMats.get(key)!;
  }
}
