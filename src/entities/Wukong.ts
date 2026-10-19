import * as THREE from 'three';
import { Entity } from './Entity';
import type { InputManager } from '@core/InputManager';
import type { EventBus } from '@core/EventBus';
import { ComboSystem } from '@combat/ComboSystem';
import type { HitFX } from '@vfx/HitFX';

/** Matches new wukong.json structure */
export interface WukongConfig {
  player: {
    maxHp: number; maxStamina: number; maxFocus: number;
    moveSpeed: number; sprintSpeed: number;
    dodgeDistance: number; iFrameDuration: number;
    dodgeCooldown: number;
    staminaRegen: number; focusRegen: number;
  };
  combo: Array<{ id: string; name: string; damage: number; focusGain: number; range: number; hitstopMs: number; comboWindow: number }>;
  heavyAttack: { id: string; damage: number; focusGain: number; range: number; staminaCost: number; cooldown: number; hitstopMs: number; staggers: boolean };
  cloneSkill: { id: string; focusCost: number; cooldown: number; cloneCount: number; cloneDuration: number; cloneDamage: number; distractionTime: number };
}

type WukongState = 'IDLE' | 'RUN' | 'ATTACK' | 'HEAVY' | 'DODGE' | 'HIT' | 'DEAD';

export class Wukong extends Entity {
  private cfg: WukongConfig;
  private input: InputManager;
  private cameraYaw: () => number;
  private combo: ComboSystem;
  private hitFX: HitFX | null = null;

  // Stats
  stamina: number;
  focus:   number;

  // State
  private state: WukongState = 'IDLE';
  private stateTimer = 0;
  isIframe = false;

  // Cooldowns
  private dodgeCooldownTimer = 0;
  private heavyCooldownTimer = 0;
  private cloneCooldownTimer = 0;

  // Dodge direction
  private dodgeDir = new THREE.Vector3(0, 0, -1);

  // Mesh references
  private bodyMesh!: THREE.Mesh;
  private staffMesh!: THREE.Mesh;
  private headMesh!: THREE.Mesh;

  // Materials
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly staffMat: THREE.MeshStandardMaterial;

  // Hit flash
  private hitFlashTimer = 0;

  // Arena boundary
  private readonly ARENA_RADIUS = 28;

  // Staff tip world position (for HitFX trail)
  readonly staffTip = new THREE.Vector3();

  /** Attacks emitted this frame — read by HitDetector, then cleared. */
  pendingAttacks: Array<{ damage: number; range: number; type: string; staggers?: boolean }> = [];

