import * as THREE from 'three';
import { Entity } from './Entity';
import type { EventBus } from '@core/EventBus';
import { BossAI } from '@ai/BossAI';
import { AttackPatterns } from '@ai/AttackPatterns';
import type { TelegraphFX } from '@vfx/TelegraphFX';
import type { HitFX } from '@vfx/HitFX';
import type { ObjectPool } from '@core/ObjectPool';

export class Buddha extends Entity {
  // Phase thresholds (0–1 fractions of maxHp)
  private readonly p2Thresh: number;
  private readonly p3Thresh: number;
  private phase: 1 | 2 | 3 = 1;
  isInvulnerable = false;

  // AI
  ai!: BossAI;
  patterns!: AttackPatterns;
  private aiReady = false;

  // Mesh parts
  private bodyGroup!: THREE.Group;
  private bodyMesh!: THREE.Mesh;
  private headMesh!: THREE.Mesh;
  private crownGroup!: THREE.Group;
  private robesMesh!: THREE.Mesh;
  private glowMesh!: THREE.Mesh;
  private handL!: THREE.Mesh;
  private handR!: THREE.Mesh;
  private lotus!: THREE.Mesh;

  // Materials
  private readonly glowMat: THREE.MeshStandardMaterial;
  private readonly bodyGoldMat: THREE.MeshStandardMaterial;
  private readonly robeMat: THREE.MeshStandardMaterial;

  // Phase glow animation
  private floatPhase = 0;
  private glowTimer  = 0;
  private transitionTimer = 0;
  private isTransitioning = false;

  // Barrier visual
  private barrierMesh!: THREE.Mesh;
  private barrierTimer = 0;

