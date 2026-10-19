import * as THREE from 'three';
import { Entity } from './Entity';
import type { EventBus } from '@core/EventBus';

/**
 * Buddha — boss entity greybox.
 * Full AI state machine in M2; this M1 version is a static placeholder
 * that can receive damage and emits phase-change events.
 */
export class Buddha extends Entity {
  private phase: 1 | 2 | 3 = 1;

  // Config thresholds
  private phase2Threshold = 0.66;
  private phase3Threshold = 0.33;

  // Mesh refs
  private bodyMesh!: THREE.Mesh;
  private headMesh!: THREE.Mesh;
  private handL!: THREE.Mesh;
  private handR!: THREE.Mesh;
  private glowMat!: THREE.MeshStandardMaterial;

  // Floating animation
  private floatPhase = 0;
  private readonly baseY = 3.5;

  // Invulnerable during transitions
  private isInvulnerable = false;
  private transitionTimer = 0;
  private readonly TRANSITION_DUR = 2.0;

  constructor(scene: THREE.Scene, maxHp: number, phase2: number, phase3: number) {
    super(maxHp);
    this.phase2Threshold = phase2;
    this.phase3Threshold = phase3;

    this.buildMesh();
    scene.add(this.scene);
    this.scene.position.set(0, this.baseY, -16);
  }

  /* ------------------------------------------------------------------ */
  /* Greybox mesh                                                         */
  /* ------------------------------------------------------------------ */

  private buildMesh(): void {
    this.glowMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      emissive: new THREE.Color(0xd4a017),
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.3,
    });

    const robesMat = new THREE.MeshStandardMaterial({ color: 0xcc4400, roughness: 0.8 });
    const skinMat  = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.5 });

    // Body — large seated figure
    const bodyGeo = new THREE.CylinderGeometry(1.2, 1.8, 3.0, 10);
    this.bodyMesh = new THREE.Mesh(bodyGeo, robesMat);
    this.bodyMesh.position.y = 0;
    this.bodyMesh.castShadow = true;
    this.scene.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.85, 12, 8);
    this.headMesh = new THREE.Mesh(headGeo, skinMat);
    this.headMesh.position.y = 2.5;
    this.headMesh.castShadow = true;
    this.scene.add(this.headMesh);

    // Crown (5 leaf tips)
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xffd60a,
      emissive: new THREE.Color(0xffd60a),
      emissiveIntensity: 0.5,
      roughness: 0.2,
    });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const leafGeo = new THREE.SphereGeometry(0.15, 5, 4);
      const leaf = new THREE.Mesh(leafGeo, crownMat);
      leaf.position.set(
        Math.cos(angle) * 0.6,
        3.5,
        Math.sin(angle) * 0.6,
      );
      leaf.scale.y = 1.8;
      this.scene.add(leaf);
    }

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.35, 0.3, 2.0, 7);
    this.handL = new THREE.Mesh(armGeo, robesMat);
    this.handL.position.set(-2.0, 0.2, 0);
    this.handL.rotation.z =  0.5;
    this.handL.castShadow = true;
    this.scene.add(this.handL);

    this.handR = new THREE.Mesh(armGeo, robesMat);
    this.handR.position.set( 2.0, 0.2, 0);
    this.handR.rotation.z = -0.5;
    this.handR.castShadow = true;
    this.scene.add(this.handR);

    // Palms (gold)
    const palmGeo = new THREE.SphereGeometry(0.45, 8, 6);
    const palmL = new THREE.Mesh(palmGeo, this.glowMat);
    palmL.position.set(-3.0, -0.5, 0);
    const palmR = new THREE.Mesh(palmGeo, this.glowMat);
    palmR.position.set( 3.0, -0.5, 0);
    this.scene.add(palmL, palmR);

    // Lotus throne (rings under boss)
    const lotusMat = new THREE.MeshStandardMaterial({ color: 0xffb3c6, roughness: 0.5, transparent: true, opacity: 0.85 });
    for (let r = 0; r < 3; r++) {
      const torusGeo = new THREE.TorusGeometry(2.2 + r * 0.6, 0.18, 6, 32);
      const torus = new THREE.Mesh(torusGeo, lotusMat);
      torus.rotation.x = Math.PI / 2;
      torus.position.y = -1.8 - r * 0.3;
      this.scene.add(torus);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                               */
  /* ------------------------------------------------------------------ */

  update(dt: number, bus: EventBus): void {
    if (this._isDead) return;

    // Phase check
    this.checkPhaseTransition(bus);

    // Transition invulnerability
    if (this.isInvulnerable) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) this.isInvulnerable = false;
      // Flash gold
      this.glowMat.emissiveIntensity = 0.5 + Math.sin(Date.now() * 0.01) * 0.5;
    }

    // Floating animation
    this.floatPhase += dt * 0.8;
    this.scene.position.y = this.baseY + Math.sin(this.floatPhase) * 0.3;

    // Gentle idle rotation
    this.scene.rotation.y = Math.sin(this.floatPhase * 0.4) * 0.08;

    // Phase-based glow colour
    switch (this.phase) {
      case 1: this.glowMat.emissive.set(0xd4a017); break;
      case 2: this.glowMat.emissive.set(0xffffff); break;
      case 3: this.glowMat.emissive.set(0xffd60a); break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phase transitions                                                    */
  /* ------------------------------------------------------------------ */

  private checkPhaseTransition(bus: EventBus): void {
    const frac = this.hpFraction;
    if (this.phase === 1 && frac <= this.phase2Threshold) {
      this.triggerPhaseTransition(2, bus);
    } else if (this.phase === 2 && frac <= this.phase3Threshold) {
      this.triggerPhaseTransition(3, bus);
    }
  }

  private triggerPhaseTransition(newPhase: 2 | 3, bus: EventBus): void {
    this.phase = newPhase;
    this.isInvulnerable = true;
    this.transitionTimer = this.TRANSITION_DUR;
    bus.emit('boss:phase_change', { phase: newPhase });
    console.log(`[Buddha] Phase ${newPhase} begins!`);
  }

  override takeDamage(amount: number, source?: Entity): void {
    if (this.isInvulnerable) return;
    super.takeDamage(amount, source);
  }

  protected override onDeath(): void {
    super.onDeath();
    console.log('[Buddha] Defeated!');
  }

  /* ------------------------------------------------------------------ */
  /* Getters                                                              */
  /* ------------------------------------------------------------------ */

  get currentPhase(): 1 | 2 | 3 { return this.phase; }

  /** World-space position + height for camera lock-on. */
  get cameraTarget() {
    return { position: this.scene.position, height: 2.5 };
  }
}