  constructor(
    cfg: WukongConfig,
    input: InputManager,
    scene: THREE.Scene,
    cameraYaw: () => number,
    hitFX?: HitFX,
  ) {
    super(cfg.player.maxHp);
    this.cfg      = cfg;
    this.input    = input;
    this.cameraYaw = cameraYaw;
    this.stamina  = cfg.player.maxStamina;
    this.focus    = 0;
    this.hitFX    = hitFX ?? null;

    this.combo = new ComboSystem(cfg.combo.map(h => ({
      id: h.id,
      damage:      h.damage,
      focusGain:   h.focusGain,
      hitstopMs:   h.hitstopMs,
      comboWindow: h.comboWindow,
      range:       h.range,
    })));

    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8533, roughness: 0.6 });
    this.staffMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017, roughness: 0.3, metalness: 0.6,
      emissive: new THREE.Color(0xd4a017), emissiveIntensity: 0.15,
    });

    this.buildMesh();
    scene.add(this.scene);
    this.scene.position.set(0, 0, 10);
  }

  /* ------------------------------------------------------------------ */
  /* Greybox mesh                                                         */
  /* ------------------------------------------------------------------ */

  private buildMesh(): void {
    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.35, 0.3, 1.0, 8);
    this.bodyMesh  = new THREE.Mesh(torsoGeo, this.bodyMat);
    this.bodyMesh.position.y = 0.9;
    this.bodyMesh.castShadow = true;
    this.scene.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    this.headMesh  = new THREE.Mesh(headGeo, this.bodyMat);
    this.headMesh.position.y = 1.65;
    this.headMesh.castShadow = true;
    this.scene.add(this.headMesh);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0xcc5500, roughness: 0.7 });
    for (const side of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.6, 6), legMat);
      leg.position.set(side, 0.3, 0);
      this.scene.add(leg);
    }

    // Staff
    const staffGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6);
    this.staffMesh  = new THREE.Mesh(staffGeo, this.staffMat);
    this.staffMesh.position.set(0.5, 1.0, 0);
    this.staffMesh.rotation.z = Math.PI / 2.5;
    this.staffMesh.castShadow = true;
    this.scene.add(this.staffMesh);

    // Staff tip orbs
    const tipGeo = new THREE.SphereGeometry(0.09, 6, 4);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xffd60a, emissive: new THREE.Color(0xffd60a), emissiveIntensity: 0.8, roughness: 0.1,
    });
    for (const yOff of [-1.2, 1.2]) {
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.y = yOff;
      this.staffMesh.add(tip);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                               */
  /* ------------------------------------------------------------------ */

  update(dt: number, bus: EventBus): void {
    if (this._isDead) return;
    this.pendingAttacks = [];

    this.combo.update(dt);
    this.stateTimer += dt;
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    // Hit flash
    const flash = this.hitFlashTimer > 0;
    this.bodyMat.emissive.set(flash ? 0xff2222 : 0x000000);
    this.bodyMat.emissiveIntensity = flash ? 0.8 : 0;

    // Cooldown timers
    if (this.dodgeCooldownTimer > 0) this.dodgeCooldownTimer -= dt;
    if (this.heavyCooldownTimer  > 0) this.heavyCooldownTimer  -= dt;
    if (this.cloneCooldownTimer  > 0) this.cloneCooldownTimer  -= dt;

    // Stamina regen (always; slower when acting)
    const actingMult = (this.state === 'DODGE' || this.state === 'HEAVY') ? 0.3 : 1;
    this.stamina = Math.min(
      this.cfg.player.maxStamina,
      this.stamina + this.cfg.player.staminaRegen * dt * actingMult,
    );

    // Focus slow regen
    this.focus = Math.min(
      this.cfg.player.maxFocus,
      this.focus + this.cfg.player.focusRegen * dt,
    );

    switch (this.state) {
      case 'IDLE':
      case 'RUN':
        this.handleMovement(dt);
        this.handleAttackInput(bus);
        break;
      case 'ATTACK':
        this.updateAttackState(dt, bus);
        break;
      case 'HEAVY':
        this.updateHeavyState(dt);
        break;
      case 'DODGE':
        this.updateDodge(dt);
        break;
      case 'HIT':
        if (this.stateTimer > 0.25) this.setState('IDLE');
        break;
    }

    // Arena clamp
    const pos = this.scene.position;
    const flatDist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (flatDist > this.ARENA_RADIUS) {
      pos.x = (pos.x / flatDist) * this.ARENA_RADIUS;
      pos.z = (pos.z / flatDist) * this.ARENA_RADIUS;
    }
    pos.y = 0;

    // Staff tip world position (for HitFX trail)
    this.staffMesh.getWorldPosition(this.staffTip);
    this.staffTip.y += 1.2;

    // Trail
    this.hitFX?.updateStaffTrail(this.staffTip, this.state === 'ATTACK' || this.state === 'HEAVY');
  }

  /* ------------------------------------------------------------------ */
  /* Movement                                                             */
  /* ------------------------------------------------------------------ */

  private handleMovement(dt: number): void {
    const mv    = this.input.moveVector;
    const speed = this.cfg.player.moveSpeed;

    if (Math.abs(mv.x) + Math.abs(mv.y) > 0.05) {
      const yaw  = this.cameraYaw();
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const wx   = mv.x * cosY + mv.y * sinY;
      const wz   = mv.x * -sinY + mv.y * cosY;

      this.scene.position.x += wx * speed * dt;
      this.scene.position.z -= wz * speed * dt;

      // Face direction
      const targetAngle = Math.atan2(wx, -wz);
      let diff = targetAngle - this.scene.rotation.y;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.scene.rotation.y += diff * Math.min(1, 12 * dt);

      this.setState('RUN');
      this.animateRunning(dt);
    } else {
      this.setState('IDLE');
      this.animateIdle(dt);
    }

    // Dodge input
    if (
      this.input.isJustPressed('DODGE') &&
      this.dodgeCooldownTimer <= 0 &&
      this.stamina >= 20
    ) {
      this.startDodge();
    }
  }

  private handleAttackInput(bus: EventBus): void {
    if (this.input.isJustPressed('ATTACK')) this.startComboHit(bus);

    const heavy = this.cfg.heavyAttack;
    if (
      this.input.isJustPressed('HEAVY') &&
      this.heavyCooldownTimer <= 0 &&
      this.stamina >= heavy.staminaCost
    ) {
      this.startHeavy(bus);
    }

    const clone = this.cfg.cloneSkill;
    if (
      this.input.isJustPressed('CLONE') &&
      this.cloneCooldownTimer <= 0 &&
      this.focus >= clone.focusCost
    ) {
      this.useClone(bus);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Combat                                                               */
  /* ------------------------------------------------------------------ */

  private startComboHit(bus: EventBus): void {
    const result = this.combo.tryHit();
    if (!result) return;

    this.setState('ATTACK');
    const { hitDef } = result;

    this.pendingAttacks.push({ damage: hitDef.damage, range: hitDef.range, type: hitDef.id });
    this.focus = Math.min(this.cfg.player.maxFocus, this.focus + hitDef.focusGain);
    bus.emit('combo:count', { count: result.hitIndex + 1 });
    if (result.isFinisher) bus.emit('combo:reset');

    this.animateSwing(result.hitIndex);
  }

  private updateAttackState(dt: number, bus: EventBus): void {
    if (!this.combo.isAttacking) {
      // Attack state over — check for next input
      if (this.input.isJustPressed('ATTACK')) {
        this.startComboHit(bus);
      } else {
        this.setState('IDLE');
      }
    }
  }

  private startHeavy(bus: EventBus): void {
    const h = this.cfg.heavyAttack;
    this.stamina -= h.staminaCost;
    this.heavyCooldownTimer = h.cooldown;
    this.setState('HEAVY');

    this.pendingAttacks.push({
      damage:   h.damage,
      range:    h.range,
      type:     'heavy',
      staggers: h.staggers,
    });
    this.focus = Math.min(this.cfg.player.maxFocus, this.focus + h.focusGain);
    bus.emit('combo:count', { count: 99 }); // show "HEAVY" indicator

    // Grow staff visually
    this.growStaff(2.5, 0.25);
  }

  private updateHeavyState(dt: number): void {
    if (this.stateTimer > 0.8) {
      this.growStaff(1, 0.3);
      this.setState('IDLE');
    }
  }

  private startDodge(): void {
    this.stamina -= 20;
    this.dodgeCooldownTimer = this.cfg.player.dodgeCooldown;
    this.isIframe = true;
    this.combo.reset(); // cancel combo on dodge

    const mv = this.input.moveVector;
    const yaw = this.cameraYaw();
    if (Math.abs(mv.x) + Math.abs(mv.y) > 0.05) {
      const sinY = Math.sin(yaw); const cosY = Math.cos(yaw);
      const wx = mv.x * cosY + mv.y * sinY;
      const wz = mv.x * -sinY + mv.y * cosY;
      this.dodgeDir.set(wx, 0, -wz).normalize();
    } else {
      this.dodgeDir.set(0, 0, 1); // backstep
    }
    this.setState('DODGE');
  }

  private updateDodge(dt: number): void {
    const iDur  = this.cfg.player.iFrameDuration;
    const speed = this.cfg.player.dodgeDistance / iDur;
    this.scene.position.addScaledVector(this.dodgeDir, speed * dt);

    // Scale pulse
    const t = this.stateTimer / iDur;
    this.scene.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.15);

    if (this.stateTimer > iDur) {
      this.isIframe = false;
      this.scene.scale.setScalar(1);
      this.setState('IDLE');
    }
  }

  private useClone(bus: EventBus): void {
    const c = this.cfg.cloneSkill;
    this.focus -= c.focusCost;
    this.cloneCooldownTimer = c.cooldown;
    bus.emit('player:clone', {
      position:    { x: this.scene.position.x, y: 0, z: this.scene.position.z },
      count:       c.cloneCount,
      duration:    c.cloneDuration,
      damage:      c.cloneDamage,
      distraction: c.distractionTime,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Animations                                                           */
  /* ------------------------------------------------------------------ */

  private runPhase = 0;

  private animateRunning(dt: number): void {
    this.runPhase += dt * 8;
    const bob = Math.sin(this.runPhase) * 0.07;
    this.bodyMesh.position.y = 0.9 + bob;
    this.headMesh.position.y = 1.65 + bob;
  }

  private animateIdle(dt: number): void {
    this.runPhase += dt * 1.5;
    const bob = Math.sin(this.runPhase) * 0.025;
    this.bodyMesh.position.y = 0.9 + bob;
    this.headMesh.position.y = 1.65 + bob;
    this.staffMesh.rotation.z = Math.PI / 2.5 + Math.sin(this.runPhase * 0.8) * 0.04;
  }

  private animateSwing(hitIdx: number): void {
    const dir = hitIdx % 2 === 0 ? 1 : -1;
    // Immediate rotation snap + reset
    this.staffMesh.rotation.y = dir * 1.0;
    this.bodyMesh.rotation.y  = dir * 0.2;
    setTimeout(() => {
      this.staffMesh.rotation.y = 0;
      this.bodyMesh.rotation.y  = 0;
    }, 250);
  }

  private growStaff(targetScale: number, duration: number): void {
    const start    = this.staffMesh.scale.y;
    const startMs  = performance.now();
    const animate  = () => {
      const t    = Math.min(1, (performance.now() - startMs) / (duration * 1000));
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.staffMesh.scale.set(1, start + (targetScale - start) * ease, 1);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /* ------------------------------------------------------------------ */
  /* Entity overrides                                                     */
  /* ------------------------------------------------------------------ */

  override takeDamage(amount: number, _source?: Entity): void {
    if (this.isIframe) return;
    super.takeDamage(amount, _source);
    this.hitFlashTimer = 0.25;
    this.combo.reset();
    this.setState('HIT');
  }

  protected override onDeath(): void {
    super.onDeath();
    this.setState('DEAD');
  }

  /* ------------------------------------------------------------------ */
  /* Getters                                                              */
  /* ------------------------------------------------------------------ */

  private setState(s: WukongState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTimer = 0;
  }

  get staminaFraction(): number { return this.stamina / this.cfg.player.maxStamina; }
  get focusFraction():   number { return this.focus   / this.cfg.player.maxFocus; }
  get cloneCooldownFraction(): number { return Math.max(0, this.cloneCooldownTimer / this.cfg.cloneSkill.cooldown); }
  get heavyCooldownFraction(): number { return Math.max(0, this.heavyCooldownTimer / this.cfg.heavyAttack.cooldown); }
  get dodgeCooldownFraction(): number { return Math.max(0, this.dodgeCooldownTimer / this.cfg.player.dodgeCooldown); }
  get currentState(): WukongState { return this.state; }
}