  // Scene ref for projectile pool
  private _scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    maxHp: number,
    p2Thresh: number,
    p3Thresh: number,
  ) {
    super(maxHp);
    this._scene   = scene;
    this.p2Thresh = p2Thresh;
    this.p3Thresh = p3Thresh;

    this.glowMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: new THREE.Color(0xffa000), emissiveIntensity: 0.6,
      transparent: true, opacity: 0.18, depthWrite: false,
    });
    this.bodyGoldMat = new THREE.MeshStandardMaterial({
      color: 0xe8c060, roughness: 0.3, metalness: 0.5,
      emissive: new THREE.Color(0xd4a000), emissiveIntensity: 0.15,
    });
    this.robeMat = new THREE.MeshStandardMaterial({
      color: 0x8B0000, roughness: 0.7, metalness: 0.1,
    });

    this.buildMesh(scene);
  }

  /** Wire in AI systems after creation (deps injected from main). */
  initAI(
    telegraphFX: TelegraphFX,
    hitFX: HitFX,
    bus: EventBus,
    projectilePool: ObjectPool<THREE.Mesh>,
    getPlayerPos: () => THREE.Vector3,
  ): void {
    this.patterns = new AttackPatterns();
    this.patterns.load().then(() => {
      this.ai = new BossAI({
        scene:         this._scene,
        bossGroup:     this.scene,
        patterns:      this.patterns,
        telegraphFX,
        hitFX,
        bus,
        projectilePool,
        getPlayerPos,
      });
      this.ai.handL     = this.handL;
      this.ai.handR     = this.handR;
      this.ai.bodyGroup = this.bodyGroup;
      this.aiReady      = true;
    }).catch(console.error);
  }

  /* ------------------------------------------------------------------ */
  /* Greybox mesh                                                         */
  /* ------------------------------------------------------------------ */

  private buildMesh(scene: THREE.Scene): void {
    this.bodyGroup = new THREE.Group();

    // Robes (large cone = sitting/hovering silhouette)
    const robeGeo = new THREE.CylinderGeometry(1.8, 2.4, 3.0, 10);
    this.robesMesh = new THREE.Mesh(robeGeo, this.robeMat);
    this.robesMesh.position.y = 1.5;
    this.robesMesh.castShadow = true;
    this.bodyGroup.add(this.robesMesh);

    // Body/torso
    const torsoGeo = new THREE.CylinderGeometry(1.0, 1.4, 2.0, 10);
    this.bodyMesh  = new THREE.Mesh(torsoGeo, this.bodyGoldMat);
    this.bodyMesh.position.y = 3.5;
    this.bodyMesh.castShadow = true;
    this.bodyGroup.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.9, 12, 8);
    this.headMesh  = new THREE.Mesh(headGeo, this.bodyGoldMat);
    this.headMesh.position.y = 5.2;
    this.headMesh.castShadow = true;
    this.bodyGroup.add(this.headMesh);

    // Five-leaf crown
    this.crownGroup = new THREE.Group();
    this.crownGroup.position.y = 5.9;
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: new THREE.Color(0xffd700), emissiveIntensity: 0.5, roughness: 0.15 });
    for (let i = 0; i < 5; i++) {
      const angle  = (i / 5) * Math.PI * 2;
      const petGeo = new THREE.ConeGeometry(0.18, 0.5, 5);
      const petal  = new THREE.Mesh(petGeo, crownMat);
      petal.position.set(Math.cos(angle) * 0.5, 0.1, Math.sin(angle) * 0.5);
      petal.rotation.z = Math.atan2(-Math.sin(angle), 0) - Math.PI / 10;
      petal.rotation.y = -angle;
      this.crownGroup.add(petal);
    }
    this.bodyGroup.add(this.crownGroup);

    // Arms (L and R)
    const armGeo = new THREE.CylinderGeometry(0.35, 0.3, 2.0, 8);
    this.handL = new THREE.Mesh(armGeo, this.bodyGoldMat);
    this.handL.position.set(-2.2, 4.0, 0);
    this.handL.rotation.z = Math.PI / 4;
    this.handL.castShadow = true;
    this.bodyGroup.add(this.handL);

    this.handR = new THREE.Mesh(armGeo.clone(), this.bodyGoldMat);
    this.handR.position.set(2.2, 4.0, 0);
    this.handR.rotation.z = -Math.PI / 4;
    this.handR.castShadow = true;
    this.bodyGroup.add(this.handR);

    // Hand orbs (glowing palms)
    const palmGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const palmMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: new THREE.Color(0xffd700), emissiveIntensity: 1.2, roughness: 0.1,
    });
    const palmL = new THREE.Mesh(palmGeo, palmMat);
    palmL.position.set(0, -1.2, 0);
    this.handL.add(palmL);
    const palmR = new THREE.Mesh(palmGeo.clone(), palmMat);
    palmR.position.set(0, -1.2, 0);
    this.handR.add(palmR);

    // Lotus throne (flat disk)
    const lotusGeo = new THREE.CylinderGeometry(2.0, 1.6, 0.25, 20);
    const lotusMat = new THREE.MeshStandardMaterial({
      color: 0xff6090, emissive: new THREE.Color(0xff4080), emissiveIntensity: 0.4, roughness: 0.5,
    });
    this.lotus = new THREE.Mesh(lotusGeo, lotusMat);
    this.lotus.position.y = 0.12;
    this.lotus.castShadow = true;
    this.bodyGroup.add(this.lotus);

    // Glow aura sphere (behind boss)
    const glowGeo = new THREE.SphereGeometry(3.0, 16, 10);
    this.glowMesh  = new THREE.Mesh(glowGeo, this.glowMat.clone());
    this.glowMesh.position.y = 3;
    this.bodyGroup.add(this.glowMesh);

    // Barrier mesh (hidden by default)
    const barrierGeo = new THREE.SphereGeometry(3.5, 20, 14);
    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0xffd700, transparent: true, opacity: 0, depthWrite: false, side: THREE.FrontSide,
    });
    this.barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
    this.barrierMesh.position.y = 3;
    this.bodyGroup.add(this.barrierMesh);

    // Position group
    this.bodyGroup.position.set(0, 0.5, -12);
    this.scene.add(this.bodyGroup);
    scene.add(this.scene);
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                               */
  /* ------------------------------------------------------------------ */

  update(dt: number, bus: EventBus): void {
    if (this._isDead) return;

    // Floating animation
    this.floatPhase += dt * 0.8;
    this.bodyGroup.position.y = 0.5 + Math.sin(this.floatPhase) * 0.35;
    this.crownGroup.rotation.y += dt * 0.4;
    this.lotus.rotation.y -= dt * 0.6;

    // Glow pulse
    this.glowTimer += dt;
    const basePulse = 0.15 + Math.sin(this.glowTimer * 1.8) * 0.05;
    (this.glowMesh.material as THREE.MeshStandardMaterial).opacity = basePulse;

    // Barrier fade
    if (this.barrierTimer > 0) {
      this.barrierTimer -= dt;
      const fade = Math.min(1, this.barrierTimer / 0.5);
      (this.barrierMesh.material as THREE.MeshBasicMaterial).opacity = 0.25 * fade;
      this.isInvulnerable = this.barrierTimer > 0;
    }

    // Phase transition animation
    if (this.isTransitioning) {
      this.transitionTimer += dt;
      const t = Math.min(1, this.transitionTimer / 2.0);
      this.scene.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.15);
      if (t >= 1) {
        this.isTransitioning = false;
        this.scene.scale.setScalar(1);
      }
    }

    // Phase check
    this.checkPhase(bus);

    // Boss AI
    if (this.aiReady) this.ai.update(dt, this._isDead);
  }

  /* ------------------------------------------------------------------ */
  /* Damage & phases                                                      */
  /* ------------------------------------------------------------------ */

  override takeDamage(amount: number, source?: Entity): void {
    if (this.isInvulnerable) return;

    const scaledDmg = Math.round(amount * (this.patterns?.getDefenceMultiplier() ?? 0.8));
    super.takeDamage(scaledDmg, source);

    // Phase emissive flash
    (this.glowMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5;
    setTimeout(() => {
      (this.glowMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
    }, 150);
  }

  private checkPhase(bus: EventBus): void {
    const frac = this.hpFraction;
    const newPhase: 1 | 2 | 3 =
      frac <= this.p3Thresh ? 3 :
      frac <= this.p2Thresh ? 2 : 1;

    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.isInvulnerable = true;
      this.isTransitioning = true;
      this.transitionTimer = 0;

      // 2s invulnerability window for transition
      setTimeout(() => {
        this.isInvulnerable = false;
        if (this.aiReady) this.ai.setPhase(newPhase);
      }, 2000);

      // Phase colours
      if (newPhase === 2) {
        this.bodyGoldMat.emissive.set(0xff8000);
        this.bodyGoldMat.emissiveIntensity = 0.35;
      } else if (newPhase === 3) {
        this.bodyGoldMat.emissive.set(0xffffff);
        this.bodyGoldMat.emissiveIntensity = 0.6;
        this.robeMat.emissive.set(0x440000);
        this.robeMat.emissiveIntensity = 0.5;
      }

      bus.emit('boss:phase_change', { phase: newPhase });
    }
  }

  /** Called by HitDetector when Wukong's heavy lands — staggers boss. */
  stagger(): void {
    if (this.aiReady) this.ai.stagger();
  }

  /** Show barrier (P2_BARRIER attack). */
  showBarrier(duration: number): void {
    this.barrierTimer  = duration;
    this.isInvulnerable = true;
  }

  protected override onDeath(): void {
    super.onDeath();
    // Death animation: scale up then collapse
    let t = 0;
    const animate = () => {
      t += 0.016;
      const scale = t < 0.5 ? 1 + t * 0.6 : Math.max(0, 1.3 - (t - 0.5) * 3);
      this.scene.scale.setScalar(scale);
      (this.glowMesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.6 - t * 0.5);
      if (scale > 0) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /* ------------------------------------------------------------------ */
  /* Getters                                                              */
  /* ------------------------------------------------------------------ */

  get currentPhase(): 1 | 2 | 3 { return this.phase; }
}
